/**
 * @file Tolerant normalizer for Agent Teams tool payloads observed in
 * PreToolUse/PostToolUse hook data. Recognizes TeamCreate, TaskCreate,
 * TaskUpdate, SendMessage, and mailbox/teammate-message shapes; extracts
 * message text, summary, team/task metadata, sender/recipient, and raw
 * source; ignores lifecycle-only team events that carry no teammate output.
 *
 * @author Claude Agent Team (fix-agent-teams-monitoring change)
 */

/**
 * Deep-get a value from obj along a dot-bracket path.
 * e.g. getPath({a: {b: [0: {c: 1}]}}, "a.b.0.c") => 1
 */
function getPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = Array.isArray(path) ? path : path.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    // Handle array index notation like "0" or "[0]"
    const key = String(part).replace(/^\[|\]$/g, "");
    cur = cur[key];
  }
  return cur;
}

/**
 * Check if a value looks like a non-empty string.
 */
function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Extract the best message text from a SendMessage / mailbox / teammate-payload shape.
 * Checks common field names in order of specificity.
 * Returns null if no usable message found.
 */
function extractMessageText(payload) {
  if (!payload || typeof payload !== "object") return null;

  // Direct fields
  const directFields = ["message", "content", "text", "summary", "output", "result", "return_value"];
  for (const field of directFields) {
    if (isNonEmptyString(payload[field])) return payload[field];
  }

  // tool_input.message / tool_input.content / tool_input.payload / tool_input.data
  const toolInput = payload.tool_input || payload.input || {};
  for (const field of directFields) {
    if (isNonEmptyString(toolInput[field])) return toolInput[field];
  }

  // Deep-nested: tool_input.payload.data.message or tool_input.payload.data.content
  // (Agent Teams sometimes nests the actual message several levels deep)
  const tipd = toolInput.payload && toolInput.payload.data ? toolInput.payload.data : null;
  if (tipd) {
    for (const field of directFields) {
      if (isNonEmptyString(tipd[field])) return tipd[field];
    }
  }

  // tool_input.payload.message (one level deeper)
  const tip = toolInput.payload && typeof toolInput.payload === "object" ? toolInput.payload : null;
  if (tip) {
    for (const field of directFields) {
      if (isNonEmptyString(tip[field])) return tip[field];
    }
    // And check tip.data if it exists
    if (tip.data) {
      for (const field of directFields) {
        if (isNonEmptyString(tip.data[field])) return tip.data[field];
      }
    }
  }

  // Nested in tool_response
  const toolResponse = payload.tool_response || payload.response || {};
  for (const field of directFields) {
    if (isNonEmptyString(toolResponse[field])) return toolResponse[field];
  }
  if (isNonEmptyString(toolResponse.payload)) {
    return toolResponse.payload;
  }
  if (toolResponse.payload && typeof toolResponse.payload === "object") {
    const inner = extractMessageText(toolResponse.payload);
    if (inner) return inner;
  }

  // payload or data at root level
  for (const field of ["payload", "data", "body"]) {
    const val = payload[field];
    if (isNonEmptyString(val)) return val;
    if (val && typeof val === "object") {
      const inner = extractMessageText(val);
      if (inner) return inner;
    }
  }

  // teammate-message shape: teammate_message.message or teammate_message.content
  const tm = payload.teammate_message || payload.teammateMessage || {};
  if (isNonEmptyString(tm.message)) return tm.message;
  if (isNonEmptyString(tm.content)) return tm.content;
  if (isNonEmptyString(tm.summary)) return tm.summary;

  // Nested mailbox: mailbox.message, mailbox.content
  const mb = payload.mailbox || {};
  if (isNonEmptyString(mb.message)) return mb.message;
  if (isNonEmptyString(mb.content)) return mb.content;
  if (isNonEmptyString(mb.summary)) return mb.summary;

  // agent-message shape
  const am = payload.agent_message || payload.agentMessage || {};
  if (isNonEmptyString(am.message)) return am.message;
  if (isNonEmptyString(am.content)) return am.content;

  return null;
}

/**
 * Extract summary field from payload.
 * Falls back to first 120 chars of message text if no explicit summary.
 */
function extractSummary(payload, messageText) {
  if (isNonEmptyString(payload.summary)) return payload.summary;
  if (isNonEmptyString(payload.subject)) return payload.subject;
  if (isNonEmptyString(payload.title)) return payload.title;

  // Check nested summary in tool_input.payload.data
  const toolInput = payload.tool_input || payload.input || {};
  if (isNonEmptyString(toolInput.summary)) return toolInput.summary;
  if (isNonEmptyString(toolInput.subject)) return toolInput.subject;
  if (isNonEmptyString(toolInput.title)) return toolInput.title;

  const tipd = toolInput.payload && toolInput.payload.data ? toolInput.payload.data : null;
  if (tipd) {
    if (isNonEmptyString(tipd.summary)) return tipd.summary;
    if (isNonEmptyString(tipd.subject)) return tipd.subject;
  }
  // Also check tool_input.payload.summary
  const tip = toolInput.payload && typeof toolInput.payload === "object" ? toolInput.payload : null;
  if (tip) {
    if (isNonEmptyString(tip.summary)) return tip.summary;
  }

  if (messageText) return messageText.slice(0, 120);
  return null;
}

/**
 * Extract sender/recipient from payload.
 */
function extractParticipants(payload) {
  // Check direct fields first, then nested tool_input
  const toolInput = payload.tool_input || payload.input || {};
  const sender =
    payload.sender ||
    payload.from ||
    payload.agent_id ||
    payload.agentId ||
    payload.source_agent ||
    payload.sourceAgent ||
    toolInput.sender ||
    toolInput.from ||
    toolInput.agent_id ||
    toolInput.agentId ||
    null;

  const recipient =
    payload.recipient ||
    payload.to ||
    payload.target_agent ||
    payload.targetAgent ||
    payload.destination ||
    toolInput.recipient ||
    toolInput.to ||
    toolInput.target_agent ||
    toolInput.targetAgent ||
    null;

  return { sender, recipient };
}

/**
 * Extract team/task metadata.
 */
function extractMetadata(payload) {
  const toolInput = payload.tool_input || payload.input || {};
  const teamName =
    payload.team_name ||
    payload.teamName ||
    payload.team ||
    getPath(payload, "team.name") ||
    toolInput.team_name ||
    toolInput.teamName ||
    toolInput.team ||
    getPath(toolInput, "team.name") ||
    null;

  const taskId =
    payload.task_id ||
    payload.taskId ||
    payload.task ||
    toolInput.task_id ||
    toolInput.taskId ||
    toolInput.task ||
    null;

  const agentType =
    payload.agent_type ||
    payload.agentType ||
    payload.subagent_type ||
    payload.subagentType ||
    toolInput.agent_type ||
    toolInput.agentType ||
    toolInput.subagent_type ||
    toolInput.subagentType ||
    null;

  return { teamName, taskId, agentType };
}

/**
 * Determines whether the given tool_name represents a SendMessage or
 * mailbox/teammate communication tool commonly used by Agent Teams.
 */
function isMessagingTool(toolName) {
  if (!toolName) return false;
  const name = toolName.toLowerCase();
  // Check for known messaging tool name patterns (with or without underscores/hyphens)
  const patterns = [
    "sendmessage",
    "send_message",
    "send-message",
    "mailbox",
    "teammate_message",
    "teammate-message",
    "team_message",
    "team-message",
    "agent_message",
    "agent-message",
    "relay_message",
    "relay-message",
    "relaymessage",
    "return_packet",
    "return-packet",
    "returnmessage",
    "teammatemessage",
    "agentmessage",
    "teamcreate",
    "team_create",
    "team-create",
    "taskcreate",
    "task_create",
    "task-create",
    "taskupdate",
    "task_update",
    "task-update",
  ];
  return patterns.some((p) => name === p || name.includes(p));
}

/**
 * Determines whether the given hook type is one that carries structured
 * tool payload data (as opposed to pure lifecycle events).
 */
function isPayloadHook(hookType) {
  return hookType === "PreToolUse" || hookType === "PostToolUse";
}

/**
 * Determines whether this tool payload looks like a pure lifecycle event
 * (team creation, task creation without output) rather than a teammate
 * message or return packet.
 */
function isLifecycleOnly(normalized) {
  const { messageText } = normalized;
  // If there is no actual message content, it's just a lifecycle signal
  if (!messageText && !normalized.summary) return true;

  // TeamCreate without message content is lifecycle-only
  const toolName = normalized.toolName || "";
  if (
    (toolName.toLowerCase().includes("teamcreate") ||
      toolName.toLowerCase().includes("team_create")) &&
    !messageText
  )
    return true;

  // TaskCreate without message content is lifecycle-only
  if (
    (toolName.toLowerCase().includes("taskcreate") ||
      toolName.toLowerCase().includes("task_create")) &&
    !messageText
  )
    return true;

  return false;
}

/**
 * Main normalization entry point.
 *
 * @param {string} hookType - 'PreToolUse' | 'PostToolUse' | etc.
 * @param {object} data - The raw hook payload data (contains tool_name, tool_input, etc.)
 * @returns {object|null} - Normalized teammate message, or null if not recognizable.
 *
 * Return shape:
 * {
 *   toolName: string,        // original tool name
 *   messageText: string,    // extracted message content (may be null)
 *   summary: string,         // display summary (may be null)
 *   sender: string|null,
 *   recipient: string|null,
 *   teamName: string|null,
 *   taskId: string|null,
 *   agentType: string|null,
 *   rawSource: object,       // the original data object
 *   isLifecycleOnly: boolean
 * }
 */
function normalizeAgentTeamsPayload(hookType, data) {
  if (!isPayloadHook(hookType)) return null;
  if (!data || typeof data !== "object") return null;

  const toolName = data.tool_name || null;

  // Fast path: check for known messaging tool names
  if (isMessagingTool(toolName)) {
    const messageText = extractMessageText(data);
    const summary = extractSummary(data, messageText);
    const { sender, recipient } = extractParticipants(data);
    const metadata = extractMetadata(data);

    return {
      toolName,
      messageText,
      summary,
      sender,
      recipient,
      teamName: metadata.teamName,
      taskId: metadata.taskId,
      agentType: metadata.agentType,
      rawSource: data,
      isLifecycleOnly: isLifecycleOnly({ messageText, summary, toolName }),
    };
  }

  // Slow path: check for mailbox/teammate-message structural shapes even with unknown tool names.
  // This catches payloads where tool_name is something generic but the payload structure
  // clearly contains teammate communication fields.
  const hasMailboxShape =
    data.mailbox ||
    data.teammate_message ||
    data.teammateMessage ||
    data.agent_message ||
    data.agentMessage;

  const hasMessagingFields =
    (isNonEmptyString(data.message) && isNonEmptyString(data.summary)) ||
    (isNonEmptyString(data.content) && isNonEmptyString(data.summary)) ||
    (isNonEmptyString(data.payload) && isNonEmptyString(data.summary));

  if (!hasMailboxShape && !hasMessagingFields) return null;

  const messageText = extractMessageText(data);
  const summary = extractSummary(data, messageText);
  const { sender, recipient } = extractParticipants(data);
  const metadata = extractMetadata(data);

  return {
    toolName,
    messageText,
    summary,
    sender,
    recipient,
    teamName: metadata.teamName,
    taskId: metadata.taskId,
    agentType: metadata.agentType,
    rawSource: data,
    isLifecycleOnly: isLifecycleOnly({
      messageText,
      summary,
      toolName,
    }),
  };
}

/**
 * Attempt to associate a normalized payload with the best-known agent in the session.
 *
 * Strategy (in order of preference):
 * 1. Explicit agent_id in the payload matches a subagent's id
 * 2. sender/teammate name matches a working subagent's name
 * 3. task_id matches a subagent's task
 * 4. Fall back to the deepest working subagent (most likely the sender)
 *
 * @param {object} normalized - result of normalizeAgentTeamsPayload
 * @param {Array} agents - array of agent rows from listAgentsBySession
 * @returns {string|null} - agent id to associate with, or null
 */
function associateAgent(normalized, agents) {
  if (!agents || !agents.length) return null;

  const workingSubs = agents.filter((a) => a.type === "subagent" && a.status === "working");

  // 1. Explicit agent_id match
  if (normalized.sender) {
    const byId = workingSubs.find((a) => a.id === normalized.sender);
    if (byId) return byId.id;
  }

  // 2. Sender name matches subagent name (partial, case-insensitive)
  if (normalized.sender) {
    const byName = workingSubs.find(
      (a) => a.name && a.name.toLowerCase().includes(normalized.sender.toLowerCase())
    );
    if (byName) return byName.id;
  }

  // 3. TaskId match
  if (normalized.taskId) {
    const byTask = workingSubs.find((a) => a.task && a.task.includes(normalized.taskId));
    if (byTask) return byTask.id;
  }

  // 4. AgentType match
  if (normalized.agentType) {
    const byType = workingSubs.find((a) => a.subagent_type === normalized.agentType);
    if (byType) return byType.id;
  }

  // 5. Fall back to deepest working subagent
  if (workingSubs.length > 0) {
    return workingSubs[workingSubs.length - 1].id;
  }

  return null;
}

/**
 * Build a TeamReturn event summary string from a normalized payload.
 */
function buildTeamReturnSummary(normalized) {
  const prefix = normalized.agentType || normalized.toolName || "Teammate";
  const sender = normalized.sender ? ` from ${normalized.sender}` : "";
  // Prefer messageText when available — summary is often just a short label
  // that doesn't contain the actual message content (e.g. "File analysis complete").
  // Only use summary if messageText is not available.
  const msg = normalized.messageText
    ? normalized.messageText.slice(0, 80)
    : normalized.summary
      ? normalized.summary.slice(0, 80)
      : "message";
  return `${prefix}${sender}: ${msg}`;
}

module.exports = {
  normalizeAgentTeamsPayload,
  associateAgent,
  buildTeamReturnSummary,
  extractMessageText,
  extractSummary,
  isMessagingTool,
  isLifecycleOnly,
};
