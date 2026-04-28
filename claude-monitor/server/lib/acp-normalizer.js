/**
 * @file ACP Event Normalizer - Maps ACP event payloads into the monitor's internal
 * session/agent/event/output model. Handles unsupported payloads gracefully by
 * returning diagnostic entries instead of throwing.
 */

const VALID_TYPES = [
  "session_start", "session_end",
  "agent_start", "agent_stop",
  "tool_use", "output", "model_info",
];

const TYPE_ALIASES = {
  "session.lifecycle.start": "session_start",
  "session.lifecycle.end": "session_end",
  "session.start": "session_start",
  "session.end": "session_end",
  "agent.lifecycle.start": "agent_start",
  "agent.lifecycle.stop": "agent_stop",
  "agent.start": "agent_start",
  "agent.stop": "agent_stop",
  "agent.spawn": "agent_start",
  "agent.close": "agent_stop",
  "tool.use": "tool_use",
  "tool.call": "tool_use",
  "tool.execute": "tool_use",
  "message": "output",
  "message.output": "output",
  "message.text": "output",
  "model.info": "model_info",
  "model.metadata": "model_info",
  "model.config": "model_info",
};

const MAX_RAW_DEPTH = 4;
const MAX_STRING_LENGTH = 2000;
const MAX_ARRAY_LENGTH = 100;
const MAX_OBJECT_KEYS = 50;

const RAW_FILTER_KEYS = new Set([
  "api_key", "apiKey", "secret", "password", "token", "authorization",
  "access_token", "refresh_token", "private_key", "privateKey",
  "api_secret", "apikey", "bearer", "credential", "credentials",
]);

/**
 * Recursively sanitize a raw value for safe storage.
 * Redacts sensitive keys, truncates long strings, and limits depth/size.
 */
function sanitizeRaw(value, depth) {
  const d = depth || 0;

  if (d > MAX_RAW_DEPTH) return "[truncated: max depth]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    if (value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH) + "...";
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) {
      return value.slice(0, MAX_ARRAY_LENGTH)
        .map(function (v) { return sanitizeRaw(v, d + 1); })
        .concat(["[truncated]"]);
    }
    return value.map(function (v) { return sanitizeRaw(v, d + 1); });
  }

  if (typeof value === "object") {
    var keys = Object.keys(value);
    var result = {};
    var limit = Math.min(keys.length, MAX_OBJECT_KEYS);
    for (var i = 0; i < limit; i++) {
      var key = keys[i];
      if (RAW_FILTER_KEYS.has(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = sanitizeRaw(value[key], d + 1);
      }
    }
    if (keys.length > MAX_OBJECT_KEYS) {
      result["..."] = "[truncated: too many keys]";
    }
    return result;
  }

  return String(value);
}

/**
 * Resolve an ACP event type string to a normalized monitor event type.
 * Supports direct type names, aliases, and prefix-based fallback matching.
 * Returns null for unrecognized types.
 */
function resolveEventType(acpType) {
  if (!acpType || typeof acpType !== "string") return null;

  var normalized = acpType.toLowerCase().trim();

  // Direct match
  if (VALID_TYPES.indexOf(normalized) !== -1) return normalized;

  // Alias match (exact then prefix)
  var aliasKeys = Object.keys(TYPE_ALIASES);
  for (var i = 0; i < aliasKeys.length; i++) {
    var alias = aliasKeys[i];
    var target = TYPE_ALIASES[alias];
    if (normalized === alias) return target;
    if (normalized.indexOf(alias + ".") === 0) return target;
  }

  // Prefix-based fallback matching
  if (normalized.indexOf("session") === 0) {
    if (normalized.indexOf("start") !== -1) return "session_start";
    if (normalized.indexOf("end") !== -1) return "session_end";
    return "session_start"; // generic session event
  }
  if (normalized.indexOf("agent") === 0) {
    if (normalized.indexOf("start") !== -1 || normalized.indexOf("spawn") !== -1) return "agent_start";
    if (normalized.indexOf("stop") !== -1 || normalized.indexOf("end") !== -1 || normalized.indexOf("close") !== -1) return "agent_stop";
    return "agent_start"; // generic agent event
  }
  if (normalized.indexOf("tool") === 0) return "tool_use";
  if (normalized.indexOf("output") !== -1 || normalized.indexOf("message") !== -1) return "output";
  if (normalized.indexOf("model") !== -1) return "model_info";

  return null;
}

/**
 * Build a human-readable summary for a normalized ACP event.
 */
function buildSummary(normalizedType, acpPayload) {
  var sessionId = acpPayload.session_id || acpPayload.sessionId || "unknown";
  var shortId = sessionId.length > 8 ? sessionId.slice(-8) : sessionId;

  switch (normalizedType) {
    case "session_start":
      return "ACP session started: " + shortId;
    case "session_end":
      return "ACP session ended: " + shortId;
    case "agent_start": {
      var agentName = acpPayload.agent_name || acpPayload.agent_name_hint || acpPayload.agent_type || "agent";
      return "ACP agent started: " + agentName;
    }
    case "agent_stop": {
      var stopName = acpPayload.agent_name || acpPayload.agent_name_hint || acpPayload.agent_type || "agent";
      return "ACP agent stopped: " + stopName;
    }
    case "tool_use": {
      var toolName = acpPayload.tool_name || acpPayload.tool || acpPayload.toolName || "unknown";
      return "ACP tool use: " + toolName;
    }
    case "output": {
      var msg = acpPayload.message || acpPayload.output || acpPayload.text || "";
      var preview = typeof msg === "string" ? msg.slice(0, 80) : String(msg).slice(0, 80);
      return preview ? "ACP output: " + preview : "ACP output";
    }
    case "model_info": {
      var model = acpPayload.model || acpPayload.model_name || "unknown";
      return "ACP model info: " + model;
    }
    default:
      return "ACP event";
  }
}

/**
 * Map an ACP event payload to a normalized monitor event.
 *
 * Handles common ACP payload shapes:
 *   - Flat payload: { type, session_id, agent_id, ... }
 *   - Nested payload: { event: { type, data }, session_id, ... }
 *
 * For unsupported or malformed payloads, returns a diagnostic entry with
 * type "unsupported" and data.diagnostic = true. Never throws.
 *
 * @param {object} acpPayload - Raw ACP event payload
 * @returns {object} Normalized event or diagnostic entry
 */
function normalizeAcpEvent(acpPayload) {
  // Reject non-object payloads
  if (!acpPayload || typeof acpPayload !== "object") {
    return {
      type: "unsupported",
      sessionId: null,
      agentId: null,
      eventType: "acp_diagnostic",
      summary: "ACP event rejected: payload is not an object",
      data: {
        source: "acp",
        adapterId: "claude-agent-acp",
        transport: "acp",
        correlationId: null,
        raw: { error: "Invalid payload type", received: typeof acpPayload },
        model: null,
        diagnostic: true,
      },
    };
  }

  // Extract ACP type — can be top-level "type", nested "event.type", or "event_type"
  var eventField = acpPayload.event;
  var acpType =
    acpPayload.type ||
    acpPayload.event_type ||
    (eventField && typeof eventField === "object" ? eventField.type : null) ||
    null;

  if (!acpType) {
    return {
      type: "unsupported",
      sessionId: null,
      agentId: null,
      eventType: "acp_diagnostic",
      summary: "ACP event missing type field",
      data: {
        source: "acp",
        adapterId: "claude-agent-acp",
        transport: "acp",
        correlationId: null,
        raw: sanitizeRaw(acpPayload),
        model: null,
        diagnostic: true,
      },
    };
  }

  var normalizedType = resolveEventType(acpType);

  if (!normalizedType) {
    return {
      type: "unsupported",
      sessionId: null,
      agentId: null,
      eventType: "acp_diagnostic",
      summary: "ACP unknown event type: " + acpType,
      data: {
        source: "acp",
        adapterId: "claude-agent-acp",
        transport: "acp",
        correlationId: null,
        raw: sanitizeRaw(acpPayload),
        model: null,
        diagnostic: true,
        unknownType: acpType,
      },
    };
  }

  // Extract common fields
  var sessionId = acpPayload.session_id || acpPayload.sessionId || null;
  var agentId = acpPayload.agent_id || acpPayload.agentId || null;
  var correlationId = acpPayload.correlation_id || acpPayload.correlationId || null;
  var model = acpPayload.model || acpPayload.model_name || null;
  var summary = acpPayload.summary || buildSummary(normalizedType, acpPayload);

  // Extract nested event data if present, then sanitize
  var innerData =
    (eventField && typeof eventField === "object" ? eventField.data : null) ||
    acpPayload.data ||
    {};
  var sanitizedInner = sanitizeRaw(innerData);

  // Build data object: inner data first, then overwrite with guaranteed metadata
  // Only spread if sanitizedInner is a plain object (not array, not null)
  var eventData = {};
  if (sanitizedInner && typeof sanitizedInner === "object" && !Array.isArray(sanitizedInner)) {
    var innerKeys = Object.keys(sanitizedInner);
    for (var k = 0; k < innerKeys.length; k++) {
      eventData[innerKeys[k]] = sanitizedInner[innerKeys[k]];
    }
  }

  // Overlay required metadata — these MUST win over inner data
  eventData.source = "acp";
  eventData.adapterId = "claude-agent-acp";
  eventData.transport = "acp";
  eventData.correlationId = correlationId;
  eventData.raw = sanitizeRaw(acpPayload);
  eventData.model = model;

  return {
    type: normalizedType,
    sessionId: sessionId,
    agentId: agentId,
    eventType: normalizedType,
    summary: summary,
    data: eventData,
  };
}

module.exports = { normalizeAcpEvent, resolveEventType, buildSummary, sanitizeRaw };
