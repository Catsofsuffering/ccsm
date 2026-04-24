import type { SpawnOptions } from 'node:child_process'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import fs from 'fs-extra'
import { randomUUID } from 'node:crypto'
import { DEFAULT_MONITOR_PORT } from './claude-monitor'

const CLAUDE_PACKAGE_NAME = '@anthropic-ai/claude-code'
const LOCAL_BYPASS_HOSTS = ['127.0.0.1', 'localhost']

export interface ClaudeLaunchSpec {
  command: string
  args: string[]
  source: 'override' | 'path' | 'cmd-shim' | 'package-root'
}

export interface ResolveClaudeLaunchOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export interface RunClaudeExecOptions extends ResolveClaudeLaunchOptions {
  cwd?: string
  prompt?: string
  promptFile?: string
  claudeArgs?: string[]
  enableAgentTeams?: boolean
  stdio?: SpawnOptions['stdio']
  /** Enable status-driven exec: wait for monitor session terminal state instead of process exit */
  statusDriven?: boolean
  /** Run ID for monitor correlation (generated automatically when statusDriven is true) */
  runId?: string
  /** Monitor port for status-driven exec (default: 4820) */
  monitorPort?: number
  /** Workspace root path for CCSM_WORKSPACE_ROOT env var */
  workspaceRoot?: string
}

/** Result of a status-driven exec invocation */
export interface RunClaudeExecResult {
  exitCode: number
  outputs: unknown
  sessionStatus: string
  runId: string
}

const CLAUDE_PERMISSION_MODE_ARG = '--permission-mode'
const CLAUDE_PERMISSION_BYPASS = 'bypassPermissions'
const CLAUDE_PERMISSION_SKIP_VALUES = new Set(['inherit', 'none', 'off', 'false', '0'])

export function mergeNoProxyValue(existing?: string): string {
  const parts = (existing || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)

  for (const host of LOCAL_BYPASS_HOSTS) {
    if (!parts.includes(host)) {
      parts.push(host)
    }
  }

  return parts.join(',')
}

export interface BuildClaudeLaunchEnvOptions {
  enableAgentTeams?: boolean
  runId?: string
  workspaceRoot?: string
}

export function buildClaudeLaunchEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  options: BuildClaudeLaunchEnvOptions = {},
): NodeJS.ProcessEnv {
  const { enableAgentTeams = true, runId, workspaceRoot } = options
  const nextEnv = { ...baseEnv }
  if (nextEnv.CCSM_CLAUDE_APPEND_LOCAL_NO_PROXY === '1') {
    const mergedNoProxy = mergeNoProxyValue(nextEnv.NO_PROXY || nextEnv.no_proxy)
    nextEnv.NO_PROXY = mergedNoProxy
    nextEnv.no_proxy = mergedNoProxy
  }

  if (enableAgentTeams) {
    nextEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1'
    nextEnv.CLAUDE_CODE_ENABLE_TASKS = '1'
  }

  if (runId) {
    nextEnv.CCSM_RUN_ID = runId
  }

  if (workspaceRoot) {
    nextEnv.CCSM_WORKSPACE_ROOT = workspaceRoot
  }

  return nextEnv
}

function hasExplicitPermissionConfiguration(args: string[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (
      token === '--dangerously-skip-permissions'
      || token === '--allow-dangerously-skip-permissions'
      || token === CLAUDE_PERMISSION_MODE_ARG
      || token.startsWith(`${CLAUDE_PERMISSION_MODE_ARG}=`)
    ) {
      return true
    }
  }

  return false
}

export function getDefaultClaudePermissionMode(
  env: NodeJS.ProcessEnv = process.env,
  enableAgentTeams = true,
): string | null {
  const configuredMode = env.CCSM_CLAUDE_PERMISSION_MODE?.trim()
  if (configuredMode) {
    if (CLAUDE_PERMISSION_SKIP_VALUES.has(configuredMode.toLowerCase())) {
      return null
    }
    return configuredMode
  }

  return enableAgentTeams ? CLAUDE_PERMISSION_BYPASS : null
}

export function buildClaudeExecArgs(
  claudeArgs: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  enableAgentTeams = true,
): string[] {
  const args = [...claudeArgs]
  if (hasExplicitPermissionConfiguration(args)) {
    return args
  }

  const permissionMode = getDefaultClaudePermissionMode(env, enableAgentTeams)
  if (!permissionMode) {
    return args
  }

  return [`${CLAUDE_PERMISSION_MODE_ARG}=${permissionMode}`, ...args]
}

export function resolveWindowsCmdShimTarget(shimPath: string, content: string): string | null {
  const match = content.match(/"%dp0%\\([^"\r\n]+?\.(?:c|m)?js)"/i)
  if (!match) {
    return null
  }

  const relativeTarget = match[1].replace(/\\/g, '/')
  const candidate = resolve(dirname(shimPath), relativeTarget)
  return candidate
}

function normalizePathEntries(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const pathValue = env.PATH || env.Path || env.path || ''
  const pathDelimiter = platform === 'win32' ? ';' : delimiter

  return pathValue
    .split(pathDelimiter)
    .map(entry => entry.trim())
    .filter(Boolean)
}

async function resolveOverrideLaunchSpec(overridePath: string): Promise<ClaudeLaunchSpec> {
  const resolvedPath = resolve(overridePath)
  const extension = extname(resolvedPath).toLowerCase()

  if (extension === '.cmd') {
    const shimContent = await fs.readFile(resolvedPath, 'utf-8')
    const target = resolveWindowsCmdShimTarget(resolvedPath, shimContent)
    if (!target) {
      throw new Error(`Could not resolve Claude entry script from ${resolvedPath}`)
    }
    return {
      command: process.execPath,
      args: [target],
      source: 'override',
    }
  }

  if (['.js', '.cjs', '.mjs'].includes(extension)) {
    return {
      command: process.execPath,
      args: [resolvedPath],
      source: 'override',
    }
  }

  return {
    command: resolvedPath,
    args: [],
    source: 'override',
  }
}

async function resolveFromPath(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): Promise<ClaudeLaunchSpec | null> {
  const candidateNames = platform === 'win32'
    ? ['claude.exe', 'claude.cmd', 'claude']
    : ['claude']

  for (const dir of normalizePathEntries(env, platform)) {
    for (const candidateName of candidateNames) {
      const fullPath = join(dir, candidateName)
      if (!await fs.pathExists(fullPath)) {
        continue
      }

      if (platform === 'win32' && fullPath.toLowerCase().endsWith('.cmd')) {
        const shimContent = await fs.readFile(fullPath, 'utf-8')
        const target = resolveWindowsCmdShimTarget(fullPath, shimContent)
        if (target) {
          return {
            command: process.execPath,
            args: [target],
            source: 'cmd-shim',
          }
        }
      }

      return {
        command: fullPath,
        args: [],
        source: 'path',
      }
    }
  }

  return null
}

async function resolveFromPackageRoot(packageRoot: string): Promise<ClaudeLaunchSpec | null> {
  const packageJsonPath = join(packageRoot, 'package.json')
  if (!await fs.pathExists(packageJsonPath)) {
    return null
  }

  const packageJson = await fs.readJson(packageJsonPath) as {
    bin?: string | Record<string, string>
  }

  const binField = packageJson.bin
  let entrypoint: string | undefined
  if (typeof binField === 'string') {
    entrypoint = binField
  }
  else if (binField && typeof binField === 'object') {
    entrypoint = binField.claude || Object.values(binField)[0]
  }

  if (!entrypoint) {
    return null
  }

  const entrypointPath = join(packageRoot, entrypoint)
  if (!await fs.pathExists(entrypointPath)) {
    return null
  }

  return {
    command: process.execPath,
    args: [entrypointPath],
    source: 'package-root',
  }
}

function getPackageRootCandidates(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  const prefixes = new Set<string>()

  if (env.CCSM_CLAUDE_PACKAGE_ROOT) {
    prefixes.add(env.CCSM_CLAUDE_PACKAGE_ROOT)
  }

  if (env.npm_config_prefix) {
    prefixes.add(env.npm_config_prefix)
  }

  if (env.PREFIX) {
    prefixes.add(env.PREFIX)
  }

  if (platform === 'win32') {
    if (env.APPDATA) {
      prefixes.add(join(env.APPDATA, 'npm'))
    }
  }
  else {
    prefixes.add('/usr/local')
    prefixes.add('/opt/homebrew')
    prefixes.add(join(homedir(), '.npm-global'))
  }

  const candidates = new Set<string>()
  for (const prefix of prefixes) {
    const resolvedPrefix = isAbsolute(prefix) ? prefix : resolve(prefix)
    candidates.add(resolvedPrefix)
    candidates.add(join(resolvedPrefix, 'node_modules', CLAUDE_PACKAGE_NAME))
    candidates.add(join(resolvedPrefix, 'lib', 'node_modules', CLAUDE_PACKAGE_NAME))
  }

  return [...candidates]
}

export async function resolveClaudeLaunchSpec(
  options: ResolveClaudeLaunchOptions = {},
): Promise<ClaudeLaunchSpec> {
  const env = options.env || process.env
  const platform = options.platform || process.platform

  const pathSpec = await resolveFromPath(env, platform)
  if (pathSpec) {
    return pathSpec
  }

  if (env.CCSM_CLAUDE_PATH) {
    return await resolveOverrideLaunchSpec(env.CCSM_CLAUDE_PATH)
  }

  for (const candidate of getPackageRootCandidates(env, platform)) {
    const packageRootSpec = await resolveFromPackageRoot(candidate)
    if (packageRootSpec) {
      return packageRootSpec
    }
  }

  throw new Error(
    'Claude CLI was not found on PATH. Install Claude Code so the `claude` command is available, or set CCSM_CLAUDE_PATH only for a non-standard install.',
  )
}

async function readPrompt(options: Pick<RunClaudeExecOptions, 'prompt' | 'promptFile'>): Promise<string | null> {
  if (typeof options.prompt === 'string') {
    return options.prompt
  }

  if (options.promptFile) {
    return await fs.readFile(resolve(options.promptFile), 'utf-8')
  }

  return null
}

async function fetchSessionStatus(port: number, sessionId: string): Promise<{ status: string } | null> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${sessionId}`)
    if (!response.ok) return null
    const data = await response.json() as { session?: { status?: string } }
    return data.session ? { status: data.session.status ?? 'unknown' } : null
  }
  catch {
    return null
  }
}

async function waitForSessionTerminal(
  port: number,
  sessionId: string,
  childExitPromise: Promise<number>,
  gracePeriodMs: number,
): Promise<{ status: string; timedOut: boolean; childExitCode: number | null }> {
  // Race: wait for session terminal state OR child process exit
  while (true) {
    const session = await fetchSessionStatus(port, sessionId)
    if (session && ['completed', 'error', 'abandoned'].includes(session.status)) {
      return { status: session.status, timedOut: false, childExitCode: null }
    }

    // Use Promise.race to detect child exit without blocking indefinitely
    const childRace = Promise.race([
      childExitPromise.then(code => ({ type: 'child-exit' as const, code })),
      new Promise<{ type: 'timeout' }>((resolve) => {
        const timer = setTimeout(() => resolve({ type: 'timeout' }), 500)
        void timer
      }),
    ])

    const result = await childRace
    if (result.type === 'child-exit') {
      // Child exited — start grace period from now
      const graceDeadline = Date.now() + gracePeriodMs

      while (Date.now() < graceDeadline) {
        await new Promise(resolve => setTimeout(resolve, 500))
        const sessionAfterGrace = await fetchSessionStatus(port, sessionId)
        if (sessionAfterGrace && ['completed', 'error', 'abandoned'].includes(sessionAfterGrace.status)) {
          return { status: sessionAfterGrace.status, timedOut: false, childExitCode: result.code }
        }
      }

      // Grace period exhausted — use child's exit code
      return { status: 'unknown', timedOut: true, childExitCode: result.code }
    }
    // else timeout → continue polling
  }
}

async function fetchSessionOutputs(port: number, sessionId: string): Promise<unknown> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/sessions/${sessionId}/outputs`)
    if (!response.ok) return null
    const data = await response.json() as { outputs?: unknown }
    return data.outputs ?? null
  }
  catch {
    return null
  }
}

async function isMonitorAvailable(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`)
    if (!response.ok) return false
    const body = await response.json() as { status?: string }
    return body.status === 'ok'
  }
  catch {
    return false
  }
}

export async function runClaudeExec(options: RunClaudeExecOptions = {}): Promise<number | RunClaudeExecResult> {
  const monitorPort = options.monitorPort || DEFAULT_MONITOR_PORT
  const runId = options.runId || (options.statusDriven ? randomUUID() : undefined)
  const gracePeriodMs = Number(process.env.GRACE_PERIOD_MS || '30000')

  const launchSpec = await resolveClaudeLaunchSpec(options)
  const env = buildClaudeLaunchEnv(options.env || process.env, {
    enableAgentTeams: options.enableAgentTeams !== false,
    runId,
    workspaceRoot: options.workspaceRoot,
  })
  const prompt = await readPrompt(options)
  const args = [...launchSpec.args]

  if (prompt !== null) {
    args.push('-p', prompt)
  }

  const finalClaudeArgs = buildClaudeExecArgs(options.claudeArgs, env, options.enableAgentTeams !== false)
  args.push(...finalClaudeArgs)

  // Fallback: simple process exit behavior when statusDriven is false or monitor is unavailable
  if (!options.statusDriven || !(await isMonitorAvailable(monitorPort))) {
    return await new Promise<number>((resolvePromise, rejectPromise) => {
      const child = spawn(launchSpec.command, args, {
        cwd: options.cwd,
        env,
        stdio: options.stdio || 'inherit',
        shell: false,
      })

      child.on('error', rejectPromise)
      child.on('close', (code, signal) => {
        if (signal) {
          rejectPromise(new Error(`Claude process terminated by signal ${signal}`))
          return
        }

        resolvePromise(code ?? 1)
      })
    })
  }

  // Status-driven mode: spawn child, wait for monitor session terminal state, fetch outputs
  // Hooks create the real session with run_id correlation; we just wait for it
  let sessionId: string = runId as string

  let childExitCode: number | null = null

  const child = spawn(launchSpec.command, args, {
    cwd: options.cwd,
    env,
    stdio: options.stdio || 'inherit',
    shell: false,
  })

  child.on('error', (err) => {
    console.error('Claude process error:', err)
  })

  const childExitPromise = new Promise<number>((resolve) => {
    child.on('close', (code) => {
      childExitCode = code ?? 1
      resolve(childExitCode)
    })
  })

  // Wait for monitor session to be created with this run_id, then wait for terminal state
  const createdSessionId = await waitForSessionCreation(monitorPort, runId!, gracePeriodMs)
  if (createdSessionId) {
    sessionId = createdSessionId
  }

  // Wait for monitor session to reach terminal state, with grace period after child exits
  const { status: sessionStatus, timedOut } = await waitForSessionTerminal(
    monitorPort,
    sessionId,
    childExitPromise,
    gracePeriodMs,
  )

  if (timedOut) {
    // Grace period expired — fall back to child's exit code
    if (childExitCode !== null) {
      return childExitCode
    }
    // Child still running but session never reached terminal state
    return childExitCode ?? 1
  }

  // Fetch structured outputs from monitor
  const outputs = await fetchSessionOutputs(monitorPort, sessionId)

  // Determine exit code: completed=0, error/abandoned=childExitCode??1
  const exitCode = sessionStatus === 'completed'
    ? 0
    : (childExitCode ?? 1);

  return {
    exitCode,
    outputs,
    sessionStatus,
    runId: sessionId,
  }
}

async function waitForSessionCreation(
  port: number,
  runId: string,
  timeoutMs: number,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      // Try to find session by run_id via the filter endpoint
      const response = await fetch(`http://127.0.0.1:${port}/api/sessions?run_id=${encodeURIComponent(runId)}`)
      if (response.ok) {
        const data = await response.json() as { sessions?: Array<{ id?: string }> }
        if (data.sessions && data.sessions.length > 0 && data.sessions[0].id) {
          return data.sessions[0].id
        }
      }
    }
    catch {
      // Continue polling
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return null
}
