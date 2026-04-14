## 1. Frontend Foundation

- [x] 1.1 Create a dedicated monitoring frontend workspace under `codeagent-wrapper` using the AgentField React/Vite embedding pattern as the starting point.
- [x] 1.2 Add wrapper-side asset embedding/serving so the monitoring UI is no longer assembled from inline HTML strings in `server.go`.

## 2. Monitoring Data Adapter

- [x] 2.1 Implement typed frontend access for `/api/state`, `/api/sessions`, `/api/events`, and `/api/stream/:sessionID`.
- [x] 2.2 Keep the backend contract bounded to wrapper-managed run/session/task data; only make additive DTO changes if the new UI cannot be implemented otherwise.

## 3. Dashboard Experience

- [x] 3.1 Build the new monitoring shell, summary cards, live task list, and recent-event surfaces using AgentField-inspired layout and component patterns.
- [x] 3.2 Render dependency, timing, logs/history pointers, current activity, and final result metadata for each monitored task in responsive desktop/mobile layouts.

## 4. Verification

- [x] 4.1 Add frontend-focused tests for snapshot rendering, event-driven updates, and disconnect/reconnect behavior.
- [x] 4.2 Add wrapper tests for embedded asset serving and monitoring API compatibility with the new frontend.
- [x] 4.3 Run the full bounded verification set for this slice: frontend build/test plus `go test ./...` in `codeagent-wrapper`.
