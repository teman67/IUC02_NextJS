"""
AgentSem pipeline service.

Ported from Streamlit_app/{agents.py, controller.py, utils.py, helpers.py}.
All streamlit / pyvis dependencies removed; uses standard logging instead.
"""

import glob
import logging
import os
import re
import urllib.parse
from difflib import SequenceMatcher
from pathlib import Path
from typing import Callable, Dict, List, Set, Tuple

import requests
from rdflib import Graph, Literal, URIRef, BNode
from pyshacl import validate as _shacl_validate

logger = logging.getLogger("iuc02.agent_sem")

# ---------------------------------------------------------------------------
# RDF → Graph data for visualisation
# ---------------------------------------------------------------------------

_SCHEMA_NAMESPACES = (
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "http://www.w3.org/2000/01/rdf-schema#",
    "http://www.w3.org/2002/07/owl#",
    "http://www.w3.org/ns/shacl#",
    "http://www.w3.org/2001/XMLSchema#",
)


def _rdf_local_name(uri: str) -> str:
    return uri.split("#")[-1] if "#" in uri else uri.split("/")[-1] or uri


def _node_color(term) -> str:
    if isinstance(term, Literal):
        return "#f59e0b"      # amber — literals
    if isinstance(term, BNode):
        return "#8b5cf6"      # purple — blank nodes
    uri = str(term)
    if "example.org" in uri:
        return "#0ea5e9"      # sky-blue — local data nodes
    if any(x in uri for x in ("matwerk", "nfdi", "pmd", "obo/", "obi")):
        return "#10b981"      # emerald — domain ontologies
    if any(x in uri for x in ("qudt", "unit/")):
        return "#f97316"      # orange — units / quant
    if any(x in uri for x in ("prov", "time", "schema")):
        return "#06b6d4"      # cyan — provenance / time
    if any(uri.startswith(ns) for ns in _SCHEMA_NAMESPACES):
        return "#475569"      # slate — schema terms
    return "#38bdf8"          # light-blue — everything else


def _node_group(term) -> str:
    if isinstance(term, Literal):
        return "literal"
    if isinstance(term, BNode):
        return "blank"
    uri = str(term)
    if "example.org" in uri:
        return "data"
    if any(x in uri for x in ("matwerk", "nfdi", "pmd", "obo/", "obi")):
        return "ontology"
    if any(uri.startswith(ns) for ns in _SCHEMA_NAMESPACES):
        return "schema"
    return "external"


def rdf_to_graph_data(rdf_code: str, max_nodes: int = 150) -> Dict:
    """Parse RDF Turtle and return {nodes, links} for force-directed visualisation."""
    try:
        g = Graph().parse(data=rdf_code, format="turtle")
    except Exception as exc:
        return {"nodes": [], "links": [], "error": str(exc)}

    node_map: Dict[str, Dict] = {}
    links: List[Dict] = []
    degree: Dict[str, int] = {}

    def add_node(term) -> str:
        nid = str(term)
        if nid not in node_map:
            if isinstance(term, Literal):
                label = str(term)[:40]
                if term.datatype:
                    label += f" ({_rdf_local_name(str(term.datatype))})"
            elif isinstance(term, BNode):
                label = f"_:{str(term)[:8]}"
            else:
                label = _rdf_local_name(nid)
            node_map[nid] = {
                "id": nid,
                "label": label,
                "group": _node_group(term),
                "color": _node_color(term),
            }
            degree[nid] = 0
        return nid

    for s, p, o in g:
        sid = add_node(s)
        oid = add_node(o)
        degree[sid] = degree.get(sid, 0) + 1
        degree[oid] = degree.get(oid, 0) + 1
        links.append({
            "source": sid,
            "target": oid,
            "label": _rdf_local_name(str(p)),
        })

    nodes = list(node_map.values())

    # If too large, keep the top-degree nodes and their links
    if len(nodes) > max_nodes:
        top_ids = {nid for nid, _ in sorted(degree.items(), key=lambda x: -x[1])[:max_nodes]}
        nodes = [n for n in nodes if n["id"] in top_ids]
        links = [lk for lk in links if lk["source"] in top_ids and lk["target"] in top_ids]

    return {"nodes": nodes, "links": links}


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

_PROJECT_ROOT = Path(__file__).parent.parent.parent
ONTOLOGY_DIR = _PROJECT_ROOT / "Streamlit_app" / "ontologies"
EXAMPLE_FILE = _PROJECT_ROOT / "Streamlit_app" / "BAM_Creep.txt"


def get_example_content() -> str:
    try:
        return EXAMPLE_FILE.read_text(encoding="utf-8")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# LLM wrapper  (ported from utils.py)
# ---------------------------------------------------------------------------

def call_llm(prompt: str, system_prompt: str, model_info: dict) -> str:
    """Call the configured LLM provider synchronously."""
    provider = model_info["provider"]
    model = model_info["model"]
    temperature = float(model_info.get("temperature", 0.3))

    if provider == "OpenAI":
        from openai import OpenAI  # type: ignore
        client = OpenAI(api_key=model_info["api_key"])
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=temperature,
        )
        return resp.choices[0].message.content or ""

    if provider == "Anthropic":
        from anthropic import Anthropic  # type: ignore
        client = Anthropic(api_key=model_info["api_key"])
        resp = client.messages.create(
            model=model,
            max_tokens=4000,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text

    if provider == "Ollama":
        endpoint = model_info.get("endpoint", "http://localhost:11434")
        data = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "stream": False,
        }
        resp = requests.post(f"{endpoint}/api/chat", json=data, timeout=120)
        resp.raise_for_status()
        json_data = resp.json()
        if "message" in json_data and "content" in json_data["message"]:
            return json_data["message"]["content"]
        raise ValueError(f"Unexpected Ollama response format: {json_data}")

    raise ValueError(f"Unknown provider: {provider}")


def extract_rdf_shacl(response_text: str) -> Tuple[str, str]:
    """Extract first two turtle code blocks from an LLM response."""
    if not response_text or not response_text.strip():
        return "", ""
    parts = response_text.split("```")
    code_blocks: list[str] = []
    for i, part in enumerate(parts):
        if i % 2 == 1:
            part_clean = part.strip()
            if part_clean.startswith("turtle"):
                part_clean = part_clean[6:].strip()
            elif part_clean.startswith("ttl"):
                part_clean = part_clean[3:].strip()
            if "@prefix" in part_clean or "sh:" in part_clean:
                code_blocks.append(part_clean)
    rdf_code = code_blocks[0] if len(code_blocks) >= 1 else ""
    shacl_code = code_blocks[1] if len(code_blocks) >= 2 else ""
    return rdf_code, shacl_code


# ---------------------------------------------------------------------------
# Syntax helpers  (ported from helpers.py)
# ---------------------------------------------------------------------------

_SYNTAX_FIXES = [
    (r"b'([^']*)'", r"\1"),
    (r'b"([^"]*)"', r'\1'),
    (r"'\^b'", ""),
    (r'"\^b"', ""),
    (r"\^b", ""),
    (r"\s*\^b\s*\.", " ."),
    (r"([a-zA-Z0-9:_]+)'\^b'", r"\1"),
    (r'"([^"]*)\n\s*([^"]*)"', r'"\1 \2"'),
    (r"'([^']*)\n\s*([^']*)'", r"'\1 \2'"),
    (r"ex:([a-zA-Z0-9_]+)'\^b'", r"ex:\1"),
    (r"'[\^]+[a-zA-Z]+'", ""),
    (r'""[\^]+[a-zA-Z]+""', '""'),
    (r'"([^"]*)"\s*\^\^([a-zA-Z0-9_:]+)', r'"\1"^^\2'),
    (r'"([^"]*)"\s*\^\^\s*\^\^([a-zA-Z0-9_:]+)', r'"\1"^^\2'),
    (r'sh:(minCount|maxCount|minLength|maxLength)\s+"(\d+)"', r'sh:\1 \2'),
    (r'"(true|false)"(?!\^\^)', r'\1'),
    (r'"(\d+)"(?!\^\^)', r'\1'),
    (r'"(\d*\.\d+)"(?!\^\^)', r'\1'),
    (r'@prefix\s+([a-zA-Z][\w\-]*)\s*:\s*$', r'@prefix \1: <http://example.org/> .'),
    (r'@prefix\s+([a-zA-Z][\w\-]*)\s*:\s*<([^>]*)$', r'@prefix \1: <\2> .'),
    (r'###+', '###'),
    (r'#\s*#', '#'),
    (r'sh:path\s+([a-zA-Z0-9:_]+)\s*\^\s*([a-zA-Z0-9:_]+)', r'sh:path \1/\2'),
    (r'<rdf:RDF[^>]*>', ''),
    (r'</rdf:RDF>', ''),
    (r'xmlns:[a-zA-Z0-9]+="[^"]*"', ''),
    (r'_:\s*([a-zA-Z0-9_]+)', r'_:\1'),
    (r'_:([a-zA-Z0-9_]+)\s*_:', r'_:\1'),
    (r'\.\.+', '.'),
    (r';;+', ';'),
    (r',,+', ','),
    (r'"([^"]*)"@([a-zA-Z]{2,3})[^a-zA-Z\s]', r'"\1"@\2'),
    (r'"([^"]*)"@@([a-zA-Z]{2,3})', r'"\1"@\2'),
    (r'([a-zA-Z][a-zA-Z0-9]*)::', r'\1:'),
    (r'([a-zA-Z][a-zA-Z0-9]*)\s*:\s*:', r'\1:'),
    (r'\\n', '\n'),
    (r'\\t', '\t'),
    (r'\\r', '\r'),
    (r'\\"', '"'),
    (r"\\'", "'"),
    (r'[ \t]+$', ''),
    (r'\n\s*\n\s*\n+', '\n\n'),
]


def basic_syntax_cleanup(rdf_text: str, shacl_text: str) -> Tuple[str, str]:
    def clean(text: str) -> str:
        for pattern, replacement in _SYNTAX_FIXES:
            text = re.sub(pattern, replacement, text, flags=re.MULTILINE)
        return text.strip()
    return clean(rdf_text), clean(shacl_text)


def validate_turtle_syntax(turtle_text: str) -> Tuple[bool, str]:
    try:
        Graph().parse(data=turtle_text, format="turtle")
        return True, "Valid syntax"
    except Exception as exc:
        return False, str(exc)


def extract_core_error(report: str) -> str:
    cleaned = re.sub(r'line \d+', 'line X', report)
    cleaned = re.sub(r'column \d+', 'column X', cleaned)
    cleaned = re.sub(r'n\d+', 'nX', cleaned)
    cleaned = re.sub(r'_:b\d+', '_:bX', cleaned)
    cleaned = re.sub(r'#\w+', '#X', cleaned)
    cleaned = re.sub(r'https?://[^\s]+', 'http://X', cleaned)
    cleaned = re.sub(r'\d{4}-\d{2}-\d{2}', 'DATE', cleaned)
    cleaned = re.sub(r'\d{2}:\d{2}:\d{2}', 'TIME', cleaned)
    cleaned = re.sub(r'\d+\.\d+', 'NUM', cleaned)
    cleaned = re.sub(r'(?<!\w)\d+(?!\w)', 'NUM', cleaned)
    cleaned = re.sub(r'<[^>]+>', '<URI>', cleaned)
    cleaned = re.sub(r'[a-zA-Z][a-zA-Z0-9]*:[a-zA-Z0-9_]+', 'ns:X', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)

    error_patterns = [
        r'Constraint Violation', r'MinCount', r'MaxCount', r'DataType',
        r'NodeKind', r'Class constraint', r'Pattern', r'Bad syntax',
        r'Parse error', r'Syntax error', r'Expected\s+\w+', r'Unexpected\s+\w+',
        r'objectList expected', r'Missing\s+\w+', r'Invalid\s+\w+',
        r'newline found in string literal', r'unterminated string literal',
        r'Validation failed', r'Schema violation',
    ]
    found: list[str] = []
    seen: set[str] = set()
    for pat in error_patterns:
        for m in re.findall(pat, cleaned, re.IGNORECASE):
            key = m.lower().strip()
            if key and key not in seen:
                found.append(key)
                seen.add(key)
    if not found:
        for pat in [r'error', r'fail', r'violation', r'invalid', r'missing']:
            for m in re.findall(rf'\b{pat}\b', cleaned, re.IGNORECASE):
                key = m.lower().strip()
                if key not in seen:
                    found.append(key)
                    seen.add(key)
    return ' '.join(found)


def is_syntax_error(report: str) -> bool:
    syntax_indicators = [
        "Bad syntax at line", "objectList expected", "Expected one of",
        "Unexpected end of file", "Invalid escape sequence",
        "Malformed URI", "Invalid character",
    ]
    has_syntax = any(ind in report for ind in syntax_indicators)
    has_shacl = "Constraint Violation" in report or "sh:" in report
    return has_syntax and not has_shacl


def should_retry_correction(report: str, previous_core_errors: list[str], max_same_error: int = 2) -> bool:
    core_error = extract_core_error(report)
    return previous_core_errors.count(core_error) < max_same_error


def validate_api_key(provider: str, api_key: str, endpoint: str = "") -> Tuple[bool, str]:
    try:
        if provider == "OpenAI":
            import openai as _openai  # type: ignore
            _openai.OpenAI(api_key=api_key).models.list()
        elif provider == "Anthropic":
            from anthropic import Anthropic, AuthenticationError as _AnthErr  # type: ignore
            Anthropic(api_key=api_key).models.list()
        elif provider == "Ollama":
            if not endpoint:
                raise ValueError("No endpoint provided for Ollama.")
            resp = requests.get(f"{endpoint}/v1/models", timeout=5)
            if resp.status_code != 200:
                raise Exception(f"Ollama responded with status {resp.status_code}")
        return True, ""
    except Exception as exc:
        return False, str(exc)


# ---------------------------------------------------------------------------
# Agents  (ported from agents.py)
# ---------------------------------------------------------------------------

_RDF_GENERATOR_SYSTEM = """# Materials Science Knowledge Graph Expert

You are a specialized knowledge engineer for materials science, focusing on transforming
unstructured creep test reports into standardized RDF and SHACL models.

## Required Namespace Declarations
Both RDF and SHACL outputs must include all of these prefixes:

@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ex: <http://example.org/ns#> .
@prefix matwerk: <http://matwerk.org/ontology#> .
@prefix nfdi: <http://nfdi.org/ontology/core#> .
@prefix pmd: <http://pmd.org/ontology/core#> .
@prefix iao: <http://purl.obolibrary.org/obo/IAO_> .
@prefix obi: <http://purl.obolibrary.org/obo/OBI_> .
@prefix obo: <http://purl.obolibrary.org/obo/> .
@prefix qudt: <http://qudt.org/schema/qudt/> .
@prefix unit: <http://qudt.org/vocab/unit/> .
@prefix time: <http://www.w3.org/2006/time#> .
@prefix prov: <http://www.w3.org/ns/prov#> .

## Output Deliverables
Generate two artifacts:
1. Complete RDF Data Model in Turtle format (first ```turtle block)
2. SHACL Validation Shape in Turtle format (second ```turtle block)

The SHACL shape MUST successfully validate the RDF data.
"""


class RDFGeneratorAgent:
    def __init__(self, model_info: dict) -> None:
        self.model_info = model_info

    def run(self, user_input: str, previous_output: str = "") -> Tuple[str, str]:
        prompt = user_input
        if previous_output:
            prompt += f"\n\nImprove this RDF/SHACL:\n{previous_output}"
        response = call_llm(prompt, _RDF_GENERATOR_SYSTEM, self.model_info)
        return extract_rdf_shacl(response)


class ValidatorAgent:
    def run(self, rdf_code: str, shacl_code: str) -> Tuple[bool, str]:
        try:
            rdf_graph = Graph().parse(data=rdf_code, format="turtle")
            shacl_graph = Graph().parse(data=shacl_code, format="turtle")
            conforms, _, report = _shacl_validate(data_graph=rdf_graph, shacl_graph=shacl_graph)
            return bool(conforms), str(report)
        except Exception as exc:
            return False, f"Validation Error: {exc}"


class CritiqueAgent:
    def __init__(self, model_info: dict) -> None:
        self.model_info = model_info

    def run(self, rdf_code: str, shacl_code: str) -> str:
        prompt = (
            f"Critique this materials science RDF and SHACL and suggest improvements.\n\n"
            f"RDF:\n{rdf_code}\n\nSHACL:\n{shacl_code}\n\n"
            "Focus on semantic coherence, ontology alignment, completeness, and SHACL quality."
        )
        return call_llm(prompt, "You are a SHACL and RDF critique expert.", self.model_info)


class OntologyMapperAgent:
    def __init__(self, model_info: dict) -> None:
        self.model_info = model_info

    def run(self, user_input: str) -> str:
        prompt = f"Suggest ontology mappings for the following materials science data:\n{user_input}"
        return call_llm(prompt, "You are a materials science ontology assistant.", self.model_info)


class CorrectionAgent:
    def __init__(self, model_info: dict) -> None:
        self.model_info = model_info

    def run(self, rdf_code: str, shacl_code: str, validation_report: str) -> Tuple[str, str]:
        prompt = f"""Fix the SHACL validation errors in the following RDF and SHACL data.

VALIDATION ERRORS:
{validation_report}

INSTRUCTIONS:
1. Fix all validation errors listed above
2. Return corrected RDF in first ```turtle block
3. Return corrected SHACL in second ```turtle block
4. Keep all namespace prefixes
5. Ensure RDF conforms to SHACL shapes

CURRENT RDF:
```turtle
{rdf_code}
```

CURRENT SHACL:
```turtle
{shacl_code}
```

Return the corrected versions now:"""
        response = call_llm(prompt, "You are an expert at fixing SHACL validation errors in RDF data.", self.model_info)
        return extract_rdf_shacl(response)


# ---------------------------------------------------------------------------
# OntologyMatcherAgent  (ported from agents.py)
# ---------------------------------------------------------------------------

class OntologyMatcherAgent:
    def __init__(self, ontology_directory: str = "", push: "Push | None" = None) -> None:
        self.ontology_directory = ontology_directory or str(ONTOLOGY_DIR)
        self.ontology_graphs: Dict[str, Graph] = {}
        self.ontology_terms: Dict[str, Dict] = {}
        self._push = push
        self._load_ontologies()

    def _load_ontologies(self) -> None:
        if not os.path.exists(self.ontology_directory):
            logger.warning("Ontology directory '%s' not found.", self.ontology_directory)
            return
        files = (
            glob.glob(os.path.join(self.ontology_directory, "*.ttl"))
            + glob.glob(os.path.join(self.ontology_directory, "*.owl"))
        )
        if not files:
            logger.info("No ontology files found in '%s'.", self.ontology_directory)
            return
        total = len(files)
        for idx, file_path in enumerate(files, 1):
            filename = os.path.basename(file_path)
            if self._push:
                self._push({"type": "progress", "phase": "loading_ontologies",
                            "message": f"Loading ontology {idx}/{total}: {filename}"})
            try:
                g = Graph()
                fmt = "turtle" if file_path.endswith(".ttl") else "xml"
                g.parse(file_path, format=fmt)
                self.ontology_graphs[filename] = g
                self.ontology_terms[filename] = self._extract_terms(g)
                logger.info("Loaded ontology: %s (%d terms)", filename, len(self.ontology_terms[filename]))
                if self._push:
                    self._push({"type": "progress", "phase": "loading_ontologies",
                                "message": f"✓ {filename} — {len(self.ontology_terms[filename])} terms"})
            except Exception as exc:
                logger.error("Failed to load ontology %s: %s", filename, exc)
                if self._push:
                    self._push({"type": "progress", "phase": "loading_ontologies",
                                "message": f"⚠️ Failed to load {filename}: {exc}"})

    def _extract_terms(self, graph: Graph) -> Dict[str, Dict]:
        terms: Dict[str, Dict] = {}
        RDF_TYPE = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
        for cls_uri in [
            "http://www.w3.org/2002/07/owl#Class",
            "http://www.w3.org/2000/01/rdf-schema#Class",
        ]:
            for subj in graph.subjects(predicate=RDF_TYPE, object=URIRef(cls_uri)):
                terms[str(subj)] = self._get_term_info(graph, subj, "Class")
        for prop_uri in [
            "http://www.w3.org/2002/07/owl#ObjectProperty",
            "http://www.w3.org/2002/07/owl#DatatypeProperty",
            "http://www.w3.org/1999/02/22-rdf-syntax-ns#Property",
        ]:
            for subj in graph.subjects(predicate=RDF_TYPE, object=URIRef(prop_uri)):
                terms[str(subj)] = self._get_term_info(graph, subj, "Property")
        return terms

    def _get_term_info(self, graph: Graph, term: URIRef, term_type: str) -> Dict:
        info: Dict = {
            "type": term_type,
            "uri": str(term),
            "label": None,
            "comment": None,
            "local_name": self._local_name(str(term)),
        }
        RDFS = "http://www.w3.org/2000/01/rdf-schema#"
        for label in graph.objects(term, URIRef(f"{RDFS}label")):
            info["label"] = str(label)
            break
        for comment in graph.objects(term, URIRef(f"{RDFS}comment")):
            info["comment"] = str(comment)
            break
        return info

    @staticmethod
    def _local_name(uri: str) -> str:
        return uri.split("#")[-1] if "#" in uri else uri.split("/")[-1]

    def _extract_rdf_terms(self, rdf_code: str) -> Set[str]:
        try:
            g = Graph()
            g.parse(data=rdf_code, format="turtle")
            terms: Set[str] = set()
            for s, p, o in g:
                for node in (s, p, o):
                    if isinstance(node, URIRef):
                        terms.add(str(node))
            return terms
        except Exception as exc:
            logger.error("Error parsing RDF for term extraction: %s", exc)
            return set()

    def _similarity(self, t1: str, t2: str) -> float:
        l1 = self._local_name(t1).lower()
        l2 = self._local_name(t2).lower()
        if l1 == l2:
            return 1.0
        if l1 in l2 or l2 in l1:
            diff = abs(len(l1) - len(l2))
            return 0.9 if diff <= 2 else 0.3
        seq_sim = SequenceMatcher(None, l1, l2).ratio()
        w1 = set(re.findall(r'[A-Z][a-z]*|[a-z]+', l1))
        w2 = set(re.findall(r'[A-Z][a-z]*|[a-z]+', l2))
        if w1 and w2:
            word_sim = len(w1 & w2) / len(w1 | w2)
            if word_sim < 0.8:
                word_sim *= 0.5
        else:
            word_sim = 0
        final = max(seq_sim * 0.7, word_sim * 0.8)
        if final < 0.6:
            final *= 0.5
        return min(final, 1.0)

    def find_matches(self, rdf_code: str, similarity_threshold: float = 0.7) -> Dict:
        if not self.ontology_terms:
            return {"status": "no_ontologies", "message": "No ontology files loaded.", "matches": []}
        rdf_terms = self._extract_rdf_terms(rdf_code)
        if not rdf_terms:
            return {"status": "no_rdf_terms", "message": "No terms extracted from RDF.", "matches": []}
        all_matches: list[Dict] = []
        exact_count = 0
        similar_count = 0
        for rdf_term in rdf_terms:
            for onto_file, onto_terms in self.ontology_terms.items():
                for onto_uri, onto_info in onto_terms.items():
                    score = self._similarity(rdf_term, onto_uri)
                    if score >= similarity_threshold:
                        m = {
                            "rdf_term": rdf_term,
                            "rdf_local_name": self._local_name(rdf_term),
                            "ontology_file": onto_file,
                            "ontology_term": onto_uri,
                            "ontology_local_name": onto_info["local_name"],
                            "ontology_type": onto_info["type"],
                            "ontology_label": onto_info["label"],
                            "ontology_comment": onto_info["comment"],
                            "similarity_score": score,
                        }
                        all_matches.append(m)
                        if score == 1.0:
                            exact_count += 1
                        else:
                            similar_count += 1
        all_matches.sort(key=lambda x: x["similarity_score"], reverse=True)
        total_onto = sum(len(t) for t in self.ontology_terms.values())
        return {
            "status": "success",
            "total_rdf_terms": len(rdf_terms),
            "total_ontology_terms": total_onto,
            "total_matches": len(all_matches),
            "exact_matches": exact_count,
            "similar_matches": similar_count,
            "matches": all_matches,
            "similarity_threshold": similarity_threshold,
        }

    def run(self, rdf_code: str, similarity_threshold: float = 0.7) -> str:
        results = self.find_matches(rdf_code, similarity_threshold)
        if results["status"] != "success":
            return results.get("message", "No analysis available.")
        report = [
            "# Ontology Matching Analysis",
            f"- RDF Terms Analyzed: {results['total_rdf_terms']}",
            f"- Ontology Terms Available: {results['total_ontology_terms']}",
            f"- Total Matches: {results['total_matches']}",
            f"- Exact Matches: {results['exact_matches']}",
            f"- Similar Matches: {results['similar_matches']}",
            f"- Similarity Threshold: {results['similarity_threshold']}",
            "",
        ]
        if results["matches"]:
            report.append("## Match Details")
            current = ""
            for m in results["matches"]:
                if m["rdf_term"] != current:
                    current = m["rdf_term"]
                    report.append(f"\n### RDF Term: `{m['rdf_local_name']}`")
                    report.append(f"*Full URI: {m['rdf_term']}*\n")
                badge = "EXACT MATCH" if m["similarity_score"] == 1.0 else f"SIMILAR ({m['similarity_score']:.2f})"
                report.append(f"**{badge}** — {m['ontology_file']} → `{m['ontology_local_name']}` ({m['ontology_type']})")
                if m["ontology_label"]:
                    report.append(f"  Label: {m['ontology_label']}")
                if m["ontology_comment"]:
                    snippet = m["ontology_comment"][:200]
                    report.append(f"  {snippet}")
        else:
            report.append("No matches found at this similarity threshold.")
        return "\n".join(report)

    # Known namespace → prefix mappings used by the LLM system prompt
    _KNOWN_NS_PREFIXES: Dict[str, str] = {
        "http://matwerk.org/ontology#": "matwerk",
        "http://nfdi.org/ontology/core#": "nfdi",
        "http://pmd.org/ontology/core#": "pmd",
        "http://purl.obolibrary.org/obo/": "obo",
        "http://qudt.org/schema/qudt/": "qudt",
        "http://qudt.org/vocab/unit/": "unit",
        "http://www.w3.org/2002/07/owl#": "owl",
        "http://www.w3.org/2000/01/rdf-schema#": "rdfs",
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
        "http://www.w3.org/ns/shacl#": "sh",
        "http://www.w3.org/ns/prov#": "prov",
        "http://www.w3.org/2006/time#": "time",
        "http://www.w3.org/2001/XMLSchema#": "xsd",
        "http://example.org/ns#": "ex",
    }

    @staticmethod
    def _ns_of(uri: str) -> str:
        """Extract the namespace portion of a URI."""
        if "#" in uri:
            return uri.rsplit("#", 1)[0] + "#"
        if "/" in uri:
            return uri.rsplit("/", 1)[0] + "/"
        return uri

    @staticmethod
    def _extract_prefix_map(text: str) -> Dict[str, str]:
        """Build namespace-URI → prefix map from @prefix declarations in Turtle text."""
        pm: Dict[str, str] = {}
        for m in re.finditer(r'@prefix\s+(\w*?):\s*<([^>]+)>', text):
            pm[m.group(2)] = m.group(1)
        return pm

    def _prefix_for_ns(self, ns: str) -> str:
        """Return a sensible prefix string for a namespace URI."""
        if ns in self._KNOWN_NS_PREFIXES:
            return self._KNOWN_NS_PREFIXES[ns]
        try:
            parsed = urllib.parse.urlparse(ns)
            parts = [p for p in parsed.path.split("/") if p]
            base = parts[-1] if parts else parsed.netloc.split(".")[0]
            return re.sub(r"[^a-z0-9]", "", base.lower())[:8] or "onto"
        except Exception:
            return "onto"

    def _perform_replacement(self, rdf: str, shacl: str, orig: str, repl: str) -> Tuple[str, str]:
        orig_local = self._local_name(orig)
        repl_local = self._local_name(repl)
        orig_ns = self._ns_of(orig)
        repl_ns = self._ns_of(repl)
        updated_rdf, updated_shacl = rdf, shacl

        # Strategy 1: Replace full URI references (e.g. <http://example.org/ns#CreepTest>)
        if orig.startswith("http"):
            full_pat = f"<{re.escape(orig)}>"
            updated_rdf = updated_rdf.replace(full_pat, f"<{repl}>")
            updated_shacl = updated_shacl.replace(full_pat, f"<{repl}>")

        # Strategy 2: Replace prefixed form — look up the source prefix from @prefix declarations
        # so that "ex:CreepTest" → "matwerk:CreepTest" (not just changing local name).
        prefix_map = self._extract_prefix_map(rdf)
        src_prefix = prefix_map.get(orig_ns)
        tgt_prefix = (
            prefix_map.get(repl_ns)
            or self._KNOWN_NS_PREFIXES.get(repl_ns)
            or self._prefix_for_ns(repl_ns)
        )

        if src_prefix is not None:
            # Replace src_prefix:orig_local → tgt_prefix:repl_local
            pat = r"(?<!\w)" + re.escape(src_prefix) + r":" + re.escape(orig_local) + r"(?!\w)"
            updated_rdf = re.sub(pat, f"{tgt_prefix}:{repl_local}", updated_rdf)
            updated_shacl = re.sub(pat, f"{tgt_prefix}:{repl_local}", updated_shacl)
        else:
            # Fallback: replace any_prefix:orig_local (only local name changes)
            fallback_pat = r"\b(\w+):" + re.escape(orig_local) + r"\b"
            updated_rdf = re.sub(fallback_pat, r"\1:" + repl_local, updated_rdf)
            updated_shacl = re.sub(fallback_pat, r"\1:" + repl_local, updated_shacl)

        return updated_rdf, updated_shacl

    def _extract_and_update_namespaces(self, rdf: str, shacl: str, replacements: List[Dict]) -> Tuple[str, str]:
        """Add @prefix declarations for any ontology namespaces introduced by replacements."""
        existing_ns = self._extract_prefix_map(rdf)
        new_decls: List[str] = []
        for rep in replacements:
            repl_uri = rep["replacement_term"]
            ns = self._ns_of(repl_uri)
            if ns not in existing_ns:
                prefix = self._KNOWN_NS_PREFIXES.get(ns) or self._prefix_for_ns(ns)
                new_decls.append(f"@prefix {prefix}: <{ns}> .")
                existing_ns[ns] = prefix  # avoid duplicates within this batch
        if new_decls:
            block = "\n".join(new_decls) + "\n"
            rdf = block + rdf
            shacl = block + shacl
        return rdf, shacl

    def replace_exact_matches(self, rdf: str, shacl: str, similarity_threshold: float = 1.0) -> Tuple[str, str, List[Dict]]:
        results = self.find_matches(rdf, similarity_threshold)
        if results["status"] != "success":
            return rdf, shacl, []
        exact = [m for m in results["matches"] if m["similarity_score"] == 1.0]
        if not exact:
            return rdf, shacl, []
        unique: Dict[str, Dict] = {}
        for m in exact:
            if m["rdf_term"] not in unique:
                unique[m["rdf_term"]] = m
        replacements: list[Dict] = []
        updated_rdf, updated_shacl = rdf, shacl
        for rdf_term, m in unique.items():
            updated_rdf, updated_shacl = self._perform_replacement(updated_rdf, updated_shacl, rdf_term, m["ontology_term"])
            replacements.append({
                "original_term": rdf_term,
                "replacement_term": m["ontology_term"],
                "ontology_file": m["ontology_file"],
                "term_type": m["ontology_type"],
                "label": m["ontology_label"],
                "comment": m["ontology_comment"],
            })
        if replacements:
            updated_rdf, updated_shacl = self._extract_and_update_namespaces(updated_rdf, updated_shacl, replacements)
        return updated_rdf, updated_shacl, replacements

    def generate_replacement_report(self, replacement_list: List[Dict]) -> str:
        if not replacement_list:
            return "No exact matches found for replacement."
        lines = [f"**{len(replacement_list)} ontology terms replaced:**\n"]
        for i, r in enumerate(replacement_list, 1):
            lines.append(f"{i}. `{r['original_term']}` → `{r['replacement_term']}` ({r['ontology_file']})")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# SemanticPipelineAgent  (ported from controller.py)
# ---------------------------------------------------------------------------

class SemanticPipelineAgent:
    def __init__(self, model_info: dict, max_optimization: int = 1, max_correction: int = 8, push: "Push | None" = None) -> None:
        self.model_info = model_info
        self.max_optimization = max_optimization
        self.max_correction = max_correction
        self.generator = RDFGeneratorAgent(model_info)
        self.validator = ValidatorAgent()
        self.critic = CritiqueAgent(model_info)
        self.ontology_mapper = OntologyMapperAgent(model_info)
        self.corrector = CorrectionAgent(model_info)
        self.ontology_matcher = OntologyMatcherAgent(push=push)

    def apply_ontology_replacements(
        self,
        rdf_code: str,
        shacl_code: str,
        similarity_threshold: float = 1.0,
    ) -> Tuple[str, str, str, Dict]:
        try:
            replaced_rdf, replaced_shacl, rep_list = self.ontology_matcher.replace_exact_matches(
                rdf_code, shacl_code, similarity_threshold
            )
            report = self.ontology_matcher.generate_replacement_report(rep_list)
            validation: Dict = {"replacements_made": len(rep_list), "conforms": False, "report": "No replacements"}
            if rep_list:
                conforms, val_report = self.validator.run(replaced_rdf, replaced_shacl)
                validation = {
                    "replacements_made": len(rep_list),
                    "conforms": conforms,
                    "report": val_report,
                }
            return replaced_rdf, replaced_shacl, report, validation
        except Exception as exc:
            return rdf_code, shacl_code, f"Replacement error: {exc}", {"replacements_made": 0, "conforms": False, "report": str(exc)}


# ---------------------------------------------------------------------------
# Pipeline runner with SSE callbacks
# ---------------------------------------------------------------------------

Push = Callable[[Dict], None]


def run_pipeline(
    user_input: str,
    model_info: dict,
    max_opt: int,
    max_corr: int,
    similarity_threshold: float,
    push: Push,
) -> None:
    """
    Run the full AgentSem pipeline synchronously, emitting progress events via push().
    Designed to run inside asyncio.to_thread().
    """
    try:
        # Validate API key first
        provider = model_info.get("provider", "")
        api_key = model_info.get("api_key", "")
        endpoint = model_info.get("endpoint", "")
        valid_key, key_msg = validate_api_key(provider, api_key, endpoint)
        if not valid_key:
            push({"type": "error", "message": f"API key validation failed: {key_msg}"})
            return

        # ── Ontology loading ─────────────────────────────────────────────
        push({"type": "progress", "phase": "loading_ontologies",
              "message": "Loading ontology files from disk..."})
        agent = SemanticPipelineAgent(model_info, max_opt, max_corr, push=push)
        push({"type": "step", "step": "ontologies_loaded",
              "count": len(agent.ontology_matcher.ontology_graphs)})

        # ── Step 1: Initial generation ────────────────────────────────────
        push({"type": "progress", "phase": "generating", "message": "Generating initial RDF & SHACL..."})
        rdf_code, shacl_code = agent.generator.run(user_input)
        push({"type": "step", "step": "initial_generation", "rdf": rdf_code, "shacl": shacl_code})

        # ── Step 2: Optimization passes ───────────────────────────────────
        for i in range(max_opt):
            push({"type": "progress", "phase": "optimizing", "message": f"Optimization pass {i + 1}/{max_opt}..."})
            critique = agent.critic.run(rdf_code, shacl_code)
            push({"type": "step", "step": "critique", "pass": i + 1, "critique": critique})
            rdf_code, shacl_code = agent.generator.run(user_input, f"{rdf_code}\n{shacl_code}\n\n{critique}")
            push({"type": "step", "step": "optimization", "pass": i + 1, "rdf": rdf_code, "shacl": shacl_code})

        # Syntax cleanup before validation
        rdf_code, shacl_code = basic_syntax_cleanup(rdf_code, shacl_code)

        # ── Step 3: Validation + correction loop ──────────────────────────
        push({"type": "progress", "phase": "validating", "message": "Validating RDF against SHACL..."})
        rdf_ok, rdf_err = validate_turtle_syntax(rdf_code)
        shacl_ok, shacl_err = validate_turtle_syntax(shacl_code)

        if not rdf_ok or not shacl_ok:
            report = (
                f"Syntax errors prevent SHACL validation.\n"
                f"RDF: {rdf_err if not rdf_ok else 'OK'}\n"
                f"SHACL: {shacl_err if not shacl_ok else 'OK'}"
            )
            conforms = False
        else:
            conforms, report = agent.validator.run(rdf_code, shacl_code)

        push({"type": "step", "step": "validation", "attempt": 0, "conforms": conforms, "report": report})

        correction_attempt = 0
        previous_core_errors: list[str] = []
        consecutive_failures = 0

        while not conforms and correction_attempt < max_corr:
            correction_attempt += 1
            core_error = extract_core_error(report)
            error_type = "syntax" if is_syntax_error(report) else "validation"
            push({"type": "progress", "phase": "correcting",
                  "message": f"Correction attempt {correction_attempt}/{max_corr} ({error_type} error)..."})

            if not should_retry_correction(report, previous_core_errors):
                if consecutive_failures < 2:
                    consecutive_failures += 1
                    enhanced_report = f"REPEATED ERROR: {core_error}\n\n{report}"
                    rdf_code, shacl_code = agent.corrector.run(rdf_code, shacl_code, enhanced_report)
                else:
                    push({"type": "step", "step": "correction_aborted",
                          "message": "Max retries for this error pattern reached."})
                    break
            else:
                rdf_code, shacl_code = agent.corrector.run(rdf_code, shacl_code, report)

            previous_core_errors.append(core_error)
            rdf_code, shacl_code = basic_syntax_cleanup(rdf_code, shacl_code)

            rdf_ok2, _ = validate_turtle_syntax(rdf_code)
            shacl_ok2, _ = validate_turtle_syntax(shacl_code)
            if rdf_ok2 and shacl_ok2:
                conforms, report = agent.validator.run(rdf_code, shacl_code)
                if conforms:
                    consecutive_failures = 0
            else:
                conforms = False

            push({"type": "step", "step": "correction", "attempt": correction_attempt,
                  "error_type": error_type, "rdf": rdf_code, "shacl": shacl_code,
                  "conforms": conforms, "report": report})

        # ── Step 4: Ontology mapping ──────────────────────────────────────
        push({"type": "progress", "phase": "ontology_mapping", "message": "Generating ontology term suggestions..."})
        try:
            ontology_mapping = agent.ontology_mapper.run(user_input)
        except Exception as exc:
            ontology_mapping = f"Ontology mapping failed: {exc}"
        push({"type": "step", "step": "ontology_mapping", "mappings": ontology_mapping})

        # ── Step 5: Ontology matching ─────────────────────────────────────
        push({"type": "progress", "phase": "ontology_matching", "message": "Analyzing ontology term matches..."})
        try:
            ontology_analysis = agent.ontology_matcher.run(rdf_code, similarity_threshold)
        except Exception as exc:
            ontology_analysis = f"Ontology matching failed: {exc}"
        push({"type": "step", "step": "ontology_matching", "analysis": ontology_analysis})

        # ── Step 6: Ontology replacement ──────────────────────────────────
        push({"type": "progress", "phase": "ontology_replacement", "message": "Applying ontology term replacements..."})
        try:
            replaced_rdf, replaced_shacl, rep_report, rep_validation = agent.apply_ontology_replacements(
                rdf_code, shacl_code, similarity_threshold
            )
            replacement_count = rep_validation.get("replacements_made", 0)
            if replacement_count > 0:
                rdf_code = replaced_rdf
                shacl_code = replaced_shacl
                if rep_validation.get("conforms"):
                    conforms = True
        except Exception as exc:
            rep_report = f"Replacement failed: {exc}"
            rep_validation = {"replacements_made": 0, "conforms": False, "report": str(exc)}
            replacement_count = 0

        push({"type": "step", "step": "ontology_replacement",
              "report": rep_report, "validation": rep_validation,
              "replaced_rdf": rdf_code, "replaced_shacl": shacl_code})

        # ── Final ─────────────────────────────────────────────────────────
        push({"type": "final", "rdf": rdf_code, "shacl": shacl_code,
              "conforms": conforms, "report": report,
              "replacement_count": replacement_count})

    except Exception as exc:
        logger.exception("Pipeline error")
        push({"type": "error", "message": str(exc)})
