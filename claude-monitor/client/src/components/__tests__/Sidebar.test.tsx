/**
 * @file Sidebar.test.tsx
 * @description Unit tests for the Sidebar component, which is responsible for rendering the application's sidebar navigation. The tests cover rendering of the brand name, navigation links, WebSocket connection status, and version number. The tests use React Testing Library and Vitest for assertions and mocking.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Sidebar } from "../Sidebar";
import { api } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  api: {
    settings: {
      info: vi.fn(),
      updateOpenSpecWorkspace: vi.fn(),
    },
  },
}));

const originalLocation = window.location;
const mockLocation = { reload: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.settings.info).mockResolvedValue({
    db: { path: "", size: 0, counts: {} },
    hooks: { installed: false, path: "", hooks: {} },
    server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
    openspec: {
      workspaceRoot: "B:\\project\\DataBeacon",
      source: "active",
      activeWorkspaceRoot: "B:\\project\\DataBeacon",
      detectedWorkspaceRoots: ["B:\\project\\DataBeacon"],
      selectableProjectRoots: [],
    },
  });
  vi.mocked(api.settings.updateOpenSpecWorkspace).mockResolvedValue({
    ok: true,
    openspec: {
      workspaceRoot: "B:\\project\\second",
      source: "sessions",
      activeWorkspaceRoot: "B:\\project\\second",
      detectedWorkspaceRoots: ["B:\\project\\first", "B:\\project\\second"],
      selectableProjectRoots: [],
    },
  });
  Object.defineProperty(window, "location", {
    value: mockLocation,
    writable: true,
    configurable: true,
  });
  mockLocation.reload.mockClear();
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
});

function renderSidebar(wsConnected: boolean, collapsed = false) {
  return render(
    <MemoryRouter>
      <Sidebar
        wsConnected={wsConnected}
        collapsed={collapsed}
        onToggle={() => {}}
        theme="dark"
        onThemeToggle={() => {}}
      />
    </MemoryRouter>
  );
}

describe("Sidebar", () => {
  it("should render the brand name", () => {
    renderSidebar(true);
    expect(screen.getByText("Agent Monitor")).toBeInTheDocument();
  });

  it("should render the current workspace", async () => {
    renderSidebar(true);
    expect(await screen.findByText("Project: DataBeacon")).toBeInTheDocument();
    expect(screen.getByText("B:\\project\\DataBeacon")).toBeInTheDocument();
  });

  it("should render all navigation links", () => {
    renderSidebar(true);
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("Sessions")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
    expect(screen.getByText("Workflows")).toBeInTheDocument();
  });

  it('should show "Live" when WebSocket is connected', () => {
    renderSidebar(true);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it('should show "Disconnected" when WebSocket is not connected', () => {
    renderSidebar(false);
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("should show version number", () => {
    renderSidebar(true);
    expect(screen.getByText(`v${__CCGS_VERSION__}`)).toBeInTheDocument();
  });

  it("should have correct navigation hrefs", () => {
    renderSidebar(true);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/board");
    expect(hrefs).toContain("/sessions");
    expect(hrefs).toContain("/analytics");
    expect(hrefs).toContain("/workflows");
    expect(hrefs).toContain("https://github.com/Catsofsuffering");
    expect(hrefs).toContain("https://github.com/Catsofsuffering/ccsm");
  });

  it("should call updateOpenSpecWorkspace and reload when selecting a project", async () => {
    vi.mocked(api.settings.info).mockResolvedValue({
      db: { path: "", size: 0, counts: {} },
      hooks: { installed: false, path: "", hooks: {} },
      server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
      openspec: {
        workspaceRoot: "B:\\project\\first",
        source: "active",
        activeWorkspaceRoot: "B:\\project\\first",
        detectedWorkspaceRoots: ["B:\\project\\first", "B:\\project\\second"],
        selectableProjectRoots: [
          { label: "First Project", root: "B:\\project\\first", source: "active" },
          { label: "Second Project", root: "B:\\project\\second", source: "sessions" },
        ],
      },
    });

    renderSidebar(true);

    // Open the project selector
    const projectButton = await screen.findByText("Project: first");
    await act(async () => {
      projectButton.click();
    });

    // Click on the second project
    const secondProject = await screen.findByText("Second Project");
    await act(async () => {
      secondProject.click();
    });

    // Verify updateOpenSpecWorkspace was called with the correct root
    expect(api.settings.updateOpenSpecWorkspace).toHaveBeenCalledWith("B:\\project\\second");

    // The sidebar notifies project-scoped pages without forcing a full reload.
    expect(mockLocation.reload).not.toHaveBeenCalled();
  });

  it("should show distinguishable labels for roots with the same basename", async () => {
    vi.mocked(api.settings.info).mockResolvedValue({
      db: { path: "", size: 0, counts: {} },
      hooks: { installed: false, path: "", hooks: {} },
      server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
      openspec: {
        workspaceRoot: "B:\\project\\ccs",
        source: "active",
        activeWorkspaceRoot: "B:\\project\\ccs",
        detectedWorkspaceRoots: ["B:\\project\\ccs", "B:\\worktrees\\ccs"],
        selectableProjectRoots: [
          { label: "ccs (project)", root: "B:\\project\\ccs", source: "active" },
          { label: "ccs (worktrees)", root: "B:\\worktrees\\ccs", source: "sessions" },
        ],
      },
    });

    renderSidebar(true);

    expect(await screen.findByText("Project: ccs")).toBeInTheDocument();

    const projectButton = await screen.findByText("Project: ccs");
    await act(async () => {
      projectButton.click();
    });

    expect(await screen.findByText("ccs (project)")).toBeInTheDocument();
    expect(await screen.findByText("ccs (worktrees)")).toBeInTheDocument();
  });

  it("should display worktree identity in sidebar", async () => {
    vi.mocked(api.settings.info).mockResolvedValue({
      db: { path: "", size: 0, counts: {} },
      hooks: { installed: false, path: "", hooks: {} },
      server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
      openspec: {
        workspaceRoot: "B:\\project\\ccs",
        source: "active",
        activeWorkspaceRoot: "B:\\project\\ccs",
        detectedWorkspaceRoots: ["B:\\project\\ccs"],
        selectableProjectRoots: [
          { label: "ccs (project)", root: "B:\\project\\ccs", source: "active" },
        ],
      },
    });

    renderSidebar(true);

    // Worktree identity should be displayed (derived from parent directory)
    expect(await screen.findByText("project")).toBeInTheDocument();
  });

  it("should prefer branch field over derived worktree identity", async () => {
    vi.mocked(api.settings.info).mockResolvedValue({
      db: { path: "", size: 0, counts: {} },
      hooks: { installed: false, path: "", hooks: {} },
      server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
      openspec: {
        workspaceRoot: "B:\\project\\ccs",
        source: "active",
        activeWorkspaceRoot: "B:\\project\\ccs",
        detectedWorkspaceRoots: ["B:\\project\\ccs"],
        selectableProjectRoots: [
          { label: "ccs", root: "B:\\project\\ccs", source: "active", branch: "main" },
        ],
      },
    });

    renderSidebar(true);

    // Should show the branch name
    expect(await screen.findByText("main")).toBeInTheDocument();
  });

  it("should prefer worktreeLabel over derived identity when branch unavailable", async () => {
    vi.mocked(api.settings.info).mockResolvedValue({
      db: { path: "", size: 0, counts: {} },
      hooks: { installed: false, path: "", hooks: {} },
      server: { uptime: 0, node_version: "v22.0.0", platform: "win32", ws_connections: 0 },
      openspec: {
        workspaceRoot: "B:\\project\\ccs",
        source: "active",
        activeWorkspaceRoot: "B:\\project\\ccs",
        detectedWorkspaceRoots: ["B:\\project\\ccs"],
        selectableProjectRoots: [
          { label: "ccs", root: "B:\\project\\ccs", source: "active", worktreeLabel: "feature-x" },
        ],
      },
    });

    renderSidebar(true);

    // Should show the worktreeLabel
    expect(await screen.findByText("feature-x")).toBeInTheDocument();
  });
});
