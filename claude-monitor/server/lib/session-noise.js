/**
 * @file Startup-only noise session classifier.
 * Determines whether a session is a startup-only noise session using a conservative approach.
 */

const fs = require("fs");

const DEFAULT_START_SUMMARIES = new Set(["session started", "session resumed"]);
const STARTUP_SOURCES = new Set(["startup", "resume"]);
const METADATA_KEYS = new Set([
  "session_id",
  "source_session_id",
  "canonical_session_id",
  "transcript_path",
  "cwd",
  "project_cwd",
  "hook_event_name",
  "source",
  "run_id",
  "ccsm_workspace_root",
  "permission_mode",
]);

function hasTranscriptFileEvidence(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== "string") return false;
  try {
    const stat = fs.statSync(transcriptPath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function hasContentEvidenceFromData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  if (value.message || value.content || value.output || value.tool_input || value.tool_response) {
    return true;
  }

  if (hasTranscriptFileEvidence(value.transcript_path)) {
    return true;
  }

  if (value.source && !STARTUP_SOURCES.has(String(value.source).toLowerCase())) {
    return true;
  }

  return Object.entries(value).some(([key, fieldValue]) => {
    if (METADATA_KEYS.has(key)) return false;
    if (fieldValue === null || fieldValue === undefined || fieldValue === "") return false;
    return true;
  });
}

/**
 * Returns true if the session is a startup-only noise session.
 *
 * A startup-only noise session has only SessionStart lifecycle events, no
 * token_usage rows, and no usable content evidence. Default lifecycle summaries
 * such as "Session started" are not content evidence.
 *
 * Sessions with zero events are not classified as startup-only noise.
 *
 * @param {import("better-sqlite3").Database} db
 * @param {string} sessionId
 * @returns {boolean}
 */
function isStartupOnlyNoiseSession(db, sessionId) {
  const eventRow = db
    .prepare("SELECT 1 FROM events WHERE session_id = ? LIMIT 1")
    .get(sessionId);

  if (!eventRow) return false;

  const hasRealWorkEvents = db
    .prepare(
      `SELECT 1 FROM events
       WHERE session_id = ?
         AND event_type != 'SessionStart'
       LIMIT 1`
    )
    .get(sessionId);

  if (hasRealWorkEvents) return false;

  const hasTokenUsage = db
    .prepare("SELECT 1 FROM token_usage WHERE session_id = ? LIMIT 1")
    .get(sessionId);

  if (hasTokenUsage) return false;

  const sessionEvents = db
    .prepare(
      `SELECT summary, data FROM events
       WHERE session_id = ? AND event_type = 'SessionStart'`
    )
    .all(sessionId);

  for (const sessionEvent of sessionEvents) {
    const summary = sessionEvent.summary ? sessionEvent.summary.trim() : "";
    if (summary && !DEFAULT_START_SUMMARIES.has(summary.toLowerCase())) {
      return false;
    }

    if (sessionEvent.data && sessionEvent.data.trim().length > 0) {
      try {
        const parsed = JSON.parse(sessionEvent.data);
        if (hasContentEvidenceFromData(parsed)) return false;
      } catch {
        return false;
      }
    }
  }

  return true;
}

module.exports = { isStartupOnlyNoiseSession };
