import { formatElapsed, formatTime } from "../lib/formatters";
import { sessionLabel } from "../monitor";
import type { SessionState } from "../types";

type FocusPaneProps = {
  selectedSession?: SessionState;
};

export function FocusPane({ selectedSession }: FocusPaneProps) {
  const fileCount = selectedSession?.files_changed?.length || 0;

  return (
    <article className="panel detail-panel">
      <header className="panel-header">
        <div>
          <h2>Focus pane</h2>
          <p>{selectedSession ? sessionLabel(selectedSession) : "No session selected"}</p>
        </div>
      </header>
      {selectedSession ? (
        <div className="detail-body">
          <section className="detail-focus">
            <article className="detail-focus-card">
              <span className="detail-focus-label">Primary focus</span>
              <div className="detail-heading">
                <strong>{sessionLabel(selectedSession)}</strong>
                <span className={`status-chip status-${selectedSession.status}`}>
                  {selectedSession.status}
                </span>
              </div>
              <p className="detail-copy">{selectedSession.task || "No task prompt recorded"}</p>
              <div className="focus-metrics">
                <div><span>Backend</span><strong>{selectedSession.backend || "-"}</strong></div>
                <div><span>Elapsed</span><strong>{formatElapsed(selectedSession.start_time || selectedSession.created_at, selectedSession.end_time)}</strong></div>
                <div><span>Updated</span><strong>{formatTime(selectedSession.update_time)}</strong></div>
              </div>
            </article>

            <article className="detail-focus-stack">
              <section className="detail-block detail-compact">
                <h3>Execution note</h3>
                <p>{selectedSession.current_activity || selectedSession.last_event || "Waiting for activity"}</p>
              </section>
              <section className="detail-block detail-compact">
                <h3>Verification snapshot</h3>
                <div className="verification-grid">
                  <div><span>Coverage</span><strong>{selectedSession.coverage || "n/a"}</strong></div>
                  <div><span>Tests</span><strong>{selectedSession.tests_passed || 0}/{(selectedSession.tests_passed || 0) + (selectedSession.tests_failed || 0)}</strong></div>
                  <div><span>Files</span><strong>{selectedSession.files_changed?.length || 0}</strong></div>
                  <div><span>Log</span><strong>{selectedSession.log_path ? "ready" : "n/a"}</strong></div>
                </div>
              </section>
            </article>
          </section>

          <section className="detail-block">
            <h3>Execution facts</h3>
            <div className="detail-stats">
              <div><span>Started</span><strong>{formatTime(selectedSession.start_time || selectedSession.created_at)}</strong></div>
              <div><span>Finished</span><strong>{formatTime(selectedSession.end_time)}</strong></div>
              <div><span>Coverage</span><strong>{selectedSession.coverage || "n/a"}</strong></div>
              <div>
                <span>Tests</span>
                <strong>
                  {selectedSession.tests_passed || 0} passed / {selectedSession.tests_failed || 0} failed
                </strong>
              </div>
              <div><span>Changed files</span><strong>{selectedSession.files_changed?.length || 0}</strong></div>
              <div><span>Log path</span><strong>{selectedSession.log_path || "n/a"}</strong></div>
            </div>
          </section>

          <section className="detail-block">
            <div className="dependency-grid">
              <div>
                <h3>Dependencies</h3>
                <p>{selectedSession.dependencies?.join(", ") || "none"}</p>
              </div>
              <div>
                <h3>Blocked by</h3>
                <p>{selectedSession.blocked_by?.join(", ") || "none"}</p>
              </div>
            </div>
          </section>

          <section className="detail-block">
            <div className="transcript-header">
              <div>
                <h3>Artifacts</h3>
                <p>Wrapper-retained outputs and changed files for the selected task.</p>
              </div>
              <span className="transcript-meta">{fileCount} files</span>
            </div>
            {fileCount === 0 && !selectedSession.log_path ? (
              <div className="empty-state compact-empty">
                <strong>No retained artifacts yet</strong>
                <p>File changes and log pointers will appear after the session emits final metadata.</p>
              </div>
            ) : (
              <div className="artifact-grid">
                <div className="artifact-block">
                  <span>Log path</span>
                  <strong>{selectedSession.log_path || "n/a"}</strong>
                </div>
                <div className="artifact-block artifact-block-wide">
                  <span>Changed files</span>
                  <div className="artifact-list">
                    {(selectedSession.files_changed || []).map((file) => (
                      <code key={file} className="artifact-chip">{file}</code>
                    ))}
                    {fileCount === 0 ? <code className="artifact-chip artifact-chip-muted">none</code> : null}
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="detail-block transcript-block">
            <div className="transcript-header">
              <div>
                <h3>Recent output</h3>
                <p>Retained session transcript from wrapper monitoring.</p>
              </div>
              <span className="transcript-meta">
                {selectedSession.content?.length || 0} chars
              </span>
            </div>
            <div className="transcript-frame">
              <pre className="transcript-content">{selectedSession.content || "No streamed content recorded yet."}</pre>
            </div>
          </section>
        </div>
      ) : (
        <div className="empty-state">
          <strong>Select a task</strong>
          <p>Inspect the latest activity, verification snapshot, retained artifacts, and transcript.</p>
        </div>
      )}
    </article>
  );
}
