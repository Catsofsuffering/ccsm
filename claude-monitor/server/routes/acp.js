/**
 * @file Express router for ACP (Agent Communication Protocol) event ingestion.
 * Accepts ACP event payloads, normalizes them into the monitor's internal model,
 * deduplicates against hook observations, persists to the database, and broadcasts
 * via WebSocket. Designed to be mounted at /api/acp.
 */

var Router = require("express").Router;
var stmts = require("../db").stmts;
var db = require("../db").db;
var broadcast = require("../websocket").broadcast;
var normalizeAcpEvent = require("../lib/acp-normalizer").normalizeAcpEvent;
var buildDedupeFingerprint = require("../lib/acp-dedupe").buildDedupeFingerprint;
var isDuplicateEvent = require("../lib/acp-dedupe").isDuplicateEvent;
var isDuplicateOutput = require("../lib/acp-dedupe").isDuplicateOutput;

var router = Router();

function ensureMainAgent(sessionId, sessionName) {
  var mainAgentId = sessionId + "-main";
  var mainAgent = stmts.getAgent.get(mainAgentId);
  if (!mainAgent) {
    var sessionLabel = sessionName || (sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId);
    stmts.insertAgent.run(
      mainAgentId,
      sessionId,
      "Main Agent \u2014 " + sessionLabel,
      "main",
      null,
      "connected",
      null,
      null,
      null
    );
    mainAgent = stmts.getAgent.get(mainAgentId);
    broadcast("agent_created", mainAgent);
  }
  return mainAgent;
}

/**
 * POST /event
 *
 * Accept an ACP event payload, normalize it, persist to DB, and broadcast.
 *
 * Request body: ACP event payload (see acp-normalizer.js for supported shapes)
 * Response: { ok: true, eventId: number } or { ok: true, duplicate: true }
 */
router.post("/event", function (req, res) {
  var payload = req.body;

  // Validate the incoming payload is present and is an object
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({
      error: {
        code: "INVALID_INPUT",
        message: "ACP event payload is required and must be an object",
      },
    });
  }

  // Require session_id
  var sessionId = payload.session_id || payload.sessionId;
  if (!sessionId) {
    return res.status(400).json({
      error: {
        code: "MISSING_SESSION",
        message: "session_id is required in ACP event payload",
      },
    });
  }

  // Normalize the ACP event
  var normalized = normalizeAcpEvent(payload);
  if (!normalized) {
    return res.status(400).json({
      error: {
        code: "NORMALIZATION_FAILED",
        message: "Could not normalize ACP event payload",
      },
    });
  }

  // ---------- Diagnostic / unsupported payload ----------
  if (normalized.type === "unsupported" || (normalized.data && normalized.data.diagnostic)) {
    // Ensure a session record exists so the diagnostic event has a home
    var diagSession = stmts.getSession.get(sessionId);
    if (!diagSession) {
      try {
        stmts.insertSession.run(
          sessionId,
          "ACP Session " + (sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId),
          "active",
          null,
          null,
          null
        );
        diagSession = stmts.getSession.get(sessionId);
        broadcast("session_created", diagSession);
      } catch (_insertErr) {
        // Session may already exist from a concurrent insert — that's fine
      }
    }

    // Insert the diagnostic event
    var diagPayload = normalized.data || {};
    var diagResult = stmts.insertEvent.run(
      sessionId,
      null,
      normalized.eventType || "acp_diagnostic",
      null,
      normalized.summary || "ACP diagnostic",
      JSON.stringify(diagPayload)
    );

    broadcast("new_event", {
      session_id: sessionId,
      agent_id: null,
      event_type: normalized.eventType || "acp_diagnostic",
      tool_name: null,
      summary: normalized.summary || "ACP diagnostic",
      created_at: new Date().toISOString(),
    });

    return res.json({
      ok: true,
      eventId: Number(diagResult.lastInsertRowid),
      diagnostic: true,
    });
  }

  // ---------- Normal event path ----------
  var normType = normalized.type;
  var agentId = normalized.agentId;
  var eventType = normalized.eventType;
  var summary = normalized.summary;
  var eventData = normalized.data;

  // ------ Ensure session exists ------
  var session = stmts.getSession.get(sessionId);
  if (!session) {
    var sessionName = "ACP Session " + (sessionId.length > 8 ? sessionId.slice(0, 8) : sessionId);
    var cwd = payload.cwd || payload.project_cwd || null;
    var model = payload.model || payload.model_name || null;
    stmts.insertSession.run(sessionId, sessionName, "active", cwd, model, null);
    session = stmts.getSession.get(sessionId);
    broadcast("session_created", session);
  }

  // ------ Deduplication ------
  var fingerprint = buildDedupeFingerprint(normalized);

  // Attach fingerprint to the stored event data
  var storedData = {};
  var dataKeys = Object.keys(eventData || {});
  for (var dk = 0; dk < dataKeys.length; dk++) {
    storedData[dataKeys[dk]] = eventData[dataKeys[dk]];
  }
  if (fingerprint) {
    storedData.fingerprint = fingerprint;
  }

  // Check fingerprint-based dedup
  if (fingerprint && isDuplicateEvent(db, fingerprint)) {
    return res.json({
      ok: true,
      eventId: null,
      duplicate: true,
      session_id: sessionId,
      agent_id: agentId,
      event_type: eventType,
    });
  }

  // Check output-text dedup for output events
  if (normType === "output") {
    var outputText =
      payload.message || payload.output || payload.text ||
      (payload.data && (payload.data.message || payload.data.output || payload.data.text)) ||
      "";
    if (outputText && isDuplicateOutput(db, outputText)) {
      return res.json({
        ok: true,
        eventId: null,
        duplicate: true,
        session_id: sessionId,
        agent_id: agentId,
        event_type: eventType,
      });
    }
  }

  // ------ Session lifecycle handling ------
  switch (normType) {
    case "session_start": {
      // Ensure session is active (may have been imported as completed)
      if (session && session.status !== "active") {
        stmts.reactivateSession.run(sessionId);
        session = stmts.getSession.get(sessionId);
        broadcast("session_updated", session);
      }

      // Create main agent for the session if not present
      ensureMainAgent(sessionId, session.name);
      break;
    }

    case "session_end": {
      var now = new Date().toISOString();
      // Complete all agents still active
      var allAgents = stmts.listAgentsBySession.all(sessionId);
      for (var ai = 0; ai < allAgents.length; ai++) {
        var agent = allAgents[ai];
        if (agent.status !== "completed" && agent.status !== "error") {
          stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
          broadcast("agent_updated", stmts.getAgent.get(agent.id));
        }
      }
      stmts.updateSession.run(null, "completed", now, null, sessionId);
      broadcast("session_updated", stmts.getSession.get(sessionId));
      break;
    }

    case "agent_start": {
      if (!agentId) break;

      var agentRecord = stmts.getAgent.get(agentId);
      var agentName = payload.agent_name || payload.agent_name_hint || payload.agent_type || "ACP Agent";
      var agentType = payload.subagent_type ? "subagent" : (payload.agent_type ? "subagent" : "main");
      var parentAgentId = null;
      if (agentType === "subagent") {
        ensureMainAgent(sessionId, session.name);
        parentAgentId = payload.parent_agent_id || (sessionId + "-main");
      }

      if (!agentRecord) {
        stmts.insertAgent.run(
          agentId,
          sessionId,
          agentName,
          agentType,
          payload.subagent_type || null,
          "working",
          payload.task || payload.prompt || null,
          parentAgentId,
          payload.metadata ? JSON.stringify(payload.metadata) : null
        );
        broadcast("agent_created", stmts.getAgent.get(agentId));
      } else if (agentRecord.status !== "working") {
        stmts.updateAgent.run(
          null, "working", null,
          payload.tool || payload.current_tool || null,
          null, null,
          agentId
        );
        broadcast("agent_updated", stmts.getAgent.get(agentId));
      }
      break;
    }

    case "agent_stop": {
      if (agentId) {
        var stopRecord = stmts.getAgent.get(agentId);
        if (stopRecord && stopRecord.status !== "completed" && stopRecord.status !== "error") {
          stmts.updateAgent.run(null, "completed", null, null, new Date().toISOString(), null, agentId);
          broadcast("agent_updated", stmts.getAgent.get(agentId));
        }
      }
      break;
    }

    case "tool_use": {
      var toolName = payload.tool_name || payload.tool || payload.toolName || null;

      // If an agent is specified and not already working, mark it as working
      if (agentId) {
        var toolAgent = stmts.getAgent.get(agentId);
        if (toolAgent && toolAgent.status !== "working") {
          stmts.updateAgent.run(null, "working", null, toolName, null, null, agentId);
          broadcast("agent_updated", stmts.getAgent.get(agentId));
        }
      }
      break;
    }

    case "output":
      // No extra state changes — just records the output event
      break;

    case "model_info":
      // Update session model metadata if a model was provided
      if (payload.model || payload.model_name) {
        var modelToStore = payload.model || payload.model_name;
        stmts.updateSessionModel.run(modelToStore, sessionId);
        broadcast("session_updated", stmts.getSession.get(sessionId));
      }
      break;

    default:
      break;
  }

  // ------ Persist event ------
  var toolNameValue = normType === "tool_use" ? (payload.tool_name || payload.tool || payload.toolName || null) : null;

  var insertResult = stmts.insertEvent.run(
    sessionId,
    agentId,
    eventType,
    toolNameValue,
    summary,
    JSON.stringify(storedData)
  );

  // Touch session timestamp
  stmts.touchSession.run(sessionId);

  // ------ Broadcast ------
  broadcast("new_event", {
    session_id: sessionId,
    agent_id: agentId,
    event_type: eventType,
    tool_name: toolNameValue,
    summary: summary,
    created_at: new Date().toISOString(),
  });

  // ------ Respond ------
  res.json({
    ok: true,
    eventId: Number(insertResult.lastInsertRowid),
  });
});

module.exports = router;
