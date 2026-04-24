import { describe, expect, it, vi } from 'vitest'
import { execClaude } from '../claude'
import type { RunClaudeExecResult } from '../../utils/claude-cli'

vi.mock('../../utils/claude-cli', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    runClaudeExec: vi.fn<() => Promise<number | RunClaudeExecResult>>(),
  }
})

const { runClaudeExec } = await import('../../utils/claude-cli')

describe('execClaude', () => {
  it('outputs JSON to stdout when runClaudeExec returns RunClaudeExecResult', async () => {
    const mockResult: RunClaudeExecResult = {
      exitCode: 0,
      outputs: { result: 'test output' },
      sessionStatus: 'completed',
      runId: 'test-session-123',
    }
    vi.mocked(runClaudeExec).mockResolvedValue(mockResult)

    const consoleSpy = vi.spyOn(console, 'log').mockReturnValue()
    const originalArgv = process.argv
    process.argv = ['node', 'ccsm', 'claude', 'exec', '--status-driven']

    try {
      await execClaude(['--version'], { statusDriven: true })

      expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(mockResult, null, 2))
    }
    finally {
      process.argv = originalArgv
      consoleSpy.mockRestore()
    }
  })

  it('does not output JSON when runClaudeExec returns a number (exit code)', async () => {
    vi.mocked(runClaudeExec).mockResolvedValue(0)

    const consoleSpy = vi.spyOn(console, 'log').mockReturnValue()
    const originalArgv = process.argv
    process.argv = ['node', 'ccsm', 'claude', 'exec']

    try {
      await execClaude(['--version'], {})

      // No JSON output for non-status-driven path
      const jsonCalls = consoleSpy.mock.calls.filter((args) => {
        try {
          JSON.parse(args[0] as string)
          return true
        }
        catch {
          return false
        }
      })
      expect(jsonCalls).toHaveLength(0)
    }
    finally {
      process.argv = originalArgv
      consoleSpy.mockRestore()
    }
  })

  it('sets process.exitCode based on result.exitCode when non-zero', async () => {
    const mockResult: RunClaudeExecResult = {
      exitCode: 1,
      outputs: null,
      sessionStatus: 'error',
      runId: 'test-session-456',
    }
    vi.mocked(runClaudeExec).mockResolvedValue(mockResult)

    const originalExitCode = process.exitCode
    const originalArgv = process.argv
    process.argv = ['node', 'ccsm', 'claude', 'exec', '--status-driven']

    try {
      await execClaude(['--version'], { statusDriven: true })
      expect(process.exitCode).toBe(1)
    }
    finally {
      process.exitCode = originalExitCode
      process.argv = originalArgv
    }
  })

  it('sets process.exitCode based on numeric result when non-zero', async () => {
    vi.mocked(runClaudeExec).mockResolvedValue(2)

    const originalExitCode = process.exitCode
    const originalArgv = process.argv
    process.argv = ['node', 'ccsm', 'claude', 'exec']

    try {
      await execClaude(['--version'], {})
      expect(process.exitCode).toBe(2)
    }
    finally {
      process.exitCode = originalExitCode
      process.argv = originalArgv
    }
  })
})