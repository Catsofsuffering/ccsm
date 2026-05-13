/**
 * @file Express router for analytics endpoints, providing aggregated statistics on token usage, tool usage, daily events/sessions, agent types, and more. It queries the database for various metrics and returns them in a structured JSON format for frontend consumption.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const { stmts, db } = require("../db");

const router = Router();

/**
 * Categorize a model string into a role family for attribution tracking.
 *
 * Policy: only return a role when there is explicit evidence.
 * Without session/runtime/metadata evidence distinguishing orchestrator vs execution,
 * we conservatively return "unknown" rather than guessing.
 *
 * - "opencode" maps to acceptance-review when present (optional reviewer role)
 * - All other models return "unknown" until evidence from monitor metadata
 *   can distinguish orchestrator from execution participation
 */
function modelToRoleFamily(model) {
  if (!model || model === "unknown" || model === "") return "unknown";
  const value = String(model).toLowerCase();
  // opencode is an explicit acceptance-review role
  if (value.includes("opencode")) return "acceptance-review";
  // claude/codex/gpt model names alone do not provide sufficient evidence
  // to distinguish orchestrator vs execution — return unknown per spec policy
  return "unknown";
}

router.get("/", (_req, res) => {
  const tokenTotals = stmts.getTokenTotals.get();
  const toolUsage = stmts.toolUsageCounts.all();
  const dailyEvents = stmts.dailyEventCounts.all();
  const dailySessions = stmts.dailySessionCounts.all();
  const agentTypes = stmts.agentTypeDistribution.all();
  const overview = stmts.stats.get();
  const agentsByStatus = stmts.agentStatusCounts.all();
  const sessionsByStatus = stmts.sessionStatusCounts.all();
  const totalSubagents = stmts.totalSubagentCount.get();
  const eventTypes = stmts.eventTypeCounts.all();
  const avgEvents = stmts.avgEventsPerSession.get();

  // Get token breakdown by model for attribution tracking
  // This includes opencode tokens when evidence exists
  const tokensByModel = stmts.getTokenTotalsByModel.all();

  // Aggregate tokens by role family for cost/rework efficiency analytics
  // Distinguishes orchestrator, execution, and acceptance-review participation
  const roleTokenTotals = {
    orchestrator: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    execution: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    "acceptance-review": { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    unknown: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  };

  let hasOpencodeEvidence = false;
  for (const row of tokensByModel) {
    const family = modelToRoleFamily(row.model);
    roleTokenTotals[family].input += row.total_input || 0;
    roleTokenTotals[family].output += row.total_output || 0;
    roleTokenTotals[family].cache_read += row.total_cache_read || 0;
    roleTokenTotals[family].cache_write += row.total_cache_write || 0;
    if (row.model && row.model.toLowerCase().includes("opencode")) {
      hasOpencodeEvidence = true;
    }
  }

  // Build tokensByModel response with explicit model names
  // If no opencode evidence exists, indicate uncertainty rather than fabricating claims
  const modelBreakdown = tokensByModel.map((row) => ({
    model: row.model,
    total_input: row.total_input || 0,
    total_output: row.total_output || 0,
    total_cache_read: row.total_cache_read || 0,
    total_cache_write: row.total_cache_write || 0,
    roleFamily: modelToRoleFamily(row.model),
  }));

  // Query sessions that have opencode tokens vs those that don't
  const reviewSessionIds = db.prepare(
    `SELECT DISTINCT session_id FROM token_usage WHERE LOWER(model) LIKE '%opencode%'`
  ).all().map(r => r.session_id);

  let reworkEfficiency;
  if (reviewSessionIds.length === 0) {
    reworkEfficiency = { hasEvidence: false };
  } else {
    const placeholders = reviewSessionIds.map(() => '?').join(',');
    const hasReviewOutcomes = db.prepare(
      `SELECT status, COUNT(*) as count FROM sessions WHERE id IN (${placeholders}) GROUP BY status`
    ).all(...reviewSessionIds);

    const nonReviewOutcomes = db.prepare(
      `SELECT status, COUNT(*) as count FROM sessions WHERE id NOT IN (${placeholders}) GROUP BY status`
    ).all(...reviewSessionIds);

    reworkEfficiency = {
      hasEvidence: true,
      hasReviewSessions: reviewSessionIds.length,
      hasReviewOutcomes,
      noReviewSessions: (stmts.stats.get()?.total_sessions || 0) - reviewSessionIds.length,
      noReviewOutcomes: nonReviewOutcomes,
    };
  }

  res.json({
    tokens: {
      total_input: tokenTotals?.total_input ?? 0,
      total_output: tokenTotals?.total_output ?? 0,
      total_cache_read: tokenTotals?.total_cache_read ?? 0,
      total_cache_write: tokenTotals?.total_cache_write ?? 0,
    },
    tokens_by_model: modelBreakdown,
    tokens_by_role: roleTokenTotals,
    // Explicit uncertainty indicator when no opencode evidence exists
    // This prevents fabricated efficiency claims about acceptance-review participation
    acceptance_review_evidence: hasOpencodeEvidence ? "confirmed" : "no-evidence",
    tool_usage: toolUsage,
    daily_events: dailyEvents,
    daily_sessions: dailySessions,
    agent_types: agentTypes,
    event_types: eventTypes,
    avg_events_per_session: avgEvents?.avg ?? 0,
    total_subagents: totalSubagents?.count ?? 0,
    overview,
    agents_by_status: Object.fromEntries(agentsByStatus.map((r) => [r.status, r.count])),
    sessions_by_status: Object.fromEntries(sessionsByStatus.map((r) => [r.status, r.count])),
    reworkEfficiency,
  });
});

module.exports = router;
