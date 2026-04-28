const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

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
    version: null,
    capabilities,
    health: available ? "healthy" : "unavailable",
    launchReady: available && id === "claude-cli",
    limitations: available ? [] : [`Binary not found via ${envKey} or PATH`],
  };
}

/**
 * Detect ACP version from binary via --version.
 * Returns { version, warning } — warning is set when version cannot be read.
 */
function detectAcpVersion(command) {
  try {
    const raw = execSync(`"${command}" --version`, {
      timeout: 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    if (raw) return { version: raw, warning: null };
    return { version: null, warning: "ACP --version returned empty output" };
  } catch (err) {
    return {
      version: null,
      warning: `Cannot read ACP version: ${err.message}`,
    };
  }
}

// Cache for ACP version to avoid repeated execSync calls
let _acpVersionCache = null;

function detectAcpAdapter() {
  const envPath = process.env.CCSM_CLAUDE_AGENT_ACP_PATH;
  const explicit = envPath
    ? (fs.existsSync(path.resolve(envPath)) ? path.resolve(envPath) : null)
    : null;
  const commandNames = process.platform === "win32"
    ? ["claude-agent-acp.exe", "claude-agent-acp.cmd", "claude-agent-acp"]
    : ["claude-agent-acp"];
  const resolvedBinary = explicit || resolveFromPath(commandNames);
  const available = Boolean(resolvedBinary);
  const source = explicit ? "env" : available ? "path" : "unresolved";

  let version = null;
  let warnings = [];

  if (available && resolvedBinary) {
    if (_acpVersionCache !== null) {
      const cached = _acpVersionCache;
      version = cached.version;
      if (cached.warning) warnings.push(cached.warning);
    } else {
      const detected = detectAcpVersion(resolvedBinary);
      _acpVersionCache = detected;
      version = detected.version;
      if (detected.warning) warnings.push(detected.warning);
    }
  }

  const limitations = [];
  if (!available) {
    limitations.push("claude-agent-acp not found via CCSM_CLAUDE_AGENT_ACP_PATH or PATH");
  }
  if (available && !version) {
    limitations.push("ACP version could not be determined; support status is unverified");
  }
  for (const w of warnings) {
    limitations.push(w);
  }

  return {
    id: "claude-agent-acp",
    runtime: "claude",
    transport: "acp",
    available,
    command: resolvedBinary || "claude-agent-acp",
    source,
    envKey: "CCSM_CLAUDE_AGENT_ACP_PATH",
    version,
    capabilities: {
      stages: ["tasks", "implementing", "complete"],
      actions: ["replay"],
    },
    health: available ? (version ? "healthy" : "degraded") : "unavailable",
    launchReady: false,
    limitations,
  };
}

/**
 * Clear cached ACP version so the next call to listWorkerAdapters re-detects.
 */
function clearAcpVersionCache() {
  _acpVersionCache = null;
}

/**
 * List all known worker adapters, including optional ACP when detected.
 * Preserves backward compatibility: codex-cli and claude-cli always appear.
 */
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
    detectAcpAdapter(),
  ];
}

/**
 * Return only the adapters that are currently available.
 */
function listAvailableAdapters() {
  return listWorkerAdapters().filter((a) => a.available);
}

/**
 * Get a single adapter by id. Returns null if not found.
 */
function getAdapter(id) {
  return listWorkerAdapters().find((a) => a.id === id) || null;
}

/**
 * Build a summary of adapter health suitable for diagnostics payloads.
 */
function summarizeAdapterHealth() {
  return listWorkerAdapters().map((a) => ({
    id: a.id,
    runtime: a.runtime,
    transport: a.transport,
    available: a.available,
    source: a.source,
    command: a.command,
    version: a.version,
    health: a.health,
    launchReady: a.launchReady,
    limitations: a.limitations,
  }));
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

  // Even when Claude runtime is preferred, claude-cli remains the default adapter.
  // ACP is only selected when explicitly gated.
  if (preferred && preferred.id === "claude-agent-acp" && actionType === "replay") {
    if (!preferred.launchReady) {
      // Fall back to claude-cli if available
      const cli = allAdapters.find((a) => a.id === "claude-cli");
      if (cli && cli.available) {
        preferred = cli;
        reason = "Claude execution prefers the stable claude-cli adapter. ACP is detected but not yet launch-ready for default dispatch.";
      } else {
        reason = "ACP is the only Claude adapter found but is not launch-ready. Dispatch will be blocked.";
      }
    }
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
  listAvailableAdapters,
  getAdapter,
  summarizeAdapterHealth,
  selectAdapterForNode,
  clearAcpVersionCache,
  detectAcpAdapter,
};
