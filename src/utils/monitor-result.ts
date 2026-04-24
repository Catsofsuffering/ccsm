/**
 * Monitor Result Client
 *
 * Utility for polling session terminal state and fetching structured outputs
 * from the Claude monitor server.
 */

import { DEFAULT_MONITOR_PORT } from './claude-monitor'

const TERMINAL_STATUSES = new Set(['completed', 'error', 'abandoned'])

export interface TerminalState {
  status: 'completed' | 'error' | 'abandoned' | 'timeout'
  terminalState?: SessionState
}

export interface SessionState {
  id: string
  name: string | null
  status: string
  cwd: string | null
  model: string | null
  metadata: unknown
  created_at: string
  updated_at: string
  ended_at: string | null
}

export interface SessionOutputs {
  outputs: {
    agents: AgentOutput[]
    latest_output_agent_id: string | null
  }
  session?: SessionState
}

export interface AgentOutput {
  agent_id: string
  latest_output: unknown
  output_count: number
  outputs: unknown[]
}

export class MonitorResultClient {
  private readonly baseUrl: string

  /**
   * Creates a new MonitorResultClient connected to the monitor on the given port.
   */
  constructor(port: number = DEFAULT_MONITOR_PORT) {
    this.baseUrl = `http://127.0.0.1:${port}`
  }

  /**
   * Performs a health check on the monitor server.
   * @returns true if the server is healthy, false otherwise
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`)
      if (!response.ok) {
        return false
      }
      const body = await response.json() as { status?: string }
      return body.status === 'ok'
    }
    catch {
      return false
    }
  }

  /**
   * Waits for a session to reach a terminal state (completed, error, or abandoned).
   *
   * @param sessionId - The ID of the session to wait on
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000ms grace period)
   * @returns TerminalState with status and session data if terminal reached, or 'timeout'
   */
  async waitForSessionTerminal(
    sessionId: string,
    timeoutMs: number = 30_000,
  ): Promise<TerminalState> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`)

        if (response.ok) {
          const data = await response.json() as { session?: SessionState }
          const session = data.session

          if (session && TERMINAL_STATUSES.has(session.status)) {
            return {
              status: session.status as 'completed' | 'error' | 'abandoned',
              terminalState: session,
            }
          }
        }
      }
      catch {
        // Network error - continue polling
      }

      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return { status: 'timeout' }
  }

  /**
   * Fetches the structured outputs for a session.
   *
   * @param sessionId - The ID of the session
   * @returns SessionOutputs containing the outputs structure and optionally the session
   */
  async fetchSessionOutputs(sessionId: string): Promise<SessionOutputs> {
    const [outputsResponse, sessionResponse] = await Promise.all([
      fetch(`${this.baseUrl}/api/sessions/${sessionId}/outputs`),
      fetch(`${this.baseUrl}/api/sessions/${sessionId}`),
    ])

    if (!outputsResponse.ok) {
      throw new Error(`Failed to fetch session outputs: HTTP ${outputsResponse.status}`)
    }

    const outputs = await outputsResponse.json() as SessionOutputs['outputs']
    let session: SessionState | undefined

    if (sessionResponse.ok) {
      const data = await sessionResponse.json() as { session?: SessionState }
      session = data.session
    }

    return { outputs, session }
  }
}
