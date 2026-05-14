import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractClaudeExecArgs } from '../../commands/claude'
import {
  buildClaudeExecArgs,
  buildClaudeLaunchEnv,
  getReturnPacketPath,
  getDefaultClaudePermissionMode,
  hasUsableExecutionOutputs,
  mergeNoProxyValue,
  readReturnPacketArtifact,
  resolveExecutionEvidence,
  resolveClaudeLaunchSpec,
  resolveWindowsCmdShimTarget,
} from '../claude-cli'

function findPackageRoot(): string {
  let dir = import.meta.dirname
  for (let i = 0; i < 10; i++) {
    try {
      readFileSync(join(dir, 'package.json'))
      return dir
    }
    catch {
      dir = join(dir, '..')
    }
  }
  throw new Error('Could not find package root')
}

describe('mergeNoProxyValue', () => {
  it('adds localhost bypass entries once', () => {
    expect(mergeNoProxyValue('example.com,localhost')).toBe('example.com,localhost,127.0.0.1')
  })

  it('creates a local-only bypass when env is empty', () => {
    expect(mergeNoProxyValue('')).toBe('127.0.0.1,localhost')
  })
})

describe('buildClaudeLaunchEnv', () => {
  it('injects Agent Teams flags by default without mutating proxy bypass', () => {
    const env = buildClaudeLaunchEnv({ NO_PROXY: 'example.com' })
    expect(env.NO_PROXY).toBe('example.com')
    expect(env.no_proxy).toBeUndefined()
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1')
    expect(env.CLAUDE_CODE_ENABLE_TASKS).toBe('1')
  })

  it('can append local NO_PROXY only when explicitly requested', () => {
    const env = buildClaudeLaunchEnv({
      NO_PROXY: 'example.com',
      CCSM_CLAUDE_APPEND_LOCAL_NO_PROXY: '1',
    })
    expect(env.NO_PROXY).toBe('example.com,127.0.0.1,localhost')
    expect(env.no_proxy).toBe('example.com,127.0.0.1,localhost')
  })

  it('can skip Agent Teams flags', () => {
    const env = buildClaudeLaunchEnv({}, { enableAgentTeams: false })
    expect(env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBeUndefined()
    expect(env.CLAUDE_CODE_ENABLE_TASKS).toBeUndefined()
  })

  it('can inject runId and workspaceRoot', () => {
    const env = buildClaudeLaunchEnv({}, { runId: 'test-run-123', workspaceRoot: '/tmp/workspace' })
    expect(env.CCSM_RUN_ID).toBe('test-run-123')
    expect(env.CCSM_WORKSPACE_ROOT).toBe('/tmp/workspace')
  })

  it('can inject a persisted return-packet path for status-driven runs', () => {
    const env = buildClaudeLaunchEnv({}, { returnPacketPath: '/tmp/.ccsm/return-packets/test-run-123.md' })
    expect(env.CCSM_RETURN_PACKET_PATH).toBe('/tmp/.ccsm/return-packets/test-run-123.md')
  })
})

describe('Claude permission defaults', () => {
  it('defaults Agent Teams launches to bypassPermissions', () => {
    expect(getDefaultClaudePermissionMode({})).toBe('bypassPermissions')
    expect(buildClaudeExecArgs(['--verbose'])).toEqual(['--permission-mode=bypassPermissions', '--verbose'])
  })

  it('does not inject a default permission mode when Agent Teams are disabled', () => {
    expect(getDefaultClaudePermissionMode({}, false)).toBeNull()
    expect(buildClaudeExecArgs(['--verbose'], {}, false)).toEqual(['--verbose'])
  })

  it('allows explicit environment override and opt-out', () => {
    expect(getDefaultClaudePermissionMode({ CCSM_CLAUDE_PERMISSION_MODE: 'acceptEdits' })).toBe('acceptEdits')
    expect(buildClaudeExecArgs([], { CCSM_CLAUDE_PERMISSION_MODE: 'acceptEdits' })).toEqual(['--permission-mode=acceptEdits'])
    expect(getDefaultClaudePermissionMode({ CCSM_CLAUDE_PERMISSION_MODE: 'inherit' })).toBeNull()
    expect(buildClaudeExecArgs([], { CCSM_CLAUDE_PERMISSION_MODE: 'inherit' })).toEqual([])
  })

  it('preserves explicit user permission flags', () => {
    expect(buildClaudeExecArgs(['--permission-mode', 'default', '--verbose'])).toEqual(['--permission-mode', 'default', '--verbose'])
    expect(buildClaudeExecArgs(['--dangerously-skip-permissions'])).toEqual(['--dangerously-skip-permissions'])
  })
})

describe('resolveWindowsCmdShimTarget', () => {
  it('extracts the JS entrypoint from an npm-generated cmd shim', () => {
    const shimPath = 'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd'
    const shimContent = `@ECHO off
SETLOCAL
IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
)
endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.js" %*
`

    expect(resolveWindowsCmdShimTarget(shimPath, shimContent)).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.js',
    )
  })
})

describe('resolveClaudeLaunchSpec', () => {
  it('prefers PATH over CCSM_CLAUDE_PATH when a standard install is available', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-claude-path-'))
    const env: NodeJS.ProcessEnv = { ...process.env, PATH: fixtureDir, CCSM_CLAUDE_PATH: join(fixtureDir, 'override.js') }

    if (process.platform === 'win32') {
      const shimPath = join(fixtureDir, 'claude.cmd')
      writeFileSync(
        shimPath,
        `@ECHO off
endLocal & goto #_undefined_# 2>NUL || "%dp0%\\node.exe"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.js" %*
`,
      )
      writeFileSync(join(fixtureDir, 'override.js'), 'console.log("override")\n')

      const spec = await resolveClaudeLaunchSpec({ env, platform: 'win32' })
      expect(spec.source).toBe('cmd-shim')
    }
    else {
      writeFileSync(join(fixtureDir, 'claude'), '#!/usr/bin/env node\n')
      writeFileSync(join(fixtureDir, 'override.js'), 'console.log("override")\n')

      const spec = await resolveClaudeLaunchSpec({ env, platform: process.platform })
      expect(spec.source).toBe('path')
      expect(spec.command).toBe(join(fixtureDir, 'claude'))
    }
  })

  it('uses CCSM_CLAUDE_PATH as a fallback override for non-standard installs', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-claude-override-'))
    const overridePath = join(fixtureDir, 'claude-entry.mjs')
    writeFileSync(overridePath, 'console.log("claude")\n')

    const spec = await resolveClaudeLaunchSpec({
      env: { ...process.env, PATH: '', CCSM_CLAUDE_PATH: overridePath },
      platform: process.platform,
    })

    expect(spec.source).toBe('override')
    expect(spec.command).toBe(process.execPath)
    expect(spec.args).toEqual([overridePath])
  })
})

describe('extractClaudeExecArgs', () => {
  it('extracts raw args after an explicit passthrough marker', () => {
    expect(extractClaudeExecArgs(['node', 'ccsm', 'claude', 'exec', '--', '--version']))
      .toEqual(['--version'])
  })

  it('filters known wrapper options and keeps Claude flags', () => {
    expect(extractClaudeExecArgs([
      'node',
      'ccsm',
      'claude',
      'exec',
      '--cwd',
      'B:\\project\\ccs',
      '--disable-agent-teams',
      '--version',
      '--verbose',
    ])).toEqual(['--version', '--verbose'])
  })
})

describe('status-driven execution evidence', () => {
  it('builds the canonical return-packet path from the run id', () => {
    expect(getReturnPacketPath('run-123', '/tmp/.ccsm')).toBe(join('/tmp/.ccsm', 'return-packets', 'run-123.md'))
  })

  it('detects usable and unusable monitor outputs', () => {
    expect(hasUsableExecutionOutputs(null)).toBe(false)
    expect(hasUsableExecutionOutputs('   ')).toBe(false)
    expect(hasUsableExecutionOutputs({})).toBe(false)
    expect(hasUsableExecutionOutputs({ agents: [] })).toBe(false)
    expect(hasUsableExecutionOutputs({ latest_output_agent_id: 'main' })).toBe(false)
    expect(hasUsableExecutionOutputs({ agents: [{ id: 'main' }] })).toBe(false)
    expect(hasUsableExecutionOutputs({ agents: [{ output_count: 0, outputs: [], latest_output: null }] })).toBe(false)
    expect(hasUsableExecutionOutputs([{ markdown: 'done' }])).toBe(true)
    expect(hasUsableExecutionOutputs({
      agents: [{ latest_output: { markdown: '# Summary', source: 'transcript' }, output_count: 1, outputs: [] }],
      latest_output_agent_id: 'main',
    })).toBe(true)
  })

  it('reads a persisted return packet when the artifact exists', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-return-packet-'))
    const returnPacketPath = join(fixtureDir, 'run-123.md')
    writeFileSync(returnPacketPath, 'EXECUTION RETURN PACKET\nstatus: completed\n')

    await expect(readReturnPacketArtifact(returnPacketPath)).resolves.toContain('EXECUTION RETURN PACKET')
  })

  it('prefers monitor outputs over the persisted fallback artifact', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-return-packet-priority-'))
    const returnPacketPath = join(fixtureDir, 'run-123.md')
    writeFileSync(returnPacketPath, 'EXECUTION RETURN PACKET\nstatus: completed\n')

    const result = await resolveExecutionEvidence({
      agents: [
        {
          agent_id: 'main',
          latest_output: { markdown: '# Summary', source: 'transcript' },
          output_count: 1,
          outputs: [{ markdown: '# Summary', source: 'transcript' }],
        },
      ],
      latest_output_agent_id: 'main',
    }, returnPacketPath)
    expect(result.outputSource).toBe('monitor')
    expect(result.outputs).toEqual({
      agents: [
        {
          agent_id: 'main',
          latest_output: { markdown: '# Summary', source: 'transcript' },
          output_count: 1,
          outputs: [{ markdown: '# Summary', source: 'transcript' }],
        },
      ],
      latest_output_agent_id: 'main',
    })
    expect(result.returnPacketPath).toBe(returnPacketPath)
  })

  it('falls back to the persisted return packet when monitor outputs are unusable', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-return-packet-fallback-'))
    const returnPacketPath = join(fixtureDir, 'run-456.md')
    writeFileSync(returnPacketPath, 'EXECUTION RETURN PACKET\nstatus: partial\n')

    const result = await resolveExecutionEvidence(null, returnPacketPath)
    expect(result.outputSource).toBe('return-packet-fallback')
    expect(result.outputs).toEqual({
      source: 'ccsm-return-packet-fallback',
      path: returnPacketPath,
      content: 'EXECUTION RETURN PACKET\nstatus: partial',
    })
    expect(result.returnPacketPath).toBe(returnPacketPath)
  })

  it('falls back when monitor outputs only contain incomplete metadata', async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'ccsm-return-packet-incomplete-'))
    const returnPacketPath = join(fixtureDir, 'run-789.md')
    writeFileSync(returnPacketPath, 'EXECUTION RETURN PACKET\nstatus: completed\n')

    const result = await resolveExecutionEvidence({
      agents: [{ id: 'main', output_count: 0, outputs: [], latest_output: null }],
      latest_output_agent_id: 'main',
    }, returnPacketPath)

    expect(result.outputSource).toBe('return-packet-fallback')
    expect(result.outputs).toEqual({
      source: 'ccsm-return-packet-fallback',
      path: returnPacketPath,
      content: 'EXECUTION RETURN PACKET\nstatus: completed',
    })
  })

  it('surfaces a none source when no usable evidence exists', async () => {
    const result = await resolveExecutionEvidence(null, join(tmpdir(), 'missing-return-packet.md'))
    expect(result.outputSource).toBe('none')
    expect(result.outputs).toBeNull()
  })
})

describe('spec-impl skill', () => {
  it('uses the stable ccsm claude launcher instead of a PowerShell snippet', () => {
    const packageRoot = findPackageRoot()
    const content = readFileSync(join(packageRoot, 'templates', 'codex-skills', 'spec-impl', 'SKILL.md'), 'utf-8')

    expect(content).toContain('ccsm claude exec --status-driven --prompt-file')
    expect(content).toContain('host-native delegation')
    expect(content).toContain('returnPacketPath')
    expect(content).not.toContain('```powershell')
    expect(content).not.toContain('claude -p $prompt')
  })
})
