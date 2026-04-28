/**
 * @file Unit tests for ACP event normalization and deduplication helpers.
 * Covers normalizeAcpEvent payload mapping, source metadata preservation,
 * graceful handling of unsupported payloads, and fingerprint-based dedup.
 */

var describe = require("node:test").describe;
var it = require("node:test").it;
var before = require("node:test").before;
var assert = require("node:assert/strict");

// Load modules — clear cache first so test isolation is clean
var normalizeAcpEvent;
var resolveEventType;
var buildSummary;
var sanitizeRaw;
var buildDedupeFingerprint;
var isDuplicateEvent;
var isDuplicateOutput;

function loadModules() {
  delete require.cache[require.resolve("../../lib/acp-normalizer")];
  delete require.cache[require.resolve("../../lib/acp-dedupe")];

  var normalizer = require("../../lib/acp-normalizer");
  var dedupe = require("../../lib/acp-dedupe");

  normalizeAcpEvent = normalizer.normalizeAcpEvent;
  resolveEventType = normalizer.resolveEventType;
  buildSummary = normalizer.buildSummary;
  sanitizeRaw = normalizer.sanitizeRaw;
  buildDedupeFingerprint = dedupe.buildDedupeFingerprint;
  isDuplicateEvent = dedupe.isDuplicateEvent;
  isDuplicateOutput = dedupe.isDuplicateOutput;
}

loadModules();

// In-memory SQLite DB for dedupe tests — only used if better-sqlite3 is available
var db = null;
try {
  var Database = require("better-sqlite3");
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(
    "CREATE TABLE IF NOT EXISTS events (" +
    "  id INTEGER PRIMARY KEY AUTOINCREMENT," +
    "  session_id TEXT NOT NULL," +
    "  agent_id TEXT," +
    "  event_type TEXT NOT NULL," +
    "  tool_name TEXT," +
    "  summary TEXT," +
    "  data TEXT," +
    "  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))" +
    ");"
  );
} catch (_err) {
  // better-sqlite3 not available — db-dependent tests will be skipped
}

// ---------------------------------------------------------------------------
// ACP Normalizer
// ---------------------------------------------------------------------------
describe("normalizeAcpEvent", function () {

  it("maps session start payload correctly", function () {
    var result = normalizeAcpEvent({
      type: "session_start",
      session_id: "sess-abc-123",
      model: "claude-sonnet-4",
      correlation_id: "corr-xyz",
    });
    assert.strictEqual(result.type, "session_start");
    assert.strictEqual(result.sessionId, "sess-abc-123");
    assert.strictEqual(result.agentId, null);
    assert.strictEqual(result.eventType, "session_start");
    assert.strictEqual(result.data.source, "acp");
    assert.strictEqual(result.data.adapterId, "claude-agent-acp");
    assert.strictEqual(result.data.transport, "acp");
    assert.strictEqual(result.data.correlationId, "corr-xyz");
    assert.strictEqual(result.data.model, "claude-sonnet-4");
    // buildSummary truncates to last 8 chars: "abc-123"
    assert.ok(result.summary.indexOf("abc-123") !== -1);
  });

  it("maps session end payload correctly", function () {
    var result = normalizeAcpEvent({
      type: "session_end",
      session_id: "sess-end-456",
    });
    assert.strictEqual(result.type, "session_end");
    assert.strictEqual(result.sessionId, "sess-end-456");
    assert.strictEqual(result.eventType, "session_end");
    assert.ok(result.summary.indexOf("ended") !== -1);
  });

  it("maps output event correctly", function () {
    var result = normalizeAcpEvent({
      type: "output",
      session_id: "sess-abc",
      agent_id: "agent-1",
      message: "Hello from ACP agent",
    });
    assert.strictEqual(result.type, "output");
    assert.strictEqual(result.sessionId, "sess-abc");
    assert.strictEqual(result.agentId, "agent-1");
    assert.ok(result.summary.indexOf("Hello") !== -1);
  });

  it("maps tool_use event correctly", function () {
    var result = normalizeAcpEvent({
      type: "tool_use",
      session_id: "sess-1",
      agent_id: "agent-2",
      tool_name: "Bash",
    });
    assert.strictEqual(result.type, "tool_use");
    assert.strictEqual(result.sessionId, "sess-1");
    assert.strictEqual(result.agentId, "agent-2");
    assert.ok(result.summary.indexOf("Bash") !== -1);
  });

  it("maps agent_start event correctly", function () {
    var result = normalizeAcpEvent({
      type: "agent_start",
      session_id: "sess-1",
      agent_id: "agent-sub",
      agent_name: "explorer",
      subagent_type: "Explore",
    });
    assert.strictEqual(result.type, "agent_start");
    assert.strictEqual(result.sessionId, "sess-1");
    assert.strictEqual(result.agentId, "agent-sub");
    assert.ok(result.summary.indexOf("explorer") !== -1);
  });

  it("maps agent_stop event correctly", function () {
    var result = normalizeAcpEvent({
      type: "agent_stop",
      session_id: "sess-1",
      agent_id: "agent-sub",
      agent_name: "explorer",
    });
    assert.strictEqual(result.type, "agent_stop");
    assert.strictEqual(result.sessionId, "sess-1");
    assert.ok(result.summary.indexOf("explorer") !== -1);
  });

  it("maps model_info event correctly", function () {
    var result = normalizeAcpEvent({
      type: "model_info",
      session_id: "sess-3",
      model: "claude-opus-4",
    });
    assert.strictEqual(result.type, "model_info");
    assert.strictEqual(result.data.model, "claude-opus-4");
    assert.ok(result.summary.indexOf("claude-opus-4") !== -1);
  });

  it("preserves source metadata (source: 'acp', adapterId, transport)", function () {
    var result = normalizeAcpEvent({
      type: "tool_use",
      session_id: "sess-1",
      tool_name: "Bash",
    });
    assert.strictEqual(result.data.source, "acp");
    assert.strictEqual(result.data.adapterId, "claude-agent-acp");
    assert.strictEqual(result.data.transport, "acp");
  });

  it("handles unsupported payload gracefully (returns diagnostic, doesn't throw)", function () {
    var caught = null;
    try {
      var result = normalizeAcpEvent(null);
      assert.strictEqual(result.type, "unsupported");
      assert.strictEqual(result.data.diagnostic, true);
      assert.strictEqual(result.eventType, "acp_diagnostic");
    } catch (e) {
      caught = e;
    }
    assert.strictEqual(caught, null, "should not throw on null payload");
  });

  it("handles non-object payload gracefully", function () {
    var result = normalizeAcpEvent("just a string");
    assert.strictEqual(result.type, "unsupported");
    assert.strictEqual(result.data.diagnostic, true);
  });

  it("handles empty object gracefully (returns diagnostic)", function () {
    var result = normalizeAcpEvent({});
    assert.strictEqual(result.type, "unsupported");
    assert.strictEqual(result.data.diagnostic, true);
    assert.ok(result.summary.indexOf("missing type") !== -1);
  });

  it("handles unknown event type gracefully", function () {
    var result = normalizeAcpEvent({ type: "completely_unknown_type_xyz" });
    assert.strictEqual(result.type, "unsupported");
    assert.strictEqual(result.data.diagnostic, true);
    assert.strictEqual(result.data.unknownType, "completely_unknown_type_xyz");
  });

  it("handles missing fields gracefully", function () {
    // type present but no session_id
    var result = normalizeAcpEvent({
      type: "session_start",
    });
    assert.strictEqual(result.type, "session_start");
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.agentId, null);
    // Should still produce valid output with null fields
    assert.strictEqual(result.data.source, "acp");
  });

  it("handles partially filled payload gracefully", function () {
    var result = normalizeAcpEvent({
      type: "output",
      // no session_id, no agent_id, no message
    });
    assert.strictEqual(result.type, "output");
    assert.strictEqual(result.sessionId, null);
    assert.strictEqual(result.data.source, "acp");
  });

  it("resolves session lifecycle aliases", function () {
    var r1 = normalizeAcpEvent({ type: "session.lifecycle.start", session_id: "s1" });
    assert.strictEqual(r1.type, "session_start");

    var r2 = normalizeAcpEvent({ type: "session.lifecycle.end", session_id: "s1" });
    assert.strictEqual(r2.type, "session_end");

    var r3 = normalizeAcpEvent({ type: "session.start", session_id: "s1" });
    assert.strictEqual(r3.type, "session_start");
  });

  it("resolves agent lifecycle aliases", function () {
    var r1 = normalizeAcpEvent({ type: "agent.spawn", session_id: "s1" });
    assert.strictEqual(r1.type, "agent_start");

    var r2 = normalizeAcpEvent({ type: "agent.close", session_id: "s1" });
    assert.strictEqual(r2.type, "agent_stop");
  });

  it("maps nested event type from event.type field", function () {
    var result = normalizeAcpEvent({
      event: { type: "agent_start" },
      session_id: "sess-2",
      agent_id: "agent-1",
    });
    assert.strictEqual(result.type, "agent_start");
    assert.strictEqual(result.sessionId, "sess-2");
    assert.strictEqual(result.agentId, "agent-1");
  });

  it("extracts inner data from nested event payload", function () {
    var result = normalizeAcpEvent({
      type: "output",
      session_id: "sess-3",
      event: {
        type: "output",
        data: { content: "nested message", level: "info" },
      },
    });
    assert.strictEqual(result.type, "output");
    // Inner data fields should be present in the result data
    assert.ok(result.data.content !== undefined || result.data.level !== undefined);
  });

  it("sanitizes sensitive keys in raw data", function () {
    var result = normalizeAcpEvent({
      type: "output",
      session_id: "sess-4",
      api_key: "sk-secret-12345",
      token: "bearer-token-abc",
      safe_field: "visible",
    });
    assert.strictEqual(result.data.raw.api_key, "[redacted]");
    assert.strictEqual(result.data.raw.token, "[redacted]");
    assert.strictEqual(result.data.raw.safe_field, "visible");
  });

  it("truncates long strings in raw data", function () {
    var longString = "";
    for (var i = 0; i < 3000; i++) longString += "x";

    var result = normalizeAcpEvent({
      type: "output",
      session_id: "sess-5",
      message: longString,
    });
    var rawMessage = result.data.raw.message;
    assert.ok(typeof rawMessage === "string");
    assert.ok(rawMessage.length <= 2003); // 2000 + "..."
    assert.ok(rawMessage.endsWith("..."));
  });

  it("handles massive nested objects without hanging", function () {
    var deep = { a: { b: { c: { d: { e: { f: "deep" } } } } } };
    var caught = null;
    var result;
    try {
      result = normalizeAcpEvent({
        type: "session_start",
        session_id: "sess-deep",
        data: deep,
      });
    } catch (e) {
      caught = e;
    }
    assert.strictEqual(caught, null, "should not throw on deeply nested objects");
    assert.strictEqual(result.type, "session_start");
  });

  it("handles model_name as model alias", function () {
    var result = normalizeAcpEvent({
      type: "model_info",
      session_id: "sess-6",
      model_name: "claude-haiku-4",
    });
    assert.strictEqual(result.data.model, "claude-haiku-4");
  });

  it("includes summary in result", function () {
    var result = normalizeAcpEvent({
      type: "session_start",
      session_id: "my-session-id",
    });
    assert.ok(typeof result.summary === "string");
    assert.ok(result.summary.length > 0);
  });
});

// ---------------------------------------------------------------------------
// ACP Deduplication
// ---------------------------------------------------------------------------
describe("buildDedupeFingerprint", function () {

  it("produces consistent fingerprints for same input", function () {
    var event = {
      type: "session_start",
      sessionId: "sess-1",
      eventType: "session_start",
      summary: "ACP session started: abc",
      data: { correlationId: "corr-1" },
    };
    var fp1 = buildDedupeFingerprint(event);
    var fp2 = buildDedupeFingerprint(event);
    assert.strictEqual(fp1, fp2);
    assert.ok(typeof fp1 === "string");
    assert.strictEqual(fp1.length, 64); // SHA-256 hex
  });

  it("produces different fingerprints for different input", function () {
    var event1 = {
      type: "session_start",
      sessionId: "sess-1",
      eventType: "session_start",
      summary: "ACP session started: abc",
      data: { correlationId: "corr-1" },
    };
    var event2 = {
      type: "session_start",
      sessionId: "sess-2",
      eventType: "session_start",
      summary: "ACP session started: def",
      data: { correlationId: "corr-2" },
    };
    var fp1 = buildDedupeFingerprint(event1);
    var fp2 = buildDedupeFingerprint(event2);
    assert.notStrictEqual(fp1, fp2);
  });

  it("different event types produce different fingerprints", function () {
    var event1 = {
      type: "session_start",
      sessionId: "sess-1",
      eventType: "session_start",
      summary: "test",
    };
    var event2 = {
      type: "session_end",
      sessionId: "sess-1",
      eventType: "session_end",
      summary: "test",
    };
    var fp1 = buildDedupeFingerprint(event1);
    var fp2 = buildDedupeFingerprint(event2);
    assert.notStrictEqual(fp1, fp2);
  });

  it("returns null for null or undefined event", function () {
    assert.strictEqual(buildDedupeFingerprint(null), null);
    assert.strictEqual(buildDedupeFingerprint(undefined), null);
  });

  it("returns null for non-object event", function () {
    assert.strictEqual(buildDedupeFingerprint("string"), null);
    assert.strictEqual(buildDedupeFingerprint(123), null);
  });

  it("returns null for empty object (all parts empty)", function () {
    var fp = buildDedupeFingerprint({});
    assert.strictEqual(fp, null);
  });

  it("reads correlationId from data as well as top-level", function () {
    var eventWithData = {
      type: "output",
      sessionId: "sess-1",
      eventType: "output",
      summary: "test",
      data: { correlationId: "from-data" },
    };
    var eventWithTop = {
      type: "output",
      sessionId: "sess-1",
      eventType: "output",
      summary: "test",
      correlationId: "from-data",
    };
    var fp1 = buildDedupeFingerprint(eventWithData);
    var fp2 = buildDedupeFingerprint(eventWithTop);
    assert.strictEqual(fp1, fp2);
  });
});

// ---------------------------------------------------------------------------
// DB-dependent dedup tests
// ---------------------------------------------------------------------------
describe("isDuplicateEvent", function () {

  it("returns false when db is null", function () {
    var result = isDuplicateEvent(null, "some-fingerprint");
    assert.strictEqual(result, false);
  });

  it("returns false for null fingerprint", function () {
    var result = isDuplicateEvent(db, null);
    assert.strictEqual(result, false);
  });

  it("returns false for empty string fingerprint", function () {
    var result = isDuplicateEvent(db, "");
    assert.strictEqual(result, false);
  });

  it("detects duplicates within window", function () {
    if (!db) return; // Skip if SQLite not available

    // Insert a test event with a fingerprint
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ fingerprint: "fp-test-123" })
    );

    var result = isDuplicateEvent(db, "fp-test-123", 60000);
    assert.strictEqual(result, true);

    // Clean up
    db.prepare("DELETE FROM events").run();
  });

  it("does not match fingerprints outside the time window", function () {
    if (!db) return;

    // Insert event with an old timestamp
    var oldDate = new Date(Date.now() - 120000).toISOString();
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ fingerprint: "fp-old" }),
      oldDate
    );

    // Default window is 30s, so this old event should not match
    var result = isDuplicateEvent(db, "fp-old", 1000); // 1s window
    assert.strictEqual(result, false);

    db.prepare("DELETE FROM events").run();
  });

  it("returns false for non-duplicates (different fingerprint)", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ fingerprint: "fp-existing" })
    );

    var result = isDuplicateEvent(db, "fp-completely-different", 60000);
    assert.strictEqual(result, false);

    db.prepare("DELETE FROM events").run();
  });
});

describe("isDuplicateOutput", function () {

  it("returns false when db is null", function () {
    assert.strictEqual(isDuplicateOutput(null, "hello"), false);
  });

  it("returns false when text is null or empty", function () {
    assert.strictEqual(isDuplicateOutput(db, null), false);
    assert.strictEqual(isDuplicateOutput(db, ""), false);
    assert.strictEqual(isDuplicateOutput(db, "   "), false);
  });

  it("returns false when text is not a string", function () {
    assert.strictEqual(isDuplicateOutput(db, 123), false);
  });

  it("detects duplicate output text within window", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ output: "Hello world from ACP" })
    );

    var result = isDuplicateOutput(db, "Hello world from ACP", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("normalizes whitespace when comparing output text", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ output: "Hello   world\nfrom  ACP" })
    );

    // Different whitespace but same semantic text
    var result = isDuplicateOutput(db, "Hello world from ACP", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("detects duplicate in message field", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ message: "Tool result: 42" })
    );

    var result = isDuplicateOutput(db, "Tool result: 42", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("detects duplicate in text field", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ text: "Some message here" })
    );

    var result = isDuplicateOutput(db, "Some message here", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("detects duplicate in raw.output field", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ raw: { output: "Raw output text" } })
    );

    var result = isDuplicateOutput(db, "Raw output text", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("detects duplicate hook TeamReturn output text", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1",
      "agent-1",
      "TeamReturn",
      "Teammate return",
      JSON.stringify({ output: "Shared teammate result" })
    );

    var result = isDuplicateOutput(db, "Shared teammate result", 60000);
    assert.strictEqual(result, true);

    db.prepare("DELETE FROM events").run();
  });

  it("returns false for different output text", function () {
    if (!db) return;

    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data) " +
      "VALUES (?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ output: "First output" })
    );

    var result = isDuplicateOutput(db, "Completely different text", 60000);
    assert.strictEqual(result, false);

    db.prepare("DELETE FROM events").run();
  });

  it("respects time window", function () {
    if (!db) return;

    var oldDate = new Date(Date.now() - 120000).toISOString();
    db.prepare(
      "INSERT INTO events (session_id, agent_id, event_type, summary, data, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      "sess-1", "agent-1", "output", "test",
      JSON.stringify({ output: "Old output" }),
      oldDate
    );

    // 1s window — old event should not match
    var result = isDuplicateOutput(db, "Old output", 1000);
    assert.strictEqual(result, false);

    db.prepare("DELETE FROM events").run();
  });
});
