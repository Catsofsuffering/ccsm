import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bot,
  Clock,
  Cpu,
  DollarSign,
  FolderOpen,
  GitBranch,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { AgentCard } from "../components/AgentCard";
import { AgentStatusBadge, SessionStatusBadge } from "../components/StatusBadge";
import { Button } from "../components/ui/Button";
import {
  formatDateTime,
  formatDuration,
  fmtCostFull,
  timeAgo,
} from "../lib/format";
import type {
  Agent,
  CostResult,
  DashboardEvent,
  Session,
  SessionStatus,
} from "../lib/types";

function countDescendants(agentId: string, childrenByParent: Map<string, Agent[]>): number {
  const children = childrenByParent.get(agentId) || [];
  return children.reduce(
    (count, child) => count + 1 + countDescendants(child.id, childrenByParent),
    0
  );
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [cost, setCost] = useState<CostResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [data, costData] = await Promise.all([
        api.sessions.get(id),
        api.pricing.sessionCost(id).catch(() => null),
      ]);
      setSession(data.session);
      setAgents(data.agents);
      setEvents(data.events);
      setCost(costData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const parentsWithActiveChildren = new Set<string>();
    for (const agent of agents) {
      if (agent.parent_agent_id && (agent.status === "working" || agent.status === "connected")) {
        parentsWithActiveChildren.add(agent.parent_agent_id);
      }
    }

    if (parentsWithActiveChildren.size > 0) {
      const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
      const toExpand = new Set<string>();
      for (const parentId of parentsWithActiveChildren) {
        let current = parentId;
        while (current) {
          toExpand.add(current);
          const parent = agentMap.get(current);
          current = parent?.parent_agent_id ?? "";
        }
      }
      setExpandedAgents((previous) => new Set([...previous, ...toExpand]));
    }
  }, [agents]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (
        msg.type === "agent_created" ||
        msg.type === "agent_updated" ||
        msg.type === "session_updated" ||
        msg.type === "new_event"
      ) {
        load();
      }
    });
  }, [load]);

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.id, agent])), [agents]);

  const childrenByParent = useMemo(() => {
    const grouped = new Map<string, Agent[]>();
    for (const agent of agents) {
      if (agent.parent_agent_id && agentMap.has(agent.parent_agent_id)) {
        const bucket = grouped.get(agent.parent_agent_id) || [];
        bucket.push(agent);
        grouped.set(agent.parent_agent_id, bucket);
      }
    }
    return grouped;
  }, [agents, agentMap]);

  const rootAgents = useMemo(
    () =>
      agents.filter(
        (agent) => !agent.parent_agent_id || !agentMap.has(agent.parent_agent_id)
      ),
    [agents, agentMap]
  );

  const orphanedAgents = useMemo(
    () =>
      rootAgents.filter(
        (agent) =>
          agent.type === "subagent" &&
          agent.parent_agent_id &&
          !agentMap.has(agent.parent_agent_id)
      ),
    [agentMap, rootAgents]
  );

  const rootTreeAgents = useMemo(
    () =>
      rootAgents.filter(
        (agent) =>
          !(agent.type === "subagent" && agent.parent_agent_id && !agentMap.has(agent.parent_agent_id))
      ),
    [agentMap, rootAgents]
  );

  const renderAgentNode = (agent: Agent, depth: number): React.ReactNode => {
    const children = childrenByParent.get(agent.id) || [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedAgents.has(agent.id);
    const totalDescendants = hasChildren ? countDescendants(agent.id, childrenByParent) : 0;

    return (
      <div key={agent.id}>
        <div className="flex items-center gap-1 min-w-0">
          {hasChildren ? (
            <button
              type="button"
              onClick={() =>
                setExpandedAgents((previous) => {
                  const next = new Set(previous);
                  if (next.has(agent.id)) next.delete(agent.id);
                  else next.add(agent.id);
                  return next;
                })
              }
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-5 flex-shrink-0" />
          )}

          {depth > 0 && <GitBranch className="w-3 h-3 text-gray-600 flex-shrink-0" />}

          <div className="flex-1 min-w-0">
            <AgentCard agent={agent} />
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3">
            {children.map((child) => renderAgentNode(child, depth + 1))}
          </div>
        )}

        {hasChildren && !isExpanded && (
          <button
            type="button"
            onClick={() => setExpandedAgents((previous) => new Set([...previous, agent.id]))}
            className="ml-6 mt-0.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            {totalDescendants} subagent{totalDescendants !== 1 ? "s" : ""}
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500 animate-fade-in">
        Loading session...
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <p className="mb-2 text-gray-200">{error || "Session not found"}</p>
        <Button variant="ghost" onClick={() => navigate("/sessions")} className="mt-4">
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </Button>
      </div>
    );
  }

  const firstEvent = events.length > 0 ? events[0] : null;

  return (
    <div className="animate-fade-in space-y-10">
      <div className="flex items-start gap-4">
        <Button variant="ghost" onClick={() => navigate("/sessions")} className="mt-1">
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-100">
              {session.name || `Session ${session.id.slice(0, 8)}`}
            </h2>
            <SessionStatusBadge status={session.status as SessionStatus} />
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 font-mono text-xs text-gray-500">
              {session.id.slice(0, 16)}
            </span>
            {session.model && (
              <span className="inline-flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-gray-400">
                <Cpu className="w-3 h-3 text-gray-500" />
                {session.model}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-2 px-2 py-1 text-xs text-gray-400">
              <Clock className="w-3 h-3 text-gray-500" />
              {firstEvent ? formatDateTime(firstEvent.created_at) : formatDateTime(session.started_at)}
              {session.ended_at && (
                <span className="ml-1 text-gray-500">
                  ({formatDuration(session.started_at, session.ended_at)})
                </span>
              )}
            </span>
            {session.cwd && (
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
                <FolderOpen className="w-3 h-3 flex-shrink-0" />
                <span className="max-w-xs truncate font-mono">{session.cwd}</span>
              </span>
            )}
            {cost && cost.total_cost > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded bg-accent-dim px-2 py-1 text-xs font-medium text-accent">
                <DollarSign className="w-3 h-3" />
                {fmtCostFull(cost.total_cost).slice(1)}
              </span>
            )}
          </div>
        </div>

        <Button variant="ghost" onClick={load}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Bot className="w-3.5 h-3.5 text-gray-500" />
            <h3 className="text-sm font-medium text-gray-300">Agents ({agents.length})</h3>
          </div>

          {agents.length === 0 ? (
            <p className="text-sm text-gray-500">No agents recorded.</p>
          ) : (
            <div className="space-y-2">
              {rootTreeAgents.map((agent) => renderAgentNode(agent, 0))}
              {orphanedAgents.length > 0 && (
                <div className="mt-6">
                  <p className="mb-2 text-[11px] uppercase tracking-wider text-gray-600">
                    Unparented Subagents
                  </p>
                  <div className="space-y-1">
                    {orphanedAgents.map((agent) => renderAgentNode(agent, 1))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <div className="space-y-10">
          {cost && cost.breakdown.length > 0 && cost.total_cost > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-sm font-medium text-gray-300">Cost Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-3 pr-4 text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Model
                      </th>
                      <th className="pb-3 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Input
                      </th>
                      <th className="pb-3 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Output
                      </th>
                      <th className="pb-3 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Cache Read
                      </th>
                      <th className="pb-3 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Cache Write
                      </th>
                      <th className="pb-3 text-right text-[11px] font-medium uppercase tracking-wider text-gray-500">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cost.breakdown.map((row) => (
                      <tr key={row.model} className="hover:bg-surface-2 transition-colors">
                        <td className="py-2.5 pr-4 font-mono text-sm text-gray-300">{row.model}</td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm text-gray-400">
                          {row.input_tokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm text-gray-400">
                          {row.output_tokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm text-gray-400">
                          {row.cache_read_tokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-sm text-gray-400">
                          {row.cache_write_tokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 text-right font-mono text-sm font-medium text-accent">
                          {fmtCostFull(row.cost, 4)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-surface-2">
                      <td className="py-2.5 pr-4 text-sm font-medium text-gray-200" colSpan={5}>
                        Total
                      </td>
                      <td className="py-2.5 text-right font-mono text-sm font-semibold text-accent">
                        {fmtCostFull(cost.total_cost, 4)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section>
            <div className="mb-4 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
              <h3 className="text-sm font-medium text-gray-300">Event Timeline ({events.length})</h3>
            </div>

            {events.length === 0 ? (
              <p className="text-sm text-gray-500">No events recorded.</p>
            ) : (
              <div className="space-y-px">
                {events.map((event, index) => (
                  <div
                    key={event.id ?? index}
                    className="flex min-w-0 items-center gap-4 rounded px-3 py-2.5 transition-colors hover:bg-surface-2 animate-slide-up"
                    style={{ animationDelay: `${index * 15}ms` }}
                  >
                    <div className="w-14 flex-shrink-0 font-mono text-[11px] text-gray-600">
                      {timeAgo(event.created_at)}
                    </div>
                    <AgentStatusBadge
                      status={
                        event.event_type === "Stop" || event.event_type === "Compaction"
                          ? "completed"
                          : event.event_type === "PreToolUse"
                            ? "working"
                            : event.event_type === "error"
                              ? "error"
                              : "connected"
                      }
                      pulse
                    />
                    <span className="flex-1 truncate text-sm text-gray-300">
                      {event.summary || event.event_type}
                    </span>
                    {event.tool_name && (
                      <span className="flex-shrink-0 rounded bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-gray-500">
                        {event.tool_name}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
