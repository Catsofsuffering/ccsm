import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MonitorResultClient } from '../monitor-result'

// Mock global fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('MonitorResultClient', () => {
  let client: MonitorResultClient

  beforeEach(() => {
    client = new MonitorResultClient(4820)
    mockFetch.mockReset()
  })

  describe('healthCheck', () => {
    it('returns true when monitor responds with ok status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      const result = await client.healthCheck()
      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:4820/api/health')
    })

    it('returns false when health endpoint returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      })

      const result = await client.healthCheck()
      expect(result).toBe(false)
    })

    it('returns false when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'))

      const result = await client.healthCheck()
      expect(result).toBe(false)
    })

    it('returns false when response body status is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'degraded' }),
      })

      const result = await client.healthCheck()
      expect(result).toBe(false)
    })
  })

  describe('waitForSessionTerminal', () => {
    it('returns terminal state when session reaches completed status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: {
            id: 'sess-123',
            name: 'Test Session',
            status: 'completed',
            cwd: '/workspace',
            model: 'claude-opus-4-6',
            metadata: null,
            created_at: '2026-04-24T00:00:00.000Z',
            updated_at: '2026-04-24T00:05:00.000Z',
            ended_at: '2026-04-24T00:05:00.000Z',
          },
        }),
      })

      const result = await client.waitForSessionTerminal('sess-123', 5000)
      expect(result.status).toBe('completed')
      expect(result.terminalState).toBeDefined()
      expect(result.terminalState?.id).toBe('sess-123')
    })

    it('returns terminal state when session reaches error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'sess-err', status: 'error', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
        }),
      })

      const result = await client.waitForSessionTerminal('sess-err', 5000)
      expect(result.status).toBe('error')
    })

    it('returns terminal state when session reaches abandoned status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          session: { id: 'sess-abandon', status: 'abandoned', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
        }),
      })

      const result = await client.waitForSessionTerminal('sess-abandon', 5000)
      expect(result.status).toBe('abandoned')
    })

    it('polls repeatedly when session is not yet terminal', async () => {
      // First two responses: active session, third: completed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'sess-active', status: 'active', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'sess-active', status: 'active', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'sess-active', status: 'completed', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
          }),
        })

      const result = await client.waitForSessionTerminal('sess-active', 10000)
      expect(result.status).toBe('completed')
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('returns timeout when session never reaches terminal state', async () => {
      // Always return active status
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          session: { id: 'sess-never', status: 'active', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
        }),
      })

      const result = await client.waitForSessionTerminal('sess-never', 3000)
      expect(result.status).toBe('timeout')
    })

    it('returns timeout when fetch fails repeatedly', async () => {
      mockFetch.mockRejectedValue(new Error('connection refused'))

      const result = await client.waitForSessionTerminal('sess-fail', 3000)
      expect(result.status).toBe('timeout')
    })

    it('uses custom port when provided', () => {
      const customClient = new MonitorResultClient(9090)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      })

      customClient.healthCheck()
      expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:9090/api/health')
    })

    it('handles non-ok fetch response gracefully and continues polling', async () => {
      // First: fetch error (network issue), second: session completed
      mockFetch
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            session: { id: 'sess-resilient', status: 'completed', name: null, cwd: null, model: null, metadata: null, created_at: '', updated_at: '', ended_at: null },
          }),
        })

      const result = await client.waitForSessionTerminal('sess-resilient', 5000)
      expect(result.status).toBe('completed')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('fetchSessionOutputs', () => {
    it('fetches outputs and session data in parallel', async () => {
      // API returns { outputs: { agents, latest_output_agent_id } }
      const outputsData = {
        agents: [
          {
            agent_id: 'sess-123-main',
            latest_output: { markdown: '# Summary', source: 'transcript' },
            output_count: 3,
            outputs: [{ markdown: '# Summary', source: 'transcript' }],
          },
        ],
        latest_output_agent_id: 'sess-123-main',
      }

      const sessionData = {
        session: {
          id: 'sess-123',
          name: 'Test Session',
          status: 'completed',
          cwd: '/workspace',
          model: 'claude-opus-4-6',
          metadata: null,
          created_at: '2026-04-24T00:00:00.000Z',
          updated_at: '2026-04-24T00:05:00.000Z',
          ended_at: '2026-04-24T00:05:00.000Z',
        },
      }

      // Use mockImplementation to handle concurrent fetches by URL
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/outputs')) {
          return { ok: true, json: async () => outputsData }
        }
        if (url.includes('/sessions/sess-123')) {
          return { ok: true, json: async () => sessionData }
        }
        return { ok: false, status: 404 }
      })

      const result = await client.fetchSessionOutputs('sess-123')

      expect(result.outputs.agents).toHaveLength(1)
      expect(result.outputs.agents[0].agent_id).toBe('sess-123-main')
      expect(result.outputs.agents[0].latest_output).toEqual({ markdown: '# Summary', source: 'transcript' })
      expect(result.outputs.latest_output_agent_id).toBe('sess-123-main')
      expect(result.session?.id).toBe('sess-123')
      expect(result.session?.status).toBe('completed')
    })

    it('throws when outputs fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      await expect(client.fetchSessionOutputs('nonexistent')).rejects.toThrow(
        'Failed to fetch session outputs: HTTP 404'
      )
    })

    it('returns outputs even when session fetch fails', async () => {
      // API returns { outputs: { agents, latest_output_agent_id } }
      const outputsData = {
        agents: [],
        latest_output_agent_id: null,
      }

      // outputs succeeds, session fails
      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/outputs')) {
          return { ok: true, json: async () => outputsData }
        }
        return { ok: false, status: 404 }
      })

      const result = await client.fetchSessionOutputs('sess-no-session')
      expect(result.outputs.agents).toHaveLength(0)
      expect(result.session).toBeUndefined()
    })

    it('preserves multi-agent output structure with agent_id, latest_output, output_count', async () => {
      // API returns { outputs: { agents, latest_output_agent_id } }
      const multiAgentOutputs = {
        agents: [
          {
            agent_id: 'sess-multi-main',
            latest_output: { markdown: 'Main agent result', source: 'transcript' },
            output_count: 5,
            outputs: [
              { markdown: 'Step 1', source: 'transcript' },
              { markdown: 'Step 2', source: 'transcript' },
            ],
          },
          {
            agent_id: 'sess-multi-worker',
            latest_output: { markdown: 'Worker output', source: 'transcript' },
            output_count: 2,
            outputs: [{ markdown: 'Worker output', source: 'transcript' }],
          },
        ],
        latest_output_agent_id: 'sess-multi-main',
      }

      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/outputs')) {
          return { ok: true, json: async () => multiAgentOutputs }
        }
        return { ok: true, json: async () => ({ session: null }) }
      })

      const result = await client.fetchSessionOutputs('sess-multi')

      expect(result.outputs.agents).toHaveLength(2)
      const mainAgent = result.outputs.agents[0]
      expect(mainAgent.agent_id).toBe('sess-multi-main')
      expect(mainAgent.latest_output).toEqual({ markdown: 'Main agent result', source: 'transcript' })
      expect(mainAgent.output_count).toBe(5)
      expect(mainAgent.outputs).toHaveLength(2)

      const workerAgent = result.outputs.agents[1]
      expect(workerAgent.agent_id).toBe('sess-multi-worker')
      expect(workerAgent.output_count).toBe(2)
    })
  })
})

