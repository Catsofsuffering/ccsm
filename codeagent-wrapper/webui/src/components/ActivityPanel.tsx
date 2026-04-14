import { formatElapsed } from "../lib/formatters";
import { sessionLabel } from "../monitor";
import type { SessionState } from "../types";

type ActivityPanelProps = {
  attentionSessions: SessionState[];
  eventLines: string[];
  runningSessions: SessionState[];
  onSelectSession: (sessionId: string) => void;
};

export function ActivityPanel({
  attentionSessions,
  eventLines,
  runningSessions,
  onSelectSession,
}: ActivityPanelProps) {
  return (
    <article className="panel panel-wide">
      <header className="panel-header">
        <div>
          <h2>Attention and activity</h2>
          <p>Escalations plus the latest event stream</p>
        </div>
      </header>
      <div className="lower-grid">
        <section className="attention-column">
          <div className="subpanel-header">
            <h3>Needs attention</h3>
            <span>{attentionSessions.length}</span>
          </div>
          {attentionSessions.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No escalations</strong>
              <p>Failed or blocked sessions will be surfaced here for review.</p>
            </div>
          ) : (
            <div className="attention-list">
              {attentionSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="attention-card"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="attention-card-head">
                    <strong>{sessionLabel(session)}</strong>
                    <span className={`status-chip status-${session.status}`}>{session.status}</span>
                  </div>
                  <p>{session.current_activity || session.error || session.task}</p>
                  <span className="attention-footnote">
                    {session.blocked_by?.length
                      ? `Blocked by ${session.blocked_by.join(", ")}`
                      : session.log_path
                        ? "Log retained for inspection"
                        : "Awaiting more detail"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="subpanel-header">
            <h3>Live queue</h3>
            <span>{runningSessions.length}</span>
          </div>
          {runningSessions.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>No live work</strong>
              <p>Pending and running sessions will appear here while the wrapper is active.</p>
            </div>
          ) : (
            <div className="queue-list">
              {runningSessions.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  className="queue-row queue-row-button"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div>
                    <strong>{sessionLabel(session)}</strong>
                    <p>{session.current_activity || session.task}</p>
                  </div>
                  <span>{formatElapsed(session.start_time || session.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="event-column">
          <div className="subpanel-header">
            <h3>Run event log</h3>
            <span>{eventLines.length}</span>
          </div>
          <div className="event-log">
            {eventLines.length === 0 ? (
              <div className="empty-state compact-empty">
                <strong>No events yet</strong>
                <p>Structured run updates will stream in here as execution progresses.</p>
              </div>
            ) : (
              eventLines.map((line, index) => (
                <article key={`${line}-${index}`} className="event-entry">
                  <span className="event-entry-index">{String(index + 1).padStart(2, "0")}</span>
                  <pre>{line}</pre>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
