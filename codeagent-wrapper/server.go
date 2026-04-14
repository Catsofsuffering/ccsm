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
	mux.HandleFunc("/", ws.handleUI)
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
