import { describe, expect, it } from 'vitest'
import { createDefaultConfig, createDefaultRouting } from '../config'

describe('createDefaultRouting', () => {
  it('returns codex as frontend primary for the Codex-led path', () => {
    const routing = createDefaultRouting()
    expect(routing.frontend.primary).toBe('codex')
    expect(routing.frontend.models).toEqual(['codex'])
  })

  it('returns codex as backend primary', () => {
    const routing = createDefaultRouting()
    expect(routing.backend.primary).toBe('codex')
    expect(routing.backend.models).toEqual(['codex'])
  })

  it('returns codex-only review defaults', () => {
    const routing = createDefaultRouting()
    expect(routing.review.models).toEqual(['codex'])
    expect(routing.review.strategy).toBe('parallel')
  })

  it('defaults to smart mode', () => {
    const routing = createDefaultRouting()
    expect(routing.mode).toBe('smart')
  })
})

describe('createDefaultConfig', () => {
  const baseOptions = {
    language: 'zh-CN' as const,
    routing: createDefaultRouting(),
    installedWorkflows: ['workflow', 'plan'],
  }

  it('sets version from package.json', () => {
    const config = createDefaultConfig(baseOptions)
    // version should be a semver string
    expect(config.general.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('sets language correctly', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.general.language).toBe('zh-CN')
  })

  it('sets createdAt as ISO string', () => {
    const config = createDefaultConfig(baseOptions)
    // Should parse without error
    expect(() => new Date(config.general.createdAt)).not.toThrow()
    expect(new Date(config.general.createdAt).toISOString()).toBe(config.general.createdAt)
  })

  it('stores installed workflows', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.workflows.installed).toEqual(['workflow', 'plan'])
  })

  it('defaults mcpProvider to skip', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.mcp.provider).toBe('skip')
  })

  it('respects custom mcpProvider', () => {
    const config = createDefaultConfig({ ...baseOptions, mcpProvider: 'contextweaver' })
    expect(config.mcp.provider).toBe('contextweaver')
  })

  it('defaults skipImpeccable to false', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.performance?.skipImpeccable).toBe(false)
  })

  it('respects skipImpeccable = true', () => {
    const config = createDefaultConfig({ ...baseOptions, skipImpeccable: true })
    expect(config.performance?.skipImpeccable).toBe(true)
  })

  it('sets paths with home directory', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.paths.commands).toContain('.codex')
    expect(config.paths.prompts).toContain('.ccsm')
    expect(config.paths.backup).toContain('.ccsm')
    expect(config.paths.canonicalHome).toContain('.ccsm')
  })

  it('records Codex-led workflow ownership', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.ownership).toEqual({
      orchestrator: 'codex',
      executionHost: 'claude',
      acceptance: 'codex',
      acceptanceOwner: 'codex',
      acceptanceReviewer: undefined,
      middleModelEnabled: false,
      middleModelProvider: 'opencode',
    })
  })

  it('allows overriding ownership metadata', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'claude',
        executionHost: 'codex',
        acceptance: 'claude',
      },
    })
    expect(config.ownership).toEqual({
      orchestrator: 'claude',
      executionHost: 'codex',
      acceptance: 'claude',
      acceptanceOwner: 'claude',
      acceptanceReviewer: undefined,
      middleModelEnabled: false,
      middleModelProvider: 'opencode',
    })
  })

  it('acceptanceOwner defaults to orchestrator when not specified', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
      },
    })
    expect(config.ownership?.acceptanceOwner).toBe('codex')
    expect(config.ownership?.acceptance).toBe('codex')
  })

  it('acceptanceReviewer is optional and undefined by default', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.ownership?.acceptanceReviewer).toBeUndefined()
  })

  it('legacy acceptance field preserves backward compatibility without overriding acceptanceOwner', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptance: 'claude',
      },
    })
    expect(config.ownership?.acceptanceOwner).toBe('codex')
    expect(config.ownership?.acceptance).toBe('claude')
  })

  it('opencode can be set as acceptanceReviewer', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'opencode',
      },
    })
    expect(config.ownership?.acceptanceReviewer).toBe('opencode')
    expect(config.ownership?.acceptanceOwner).toBe('codex')
  })

  it('pi can be set as acceptanceReviewer', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'pi',
      },
    })
    expect(config.ownership?.acceptanceReviewer).toBe('pi')
    expect(config.ownership?.acceptanceOwner).toBe('codex')
  })

  it('middleModelEnabled defaults to false when no reviewer config exists', () => {
    const config = createDefaultConfig(baseOptions)
    expect(config.ownership?.middleModelEnabled).toBe(false)
    expect(config.ownership?.middleModelProvider).toBe('opencode')
  })

  it('middleModelEnabled inferred as true when acceptanceReviewer is present (backward compat)', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'opencode',
      },
    })
    expect(config.ownership?.middleModelEnabled).toBe(true)
    expect(config.ownership?.middleModelProvider).toBe('opencode')
  })

  it('middleModelEnabled true when acceptanceReviewer is pi', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'pi',
      },
    })
    expect(config.ownership?.middleModelEnabled).toBe(true)
    expect(config.ownership?.middleModelProvider).toBe('pi')
  })

  it('explicit middleModelEnabled overrides inferred value', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'opencode',
        middleModelEnabled: false,
      },
    })
    expect(config.ownership?.middleModelEnabled).toBe(false)
  })

  it('middleModelProvider defaults to opencode when acceptanceReviewer is opencode', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'opencode',
      },
    })
    expect(config.ownership?.middleModelProvider).toBe('opencode')
  })

  it('middleModelProvider defaults to pi when acceptanceReviewer is pi', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceReviewer: 'pi',
      },
    })
    expect(config.ownership?.middleModelProvider).toBe('pi')
  })

  it('explicit middleModelProvider is respected', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        middleModelEnabled: true,
        middleModelProvider: 'pi',
      },
    })
    expect(config.ownership?.middleModelEnabled).toBe(true)
    expect(config.ownership?.middleModelProvider).toBe('pi')
  })

  it('acceptanceOwner can be different from orchestrator (future config)', () => {
    const config = createDefaultConfig({
      ...baseOptions,
      ownership: {
        orchestrator: 'codex',
        executionHost: 'claude',
        acceptanceOwner: 'claude',
      },
    })
    expect(config.ownership?.orchestrator).toBe('codex')
    expect(config.ownership?.acceptanceOwner).toBe('claude')
    expect(config.ownership?.acceptance).toBe('claude')
  })

  it('preserves routing config exactly', () => {
    const routing = createDefaultRouting()
    const config = createDefaultConfig({ ...baseOptions, routing })
    expect(config.routing).toEqual(routing)
  })
})
