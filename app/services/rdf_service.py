import asyncio
import logging

import networkx as nx
import pyshacl
from rdflib import BNode, Graph, Literal

from app.utils import local_name

logger = logging.getLogger("iuc02")


# ---------------------------------------------------------------------------
# Full validation (parse + SHACL validate + JSON-LD serialisation)
# ---------------------------------------------------------------------------


def _parse_and_validate_sync(
    rdf_content: str, shacl_content: str
) -> tuple[bool, str, list[dict], str]:
    data_graph = Graph()
    data_graph.parse(data=rdf_content, format="turtle")

    shacl_graph = Graph()
    shacl_graph.parse(data=shacl_content, format="turtle")

    conforms, results_graph, results_text = pyshacl.validate(
        data_graph,
        shacl_graph=shacl_graph,
        inference="rdfs",
        abort_on_first=False,
        allow_infos=False,
        allow_warnings=False,
        meta_shacl=False,
        advanced=False,
        js=False,
        debug=False,  # was True – verbose debug output is not needed in production
    )

    json_ld = data_graph.serialize(format="json-ld", indent=2)
    report_details = [
        {"subject": str(s), "predicate": str(p), "object": str(o)}
        for s, p, o in sorted(results_graph)
    ]
    return conforms, results_text, report_details, json_ld


async def run_validation(
    rdf_content: str, shacl_content: str
) -> tuple[bool, str, list[dict], str]:
    """Run full SHACL validation off the event loop."""
    return await asyncio.to_thread(
        _parse_and_validate_sync, rdf_content, shacl_content
    )


# ---------------------------------------------------------------------------
# Lightweight re-validation (reuses a pre-parsed shacl_graph)
# ---------------------------------------------------------------------------


def _shacl_validate_sync(
    rdf_content: str, shacl_graph: Graph
) -> tuple[bool, str]:
    data_graph = Graph()
    data_graph.parse(data=rdf_content, format="turtle")
    conforms, _results_graph, results_text = pyshacl.validate(
        data_graph,
        shacl_graph=shacl_graph,
        inference="rdfs",
        abort_on_first=False,
        debug=False,
    )
    return conforms, results_text


async def shacl_validate(
    rdf_content: str, shacl_graph: Graph
) -> tuple[bool, str]:
    """Validate *rdf_content* against a pre-parsed *shacl_graph*, off the event loop."""
    return await asyncio.to_thread(_shacl_validate_sync, rdf_content, shacl_graph)


# ---------------------------------------------------------------------------
# RDF graph → networkx DiGraph → nodes/edges dict
# ---------------------------------------------------------------------------


def _build_rdf_graph_sync(rdf_content: str) -> dict:
    data_graph = Graph()
    data_graph.parse(data=rdf_content, format="turtle")

    G = nx.DiGraph()

    for s, p, o in data_graph:
        s_id = str(s)
        p_label = local_name(p)

        s_type = "blank" if isinstance(s, BNode) else "uri"
        if s_id not in G:
            G.add_node(s_id, label=local_name(s), node_type=s_type)

        if isinstance(o, Literal):
            o_id = f"lit::{p_label}::{str(o)[:60]}"
            if o_id not in G:
                G.add_node(o_id, label=str(o)[:60], node_type="literal")
        elif isinstance(o, BNode):
            o_id = str(o)
            if o_id not in G:
                G.add_node(o_id, label=f"_:{o_id[:8]}", node_type="blank")
        else:
            o_id = str(o)
            if o_id not in G:
                G.add_node(o_id, label=local_name(o), node_type="uri")

        G.add_edge(s_id, o_id, label=p_label)

    nodes = [
        {
            "id": nid,
            "label": data.get("label", nid),
            "node_type": data.get("node_type", "uri"),
        }
        for nid, data in G.nodes(data=True)
    ]
    edges = [
        {"source": u, "target": v, "label": d.get("label", "")}
        for u, v, d in G.edges(data=True)
    ]
    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
    }


async def build_rdf_graph(rdf_content: str) -> dict:
    """Parse *rdf_content* and return a node/edge dict, off the event loop."""
    return await asyncio.to_thread(_build_rdf_graph_sync, rdf_content)
