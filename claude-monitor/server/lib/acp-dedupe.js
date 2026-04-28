/**
 * @file ACP Deduplication Helper - Prevents hook and ACP observations of the same
 * run from creating duplicate records. Uses fingerprint-based deduplication with
 * a configurable time window to avoid double-counting the same logical event.
 */

var crypto = require("crypto");

/**
 * Build a deduplication fingerprint for a normalized ACP event.
 *
 * The fingerprint is a SHA-256 hash of:
 *   eventType + sessionId + correlationId + summary
 *
 * This ensures that the same logical event observed through different channels
 * (hook + ACP) produces the same fingerprint.
 *
 * @param {object} event - Normalized ACP event (output of normalizeAcpEvent)
 * @returns {string|null} Hex fingerprint string, or null if insufficient data
 */
function buildDedupeFingerprint(event) {
  if (!event || typeof event !== "object") return null;

  var parts = [
    event.eventType || event.type || "",
    event.sessionId || event.session_id || "",
    (event.data && event.data.correlationId) || event.correlationId || "",
    event.summary || "",
  ];

  // If all parts are empty, we have nothing meaningful to fingerprint
  var joined = parts.join("|");
  if (joined === "|||") return null;

  return crypto.createHash("sha256").update(joined).digest("hex");
}

/**
 * Check if an event with the same fingerprint already exists within a time window.
 *
 * Looks in the events table for a row whose data JSON contains a "fingerprint"
 * field matching the given value, inserted within windowMs milliseconds.
 *
 * @param {object} db - better-sqlite3 database instance
 * @param {string} fingerprint - The event fingerprint from buildDedupeFingerprint
 * @param {number} windowMs - Time window in milliseconds (default 30000 = 30s)
 * @returns {boolean} True if a duplicate exists
 */
function isDuplicateEvent(db, fingerprint, windowMs) {
  if (!db || !fingerprint) return false;

  var winSec = Math.max(1, Math.ceil((windowMs || 30000) / 1000));

  try {
    var existing = db
      .prepare(
        "SELECT 1 FROM events " +
        "WHERE json_extract(data, '$.fingerprint') = ? " +
        "AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' seconds') " +
        "LIMIT 1"
      )
      .get(fingerprint, String(winSec));
    return !!existing;
  } catch (_e) {
    return false;
  }
}

/**
 * Check if an output event with matching text already exists within a time window.
 *
 * Normalizes whitespace for comparison to avoid false negatives from formatting
 * differences. Searches recent events with output-like types, including
 * hook-originated Agent Teams return packets.
 *
 * @param {object} db - better-sqlite3 database instance
 * @param {string} text - The output text to check
 * @param {number} windowMs - Time window in milliseconds (default 30000 = 30s)
 * @returns {boolean} True if a matching output exists
 */
function isDuplicateOutput(db, text, windowMs) {
  if (!db || !text || typeof text !== "string") return false;

  var normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText) return false;

  var winSec = Math.max(1, Math.ceil((windowMs || 30000) / 1000));

  try {
    var existing = db
      .prepare(
        "SELECT data FROM events " +
        "WHERE event_type IN ('output', 'tool_use', 'TeamReturn') " +
        "AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' seconds')"
      )
      .all(String(winSec));

    return existing.some(function (event) {
      try {
        var parsed = JSON.parse(event.data);
        var storedText =
          parsed.output ||
          parsed.message ||
          parsed.messageText ||
          parsed.text ||
          parsed.summary ||
          (parsed.raw &&
            (parsed.raw.output ||
              parsed.raw.message ||
              parsed.raw.messageText ||
              parsed.raw.text ||
              parsed.raw.last_assistant_message)) ||
          "";
        return typeof storedText === "string" &&
               storedText.replace(/\s+/g, " ").trim() === normalizedText;
      } catch (_parseErr) {
        return false;
      }
    });
  } catch (_e) {
    return false;
  }
}

module.exports = { buildDedupeFingerprint, isDuplicateEvent, isDuplicateOutput };
