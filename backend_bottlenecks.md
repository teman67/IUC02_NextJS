# Backend Bottleneck Analysis

> Audited: 2026-08-11
> Scope: `main.py`, `app/**` (config, dependencies, middleware, models, utils, routers, services)
> Supersedes the `main.py`-only review in `backend_review.md` — that file predates the `app/` refactor.

## Status: B1–B7 fixed (2026-08-11)

**B1–B7 are implemented and verified.** B8–B20 remain open.

Measured per-request overhead on `/api/agent-sem/generate-stream`:

| | Ontology load | `find_matches` × 2 | Total |
|---|---|---|---|
| Before | 2.610 s | 21.680 s | **24.290 s** |
| After | 0.000004 s | 0.0076 s (incl. one parse) | **0.0076 s** |

The 2.6 s ontology parse now happens once at boot (~3.5 s startup) instead of once per request.
`find_matches` output was checked for **exact parity** against the original implementation at
thresholds 1.0 / 0.95 / 0.9 / 0.85 / 0.8 / 0.7 / 0.6 / 0.5 — identical result sets throughout, at
67,100× (exact path) and 4–135× (fuzzy paths).

Verified behaviours: singleton identity and warm-cache reuse; `similarity_threshold` floor rejected
with 422 at the API boundary; comment fields capped at 200 chars; `validate_turtle_syntax` returning
a reusable graph with `run()`/`run_graphs()` agreeing on verdict and report; cooperative cancellation
stopping after exactly 1 LLM call versus 4 for the uncancelled control; 503 + `Retry-After: 60` when
pipeline slots are saturated; 413 on oversized `/parse-graph` and `/graph-html` bodies; the
`10/minute` limit engaging on `/graph-html`. Core validation, file, and example endpoints regression-
tested unchanged, path traversal still blocked.

New environment variables, all with working defaults: `WARM_ONTOLOGIES` (`1`),
`AGENTSEM_MAX_CONCURRENCY` (`2`), `IO_THREADPOOL_SIZE` (`16`), `AGENTSEM_MAX_MATCHES` (`500`),
`AGENTSEM_MAX_GRAPH_LINKS` (`2000`), `AGENTSEM_SSE_IDLE_TIMEOUT_SEC` (`660`).

One caveat: `AGENTSEM_SSE_IDLE_TIMEOUT_SEC` defaults to 660 s to sit above
`OLLAMA_READ_TIMEOUT_SEC` (600 s). If you lower the Ollama read timeout, lower this too, or an
abandoned stream holds its slot longer than necessary.

---

## Heroku deployment (2026-08-11)

The backend runs on Heroku. Four issues were platform-specific; **H1–H4 below are fixed**, H5 and
H6 are decisions left to the operator.

### Fixed

**H1 — `.python-version` had invalid content.** Both `runtime.txt` and `.python-version` were
tracked containing `python-3.11`. Heroku's docs are explicit that `.python-version` takes bare
version numbers and that `python-3.13`-style strings are wrong. Now `3.11` (major-only, so security
patches still arrive on each build); `runtime.txt` untracked.

**H2 — the router cut the SSE stream mid-pipeline.** Heroku's router allows 30 s to first byte, then
a rolling **55 s** window that every transmitted byte resets; silence past it terminates the
response (H12). `run_pipeline` is legitimately silent for the whole duration of each LLM call — five
or more such gaps per run — and `OLLAMA_READ_TIMEOUT_SEC` permits 600 s. `AGENTSEM_SSE_IDLE_TIMEOUT_SEC`
(660 s) could never be reached, because the router gave up first.

`event_generator` now waits on the queue in `HEARTBEAT_SEC` slices
(`AGENTSEM_SSE_HEARTBEAT_SEC`, default 15 s) and emits an SSE comment (`: keepalive`) on each idle
slice. Comments are ignored by `EventSource` clients but are bytes on the wire, which is what resets
the router window. The idle timeout is now measured from the last *real* event, so its meaning is
unchanged.

Measured against a real uvicorn server, with each LLM call silent for 3 s and a 2 s stand-in window:

| | Longest silence | Keepalives | Cut? |
|---|---|---|---|
| With heartbeat | 0.61 s | 24 | no |
| Without (control) | 3.00 s | 0 | yes |

The control reproduces the failure exactly, confirming the heartbeat is what prevents it. Note that
in-process ASGI clients (`httpx.ASGITransport`) buffer the full response and cannot measure streaming
cadence — this has to be tested over a real socket.

**H3 — rate limits collapsed into one global bucket.** This is [B18](#b18), which the audit rated Low
on the assumption of a direct connection. On Heroku all traffic arrives via the router, so
`request.client.host` was the router's IP and every caller shared one bucket: one user hitting
`5/minute` locked out everyone. The Procfile now runs with `--proxy-headers
--forwarded-allow-ips="*"`, so `request.client.host` is the real client. `"*"` is safe specifically
because the dyno is only reachable through the router.

**H4 — cleanup.** 1,247 files of a committed virtualenv (`Lib/`, `Scripts/`, `pyvenv.cfg`) shipped in
the slug; they are now in `.slugignore` and `.gitignore`, and untracked from git (working tree
untouched). `.slugignore` also excludes `frontend/`, `Streamlit_app/` and `*.md` — none are read by
the web process (verified: no runtime code opens a `.md`). Separately, `validate_api_key`'s helpful
"localhost means the server, not your machine" guard only checked `os.getenv("VERCEL")`; Heroku sets
`DYNO`, so the check is now `VERCEL or DYNO`.

### Open — operator decisions

**H5 — `/api/fix-validation-errors` (non-streaming) cannot work on Heroku.** It makes up to three
sequential gpt-4o calls at `max_tokens=4500` plus SHACL validation before returning a first byte:
minutes against a 30 s budget, so it always H12s. Related: `dependencies.py` sets
`httpx.Timeout(90.0)`, which is 3× the router limit, and Heroku recommends app timeouts "well under
30 seconds, such as 10 or 15." Point the frontend exclusively at
`/api/fix-validation-errors-stream` and either remove the non-streaming route or mark it dev-only.
`/api/analyze-validation` (gpt-4o-mini, 2000 tokens) is borderline and will occasionally H12.

**H6 — dyno sizing.** Measured RSS of a booted worker with the ontology cache warm:

| Stage | RSS |
|---|---|
| Baseline Python | 18 MB |
| + FastAPI app | 98 MB |
| + ontologies (B1 cache) | 182 MB |
| + after serving requests | **210 MB** |

210 MB is 41% of a 512 MB Basic/Standard-1X — comfortable at one worker. But each worker carries its
own cache, as [B20](#b20) warned:

```
--workers 1  ~210 MB       --workers 3  ~592 MB   <- R14 on 512 MB
--workers 2  ~401 MB       --workers 4  ~784 MB   <- R14
```

Stay at one worker on 512 MB, and consider `AGENTSEM_MAX_CONCURRENCY=1`, since Basic/Standard-1X
gets roughly one CPU share and two concurrent pipelines (SHACL plus matching) mostly contend.

### Notes

- **Boot timeout is fine.** `uvicorn.Server.startup()` awaits `lifespan.startup()` *before* binding
  the socket, so the ontology warm-up delays port binding and counts against Heroku's 60 s R10
  window. At ~3.5 s there is ample margin; `WARM_ONTOLOGIES=0` is the escape hatch.
- **Eco dynos sleep** after 30 minutes idle, so the next request pays the full cold start including
  the ontology parse. Basic and above do not sleep.
- **On dyno restart** Heroku sends SIGTERM with a 30 s grace period. Lifespan shutdown calls
  `pipeline_executor.shutdown(wait=False, cancel_futures=True)`, but a thread already inside
  `run_pipeline` is not interrupted, so an in-flight pipeline is lost at SIGKILL. Acceptable; setting
  the cancel event on shutdown would make it tidier.

All timings below were **measured on this machine** (12 cores, rdflib 7.5.0 / pyshacl 0.30.1 from
the repo-root venv), not estimated. Where I could not measure something, I say so.

---

## Executive summary

The refactor fixed everything in `backend_review.md`: blocking OpenAI calls now use `AsyncOpenAI`,
file and SHACL work is pushed off the event loop with `asyncio.to_thread`, the OpenAI client is a
module-level singleton, `HTTPException` is no longer swallowed, size guards and rate limits exist,
`debug=False`, and `RdfGraphRequest` was split out. The RDF/SHACL validation and AI-fix paths are in
good shape.

**The problems have all moved into the AgentSem pipeline** (`app/services/agent_sem_service.py`,
1,491 lines), which was ported from Streamlit and still carries Streamlit's single-user,
one-process-per-session assumptions into a shared multi-tenant API.

Measured, avoidable CPU cost on a single `/api/agent-sem/generate-stream` request:

| Phase | Measured | Avoidable? |
|---|---|---|
| Parse 4 ontology files (3.7 MB, 50,175 triples) | **2.41 s** | Yes — cache it |
| Extract 8,601 ontology terms | **0.20 s** | Yes — cache it |
| `find_matches` × 2 (35-URI test graph) | **21.68 s** | Yes — index it |
| **Total** | **≈ 24.3 s** | **≈ 24.3 s** |

That 24.3 s is for a *35-URI* graph — the tiny `rdfGraph_smallExample.ttl`. The matching cost is
linear in graph size at **0.31 s per RDF URI**, so a realistic LLM-generated creep-test graph of
~200 URIs costs **~124 s of pure CPU** in matching alone, and would blow the 300 s SSE timeout on
its own. Plus **64.4 MB** of ontology graphs retained per in-flight request.

Fixing B1 + B2 removes essentially all of it and is a contained change to one class.

---

## Severity index

| ID | Bottleneck | Severity | Status |
|---|---|---|---|
| [B1](#b1) | Ontologies re-parsed on every request (2.61 s + 64 MB) | **Critical** | ✅ Fixed |
| [B2](#b2) | `find_matches` is O(n × 8,601) with `SequenceMatcher` (10.8 s/call, 2 calls) | **Critical** | ✅ Fixed |
| [B3](#b3) | Unbounded match list — multi-GB OOM from a valid parameter | **Critical** | ✅ Fixed |
| [B4](#b4) | SSE timeout abandons the pipeline; the thread keeps running and billing | **Critical** | ✅ Fixed |
| [B5](#b5) | Pipeline runs starve the shared threadpool; whole API stalls | **High** | ✅ Fixed |
| [B6](#b6) | `/parse-graph` and `/graph-html` have no size guard and no rate limit | **High** | ✅ Fixed |
| [B7](#b7) | Same Turtle re-parsed 4–6× per correction iteration | **High** | ✅ Fixed |
| [B8](#b8) | No timeout on OpenAI/Anthropic calls in `call_llm` | **Medium** | Open |
| [B9](#b9) | New LLM client + TLS pool per call (~20 per run) | **Medium** | Open |
| [B10](#b10) | `requests` with no `Session`; redundant key validation per run | **Medium** | Open |
| [B11](#b11) | `_extract_terms` iterates subjects with duplicates; rebuilds `URIRef`s per call | **Medium** | Open (now once per process, not per request) |
| [B12](#b12) | `report_details` serializes the entire SHACL results graph | **Medium** | Open |
| [B13](#b13) | `inference="rdfs"` on every validate (20× relative, small absolute) | **Low** | Open |
| [B14](#b14) | `basic_syntax_cleanup`: 42 full-document scans per iteration | **Low** | Open (won't-fix on perf grounds) |
| [B15](#b15) | Two divergent SHACL validation code paths | **Low** | Open |
| [B16](#b16) | `count_errors` fallback counts the word "result" | **Low** | Open |
| [B17](#b17) | API keys can leak into SSE error events and logs | **Low** | Open |
| [B18](#b18) | Rate limiter and logger disagree about client IP | **Low** | Open |
| [B19](#b19) | `requirements.txt` drift; a venv is committed at repo root | **Low** | Open |
| [B20](#b20) | Single uvicorn worker, no explicit executor sizing | **Low** | Partly — executor now sized explicitly; still one worker |

---

## Critical

### <a id="b1"></a>B1 — Ontologies re-parsed on every pipeline request

**Where:** `agent_sem_service.py:937` `_load_ontologies`, reached from
`SemanticPipelineAgent.__init__` (`:1297`), which `run_pipeline` constructs per request (`:1355`).

`OntologyMatcherAgent()` parses 3.7 MB of TTL/OWL from disk on **every**
`/api/agent-sem/generate-stream` call. Measured:

```
emmo.ttl         2.12MB   33678 triples  parse=1.41s  extract=0.13s  ->  5621 terms
matwerk.ttl      0.20MB    1953 triples  parse=0.11s  extract=0.01s  ->   480 terms
pmdcore.owl      0.92MB    9183 triples  parse=0.60s  extract=0.04s  ->  1405 terms
unit.owl         0.56MB    5361 triples  parse=0.28s  extract=0.03s  ->  1095 terms
------------------------------------------------------------------------------------
                                         2.41s        0.20s            8601 terms
constructor total: 2.61 s      resident: 64.4 MB
```

64.4 MB is retained *per in-flight request* — 3 concurrent runs is ~193 MB of duplicated,
identical, read-only data. On a 512 MB container that alone is an OOM risk.

**Fix.** The graphs are only ever read (`subjects()`, `objects()`, `in graph`), so one shared
instance is safe. Cache at module level behind a lock:

```python
import threading

_matcher_lock = threading.Lock()
_matcher_singleton: "OntologyMatcherAgent | None" = None

def get_ontology_matcher(push: "Push | None" = None) -> "OntologyMatcherAgent":
    """Load and index the ontologies once per process; reuse thereafter."""
    global _matcher_singleton
    with _matcher_lock:
        if _matcher_singleton is None:
            _matcher_singleton = OntologyMatcherAgent(push=push)
    return _matcher_singleton
```

`SemanticPipelineAgent.__init__` then calls `get_ontology_matcher(push=push)` instead of
`OntologyMatcherAgent(push=push)`. Because progress events are only meaningful on the first
(cold) load, keep the `push` calls — subsequent requests skip them entirely and should instead
emit a single `ontologies_loaded` step.

Warm it at startup so the first user doesn't pay the 2.6 s:

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(get_ontology_matcher)   # pay 2.6s once, at boot
    yield

app = FastAPI(..., lifespan=lifespan)
```

---

### <a id="b2"></a>B2 — `find_matches` is a full cross-product with `SequenceMatcher`

**Where:** `agent_sem_service.py:1071` `find_matches`, `:1049` `_similarity`.

```python
for rdf_term in rdf_terms:                              # n
    for onto_file, onto_terms in self.ontology_terms.items():
        for onto_uri, onto_info in onto_terms.items():  # 8,601
            score = self._similarity(rdf_term, onto_uri)
```

Measured on the 35-URI `rdfGraph_smallExample.ttl`:

```
301,035 similarity() calls   10.84 s   36 us/call   ->   2 exact matches
```

It runs **twice** per pipeline: `ontology_matcher.run()` at step 5 (`:1458`) and
`replace_exact_matches()` → `find_matches` at step 6 (`:1248`). **21.7 s** to find 2 matches.
Cost is linear in graph size — **0.31 s per RDF URI** — so ~200 URIs ≈ 124 s per request.

`_similarity` also recomputes `self._local_name(t).lower()` for **both** arguments on every one of
the 301,035 calls: 602,070 redundant string splits, and the ontology side only has 8,601 distinct
values.

**Fix, part 1 — index the exact-match path.** `AgentSemRequest.similarity_threshold` defaults to
`1.0`, so the default path only ever wants exact matches. I verified empirically that
`similarity() == 1.0` happens **iff** the lowercased local names are equal — 120 score-1.0 hits
across 84,000 sampled pairs, **zero** of them from any other branch. That is structural, not
luck: the non-equal branches are capped at `0.9` (substring), `seq × 0.7 = 0.70`, and
`word × 0.8 = 0.80`, so `1.0` is unreachable. So exact matching is a dict lookup.

Build the index once, at load time, next to `ontology_terms`:

```python
# in _load_ontologies, after populating self.ontology_terms
self._by_local: Dict[str, List[Tuple[str, str, Dict]]] = {}
for onto_file, terms in self.ontology_terms.items():
    for uri, info in terms.items():
        self._by_local.setdefault(info["local_name"].lower(), []).append(
            (onto_file, uri, info)
        )
```

then short-circuit:

```python
def find_matches(self, rdf_code: str, similarity_threshold: float = 0.7) -> Dict:
    ...
    if similarity_threshold >= 1.0:
        matches = [
            self._match_dict(rdf_term, f, uri, info, 1.0)
            for rdf_term in rdf_terms
            for f, uri, info in self._by_local.get(
                self._local_name(rdf_term).lower(), ()
            )
        ]
        return self._result(rdf_terms, matches, similarity_threshold)
    # ... fuzzy path below
```

This turns 21.7 s into sub-millisecond on the default path.

**Fix, part 2 — make the fuzzy path cheap when it is used.** Precompute the lowercased local name
per ontology term (once, at load) and per RDF term (once, per call) so `_similarity` operates on
already-normalized strings. Then prefilter before touching `SequenceMatcher`, which is the
expensive part:

```python
def _candidates(self, rdf_local: str, threshold: float):
    """Only terms whose length is compatible with reaching `threshold` at all."""
    n = len(rdf_local)
    lo, hi = int(n * threshold), int(n / threshold) + 1 if threshold else (0, 1 << 30)
    for local, entries in self._by_local.items():
        if lo <= len(local) <= hi:
            yield local, entries
```

and short-circuit with `SequenceMatcher.real_quick_ratio()` / `quick_ratio()` — both are O(1)/O(n)
upper bounds on `ratio()` — before paying for the full O(n·m) comparison:

```python
sm = SequenceMatcher(None, rdf_local, onto_local)
if sm.real_quick_ratio() * 0.7 < threshold or sm.quick_ratio() * 0.7 < threshold:
    continue          # cannot possibly reach threshold
seq_sim = sm.ratio()
```

---

### <a id="b3"></a>B3 — Unbounded match list: multi-GB OOM from a valid request parameter

**Where:** `models.py:45`, `agent_sem_service.py:1077-1101`.

```python
similarity_threshold: float = Field(default=1.0, ge=0.0, le=1.0)   # 0.0 is accepted
```

`find_matches` appends a 9-key dict for **every** pair scoring `>= threshold` and then sorts the
whole list. At `similarity_threshold=0.0` every pair qualifies. Measured dict footprint ≈ 1,426
bytes:

```
 35 RDF URIs  ->    301,035 dicts  ->  0.43 GB   retained, then sorted
200 RDF URIs  ->  1,720,200 dicts  ->  2.45 GB   retained, then sorted
500 RDF URIs  ->  4,300,500 dicts  ->  6.13 GB   retained, then sorted
```

One well-formed request kills the worker. `ge=0.0` makes this reachable by an ordinary client, not
just an attacker.

**Fix.** Three independent guards, all cheap:

```python
# models.py — a threshold below ~0.5 produces noise, not signal
similarity_threshold: float = Field(default=1.0, ge=0.5, le=1.0)
```

```python
# agent_sem_service.py
MAX_MATCHES = 500

# replace  all_matches.sort(key=..., reverse=True)  with a bounded selection
import heapq
all_matches = heapq.nlargest(MAX_MATCHES, all_matches, key=lambda x: x["similarity_score"])
```

and cap the comment field that dominates each dict's size (`m["ontology_comment"]` is already
truncated to 200 chars *at render time* in `run()`, but stored in full):

```python
"ontology_comment": (onto_info["comment"] or "")[:200] or None,
```

---

### <a id="b4"></a>B4 — SSE timeout abandons the pipeline, but the thread keeps running and billing

**Where:** `routers/agent_sem.py:106-136`.

```python
task = asyncio.create_task(_run())          # _run awaits asyncio.to_thread(run_pipeline, ...)
...
event = await asyncio.wait_for(queue.get(), timeout=300)
except asyncio.TimeoutError:
    yield ...error...
    break
finally:
    task.cancel()                            # does NOT stop the worker thread
```

`task.cancel()` cancels the *awaiting coroutine*. The thread running `run_pipeline` inside
`asyncio.to_thread` has no cancellation point and **keeps executing to completion**: it keeps
issuing LLM calls (billed to the user's key), keeps running SHACL validation, keeps
`call_soon_threadsafe`-ing into a queue nobody drains (unbounded growth), and holds its threadpool
slot for minutes.

This is not a rare edge case — it is the **default** configuration:

```python
# agent_sem_service.py:385
read_timeout = float(os.getenv("OLLAMA_READ_TIMEOUT_SEC", "600"))   # 600 s
# routers/agent_sem.py:128
event = await asyncio.wait_for(queue.get(), timeout=300)            # 300 s
```

A single Ollama generation is allowed to take twice as long as the SSE reader will wait. Any slow
local model reliably orphans a pipeline. The same happens whenever the browser tab closes — no
disconnect check exists.

**Fix.** Cooperative cancellation via a `threading.Event`, checked at every step boundary:

```python
# agent_sem_service.py
def run_pipeline(user_input, model_info, max_opt, max_corr, similarity_threshold, push,
                 cancel: "threading.Event | None" = None) -> None:
    def _cancelled() -> bool:
        return cancel is not None and cancel.is_set()
    ...
    for i in range(max_opt):
        if _cancelled():
            logger.info("Pipeline cancelled by client; aborting at optimization pass %d", i)
            return
        ...
    while not conforms and correction_attempt < max_corr:
        if _cancelled():
            logger.info("Pipeline cancelled by client; aborting at correction %d", correction_attempt)
            return
        ...
```

```python
# routers/agent_sem.py
cancel = threading.Event()

async def _run() -> None:
    try:
        await asyncio.to_thread(run_pipeline, body.user_input, model_info, body.max_opt,
                                body.max_corr, body.similarity_threshold, push, cancel)
    ...

SSE_IDLE_TIMEOUT = float(os.getenv("AGENTSEM_SSE_IDLE_TIMEOUT_SEC", "660"))  # > LLM read timeout

async def event_generator():
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=SSE_IDLE_TIMEOUT)
            except asyncio.TimeoutError:
                yield "data: " + json.dumps({"type": "error", "message": "Pipeline timed out."}) + "\n\n"
                break
            yield "data: " + json.dumps(event) + "\n\n"
            if event.get("type") in ("done", "error"):
                break
    finally:
        cancel.set()        # tell the worker thread to stop at its next checkpoint
        task.cancel()
```

Also bound the queue (`asyncio.Queue(maxsize=256)`) and use a drop-oldest policy for `progress`
events — `push` currently sends the **full RDF + SHACL text** on every `step` event (`:1362`,
`:1370`, `:1443`, `:1482`), so an 8-iteration correction loop pushes ~16 full document copies
through the queue.

---

## High

### <a id="b5"></a>B5 — Pipeline runs starve the shared threadpool; the whole API stalls

**Where:** every `asyncio.to_thread` call site, all of which share one executor.

`asyncio.to_thread` uses the loop's **default** `ThreadPoolExecutor`:
`max_workers = min(32, cpu_count + 4)` — 16 on this 12-core machine, but **5** on a 1-vCPU
container, which is what a Heroku dyno or a small Fly/Render instance gives you.

Every AgentSem run occupies one of those threads for minutes (1 generation + 2×`max_opt` critique/
regen + up to `max_corr=8` correction round-trips + 8 SHACL validations + 21 s of matching). The
*same* executor also serves:

- `/api/validate` → `run_validation` (`rdf_service.py:52`)
- `/api/rdf-graph` → `build_rdf_graph` (`:140`)
- `/api/parse-rdf` → `_parse` (`validation.py:110`)
- `/api/files/{filename}` → `_read_file_sync` (`files.py:60`)
- `/api/fix-validation-errors` → `_load_shacl`, `_syntax_check`, `shacl_validate`

With `5/minute` per IP allowed on `generate-stream` and no global cap, a handful of concurrent
pipeline runs saturates the pool and every other endpoint queues behind them — while the event
loop sits idle and the health check still reports `healthy`.

**Fix.** Isolate the pipeline in its own bounded pool and cap global concurrency:

```python
# app/dependencies.py
import asyncio
from concurrent.futures import ThreadPoolExecutor

PIPELINE_MAX_CONCURRENCY = int(os.getenv("AGENTSEM_MAX_CONCURRENCY", "2"))
pipeline_executor = ThreadPoolExecutor(
    max_workers=PIPELINE_MAX_CONCURRENCY, thread_name_prefix="agentsem"
)
pipeline_slots = asyncio.Semaphore(PIPELINE_MAX_CONCURRENCY)
```

```python
# routers/agent_sem.py
if pipeline_slots.locked():
    raise HTTPException(
        status_code=503,
        detail="All pipeline workers are busy. Retry in a few minutes.",
        headers={"Retry-After": "60"},
    )

async def _run() -> None:
    async with pipeline_slots:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            pipeline_executor, run_pipeline, body.user_input, model_info,
            body.max_opt, body.max_corr, body.similarity_threshold, push, cancel,
        )
```

And size the default executor explicitly rather than inheriting a CPU-count-derived value:

```python
# in lifespan
loop = asyncio.get_running_loop()
loop.set_default_executor(ThreadPoolExecutor(max_workers=16, thread_name_prefix="io"))
```

Surface both numbers in `/api/health` so saturation is observable.

---

### <a id="b6"></a>B6 — `/parse-graph` and `/graph-html` are unguarded CPU sinks

**Where:** `routers/agent_sem.py:58-74`. `_check_input_size` (`:29`) exists but is **only** called
in `generate_stream` (`:90`).

Neither endpoint has a size guard or a rate limit. Both parse arbitrary Turtle:

- `rdf_to_graph_data` (`agent_sem_service.py:74`) — `max_nodes=150` truncation happens **after**
  the full `node_map` and `links` list are built (`:119-122`), so it bounds the *response* but not
  the work or the peak memory. A 200 KB Turtle body builds every node and link first.
- `generate_graph_html` (`:127`) — runs pyvis `Network.generate_html()` over the whole graph plus
  a networkx `DiGraph` build and a degree computation. This is the most expensive endpoint in the
  codebase and the cheapest to call.

**Fix.** Apply the guard that already exists, add limits, and bound the work during construction:

```python
@router.post("/parse-graph")
@limiter.limit("30/minute")
async def parse_graph(request: Request, body: ParseGraphRequest):
    _check_input_size(body.rdf, limit=200_000)
    ...

@router.post("/graph-html")
@limiter.limit("10/minute")
async def graph_html(request: Request, body: ParseGraphRequest):
    _check_input_size(body.rdf, limit=200_000)
    ...
```

In `rdf_to_graph_data`, stop accumulating once the cap is hit instead of truncating afterwards:

```python
MAX_LINKS = 2000
for s, p, o in g:
    if len(links) >= MAX_LINKS:
        break
    ...
```

and give `generate_graph_html` a hard node ceiling before it reaches pyvis.

---

### <a id="b7"></a>B7 — The same Turtle is re-parsed 4–6× per correction iteration

**Where:** `run_pipeline:1429-1432`, `ValidatorAgent.run:811-812`, `_extract_rdf_terms:1037`.

Per iteration of the correction loop, the identical `rdf_code` / `shacl_code` strings are parsed
into fresh `Graph` objects repeatedly:

```python
rdf_ok2, rdf_err2   = validate_turtle_syntax(rdf_code)      # parse 1  (rdf)
shacl_ok2, shacl_err2 = validate_turtle_syntax(shacl_code)  # parse 2  (shacl)
conforms, report    = agent.validator.run(rdf_code, shacl_code)
#   -> ValidatorAgent.run parses BOTH again                   parse 3, 4
```

then at steps 5–6, `ontology_matcher.run(rdf_code, ...)` → `find_matches` → `_extract_rdf_terms`
parses the RDF again, and `replace_exact_matches` → `find_matches` → `_extract_rdf_terms` parses it
**once more**. With `max_corr=8` that is ~32 redundant parses of the same content per request.

**Fix.** Parse once and pass graphs around. Have `validate_turtle_syntax` hand back the graph it
already built, and let `ValidatorAgent` accept pre-parsed graphs:

```python
def validate_turtle_syntax(turtle_text: str) -> Tuple[bool, str, "Graph | None"]:
    try:
        g = Graph().parse(data=turtle_text, format="turtle")
        return True, "Valid syntax", g
    except Exception as exc:
        return False, str(exc), None


class ValidatorAgent:
    def run_graphs(self, rdf_graph: Graph, shacl_graph: Graph) -> Tuple[bool, str]:
        try:
            conforms, _, report = _shacl_validate(data_graph=rdf_graph, shacl_graph=shacl_graph)
            return bool(conforms), str(report)
        except Exception as exc:
            return False, f"Validation Error: {exc}"
```

`find_matches` should likewise accept an optional pre-parsed graph so steps 5 and 6 share one
parse. Note `pyshacl.validate` may mutate the data graph when `inference` is enabled — pass a copy
if you reuse a graph across a validate call (see [B13](#b13)).

---

## Medium

### <a id="b8"></a>B8 — No timeout on OpenAI/Anthropic calls in `call_llm`

**Where:** `agent_sem_service.py:357-380`.

The Ollama branch sets explicit connect/read timeouts (`:384-386`), but the OpenAI and Anthropic
branches construct bare clients and inherit SDK defaults (**600 s** for the OpenAI SDK, with
retries on top):

```python
client = OpenAI(api_key=model_info["api_key"])          # no timeout, no max_retries
client = Anthropic(api_key=model_info["api_key"])       # no timeout, no max_retries
```

With `max_corr=8` plus `max_opt` critique/regeneration rounds, worst-case a single request pins a
threadpool thread for well over an hour. `dependencies.py:41` already does this correctly for the
non-AgentSem endpoints (`httpx.Timeout(90.0, connect=10.0)`, `max_retries=2`) — the pipeline just
doesn't follow suit.

**Fix.** Pass explicit timeouts, and add a wall-clock budget for the whole pipeline:

```python
LLM_TIMEOUT = httpx.Timeout(float(os.getenv("LLM_READ_TIMEOUT_SEC", "180")), connect=10.0)

client = OpenAI(api_key=..., timeout=LLM_TIMEOUT, max_retries=1)
client = Anthropic(api_key=..., timeout=LLM_TIMEOUT, max_retries=1)
```

```python
# run_pipeline
PIPELINE_BUDGET_SEC = float(os.getenv("AGENTSEM_BUDGET_SEC", "900"))
deadline = time.monotonic() + PIPELINE_BUDGET_SEC
# then at each loop checkpoint:
if time.monotonic() > deadline:
    push({"type": "error", "message": "Pipeline exceeded its time budget."})
    return
```

---

### <a id="b9"></a>B9 — A new LLM client and TLS pool per call

**Where:** `agent_sem_service.py:358-359`, `371-372`.

```python
if provider == "OpenAI":
    from openai import OpenAI          # import on every call
    client = OpenAI(api_key=...)       # new httpx client + new TLS pool, then discarded
```

`call_llm` is invoked roughly `1 + 2×max_opt + max_corr + 1` times per pipeline — up to ~20 with
the defaults. Each call builds and throws away a connection pool, so every LLM round-trip pays a
fresh TCP + TLS handshake.

This one can't be a single global like `dependencies.py`'s client, because the key is
user-supplied per request. Use a small bounded cache keyed by credentials:

```python
from functools import lru_cache

@lru_cache(maxsize=32)
def _openai_client_for(api_key: str):
    from openai import OpenAI
    return OpenAI(api_key=api_key, timeout=LLM_TIMEOUT, max_retries=1)
```

Move the `import` statements to module top-level while you're there — `anthropic` and `openai` are
both hard dependencies in `requirements.txt`, so the lazy import buys nothing.

Note the cache holds API keys in memory keyed by value; cap `maxsize` and don't log the key
(see [B17](#b17)).

---

### <a id="b10"></a>B10 — `requests` with no `Session`; redundant key validation per run

**Where:** `agent_sem_service.py:398`, `:407`, `:604`, `:608`; `run_pipeline:1347`.

Every Ollama call is a bare `requests.post`, so there is no connection reuse across the ~20 calls
in a pipeline — a new TCP handshake each time, and for HTTPS endpoints a new TLS handshake too.

Separately, `run_pipeline` calls `validate_api_key` at the top of **every** run (`:1347`), which
issues an extra `models.list()` (OpenAI/Anthropic) or `GET /api/tags` (Ollama) round-trip. The
frontend already has a dedicated `/validate-key` endpoint (`routers/agent_sem.py:48`), so a normal
flow validates the same key twice.

**Fix.**

```python
_session = requests.Session()
_session.mount("http://",  requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=8))
_session.mount("https://", requests.adapters.HTTPAdapter(pool_connections=4, pool_maxsize=8))
```

and give validation a short TTL cache so a run started right after `/validate-key` skips the
duplicate probe:

```python
_key_cache: Dict[Tuple[str, str, str], Tuple[float, bool, str]] = {}
_KEY_TTL = 300.0

def validate_api_key(provider, api_key, endpoint="", *, use_cache=True):
    k = (provider, api_key, endpoint)
    if use_cache and k in _key_cache:
        ts, ok, msg = _key_cache[k]
        if time.monotonic() - ts < _KEY_TTL:
            return ok, msg
    ...
```

---

### <a id="b11"></a>B11 — `_extract_terms` iterates subjects with duplicates and rebuilds `URIRef`s

**Where:** `agent_sem_service.py:988` and `:996-1012`.

```python
for subj in graph.subjects():        # yields one entry PER TRIPLE, not per distinct subject
    ...
    if self._is_individual(graph, subj):
```

For `emmo.ttl` that is 33,678 iterations where the distinct-subject count is far lower, and each
one calls `_is_individual`, which **rebuilds** the `rdf_type` `URIRef` and the entire 5-element
`skip_types` set from scratch, then does 5 `in graph` membership tests.

Measured cost is 0.13 s for emmo — small in absolute terms, and after [B1](#b1) it is paid once per
process rather than once per request. Worth fixing because it's free:

```python
_RDF_TYPE = URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
_SKIP_TYPES = frozenset({
    URIRef("http://www.w3.org/2002/07/owl#Class"),
    URIRef("http://www.w3.org/2000/01/rdf-schema#Class"),
    URIRef("http://www.w3.org/2002/07/owl#ObjectProperty"),
    URIRef("http://www.w3.org/2002/07/owl#DatatypeProperty"),
    URIRef("http://www.w3.org/1999/02/22-rdf-syntax-ns#Property"),
})

for subj in set(graph.subjects()):          # dedupe
    ...
```

and in `_is_individual`, test the declared types in one pass instead of five graph probes:

```python
types = set(graph.objects(subj, _RDF_TYPE))
if not types or types & _SKIP_TYPES:
    return False
return True
```

---

### <a id="b12"></a>B12 — `report_details` serializes the entire SHACL results graph

**Where:** `services/rdf_service.py:41-44`.

```python
report_details = [
    {"subject": str(s), "predicate": str(p), "object": str(o)}
    for s, p, o in sorted(results_graph)      # sorts and materializes EVERYTHING
]
```

A SHACL report emits roughly 8–10 triples per violation. A graph with a few thousand violations
produces tens of thousands of dicts, all sorted, all JSON-serialized into the response body, and
all held in memory at once. `MAX_RDF_CHARS` bounds the *input* but nothing bounds this output.

**Fix.** Cap it and tell the client:

```python
MAX_REPORT_DETAILS = 2000

all_triples = sorted(results_graph)
report_details = [
    {"subject": str(s), "predicate": str(p), "object": str(o)}
    for s, p, o in all_triples[:MAX_REPORT_DETAILS]
]
truncated = len(all_triples) > MAX_REPORT_DETAILS
```

and return `truncated` / `total_detail_triples` alongside it from `validate_rdf`
(`routers/validation.py:52-57`).

---

## Low

### <a id="b13"></a>B13 — `inference="rdfs"` on every validation

**Where:** `rdf_service.py:31`, `:69`; `ValidatorAgent.run:813` (which uses pyshacl's default,
i.e. no inference — so the two paths already disagree, see [B15](#b15)).

`inference="rdfs"` runs a full RDFS closure via owlrl before validating. Measured on
`rdfGraph_smallExample.ttl`:

```
inference=rdfs   validate: 0.020 s
inference=none   validate: 0.001 s
```

20× relative, but only **19 ms** in absolute terms on a small graph — so this is genuinely low
priority, not a hidden headline cost. It does scale with graph size, and it runs on every AI-fix
retry (`_shacl_validate_sync`, up to 3×) and every correction attempt, so it's worth making
configurable rather than hardcoded:

```python
SHACL_INFERENCE = os.getenv("SHACL_INFERENCE", "rdfs")   # "none" to disable
```

Only drop to `none` if your shapes don't target inferred types (`sh:targetClass` against a
superclass, for instance, needs the closure). Also note that with inference enabled pyshacl
mutates the data graph in place — relevant if you adopt [B7](#b7)'s graph reuse.

---

### <a id="b14"></a>B14 — `basic_syntax_cleanup`: 42 full-document scans per iteration

**Where:** `agent_sem_service.py:458-509`.

`_SYNTAX_FIXES` holds 42 patterns, each applied via `re.sub(..., flags=re.MULTILINE)` to both the
RDF and the SHACL document, on every correction attempt — ~84 full-document scans per iteration,
~672 per 8-iteration request.

**I measured the obvious fix and it doesn't work.** Precompiling the patterns is not the win:

```
uncompiled (current)      8.8 ms/doc   ->  2 docs x 8 corrections =  140 ms/request
precompiled               8.6 ms/doc   ->  2 docs x 8 corrections =  137 ms/request
```

Python's internal `re` cache already handles compilation, so the 42 scans themselves are the cost,
and 140 ms/request is not worth restructuring for. Precompile anyway for tidiness if you like, but
don't expect a speedup. Flagging it mainly so nobody spends a day on it expecting one.

The *correctness* risk here is larger than the performance one: several patterns are aggressive
(`r'"(\d+)"(?!\^\^)' -> r'\1'` strips quotes from any bare numeric literal, `r'\.\.+' -> '.'`
collapses `..` anywhere including inside URIs and string literals). That's outside this audit's
scope but worth a separate look.

---

### <a id="b15"></a>B15 — Two divergent SHACL validation code paths

`services/rdf_service.py` validates with `inference="rdfs", abort_on_first=False, debug=False`,
while `ValidatorAgent.run` (`agent_sem_service.py:813`) calls
`_shacl_validate(data_graph=..., shacl_graph=...)` with **all defaults** — no inference. The same
RDF + SHACL pair can therefore conform on one path and fail on the other. Consolidate onto one
helper in `rdf_service.py` and have `ValidatorAgent` call it.

---

### <a id="b16"></a>B16 — `count_errors` fallback counts the word "result"

**Where:** `services/ai_service.py:4-9`.

```python
count = report_text.lower().count("constraint violation")
if count == 0:
    count = report_text.lower().count("result")
```

A pyshacl report emits `Result Path:`, `Result Severity:`, and `Result Message:` per violation, so
the fallback overcounts by roughly 3–4×. That number is injected into the prompt as
`**Estimated number of constraint violations: {error_count}**` (`ai_service.py:21`) and returned to
the client as `original_error_count`, so the model is told to fix ~3× more errors than exist.

```python
count = report_text.lower().count("constraint violation")
if count == 0:
    count = report_text.count("Result Path:")
```

---

### <a id="b17"></a>B17 — API keys can leak into SSE error events and logs

**Where:** `run_pipeline:1349`, `:1491`; `routers/agent_sem.py:118`.

```python
push({"type": "error", "message": f"API key validation failed: {key_msg}"})
push({"type": "error", "message": str(exc)})                       # :1491
push({"type": "error", "message": str(exc)})                       # router :118
```

`key_msg` and `str(exc)` are raw provider exception text, forwarded verbatim to the client and
written to logs by `logger.exception`. Provider SDK errors sometimes echo request context, and the
Ollama branch interpolates the full endpoint URL into its error messages (`:422`, `:428`) — which
may itself contain credentials in a tunnel URL. Redact the submitted key before emitting:

```python
def _redact(msg: str, secret: str) -> str:
    return msg.replace(secret, "***") if secret and len(secret) > 8 else msg
```

Note the rest of the codebase already gets this right — `routers/ai.py` and `routers/files.py`
consistently `logger.exception(...)` and return a generic `"Internal server error"`. Only the
AgentSem path forwards raw text.

---

### <a id="b18"></a>B18 — Rate limiter and logger disagree about the client IP

**Where:** `dependencies.py:16`, `middleware.py:17-20`.

`slowapi`'s `get_remote_address` uses `request.client.host` (the socket peer), while the logging
middleware trusts the raw `x-forwarded-for` header. Behind a proxy — which is the deployed
topology — the limiter keys **every** request to the proxy's IP, collapsing all users into one
shared bucket, so `5/minute` becomes a global cap. Without a proxy, the logged XFF is
client-spoofable.

**Fix.** Run uvicorn with proxy headers enabled so `request.client.host` is the real client, and
derive both values from the same trusted source:

```
web: uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips="*"
```

Set `--forwarded-allow-ips` to your actual proxy IPs rather than `*` where you know them; `*` is
only safe when nothing but the platform router can reach the port. Then simplify the middleware to
use `request.client.host` and drop the manual header read.

---

### <a id="b19"></a>B19 — `requirements.txt` drift; a venv is committed at repo root

`requirements.txt` pins versions that don't match what's actually installed in the repo-root
environment I profiled against:

| Package | Pinned | Installed at root |
|---|---|---|
| `rdflib` | `7.0.0` | `7.5.0` |
| `pyshacl` | `0.25.0` | `0.30.1` |
| `fastapi` | `0.109.0` | `0.124.4` |
| `pydantic` | `2.6.0` | `2.12.5` |

Also `Lib/`, `Scripts/`, `pyvenv.cfg`, `__pycache__/` and `.venv/` all sit in the repo root, i.e.
two virtualenvs are in version control. This matters for this audit specifically: rdflib and
pyshacl parse/validate performance changed measurably between those versions, so profiling numbers
aren't reproducible against the pinned set. Add them to `.gitignore`, remove from the index, and
reconcile the pins.

---

### <a id="b20"></a>B20 — Single uvicorn worker, no explicit executor sizing

`Procfile` runs one process:

```
web: uvicorn main:app --host 0.0.0.0 --port $PORT
```

One event loop and one default threadpool absorb all traffic, which is what makes [B5](#b5) bite.
Adding `--workers N` helps CPU parallelism, but interacts with [B1](#b1): once the ontology cache
is a per-process module global, **each worker pays its own 64.4 MB**. Budget accordingly
(`N × 64 MB` plus per-request working set) and prefer scaling `AGENTSEM_MAX_CONCURRENCY` within one
worker over adding workers, until memory headroom is confirmed.

---

## Suggested order of work

1. **B1** — ontology singleton + startup warm-up. Removes 2.61 s and 64 MB per request. ~20 lines.
2. **B2** — exact-match index. Removes ~21.7 s per request on the default path. ~25 lines.
3. **B3** — clamp `similarity_threshold`, bound the match list. Closes the OOM. ~5 lines.
4. **B4** — cooperative cancellation + align the SSE and LLM timeouts. Stops orphaned billing.
5. **B5** — dedicated pipeline executor + concurrency cap + 503. Keeps the rest of the API alive.
6. **B6** — apply the existing size guard and add rate limits to the two graph endpoints. ~6 lines.
7. **B7**, **B8**, **B12** — parse-once refactor, LLM timeouts, bounded report details.
8. Everything else as cleanup.

Steps 1–3 are about 50 lines total and take the measured overhead from ~24.3 s to near zero.

---

## What I checked and found healthy

- No blocking I/O left on the event loop in the validation, AI-fix, or file routers — all use
  `asyncio.to_thread`.
- `AsyncOpenAI` streaming uses `async for`, so the SSE fix endpoint doesn't block the loop.
- The OpenAI client in `dependencies.py` is a correctly-cached singleton with explicit timeouts.
- `HTTPException` is re-raised before generic handlers everywhere it matters; `parse_rdf` hoists
  its size/MIME checks above the `try` entirely, which is cleaner than the re-raise pattern.
- File serving is allowlist-first with a resolved-path second check, and `list_files` filters to
  the allowlist.
- Size guards and per-IP rate limits exist on all AI endpoints.
- `debug=False` in both pyshacl call sites; `RdfGraphRequest` no longer demands unused fields.
