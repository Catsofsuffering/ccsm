import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ControlPlaneGraph } from "../ControlPlaneGraph";

describe("ControlPlaneGraph", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("selects a node when the node body is clicked", () => {
    const onSelectNode = vi.fn();

    render(
      <ControlPlaneGraph
        projectKey="test-project"
        selectedNodeId={null}
        onSelectNode={onSelectNode}
        nodes={[
          {
            id: "project:test",
            label: "Test Project",
            subtitle: "Implementing",
            kind: "project",
            status: "ready",
            column: 0,
            dispatcherPhase: "dispatch",
            routing: {
              defaultActionType: "replay",
              availableActions: ["replay", "reopen"],
              byAction: {},
            },
            intervention: null,
          },
        ]}
        edges={[]}
      />
    );

    fireEvent.click(screen.getByTestId("control-plane-node-project:test"));
    expect(onSelectNode).toHaveBeenCalledWith("project:test");
  });

  it("persists drag layout changes in local storage", async () => {
    render(
      <ControlPlaneGraph
        projectKey="drag-project"
        selectedNodeId={null}
        onSelectNode={() => {}}
        nodes={[
          {
            id: "project:test",
            label: "Test Project",
            subtitle: "Implementing",
            kind: "project",
            status: "ready",
            column: 0,
            dispatcherPhase: "dispatch",
            routing: {
              defaultActionType: "replay",
              availableActions: ["replay", "reopen"],
              byAction: {},
            },
            intervention: null,
          },
        ]}
        edges={[]}
      />
    );

    fireEvent.pointerDown(screen.getByTestId("control-plane-drag-project:test"), {
      clientX: 60,
      clientY: 60,
    });
    fireEvent.pointerMove(window, { clientX: 180, clientY: 140 });
    fireEvent.pointerUp(window);

    await waitFor(() => {
      const stored = JSON.parse(
        localStorage.getItem("control-plane-layout:drag-project") || "{}"
      );
      expect(stored["project:test"]).toBeTruthy();
      expect(stored["project:test"].x).toBeGreaterThan(28);
      expect(stored["project:test"].y).toBeGreaterThan(32);
    });
  });
});
