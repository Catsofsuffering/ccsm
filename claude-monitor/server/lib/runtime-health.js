/**
 * @file Runtime health diagnostics module. Collects health across all
 * monitor components (adapters, hooks, database, OpenSpec, WebSocket,
 * transcript cache, server, ingestion) and produces a structured dump
 * suitable for diagnostics endpoints.
 * @author Diagnostics and Control Plane worker
 */

const { summarizeAdapterHealth: _summarizeAdapterHealth } = require("./worker-runtime");
const { getWorkspaceSelection: _getWorkspaceSelection } = require("./openspec-state");
const { getConnectionCount: _getConnectionCount } = require("../websocket");

const REQUIRED_SECTIONS = [
  "adapters",
  "hooks",
  "database",
  "openspec",
  "websocket",
  "transcriptCache",
  "server",
  "ingestion",
  "overall",
];

/**
 * Wrap a section collector in try/catch so one failing component does not
 * break the entire health dump.
 */
function guardedSection(builder, label) {
  try {
    return builder();
  } catch (err) {
    return {
      status: "unavailable",
      summary: `Failed to collect ${label} health: ${err.message}`,
    };
  }
}

function isOptionalUnavailableAdapter(adapter) {
  return adapter.id === "claude-agent-acp" && !adapter.available;
}

/**
 * Collect runtime health across all components.
 *
 * @param {object} opts
 * @param {() => object} opts.getHookStatus      - returns hook installation status
 * @param {() => object} opts.getTableCounts     - returns DB row counts
 * @param {() => number} opts.getDbSize          - returns DB file size in bytes
 * @param {object}       opts.transcriptCache    - TranscriptCache instance (must expose stats())
 * @param {() => number} [opts._getConnectionCount]     - override for WebSocket connection count
 * @param {() => object} [opts._getWorkspaceSelection]   - override for OpenSpec workspace
 * @param {() => array}  [opts._summarizeAdapterHealth]  - override for adapter health list
 * @returns {object} structured health payload
 */
function collectRuntimeHealth({
  getHookStatus,
  getTableCounts,
  getDbSize,
  transcriptCache,
  _getConnectionCount: getConnectionCount,
  _getWorkspaceSelection: getWorkspaceSelection,
  _summarizeAdapterHealth: summarizeAdapterHealth,
}) {
  const getConnCount = getConnectionCount || _getConnectionCount;
  const getWs = getWorkspaceSelection || _getWorkspaceSelection;
  const summarizeAdapters = summarizeAdapterHealth || _summarizeAdapterHealth;

  const sections = {};

  // ---- adapters ----
  sections.adapters = guardedSection(() => {
    const adapters = summarizeAdapters();
    const availableCount = adapters.filter((a) => a.available).length;
    const degraded = adapters.filter((a) => a.health === "degraded").length;
    const unavailable = adapters.filter(
      (a) => a.health === "unavailable" && !isOptionalUnavailableAdapter(a)
    ).length;

    let status = "healthy";
    if (unavailable > 0) status = "degraded";
    else if (degraded > 0) status = "degraded";

    return {
      status,
      summary: `${adapters.length} adapter(s) total, ${availableCount} available`,
      items: adapters,
    };
  }, "adapters");

  // ---- hooks ----
  sections.hooks = guardedSection(() => {
    const hookStatus = getHookStatus();
    const installed = Boolean(hookStatus && hookStatus.installed);
    const hookMap = hookStatus && hookStatus.hooks ? hookStatus.hooks : {};
    const activeHooks = Object.values(hookMap).filter(Boolean).length;
    const totalHooks = Object.keys(hookMap).length;

    return {
      status: installed ? "healthy" : "degraded",
      summary: installed
        ? `Hooks installed (${activeHooks}/${totalHooks} types active)`
        : "Hooks not installed",
      installed,
      path: hookStatus && hookStatus.path ? hookStatus.path : null,
      hooks: hookMap,
    };
  }, "hooks");

  // ---- database ----
  sections.database = guardedSection(() => {
    const counts = getTableCounts();
    const size = getDbSize();

    const status = size > 0 ? "healthy" : "degraded";

    return {
      status,
      summary: `${counts.sessions || 0} sessions, ${counts.agents || 0} agents, ${counts.events || 0} events, ${size} bytes`,
      counts,
      size,
    };
  }, "database");

  // ---- openspec ----
  sections.openspec = guardedSection(() => {
    const selection = getWs();
    const hasWorkspace = Boolean(selection && selection.workspaceRoot);

    return {
      status: hasWorkspace ? "healthy" : "degraded",
      summary: hasWorkspace
        ? `Workspace: ${selection.workspaceRoot} (source: ${selection.source})`
        : "No OpenSpec workspace detected",
      workspaceRoot: selection ? selection.workspaceRoot : null,
      source: selection ? selection.source : null,
      activeWorkspaceRoot: selection ? selection.activeWorkspaceRoot : null,
      detectedWorkspaceRoots: selection ? selection.detectedWorkspaceRoots : [],
    };
  }, "openspec");

  // ---- websocket ----
  sections.websocket = guardedSection(() => {
    const connections = getConnCount();

    return {
      status: "healthy",
      summary: `${connections} active WebSocket connection(s)`,
      connections,
    };
  }, "websocket");

  // ---- transcriptCache ----
  sections.transcriptCache = guardedSection(() => {
    const stats = transcriptCache.stats();

    return {
      status: "healthy",
      summary: `${stats.entries} cached transcript(s)`,
      entries: stats.entries,
      paths: stats.paths || [],
    };
  }, "transcriptCache");

  // ---- server ----
  sections.server = guardedSection(() => {
    const uptime = process.uptime();
    const uptimeRounded = Math.round(uptime);

    return {
      status: "healthy",
      summary: `Node ${process.version} on ${process.platform}, uptime ${uptimeRounded}s`,
      uptime,
      nodeVersion: process.version,
      platform: process.platform,
    };
  }, "server");

  // ---- ingestion ----
  sections.ingestion = guardedSection(() => {
    const counts = getTableCounts();
    const sessionCount = counts.sessions || 0;
    const eventCount = counts.events || 0;
    const agentCount = counts.agents || 0;
    const hasActivity = sessionCount > 0 || eventCount > 0;

    return {
      status: "healthy",
      summary: hasActivity
        ? `${sessionCount} sessions, ${eventCount} events, ${agentCount} agents ingested`
        : "No ingestion activity yet",
      sessions: sessionCount,
      events: eventCount,
      agents: agentCount,
    };
  }, "ingestion");

  // ---- overall ----
  const statuses = Object.values(sections).map((s) => s.status);
  const allHealthy = statuses.every((s) => s === "healthy");
  const anyUnavailable = statuses.some((s) => s === "unavailable");

  if (allHealthy) {
    sections.overall = "healthy";
  } else if (anyUnavailable) {
    sections.overall = "unavailable";
  } else {
    sections.overall = "degraded";
  }

  return sections;
}

module.exports = { collectRuntimeHealth, REQUIRED_SECTIONS };
