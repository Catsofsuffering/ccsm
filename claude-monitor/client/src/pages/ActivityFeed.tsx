import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Pause, Play, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { AgentStatusBadge } from "../components/StatusBadge";
import { EmptyState } from "../components/EmptyState";
import { Button } from "../components/ui/Button";
import { formatTime, timeAgo } from "../lib/format";
import type { AgentStatus, DashboardEvent } from "../lib/types";

const PAGE_SIZE = 10;

export function ActivityFeed({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [bufferCount, setBufferCount] = useState(0);
  const bufferRef = useRef<DashboardEvent[]>([]);
  const pausedRef = useRef(paused);

  pausedRef.current = paused;

  const load = useCallback(async () => {
    try {
      const { events: data } = await api.events.list({ limit: 100 });
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type === "new_event") {
        const event = msg.data as DashboardEvent;
        if (pausedRef.current) {
          bufferRef.current = [event, ...bufferRef.current];
          setBufferCount(bufferRef.current.length);
        } else {
          setEvents((prev) => [event, ...prev.slice(0, 199)]);
        }
      }
    });
  }, []);

  function resume() {
    pausedRef.current = false;
    const buffered = bufferRef.current;
    bufferRef.current = [];
    setBufferCount(0);
    setEvents((prev) => [...buffered, ...prev].slice(0, 200));
    setPaused(false);
  }

  function statusFromEventType(type: string): AgentStatus {
    switch (type) {
      case "PreToolUse":
        return "working";
      case "PostToolUse":
        return "connected";
      case "Stop":
      case "SubagentStop":
      case "Compaction":
        return "completed";
      default:
        return "idle";
    }
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {!embedded && (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/30 bg-accent-muted">
              <Activity className="h-4 w-4 text-accent" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-100">Activity Feed</h1>
              <p className="text-xs text-gray-500">
                {paused ? `Paused - ${bufferCount} buffered` : "Live stream"}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {embedded && (
            <p className="text-xs text-gray-500">
              {paused ? `${bufferCount} buffered while paused` : "Live stream"}
            </p>
          )}
          <Button variant="ghost" size="sm" onClick={() => (paused ? resume() : setPaused(true))}>
            {paused ? (
              <>
                <Play className="w-3.5 h-3.5" /> Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause
              </>
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {!loading && events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="Events will stream here in real time as Claude Code agents work."
        />
      ) : (
        <>
          <div className="space-y-px">
            {events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((event, index) => (
              <div
                key={event.id ?? index}
                onClick={() => navigate(`/sessions/${event.session_id}`)}
                className="animate-slide-up cursor-pointer rounded px-3 py-2.5 transition-colors hover:bg-surface-2"
                style={{ animationDelay: `${index * 20}ms` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 flex-shrink-0 text-right font-mono text-[11px] text-gray-600">
                    {formatTime(event.created_at)}
                  </div>

                  <AgentStatusBadge status={statusFromEventType(event.event_type)} pulse />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-300">
                      {event.summary || event.event_type}
                    </p>
                  </div>

                  {event.tool_name && (
                    <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-gray-500">
                      {event.tool_name}
                    </span>
                  )}

                  <span className="w-14 flex-shrink-0 text-right text-[11px] text-gray-600">
                    {timeAgo(event.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {events.length > PAGE_SIZE && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, events.length)} of{" "}
                {events.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="px-3 py-1 text-xs text-gray-500">
                  {page + 1} / {Math.ceil(events.length / PAGE_SIZE)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(Math.ceil(events.length / PAGE_SIZE) - 1, current + 1)
                    )
                  }
                  disabled={page >= Math.ceil(events.length / PAGE_SIZE) - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
