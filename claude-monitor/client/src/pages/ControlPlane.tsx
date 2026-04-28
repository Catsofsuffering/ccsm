import { useEffect, useMemo, useState } from "react";
import { Activity, Cpu, GitBranch, RefreshCw, SquareTerminal } from "lucide-react";
import { api } from "../lib/api";
import type {
  ControlPlaneActivityItem,
  ControlPlaneBlackboardEntry,
  ControlPlaneOverviewData,
  ControlPlaneProjectData,
  ControlPlaneWorkerHealth,
} from "../lib/types";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/EmptyState";
import { ControlPlaneGraph } from "../components/control-plane/ControlPlaneGraph";
import { timeAgo } from "../lib/format";

const ACTION_LABELS = {
  replay: "Replay",
  reopen: "Reopen",
} as const;

function phaseLabel(phase: string) {
  return phase.replace(/-/g, " ");
}

function badgeClass(status: string | null | undefined) {
  const value = String(status || "").toLowerCase();
  if (["active", "running", "ready", "completed"].includes(value)) {
    return "text-accent";
  }
  if (["failed", "error", "offline"].includes(value)) {
    return "text-gray-200";
  }
  if (["blocked", "degraded"].includes(value)) {
    return "text-yellow-300";
  }
  return "text-gray-500";
}

function activityLabel(type: ControlPlaneActivityItem["type"]) {
  switch (type) {
    case "event":
      return "Runtime";
    case "dispatch":
      return "Dispatch";
    case "action":
      return "Operator";
    default:
      return type;
  }
}

function BlackboardSection({
  title,
  entries,
}: {
  title: string;
  entries: ControlPlaneBlackboardEntry[];
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
        <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{entries.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-gray-500">
            No entries recorded
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-border bg-surface-2 px-3 py-3">
              <div className="text-sm text-gray-100">{entry.label}</div>
              {(entry.value || entry.status || entry.kind) && (
                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-gray-500">
                  {[entry.kind, entry.status, entry.value].filter(Boolean).join(" / ")}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function WorkerHealthPanel({ health }: { health: ControlPlaneWorkerHealth[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <Cpu className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-gray-100">Worker Health</h2>
      </div>
      <div className="mt-4 space-y-3">
        {health.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-gray-500">
            No worker runtime signals have been observed yet.
          </div>
        ) : (
          health.map((worker) => (
            <div key={worker.id} className="rounded-xl border border-border bg-surface-2 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-100">{worker.label}</div>
                  <div className="mt-1 text-[11px] text-gray-500">
                    {worker.adapterId} / {worker.transport} / source: {worker.source}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-[0.16em] ${badgeClass(worker.health)}`}>
                  {worker.health}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                <div>{worker.activeSessions} active sessions</div>
                <div>{worker.runningAgents} running agents</div>
                <div>{worker.runningDispatches} running dispatches</div>
                <div>{worker.failedDispatches} failed dispatches</div>
              </div>

              <div className="mt-3 text-xs text-gray-400">{worker.summary}</div>

              <div className="mt-2 text-[11px] text-gray-500">
                Launch: {worker.launchReady ? "ready" : "scaffolded"} / command: {worker.command}
              </div>
              {worker.observedModels.length > 0 && (
                <div className="mt-1 text-[11px] text-gray-500">
                  Models: {worker.observedModels.join(", ")}
                </div>
              )}
              {worker.lastActivity && (
                <div className="mt-1 text-[11px] text-gray-500">Last activity {timeAgo(worker.lastActivity)}</div>
              )}
              {worker.lastError && (
                <div className="mt-2 text-xs text-gray-400">{worker.lastError}</div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ActivityFeed({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: ControlPlaneActivityItem[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-surface-2 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-100">{item.title}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-gray-500">
                    {activityLabel(item.type)}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-[0.16em] ${badgeClass(item.status)}`}>
                  {item.status || "recorded"}
                </span>
              </div>
              {item.detail && (
                <div className="mt-2 text-xs text-gray-400">{item.detail}</div>
              )}
              <div className="mt-2 text-[11px] text-gray-500">
                {timeAgo(item.timestamp)}
                {item.runtime ? ` / ${item.runtime}` : ""}
                {item.sessionId ? ` / ${item.sessionId}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function NodeDetail({
  project,
  selectedNodeId,
  onAction,
  actionPending,
}: {
  project: ControlPlaneProjectData;
  selectedNodeId: string | null;
  onAction: (actionType: "replay" | "reopen") => Promise<void>;
  actionPending: boolean;
}) {
  const node = useMemo(
    () => project.graph.nodes.find((item) => item.id === selectedNodeId) || null,
    [project.graph.nodes, selectedNodeId]
  );
  const recentActions = useMemo(
    () => project.actions.filter((action) => action.nodeId === selectedNodeId).slice(0, 5),
    [project.actions, selectedNodeId]
  );
  const recentDispatches = useMemo(
    () => project.dispatches.filter((intent) => intent.nodeId === selectedNodeId).slice(0, 5),
    [project.dispatches, selectedNodeId]
  );
  const nodeActivity = useMemo(
    () =>
      project.activity
        .filter((item) => selectedNodeId && item.relatedNodeIds.includes(selectedNodeId))
        .slice(0, 8),
    [project.activity, selectedNodeId]
  );
  const actionOptions = useMemo(
    () => (["replay", "reopen"] as const).filter((actionType) => node?.routing.availableActions.includes(actionType)),
    [node]
  );

  if (!node) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-4 text-sm text-gray-500">
        Select a graph node to inspect its current status, routing preview, and recent control-plane activity.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-4">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-accent">{node.kind}</div>
        <h3 className="mt-2 text-lg font-semibold text-gray-100">{node.label}</h3>
        <p className="mt-1 text-sm text-gray-400">{node.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Status</div>
          <div className={`mt-1 text-sm ${badgeClass(node.status)}`}>{node.status}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Dispatcher Phase</div>
          <div className="mt-1 text-sm capitalize text-gray-100">{phaseLabel(node.dispatcherPhase)}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Graph Column</div>
          <div className="mt-1 text-sm text-gray-100">{node.column + 1}</div>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Default Action</div>
          <div className="mt-1 text-sm text-gray-100">
            {node.routing.defaultActionType ? ACTION_LABELS[node.routing.defaultActionType] : "Unavailable"}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-3 text-sm text-gray-400">
        This view is layout-safe: drag operations only change client-side graph arrangement. Durable lifecycle state stays anchored to OpenSpec plus runtime events.
      </div>

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Routing Preview</div>
        <div className="mt-3 space-y-2">
          {actionOptions.map((actionType) => {
            const preview = node.routing.byAction[actionType];
            return (
              <div key={actionType} className="rounded-md border border-border bg-surface-1 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-100">{ACTION_LABELS[actionType]}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-accent">
                    {preview?.preferredAdapterId || "unavailable"}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {preview?.preferredRuntime || "no runtime"} / {preview?.command || "no command"}
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {preview?.reason || "No dispatch preview available."}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {node.intervention && (
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
          <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Latest Intervention</div>
          <div className="mt-2 text-sm text-gray-100">
            {ACTION_LABELS[node.intervention.actionType]} / {node.intervention.status}
          </div>
          <div className="mt-1 text-[11px] text-gray-500">{timeAgo(node.intervention.createdAt)}</div>
          {node.intervention.notes && (
            <div className="mt-1 text-sm text-gray-400">{node.intervention.notes}</div>
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          onClick={() => onAction("replay")}
          disabled={actionPending || !node.routing.availableActions.includes("replay")}
        >
          Replay Node
        </Button>
        <Button
          variant="outline"
          onClick={() => onAction("reopen")}
          disabled={actionPending || !node.routing.availableActions.includes("reopen")}
        >
          Reopen Branch
        </Button>
      </div>

      <ActivityFeed
        title="Recent Activity And Logs"
        items={nodeActivity}
        emptyMessage="No activity has been linked to this node yet."
      />

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Recent Operator Actions</div>
        <div className="mt-3 space-y-2">
          {recentActions.length === 0 ? (
            <div className="text-sm text-gray-500">No operator actions have been recorded for this node yet.</div>
          ) : (
            recentActions.map((action) => (
              <div key={action.id} className="rounded-md border border-border bg-surface-1 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-100">{action.actionType}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-accent">{action.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {timeAgo(action.createdAt)} / {action.source}
                </div>
                {action.payload?.dispatch && (
                  <div className="mt-1 text-[11px] text-gray-500">
                    Dispatch: {action.payload.dispatch.preferredAdapterId || "unavailable"} / {action.payload.dispatch.preferredRuntime || "no runtime"}
                  </div>
                )}
                {action.notes && (
                  <div className="mt-1 text-sm text-gray-400">{action.notes}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
        <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Dispatch Intents</div>
        <div className="mt-3 space-y-2">
          {recentDispatches.length === 0 ? (
            <div className="text-sm text-gray-500">No dispatch intents have been created for this node yet.</div>
          ) : (
            recentDispatches.map((intent) => (
              <div key={intent.id} className="rounded-md border border-border bg-surface-1 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-100">{ACTION_LABELS[intent.actionType]}</span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-accent">{intent.status}</span>
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {intent.adapterId || "unassigned"} / {intent.runtime || "no runtime"}
                </div>
                <div className="mt-1 text-[11px] text-gray-500">
                  {intent.startedAt ? `Started ${timeAgo(intent.startedAt)}` : `Created ${timeAgo(intent.createdAt)}`}
                </div>
                {intent.error && (
                  <div className="mt-1 text-sm text-gray-400">{intent.error}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export function ControlPlane() {
  const [overview, setOverview] = useState<ControlPlaneOverviewData | null>(null);
  const [project, setProject] = useState<ControlPlaneProjectData | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProject(projectName: string) {
    setProjectLoading(true);
    try {
      const next = await api.controlPlane.project(projectName);
      setProject(next);
      setSelectedNodeId(next.graph.nodes[0]?.id || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project graph");
    } finally {
      setProjectLoading(false);
    }
  }

  async function loadOverview(preferredProject?: string | null) {
    setLoading(true);
    try {
      const next = await api.controlPlane.overview();
      setOverview(next);
      const projectName = preferredProject || selectedProject || next.projects[0]?.name || null;
      setSelectedProject(projectName);
      setError(null);
      if (projectName) {
        await loadProject(projectName);
      } else {
        setProject(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load control-plane overview");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOverview();
    const interval = setInterval(() => {
      loadOverview(selectedProject);
    }, 15000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleNodeAction(actionType: "replay" | "reopen") {
    if (!project || !selectedNodeId) return;
    setActionPending(true);
    try {
      await api.controlPlane.action(project.project.name, {
        nodeId: selectedNodeId,
        actionType,
      });
      await loadProject(project.project.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record operator action");
    } finally {
      setActionPending(false);
    }
  }

  if (!loading && error && !overview) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-100">Control Plane</h1>
            <p className="mt-1 text-sm text-gray-500">OpenSpec-backed orchestration workspace</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => loadOverview()}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>

        <EmptyState
          icon={GitBranch}
          title="Control-plane state is unavailable"
          description={error}
          action={
            <Button variant="primary" onClick={() => loadOverview()}>
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-accent">
            <GitBranch className="w-3.5 h-3.5" />
            OpenSpec Control Plane
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-100">Dynamic orchestration workspace</h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-400">
            OpenSpec provides durable project state, the dispatcher derives live DAG structure, and worker sessions surface runtime activity. This workspace keeps graph layout local while treating lifecycle state as a blackboard anchored in the project.
          </p>
          {overview?.workspaceRoot && (
            <p className="mt-2 text-xs text-gray-500">{overview.workspaceRoot}</p>
          )}
        </div>

        <Button variant="ghost" size="sm" onClick={() => loadOverview(selectedProject)}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading || projectLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {overview?.summary && (
        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: "Projects", value: overview.summary.totalProjects },
            { label: "Active", value: overview.summary.activeProjects },
            { label: "Ready", value: overview.summary.readyProjects },
            { label: "Active Workers", value: overview.summary.activeWorkers },
            { label: "Available Adapters", value: overview.summary.availableAdapters },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-surface-1 px-4 py-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-gray-100">{item.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <section className="rounded-xl border border-border bg-surface-1 p-4">
            <div className="flex items-center gap-2">
              <SquareTerminal className="w-4 h-4 text-accent" />
              <h2 className="text-sm font-semibold text-gray-100">Projects</h2>
            </div>
            <div className="mt-4 space-y-3">
              {overview?.projects.map((item) => {
                const selected = item.name === selectedProject;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => {
                      setSelectedProject(item.name);
                      loadProject(item.name);
                    }}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      selected
                        ? "border-accent/40 bg-accent-muted"
                        : "border-border bg-surface-2 hover:border-accent/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-100">{item.title}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">
                          {item.stageLabel}
                        </div>
                      </div>
                      {item.readyToApply && (
                        <span className="rounded-full border border-accent/30 bg-accent-muted px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-accent">
                          Ready
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                      <div>{item.artifactSummary.done}/{item.artifactSummary.total} artifacts</div>
                      <div>{item.taskProgress.completed}/{item.taskProgress.total} tasks</div>
                      <div>{item.graphSummary.totalNodes} nodes</div>
                      <div>{item.activeRunCount} active runs</div>
                    </div>
                    {typeof item.dispatchCount === "number" && (
                      <div className="mt-2 text-[11px] text-gray-500">
                        {item.dispatchCount} dispatch intents
                      </div>
                    )}
                    {item.dispatch?.preferredAdapterId && (
                      <div className="mt-3 text-[11px] text-accent">
                        Suggested adapter: {item.dispatch.preferredAdapterId}
                      </div>
                    )}
                    <div className="mt-3 text-[11px] text-gray-500">
                      Updated {item.updatedAt ? timeAgo(item.updatedAt) : "unknown"}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {project && <WorkerHealthPanel health={project.workerHealth} />}

          {overview && (
            <section className="rounded-xl border border-border bg-surface-1 p-4">
              <div className="flex items-center gap-2">
                <SquareTerminal className="w-4 h-4 text-accent" />
                <h2 className="text-sm font-semibold text-gray-100">Worker Adapters</h2>
              </div>
              <div className="mt-4 space-y-3">
                {overview.adapters.map((adapter) => (
                  <div key={adapter.id} className="rounded-xl border border-border bg-surface-2 px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-gray-100">{adapter.id}</div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase tracking-[0.16em] ${adapter.available ? "text-accent" : "text-gray-500"}`}>
                          {adapter.available ? "available" : "offline"}
                        </span>
                        {adapter.launchReady && (
                          <span className="text-[10px] uppercase tracking-[0.12em] text-xs px-1.5 py-0.5 rounded-full bg-accent-muted border border-accent/30 text-accent">
                            launch-ready
                          </span>
                        )}
                        {!adapter.launchReady && adapter.available && (
                          <span className="text-[10px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full bg-gray-500/10 border border-gray-400/30 text-gray-400">
                            observe
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">{adapter.command}</div>
                    {adapter.version && (
                      <div className="mt-1 text-[11px] text-accent font-mono">v{adapter.version}</div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-500">
                      stages: {adapter.capabilities.stages.join(", ")}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      actions: {adapter.capabilities.actions.join(", ")}
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {adapter.runtime} / {adapter.transport} / source: {adapter.source}
                      {adapter.health && ` / health: ${adapter.health}`}
                    </div>
                    {adapter.limitations.length > 0 && (
                      <div className="mt-1 text-[10px] text-gray-500 italic">
                        {adapter.limitations[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {project && (
            <ActivityFeed
              title="Recent Activity"
              items={project.activity.slice(0, 8)}
              emptyMessage="No runtime events, dispatches, or operator actions have been recorded yet."
            />
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          {project ? (
            <>
              <section className="rounded-xl border border-border bg-surface-1 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-accent">
                      {project.project.stageLabel}
                    </div>
                    <h2 className="mt-2 text-xl font-semibold text-gray-100">{project.project.title}</h2>
                    <p className="mt-2 text-sm text-gray-400">
                      {project.project.readyToApply
                        ? "Artifacts are complete and the change is ready for execution or review."
                        : project.project.nextArtifact
                          ? `Next artifact: ${project.project.nextArtifact}`
                          : "Runtime state is being reconciled with the current OpenSpec project."}
                    </p>
                    <p className="mt-2 text-xs text-gray-500">
                      Preferred adapter: {project.dispatch.preferredAdapterId || "unavailable"} / {project.dispatch.reason}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Artifacts</div>
                      <div className="mt-1 text-gray-100">
                        {project.project.artifactSummary.done}/{project.project.artifactSummary.total}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-surface-2 px-3 py-3">
                      <div className="text-[11px] uppercase tracking-[0.14em] text-gray-500">Tasks</div>
                      <div className="mt-1 text-gray-100">
                        {project.project.taskProgress.completed}/{project.project.taskProgress.total}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-border bg-surface-1 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-100">Live DAG</h2>
                    <p className="mt-1 text-xs text-gray-500">
                      {project.graph.stats.totalNodes} nodes / {project.graph.stats.totalEdges} edges / {project.graph.stats.runningNodes} active or ready
                    </p>
                  </div>
                  {projectLoading && <span className="text-xs text-gray-500">Refreshing graph...</span>}
                </div>
                <div className="mt-4">
                  <ControlPlaneGraph
                    projectKey={project.project.name}
                    nodes={project.graph.nodes}
                    edges={project.graph.edges}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                  />
                </div>
              </section>

              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="grid gap-6 lg:grid-cols-2">
                  <BlackboardSection title="Facts" entries={project.blackboard.facts} />
                  <BlackboardSection title="Intents" entries={project.blackboard.intents} />
                  <BlackboardSection title="Hints" entries={project.blackboard.hints} />
                  <BlackboardSection title="Settings" entries={project.blackboard.settings} />
                </div>

                <NodeDetail
                  project={project}
                  selectedNodeId={selectedNodeId}
                  onAction={handleNodeAction}
                  actionPending={actionPending}
                />
              </div>
            </>
          ) : (
            <EmptyState
              icon={GitBranch}
              title="No control-plane projects available"
              description="Create an OpenSpec change to seed the control-plane workspace."
            />
          )}
        </div>
      </div>
    </div>
  );
}
