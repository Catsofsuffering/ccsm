const { describe, it } = require("node:test");
const assert = require("node:assert");

// ---------------------------------------------------------------------------
// Minimal stubs that match the shapes expected by collectRuntimeHealth.
// The production code already ships sane defaults, so we override everything
// to keep tests deterministic and independent of the runtime environment.
// ---------------------------------------------------------------------------

function stubHookStatus(installed = true, hookMap = {}) {
  if (Object.keys(hookMap).length === 0) {
    hookMap = {
      PreToolUse: true,
      PostToolUse: true,
      Stop: true,
      SubagentStop: true,
      Notification: true,
      SessionStart: true,
      SessionEnd: true,
    };
  }
  return () => ({
    installed,
    path: "/home/user/.claude/settings.json",
    hooks: hookMap,
  });
}

function stubTableCounts(overrides = {}) {
  return () => ({
    sessions: 5,
    agents: 10,
    events: 100,
    model_pricing: 10,
    token_usage: 3,
    ...overrides,
  });
}

function stubDbSize(bytes = 10240) {
  return () => bytes;
}

function stubTranscriptCache(entries = 2, paths = ["/tmp/a.jsonl", "/tmp/b.jsonl"]) {
  return {
    stats: () => ({ entries, paths }),
  };
}

function stubAdapterHealth(adapters) {
  return () => adapters;
}

function stubWorkspaceSelection(root = "/home/projects/my-openspec") {
  return () => ({
    workspaceRoot: root,
    source: "active",
    activeWorkspaceRoot: root,
    detectedWorkspaceRoots: [root],
  });
}

function stubConnectionCount(count = 3) {
  return () => count;
}

function defaultOpts() {
  return {
    getHookStatus: stubHookStatus(),
    getTableCounts: stubTableCounts(),
    getDbSize: stubDbSize(),
    transcriptCache: stubTranscriptCache(),
    _getConnectionCount: stubConnectionCount(),
    _getWorkspaceSelection: stubWorkspaceSelection(),
    _summarizeAdapterHealth: stubAdapterHealth([
      {
        id: "codex-cli",
        runtime: "codex",
        transport: "cli",
        available: true,
        command: "codex",
        source: "path",
        version: "1.0.0",
        health: "healthy",
        launchReady: false,
        limitations: [],
      },
      {
        id: "claude-cli",
        runtime: "claude",
        transport: "cli",
        available: true,
        command: "claude",
        source: "path",
        version: "1.0.0",
        health: "healthy",
        launchReady: true,
        limitations: [],
      },
      {
        id: "claude-agent-acp",
        runtime: "claude",
        transport: "acp",
        available: true,
        command: "claude-agent-acp",
        source: "path",
        version: "1.2.0",
        health: "healthy",
        launchReady: false,
        limitations: [],
      },
    ]),
  };
}

// ---------------------------------------------------------------------------
// Require the module under test WITH overrides applied.
// ---------------------------------------------------------------------------
const { collectRuntimeHealth, REQUIRED_SECTIONS } = require("../runtime-health");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("collectRuntimeHealth", () => {
  describe("required sections", () => {
    it("returns all nine required top-level sections", () => {
      const result = collectRuntimeHealth(defaultOpts());

      for (const section of REQUIRED_SECTIONS) {
        assert.ok(
          section in result,
          `Expected section "${section}" to be present in result`
        );
      }

      // Verify no unexpected keys leak in.
      const actualKeys = Object.keys(result).filter((k) => k !== "overall");
      for (const key of actualKeys) {
        assert.ok(
          REQUIRED_SECTIONS.includes(key),
          `Unexpected key "${key}" in result`
        );
      }
      // "overall" is not an object but a string enum.
      assert.ok(REQUIRED_SECTIONS.includes("overall"));
    });

    it("each component section has status and summary", () => {
      const result = collectRuntimeHealth(defaultOpts());

      for (const section of REQUIRED_SECTIONS) {
        if (section === "overall") continue; // overall is a string, not an object

        const obj = result[section];
        assert.ok(obj && typeof obj === "object", `${section} should be an object`);
        assert.ok("status" in obj, `${section} should have a status field`);
        assert.ok("summary" in obj, `${section} should have a summary field`);
        assert.ok(
          ["healthy", "degraded", "unavailable"].includes(obj.status),
          `${section}.status should be one of healthy|degraded|unavailable, got "${obj.status}"`
        );
        assert.ok(typeof obj.summary === "string", `${section}.summary should be a string`);
      }

      assert.ok(
        ["healthy", "degraded", "unavailable"].includes(result.overall),
        `overall should be one of healthy|degraded|unavailable, got "${result.overall}"`
      );
    });
  });

  describe("overall status derivation", () => {
    it("is healthy when all components are healthy", () => {
      const result = collectRuntimeHealth(defaultOpts());
      assert.equal(result.overall, "healthy");
    });

    it("is degraded when one component is degraded", () => {
      const opts = defaultOpts();
      // Make hooks degraded by reporting them as not installed.
      opts.getHookStatus = stubHookStatus(false);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.hooks.status, "degraded");
      assert.equal(result.overall, "degraded");
    });

    it("is degraded when the database has zero size", () => {
      const opts = defaultOpts();
      opts.getDbSize = stubDbSize(0);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.database.status, "degraded");
      assert.equal(result.overall, "degraded");
    });

    it("is unavailable when one component throws (caught as unavailable)", () => {
      const opts = defaultOpts();
      // Simulate a complete failure in hooks collection.
      opts.getHookStatus = () => {
        throw new Error("BOOM");
      };
      const result = collectRuntimeHealth(opts);

      assert.equal(result.hooks.status, "unavailable");
      assert.equal(result.overall, "unavailable");
    });
  });

  describe("non-blocking error isolation", () => {
    it("one component throwing does not crash collection of others", () => {
      const opts = defaultOpts();
      opts.getHookStatus = () => {
        throw new Error("hooks down");
      };

      let result;
      try {
        result = collectRuntimeHealth(opts);
      } catch (_) {
        assert.fail("collectRuntimeHealth should not throw even when a component fails");
      }

      assert.equal(result.hooks.status, "unavailable");

      // All other sections should still be present and healthy.
      for (const section of REQUIRED_SECTIONS) {
        if (section === "hooks" || section === "overall") continue;
        assert.equal(
          result[section].status,
          "healthy",
          `${section} should remain healthy despite hooks failure`
        );
      }
    });

    it("all non-throwing components produce valid results", () => {
      // Make TWO components fail.
      const opts = defaultOpts();
      opts.getHookStatus = () => {
        throw new Error("hooks down");
      };
      opts.getDbSize = () => {
        throw new Error("disk full");
      };

      const result = collectRuntimeHealth(opts);

      assert.equal(result.hooks.status, "unavailable");
      assert.equal(result.database.status, "unavailable");
      assert.equal(result.overall, "unavailable");

      // All other sections should be healthy.
      for (const section of REQUIRED_SECTIONS) {
        if (section === "hooks" || section === "database" || section === "overall") continue;
        assert.equal(
          result[section].status,
          "healthy",
          `Expected ${section} to be healthy when hooks+db fail, got ${result[section].status}`
        );
      }
    });
  });

  describe("adapters section", () => {
    it("includes all adapters from worker-runtime", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.ok(Array.isArray(result.adapters.items));
      const ids = result.adapters.items.map((a) => a.id);
      assert.ok(ids.includes("codex-cli"));
      assert.ok(ids.includes("claude-cli"));
      assert.ok(ids.includes("claude-agent-acp"));
      assert.equal(result.adapters.items.length, 3);
    });

    it("adapters status is degraded when an adapter is unavailable", () => {
      const opts = defaultOpts();
      opts._summarizeAdapterHealth = stubAdapterHealth([
        {
          id: "codex-cli",
          runtime: "codex",
          transport: "cli",
          available: false,
          command: "codex",
          source: "unresolved",
          version: null,
          health: "unavailable",
          launchReady: false,
          limitations: ["Binary not found"],
        },
        {
          id: "claude-cli",
          runtime: "claude",
          transport: "cli",
          available: true,
          command: "claude",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: true,
          limitations: [],
        },
      ]);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.adapters.status, "degraded");
      assert.equal(result.adapters.summary, "2 adapter(s) total, 1 available");
    });

    it("adapts to missing ACP adapter", () => {
      const opts = defaultOpts();
      // Only two adapters (no ACP).
      opts._summarizeAdapterHealth = stubAdapterHealth([
        {
          id: "codex-cli",
          runtime: "codex",
          transport: "cli",
          available: true,
          command: "codex",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: false,
          limitations: [],
        },
        {
          id: "claude-cli",
          runtime: "claude",
          transport: "cli",
          available: true,
          command: "claude",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: true,
          limitations: [],
        },
      ]);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.adapters.items.length, 2);
      assert.equal(result.adapters.status, "healthy");
      assert.equal(result.overall, "healthy");
    });

    it("keeps overall healthy when optional ACP is unavailable", () => {
      const opts = defaultOpts();
      opts._summarizeAdapterHealth = stubAdapterHealth([
        {
          id: "codex-cli",
          runtime: "codex",
          transport: "cli",
          available: true,
          command: "codex",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: false,
          limitations: [],
        },
        {
          id: "claude-cli",
          runtime: "claude",
          transport: "cli",
          available: true,
          command: "claude",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: true,
          limitations: [],
        },
        {
          id: "claude-agent-acp",
          runtime: "claude",
          transport: "acp",
          available: false,
          command: "claude-agent-acp",
          source: "unresolved",
          version: null,
          health: "unavailable",
          launchReady: false,
          limitations: ["claude-agent-acp not found"],
        },
      ]);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.adapters.items.length, 3);
      assert.equal(result.adapters.status, "healthy");
      const acpItem = result.adapters.items.find((a) => a.id === "claude-agent-acp");
      assert.ok(acpItem);
      assert.equal(acpItem.health, "unavailable");
      assert.equal(acpItem.available, false);
      assert.equal(result.overall, "healthy");
    });

    it("degrades when available ACP has an unhealthy diagnostic", () => {
      const opts = defaultOpts();
      opts._summarizeAdapterHealth = stubAdapterHealth([
        {
          id: "codex-cli",
          runtime: "codex",
          transport: "cli",
          available: true,
          command: "codex",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: false,
          limitations: [],
        },
        {
          id: "claude-cli",
          runtime: "claude",
          transport: "cli",
          available: true,
          command: "claude",
          source: "path",
          version: "1.0.0",
          health: "healthy",
          launchReady: true,
          limitations: [],
        },
        {
          id: "claude-agent-acp",
          runtime: "claude",
          transport: "acp",
          available: true,
          command: "claude-agent-acp",
          source: "path",
          version: null,
          health: "degraded",
          launchReady: false,
          limitations: ["ACP version could not be determined"],
        },
      ]);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.adapters.status, "degraded");
      assert.equal(result.overall, "degraded");
    });
  });

  describe("hooks section", () => {
    it("reports installed hooks correctly", () => {
      const opts = defaultOpts();
      opts.getHookStatus = stubHookStatus(true);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.hooks.status, "healthy");
      assert.equal(result.hooks.installed, true);
      assert.equal(result.hooks.hooks.PreToolUse, true);
    });

    it("reports missing hooks as degraded", () => {
      const opts = defaultOpts();
      opts.getHookStatus = stubHookStatus(false, {
        PreToolUse: false,
        PostToolUse: false,
        Stop: false,
        SubagentStop: false,
        Notification: false,
        SessionStart: false,
        SessionEnd: false,
      });
      const result = collectRuntimeHealth(opts);

      assert.equal(result.hooks.status, "degraded");
      assert.equal(result.hooks.installed, false);
    });
  });

  describe("database section", () => {
    it("reports database size and counts", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.database.status, "healthy");
      assert.equal(result.database.size, 10240);
      assert.deepEqual(result.database.counts, {
        sessions: 5,
        agents: 10,
        events: 100,
        model_pricing: 10,
        token_usage: 3,
      });
    });

    it("is degraded when database file has zero size", () => {
      const opts = defaultOpts();
      opts.getDbSize = stubDbSize(0);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.database.status, "degraded");
    });
  });

  describe("openspec section", () => {
    it("reports workspace root when available", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.openspec.status, "healthy");
      assert.equal(result.openspec.workspaceRoot, "/home/projects/my-openspec");
      assert.equal(result.openspec.source, "active");
    });

    it("is degraded when no workspace is detected", () => {
      const opts = defaultOpts();
      opts._getWorkspaceSelection = () => {
        throw new Error("OpenSpec workspace not found");
      };
      const result = collectRuntimeHealth(opts);

      assert.equal(result.openspec.status, "unavailable");
    });
  });

  describe("websocket section", () => {
    it("reports connection count", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.websocket.status, "healthy");
      assert.equal(result.websocket.connections, 3);
    });

    it("reports zero connections cleanly", () => {
      const opts = defaultOpts();
      opts._getConnectionCount = stubConnectionCount(0);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.websocket.connections, 0);
      assert.equal(result.websocket.status, "healthy");
    });
  });

  describe("transcriptCache section", () => {
    it("reports cache entries and paths", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.transcriptCache.status, "healthy");
      assert.equal(result.transcriptCache.entries, 2);
      assert.deepEqual(result.transcriptCache.paths, ["/tmp/a.jsonl", "/tmp/b.jsonl"]);
    });

    it("reports empty cache cleanly", () => {
      const opts = defaultOpts();
      opts.transcriptCache = stubTranscriptCache(0, []);
      const result = collectRuntimeHealth(opts);

      assert.equal(result.transcriptCache.entries, 0);
      assert.equal(result.transcriptCache.status, "healthy");
    });
  });

  describe("server section", () => {
    it("reports server metadata", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.server.status, "healthy");
      assert.ok(typeof result.server.uptime === "number");
      assert.ok(result.server.uptime >= 0);
      assert.ok(typeof result.server.nodeVersion === "string");
      assert.ok(result.server.nodeVersion.startsWith("v"));
      assert.ok(typeof result.server.platform === "string");
    });
  });

  describe("ingestion section", () => {
    it("reports session/event/agent counts", () => {
      const result = collectRuntimeHealth(defaultOpts());

      assert.equal(result.ingestion.status, "healthy");
      assert.equal(result.ingestion.sessions, 5);
      assert.equal(result.ingestion.events, 100);
      assert.equal(result.ingestion.agents, 10);
    });

    it("shows no activity message when counts are zero", () => {
      const opts = defaultOpts();
      opts.getTableCounts = stubTableCounts({ sessions: 0, agents: 0, events: 0 });
      const result = collectRuntimeHealth(opts);

      assert.equal(result.ingestion.sessions, 0);
      assert.equal(result.ingestion.summary, "No ingestion activity yet");
    });
  });
});
