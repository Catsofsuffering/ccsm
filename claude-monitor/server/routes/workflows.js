/**
 * @file Express router for workflow intelligence endpoints, providing aggregated insights into workflow orchestration, tool usage patterns, subagent effectiveness, error propagation, concurrency, and session complexity. It queries the database for various metrics and patterns related to agents, sessions, and events, and returns a comprehensive JSON response for frontend visualization on the dashboard.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const { db, stmts } = require("../db");
const { workspaceSessionFilter, getBestKnownModelForSession, getActiveWorkspaceRoot } = require("../lib/openspec-state");
const { isStartupOnlyNoiseSession } = require("../lib/session-noise");

const router = Router();

// ── Helper: compute session duration in seconds ──
function durationSec(s) {
  if (!s.started_at) return 0;
  const end = s.ended_at || new Date().toISOString();
  return Math.max(0, (new Date(end) - new Date(s.started_at)) / 1000);
}

// ── GET / — Aggregate workflow intelligence ──
router.get("/", (req, res) => {
  try {
    // Optional status filter: "active", "completed", or omit for all
    const statusFilter = req.query.status || null;
    // Default to active workspace when workspaceRoot is not explicitly provided
    const workspaceRoot = req.query.workspaceRoot || getActiveWorkspaceRoot() || null;

    const data = {
      stats: getWorkflowStats(statusFilter, workspaceRoot),
      orchestration: getOrchestrationData(statusFilter, workspaceRoot),
      toolFlow: getToolFlowData(statusFilter, workspaceRoot),
      effectiveness: getSubagentEffectiveness(statusFilter, workspaceRoot),
      patterns: getWorkflowPatterns(statusFilter, workspaceRoot),
      modelDelegation: getModelDelegation(statusFilter, workspaceRoot),
      errorPropagation: getErrorPropagation(statusFilter, workspaceRoot),
      concurrency: getConcurrencyData(statusFilter, workspaceRoot),
      complexity: getSessionComplexity(statusFilter, workspaceRoot),
      compaction: getCompactionImpact(statusFilter, workspaceRoot),
      cooccurrence: getAgentCooccurrence(statusFilter, workspaceRoot),
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ── GET /session/:id — Single session drill-in ──
router.get("/session/:id", (req, res) => {
  try {
    const sessionId = req.params.id;
    const session = stmts.getSession.get(sessionId);
    if (!session) return res.status(404).json({ error: { message: "Session not found" } });

    const agents = stmts.listAgentsBySession.all(sessionId);
    const events = db
      .prepare("SELECT * FROM events WHERE session_id = ? ORDER BY created_at ASC, id ASC")
      .all(sessionId);

    // Build agent tree
    const tree = buildAgentTree(agents);

    // Build tool timeline
    const toolTimeline = events
      .filter((e) => e.tool_name)
      .map((e) => ({
        id: e.id,
        tool_name: e.tool_name,
        event_type: e.event_type,
        agent_id: e.agent_id,
        created_at: e.created_at,
        summary: e.summary,
      }));

    // Agent swim lanes
    const swimLanes = agents.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      subagent_type: a.subagent_type,
      status: a.status,
      started_at: a.started_at,
      ended_at: a.ended_at,
      parent_agent_id: a.parent_agent_id,
    }));

    res.json({ session, tree, toolTimeline, swimLanes, events: events.slice(0, 500) });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// ═══════════════════════════════════════════════════
// Data-fetching functions
// ═══════════════════════════════════════════════════

/**
 * Build a SQL WHERE clause for session status filtering.
 * Returns { clause, params } where clause is either empty or " AND s.status = ?".
 * Use `sessionAlias` to match the table alias used in your query (default "s").
 */
function statusClause(statusFilter, alias = "s") {
  if (!statusFilter || statusFilter === "all") return { clause: "", params: [] };
  return { clause: ` AND ${alias}.status = ?`, params: [statusFilter] };
}

/** Same but for agents table joins where we need to filter via session_id */
function sessionIdFilter(statusFilter) {
  if (!statusFilter || statusFilter === "all") return { clause: "", params: [] };
  return {
    clause: " AND session_id IN (SELECT id FROM sessions WHERE status = ?)",
    params: [statusFilter],
  };
}

/**
 * Build a session_id filter for agents table with explicit alias.
 * Use this instead of string replacement to avoid broken SQL.
 */
function agentSessionIdFilter(statusFilter) {
  if (!statusFilter || statusFilter === "all") return { clause: "", params: [] };
  return {
    clause: " AND a.session_id IN (SELECT id FROM sessions WHERE status = ?)",
    params: [statusFilter],
  };
}

/**
 * Build a session_id filter for a named agents alias.
 * Use this instead of string replacement to avoid broken SQL.
 */
function namedAgentSessionIdFilter(statusFilter, alias) {
  if (!statusFilter || statusFilter === "all") return { clause: "", params: [] };
  return {
    clause: ` AND ${alias}.session_id IN (SELECT id FROM sessions WHERE status = ?)`,
    params: [statusFilter],
  };
}

/**
 * Build a session_id filter for a named events alias.
 * Unlike agent filters, events use e.session_id directly without a WHERE clause wrapper.
 * Use this instead of string replacement to avoid broken SQL.
 * Note: includes " AND " prefix since it's appended to an existing WHERE clause.
 */
function eventSessionIdFilter(statusFilter, alias = "session_id") {
  if (!statusFilter || statusFilter === "all") return { clause: "", params: [] };
  return {
    clause: ` AND ${alias} IN (SELECT id FROM sessions WHERE status = ?)`,
    params: [statusFilter],
  };
}

/**
 * Get meaningful session IDs that pass the startup-noise classifier.
 * Composes status and workspace filters with isStartupOnlyNoiseSession.
 * Returns deterministic empty list when no meaningful sessions exist.
 * Zero-event degenerate sessions are preserved (not classified as noise).
 */
function getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot) {
  const ss = statusClause(statusFilter);
  const wf = workspaceSessionFilter(workspaceRoot);

  const sessionRows = db
    .prepare(`SELECT id FROM sessions s WHERE 1=1${ss.clause}${wf.clause}`)
    .all(...ss.params, ...wf.params);

  const meaningfulIds = [];
  for (const row of sessionRows) {
    if (!isStartupOnlyNoiseSession(db, row.id)) {
      meaningfulIds.push(row.id);
    }
  }

  return meaningfulIds;
}

function meaningfulSessionFilter(ids, column = "s.id") {
  if (ids.length === 0) {
    return { clause: " AND 1=0", params: [] };
  }

  return {
    clause: ` AND ${column} IN (${ids.map(() => "?").join(",")})`,
    params: ids,
  };
}

function getWorkflowStats(statusFilter, workspaceRoot) {
  const sf = sessionIdFilter(statusFilter);
  const ss = statusClause(statusFilter);
  const wf = workspaceSessionFilter(workspaceRoot);

  // Total sessions - scoped to meaningful sessions only (excludes startup-only noise)
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const ms = meaningfulSessionFilter(meaningfulIds, "s.id");
  const totalSessions = meaningfulIds.length;

  // Agent totals - scoped to meaningful sessions only.
  let totalAgents, totalSubagents, completedAgents, errorAgents, totalCompactions;
  let depthRows;
  let avgCompactions;

  totalAgents = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE 1=1${ms.clause}`)
    .get(...ms.params).c;
  totalSubagents = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.type = 'subagent'${ms.clause}`)
    .get(...ms.params).c;
  completedAgents = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.status = 'completed'${ms.clause}`)
    .get(...ms.params).c;
  errorAgents = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.status = 'error'${ms.clause}`)
    .get(...ms.params).c;
  totalCompactions = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.subagent_type = 'compaction'${ms.clause}`)
    .get(...ms.params).c;

  if (meaningfulIds.length > 0) {
    const placeholders = meaningfulIds.map(() => '?').join(',');
    depthRows = db
      .prepare(
        `WITH RECURSIVE agent_depth AS (
          SELECT id, session_id, parent_agent_id, 0 as depth FROM agents WHERE parent_agent_id IS NULL AND session_id IN (${placeholders})
          UNION ALL
          SELECT a.id, a.session_id, a.parent_agent_id, ad.depth + 1
          FROM agents a JOIN agent_depth ad ON a.parent_agent_id = ad.id WHERE a.session_id IN (${placeholders})
        )
        SELECT session_id, MAX(depth) as max_depth FROM agent_depth
        GROUP BY session_id`
      )
      .all(...meaningfulIds, ...meaningfulIds);
  } else {
    depthRows = [];
  }

  // Average subagents per session
  const avgSubagents = totalSessions > 0 ? +(totalSubagents / totalSessions).toFixed(1) : 0;

  // Agent success rate
  const finishedAgents = completedAgents + errorAgents;
  const successRate =
    finishedAgents > 0 ? +((completedAgents / finishedAgents) * 100).toFixed(1) : 100;

  const avgDepth =
    depthRows.length > 0
      ? +(depthRows.reduce((s, r) => s + r.max_depth, 0) / depthRows.length).toFixed(1)
      : 0;

  // Average session duration - filtered to meaningful session IDs
  const sessionsDur = (() => {
    if (meaningfulIds.length === 0) return [];
    const meaningfulPlaceholders = meaningfulIds.map(() => '?').join(',');
    return db
      .prepare(`SELECT started_at, ended_at FROM sessions s WHERE ended_at IS NOT NULL AND s.id IN (${meaningfulPlaceholders})${ss.clause}${wf.clause}`)
      .all(...meaningfulIds, ...ss.params, ...wf.params);
  })();
  const totalDuration = sessionsDur.reduce((s, sess) => s + durationSec(sess), 0);
  const avgDurationSec = sessionsDur.length > 0 ? Math.round(totalDuration / sessionsDur.length) : 0;

  avgCompactions = totalSessions > 0 ? +(totalCompactions / totalSessions).toFixed(1) : 0;

  // Most common tool flow (top 2-tool sequence) - needs events joined to sessions
  let topFlow;
  if (meaningfulIds.length === 0) {
    topFlow = null;
  } else if (workspaceRoot) {
    const ef = eventSessionIdFilter(statusFilter, "e1.session_id");
    const eventScope = meaningfulSessionFilter(meaningfulIds, "e1.session_id");
    topFlow = db
      .prepare(
        `SELECT e1.tool_name as source, e2.tool_name as target, COUNT(*) as c
         FROM events e1
         JOIN events e2 ON e2.session_id = e1.session_id AND e2.id = (
           SELECT MIN(e3.id) FROM events e3
           WHERE e3.session_id = e1.session_id AND e3.id > e1.id AND e3.tool_name IS NOT NULL
         )
         JOIN sessions s ON s.id = e1.session_id
          WHERE e1.tool_name IS NOT NULL AND e2.tool_name IS NOT NULL${eventScope.clause}${ef.clause}${wf.clause}
          GROUP BY e1.tool_name, e2.tool_name
          ORDER BY c DESC LIMIT 1`
      )
      .get(...eventScope.params, ...ef.params, ...wf.params);
  } else {
    const ef = eventSessionIdFilter(statusFilter, "e1.session_id");
    const eventScope = meaningfulSessionFilter(meaningfulIds, "e1.session_id");
    topFlow = db
      .prepare(
        `SELECT e1.tool_name as source, e2.tool_name as target, COUNT(*) as c
         FROM events e1
         JOIN events e2 ON e2.session_id = e1.session_id AND e2.id = (
           SELECT MIN(e3.id) FROM events e3
           WHERE e3.session_id = e1.session_id AND e3.id > e1.id AND e3.tool_name IS NOT NULL
         )
          WHERE e1.tool_name IS NOT NULL AND e2.tool_name IS NOT NULL${eventScope.clause}${ef.clause}
          GROUP BY e1.tool_name, e2.tool_name
          ORDER BY c DESC LIMIT 1`
      )
      .get(...eventScope.params, ...ef.params);
  }

  return {
    totalSessions,
    totalAgents,
    totalSubagents,
    avgSubagents,
    successRate,
    avgDepth,
    avgDurationSec,
    totalCompactions,
    avgCompactions,
    topFlow: topFlow ? { source: topFlow.source, target: topFlow.target, count: topFlow.c } : null,
  };
}

function getOrchestrationData(statusFilter, workspaceRoot) {
  let sessionCount, mainCount, subagentTypes, edges, outcomes, compactions, totalCompactions, sessionsWithCompactions;
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const ms = meaningfulSessionFilter(meaningfulIds, "s.id");
  sessionCount = meaningfulIds.length;

  mainCount = db
    .prepare(`SELECT COUNT(*) as c FROM agents a JOIN sessions s ON s.id = a.session_id WHERE a.type = 'main'${ms.clause}`)
    .get(...ms.params).c;

  subagentTypes = db
    .prepare(
      `SELECT a.subagent_type, COUNT(*) as count,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN a.status = 'error' THEN 1 ELSE 0 END) as errors
       FROM agents a JOIN sessions s ON s.id = a.session_id
       WHERE a.type = 'subagent' AND a.subagent_type IS NOT NULL${ms.clause}
       GROUP BY a.subagent_type ORDER BY count DESC`
    )
    .all(...ms.params);

  edges = db
    .prepare(
      `SELECT
        COALESCE(p.subagent_type, 'main') as source,
        a.subagent_type as target,
        COUNT(*) as weight
       FROM agents a
       LEFT JOIN agents p ON a.parent_agent_id = p.id
       JOIN sessions s ON s.id = a.session_id
       WHERE a.type = 'subagent' AND a.subagent_type IS NOT NULL${ms.clause}
       GROUP BY source, target
       ORDER BY weight DESC`
    )
    .all(...ms.params);

  outcomes = db
    .prepare(
      `SELECT a.status, COUNT(*) as count FROM agents a
       JOIN sessions s ON s.id = a.session_id
       WHERE a.status IN ('completed', 'error')${ms.clause}
       GROUP BY a.status`
    )
    .all(...ms.params);

  compactions = db
    .prepare(
      `SELECT a.session_id, COUNT(*) as count
       FROM agents a JOIN sessions s ON s.id = a.session_id
       WHERE a.subagent_type = 'compaction'${ms.clause}
       GROUP BY a.session_id`
    )
    .all(...ms.params);

  totalCompactions = compactions.reduce((s, r) => s + r.count, 0);
  sessionsWithCompactions = compactions.length;

  return {
    sessionCount,
    mainCount,
    subagentTypes,
    edges,
    outcomes,
    compactions: { total: totalCompactions, sessions: sessionsWithCompactions },
  };
}

function getToolFlowData(statusFilter, workspaceRoot) {
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const e1Scope = meaningfulSessionFilter(meaningfulIds, "e1.session_id");
  const eventScope = meaningfulSessionFilter(meaningfulIds, "e.session_id");

  const transitions = db
    .prepare(
      `SELECT e1.tool_name as source, e2.tool_name as target, COUNT(*) as value
       FROM events e1
       JOIN events e2 ON e2.session_id = e1.session_id AND e2.id = (
         SELECT MIN(e3.id) FROM events e3
         WHERE e3.session_id = e1.session_id AND e3.id > e1.id AND e3.tool_name IS NOT NULL
       )
       WHERE e1.tool_name IS NOT NULL AND e2.tool_name IS NOT NULL${e1Scope.clause}
       GROUP BY e1.tool_name, e2.tool_name
       ORDER BY value DESC
       LIMIT 50`
    )
    .all(...e1Scope.params);

  const toolCounts = db
    .prepare(
      `SELECT e.tool_name, COUNT(*) as count FROM events e
       WHERE e.tool_name IS NOT NULL${eventScope.clause}
       GROUP BY e.tool_name ORDER BY count DESC LIMIT 15`
    )
    .all(...eventScope.params);

  return { transitions, toolCounts };
}

function getSubagentEffectiveness(statusFilter, workspaceRoot) {
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const agentScope = meaningfulSessionFilter(meaningfulIds, "a.session_id");

  const types = db
    .prepare(
      `SELECT
        a.subagent_type,
        COUNT(*) as total,
        SUM(CASE WHEN a.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN a.status = 'error' THEN 1 ELSE 0 END) as errors,
        COUNT(DISTINCT a.session_id) as sessions
       FROM agents a
       WHERE a.type = 'subagent' AND a.subagent_type IS NOT NULL${agentScope.clause}
       GROUP BY a.subagent_type
       ORDER BY total DESC
       LIMIT 12`
    )
    .all(...agentScope.params);

  // Get token usage per subagent type (approximate via session token totals)
  // Also get average duration per type
  const withMetrics = types.map((t) => {
    const durRow = db
      .prepare(
        `SELECT AVG(
          CASE WHEN a.ended_at IS NOT NULL THEN
            (julianday(a.ended_at) - julianday(a.started_at)) * 86400
          ELSE NULL END
        ) as avg_duration
        FROM agents a
        WHERE a.subagent_type = ? AND a.type = 'subagent'${agentScope.clause}`
      )
      .get(t.subagent_type, ...agentScope.params);

    const trendRows = db
      .prepare(
        `SELECT CAST(strftime('%w', a.started_at) AS INTEGER) as dow, COUNT(*) as count
         FROM agents a
         WHERE a.subagent_type = ? AND a.type = 'subagent'
           AND a.started_at >= date('now', '-56 days')${agentScope.clause}
         GROUP BY dow ORDER BY dow ASC`
      )
      .all(t.subagent_type, ...agentScope.params);

    // Build 7-slot array: [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    const trendByDay = [0, 0, 0, 0, 0, 0, 0];
    for (const row of trendRows) {
      const idx = (row.dow + 6) % 7; // Sun(0)→6, Mon(1)→0, Tue(2)→1, ...
      trendByDay[idx] = row.count;
    }

    return {
      ...t,
      successRate:
        t.completed + t.errors > 0
          ? +((t.completed / (t.completed + t.errors)) * 100).toFixed(1)
          : 100,
      avgDuration: durRow?.avg_duration ? Math.round(durRow.avg_duration) : null,
      trend: trendByDay,
    };
  });

  return withMetrics;
}

function getWorkflowPatterns(statusFilter, workspaceRoot) {
  const sf = sessionIdFilter(statusFilter);
  const ss = statusClause(statusFilter);
  const wf = workspaceSessionFilter(workspaceRoot);

  let sessions, totalSessions;

  if (workspaceRoot) {
    // Get meaningful session IDs first to filter out startup-only noise
    const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
    totalSessions = meaningfulIds.length;

    if (meaningfulIds.length === 0) {
      return { patterns: [], soloSessionCount: 0, soloPercentage: 0 };
    }

    const meaningfulPlaceholders = meaningfulIds.map(() => '?').join(',');

    // Get ordered subagent sequences per session - filtered to meaningful sessions
    sessions = db
      .prepare(
        `SELECT session_id, GROUP_CONCAT(subagent_type, '→') as sequence
         FROM (
           SELECT a.session_id, a.subagent_type
           FROM agents a
           JOIN sessions s ON s.id = a.session_id
           WHERE a.type = 'subagent' AND a.subagent_type IS NOT NULL
             AND s.id IN (${meaningfulPlaceholders})
             ${sf.clause}${wf.clause}
           ORDER BY a.session_id, a.started_at ASC
         )
         GROUP BY session_id
         HAVING COUNT(*) >= 2`
      )
      .all(...meaningfulIds, ...sf.params, ...wf.params);

    // Solo sessions - sessions with no subagents, filtered to meaningful sessions
    const placeholders = meaningfulIds.length > 0
      ? meaningfulIds.map(() => '?').join(',')
      : 'NULL';
    const soloCount = meaningfulIds.length > 0
      ? db
          .prepare(
            `SELECT COUNT(*) as c FROM sessions s
             WHERE s.id IN (${placeholders})
               AND NOT EXISTS (
                 SELECT 1 FROM agents a WHERE a.session_id = s.id AND a.type = 'subagent'
               )`
          )
          .get(...meaningfulIds).c
      : 0;

    var _soloCount = soloCount;
    var _totalSessions = totalSessions;
    var _sessions = sessions;

    // Count pattern frequencies
    const patternCounts = {};
    for (const row of _sessions) {
      const seq = row.sequence;
      patternCounts[seq] = (patternCounts[seq] || 0) + 1;
    }

    // Also count 2-step and 3-step sub-patterns
    for (const row of _sessions) {
      const steps = row.sequence.split("→");
      for (let i = 0; i < steps.length - 1; i++) {
        const sub = steps.slice(i, i + 2).join("→");
        patternCounts[sub] = (patternCounts[sub] || 0) + 1;
      }
      for (let i = 0; i < steps.length - 2; i++) {
        const sub = steps.slice(i, i + 3).join("→");
        patternCounts[sub] = (patternCounts[sub] || 0) + 1;
      }
    }

    const sorted = Object.entries(patternCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({
        steps: pattern.split("→"),
        count,
        percentage: _totalSessions > 0 ? +((count / _totalSessions) * 100).toFixed(1) : 0,
      }));

    const soloCountVal = _soloCount;

    return {
      patterns: sorted,
      soloSessionCount: soloCountVal,
      soloPercentage: _totalSessions > 0 ? +((soloCountVal / _totalSessions) * 100).toFixed(1) : 0,
    };
  } else {
    // Get meaningful session IDs first to filter out startup-only noise
    const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
    totalSessions = meaningfulIds.length;

    if (meaningfulIds.length === 0) {
      return { patterns: [], soloSessionCount: 0, soloPercentage: 0 };
    }

    const meaningfulPlaceholders = meaningfulIds.map(() => '?').join(',');

    sessions = db
      .prepare(
        `SELECT session_id, GROUP_CONCAT(subagent_type, '→') as sequence
         FROM (
           SELECT session_id, subagent_type
           FROM agents
           WHERE type = 'subagent' AND subagent_type IS NOT NULL
             AND session_id IN (${meaningfulPlaceholders})${sf.clause}
           ORDER BY session_id, started_at ASC
         )
         GROUP BY session_id
         HAVING COUNT(*) >= 2`
      )
      .all(...meaningfulIds, ...sf.params);

    // Solo sessions - filtered to meaningful sessions
    const placeholders = meaningfulIds.length > 0
      ? meaningfulIds.map(() => '?').join(',')
      : 'NULL';
    const soloCount = meaningfulIds.length > 0
      ? db
          .prepare(
            `SELECT COUNT(*) as c FROM sessions s
             WHERE s.id IN (${placeholders})
               AND NOT EXISTS (
                 SELECT 1 FROM agents a WHERE a.session_id = s.id AND a.type = 'subagent'
               )`
          )
          .get(...meaningfulIds).c
      : 0;

    const patternCounts = {};
    for (const row of sessions) {
      const seq = row.sequence;
      patternCounts[seq] = (patternCounts[seq] || 0) + 1;
    }

    for (const row of sessions) {
      const steps = row.sequence.split("→");
      for (let i = 0; i < steps.length - 1; i++) {
        const sub = steps.slice(i, i + 2).join("→");
        patternCounts[sub] = (patternCounts[sub] || 0) + 1;
      }
      for (let i = 0; i < steps.length - 2; i++) {
        const sub = steps.slice(i, i + 3).join("→");
        patternCounts[sub] = (patternCounts[sub] || 0) + 1;
      }
    }

    const sorted = Object.entries(patternCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({
        steps: pattern.split("→"),
        count,
        percentage: totalSessions > 0 ? +((count / totalSessions) * 100).toFixed(1) : 0,
      }));

    return {
      patterns: sorted,
      soloSessionCount: soloCount,
      soloPercentage: totalSessions > 0 ? +((soloCount / totalSessions) * 100).toFixed(1) : 0,
    };
  }
}

function getModelDelegation(statusFilter, workspaceRoot) {
  const ss = statusClause(statusFilter);
  const wf = workspaceSessionFilter(workspaceRoot);

  // Get meaningful session IDs first to filter out startup-only noise
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const meaningfulIdSet = new Set(meaningfulIds);

  // When meaningfulIds is empty, return empty model arrays
  if (meaningfulIds.length === 0) {
    return { mainModels: [], subagentModels: [], tokensByModel: [] };
  }

  const placeholders = meaningfulIds.map(() => '?').join(',');

  // Fetch main agent sessions with best-known model resolution
  // Only include sessions that are meaningful (not startup-only noise)
  const mainAgentRows = db
    .prepare(
      `SELECT DISTINCT s.id as session_id, a.id as agent_id
       FROM agents a JOIN sessions s ON a.session_id = s.id
       WHERE a.type = 'main' AND s.id IN (${placeholders})${ss.clause}${wf.clause}`
    )
    .all(...meaningfulIds, ...ss.params, ...wf.params);

  // Aggregate main models using best-known model resolution
  const mainModelMap = {};
  for (const row of mainAgentRows) {
    const model = getBestKnownModelForSession(row.session_id) || "unknown";
    if (!mainModelMap[model]) mainModelMap[model] = { model, agent_count: 0, session_count: new Set() };
    mainModelMap[model].agent_count++;
    mainModelMap[model].session_count.add(row.session_id);
  }
  const mainModels = Object.values(mainModelMap)
    .map((m) => ({ model: m.model, agent_count: m.agent_count, session_count: m.session_count.size }))
    .sort((a, b) => b.agent_count - a.agent_count);

  // Fetch subagent sessions with best-known model resolution
  // Only include sessions that are meaningful (not startup-only noise)
  const subagentRows = db
    .prepare(
      `SELECT a.id as agent_id, a.session_id
       FROM agents a JOIN sessions s ON a.session_id = s.id
       WHERE a.type = 'subagent' AND s.id IN (${placeholders})${ss.clause}${wf.clause}`
    )
    .all(...meaningfulIds, ...ss.params, ...wf.params);

  // Aggregate subagent models using best-known model resolution
  const subagentModelMap = {};
  for (const row of subagentRows) {
    const model = getBestKnownModelForSession(row.session_id) || "unknown";
    if (!subagentModelMap[model]) subagentModelMap[model] = { model, agent_count: 0 };
    subagentModelMap[model].agent_count++;
  }
  const subagentModels = Object.values(subagentModelMap)
    .map((m) => ({ model: m.model, agent_count: m.agent_count }))
    .sort((a, b) => b.agent_count - a.agent_count);

  // Token cost per model — filter via session_id on token_usage table
  const tokenScope = meaningfulSessionFilter(meaningfulIds, "tu.session_id");
  const tokensByModel = db
    .prepare(
      `SELECT tu.model,
      SUM(tu.input_tokens + tu.baseline_input) as input_tokens,
      SUM(tu.output_tokens + tu.baseline_output) as output_tokens,
      SUM(tu.cache_read_tokens + tu.baseline_cache_read) as cache_read_tokens,
      SUM(tu.cache_write_tokens + tu.baseline_cache_write) as cache_write_tokens
     FROM token_usage tu
     WHERE 1=1${tokenScope.clause}
     GROUP BY tu.model ORDER BY (input_tokens + output_tokens) DESC`
    )
    .all(...tokenScope.params);
  return { mainModels, subagentModels, tokensByModel };
}

function getErrorPropagation(statusFilter, workspaceRoot) {
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const totalSessions = meaningfulIds.length;
  const sessionScope = meaningfulSessionFilter(meaningfulIds, "s.id");
  const agentScope = meaningfulSessionFilter(meaningfulIds, "a.session_id");
  const eventScope = meaningfulSessionFilter(meaningfulIds, "e.session_id");

  let errorsByDepth = [];
  if (meaningfulIds.length > 0) {
    const placeholders = meaningfulIds.map(() => "?").join(",");
    errorsByDepth = db
      .prepare(
        `WITH RECURSIVE agent_depth AS (
          SELECT id, session_id, subagent_type, status, 0 as depth
          FROM agents WHERE parent_agent_id IS NULL AND session_id IN (${placeholders})
          UNION ALL
          SELECT a.id, a.session_id, a.subagent_type, a.status, ad.depth + 1
          FROM agents a JOIN agent_depth ad ON a.parent_agent_id = ad.id
          WHERE a.session_id IN (${placeholders})
        )
        SELECT depth, COUNT(*) as count FROM agent_depth
        WHERE status = 'error'
        GROUP BY depth ORDER BY depth ASC`
      )
      .all(...meaningfulIds, ...meaningfulIds);
  }

  const sessionErrorsNotInAgents = db
    .prepare(
      `SELECT COUNT(*) as c FROM sessions s
       WHERE s.status = 'error'${sessionScope.clause}
         AND NOT EXISTS (
           SELECT 1 FROM agents a WHERE a.session_id = s.id AND a.status = 'error'
         )`
    )
    .get(...sessionScope.params).c;

  const errorTypes = db
    .prepare(
      `SELECT a.subagent_type, COUNT(*) as count
       FROM agents a
       WHERE a.status = 'error' AND a.subagent_type IS NOT NULL${agentScope.clause}
       GROUP BY a.subagent_type ORDER BY count DESC LIMIT 5`
    )
    .all(...agentScope.params);

  const eventErrors = db
    .prepare(
      `SELECT e.summary, COUNT(*) as count
       FROM events e
       WHERE ((e.event_type = 'Stop' AND e.summary LIKE 'Error in%')
          OR e.event_type = 'APIError')${eventScope.clause}
       GROUP BY e.summary ORDER BY count DESC LIMIT 10`
    )
    .all(...eventScope.params);

  const sessionsWithErrors = db
    .prepare(
      `SELECT COUNT(DISTINCT id) as c FROM (
        SELECT s.id FROM sessions s WHERE s.status = 'error'${sessionScope.clause}
        UNION
        SELECT DISTINCT a.session_id as id FROM agents a WHERE a.status = 'error'${agentScope.clause}
        UNION
        SELECT DISTINCT e.session_id as id FROM events e
        WHERE ((e.event_type = 'Stop' AND e.summary LIKE 'Error in%')
           OR e.event_type = 'APIError')${eventScope.clause}
      )`
    )
    .get(...sessionScope.params, ...agentScope.params, ...eventScope.params).c;

  if (sessionErrorsNotInAgents > 0) {
    const existing = errorsByDepth.find((d) => d.depth === 0);
    if (existing) {
      existing.count += sessionErrorsNotInAgents;
    } else {
      errorsByDepth.unshift({ depth: 0, count: sessionErrorsNotInAgents });
    }
  }

  return {
    byDepth: errorsByDepth,
    byType: errorTypes,
    eventErrors,
    sessionsWithErrors,
    totalSessions,
    errorRate: totalSessions > 0 ? +((sessionsWithErrors / totalSessions) * 100).toFixed(1) : 0,
  };
}

function getConcurrencyData(statusFilter, workspaceRoot) {
  // For aggregate: average agent types per position in session timeline
  // Get agent start/end as fraction of session duration per session
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const ms = meaningfulSessionFilter(meaningfulIds, "s.id");
  const lanes = db
    .prepare(
      `SELECT
        a.id, a.name, a.type, a.subagent_type, a.status,
        a.started_at, a.ended_at, a.session_id,
        s.started_at as session_start, s.ended_at as session_end
       FROM agents a
       JOIN sessions s ON a.session_id = s.id
       WHERE s.ended_at IS NOT NULL${ms.clause}
       ORDER BY a.started_at ASC
       LIMIT 2000`
    )
    .all(...ms.params);

  // Build aggregate: for each subagent_type, average start% and end%
  const typeAgg = {};
  for (const lane of lanes) {
    const sessStart = new Date(lane.session_start).getTime();
    const sessEnd = new Date(lane.session_end).getTime();
    const sessDur = sessEnd - sessStart;
    if (sessDur <= 0) continue;

    const agStart = new Date(lane.started_at).getTime();
    const agEnd = lane.ended_at ? new Date(lane.ended_at).getTime() : sessEnd;

    const startPct = Math.max(0, Math.min(1, (agStart - sessStart) / sessDur));
    const endPct = Math.max(0, Math.min(1, (agEnd - sessStart) / sessDur));

    const key = lane.type === "main" ? "Main Agent" : lane.subagent_type || "unknown";
    if (!typeAgg[key]) typeAgg[key] = { starts: [], ends: [], status: lane.status };
    typeAgg[key].starts.push(startPct);
    typeAgg[key].ends.push(endPct);
  }

  // Average start/end per type
  const aggregateLanes = Object.entries(typeAgg)
    .map(([name, data]) => ({
      name,
      avgStart: +(data.starts.reduce((s, v) => s + v, 0) / data.starts.length).toFixed(3),
      avgEnd: +(data.ends.reduce((s, v) => s + v, 0) / data.ends.length).toFixed(3),
      count: data.starts.length,
    }))
    .sort((a, b) => a.avgStart - b.avgStart);

  return { aggregateLanes };
}

function getSessionComplexity(statusFilter, workspaceRoot) {
  const ss = statusClause(statusFilter);
  const wf = workspaceSessionFilter(workspaceRoot);

  const rows = db
    .prepare(
      `SELECT
        s.id, s.name, s.status, s.started_at, s.ended_at, s.model,
        COUNT(a.id) as agent_count,
        SUM(CASE WHEN a.type = 'subagent' THEN 1 ELSE 0 END) as subagent_count
       FROM sessions s
       LEFT JOIN agents a ON a.session_id = s.id
       WHERE 1=1${ss.clause}${wf.clause}
       GROUP BY s.id
       ORDER BY s.started_at DESC
       LIMIT 200`
    )
    .all(...ss.params, ...wf.params);

  // Filter out startup-only noise sessions (conservative classification)
  const realRows = rows.filter((r) => !isStartupOnlyNoiseSession(db, r.id));

  const sessions = realRows.map((r) => {
    const dur = durationSec(r);
    // Get token count for this session
    const tokens = db
      .prepare(
        `SELECT SUM(input_tokens + baseline_input + output_tokens + baseline_output +
                    cache_read_tokens + baseline_cache_read + cache_write_tokens + baseline_cache_write) as total
         FROM token_usage WHERE session_id = ?`
      )
      .get(r.id);

    return {
      id: r.id,
      name: r.name,
      status: r.status,
      duration: Math.round(dur),
      agentCount: r.agent_count,
      subagentCount: r.subagent_count,
      totalTokens: tokens?.total || 0,
      model: getBestKnownModelForSession(r.id) || r.model,
    };
  });

  return sessions;
}

function getCompactionImpact(statusFilter, workspaceRoot) {
  let totalCompactions, recovered, perSession, sessionsWithCompactions, totalSessions;
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const ms = meaningfulSessionFilter(meaningfulIds, "s.id");
  const tokenScope = meaningfulSessionFilter(meaningfulIds, "tu.session_id");
  totalSessions = meaningfulIds.length;

  totalCompactions = db
    .prepare(
      `SELECT COUNT(*) as c FROM agents a
       JOIN sessions s ON s.id = a.session_id
       WHERE a.subagent_type = 'compaction'${ms.clause}`
    )
    .get(...ms.params).c;

  recovered = db
    .prepare(
      `SELECT SUM(tu.baseline_input + tu.baseline_output + tu.baseline_cache_read + tu.baseline_cache_write) as total
       FROM token_usage tu
       WHERE 1=1${tokenScope.clause}`
    )
    .get(...tokenScope.params);

  perSession = db
    .prepare(
      `SELECT a.session_id, COUNT(*) as compactions
       FROM agents a
       JOIN sessions s ON s.id = a.session_id
       WHERE a.subagent_type = 'compaction'${ms.clause}
       GROUP BY a.session_id ORDER BY compactions DESC LIMIT 50`
    )
    .all(...ms.params);

  sessionsWithCompactions = db
    .prepare(
      `SELECT COUNT(DISTINCT a.session_id) as c FROM agents a
       JOIN sessions s ON s.id = a.session_id
       WHERE a.subagent_type = 'compaction'${ms.clause}`
    )
    .get(...ms.params).c;

  return {
    totalCompactions,
    tokensRecovered: recovered?.total || 0,
    perSession,
    sessionsWithCompactions,
    totalSessions,
  };
}

function getAgentCooccurrence(statusFilter, workspaceRoot) {
  // Directed: which agent type runs AFTER which other type in the same session
  // a1 started before a2 → edge a1 → a2 with count
  const meaningfulIds = getMeaningfulWorkflowSessionIds(statusFilter, workspaceRoot);
  const a1Scope = meaningfulSessionFilter(meaningfulIds, "a1.session_id");
  const pairs = db
    .prepare(
      `SELECT a1.subagent_type as source, a2.subagent_type as target,
            COUNT(*) as weight
     FROM agents a1
     JOIN agents a2 ON a1.session_id = a2.session_id
       AND a1.started_at < a2.started_at
       AND a1.id != a2.id
     WHERE a1.type = 'subagent' AND a2.type = 'subagent'
       AND a1.subagent_type IS NOT NULL AND a2.subagent_type IS NOT NULL
       AND a1.subagent_type != 'compaction' AND a2.subagent_type != 'compaction'${a1Scope.clause}
     GROUP BY a1.subagent_type, a2.subagent_type
     HAVING weight >= 2
     ORDER BY weight DESC
     LIMIT 40`
    )
    .all(...a1Scope.params);

  return pairs;
}

// ── Build agent tree from flat list ──
function buildAgentTree(agents) {
  const map = {};
  const roots = [];
  for (const a of agents) {
    map[a.id] = {
      id: a.id,
      name: a.name,
      type: a.type,
      subagent_type: a.subagent_type,
      status: a.status,
      task: a.task,
      started_at: a.started_at,
      ended_at: a.ended_at,
      children: [],
    };
  }
  for (const a of agents) {
    if (a.parent_agent_id && map[a.parent_agent_id]) {
      map[a.parent_agent_id].children.push(map[a.id]);
    } else {
      roots.push(map[a.id]);
    }
  }
  return roots;
}

module.exports = router;
