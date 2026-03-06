from rdflib import BNode


def strip_markdown_fences(text: str) -> str:
    """Remove optional markdown code-block wrappers from AI-generated Turtle output."""
    text = text.strip()
    for prefix in ("```turtle", "```ttl", "```"):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


def local_name(term) -> str:
    """Return a short human-readable label for an RDF term."""
    s = str(term)
    if "#" in s:
        return s.split("#")[-1]
    if "/" in s:
        return s.split("/")[-1]
    return s[:60]
