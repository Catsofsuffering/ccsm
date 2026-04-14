import type {
  MonitorEvent,
  MonitorSnapshot,
  MonitorSummary,
  MonitorViewState,
  SessionState,
} from "./types";

const emptySummary = (): MonitorSummary => ({
  total: 0,
  pending: 0,
  running: 0,
  completed: 0,
  failed: 0,
  blocked: 0,
});

const statusRank: Record<string, number> = {
  running: 0,
  pending: 1,
  failed: 2,
  blocked: 3,
  completed: 4,
};

export const sessionLabel = (session: SessionState): string =>
  session.task_id || session.id;

export const sortSessions = (sessions: SessionState[]): SessionState[] =>
  [...sessions].sort((left, right) => {
    const leftRank = statusRank[left.status] ?? 99;
    const rightRank = statusRank[right.status] ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }
    return Date.parse(left.created_at) - Date.parse(right.created_at);
  });

export const snapshotToViewState = (snapshot: MonitorSnapshot): MonitorViewState => ({
  runId: snapshot.run_id,
  backend: snapshot.backend,
  status: snapshot.status,
  startedAt: snapshot.started_at,
  updatedAt: snapshot.updated_at,
  historyDir: snapshot.history_dir,
  summary: snapshot.summary,
  sessions: sortSessions(snapshot.sessions),
  events: [],
});

export const appendEventLine = (
  existing: string[],
  event: MonitorEvent,
): string[] => {
  const label = event.session ? sessionLabel(event.session) : event.session_id || "run";
  const message = event.message || event.type;
  const stamp = new Date(event.timestamp).toLocaleString();
  return [`[${stamp}] ${label}: ${message}`, ...existing].slice(0, 30);
};

export const applyMonitorEvent = (
  current: MonitorViewState,
  event: MonitorEvent,
): MonitorViewState => {
  const sessions = new Map(current.sessions.map((session) => [session.id, session]));
  if (event.session) {
    sessions.set(event.session.id, event.session);
  }

  const nextStatus =
    event.summary.running > 0 || event.summary.pending > 0 ? "running" : "completed";

  return {
    runId: event.run_id || current.runId,
    backend: current.backend,
    status: nextStatus,
    startedAt: current.startedAt,
    updatedAt: event.timestamp,
    historyDir: event.history_dir || current.historyDir,
    summary: event.summary || emptySummary(),
    sessions: sortSessions([...sessions.values()]),
    events: appendEventLine(current.events, event),
  };
};
