"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ─── model options ───────────────────────────────────────────────────────────
const MODEL_OPTIONS: Record<string, string[]> = {
  OpenAI: ["gpt-5.4-mini-2026-03-17" , "gpt-4.1", "gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
  Anthropic: [
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
    "claude-3-5-haiku-latest",
    "claude-opus-4-20250514",
  ],
  Ollama: [
    "llama3.3:70b-instruct-q8_0",
    "qwen3:32b-q8_0",
    "phi4-reasoning:14b-plus-fp16",
    "mistral-small3.1:24b-instruct-2503-q8_0",
  ],
};

// ─── step → phase completion map ────────────────────────────────────────────
const STEP_TO_PHASE: Record<string, string> = {
  ontologies_loaded:    "loading_ontologies",
  initial_generation:   "generating",
  optimization:         "generating",
  validation:           "validating",
  correction:           "correcting",
  correction_aborted:   "correcting",
  ontology_mapping:     "ontology_mapping",
  ontology_matching:    "ontology_matching",
  ontology_replacement: "ontology_replacement",
};

// ─── pipeline stages ───────────────────────────────────────────────────────────
const PIPELINE_STAGES = [
  { id: "loading_ontologies",   label: "Load Ontologies",          icon: "📚", desc: "Parse ontology files from disk" },
  { id: "generating",           label: "Generate RDF & SHACL",    icon: "⚡", desc: "LLM generates initial Turtle graphs" },
  { id: "optimizing",           label: "Optimization Passes",      icon: "🔄", desc: "Critique and refine the output" },
  { id: "validating",           label: "SHACL Validation",         icon: "🛡️", desc: "Validate RDF data against shapes" },
  { id: "correcting",           label: "Error Correction",         icon: "🔧", desc: "Fix validation failures with LLM" },
  { id: "ontology_mapping",     label: "Ontology Mapping",         icon: "🗺️", desc: "Suggest ontology term mappings" },
  { id: "ontology_matching",    label: "Ontology Matching",        icon: "🎯", desc: "Find matching terms in ontologies" },
  { id: "ontology_replacement", label: "Ontology Replacement",     icon: "🔗", desc: "Replace terms with canonical URIs" },
  { id: "done",                 label: "Pipeline Complete",        icon: "✅", desc: "All steps finished" },
];

// ─── types ───────────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "validating_key"
  | "running"
  | "done"
  | "error";

interface ProgressEntry {
  type: string;
  message: string;
  ts: Date;
}

interface StepEvent {
  step: string;
  [key: string]: unknown;
}

interface FinalResult {
  rdf: string;
  shacl: string;
  conforms: boolean;
  report: string;
  replacement_count: number;
}

interface GraphNode {
  id: string;
  label: string;
  group: string;
  color: string;
  x?: number;
  y?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function downloadText(text: string, filename: string, mime = "text/turtle") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── sub-components ──────────────────────────────────────────────────────────
function TurtleCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  if (!code) return null;
  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="absolute top-2 right-2 z-10 text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
      <SyntaxHighlighter
        language="turtle"
        style={vscDarkPlus}
        customStyle={{ borderRadius: "0.5rem", fontSize: "0.8rem", margin: 0 }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-white/10 rounded-xl overflow-hidden mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex justify-between items-center px-4 py-3 bg-dark-700 hover:bg-dark-600 text-left font-semibold text-sm text-white"
      >
        <span>{title}</span>
        <span className="text-gray-300">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-4">{children}</div>}
    </div>
  );
}

// ─── PipelineStepper ────────────────────────────────────────────────────────
function PipelineStepper({
  activePhase,
  phaseMessage,
  isRunning,
  hasError,
}: {
  activePhase: string;
  phaseMessage: string;
  isRunning: boolean;
  hasError: boolean;
}) {
  const activeIndex = PIPELINE_STAGES.findIndex((s) => s.id === activePhase);

  return (
    <div className="bg-dark-800/90 backdrop-blur-sm rounded-2xl shadow-medium p-5">
      <h3 className="font-semibold text-sm mb-4 text-primary-300">🚀 Pipeline Progress</h3>
      <div className="space-y-0">
        {PIPELINE_STAGES.map((stage, idx) => {
          const isDone = activeIndex > idx || (!isRunning && !hasError && activePhase === "done");
          const isActive = activeIndex === idx && isRunning;
          const isErrored = hasError && isActive;
          const isPending = !isDone && !isActive && !isErrored;
          return (
            <div key={stage.id} className="flex items-start gap-3">
              {/* icon + connector */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all duration-500
                  ${isErrored  ? "bg-red-500/20 border border-red-500/50 text-red-400" :
                    isDone     ? "bg-green-500/20 border border-green-500/50 text-green-400" :
                    isActive   ? "bg-primary-500/20 border border-primary-500/60 text-primary-300 ring-2 ring-primary-500/30" :
                                 "bg-dark-700 border border-white/10 text-gray-600"}`}>
                  {isDone ? (
                    <span className="text-green-400 font-bold">✓</span>
                  ) : isActive ? (
                    <svg className="animate-spin h-4 w-4 text-primary-400" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                  ) : isErrored ? "✕" : (
                    <span className="text-xs">{stage.icon}</span>
                  )}
                </div>
                {idx < PIPELINE_STAGES.length - 1 && (
                  <div className={`w-0.5 h-5 transition-all duration-700 ${
                    isDone ? "bg-green-500/40" : isActive ? "bg-primary-500/30" : "bg-white/8"
                  }`} />
                )}
              </div>
              {/* text */}
              <div className="pt-1 pb-4 min-w-0 flex-1">
                <p className={`text-sm font-medium leading-tight transition-colors duration-300
                  ${isErrored  ? "text-red-300" :
                    isDone     ? "text-green-300" :
                    isActive   ? "text-white" :
                                 "text-gray-500"}`}>
                  {stage.label}
                </p>
                {isActive && !isErrored && (
                  <p className="text-xs text-primary-300 mt-0.5 animate-pulse truncate max-w-xs">{phaseMessage}</p>
                )}
                {isPending && (
                  <p className="text-xs text-gray-600 mt-0.5">{stage.desc}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RDFGraphView ──────────────────────────────────────────────────────────
const LEGEND = [
  { color: "#0ea5e9", label: "Data nodes (ex:)" },
  { color: "#10b981", label: "Domain ontology (matwerk, obo…)" },
  { color: "#f97316", label: "Units / QUDT" },
  { color: "#06b6d4", label: "Provenance / time" },
  { color: "#f59e0b", label: "Literals" },
  { color: "#8b5cf6", label: "Blank nodes" },
  { color: "#475569", label: "Schema (rdf, owl, sh…)" },
  { color: "#38bdf8", label: "Other" },
];

function RDFGraphView({ graph }: { graph: { nodes: GraphNode[]; links: GraphLink[] } }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 520 });
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.clientWidth, h: Math.max(420, Math.min(620, el.clientWidth * 0.6)) });
    });
    ro.observe(el);
    setDims({ w: el.clientWidth, h: Math.max(420, Math.min(620, el.clientWidth * 0.6)) });
    return () => ro.disconnect();
  }, []);

  if (!graph?.nodes?.length) {
    return <p className="text-gray-400 text-sm">No graph data available.</p>;
  }

  return (
    <div className="space-y-3">
      {/* stats */}
      <div className="flex gap-4 text-xs text-gray-300">
        <span className="bg-dark-700 px-3 py-1 rounded-full">⚪ {graph.nodes.length} nodes</span>
        <span className="bg-dark-700 px-3 py-1 rounded-full">➡️ {graph.links.length} edges</span>
      </div>

      {/* graph canvas */}
      <div ref={containerRef} className="w-full rounded-xl overflow-hidden bg-dark-900 border border-white/10">
        <ForceGraph2D
          width={dims.w}
          height={dims.h}
          graphData={graph}
          backgroundColor="#0f172a"
          nodeRelSize={5}
          nodeColor={(n) => (n as GraphNode).color}
          nodeLabel={(n) => `${(n as GraphNode).label}\n${(n as GraphNode).id}`}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode & { x: number; y: number };
            const r = Math.max(3, 5 - (globalScale > 4 ? 1 : 0));
            // glow
            ctx.shadowBlur = 8;
            ctx.shadowColor = n.color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = n.color;
            ctx.fill();
            ctx.shadowBlur = 0;
            // border
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.lineWidth = 0.5;
            ctx.stroke();
            // label (only when zoomed enough)
            if (globalScale > 1.5) {
              const fontSize = Math.min(5, 11 / globalScale);
              ctx.font = `${fontSize}px Inter, sans-serif`;
              ctx.fillStyle = "rgba(255,255,255,0.9)";
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillText(n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label, n.x, n.y + r + 1);
            }
          }}
          nodeCanvasObjectMode={() => "replace"}
          linkColor={() => "rgba(148,163,184,0.35)"}
          linkWidth={1}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={1}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.5}
          linkLabel={(l) => (l as GraphLink).label}
          onLinkHover={(l) => setHoveredLink(l ? (l as GraphLink).label : null)}
          cooldownTicks={120}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
        />
      </div>

      {hoveredLink && (
        <div className="text-xs bg-dark-700 px-3 py-1.5 rounded-lg text-primary-300 inline-block">
          predicate: <span className="text-white font-mono">{hoveredLink}</span>
        </div>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
        {LEGEND.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-300">
            <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────
export default function AgentSemPage() {
  // config
  const [provider, setProvider] = useState("OpenAI");
  const [model, setModel] = useState("gpt-4.1");
  const [temperature, setTemperature] = useState(0.2);
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [maxOpt, setMaxOpt] = useState(1);
  const [maxCorr, setMaxCorr] = useState(8);
  const [similarityThreshold, setSimilarityThreshold] = useState(1.0);

  // input
  const [inputText, setInputText] = useState("");
  const [useExample, setUseExample] = useState(false);
  const [exampleLoading, setExampleLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // pipeline state
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [progressLog, setProgressLog] = useState<ProgressEntry[]>([]);
  const progressEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // accumulated step data
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [graphHtml, setGraphHtml] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState("");

  // active results tab
  const [activeTab, setActiveTab] = useState<"process" | "validation" | "ontology" | "graph" | "final">("process");

  // pipeline stepper state
  const [activePhase, setActivePhase] = useState<string>("");
  const [phaseMessage, setPhaseMessage] = useState<string>("");

  // ── sync model when provider changes ──────────────────────────────────────
  useEffect(() => {
    setModel(MODEL_OPTIONS[provider]?.[0] ?? "");
  }, [provider]);

  // ── auto-scroll progress log ───────────────────────────────────────────────
  useEffect(() => {
    progressEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progressLog]);
  // ── fetch graph HTML when final RDF arrives ───────────────────────────
  useEffect(() => {
    if (!finalResult?.rdf) return;
    setGraphLoading(true);
    setGraphError("");
    fetch(`${API_URL}/api/agent-sem/graph-html`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rdf: finalResult.rdf }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Server returned ${r.status} — restart the backend and try again.`);
        return r.text();
      })
      .then((html) => {
        setGraphHtml(html);
        setGraphLoading(false);
        setActiveTab("graph");
      })
      .catch((err) => {
        setGraphError(err?.message ?? "Failed to load graph");
        setGraphLoading(false);
      });
  }, [finalResult?.rdf]);
  // ── load example ──────────────────────────────────────────────────────────
  const loadExample = useCallback(async () => {
    setExampleLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/agent-sem/example`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setInputText(data.content);
    } catch {
      setInputText("(Could not load example file from backend.)");
    } finally {
      setExampleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useExample) loadExample();
    else setInputText("");
  }, [useExample, loadExample]);

  // ── file upload ───────────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setInputText((ev.target?.result as string) ?? "");
    reader.readAsText(file);
    setUseExample(false);
  };

  // ── run pipeline ──────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (!inputText.trim()) {
      alert("Please provide input data.");
      return;
    }
    if ((provider === "OpenAI" || provider === "Anthropic") && !apiKey.trim()) {
      alert(`Please enter your ${provider} API key.`);
      return;
    }

    setPhase("running");
    setErrorMsg("");
    setProgressLog([]);
    setSteps([]);
    setFinalResult(null);
    setGraphHtml(null);
    setGraphError("");
    setActiveTab("process");
    setActivePhase("");
    setPhaseMessage("");

    const addLog = (type: string, message: string) =>
      setProgressLog((prev) => [...prev, { type, message, ts: new Date() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_URL}/api/agent-sem/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          user_input: inputText,
          provider,
          model,
          temperature,
          api_key: apiKey,
          endpoint,
          max_opt: maxOpt,
          max_corr: maxCorr,
          similarity_threshold: similarityThreshold,
        }),
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let prevPhase = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "progress") {
              addLog("progress", event.message ?? "");
              const newPhase = (event.phase as string) || "";
              if (newPhase && newPhase !== prevPhase) {
                setPhaseMessage(event.message ?? "");
                setActivePhase(newPhase);
                prevPhase = newPhase;
              } else if (newPhase) {
                setPhaseMessage(event.message ?? "");
              }
            } else if (event.type === "step") {
              setSteps((prev) => [...prev, event as StepEvent]);
              addLog("step", `✓ ${event.step}`);
              if (event.step === "validation") {
                setActiveTab("validation");
              }
            } else if (event.type === "final") {
              setFinalResult(event as FinalResult);
              addLog("done", event.conforms ? "✅ Validation PASSED" : "⚠️ Validation FAILED");
              setPhase("done");
              setActivePhase("done");
            } else if (event.type === "error") {
              setErrorMsg(event.message ?? "Unknown error");
              setPhase("error");
              addLog("error", event.message ?? "");
            } else if (event.type === "done") {
              if (phase !== "done") setPhase("done");
            }
          } catch {
            /* ignore malformed JSON */
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") {
        addLog("info", "Pipeline aborted by user.");
        setPhase("idle");
      } else {
        const msg = err instanceof Error ? err.message : "Request failed";
        setErrorMsg(msg);
        setPhase("error");
      }
    }
  };

  const handleAbort = () => {
    abortRef.current?.abort();
  };

  // ── derived step collections ───────────────────────────────────────────────
  const optimizationSteps = steps.filter((s) => s.step === "optimization");
  const correctionSteps = steps.filter((s) => s.step === "correction");
  const ontologyMappingStep = steps.find((s) => s.step === "ontology_mapping");
  const ontologyMatchStep = steps.find((s) => s.step === "ontology_matching");
  const ontologyReplaceStep = steps.find((s) => s.step === "ontology_replacement");
  const initialGenStep = steps.find((s) => s.step === "initial_generation");
  const validationStep = steps.find((s) => s.step === "validation");

  const isRunning = phase === "running" || phase === "validating_key";

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      <h2 className="section-title mb-2">🧠 AgentSem: Agent-Based Semantic Data Generator</h2>
      <p className="text-gray-400 mb-3 text-sm">
        Transforms raw experimental input (e.g. creep test data) into validated RDF + SHACL using an
        AI agent pipeline with ontology matching.
      </p>
      <p className="text-sm mb-6">
        <a
          href="https://github.com/teman67/AgentSem"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xl font-semibold text-primary-400 hover:text-primary-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path fillRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.744 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" clipRule="evenodd" />
          </svg>
          Learn more about AgentSem on GitHub →
        </a>
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* ── left: config ────────────────────────────────────────────── */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-dark-800/90 backdrop-blur-sm rounded-2xl shadow-medium transition-all duration-500 p-4">
            <h3 className="font-semibold text-sm mb-3 text-primary-300">🔐 LLM Configuration</h3>

            <label className="block text-xs text-gray-300 mb-1">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              disabled={isRunning}
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white"
            >
              {Object.keys(MODEL_OPTIONS).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <label className="block text-xs text-gray-300 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={isRunning}
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white"
            >
              {MODEL_OPTIONS[provider]?.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>

            {provider !== "Ollama" ? (
              <>
                <label className="block text-xs text-gray-300 mb-1">API Key</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={isRunning}
                  placeholder="sk-..."
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white placeholder:text-white/50"
                />
              </>
            ) : (
              <>
                <label className="block text-xs text-gray-300 mb-1">Ollama Endpoint</label>
                <input
                  type="text"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white"
                />
              </>
            )}

            <label className="block text-xs text-gray-300 mb-1">
              Temperature: <span className="text-white">{temperature.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min="0" max="1" step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              disabled={isRunning}
              className="w-full mb-3"
            />

            <h3 className="font-semibold text-sm mb-3 text-primary-300 mt-2">⚙️ Pipeline Settings</h3>

            <label className="block text-xs text-gray-300 mb-1">Optimization passes</label>
            <input
              type="number"
              min="0" max="10"
              value={maxOpt}
              onChange={(e) => setMaxOpt(parseInt(e.target.value))}
              disabled={isRunning}
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white"
            />

            <label className="block text-xs text-gray-300 mb-1">Correction passes</label>
            <input
              type="number"
              min="0" max="10"
              value={maxCorr}
              onChange={(e) => setMaxCorr(parseInt(e.target.value))}
              disabled={isRunning}
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3 text-white"
            />

            <label className="block text-xs text-gray-300 mb-1">
              Ontology similarity: <span className="text-white">{similarityThreshold.toFixed(1)}</span>
            </label>
            <input
              type="range"
              min="0" max="1" step="0.1"
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
              disabled={isRunning}
              className="w-full"
            />
          </div>
        </aside>

        {/* ── right: main ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">

          {/* Input */}
          <div className="bg-dark-800/90 backdrop-blur-sm rounded-2xl shadow-medium transition-all duration-500 p-4">
            <h3 className="font-semibold text-sm mb-3 text-primary-300">🔬 Input Test Data</h3>
            <div className="flex flex-wrap gap-3 mb-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isRunning}
                className="btn-secondary text-sm"
              >
                📎 Upload file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,.json,.lis"
                className="hidden"
                onChange={handleFileUpload}
              />
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useExample}
                  onChange={(e) => setUseExample(e.target.checked)}
                  disabled={isRunning || exampleLoading}
                  className="accent-primary-500"
                />
                Use example (BAM creep test)
                {exampleLoading && (
                  <svg
                    className="animate-spin h-4 w-4 text-primary-400"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                )}
              </label>
            </div>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              rows={8}
              disabled={isRunning}
              placeholder="Paste or upload mechanical test data here..."
              className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary-500 text-white placeholder:text-white/50"
            />
          </div>

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleGenerate}
              disabled={isRunning}
              className={`btn-primary flex-1 ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isRunning ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Running pipeline...
                </span>
              ) : "⚡ Generate RDF & SHACL"}
            </button>
            {isRunning && (
              <button onClick={handleAbort} className="btn-secondary">
                ✕ Abort
              </button>
            )}
          </div>

          {/* Error banner */}
          {phase === "error" && (
            <div className="bg-red-900/40 border border-red-500/40 rounded-xl p-4 text-sm text-red-200">
              <strong>Error:</strong> {errorMsg}
            </div>
          )}

          {/* Pipeline Stepper */}
          {(isRunning || phase === "done" || phase === "error") && (
            <PipelineStepper
              activePhase={activePhase}
              phaseMessage={phaseMessage}
              isRunning={isRunning}
              hasError={phase === "error"}
            />
          )}

          {/* Collapsible raw log */}
          {progressLog.length > 0 && (
            <CollapsibleSection title="📋 Detailed Log" defaultOpen={false}>
              <div className="bg-dark-900 rounded-lg p-3 max-h-48 overflow-y-auto text-xs font-mono space-y-1">
                {progressLog.map((entry, i) => (
                  <div key={i} className={
                    entry.type === "error" ? "text-red-300" :
                    entry.type === "done" ? "text-green-300" :
                    entry.type === "step" ? "text-blue-200" :
                    "text-gray-100"
                  }>
                    <span className="text-gray-400">[{entry.ts.toLocaleTimeString()}]</span>{" "}
                    {entry.message}
                  </div>
                ))}
                <div ref={progressEndRef} />
              </div>
            </CollapsibleSection>
          )}

          {/* Results (shown after run) */}
          {(steps.length > 0 || finalResult) && (
            <div className="bg-dark-800/90 backdrop-blur-sm rounded-2xl shadow-medium transition-all duration-500 overflow-hidden">
              {/* Tab bar */}
              <div className="flex border-b border-white/10 overflow-x-auto">
                {(["process", "validation", "ontology", "graph", "final"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-shrink-0 px-3 py-3 text-xs sm:text-sm font-semibold transition-colors ${
                      activeTab === tab
                        ? "bg-white/10 text-white border-b-2 border-primary-500"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {tab === "process" && "🛠 Generation"}
                    {tab === "validation" && "🔍 Validation"}
                    {tab === "ontology" && "🎯 Ontology"}
                    {tab === "graph" && "🕸️ RDF Graph"}
                    {tab === "final" && "✓ Final Results"}
                  </button>
                ))}
              </div>

              <div className="p-4">
                {/* Process tab */}
                {activeTab === "process" && (
                  <div className="space-y-4">
                    {initialGenStep && (
                      <CollapsibleSection title="📄 Initial Generation">
                          <p className="text-xs text-gray-200 mb-2">RDF</p>
                        <TurtleCode code={initialGenStep.rdf as string} />
                        <p className="text-xs text-gray-200 mb-2 mt-3">SHACL</p>
                        <TurtleCode code={initialGenStep.shacl as string} />
                      </CollapsibleSection>
                    )}
                    {optimizationSteps.map((s, i) => (
                      <CollapsibleSection key={i} title={`🔄 Optimization Pass ${s.pass as number}`}>
                        <p className="text-xs text-gray-200 mb-2">RDF</p>
                        <TurtleCode code={s.rdf as string} />
                        <p className="text-xs text-gray-200 mb-2 mt-3">SHACL</p>
                        <TurtleCode code={s.shacl as string} />
                      </CollapsibleSection>
                    ))}
                    {steps.length === 0 && <p className="text-gray-400 text-sm">No generation steps yet.</p>}
                  </div>
                )}

                {/* Validation tab */}
                {activeTab === "validation" && (
                  <div className="space-y-4">
                    {validationStep && correctionSteps.length === 0 && (
                      <div className={`p-3 rounded-lg text-sm ${(validationStep.conforms as boolean) ? "bg-green-900/40 text-green-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                        {(validationStep.conforms as boolean)
                          ? "✅ Validation passed with no correction needed."
                          : "⚠️ Validation failed — running corrections..."}
                      </div>
                    )}
                    {correctionSteps.length === 0 && finalResult && !validationStep && (
                      <div className={`p-3 rounded-lg text-sm ${finalResult.conforms ? "bg-green-900/40 text-green-300" : "bg-yellow-900/40 text-yellow-300"}`}>
                        {finalResult.conforms
                          ? "✅ Validation passed with no correction needed."
                          : "⚠️ Validation failed after all correction attempts."}
                      </div>
                    )}
                    {correctionSteps.map((s, i) => (
                      <CollapsibleSection
                        key={i}
                        title={`🔧 Correction Attempt ${s.attempt as number} — ${s.error_type as string} error`}
                      >
                        <div className={`text-xs p-2 rounded mb-3 ${(s.conforms as boolean) ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"}`}>
                          {(s.conforms as boolean) ? "✅ Conforms after this correction" : "❌ Still failing"}
                        </div>
                        <CollapsibleSection title="Validation Report">
                          <pre className="text-xs text-gray-100 whitespace-pre-wrap overflow-auto max-h-48">{s.report as string}</pre>
                        </CollapsibleSection>
                        <p className="text-xs text-gray-200 mb-2 mt-3">Corrected RDF</p>
                        <TurtleCode code={s.rdf as string} />
                        <p className="text-xs text-gray-200 mb-2 mt-3">Corrected SHACL</p>
                        <TurtleCode code={s.shacl as string} />
                      </CollapsibleSection>
                    ))}
                    {correctionSteps.length === 0 && !finalResult && (
                      <p className="text-gray-400 text-sm">Validation details will appear here.</p>
                    )}
                  </div>
                )}

                {/* Ontology tab */}
                {activeTab === "ontology" && (
                  <div className="space-y-4">
                    {ontologyMappingStep && (
                      <CollapsibleSection title="🔎 Suggested Ontology Terms" defaultOpen>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {ontologyMappingStep.mappings as string}
                          </ReactMarkdown>
                        </div>
                      </CollapsibleSection>
                    )}
                    {ontologyMatchStep && (
                      <CollapsibleSection title="🎯 Ontology Term Matching Analysis" defaultOpen>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {ontologyMatchStep.analysis as string}
                          </ReactMarkdown>
                        </div>
                      </CollapsibleSection>
                    )}
                    {ontologyReplaceStep && (
                      <CollapsibleSection title="🔄 Ontology Term Replacement" defaultOpen>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {ontologyReplaceStep.report as string}
                          </ReactMarkdown>
                        </div>
                        {(ontologyReplaceStep.validation as { replacements_made: number })?.replacements_made > 0 && (
                          <div className="mt-3 space-y-3">
                      <p className="text-xs text-gray-200 mb-2 mb-1">RDF after replacement</p>
                            <TurtleCode code={ontologyReplaceStep.replaced_rdf as string} />
                            <p className="text-xs text-gray-200 mb-1">SHACL after replacement</p>
                            <TurtleCode code={ontologyReplaceStep.replaced_shacl as string} />
                          </div>
                        )}
                      </CollapsibleSection>
                    )}
                    {!ontologyMappingStep && !ontologyMatchStep && (
                      <p className="text-gray-400 text-sm">Ontology analysis will appear here.</p>
                    )}
                  </div>
                )}

                {/* Graph tab */}
                {activeTab === "graph" && (
                  <div>
                    {graphLoading && (
                      <div className="flex items-center gap-3 text-primary-300 text-sm py-8 justify-center">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                        </svg>
                        Parsing RDF and building graph…
                      </div>
                    )}
                    {graphError && (
                      <div className="text-red-300 text-sm bg-red-900/30 rounded-xl p-3">⚠️ {graphError}</div>
                    )}
                    {!graphLoading && !graphError && graphHtml ? (
                      <iframe
                        srcDoc={graphHtml}
                        className="w-full rounded-xl border border-white/10"
                        style={{ height: "620px" }}
                        title="RDF Graph"
                        sandbox="allow-scripts"
                      />
                    ) : !graphLoading && !graphError && (
                      <p className="text-gray-400 text-sm">
                        {isRunning ? "Graph will appear when pipeline finishes." : "Run the pipeline to see the RDF graph."}
                      </p>
                    )}
                  </div>
                )}

                {/* Final Results tab */}
                {activeTab === "final" && (
                  <div className="space-y-4">
                    {finalResult ? (
                      <>
                        {/* Status banner */}
                        <div className={`p-4 rounded-xl font-semibold ${finalResult.conforms ? "bg-green-900/40 border border-green-500/40 text-green-300" : "bg-red-900/40 border border-red-500/40 text-red-300"}`}>
                          {finalResult.conforms ? "✅ VALIDATION PASSED" : "❌ VALIDATION FAILED"}
                          {finalResult.replacement_count > 0 && (
                            <span className="ml-2 text-sm font-normal text-blue-300">
                              ({finalResult.replacement_count} ontology terms replaced)
                            </span>
                          )}
                        </div>

                        {/* RDF */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 text-white">📄 Final RDF (Turtle)</h4>
                          <TurtleCode code={finalResult.rdf} />
                        </div>

                        {/* SHACL */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 text-white">🛡️ Final SHACL (Turtle)</h4>
                          <TurtleCode code={finalResult.shacl} />
                        </div>

                        {/* Validation report */}
                        <CollapsibleSection title="📋 Validation Report" defaultOpen={!finalResult.conforms}>
                          <pre className="text-xs text-gray-100 whitespace-pre-wrap overflow-auto max-h-64 bg-dark-900 p-3 rounded-lg">
                            {finalResult.report || "All SHACL constraints satisfied."}
                          </pre>
                        </CollapsibleSection>

                        {/* Downloads */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2">⬇️ Download Files</h4>
                          <div className="flex gap-3 flex-wrap">
                            <button
                              onClick={() => downloadText(finalResult.rdf, "final_rdf.ttl")}
                              className="btn-secondary text-sm"
                            >
                              📥 Download RDF (.ttl)
                            </button>
                            <button
                              onClick={() => downloadText(finalResult.shacl, "final_shacl.ttl")}
                              className="btn-secondary text-sm"
                            >
                              📥 Download SHACL (.ttl)
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-400 text-sm">
                        {isRunning
                          ? "Pipeline is running... results will appear here."
                          : "Run the pipeline to see results."}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
