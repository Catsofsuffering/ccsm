import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { MonitorEvent, MonitorSnapshot } from "./types";

class MockEventSource {
  static instances: MockEventSource[] = [];

  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close(): void {}

  emit(event: MonitorEvent): void {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }
}

const snapshot: MonitorSnapshot = {
  run_id: "run-1",
  backend: "codex",
  status: "running",
  started_at: "2026-04-14T03:00:00Z",
  updated_at: "2026-04-14T03:01:00Z",
  history_dir: "/tmp/run-1",
  summary: {
    total: 1,
    pending: 0,
    running: 1,
    completed: 0,
    failed: 0,
    blocked: 0,
  },
  sessions: [
    {
      id: "task-a",
      task_id: "task-a",
      backend: "codex",
      task: "Implement UI",
      status: "running",
      created_at: "2026-04-14T03:00:00Z",
      update_time: "2026-04-14T03:01:00Z",
      current_activity: "Streaming output",
      done: false,
    },
  ],
};

describe("App", () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot,
    } as Response);
    vi.stubGlobal("EventSource", MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the initial monitoring snapshot", async () => {
    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "CODEX execution dashboard" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Implement UI")).toHaveLength(2);
    expect(screen.getAllByText("Streaming output").length).toBeGreaterThanOrEqual(2);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0]?.url).toBe("/api/events");
  });

  it("applies live monitoring events", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "CODEX execution dashboard" });

    MockEventSource.instances[0]?.emit({
      type: "session_finished",
      run_id: "run-1",
      timestamp: "2026-04-14T03:02:00Z",
      summary: {
        total: 1,
        pending: 0,
        running: 0,
        completed: 1,
        failed: 0,
        blocked: 0,
      },
      session_id: "task-a",
      session: {
        ...snapshot.sessions[0],
        status: "completed",
        update_time: "2026-04-14T03:02:00Z",
        end_time: "2026-04-14T03:02:00Z",
        current_activity: "Done",
        done: true,
      },
      message: "task completed",
    });

    await waitFor(() => {
      expect(screen.getAllByText("completed").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Run complete")).toBeInTheDocument();
    expect(screen.getByText(/task-a: task completed/i)).toBeInTheDocument();
  });
});
