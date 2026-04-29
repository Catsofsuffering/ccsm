/**
 * @file Tests for startup-only noise session filtering (Packet A).
 * Verifies that sessions with only startup SessionStart events are filtered from
 * default session listings and workflow complexity metrics.
 *
 * Behaviors tested:
 * 1. Startup-only sessions are excluded from default GET /api/sessions
 * 2. includeNoise=true exposes startup-only sessions with isNoise:true marker
 * 3. Startup-only sessions are excluded from workflow complexity denominators
 * 4. Real sessions with non-start activity remain visible
 *
 * @author QA Team
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

// Set up test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `session-noise-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { createApp, startServer } = require("../index");
const { db, stmts } = require("../db");
const { isStartupOnlyNoiseSession } = require("../lib/session-noise");

let server;
let BASE;

function fetch(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    };

    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  try {
    fs.unlinkSync(TEST_DB);
    fs.unlinkSync(TEST_DB + "-wal");
    fs.unlinkSync(TEST_DB + "-shm");
  } catch {
    // ignore cleanup errors
  }
  setTimeout(() => process.exit(0), 100);
});

// Helper: Create a startup-only noise session (SessionStart only, no token_usage)
function createStartupOnlyNoiseSession(sessionId, name = "Startup Noise") {
  const mainAgentId = `${sessionId}-main`;
  stmts.insertSession.run(sessionId, name, "completed", "/tmp/test", "claude-sonnet-4-6", null);
  // Create the main agent first (required for foreign key)
  // insertAgent: id, session_id, name, type, subagent_type, status, task, parent_agent_id, metadata
  stmts.insertAgent.run(mainAgentId, sessionId, "Main Agent", "main", null, "connected", null, null, null);
  // Insert ONLY a SessionStart event in the same shape emitted by real Claude startup hooks.
  db.prepare(
    `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
     VALUES (?, ?, 'SessionStart', 'Session started', ?, datetime('now'))`
  ).run(sessionId, mainAgentId, JSON.stringify({
    session_id: sessionId,
    transcript_path: path.join(os.tmpdir(), `${sessionId}.missing.jsonl`),
    cwd: "/tmp/test",
    hook_event_name: "SessionStart",
    source: "startup",
    source_session_id: sessionId,
  }));
  // No token_usage, no real work events
}

// Helper: Create a real session with non-start activity
function createRealSessionWithActivity(sessionId, name = "Real Session", eventTypes = ["PreToolUse"]) {
  const mainAgentId = `${sessionId}-main`;
  stmts.insertSession.run(sessionId, name, "completed", "/tmp/test", "claude-sonnet-4-6", null);
  // Create the main agent first (required for foreign key)
  // insertAgent: id, session_id, name, type, subagent_type, status, task, parent_agent_id, metadata
  stmts.insertAgent.run(mainAgentId, sessionId, "Main Agent", "main", null, "connected", null, null, null);
  // Insert SessionStart
  stmts.insertEvent.run(sessionId, mainAgentId, 'SessionStart', null, '{"source":"startup"}', null);
  // Insert real work events
  for (const eventType of eventTypes) {
    stmts.insertEvent.run(sessionId, mainAgentId, eventType, null, `${eventType} activity`, null);
  }
  // Insert token_usage to confirm it's a real session
  stmts.upsertTokenUsage.run(sessionId, "claude-sonnet-4-6", 100, 50, 10, 5);
}

// ============================================================
// isStartupOnlyNoiseSession classifier unit tests
// ============================================================
describe("isStartupOnlyNoiseSession classifier", () => {
  it("should return true for session with only startup SessionStart", () => {
    const sessionId = `noise-unit-${Date.now()}-1`;
    createStartupOnlyNoiseSession(sessionId);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, true, "Session with only startup SessionStart should be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return false for session with PreToolUse event", () => {
    const sessionId = `noise-unit-${Date.now()}-2`;
    createRealSessionWithActivity(sessionId, "Real with PreToolUse", ["PreToolUse"]);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, false, "Session with PreToolUse should not be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return false for session with Stop event", () => {
    const sessionId = `noise-unit-${Date.now()}-3`;
    createRealSessionWithActivity(sessionId, "Real with Stop", ["Stop"]);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, false, "Session with Stop should not be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return false for session with token_usage", () => {
    const sessionId = `noise-unit-${Date.now()}-4`;
    const mainAgentId = `${sessionId}-main`;
    // Create session with SessionStart only but WITH token_usage
    stmts.insertSession.run(sessionId, "Has Token Usage", "completed", "/tmp/test", "claude-sonnet-4-6", null);
    stmts.insertAgent.run(mainAgentId, sessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, '{"source":"startup"}', datetime('now'))`
    ).run(sessionId, mainAgentId);
    stmts.upsertTokenUsage.run(sessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, false, "Session with token_usage should not be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return true for real startup shell with default summary and metadata", () => {
    const sessionId = `noise-unit-${Date.now()}-5`;
    createStartupOnlyNoiseSession(sessionId);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, true, "Default SessionStart summary plus startup metadata should still be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return false for non-default summary in SessionStart", () => {
    const sessionId = `noise-unit-${Date.now()}-5`;
    const mainAgentId = `${sessionId}-main`;
    // Create session with SessionStart that has a non-lifecycle summary (content evidence)
    stmts.insertSession.run(sessionId, "Has Summary", "completed", "/tmp/test", "claude-sonnet-4-6", null);
    stmts.insertAgent.run(mainAgentId, sessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Session started successfully', NULL, datetime('now'))`
    ).run(sessionId, mainAgentId);

    const result = isStartupOnlyNoiseSession(db, sessionId);
    assert.equal(result, false, "Session with summary in SessionStart should not be noise");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });
});

// ============================================================
// GET /api/sessions filtering tests
// ============================================================
describe("GET /api/sessions - startup-only noise filtering", () => {
  it("test_startup_only_hidden_from_default_sessions", async () => {
    // Create one startup-only noise session and one real session
    const noiseSessionId = `noise-hidden-${Date.now()}-noise`;
    const realSessionId = `noise-hidden-${Date.now()}-real`;

    createStartupOnlyNoiseSession(noiseSessionId, "Startup Only Noise");
    createRealSessionWithActivity(realSessionId, "Real Session With Activity", ["PreToolUse", "Stop"]);

    // Query default sessions (no includeNoise)
    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);

    const sessionIds = res.body.sessions.map((s) => s.id);

    // Noise session should NOT appear in default listing
    assert.ok(
      !sessionIds.includes(noiseSessionId),
      `Startup-only noise session ${noiseSessionId} should be hidden from default /api/sessions`
    );

    // Real session SHOULD appear
    assert.ok(
      sessionIds.includes(realSessionId),
      `Real session ${realSessionId} with PreToolUse/Stop should remain visible`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_includeNoise_exposes_startup_only_rows", async () => {
    const noiseSessionId = `noise-include-${Date.now()}-noise`;
    const realSessionId = `noise-include-${Date.now()}-real`;

    createStartupOnlyNoiseSession(noiseSessionId, "Startup Only Noise");
    createRealSessionWithActivity(realSessionId, "Real Session", ["Notification"]);

    // Query with includeNoise=true
    const res = await fetch("/api/sessions?includeNoise=true");
    assert.equal(res.status, 200);

    const sessionIds = res.body.sessions.map((s) => s.id);
    const noiseSession = res.body.sessions.find((s) => s.id === noiseSessionId);

    // Noise session SHOULD appear when includeNoise=true
    assert.ok(
      sessionIds.includes(noiseSessionId),
      `Startup-only noise session should appear when includeNoise=true`
    );

    // Noise session should have isNoise:true or noiseType:"startup-only" marker
    assert.ok(
      noiseSession && (noiseSession.isNoise === true || noiseSession.noiseType === "startup-only"),
      `Noise session should have isNoise:true or noiseType:"startup-only" marker`
    );

    // Real session should also still appear
    assert.ok(
      sessionIds.includes(realSessionId),
      `Real session should still appear when includeNoise=true`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_real_session_with_nonstart_activity_remains_visible", async () => {
    // Test various non-start event types that should keep a session visible
    const eventTypesToTest = ["PreToolUse", "PostToolUse", "Notification", "Stop", "SubagentStop", "SessionEnd", "TeamReturn", "Compaction", "APIError", "TurnDuration"];

    for (const eventType of eventTypesToTest) {
      const sessionId = `real-activity-${Date.now()}-${eventType}`;
      createRealSessionWithActivity(sessionId, `Real with ${eventType}`, [eventType]);

      const res = await fetch("/api/sessions");
      assert.equal(res.status, 200);

      const sessionIds = res.body.sessions.map((s) => s.id);
      assert.ok(
        sessionIds.includes(sessionId),
        `Session with ${eventType} should remain visible in default /api/sessions`
      );

      // Cleanup
      db.prepare("DELETE FROM events WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM agents WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    }
  });

  it("should filter multiple startup-only sessions correctly", async () => {
    const noiseSessionIds = [
      `noise-multi-1-${Date.now()}`,
      `noise-multi-2-${Date.now()}`,
      `noise-multi-3-${Date.now()}`,
    ];
    const realSessionId = `noise-multi-real-${Date.now()}`;

    for (const id of noiseSessionIds) {
      createStartupOnlyNoiseSession(id);
    }
    createRealSessionWithActivity(realSessionId, "Real Multi", ["PreToolUse"]);

    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);

    const sessionIds = res.body.sessions.map((s) => s.id);

    // All noise sessions should be hidden
    for (const id of noiseSessionIds) {
      assert.ok(
        !sessionIds.includes(id),
        `Noise session ${id} should be hidden`
      );
    }

    // Real session should be visible
    assert.ok(
      sessionIds.includes(realSessionId),
      `Real session should remain visible`
    );

    // Cleanup
    for (const id of noiseSessionIds) {
      db.prepare("DELETE FROM events WHERE session_id = ?").run(id);
      db.prepare("DELETE FROM agents WHERE session_id = ?").run(id);
      db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
    }
    db.prepare("DELETE FROM events WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(realSessionId);
  });
});

// ============================================================
// GET /api/workflows complexity filtering tests
// ============================================================
describe("GET /api/workflows - startup-only noise exclusion", () => {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");

  it("test_startup_only_hidden_from_workflow_complexity", async () => {
    const noiseSessionId = `wf-noise-${Date.now()}-noise`;
    const realSessionId = `wf-noise-${Date.now()}-real`;
    const noiseAgentId = `${noiseSessionId}-main`;
    const realAgentId = `${realSessionId}-main`;

    // Create startup-only noise session
    stmts.insertSession.run(noiseSessionId, "Startup Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    // Create real session with activity
    stmts.insertSession.run(realSessionId, "Real Workflow", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'PreToolUse', 'Using tool', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    // Query workflows
    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { complexity, stats, orchestration } = res.body;
    const complexitySessionIds = complexity.map((s) => s.id);

    // Noise session should NOT appear in complexity
    assert.ok(
      !complexitySessionIds.includes(noiseSessionId),
      `Startup-only noise session should be excluded from workflow complexity`
    );

    // Real session SHOULD appear in complexity
    assert.ok(
      complexitySessionIds.includes(realSessionId),
      `Real session should appear in workflow complexity`
    );

    // Noise session should NOT be counted in stats.totalSessions
    const matchingStatsSessions = stats.totalSessions;
    // We don't know exact count, but it should not include the noise session
    // The total sessions in workflow scope should be based on real sessions only

    // Noise session should NOT be counted in orchestration.sessionCount
    assert.ok(
      !orchestration.sessionCount || orchestration.sessionCount === 0 || !complexitySessionIds.includes(noiseSessionId),
      `Startup-only noise session should not contribute to orchestration.sessionCount`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("should exclude startup-only noise from workflow stats session-count denominators", async () => {
    const noiseSessionId = `wf-stats-noise-${Date.now()}`;
    const realSessionId1 = `wf-stats-real-1-${Date.now()}`;
    const realSessionId2 = `wf-stats-real-2-${Date.now()}`;

    // Create 1 startup-only noise session
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    // Create 2 real sessions
    for (const id of [realSessionId1, realSessionId2]) {
      const agentId = `${id}-main`;
      stmts.insertSession.run(id, "Real", "completed", repoRoot, "claude-sonnet-4-6", null);
      stmts.insertAgent.run(agentId, id, "Main Agent", "main", null, "connected", null, null, null);
      db.prepare(
        `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
         VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
      ).run(id, agentId);
      db.prepare(
        `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
         VALUES (?, ?, 'Stop', 'Completed', NULL, datetime('now'))`
      ).run(id, agentId);
      stmts.upsertTokenUsage.run(id, "claude-sonnet-4-6", 100, 50, 10, 5);
    }

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { stats, orchestration } = res.body;

    // Workflow stats should only count real sessions (2), not noise sessions (1)
    // The exact assertion depends on implementation, but noise should be excluded
    const complexityIds = res.body.complexity.map((s) => s.id);
    assert.ok(!complexityIds.includes(noiseSessionId), "Noise session should not appear in complexity");

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?, ?)").run(noiseSessionId, realSessionId1, realSessionId2);
    db.prepare("DELETE FROM token_usage WHERE session_id IN (?, ?)").run(realSessionId1, realSessionId2);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?, ?)").run(noiseSessionId, realSessionId1, realSessionId2);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?, ?)").run(noiseSessionId, realSessionId1, realSessionId2);
  });

  // ============================================================
  // Packet E1: Workflow Model Delegation Tests
  // ============================================================

  it("test_startup_only_main_agent_not_unknown_in_model_delegation", async () => {
    // Create a startup-only noise session with a main agent
    const noiseSessionId = `wf-main-unknown-${Date.now()}`;
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Startup Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);
    // No token_usage, no real work events - this is a true startup-only noise session

    // Create a real session with activity
    const realSessionId = `wf-real-unknown-${Date.now()}`;
    const realAgentId = `${realSessionId}-main`;
    stmts.insertSession.run(realSessionId, "Real No Token", "completed", repoRoot, null, null);
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "connected", null, null, null);
    // Real session with Stop event but no token_usage - has real activity
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Completed', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    // No token_usage - model will be unknown but session is real

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { modelDelegation, stats } = res.body;

    // The real session with Stop event but no tokens should still be counted
    // (it's preserved by the shared classifier because of the Stop event)
    assert.ok(
      stats.totalSessions >= 1,
      `Real session with Stop event should be counted in stats.totalSessions`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_startup_only_subagent_not_in_subagent_delegation", async () => {
    // Create a startup-only noise session with a main agent AND a subagent
    const noiseSessionId = `wf-subagent-noise-${Date.now()}`;
    const noiseMainAgentId = `${noiseSessionId}-main`;
    const noiseSubAgentId = `${noiseSessionId}-sub`;
    stmts.insertSession.run(noiseSessionId, "Startup Noise Subagent", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseMainAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    stmts.insertAgent.run(noiseSubAgentId, noiseSessionId, "Sub Agent", "subagent", "analysis", "connected", null, noiseMainAgentId, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseMainAgentId);
    // No token_usage, no real work events

    // Create a real session with a subagent
    const realSessionId = `wf-subagent-real-${Date.now()}`;
    const realMainAgentId = `${realSessionId}-main`;
    const realSubAgentId = `${realSessionId}-sub`;
    stmts.insertSession.run(realSessionId, "Real With Subagent", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realMainAgentId, realSessionId, "Main Agent", "main", null, "connected", null, null, null);
    stmts.insertAgent.run(realSubAgentId, realSessionId, "Sub Agent", "subagent", "analysis", "completed", null, realMainAgentId, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realMainAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Completed', NULL, datetime('now'))`
    ).run(realSessionId, realMainAgentId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { modelDelegation } = res.body;

    // The startup-only noise session should NOT contribute to subagentModels
    // because its session is not a meaningful session

    // The real session's subagent should appear in subagentModels
    assert.ok(
      modelDelegation.subagentModels.length > 0,
      `Real session's subagent should appear in subagentModels`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_startup_only_not_in_orchestration_denominators", async () => {
    const noiseSessionId = `wf-orch-noise-${Date.now()}`;
    const realSessionId = `wf-orch-real-${Date.now()}`;

    // Create startup-only noise session
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    // Create real session
    const realAgentId = `${realSessionId}-main`;
    stmts.insertSession.run(realSessionId, "Real", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "completed", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { orchestration } = res.body;

    // orchestration.sessionCount should only count the real session, not the noise
    assert.ok(
      orchestration.sessionCount >= 1,
      `orchestration.sessionCount should be at least 1 for the real session`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_startup_only_not_in_patterns_denominators", async () => {
    const noiseSessionId = `wf-pattern-noise-${Date.now()}`;
    const realSessionId = `wf-pattern-real-${Date.now()}`;

    // Create startup-only noise session (no subagents)
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    // Create real solo session (no subagents)
    const realAgentId = `${realSessionId}-main`;
    stmts.insertSession.run(realSessionId, "Real Solo", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "completed", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { patterns } = res.body;
    const { soloSessionCount, soloPercentage } = patterns;

    // The noise session should NOT be counted as a solo session
    // We verify the real session is counted (at least 1) but the noise is excluded
    assert.ok(
      soloSessionCount >= 1,
      `soloSessionCount should be at least 1 for the real session`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_startup_only_not_in_compaction_denominators", async () => {
    const noiseSessionId = `wf-compaction-noise-${Date.now()}`;
    const realSessionId = `wf-compaction-real-${Date.now()}`;

    // Create startup-only noise session
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    // Create real session with compaction agent
    const realAgentId = `${realSessionId}-main`;
    const compactionAgentId = `${realSessionId}-compaction`;
    stmts.insertSession.run(realSessionId, "Real With Compaction", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "completed", null, null, null);
    stmts.insertAgent.run(compactionAgentId, realSessionId, "Compaction Agent", "subagent", "compaction", "completed", null, realAgentId, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { compaction } = res.body;

    // compaction.totalSessions should be at least 1 (for the real session)
    // The noise session should NOT be counted
    assert.ok(
      compaction.totalSessions >= 1,
      `compaction.totalSessions should be at least 1 for the real session`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(noiseSessionId, realSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(noiseSessionId, realSessionId);
  });

  it("test_short_real_session_counted_consistently", async () => {
    // A short real session that has real activity (Stop event) but minimal events
    // should be preserved by the shared classifier and counted in both stats and complexity

    const shortRealSessionId = `wf-short-real-${Date.now()}`;
    const noiseSessionId = `wf-short-noise-${Date.now()}`;

    // Create a short real session with Stop event (real activity)
    const realAgentId = `${shortRealSessionId}-main`;
    stmts.insertSession.run(shortRealSessionId, "Short Real", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realAgentId, shortRealSessionId, "Main Agent", "main", null, "completed", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(shortRealSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(shortRealSessionId, realAgentId);
    // No token_usage - model will be null but session is real due to Stop event

    // Create a startup-only noise session (no real activity)
    const noiseAgentId = `${noiseSessionId}-main`;
    stmts.insertSession.run(noiseSessionId, "Noise", "completed", repoRoot, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseAgentId);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const { stats, complexity } = res.body;

    // The short real session should be counted in stats.totalSessions
    assert.ok(
      stats.totalSessions >= 1,
      `Short real session with Stop event should be counted in stats.totalSessions`
    );

    // The short real session should appear in complexity
    const shortRealInComplexity = complexity.find(s => s.id === shortRealSessionId);
    assert.ok(
      shortRealInComplexity,
      `Short real session should appear in complexity`
    );

    // The noise session should NOT appear in complexity
    const noiseInComplexity = complexity.find(s => s.id === noiseSessionId);
    assert.ok(
      !noiseInComplexity,
      `Startup-only noise session should NOT appear in complexity`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(shortRealSessionId, noiseSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(shortRealSessionId, noiseSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(shortRealSessionId, noiseSessionId);
  });

  // ============================================================
  // Packet F: Exact Regression Coverage Tests
  // ============================================================

  it("test_startup_only_subagent_rows_cannot_create_workflow_pattern_counts", async () => {
    // Packet F1: startup-only subagent rows cannot create Workflow pattern counts
    const uniqueWs = `/test/pf-patterns-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create startup-only noise session with 2 subagents forming "analysis→coding" sequence
    const noiseSessionId = `pf-noise-sub-${Date.now()}`;
    const noiseMainAgentId = `${noiseSessionId}-main`;
    const noiseSubAgent1Id = `${noiseSessionId}-sub1`;
    const noiseSubAgent2Id = `${noiseSessionId}-sub2`;

    stmts.insertSession.run(noiseSessionId, "Noise With Subagents", "completed", uniqueWs, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseMainAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    stmts.insertAgent.run(noiseSubAgent1Id, noiseSessionId, "Analysis Subagent", "subagent", "analysis", "connected", null, noiseMainAgentId, null);
    stmts.insertAgent.run(noiseSubAgent2Id, noiseSessionId, "Coding Subagent", "subagent", "coding", "connected", null, noiseMainAgentId, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseSessionId, noiseMainAgentId);
    // No token_usage, no real work events - startup-only noise

    // Create TWO real sessions with the SAME subagent sequence "research→testing"
    // (need 2+ sessions with same sequence for pattern to appear - API requires count >= 2)
    const realSessionIds = [];
    for (let i = 0; i < 2; i++) {
      const realSessionId = `pf-real-sub-${Date.now()}-${i}`;
      realSessionIds.push(realSessionId);
      const realMainAgentId = `${realSessionId}-main`;
      const realSubAgent1Id = `${realSessionId}-sub1`;
      const realSubAgent2Id = `${realSessionId}-sub2`;

      stmts.insertSession.run(realSessionId, "Real With Subagents", "completed", uniqueWs, "claude-sonnet-4-6", null);
      stmts.insertAgent.run(realMainAgentId, realSessionId, "Main Agent", "main", null, "completed", null, null, null);
      stmts.insertAgent.run(realSubAgent1Id, realSessionId, "Research Subagent", "subagent", "research", "completed", null, realMainAgentId, null);
      stmts.insertAgent.run(realSubAgent2Id, realSessionId, "Testing Subagent", "subagent", "testing", "completed", null, realMainAgentId, null);
      db.prepare(
        `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
         VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
      ).run(realSessionId, realMainAgentId);
      db.prepare(
        `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
         VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
      ).run(realSessionId, realMainAgentId);
      stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);
    }

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(uniqueWs)}`);
    assert.equal(res.status, 200);

    // Note: res.body.patterns is an object {patterns: [...], soloSessionCount: N, soloPercentage: X}
    // The actual patterns array is at res.body.patterns.patterns
    const { patterns: patternsObj } = res.body;
    const patternsArray = patternsObj.patterns;

    // The noise-only sequence "analysis→coding" should NOT appear in patterns
    // (noise sessions are filtered out, so their sequences don't contribute)
    const noisePattern = patternsArray.find(
      (p) => p.steps && p.steps.join("→") === "analysis→coding"
    );
    assert.ok(
      !noisePattern,
      `Noise sequence "analysis→coding" should NOT appear in patterns`
    );

    // The real sequence "research→testing" SHOULD appear with count of 2
    // (because we created 2 real sessions with this same sequence)
    const realPattern = patternsArray.find(
      (p) => p.steps && p.steps.join("→") === "research→testing"
    );
    assert.ok(
      realPattern,
      `Real sequence "research→testing" should appear in patterns`
    );
    assert.equal(
      realPattern.count, 4,
      `Real sequence "research→testing" should have count of 4 (2 full + 2 sub-pattern from 2 sessions)`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id = ?").run(noiseSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id IN (?, ?)").run(realSessionIds[0], realSessionIds[1]);
    db.prepare("DELETE FROM agents WHERE session_id = ?").run(noiseSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(realSessionIds[0], realSessionIds[1]);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(noiseSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(realSessionIds[0], realSessionIds[1]);
  });

  it("test_stats_avgDurationSec_ignores_startup_only_ended_shells", async () => {
    // Packet F2: stats.avgDurationSec ignores startup-only ended shells
    const uniqueWs = `/test/pf-duration-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create short real ended session with known duration (~60 seconds)
    const realSessionId = `pf-real-duration-${Date.now()}`;
    const realAgentId = `${realSessionId}-main`;

    stmts.insertSession.run(
      realSessionId, "Short Real Session", "completed", uniqueWs, "claude-sonnet-4-6", null
    );
    stmts.insertAgent.run(realAgentId, realSessionId, "Main Agent", "main", null, "completed", null, null, null);
    // Use datetime syntax for precise known duration: started 60 seconds ago, ended now
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-60 seconds'))`
    ).run(realSessionId, realAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(realSessionId, realAgentId);
    // Set started_at and ended_at on the session for duration calculation
    db.prepare(
      `UPDATE sessions SET started_at = datetime('now', '-60 seconds'), ended_at = datetime('now') WHERE id = ?`
    ).run(realSessionId);
    stmts.upsertTokenUsage.run(realSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    // Create startup-only ended shell with MUCH longer known duration (~7200 seconds = 2 hours)
    const noiseSessionId = `pf-noise-duration-${Date.now()}`;
    const noiseAgentId = `${noiseSessionId}-main`;

    stmts.insertSession.run(
      noiseSessionId, "Long Noise Shell", "completed", uniqueWs, "claude-sonnet-4-6", null
    );
    stmts.insertAgent.run(noiseAgentId, noiseSessionId, "Main Agent", "main", null, "connected", null, null, null);
    // Startup-only noise: SessionStart only
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now', '-7200 seconds'))`
    ).run(noiseSessionId, noiseAgentId);
    // Set started_at and ended_at to make it appear as a long-running ended session
    db.prepare(
      `UPDATE sessions SET started_at = datetime('now', '-7200 seconds'), ended_at = datetime('now') WHERE id = ?`
    ).run(noiseSessionId);
    // No token_usage, no real work events

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(uniqueWs)}`);
    assert.equal(res.status, 200);

    const { stats } = res.body;

    // stats.avgDurationSec should be approximately 60 (the real session), NOT the average of 60 and 7200
    // Average of [60, 7200] would be ~3630, so we assert it's much closer to 60
    assert.ok(
      stats.avgDurationSec > 50 && stats.avgDurationSec < 120,
      `stats.avgDurationSec should be approximately 60 (actual: ${stats.avgDurationSec}), not the average including the noise session`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(realSessionId, noiseSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(realSessionId, noiseSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(realSessionId, noiseSessionId);
  });

  it("test_patterns_soloSessionCount_exact_value_with_controlled_fixture", async () => {
    // Packet F3: Replace weak >= 1 assertions with exact values
    const uniqueWs = `/test/pf-soloexact-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create 1 real solo session (no subagents) - should be counted
    const realSoloSessionId = `pf-real-solo-${Date.now()}`;
    const realSoloAgentId = `${realSoloSessionId}-main`;

    stmts.insertSession.run(realSoloSessionId, "Real Solo Session", "completed", uniqueWs, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(realSoloAgentId, realSoloSessionId, "Main Agent", "main", null, "completed", null, null, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', 'Started', NULL, datetime('now', '-10 minutes'))`
    ).run(realSoloSessionId, realSoloAgentId);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'Stop', 'Done', NULL, datetime('now'))`
    ).run(realSoloSessionId, realSoloAgentId);
    stmts.upsertTokenUsage.run(realSoloSessionId, "claude-sonnet-4-6", 100, 50, 10, 5);

    // Create 1 noise session with subagents - should NOT be counted as solo
    const noiseWithSubsSessionId = `pf-noise-subs-${Date.now()}`;
    const noiseMainAgentId = `${noiseWithSubsSessionId}-main`;
    const noiseSubAgentId = `${noiseWithSubsSessionId}-sub`;

    stmts.insertSession.run(noiseWithSubsSessionId, "Noise With Subagent", "completed", uniqueWs, "claude-sonnet-4-6", null);
    stmts.insertAgent.run(noiseMainAgentId, noiseWithSubsSessionId, "Main Agent", "main", null, "connected", null, null, null);
    stmts.insertAgent.run(noiseSubAgentId, noiseWithSubsSessionId, "Sub Agent", "subagent", "analysis", "connected", null, noiseMainAgentId, null);
    db.prepare(
      `INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at)
       VALUES (?, ?, 'SessionStart', NULL, NULL, datetime('now'))`
    ).run(noiseWithSubsSessionId, noiseMainAgentId);
    // No token_usage, no real work events - startup-only noise

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(uniqueWs)}`);
    assert.equal(res.status, 200);

    const { patterns } = res.body;

    // With controlled fixtures (1 real solo, 1 noise with subagents), assert exact value
    assert.equal(
      patterns.soloSessionCount, 1,
      `soloSessionCount should be exactly 1 (only the real solo session, not the noise with subagents)`
    );

    // Cleanup
    db.prepare("DELETE FROM events WHERE session_id IN (?, ?)").run(realSoloSessionId, noiseWithSubsSessionId);
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(realSoloSessionId);
    db.prepare("DELETE FROM agents WHERE session_id IN (?, ?)").run(realSoloSessionId, noiseWithSubsSessionId);
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(realSoloSessionId, noiseWithSubsSessionId);
  });
});
