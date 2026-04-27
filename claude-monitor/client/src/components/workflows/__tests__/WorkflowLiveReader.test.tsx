import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { WorkflowLiveReader } from "../WorkflowLiveReader";
import { api } from "../../../lib/api";
import { eventBus } from "../../../lib/eventBus";
import type {
  Agent,
  AgentOutputFeed,
  DashboardEvent,
  Session,
  SessionOutputs,
  WSMessage,
} from "../../../lib/types";

type SessionGetResult = {
  session: Session;
  agents: Agent[];
  events: DashboardEvent[];
  outputs: SessionOutputs;
};

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    name: "Test Session",
    status: "active",
    cwd: "B:/project/ccs",
    model: "claude-sonnet",
    started_at: "2026-03-05T10:00:00.000Z",
    ended_at: null,
    metadata: null,
    ...overrides,
  };
}

function makeSessionResult(overrides: Partial<SessionGetResult> = {}): SessionGetResult {
  return {
    session: makeSession(),
    agents: mockAgents,
    events: [],
    outputs: mockOutputsData,
    ...overrides,
  };
}

function makeAgentMessage(agentId: string, sessionId: string): WSMessage {
  return {
    type: "agent_updated",
    data: makeAgent({ id: agentId, session_id: sessionId }),
    timestamp: "2026-03-05T10:00:00.000Z",
  };
}

function makeSessionMessage(sessionId: string): WSMessage {
  return {
    type: "session_updated",
    data: makeSession({ id: sessionId }),
    timestamp: "2026-03-05T10:00:00.000Z",
  };
}

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    session_id: "sess-1",
    name: "Main Agent",
    type: "main",
    subagent_type: null,
    status: "connected",
    task: null,
    current_tool: null,
    started_at: "2026-03-05T10:00:00.000Z",
    ended_at: null,
    updated_at: "2026-03-05T10:00:00.000Z",
    parent_agent_id: null,
    metadata: null,
    ...overrides,
  };
}

function makeOutputFeed(agentId: string, overrides: Partial<AgentOutputFeed> = {}): AgentOutputFeed {
  return {
    agent_id: agentId,
    transcript_path: null,
    latest_timestamp: "2026-03-05T10:00:00.000Z",
    output_count: 1,
    latest_output: {
      id: `msg-${agentId}-1`,
      agent_id: agentId,
      timestamp: "2026-03-05T10:00:00.000Z",
      markdown: `Output from ${agentId}`,
      source: "transcript",
    },
    outputs: [],
    ...overrides,
  };
}

let mockAgents: Agent[] = [];
let mockOutputsData: SessionOutputs = { agents: [], latest_output_agent_id: null };

vi.mock("../../../lib/api", () => {
  const sessionsGetMock = vi.fn(() =>
    Promise.resolve(makeSessionResult())
  );
  return {
    api: {
      sessions: {
        get: sessionsGetMock,
      },
    },
  };
});

vi.mock("../../../lib/eventBus", () => {
  const subscribeMock = vi.fn(() => () => {});
  return {
    eventBus: {
      subscribe: subscribeMock,
    },
  };
});

describe("WorkflowLiveReader", () => {
  beforeEach(() => {
    mockAgents = [];
    mockOutputsData = { agents: [], latest_output_agent_id: null };
    vi.mocked(api.sessions.get).mockImplementation(() =>
      Promise.resolve(makeSessionResult())
    );
    vi.mocked(eventBus.subscribe).mockImplementation(() => () => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("agent selection preservation", () => {
    it("preserves selected agent when a different agent receives new latest output", async () => {
      // Setup: both agents exist, agent-1 is latest
      mockAgents = [
        makeAgent({ id: "agent-1", name: "Agent One", type: "main" }),
        makeAgent({ id: "agent-2", name: "Agent Two", type: "subagent" }),
      ];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [
          makeOutputFeed("agent-1"),
          makeOutputFeed("agent-2"),
        ],
      };

      const { rerender } = render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // User explicitly clicks Agent Two
      // getAllByText finds the text node inside the span inside the button
      // Use closest('button') to get the actual button element
      const agentTwoSpan = screen.getAllByText("Agent Two")[0]!;
      const agentTwoButton = agentTwoSpan.closest("button")!;
      fireEvent.click(agentTwoButton);

      // Verify Agent Two is now selected (has accent styling)
      expect(agentTwoButton).toHaveClass(/border-accent/);

      // Simulate new output arriving for agent-1 (different agent than selected)
      // Build FRESH output objects to avoid circular reference issues
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [
          {
            agent_id: "agent-1",
            transcript_path: null,
            latest_timestamp: "2026-03-05T10:01:00.000Z",
            output_count: 2,
            latest_output: {
              id: "msg-agent-1-2",
              agent_id: "agent-1",
              timestamp: "2026-03-05T10:01:00.000Z",
              markdown: "New output from agent-1",
              source: "transcript",
            },
            outputs: [],
          },
          {
            agent_id: "agent-2",
            transcript_path: null,
            latest_timestamp: "2026-03-05T10:00:00.000Z",
            output_count: 1,
            latest_output: {
              id: "msg-agent-2-1",
              agent_id: "agent-2",
              timestamp: "2026-03-05T10:00:00.000Z",
              markdown: "Output from agent-2",
              source: "transcript",
            },
            outputs: [],
          },
        ],
      };

      rerender(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Agent Two should STILL be selected - user's explicit choice preserved
      // Check that the Agent Two button still has accent styling
      const agentTwoSpanAfter = screen.getAllByText("Agent Two")[0]!;
      const agentTwoBtnAfter = agentTwoSpanAfter.closest("button")!;
      expect(agentTwoBtnAfter).toHaveClass(/border-accent/);

      // Agent One should still be visible in the list (just not selected)
      const agentOneSpan = screen.getAllByText("Agent One")[0]!;
      const agentOneBtn = agentOneSpan.closest("button");
      expect(agentOneBtn).toBeInTheDocument();
    });

    it("falls back to latest agent when explicitly selected agent disappears", async () => {
      // Setup: two agents exist, agent-1 is latest
      mockAgents = [
        makeAgent({ id: "agent-1", name: "Agent One", type: "main" }),
        makeAgent({ id: "agent-2", name: "Agent Two", type: "subagent" }),
      ];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [
          makeOutputFeed("agent-1"),
          makeOutputFeed("agent-2"),
        ],
      };

      const { rerender } = render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // User explicitly selects Agent Two
      const agentTwoSpan = screen.getAllByText("Agent Two")[0]!;
      const agentTwoBtn = agentTwoSpan.closest("button")!;
      fireEvent.click(agentTwoBtn);

      expect(agentTwoBtn).toHaveClass(/border-accent/);

      // Simulate agent-2 disappearing (session change or teammate removal)
      mockAgents = [
        makeAgent({ id: "agent-1", name: "Agent One", type: "main" }),
      ];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [makeOutputFeed("agent-1")],
      };

      // Trigger fresh loadSession by changing sessionId
      rerender(<WorkflowLiveReader sessionId="sess-1-temp" />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      rerender(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Should fall back to agent-1 (latest), not retain agent-2
      const agentOneSpan = screen.getAllByText("Agent One")[0]!;
      const agentOneBtn = agentOneSpan.closest("button")!;
      expect(agentOneBtn).toHaveClass(/border-accent/);

      // Agent Two button should no longer exist in the DOM
      expect(screen.queryByText("Agent Two")).not.toBeInTheDocument();
    });
  });

  describe("new output indicator", () => {
    it("does not show new output indicator on initial render", async () => {
      mockAgents = [makeAgent({ id: "agent-1", name: "Agent One", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [makeOutputFeed("agent-1")],
      };

      render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      expect(screen.queryByText("New")).not.toBeInTheDocument();
    });

    it("shows new output indicator when new output arrives and user scrolled away from top", async () => {
      mockAgents = [makeAgent({ id: "agent-1", name: "Agent One", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [makeOutputFeed("agent-1")],
      };

      const { rerender } = render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // User scrolls away from top (scroll down to read history, which is BELOW latest output)
      const scrollContainer = screen.getByTestId("output-scroll-container");
      // Directly update scrollTop and fire scroll event
      Object.defineProperty(scrollContainer, "scrollTop", { value: 500, configurable: true });
      Object.defineProperty(scrollContainer, "scrollHeight", { value: 1000, configurable: true });
      Object.defineProperty(scrollContainer, "clientHeight", { value: 600, configurable: true });
      fireEvent.scroll(scrollContainer);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // Simulate new output arriving - update mock to return fresh data
      // Force a new session load by changing sessionId briefly
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [
          {
            agent_id: "agent-1",
            transcript_path: null,
            latest_timestamp: "2026-03-05T10:02:00.000Z",
            output_count: 2,
            latest_output: {
              id: "msg-2",
              agent_id: "agent-1",
              timestamp: "2026-03-05T10:02:00.000Z",
              markdown: "New output",
              source: "transcript",
            },
            outputs: [],
          },
        ],
      };

      // Trigger a fresh loadSession by changing sessionId then back
      rerender(<WorkflowLiveReader sessionId="sess-1-temp" />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });
      rerender(<WorkflowLiveReader sessionId="sess-1" />);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      // New output indicator should appear because user scrolled away from top
      expect(screen.getByText("New")).toBeInTheDocument();
    });
  });

  describe("output card stability", () => {
    it("latest output card has no unstable key prop", async () => {
      mockAgents = [makeAgent({ id: "agent-1", name: "Agent One", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [makeOutputFeed("agent-1")],
      };

      const { container, rerender } = render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const getLatestOutputCard = () =>
        container.querySelector('[class*="border-accent/20"]');

      const cardBefore = getLatestOutputCard();
      expect(cardBefore).toBeTruthy();

      // Simulate output refresh with new output id
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [
          {
            agent_id: "agent-1",
            transcript_path: null,
            latest_timestamp: "2026-03-05T10:01:00.000Z",
            output_count: 2,
            latest_output: {
              id: "msg-2",
              agent_id: "agent-1",
              timestamp: "2026-03-05T10:01:00.000Z",
              markdown: "Updated output",
              source: "transcript",
            },
            outputs: [],
          },
        ],
      };

      rerender(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      // Card should still exist (DOM not remounted)
      const cardAfter = getLatestOutputCard();
      expect(cardAfter).toBeTruthy();
      // The card element should be the same DOM node (stable)
      expect(cardAfter).toBe(cardBefore);
    });
  });

  describe("reduced motion", () => {
    it("does not use animate-slide-up class on latest output card", async () => {
      mockAgents = [makeAgent({ id: "agent-1", name: "Agent One", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "agent-1",
        agents: [makeOutputFeed("agent-1")],
      };

      const { container } = render(<WorkflowLiveReader sessionId="sess-1" />);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });

      const latestOutputCard = container.querySelector('[class*="border-accent/20"]');
      expect(latestOutputCard).toBeTruthy();
      expect(latestOutputCard!.className).not.toContain("animate-slide-up");
    });
  });

  describe("background refresh behavior", () => {
    beforeEach(() => {
      mockAgents = [];
      mockOutputsData = { agents: [], latest_output_agent_id: null };
    });

    it("does not show 'Loading live reader...' during event-driven refresh when prior output is displayed", async () => {
      mockAgents = [
        makeAgent({ id: "ag-r1", name: "BgRefreshAgent1", type: "main" }),
        makeAgent({ id: "ag-r2", name: "BgRefreshAgent2", type: "subagent" }),
      ];
      mockOutputsData = {
        latest_output_agent_id: "ag-r1",
        agents: [makeOutputFeed("ag-r1"), makeOutputFeed("ag-r2")],
      };

      render(<WorkflowLiveReader sessionId="sess-bg1" />);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

      // Verify initial content: no loading placeholder
      expect(screen.queryByText("Loading live reader...")).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /BgRefreshAgent1/i })).toHaveLength(1);

      // Capture subscribe callback
      const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
      const subscribeCallback = subscribeCalls[subscribeCalls.length - 1]?.[0] as (msg: WSMessage) => void;
      expect(subscribeCallback).toBeDefined();

      // Mutate mock data so refresh returns different (newer) data
      mockAgents = [
        ...mockAgents,
        makeAgent({ id: "ag-r3", name: "BgRefreshAgent3", type: "subagent" }),
      ];
      mockOutputsData = {
        latest_output_agent_id: "ag-r3",
        agents: [...mockOutputsData.agents, makeOutputFeed("ag-r3")],
      };

      // Simulate WebSocket event triggering background refresh
      act(() => {
        subscribeCallback(makeAgentMessage("ag-r1", "sess-bg1"));
      });
      // Wait past the 800ms debounce
      await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });

      // Loading placeholder must NOT appear during background refresh
      expect(screen.queryByText("Loading live reader...")).not.toBeInTheDocument();
      // Original content still visible
      expect(screen.getAllByRole("button", { name: /BgRefreshAgent1/i })).toHaveLength(1);
    });

    it("latest output DOM remains visible during delayed refresh resolution", async () => {
      mockAgents = [makeAgent({ id: "ag-l1", name: "BgRefreshAgent1", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "ag-l1",
        agents: [makeOutputFeed("ag-l1")],
      };

      const { container } = render(<WorkflowLiveReader sessionId="sess-bg2" />);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

      // Capture the latest output card before refresh
      const getLatestCard = () => container.querySelector('[class*="border-accent/20"]');
      const cardBefore = getLatestCard();
      expect(cardBefore).toBeTruthy();

      let resolveRefresh: ((value: SessionGetResult) => void) | null = null;
      vi.mocked(api.sessions.get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          })
      );

      const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
      const subscribeCallback = subscribeCalls[subscribeCalls.length - 1]?.[0] as (msg: WSMessage) => void;

      act(() => {
        subscribeCallback(makeAgentMessage("ag-l1", "sess-bg2"));
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });

      const cardDuringRefresh = getLatestCard();
      expect(screen.queryByText("Loading live reader...")).not.toBeInTheDocument();
      expect(cardDuringRefresh).toBeTruthy();
      expect(cardDuringRefresh).toBe(cardBefore);

      await act(async () => {
        resolveRefresh?.(makeSessionResult({
          session: makeSession({ id: "sess-bg2" }),
          agents: [
            makeAgent({ id: "ag-l1", name: "BgRefreshAgent1", type: "main" }),
            makeAgent({ id: "ag-l2", name: "BgRefreshAgent2", type: "subagent" }),
          ],
          outputs: {
            latest_output_agent_id: "ag-l2",
            agents: [makeOutputFeed("ag-l1"), makeOutputFeed("ag-l2")],
          },
        }));
      });
    });

    it("stale refresh responses do not overwrite newer session selection", async () => {
      mockAgents = [makeAgent({ id: "ag-s1", name: "StaleAgent1", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "ag-s1",
        agents: [makeOutputFeed("ag-s1")],
      };

      const { rerender } = render(<WorkflowLiveReader sessionId="sess-bg3" />);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

      expect(screen.getAllByRole("button", { name: /StaleAgent1/i })).toHaveLength(1);

      let resolveStaleRefresh: ((value: SessionGetResult) => void) | null = null;
      vi.mocked(api.sessions.get).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleRefresh = resolve;
          })
      );

      const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
      const subscribeCallback = subscribeCalls[subscribeCalls.length - 1]?.[0] as (msg: WSMessage) => void;

      act(() => {
        subscribeCallback(makeSessionMessage("sess-bg3"));
      });
      await act(async () => { await new Promise((r) => setTimeout(r, 1000)); });

      vi.mocked(api.sessions.get).mockImplementationOnce(() =>
        Promise.resolve(makeSessionResult({
          session: makeSession({ id: "sess-bg-new", name: "New Session" }),
          agents: [makeAgent({ id: "agent-new", name: "AgentNew", type: "main" })],
          outputs: {
            latest_output_agent_id: "agent-new",
            agents: [makeOutputFeed("agent-new")],
          },
        }))
      );

      rerender(<WorkflowLiveReader sessionId="sess-bg-new" />);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

      await act(async () => {
        resolveStaleRefresh?.(makeSessionResult({
          session: makeSession({ id: "sess-bg3", name: "Old Session" }),
          agents: [makeAgent({ id: "agent-old", name: "AgentOld", type: "main" })],
          outputs: {
            latest_output_agent_id: "agent-old",
            agents: [makeOutputFeed("agent-old")],
          },
        }));
      });

      expect(screen.getAllByRole("button", { name: /AgentNew/i })).toHaveLength(1);
      expect(screen.queryByText("AgentOld")).not.toBeInTheDocument();
    });

    it("pending debounce timer is cleaned up on session change", async () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      mockAgents = [makeAgent({ id: "ag-c1", name: "CleanupAgent1", type: "main" })];
      mockOutputsData = {
        latest_output_agent_id: "ag-c1",
        agents: [makeOutputFeed("ag-c1")],
      };

      const { rerender } = render(<WorkflowLiveReader sessionId="sess-bg4" />);
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });

      const subscribeCalls = vi.mocked(eventBus.subscribe).mock.calls;
      const subscribeCallback = subscribeCalls[subscribeCalls.length - 1]?.[0] as (msg: WSMessage) => void;

      // Set a debounce timer via the event callback
      act(() => {
        subscribeCallback(makeAgentMessage("ag-c1", "sess-bg4"));
      });

      // Changing session should trigger cleanup which calls clearTimeout
      clearTimeoutSpy.mockClear();
      rerender(<WorkflowLiveReader sessionId="sess-bg5" />);

      // clearTimeout must have been called to cancel the pending debounce
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
});
