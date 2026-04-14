export type MonitorSummary = {
  total: number;
  pending: number;
  running: number;
  completed: number;
  failed: number;
  blocked: number;
};

export type SessionState = {
  id: string;
  task_id?: string;
  backend: string;
  task: string;
  status: string;
  dependencies?: string[];
  blocked_by?: string[];
  created_at: string;
  start_time?: string;
  update_time: string;
  end_time?: string;
  current_activity?: string;
  last_event?: string;
  content?: string;
  log_path?: string;
  error?: string;
  coverage?: string;
  files_changed?: string[];
  tests_passed?: number;
  tests_failed?: number;
  done: boolean;
};

export type MonitorSnapshot = {
  run_id: string;
  backend: string;
  status: string;
  started_at: string;
  updated_at: string;
  history_dir?: string;
  summary: MonitorSummary;
  sessions: SessionState[];
};

export type MonitorEvent = {
  type: string;
  run_id: string;
  timestamp: string;
  summary: MonitorSummary;
  session_id?: string;
  session?: SessionState;
  content?: string;
  content_type?: string;
  message?: string;
  history_dir?: string;
};

export type MonitorViewState = {
  runId: string;
  backend: string;
  status: string;
  startedAt?: string;
  updatedAt?: string;
  historyDir?: string;
  summary: MonitorSummary;
  sessions: SessionState[];
  events: string[];
};

export type StatusFilter = "all" | "active" | "attention" | "completed";
