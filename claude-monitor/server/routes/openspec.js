const { Router } = require("express");
const {
  OPEN_SPEC_CACHE_TTL_MS,
  buildBoardPayload,
  resolveWorkspaceRoot,
} = require("../lib/openspec-state");
const router = Router();
let boardCache = null;

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
