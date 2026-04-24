import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { WorkflowLiveReader } from "../WorkflowLiveReader";
import type { Agent, AgentOutputFeed, SessionOutputs } from "../../../lib/types";

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

vi.mock("../../../lib/api", () => ({
  api: {
    sessions: {
      get: vi.fn(() =>
        Promise.resolve({
          session: { id: "sess-1", name: "Test Session", status: "active" },
          agents: mockAgents,
          outputs: mockOutputsData,
        })
      ),
    },
  },
}));

vi.mock("../../../lib/eventBus", () => ({
  eventBus: {
    subscribe: vi.fn(() => () => {}),
  },
}));

describe("WorkflowLiveReader", () => {
  beforeEach(() => {
    mockAgents = [];
    mockOutputsData = { agents: [], latest_output_agent_id: null };
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
});
