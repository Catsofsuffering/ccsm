const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  listWorkerAdapters,
  getAdapter,
  summarizeAdapterHealth,
} = require("../lib/worker-runtime");

describe("Control Plane - ACP Integration", () => {
  describe("Adapter registry provides ACP adapter", () => {
    it("ACP adapter is present in listWorkerAdapters", () => {
      const adapters = listWorkerAdapters();
      const acp = adapters.find((a) => a.id === "claude-agent-acp");
      assert.ok(acp, "ACP adapter should be in the adapter list");
    });

    it("ACP adapter has transport acp", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.equal(acp.transport, "acp");
    });

    it("ACP adapter has launchReady false", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.equal(acp.launchReady, false);
    });

    it("ACP adapter has capabilities stages and actions", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.ok(Array.isArray(acp.capabilities.stages));
      assert.ok(Array.isArray(acp.capabilities.actions));
      assert.ok(acp.capabilities.stages.length > 0);
      assert.ok(acp.capabilities.actions.length > 0);
    });
  });

  describe("Existing CLI adapters are preserved", () => {
    it("codex-cli adapter is present with transport cli", () => {
      const a = getAdapter("codex-cli");
      assert.ok(a);
      assert.equal(a.transport, "cli");
      assert.equal(a.runtime, "codex");
    });

    it("claude-cli adapter is present with transport cli", () => {
      const a = getAdapter("claude-cli");
      assert.ok(a);
      assert.equal(a.transport, "cli");
      assert.equal(a.runtime, "claude");
    });

    it("claude-cli has launchReady matching available", () => {
      const a = getAdapter("claude-cli");
      assert.equal(a.launchReady, a.available);
    });

    it("codex-cli has launchReady false (not executable)", () => {
      const a = getAdapter("codex-cli");
      assert.equal(a.launchReady, false);
    });
  });

  describe("ACP does not become default dispatch", () => {
    it("ACP adapter id is not claude-cli", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.notEqual(acp.id, "claude-cli");
    });

    it("claude-cli remains the default executable Claude adapter", () => {
      const claudeCli = getAdapter("claude-cli");
      // claude-cli is the dispatch-capable Claude adapter
      assert.equal(claudeCli.runtime, "claude");
      assert.equal(claudeCli.transport, "cli");
    });

    it("ACP does not override claude-cli in the adapter list", () => {
      const adapters = listWorkerAdapters();
      const claudeAdapters = adapters.filter((a) => a.runtime === "claude");
      const cliAdapter = claudeAdapters.find((a) => a.id === "claude-cli");
      assert.ok(cliAdapter, "claude-cli should still be in the list");
    });
  });

  describe("ACP blocked dispatch behavior", () => {
    it("ACP health is unavailable when not found, healthy when found", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.ok(
        ["healthy", "unavailable"].includes(acp.health),
        `ACP health should be healthy or unavailable, got ${acp.health}`
      );
    });

    it("ACP launchReady is always false in this implementation", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.strictEqual(acp.launchReady, false);
    });

    it("ACP has valid limitations for blocked state", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.ok(Array.isArray(acp.limitations));
      if (!acp.available) {
        assert.ok(acp.limitations.length > 0, "Unavailable ACP should have limitation messages");
      }
    });

    it("ACP adapter has version field (null or string)", () => {
      const acp = getAdapter("claude-agent-acp");
      assert.ok(
        acp.version === null || typeof acp.version === "string",
        "ACP version should be null or string"
      );
    });
  });

  describe("summarizeAdapterHealth includes all adapters", () => {
    it("returns health for codex-cli, claude-cli, and claude-agent-acp", () => {
      const health = summarizeAdapterHealth();
      const ids = health.map((h) => h.id);
      assert.ok(ids.includes("codex-cli"));
      assert.ok(ids.includes("claude-cli"));
      assert.ok(ids.includes("claude-agent-acp"));
    });

    it("each health entry has required fields", () => {
      for (const h of summarizeAdapterHealth()) {
        assert.ok("id" in h);
        assert.ok("runtime" in h);
        assert.ok("transport" in h);
        assert.ok("available" in h);
        assert.ok("health" in h);
        assert.ok("launchReady" in h);
        assert.ok("limitations" in h);
      }
    });

    it("ACP health entry has transport acp", () => {
      const health = summarizeAdapterHealth();
      const acp = health.find((h) => h.id === "claude-agent-acp");
      assert.equal(acp.transport, "acp");
    });

    it("ACP health has launchReady false", () => {
      const health = summarizeAdapterHealth();
      const acp = health.find((h) => h.id === "claude-agent-acp");
      assert.equal(acp.launchReady, false);
    });
  });
});
