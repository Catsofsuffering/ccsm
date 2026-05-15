import { beforeEach, describe, expect, it, vi } from 'vitest'
import { init } from '../init'
import inquirer from 'inquirer'
import { readCcgConfig, writeCcgConfig } from '../../utils/config'

// Track inquirer prompt calls for inspection
interface PromptCall {
  questions: Array<{ name: string; type?: string; default?: unknown; message?: string }>
}
let promptCalls: PromptCall[] = []

// Mutable prompt responses that tests can override
let promptResponses: Record<string, unknown> = {
  selectedOrchestrator: 'codex',
  selectedFrontend: 'codex',
  selectedBackend: 'codex',
  selectedLang: 'en',
  includeImpeccable: true,
  confirmed: true,
}

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn().mockImplementation(async (questions: any) => {
      const normalizedQuestions = Array.isArray(questions) ? questions : [questions]
      promptCalls.push({ questions: normalizedQuestions })
      // Return configurable responses based on what's asked
      return promptResponses
    }),
  },
}))

vi.mock('../../utils/config', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    readCcgConfig: vi.fn(),
    writeCcgConfig: vi.fn(),
  }
})
vi.mock('../../utils/claude-monitor', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    prepareClaudeMonitorRuntime: vi.fn().mockResolvedValue({
      monitorDir: '~/.claude/monitor',
      settingsPath: '~/.claude/settings.json',
    }),
    prepareCodexMonitorRuntime: vi.fn().mockResolvedValue({
      monitorDir: '~/.codex/monitor',
      settingsPath: '~/.codex/settings.json',
    }),
  }
})
vi.mock('../../utils/codex-config', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    ensureCodexWorkspaceTrust: vi.fn().mockResolvedValue({
      configPath: '~/.codex/settings.json',
    }),
  }
})
vi.mock('../../utils/installer', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getDefaultCommandIds: vi.fn().mockReturnValue(['spec-plan', 'spec-review']),
    installWorkflows: vi.fn().mockResolvedValue({
      success: true,
      installedCommands: ['spec-plan', 'spec-review'],
      installedPrompts: [],
      errors: [],
      configPath: '~/.ccsm/config.json',
    }),
  }
})
vi.mock('../../utils/migration', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    needsMigration: vi.fn().mockResolvedValue(false),
  }
})
vi.mock('../../utils/mcp', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    readClaudeCodeConfig: vi.fn().mockResolvedValue({ mcpServers: {} }),
  }
})
vi.mock('../../utils/host', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  return {
    ...actual,
    getCanonicalHomeDir: vi.fn().mockReturnValue('~/.ccsm'),
    getHostHomeDir: vi.fn().mockReturnValue('~'),
  }
})

const mockedInquirer = vi.mocked(inquirer)
const mockedReadCcgConfig = vi.mocked(readCcgConfig)
const mockedWriteCcgConfig = vi.mocked(writeCcgConfig)

describe('init command - interactive middle-model flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    promptCalls = []
    promptResponses = {
      selectedOrchestrator: 'codex',
      selectedFrontend: 'codex',
      selectedBackend: 'codex',
      selectedLang: 'en',
      includeImpeccable: true,
      confirmed: true,
    }
    mockedReadCcgConfig.mockResolvedValue(null)
    mockedWriteCcgConfig.mockResolvedValue(undefined)
  })

  describe('legacy config inference', () => {
    it('defaults middle-model prompt to enabled when persisted config has only acceptanceReviewer', async () => {
      // Setup: persisted config has acceptanceReviewer but no explicit middleModelEnabled
      mockedReadCcgConfig.mockResolvedValue({
        general: { version: '1.0.0', language: 'en', createdAt: '2024-01-01' },
        ownership: {
          orchestrator: 'codex' as const,
          executionHost: 'claude' as const,
          acceptanceOwner: 'codex' as const,
          acceptance: 'codex' as const,
          acceptanceReviewer: 'opencode' as const,
        },
        routing: {
          frontend: { models: ['codex'], primary: 'codex', strategy: 'fallback' },
          backend: { models: ['codex'], primary: 'codex', strategy: 'fallback' },
          review: { models: ['codex'], strategy: 'parallel' as const },
          mode: 'smart' as const,
        },
        workflows: { installed: [] },
        paths: { hostHome: '~', canonicalHome: '~/.ccsm', commands: '~/.codex/commands', prompts: '~/.ccsm/prompts', backup: '~/.ccsm/backup' },
        mcp: { provider: 'skip', setup_url: '' },
      })

      // Middle-model prompt defaults to true (inferred from acceptanceReviewer)
      promptResponses.selectedMiddleModelEnabled = true
      promptResponses.selectedMiddleModelProvider = 'opencode'

      await init({ skipPrompt: false })

      // Verify the selectedMiddleModelEnabled prompt was called with default === true
      const middleModelPromptCall = promptCalls.find(call =>
        call.questions.some(q => q.name === 'selectedMiddleModelEnabled')
      )
      expect(middleModelPromptCall).toBeDefined()
      const middleModelQuestion = middleModelPromptCall!.questions.find(q => q.name === 'selectedMiddleModelEnabled')
      expect(middleModelQuestion?.default).toBe(true)

      // Verify config was written with middleModelEnabled: true
      expect(mockedWriteCcgConfig).toHaveBeenCalled()
      const writtenConfig = mockedWriteCcgConfig.mock.calls[0][0]
      expect(writtenConfig.ownership?.middleModelEnabled).toBe(true)
      expect(writtenConfig.ownership?.acceptanceReviewer).toBe('opencode')
      expect(writtenConfig.ownership?.middleModelProvider).toBe('opencode')
    })
  })

  describe('disabling middle-model layer', () => {
    it('skips provider selection and does not persist acceptanceReviewer when middle-model is disabled', async () => {
      mockedReadCcgConfig.mockResolvedValue({
        general: { version: '1.0.0', language: 'en', createdAt: '2024-01-01' },
        ownership: {
          orchestrator: 'codex' as const,
          executionHost: 'claude' as const,
          acceptanceOwner: 'codex' as const,
          acceptance: 'codex' as const,
          middleModelEnabled: true,
          middleModelProvider: 'opencode' as const,
        },
        routing: {
          frontend: { models: ['codex'], primary: 'codex', strategy: 'fallback' },
          backend: { models: ['codex'], primary: 'codex', strategy: 'fallback' },
          review: { models: ['codex'], strategy: 'parallel' as const },
          mode: 'smart' as const,
        },
        workflows: { installed: [] },
        paths: { hostHome: '~', canonicalHome: '~/.ccsm', commands: '~/.codex/commands', prompts: '~/.ccsm/prompts', backup: '~/.ccsm/backup' },
        mcp: { provider: 'skip', setup_url: '' },
      })

      // User disables middle-model layer
      promptResponses.selectedMiddleModelEnabled = false

      await init({ skipPrompt: false })

      // Explicitly assert that selectedMiddleModelProvider prompt was NOT shown
      const providerPromptCall = promptCalls.find(call =>
        call.questions.some(q => q.name === 'selectedMiddleModelProvider')
      )
      expect(providerPromptCall).toBeUndefined()

      // Persistence assertions as result checks
      expect(mockedWriteCcgConfig).toHaveBeenCalled()
      const writtenConfig = mockedWriteCcgConfig.mock.calls[0][0]
      expect(writtenConfig.ownership?.middleModelEnabled).toBe(false)
      expect(writtenConfig.ownership?.acceptanceReviewer).toBeUndefined()
    })
  })

  describe('enabling and selecting provider', () => {
    it('persists opencode provider selection correctly when middle-model is enabled', async () => {
      mockedReadCcgConfig.mockResolvedValue(null)

      promptResponses.selectedMiddleModelEnabled = true
      promptResponses.selectedMiddleModelProvider = 'opencode'

      await init({ skipPrompt: false })

      expect(mockedWriteCcgConfig).toHaveBeenCalled()
      const writtenConfig = mockedWriteCcgConfig.mock.calls[0][0]
      expect(writtenConfig.ownership?.middleModelEnabled).toBe(true)
      expect(writtenConfig.ownership?.middleModelProvider).toBe('opencode')
      expect(writtenConfig.ownership?.acceptanceReviewer).toBe('opencode')
    })

    it('persists pi provider selection correctly when middle-model is enabled', async () => {
      mockedReadCcgConfig.mockResolvedValue(null)

      promptResponses.selectedMiddleModelEnabled = true
      promptResponses.selectedMiddleModelProvider = 'pi'

      await init({ skipPrompt: false })

      expect(mockedWriteCcgConfig).toHaveBeenCalled()
      const writtenConfig = mockedWriteCcgConfig.mock.calls[0][0]
      expect(writtenConfig.ownership?.middleModelEnabled).toBe(true)
      expect(writtenConfig.ownership?.middleModelProvider).toBe('pi')
      expect(writtenConfig.ownership?.acceptanceReviewer).toBe('pi')
    })
  })
})
