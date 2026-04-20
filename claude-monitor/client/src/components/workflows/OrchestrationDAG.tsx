import { useMemo, useState } from "react";
import type {
  OrchestrationData,
  SessionDrillIn,
  SessionOutputs,
  WorkflowData,
} from "../../lib/types";

interface OrchestrationDAGProps {
  data: OrchestrationData;
  focusedSession?: SessionDrillIn | null;
  focusedOutputs?: SessionOutputs | null;
  onNodeClick?: (nodeType: string) => void;
  selectedNode?: string | null;
  specSummary?: {
    total: number;
    active: number;
    ready: number;
    highlight?: string | null;
  };
  sessionOptions?: WorkflowData["complexity"];
  selectedSessionId?: string | null;
  onSessionChange?: (sessionId: string | null) => void;
  onJumpToReader?: () => void;
}

interface GraphPreview {
  title: string;
  excerpt: string;
}

interface GraphSpecMeta {
  active: number;
  ready: number;
}

interface GraphNode {
  id: string;
  label: string;
  subtitle: string;
  kind: "session" | "main" | "agent" | "aggregate" | "spec";
  layer: number;
  count?: number;
  status?: string;
  filterKey?: string | null;
  task?: string | null;
  preview?: GraphPreview | null;
  specMeta?: GraphSpecMeta | null;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
}

interface GraphLayout {
  mode: "session" | "aggregate";
  title: string;
  description: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

interface TooltipState {
  node: GraphNode;
  x: number;
  y: number;
}

const NODE_HEIGHT = 76;
const PREVIEW_NODE_HEIGHT = 150;
const BASE_NODE_WIDTH = 196;
const PREVIEW_NODE_WIDTH = 252;
const MAX_NODE_WIDTH = 320;
const BADGE_WIDTH = 56;
const LAYER_GAP = 92;
const ROW_GAP = 18;
const PADDING_X = 24;
const PADDING_Y = 28;
const MIN_GRAPH_HEIGHT = 340;
const MAX_VISIBLE_AGGREGATE_NODES = 8;

function truncate(value: string, max = 34) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function stripMarkdown(value: string) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_>~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function visualLength(value: string) {
  return [...value].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
}

function prettyStatus(status: string) {
  return status.replace(/_/g, " ");
}

function isWorkingStatus(status?: string | null) {
  if (!status) return false;
  return ["active", "working", "connected"].includes(status);
}

function computeNodeWidth(label: string, subtitle: string, preview?: GraphPreview | null) {
  const labelWidth = visualLength(label) * 7.3;
  const subtitleWidth = visualLength(subtitle) * 6.1;
  const previewWidth = preview ? Math.max(visualLength(preview.title) * 6.8, 180) : 0;
  const width = Math.ceil(Math.max(labelWidth, subtitleWidth, previewWidth) + 84);
  return Math.max(
    preview ? PREVIEW_NODE_WIDTH : BASE_NODE_WIDTH,
    Math.min(MAX_NODE_WIDTH, width)
  );
}

function createNode(
  input: Omit<GraphNode, "width" | "height"> & { width?: number; height?: number }
): GraphNode {
  const preview = input.preview ?? null;
  return {
    ...input,
    preview,
    width: input.width ?? computeNodeWidth(input.label, input.subtitle, preview),
    height: input.height ?? (preview ? PREVIEW_NODE_HEIGHT : NODE_HEIGHT),
  };
}

function nodeColors(node: GraphNode, active: boolean) {
  const base = {
    fill: "rgba(15, 23, 42, 0.72)",
    border: active ? "#4ade80" : "rgba(148, 163, 184, 0.32)",
    title: "#f8fafc",
    subtitle: "#94a3b8",
    badgeFill: active ? "rgba(34, 197, 94, 0.16)" : "rgba(148, 163, 184, 0.16)",
    badgeText: active ? "#bbf7d0" : "#e2e8f0",
    previewFill: "rgba(2, 6, 23, 0.5)",
    previewBorder: "rgba(148, 163, 184, 0.22)",
    glow: "rgba(74, 222, 128, 0.26)",
  };

  if (node.kind === "session") {
    return {
      ...base,
      fill: "rgba(3, 46, 28, 0.82)",
      border: active ? "#4ade80" : "rgba(34, 197, 94, 0.52)",
      title: "#dcfce7",
      subtitle: "#9ae6b4",
      badgeFill: "rgba(34, 197, 94, 0.16)",
      badgeText: "#dcfce7",
      previewBorder: "rgba(34, 197, 94, 0.2)",
      glow: "rgba(34, 197, 94, 0.32)",
    };
  }

  if (node.kind === "spec") {
    return {
      ...base,
      fill: "rgba(20, 36, 78, 0.78)",
      border: active ? "#60a5fa" : "rgba(96, 165, 250, 0.52)",
      title: "#dbeafe",
      subtitle: "#93c5fd",
      badgeFill: "rgba(96, 165, 250, 0.16)",
      badgeText: "#dbeafe",
      previewBorder: "rgba(96, 165, 250, 0.22)",
      glow: "rgba(96, 165, 250, 0.28)",
    };
  }

  if (node.kind === "main") {
    return {
      ...base,
      fill: "rgba(8, 32, 24, 0.78)",
      border: active ? "#4ade80" : "rgba(74, 222, 128, 0.44)",
      title: "#f0fdf4",
      subtitle: "#a7f3d0",
      badgeFill: "rgba(34, 197, 94, 0.16)",
      badgeText: "#dcfce7",
      previewBorder: "rgba(74, 222, 128, 0.22)",
      glow: "rgba(74, 222, 128, 0.28)",
    };
  }

  if (node.status === "error") {
    return {
      ...base,
      fill: "rgba(42, 18, 18, 0.78)",
      border: "rgba(248, 113, 113, 0.52)",
      badgeFill: "rgba(248, 113, 113, 0.14)",
      badgeText: "#fecaca",
      previewBorder: "rgba(248, 113, 113, 0.22)",
      glow: "rgba(248, 113, 113, 0.22)",
    };
  }

  if (node.status === "completed") {
    return {
      ...base,
      fill: "rgba(15, 23, 42, 0.76)",
      border: active ? "#4ade80" : "rgba(148, 163, 184, 0.34)",
      badgeFill: active ? "rgba(34, 197, 94, 0.16)" : "rgba(100, 116, 139, 0.18)",
      previewBorder: "rgba(148, 163, 184, 0.18)",
      glow: "rgba(148, 163, 184, 0.18)",
    };
  }

  return {
    ...base,
    fill: "rgba(8, 24, 18, 0.76)",
    border: active ? "#4ade80" : "rgba(34, 197, 94, 0.42)",
    badgeFill: active ? "rgba(34, 197, 94, 0.16)" : "rgba(22, 163, 74, 0.14)",
    badgeText: active ? "#dcfce7" : "#bbf7d0",
    previewBorder: "rgba(34, 197, 94, 0.2)",
    glow: "rgba(34, 197, 94, 0.24)",
  };
}

function statusBadge(node: GraphNode) {
  if (node.kind === "spec" && typeof node.count === "number") {
    return `${node.count} specs`;
  }
  if (node.status) return prettyStatus(node.status);
  if (typeof node.count === "number") return `${node.count}`;
  return null;
}

function layoutNodes(nodes: GraphNode[]) {
  const layers = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    if (!layers.has(node.layer)) layers.set(node.layer, []);
    layers.get(node.layer)!.push(node);
  }

  const sortedLayers = [...layers.entries()].sort((left, right) => left[0] - right[0]);
  const tallestColumn = Math.max(
    ...sortedLayers.map(([, layerNodes]) => {
      const totalHeight = layerNodes.reduce((sum, node) => sum + node.height, 0);
      return totalHeight + Math.max(0, layerNodes.length - 1) * ROW_GAP;
    }),
    0
  );
  const height = Math.max(MIN_GRAPH_HEIGHT, PADDING_Y * 2 + tallestColumn);

  let currentX = PADDING_X;
  for (const [, layerNodes] of sortedLayers) {
    const maxWidth = Math.max(...layerNodes.map((node) => node.width));
    const totalLayerHeight =
      layerNodes.reduce((sum, node) => sum + node.height, 0) +
      Math.max(0, layerNodes.length - 1) * ROW_GAP;
    let currentY = (height - totalLayerHeight) / 2;

    layerNodes.forEach((node) => {
      node.x = currentX + (maxWidth - node.width) / 2;
      node.y = currentY;
      currentY += node.height + ROW_GAP;
    });
    currentX += maxWidth + LAYER_GAP;
  }

  return { nodes, width: currentX - LAYER_GAP + PADDING_X, height };
}

function buildSpecNode(specSummary?: OrchestrationDAGProps["specSummary"]): GraphNode {
  const highlight = specSummary?.highlight?.trim();
  const label = highlight || "Spec";
  const active = specSummary?.active ?? 0;
  const ready = specSummary?.ready ?? 0;
  const subtitle = highlight
    ? `${ready} ready to apply`
    : `${active} active changes | ${ready} ready`;

  return createNode({
    id: "spec",
    label,
    subtitle,
    kind: "spec",
    layer: 1,
    count: specSummary?.total ?? 0,
    filterKey: "spec",
    specMeta: { active, ready },
    height: 102,
  });
}

function findLatestPreview(agentId: string, focusedOutputs?: SessionOutputs | null): GraphPreview | null {
  if (!focusedOutputs?.latest_output_agent_id || focusedOutputs.latest_output_agent_id !== agentId) {
    return null;
  }

  const latestFeed = focusedOutputs.agents.find((item) => item.agent_id === agentId);
  const markdown = latestFeed?.latest_output?.markdown;
  if (!markdown) return null;

  const excerpt = truncate(stripMarkdown(markdown), 80);
  if (!excerpt) return null;

  return {
    title: "Latest output",
    excerpt,
  };
}

function buildSessionGraph(
  focusedSession: SessionDrillIn,
  specSummary?: OrchestrationDAGProps["specSummary"],
  focusedOutputs?: SessionOutputs | null
): GraphLayout {
  const nodes: GraphNode[] = [
    createNode({
      id: `session:${focusedSession.session.id}`,
      label: truncate(focusedSession.session.name ?? focusedSession.session.id, 36),
      subtitle: `${prettyStatus(focusedSession.session.status)} | ${focusedSession.session.model ?? "unknown model"}`,
      kind: "session",
      layer: 0,
      count: focusedSession.swimLanes.length,
      status: focusedSession.session.status,
    }),
    buildSpecNode(specSummary),
  ];

  const edges: GraphEdge[] = [
    {
      source: `session:${focusedSession.session.id}`,
      target: "spec",
      weight: Math.max(focusedSession.swimLanes.length, 1),
    },
  ];

  const visit = (treeNode: SessionDrillIn["tree"][number], depth: number) => {
    const preview = findLatestPreview(treeNode.id, focusedOutputs);
    const isRoot = depth === 0;
    nodes.push(
      createNode({
        id: treeNode.id,
        label: truncate(treeNode.name, 38),
        subtitle:
          treeNode.type === "main"
            ? `main agent | ${prettyStatus(treeNode.status)}`
            : `${treeNode.subagent_type || "subagent"} | ${prettyStatus(treeNode.status)}`,
        kind: treeNode.type === "main" ? "main" : "agent",
        layer: depth + 2,
        count: treeNode.children.length,
        status: treeNode.status,
        filterKey: treeNode.type === "main" ? "main" : treeNode.subagent_type || null,
        task: treeNode.task,
        preview,
      })
    );

    if (isRoot) {
      edges.push({ source: "spec", target: treeNode.id, weight: 1 });
    }

    for (const child of treeNode.children) {
      edges.push({ source: treeNode.id, target: child.id, weight: 1 });
      visit(child, depth + 1);
    }
  };

  for (const root of focusedSession.tree) visit(root, 0);

  const laidOut = layoutNodes(nodes);
  const shortId = focusedSession.session.id.slice(0, 8);
  return {
    mode: "session",
    title: `Session ${shortId}`,
    description: "Focused session topology with spec handoff and the freshest agent output inline.",
    nodes: laidOut.nodes,
    edges,
    width: laidOut.width,
    height: laidOut.height,
  };
}

function buildAggregateGraph(
  data: OrchestrationData,
  specSummary?: OrchestrationDAGProps["specSummary"]
): GraphLayout {
  const nodes: GraphNode[] = [
    createNode({
      id: "sessions",
      label: "Sessions",
      subtitle: "aggregate workflow origins",
      kind: "session",
      layer: 0,
      count: data.sessionCount,
    }),
    buildSpecNode(specSummary),
    createNode({
      id: "main",
      label: "Main Agent",
      subtitle: "aggregate top-level coordinator",
      kind: "main",
      layer: 2,
      count: data.mainCount,
      filterKey: "main",
    }),
  ];

  const visibleSubagents = [...data.subagentTypes]
    .sort((left, right) => right.count - left.count)
    .slice(0, MAX_VISIBLE_AGGREGATE_NODES);

  for (const item of visibleSubagents) {
    nodes.push(
      createNode({
        id: `subagent:${item.subagent_type}`,
        label: truncate(item.subagent_type, 34),
        subtitle: `${item.completed} completed | ${item.errors} errors`,
        kind: "aggregate",
        layer: 3,
        count: item.count,
        filterKey: item.subagent_type,
      })
    );
  }

  const edges: GraphEdge[] = [
    { source: "sessions", target: "spec", weight: Math.max(data.sessionCount, 1) },
    { source: "spec", target: "main", weight: Math.max(data.mainCount, 1) },
  ];

  const visibleKeys = new Set(visibleSubagents.map((item) => item.subagent_type));
  const seen = new Set<string>();

  for (const edge of data.edges) {
    if (edge.target !== "main" && !visibleKeys.has(edge.target)) continue;
    const source =
      edge.source === "main" ? "main" : visibleKeys.has(edge.source) ? `subagent:${edge.source}` : null;
    const target =
      edge.target === "main" ? "main" : visibleKeys.has(edge.target) ? `subagent:${edge.target}` : null;
    if (!source || !target) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ source, target, weight: edge.weight });
  }

  for (const item of visibleSubagents) {
    const id = `subagent:${item.subagent_type}`;
    if (!edges.some((edge) => edge.target === id)) {
      edges.push({ source: "main", target: id, weight: Math.max(item.count, 1) });
    }
  }

  const laidOut = layoutNodes(nodes);
  return {
    mode: "aggregate",
    title: "Aggregate live DAG",
    description: "Sessions feed into spec state, then fan out through the live agent execution graph.",
    nodes: laidOut.nodes,
    edges,
    width: laidOut.width,
    height: laidOut.height,
  };
}

function buildGraph(
  data: OrchestrationData,
  focusedSession?: SessionDrillIn | null,
  specSummary?: OrchestrationDAGProps["specSummary"],
  focusedOutputs?: SessionOutputs | null
): GraphLayout {
  if (focusedSession && focusedSession.tree.length > 0) {
    return buildSessionGraph(focusedSession, specSummary, focusedOutputs);
  }
  return buildAggregateGraph(data, specSummary);
}

function edgePath(source: GraphNode, target: GraphNode) {
  const sx = (source.x ?? 0) + source.width;
  const sy = (source.y ?? 0) + source.height / 2;
  const tx = target.x ?? 0;
  const ty = (target.y ?? 0) + target.height / 2;
  const cx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${cx} ${sy}, ${cx} ${ty}, ${tx} ${ty}`;
}

function isEmptyAggregate(data: OrchestrationData) {
  return data.sessionCount === 0 && data.mainCount === 0 && data.subagentTypes.length === 0;
}

function sessionOptionLabel(option: WorkflowData["complexity"][number]) {
  const name = option.name?.trim() || option.id.slice(0, 8);
  const model = option.model?.trim() || "unknown";
  return `${name} | ${option.status} | ${option.agentCount} agents | ${model}`;
}

export function OrchestrationDAG({
  data,
  focusedSession,
  focusedOutputs,
  onNodeClick,
  selectedNode,
  specSummary,
  sessionOptions = [],
  selectedSessionId,
  onSessionChange,
  onJumpToReader,
}: OrchestrationDAGProps) {
  const graph = useMemo(
    () => buildGraph(data, focusedSession, specSummary, focusedOutputs),
    [data, focusedOutputs, focusedSession, specSummary]
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (!focusedSession && isEmptyAggregate(data)) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center rounded-2xl py-20 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-border/70 bg-[rgb(var(--surface-1)/0.42)] backdrop-blur-xl">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="h-6 w-6 text-gray-500"
          >
            <circle cx="6" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="18" cy="12" r="2" />
            <line x1="8" y1="12" x2="10" y2="12" />
            <line x1="14" y1="12" x2="16" y2="12" />
          </svg>
        </div>
        <h3 className="mb-2 text-base font-medium text-gray-300">No workflow graph yet</h3>
        <p className="max-w-sm text-sm text-gray-500">
          As soon as sessions and subagents are recorded, the live DAG will connect sessions to spec state and runtime execution.
        </p>
      </div>
    );
  }

  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const weightMax = Math.max(...graph.edges.map((edge) => edge.weight), 1);

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <label className="text-xs text-gray-400" htmlFor="workflow-session-focus">
            DAG session
          </label>
          <select
            id="workflow-session-focus"
            value={selectedSessionId ?? ""}
            onChange={(event) => onSessionChange?.(event.target.value || null)}
            className="glass-panel min-w-[320px] flex-1 rounded-xl border border-border/70 bg-[rgb(var(--surface-1)/0.34)] px-3 py-2 text-sm text-gray-100 outline-none transition-colors focus:border-accent/40 lg:max-w-[760px]"
          >
            <option value="">Aggregate live DAG</option>
            {sessionOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {sessionOptionLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
          <SummaryPill label="View" value={graph.mode === "session" ? graph.title : "Aggregate"} />
          <SummaryPill label="Nodes" value={String(graph.nodes.length)} />
          <SummaryPill label="Edges" value={String(graph.edges.length)} />
          {specSummary && <SummaryPill label="Ready" value={String(specSummary.ready)} />}
        </div>
      </div>

      <div className="glass-panel rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(15,23,42,0.12))] p-3 backdrop-blur-2xl">
        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            style={{ width: "100%", minWidth: graph.width, height: graph.height, display: "block" }}
            role="img"
            aria-label="Live workflow DAG"
          >
            <defs>
              <marker
                id="workflow-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(74, 222, 128, 0.9)" />
              </marker>
            </defs>

            {graph.edges.map((edge, index) => {
              const source = nodeMap.get(edge.source);
              const target = nodeMap.get(edge.target);
              if (!source || !target) return null;
              const opacity = 0.26 + 0.42 * (edge.weight / weightMax);
              const width = 1.5 + 3.2 * (edge.weight / weightMax);
              return (
                <path
                  key={`${edge.source}-${edge.target}`}
                  d={edgePath(source, target)}
                  fill="none"
                  stroke="rgba(74, 222, 128, 0.9)"
                  strokeOpacity={opacity}
                  strokeWidth={width}
                  strokeDasharray="9 8"
                  className="animate-edge-flow"
                  style={{ animationDelay: `${index * 120}ms` }}
                  markerEnd="url(#workflow-arrow)"
                />
              );
            })}

            {graph.nodes.map((node, index) => {
              const active = Boolean(node.filterKey && selectedNode === node.filterKey);
              const colors = nodeColors(node, active);
              const badge = statusBadge(node);
              const showGlow =
                active ||
                isWorkingStatus(node.status) ||
                Boolean(node.preview) ||
                Boolean(node.kind === "spec" && (node.specMeta?.ready ?? 0) > 0);
              const previewY = node.height - 58;
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                  onMouseEnter={(event) => setTooltip({ node, x: event.clientX, y: event.clientY })}
                  onMouseMove={(event) =>
                    setTooltip((current) =>
                      current ? { ...current, x: event.clientX, y: event.clientY } : current
                    )
                  }
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => {
                    if (node.preview) onJumpToReader?.();
                    if (node.filterKey) onNodeClick?.(node.filterKey);
                  }}
                  style={{ cursor: node.filterKey || node.preview ? "pointer" : "default" }}
                >
                  <g className="animate-node-enter" style={{ animationDelay: `${index * 70}ms` }}>
                    {showGlow && (
                      <rect
                        x={-5}
                        y={-5}
                        width={node.width + 10}
                        height={node.height + 10}
                        rx={18}
                        fill={colors.glow}
                        className="animate-status-glow"
                      />
                    )}
                    <rect
                      width={node.width}
                      height={node.height}
                      rx={16}
                      fill={colors.fill}
                      stroke={colors.border}
                      strokeWidth={active ? 2 : 1.25}
                    />
                    <text x={14} y={26} fill={colors.title} fontSize="12" fontWeight="600">
                      {truncate(node.label, 42)}
                    </text>
                    <text
                      x={14}
                      y={46}
                      fill={colors.subtitle}
                      fontSize="10"
                    >
                      {truncate(node.subtitle, Math.max(24, Math.floor((node.width - 84) / 6)))}
                    </text>

                    {node.kind === "spec" && node.specMeta && (
                      <>
                        <MiniPill
                          x={14}
                          y={64}
                          label="Active"
                          value={String(node.specMeta.active)}
                          fill="rgba(96, 165, 250, 0.12)"
                          stroke="rgba(96, 165, 250, 0.28)"
                          color="#dbeafe"
                        />
                        <MiniPill
                          x={88}
                          y={64}
                          label="Ready"
                          value={String(node.specMeta.ready)}
                          fill="rgba(34, 197, 94, 0.12)"
                          stroke="rgba(34, 197, 94, 0.28)"
                          color="#dcfce7"
                        />
                      </>
                    )}

                    {badge && (
                      <>
                        <rect
                          x={node.width - BADGE_WIDTH - 14}
                          y={12}
                          width={BADGE_WIDTH}
                          height={18}
                          rx={9}
                          fill={colors.badgeFill}
                          stroke={colors.border}
                          strokeOpacity={0.6}
                        />
                        <text
                          x={node.width - BADGE_WIDTH / 2 - 14}
                          y={25}
                          textAnchor="middle"
                          fill={colors.badgeText}
                          fontSize="9"
                          fontWeight="600"
                        >
                          {truncate(badge, 10)}
                        </text>
                      </>
                    )}

                    {node.preview && (
                      <>
                        <rect
                          x={12}
                          y={previewY}
                          width={node.width - 24}
                          height={44}
                          rx={12}
                          fill={colors.previewFill}
                          stroke={colors.previewBorder}
                        />
                        <text x={22} y={previewY + 14} fill="#cbd5e1" fontSize="9" fontWeight="600">
                          {node.preview.title}
                        </text>
                        <text x={22} y={previewY + 28} fill="#f8fafc" fontSize="9.5">
                          {truncate(node.preview.excerpt, Math.max(30, Math.floor((node.width - 48) / 5.3)))}
                        </text>
                        <text x={22} y={previewY + 39} fill="#86efac" fontSize="8.5" fontWeight="600">
                          Jump to full output
                        </text>
                      </>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600">Legend</span>
        <LegendDot color="rgba(3, 46, 28, 0.82)" border="rgba(34, 197, 94, 0.52)" label="Session" />
        <LegendDot color="rgba(20, 36, 78, 0.78)" border="rgba(96, 165, 250, 0.52)" label="Spec" />
        <LegendDot color="rgba(8, 32, 24, 0.78)" border="rgba(74, 222, 128, 0.44)" label="Main agent" />
        <LegendDot color="rgba(8, 24, 18, 0.76)" border="rgba(34, 197, 94, 0.42)" label="Teammate" />
        <span className="rounded-full border border-border/70 bg-[rgb(var(--surface-1)/0.34)] px-2.5 py-1 text-[11px] text-gray-500 backdrop-blur-xl">
          flowing edge = live parent-child link
        </span>
      </div>

      {tooltip && <GraphTooltip tooltip={tooltip} />}
    </div>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-full border border-border/70 bg-[rgb(var(--surface-1)/0.34)] px-3 py-1.5 backdrop-blur-xl">
      <span className="mr-1 text-gray-500">{label}</span>
      <span className="text-gray-200">{value}</span>
    </span>
  );
}

function MiniPill({
  x,
  y,
  label,
  value,
  fill,
  stroke,
  color,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  fill: string;
  stroke: string;
  color: string;
}) {
  return (
    <>
      <rect x={x} y={y} width={62} height={20} rx={10} fill={fill} stroke={stroke} />
      <text x={x + 10} y={y + 13} fill={color} fontSize="8.5" fontWeight="600">
        {label}
      </text>
      <text x={x + 50} y={y + 13} fill={color} fontSize="8.5" fontWeight="700" textAnchor="end">
        {value}
      </text>
    </>
  );
}

function LegendDot({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <div className="rounded-full border border-border/70 bg-[rgb(var(--surface-1)/0.32)] px-2.5 py-1 backdrop-blur-xl">
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-3 w-3 rounded-sm"
          style={{ backgroundColor: color, border: `1px solid ${border}` }}
        />
        <span className="text-[11px] text-gray-500">{label}</span>
      </div>
    </div>
  );
}

function GraphTooltip({ tooltip }: { tooltip: TooltipState }) {
  const nearRight = typeof window !== "undefined" && tooltip.x > window.innerWidth - 280;

  return (
    <div
      className="tooltip-panel pointer-events-none fixed z-50 min-w-[220px] rounded-lg px-3 py-2"
      style={{
        left: nearRight ? tooltip.x - 16 : tooltip.x + 16,
        top: tooltip.y - 8,
        transform: nearRight ? "translateX(-100%)" : undefined,
      }}
    >
      <p className="tooltip-title mb-1 text-xs font-semibold">{tooltip.node.label}</p>
      <div className="space-y-1 text-[11px]">
        <TooltipRow label="Role" value={tooltip.node.subtitle} />
        {tooltip.node.status && (
          <TooltipRow label="Status" value={prettyStatus(tooltip.node.status)} />
        )}
        {typeof tooltip.node.count === "number" && (
          <TooltipRow
            label={
              tooltip.node.kind === "session"
                ? "Agents"
                : tooltip.node.kind === "spec"
                  ? "Changes"
                  : "Children"
            }
            value={String(tooltip.node.count)}
          />
        )}
        {tooltip.node.task && <TooltipRow label="Task" value={truncate(tooltip.node.task, 80)} />}
        {tooltip.node.preview && <TooltipRow label="Latest" value={tooltip.node.preview.excerpt} />}
      </div>
    </div>
  );
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="tooltip-label">{label}</span>
      <span className="tooltip-value text-right font-medium">{value}</span>
    </div>
  );
}
