import { describe, expect, it, vi } from 'vitest'
import { shutdownMonitor } from '../monitor'

vi.mock('../../utils/host', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getCanonicalHomeDir: vi.fn(() => 'C:/Users/test/.ccsm'),
  }
})

vi.mock('../../utils/claude-monitor', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    shutdownClaudeMonitor: vi.fn(),
  }
})

const { shutdownClaudeMonitor } = await import('../../utils/claude-monitor')

describe('shutdownMonitor', () => {
  it('throws when shutdown detects an unknown service on the monitor port', async () => {
    vi.mocked(shutdownClaudeMonitor).mockResolvedValue({
      success: false,
      reason: 'unknown-service',
      message: 'Port 4820 is occupied by an unknown service (PID 1234). Stop it manually.',
    })

    const consoleSpy = vi.spyOn(console, 'log').mockReturnValue()

    try {
      await expect(shutdownMonitor()).rejects.toThrow(/unknown service/)
    }
    finally {
      consoleSpy.mockRestore()
    }
  })

  it('resolves successfully when shutdown reports monitor is not running', async () => {
    vi.mocked(shutdownClaudeMonitor).mockResolvedValue({
      success: true,
      reason: 'not-running',
      message: 'Claude monitor is not running.',
    })

    const consoleSpy = vi.spyOn(console, 'log').mockReturnValue()

    try {
      await expect(shutdownMonitor()).resolves.toBeUndefined()
    }
    finally {
      consoleSpy.mockRestore()
    }
  })
})
