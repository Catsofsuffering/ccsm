package main

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHandleUIReturnsEmbeddedIndex(t *testing.T) {
	ws := NewWebServer("codex")

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()

	ws.handleUI(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status code = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "text/html") {
		t.Fatalf("content type = %q, want html", got)
	}
	if !strings.Contains(rec.Body.String(), `<div id="root"></div>`) {
		t.Fatalf("expected root element in html: %s", rec.Body.String())
	}
}

func TestHandleUIServesEmbeddedAssets(t *testing.T) {
	ws := NewWebServer("codex")

	req := httptest.NewRequest("GET", "/assets/app.js", nil)
	rec := httptest.NewRecorder()

	ws.handleUI(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status code = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); !strings.Contains(got, "javascript") {
		t.Fatalf("content type = %q, want javascript", got)
	}
	if !strings.Contains(rec.Body.String(), "createRoot") {
		t.Fatalf("expected bundled app script, got: %s", rec.Body.String())
	}
}

func TestHandleUIFallsBackToIndexForClientRoutes(t *testing.T) {
	ws := NewWebServer("codex")

	req := httptest.NewRequest("GET", "/runs/task-a", nil)
	rec := httptest.NewRecorder()

	ws.handleUI(rec, req)

	if rec.Code != 200 {
		t.Fatalf("status code = %d, want 200", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), `<div id="root"></div>`) {
		t.Fatalf("expected spa fallback html: %s", rec.Body.String())
	}
}
