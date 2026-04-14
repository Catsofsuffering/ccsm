import type { MonitorSnapshot } from "./types";

export const fetchSnapshot = async (): Promise<MonitorSnapshot> => {
  const response = await fetch("/api/state");
  if (!response.ok) {
    throw new Error(`Failed to load monitoring state (${response.status})`);
  }
  return response.json() as Promise<MonitorSnapshot>;
};

export const openMonitorStream = (): EventSource => new EventSource("/api/events");
