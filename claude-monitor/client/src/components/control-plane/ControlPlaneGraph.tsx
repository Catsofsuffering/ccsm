import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ControlPlaneGraphEdge,
  ControlPlaneGraphNode,
} from "../../lib/types";

interface ControlPlaneGraphProps {
  projectKey: string;
  nodes: ControlPlaneGraphNode[];
  edges: ControlPlaneGraphEdge[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

interface PositionedNode extends ControlPlaneGraphNode {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragState = {
  id: string;
  pointerOffsetX: number;
  pointerOffsetY: number;
};

const STORAGE_PREFIX = "control-plane-layout";
const NODE_WIDTH = 214;
const NODE_HEIGHT = 76;
const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 110;
const PADDING_X = 28;
const PADDING_Y = 32;

function statusColors(status: string) {
  if (status === "completed") {
    return {
      border: "rgb(34 197 94 / 0.45)",
      fill: "rgb(22 101 52 / 0.18)",
      text: "rgb(220 252 231)",
      subtitle: "rgb(134 239 172)",
    };
  }

  if (status === "ready" || status === "active") {
    return {
      border: "rgb(34 197 94 / 0.75)",
      fill: "rgb(20 83 45 / 0.24)",
      text: "rgb(240 253 244)",
      subtitle: "rgb(187 247 208)",
    };
  }

  if (status === "pending") {
    return {
      border: "rgb(115 115 115 / 0.55)",
      fill: "rgb(38 38 38 / 0.7)",
      text: "rgb(245 245 245)",
      subtitle: "rgb(163 163 163)",
    };
  }

  return {
    border: "rgb(82 82 91 / 0.9)",
    fill: "rgb(24 24 27 / 0.75)",
    text: "rgb(244 244 245)",
    subtitle: "rgb(161 161 170)",
  };
}

function nodeTypeLabel(kind: ControlPlaneGraphNode["kind"]) {
  switch (kind) {
    case "project":
      return "Project";
    case "artifact":
      return "Artifact";
    case "task":
      return "Dispatch";
    case "session":
      return "Run";
    case "worker":
      return "Worker";
    default:
      return kind;
  }
}

function buildDefaultLayout(nodes: ControlPlaneGraphNode[]) {
  const rowsPerColumn = new Map<number, number>();
  return nodes.reduce<Record<string, { x: number; y: number }>>((acc, node) => {
    const row = rowsPerColumn.get(node.column) || 0;
    rowsPerColumn.set(node.column, row + 1);
    acc[node.id] = {
      x: PADDING_X + node.column * COLUMN_WIDTH,
      y: PADDING_Y + row * ROW_HEIGHT,
    };
    return acc;
  }, {});
}

function loadLayout(projectKey: string) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${projectKey}`);
    return raw ? JSON.parse(raw) as Record<string, { x: number; y: number }> : null;
  } catch {
    return null;
  }
}

function persistLayout(projectKey: string, positions: Record<string, { x: number; y: number }>) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${projectKey}`, JSON.stringify(positions));
  } catch {}
}

export function ControlPlaneGraph({
  projectKey,
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: ControlPlaneGraphProps) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    loadLayout(projectKey) || buildDefaultLayout(nodes)
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setPositions((current) => {
      const defaults = buildDefaultLayout(nodes);
      const next = { ...defaults, ...current };
      for (const key of Object.keys(next)) {
        if (!nodes.some((node) => node.id === key)) delete next[key];
      }
      return next;
    });
  }, [nodes]);

  useEffect(() => {
    persistLayout(projectKey, positions);
  }, [positions, projectKey]);

  const positionedNodes = useMemo<PositionedNode[]>(() => {
    return nodes.map((node) => ({
      ...node,
      x: positions[node.id]?.x ?? PADDING_X,
      y: positions[node.id]?.y ?? PADDING_Y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));
  }, [nodes, positions]);

  const nodeMap = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes]
  );

  const graphBounds = useMemo(() => {
    const maxX = Math.max(...positionedNodes.map((node) => node.x + node.width), 720);
    const maxY = Math.max(...positionedNodes.map((node) => node.y + node.height), 420);
    return { width: maxX + 40, height: maxY + 40 };
  }, [positionedNodes]);

  useEffect(() => {
    if (!drag) return;
    const activeDrag = drag;

    function handlePointerMove(event: PointerEvent) {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const bounds = viewport.getBoundingClientRect();
      const nextX = Math.max(12, event.clientX - bounds.left + viewport.scrollLeft - activeDrag.pointerOffsetX);
      const nextY = Math.max(12, event.clientY - bounds.top + viewport.scrollTop - activeDrag.pointerOffsetY);

      setPositions((current) => ({
        ...current,
        [activeDrag.id]: { x: nextX, y: nextY },
      }));
    }

    function handlePointerUp() {
      setDrag(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [drag]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
        <p>Drag nodes to adjust local layout. Layout edits stay in browser storage and do not rewrite OpenSpec state.</p>
        <button
          type="button"
          onClick={() => setPositions(buildDefaultLayout(nodes))}
          className="rounded-md border border-border px-2.5 py-1.5 text-gray-300 hover:text-gray-100 hover:border-accent/40 transition-colors"
        >
          Reset layout
        </button>
      </div>

      <div
        ref={viewportRef}
        className="rounded-xl border border-border bg-surface-1 overflow-auto"
      >
        <svg
          width={graphBounds.width}
          height={graphBounds.height}
          viewBox={`0 0 ${graphBounds.width} ${graphBounds.height}`}
          className="block min-w-full"
        >
          <defs>
            <pattern id="grid-pattern" width="28" height="28" patternUnits="userSpaceOnUse">
              <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(82,82,91,0.18)" strokeWidth="1" />
            </pattern>
          </defs>

          <rect width={graphBounds.width} height={graphBounds.height} fill="url(#grid-pattern)" />

          {edges.map((edge) => {
            const source = nodeMap.get(edge.source);
            const target = nodeMap.get(edge.target);
            if (!source || !target) return null;

            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const controlX = (startX + endX) / 2;

            return (
              <path
                key={edge.id}
                d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                fill="none"
                stroke={edge.kind === "dispatch" ? "rgba(34,197,94,0.55)" : "rgba(113,113,122,0.7)"}
                strokeWidth={edge.kind === "dispatch" ? 2.2 : 1.6}
              />
            );
          })}

          {positionedNodes.map((node) => {
            const palette = statusColors(node.status);
            const isSelected = selectedNodeId === node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelectNode(node.id)}
                className="cursor-pointer"
                data-testid={`control-plane-node-${node.id}`}
              >
                <rect
                  width={node.width}
                  height={node.height}
                  rx="14"
                  fill={palette.fill}
                  stroke={isSelected ? "rgb(74 222 128)" : palette.border}
                  strokeWidth={isSelected ? 2.5 : 1.3}
                />
                <rect
                  x="14"
                  y="14"
                  width="54"
                  height="20"
                  rx="10"
                  fill="rgba(24,24,27,0.58)"
                  stroke="rgba(161,161,170,0.25)"
                />
                <text x="41" y="28" textAnchor="middle" fontSize="10" fill={palette.subtitle} style={{ textTransform: "uppercase", letterSpacing: "0.14em" }}>
                  {nodeTypeLabel(node.kind)}
                </text>
                <text x="14" y="50" fontSize="14" fill={palette.text} style={{ fontWeight: 600 }}>
                  {node.label.length > 24 ? `${node.label.slice(0, 23)}…` : node.label}
                </text>
                <text x="14" y="66" fontSize="11" fill={palette.subtitle}>
                  {node.subtitle.length > 32 ? `${node.subtitle.slice(0, 31)}…` : node.subtitle}
                </text>
                <rect
                  x={node.width - 38}
                  y={14}
                  width="22"
                  height="22"
                  rx="8"
                  fill="rgba(34,197,94,0.12)"
                  stroke="rgba(34,197,94,0.22)"
                  data-testid={`control-plane-drag-${node.id}`}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const svgBounds = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    setDrag({
                      id: node.id,
                      pointerOffsetX: event.clientX - svgBounds.left - node.x,
                      pointerOffsetY: event.clientY - svgBounds.top - node.y,
                    });
                  }}
                />
                <path
                  d={`M ${node.width - 31} 22 L ${node.width - 23} 22 M ${node.width - 31} 26 L ${node.width - 23} 26 M ${node.width - 31} 30 L ${node.width - 23} 30`}
                  stroke="rgba(187,247,208,0.85)"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
