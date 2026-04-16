const { Router } = require("express");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { db } = require("../db");

const execFileAsync = promisify(execFile);
const router = Router();
const OPEN_SPEC_CACHE_TTL_MS = Number(process.env.OPENSPEC_BOARD_CACHE_TTL_MS || 5000);
let boardCache = null;

const STAGE_ORDER = ["proposal", "design", "specs", "tasks", "implementing", "complete"];
const STAGE_LABELS = {
  proposal: "Scoping",
  design: "Designing",
  specs: "Specifying",
  tasks: "Task Planning",
  implementing: "Executing",
  complete: "Completed",
};

function expandCandidateRoots(startPath) {
  if (!startPath || typeof startPath !== "string") return [];

  const roots = [];
  let current = path.resolve(startPath);

  while (true) {
    roots.push(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return roots;
}

function getSessionWorkspaceCandidates() {
  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT cwd, MAX(updated_at) as last_seen
         FROM sessions
         WHERE cwd IS NOT NULL AND TRIM(cwd) != ''
         GROUP BY cwd
         ORDER BY last_seen DESC
         LIMIT 50`
      )
      .all();

    return rows.flatMap((row) => expandCandidateRoots(row.cwd));
  } catch {
    return [];
  }
}

function workspaceCandidates() {
  const roots = [
    process.env.OPENSPEC_WORKSPACE_ROOT,
    process.env.CCG_WORKSPACE_ROOT,
    ...getSessionWorkspaceCandidates(),
    process.cwd(),
    path.resolve(__dirname, "..", ".."),
    path.resolve(__dirname, "..", "..", ".."),
  ].filter(Boolean);

  return Array.from(new Set(roots));
}

function resolveWorkspaceRoot() {
  for (const candidate of workspaceCandidates()) {
    const openspecDir = path.join(candidate, "openspec");
    if (fs.existsSync(openspecDir) && fs.statSync(openspecDir).isDirectory()) {
      return candidate;
    }
  }

  throw new Error("OpenSpec workspace not found");
}

function resolveOpenSpecRunner() {
  if (process.platform !== "win32") {
    return {
      command: "openspec",
      baseArgs: [],
    };
  }

  const appData =
    process.env.APPDATA
    || (process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, "AppData", "Roaming")
      : null);

  if (appData) {
    const openspecScript = path.join(
      appData,
      "npm",
      "node_modules",
      "@fission-ai",
      "openspec",
      "bin",
      "openspec.js"
    );

    if (fs.existsSync(openspecScript)) {
      return {
        command: process.execPath || "node",
        baseArgs: [openspecScript],
      };
    }
  }

  return {
    command: "powershell.exe",
    baseArgs: ["-NoProfile", "-Command", "& openspec"],
    needsShellJoin: true,
  };
}

async function runOpenSpecJson(args, cwd) {
  try {
    const options = {
      cwd,
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    };
    const runner = resolveOpenSpecRunner();
    const runnerArgs = runner.needsShellJoin
      ? [
          ...runner.baseArgs.slice(0, -1),
          `${runner.baseArgs.at(-1)} ${args
            .map((arg) => `'${String(arg).replace(/'/g, "''")}'`)
            .join(" ")}`,
        ]
      : [...runner.baseArgs, ...args];
    const result = await execFileAsync(runner.command, runnerArgs, options);
    const { stdout } = result;

    return JSON.parse(stdout);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      throw new Error("OpenSpec CLI is not installed or not on PATH");
    }

    const message =
      (error && error.stderr && String(error.stderr).trim()) ||
      (error && error.message) ||
      "Failed to load OpenSpec state";
    throw new Error(message);
  }
}

function parseTaskProgress(tasksPath, fallbackCompleted = 0, fallbackTotal = 0) {
  if (!fs.existsSync(tasksPath)) {
    const total = fallbackTotal || 0;
    const completed = Math.min(fallbackCompleted || 0, total);
    return {
      completed,
      total,
      remaining: Math.max(total - completed, 0),
      percent: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  const content = fs.readFileSync(tasksPath, "utf8");
  const matches = Array.from(content.matchAll(/^- \[( |x)\] /gim));
  const total = matches.length || fallbackTotal || 0;
  const completed = matches.filter((match) => match[1].toLowerCase() === "x").length;

  return {
    completed,
    total,
    remaining: Math.max(total - completed, 0),
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

function readLastModified(dirPath) {
  const stack = [dirPath];
  let latest = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const stat = fs.statSync(current);
    latest = Math.max(latest, stat.mtimeMs);

    if (!stat.isDirectory()) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      stack.push(path.join(current, entry.name));
    }
  }

  return latest > 0 ? new Date(latest).toISOString() : null;
}

function readLocalChanges(workspaceRoot) {
  const changesDir = path.join(workspaceRoot, "openspec", "changes");

  if (!fs.existsSync(changesDir)) {
    return [];
  }

  return fs
    .readdirSync(changesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive" && !entry.name.startsWith("."))
    .map((entry) => {
      const changeDir = path.join(changesDir, entry.name);
      const taskProgress = parseTaskProgress(path.join(changeDir, "tasks.md"));

      return {
        name: entry.name,
        completedTasks: taskProgress.completed,
        totalTasks: taskProgress.total,
        lastModified: readLastModified(changeDir),
        status:
          taskProgress.total > 0 && taskProgress.completed === taskProgress.total
            ? "complete"
            : taskProgress.total === 0
              ? "no-tasks"
              : "in-progress",
      };
    });
}

function deriveStage(status, listStatus) {
  const artifacts = Array.isArray(status.artifacts) ? status.artifacts : [];
  const nextPendingArtifact = artifacts.find((artifact) => artifact.status !== "done");

  if (nextPendingArtifact) {
    return {
      stage: nextPendingArtifact.id,
      nextArtifact: nextPendingArtifact.id,
    };
  }

  if (listStatus === "complete") {
    return {
      stage: "complete",
      nextArtifact: null,
    };
  }

  return {
    stage: "implementing",
    nextArtifact: null,
  };
}

function normalizeArtifact(artifact) {
  return {
    id: artifact.id,
    outputPath: artifact.outputPath,
    status: artifact.status,
    done: artifact.status === "done",
  };
}

async function buildBoardPayload(workspaceRoot) {
  const listChanges = readLocalChanges(workspaceRoot);

  const changes = await Promise.all(
    listChanges.map(async (change) => {
      const status = await runOpenSpecJson(
        ["status", "--change", change.name, "--json"],
        workspaceRoot
      );
      const artifacts = (status.artifacts || []).map(normalizeArtifact);
      const taskProgress = parseTaskProgress(
        path.join(workspaceRoot, "openspec", "changes", change.name, "tasks.md"),
        change.completedTasks,
        change.totalTasks
      );
      const { stage, nextArtifact } = deriveStage(status, change.status);

      return {
        name: change.name,
        status: change.status,
        stage,
        stageLabel: STAGE_LABELS[stage],
        lastModified: change.lastModified,
        nextArtifact,
        readyToApply: Boolean(status.isComplete),
        applyRequires: status.applyRequires || [],
        artifactSummary: {
          done: artifacts.filter((artifact) => artifact.done).length,
          total: artifacts.length,
        },
        taskProgress,
        completedTasks: taskProgress.completed,
        totalTasks: taskProgress.total,
        artifacts,
        changePath: path.join("openspec", "changes", change.name).replace(/\\/g, "/"),
      };
    })
  );

  const sortedChanges = changes.sort((left, right) => {
    const stageOrder =
      STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage);
    if (stageOrder !== 0) return stageOrder;
    return (right.lastModified || "").localeCompare(left.lastModified || "");
  });

  const stages = STAGE_ORDER.map((stage) => ({
    id: stage,
    label: STAGE_LABELS[stage],
    count: sortedChanges.filter((change) => change.stage === stage).length,
  }));

  return {
    workspaceRoot,
    stages,
    changes: sortedChanges,
  };
}

router.get("/changes", async (_req, res) => {
  try {
    const workspaceRoot = resolveWorkspaceRoot();
    if (
      boardCache
      && boardCache.workspaceRoot === workspaceRoot
      && boardCache.expiresAt > Date.now()
    ) {
      res.json(boardCache.payload);
      return;
    }

    const payload = await buildBoardPayload(workspaceRoot);
    boardCache = {
      workspaceRoot,
      payload,
      expiresAt: Date.now() + OPEN_SPEC_CACHE_TTL_MS,
    };

    res.json(payload);
  } catch (error) {
    res.status(503).json({
      error: {
        code: "OPENSPEC_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Failed to load OpenSpec state",
      },
    });
  }
});

module.exports = router;
