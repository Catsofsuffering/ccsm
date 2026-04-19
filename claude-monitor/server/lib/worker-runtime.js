const fs = require("node:fs");
const path = require("node:path");

function normalizePathEntries() {
  const pathValue = process.env.PATH || process.env.Path || process.env.path || "";
  const delimiter = process.platform === "win32" ? ";" : path.delimiter;

  return pathValue
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function resolveExplicitBinary(envKey) {
  const value = process.env[envKey];
  if (!value) return null;
  const resolved = path.resolve(value);
  return fs.existsSync(resolved) ? resolved : null;
}

function resolveFromPath(commandNames) {
  const candidates = Array.isArray(commandNames) ? commandNames : [commandNames];

  for (const dir of normalizePathEntries()) {
    for (const commandName of candidates) {
      const candidate = path.join(dir, commandName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function detectCliAdapter({
  id,
  runtime,
  envKey,
  commandNames,
  capabilities,
}) {
  const explicit = resolveExplicitBinary(envKey);
  const resolvedBinary = explicit || resolveFromPath(commandNames);
  const available = Boolean(resolvedBinary);

  return {
    id,
    runtime,
    transport: "cli",
    available,
    command: resolvedBinary || commandNames[0],
    source: explicit ? "env" : available ? "path" : "unresolved",
    envKey,
    capabilities,
  };
}

function listWorkerAdapters() {
  return [
    detectCliAdapter({
      id: "codex-cli",
      runtime: "codex",
      envKey: "CCGS_CODEX_PATH",
      commandNames: process.platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"],
      capabilities: {
        stages: ["proposal", "design", "specs", "tasks", "implementing"],
        actions: ["reopen", "replay"],
      },
    }),
    detectCliAdapter({
      id: "claude-cli",
      runtime: "claude",
      envKey: "CCGS_CLAUDE_PATH",
      commandNames: process.platform === "win32" ? ["claude.exe", "claude.cmd", "claude"] : ["claude"],
      capabilities: {
        stages: ["tasks", "implementing", "complete"],
        actions: ["replay"],
      },
    }),
  ];
}

function selectAdapterForNode({ change, nodeId, actionType, adapters }) {
  const availableAdapters = adapters.filter((adapter) => adapter.available);
  const allAdapters = adapters.length > 0 ? adapters : listWorkerAdapters();

  function pickByRuntime(runtime) {
    return availableAdapters.find((adapter) => adapter.runtime === runtime)
      || allAdapters.find((adapter) => adapter.runtime === runtime)
      || null;
  }

  let preferred = null;
  let reason = "";

  if (nodeId.startsWith("session:") || nodeId.includes("claude")) {
    preferred = pickByRuntime("claude");
    reason = "Selected the Claude worker because the target node is tied to execution/runtime activity.";
  } else if (nodeId.includes("codex")) {
    preferred = pickByRuntime("codex");
    reason = "Selected the Codex worker because the target node is already aligned with Codex runtime signals.";
  } else if (actionType === "replay" && change.readyToApply) {
    preferred = pickByRuntime("claude");
    reason = "Replay on an execution-ready project prefers the Claude execution worker.";
  } else if (actionType === "reopen" && !change.readyToApply) {
    preferred = pickByRuntime("codex");
    reason = "Reopen on a pre-execution project prefers Codex for planning and reconciliation.";
  } else if (change.stage === "implementing") {
    preferred = pickByRuntime("claude");
    reason = "Implementation-stage work prefers the Claude execution worker.";
  } else {
    preferred = pickByRuntime("codex");
    reason = "Pre-implementation work prefers Codex for orchestration-friendly task shaping.";
  }

  return {
    preferredAdapterId: preferred?.id || null,
    preferredRuntime: preferred?.runtime || null,
    command: preferred?.command || null,
    availableAdapters: availableAdapters.map((adapter) => adapter.id),
    reason,
  };
}

module.exports = {
  listWorkerAdapters,
  selectAdapterForNode,
};
