import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Info, RefreshCw, Workflow } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type {
  OpenSpecBoardData,
  OpenSpecWorkspaceInfo,
  SessionDrillIn,
  SessionOutputs,
  WorkflowData,
  WSMessage,
} from "../lib/types";
import { WorkflowStats } from "../components/workflows/WorkflowStats";
import { OrchestrationDAG } from "../components/workflows/OrchestrationDAG";
import { WorkflowLiveReader } from "../components/workflows/WorkflowLiveReader";

type StatusFilter = "all" | "active" | "completed";
type SessionOption = WorkflowData["complexity"][number];

function workspaceLabel(workspaceRoot: string): string {
  const normalized = workspaceRoot.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
}

function isEmptyAbandonedShell(session: SessionOption): boolean {
  return (
    session.status === "abandoned" &&
    session.agentCount <= 1 &&
    session.subagentCount === 0 &&
    session.totalTokens === 0 &&
    !session.model
  );
}

function pickDefaultSession(sessions: SessionOption[]): SessionOption | null {
  return (
    sessions.find((session) => session.status === "active") ||
    sessions.find((session) => session.status !== "abandoned" && session.totalTokens > 0) ||
    sessions.find((session) => session.status !== "abandoned") ||
    sessions[0] ||
    null
  );
}

export function Workflows() {
  const [data, setData] = useState<WorkflowData | null>(null);
  const [openSpecData, setOpenSpecData] = useState<OpenSpecBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [focusedSession, setFocusedSession] = useState<SessionDrillIn | null>(null);
  const [focusedOutputs, setFocusedOutputs] = useState<SessionOutputs>({
    agents: [],
    latest_output_agent_id: null,
  });
  const [focusedSessionLoading, setFocusedSessionLoading] = useState(false);
  const [focusedSessionError, setFocusedSessionError] = useState<string | null>(null);
  const userSelectedSessionRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    api.settings.info()
      .then((info) => {
        if (!cancelled) setWorkspaceRoot(info.openspec.workspaceRoot ?? null);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceRoot(null);
      });

    const handleWorkspaceChange = (event: Event) => {
      const next = (event as CustomEvent<OpenSpecWorkspaceInfo>).detail;
      setWorkspaceRoot(next?.workspaceRoot ?? null);
      setSelectedSessionId(null);
      setFocusedSession(null);
      setFocusedOutputs({ agents: [], latest_output_agent_id: null });
      userSelectedSessionRef.current = false;
    };

    window.addEventListener("ccsm:workspace-changed", handleWorkspaceChange);
    return () => {
      cancelled = true;
      window.removeEventListener("ccsm:workspace-changed", handleWorkspaceChange);
    };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [workflowData, openspec] = await Promise.all([
        api.workflows.get(statusFilter, workspaceRoot),
        api.openspec.list(workspaceRoot),
      ]);
      setData(workflowData);
      setOpenSpecData(openspec);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load workflow data");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, workspaceRoot]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const sessionOptions = useMemo<SessionOption[]>(
    () => (data?.complexity ?? [])
      .filter((session) => !isEmptyAbandonedShell(session))
      .slice(0, 40),
    [data?.complexity]
  );

  useEffect(() => {
    const nextSession = pickDefaultSession(sessionOptions);

    if (!nextSession) {
      if (selectedSessionId !== null) {
        setSelectedSessionId(null);
      }
      return;
    }

    const selectedStillVisible = sessionOptions.some((session) => session.id === selectedSessionId);
    if (!selectedSessionId || !selectedStillVisible) {
      userSelectedSessionRef.current = false;
      setSelectedSessionId(nextSession.id);
      return;
    }

    if (!userSelectedSessionRef.current && nextSession.id !== selectedSessionId) {
      setSelectedSessionId(nextSession.id);
    }
  }, [selectedSessionId, sessionOptions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setFocusedSession(null);
      setFocusedOutputs({ agents: [], latest_output_agent_id: null });
      setFocusedSessionError(null);
      setFocusedSessionLoading(false);
      return;
    }

    let cancelled = false;
    setFocusedSessionLoading(true);
    setFocusedSessionError(null);

    Promise.all([api.workflows.session(selectedSessionId), api.sessions.outputs(selectedSessionId)])
      .then(([sessionResult, outputResult]) => {
        if (!cancelled) {
          setFocusedSession(sessionResult);
          setFocusedOutputs(outputResult.outputs);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFocusedSession(null);
          setFocusedOutputs({ agents: [], latest_output_agent_id: null });
          setFocusedSessionError(err instanceof Error ? err.message : "Failed to load focused session");
        }
      })
      .finally(() => {
        if (!cancelled) setFocusedSessionLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const handler = (_msg: WSMessage) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(fetchData, 1000);
    };
    const unsubscribe = eventBus.subscribe(handler);
    return () => {
      unsubscribe();
      clearTimeout(debounceTimer);
    };
  }, [fetchData]);

  const specSummary = useMemo(() => {
    const changes = openSpecData?.changes ?? [];
    return {
      total: changes.length,
      active: changes.filter((change) => change.stage !== "complete").length,
      ready: changes.filter(
        (change) => change.stage === "implementing" && change.readyToApply
      ).length,
      highlight: null,
    };
  }, [openSpecData]);

  const orchestrationSubtitle = focusedSessionLoading
    ? "Refreshing focused session DAG."
    : focusedSessionError
      ? `Focused session unavailable: ${focusedSessionError}. Falling back to aggregate live DAG.`
      : focusedSession
        ? "Focused session shows the live execution path from session to spec to runtime agents."
        : "Aggregate live DAG stays synchronized with sessions, OpenSpec, and agent activity.";

  const handleRefresh = async () => {
    setLoading(true);
    setRefreshing(true);
    try {
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const payload = {
      workflow: data,
      openspec: openSpecData,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `workflow-live-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onRefresh={handleRefresh}
          onExport={handleExport}
          lastUpdated={null}
          refreshing={refreshing}
          workspaceRoot={workspaceRoot}
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="glass-panel h-24 animate-pulse rounded-2xl" />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="glass-panel h-80 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <PageHeader
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          onRefresh={handleRefresh}
          onExport={handleExport}
          lastUpdated={null}
          refreshing={refreshing}
          workspaceRoot={workspaceRoot}
        />
        <div className="glass-panel rounded-2xl px-6 py-16 text-center text-sm text-gray-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        statusFilter={statusFilter}
        onStatusFilterChange={(filter) => {
          userSelectedSessionRef.current = false;
          setStatusFilter(filter);
        }}
        onRefresh={handleRefresh}
        onExport={handleExport}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        workspaceRoot={workspaceRoot}
      />

      <WorkflowStats stats={data.stats} />

      <Section title="Live DAG" subtitle={orchestrationSubtitle}>
        <OrchestrationDAG
          data={data.orchestration}
          focusedSession={focusedSession}
          focusedOutputs={focusedOutputs}
          onNodeClick={setSelectedNode}
          selectedNode={selectedNode}
          specSummary={specSummary}
          sessionOptions={sessionOptions}
          selectedSessionId={selectedSessionId}
          onSessionChange={(sessionId) => {
            userSelectedSessionRef.current = true;
            setSelectedSessionId(sessionId);
          }}
          onJumpToReader={() => {
            const target = document.getElementById("workflow-live-reader");
            target?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        />
        {selectedNode && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Filtered by:</span>
            <span className="badge border border-accent/20 bg-accent/15 text-xs text-accent">
              {selectedNode}
            </span>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="text-xs text-gray-500 underline hover:text-gray-300"
            >
              Clear filter
            </button>
          </div>
        )}
      </Section>

      <Section
        title="Live Reader"
        subtitle="Session output stream moved here from Session Detail. Choose a session to inspect the latest agent output in real time."
      >
        <div id="workflow-live-reader">
          <WorkflowLiveReader
            sessionId={selectedSessionId}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const [showTip, setShowTip] = useState(false);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="flex items-center justify-center"
            >
              <Info className="h-3.5 w-3.5 text-gray-600 transition-colors hover:text-gray-400" />
            </button>
            {showTip && (
              <div className="tooltip-panel absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg px-3 py-2 text-[11px]">
                {subtitle}
                <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-[rgb(var(--tooltip-border))]" />
              </div>
            )}
          </div>
        </div>
        <span className="hidden text-[11px] text-gray-600 lg:block">{subtitle}</span>
      </div>
      {children}
    </section>
  );
}

function PageHeader({
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onExport,
  lastUpdated,
  refreshing,
  workspaceRoot,
}: {
  statusFilter: StatusFilter;
  onStatusFilterChange: (filter: StatusFilter) => void;
  onRefresh: () => void;
  onExport: () => void;
  lastUpdated: Date | null;
  refreshing: boolean;
  workspaceRoot: string | null;
}) {
  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All Sessions" },
    { value: "active", label: "Active Only" },
    { value: "completed", label: "Completed" },
  ];

  return (
    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-muted">
          <Workflow className="h-4 w-4 text-accent" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-100">Workflows</h1>
          <p className="text-xs text-gray-500">
            {workspaceRoot ? `Project scope: ${workspaceLabel(workspaceRoot)}` : "Live DAG and agent output surface"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="glass-panel flex rounded-xl p-0.5">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => onStatusFilterChange(filter.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === filter.value
                  ? "bg-accent/15 text-accent"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="glass-panel rounded-xl p-2 text-gray-500 transition-colors hover:text-gray-300"
          title={refreshing ? "Refreshing data" : "Refresh data"}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
        <button
          type="button"
          onClick={onExport}
          className="glass-panel rounded-xl p-2 text-gray-500 transition-colors hover:text-gray-300"
          title="Export as JSON"
        >
          <Download className="h-4 w-4" />
        </button>

        {lastUpdated && (
          <span className="ml-1 text-[10px] text-gray-600">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}
