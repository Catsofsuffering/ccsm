import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, FileText, GitBranch } from "lucide-react";
import { api } from "../../lib/api";
import { eventBus } from "../../lib/eventBus";
import { MarkdownOutput } from "../MarkdownOutput";
import { AgentStatusBadge, SessionStatusBadge } from "../StatusBadge";
import { formatDateTime, truncate, timeAgo } from "../../lib/format";
import type { Agent, Session, SessionOutputs, WSMessage } from "../../lib/types";

interface WorkflowLiveReaderProps {
  sessionId: string | null;
  onSessionSelect: (id: string) => void;
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function WorkflowLiveReader({ sessionId, onSessionSelect }: WorkflowLiveReaderProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [outputs, setOutputs] = useState<SessionOutputs>({ agents: [], latest_output_agent_id: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const outputScrollRef = useRef<HTMLDivElement | null>(null);
  const previousLatestRef = useRef<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const result = await api.sessions.list({ limit: 200 });
      setSessions(result.sessions);
    } catch {
      // Keep the current list if a refresh fails.
    }
  }, []);

  const loadSession = useCallback(async () => {
    if (!sessionId) {
      setSession(null);
      setAgents([]);
      setOutputs({ agents: [], latest_output_agent_id: null });
      setSelectedAgentId(null);
      return;
    }

    try {
      setLoading(true);
      const result = await api.sessions.get(sessionId);
      setSession(result.session);
      setAgents(result.agents);
      setOutputs(result.outputs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session outputs");
      setSession(null);
      setAgents([]);
      setOutputs({ agents: [], latest_output_agent_id: null });
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    return eventBus.subscribe((msg: WSMessage) => {
      if (
        msg.type === "session_created" ||
        msg.type === "session_updated" ||
        msg.type === "agent_created" ||
        msg.type === "agent_updated"
      ) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadSessions();
          loadSession();
        }, 800);
      }

      if (msg.type === "new_event" && sessionId && "session_id" in msg.data && msg.data.session_id === sessionId) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadSession, 800);
      }
    });
  }, [loadSession, loadSessions, sessionId]);

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);
  const outputMap = useMemo(
    () => new Map(outputs.agents.map((output) => [output.agent_id, output])),
    [outputs.agents]
  );

  const orderedAgents = useMemo(
    () =>
      [...agents].sort((left, right) => {
        const leftOutput = outputMap.get(left.id);
        const rightOutput = outputMap.get(right.id);
        const timeDelta =
          toTime(rightOutput?.latest_timestamp || right.updated_at) -
          toTime(leftOutput?.latest_timestamp || left.updated_at);
        if (timeDelta !== 0) return timeDelta;
        return left.name.localeCompare(right.name);
      }),
    [agents, outputMap]
  );

  useEffect(() => {
    if (orderedAgents.length === 0) {
      setSelectedAgentId(null);
      return;
    }

    const latestAgentId = outputs.latest_output_agent_id || orderedAgents[0]?.id || null;
    const latestFeed = latestAgentId ? outputMap.get(latestAgentId) : null;
    const latestSignature = latestFeed?.latest_output
      ? `${latestFeed.agent_id}:${latestFeed.latest_output.id}`
      : null;

    setSelectedAgentId((current) => {
      if (!current) return latestAgentId;
      if (!agentMap.has(current)) return latestAgentId;
      return current;
    });

    if (latestAgentId && latestSignature && previousLatestRef.current !== latestSignature) {
      previousLatestRef.current = latestSignature;
      setSelectedAgentId(latestAgentId);
      setRefreshKey((value) => value + 1);
      if (typeof outputScrollRef.current?.scrollTo === "function") {
        outputScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [agentMap, orderedAgents, outputMap, outputs.latest_output_agent_id]);

  const selectedAgent = selectedAgentId ? agentMap.get(selectedAgentId) || null : null;
  const selectedOutput = selectedAgentId ? outputMap.get(selectedAgentId) || null : null;
  const latestOutputAgent = outputs.latest_output_agent_id
    ? agentMap.get(outputs.latest_output_agent_id) || null
    : null;
  const historyOutputs = selectedOutput?.outputs.slice(1) || [];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="glass-panel rounded-2xl px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Recent Sessions</p>
            <span className="text-[11px] text-gray-600">{sessions.length} tracked</span>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {sessions.slice(0, 40).map((item) => {
              const active = item.id === sessionId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSessionSelect(item.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-accent/30 bg-accent/10 text-gray-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                      : "border-border/70 bg-[rgb(var(--surface-1)/0.42)] text-gray-400 hover:border-border hover:bg-[rgb(var(--surface-1)/0.58)] hover:text-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium">
                      {item.name || item.id}
                    </span>
                    <SessionStatusBadge status={item.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                    <span className="truncate font-mono">{truncate(item.id, 18)}</span>
                    {item.model && (
                      <>
                        <span>|</span>
                        <span className="truncate">{item.model}</span>
                      </>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-panel rounded-2xl px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Focused Session</p>
          {session ? (
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="truncate text-base font-semibold text-gray-100">
                  {session.name || session.id}
                </h3>
                <SessionStatusBadge status={session.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px] text-gray-500">
                <div className="rounded-xl border border-border/70 bg-[rgb(var(--surface-1)/0.38)] px-3 py-2 backdrop-blur-xl">
                  <div className="uppercase tracking-[0.14em]">Model</div>
                  <div className="mt-1 text-sm text-gray-200">{session.model || "unknown"}</div>
                </div>
                <div className="rounded-xl border border-border/70 bg-[rgb(var(--surface-1)/0.38)] px-3 py-2 backdrop-blur-xl">
                  <div className="uppercase tracking-[0.14em]">Started</div>
                  <div className="mt-1 text-sm text-gray-200">
                    {formatDateTime(session.started_at)}
                  </div>
                </div>
              </div>
              {session.cwd && (
                <p className="truncate text-[11px] font-mono text-gray-600">{session.cwd}</p>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-dashed border-border px-3 py-8 text-sm text-gray-500">
              Select a session to stream its latest agent outputs here.
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Live Reader</p>
              <h3 className="mt-2 text-base font-semibold text-gray-100">Agent Output</h3>
            </div>
            {latestOutputAgent && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Newest</p>
                <p className="mt-1 text-sm text-accent">{truncate(latestOutputAgent.name, 20)}</p>
              </div>
            )}
          </div>

          {orderedAgents.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {orderedAgents.map((agent) => {
                const feed = outputMap.get(agent.id);
                const isSelected = selectedAgentId === agent.id;
                return (
                  <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-accent/40 bg-accent/10 text-gray-100"
                      : "border-border/70 bg-[rgb(var(--surface-1)/0.34)] text-gray-400 hover:border-border hover:text-gray-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                      {agent.type === "main" ? (
                        <Bot className="h-3.5 w-3.5" />
                      ) : (
                        <GitBranch className="h-3.5 w-3.5" />
                      )}
                      <span className="text-sm font-medium">{truncate(agent.name, 22)}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                      <span>{feed?.output_count || 0} entries</span>
                      <span>|</span>
                      <span>{feed?.latest_timestamp ? timeAgo(feed.latest_timestamp) : "No output yet"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div ref={outputScrollRef} className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {loading && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-gray-500">
              Loading live reader...
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-gray-300">Live reader is unavailable</p>
              <p className="mt-2 text-sm text-gray-500">{error}</p>
            </div>
          )}

          {!loading && !error && selectedAgent && selectedOutput?.latest_output && (
            <div className="space-y-6">
              <div
                key={refreshKey}
                className="animate-slide-up rounded-2xl border border-accent/20 bg-accent/10 p-4 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Latest Output</p>
                    <h4 className="mt-2 text-base font-semibold text-gray-100">{selectedAgent.name}</h4>
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedOutput.latest_output.timestamp
                        ? formatDateTime(selectedOutput.latest_output.timestamp)
                        : "Timestamp unavailable"}
                    </p>
                  </div>
                  <AgentStatusBadge status={selectedAgent.status} pulse />
                </div>

                {selectedOutput.transcript_path && (
                  <p className="mt-4 break-all text-[11px] font-mono text-gray-300">
                    {truncate(selectedOutput.transcript_path, 72)}
                  </p>
                )}

                <div className="mt-5 border-t border-border/70 pt-5">
                  <MarkdownOutput markdown={selectedOutput.latest_output.markdown} />
                </div>
              </div>

              {historyOutputs.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">Output History</p>
                      <p className="mt-1 text-sm text-gray-400">
                        {historyOutputs.length} earlier message{historyOutputs.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <FileText className="h-4 w-4 text-gray-600" />
                  </div>

                  {historyOutputs.map((message) => (
                    <article
                      key={message.id}
                      className="rounded-xl border border-border/70 bg-[rgb(var(--surface-1)/0.38)] px-4 py-4 backdrop-blur-xl"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500">
                          {message.source === "transcript" ? "Transcript" : "Hook snapshot"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {message.timestamp ? formatDateTime(message.timestamp) : "Timestamp unavailable"}
                        </p>
                      </div>
                      <div className="mt-4">
                        <MarkdownOutput markdown={message.markdown} />
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {!loading && !error && selectedAgent && !selectedOutput?.latest_output && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-gray-300">{selectedAgent.name}</p>
              <p className="mt-2 text-sm text-gray-500">
                No assistant output has been captured for this agent yet.
              </p>
            </div>
          )}

          {!loading && !error && !selectedAgent && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm text-gray-500">Select a session and an agent to inspect output.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
