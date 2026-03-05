"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RdfGraphData } from "@/components/RdfGraphVisualization";

const RdfGraphVisualization = dynamic(
  () => import("@/components/RdfGraphVisualization"),
  { ssr: false }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Copy text to clipboard and return whether it succeeded. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function DataValidationPage() {
  const [rdfContent, setRdfContent] = useState("");
  const [shaclContent, setShaclContent] = useState("");
  const [validationResult, setValidationResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [rdfOption, setRdfOption] = useState<"upload" | "example">("upload");
  const [shaclOption, setShaclOption] = useState<"upload" | "example">(
    "upload"
  );
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [analyzingWithAI, setAnalyzingWithAI] = useState(false);
  const [fixedRdf, setFixedRdf] = useState<any>(null);
  const [fixingErrors, setFixingErrors] = useState(false);
  const [progressLog, setProgressLog] = useState<Array<{type: string, message: string, timestamp: Date}>>([]);
  const progressLogRef = useRef<HTMLDivElement>(null);
  const sseAbortRef = useRef<AbortController | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rdfGraphData, setRdfGraphData] = useState<RdfGraphData | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const showToast = useCallback(
    (message: string, type: 'success' | 'info' | 'warning' = 'success') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToast({ message, type });
      toastTimerRef.current = setTimeout(() => setToast(null), 4000);
    },
    []
  );

  const handleCopy = useCallback(async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  }, []);

  // Auto-scroll progress log
  useEffect(() => {
    if (progressLogRef.current) {
      progressLogRef.current.scrollTop = progressLogRef.current.scrollHeight;
    }
  }, [progressLog]);

  const loadExampleFile = async (
    filename: string,
    setter: (content: string) => void
  ) => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/files/${filename}`);
      setter(response.data.content);
    } catch (error) {
      console.error("Error loading example file:", error);
      alert("Failed to load example file");
    } finally {
      setLoading(false);
    }
  };

  const handleValidate = async () => {
    if (!rdfContent || !shaclContent) {
      alert("Please provide both Data Graph and Shape Graph");
      return;
    }

    setLoading(true);
    setAiAnalysis(null); // Reset AI analysis when revalidating
    setFixedRdf(null); // Reset fixed RDF when revalidating
    setProgressLog([]); // Clear progress log
    setRdfGraphData(null); // Reset graph when revalidating
    try {
      const response = await axios.post(`${API_URL}/api/validate`, {
        rdf_content: rdfContent,
        shacl_content: shaclContent,
      });
      setValidationResult(response.data);

      // If validation passes, fetch the RDF graph for visualization
      if (response.data.conforms) {
        setLoadingGraph(true);
        try {
          const graphResponse = await axios.post(`${API_URL}/api/rdf-graph`, {
            rdf_content: rdfContent,
            shacl_content: shaclContent,
          });
          setRdfGraphData(graphResponse.data);
        } catch (graphErr) {
          console.error("Failed to load RDF graph data:", graphErr);
        } finally {
          setLoadingGraph(false);
        }
      }
    } catch (error: any) {
      alert(
        `Validation failed: ${error.response?.data?.detail || error.message}`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeWithAI = async () => {
    if (!validationResult) {
      alert("No validation result to analyze");
      return;
    }

    setAnalyzingWithAI(true);
    setFixedRdf(null); // Reset fixed RDF when re-analyzing
    try {
      const response = await axios.post(`${API_URL}/api/analyze-validation`, {
        validation_report: validationResult.report_text,
        rdf_content: rdfContent,
        shacl_content: shaclContent,
        conforms: validationResult.conforms,
      });
      setAiAnalysis(response.data);
    } catch (error: any) {
      alert(
        `AI Analysis failed: ${error.response?.data?.detail || error.message}`
      );
    } finally {
      setAnalyzingWithAI(false);
    }
  };

  const handleFixErrors = async () => {
    if (!validationResult || validationResult.conforms) {
      return; // Only fix if there are errors
    }

    if (!aiAnalysis) {
      alert("Please analyze with AI first before attempting to fix errors");
      return;
    }

    setFixingErrors(true);
    setProgressLog([]);
    setFixedRdf(null);
    
    const addLog = (type: string, message: string) => {
      setProgressLog(prev => [...prev, { type, message, timestamp: new Date() }]);
    };

    const controller = new AbortController();
    sseAbortRef.current = controller;
    
    try {
      const response = await fetch(`${API_URL}/api/fix-validation-errors-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          validation_report: validationResult.report_text,
          rdf_content: rdfContent,
          shacl_content: shaclContent,
          ai_analysis: aiAnalysis.analysis,
        }),
      });

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.type === 'done') {
                setFixedRdf(data);
                addLog('success', '✅ Process completed!');
              } else if (data.type === 'error') {
                addLog('error', data.message);
              } else if (data.type === 'success') {
                addLog('success', data.message);
              } else if (data.type === 'warning') {
                addLog('warning', data.message);
              } else if (data.type === 'info') {
                addLog('info', data.message);
              } else if (data.type === 'progress') {
                addLog('progress', data.message);
              } else if (data.type === 'attempt') {
                addLog('attempt', data.message);
              } else if (data.type === 'streaming') {
                // Just update progress, don't log every chunk
                if (data.total_length % 500 === 0) {
                  addLog('streaming', `Generated ${data.total_length} characters...`);
                }
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        addLog('warning', '⏹ Fix process was cancelled by user.');
      } else {
        addLog('error', `Error: ${error.message}`);
        alert(`Error fixing validation issues: ${error.message}`);
      }
    } finally {
      setFixingErrors(false);
      sseAbortRef.current = null;
    }
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto animate-fade-in">

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-6 py-4 rounded-2xl shadow-xl border transition-all duration-300 animate-slide-down
            ${toast.type === 'success' ? 'bg-green-50 border-green-400 text-green-900' :
              toast.type === 'warning' ? 'bg-amber-50 border-amber-400 text-amber-900' :
              'bg-blue-50 border-blue-400 text-blue-900'}`}
        >
          <span className="text-xl">
            {toast.type === 'success' ? '✅' : toast.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <p className="font-medium text-sm sm:text-base">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="ml-2 text-gray-400 hover:text-gray-700 transition-colors text-lg font-bold leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <h2 className="section-title mb-6">Data Validation Workflow</h2>

      <div className="card bg-gradient-to-br from-blue-50 to-indigo-50 mb-8">
        <ul className="space-y-3 text-gray-700">
          <li className="flex items-start gap-3">
            <span className="text-2xl">✅</span>
            <span>
              In this Data Validation Workflow you can explore how the exemplary{" "}
              <strong className="text-primary-700">Data Graph</strong>{" "}
              (populated with data from the Reference data on creep) is
              validated against predefined SHACL Shapes.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📊</span>
            <span>
              For this step the SHACL Shapes needs to be predefined (
              <strong className="text-primary-700">Shape Graph</strong>).
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📝</span>
            <span>
              The output of the Validation Process is the{" "}
              <strong className="text-primary-700">Validation protocol</strong>,
              which reports the violations of the SHACL constraints.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">📤</span>
            <span>
              You can use your own Data Graph and SHACL Shapes in this Data
              Validation Workflow.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="text-2xl">💻</span>
            <span>
              The Script for the validation is running in the backend and can be
              accessed in the{" "}
              <a
                href="https://git.rwth-aachen.de/nfdi-matwerk/iuc02"
                target="_blank"
                className="text-primary-600 hover:text-primary-800 underline font-semibold"
              >
                Git Repository
              </a>
              .
            </span>
          </li>
        </ul>
      </div>

      {/* Data Graph Section */}
      <div className="card bg-gradient-to-br from-dark-600 to-dark-700 text-white mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>📄</span> Select Data Graph file:
            </h3>
            <div className="space-y-3 mb-4 bg-white/10 p-4 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="upload"
                  checked={rdfOption === "upload"}
                  onChange={() => setRdfOption("upload")}
                  className="w-5 h-5 cursor-pointer"
                  disabled={loading}
                />
                <span className="text-lg">Upload Your Own</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="example"
                  checked={rdfOption === "example"}
                  onChange={() => {
                    setRdfOption("example");
                    loadExampleFile("rdfGraph_smallExample.ttl", setRdfContent);
                  }}
                  className="w-5 h-5 cursor-pointer"
                  disabled={loading}
                />
                <span className="text-lg">Use Example Data Graph</span>
              </label>
              {loading && rdfOption === "example" && (
                <div className="flex items-center gap-2 text-white bg-white/20 p-2 rounded">
                  <span className="animate-spin text-xl">⏳</span>
                  <span className="font-semibold">Loading example file...</span>
                </div>
              )}
            </div>

            {rdfOption === "upload" && (
              <input
                type="file"
                accept=".ttl"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setRdfContent(event.target?.result as string);
                    };
                    reader.readAsText(file);
                  }
                }}
                className="mb-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-white file:text-primary-700 hover:file:bg-gray-100 file:cursor-pointer"
              />
            )}

            <textarea
              value={rdfContent}
              onChange={(e) => setRdfContent(e.target.value)}
              placeholder="Edit Data Graph..."
              className="w-full h-64 p-3 text-gray-900 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-400 outline-none"
            />
          </div>

          <div className="flex items-start">
            <button
              onClick={() => downloadFile(rdfContent, "example_data.ttl")}
              disabled={!rdfContent}
              className="btn-secondary w-full"
            >
              📥 Download Example Data Graph
            </button>
          </div>
        </div>
      </div>

      {/* SHACL Shape Section */}
      <div className="card bg-gradient-to-br from-primary-600 to-primary-700 text-white mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-2xl font-bold mb-4 flex items-center gap-2">
              <span>🔍</span> Select Shape Graph file:
            </h3>
            <div className="space-y-3 mb-4 bg-white/10 p-4 rounded-lg">
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="upload"
                  checked={shaclOption === "upload"}
                  onChange={() => setShaclOption("upload")}
                  className="w-5 h-5 cursor-pointer"
                  disabled={loading}
                />
                <span className="text-lg">Upload Your Own</span>
              </label>
              <label className="flex items-center space-x-3 cursor-pointer hover:bg-white/10 p-2 rounded transition-colors">
                <input
                  type="radio"
                  value="example"
                  checked={shaclOption === "example"}
                  onChange={() => {
                    setShaclOption("example");
                    loadExampleFile(
                      "shaclShape_smallExample.ttl",
                      setShaclContent
                    );
                  }}
                  className="w-5 h-5 cursor-pointer"
                  disabled={loading}
                />
                <span className="text-lg">Use Example Shape Graph</span>
              </label>
              {loading && shaclOption === "example" && (
                <div className="flex items-center gap-2 text-white bg-white/20 p-2 rounded">
                  <span className="animate-spin text-xl">⏳</span>
                  <span className="font-semibold">Loading example file...</span>
                </div>
              )}
            </div>

            {shaclOption === "upload" && (
              <input
                type="file"
                accept=".ttl"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setShaclContent(event.target?.result as string);
                    };
                    reader.readAsText(file);
                  }
                }}
                className="mb-4 block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:font-semibold file:bg-white file:text-primary-700 hover:file:bg-gray-100 file:cursor-pointer"
              />
            )}

            <textarea
              value={shaclContent}
              onChange={(e) => setShaclContent(e.target.value)}
              placeholder="Edit Shape Graph..."
              className="w-full h-64 p-3 text-gray-900 rounded-lg font-mono text-sm focus:ring-2 focus:ring-primary-400 outline-none"
            />
          </div>

          <div className="flex items-start">
            <button
              onClick={() => downloadFile(shaclContent, "example_shacl.ttl")}
              disabled={!shaclContent}
              className="btn-secondary w-full"
            >
              📥 Download Example Shape Graph
            </button>
          </div>
        </div>
      </div>

      {/* Validate Button */}
      <div className="card bg-gradient-to-r from-accent-green to-emerald-500 text-white text-center shadow-medium hover:shadow-hard transition-all mb-8">
        <button
          onClick={handleValidate}
          disabled={loading || !rdfContent || !shaclContent}
          className="btn-primary w-full max-w-md mx-auto text-xl py-4"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span> Validating...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>✔️</span> Validate Data Against SHACL
            </span>
          )}
        </button>
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className="space-y-6 animate-slide-up">
          <div
            className={`card ${
              validationResult.conforms
                ? "bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400"
                : "bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-400"
            }`}
          >
            <div className="flex items-center gap-4 mb-4">
              <span className="text-5xl">
                {validationResult.conforms ? "✅" : "⚠️"}
              </span>
              <div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Validation Result
                </h3>
                <p className="text-xl font-semibold">
                  <strong>Conforms:</strong>
                  <span
                    className={
                      validationResult.conforms
                        ? "text-green-700"
                        : "text-yellow-700"
                    }
                  >
                    {validationResult.conforms ? " Yes ✓" : " No ✗"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* RDF Graph Visualization — shown only when validation passes */}
          {validationResult.conforms && (
            <div className="card bg-gradient-to-br from-indigo-50 to-slate-50 border-2 border-indigo-300 animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">🕸️</span>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">RDF Data Graph</h3>
                  <p className="text-sm text-gray-600">
                    Interactive force-directed graph of the validated RDF data
                  </p>
                </div>
              </div>
              {loadingGraph ? (
                <div className="flex items-center gap-3 py-10 justify-center text-indigo-600">
                  <span className="animate-spin text-2xl">⚙️</span>
                  <span className="font-medium">Building graph with NetworkX…</span>
                </div>
              ) : rdfGraphData ? (
                <RdfGraphVisualization graphData={rdfGraphData} />
              ) : null}
            </div>
          )}

          <div className="card">
            <h3 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
              <span>📝</span> SHACL Report:
            </h3>
            <textarea
              value={validationResult.report_text}
              readOnly
              className="w-full h-64 p-3 border-2 border-gray-300 rounded-lg font-mono text-sm bg-gray-50"
            />
            
            {/* Report action buttons */}
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => handleCopy(validationResult.report_text, 'report')}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                {copiedKey === 'report' ? '✅ Copied!' : '📋 Copy Report'}
              </button>
              <button
                onClick={() => downloadFile(validationResult.report_text, 'shacl_report.txt')}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                📥 Download Report
              </button>
            </div>
            
            {/* AI Analysis Button */}
            <div className="mt-4">
              <button
                onClick={handleAnalyzeWithAI}
                disabled={analyzingWithAI}
                className="btn-primary bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
              >
                {analyzingWithAI ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin">🤖</span> Analyzing with AI...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span>🤖</span> Analyze {validationResult.conforms ? 'Results' : 'Failures'} with AI
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* AI Analysis Result */}
          {aiAnalysis && (
            <div className="card bg-gradient-to-br from-purple-50 to-indigo-50 border-2 border-purple-400 animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">🤖</span>
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">AI Analysis</h3>
                  <p className="text-sm text-gray-600">Powered by {aiAnalysis.model}</p>
                </div>
              </div>
              <div className="prose prose-blue max-w-none text-gray-800 bg-white p-6 rounded-lg shadow-inner">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-3 text-gray-900" {...props} />,
                    h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-2 text-gray-900" {...props} />,
                    h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-900" {...props} />,
                    p: ({ node, ...props }) => <p className="mb-3 leading-relaxed text-gray-900" {...props} />,
                    ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1 ml-2" {...props} />,
                    ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1 ml-2" {...props} />,
                    li: ({ node, ...props }) => <li className="text-gray-900 ml-2" {...props} />,
                    code: ({ node, inline, ...props }: any) => 
                      inline ? (
                        <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-sm font-mono font-semibold" {...props} />
                      ) : (
                        <code className="block bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm font-mono border-2 border-gray-700" {...props} />
                      ),
                    pre: ({ node, ...props }) => <pre className="bg-gray-900 p-0 rounded-lg overflow-x-auto mb-4 border-2 border-gray-700" {...props} />,
                    strong: ({ node, ...props }) => <strong className="font-bold text-gray-900" {...props} />,
                    em: ({ node, ...props }) => <em className="italic text-gray-900" {...props} />,
                    blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-purple-400 pl-4 italic my-3 text-gray-800 bg-purple-50 py-2 rounded-r" {...props} />,
                  }}
                >
                  {aiAnalysis.analysis}
                </ReactMarkdown>
              </div>

              {/* Copy / Download AI analysis */}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => handleCopy(aiAnalysis.analysis, 'ai-analysis')}
                  className="btn-secondary text-sm px-3 py-1.5"
                >
                  {copiedKey === 'ai-analysis' ? '✅ Copied!' : '📋 Copy Analysis'}
                </button>
                <button
                  onClick={() => downloadFile(aiAnalysis.analysis, 'ai_analysis.md')}
                  className="btn-secondary text-sm px-3 py-1.5"
                >
                  📥 Download Analysis
                </button>
              </div>

              {/* AI Fix Button - Only show if validation failed */}
              {!validationResult.conforms && (
                <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🔧</span>
                      <div>
                        <h4 className="text-lg font-bold text-gray-900">Want AI to fix these errors?</h4>
                        <p className="text-sm text-gray-600">
                          Our AI agent can attempt to automatically correct the validation errors
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                    {fixingErrors ? (
                      <button
                        onClick={() => sseAbortRef.current?.abort()}
                        className="btn-secondary bg-red-100 hover:bg-red-200 text-red-700 border border-red-300 whitespace-nowrap"
                      >
                        ⏹ Cancel Fix
                      </button>
                    ) : null}
                    <button
                      onClick={handleFixErrors}
                      disabled={fixingErrors}
                      className="btn-primary bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 whitespace-nowrap"
                    >
                      {fixingErrors ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin">🔧</span> Fixing Errors...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span>🔧</span> Yes, Fix Errors with AI
                        </span>
                      )}
                    </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Progress Log - Show during fixing */}
          {(fixingErrors || progressLog.length > 0) && (
            <div className="card bg-gradient-to-br from-slate-50 to-gray-50 border-2 border-slate-300 animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{fixingErrors ? '⚙️' : '📋'}</span>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    {fixingErrors ? 'AI Fix Progress (Live)' : 'Fix Process Log'}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {fixingErrors ? 'Watch the AI work in real-time...' : 'Process completed'}
                  </p>
                </div>
              </div>
              
              <div className="bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm" ref={progressLogRef}>
                {progressLog.length === 0 && fixingErrors && (
                  <div className="text-green-400 animate-pulse">
                    ⚡ Starting AI fix process...
                  </div>
                )}
                {progressLog.map((log, index) => (
                  <div
                    key={index}
                    className={`py-1 ${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      log.type === 'attempt' ? 'text-blue-400 font-bold' :
                      log.type === 'info' ? 'text-cyan-400' :
                      log.type === 'streaming' ? 'text-purple-400' :
                      'text-gray-300'
                    }`}
                  >
                    <span className="text-gray-500 mr-2">
                      [{log.timestamp.toLocaleTimeString()}]
                    </span>
                    {log.message}
                  </div>
                ))}
                {fixingErrors && (
                  <div className="text-green-400 animate-pulse mt-2">
                    ▊
                  </div>
                )}
              </div>
              
              {progressLog.length > 0 && !fixingErrors && (
                <div className="mt-3 text-sm text-gray-600 flex items-center gap-2">
                  <span>💡</span>
                  <span>Process log shows {progressLog.length} events</span>
                </div>
              )}
            </div>
          )}

          {/* Fixed RDF Result */}
          {fixedRdf && (
            <div className="card bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-400 animate-slide-up">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-4xl">🔧</span>
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-gray-900">AI Auto-Fix Results</h3>
                  <p className="text-sm text-gray-600 mb-1">
                    {fixedRdf.validation_passed ? (
                      <span className="text-green-700 font-semibold">
                        ✅ Fixed RDF passes SHACL validation!
                        {fixedRdf.attempts > 1 && ` (Success on attempt ${fixedRdf.attempts}/${fixedRdf.max_attempts})`}
                      </span>
                    ) : fixedRdf.syntax_valid ? (
                      <span className="text-yellow-700 font-semibold">
                        ⚠️ Partial fix - some errors remain
                        {fixedRdf.attempts > 1 && ` (${fixedRdf.attempts}/${fixedRdf.max_attempts} attempts made)`}
                      </span>
                    ) : (
                      <span className="text-red-700 font-semibold">❌ Syntax error in generated fix</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    Powered by {fixedRdf.model}
                    {fixedRdf.original_error_count && ` • Original errors detected: ${fixedRdf.original_error_count}`}
                    {fixedRdf.attempts > 1 && ` • Made ${fixedRdf.attempts} intelligent correction passes`}
                  </p>
                </div>
              </div>

              {fixedRdf.syntax_valid ? (
                <>
                  <div className="bg-white p-4 rounded-lg shadow-inner mb-4">
                    <h4 className="text-lg font-semibold text-gray-900 mb-2">Corrected Data Graph:</h4>
                    <textarea
                      value={fixedRdf.fixed_rdf}
                      readOnly
                      className="w-full h-96 p-3 border-2 border-green-300 rounded-lg font-mono text-sm bg-gray-50 focus:ring-2 focus:ring-green-400 outline-none"
                    />
                  </div>

                  <div className="flex gap-4 flex-wrap">
                    <button
                      onClick={() => downloadFile(fixedRdf.fixed_rdf, "fixed_data_graph.ttl")}
                      className="btn-primary bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                    >
                      📥 Download Fixed RDF
                    </button>
                    
                    <button
                      onClick={() => {
                        setRdfContent(fixedRdf.fixed_rdf);
                        showToast('✅ Fixed RDF loaded into the editor. You can now validate it again.');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="btn-secondary bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
                    >
                      📝 Load Fixed RDF into Editor
                    </button>
                  </div>

                  {fixedRdf.validation_status && (
                    <div className={`mt-4 p-4 rounded-lg border-2 ${fixedRdf.validation_passed ? 'bg-green-50 border-green-300' : 'bg-yellow-50 border-yellow-300'}`}>
                      <h4 className="text-md font-semibold text-gray-900 mb-2">
                        {fixedRdf.validation_passed ? '✅ Validation Check:' : '⚠️ Partial Fix Details:'}
                      </h4>
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono">
                        {fixedRdf.validation_status}
                      </pre>
                      {!fixedRdf.validation_passed && (
                        <div className="mt-3 p-3 bg-white rounded border border-yellow-400">
                          <p className="text-sm text-gray-800">
                            <strong>💡 Suggestion:</strong> The AI made progress but couldn't fix all errors. 
                            You can:
                          </p>
                          <ul className="text-sm text-gray-700 mt-2 ml-4 list-disc space-y-1">
                            <li>Load the partial fix into the editor and click "Fix Errors with AI" again</li>
                            <li>Manually review and correct the remaining issues</li>
                            <li><strong>Check for case-sensitive property names</strong> (e.g., :dateOftestStart vs :dateOfTestStart)</li>
                            <li>Verify the SHACL shapes use correct property names</li>
                          </ul>
                          <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-300">
                            <p className="text-xs text-blue-900">
                              <strong>⚠️ Common Issue:</strong> Property names in RDF are case-sensitive. 
                              Make sure your data uses the exact same property names as your SHACL shapes.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="bg-red-50 p-4 rounded-lg border-2 border-red-300">
                  <h4 className="text-lg font-semibold text-red-900 mb-2">⚠️ Syntax Error</h4>
                  <p className="text-sm text-red-700 mb-2">
                    The AI-generated fix has syntax errors. Please review manually:
                  </p>
                  <pre className="text-sm text-red-800 bg-white p-3 rounded border border-red-300 overflow-x-auto">
                    {fixedRdf.syntax_error}
                  </pre>
                  <textarea
                    value={fixedRdf.fixed_rdf}
                    readOnly
                    className="w-full h-64 p-3 border-2 border-red-300 rounded-lg font-mono text-sm bg-white mt-3"
                  />
                </div>
              )}
            </div>
          )}

          {validationResult.json_ld && (
            <div className="card bg-gradient-to-br from-blue-50 to-indigo-50">
              <button
                onClick={() =>
                  downloadFile(validationResult.json_ld, "dataGraph.jsonld")
                }
                className="btn-primary"
              >
                📥 Download JSON-LD
              </button>
            </div>
          )}

          {validationResult.report_details &&
            validationResult.report_details.length > 0 && (
              <div className="card">
                <h3 className="text-2xl font-bold mb-4 text-gray-900">
                  Detailed SHACL Report
                </h3>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {validationResult.report_details.map(
                    (item: any, index: number) => (
                      <div
                        key={index}
                        className="bg-blue-50 border-l-4 border-primary-500 p-4 rounded-r-lg hover:bg-blue-100 transition-colors"
                      >
                        <p className="mb-2">
                          <strong className="text-gray-700">Subject:</strong>{" "}
                          <code className="bg-white px-2 py-1 rounded text-sm">
                            {item.subject}
                          </code>
                        </p>
                        <p className="mb-2">
                          <strong className="text-gray-700">Predicate:</strong>{" "}
                          <code className="bg-white px-2 py-1 rounded text-sm">
                            {item.predicate}
                          </code>
                        </p>
                        <p>
                          <strong className="text-gray-700">Object:</strong>{" "}
                          <code className="bg-white px-2 py-1 rounded text-sm">
                            {item.object}
                          </code>
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
