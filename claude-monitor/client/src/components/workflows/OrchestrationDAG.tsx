import { useMemo, useState } from "react";
import type { OrchestrationData, SessionDrillIn } from "../../lib/types";

interface OrchestrationDAGProps {
  data: OrchestrationData;
  focusedSession?: SessionDrillIn | null;
  onNodeClick?: (nodeType: string) => void;
  selectedNode?: string | null;
  specSummary?: {
    total: number;
    active: number;
    ready: number;
    highlight?: string | null;
  };
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

const NODE_HEIGHT = 68;
const BASE_NODE_WIDTH = 188;
const MAX_NODE_WIDTH = 320;
const BADGE_WIDTH = 52;
const LAYER_GAP = 88;
const ROW_GAP = 18;
const PADDING_X = 20;
const PADDING_Y = 28;
const MIN_GRAPH_HEIGHT = 320;
const MAX_VISIBLE_AGGREGATE_NODES = 8;

function truncate(value: string, max = 34) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function visualLength(value: string) {
  return [...value].reduce((sum, char) => sum + (/[\u0000-\u00ff]/.test(char) ? 1 : 2), 0);
}

function prettyStatus(status: string) {
  return status.replace(/_/g, " ");
}

function computeNodeWidth(label: string, subtitle: string) {
  const labelWidth = visualLength(label) * 7.2;
  const subtitleWidth = visualLength(subtitle) * 6.1;
  return Math.max(
    BASE_NODE_WIDTH,
    Math.min(MAX_NODE_WIDTH, Math.ceil(Math.max(labelWidth, subtitleWidth) + 80))
  );
}

function createNode(input: Omit<GraphNode, "width" | "height">): GraphNode {
  return {
    ...input,
    width: computeNodeWidth(input.label, input.subtitle),
    height: NODE_HEIGHT,
  };
}

function nodeColors(node: GraphNode, active: boolean) {
  const base = {
    fill: "#111827",
    border: active ? "#22c55e" : "#374151",
    title: "#f3f4f6",
    subtitle: "#9ca3af",
    badgeFill: active ? "rgba(34,197,94,0.18)" : "rgba(55,65,81,0.5)",
    badgeText: active ? "#86efac" : "#d1d5db",
  };

  if (node.kind === "session") {
    return {
      ...base,
      fill: "#052e16",
      border: active ? "#4ade80" : "#16a34a",
      title: "#dcfce7",
      subtitle: "#86efac",
      badgeFill: "rgba(34,197,94,0.16)",
      badgeText: "#bbf7d0",
    };
  }

  if (node.kind === "spec") {
    return {
      ...base,
      fill: "#172554",
      border: active ? "#60a5fa" : "#3b82f6",
      title: "#dbeafe",
      subtitle: "#93c5fd",
      badgeFill: "rgba(59,130,246,0.18)",
      badgeText: "#bfdbfe",
    };
  }

  if (node.kind === "main") {
    return {
      ...base,
      fill: "#0f172a",
      border: active ? "#4ade80" : "#22c55e",
      title: "#f0fdf4",
      subtitle: "#a7f3d0",
      badgeFill: "rgba(34,197,94,0.16)",
      badgeText: "#bbf7d0",
    };
  }

  if (node.status === "error") {
    return {
      ...base,
      fill: "#1f2937",
      border: "#9ca3af",
      badgeFill: "rgba(156,163,175,0.18)",
      badgeText: "#f3f4f6",
    };
  }

  if (node.status === "completed") {
    return {
      ...base,
      fill: "#111827",
      border: active ? "#22c55e" : "#4b5563",
      badgeFill: active ? "rgba(34,197,94,0.16)" : "rgba(75,85,99,0.45)",
    };
  }

  return {
    ...base,
    fill: "#0f172a",
    border: active ? "#22c55e" : "#16a34a",
    badgeFill: active ? "rgba(34,197,94,0.16)" : "rgba(22,163,74,0.14)",
    badgeText: active ? "#bbf7d0" : "#86efac",
  };
}

function statusBadge(node: GraphNode) {
  if (node.kind === "spec" && typeof node.count === "number") {
    return `${node.count}`;
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
  const maxRows = Math.max(...sortedLayers.map(([, layer]) => layer.length), 1);
  const height = Math.max(
    MIN_GRAPH_HEIGHT,
    PADDING_Y * 2 + maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP
  );

  let currentX = PADDING_X;
  for (const [, layerNodes] of sortedLayers) {
    const maxWidth = Math.max(...layerNodes.map((node) => node.width));
    const totalLayerHeight =
      layerNodes.length * NODE_HEIGHT + Math.max(0, layerNodes.length - 1) * ROW_GAP;
    const startY = (height - totalLayerHeight) / 2;
    layerNodes.forEach((node, index) => {
      node.x = currentX;
      node.y = startY + index * (NODE_HEIGHT + ROW_GAP);
    });
    currentX += maxWidth + LAYER_GAP;
  }

  return { nodes, width: currentX - LAYER_GAP + PADDING_X, height };
}

function buildSpecNode(specSummary?: OrchestrationDAGProps["specSummary"]): GraphNode {
  const highlight = specSummary?.highlight?.trim();
  const label = highlight || "Spec";
  const subtitle = highlight
    ? `${specSummary?.ready ?? 0} ready to apply`
    : `${specSummary?.active ?? 0} active changes · ${specSummary?.ready ?? 0} ready`;

  return createNode({
    id: "spec",
    label,
    subtitle,
    kind: "spec",
    layer: 1,
    count: specSummary?.total ?? 0,
    filterKey: "spec",
  });
}

function buildSessionGraph(
  focusedSession: SessionDrillIn,
  specSummary?: OrchestrationDAGProps["specSummary"]
): GraphLayout {
  const nodes: GraphNode[] = [
    createNode({
      id: `session:${focusedSession.session.id}`,
      label: truncate(focusedSession.session.name ?? focusedSession.session.id, 36),
      subtitle: `${prettyStatus(focusedSession.session.status)} · ${focusedSession.session.model ?? "unknown model"}`,
      kind: "session",
      layer: 0,
      count: focusedSession.swimLanes.length,
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
    const isRoot = depth === 0;
    nodes.push(
      createNode({
        id: treeNode.id,
        label: truncate(treeNode.name, 38),
        subtitle:
          treeNode.type === "main"
            ? `main agent · ${prettyStatus(treeNode.status)}`
            : `${treeNode.subagent_type || "subagent"} · ${prettyStatus(treeNode.status)}`,
        kind: treeNode.type === "main" ? "main" : "agent",
        layer: depth + 2,
        count: treeNode.children.length,
        status: treeNode.status,
        filterKey: treeNode.type === "main" ? "main" : treeNode.subagent_type || null,
        task: treeNode.task,
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
  return {
    mode: "session",
    title: focusedSession.session.name ?? focusedSession.session.id,
    description: `Focused session topology with spec handoff · ${focusedSession.session.id}`,
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
        subtitle: `${item.completed} completed · ${item.errors} errors`,
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
    title: "Live DAG",
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
  specSummary?: OrchestrationDAGProps["specSummary"]
): GraphLayout {
  if (focusedSession && focusedSession.tree.length > 0) {
    return buildSessionGraph(focusedSession, specSummary);
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

export function OrchestrationDAG({
  data,
  focusedSession,
  onNodeClick,
  selectedNode,
  specSummary,
}: OrchestrationDAGProps) {
  const graph = useMemo(
    () => buildGraph(data, focusedSession, specSummary),
    [data, focusedSession, specSummary]
  );
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (!focusedSession && isEmptyAggregate(data)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-4">
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
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/70 pb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
            {graph.mode === "session" ? "Focused Live DAG" : "Aggregate Live DAG"}
          </p>
          <p className="mt-2 text-sm font-semibold text-gray-100">
            {graph.title}
          </p>
          <p className="mt-1 text-xs text-gray-500">{graph.description}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
          <span className="rounded-full border border-border bg-surface-1 px-2.5 py-1">
            {graph.nodes.length} nodes
          </span>
          <span className="rounded-full border border-border bg-surface-1 px-2.5 py-1">
            {graph.edges.length} edges
          </span>
          <span className="rounded-full border border-border bg-surface-1 px-2.5 py-1">
            {graph.title}
          </span>
        </div>
      </div>

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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#16a34a" opacity="0.8" />
            </marker>
          </defs>

          {graph.edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;
            const opacity = 0.25 + 0.45 * (edge.weight / weightMax);
            const width = 1.5 + 4 * (edge.weight / weightMax);
            return (
              <path
                key={`${edge.source}-${edge.target}`}
                d={edgePath(source, target)}
                fill="none"
                stroke="#16a34a"
                strokeOpacity={opacity}
                strokeWidth={width}
                markerEnd="url(#workflow-arrow)"
              />
            );
          })}

          {graph.nodes.map((node) => {
            const active = Boolean(node.filterKey && selectedNode === node.filterKey);
            const colors = nodeColors(node, active);
            const badge = statusBadge(node);
            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                onMouseEnter={(event) =>
                  setTooltip({ node, x: event.clientX, y: event.clientY })
                }
                onMouseMove={(event) =>
                  setTooltip((current) =>
                    current ? { ...current, x: event.clientX, y: event.clientY } : current
                  )
                }
                onMouseLeave={() => setTooltip(null)}
                onClick={() => {
                  if (node.filterKey) onNodeClick?.(node.filterKey);
                }}
                style={{ cursor: node.filterKey ? "pointer" : "default" }}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  rx={12}
                  fill={colors.fill}
                  stroke={colors.border}
                  strokeWidth={active ? 2 : 1.25}
                />
                <text x={12} y={24} fill={colors.title} fontSize="12" fontWeight="600">
                  {truncate(node.label, 40)}
                </text>
                <text x={12} y={44} fill={colors.subtitle} fontSize="10">
                  {truncate(node.subtitle, Math.max(20, Math.floor((node.width - 70) / 6)))}
                </text>
                {badge && (
                  <>
                    <rect
                      x={node.width - BADGE_WIDTH - 12}
                      y={10}
                      width={BADGE_WIDTH}
                      height={18}
                      rx={9}
                      fill={colors.badgeFill}
                      stroke={colors.border}
                      strokeOpacity={0.6}
                    />
                    <text
                      x={node.width - BADGE_WIDTH / 2 - 12}
                      y={23}
                      textAnchor="middle"
                      fill={colors.badgeText}
                      fontSize="9"
                      fontWeight="600"
                    >
                      {truncate(badge, 10)}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1">
        <span className="text-[10px] font-medium uppercase tracking-widest text-gray-600">Legend</span>
        <LegendDot color="#052e16" border="#16a34a" label="Session" />
        <LegendDot color="#172554" border="#3b82f6" label="Spec" />
        <LegendDot color="#0f172a" border="#22c55e" label="Main agent" />
        <LegendDot color="#0f172a" border="#16a34a" label="Teammate / subagent" />
        <div className="ml-2 flex items-center gap-1.5">
          <span className="inline-block h-[2px] w-8 rounded bg-accent" />
          <span className="text-[11px] text-gray-500">
            {graph.mode === "session" ? "Live parent-child link" : "Aggregate relationship"}
          </span>
        </div>
      </div>

      {tooltip && <GraphTooltip tooltip={tooltip} />}
    </div>
  );
}

function LegendDot({ color, border, label }: { color: string; border: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm"
        style={{ backgroundColor: color, border: `1px solid ${border}` }}
      />
      <span className="text-[11px] text-gray-500">{label}</span>
    </div>
  );
}

function GraphTooltip({ tooltip }: { tooltip: TooltipState }) {
  const nearRight = typeof window !== "undefined" && tooltip.x > window.innerWidth - 260;

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
            label={tooltip.node.kind === "session" ? "Agents" : tooltip.node.kind === "spec" ? "Changes" : "Children"}
            value={String(tooltip.node.count)}
          />
        )}
        {tooltip.node.task && <TooltipRow label="Task" value={truncate(tooltip.node.task, 80)} />}
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
