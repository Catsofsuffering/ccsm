package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// WebServer manages HTTP APIs, SSE streams, and persisted monitoring history.
type WebServer struct {
	mu            sync.RWMutex
	clients       map[string][]chan MonitorEvent
	globalClients []chan MonitorEvent
	sessions      map[string]*SessionState
	server        *http.Server
	port          int
	backend       string
	runID         string
	startedAt     time.Time
	updatedAt     time.Time
	historyDir    string
	snapshotPath  string
	eventsPath    string
}

// NewWebServer creates a new web server and monitoring run container.
func NewWebServer(backend string) *WebServer {
	now := time.Now()
	return &WebServer{
		clients:   make(map[string][]chan MonitorEvent),
		sessions:  make(map[string]*SessionState),
		backend:   backend,
		runID:     generateMonitorID("run"),
		startedAt: now,
		updatedAt: now,
	}
}

func ensureGlobalWebServer(backend string) *WebServer {
	if liteMode {
		return nil
	}

	globalWebServerMu.Lock()
	defer globalWebServerMu.Unlock()

	if globalWebServer != nil {
		return globalWebServer
	}

	ws := NewWebServer(backend)
	if isTestBinary() {
		ws.mu.Lock()
		if err := ws.ensureHistoryLocked(); err != nil {
			ws.mu.Unlock()
			logWarn(fmt.Sprintf("Failed to initialize monitor history: %v", err))
			return nil
		}
		ws.mu.Unlock()
		globalWebServer = ws
		return globalWebServer
	}
	if err := ws.Start(); err != nil {
		logWarn(fmt.Sprintf("Failed to start web server: %v", err))
		return nil
	}
	globalWebServer = ws
	return globalWebServer
}

// Start starts the web server on a random available port.
func (ws *WebServer) Start() error {
	if ws == nil {
		return nil
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", ws.handleIndex)
	mux.HandleFunc("/api/state", ws.handleState)
	mux.HandleFunc("/api/sessions", ws.handleSessions)
	mux.HandleFunc("/api/events", ws.handleEvents)
	mux.HandleFunc("/api/stream/", ws.handleStream)

	listener, err := net.Listen("tcp", ":0")
	if err != nil {
		return err
	}

	ws.port = listener.Addr().(*net.TCPAddr).Port
	ws.server = &http.Server{Handler: mux}

	ws.mu.Lock()
	if err := ws.ensureHistoryLocked(); err != nil {
		ws.mu.Unlock()
		return err
	}
	ws.mu.Unlock()

	url := fmt.Sprintf("http://localhost:%d", ws.port)
	if shouldAutoOpenBrowser() {
		fmt.Fprintf(os.Stderr, "  Web UI: %s\n", url)
	}

	go func() {
		if err := ws.server.Serve(listener); err != nil && err != http.ErrServerClosed {
			logWarn(fmt.Sprintf("Web server error: %v", err))
		}
	}()

	if shouldAutoOpenBrowser() {
		go openBrowser(url)
	}
	return nil
}

// Stop gracefully shuts down the web server.
func (ws *WebServer) Stop() error {
	if ws == nil || ws.server == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	ws.mu.Lock()
	if err := ws.persistSnapshotLocked(); err != nil {
		logWarn(fmt.Sprintf("monitor snapshot flush failed: %v", err))
	}
	for _, clients := range ws.clients {
		for _, ch := range clients {
			close(ch)
		}
	}
	for _, ch := range ws.globalClients {
		close(ch)
	}
	ws.clients = make(map[string][]chan MonitorEvent)
	ws.globalClients = nil
	ws.mu.Unlock()

	return ws.server.Shutdown(ctx)
}

// openBrowser opens the specified URL in the default browser.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		hideWindowsConsole(cmd)
	default:
		return
	}

	if err := cmd.Start(); err != nil {
		return
	}
	go func() { _ = cmd.Wait() }()
}

func shouldAutoOpenBrowser() bool {
	raw := strings.TrimSpace(strings.ToLower(os.Getenv("CODEAGENT_OPEN_BROWSER")))
	switch raw {
	case "", "1", "true", "yes", "on":
		return raw == "" || raw == "1" || raw == "true" || raw == "yes" || raw == "on"
	case "0", "false", "no", "off":
		return false
	default:
		return true
	}
}

func (ws *WebServer) ensureHistoryLocked() error {
	if ws.historyDir != "" {
		return nil
	}

	historyDir := filepath.Join(monitorHistoryRoot(), ws.runID)
	if err := os.MkdirAll(historyDir, 0o700); err != nil {
		return err
	}

	ws.historyDir = historyDir
	ws.snapshotPath = filepath.Join(historyDir, "snapshot.json")
	ws.eventsPath = filepath.Join(historyDir, "events.ndjson")
	return nil
}

func (ws *WebServer) snapshotLocked() MonitorSnapshot {
	summary := computeMonitorSummary(ws.sessions)
	return MonitorSnapshot{
		RunID:      ws.runID,
		Backend:    ws.backend,
		Status:     monitorRunStatus(summary),
		StartedAt:  ws.startedAt,
		UpdatedAt:  ws.updatedAt,
		HistoryDir: ws.historyDir,
		Summary:    summary,
		Sessions:   sortedSessionStates(ws.sessions),
	}
}

func (ws *WebServer) persistSnapshotLocked() error {
	if err := ws.ensureHistoryLocked(); err != nil {
		return err
	}

	snapshot := ws.snapshotLocked()
	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ws.snapshotPath, append(data, '\n'), 0o600)
}

func (ws *WebServer) appendEventLocked(evt MonitorEvent) error {
	if err := ws.ensureHistoryLocked(); err != nil {
		return err
	}

	evt.HistoryDir = ws.historyDir
	data, err := marshalMonitorEvent(evt)
	if err != nil {
		return err
	}

	f, err := os.OpenFile(ws.eventsPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()

	if _, err := f.Write(append(data, '\n')); err != nil {
		return err
	}
	return nil
}

func (ws *WebServer) emitLocked(evt MonitorEvent) {
	evt.RunID = ws.runID
	evt.Timestamp = time.Now()
	evt.Summary = computeMonitorSummary(ws.sessions)
	evt.HistoryDir = ws.historyDir

	if err := ws.appendEventLocked(evt); err != nil {
		logWarn(fmt.Sprintf("monitor event persist failed: %v", err))
	}
	if err := ws.persistSnapshotLocked(); err != nil {
		logWarn(fmt.Sprintf("monitor snapshot persist failed: %v", err))
	}

	for _, ch := range ws.globalClients {
		select {
		case ch <- evt:
		default:
		}
	}

	if evt.SessionID != "" {
		for _, ch := range ws.clients[evt.SessionID] {
			select {
			case ch <- evt:
			default:
			}
		}
	}
}

func (ws *WebServer) upsertSessionLocked(reg SessionRegistration) *SessionState {
	now := time.Now()
	status := normalizeMonitorStatus(reg.Status)
	if status == "" {
		status = monitorStatusPending
	}

	session, ok := ws.sessions[reg.ID]
	if !ok {
		session = &SessionState{
			ID:         reg.ID,
			TaskID:     reg.TaskID,
			Backend:    reg.Backend,
			Task:       reg.Task,
			Status:     status,
			CreatedAt:  now,
			UpdateTime: now,
			LogPath:    reg.LogPath,
		}
		if len(reg.Dependencies) > 0 {
			session.Dependencies = append([]string(nil), reg.Dependencies...)
		}
		ws.sessions[reg.ID] = session
		return session
	}

	if reg.TaskID != "" {
		session.TaskID = reg.TaskID
	}
	if reg.Backend != "" {
		session.Backend = reg.Backend
	}
	if reg.Task != "" {
		session.Task = reg.Task
	}
	if len(reg.Dependencies) > 0 && len(session.Dependencies) == 0 {
		session.Dependencies = append([]string(nil), reg.Dependencies...)
	}
	if reg.LogPath != "" {
		session.LogPath = reg.LogPath
	}
	if status != "" {
		session.Status = status
	}
	session.UpdateTime = now
	return session
}

func (ws *WebServer) StartSession(reg SessionRegistration) {
	if ws == nil || strings.TrimSpace(reg.ID) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(reg)
	if session.Status == monitorStatusRunning && session.StartTime == nil {
		now := time.Now()
		session.StartTime = &now
	}
	ws.updatedAt = time.Now()
	evt := MonitorEvent{
		Type:      "session_registered",
		SessionID: reg.ID,
		Session:   cloneSessionState(session),
		Message:   "session registered",
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) MarkRunning(sessionID, logPath string) {
	if ws == nil || strings.TrimSpace(sessionID) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(SessionRegistration{ID: sessionID, Status: monitorStatusRunning, LogPath: logPath})
	now := time.Now()
	session.Status = monitorStatusRunning
	if session.StartTime == nil {
		session.StartTime = &now
	}
	session.UpdateTime = now
	session.Done = false
	if logPath != "" {
		session.LogPath = logPath
	}
	ws.updatedAt = now
	evt := MonitorEvent{
		Type:      "session_running",
		SessionID: sessionID,
		Session:   cloneSessionState(session),
		Message:   "task running",
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) MarkBlocked(sessionID string, blockedBy []string, reason string) {
	if ws == nil || strings.TrimSpace(sessionID) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(SessionRegistration{ID: sessionID, Status: monitorStatusBlocked})
	now := time.Now()
	session.Status = monitorStatusBlocked
	session.BlockedBy = append([]string(nil), blockedBy...)
	session.CurrentActivity = trimMonitorText(reason, monitorActivityLimit)
	session.LastEvent = "blocked"
	session.UpdateTime = now
	session.EndTime = &now
	session.Done = true
	if reason != "" {
		session.Error = reason
	}
	ws.updatedAt = now
	evt := MonitorEvent{
		Type:      "session_blocked",
		SessionID: sessionID,
		Session:   cloneSessionState(session),
		Message:   reason,
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) RecordProgress(sessionID, line string) {
	if ws == nil || strings.TrimSpace(sessionID) == "" || strings.TrimSpace(line) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(SessionRegistration{ID: sessionID})
	now := time.Now()
	trimmed := strings.TrimSpace(strings.TrimPrefix(line, "[PROGRESS] "))
	session.LastEvent = trimmed
	session.CurrentActivity = trimMonitorText(trimmed, monitorActivityLimit)
	session.UpdateTime = now
	ws.updatedAt = now
	evt := MonitorEvent{
		Type:      "session_progress",
		SessionID: sessionID,
		Session:   cloneSessionState(session),
		Message:   trimmed,
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) SendContent(sessionID, backend, content string) {
	ws.SendContentWithType(sessionID, backend, content, "message")
}

func (ws *WebServer) SendContentWithType(sessionID, backend, content, contentType string) {
	if ws == nil || strings.TrimSpace(sessionID) == "" || strings.TrimSpace(content) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(SessionRegistration{ID: sessionID, Backend: backend})
	now := time.Now()
	session.Backend = backend
	session.Content = appendMonitorContent(session.Content, content, monitorContentLimit)
	session.CurrentActivity = trimMonitorText(content, monitorActivityLimit)
	session.LastEvent = contentType
	session.UpdateTime = now
	if session.Status == monitorStatusPending {
		session.Status = monitorStatusRunning
	}
	ws.updatedAt = now
	evt := MonitorEvent{
		Type:        "session_activity",
		SessionID:   sessionID,
		Session:     cloneSessionState(session),
		Content:     content,
		ContentType: contentType,
		Message:     trimMonitorText(content, monitorActivityLimit),
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) FinishSession(sessionID string, result SessionResult) {
	if ws == nil || strings.TrimSpace(sessionID) == "" {
		return
	}

	ws.mu.Lock()
	session := ws.upsertSessionLocked(SessionRegistration{ID: sessionID})
	now := time.Now()
	status := normalizeMonitorStatus(result.Status)
	if status == monitorStatusPending {
		if result.Error != "" {
			status = monitorStatusFailed
		} else {
			status = monitorStatusCompleted
		}
	}
	session.Status = status
	session.UpdateTime = now
	session.EndTime = &now
	session.Done = true
	session.Error = strings.TrimSpace(result.Error)
	if result.LogPath != "" {
		session.LogPath = result.LogPath
	}
	session.Coverage = result.Coverage
	session.FilesChanged = append([]string(nil), result.FilesChanged...)
	session.TestsPassed = result.TestsPassed
	session.TestsFailed = result.TestsFailed
	if session.Error != "" {
		session.CurrentActivity = trimMonitorText(session.Error, monitorActivityLimit)
	}
	ws.updatedAt = now

	message := "task completed"
	if status == monitorStatusFailed {
		message = session.Error
		if strings.TrimSpace(message) == "" {
			message = "task failed"
		}
	}
	evt := MonitorEvent{
		Type:      "session_finished",
		SessionID: sessionID,
		Session:   cloneSessionState(session),
		Message:   message,
	}
	ws.emitLocked(evt)
	ws.mu.Unlock()
}

func (ws *WebServer) State() MonitorSnapshot {
	if ws == nil {
		return MonitorSnapshot{}
	}
	ws.mu.RLock()
	defer ws.mu.RUnlock()
	return ws.snapshotLocked()
}

func (ws *WebServer) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(ws.generateIndexHTML()))
}

func (ws *WebServer) generateIndexHTML() string {
	backend := ws.backend
	if backend == "" {
		backend = "agent"
	}

	title := strings.ToUpper(backend) + " Monitor"
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>%s</title>
  <style>
    :root {
      --bg: #f3efe4;
      --panel: rgba(255,255,255,0.82);
      --panel-strong: rgba(255,255,255,0.96);
      --text: #1e2a23;
      --muted: #5d6d63;
      --line: rgba(30,42,35,0.14);
      --accent: #0f766e;
      --accent-soft: rgba(15,118,110,0.12);
      --running: #2563eb;
      --completed: #15803d;
      --failed: #b91c1c;
      --blocked: #b45309;
      --pending: #64748b;
      --shadow: 0 20px 40px rgba(30,42,35,0.10);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.18), transparent 28%%),
        radial-gradient(circle at top right, rgba(217,119,6,0.16), transparent 24%%),
        linear-gradient(180deg, #fcfaf4 0%%, var(--bg) 100%%);
      min-height: 100vh;
    }
    .shell {
      width: min(1280px, calc(100vw - 32px));
      margin: 24px auto;
      display: grid;
      gap: 18px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(255,255,255,0.92), rgba(255,255,255,0.74));
      border: 1px solid var(--line);
      border-radius: 24px;
      padding: 24px;
      box-shadow: var(--shadow);
      display: grid;
      gap: 18px;
    }
    .hero-head {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .hero-mark {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: linear-gradient(135deg, #0f766e, #ea580c);
      color: white;
      display: grid;
      place-items: center;
      font-weight: 700;
      letter-spacing: 0.12em;
      box-shadow: 0 12px 28px rgba(15,118,110,0.24);
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 42px);
      line-height: 1;
      font-weight: 700;
    }
    .hero p {
      margin: 6px 0 0;
      color: var(--muted);
      max-width: 760px;
      line-height: 1.5;
    }
    .status-line {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
      color: var(--muted);
      font-size: 13px;
    }
    .pulse {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }
    .pulse::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: currentColor;
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%%, 100%% { transform: scale(1); opacity: 1; }
      50%% { transform: scale(0.55); opacity: 0.45; }
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 14px 16px;
      box-shadow: 0 10px 24px rgba(30,42,35,0.06);
    }
    .card strong {
      display: block;
      font-size: 28px;
      line-height: 1;
      margin-top: 10px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 18px;
    }
    .panel {
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    .panel header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid var(--line);
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }
    .panel h2 {
      margin: 0;
      font-size: 18px;
    }
    .panel small {
      color: var(--muted);
    }
    .task-list {
      padding: 16px;
      display: grid;
      gap: 14px;
      max-height: 72vh;
      overflow: auto;
    }
    .task {
      border: 1px solid var(--line);
      border-radius: 18px;
      padding: 16px;
      background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(255,255,255,0.82));
      display: grid;
      gap: 12px;
    }
    .task-top {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: start;
      flex-wrap: wrap;
    }
    .task-title {
      display: grid;
      gap: 4px;
    }
    .task-title strong {
      font-size: 17px;
    }
    .task-title span {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }
    .pill {
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid currentColor;
      background: rgba(255,255,255,0.72);
    }
    .pill.pending { color: var(--pending); }
    .pill.running { color: var(--running); }
    .pill.completed { color: var(--completed); }
    .pill.failed { color: var(--failed); }
    .pill.blocked { color: var(--blocked); }
    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px 12px;
      font-size: 13px;
      color: var(--muted);
    }
    .activity {
      padding: 12px 14px;
      border-radius: 14px;
      background: #f7f6f0;
      border: 1px solid rgba(30,42,35,0.08);
      font-size: 13px;
      line-height: 1.55;
    }
    .activity strong {
      display: block;
      margin-bottom: 6px;
      color: var(--text);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .history {
      padding: 18px 20px;
      display: grid;
      gap: 14px;
      color: var(--muted);
      font-size: 14px;
    }
    .history pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: Consolas, Monaco, monospace;
      background: #f7f6f0;
      border: 1px solid rgba(30,42,35,0.08);
      border-radius: 16px;
      padding: 14px;
      color: #38453d;
      max-height: 260px;
      overflow: auto;
    }
    .empty {
      padding: 20px;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 18px;
      text-align: center;
      background: rgba(255,255,255,0.6);
    }
    code { font-family: Consolas, Monaco, monospace; }
    @media (max-width: 960px) {
      .grid { grid-template-columns: 1fr; }
      .task-list { max-height: none; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <div class="hero-head">
        <div class="hero-mark">MON</div>
        <div>
          <h1>%s</h1>
          <p>Task and work-package level monitoring for wrapper-managed execution. This MVP tracks what the wrapper actually knows: task IDs, dependency edges, live activity, outcomes, and retained local history.</p>
        </div>
      </div>
      <div class="status-line">
        <div class="pulse" id="run-status">LIVE RUN</div>
        <div>Run ID: <code id="run-id">-</code></div>
        <div>Started: <span id="started-at">-</span></div>
        <div>History: <code id="history-dir">-</code></div>
      </div>
      <div class="cards">
        <div class="card"><span>Total</span><strong id="summary-total">0</strong></div>
        <div class="card"><span>Pending</span><strong id="summary-pending">0</strong></div>
        <div class="card"><span>Running</span><strong id="summary-running">0</strong></div>
        <div class="card"><span>Completed</span><strong id="summary-completed">0</strong></div>
        <div class="card"><span>Failed</span><strong id="summary-failed">0</strong></div>
        <div class="card"><span>Blocked</span><strong id="summary-blocked">0</strong></div>
      </div>
    </section>
    <section class="grid">
      <article class="panel">
        <header>
          <h2>Tasks</h2>
          <small id="task-count">0 tracked</small>
        </header>
        <div class="task-list" id="task-list"></div>
      </article>
      <article class="panel">
        <header>
          <h2>Run Notes</h2>
          <small>Live monitoring metadata</small>
        </header>
        <div class="history">
          <div id="summary-text">Waiting for state…</div>
          <pre id="event-log">No events yet.</pre>
        </div>
      </article>
    </section>
  </div>
  <script>
    const state = { sessions: new Map(), events: [], startedAt: null, historyDir: null };
    const ids = {
      runId: document.getElementById('run-id'),
      startedAt: document.getElementById('started-at'),
      historyDir: document.getElementById('history-dir'),
      taskList: document.getElementById('task-list'),
      taskCount: document.getElementById('task-count'),
      summaryText: document.getElementById('summary-text'),
      eventLog: document.getElementById('event-log'),
      runStatus: document.getElementById('run-status'),
      total: document.getElementById('summary-total'),
      pending: document.getElementById('summary-pending'),
      running: document.getElementById('summary-running'),
      completed: document.getElementById('summary-completed'),
      failed: document.getElementById('summary-failed'),
      blocked: document.getElementById('summary-blocked')
    };

    function formatTime(value) {
      if (!value) return '-';
      return new Date(value).toLocaleString();
    }

    function pushEvent(line) {
      state.events.unshift(line);
      if (state.events.length > 24) state.events.length = 24;
      ids.eventLog.textContent = state.events.join('\n');
    }

    function renderSummary(snapshot) {
      if (snapshot.started_at) state.startedAt = snapshot.started_at;
      if (snapshot.history_dir) state.historyDir = snapshot.history_dir;
      ids.runId.textContent = snapshot.run_id || '-';
      ids.startedAt.textContent = formatTime(state.startedAt);
      ids.historyDir.textContent = state.historyDir || '-';
      ids.total.textContent = snapshot.summary.total;
      ids.pending.textContent = snapshot.summary.pending;
      ids.running.textContent = snapshot.summary.running;
      ids.completed.textContent = snapshot.summary.completed;
      ids.failed.textContent = snapshot.summary.failed;
      ids.blocked.textContent = snapshot.summary.blocked;
      ids.taskCount.textContent = String(snapshot.sessions.length) + ' tracked';
      ids.runStatus.textContent = snapshot.status === 'completed' ? 'RUN COMPLETE' : 'LIVE RUN';
      ids.summaryText.textContent = snapshot.status === 'completed'
        ? 'Run finished. Monitoring history remains available on disk.'
        : 'Run is active. Task cards update as executor and parser events arrive.';
    }

    function sessionName(session) {
      return session.task_id || session.id;
    }

    function renderTasks() {
      const sessions = Array.from(state.sessions.values()).sort((a, b) => {
        const rank = { running: 0, pending: 1, failed: 2, blocked: 3, completed: 4 };
        const left = rank[a.status] ?? 99;
        const right = rank[b.status] ?? 99;
        if (left !== right) return left - right;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });

      if (sessions.length === 0) {
        ids.taskList.innerHTML = '<div class="empty">No monitored tasks yet. The dashboard will populate as tasks register.</div>';
        return;
      }

      ids.taskList.innerHTML = sessions.map((session) => {
        const files = Array.isArray(session.files_changed) ? session.files_changed.length : 0;
        const deps = Array.isArray(session.dependencies) && session.dependencies.length > 0
          ? session.dependencies.join(', ')
          : 'none';
        const blockedBy = Array.isArray(session.blocked_by) && session.blocked_by.length > 0
          ? session.blocked_by.join(', ')
          : 'none';
        const tests = session.tests_passed || session.tests_failed
          ? String(session.tests_passed || 0) + ' passed / ' + String(session.tests_failed || 0) + ' failed'
          : 'not recorded';
        const activity = session.current_activity || session.last_event || 'Waiting for activity';
        const transcript = session.content || 'No streamed content recorded yet.';

        return [
          '<section class="task">',
          '  <div class="task-top">',
          '    <div class="task-title">',
          '      <strong>' + escapeHtml(sessionName(session)) + '</strong>',
          '      <span>' + escapeHtml(session.task || 'No task prompt recorded') + '</span>',
          '    </div>',
          '    <span class="pill ' + escapeHtml(session.status) + '">' + escapeHtml(session.status) + '</span>',
          '  </div>',
          '  <div class="meta">',
          '    <div><strong>Backend:</strong> ' + escapeHtml(session.backend || '-') + '</div>',
          '    <div><strong>Dependencies:</strong> ' + escapeHtml(deps) + '</div>',
          '    <div><strong>Blocked By:</strong> ' + escapeHtml(blockedBy) + '</div>',
          '    <div><strong>Started:</strong> ' + escapeHtml(formatTime(session.start_time || session.created_at)) + '</div>',
          '    <div><strong>Finished:</strong> ' + escapeHtml(formatTime(session.end_time)) + '</div>',
          '    <div><strong>Coverage:</strong> ' + escapeHtml(session.coverage || 'n/a') + '</div>',
          '    <div><strong>Tests:</strong> ' + escapeHtml(tests) + '</div>',
          '    <div><strong>Changed Files:</strong> ' + String(files) + '</div>',
          '    <div><strong>Log:</strong> ' + escapeHtml(session.log_path || 'n/a') + '</div>',
          '  </div>',
          '  <div class="activity">',
          '    <strong>Current Activity</strong>',
          '    ' + escapeHtml(activity),
          '  </div>',
          '  <div class="activity">',
          '    <strong>Recent Output</strong>',
          '    ' + escapeHtml(transcript),
          '  </div>',
          '</section>'
        ].join('');
      }).join('');
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function applySnapshot(snapshot) {
      state.sessions.clear();
      for (const session of snapshot.sessions || []) {
        state.sessions.set(session.id, session);
      }
      renderSummary(snapshot);
      renderTasks();
    }

    function applyEvent(event) {
      if (event.session && event.session.id) {
        state.sessions.set(event.session.id, event.session);
      }
      const stamp = formatTime(event.timestamp);
      const label = event.session ? sessionName(event.session) : event.session_id || 'run';
      const text = event.message || event.type;
      pushEvent('[' + stamp + '] ' + label + ': ' + text);

      const summary = event.summary || { total: 0, pending: 0, running: 0, completed: 0, failed: 0, blocked: 0 };
      renderSummary({
        run_id: event.run_id,
        started_at: state.startedAt,
        history_dir: event.history_dir || state.historyDir,
        status: summary.running > 0 || summary.pending > 0 ? 'running' : 'completed',
        summary,
        sessions: Array.from(state.sessions.values())
      });
      renderTasks();
    }

    async function boot() {
      const res = await fetch('/api/state');
      const snapshot = await res.json();
      applySnapshot(snapshot);
      pushEvent('[' + new Date().toLocaleString() + '] monitor: dashboard ready');

      const es = new EventSource('/api/events');
      es.onmessage = (raw) => {
        const event = JSON.parse(raw.data);
        applyEvent(event);
      };
      es.onerror = () => {
        ids.summaryText.textContent = 'Live stream disconnected. Retrying automatically while the page stays open.';
      };
    }

    boot().catch((error) => {
      ids.summaryText.textContent = 'Failed to load monitoring state.';
      pushEvent('[' + new Date().toLocaleString() + '] error: ' + error.message);
    });
  </script>
</body>
</html>`, title, title)
}

func (ws *WebServer) handleState(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ws.State())
}

func (ws *WebServer) handleSessions(w http.ResponseWriter, r *http.Request) {
	state := ws.State()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state.Sessions)
}

func (ws *WebServer) handleEvents(w http.ResponseWriter, r *http.Request) {
	ws.handleEventStream(w, r, "")
}

func (ws *WebServer) handleStream(w http.ResponseWriter, r *http.Request) {
	sessionID := strings.TrimPrefix(r.URL.Path, "/api/stream/")
	if sessionID == "" {
		http.Error(w, "Session ID required", http.StatusBadRequest)
		return
	}
	ws.handleEventStream(w, r, sessionID)
}

func (ws *WebServer) handleEventStream(w http.ResponseWriter, r *http.Request, sessionID string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	ch := make(chan MonitorEvent, 100)

	ws.mu.Lock()
	if sessionID == "" {
		ws.globalClients = append(ws.globalClients, ch)
	} else {
		ws.clients[sessionID] = append(ws.clients[sessionID], ch)
	}
	ws.mu.Unlock()

	defer func() {
		ws.mu.Lock()
		if sessionID == "" {
			for i, client := range ws.globalClients {
				if client == ch {
					ws.globalClients = append(ws.globalClients[:i], ws.globalClients[i+1:]...)
					break
				}
			}
		} else {
			clients := ws.clients[sessionID]
			for i, client := range clients {
				if client == ch {
					ws.clients[sessionID] = append(clients[:i], clients[i+1:]...)
					break
				}
			}
		}
		ws.mu.Unlock()
		close(ch)
	}()

	for {
		select {
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(evt)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}
