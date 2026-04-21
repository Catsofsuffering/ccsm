const { Router } = require("express");
const path = require("node:path");
const { db, stmts } = require("../db");
const {
  buildBoardPayload,
  resolveWorkspaceRoot,
} = require("../lib/openspec-state");
const {
  listWorkerAdapters,
  selectAdapterForNode,
} = require("../lib/worker-runtime");
const {
  createDispatchIntentAndFetch,
  listProjectDispatches,
  maybeLaunchDispatch,
  normalizeDispatchRecord,
} = require("../lib/worker-dispatch");

const router = Router();

function titleizeChange(name) {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function actionLabel(actionType) {
  return actionType === "reopen" ? "Reopen" : "Replay";
}

function inferWorkerRuntime(model) {
  const value = String(model || "").toLowerCase();
  if (!value) return "unknown";
  if (value.includes("claude")) return "claude";
  if (value.includes("codex") || value.includes("gpt") || value.startsWith("o")) return "codex";
  return "generic";
}

function listWorkspaceSessions(workspaceRoot, limit = 12) {
  const normalizedRoot = workspaceRoot.toLowerCase();

  return db
    .prepare(
      `SELECT
        s.*,
        COUNT(a.id) as agent_count,
        SUM(CASE WHEN a.status IN ('working', 'connected') THEN 1 ELSE 0 END) as running_agents
       FROM sessions s
       LEFT JOIN agents a ON a.session_id = s.id
       WHERE s.cwd IS NOT NULL AND LOWER(s.cwd) LIKE ?
       GROUP BY s.id
       ORDER BY s.updated_at DESC
       LIMIT ?`
    )
    .all(`${normalizedRoot}%`, limit)
    .map((session) => ({
      id: session.id,
      name: session.name,
      status: session.status,
      cwd: session.cwd,
      model: session.model,
      updatedAt: session.updated_at,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      agentCount: Number(session.agent_count || 0),
      runningAgents: Number(session.running_agents || 0),
      runtime: inferWorkerRuntime(session.model),
    }));
}

function summarizeWorkers(sessions) {
  const workerMap = new Map();

  for (const session of sessions) {
    const key = `${session.runtime}:${session.model || "unknown"}`;
    const current = workerMap.get(key) || {
      id: key,
      runtime: session.runtime,
      label: session.model || "unknown model",
      activeSessions: 0,
      totalSessions: 0,
      runningAgents: 0,
      lastActivity: null,
    };

    current.totalSessions += 1;
    if (session.status === "active") current.activeSessions += 1;
    current.runningAgents += session.runningAgents;
    if (!current.lastActivity || (session.updatedAt || "") > current.lastActivity) {
      current.lastActivity = session.updatedAt || null;
    }

    workerMap.set(key, current);
  }

  return [...workerMap.values()].sort((left, right) => right.activeSessions - left.activeSessions);
}

function latestTimestamp(values) {
  const filtered = values.filter(Boolean);
  if (filtered.length === 0) return null;
  return filtered.sort().at(-1) || null;
}

function summarizeWorkerHealth(adapters, sessions, workers, dispatches) {
  return adapters.map((adapter) => {
    const runtimeSessions = sessions.filter((session) => session.runtime === adapter.runtime);
    const runtimeWorkers = workers.filter((worker) => worker.runtime === adapter.runtime);
    const runtimeDispatches = dispatches.filter(
      (dispatch) => dispatch.adapterId === adapter.id || dispatch.runtime === adapter.runtime
    );
    const launchReady = adapter.available && adapter.id !== "codex-cli";
    const queuedDispatches = runtimeDispatches.filter((dispatch) => dispatch.status === "queued").length;
    const runningDispatches = runtimeDispatches.filter((dispatch) => dispatch.status === "running").length;
    const blockedDispatches = runtimeDispatches.filter((dispatch) => dispatch.status === "blocked").length;
    const failedDispatches = runtimeDispatches.filter((dispatch) => dispatch.status === "failed").length;
    const completedDispatches = runtimeDispatches.filter((dispatch) => dispatch.status === "completed").length;
    const activeSessions = runtimeSessions.filter((session) => session.status === "active").length;
    const runningAgents = runtimeSessions.reduce(
      (sum, session) => sum + Number(session.runningAgents || 0),
      0
    );
    const lastFailure = runtimeDispatches.find((dispatch) => dispatch.status === "failed" && dispatch.error);
    const lastActivity = latestTimestamp([
      ...runtimeSessions.map((session) => session.updatedAt),
      ...runtimeWorkers.map((worker) => worker.lastActivity),
      ...runtimeDispatches.map((dispatch) => dispatch.updatedAt),
    ]);

    let health = "idle";
    let summary = "Adapter is available and waiting for the next routed task.";

    if (!adapter.available) {
      health = "offline";
      summary = `Adapter is unavailable. Check ${adapter.envKey} or PATH resolution before routing work here.`;
    } else if (failedDispatches > 0) {
      health = "degraded";
      summary = `${failedDispatches} dispatch ${failedDispatches === 1 ? "failure" : "failures"} need operator attention.`;
    } else if (runningDispatches > 0 || activeSessions > 0 || runningAgents > 0) {
      health = "active";
      summary = `Worker runtime is actively serving ${Math.max(runningDispatches, activeSessions)} live execution path${Math.max(runningDispatches, activeSessions) === 1 ? "" : "s"}.`;
    } else if (blockedDispatches > 0 || (!launchReady && queuedDispatches > 0)) {
      health = "blocked";
      summary = launchReady
        ? "Queued work is waiting on runtime capacity or operator follow-up."
        : "Shared worker protocol is in place, but this adapter is still scaffolded for launch.";
    } else if (!launchReady) {
      summary = "Protocol-compatible adapter is detected, but launch wiring remains intentionally deferred.";
    }

    return {
      id: adapter.id,
      runtime: adapter.runtime,
      label: `${titleizeChange(adapter.runtime)} worker`,
      adapterId: adapter.id,
      adapterAvailable: adapter.available,
      transport: adapter.transport,
      source: adapter.source,
      command: adapter.command,
      launchReady,
      health,
      summary,
      observedModels: [...new Set(runtimeWorkers.map((worker) => worker.label))].sort(),
      activeSessions,
      totalSessions: runtimeSessions.length,
      runningAgents,
      queuedDispatches,
      runningDispatches,
      blockedDispatches,
      failedDispatches,
      completedDispatches,
      lastActivity,
      lastError: lastFailure?.error || null,
    };
  });
}

function listProjectActions(projectName, limit = 20) {
  return db
    .prepare(
      `SELECT *
       FROM control_plane_actions
       WHERE project_name = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`
    )
    .all(projectName, limit)
    .map((row) => ({
      id: row.id,
      projectName: row.project_name,
      nodeId: row.node_id,
      actionType: row.action_type,
      status: row.status,
      source: row.source,
      notes: row.notes,
      payload: row.payload ? JSON.parse(row.payload) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

function latestDispatchByNode(dispatches) {
  const latest = new Map();
  for (const dispatch of dispatches) {
    if (!latest.has(dispatch.nodeId)) latest.set(dispatch.nodeId, dispatch);
  }
  return latest;
}

function latestActionByNode(actions) {
  const latest = new Map();
  for (const action of actions) {
    if (!latest.has(action.nodeId)) latest.set(action.nodeId, action);
  }
  return latest;
}

function deriveDispatcherPhase(change, node) {
  if (node.kind === "worker") {
    return node.status === "active" ? "observe" : "dispatch";
  }

  if (node.kind === "session") {
    if (node.status === "active") return "observe";
    if (node.status === "completed") return "reconcile";
    return "complete-or-reopen";
  }

  if (node.kind === "artifact") {
    return node.status === "completed" ? "reconcile" : "bootstrap";
  }

  if (node.kind === "task") {
    if (change.taskProgress.remaining === 0 && change.taskProgress.total > 0) {
      return "complete-or-reopen";
    }
    return change.readyToApply ? "dispatch" : "reason";
  }

  if (change.stage === "complete") return "complete-or-reopen";
  if (change.stage === "implementing") return "dispatch";
  if (["proposal", "design"].includes(change.stage)) return "bootstrap";
  return "reason";
}

function deriveAvailableActions(node) {
  if (node.kind === "worker") return ["replay"];
  if (node.kind === "artifact") return ["reopen"];
  if (node.kind === "session" || node.kind === "project" || node.kind === "task") {
    return ["replay", "reopen"];
  }
  return ["reopen"];
}

function selectDefaultActionType(node, change, availableActions) {
  if (availableActions.length === 0) return null;
  if (node.status === "completed" || node.status === "replay-requested") {
    return availableActions.includes("replay") ? "replay" : availableActions[0];
  }
  if (node.status === "reopened" || node.status === "pending") {
    return availableActions.includes("reopen") ? "reopen" : availableActions[0];
  }
  if (change.readyToApply && availableActions.includes("replay")) return "replay";
  if (!change.readyToApply && availableActions.includes("reopen")) return "reopen";
  return availableActions[0];
}

function decorateGraphNode(change, node, adapters, latestAction) {
  const availableActions = deriveAvailableActions(node);
  const defaultActionType = selectDefaultActionType(node, change, availableActions);
  const previews = {};

  for (const actionType of availableActions) {
    previews[actionType] = selectAdapterForNode({
      change,
      nodeId: node.id,
      actionType,
      adapters,
    });
  }

  return {
    ...node,
    dispatcherPhase: deriveDispatcherPhase(change, node),
    routing: {
      defaultActionType,
      availableActions,
      byAction: previews,
    },
    intervention: latestAction
      ? {
          actionType: latestAction.actionType,
          status: latestAction.status,
          createdAt: latestAction.createdAt,
          notes: latestAction.notes,
        }
      : null,
  };
}

function buildBlackboard(change, sessions, workers, workspaceRoot, dispatches = []) {
  const completedArtifacts = change.artifacts.filter((artifact) => artifact.done);
  const pendingArtifacts = change.artifacts.filter((artifact) => !artifact.done);
  const latestDispatch = dispatches[0] || null;

  return {
    facts: [
      { id: "workspace", label: `Workspace: ${workspaceRoot}`, kind: "workspace" },
      { id: "stage", label: `Current stage: ${change.stageLabel}`, kind: "stage" },
      { id: "artifacts", label: `${completedArtifacts.length}/${change.artifacts.length} artifacts complete`, kind: "artifact-progress" },
      { id: "tasks", label: `${change.taskProgress.completed}/${change.taskProgress.total} tasks complete`, kind: "task-progress" },
      { id: "sessions", label: `${sessions.length} recent sessions observed`, kind: "session-count" },
    ],
    intents: [
      change.nextArtifact
        ? { id: "next-artifact", label: `Advance ${change.nextArtifact}`, status: "pending" }
        : { id: "execution", label: change.readyToApply ? "Dispatch implementation work" : "Reconcile execution state", status: change.readyToApply ? "ready" : "active" },
      ...(change.readyToApply ? [{ id: "review", label: "Prepare review and acceptance path", status: "queued" }] : []),
    ],
    hints: [
      ...(latestDispatch
        ? [{
            id: `dispatch:${latestDispatch.id}`,
            label: `Latest dispatch: ${latestDispatch.actionType} for ${latestDispatch.nodeId}`,
            kind: "dispatch-intent",
            status: latestDispatch.status,
          }]
        : []),
      ...pendingArtifacts.slice(0, 3).map((artifact) => ({
        id: `hint:${artifact.id}`,
        label: `Pending artifact: ${artifact.id}`,
      })),
      ...change.applyRequires.map((item) => ({
        id: `apply:${item}`,
        label: `Apply requires: ${item}`,
      })),
    ],
    settings: [
      { id: "source", label: "Durable source", value: "OpenSpec" },
      { id: "layout", label: "Graph layout", value: "Local-only drag layout" },
      { id: "workers", label: "Observed worker runtimes", value: workers.map((worker) => worker.runtime).filter(Boolean).join(", ") || "none" },
      { id: "adapters", label: "Worker adapters", value: listWorkerAdapters().map((adapter) => `${adapter.id}:${adapter.available ? "up" : "down"}`).join(", ") },
    ],
  };
}

function buildProjectGraph(change, sessions, workers, adapters = [], actions = [], dispatches = []) {
  const nodes = [];
  const edges = [];
  const actionMap = latestActionByNode(actions);
  const dispatchMap = latestDispatchByNode(dispatches);

  function withInterventionStatus(node) {
    const latestAction = actionMap.get(node.id);
    const latestDispatch = dispatchMap.get(node.id);
    if (latestDispatch?.status === "running") {
      return {
        ...node,
        status: "active",
      };
    }
    if (latestDispatch?.status === "failed") {
      return {
        ...node,
        status: "error",
      };
    }
    if (latestDispatch?.status === "completed" && node.kind !== "project") {
      return {
        ...node,
        status: "completed",
      };
    }
    if (!latestAction) return node;

    return {
      ...node,
      status: latestAction.actionType === "reopen" ? "reopened" : "replay-requested",
    };
  }

  nodes.push(withInterventionStatus({
    id: `project:${change.name}`,
    label: titleizeChange(change.name),
    subtitle: change.stageLabel,
    kind: "project",
    status: change.readyToApply ? "ready" : change.stage,
    column: 0,
  }));

  for (const artifact of change.artifacts) {
    const artifactId = `artifact:${artifact.id}`;
    nodes.push(withInterventionStatus({
      id: artifactId,
      label: artifact.id,
      subtitle: artifact.done ? "artifact complete" : artifact.status,
      kind: "artifact",
      status: artifact.done ? "completed" : "pending",
      column: 1,
    }));
    edges.push({
      id: `edge:project:${change.name}->${artifactId}`,
      source: `project:${change.name}`,
      target: artifactId,
      kind: "artifact",
    });
  }

  nodes.push(withInterventionStatus({
    id: `tasks:${change.name}`,
    label: "Task Plan",
    subtitle: `${change.taskProgress.completed}/${change.taskProgress.total} complete`,
    kind: "task",
    status: change.taskProgress.remaining === 0 && change.taskProgress.total > 0 ? "completed" : "active",
    column: 2,
  }));

  const latestArtifact = change.nextArtifact
    ? `artifact:${change.nextArtifact}`
    : change.artifacts.length > 0
      ? `artifact:${change.artifacts[change.artifacts.length - 1].id}`
      : `project:${change.name}`;

  edges.push({
    id: `edge:${latestArtifact}->tasks:${change.name}`,
    source: latestArtifact,
    target: `tasks:${change.name}`,
    kind: "progression",
  });

  const relevantSessions = sessions.slice(0, 4);
  relevantSessions.forEach((session, index) => {
    const sessionId = `session:${session.id}`;
    nodes.push(withInterventionStatus({
      id: sessionId,
      label: session.name || session.id,
      subtitle: `${session.runtime} / ${session.status}`,
      kind: "session",
      status: session.status,
      column: 3,
    }));
    edges.push({
      id: `edge:tasks:${change.name}->${sessionId}`,
      source: `tasks:${change.name}`,
      target: sessionId,
      kind: index === 0 ? "dispatch" : "observe",
    });
  });

  workers.forEach((worker) => {
    const workerId = `worker:${worker.id}`;
    nodes.push(withInterventionStatus({
      id: workerId,
      label: worker.label,
      subtitle: `${worker.activeSessions} active sessions`,
      kind: "worker",
      status: worker.activeSessions > 0 ? "active" : "idle",
      column: 4,
    }));

    const sourceId = relevantSessions.length > 0 ? `session:${relevantSessions[0].id}` : `tasks:${change.name}`;
    edges.push({
      id: `edge:${sourceId}->${workerId}`,
      source: sourceId,
      target: workerId,
      kind: "worker",
    });
  });

  const decoratedNodes = nodes.map((node) =>
    decorateGraphNode(change, withInterventionStatus(node), adapters, actionMap.get(node.id) || null)
  );

  return {
    nodes: decoratedNodes,
    edges,
    stats: {
      totalNodes: decoratedNodes.length,
      totalEdges: edges.length,
      runningNodes: decoratedNodes.filter((node) => ["active", "ready"].includes(node.status)).length,
      completedNodes: decoratedNodes.filter((node) => node.status === "completed").length,
    },
  };
}

function buildProjectActivity(change, sessions, workers, actions, dispatches, limit = 36) {
  const projectNodeId = `project:${change.name}`;
  const taskNodeId = `tasks:${change.name}`;
  const items = [];

  for (const session of sessions.slice(0, 6)) {
    const workerNodeId = `worker:${session.runtime}:${session.model || "unknown"}`;
    const events = stmts.listEventsBySession.all(session.id).slice(0, 8);

    for (const event of events) {
      items.push({
        id: `event:${event.id}`,
        type: "event",
        timestamp: event.created_at,
        title: event.summary || event.event_type,
        detail: [event.event_type, event.tool_name ? `tool ${event.tool_name}` : null, session.name || session.id]
          .filter(Boolean)
          .join(" / "),
        status: event.event_type === "APIError" || session.status === "error" ? "error" : event.event_type,
        source: "runtime",
        sessionId: session.id,
        nodeId: null,
        runtime: session.runtime,
        toolName: event.tool_name,
        relatedNodeIds: [...new Set([projectNodeId, taskNodeId, `session:${session.id}`, workerNodeId])],
      });
    }
  }

  for (const action of actions) {
    const routedRuntime = action.payload?.dispatch?.preferredRuntime || null;
    const relatedWorkerNodeIds = routedRuntime
      ? workers
          .filter((worker) => worker.runtime === routedRuntime)
          .map((worker) => `worker:${worker.id}`)
      : [];

    items.push({
      id: `action:${action.id}`,
      type: "action",
      timestamp: action.createdAt,
      title: `${actionLabel(action.actionType)} requested`,
      detail: action.notes || action.nodeId,
      status: action.status,
      source: action.source,
      sessionId: null,
      nodeId: action.nodeId,
      runtime: routedRuntime,
      toolName: null,
      relatedNodeIds: [...new Set([projectNodeId, taskNodeId, action.nodeId, ...relatedWorkerNodeIds])],
    });
  }

  for (const dispatch of dispatches) {
    const relatedWorkerNodeIds = dispatch.runtime
      ? workers
          .filter((worker) => worker.runtime === dispatch.runtime)
          .map((worker) => `worker:${worker.id}`)
      : [];

    items.push({
      id: `dispatch:${dispatch.id}`,
      type: "dispatch",
      timestamp: dispatch.startedAt || dispatch.createdAt,
      title: `${actionLabel(dispatch.actionType)} dispatched`,
      detail: dispatch.error || [dispatch.nodeId, dispatch.adapterId || dispatch.runtime || "unassigned"].join(" / "),
      status: dispatch.status,
      source: dispatch.source,
      sessionId: null,
      nodeId: dispatch.nodeId,
      runtime: dispatch.runtime,
      toolName: dispatch.command,
      relatedNodeIds: [...new Set([projectNodeId, taskNodeId, dispatch.nodeId, ...relatedWorkerNodeIds])],
    });
  }

  return items
    .sort((left, right) => {
      const timeCompare = String(right.timestamp || "").localeCompare(String(left.timestamp || ""));
      if (timeCompare !== 0) return timeCompare;
      return String(right.id).localeCompare(String(left.id));
    })
    .slice(0, limit);
}

router.get("/overview", async (_req, res) => {
  try {
    const workspaceRoot = resolveWorkspaceRoot();
    const board = await buildBoardPayload(workspaceRoot);
    const sessions = listWorkspaceSessions(workspaceRoot);
    const workers = summarizeWorkers(sessions);
    const adapters = listWorkerAdapters();

    const projects = board.changes.map((change) => {
      const actions = listProjectActions(change.name, 10);
      const dispatches = listProjectDispatches(change.name, 10);
      const graph = buildProjectGraph(change, sessions, workers, adapters, actions, dispatches);
      const dispatch = selectAdapterForNode({
        change,
        nodeId: `project:${change.name}`,
        actionType: change.readyToApply ? "replay" : "reopen",
        adapters,
      });
      return {
        name: change.name,
        title: titleizeChange(change.name),
        stage: change.stage,
        stageLabel: change.stageLabel,
        updatedAt: change.lastModified,
        readyToApply: change.readyToApply,
        nextArtifact: change.nextArtifact,
        changePath: change.changePath,
        artifactSummary: change.artifactSummary,
        taskProgress: change.taskProgress,
        sessionCount: sessions.length,
        activeRunCount: sessions.filter((session) => session.status === "active").length,
        workerRuntimes: workers.map((worker) => worker.runtime),
        graphSummary: graph.stats,
        actionCount: actions.length,
        latestActionAt: actions[0]?.createdAt || null,
        dispatchCount: dispatches.length,
        latestDispatchAt: dispatches[0]?.createdAt || null,
        dispatch,
      };
    });

    res.json({
      workspaceRoot,
      generatedAt: new Date().toISOString(),
      summary: {
        totalProjects: projects.length,
        activeProjects: projects.filter((project) => project.stage !== "complete").length,
        readyProjects: projects.filter((project) => project.readyToApply).length,
        activeWorkers: workers.filter((worker) => worker.activeSessions > 0).length,
        runningSessions: sessions.filter((session) => session.status === "active").length,
        availableAdapters: adapters.filter((adapter) => adapter.available).length,
      },
      adapters,
      workers,
      projects,
    });
  } catch (error) {
    res.status(503).json({
      error: {
        code: "CONTROL_PLANE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Failed to load control-plane state",
      },
    });
  }
});

router.get("/projects/:name", async (req, res) => {
  try {
    const workspaceRoot = resolveWorkspaceRoot();
    const board = await buildBoardPayload(workspaceRoot);
    const change = board.changes.find((item) => item.name === req.params.name);
    if (!change) {
      res.status(404).json({
        error: {
          code: "CONTROL_PLANE_PROJECT_NOT_FOUND",
          message: `Project '${req.params.name}' was not found`,
        },
      });
      return;
    }

    const sessions = listWorkspaceSessions(workspaceRoot);
    const workers = summarizeWorkers(sessions);
    const actions = listProjectActions(change.name, 20);
    const dispatches = listProjectDispatches(change.name, 20);
    const adapters = listWorkerAdapters();
    const blackboard = buildBlackboard(change, sessions, workers, workspaceRoot, dispatches);
    if (actions.length > 0) {
      blackboard.hints.unshift({
        id: `intervention:${actions[0].id}`,
        label: `Latest operator action: ${actions[0].actionType} on ${actions[0].nodeId}`,
        kind: "operator-action",
        status: actions[0].status,
      });
    }
    const graph = buildProjectGraph(change, sessions, workers, adapters, actions, dispatches);
    const dispatch = selectAdapterForNode({
      change,
      nodeId: `project:${change.name}`,
      actionType: change.readyToApply ? "replay" : "reopen",
      adapters,
    });
    const workerHealth = summarizeWorkerHealth(adapters, sessions, workers, dispatches);
    const activity = buildProjectActivity(change, sessions, workers, actions, dispatches);

    res.json({
      workspaceRoot,
      generatedAt: new Date().toISOString(),
      project: {
        ...change,
        title: titleizeChange(change.name),
        changeDir: path.join(workspaceRoot, change.changePath),
      },
      blackboard,
      actions,
      dispatches,
      adapters,
      dispatch,
      workers,
      workerHealth,
      sessions,
      activity,
      graph,
    });
  } catch (error) {
    res.status(503).json({
      error: {
        code: "CONTROL_PLANE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Failed to load control-plane project",
      },
    });
  }
});

router.post("/projects/:name/actions", async (req, res) => {
  try {
    const { nodeId, actionType, notes } = req.body || {};
    if (!nodeId || typeof nodeId !== "string") {
      res.status(400).json({
        error: {
          code: "CONTROL_PLANE_INVALID_ACTION",
          message: "nodeId is required",
        },
      });
      return;
    }

    if (!["replay", "reopen"].includes(actionType)) {
      res.status(400).json({
        error: {
          code: "CONTROL_PLANE_INVALID_ACTION",
          message: "actionType must be 'replay' or 'reopen'",
        },
      });
      return;
    }

    const workspaceRoot = resolveWorkspaceRoot();
    const board = await buildBoardPayload(workspaceRoot);
    const change = board.changes.find((item) => item.name === req.params.name);
    if (!change) {
      res.status(404).json({
        error: {
          code: "CONTROL_PLANE_PROJECT_NOT_FOUND",
          message: `Project '${req.params.name}' was not found`,
        },
      });
      return;
    }

    const sessions = listWorkspaceSessions(workspaceRoot);
    const workers = summarizeWorkers(sessions);
    const adapters = listWorkerAdapters();
    const graph = buildProjectGraph(change, sessions, workers, adapters);
    const nodeExists = graph.nodes.some((node) => node.id === nodeId);
    if (!nodeExists) {
      res.status(404).json({
        error: {
          code: "CONTROL_PLANE_NODE_NOT_FOUND",
          message: `Node '${nodeId}' was not found in project '${req.params.name}'`,
        },
      });
      return;
    }

    const dispatch = selectAdapterForNode({
      change,
      nodeId,
      actionType,
      adapters,
    });

    db.prepare(
      `INSERT INTO control_plane_actions
       (project_name, node_id, action_type, status, source, notes, payload, created_at, updated_at)
       VALUES (?, ?, ?, 'requested', 'human', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
    ).run(
      change.name,
      nodeId,
      actionType,
      typeof notes === "string" && notes.trim() ? notes.trim() : null,
      JSON.stringify({
        projectStage: change.stage,
        readyToApply: change.readyToApply,
        dispatch,
      })
    );

    const action = db
      .prepare("SELECT * FROM control_plane_actions WHERE id = last_insert_rowid()")
      .get();

    let intent = createDispatchIntentAndFetch({
      change,
      nodeId,
      actionType,
      actionId: action.id,
      dispatch,
      workspaceRoot,
    });
    intent = maybeLaunchDispatch({
      intent,
      workspaceRoot,
    });

    res.status(201).json({
      dispatch,
      intent: normalizeDispatchRecord(intent),
      action: {
        id: action.id,
        projectName: action.project_name,
        nodeId: action.node_id,
        actionType: action.action_type,
        status: action.status,
        source: action.source,
        notes: action.notes,
        payload: action.payload ? JSON.parse(action.payload) : null,
        createdAt: action.created_at,
        updatedAt: action.updated_at,
      },
    });
  } catch (error) {
    res.status(503).json({
      error: {
        code: "CONTROL_PLANE_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Failed to record control-plane action",
      },
    });
  }
});

module.exports = router;
