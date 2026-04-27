/**
 * @file Express router for handling incoming hook events from Claude CLI and Claude Agent Teams.
 * Processes various hook types (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart,
 * SessionEnd, Notification), updates session and agent states accordingly in the database,
 * extracts token usage from transcripts, detects compaction events, normalizes Agent Teams
 * teammate return signals, and broadcasts updates to connected clients via WebSocket.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

const { Router } = require("express");
const { v4: uuidv4 } = require("uuid");
const { stmts, db } = require("../db");
const { broadcast } = require("../websocket");
const TranscriptCache = require("../lib/transcript-cache");
const {
  normalizeAgentTeamsPayload,
  associateAgent,
  buildTeamReturnSummary,
} = require("../lib/agent-teams-normalizer");

const router = Router();

// Shared cache instance — reused by periodic compaction scanner via router.transcriptCache
const transcriptCache = new TranscriptCache();

/**
 * Deduplicate event insertion by checking if a semantically equivalent event
 * already exists for the same session, agent, type, and summary within a small
 * time window. Prevents duplicate entries when the same teammate return is
 * observed through both hook payload and transcript processing.
 */
function isDuplicateEvent(sessionId, agentId, eventType, summary) {
  if (!sessionId || !agentId) return false;
  // Check for an existing event with the same signature inserted within the last 30 seconds
  const existing = db
    .prepare(
      `SELECT 1 FROM events
       WHERE session_id = ? AND agent_id = ? AND event_type = ? AND summary = ?
         AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 seconds')
       LIMIT 1`
    )
    .get(sessionId, agentId, eventType, summary);
  return !!existing;
}

function normalizeReturnText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function extractReturnText(eventData) {
  if (!eventData || typeof eventData !== "object") return "";
  return normalizeReturnText(
    eventData.messageText ||
      eventData.output ||
      eventData.message ||
      eventData.raw?.messageText ||
      eventData.raw?.tool_input?.message ||
      eventData.raw?.tool_response?.message ||
      ""
  );
}

function isDuplicateReturnOutput(sessionId, agentId, eventData) {
  const returnText = extractReturnText(eventData);
  if (!sessionId || !agentId || !returnText) return false;

  const existing = db
    .prepare(
      `SELECT data FROM events
       WHERE session_id = ? AND agent_id = ? AND event_type = 'TeamReturn'
         AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 seconds')`
    )
    .all(sessionId, agentId);

  return existing.some((event) => {
    try {
      return extractReturnText(JSON.parse(event.data)) === returnText;
    } catch {
      return false;
    }
  });
}

function buildStructuredReturnData(normalized, source) {
  return {
    sender: normalized.sender,
    recipient: normalized.recipient,
    teamName: normalized.teamName,
    taskId: normalized.taskId,
    agentType: normalized.agentType,
    messageText: normalized.messageText,
    source,
    raw: normalized.rawSource,
  };
}

function ensureSession(sessionId, data) {
  let session = stmts.getSession.get(sessionId);
  if (!session) {
    // Use project_cwd (used by Agent Teams hooks) as fallback for session cwd
    const sessionCwd = data.cwd || data.project_cwd || null;
    const initialMetadata = data.project_cwd
      ? JSON.stringify({ project_cwd: data.project_cwd })
      : null;
    stmts.insertSession.run(
      sessionId,
      data.session_name || `Session ${sessionId.slice(0, 8)}`,
      "active",
      sessionCwd,
      data.model || null,
      initialMetadata
    );
    session = stmts.getSession.get(sessionId);
    broadcast("session_created", session);

    // Create main agent for new session
    const mainAgentId = `${sessionId}-main`;
    const sessionLabel = session.name || `Session ${sessionId.slice(0, 8)}`;
    stmts.insertAgent.run(
      mainAgentId,
      sessionId,
      `Main Agent — ${sessionLabel}`,
      "main",
      null,
      "connected",
      null,
      null,
      null
    );
    broadcast("agent_created", stmts.getAgent.get(mainAgentId));
  }

  // For existing sessions, store project_cwd in metadata if present (Agent Teams events)
  // Also store run_id in dedicated column for deterministic CCSM run-to-session correlation.
  if ((data.project_cwd || data.run_id) && session) {
    const meta = session.metadata ? JSON.parse(session.metadata) : {};
    let needsMetaUpdate = false;
    if (data.project_cwd && meta.project_cwd !== data.project_cwd) {
      meta.project_cwd = data.project_cwd;
      needsMetaUpdate = true;
    }
    // Persist run_id to dedicated column for deterministic lookup
    if (data.run_id && session.run_id !== data.run_id) {
      stmts.updateSessionRunId.run(data.run_id, sessionId);
      session = stmts.getSession.get(sessionId);
    }
    if (needsMetaUpdate) {
      stmts.updateSession.run(null, null, null, JSON.stringify(meta), sessionId);
      session = stmts.getSession.get(sessionId);
    }
  }

  return session;
}

function getMainAgent(sessionId) {
  return stmts.getAgent.get(`${sessionId}-main`);
}

const processEvent = db.transaction((hookType, data) => {
  const sessionId = data.session_id;
  if (!sessionId) return null;

  const session = ensureSession(sessionId, data);
  let mainAgent = getMainAgent(sessionId);
  const mainAgentId = mainAgent?.id ?? null;

  // Reactivate non-active sessions when we receive hook events proving the session is alive.
  // - Work events (PreToolUse, PostToolUse, Notification, SessionStart) always reactivate.
  // - Stop/SubagentStop reactivate only if session is completed/abandoned — this handles
  //   sessions imported as "completed" before the server started, where the first hook event
  //   might be a Stop. For error sessions, Stop should NOT reactivate (the error is intentional).
  // - SessionEnd never reactivates.
  const isNonTerminalEvent = hookType !== "SessionEnd";
  const isStopLike = hookType === "Stop" || hookType === "SubagentStop";
  const isImportedOrAbandoned = session.status === "completed" || session.status === "abandoned";
  const needsReactivation =
    session.status !== "active" && isNonTerminalEvent && (!isStopLike || isImportedOrAbandoned);
  if (needsReactivation) {
    stmts.reactivateSession.run(sessionId);
    broadcast("session_updated", stmts.getSession.get(sessionId));

    if (mainAgent && mainAgent.status !== "working" && mainAgent.status !== "connected") {
      stmts.reactivateAgent.run(mainAgentId);
      mainAgent = stmts.getAgent.get(mainAgentId);
      broadcast("agent_updated", mainAgent);
    }
  }

  let eventType = hookType;
  let toolName = data.tool_name || null;
  let summary = null;
  let agentId = mainAgentId;
  let eventData = data;

  switch (hookType) {
    case "PreToolUse": {
      summary = `Using tool: ${toolName}`;

      // If the tool is Agent, a subagent is being created
      if (toolName === "Agent") {
        const input = data.tool_input || {};
        const subId = uuidv4();
        // Use description, then type, then first line of prompt, then fallback
        const rawName =
          input.description ||
          input.subagent_type ||
          (input.prompt ? input.prompt.split("\n")[0].slice(0, 60) : null) ||
          "Subagent";
        const subName = rawName.length > 60 ? rawName.slice(0, 57) + "..." : rawName;

        // Infer which agent is spawning this subagent.
        // Hook events don't carry an explicit agent ID, so we use a heuristic:
        //   - If the main agent is actively working, it's the one spawning (common case).
        //   - If the main agent is idle/connected (waiting for user or subagent results),
        //     the spawn must come from an already-running subagent — pick the deepest
        //     working subagent (most recently nested active agent).
        //   - Fallback to main if nothing else matches.
        let parentId = mainAgentId;
        if (mainAgent && mainAgent.status !== "working") {
          const deepest = stmts.findDeepestWorkingAgent.get(sessionId, sessionId);
          if (deepest) {
            parentId = deepest.id;
          }
        }

        stmts.insertAgent.run(
          subId,
          sessionId,
          subName,
          "subagent",
          input.subagent_type || null,
          "working",
          input.prompt ? input.prompt.slice(0, 500) : null,
          parentId,
          input.metadata ? JSON.stringify(input.metadata) : null
        );
        broadcast("agent_created", stmts.getAgent.get(subId));
        agentId = subId;
        summary = `Subagent spawned: ${subName}`;
      }

      // Agent Teams: recognize SendMessage / mailbox / teammate-message tool
      // payloads and store them through the normal event path so a single
      // TeamReturn is persisted and broadcast immediately.
      const normalized = normalizeAgentTeamsPayload(hookType, data);
      if (normalized && !normalized.isLifecycleOnly) {
        const sessionAgents = stmts.listAgentsBySession.all(sessionId);
        const associatedAgentId = associateAgent(normalized, sessionAgents) || mainAgentId;
        const returnSummary =
          buildTeamReturnSummary(normalized) || `Teammate message via ${toolName}`;

        agentId = associatedAgentId;
        eventType = "TeamReturn";
        summary = returnSummary;
        eventData = buildStructuredReturnData(normalized, hookType);
      }

      // Update main agent status to "working" — but only when main is the likely
      // actor. When main is idle and working subagents exist, PreToolUse events
      // come from subagents, not main. Incorrectly promoting main to "working"
      // would break parent inference for nested agent spawning.
      //
      // Heuristic: main is idle + working subagents exist → subagent is the actor.
      //            main is connected/working/idle with no subagents → main is the actor.
      const subagentIsActor =
        mainAgent &&
        mainAgent.status === "idle" &&
        !!stmts.findDeepestWorkingAgent.get(sessionId, sessionId);
      if (
        mainAgent &&
        !subagentIsActor &&
        (mainAgent.status === "working" ||
          mainAgent.status === "connected" ||
          mainAgent.status === "idle")
      ) {
        stmts.updateAgent.run(null, "working", null, toolName, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }
      break;
    }

    case "PostToolUse": {
      summary = `Tool completed: ${toolName}`;

      // NOTE: PostToolUse for "Agent" tool fires immediately when a subagent is
      // backgrounded — it does NOT mean the subagent finished its work.
      // Subagent completion is handled by SubagentStop, not here.

      // Only clear current_tool on the main agent if it's actively working.
      // Skip if idle (waiting for subagents) or already completed.
      if (mainAgent && mainAgent.status === "working") {
        stmts.updateAgent.run(null, null, null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }

      // Agent Teams: also handle SendMessage / mailbox responses in PostToolUse.
      const normalized = normalizeAgentTeamsPayload(hookType, data);
      if (normalized && !normalized.isLifecycleOnly) {
        const sessionAgents = stmts.listAgentsBySession.all(sessionId);
        const associatedAgentId = associateAgent(normalized, sessionAgents) || mainAgentId;
        const returnSummary =
          buildTeamReturnSummary(normalized) || `Teammate message via ${toolName}`;

        agentId = associatedAgentId;
        eventType = "TeamReturn";
        summary = returnSummary;
        eventData = buildStructuredReturnData(normalized, hookType);
      }
      break;
    }

    case "Stop": {
      const session = stmts.getSession.get(sessionId);
      const sessionLabel = session?.name || `Session ${sessionId.slice(0, 8)}`;
      summary =
        data.stop_reason === "error"
          ? `Error in ${sessionLabel}`
          : `${sessionLabel} — ready for input`;

      // Stop means Claude finished its turn, NOT that the session is closed.
      // Session stays active — user can still send more messages.
      // Main agent goes to "idle" (waiting for user input).
      // Background subagents may still be running — do NOT complete them here.
      // They complete individually via SubagentStop, or all at once on SessionEnd.
      const now = new Date().toISOString();

      // Set main agent to idle (waiting for user), not completed.
      // For non-tool turns the agent may already be "idle" — still update it
      // so the timestamp and activity log reflect that a turn completed.
      if (mainAgent && mainAgent.status !== "completed" && mainAgent.status !== "error") {
        stmts.updateAgent.run(null, "idle", null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }

      // Mark error sessions on error stop_reason, but keep normal sessions active
      if (data.stop_reason === "error") {
        stmts.updateSession.run(null, "error", now, null, sessionId);
      }
      broadcast("session_updated", stmts.getSession.get(sessionId));
      break;
    }

    case "SubagentStop": {
      summary = `Subagent completed`;
      const subagents = stmts.listAgentsBySession.all(sessionId);
      let matchingSub = null;

      // Try to identify which subagent stopped using available data.
      // SubagentStop provides: agent_type (e.g. "Explore", "test-engineer"),
      // agent_id (Claude's internal ID), description, last_assistant_message.
      const subDesc = data.description || data.agent_type || data.subagent_type || null;
      if (subDesc) {
        const namePrefix = subDesc.length > 57 ? subDesc.slice(0, 57) : subDesc;
        matchingSub = subagents.find(
          (a) => a.type === "subagent" && a.status === "working" && a.name.startsWith(namePrefix)
        );
      }

      // Try matching by agent_type against stored subagent_type
      if (!matchingSub && data.agent_type) {
        matchingSub = subagents.find(
          (a) =>
            a.type === "subagent" && a.status === "working" && a.subagent_type === data.agent_type
        );
      }

      if (!matchingSub) {
        const prompt = data.prompt ? data.prompt.slice(0, 500) : null;
        if (prompt) {
          matchingSub = subagents.find(
            (a) => a.type === "subagent" && a.status === "working" && a.task === prompt
          );
        }
      }

      // Fallback: oldest working subagent
      if (!matchingSub) {
        matchingSub = subagents.find((a) => a.type === "subagent" && a.status === "working");
      }

      if (matchingSub) {
        // Collect return output from the subagent: last_assistant_message or transcript-derived output
        const returnOutput = data.last_assistant_message || null;

        stmts.updateAgent.run(
          null,
          "completed",
          null,
          null,
          new Date().toISOString(),
          null,
          matchingSub.id
        );
        broadcast("agent_updated", stmts.getAgent.get(matchingSub.id));
        agentId = matchingSub.id;
        summary = `Subagent completed: ${matchingSub.name}`;

        // If there is return output, also broadcast a team_return event immediately
        // so clients see the teammate output without waiting for session completion.
        if (returnOutput) {
          const returnSummary = `Teammate return: ${matchingSub.name} — ${returnOutput.slice(0, 120)}`;
          const returnData = {
            agent_name: matchingSub.name,
            agent_type: matchingSub.subagent_type || data.agent_type || null,
            output: returnOutput,
            source: "SubagentStop",
          };
          if (
            !isDuplicateEvent(sessionId, agentId, "TeamReturn", returnSummary) &&
            !isDuplicateReturnOutput(sessionId, agentId, returnData)
          ) {
            stmts.insertEvent.run(
              sessionId,
              agentId,
              "TeamReturn",
              null,
              returnSummary,
              JSON.stringify(returnData)
            );
            broadcast("new_event", {
              session_id: sessionId,
              agent_id: agentId,
              event_type: "TeamReturn",
              tool_name: null,
              summary: returnSummary,
              created_at: new Date().toISOString(),
            });
          }
        }

        // Session stays active — SubagentStop just means one subagent finished,
        // the session is not over until the user explicitly closes it.
      }
      break;
    }

    case "SessionStart": {
      summary = data.source === "resume" ? "Session resumed" : "Session started";
      // Reactivation is already handled above for non-active sessions.
      // Set main agent to connected (ready for work).
      if (mainAgent && mainAgent.status === "idle") {
        stmts.updateAgent.run(null, "connected", null, null, null, null, mainAgentId);
        broadcast("agent_updated", stmts.getAgent.get(mainAgentId));
      }

      // Clean up orphaned sessions: when a user runs /resume inside a session,
      // the parent session never receives Stop or SessionEnd. Mark any active
      // session with no events for 5+ minutes as abandoned.
      const staleSessions = stmts.findStaleSessions.all(sessionId, 5);
      const now = new Date().toISOString();
      for (const stale of staleSessions) {
        const staleAgents = stmts.listAgentsBySession.all(stale.id);
        for (const agent of staleAgents) {
          if (agent.status !== "completed" && agent.status !== "error") {
            stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
            broadcast("agent_updated", stmts.getAgent.get(agent.id));
          }
        }
        stmts.updateSession.run(null, "abandoned", now, null, stale.id);
        broadcast("session_updated", stmts.getSession.get(stale.id));
      }
      break;
    }

    case "SessionEnd": {
      const endSession = stmts.getSession.get(sessionId);
      const endLabel = endSession?.name || `Session ${sessionId.slice(0, 8)}`;
      summary = `Session closed: ${endLabel}`;

      // SessionEnd is the definitive signal that the CLI process exited.
      // Mark everything as completed.
      const allAgents = stmts.listAgentsBySession.all(sessionId);
      const now = new Date().toISOString();
      for (const agent of allAgents) {
        if (agent.status !== "completed" && agent.status !== "error") {
          stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
          broadcast("agent_updated", stmts.getAgent.get(agent.id));
        }
      }
      stmts.updateSession.run(null, "completed", now, null, sessionId);
      broadcast("session_updated", stmts.getSession.get(sessionId));

      break;
    }

    case "Notification": {
      const msg = data.message || "Notification received";
      // Tag compaction-related notifications so they show as Compaction events
      if (/compact|compress|context.*(reduc|truncat|summar)/i.test(msg)) {
        eventType = "Compaction";
        summary = msg;
      }
      // Detect Agent Teams mailbox/SendMessage-style return signals.
      // When a teammate sends a return packet through SendMessage or mailbox,
      // the notification message contains structured return data or output patterns.
      else if (
        /\b(teammate|team.agent|mailbox|return.*packet|agent.*return|SendMessage|SubagentStop.*output)\b/i.test(msg)
      ) {
        eventType = "TeamReturn";
        summary = msg;
        // Try to associate with a known working subagent in the session
        const sessionAgents = stmts.listAgentsBySession.all(sessionId);
        const workingSubs = sessionAgents.filter(
          (a) => a.type === "subagent" && a.status === "working"
        );
        if (workingSubs.length > 0) {
          // Associate with the deepest working subagent (most likely the sender)
          agentId = workingSubs[workingSubs.length - 1].id;
        }
      } else {
        summary = msg;
      }
      break;
    }

    default: {
      summary = `Event: ${hookType}`;
    }
  }

  // Extract token usage from transcript on every event that provides transcript_path.
  // Claude Code hooks don't include usage/model in stdin — the transcript JSONL is
  // the only reliable source. Uses replaceTokenUsage with compaction-aware logic:
  // when the JSONL total drops (compaction rewrote it), the old value rolls into
  // a baseline column so effective_total = current_jsonl + baseline. This ensures
  // tokens from before compaction are never lost.
  //
  // Also detects compaction events (isCompactSummary in JSONL) and creates a
  // Compaction agent + event so the dashboard shows when context was compressed.
  if (data.transcript_path) {
    const result = transcriptCache.extract(data.transcript_path);
    if (result) {
      const { tokensByModel, compaction } = result;

      // Register compaction agents and events.
      // Each isCompactSummary entry in the JSONL = one compaction that occurred.
      // Deduplicate by uuid so we only create once per compaction.
      if (compaction) {
        for (const entry of compaction.entries) {
          const compactId = `${sessionId}-compact-${entry.uuid}`;
          if (stmts.getAgent.get(compactId)) continue;

          const ts = entry.timestamp || new Date().toISOString();
          stmts.insertAgent.run(
            compactId,
            sessionId,
            "Context Compaction",
            "subagent",
            "compaction",
            "completed",
            "Automatic conversation context compression",
            mainAgentId,
            null
          );
          stmts.updateAgent.run(null, "completed", null, null, ts, null, compactId);
          broadcast("agent_created", stmts.getAgent.get(compactId));

          const compactSummary = `Context compacted — conversation history compressed (#${compaction.entries.indexOf(entry) + 1})`;
          stmts.insertEvent.run(
            sessionId,
            compactId,
            "Compaction",
            null,
            compactSummary,
            JSON.stringify({
              uuid: entry.uuid,
              timestamp: ts,
              compaction_number: compaction.entries.indexOf(entry) + 1,
              total_compactions: compaction.count,
            })
          );
          broadcast("new_event", {
            session_id: sessionId,
            agent_id: compactId,
            event_type: "Compaction",
            tool_name: null,
            summary: compactSummary,
            created_at: ts,
          });
        }
      }

      if (tokensByModel) {
        for (const [model, tokens] of Object.entries(tokensByModel)) {
          stmts.replaceTokenUsage.run(
            sessionId,
            model,
            tokens.input,
            tokens.output,
            tokens.cacheRead,
            tokens.cacheWrite
          );
        }
      }

      // Register API errors from transcript (quota limits, rate limits, overloaded, etc.)
      if (result.errors) {
        for (const apiErr of result.errors) {
          // Deduplicate: check if we already recorded this error (same type+message+timestamp)
          const errKey = `${apiErr.type}:${apiErr.timestamp || ""}`;
          const existing = db
            .prepare(
              `SELECT 1 FROM events WHERE session_id = ? AND event_type = 'APIError'
               AND summary = ? LIMIT 1`
            )
            .get(sessionId, `${apiErr.type}: ${apiErr.message}`);
          if (existing) continue;

          stmts.insertEvent.run(
            sessionId,
            mainAgentId,
            "APIError",
            null,
            `${apiErr.type}: ${apiErr.message}`,
            JSON.stringify(apiErr)
          );
          broadcast("new_event", {
            session_id: sessionId,
            agent_id: mainAgentId,
            event_type: "APIError",
            tool_name: null,
            summary: `${apiErr.type}: ${apiErr.message}`,
            created_at: apiErr.timestamp || new Date().toISOString(),
          });
        }
      }

      // Register turn duration events from transcript
      if (result.turnDurations) {
        for (const td of result.turnDurations) {
          const tdTs = td.timestamp || new Date().toISOString();
          // Deduplicate by checking if we already have this turn duration event
          const existing = db
            .prepare(
              "SELECT 1 FROM events WHERE session_id = ? AND event_type = 'TurnDuration' AND created_at = ? LIMIT 1"
            )
            .get(sessionId, tdTs);
          if (existing) continue;

          const tdSummary = `Turn completed in ${(td.durationMs / 1000).toFixed(1)}s`;
          stmts.insertEvent.run(
            sessionId,
            mainAgentId,
            "TurnDuration",
            null,
            tdSummary,
            JSON.stringify({ durationMs: td.durationMs })
          );
          broadcast("new_event", {
            session_id: sessionId,
            agent_id: mainAgentId,
            event_type: "TurnDuration",
            tool_name: null,
            summary: tdSummary,
            created_at: tdTs,
          });
        }
      }

      // Update session metadata with enriched data (thinking blocks, usage extras)
      if (result.usageExtras || result.thinkingBlockCount > 0) {
        const session = stmts.getSession.get(sessionId);
        if (session) {
          const meta = session.metadata ? JSON.parse(session.metadata) : {};
          if (result.usageExtras) {
            meta.usage_extras = result.usageExtras;
          }
          if (result.thinkingBlockCount > 0) {
            meta.thinking_blocks = (meta.thinking_blocks || 0) + result.thinkingBlockCount;
          }
          if (result.turnDurations) {
            meta.turn_count = (meta.turn_count || 0) + result.turnDurations.length;
            const totalMs = result.turnDurations.reduce((s, t) => s + t.durationMs, 0);
            meta.total_turn_duration_ms = (meta.total_turn_duration_ms || 0) + totalMs;
          }
          stmts.updateSession.run(null, null, null, JSON.stringify(meta), sessionId);
        }
      }
    }
  }

  // Evict transcript from cache on SessionEnd — session is done, no more reads expected.
  // Must happen after token extraction above to avoid re-populating the cache.
  if (hookType === "SessionEnd" && data.transcript_path) {
    transcriptCache.invalidate(data.transcript_path);
  }

  // Bump session updated_at on every event
  stmts.touchSession.run(sessionId);

  // Deduplication: skip event insertion and live broadcast when the same signature
  // already exists within 30 seconds (handles duplicate hook delivery).
  const isDuplicate =
    isDuplicateEvent(sessionId, agentId, eventType, summary) ||
    (eventType === "TeamReturn" && isDuplicateReturnOutput(sessionId, agentId, eventData));
  if (isDuplicate) {
    return {
      session_id: sessionId,
      agent_id: agentId,
      event_type: eventType,
      tool_name: toolName,
      summary,
      duplicate: true,
      created_at: new Date().toISOString(),
    };
  }

  stmts.insertEvent.run(
    sessionId,
    agentId,
    eventType,
    toolName,
    summary,
    JSON.stringify(eventData)
    // created_at uses default
  );

  const event = {
    session_id: sessionId,
    agent_id: agentId,
    event_type: eventType,
    tool_name: toolName,
    summary,
    created_at: new Date().toISOString(),
  };
  broadcast("new_event", event);
  return event;
});

router.post("/event", (req, res) => {
  const { hook_type, data } = req.body;
  if (!hook_type || !data) {
    return res.status(400).json({
      error: { code: "INVALID_INPUT", message: "hook_type and data are required" },
    });
  }

  const result = processEvent(hook_type, data);
  if (!result) {
    return res.status(400).json({
      error: { code: "MISSING_SESSION", message: "session_id is required in data" },
    });
  }

  res.json({ ok: true, event: result });
});

router.transcriptCache = transcriptCache;
module.exports = router;
