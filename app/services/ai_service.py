"""Prompt-building helpers and error-counting utilities for the AI fix pipeline."""


def count_errors(report_text: str) -> int:
    """Estimate the number of constraint violations in a SHACL report.

    The fallback counts "Result Path:" rather than the bare word "result": a
    pyshacl report emits "Result Path:", "Result Severity:" and "Result Message:"
    per violation, so counting "result" overstated the total by roughly 3-4x. That
    number is injected into the fix prompt and returned as original_error_count,
    so overcounting told the model to fix errors that did not exist.
    """
    count = report_text.lower().count("constraint violation")
    if count == 0:
        count = report_text.count("Result Path:")
    return count


def build_fix_prompt(
    validation_report: str,
    rdf_content: str,
    shacl_content: str,
    ai_analysis: str,
    error_count: int,
) -> str:
    """Return the initial fix prompt sent to gpt-4o."""
    error_context = (
        f"\n**Estimated number of constraint violations: {error_count}**\n"
        if error_count > 0
        else ""
    )
    return f"""You are an expert in RDF/SHACL validation and semantic data correction.

A user has performed SHACL validation on their RDF data graph, and the validation FAILED with MULTIPLE ERRORS.
{error_context}
**Original Validation Report (READ CAREFULLY - contains ALL errors to fix):**
```
{validation_report}
```

**Original Data Graph (RDF - Turtle format):**
```turtle
{rdf_content}
```

**Shape Graph (SHACL - Turtle format):**
```turtle
{shacl_content}
```

**AI Analysis of Issues:**
{ai_analysis}

CRITICAL STEP-BY-STEP INSTRUCTIONS:

STEP 1: Extract EXACT property names from validation report
   - Look for "Result Path:" in each error
   - Copy the EXACT property name (case-sensitive, character-for-character)
   - Example: If it says "Result Path: :dateOftestStart" use EXACTLY ":dateOftestStart"

STEP 2: For EACH error in the validation report:
   - Note the Focus Node (which resource has the issue)
   - Note the Result Path (EXACT property name - preserve exact capitalisation)
   - Note what's required (MinCount, MaxCount, datatype, etc.)

STEP 3: Generate fixes using EXACT property names
   - Use the EXACT property names from the validation report
   - Do NOT change capitalisation or spelling

STEP 4: Apply ALL fixes systematically
   - Fix EVERY error found in the validation report
   - Preserve all valid data from the original
   - Add inline comments (using #) explaining each fix

CRITICAL REQUIREMENTS:
- **EXACT PROPERTY NAME MATCHING**: Use property names EXACTLY as shown in "Result Path:"
- Property names are **CASE-SENSITIVE**: :dateOftestStart ≠ :dateOfTestStart
- Fix EVERY SINGLE ERROR from the validation report
- Output ONLY the corrected RDF Turtle format
- NO markdown code blocks (```), NO explanations before/after

Output the complete corrected RDF Data Graph in Turtle format:"""


def build_retry_prompt(
    results_text: str,
    fixed_rdf: str,
    shacl_content: str,
    attempts: int,
    max_attempts: int,
) -> str:
    """Return a retry prompt that focuses the model on the remaining errors."""
    remaining_property_names = [
        line.split("Result Path:")[1].strip()
        for line in results_text.split("\n")
        if "Result Path:" in line
    ]
    property_emphasis = ""
    if remaining_property_names:
        props = "\n".join(f"   - {p}" for p in remaining_property_names)
        property_emphasis = (
            f"\n**⚠️ EXACT PROPERTY NAMES TO FIX (copy these exactly):**\n{props}\n"
        )

    shacl_snippet = shacl_content[:1500]
    if len(shacl_content) > 1500:
        shacl_snippet += "..."

    return f"""Your previous fix attempt (attempt #{attempts - 1}) still has validation errors. Fix the REMAINING errors.

**REMAINING VALIDATION ERRORS (these must ALL be fixed):**
```
{results_text}
```
{property_emphasis}
**Your previous fix attempt #{attempts - 1} (that still has errors above):**
```turtle
{fixed_rdf}
```

**Original SHACL Shape constraints (for reference):**
```turtle
{shacl_snippet}
```

CRITICAL: This is attempt #{attempts} of {max_attempts}.

🔴 COMMON MISTAKE TO AVOID:
   - Using wrong property name capitalisation
   - Look at "Result Path:" in the error and copy it EXACTLY

YOU MUST:
1. Read "Result Path:" in EACH error above – copy property names EXACTLY (character-by-character)
2. Fix ALL remaining errors using the EXACT property names
3. Keep all the corrections from the previous attempt

Output the FULLY CORRECTED RDF (Turtle format ONLY, no markdown blocks):"""
