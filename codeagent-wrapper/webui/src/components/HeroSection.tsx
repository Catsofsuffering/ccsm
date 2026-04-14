import { formatTime } from "../lib/formatters";
import { buildStatusSegments, formatRelativeStatus } from "../lib/status";
import { sessionLabel } from "../monitor";
import type { MonitorViewState } from "../types";

type HeroSectionProps = {
  view: MonitorViewState;
};

export function HeroSection({ view }: HeroSectionProps) {
  const statusSegments = buildStatusSegments(view);
  const focusSession = view.sessions.find((session) => session.status === "running") || view.sessions[0];
  const attentionCount = view.summary.failed + view.summary.blocked;
  const completionRate =
    view.summary.total > 0 ? Math.round((view.summary.completed / view.summary.total) * 100) : 0;

  return (
    <section className="hero-panel">
      <div className="hero-strip">
        <div className="hero-mark">CA</div>
        <div>
          <p className="eyebrow">Embedded monitor</p>
          <h1>{view.backend.toUpperCase()} execution dashboard</h1>
          <p className="hero-copy">
            Wrapper-owned task monitoring with live state, retained history, and
            session-level detail.
          </p>
        </div>
      </div>
      <div className="hero-meta">
        <span className={`run-pill status-${view.status}`}>{formatRelativeStatus(view.status)}</span>
        <span>Run ID: <code>{view.runId || "-"}</code></span>
        <span>Started: {formatTime(view.startedAt)}</span>
        <span>History: <code>{view.historyDir || "-"}</code></span>
      </div>
      <div className="summary-grid">
        <article className="summary-card"><span>Total</span><strong>{view.summary.total}</strong></article>
        <article className="summary-card"><span>Pending</span><strong>{view.summary.pending}</strong></article>
        <article className="summary-card"><span>Running</span><strong>{view.summary.running}</strong></article>
        <article className="summary-card"><span>Completed</span><strong>{view.summary.completed}</strong></article>
        <article className="summary-card"><span>Failed</span><strong>{view.summary.failed}</strong></article>
        <article className="summary-card"><span>Blocked</span><strong>{view.summary.blocked}</strong></article>
      </div>
      <div className="hero-foot">
        <section className="throughput-card">
          <div className="throughput-head">
            <h2>Run throughput</h2>
            <span>{completionRate}% completed</span>
          </div>
          {statusSegments.length === 0 ? (
            <div className="throughput-empty">No work packages registered yet.</div>
          ) : (
            <>
              <div className="throughput-bar" aria-label="Run outcome strip">
                {statusSegments.map((segment) => (
                  <span
                    key={segment.key}
                    className={`throughput-segment status-${segment.key}`}
                    style={{ width: `${(segment.value / view.summary.total) * 100}%` }}
                    title={`${segment.label}: ${segment.value}`}
                  />
                ))}
              </div>
              <div className="throughput-legend">
                {statusSegments.map((segment) => (
                  <span key={segment.key}>
                    <i className={`legend-dot status-${segment.key}`} />
                    {segment.label} {segment.value}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="hero-sidecards">
          <article className="mini-card">
            <span>Attention</span>
            <strong>{attentionCount}</strong>
            <p>Failed or blocked sessions waiting on operator review.</p>
          </article>
          <article className="mini-card">
            <span>Live now</span>
            <strong>{view.summary.running}</strong>
            <p>Sessions still producing output or progress.</p>
          </article>
          <article className="mini-card">
            <span>Focus</span>
            <strong>{focusSession ? sessionLabel(focusSession) : "-"}</strong>
            <p>{focusSession?.current_activity || focusSession?.last_event || "No active focus item."}</p>
          </article>
        </section>
      </div>
    </section>
  );
}
