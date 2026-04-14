import { formatTime } from "../lib/formatters";
import { statusFilterLabel } from "../lib/status";
import { sessionLabel } from "../monitor";
import type { SessionState, StatusFilter } from "../types";

type TaskExplorerProps = {
  disconnected: boolean;
  filteredSessions: SessionState[];
  query: string;
  selectedId: string | null;
  sessions: SessionState[];
  statusFilter: StatusFilter;
  onQueryChange: (value: string) => void;
  onSelectSession: (sessionId: string) => void;
  onStatusFilterChange: (filter: StatusFilter) => void;
};

export function TaskExplorer({
  disconnected,
  filteredSessions,
  query,
  selectedId,
  sessions,
  statusFilter,
  onQueryChange,
  onSelectSession,
  onStatusFilterChange,
}: TaskExplorerProps) {
  const attentionCount = sessions.filter(
    (session) => session.status === "failed" || session.status === "blocked",
  ).length;
  const activeCount = sessions.filter(
    (session) => session.status === "running" || session.status === "pending",
  ).length;
  const completedCount = sessions.filter((session) => session.status === "completed").length;

  return (
    <article className="panel">
      <header className="panel-header">
        <div>
          <h2>Tracked tasks</h2>
          <p>{filteredSessions.length} visible of {sessions.length}</p>
        </div>
        {disconnected ? <span className="panel-warning">Stream reconnecting</span> : null}
      </header>
      <div className="panel-toolbar">
        <div className="filter-row" role="tablist" aria-label="Task filters">
          {(["all", "active", "attention", "completed"] as StatusFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`filter-chip ${statusFilter === filter ? "filter-chip-active" : ""}`}
              onClick={() => onStatusFilterChange(filter)}
            >
              {statusFilterLabel[filter]}
            </button>
          ))}
        </div>
        <label className="search-box">
          <span>Search</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Task id, prompt, backend..."
          />
        </label>
      </div>
      <div className="explorer-summary">
        <div className="explorer-stat">
          <span>Attention</span>
          <strong>{attentionCount}</strong>
        </div>
        <div className="explorer-stat">
          <span>Live</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="explorer-stat">
          <span>Done</span>
          <strong>{completedCount}</strong>
        </div>
      </div>
      <div className="task-list" role="list">
        {filteredSessions.length === 0 ? (
          <div className="empty-state">
            <strong>{sessions.length === 0 ? "No monitored tasks yet" : "No matching tasks"}</strong>
            <p>
              {sessions.length === 0
                ? "Task cards will appear here once the wrapper registers work packages."
                : "Adjust the status filter or search terms to widen the queue view."}
            </p>
          </div>
        ) : (
          filteredSessions.map((session) => (
            <button
              key={session.id}
              className={`task-card ${selectedId === session.id ? "task-card-active" : ""}`}
              onClick={() => onSelectSession(session.id)}
              type="button"
              aria-pressed={selectedId === session.id}
            >
              <div className="task-card-head">
                <div>
                  <strong>{sessionLabel(session)}</strong>
                  <p>{session.task || "No task prompt recorded"}</p>
                </div>
                <span className={`status-chip status-${session.status}`}>{session.status}</span>
              </div>
              <dl className="task-meta">
                <div><dt>Backend</dt><dd>{session.backend || "-"}</dd></div>
                <div><dt>Dependencies</dt><dd>{session.dependencies?.join(", ") || "none"}</dd></div>
                <div><dt>Updated</dt><dd>{formatTime(session.update_time)}</dd></div>
                <div>
                  <dt>Verification</dt>
                  <dd>{session.tests_passed || 0}p / {session.tests_failed || 0}f</dd>
                </div>
              </dl>
              <div className="task-card-footer">
                <p className="task-activity">
                  {session.current_activity || session.last_event || "Waiting for activity"}
                </p>
                <span className="task-footnote">
                  {session.log_path ? "retained log" : "live only"} / {session.files_changed?.length || 0} files
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </article>
  );
}
