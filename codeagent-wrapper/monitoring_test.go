package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWebServerMonitoringLifecyclePersistsSnapshotAndEvents(t *testing.T) {
	ws := NewWebServer("codex")
	t.Cleanup(func() {
		if ws.historyDir != "" {
			_ = os.RemoveAll(filepath.Dir(ws.historyDir))
		}
	})

	ws.StartSession(SessionRegistration{
		ID:           "task-a",
		TaskID:       "task-a",
		Backend:      "codex",
		Task:         "Implement monitoring MVP",
		Status:       monitorStatusPending,
		Dependencies: []string{"task-root"},
	})
	ws.MarkRunning("task-a", "C:/tmp/task-a.log")
	ws.RecordProgress("task-a", "[PROGRESS] turn_started")
	ws.SendContentWithType("task-a", "codex", "Scanning files", "reasoning")
	ws.FinishSession("task-a", SessionResult{
		Status:       monitorStatusCompleted,
		LogPath:      "C:/tmp/task-a.log",
		Coverage:     "91%",
		FilesChanged: []string{"codeagent-wrapper/server.go"},
		TestsPassed:  4,
	})

	ws.StartSession(SessionRegistration{
		ID:      "task-b",
		TaskID:  "task-b",
		Backend: "codex",
		Task:    "Blocked task",
		Status:  monitorStatusPending,
	})
	ws.MarkBlocked("task-b", []string{"task-a"}, "skipped due to failed dependencies: task-a")

	snapshot := ws.State()
	if snapshot.RunID == "" {
		t.Fatalf("expected run id in snapshot")
	}
	if snapshot.HistoryDir == "" {
		t.Fatalf("expected history dir in snapshot")
	}
	if snapshot.Summary.Total != 2 {
		t.Fatalf("summary total = %d, want 2", snapshot.Summary.Total)
	}
	if snapshot.Summary.Completed != 1 {
		t.Fatalf("completed = %d, want 1", snapshot.Summary.Completed)
	}
	if snapshot.Summary.Blocked != 1 {
		t.Fatalf("blocked = %d, want 1", snapshot.Summary.Blocked)
	}

	var completed *SessionState
	for _, session := range snapshot.Sessions {
		if session.ID == "task-a" {
			completed = session
			break
		}
	}
	if completed == nil {
		t.Fatalf("task-a missing from snapshot")
	}
	if completed.Status != monitorStatusCompleted {
		t.Fatalf("task-a status = %q, want %q", completed.Status, monitorStatusCompleted)
	}
	if completed.Coverage != "91%" {
		t.Fatalf("task-a coverage = %q, want 91%%", completed.Coverage)
	}
	if completed.TestsPassed != 4 {
		t.Fatalf("task-a tests passed = %d, want 4", completed.TestsPassed)
	}

	snapshotPath := filepath.Join(snapshot.HistoryDir, "snapshot.json")
	eventsPath := filepath.Join(snapshot.HistoryDir, "events.ndjson")
	if _, err := os.Stat(snapshotPath); err != nil {
		t.Fatalf("snapshot file missing: %v", err)
	}
	if _, err := os.Stat(eventsPath); err != nil {
		t.Fatalf("events file missing: %v", err)
	}

	snapshotData, err := os.ReadFile(snapshotPath)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	if !strings.Contains(string(snapshotData), "\"task-a\"") {
		t.Fatalf("snapshot file missing task-a: %s", string(snapshotData))
	}

	eventsData, err := os.ReadFile(eventsPath)
	if err != nil {
		t.Fatalf("read events: %v", err)
	}
	if !strings.Contains(string(eventsData), "\"type\":\"session_finished\"") {
		t.Fatalf("events file missing session_finished event: %s", string(eventsData))
	}
}

func TestHandleStateReturnsStructuredMonitoringData(t *testing.T) {
	ws := NewWebServer("claude")
	t.Cleanup(func() {
		if ws.historyDir != "" {
			_ = os.RemoveAll(filepath.Dir(ws.historyDir))
		}
	})

	ws.StartSession(SessionRegistration{
		ID:      "work-package-1",
		TaskID:  "work-package-1",
		Backend: "claude",
		Task:    "Implement package 1",
		Status:  monitorStatusPending,
	})
	ws.MarkRunning("work-package-1", "C:/tmp/wp1.log")

	req := httptest.NewRequest("GET", "/api/state", nil)
	rec := httptest.NewRecorder()
	ws.handleState(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status code = %d, want 200", rec.Code)
	}

	var payload MonitorSnapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload.Backend != "claude" {
		t.Fatalf("backend = %q, want claude", payload.Backend)
	}
	if payload.Summary.Running != 1 {
		t.Fatalf("running = %d, want 1", payload.Summary.Running)
	}
	if len(payload.Sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(payload.Sessions))
	}
	if payload.Sessions[0].LogPath != "C:/tmp/wp1.log" {
		t.Fatalf("log path = %q, want C:/tmp/wp1.log", payload.Sessions[0].LogPath)
	}
}
