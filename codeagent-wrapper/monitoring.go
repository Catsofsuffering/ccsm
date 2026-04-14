package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	monitorStatusPending   = "pending"
	monitorStatusRunning   = "running"
	monitorStatusCompleted = "completed"
	monitorStatusFailed    = "failed"
	monitorStatusBlocked   = "blocked"

	monitorContentLimit  = 16 * 1024
	monitorActivityLimit = 240
)

var globalWebServerMu sync.Mutex

type MonitorSummary struct {
	Total     int `json:"total"`
	Pending   int `json:"pending"`
	Running   int `json:"running"`
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
	Blocked   int `json:"blocked"`
}

type SessionState struct {
	ID              string     `json:"id"`
	TaskID          string     `json:"task_id,omitempty"`
	Backend         string     `json:"backend"`
	Task            string     `json:"task"`
	Status          string     `json:"status"`
	Dependencies    []string   `json:"dependencies,omitempty"`
	BlockedBy       []string   `json:"blocked_by,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
	StartTime       *time.Time `json:"start_time,omitempty"`
	UpdateTime      time.Time  `json:"update_time"`
	EndTime         *time.Time `json:"end_time,omitempty"`
	CurrentActivity string     `json:"current_activity,omitempty"`
	LastEvent       string     `json:"last_event,omitempty"`
	Content         string     `json:"content,omitempty"`
	LogPath         string     `json:"log_path,omitempty"`
	Error           string     `json:"error,omitempty"`
	Coverage        string     `json:"coverage,omitempty"`
	FilesChanged    []string   `json:"files_changed,omitempty"`
	TestsPassed     int        `json:"tests_passed,omitempty"`
	TestsFailed     int        `json:"tests_failed,omitempty"`
	Done            bool       `json:"done"`
}

type SessionRegistration struct {
	ID           string
	TaskID       string
	Backend      string
	Task         string
	Status       string
	Dependencies []string
	LogPath      string
}

type SessionResult struct {
	Status       string
	LogPath      string
	Error        string
	Coverage     string
	FilesChanged []string
	TestsPassed  int
	TestsFailed  int
}

type MonitorEvent struct {
	Type        string         `json:"type"`
	RunID       string         `json:"run_id"`
	Timestamp   time.Time      `json:"timestamp"`
	Summary     MonitorSummary `json:"summary"`
	SessionID   string         `json:"session_id,omitempty"`
	Session     *SessionState  `json:"session,omitempty"`
	Content     string         `json:"content,omitempty"`
	ContentType string         `json:"content_type,omitempty"`
	Message     string         `json:"message,omitempty"`
	HistoryDir  string         `json:"history_dir,omitempty"`
}

type MonitorSnapshot struct {
	RunID      string          `json:"run_id"`
	Backend    string          `json:"backend"`
	Status     string          `json:"status"`
	StartedAt  time.Time       `json:"started_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
	HistoryDir string          `json:"history_dir,omitempty"`
	Summary    MonitorSummary  `json:"summary"`
	Sessions   []*SessionState `json:"sessions"`
}

func generateMonitorID(prefix string) string {
	buf := make([]byte, 4)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%d-%s", prefix, time.Now().UnixMilli(), hex.EncodeToString(buf))
}

func monitorHistoryRoot() string {
	return filepath.Join(os.TempDir(), primaryLogPrefix()+"-history")
}

func isTestBinary() bool {
	return strings.HasSuffix(filepath.Base(os.Args[0]), ".test")
}

func normalizeMonitorStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case monitorStatusPending, monitorStatusRunning, monitorStatusCompleted, monitorStatusFailed, monitorStatusBlocked:
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return monitorStatusPending
	}
}

func cloneSessionState(in *SessionState) *SessionState {
	if in == nil {
		return nil
	}
	out := *in
	out.Dependencies = append([]string(nil), in.Dependencies...)
	out.BlockedBy = append([]string(nil), in.BlockedBy...)
	out.FilesChanged = append([]string(nil), in.FilesChanged...)
	return &out
}

func trimMonitorText(s string, limit int) string {
	s = strings.TrimSpace(s)
	if limit <= 0 || len(s) <= limit {
		return s
	}
	if limit <= 3 {
		return s[:limit]
	}
	return s[len(s)-limit:]
}

func appendMonitorContent(existing, next string, limit int) string {
	if strings.TrimSpace(next) == "" {
		return existing
	}
	combined := existing + next
	if limit > 0 && len(combined) > limit {
		combined = combined[len(combined)-limit:]
	}
	return combined
}

func sortedSessionStates(sessions map[string]*SessionState) []*SessionState {
	out := make([]*SessionState, 0, len(sessions))
	for _, session := range sessions {
		out = append(out, cloneSessionState(session))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out
}

func computeMonitorSummary(sessions map[string]*SessionState) MonitorSummary {
	summary := MonitorSummary{Total: len(sessions)}
	for _, session := range sessions {
		switch session.Status {
		case monitorStatusPending:
			summary.Pending++
		case monitorStatusRunning:
			summary.Running++
		case monitorStatusCompleted:
			summary.Completed++
		case monitorStatusFailed:
			summary.Failed++
		case monitorStatusBlocked:
			summary.Blocked++
		}
	}
	return summary
}

func monitorRunStatus(summary MonitorSummary) string {
	if summary.Total == 0 {
		return "idle"
	}
	if summary.Running > 0 || summary.Pending > 0 {
		return "running"
	}
	return "completed"
}

func marshalMonitorEvent(evt MonitorEvent) ([]byte, error) {
	return json.Marshal(evt)
}
