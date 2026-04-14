package main

import (
	"bytes"
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"strings"
	"time"
)

//go:embed webui/dist/*
var embeddedUIFiles embed.FS

func embeddedUIDist() (fs.FS, error) {
	return fs.Sub(embeddedUIFiles, "webui/dist")
}

func (ws *WebServer) handleUI(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		http.NotFound(w, r)
		return
	}

	uiFS, err := embeddedUIDist()
	if err != nil {
		http.Error(w, "embedded UI is unavailable", http.StatusInternalServerError)
		return
	}

	name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
	if name == "." || name == "" {
		ws.serveEmbeddedUIFile(w, r, uiFS, "index.html")
		return
	}

	if stat, statErr := fs.Stat(uiFS, name); statErr == nil && !stat.IsDir() {
		ws.serveEmbeddedUIFile(w, r, uiFS, name)
		return
	}

	ws.serveEmbeddedUIFile(w, r, uiFS, "index.html")
}

func (ws *WebServer) serveEmbeddedUIFile(
	w http.ResponseWriter,
	r *http.Request,
	uiFS fs.FS,
	name string,
) {
	data, err := fs.ReadFile(uiFS, name)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	contentType := mime.TypeByExtension(path.Ext(name))
	if name == "index.html" {
		contentType = "text/html; charset=utf-8"
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}
