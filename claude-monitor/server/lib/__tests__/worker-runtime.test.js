const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const {
  listWorkerAdapters,
  listAvailableAdapters,
  getAdapter,
  summarizeAdapterHealth,
  selectAdapterForNode,
  clearAcpVersionCache,
  detectAcpAdapter,
} = require("../worker-runtime");

const REQUIRED_ADAPTER_FIELDS = [
  "id",
  "runtime",
  "transport",
  "available",
  "command",
  "source",
  "version",
  "capabilities",
  "health",
  "launchReady",
  "limitations",
];

describe("Worker Runtime Adapter Registry", () => {
  describe("listWorkerAdapters - required adapters", () => {
    it("always includes codex-cli and claude-cli", () => {
      const adapters = listWorkerAdapters();
      const ids = adapters.map((a) => a.id);
      assert.ok(ids.includes("codex-cli"), "codex-cli adapter should be present");
      assert.ok(ids.includes("claude-cli"), "claude-cli adapter should be present");
    });

    it("codex-cli has transport cli", () => {
      const a = listWorkerAdapters().find((a) => a.id === "codex-cli");
      assert.equal(a.transport, "cli");
    });

    it("claude-cli has transport cli", () => {
      const a = listWorkerAdapters().find((a) => a.id === "claude-cli");
      assert.equal(a.transport, "cli");
    });

    it("claude-cli has launchReady true when available", () => {
      const a = listWorkerAdapters().find((a) => a.id === "claude-cli");
      assert.equal(a.launchReady, a.available);
    });

    it("codex-cli has launchReady false", () => {
      const a = listWorkerAdapters().find((a) => a.id === "codex-cli");
      assert.equal(a.launchReady, false);
    });
  });

  describe("listWorkerAdapters - ACP adapter", () => {
    it("includes claude-agent-acp adapter", () => {
      const adapters = listWorkerAdapters();
      const acp = adapters.find((a) => a.id === "claude-agent-acp");
      assert.ok(acp, "claude-agent-acp adapter should be in the list");
    });

    it("ACP has transport acp", () => {
      const acp = listWorkerAdapters().find((a) => a.id === "claude-agent-acp");
      assert.equal(acp.transport, "acp");
    });

    it("ACP has runtime claude", () => {
      const acp = listWorkerAdapters().find((a) => a.id === "claude-agent-acp");
      assert.equal(acp.runtime, "claude");
    });

    it("ACP has launchReady false", () => {
      const acp = listWorkerAdapters().find((a) => a.id === "claude-agent-acp");
      assert.equal(acp.launchReady, false);
    });

    it("ACP is degraded when available but version cannot be read", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccsm-test-acp-version-"));
      try {
        const fakeBin = path.join(
          tmpDir,
          process.platform === "win32" ? "claude-agent-acp.cmd" : "claude-agent-acp"
        );
        fs.writeFileSync(
          fakeBin,
          process.platform === "win32" ? "@echo off\r\nexit /b 1\r\n" : "#!/bin/sh\nexit 1\n"
        );
        if (process.platform !== "win32") fs.chmodSync(fakeBin, 0o755);

        const prev = process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
        process.env.CCSM_CLAUDE_AGENT_ACP_PATH = fakeBin;
        clearAcpVersionCache();

        try {
          const acp = detectAcpAdapter();
          assert.equal(acp.available, true);
          assert.equal(acp.health, "degraded");
          assert.ok(acp.limitations.some((item) => item.includes("version")));
        } finally {
          if (prev !== undefined) {
            process.env.CCSM_CLAUDE_AGENT_ACP_PATH = prev;
          } else {
            delete process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
          }
          clearAcpVersionCache();
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("ACP has envKey CCSM_CLAUDE_AGENT_ACP_PATH", () => {
      const acp = listWorkerAdapters().find((a) => a.id === "claude-agent-acp");
      assert.equal(acp.envKey, "CCSM_CLAUDE_AGENT_ACP_PATH");
    });

    it("ACP uses explicit env path when CCSM_CLAUDE_AGENT_ACP_PATH is set to a valid binary", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ccsm-test-acp-"));
      try {
        const fakeBin = path.join(tmpDir, "claude-agent-acp");
        fs.writeFileSync(fakeBin, "#!/bin/sh\necho 'fake'\n");
        fs.chmodSync(fakeBin, 0o755);

        const prev = process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
        process.env.CCSM_CLAUDE_AGENT_ACP_PATH = fakeBin;
        clearAcpVersionCache();

        try {
          const acp = detectAcpAdapter();
          assert.equal(acp.available, true);
          assert.equal(acp.source, "env");
          assert.equal(acp.command, fakeBin);
        } finally {
          if (prev !== undefined) {
            process.env.CCSM_CLAUDE_AGENT_ACP_PATH = prev;
          } else {
            delete process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
          }
          clearAcpVersionCache();
        }
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it("ACP reports unavailable when binary is missing and env var not set", () => {
      const prev = process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
      delete process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
      clearAcpVersionCache();

      try {
        // First, clear the cache and detect
        const acp = detectAcpAdapter();
        // ACP may or may not be available depending on the system
        // But the adapter should always have a valid shape
        assert.ok(typeof acp.available === "boolean");
        assert.ok(typeof acp.health === "string");
        if (!acp.available) {
          assert.equal(acp.source, "unresolved");
          assert.ok(acp.limitations.length > 0, "unavailable ACP should have limitation messages");
          assert.equal(acp.health, "unavailable");
        }
      } finally {
        if (prev !== undefined) {
          process.env.CCSM_CLAUDE_AGENT_ACP_PATH = prev;
        }
        clearAcpVersionCache();
      }
    });

    it("ACP unavailable does not break listWorkerAdapters", () => {
      const adapters = listWorkerAdapters();
      assert.ok(adapters.length >= 2, "At least codex-cli and claude-cli should be present");
      // All adapters must have required fields
      for (const a of adapters) {
        for (const field of REQUIRED_ADAPTER_FIELDS) {
          assert.ok(field in a, `Adapter ${a.id} must have field ${field}`);
        }
      }
    });
  });

  describe("listWorkerAdapters - adapter shape", () => {
    it("all adapters have every required field", () => {
      const adapters = listWorkerAdapters();
      for (const a of adapters) {
        for (const field of REQUIRED_ADAPTER_FIELDS) {
          assert.ok(
            field in a,
            `Adapter ${a.id} missing required field: ${field}`
          );
        }
      }
    });

    it("capabilities includes stages and actions arrays", () => {
      for (const a of listWorkerAdapters()) {
        assert.ok(Array.isArray(a.capabilities.stages), `${a.id}: stages must be array`);
        assert.ok(Array.isArray(a.capabilities.actions), `${a.id}: actions must be array`);
      }
    });

    it("limitations is always an array", () => {
      for (const a of listWorkerAdapters()) {
        assert.ok(Array.isArray(a.limitations), `${a.id}: limitations must be array`);
      }
    });

    it("version is null or a string", () => {
      for (const a of listWorkerAdapters()) {
        assert.ok(
          a.version === null || typeof a.version === "string",
          `${a.id}: version must be null or string`
        );
      }
    });

    it("health is one of healthy, degraded, unavailable", () => {
      for (const a of listWorkerAdapters()) {
        assert.ok(
          ["healthy", "degraded", "unavailable"].includes(a.health),
          `${a.id}: health must be healthy/degraded/unavailable, got ${a.health}`
        );
      }
    });
  });

  describe("listAvailableAdapters", () => {
    it("returns only available adapters", () => {
      const available = listAvailableAdapters();
      const all = listWorkerAdapters();
      for (const a of available) {
        assert.equal(a.available, true);
      }
      // Check count matches
      const expectedCount = all.filter((a) => a.available).length;
      assert.equal(available.length, expectedCount);
    });
  });

  describe("getAdapter", () => {
    it("returns the correct adapter by id", () => {
      const a = getAdapter("claude-cli");
      assert.ok(a);
      assert.equal(a.id, "claude-cli");
    });

    it("returns null for unknown adapter", () => {
      assert.equal(getAdapter("nonexistent-adapter"), null);
    });

    it("returns ACP adapter", () => {
      const a = getAdapter("claude-agent-acp");
      assert.ok(a);
      assert.equal(a.id, "claude-agent-acp");
    });
  });

  describe("summarizeAdapterHealth", () => {
    it("returns an array with all adapters", () => {
      const summary = summarizeAdapterHealth();
      const allIds = listWorkerAdapters().map((a) => a.id);
      const summaryIds = summary.map((s) => s.id);
      for (const id of allIds) {
        assert.ok(summaryIds.includes(id), `summary should include ${id}`);
      }
    });

    it("each summary has core fields", () => {
      for (const s of summarizeAdapterHealth()) {
        assert.ok("id" in s);
        assert.ok("runtime" in s);
        assert.ok("transport" in s);
        assert.ok("available" in s);
        assert.ok("health" in s);
        assert.ok("launchReady" in s);
      }
    });
  });

  describe("selectAdapterForNode - backward compatibility", () => {
    const adapters = listWorkerAdapters();
    const claudeCli = adapters.find((a) => a.id === "claude-cli");

    it("prefers claude for session nodes", () => {
      const result = selectAdapterForNode({
        change: { stage: "implementing", readyToApply: true, name: "test" },
        nodeId: "session:abc123",
        actionType: "replay",
        adapters,
      });
      if (claudeCli && claudeCli.available) {
        assert.equal(result.preferredAdapterId, "claude-cli");
        assert.equal(result.preferredRuntime, "claude");
      }
    });

    it("prefers claude for replay on ready-to-apply change", () => {
      const result = selectAdapterForNode({
        change: { stage: "tasks", readyToApply: true, name: "test" },
        nodeId: "artifact:proposal",
        actionType: "replay",
        adapters,
      });
      if (claudeCli && claudeCli.available) {
        assert.equal(result.preferredAdapterId, "claude-cli");
        assert.equal(result.preferredRuntime, "claude");
      }
    });

    it("prefers codex for reopen on pre-execution change", () => {
      const result = selectAdapterForNode({
        change: { stage: "proposal", readyToApply: false, name: "test" },
        nodeId: "artifact:design",
        actionType: "reopen",
        adapters,
      });
      assert.equal(result.preferredRuntime, "codex");
    });

    it("returns availableAdapters list", () => {
      const result = selectAdapterForNode({
        change: { stage: "implementing", readyToApply: true, name: "test" },
        nodeId: "tasks:test",
        actionType: "replay",
        adapters,
      });
      assert.ok(Array.isArray(result.availableAdapters));
      assert.ok(result.availableAdapters.length > 0);
    });

    it("does not prefer ACP as default dispatch when claude-cli is available", () => {
      const result = selectAdapterForNode({
        change: { stage: "implementing", readyToApply: true, name: "test" },
        nodeId: "session:test-session",
        actionType: "replay",
        adapters,
      });
      // ACP should not be selected as the preferred adapter by default
      assert.notEqual(result.preferredAdapterId, "claude-agent-acp");
    });

    it("ACP dispatch is blocked when ACP is not launch-ready", () => {
      const acp = adapters.find((a) => a.id === "claude-agent-acp");
      // ACP should always have launchReady false
      assert.equal(acp.launchReady, false);
    });
  });

  describe("clearAcpVersionCache", () => {
    it("clears the cached version so next detection re-runs", () => {
      // Should not throw
      clearAcpVersionCache();
      // First detection caches
      const first = detectAcpAdapter();
      // Second detection uses cache
      const second = detectAcpAdapter();
      assert.equal(first.version, second.version);
      // Clear and detect again
      clearAcpVersionCache();
      const third = detectAcpAdapter();
      // After clear, results should still be consistent
      assert.equal(first.available, third.available);
      assert.equal(first.source, third.source);
    });
  });
});
