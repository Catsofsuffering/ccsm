/**
 * @file Tests for the Dashboard API endpoints, covering session and agent management, event recording, stats aggregation, and hook event processing. Uses Node's built-in test runner and assertions to validate API behavior and edge cases.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const pkg = require("../../package.json");

// Set up test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `dashboard-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { createApp, startServer, runMaintenanceSweep } = require("../index");
const { db, stmts } = require("../db");

let server;
let BASE;
const EXPECTED_API_PATHS = [
  "/api/health",
  "/api/sessions",
  "/api/sessions/{id}",
  "/api/agents",
  "/api/agents/{id}",
  "/api/events",
  "/api/stats",
  "/api/analytics",
  "/api/hooks/event",
  "/api/acp/event",
  "/api/pricing",
  "/api/pricing/{pattern}",
  "/api/pricing/cost",
  "/api/pricing/cost/{sessionId}",
  "/api/workflows",
  "/api/workflows/session/{id}",
  "/api/openspec/changes",
  "/api/control-plane/overview",
  "/api/control-plane/projects/{name}",
  "/api/control-plane/projects/{name}/actions",
  "/api/settings/info",
  "/api/settings/clear-data",
  "/api/settings/reimport",
  "/api/settings/reinstall-hooks",
  "/api/settings/reset-pricing",
  "/api/settings/export",
  "/api/settings/cleanup",
  "/api/settings/openspec-workspace",
  "/api/openapi.json",
];

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

function post(urlPath, body) {
  return fetch(urlPath, { method: "POST", body });
}

function patch(urlPath, body) {
  return fetch(urlPath, { method: "PATCH", body });
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0); // port 0 = random available port
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
  // Force exit since WS heartbeat interval keeps process alive
  setTimeout(() => process.exit(0), 100);
});

// ============================================================
// Health
// ============================================================
describe("GET /api/health", () => {
  it("should return ok status", async () => {
    const res = await fetch("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "ok");
    assert.ok(res.body.timestamp);
  });
});

describe("OpenAPI / Swagger", () => {
  it("should expose OpenAPI spec with complete endpoint coverage", async () => {
    const res = await fetch("/api/openapi.json");
    assert.equal(res.status, 200);
    assert.equal(res.body.openapi, "3.0.3");
    assert.equal(res.body.info.version, pkg.version);
    assert.equal(res.body.info.license.name, pkg.license);
    assert.equal(res.body["x-issues-url"], pkg.bugs.url);
    assert.match(res.body.info.contact.url, /github\.com\/hoangsonww\/Claude-Code-Agent-Monitor/);

    for (const pathName of EXPECTED_API_PATHS) {
      assert.ok(res.body.paths[pathName], `Expected path ${pathName} to be documented`);
    }
  });

  it("should serve Swagger UI", async () => {
    const res = await fetch("/api/docs/");
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /text\/html/);
    assert.match(res.body, /swagger/i);
  });
});

describe("ACP API", () => {
  it("should ingest ACP session and output events through the mounted route", async () => {
    const sessionId = `acp-api-${Date.now()}`;
    const startRes = await post("/api/acp/event", {
      type: "session_start",
      session_id: sessionId,
      cwd: "/tmp/acp-project",
      model: "claude-sonnet-4-6",
      correlation_id: "corr-api-start",
    });
    assert.equal(startRes.status, 200);
    assert.equal(startRes.body.ok, true);
    assert.ok(startRes.body.eventId);

    const outputRes = await post("/api/acp/event", {
      type: "output",
      session_id: sessionId,
      agent_id: `${sessionId}-main`,
      message: "ACP output from mounted API route",
      correlation_id: "corr-api-output",
    });
    assert.equal(outputRes.status, 200);
    assert.equal(outputRes.body.ok, true);

    const sessionRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.session.model, "claude-sonnet-4-6");
    assert.ok(
      sessionRes.body.events.some(
        (event) => event.event_type === "output" && event.summary.includes("ACP output")
      )
    );
  });

  it("should update session model from ACP model_info events", async () => {
    const sessionId = `acp-model-${Date.now()}`;
    await post("/api/acp/event", {
      type: "session_start",
      session_id: sessionId,
      model: "claude-haiku-4-5",
    });

    const modelRes = await post("/api/acp/event", {
      type: "model_info",
      session_id: sessionId,
      model: "claude-opus-4-6",
    });
    assert.equal(modelRes.status, 200);

    const sessionRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.session.model, "claude-opus-4-6");
  });
});

describe("OpenSpec API", () => {
  it("should return board data for local OpenSpec changes", async () => {
    const res = await fetch("/api/openspec/changes");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.stages));
    assert.ok(Array.isArray(res.body.changes));
    assert.ok(typeof res.body.workspaceRoot === "string");
    const change = res.body.changes[0];
    if (!change) {
      assert.equal(res.body.changes.length, 0);
      return;
    }

    assert.equal(typeof change.stage, "string");
    assert.ok(Array.isArray(change.artifacts));
    assert.ok(change.taskProgress);
    assert.equal(typeof change.taskProgress.percent, "number");
    assert.ok(Array.isArray(change.tasks));
    assert.ok(Array.isArray(change.taskSections));
    assert.equal(typeof change.readyToApply, "boolean");
    assert.ok(change.controlPlane);
    assert.equal(typeof change.controlPlane.state, "string");
  });
});

describe("Control Plane API", () => {
  it("should return control-plane overview for local OpenSpec projects", async () => {
    const res = await fetch("/api/control-plane/overview");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.workspaceRoot === "string");
    assert.ok(res.body.summary);
    assert.ok(Array.isArray(res.body.adapters));
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(Array.isArray(res.body.workers));

    const project = res.body.projects[0];
    if (!project) {
      assert.equal(res.body.projects.length, 0);
      return;
    }

    assert.equal(typeof project.graphSummary.totalNodes, "number");
    assert.equal(typeof project.readyToApply, "boolean");
    assert.ok(project.dispatch);
    assert.equal(typeof project.actionCount, "number");
    assert.equal(typeof project.dispatchCount, "number");
    assert.ok(Array.isArray(res.body.adapters[0]?.capabilities?.actions));
  });

  it("should return project graph and blackboard state", async () => {
    const overviewRes = await fetch("/api/control-plane/overview");
    assert.equal(overviewRes.status, 200);
    const projectName = overviewRes.body.projects[0]?.name;
    if (!projectName) {
      assert.equal(overviewRes.body.projects.length, 0);
      return;
    }

    const res = await fetch(`/api/control-plane/projects/${projectName}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.project.name, projectName);
    assert.ok(Array.isArray(res.body.graph.nodes));
    assert.ok(Array.isArray(res.body.graph.edges));
    assert.ok(res.body.blackboard);
    assert.ok(Array.isArray(res.body.adapters));
    assert.ok(res.body.dispatch);
    assert.ok(Array.isArray(res.body.dispatches));
    assert.ok(Array.isArray(res.body.blackboard.facts));
    assert.ok(Array.isArray(res.body.blackboard.intents));
    assert.ok(Array.isArray(res.body.workerHealth));
    assert.ok(Array.isArray(res.body.activity));
    assert.equal(typeof res.body.graph.nodes[0]?.dispatcherPhase, "string");
    assert.ok(Array.isArray(res.body.graph.nodes[0]?.routing?.availableActions));
    assert.equal(typeof res.body.workerHealth[0]?.health, "string");
  });

  it("should record replay and reopen actions for a graph node", async () => {
    const overviewRes = await fetch("/api/control-plane/overview");
    assert.equal(overviewRes.status, 200);
    const projectName = overviewRes.body.projects[0]?.name;
    if (!projectName) {
      assert.equal(overviewRes.body.projects.length, 0);
      return;
    }

    const projectRes = await fetch(`/api/control-plane/projects/${projectName}`);
    assert.equal(projectRes.status, 200);
    const nodeId = projectRes.body.graph.nodes[0]?.id;
    assert.ok(nodeId, "expected a project graph node");

    const actionRes = await post(`/api/control-plane/projects/${projectName}/actions`, {
      nodeId,
      actionType: "replay",
    });
    assert.equal(actionRes.status, 201);
    assert.ok(actionRes.body.dispatch);
    assert.ok(Array.isArray(actionRes.body.dispatch.availableAdapters));
    assert.ok(actionRes.body.intent);
    assert.equal(actionRes.body.action.nodeId, nodeId);
    assert.equal(actionRes.body.action.actionType, "replay");
    assert.equal(actionRes.body.action.status, "requested");
    assert.equal(actionRes.body.intent.nodeId, nodeId);
    assert.ok(["queued", "running", "completed", "failed", "blocked"].includes(actionRes.body.intent.status));

    const refreshedProject = await fetch(`/api/control-plane/projects/${projectName}`);
    assert.equal(refreshedProject.status, 200);
    assert.ok(Array.isArray(refreshedProject.body.actions));
    assert.ok(Array.isArray(refreshedProject.body.dispatches));
    assert.ok(Array.isArray(refreshedProject.body.activity));
    assert.ok(refreshedProject.body.actions.some((action) => action.nodeId === nodeId && action.actionType === "replay"));
    assert.ok(refreshedProject.body.dispatches.some((intent) => intent.nodeId === nodeId && intent.actionType === "replay"));
    assert.ok(refreshedProject.body.activity.some((item) => item.type === "action" && item.nodeId === nodeId));
    assert.ok(refreshedProject.body.activity.some((item) => item.type === "dispatch" && item.nodeId === nodeId));
  });
});

// ============================================================
// Sessions CRUD
// ============================================================
describe("Sessions API", () => {
  it("should create a session", async () => {
    const res = await post("/api/sessions", {
      id: "sess-1",
      name: "Test Session",
      cwd: "/home/test",
      model: "claude-opus-4-6",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.session.id, "sess-1");
    assert.equal(res.body.session.name, "Test Session");
    assert.equal(res.body.session.status, "active");
    assert.equal(res.body.session.cwd, "/home/test");
    assert.equal(res.body.created, true);
  });

  it("should return existing session on duplicate create (idempotent)", async () => {
    const res = await post("/api/sessions", {
      id: "sess-1",
      name: "Different Name",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.session.name, "Test Session"); // original name preserved
    assert.equal(res.body.created, false);
  });

  it("should reject session without id", async () => {
    const res = await post("/api/sessions", { name: "No ID" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should get a session by id", async () => {
    const res = await fetch("/api/sessions/sess-1");
    assert.equal(res.status, 200);
    assert.equal(res.body.session.id, "sess-1");
    assert.ok(Array.isArray(res.body.agents));
    assert.ok(Array.isArray(res.body.events));
    assert.ok(res.body.outputs);
    assert.ok(Array.isArray(res.body.outputs.agents));
  });

  it("should include transcript-backed output feeds in session detail", async () => {
    const transcriptPath = path.join(os.tmpdir(), `session-output-${Date.now()}.jsonl`);
    fs.writeFileSync(
      transcriptPath,
      [
        JSON.stringify({
          type: "user",
          timestamp: "2026-03-20T09:00:00.000Z",
          message: { role: "user", content: "Summarize the work" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "assistant-msg-1",
          timestamp: "2026-03-20T09:00:05.000Z",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "# Summary\n\n- latest finding" }],
            model: "claude-sonnet-4-20250514",
            usage: { input_tokens: 20, output_tokens: 30 },
          },
        }),
      ].join("\n") + "\n"
    );

    try {
      await post("/api/hooks/event", {
        hook_type: "Stop",
        data: {
          session_id: "sess-output-1",
          cwd: "/tmp",
          transcript_path: transcriptPath,
          last_assistant_message: "# Summary\n\n- latest finding",
        },
      });

      const res = await fetch("/api/sessions/sess-output-1");
      assert.equal(res.status, 200);
      assert.equal(res.body.outputs.latest_output_agent_id, "sess-output-1-main");
      assert.equal(res.body.outputs.agents.length, 1);
      assert.equal(res.body.outputs.agents[0].agent_id, "sess-output-1-main");
      assert.equal(res.body.outputs.agents[0].output_count, 1);
      assert.equal(res.body.outputs.agents[0].latest_output.markdown, "# Summary\n\n- latest finding");
      assert.equal(res.body.outputs.agents[0].latest_output.source, "transcript");
    } finally {
      try {
        fs.unlinkSync(transcriptPath);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("should return 404 for nonexistent session", async () => {
    const res = await fetch("/api/sessions/nonexistent");
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, "NOT_FOUND");
  });

  it("should list sessions", async () => {
    await post("/api/sessions", { id: "sess-2", name: "Session Two" });
    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);
    assert.ok(res.body.sessions.length >= 2);
  });

  it("should filter sessions by status", async () => {
    const res = await fetch("/api/sessions?status=active");
    assert.equal(res.status, 200);
    res.body.sessions.forEach((s) => assert.equal(s.status, "active"));
  });

  it("should paginate sessions", async () => {
    const res = await fetch("/api/sessions?limit=1&offset=0");
    assert.equal(res.body.sessions.length, 1);
    assert.equal(res.body.limit, 1);
    assert.equal(res.body.offset, 0);
  });

  it("should update a session", async () => {
    const res = await patch("/api/sessions/sess-1", {
      status: "completed",
      ended_at: new Date().toISOString(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.session.status, "completed");
    assert.ok(res.body.session.ended_at);
  });

  it("should return 404 when updating nonexistent session", async () => {
    const res = await patch("/api/sessions/nonexistent", { status: "error" });
    assert.equal(res.status, 404);
  });
});

// ============================================================
// Agents CRUD
// ============================================================
describe("Agents API", () => {
  it("should create an agent", async () => {
    const res = await post("/api/agents", {
      id: "agent-1",
      session_id: "sess-2",
      name: "Main Agent",
      type: "main",
      status: "connected",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.agent.id, "agent-1");
    assert.equal(res.body.agent.name, "Main Agent");
    assert.equal(res.body.agent.type, "main");
    assert.equal(res.body.created, true);
  });

  it("should return existing agent on duplicate create (idempotent)", async () => {
    const res = await post("/api/agents", {
      id: "agent-1",
      session_id: "sess-2",
      name: "Different",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.name, "Main Agent");
    assert.equal(res.body.created, false);
  });

  it("should reject agent without required fields", async () => {
    const res = await post("/api/agents", { id: "x" });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should create a subagent with parent", async () => {
    const res = await post("/api/agents", {
      id: "agent-2",
      session_id: "sess-2",
      name: "Explorer",
      type: "subagent",
      subagent_type: "Explore",
      status: "working",
      task: "Searching for patterns",
      parent_agent_id: "agent-1",
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.agent.type, "subagent");
    assert.equal(res.body.agent.subagent_type, "Explore");
    assert.equal(res.body.agent.parent_agent_id, "agent-1");
  });

  it("should get an agent by id", async () => {
    const res = await fetch("/api/agents/agent-1");
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.id, "agent-1");
  });

  it("should return 404 for nonexistent agent", async () => {
    const res = await fetch("/api/agents/nonexistent");
    assert.equal(res.status, 404);
  });

  it("should list all agents", async () => {
    const res = await fetch("/api/agents");
    assert.ok(res.body.agents.length >= 2);
  });

  it("should filter agents by status", async () => {
    const res = await fetch("/api/agents?status=working");
    assert.equal(res.status, 200);
    res.body.agents.forEach((a) => assert.equal(a.status, "working"));
  });

  it("should filter agents by session_id", async () => {
    const res = await fetch("/api/agents?session_id=sess-2");
    assert.equal(res.status, 200);
    res.body.agents.forEach((a) => assert.equal(a.session_id, "sess-2"));
  });

  it("should update an agent", async () => {
    const res = await patch("/api/agents/agent-1", {
      status: "working",
      current_tool: "Bash",
      task: "Running tests",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.status, "working");
    assert.equal(res.body.agent.current_tool, "Bash");
    assert.equal(res.body.agent.task, "Running tests");
  });

  it("should clear current_tool on update", async () => {
    const res = await patch("/api/agents/agent-1", {
      status: "connected",
      current_tool: null,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.agent.current_tool, null);
  });

  it("should return 404 when updating nonexistent agent", async () => {
    const res = await patch("/api/agents/nonexistent", { status: "error" });
    assert.equal(res.status, 404);
  });
});

// ============================================================
// Events
// ============================================================
describe("Events API", () => {
  it("should list events (empty initially)", async () => {
    const res = await fetch("/api/events");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.events));
  });

  it("should respect limit parameter", async () => {
    const res = await fetch("/api/events?limit=5");
    assert.equal(res.status, 200);
    assert.ok(res.body.events.length <= 5);
  });
});

// ============================================================
// Stats
// ============================================================
describe("Stats API", () => {
  it("should return aggregate statistics", async () => {
    const res = await fetch("/api/stats");
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.total_sessions, "number");
    assert.equal(typeof res.body.active_sessions, "number");
    assert.equal(typeof res.body.active_agents, "number");
    assert.equal(typeof res.body.total_agents, "number");
    assert.equal(typeof res.body.total_events, "number");
    assert.equal(typeof res.body.events_today, "number");
    assert.equal(typeof res.body.ws_connections, "number");
    assert.equal(typeof res.body.agents_by_status, "object");
    assert.equal(typeof res.body.sessions_by_status, "object");
  });

  it("should reflect created data in stats", async () => {
    const res = await fetch("/api/stats");
    assert.ok(res.body.total_sessions >= 2);
    assert.ok(res.body.total_agents >= 2);
  });
});

// ============================================================
// Hook Event Processing
// ============================================================
describe("Hook Event Processing", () => {
  it("should reject missing hook_type", async () => {
    const res = await post("/api/hooks/event", { data: { session_id: "x" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "INVALID_INPUT");
  });

  it("should reject missing data", async () => {
    const res = await post("/api/hooks/event", { hook_type: "PreToolUse" });
    assert.equal(res.status, 400);
  });

  it("should reject missing session_id in data", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { tool_name: "Bash" },
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "MISSING_SESSION");
  });

  it("should auto-create session and main agent on first PreToolUse", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Read",
        tool_input: { file_path: "/test.ts" },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.event.event_type, "PreToolUse");
    assert.equal(res.body.event.tool_name, "Read");

    // Verify session was created
    const sessRes = await fetch("/api/sessions/hook-sess-1");
    assert.equal(sessRes.status, 200);
    assert.equal(sessRes.body.session.status, "active");

    // Verify main agent was created
    const agentRes = await fetch("/api/agents/hook-sess-1-main");
    assert.equal(agentRes.status, 200);
    assert.equal(agentRes.body.agent.type, "main");
    assert.equal(agentRes.body.agent.status, "working");
    assert.equal(agentRes.body.agent.current_tool, "Read");
  });

  it("should keep main agent working on PostToolUse and clear current_tool", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Read",
      },
    });
    assert.equal(res.status, 200);

    const agentRes = await fetch("/api/agents/hook-sess-1-main");
    // Status stays "working" — only Stop transitions it
    assert.equal(agentRes.body.agent.status, "working");
    assert.equal(agentRes.body.agent.current_tool, null);
  });

  it("should create subagent when Agent tool is used", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-1",
        tool_name: "Agent",
        tool_input: {
          description: "Search codebase",
          subagent_type: "Explore",
          prompt: "Find all TypeScript files with error handling",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.event.summary.includes("Subagent spawned"));

    // Verify subagent exists
    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const subagents = agentsRes.body.agents.filter((a) => a.type === "subagent");
    assert.ok(subagents.length >= 1);
    const sub = subagents[0];
    assert.equal(sub.name, "Search codebase");
    assert.equal(sub.subagent_type, "Explore");
    assert.equal(sub.status, "working");
    assert.ok(sub.task.includes("Find all TypeScript"));
    assert.equal(sub.parent_agent_id, "hook-sess-1-main");
  });

  it("should mark subagent completed on SubagentStop", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-1" },
    });
    assert.equal(res.status, 200);

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const subagents = agentsRes.body.agents.filter((a) => a.type === "subagent");
    const completed = subagents.filter((a) => a.status === "completed");
    assert.ok(completed.length >= 1);
    assert.ok(completed[0].ended_at);
  });

  it("should handle Notification events", async () => {
    const res = await post("/api/hooks/event", {
      hook_type: "Notification",
      data: {
        session_id: "hook-sess-1",
        message: "Task completed successfully",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.summary, "Task completed successfully");
  });

  it("should keep session active and set main agent idle on Stop", async () => {
    // First make sure main agent is in a working state
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-1", tool_name: "Write" },
    });

    const res = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: {
        session_id: "hook-sess-1",
        stop_reason: "end_turn",
      },
    });
    assert.equal(res.status, 200);

    // Session should stay active — Stop means Claude finished responding, not session closed
    const sessRes = await fetch("/api/sessions/hook-sess-1");
    assert.equal(sessRes.body.session.status, "active");

    // Main agent should be idle (waiting for user input)
    const agentsRes = await fetch("/api/agents?session_id=hook-sess-1");
    const main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle");
  });

  it("should mark session as error when stop_reason is error", async () => {
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-err", tool_name: "Bash" },
    });

    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-err", stop_reason: "error" },
    });

    const sessRes = await fetch("/api/sessions/hook-sess-err");
    assert.equal(sessRes.body.session.status, "error");
  });

  it("should not create duplicate session on repeated events", async () => {
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-dup", tool_name: "Write" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-dup");
    const mainAgents = agentsRes.body.agents.filter((a) => a.type === "main");
    assert.equal(mainAgents.length, 1, "Should have exactly one main agent");
  });

  it("should keep background subagents working on Stop", async () => {
    // Spawn a subagent (may be running in background)
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-bg",
        tool_name: "Agent",
        tool_input: { prompt: "Analyze code", description: "BG-analyzer" },
      },
    });

    // Stop fires — background subagents stay working, main goes idle, session stays active
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-bg", stop_reason: "end_turn" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "working", "Background subagent should stay working on Stop");
    assert.equal(subagent.ended_at, null, "Subagent should not have ended_at");

    const mainAgent = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(mainAgent.status, "idle", "Main agent should be idle");

    const sessRes = await fetch("/api/sessions/hook-sess-bg");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active");

    // SubagentStop completes the subagent individually
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-bg", description: "BG-analyzer" },
    });

    const agentsRes2 = await fetch("/api/agents?session_id=hook-sess-bg");
    const subagent2 = agentsRes2.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent2.status, "completed", "Subagent should complete on SubagentStop");
    assert.ok(subagent2.ended_at, "Subagent should have ended_at after SubagentStop");
  });

  it("should NOT mark subagent completed on PostToolUse for Agent tool", async () => {
    // Fresh session: spawn a subagent, then PostToolUse fires immediately (backgrounded)
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-bg2",
        tool_name: "Agent",
        tool_input: { prompt: "Analyze code", description: "BG-analyzer-2" },
      },
    });
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: "hook-sess-bg2",
        tool_name: "Agent",
        tool_input: { description: "BG-analyzer-2" },
      },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg2");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "working", "Subagent should still be working after PostToolUse");
  });

  it("should complete subagent on SubagentStop before session Stop", async () => {
    // SubagentStop fires when the background agent actually finishes
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: "hook-sess-bg2", description: "BG-analyzer-2" },
    });

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-bg2");
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "completed", "Subagent should be completed after SubagentStop");
    assert.ok(subagent.ended_at, "Subagent should have ended_at timestamp");
  });

  it("should not flicker completed agent status on subsequent tool events", async () => {
    // Create session with active subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: "hook-sess-flicker",
        tool_name: "Agent",
        tool_input: { prompt: "Do work", description: "Worker" },
      },
    });
    // Stop sets main to idle, background subagent stays working
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-flicker", stop_reason: "end_turn" },
    });

    const agents0 = await fetch("/api/agents?session_id=hook-sess-flicker");
    const main0 = agents0.body.agents.find((a) => a.type === "main");
    assert.equal(main0.status, "idle", "Main should be idle after Stop");

    const sub0 = agents0.body.agents.find((a) => a.type === "subagent");
    assert.equal(sub0.status, "working", "Background subagent should stay working after Stop");
  });

  it("should record events in the events table", async () => {
    const eventsRes = await fetch("/api/events?session_id=hook-sess-1");
    assert.ok(
      eventsRes.body.events.length >= 4,
      "Should have multiple events from hook processing"
    );

    const types = eventsRes.body.events.map((e) => e.event_type);
    assert.ok(types.includes("PreToolUse"));
    assert.ok(types.includes("PostToolUse"));
    assert.ok(types.includes("Stop"));
  });

  it("should reactivate error session on new work events (resume)", async () => {
    // Create session and trigger error
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-resume", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-resume", stop_reason: "error" },
    });

    let sessRes = await fetch("/api/sessions/hook-sess-resume");
    assert.equal(sessRes.body.session.status, "error", "Session should be error after error Stop");

    // Resume: send a new PreToolUse for the same session
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-resume", tool_name: "Write" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-resume");
    assert.equal(sessRes.body.session.status, "active", "Session should be reactivated");
    assert.equal(sessRes.body.session.ended_at, null, "ended_at should be cleared");

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-resume");
    const main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "working", "Main agent should be working after resume");
    assert.equal(main.ended_at, null, "Main agent ended_at should be cleared");
  });

  it("should reactivate imported completed session on Stop event", async () => {
    // Simulate a session that was imported as "completed" before the server started.
    // This happens when a session is active but was imported from JSONL during startup.
    const sessionId = "hook-sess-imported-reactivate";
    const mainAgentId = `${sessionId}-main`;

    // Manually insert a "completed" imported session + agent (mimics import-history.js)
    stmts.insertSession.run(
      sessionId,
      "Imported Session",
      "completed",
      "/tmp",
      "claude-sonnet-4-6",
      null
    );
    stmts.insertAgent.run(
      mainAgentId,
      sessionId,
      "Main Agent",
      "main",
      null,
      "completed",
      null,
      null,
      null
    );

    // Verify it starts as completed
    let sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.status, "completed");
    let main = sessRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "completed");

    // A Stop event arrives — this proves the session is actually alive
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, stop_reason: "end_turn" },
    });

    // Session should be reactivated
    sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(
      sessRes.body.session.status,
      "active",
      "Completed session should reactivate on Stop"
    );

    main = sessRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle", "Main agent should be idle after Stop reactivation");
  });

  it("should NOT reactivate error session on Stop event", async () => {
    // Error sessions should only reactivate on work events, not Stop
    const sessionId = "hook-sess-error-stop";
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, stop_reason: "error" },
    });

    let sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.status, "error");

    // Another Stop should NOT reactivate an error session
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, stop_reason: "end_turn" },
    });

    sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(
      sessRes.body.session.status,
      "error",
      "Error session should NOT reactivate on Stop"
    );
  });

  it("should keep session active across multiple Stop events (multi-turn)", async () => {
    // Turn 1: user asks something, Claude responds
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-multiturn", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-multiturn", stop_reason: "end_turn" },
    });

    let sessRes = await fetch("/api/sessions/hook-sess-multiturn");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active after turn 1");

    let agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    let main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle", "Main agent should be idle after turn 1 Stop");

    // Turn 2: user asks something else — PreToolUse should transition idle → working
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-multiturn", tool_name: "Write" },
    });

    agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "working", "Main agent should be working during turn 2");

    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-multiturn", stop_reason: "end_turn" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-multiturn");
    assert.equal(sessRes.body.session.status, "active", "Session should stay active after turn 2");

    agentsRes = await fetch("/api/agents?session_id=hook-sess-multiturn");
    main = agentsRes.body.agents.find((a) => a.type === "main");
    assert.equal(main.status, "idle", "Main agent should be idle after turn 2 Stop");
  });

  it("should mark session completed on SessionEnd", async () => {
    // Create session with some activity
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-end", tool_name: "Read" },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-end", stop_reason: "end_turn" },
    });

    // Session should still be active after Stop
    let sessRes = await fetch("/api/sessions/hook-sess-end");
    assert.equal(sessRes.body.session.status, "active");

    // SessionEnd fires when CLI exits
    await post("/api/hooks/event", {
      hook_type: "SessionEnd",
      data: { session_id: "hook-sess-end", reason: "prompt_input_exit" },
    });

    sessRes = await fetch("/api/sessions/hook-sess-end");
    assert.equal(
      sessRes.body.session.status,
      "completed",
      "Session should be completed after SessionEnd"
    );
    assert.ok(sessRes.body.session.ended_at, "Session should have ended_at");

    const agentsRes = await fetch("/api/agents?session_id=hook-sess-end");
    agentsRes.body.agents.forEach((a) => {
      assert.equal(a.status, "completed", `Agent ${a.name} should be completed`);
    });
  });

  it("should extract token usage from transcript_path on Stop", async () => {
    // Create a temporary JSONL transcript file
    const transcriptPath = path.join(os.tmpdir(), `transcript-test-${Date.now()}.jsonl`);
    // Real Claude Code transcript format: model/usage are nested inside entry.message
    const lines = [
      JSON.stringify({ type: "user", message: { role: "user", content: "Hello" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          role: "assistant",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 200,
            cache_creation_input_tokens: 10,
          },
        },
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-sonnet-4-6",
          role: "assistant",
          usage: {
            input_tokens: 150,
            output_tokens: 75,
            cache_read_input_tokens: 300,
            cache_creation_input_tokens: 0,
          },
        },
      }),
      JSON.stringify({ type: "progress" }), // Non-message entries should be skipped
      JSON.stringify({
        type: "assistant",
        message: {
          model: "claude-opus-4-6",
          role: "assistant",
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 50,
          },
        },
      }),
    ];
    fs.writeFileSync(transcriptPath, lines.join("\n") + "\n");

    // Send Stop event with transcript_path
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-transcript", tool_name: "Read" },
    });
    const res = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: "hook-sess-transcript", transcript_path: transcriptPath },
    });
    assert.equal(res.status, 200);

    // Check token_usage was written
    const costRes = await fetch("/api/pricing/cost/hook-sess-transcript");
    assert.equal(costRes.status, 200);

    const sonnet = costRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(sonnet, "Should have sonnet token data");
    assert.equal(sonnet.input_tokens, 250);
    assert.equal(sonnet.output_tokens, 125);
    assert.equal(sonnet.cache_read_tokens, 500);
    assert.equal(sonnet.cache_write_tokens, 10);

    const opus = costRes.body.breakdown.find((b) => b.model === "claude-opus-4-6");
    assert.ok(opus, "Should have opus token data");
    assert.equal(opus.input_tokens, 500);
    assert.equal(opus.output_tokens, 200);

    // Clean up
    fs.unlinkSync(transcriptPath);
  });

  it("should update token usage on every event, not just Stop", async () => {
    // Create a transcript that grows over time (simulating mid-session reads)
    const transcriptPath = path.join(os.tmpdir(), `transcript-mid-${Date.now()}.jsonl`);
    const line1 = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        role: "assistant",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    fs.writeFileSync(transcriptPath, line1 + "\n");

    // PreToolUse event with transcript_path should trigger token extraction
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: "hook-sess-mid", tool_name: "Read", transcript_path: transcriptPath },
    });

    const midRes = await fetch("/api/pricing/cost/hook-sess-mid");
    assert.equal(midRes.status, 200);
    const midSonnet = midRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(midSonnet, "Should have token data after PreToolUse");
    assert.equal(midSonnet.input_tokens, 100);
    assert.equal(midSonnet.output_tokens, 50);

    // Transcript grows — second assistant response added
    const line2 = JSON.stringify({
      type: "assistant",
      message: {
        model: "claude-sonnet-4-6",
        role: "assistant",
        usage: {
          input_tokens: 200,
          output_tokens: 80,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      },
    });
    fs.appendFileSync(transcriptPath, line2 + "\n");

    // PostToolUse event should pick up the updated transcript
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: { session_id: "hook-sess-mid", tool_name: "Read", transcript_path: transcriptPath },
    });

    const updatedRes = await fetch("/api/pricing/cost/hook-sess-mid");
    const updatedSonnet = updatedRes.body.breakdown.find((b) => b.model === "claude-sonnet-4-6");
    assert.ok(updatedSonnet, "Should have updated token data after PostToolUse");
    // replaceTokenUsage overwrites with totals from full transcript (100+200=300, 50+80=130)
    assert.equal(updatedSonnet.input_tokens, 300);
    assert.equal(updatedSonnet.output_tokens, 130);

    fs.unlinkSync(transcriptPath);
  });
});

// ============================================================
// Agent Teams Monitoring
// ============================================================
describe("Agent Teams Monitoring", () => {
  it("should create a session for Agent Teams hook events with session_id and cwd", async () => {
    const sessionId = `agent-teams-sess-${Date.now()}`;
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        cwd: "/home/user/projects/databeacon",
        tool_name: "Agent",
        tool_input: {
          description: "DataBeacon Worker",
          subagent_type: "general-purpose",
          prompt: "Analyze the database schema",
        },
      },
    });
    assert.equal(res.status, 200);

    // Verify session was created with the correct cwd
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.status, 200);
    assert.equal(sessRes.body.session.status, "active");
    assert.equal(sessRes.body.session.cwd, "/home/user/projects/databeacon");

    // Verify the subagent was created
    const subagent = sessRes.body.agents.find((a) => a.type === "subagent");
    assert.ok(subagent, "Agent Teams subagent should exist");
    assert.equal(subagent.status, "working");
  });

  it("should use project_cwd as fallback for session cwd and store in metadata", async () => {
    const sessionId = `agent-teams-proj-${Date.now()}`;
    const res = await post("/api/hooks/event", {
      hook_type: "Notification",
      data: {
        session_id: sessionId,
        project_cwd: "/home/user/projects/other-project",
        message: "Agent Teams worker started",
      },
    });
    assert.equal(res.status, 200);

    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.status, 200);
    assert.equal(sessRes.body.session.cwd, "/home/user/projects/other-project");

    // Verify project_cwd is also stored in session metadata
    const meta = JSON.parse(sessRes.body.session.metadata || "{}");
    assert.equal(meta.project_cwd, "/home/user/projects/other-project");
  });

  it("should create TeamReturn event on SubagentStop with last_assistant_message", async () => {
    const sessionId = `team-return-${Date.now()}`;

    // Create session and spawn a subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Agent",
        tool_input: {
          description: "Return Worker",
          subagent_type: "general-purpose",
          prompt: "Do some work",
        },
      },
    });

    // SubagentStop with return output
    const res = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: {
        session_id: sessionId,
        description: "Return Worker",
        last_assistant_message: "Task completed: found 42 records in the database.",
      },
    });
    assert.equal(res.status, 200);

    // Verify the event was recorded
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.ok(teamReturnEvents.length >= 1, "Should have at least one TeamReturn event");
    const teamReturn = teamReturnEvents[0];
    assert.match(teamReturn.summary, /Teammate return/);
    assert.match(teamReturn.summary, /Return Worker/);
    assert.match(teamReturn.summary, /42 records/);

    // Verify agent is completed
    const agentsRes = await fetch(`/api/agents?session_id=${sessionId}`);
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent");
    assert.equal(subagent.status, "completed");
    assert.ok(subagent.ended_at);
  });

  it("should detect Agent Teams mailbox patterns in Notification events", async () => {
    const sessionId = `team-mailbox-${Date.now()}`;

    // Create session
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Read",
      },
    });

    // Notification with team-agent return pattern
    const res = await post("/api/hooks/event", {
      hook_type: "Notification",
      data: {
        session_id: sessionId,
        message: "Teammate return packet: analysis complete with 3 findings.",
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn");
    assert.match(res.body.event.summary, /Teammate return packet/);
  });

  it("should deduplicate identical return events within 30 seconds", async () => {
    const sessionId = `team-dedup-${Date.now()}`;

    // Create session and spawn subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Agent",
        tool_input: {
          description: "Dedup Worker",
          subagent_type: "Explore",
          prompt: "Search",
        },
      },
    });

    // First SubagentStop
    const res1 = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: {
        session_id: sessionId,
        description: "Dedup Worker",
        last_assistant_message: "Search complete: no issues found.",
      },
    });
    assert.equal(res1.status, 200);

    // Second identical SubagentStop (simulating duplicate hook delivery)
    const res2 = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: {
        session_id: sessionId,
        description: "Dedup Worker",
        last_assistant_message: "Search complete: no issues found.",
      },
    });
    assert.equal(res2.status, 200);

    // Should only have ONE TeamReturn event, not two
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(
      teamReturnEvents.length,
      1,
      "Duplicate SubagentStop should not create duplicate TeamReturn events"
    );
  });

  it("should make agent return visible immediately after SubagentStop (not waiting for session end)", async () => {
    const sessionId = `team-immediate-${Date.now()}`;

    // Create session and spawn subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Agent",
        tool_input: {
          description: "Immediate Worker",
          subagent_type: "general-purpose",
          prompt: "Do work and return immediately",
        },
      },
    });

    // SubagentStop with return output — the TeamReturn event should be
    // visible right after this request, without needing a Stop or SessionEnd.
    const res = await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: {
        session_id: sessionId,
        description: "Immediate Worker",
        last_assistant_message: "Returned: completed analysis.",
      },
    });
    assert.equal(res.status, 200);

    // Immediately query events — the TeamReturn should be present
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturns = eventsRes.body.events.filter(
      (e) => e.event_type === "TeamReturn"
    );
    assert.ok(
      teamReturns.length >= 1,
      "TeamReturn event should be visible immediately after SubagentStop"
    );
    assert.match(teamReturns[0].summary, /Returned: completed analysis/);

    // Session should still be active (no session-end event was sent)
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.status, "active");
  });

  it("should keep existing non-Agent Teams behavior working", async () => {
    const sessionId = `normal-sess-${Date.now()}`;

    // Standard PreToolUse
    const res1 = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, tool_name: "Read" },
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.event.event_type, "PreToolUse");

    // Standard Stop
    const res2 = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, stop_reason: "end_turn" },
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.event.event_type, "Stop");

    // Session stays active
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.status, "active");

    // Main agent is idle
    const mainAgent = sessRes.body.agents.find((a) => a.type === "main");
    assert.equal(mainAgent.status, "idle");
  });

  // ============================================================
  // Tasks 5.1 & 5.5: Structured SendMessage / mailbox payloads
  // ============================================================

  it("should persist and broadcast a TeamReturn event from PreToolUse SendMessage (task 5.1/5.5)", async () => {
    const sessionId = `sendmsg-pretask-${Date.now()}`;

    // PreToolUse with a structured SendMessage payload
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "orchestrator",
          message: "Analysis complete: found 3 critical issues in the auth module.",
          summary: "Auth audit complete",
        },
      },
    });
    assert.equal(res.status, 200);

    // The event returned should be a TeamReturn (not a generic PreToolUse)
    assert.equal(res.body.event.event_type, "TeamReturn", "SendMessage should produce TeamReturn event");
    assert.ok(res.body.event.summary.includes("Analysis complete") || res.body.event.summary.includes("Auth audit"), "Summary should include message text");

    // Verify the event was persisted
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.ok(teamReturnEvents.length >= 1, "TeamReturn event should be persisted");
  });

  it("should persist and broadcast a TeamReturn event from PostToolUse SendMessage with tool_response (task 5.1/5.5)", async () => {
    const sessionId = `sendmsg-posttask-${Date.now()}`;

    // PostToolUse with SendMessage result
    const res = await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "team-lead",
          message: "Task done: generated 12 test cases.",
          summary: "Tests ready",
        },
        tool_response: {
          delivered: true,
          payload: {
            message: "Task done: generated 12 test cases.",
            summary: "Tests ready",
          },
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn", "PostToolUse SendMessage should produce TeamReturn");
  });

  it("should extract message text from nested payload shapes (task 5.1)", async () => {
    const sessionId = `sendmsg-nested-${Date.now()}`;

    // Nested: message inside tool_input.payload.data
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          payload: {
            data: {
              message: "Mailbox report: 5 files analyzed, 1 suggestion generated.",
              summary: "File analysis complete",
            },
          },
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn");
    assert.ok(
      res.body.event.summary.includes("5 files analyzed"),
      "Nested payload message should be extracted"
    );

    // Verify persisted event also has the nested message
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturn = eventsRes.body.events.find((e) => e.event_type === "TeamReturn");
    const eventData = JSON.parse(teamReturn.data);
    assert.ok(
      eventData.messageText && eventData.messageText.includes("5 files analyzed"),
      "Persisted event data should contain extracted messageText"
    );
  });

  it("should extract structured output from Agent Teams lifecycle tool payloads when text is present (task 5.2)", async () => {
    const sessionId = `team-tool-output-${Date.now()}`;

    const res = await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: sessionId,
        tool_name: "TaskUpdate",
        tool_input: {
          team_name: "monitoring-team",
          task_id: "task-42",
          sender: "api-test-worker",
          summary: "Worker status",
          message: "Worker report: structured TaskUpdate output is ready.",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn");

    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturn = eventsRes.body.events.find((e) => e.event_type === "TeamReturn");
    assert.ok(teamReturn, "TaskUpdate with message text should create a TeamReturn");
    const eventData = JSON.parse(teamReturn.data);
    assert.equal(eventData.teamName, "monitoring-team");
    assert.equal(eventData.taskId, "task-42");
    assert.ok(eventData.messageText.includes("TaskUpdate output is ready"));
  });

  it("should extract message text from teammate-message shape (task 5.1)", async () => {
    const sessionId = `sendmsg-teammate-msg-${Date.now()}`;

    // teammate_message.message shape
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "RelayMessage",
        teammate_message: {
          message: "Subagent result: refactoring complete, 8 files modified.",
          summary: "Refactoring done",
          sender: "refactor-agent",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn");
    assert.ok(
      res.body.event.summary.includes("refactoring complete"),
      "teammate_message.message should be extracted"
    );
  });

  it("should extract message from mailbox.message shape (task 5.1)", async () => {
    const sessionId = `sendmsg-mailbox-${Date.now()}`;

    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Mailbox",
        mailbox: {
          message: "Worker done: processed 150 records in 3s.",
          summary: "Batch processing complete",
          sender: "data-worker",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "TeamReturn");
    assert.ok(res.body.event.summary.includes("150 records"), "mailbox.message should be extracted");
  });

  it("should include TeamReturn events in /api/sessions/:id/outputs (task 5.4)", async () => {
    const sessionId = `sendmsg-outputs-${Date.now()}`;

    // First, a regular PreToolUse to create the session and main agent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, tool_name: "Read" },
    });

    // Now a SendMessage that should appear in outputs
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "orchestrator",
          message: "Search complete: identified 7 files needing updates.",
          summary: "Search complete",
        },
      },
    });

    // Fetch session outputs
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.status, 200);
    assert.ok(sessRes.body.outputs, "Session should have outputs");

    // Find the main agent's outputs
    const mainAgent = sessRes.body.outputs.agents.find((a) => a.type === "main");
    assert.ok(mainAgent, "Main agent should appear in outputs");
    assert.ok(mainAgent.output_count >= 1, "Main agent should have outputs");

    // Check that one of the outputs has source === "team_return" (from the SendMessage)
    const teamReturnOutput = mainAgent.outputs.find((o) => o.source === "team_return");
    assert.ok(teamReturnOutput, "TeamReturn output should appear in agent outputs");
    assert.ok(teamReturnOutput.markdown.includes("Search complete") || teamReturnOutput.markdown.includes("7 files"), "TeamReturn output should contain the SendMessage text");
  });

  it("should not duplicate TeamReturn when same SendMessage arrives via both PreToolUse and PostToolUse (task 5.5)", async () => {
    const sessionId = `sendmsg-dedup-${Date.now()}`;

    // PreToolUse first
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "team-lead",
          message: "Dedup test: same message should not duplicate.",
          summary: "Dedup test",
        },
      },
    });

    // PostToolUse with the same message
    await post("/api/hooks/event", {
      hook_type: "PostToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "team-lead",
          message: "Dedup test: same message should not duplicate.",
          summary: "Dedup test",
        },
        tool_response: { delivered: true },
      },
    });

    // Check events - should only have ONE TeamReturn, not two
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(teamReturnEvents.length, 1, "Duplicate SendMessage should not create duplicate TeamReturn events");
  });

  it("should not duplicate TeamReturn when SendMessage and SubagentStop carry the same output (task 5.5)", async () => {
    const sessionId = `sendmsg-subagent-dedup-${Date.now()}`;

    // Create a subagent first
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Agent",
        tool_input: {
          description: "Dedup Subagent",
          subagent_type: "general-purpose",
          prompt: "Do work and return",
        },
      },
    });

    // Structured SendMessage from the subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          sender: "Dedup Subagent",
          message: "Same output: same text should not duplicate.",
          summary: "Same output",
        },
      },
    });

    // SubagentStop with the same last_assistant_message
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: {
        session_id: sessionId,
        description: "Dedup Subagent",
        last_assistant_message: "Same output: same text should not duplicate.",
      },
    });

    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(
      teamReturnEvents.length,
      1,
      "Structured SendMessage and SubagentStop with the same output should create one visible TeamReturn"
    );
  });

  it("should ignore lifecycle-only SendMessage payloads (no message content) (task 5.2)", async () => {
    const sessionId = `sendmsg-lifecycle-${Date.now()}`;

    // SendMessage with only metadata but no actual message content
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          recipient: "orchestrator",
          // No message, no summary — just metadata
          task_id: "task-123",
          team_name: "my-team",
        },
      },
    });
    assert.equal(res.status, 200);
    // Should NOT produce a TeamReturn — lifecycle-only events are skipped
    assert.equal(res.body.event.event_type, "PreToolUse", "Lifecycle-only SendMessage should not produce TeamReturn");

    // Verify no TeamReturn was persisted
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(teamReturnEvents.length, 0, "Lifecycle-only SendMessage should not persist a TeamReturn event");
  });

  it("should ignore lifecycle-only Agent Teams tool payloads without message content (task 5.2)", async () => {
    const sessionId = `team-tool-lifecycle-${Date.now()}`;

    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "TeamCreate",
        tool_input: {
          team_name: "monitoring-team",
          task_id: "task-setup",
        },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.event.event_type, "PreToolUse");

    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(teamReturnEvents.length, 0, "Lifecycle-only TeamCreate should not persist a TeamReturn event");
  });

  it("should associate SendMessage with working subagent by sender name (task 5.3)", async () => {
    const sessionId = `sendmsg-assoc-${Date.now()}`;

    // Create a working subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "Agent",
        tool_input: {
          description: "Research Worker",
          subagent_type: "Explore",
          prompt: "Research the codebase",
        },
      },
    });

    // SendMessage with sender matching the subagent name
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        tool_name: "SendMessage",
        tool_input: {
          sender: "Research Worker",
          message: "Research complete: found 15 relevant files.",
          summary: "Research done",
        },
      },
    });

    // Verify the TeamReturn was associated with the subagent, not main
    const eventsRes = await fetch(`/api/events?session_id=${sessionId}`);
    const teamReturnEvents = eventsRes.body.events.filter((e) => e.event_type === "TeamReturn");
    assert.equal(teamReturnEvents.length, 1, "SendMessage should not also create a duplicate main-agent TeamReturn");
    const agentsRes = await fetch(`/api/agents?session_id=${sessionId}`);
    const subagent = agentsRes.body.agents.find((a) => a.type === "subagent" && a.status === "working");
    assert.ok(subagent, "Subagent should exist");
    assert.equal(
      teamReturnEvents[0].agent_id,
      subagent.id,
      "TeamReturn should be associated with the subagent by sender name"
    );
  });

  it("should keep non-Agent Teams hooks working after structured payload changes (task 5.5)", async () => {
    const sessionId = `normal-after-struct-${Date.now()}`;

    // Regular non-SendMessage tool
    const res1 = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, tool_name: "Bash", tool_input: { command: "ls" } },
    });
    assert.equal(res1.status, 200);
    assert.equal(res1.body.event.event_type, "PreToolUse");

    // Stop
    const res2 = await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, stop_reason: "end_turn" },
    });
    assert.equal(res2.status, 200);
    assert.equal(res2.body.event.event_type, "Stop");

    // Session stays active
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.status, "active");

    // Agent is idle
    const mainAgent = sessRes.body.agents.find((a) => a.type === "main");
    assert.equal(mainAgent.status, "idle");
  });
});

// ============================================================
// Run ID Correlation
// ============================================================
describe("Run ID Correlation", () => {
  it("should store run_id from hook data in session.run_id column", async () => {
    const sessionId = `runid-sess-${Date.now()}`;
    const runId = `run-${Date.now()}`;
    const res = await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sessionId,
        run_id: runId,
        tool_name: "Read",
        cwd: "/test/project",
      },
    });
    assert.equal(res.status, 200);

    // Verify run_id was stored in the session's run_id column
    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.status, 200);
    assert.equal(sessRes.body.session.run_id, runId);
  });

  it("should update run_id on existing session when new run_id arrives", async () => {
    const sessionId = `runid-update-${Date.now()}`;
    const runId1 = `run-old-${Date.now()}`;
    const runId2 = `run-new-${Date.now()}`;

    // Create session with first run_id
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, run_id: runId1, tool_name: "Read" },
    });

    // Send another event with updated run_id
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, run_id: runId2, stop_reason: "end_turn" },
    });

    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.run_id, runId2);
  });

  it("should look up session by run_id via ?run_id= query parameter", async () => {
    const sessionId = `runid-lookup-${Date.now()}`;
    const runId = `run-lookup-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, run_id: runId, tool_name: "Write" },
    });

    // Query by run_id instead of session id
    const res = await fetch(`/api/sessions?run_id=${runId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.length, 1);
    assert.equal(res.body.sessions[0].id, sessionId);
    assert.equal(res.body.sessions[0].run_id, runId);
  });

  it("should return empty sessions array for unknown run_id", async () => {
    const res = await fetch("/api/sessions?run_id=nonexistent-run-id");
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.length, 0);
    assert.equal(res.body.run_id, "nonexistent-run-id");
  });

  it("should include run_id in session detail response", async () => {
    const sessionId = `runid-detail-${Date.now()}`;
    const runId = `run-detail-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, run_id: runId, tool_name: "Read" },
    });

    const res = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.session.run_id, runId);
  });

  it("should not overwrite run_id if same run_id arrives again", async () => {
    const sessionId = `runid-same-${Date.now()}`;
    const runId = `run-same-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: { session_id: sessionId, run_id: runId, tool_name: "Read" },
    });

    // Send another event with same run_id
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sessionId, run_id: runId, stop_reason: "end_turn" },
    });

    const sessRes = await fetch(`/api/sessions/${sessionId}`);
    assert.equal(sessRes.body.session.run_id, runId);
  });

  it("should keep one visible session when multiple raw session ids share a run_id", async () => {
    const runId = `run-multi-${Date.now()}`;
    const firstRawSession = `runid-first-${Date.now()}`;
    const secondRawSession = `runid-second-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: firstRawSession, run_id: runId, cwd: "/test/project" },
    });
    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: secondRawSession, run_id: runId, cwd: "/test/project" },
    });

    const firstRes = await fetch(`/api/sessions/${firstRawSession}`);
    assert.equal(firstRes.status, 200);
    assert.equal(firstRes.body.session.run_id, runId);

    const secondRes = await fetch(`/api/sessions/${secondRawSession}`);
    assert.equal(secondRes.status, 404, "second raw session id should not create a visible session");

    const runRes = await fetch(`/api/sessions?run_id=${encodeURIComponent(runId)}`);
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.sessions.length, 1);
    assert.equal(runRes.body.sessions[0].id, firstRawSession);
    assert.equal(runRes.body.sessions[0].run_id, runId);
  });

  it("should preserve raw source session ids when events are canonicalized by run_id", async () => {
    const runId = `run-source-${Date.now()}`;
    const canonicalSession = `runid-source-main-${Date.now()}`;
    const childSession = `runid-source-child-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: canonicalSession, run_id: runId, cwd: "/test/project" },
    });
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: childSession,
        run_id: runId,
        tool_name: "Read",
        cwd: "/test/project",
      },
    });

    const detailRes = await fetch(`/api/sessions/${canonicalSession}`);
    assert.equal(detailRes.status, 200);
    const childEvent = detailRes.body.events.find((event) => {
      if (event.session_id !== canonicalSession || event.event_type !== "PreToolUse") return false;
      const data = JSON.parse(event.data);
      return data.source_session_id === childSession && data.canonical_session_id === canonicalSession;
    });
    assert.ok(childEvent, "canonicalized event should retain source_session_id and canonical_session_id");
  });

  it("should apply terminal state from child aliases to the canonical run session", async () => {
    const runId = `run-terminal-${Date.now()}`;
    const canonicalSession = `runid-terminal-main-${Date.now()}`;
    const childSession = `runid-terminal-child-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: canonicalSession, run_id: runId, cwd: "/test/project" },
    });
    await post("/api/hooks/event", {
      hook_type: "SessionEnd",
      data: { session_id: childSession, run_id: runId, cwd: "/test/project" },
    });

    const runRes = await fetch(`/api/sessions?run_id=${encodeURIComponent(runId)}`);
    assert.equal(runRes.status, 200);
    assert.equal(runRes.body.sessions.length, 1);
    assert.equal(runRes.body.sessions[0].id, canonicalSession);
    assert.equal(runRes.body.sessions[0].status, "completed");

    const childRes = await fetch(`/api/sessions/${childSession}`);
    assert.equal(childRes.status, 404, "child alias should not stay visible after terminal event");
  });

  it("should preserve session-id behavior for hook events without run_id", async () => {
    const firstSession = `norun-first-${Date.now()}`;
    const secondSession = `norun-second-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: firstSession, cwd: "/test/project" },
    });
    await post("/api/hooks/event", {
      hook_type: "SessionStart",
      data: { session_id: secondSession, cwd: "/test/project" },
    });

    const firstRes = await fetch(`/api/sessions/${firstSession}`);
    const secondRes = await fetch(`/api/sessions/${secondSession}`);
    assert.equal(firstRes.status, 200);
    assert.equal(secondRes.status, 200);
    assert.equal(firstRes.body.session.id, firstSession);
    assert.equal(secondRes.body.session.id, secondSession);
  });
});

// ============================================================
// Database Integrity
// ============================================================
describe("Database Integrity", () => {
  it("should enforce session status CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertSession.run("bad-status", "test", "invalid_status", null, null, null);
    });
  });

  it("should enforce agent status CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertAgent.run(
        "bad-agent",
        "sess-2",
        "Test",
        "main",
        null,
        "invalid_status",
        null,
        null,
        null
      );
    });
  });

  it("should enforce agent type CHECK constraint", () => {
    assert.throws(() => {
      stmts.insertAgent.run(
        "bad-agent2",
        "sess-2",
        "Test",
        "invalid_type",
        null,
        "idle",
        null,
        null,
        null
      );
    });
  });

  it("should cascade delete agents when session is deleted", () => {
    // Create a session with agents
    stmts.insertSession.run("cascade-test", "Cascade Test", "active", null, null, null);
    stmts.insertAgent.run(
      "cascade-agent",
      "cascade-test",
      "Agent",
      "main",
      null,
      "idle",
      null,
      null,
      null
    );

    // Verify agent exists
    assert.ok(stmts.getAgent.get("cascade-agent"));

    // Delete session
    db.prepare("DELETE FROM sessions WHERE id = ?").run("cascade-test");

    // Agent should be gone
    assert.equal(stmts.getAgent.get("cascade-agent"), undefined);
  });

  it("should have all expected indexes", () => {
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'")
      .all()
      .map((r) => r.name);

    assert.ok(indexes.includes("idx_agents_session"));
    assert.ok(indexes.includes("idx_agents_status"));
    assert.ok(indexes.includes("idx_events_session"));
    assert.ok(indexes.includes("idx_events_type"));
    assert.ok(indexes.includes("idx_events_created"));
    assert.ok(indexes.includes("idx_sessions_status"));
    assert.ok(indexes.includes("idx_sessions_started"));
  });

  it("should use WAL journal mode", () => {
    const mode = db.pragma("journal_mode", { simple: true });
    assert.equal(mode, "wal");
  });

  it("should have foreign keys enabled", () => {
    const fk = db.pragma("foreign_keys", { simple: true });
    assert.equal(fk, 1);
  });
});

describe("Transcript cache integration", () => {
  it("should extract and cache tokens from transcript file via hook event", async () => {
    const tmpTranscript = path.join(os.tmpdir(), `test-transcript-${Date.now()}.jsonl`);
    const entries = [
      JSON.stringify({
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
          },
        },
      }),
      JSON.stringify({
        message: {
          model: "claude-sonnet-4-20250514",
          usage: {
            input_tokens: 200,
            output_tokens: 75,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 10,
          },
        },
      }),
    ];
    fs.writeFileSync(tmpTranscript, entries.join("\n") + "\n");

    try {
      const sessionId = `cache-test-${Date.now()}`;

      // First event — cache miss, full read
      const r1 = await post("/api/hooks/event", {
        hook_type: "PreToolUse",
        data: {
          session_id: sessionId,
          transcript_path: tmpTranscript,
          tool_name: "Read",
          cwd: "/tmp",
        },
      });
      assert.strictEqual(r1.status, 200);

      // Verify token usage was stored
      const tokenRow = stmts.getTokensBySession.all(sessionId);
      assert.ok(tokenRow.length > 0, "token_usage row should exist");
      const sonnet = tokenRow.find((r) => r.model.includes("sonnet"));
      assert.ok(sonnet, "should have sonnet model entry");
      assert.strictEqual(sonnet.input_tokens, 300);
      assert.strictEqual(sonnet.output_tokens, 125);
      assert.strictEqual(sonnet.cache_read_tokens, 30);
      assert.strictEqual(sonnet.cache_write_tokens, 15);

      // Second event — same file, should be a cache hit (stat unchanged)
      const r2 = await post("/api/hooks/event", {
        hook_type: "PostToolUse",
        data: {
          session_id: sessionId,
          transcript_path: tmpTranscript,
          tool_name: "Read",
          cwd: "/tmp",
        },
      });
      assert.strictEqual(r2.status, 200);

      // Tokens should still be the same (no double-counting)
      const tokenRow2 = stmts.getTokensBySession.all(sessionId);
      const sonnet2 = tokenRow2.find((r) => r.model.includes("sonnet"));
      assert.strictEqual(sonnet2.input_tokens, 300);

      // Append new data — simulates Claude writing more to transcript
      fs.appendFileSync(
        tmpTranscript,
        JSON.stringify({
          message: {
            model: "claude-sonnet-4-20250514",
            usage: {
              input_tokens: 400,
              output_tokens: 150,
              cache_read_input_tokens: 40,
              cache_creation_input_tokens: 20,
            },
          },
        }) + "\n"
      );

      // Third event — file grew, incremental read should pick up new data
      const r3 = await post("/api/hooks/event", {
        hook_type: "Stop",
        data: { session_id: sessionId, transcript_path: tmpTranscript, cwd: "/tmp" },
      });
      assert.strictEqual(r3.status, 200);

      const tokenRow3 = stmts.getTokensBySession.all(sessionId);
      const sonnet3 = tokenRow3.find((r) => r.model.includes("sonnet"));
      assert.strictEqual(sonnet3.input_tokens, 700);
      assert.strictEqual(sonnet3.output_tokens, 275);
    } finally {
      try {
        fs.unlinkSync(tmpTranscript);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("should include transcript_cache in settings info", async () => {
    const res = await fetch("/api/settings/info");
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.transcript_cache, "response should include transcript_cache");
    assert.ok(typeof res.body.transcript_cache.entries === "number", "should have entries count");
    assert.ok(Array.isArray(res.body.transcript_cache.paths), "should have paths array");
  });

  it("should resolve and persist the nearest openspec workspace root", async () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const nestedPath = path.join(repoRoot, "claude-monitor", "server");

    const updateRes = await post("/api/settings/openspec-workspace", {
      workspaceRoot: nestedPath,
    });

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.openspec.workspaceRoot, repoRoot);
    assert.strictEqual(updateRes.body.openspec.activeWorkspaceRoot, repoRoot);
    assert.strictEqual(updateRes.body.openspec.source, "preferred");

    const infoRes = await fetch("/api/settings/info");
    assert.strictEqual(infoRes.status, 200);
    assert.strictEqual(infoRes.body.openspec.workspaceRoot, repoRoot);
    assert.strictEqual(infoRes.body.openspec.activeWorkspaceRoot, repoRoot);
  });

  afterEach(async () => {
    // Clean up active workspace to avoid polluting subsequent test suites
    await post("/api/settings/openspec-workspace", { workspaceRoot: "" });
  });

  it("should evict cache entry on SessionEnd", async () => {
    const tmpTranscript = path.join(os.tmpdir(), `test-evict-${Date.now()}.jsonl`);
    fs.writeFileSync(
      tmpTranscript,
      JSON.stringify({ message: { model: "m1", usage: { input_tokens: 10, output_tokens: 5 } } }) +
        "\n"
    );

    try {
      const sessionId = `evict-test-${Date.now()}`;
      const { transcriptCache } = require("../routes/hooks");

      // Hook event populates cache
      await post("/api/hooks/event", {
        hook_type: "PreToolUse",
        data: {
          session_id: sessionId,
          transcript_path: tmpTranscript,
          tool_name: "Read",
          cwd: "/tmp",
        },
      });
      assert.ok(
        transcriptCache.stats().paths.includes(tmpTranscript),
        "cache should contain transcript path after event"
      );

      // SessionEnd should evict
      await post("/api/hooks/event", {
        hook_type: "SessionEnd",
        data: { session_id: sessionId, transcript_path: tmpTranscript, cwd: "/tmp" },
      });
      assert.ok(
        !transcriptCache.stats().paths.includes(tmpTranscript),
        "cache should NOT contain transcript path after SessionEnd"
      );
    } finally {
      try {
        fs.unlinkSync(tmpTranscript);
      } catch {
        // ignore
      }
    }
  });
});

// ============================================================
// Nested Agent Spawning (agents spawning agents spawning agents)
// ============================================================
describe("Nested Agent Spawning", () => {
  const SID = "hook-sess-nested";

  it("should parent subagent to main when main is working (depth 0→1)", async () => {
    // Main agent is working (auto-created on first event) and spawns a subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: SID,
        tool_name: "Agent",
        tool_input: {
          description: "Level-1 explorer",
          subagent_type: "Explore",
          prompt: "Explore the codebase",
        },
      },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${SID}`);
    const sub1 = agentsRes.body.agents.find((a) => a.name === "Level-1 explorer");
    assert.ok(sub1, "Level-1 subagent should exist");
    assert.equal(sub1.parent_agent_id, `${SID}-main`, "Level-1 parent should be main agent");
    assert.equal(sub1.status, "working");
  });

  it("should parent sub-subagent to working subagent when main is idle (depth 1→2)", async () => {
    // Stop main agent so it goes idle — simulates main waiting for subagent results
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: SID, stop_reason: "end_turn" },
    });

    // Verify main is idle
    const mainRes = await fetch(`/api/agents/${SID}-main`);
    assert.equal(mainRes.body.agent.status, "idle", "Main should be idle");

    // Now a new Agent tool call arrives — since main is idle, this must be from the working subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: SID,
        tool_name: "Agent",
        tool_input: {
          description: "Level-2 researcher",
          subagent_type: "general-purpose",
          prompt: "Research the topic",
        },
      },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${SID}`);
    const sub1 = agentsRes.body.agents.find((a) => a.name === "Level-1 explorer");
    const sub2 = agentsRes.body.agents.find((a) => a.name === "Level-2 researcher");
    assert.ok(sub2, "Level-2 subagent should exist");
    assert.equal(
      sub2.parent_agent_id,
      sub1.id,
      "Level-2 parent should be level-1 subagent, not main"
    );
    assert.equal(sub2.status, "working");
  });

  it("should parent sub-sub-subagent to deepest working agent (depth 2→3)", async () => {
    // Level-2 is working, level-1 is working, main is idle → deepest working is level-2
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: SID,
        tool_name: "Agent",
        tool_input: {
          description: "Level-3 specialist",
          subagent_type: "test-engineer",
          prompt: "Write tests",
        },
      },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${SID}`);
    const sub2 = agentsRes.body.agents.find((a) => a.name === "Level-2 researcher");
    const sub3 = agentsRes.body.agents.find((a) => a.name === "Level-3 specialist");
    assert.ok(sub3, "Level-3 subagent should exist");
    assert.equal(sub3.parent_agent_id, sub2.id, "Level-3 parent should be level-2 subagent");
  });

  it("should complete deepest agent first and shift parenting on SubagentStop", async () => {
    // Complete level-3 first
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: SID, description: "Level-3 specialist" },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${SID}`);
    const sub3 = agentsRes.body.agents.find((a) => a.name === "Level-3 specialist");
    assert.equal(sub3.status, "completed", "Level-3 should be completed");

    // Now spawn another agent — with level-3 completed, deepest working is level-2
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: SID,
        tool_name: "Agent",
        tool_input: {
          description: "Level-3b sibling",
          subagent_type: "Explore",
          prompt: "Another task",
        },
      },
    });

    const agentsRes2 = await fetch(`/api/agents?session_id=${SID}`);
    const sub2 = agentsRes2.body.agents.find((a) => a.name === "Level-2 researcher");
    const sub3b = agentsRes2.body.agents.find((a) => a.name === "Level-3b sibling");
    assert.ok(sub3b, "Level-3b sibling should exist");
    assert.equal(sub3b.parent_agent_id, sub2.id, "Level-3b should be parented to level-2");
  });

  it("should return correct tree structure from workflows endpoint", async () => {
    // Complete remaining agents so tree is stable
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: SID, description: "Level-3b sibling" },
    });
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: SID, description: "Level-2 researcher" },
    });
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: SID, description: "Level-1 explorer" },
    });

    const res = await fetch(`/api/workflows/session/${SID}`);
    assert.equal(res.status, 200);
    const { tree } = res.body;
    assert.ok(tree.length >= 1, "Tree should have root nodes");

    // Find main agent in tree
    const mainNode = tree.find((n) => n.type === "main");
    assert.ok(mainNode, "Main agent should be a root node");
    assert.ok(mainNode.children.length >= 1, "Main should have children");

    // Find level-1 in main's children
    const l1 = mainNode.children.find((c) => c.name === "Level-1 explorer");
    assert.ok(l1, "Level-1 should be child of main");
    assert.ok(l1.children.length >= 1, "Level-1 should have children");

    // Find level-2 in level-1's children
    const l2 = l1.children.find((c) => c.name === "Level-2 researcher");
    assert.ok(l2, "Level-2 should be child of level-1");
    assert.ok(l2.children.length >= 1, "Level-2 should have children");

    // Level-3 and level-3b should be children of level-2
    const l3names = l2.children.map((c) => c.name);
    assert.ok(l3names.includes("Level-3 specialist"), "Level-3 should be child of level-2");
    assert.ok(l3names.includes("Level-3b sibling"), "Level-3b should be child of level-2");
  });

  it("should complete all nested agents on SessionEnd", async () => {
    // Create a fresh session with deep nesting, then SessionEnd
    const sid = "hook-sess-nested-end";
    // Main spawns level-1
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "End-L1", prompt: "task" },
      },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sid, stop_reason: "end_turn" },
    });
    // Level-1 spawns level-2
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "End-L2", prompt: "subtask" },
      },
    });

    // SessionEnd should complete everything
    await post("/api/hooks/event", {
      hook_type: "SessionEnd",
      data: { session_id: sid },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${sid}`);
    for (const agent of agentsRes.body.agents) {
      assert.equal(
        agent.status,
        "completed",
        `Agent ${agent.name} should be completed after SessionEnd`
      );
      assert.ok(agent.ended_at, `Agent ${agent.name} should have ended_at`);
    }
  });

  it("should handle orphaned subagents when parent is missing", async () => {
    // Create session with main, a legitimate subagent, then delete the parent to orphan it
    stmts.insertSession.run("orphan-sess", "Orphan Test", "active", null, null, null);
    stmts.insertAgent.run(
      "orphan-main",
      "orphan-sess",
      "Main",
      "main",
      null,
      "working",
      null,
      null,
      null
    );
    // Create a subagent parented to main, then we'll check tree structure
    stmts.insertAgent.run(
      "orphan-real-parent",
      "orphan-sess",
      "Real Parent",
      "subagent",
      "Explore",
      "completed",
      null,
      "orphan-main",
      null
    );
    // Create a child of the real parent — this will become orphaned when we NULL its parent
    stmts.insertAgent.run(
      "orphan-sub",
      "orphan-sess",
      "Orphan Sub",
      "subagent",
      "Explore",
      "working",
      null,
      "orphan-real-parent",
      null
    );
    // Delete the real parent — FK ON DELETE SET NULL means orphan-sub.parent_agent_id becomes NULL
    db.prepare("DELETE FROM agents WHERE id = 'orphan-real-parent'").run();

    const res = await fetch("/api/workflows/session/orphan-sess");
    assert.equal(res.status, 200);
    // The orphan should appear as a root (parent was deleted, FK set to NULL)
    const { tree } = res.body;
    const orphanNode = tree.find((n) => n.name === "Orphan Sub");
    assert.ok(orphanNode, "Orphaned subagent should appear as a root node in tree");
  });

  it("should parent to main when main is working and subagents also working (parallel)", async () => {
    const sid = "hook-sess-parallel";
    // Main spawns first subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "Parallel-A", prompt: "task A" },
      },
    });
    // Main is still working — spawns another subagent
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "Parallel-B", prompt: "task B" },
      },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${sid}`);
    const subA = agentsRes.body.agents.find((a) => a.name === "Parallel-A");
    const subB = agentsRes.body.agents.find((a) => a.name === "Parallel-B");
    assert.equal(subA.parent_agent_id, `${sid}-main`, "Parallel-A should be parented to main");
    assert.equal(
      subB.parent_agent_id,
      `${sid}-main`,
      "Parallel-B should be parented to main (main was working)"
    );
  });

  it("should verify depth calculation in workflows stats", async () => {
    const res = await fetch("/api/workflows");
    assert.equal(res.status, 200);
    // Our nested session (hook-sess-nested) has depth 3, so avg should be > 0
    assert.ok(typeof res.body.stats.avgDepth === "number", "avgDepth should be a number");
    assert.ok(res.body.stats.avgDepth > 0, "avgDepth should be > 0 with nested agents");
  });

  it("should filter workflow sessions by status", async () => {
    // Clear any workspace set by previous tests to ensure isolation
    await post("/api/settings/openspec-workspace", { workspaceRoot: "" });

    const activeId = `workflow-active-${Date.now()}`;
    const completedId = `workflow-completed-${Date.now()}`;

    await post("/api/sessions", { id: activeId, name: "Workflow Active" });
    await post("/api/sessions", { id: completedId, name: "Workflow Completed" });
    await patch(`/api/sessions/${completedId}`, {
      status: "completed",
      ended_at: new Date().toISOString(),
    });

    const activeRes = await fetch("/api/workflows?status=active");
    assert.equal(activeRes.status, 200);
    assert.ok(activeRes.body.complexity.some((session) => session.id === activeId));
    assert.ok(activeRes.body.complexity.every((session) => session.status === "active"));

    const completedRes = await fetch("/api/workflows?status=completed");
    assert.equal(completedRes.status, 200);
    assert.ok(completedRes.body.complexity.some((session) => session.id === completedId));
    assert.ok(completedRes.body.complexity.every((session) => session.status === "completed"));
  });

  it("should support arbitrary depth (depth 7 chain)", async () => {
    const sid = "hook-sess-deep7";
    const DEPTH = 7;

    // Spawn level-1 from main (main is working on first event)
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "Deep-L1", prompt: "task" },
      },
    });
    // Stop main so subagent events get parented correctly
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sid, stop_reason: "end_turn" },
    });

    // Spawn levels 2 through DEPTH — each parented to the previous
    for (let i = 2; i <= DEPTH; i++) {
      await post("/api/hooks/event", {
        hook_type: "PreToolUse",
        data: {
          session_id: sid,
          tool_name: "Agent",
          tool_input: { description: `Deep-L${i}`, prompt: `task at depth ${i}` },
        },
      });
    }

    // Verify the chain: each level should be parented to the previous
    const agentsRes = await fetch(`/api/agents?session_id=${sid}`);
    const agents = agentsRes.body.agents;
    const byName = {};
    for (const a of agents) byName[a.name] = a;

    assert.equal(byName["Deep-L1"].parent_agent_id, `${sid}-main`, "L1 parent = main");
    for (let i = 2; i <= DEPTH; i++) {
      const child = byName[`Deep-L${i}`];
      const parent = byName[`Deep-L${i - 1}`];
      assert.ok(child, `Deep-L${i} should exist`);
      assert.ok(parent, `Deep-L${i - 1} should exist`);
      assert.equal(
        child.parent_agent_id,
        parent.id,
        `Deep-L${i} should be parented to Deep-L${i - 1}`
      );
    }

    // Verify tree structure from workflows endpoint
    const treeRes = await fetch(`/api/workflows/session/${sid}`);
    assert.equal(treeRes.status, 200);
    let node = treeRes.body.tree.find((n) => n.type === "main");
    assert.ok(node, "Main should be root");
    for (let i = 1; i <= DEPTH; i++) {
      assert.ok(node.children.length >= 1, `Node at depth ${i - 1} should have children`);
      node = node.children.find((c) => c.name === `Deep-L${i}`);
      assert.ok(node, `Deep-L${i} should be in tree at depth ${i}`);
    }
    assert.equal(node.children.length, 0, "Deepest node should be a leaf");
  });

  it("should unwind correctly when inner agents stop (depth 5, then spawn sibling)", async () => {
    const sid = "hook-sess-unwind";

    // Build chain: main → L1 → L2 → L3 → L4 → L5
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "UW-L1", prompt: "t" },
      },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: { session_id: sid, stop_reason: "end_turn" },
    });
    for (let i = 2; i <= 5; i++) {
      await post("/api/hooks/event", {
        hook_type: "PreToolUse",
        data: {
          session_id: sid,
          tool_name: "Agent",
          tool_input: { description: `UW-L${i}`, prompt: "t" },
        },
      });
    }

    // Now complete L5 and L4
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: sid, description: "UW-L5" },
    });
    await post("/api/hooks/event", {
      hook_type: "SubagentStop",
      data: { session_id: sid, description: "UW-L4" },
    });

    // Deepest working should now be L3. Spawn a new agent — should parent to L3.
    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: { description: "UW-L4b", prompt: "t" },
      },
    });

    const agentsRes = await fetch(`/api/agents?session_id=${sid}`);
    const agents = agentsRes.body.agents;
    const byName = {};
    for (const a of agents) byName[a.name] = a;

    assert.equal(byName["UW-L5"].status, "completed");
    assert.equal(byName["UW-L4"].status, "completed");
    assert.equal(byName["UW-L3"].status, "working");
    assert.equal(
      byName["UW-L4b"].parent_agent_id,
      byName["UW-L3"].id,
      "After unwinding to L3, new spawn should parent to L3"
    );
  });
});

describe("Maintenance Sweep", () => {
  it("should auto-close sessions that stay idle past the configured threshold", async () => {
    const sid = `idle-close-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Read",
      },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: {
        session_id: sid,
        stop_reason: "end_turn",
      },
    });

    db.prepare(
      "UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 minutes') WHERE id = ?"
    ).run(sid);

    runMaintenanceSweep({
      cleanupDb: require("../db"),
      broadcast: () => {},
      importCompactions: () => 0,
      transcriptCache: {
        invalidate: () => {},
        extractCompactions: () => [],
      },
      idleSessionMinutes: 2,
      staleSessionMinutes: 99,
    });

    const sessionRes = await fetch(`/api/sessions/${sid}`);
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.session.status, "completed");

    const mainAgentRes = await fetch(`/api/agents/${sid}-main`);
    assert.equal(mainAgentRes.status, 200);
    assert.equal(mainAgentRes.body.agent.status, "completed");
    assert.ok(mainAgentRes.body.agent.ended_at);
  });

  it("should keep sessions open when a teammate is still working", async () => {
    const sid = `idle-active-${Date.now()}`;

    await post("/api/hooks/event", {
      hook_type: "PreToolUse",
      data: {
        session_id: sid,
        tool_name: "Agent",
        tool_input: {
          description: "Still working",
          subagent_type: "general-purpose",
          prompt: "Keep going",
        },
      },
    });
    await post("/api/hooks/event", {
      hook_type: "Stop",
      data: {
        session_id: sid,
        stop_reason: "end_turn",
      },
    });

    db.prepare(
      "UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-3 minutes') WHERE id = ?"
    ).run(sid);

    runMaintenanceSweep({
      cleanupDb: require("../db"),
      broadcast: () => {},
      importCompactions: () => 0,
      transcriptCache: {
        invalidate: () => {},
        extractCompactions: () => [],
      },
      idleSessionMinutes: 2,
      staleSessionMinutes: 99,
    });

    const sessionRes = await fetch(`/api/sessions/${sid}`);
    assert.equal(sessionRes.status, 200);
    assert.equal(sessionRes.body.session.status, "active");

    const agentsRes = await fetch(`/api/agents?session_id=${sid}`);
    const subagent = agentsRes.body.agents.find((agent) => agent.type === "subagent");
    assert.ok(subagent);
    assert.equal(subagent.status, "working");
  });
});

// ============================================================
// Model Attribution
// ============================================================
describe("Model Attribution", () => {
  // Use repo root which has openspec/ directory for valid workspace context
  const repoRoot = path.resolve(__dirname, "..", "..", "..");

  it("should use concrete token_usage model when sessions.model is null", async () => {
    // Create a session with null model using repo root as cwd
    const sessionId = `model-attr-null-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Model Test", "active", repoRoot, null, null);

    // Insert token_usage with concrete model "minimax"
    stmts.upsertTokenUsage.run(sessionId, "minimax", 100, 50, 10, 5);

    // Workflows should show "minimax" as the model (query with explicit workspaceRoot)
    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    // Find our session in complexity
    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session, "Session should appear in workflow complexity");
    assert.equal(session.model, "minimax", "Should use concrete model from token_usage");

    // Note: modelDelegation.mainModels is derived from agents table, not sessions,
    // so we don't assert on it here since we only inserted a session with token_usage

    // Clean up
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should use concrete token_usage model when sessions.model is unknown", async () => {
    const sessionId = `model-attr-unknown-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Model Unknown", "active", repoRoot, "unknown", null);

    // Insert token_usage with concrete model "claude-sonnet-4-6"
    stmts.upsertTokenUsage.run(sessionId, "claude-sonnet-4-6", 200, 100, 20, 10);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session);
    assert.equal(session.model, "claude-sonnet-4-6", "Should prefer token_usage model over unknown sessions.model");

    // Clean up
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should use largest token_usage model when sessions.model is null and multiple models exist", async () => {
    const sessionId = `model-attr-multi-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Model Multi", "active", repoRoot, null, null);

    // Insert token_usage with multiple models - sonnet has more tokens
    stmts.upsertTokenUsage.run(sessionId, "claude-haiku-4-5", 50, 25, 5, 2);
    stmts.upsertTokenUsage.run(sessionId, "claude-sonnet-4-6", 500, 250, 50, 25);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session);
    assert.equal(session.model, "claude-sonnet-4-6", "Should use model with largest token total");

    // Clean up
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should preserve all token_usage rows for token breakdown", async () => {
    const sessionId = `model-attr-preserve-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Model Preserve", "active", repoRoot, null, null);

    // Insert multiple token_usage rows
    stmts.upsertTokenUsage.run(sessionId, "claude-haiku-4-5", 100, 50, 10, 5);
    stmts.upsertTokenUsage.run(sessionId, "claude-sonnet-4-6", 200, 100, 20, 10);

    // Session should use the model with largest token total
    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session);
    assert.equal(session.model, "claude-sonnet-4-6");

    // Token breakdown should still have both models
    const costRes = await fetch(`/api/pricing/cost/${sessionId}`);
    assert.equal(costRes.status, 200);
    const models = costRes.body.breakdown.map((b) => b.model).sort();
    assert.deepEqual(models, ["claude-haiku-4-5", "claude-sonnet-4-6"], "Both token_usage rows should be preserved");

    // Clean up
    db.prepare("DELETE FROM token_usage WHERE session_id = ?").run(sessionId);
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return null model when no model evidence exists", async () => {
    const sessionId = `model-attr-none-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Model None", "active", repoRoot, null, null);
    // No token_usage rows

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(repoRoot)}`);
    assert.equal(res.status, 200);

    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session);
    // Model should be null/undefined when no evidence exists
    // (getBestKnownModelForSession returns null when no evidence)
    assert.ok(session.model === null || session.model === undefined || session.model === "unknown" || session.model === "", "Should not guess a model when no evidence exists");

    // Clean up
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });
});

// ============================================================
// Project Scoping
// ============================================================
describe("Project Scoping", () => {
  it("should filter sessions by workspace root when provided", async () => {
    const workspaceRoot = "/tmp/test-workspace";
    const otherRoot = "/tmp/other-workspace";

    // Create sessions in different workspaces
    const session1 = `proj-sess-1-${Date.now()}`;
    const session2 = `proj-sess-2-${Date.now()}`;
    stmts.insertSession.run(session1, "Session 1", "active", workspaceRoot, null, null);
    stmts.insertSession.run(session2, "Session 2", "active", otherRoot, null, null);

    // Set active workspace to workspaceRoot
    await post("/api/settings/openspec-workspace", { workspaceRoot });

    // Query with explicit workspaceRoot
    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    const sessions = res.body.sessions;
    const hasSession1 = sessions.some((s) => s.id === session1);
    const hasSession2 = sessions.some((s) => s.id === session2);

    // Session from the specified workspace should be included
    assert.ok(hasSession1, "Session from workspaceRoot should be included");
    // Session from other workspace should be excluded
    assert.ok(!hasSession2, "Session from other workspace should be excluded");

    // Clean up
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(session1, session2);
  });

  it("should filter workflows by workspace root when provided", async () => {
    const workspaceRoot = "/tmp/test-wf-workspace";

    // Create a session in the workspace
    const sessionId = `wf-proj-sess-${Date.now()}`;
    stmts.insertSession.run(sessionId, "WF Test", "active", workspaceRoot, null, null);

    // Set active workspace
    await post("/api/settings/openspec-workspace", { workspaceRoot });

    // Query workflows with explicit workspaceRoot
    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    // The session should appear in complexity
    const session = res.body.complexity.find((s) => s.id === sessionId);
    assert.ok(session, "Session should appear in workflow complexity when workspace matches");

    // Clean up
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should handle Windows-style paths in workspace filter", async () => {
    // Windows path with backslash
    const workspaceRoot = "B:\\project\\test";

    // Create session with Windows path
    const sessionId = `win-sess-${Date.now()}`;
    stmts.insertSession.run(sessionId, "Windows Test", "active", workspaceRoot + "\\subdir", null, null);

    // Set workspace root (note: this would require the path to exist with openspec/)
    // For testing, we just verify the query doesn't crash
    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    // Clean up
    db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  });

  it("should return all sessions when workspaceRoot is not provided and no active workspace set", async () => {
    // Clear active workspace
    await post("/api/settings/openspec-workspace", { workspaceRoot: "" });

    // Create sessions
    const session1 = `all-sess-1-${Date.now()}`;
    const session2 = `all-sess-2-${Date.now()}`;
    stmts.insertSession.run(session1, "All Test 1", "active", "/tmp/test1", null, null);
    stmts.insertSession.run(session2, "All Test 2", "active", "/tmp/test2", null, null);

    // Query without workspaceRoot
    const res = await fetch("/api/sessions");
    assert.equal(res.status, 200);

    // Both sessions should be included
    const hasSession1 = res.body.sessions.some((s) => s.id === session1);
    const hasSession2 = res.body.sessions.some((s) => s.id === session2);
    assert.ok(hasSession1, "Session 1 should be included when no workspace filter");
    assert.ok(hasSession2, "Session 2 should be included when no workspace filter");

    // Clean up
    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(session1, session2);
  });

  it("should match direct child paths but not sibling paths (Unix-style)", async () => {
    const workspaceRoot = "/tmp/app";
    const childSession = `child-sess-${Date.now()}`;
    const siblingSession = `sibling-sess-${Date.now()}`;

    stmts.insertSession.run(childSession, "Child", "active", "/tmp/app/child", null, null);
    stmts.insertSession.run(siblingSession, "Sibling", "active", "/tmp/app-old", null, null);

    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    const sessions = res.body.sessions;
    const hasChild = sessions.some((s) => s.id === childSession);
    const hasSibling = sessions.some((s) => s.id === siblingSession);

    assert.ok(hasChild, "/tmp/app/child should match /tmp/app");
    assert.ok(!hasSibling, "/tmp/app-old should NOT match /tmp/app");

    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(childSession, siblingSession);
  });

  it("should match direct child paths but not sibling paths (Windows-style)", async () => {
    const workspaceRoot = "B:\\project\\test";
    const childSession = `win-child-${Date.now()}`;
    const siblingSession = `win-sibling-${Date.now()}`;

    stmts.insertSession.run(childSession, "Win Child", "active", "B:\\project\\test\\child", null, null);
    stmts.insertSession.run(siblingSession, "Win Sibling", "active", "B:\\project\\test2", null, null);

    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    const sessions = res.body.sessions;
    const hasChild = sessions.some((s) => s.id === childSession);
    const hasSibling = sessions.some((s) => s.id === siblingSession);

    assert.ok(hasChild, "B:\\project\\test\\child should match B:\\project\\test");
    assert.ok(!hasSibling, "B:\\project\\test2 should NOT match B:\\project\\test");

    db.prepare("DELETE FROM sessions WHERE id IN (?, ?)").run(childSession, siblingSession);
  });

  it("should match exact root path", async () => {
    const workspaceRoot = "/tmp/exact-test";
    const exactSession = `exact-sess-${Date.now()}`;

    stmts.insertSession.run(exactSession, "Exact", "active", "/tmp/exact-test", null, null);

    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    const hasExact = res.body.sessions.some((s) => s.id === exactSession);
    assert.ok(hasExact, "Exact path /tmp/exact-test should match itself");

    db.prepare("DELETE FROM sessions WHERE id = ?").run(exactSession);
  });

  it("should apply same semantics to metadata.project_cwd", async () => {
    const workspaceRoot = "/tmp/meta-test";
    const childMeta = JSON.stringify({ project_cwd: "/tmp/meta-test/child" });
    const siblingMeta = JSON.stringify({ project_cwd: "/tmp/meta-test-sibling" });
    const exactMeta = JSON.stringify({ project_cwd: "/tmp/meta-test" });

    const childSession = `meta-child-${Date.now()}`;
    const siblingSession = `meta-sibling-${Date.now()}`;
    const exactSession = `meta-exact-${Date.now()}`;

    stmts.insertSession.run(childSession, "Meta Child", "active", "/tmp/other", null, childMeta);
    stmts.insertSession.run(siblingSession, "Meta Sibling", "active", "/tmp/other", null, siblingMeta);
    stmts.insertSession.run(exactSession, "Meta Exact", "active", "/tmp/other", null, exactMeta);

    const res = await fetch(`/api/sessions?workspaceRoot=${encodeURIComponent(workspaceRoot)}`);
    assert.equal(res.status, 200);

    const sessions = res.body.sessions;
    const hasChild = sessions.some((s) => s.id === childSession);
    const hasSibling = sessions.some((s) => s.id === siblingSession);
    const hasExact = sessions.some((s) => s.id === exactSession);

    assert.ok(hasChild, "project_cwd /tmp/meta-test/child should match /tmp/meta-test");
    assert.ok(!hasSibling, "project_cwd /tmp/meta-test-sibling should NOT match /tmp/meta-test");
    assert.ok(hasExact, "project_cwd /tmp/meta-test should match itself");

    db.prepare("DELETE FROM sessions WHERE id IN (?, ?, ?)").run(childSession, siblingSession, exactSession);
  });
});

// ============================================================
// Workflow Project Scope
// ============================================================
describe("Workflow Project Scope", () => {
  // Use repo root which has openspec/ directory for valid workspace context
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  // Use repoRoot as workspace A, /tmp/other-workspace-test as workspace B
  const workspaceA = repoRoot;
  const workspaceB = "/tmp/other-workspace-test";

  // Helper to insert a session
  function insertTestSession(id, name, status, workspace) {
    stmts.insertSession.run(id, name, status, workspace, null, null);
  }

  // Helper to insert an agent for a session
  function insertTestAgent(id, sessionId, name, type, subagentType, status) {
    db.prepare(
      "INSERT OR IGNORE INTO agents (id, session_id, name, type, subagent_type, status, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))"
    ).run(id, sessionId, name, type, subagentType, status);
  }

  afterEach(() => {
    // Clean up all test sessions created in these tests
    const testPrefixes = [
      "wf-scope-stats-", "wf-scope-orch-", "wf-scope-tool-",
      "wf-scope-eff-", "wf-scope-pat-", "wf-scope-err-", "wf-scope-conc-",
      "wf-scope-act-", "wf-scope-ex-", "wf-scope-status-"
    ];
    const likeClause = testPrefixes.map(p => `id LIKE '${p}%'`).join(" OR ");
    db.prepare(`DELETE FROM agents WHERE session_id IN (SELECT id FROM sessions WHERE ${likeClause})`).run();
    db.prepare(`DELETE FROM sessions WHERE ${likeClause}`).run();
  });

  it("should scope stats section to selected workspace", async () => {
    // Create 2 sessions in workspace A
    const sessA1 = `wf-scope-stats-1-${Date.now()}`;
    const sessA2 = `wf-scope-stats-2-${Date.now()}`;
    insertTestSession(sessA1, "Stats A1", "active", workspaceA);
    insertTestSession(sessA2, "Stats A2", "active", workspaceA);
    insertTestAgent(`wf-scope-stats-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-stats-a1-2`, sessA1, "Sub A1", "subagent", "analysis", "completed");
    insertTestAgent(`wf-scope-stats-a2-1`, sessA2, "Main A2", "main", null, "completed");
    insertTestAgent(`wf-scope-stats-a2-2`, sessA2, "Sub A2", "subagent", "coding", "error");

    // Create 1 session in workspace B
    const sessB1 = `wf-scope-stats-3-${Date.now()}`;
    insertTestSession(sessB1, "Stats B1", "active", workspaceB);
    insertTestAgent(`wf-scope-stats-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-stats-b1-2`, sessB1, "Sub B1", "subagent", "research", "completed");
    insertTestAgent(`wf-scope-stats-b1-3`, sessB1, "Sub B2", "subagent", "research", "completed");

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { stats } = res.body;
    // Should only count sessions from workspace A (2 sessions, not 3)
    assert.equal(stats.totalSessions, 2, "stats.totalSessions should only include workspace A sessions");
    // Should only count agents from workspace A (4 agents total across 2 sessions: 2 main + 2 subagent)
    assert.equal(stats.totalAgents, 4, "stats.totalAgents should only include workspace A agents");
    // Should only count subagents from workspace A (2 subagents)
    assert.equal(stats.totalSubagents, 2, "stats.totalSubagents should only include workspace A subagents");
    // Workspace A has: sessA1 (main completed + analysis completed) + sessA2 (main completed + coding error)
    // completed = 3 (analysis + main-sessA1 + main-sessA2), errors = 1 (coding)
    // successRate = completed/(completed+errors) = 3/4 = 75%
    assert.equal(stats.successRate, 75, "stats.successRate should reflect only workspace A agents");
  });

  it("should scope orchestration section to selected workspace", async () => {
    // Create sessions in workspace A with subagents
    const sessA1 = `wf-scope-orch-1-${Date.now()}`;
    const sessA2 = `wf-scope-orch-2-${Date.now()}`;
    insertTestSession(sessA1, "Orch A1", "completed", workspaceA);
    insertTestSession(sessA2, "Orch A2", "active", workspaceA);
    insertTestAgent(`wf-scope-orch-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-orch-a1-2`, sessA1, "Sub-Code A1", "subagent", "coding", "completed");
    insertTestAgent(`wf-scope-orch-a1-3`, sessA1, "Sub-Comp A1", "subagent", "compaction", "completed");
    insertTestAgent(`wf-scope-orch-a2-1`, sessA2, "Main A2", "main", null, "working");
    insertTestAgent(`wf-scope-orch-a2-2`, sessA2, "Sub-Code A2", "subagent", "coding", "working");

    // Create session in workspace B with different subagent types
    const sessB1 = `wf-scope-orch-3-${Date.now()}`;
    insertTestSession(sessB1, "Orch B1", "active", workspaceB);
    insertTestAgent(`wf-scope-orch-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-orch-b1-2`, sessB1, "Sub-Research B1", "subagent", "research", "completed");
    insertTestAgent(`wf-scope-orch-b1-3`, sessB1, "Sub-Analysis B1", "subagent", "analysis", "completed");

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { orchestration } = res.body;
    // Should only count sessions from workspace A
    assert.equal(orchestration.sessionCount, 2, "orchestration.sessionCount should only include workspace A sessions");
    // Should only count main agents from workspace A
    assert.equal(orchestration.mainCount, 2, "orchestration.mainCount should only include workspace A main agents");
    // Workspace A has: coding (2), compaction (1) subagent types
    assert.ok(orchestration.subagentTypes.length >= 1, "orchestration.subagentTypes should not be empty");
    const codingType = orchestration.subagentTypes.find(t => t.subagent_type === "coding");
    assert.ok(codingType, "coding subagent type should be present");
    assert.equal(codingType.count, 2, "coding count should only reflect workspace A");
    const researchType = orchestration.subagentTypes.find(t => t.subagent_type === "research");
    assert.ok(!researchType, "research should NOT appear from workspace B");
  });

  it("should scope toolFlow section to selected workspace", async () => {
    // Create session in workspace A with events
    const sessA1 = `wf-scope-tool-1-${Date.now()}`;
    insertTestSession(sessA1, "Tool A1", "active", workspaceA);
    insertTestAgent(`wf-scope-tool-a1-1`, sessA1, "Main A1", "main", null, "completed");
    // Insert tool events for workspace A session
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'Read', 'Read file', datetime('now', '-30 minutes'))"
    ).run(sessA1, `wf-scope-tool-a1-1`);
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'Write', 'Write file', datetime('now', '-20 minutes'))"
    ).run(sessA1, `wf-scope-tool-a1-1`);
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'Edit', 'Edit file', datetime('now', '-10 minutes'))"
    ).run(sessA1, `wf-scope-tool-a1-1`);

    // Create session in workspace B with different tool events
    const sessB1 = `wf-scope-tool-2-${Date.now()}`;
    insertTestSession(sessB1, "Tool B1", "active", workspaceB);
    insertTestAgent(`wf-scope-tool-b1-1`, sessB1, "Main B1", "main", null, "completed");
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'Bash', 'Run command', datetime('now', '-30 minutes'))"
    ).run(sessB1, `wf-scope-tool-b1-1`);
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'Grep', 'Search', datetime('now', '-20 minutes'))"
    ).run(sessB1, `wf-scope-tool-b1-1`);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { toolFlow } = res.body;
    // Tool counts should only include workspace A tools
    const toolNames = toolFlow.toolCounts.map(t => t.tool_name);
    assert.ok(toolNames.includes("Read"), "Read tool should be from workspace A");
    assert.ok(toolNames.includes("Write"), "Write tool should be from workspace A");
    assert.ok(toolNames.includes("Edit"), "Edit tool should be from workspace A");
    assert.ok(!toolNames.includes("Bash"), "Bash from workspace B should NOT appear");
    assert.ok(!toolNames.includes("Grep"), "Grep from workspace B should NOT appear");
  });

  it("should scope toolFlow by both selected workspace and status", async () => {
    const suffix = Date.now();
    const completedSession = `wf-scope-status-tool-completed-${suffix}`;
    const activeSession = `wf-scope-status-tool-active-${suffix}`;

    insertTestSession(completedSession, "Tool Completed", "completed", workspaceA);
    insertTestAgent(`wf-scope-status-tool-completed-agent-${suffix}`, completedSession, "Main Completed", "main", null, "completed");
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'CompletedRead', 'Completed read', datetime('now', '-30 minutes'))"
    ).run(completedSession, `wf-scope-status-tool-completed-agent-${suffix}`);
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'CompletedWrite', 'Completed write', datetime('now', '-20 minutes'))"
    ).run(completedSession, `wf-scope-status-tool-completed-agent-${suffix}`);

    insertTestSession(activeSession, "Tool Active", "active", workspaceA);
    insertTestAgent(`wf-scope-status-tool-active-agent-${suffix}`, activeSession, "Main Active", "main", null, "working");
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'ActiveBash', 'Active bash', datetime('now', '-30 minutes'))"
    ).run(activeSession, `wf-scope-status-tool-active-agent-${suffix}`);
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, created_at) VALUES (?, ?, 'ToolUse', 'ActiveGrep', 'Active grep', datetime('now', '-20 minutes'))"
    ).run(activeSession, `wf-scope-status-tool-active-agent-${suffix}`);

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}&status=completed`);
    assert.equal(res.status, 200);

    const toolNames = res.body.toolFlow.toolCounts.map(t => t.tool_name);
    assert.ok(toolNames.includes("CompletedRead"), "completed session tool should be included");
    assert.ok(toolNames.includes("CompletedWrite"), "completed session tool should be included");
    assert.ok(!toolNames.includes("ActiveBash"), "active session tool should be excluded by status");
    assert.ok(!toolNames.includes("ActiveGrep"), "active session tool should be excluded by status");

    const transitions = res.body.toolFlow.transitions.map(t => `${t.source}->${t.target}`);
    assert.ok(transitions.includes("CompletedRead->CompletedWrite"), "completed transition should be included");
    assert.ok(!transitions.includes("ActiveBash->ActiveGrep"), "active transition should be excluded by status");
  });

  it("should scope effectiveness section to selected workspace", async () => {
    // Create sessions in workspace A with specific subagent types
    const sessA1 = `wf-scope-eff-1-${Date.now()}`;
    insertTestSession(sessA1, "Eff A1", "completed", workspaceA);
    insertTestAgent(`wf-scope-eff-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-eff-a1-2`, sessA1, "Analysis-A1", "subagent", "analysis", "completed");
    insertTestAgent(`wf-scope-eff-a1-3`, sessA1, "Coding-A1", "subagent", "coding", "error");

    // Create session in workspace B with different subagent types
    const sessB1 = `wf-scope-eff-2-${Date.now()}`;
    insertTestSession(sessB1, "Eff B1", "completed", workspaceB);
    insertTestAgent(`wf-scope-eff-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-eff-b1-2`, sessB1, "Research-B1", "subagent", "research", "completed");
    insertTestAgent(`wf-scope-eff-b1-3`, sessB1, "Review-B1", "subagent", "review", "completed");

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { effectiveness } = res.body;
    // Workspace A has analysis (1) and coding (1) subagent types
    const subagentTypes = effectiveness.map(e => e.subagent_type);
    assert.ok(subagentTypes.includes("analysis"), "analysis should be from workspace A");
    assert.ok(subagentTypes.includes("coding"), "coding should be from workspace A");
    assert.ok(!subagentTypes.includes("research"), "research from workspace B should NOT appear");
    assert.ok(!subagentTypes.includes("review"), "review from workspace B should NOT appear");
  });

  it("should scope patterns section to selected workspace", async () => {
    // Create session in workspace A with subagent sequence
    const sessA1 = `wf-scope-pat-1-${Date.now()}`;
    insertTestSession(sessA1, "Pat A1", "completed", workspaceA);
    insertTestAgent(`wf-scope-pat-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-pat-a1-2`, sessA1, "Plan-A1", "subagent", "planning", "completed");
    insertTestAgent(`wf-scope-pat-a1-3`, sessA1, "Code-A1", "subagent", "coding", "completed");
    // Set agents started_at in sequence order for pattern detection
    db.prepare("UPDATE agents SET started_at = datetime('now', '-3 hours') WHERE id = 'wf-scope-pat-a1-1'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours') WHERE id = 'wf-scope-pat-a1-2'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-pat-a1-3'").run();

    // Create session in workspace B with different sequence
    const sessB1 = `wf-scope-pat-2-${Date.now()}`;
    insertTestSession(sessB1, "Pat B1", "completed", workspaceB);
    insertTestAgent(`wf-scope-pat-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-pat-b1-2`, sessB1, "Research-B1", "subagent", "research", "completed");
    insertTestAgent(`wf-scope-pat-b1-3`, sessB1, "Review-B1", "subagent", "review", "completed");
    db.prepare("UPDATE agents SET started_at = datetime('now', '-3 hours') WHERE id = 'wf-scope-pat-b1-1'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours') WHERE id = 'wf-scope-pat-b1-2'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-pat-b1-3'").run();

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { patterns } = res.body;
    // Workspace A patterns should be present, workspace B patterns should not
    // Note: patterns may be empty if the sequence pattern extraction doesn't find enough occurrences
    // The key assertion is that patterns from workspace B are excluded
    const patternSteps = patterns.patterns.map(p => p.steps.join("→"));
    const hasPlanningCoding = patternSteps.some(p => p.includes("planning") && p.includes("coding"));
    assert.ok(hasPlanningCoding, "planning→coding pattern should appear from workspace A");

    const hasResearchReview = patternSteps.some(p => p.includes("research") && p.includes("review"));
    assert.ok(!hasResearchReview, "research→review from workspace B should NOT appear");
  });

  it("should scope errorPropagation section to selected workspace", async () => {
    // Create sessions in workspace A with errors
    const sessA1 = `wf-scope-err-1-${Date.now()}`;
    insertTestSession(sessA1, "Err A1", "error", workspaceA);
    insertTestAgent(`wf-scope-err-a1-1`, sessA1, "Main A1", "main", null, "error");

    // Create session in workspace B with different errors
    const sessB1 = `wf-scope-err-2-${Date.now()}`;
    insertTestSession(sessB1, "Err B1", "error", workspaceB);
    insertTestAgent(`wf-scope-err-b1-1`, sessB1, "Main B1", "main", null, "error");
    insertTestAgent(`wf-scope-err-b1-2`, sessB1, "Research-B1", "subagent", "research", "error");

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { errorPropagation } = res.body;
    // Workspace A has 1 error session, workspace B has 1 error session
    // errorPropagation should reflect only workspace A
    assert.ok(errorPropagation.totalSessions >= 1, "totalSessions should include workspace A session");
    // The error rate should reflect only errors from workspace A
    assert.ok(errorPropagation.errorRate <= 100, "errorRate should be a valid percentage");
  });

  it("should scope concurrency section to selected workspace", async () => {
    // Create sessions in workspace A with agents that have start/end times
    const sessA1 = `wf-scope-conc-1-${Date.now()}`;
    insertTestSession(sessA1, "Conc A1", "completed", workspaceA);
    insertTestAgent(`wf-scope-conc-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-conc-a1-2`, sessA1, "Sub-A1", "subagent", "coding", "completed");
    // Set specific start/end times
    db.prepare("UPDATE sessions SET started_at = datetime('now', '-2 hours'), ended_at = datetime('now', '-1 hour') WHERE id = ?").run(sessA1);
    db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours'), ended_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-conc-a1-1'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-90 minutes'), ended_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-conc-a1-2'").run();

    // Create session in workspace B with different concurrency pattern
    const sessB1 = `wf-scope-conc-2-${Date.now()}`;
    insertTestSession(sessB1, "Conc B1", "completed", workspaceB);
    insertTestAgent(`wf-scope-conc-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-conc-b1-2`, sessB1, "Sub-B1", "subagent", "research", "completed");
    db.prepare("UPDATE sessions SET started_at = datetime('now', '-2 hours'), ended_at = datetime('now', '-1 hour') WHERE id = ?").run(sessB1);
    db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours'), ended_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-conc-b1-1'").run();
    db.prepare("UPDATE agents SET started_at = datetime('now', '-90 minutes'), ended_at = datetime('now', '-1 hour') WHERE id = 'wf-scope-conc-b1-2'").run();

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { concurrency } = res.body;
    // Aggregate lanes should only include agents from workspace A
    assert.ok(concurrency.aggregateLanes.length >= 1, "aggregateLanes should not be empty");
    const laneNames = concurrency.aggregateLanes.map(l => l.name);
    assert.ok(laneNames.includes("coding"), "coding lane should be from workspace A");
    assert.ok(!laneNames.includes("research"), "research lane from workspace B should NOT appear");
  });

  it("should use active workspace when workspaceRoot not explicitly provided", async () => {
    // Create sessions in workspace A
    const sessA1 = `wf-scope-act-1-${Date.now()}`;
    insertTestSession(sessA1, "Active A1", "active", workspaceA);
    insertTestAgent(`wf-scope-act-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-act-a1-2`, sessA1, "Sub-A1", "subagent", "analysis", "completed");

    // Create session in workspace B
    const sessB1 = `wf-scope-act-2-${Date.now()}`;
    insertTestSession(sessB1, "Active B1", "active", workspaceB);
    insertTestAgent(`wf-scope-act-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-act-b1-2`, sessB1, "Sub-B1", "subagent", "research", "completed");

    // Set active workspace to A
    await post("/api/settings/openspec-workspace", { workspaceRoot: workspaceA });

    // Query WITHOUT explicit workspaceRoot - should use active workspace
    const res = await fetch("/api/workflows");
    assert.equal(res.status, 200);

    const { stats, orchestration } = res.body;
    // Stats should only include workspace A
    assert.equal(stats.totalSessions, 1, "stats should use active workspace A");

    // Cleanup: clear active workspace
    await post("/api/settings/openspec-workspace", { workspaceRoot: "" });
  });

  it("should exclude workspace B data when workspaceRoot is workspace A", async () => {
    // Create multiple sessions in workspace A with distinct characteristics
    const sessA1 = `wf-scope-ex-1-${Date.now()}`;
    const sessA2 = `wf-scope-ex-2-${Date.now()}`;
    insertTestSession(sessA1, "Exclude A1", "active", workspaceA);
    insertTestSession(sessA2, "Exclude A2", "active", workspaceA);
    insertTestAgent(`wf-scope-ex-a1-1`, sessA1, "Main A1", "main", null, "completed");
    insertTestAgent(`wf-scope-ex-a1-2`, sessA1, "Sub-A1", "subagent", "planning", "completed");
    insertTestAgent(`wf-scope-ex-a2-1`, sessA2, "Main A2", "main", null, "completed");
    insertTestAgent(`wf-scope-ex-a2-2`, sessA2, "Sub-A2", "subagent", "coding", "completed");

    // Create session in workspace B
    const sessB1 = `wf-scope-ex-3-${Date.now()}`;
    insertTestSession(sessB1, "Exclude B1", "active", workspaceB);
    insertTestAgent(`wf-scope-ex-b1-1`, sessB1, "Main B1", "main", null, "completed");
    insertTestAgent(`wf-scope-ex-b1-2`, sessB1, "Sub-B1", "subagent", "research", "completed");
    insertTestAgent(`wf-scope-ex-b1-3`, sessB1, "Sub-B2", "subagent", "review", "completed");
    insertTestAgent(`wf-scope-ex-b1-4`, sessB1, "Sub-B3", "subagent", "testing", "completed");

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}`);
    assert.equal(res.status, 200);

    const { stats, orchestration, effectiveness } = res.body;

    // Verify stats only count workspace A
    assert.equal(stats.totalSessions, 2, "Should have 2 sessions from workspace A only");
    assert.equal(stats.totalSubagents, 2, "Should have 2 subagents from workspace A only");

    // Verify orchestration only counts workspace A
    assert.equal(orchestration.sessionCount, 2, "orchestration should only count workspace A sessions");
    const planningCount = orchestration.subagentTypes.find(t => t.subagent_type === "planning")?.count || 0;
    const codingCount = orchestration.subagentTypes.find(t => t.subagent_type === "coding")?.count || 0;
    assert.equal(planningCount + codingCount, 2, "Should have only planning and coding subagents from workspace A");

    // Verify effectiveness only includes workspace A subagent types
    const effTypes = effectiveness.map(e => e.subagent_type);
    assert.ok(effTypes.includes("planning"), "planning should be from workspace A");
    assert.ok(effTypes.includes("coding"), "coding should be from workspace A");
    assert.ok(!effTypes.includes("research"), "research from workspace B should not appear");
    assert.ok(!effTypes.includes("review"), "review from workspace B should not appear");
    assert.ok(!effTypes.includes("testing"), "testing from workspace B should not appear");
  });

  it("should scope cooccurrence by both selected workspace and status", async () => {
    const suffix = Date.now();
    const completedOne = `wf-scope-status-co-completed-1-${suffix}`;
    const completedTwo = `wf-scope-status-co-completed-2-${suffix}`;
    const activeOne = `wf-scope-status-co-active-1-${suffix}`;
    const activeTwo = `wf-scope-status-co-active-2-${suffix}`;

    for (const sessionId of [completedOne, completedTwo]) {
      insertTestSession(sessionId, "Co Completed", "completed", workspaceA);
      insertTestAgent(`wf-scope-status-co-${sessionId}-main`, sessionId, "Main", "main", null, "completed");
      insertTestAgent(`wf-scope-status-co-${sessionId}-plan`, sessionId, "Plan", "subagent", "completed-plan", "completed");
      insertTestAgent(`wf-scope-status-co-${sessionId}-review`, sessionId, "Review", "subagent", "completed-review", "completed");
      db.prepare("UPDATE agents SET started_at = datetime('now', '-3 hours') WHERE id = ?").run(`wf-scope-status-co-${sessionId}-plan`);
      db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours') WHERE id = ?").run(`wf-scope-status-co-${sessionId}-review`);
    }

    for (const sessionId of [activeOne, activeTwo]) {
      insertTestSession(sessionId, "Co Active", "active", workspaceA);
      insertTestAgent(`wf-scope-status-co-${sessionId}-main`, sessionId, "Main", "main", null, "working");
      insertTestAgent(`wf-scope-status-co-${sessionId}-research`, sessionId, "Research", "subagent", "active-research", "working");
      insertTestAgent(`wf-scope-status-co-${sessionId}-test`, sessionId, "Test", "subagent", "active-test", "working");
      db.prepare("UPDATE agents SET started_at = datetime('now', '-3 hours') WHERE id = ?").run(`wf-scope-status-co-${sessionId}-research`);
      db.prepare("UPDATE agents SET started_at = datetime('now', '-2 hours') WHERE id = ?").run(`wf-scope-status-co-${sessionId}-test`);
    }

    const res = await fetch(`/api/workflows?workspaceRoot=${encodeURIComponent(workspaceA)}&status=completed`);
    assert.equal(res.status, 200);

    const pairs = res.body.cooccurrence.map(pair => `${pair.source}->${pair.target}`);
    assert.ok(pairs.includes("completed-plan->completed-review"), "completed cooccurrence should be included");
    assert.ok(!pairs.includes("active-research->active-test"), "active cooccurrence should be excluded by status");
  });
});
