/**
 * @file Settings.runtimeHealth.test.tsx
 * @description Tests for the Runtime Health section of the Settings page, verifying adapter status display for available ACP, missing ACP, and degraded ACP states.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { RuntimeHealth, RuntimeAdapterHealth, RuntimeComponentHealth } from "../../lib/types";

// Mock the api module
vi.mock("../../lib/api", () => ({
  api: {
    pricing: {
      list: vi.fn().mockResolvedValue({ pricing: [] }),
      totalCost: vi.fn().mockResolvedValue({ total_cost: 0 }),
    },
    settings: {
      info: vi.fn(),
      exportData: () => "/api/settings/export",
    },
  },
}));

// Mock the eventBus
vi.mock("../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
  },
}));

// Mock lucide-react icons to return simple span elements
vi.mock("lucide-react", () => {
  const React = require("react");
  const createIcon = (name: string) => (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": `icon-${name}`, ...props });
  return {
    DollarSign: createIcon("dollar-sign"),
    Plus: createIcon("plus"),
    Pencil: createIcon("pencil"),
    Trash2: createIcon("trash2"),
    Check: createIcon("check"),
    X: createIcon("x"),
    RefreshCw: createIcon("refresh-cw"),
    Database: createIcon("database"),
    Plug: createIcon("plug"),
    HardDrive: createIcon("hard-drive"),
    AlertTriangle: createIcon("alert-triangle"),
    RotateCcw: createIcon("rotate-ccw"),
    CheckCircle: createIcon("check-circle"),
    XCircle: createIcon("x-circle"),
    Server: createIcon("server"),
    Bell: createIcon("bell"),
    BellOff: createIcon("bell-off"),
    BellRing: createIcon("bell-ring"),
    FileDown: createIcon("file-down"),
    Eraser: createIcon("eraser"),
    Play: createIcon("play"),
    Zap: createIcon("zap"),
    AlertCircle: createIcon("alert-circle"),
    GitBranch: createIcon("git-branch"),
    ShieldCheck: createIcon("shield-check"),
    ShieldAlert: createIcon("shield-alert"),
    ShieldX: createIcon("shield-x"),
    Clock: createIcon("clock"),
    Cpu: createIcon("cpu"),
    Globe: createIcon("globe"),
    Wifi: createIcon("wifi"),
    Activity: createIcon("activity"),
    Users: createIcon("users"),
    Layers: createIcon("layers"),
    Coins: createIcon("coins"),
    BarChart3: createIcon("bar-chart-3"),
    Settings: createIcon("settings"),
  };
});

// Mock Tip and format utilities
vi.mock("../../components/Tip", () => ({
  Tip: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("span", null, children);
  },
}));

vi.mock("../../lib/format", () => ({
  fmt: (n: number) => String(n),
  fmtCost: (n: number) => `$${n.toFixed(2)}`,
}));

function healthyComponent(overrides?: Record<string, unknown>): RuntimeComponentHealth {
  return {
    status: "healthy",
    summary: "Operating normally",
    ...overrides,
  } as RuntimeComponentHealth;
}

function acpAdapter(overrides?: Partial<RuntimeAdapterHealth>): RuntimeAdapterHealth {
  return {
    id: "claude-agent-acp",
    runtime: "claude",
    transport: "acp",
    available: true,
    source: "path",
    command: "claude-agent-acp",
    version: "0.31.1",
    health: "healthy",
    launchReady: false,
    limitations: [],
    ...overrides,
  };
}

function cliAdapter(id: string, overrides?: Partial<RuntimeAdapterHealth>): RuntimeAdapterHealth {
  return {
    id,
    runtime: id === "codex-cli" ? "codex" : "claude",
    transport: "cli",
    available: true,
    source: "path",
    command: id,
    version: null,
    health: "healthy",
    launchReady: id === "claude-cli",
    limitations: [],
    ...overrides,
  };
}

function adapterSection(items: RuntimeAdapterHealth[]): RuntimeHealth["adapters"] {
  const availableCount = items.filter((item) => item.available).length;
  const hasDegraded = items.some((item) => item.health === "degraded");
  const hasUnavailableRequired = items.some(
    (item) => item.health === "unavailable" && item.id !== "claude-agent-acp"
  );
  return {
    status: hasUnavailableRequired || hasDegraded ? "degraded" : "healthy",
    summary: `${items.length} adapter(s) total, ${availableCount} available`,
    items,
  };
}

function makeRuntimeHealth(overrides?: Partial<RuntimeHealth>): RuntimeHealth {
  return {
    overall: "healthy",
    adapters: adapterSection([
      cliAdapter("codex-cli"),
      cliAdapter("claude-cli"),
      acpAdapter(),
    ]),
    hooks: healthyComponent({ installed: true, path: "/fake/settings.json", hooks: {} }) as RuntimeHealth["hooks"],
    database: healthyComponent({ path: "/fake/db.sqlite", size: 4096, counts: { sessions: 1, agents: 1, events: 1, model_pricing: 13 } }) as RuntimeHealth["database"],
    openspec: healthyComponent({ workspaceRoot: "/fake/workspace", source: "active" }) as RuntimeHealth["openspec"],
    websocket: healthyComponent({ connections: 1 }) as RuntimeHealth["websocket"],
    transcriptCache: healthyComponent({ entries: 0 }) as RuntimeHealth["transcriptCache"],
    server: healthyComponent({ uptime: 3600, nodeVersion: "v22.0.0", platform: "win32" }) as RuntimeHealth["server"],
    ingestion: healthyComponent() as RuntimeHealth["ingestion"],
    ...overrides,
  };
}

import { Settings } from "../Settings";
import { api } from "../../lib/api";

function mockSettingsInfo(runtimeHealth: RuntimeHealth) {
  const mockInfo = vi.mocked(api.settings.info);
  mockInfo.mockResolvedValue({
    db: { path: "/fake/db.sqlite", size: 4096, counts: { sessions: 1, agents: 1, events: 1, model_pricing: 13 } },
    hooks: { installed: true, path: "/fake/settings.json", hooks: { PreToolUse: true, Stop: true } },
    server: { uptime: 1000, node_version: "v22.0.0", platform: "win32", ws_connections: 1 },
    openspec: { workspaceRoot: "/fake/workspace", source: "active", activeWorkspaceRoot: "/fake/workspace", detectedWorkspaceRoots: [], selectableProjectRoots: [] },
    transcript_cache: { entries: 0, paths: [] },
    runtime_health: runtimeHealth,
  });
}

describe("Settings - Runtime Health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Runtime Health section when runtime_health is present", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("Runtime Health")).toBeInTheDocument();
    });

    // Overall status should be visible
    const healthyElements = screen.getAllByText("healthy");
    expect(healthyElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows degraded overall status when components are degraded", async () => {
    mockSettingsInfo(makeRuntimeHealth({
      overall: "degraded",
      hooks: healthyComponent({ status: "degraded", summary: "Hooks partially installed" }) as RuntimeHealth["hooks"],
    }));

    render(<Settings />);

    await waitFor(() => {
      const degradedBadges = screen.getAllByText("degraded");
      expect(degradedBadges.length).toBeGreaterThan(0);
    });
  });

  it("displays ACP adapter when available", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("claude-agent-acp")).toBeInTheDocument();
    });
  });

  it("displays ACP transport badge", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("acp")).toBeInTheDocument();
    });
  });

  it("displays ACP version when available", async () => {
    mockSettingsInfo(makeRuntimeHealth({
      adapters: adapterSection([
        cliAdapter("codex-cli"),
        cliAdapter("claude-cli"),
        acpAdapter({ version: "0.31.1" }),
      ]),
    }));

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("v0.31.1")).toBeInTheDocument();
    });
  });

  it("shows ACP as unavailable when not installed", async () => {
    mockSettingsInfo(makeRuntimeHealth({
      adapters: adapterSection([
        cliAdapter("codex-cli"),
        cliAdapter("claude-cli"),
        acpAdapter({
          available: false,
          health: "unavailable",
          source: "unresolved",
          version: null,
          limitations: ["claude-agent-acp not found via CCSM_CLAUDE_AGENT_ACP_PATH or PATH"],
        }),
      ]),
    }));

    render(<Settings />);

    await waitFor(() => {
      const unavailableElements = screen.getAllByText("unavailable");
      expect(unavailableElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows ACP as degraded when version cannot be read", async () => {
    mockSettingsInfo(makeRuntimeHealth({
      adapters: adapterSection([
        cliAdapter("codex-cli"),
        cliAdapter("claude-cli"),
        acpAdapter({
          available: true,
          health: "degraded",
          version: null,
          limitations: ["ACP version could not be determined; support status is unverified"],
        }),
      ]),
    }));

    render(<Settings />);

    await waitFor(() => {
      // The adapter health badge should say "degraded" — use getAllByText
      const degradedElements = screen.getAllByText("degraded");
      expect(degradedElements.length).toBeGreaterThan(0);
    });
  });

  it("shows all component health sections", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("Hooks")).toBeInTheDocument();
      expect(screen.getByText("Database")).toBeInTheDocument();
      expect(screen.getByText("OpenSpec")).toBeInTheDocument();
      expect(screen.getByText("WebSocket")).toBeInTheDocument();
      expect(screen.getByText("Cache")).toBeInTheDocument();
      expect(screen.getByText("Server")).toBeInTheDocument();
      expect(screen.getByText("Ingestion")).toBeInTheDocument();
    });
  });

  it("shows Worker Adapters section", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("Worker Adapters")).toBeInTheDocument();
    });
  });

  it("shows CLI transport for codex-cli adapter", async () => {
    mockSettingsInfo(makeRuntimeHealth());

    render(<Settings />);

    await waitFor(() => {
      const cliBadges = screen.getAllByText("cli");
      expect(cliBadges.length).toBeGreaterThanOrEqual(2); // codex-cli and claude-cli
    });
  });

  it("does not render Runtime Health section when runtime_health is absent", async () => {
    const mockInfo = vi.mocked(api.settings.info);
    mockInfo.mockResolvedValue({
      db: { path: "/fake/db.sqlite", size: 4096, counts: { sessions: 1, agents: 1, events: 1, model_pricing: 13 } },
      hooks: { installed: true, path: "/fake/settings.json", hooks: { PreToolUse: true, Stop: true } },
      server: { uptime: 1000, node_version: "v22.0.0", platform: "win32", ws_connections: 1 },
      openspec: { workspaceRoot: "/fake/workspace", source: "active", activeWorkspaceRoot: "/fake/workspace", detectedWorkspaceRoots: [], selectableProjectRoots: [] },
      transcript_cache: { entries: 0, paths: [] },
      // No runtime_health
    });

    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText("About")).toBeInTheDocument();
    });

    // Runtime Health section should not be present
    expect(screen.queryByText("Runtime Health")).not.toBeInTheDocument();
    expect(screen.queryByText("Worker Adapters")).not.toBeInTheDocument();
  });
});
