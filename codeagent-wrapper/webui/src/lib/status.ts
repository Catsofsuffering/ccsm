import type { MonitorViewState, SessionState, StatusFilter } from "../types";

export const isAttentionStatus = (status: string): boolean =>
  status === "failed" || status === "blocked";

export const isActiveStatus = (status: string): boolean =>
  status === "running" || status === "pending";

export const formatRelativeStatus = (status: string): string =>
  status === "completed" ? "Run complete" : "Live run";

export const statusFilterLabel: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  attention: "Attention",
  completed: "Completed",
};

export const filterSessions = (
  sessions: SessionState[],
  statusFilter: StatusFilter,
  query: string,
): SessionState[] => {
  const normalizedQuery = query.trim().toLowerCase();

  return sessions.filter((session) => {
    if (statusFilter === "active" && !isActiveStatus(session.status)) {
      return false;
    }
    if (statusFilter === "attention" && !isAttentionStatus(session.status)) {
      return false;
    }
    if (statusFilter === "completed" && session.status !== "completed") {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystack = [
      session.id,
      session.task_id,
      session.task,
      session.backend,
      session.current_activity,
      session.last_event,
      session.error,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
};

export const buildStatusSegments = (view: MonitorViewState) => {
  if (view.summary.total === 0) {
    return [];
  }
  return [
    { key: "completed", label: "Completed", value: view.summary.completed },
    { key: "running", label: "Running", value: view.summary.running },
    { key: "pending", label: "Pending", value: view.summary.pending },
    { key: "blocked", label: "Blocked", value: view.summary.blocked },
    { key: "failed", label: "Failed", value: view.summary.failed },
  ].filter((segment) => segment.value > 0);
};
