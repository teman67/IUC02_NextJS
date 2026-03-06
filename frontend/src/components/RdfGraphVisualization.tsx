 "use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface GraphNode {
  id: string;
  label: string;
  node_type: "uri" | "literal" | "blank";
  // runtime props added by ForceGraph2D
  x?: number;
  y?: number;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  label: string;
}

export interface RdfGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_count: number;
  edge_count: number;
}

interface Props {
  graphData: RdfGraphData;
}

// Colour palette per node type
const NODE_COLORS: Record<string, string> = {
  uri: "#6366f1",     // indigo
  literal: "#10b981", // emerald
  blank: "#f59e0b",   // amber
};

const NODE_BORDER: Record<string, string> = {
  uri: "#4338ca",
  literal: "#059669",
  blank: "#d97706",
};

function truncate(s: string, max = 20) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function RdfGraphVisualization({ graphData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [ForceGraph, setForceGraph] = useState<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 520 });
  const [visibleTypes, setVisibleTypes] = useState<Set<string>>(
    new Set(["uri", "literal", "blank"])
  );
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Track real mouse position for tooltip placement
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Dynamic import (browser only)
  useEffect(() => {
    import("react-force-graph-2d").then((mod) => {
      setForceGraph(() => mod.default);
    });
  }, []);

  // Spread nodes out via d3 force configuration
  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.d3Force("charge")?.strength(-400);
    fgRef.current.d3Force("link")?.distance(120);
    fgRef.current.d3ReheatSimulation?.();
  }, [ForceGraph]);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setDimensions({ width: w, height: Math.max(480, Math.min(w * 0.65, 620)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filter graph by visible node types
  const filteredData = {
    nodes: graphData.nodes.filter((n) => visibleTypes.has(n.node_type)),
    links: graphData.edges.filter((e) => {
      const srcId = typeof e.source === "object" ? e.source.id : e.source;
      const tgtId = typeof e.target === "object" ? e.target.id : e.target;
      const srcNode = graphData.nodes.find((n) => n.id === srcId);
      const tgtNode = graphData.nodes.find((n) => n.id === tgtId);
      return (
        srcNode && tgtNode &&
        visibleTypes.has(srcNode.node_type) &&
        visibleTypes.has(tgtNode.node_type)
      );
    }),
  };

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    if (node) {
      setTooltip({ text: node.id, x: mousePos.current.x, y: mousePos.current.y });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleNodeClick = useCallback((node: GraphNode) => {
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 600);
      fgRef.current.zoom(3, 600);
    }
  }, []);

  const toggleType = (type: string) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const resetView = () => {
    if (fgRef.current) {
      fgRef.current.zoomToFit(400, 40);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-sm font-semibold text-gray-700">Filter nodes:</span>
        {(["uri", "literal", "blank"] as const).map((t) => (
          <button
            key={t}
            onClick={() => toggleType(t)}
            className={`text-xs px-3 py-1 rounded-full border-2 font-semibold transition-all ${
              visibleTypes.has(t)
                ? "text-white border-transparent"
                : "bg-white text-gray-500 border-gray-300"
            }`}
            style={visibleTypes.has(t) ? { backgroundColor: NODE_COLORS[t], borderColor: NODE_BORDER[t] } : {}}
          >
            {t === "uri" ? "🔗 URI" : t === "literal" ? "📝 Literal" : "⬡ Blank Node"}
            {" "}
            ({graphData.nodes.filter((n) => n.node_type === t).length})
          </button>
        ))}
        <button
          onClick={resetView}
          className="ml-auto text-xs px-3 py-1 rounded-full border-2 border-indigo-400 text-indigo-600 font-semibold hover:bg-indigo-50 transition-all"
        >
          ⊙ Reset View
        </button>
      </div>

      {/* Graph canvas */}
      <div className="rounded-xl overflow-hidden border-2 border-indigo-200 bg-gray-950 shadow-inner">
        {ForceGraph ? (
          <ForceGraph
            ref={fgRef}
            graphData={filteredData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="#0f172a"
            // Nodes
            nodeId="id"
            nodeLabel={() => ""}
            nodeCanvasObject={(node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
              const label = truncate(node.label, 18);
              const fontSize = Math.max(8, 11 / globalScale);
              const r = Math.max(4, 7 / Math.max(1, globalScale * 0.5));
              const color = NODE_COLORS[node.node_type] ?? NODE_COLORS.uri;
              const border = NODE_BORDER[node.node_type] ?? NODE_BORDER.uri;

              // Circle
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI);
              ctx.fillStyle = color;
              ctx.fill();
              ctx.strokeStyle = border;
              ctx.lineWidth = 1.2 / globalScale;
              ctx.stroke();

              // Label below node
              ctx.font = `${fontSize}px Inter,sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "#e2e8f0";
              ctx.fillText(label, node.x!, node.y! + r + 2 / globalScale);
            }}
            nodePointerAreaPaint={(node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x!, node.y!, 10, 0, 2 * Math.PI);
              ctx.fill();
            }}
            onNodeHover={handleNodeHover}
            onNodeClick={handleNodeClick}
            // Links
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkColor={() => "#475569"}
            linkWidth={1}
            linkLabel="label"
            linkCanvasObjectMode={() => "after"}
            linkCanvasObject={(link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
              if (globalScale < 1.2) return; // hide edge labels when zoomed out
              const start = link.source;
              const end = link.target;
              if (!start?.x || !end?.x) return;
              const mx = (start.x + end.x) / 2;
              const my = (start.y + end.y) / 2;
              const fontSize = Math.max(6, 9 / globalScale);
              ctx.font = `${fontSize}px Inter,sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "middle";
              ctx.fillStyle = "#94a3b8";
              ctx.fillText(truncate(link.label, 22), mx, my);
            }}
            cooldownTicks={120}
            onEngineStop={() => fgRef.current?.zoomToFit(300, 40)}
          />
        ) : (
          <div className="flex items-center justify-center" style={{ height: dimensions.height }}>
            <span className="text-gray-400 animate-pulse">Loading graph…</span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
        {(["uri", "literal", "blank"] as const).map((t) => (
          <span key={t} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-full border"
              style={{ backgroundColor: NODE_COLORS[t], borderColor: NODE_BORDER[t] }}
            />
            {t === "uri" ? "URI node" : t === "literal" ? "Literal value" : "Blank node"}
          </span>
        ))}
        <span className="ml-auto text-gray-400">
          {filteredData.nodes.length} nodes · {filteredData.links.length} edges
          {" | "}Scroll to zoom · Drag to pan · Click node to focus
        </span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 max-w-xs bg-gray-900 text-gray-200 text-xs px-3 py-2 rounded-xl shadow-xl border border-gray-700 pointer-events-none break-all"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
