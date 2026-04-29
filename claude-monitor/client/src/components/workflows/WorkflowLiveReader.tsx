import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, GitBranch, MessageSquareText, Radio } from "lucide-react";
import { api } from "../../lib/api";
import { eventBus } from "../../lib/eventBus";
import { MarkdownOutput } from "../MarkdownOutput";
import { AgentStatusBadge } from "../StatusBadge";
import { formatDateTime, truncate, timeAgo } from "../../lib/format";
import type { Agent, SessionOutputs, WSMessage } from "../../lib/types";

interface WorkflowLiveReaderProps {
  sessionId: string | null;
}

function toTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function WorkflowLiveReader({ sessionId }: WorkflowLiveReaderProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [outputs, setOutputs] = useState<SessionOutputs>({ agents: [], latest_output_agent_id: null });
  const [isInitialLoading, setIsInitialLoading] = useState(() => Boolean(sessionId));
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [hasNewOutput, setHasNewOutput] = useState(false);
  const [isAtTop, setIsAtTop] = useState(true);
  const outputScrollRef = useRef<HTMLDivElement | null>(null);
  const previousLatestRef = useRef<string | null>(null);
  const userHasExplicitlySelected = useRef(false);
  const requestIdRef = useRef(0);
  const hasContentRef = useRef(false);

  useEffect(() => {
    hasContentRef.current = agents.length > 0 || outputs.agents.length > 0;
  }, [agents.length, outputs.agents.length]);

  const resetReaderForSession = useCallback(() => {
    setAgents([]);
    setOutputs({ agents: [], latest_output_agent_id: null });
    setSelectedAgentId(null);
    setSelectedMessageId(null);
    setHasNewOutput(false);
    previousLatestRef.current = null;
    userHasExplicitlySelected.current = false;
    hasContentRef.current = false;
  }, []);

  const loadSession = useCallback(async ({ reset = false }: { reset?: boolean } = {}) => {
    const requestId = ++requestIdRef.current;

    if (!sessionId) {
      resetReaderForSession();
      setError(null);
      setIsInitialLoading(false);
      return;
    }

    if (reset) {
      resetReaderForSession();
    }

    const shouldShowInitialLoading = reset || !hasContentRef.current;
    if (shouldShowInitialLoading) {
      setIsInitialLoading(true);
    }

    try {
      const result = await api.sessions.get(sessionId);
      if (requestIdRef.current !== requestId) return;
      setAgents(result.agents);
      setOutputs(result.outputs);
      setError(null);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : "Failed to load session outputs");
      if (shouldShowInitialLoading) {
        setAgents([]);
        setOutputs({ agents: [], latest_output_agent_id: null });
      }
    } finally {
      if (requestIdRef.current !== requestId) return;
      setIsInitialLoading(false);
    }
  }, [resetReaderForSession, sessionId]);

  useEffect(() => {
    loadSession({ reset: true });
  }, [loadSession]);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout>;
    const unsubscribe = eventBus.subscribe((msg: WSMessage) => {
      if (
        msg.type === "session_created" ||
        msg.type === "session_updated" ||
        msg.type === "agent_created" ||
        msg.type === "agent_updated"
      ) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadSession(), 800);
      }

      if (msg.type === "new_event" && sessionId && "session_id" in msg.data && msg.data.session_id === sessionId) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadSession(), 800);
      }
    });
    return () => {
      clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, [loadSession, sessionId]);

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

    // Auto-select when user hasn't made an explicit selection
    setSelectedAgentId((current) => {
      if (userHasExplicitlySelected.current) {
        // Even if auto-select would pick a different agent, preserve user's choice
        // as long as their chosen agent still exists
        if (current && agentMap.has(current)) {
          return current;
        }
        // If their agent disappeared, clear the flag and fall back to latest
        userHasExplicitlySelected.current = false;
        return latestAgentId;
      }
      // No explicit selection yet - use normal auto-select
      if (!current) return latestAgentId;
      if (!agentMap.has(current)) return latestAgentId;
      return current;
    });

    if (latestAgentId && latestSignature && previousLatestRef.current !== latestSignature) {
      previousLatestRef.current = latestSignature;
      if (isAtTop) {
        // User is at top following live output, auto-scroll to top
        if (typeof outputScrollRef.current?.scrollTo === "function") {
          outputScrollRef.current.scrollTo({ top: 0, behavior: "smooth" });
        }
      } else {
        // User scrolled away reading history, show indicator
        setHasNewOutput(true);
      }
    }
  }, [agentMap, orderedAgents, outputMap, outputs.latest_output_agent_id, isAtTop]);

  const selectedAgent = selectedAgentId ? agentMap.get(selectedAgentId) || null : null;
  const selectedOutput = selectedAgentId ? outputMap.get(selectedAgentId) || null : null;
  const outputMessages = selectedOutput?.outputs || [];
  const selectedMessage =
    outputMessages.find((message) => message.id === selectedMessageId) ||
    selectedOutput?.latest_output ||
    outputMessages[0] ||
    null;

  useEffect(() => {
    if (!selectedOutput?.latest_output) {
      setSelectedMessageId(null);
      return;
    }

    setSelectedMessageId((current) =>
      current && selectedOutput.outputs.some((message) => message.id === current)
        ? current
        : selectedOutput.latest_output?.id || null
    );
  }, [selectedOutput]);

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-gray-100">Agent Output</h3>
            </div>
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
                  onClick={() => { userHasExplicitlySelected.current = true; setSelectedAgentId(agent.id); }}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "border-accent/40 bg-accent/10 text-gray-100"
                      : "border-border/70 bg-[rgb(var(--surface-1)/0.34)] text-gray-400 hover:border-border hover:text-gray-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      {agent.type === "main" ? (
                        <Bot className="h-3.5 w-3.5" />
                      ) : (
                        <GitBranch className="h-3.5 w-3.5" />
                      )}
                      <span className="truncate text-sm font-medium">{truncate(agent.name, 22)}</span>
                    </span>
                    <AgentStatusBadge status={agent.status} pulse={agent.status === "working" || agent.status === "connected"} />
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

        <div
          ref={outputScrollRef}
          data-testid="output-scroll-container"
          onScroll={(e) => {
            const target = e.currentTarget;
            const atTop = target.scrollTop <= 100;
            if (atTop !== isAtTop) {
              setIsAtTop(atTop);
              if (atTop) {
                setHasNewOutput(false);
              }
            }
          }}
          className="max-h-[70vh] overflow-y-auto px-5 py-5"
        >
          {isInitialLoading && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center text-sm text-gray-500">
              Loading live reader...
            </div>
          )}

          {!isInitialLoading && error && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-gray-300">Live reader is unavailable</p>
              <p className="mt-2 text-sm text-gray-500">{error}</p>
            </div>
          )}

          {!isInitialLoading && !error && selectedAgent && selectedOutput?.latest_output && selectedMessage && (
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-border/70 bg-[rgb(var(--surface-1)/0.34)] p-3">
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                      Agent Stream
                    </p>
                    <p className="mt-1 text-xs text-gray-500">{outputMessages.length} captured messages</p>
                  </div>
                  {hasNewOutput && (
                    <button
                      type="button"
                      onClick={() => {
                        setHasNewOutput(false);
                        setSelectedMessageId(selectedOutput.latest_output?.id || null);
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-1 text-[10px] font-medium text-accent hover:bg-accent/30"
                    >
                      <Radio className="h-3 w-3" />
                      Live
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {outputMessages.map((message, index) => {
                    const isSelected = selectedMessage.id === message.id;
                    const sourceLabel =
                      message.source === "team_return"
                        ? "Team"
                        : message.source === "transcript"
                          ? "Transcript"
                          : "Hook";
                    return (
                      <button
                        key={message.id}
                        type="button"
                        onClick={() => setSelectedMessageId(message.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                          isSelected
                            ? "border-accent/40 bg-accent/10 text-gray-100"
                            : "border-border/60 bg-[rgb(var(--surface-0)/0.28)] text-gray-400 hover:border-border hover:text-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <MessageSquareText className="h-3.5 w-3.5" />
                            {index === 0 ? "Latest" : `Update ${outputMessages.length - index}`}
                          </span>
                          <span className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-gray-500">
                            {sourceLabel}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[11px] text-gray-500">
                          {message.timestamp ? timeAgo(message.timestamp) : "Timestamp unavailable"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <article className="rounded-2xl border border-accent/20 bg-accent/10 p-4 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-500">
                      Current Message
                    </p>
                    <h4 className="mt-2 truncate text-base font-semibold text-gray-100">{selectedAgent.name}</h4>
                    <p className="mt-1 text-xs text-gray-500">
                      {selectedMessage.timestamp
                        ? formatDateTime(selectedMessage.timestamp)
                        : "Timestamp unavailable"}
                    </p>
                  </div>
                  <AgentStatusBadge status={selectedAgent.status} pulse />
                </div>

                {selectedOutput.transcript_path && (
                  <p className="mt-4 break-all text-[11px] font-mono text-gray-500">
                    {truncate(selectedOutput.transcript_path, 96)}
                  </p>
                )}

                <div className="mt-5 rounded-xl border border-border/70 bg-[rgb(var(--surface-0)/0.28)] p-4">
                  <MarkdownOutput markdown={selectedMessage.markdown} />
                </div>
              </article>
            </div>
          )}

          {!isInitialLoading && !error && selectedAgent && !selectedOutput?.latest_output && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm font-medium text-gray-300">{selectedAgent.name}</p>
              <p className="mt-2 text-sm text-gray-500">
                No assistant output has been captured for this agent yet.
              </p>
            </div>
          )}

          {!isInitialLoading && !error && !selectedAgent && (
            <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center">
              <p className="text-sm text-gray-500">Select a session and an agent to inspect output.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
