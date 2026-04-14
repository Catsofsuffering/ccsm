import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchSnapshot, openMonitorStream } from "./api";
import "./app.css";
import { ActivityPanel } from "./components/ActivityPanel";
import { FocusPane } from "./components/FocusPane";
import { HeroSection } from "./components/HeroSection";
import { TaskExplorer } from "./components/TaskExplorer";
import { filterSessions, isActiveStatus, isAttentionStatus } from "./lib/status";
import { applyMonitorEvent, snapshotToViewState } from "./monitor";
import type { MonitorEvent, MonitorViewState, StatusFilter } from "./types";

function App() {
  const [view, setView] = useState<MonitorViewState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnected, setDisconnected] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let active = true;
    let stream: EventSource | null = null;

    const boot = async () => {
      try {
        const snapshot = await fetchSnapshot();
        if (!active) {
          return;
        }
        const nextView = snapshotToViewState(snapshot);
        setView(nextView);
        setSelectedId((current) => current || nextView.sessions[0]?.id || null);
        setError(null);

        stream = openMonitorStream();
        stream.onmessage = (raw) => {
          if (!active) {
            return;
          }
          const event = JSON.parse(raw.data) as MonitorEvent;
          startTransition(() => {
            setView((current) => {
              if (!current) {
                return current;
              }
              const next = applyMonitorEvent(current, event);
              setSelectedId((existing) => existing || next.sessions[0]?.id || null);
              return next;
            });
          });
          setDisconnected(false);
        };
        stream.onerror = () => {
          if (active) {
            setDisconnected(true);
          }
        };
      } catch (bootError) {
        if (active) {
          setError(
            bootError instanceof Error ? bootError.message : "Failed to load monitoring UI",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void boot();

    return () => {
      active = false;
      stream?.close();
    };
  }, []);

  const selectedSession = useMemo(() => {
    const sessions = view?.sessions || [];
    if (sessions.length === 0) {
      return undefined;
    }
    return sessions.find((session) => session.id === selectedId) || sessions[0];
  }, [selectedId, view?.sessions]);

  const filteredSessions = useMemo(
    () => filterSessions(view?.sessions || [], statusFilter, deferredQuery),
    [deferredQuery, statusFilter, view?.sessions],
  );

  const attentionSessions = useMemo(
    () => (view?.sessions || []).filter((session) => isAttentionStatus(session.status)).slice(0, 4),
    [view?.sessions],
  );

  const runningSessions = useMemo(
    () => (view?.sessions || []).filter((session) => isActiveStatus(session.status)).slice(0, 4),
    [view?.sessions],
  );

  if (loading) {
    return (
      <main className="monitor-shell monitor-loading">
        <div className="loading-panel">Loading monitoring state...</div>
      </main>
    );
  }

  if (error || !view) {
    return (
      <main className="monitor-shell monitor-loading">
        <div className="loading-panel loading-error">{error || "Unknown error"}</div>
      </main>
    );
  }

  return (
    <main className="monitor-shell">
      <HeroSection view={view} />

      <section className="content-grid">
        <TaskExplorer
          disconnected={disconnected}
          filteredSessions={filteredSessions}
          query={query}
          selectedId={selectedSession?.id || null}
          sessions={view.sessions}
          statusFilter={statusFilter}
          onQueryChange={setQuery}
          onSelectSession={setSelectedId}
          onStatusFilterChange={setStatusFilter}
        />
        <FocusPane selectedSession={selectedSession} />
        <ActivityPanel
          attentionSessions={attentionSessions}
          eventLines={view.events}
          runningSessions={runningSessions}
          onSelectSession={setSelectedId}
        />
      </section>
    </main>
  );
}

export default App;
