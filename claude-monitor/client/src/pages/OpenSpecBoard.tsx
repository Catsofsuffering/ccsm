import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, FileText, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui/Button";
import { timeAgo } from "../lib/format";
import type { OpenSpecBoardData, OpenSpecChange, OpenSpecStage } from "../lib/types";

const STAGE_DESCRIPTIONS: Record<OpenSpecStage, string> = {
  proposal: "Problem framing, scope shaping, and change intent",
  design: "Design boundaries and execution contract definition",
  specs: "Capability scenarios and requirement shaping",
  tasks: "Execution slice planning and verification setup",
  implementing: "Artifacts complete and execution in progress",
  complete: "Finished or archived changes",
};

function humanizeChangeName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusLabel(change: OpenSpecChange): string {
  if (change.controlPlane.state !== "idle" && change.controlPlane.state !== "active") {
    return change.controlPlane.label;
  }
  if (change.stage === "complete") return "Completed";
  if (change.stage === "implementing") {
    return change.readyToApply ? "Ready for execution" : "Executing";
  }
  return change.stageLabel;
}

function summaryLine(change: OpenSpecChange): string {
  if (change.controlPlane.state !== "idle" && change.controlPlane.state !== "active") {
    return change.controlPlane.summary;
  }
  if (change.stage === "complete") return "Change marked complete in OpenSpec";
  if (change.stage === "implementing") {
    return change.readyToApply
      ? "Artifacts are complete; execution is the next step"
      : "Execution work is active";
  }
  return change.nextArtifact
    ? `Next artifact: ${change.nextArtifact}`
    : "Waiting for the next artifact step";
}

function lifecycleBadgeClass(change: OpenSpecChange): string {
  const state = change.controlPlane.state;
  if (state === "blocked") {
    return "border-gray-400/30 bg-gray-500/10 text-gray-200";
  }
  if (["dispatching", "executing", "reopened", "replaying", "ready", "completed"].includes(state)) {
    return "border-accent/30 bg-accent-muted text-accent";
  }
  return change.stage === "implementing" || change.stage === "complete"
    ? "border-accent/30 bg-accent-muted text-accent"
    : "border-border text-gray-400";
}

function artifactStatusClass(done: boolean): string {
  return done
    ? "border-accent/30 bg-accent/10 text-accent"
    : "border-border/70 bg-[rgb(var(--surface-1)/0.38)] text-gray-400";
}

function EmbeddedChangeRow({
  change,
  expanded,
  onToggle,
}: {
  change: OpenSpecChange;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <article className="glass-panel overflow-hidden rounded-2xl">
      <div className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1.8fr)_150px_180px_minmax(0,1.1fr)_44px] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-gray-100">{humanizeChangeName(change.name)}</h3>
            <span className="rounded-full border border-border/70 bg-[rgb(var(--surface-1)/0.34)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-gray-500">
              {change.stageLabel}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-gray-500">{summaryLine(change)}</p>
          <p className="mt-2 break-all text-[11px] text-gray-600">{change.name}</p>
        </div>

        <div className="min-w-0 space-y-2">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${lifecycleBadgeClass(change)}`}
          >
            {statusLabel(change)}
          </span>
          <p className="truncate text-[11px] text-gray-500">
            {change.nextArtifact ? `Next: ${change.nextArtifact}` : "No pending artifact"}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="text-gray-500">
              {change.taskProgress.completed}/{change.taskProgress.total} tasks
            </span>
            <span className="text-gray-300">{change.taskProgress.percent}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${change.taskProgress.percent}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            {change.artifactSummary.done}/{change.artifactSummary.total} artifacts
          </p>
        </div>

        <div className="min-w-0 space-y-1 text-[11px] text-gray-500">
          <p className="truncate">{change.changePath}</p>
          <p>{change.lastModified ? timeAgo(change.lastModified) : "unknown"}</p>
        </div>

        <div className="flex md:justify-end">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${change.name}` : `Expand ${change.name}`}
            onClick={onToggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-[rgb(var(--surface-1)/0.34)] text-gray-400 transition-colors duration-150 hover:border-border hover:text-gray-200"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="grid gap-6 border-t border-border/70 bg-[rgb(var(--surface-1)/0.2)] px-4 py-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Artifacts
              </h4>
              <span className="text-[11px] text-gray-600">
                {change.artifactSummary.done}/{change.artifactSummary.total}
              </span>
            </div>
            {change.artifacts.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-[rgb(var(--surface-1)/0.26)]">
                {change.artifacts.map((artifact, index) => (
                  <div
                    key={`${change.name}-${artifact.id}`}
                    className={`px-3 py-3 ${index > 0 ? "border-t border-border/60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                        {artifact.id}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${artifactStatusClass(artifact.done)}`}
                      >
                        {artifact.done ? "done" : artifact.status}
                      </span>
                    </div>
                    <p className="mt-1 break-all text-[11px] text-gray-500">{artifact.outputPath}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No artifact data reported.</p>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Tasks
              </h4>
              <span className="text-[11px] text-gray-600">
                {change.taskProgress.completed}/{change.taskProgress.total}
              </span>
            </div>

            {change.taskSections.length > 0 ? (
              <div className="space-y-4">
                {change.taskSections.map((section) => (
                  <section
                    key={section.id}
                    className="border-l border-border/60 pl-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h5 className="text-sm font-medium text-gray-100">{section.title}</h5>
                      <span className="text-[11px] text-gray-500">
                        {section.completed}/{section.total}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      {section.tasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-2 text-sm"
                        >
                          {task.done ? (
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          ) : (
                            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                          )}
                          <div className="min-w-0">
                            <p className={task.done ? "text-gray-300 line-through" : "text-gray-100"}>
                              {task.text}
                            </p>
                            <p className="mt-1 text-[11px] text-gray-600">L{task.line}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No task details parsed from `tasks.md`.</p>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

function StageLane({
  stage,
  items,
  embedded,
}: {
  stage: { id: OpenSpecStage; label: string; count: number };
  items: OpenSpecChange[];
  embedded: boolean;
}) {
  return (
    <section className="glass-panel w-80 flex-shrink-0 rounded-2xl p-3">
      <div className="mb-4 px-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              stage.id === "implementing" ? "bg-accent animate-live-pulse" : "bg-gray-500"
            }`}
          />
          <span
            className={`text-xs font-semibold uppercase tracking-wider ${
              stage.id === "implementing" || stage.id === "complete"
                ? "text-accent"
                : "text-gray-400"
            }`}
          >
            {stage.label}
          </span>
          <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-gray-500">
            {stage.count}
          </span>
        </div>
        {!embedded && (
          <p className="mt-2 text-[11px] text-gray-500">{STAGE_DESCRIPTIONS[stage.id]}</p>
        )}
      </div>

      <div className="space-y-3">
        {items.map((change) => (
          <article
            key={change.name}
            className="rounded-xl border border-border/70 bg-[rgb(var(--surface-1)/0.72)] px-3 py-3 backdrop-blur-xl space-y-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-medium text-gray-100">
                  {humanizeChangeName(change.name)}
                </h3>
                <p className="mt-1 break-all text-[11px] text-gray-500">{change.name}</p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${lifecycleBadgeClass(change)}`}
              >
                {statusLabel(change)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div className="rounded-lg border border-border/70 bg-[rgb(var(--surface-1)/0.58)] px-2 py-2 backdrop-blur-xl">
                <div className="text-gray-500 uppercase tracking-wider">Artifacts</div>
                <div className="mt-1 text-sm text-gray-100">
                  {change.artifactSummary.done}/{change.artifactSummary.total}
                </div>
              </div>
              <div className="rounded-lg border border-border/70 bg-[rgb(var(--surface-1)/0.58)] px-2 py-2 backdrop-blur-xl">
                <div className="text-gray-500 uppercase tracking-wider">Tasks</div>
                <div className="mt-1 text-sm text-gray-100">
                  {change.taskProgress.completed}/{change.taskProgress.total}
                </div>
              </div>
            </div>

            {!embedded && (
              <div className="space-y-1.5">
                {change.artifacts.map((artifact) => (
                  <div
                    key={`${change.name}-${artifact.id}`}
                    className="flex items-center justify-between gap-3 text-[11px]"
                  >
                    <span className="text-gray-400 uppercase tracking-wider">{artifact.id}</span>
                    <span className={artifact.done ? "text-accent" : "text-gray-500"}>
                      {artifact.done ? "done" : artifact.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t border-border pt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${change.taskProgress.percent}%` }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-[11px] text-gray-500">
                <span className="truncate">{summaryLine(change)}</span>
                <span className="shrink-0">{change.taskProgress.percent}%</span>
              </div>
            </div>

            {!embedded &&
              (change.controlPlane.latestDispatch || change.controlPlane.latestAction) && (
                <div className="rounded-md border border-border px-2 py-2 text-[11px] text-gray-500">
                  {change.controlPlane.latestDispatch ? (
                    <span>
                      Dispatch: {change.controlPlane.latestDispatch.status} /{" "}
                      {change.controlPlane.latestDispatch.adapterId || "unassigned"}
                    </span>
                  ) : change.controlPlane.latestAction ? (
                    <span>
                      Action: {change.controlPlane.latestAction.actionType} /{" "}
                      {change.controlPlane.latestAction.status}
                    </span>
                  ) : null}
                </div>
              )}

            <div className="flex items-center justify-between gap-3 text-[11px] text-gray-600">
              <span className="truncate">{change.changePath}</span>
              <span className="shrink-0">
                {change.lastModified ? timeAgo(change.lastModified) : "unknown"}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OpenSpecBoard({ embedded = false }: { embedded?: boolean }) {
  const [data, setData] = useState<OpenSpecBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEmptyStages, setShowEmptyStages] = useState(false);
  const [expandedChanges, setExpandedChanges] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const next = await api.openspec.list();
      setData(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load OpenSpec board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  const changes = data?.changes ?? [];
  const stages = data?.stages ?? [];
  const activeChanges = changes.filter((change) => change.stage !== "complete").length;
  const readyChanges = changes.filter(
    (change) => change.stage === "implementing" && change.readyToApply
  ).length;
  const dispatchingChanges = changes.filter((change) =>
    ["dispatching", "executing", "reopened", "replaying"].includes(change.controlPlane.state)
  ).length;
  const blockedChanges = changes.filter((change) => change.controlPlane.state === "blocked").length;
  const completedChanges = changes.filter((change) => change.stage === "complete").length;
  const emptyStageCount = stages.filter((stage) => stage.count === 0).length;

  const grouped = changes.reduce(
    (acc, change) => {
      acc[change.stage].push(change);
      return acc;
    },
    {
      proposal: [],
      design: [],
      specs: [],
      tasks: [],
      implementing: [],
      complete: [],
    } as Record<OpenSpecStage, OpenSpecChange[]>
  );

  const visibleStages =
    showEmptyStages || stages.every((stage) => stage.count === 0)
      ? stages
      : stages.filter((stage) => stage.count > 0);

  if (!loading && error && !data) {
    return (
      <div className="animate-fade-in space-y-6">
        {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-muted">
                <FileText className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-100">OpenSpec Board</h1>
                <p className="text-xs text-gray-500">Workflow-stage view of local changes</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        )}

        <EmptyState
          icon={FileText}
          title="OpenSpec state is unavailable"
          description={error}
          action={
            <Button variant="primary" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!loading && changes.length === 0) {
    return (
      <div className="animate-fade-in space-y-6">
        {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-muted">
                <FileText className="h-4 w-4 text-accent" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-gray-100">OpenSpec Board</h1>
                <p className="text-xs text-gray-500">Workflow-stage view of local changes</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          </div>
        )}

        <EmptyState
          icon={FileText}
          title="No OpenSpec changes found"
          description="Create or resume a change under openspec/changes to populate this board."
          action={
            <Button variant="primary" onClick={load}>
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-[rgb(var(--surface-1)/0.7)] px-2.5 py-1 text-[11px] text-gray-400 backdrop-blur-xl">
              {changes.length} changes
            </span>
            <span className="rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[11px] text-accent backdrop-blur-xl">
              {readyChanges} ready
            </span>
            <span className="rounded-full border border-border bg-[rgb(var(--surface-1)/0.7)] px-2.5 py-1 text-[11px] text-gray-400 backdrop-blur-xl">
              {dispatchingChanges} active
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-muted">
              <FileText className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-100">OpenSpec Board</h1>
              <p className="text-xs text-gray-500">
                {data?.workspaceRoot
                  ? `Workspace: ${data.workspaceRoot}`
                  : "Workflow-stage view of local changes"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      )}

      {!embedded && emptyStageCount > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-1 px-4 py-3">
          <p className="text-sm text-gray-400">
            {showEmptyStages
              ? "Showing empty workflow stages as well."
              : `${emptyStageCount} empty stages are hidden so active columns stay in view.`}
          </p>
          <Button variant="outline" size="sm" onClick={() => setShowEmptyStages((prev) => !prev)}>
            {showEmptyStages ? "Hide empty stages" : "Show empty stages"}
          </Button>
        </div>
      )}

      {!embedded && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 border-y border-border py-4">
          <div>
            <div className="text-2xl font-semibold text-gray-100">{changes.length}</div>
            <div className="mt-0.5 text-xs text-gray-500">Tracked Changes</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-100">{activeChanges}</div>
            <div className="mt-0.5 text-xs text-gray-500">Active</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-accent">{readyChanges}</div>
            <div className="mt-0.5 text-xs text-gray-500">Ready To Apply</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-100">{dispatchingChanges}</div>
            <div className="mt-0.5 text-xs text-gray-500">Runtime Active</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-100">{blockedChanges}</div>
            <div className="mt-0.5 text-xs text-gray-500">Blocked</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-gray-100">{completedChanges}</div>
            <div className="mt-0.5 text-xs text-gray-500">Completed</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-border bg-surface-1 px-4 py-3 text-sm text-gray-400">
          {error}
        </div>
      )}

      {embedded ? (
        <div className="space-y-3">
          {changes.map((change) => (
            <EmbeddedChangeRow
              key={change.name}
              change={change}
              expanded={Boolean(expandedChanges[change.name])}
              onToggle={() =>
                setExpandedChanges((current) => ({
                  ...current,
                  [change.name]: !current[change.name],
                }))
              }
            />
          ))}
        </div>
      ) : (
        <div className="flex min-h-[620px] gap-4 overflow-x-auto pb-4 -mx-8 px-8">
          {visibleStages.map((stage) => (
            <StageLane
              key={stage.id}
              stage={stage}
              items={grouped[stage.id]}
              embedded={embedded}
            />
          ))}
        </div>
      )}
    </div>
  );
}
