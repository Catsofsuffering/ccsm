import ansis from 'ansis'
import { buildClaudeExecArgs, buildClaudeLaunchEnv, getDefaultClaudePermissionMode, resolveClaudeLaunchSpec, runClaudeExec, RunClaudeExecResult } from '../utils/claude-cli'

interface ClaudeExecCommandOptions {
  cwd?: string
  prompt?: string
  promptFile?: string
  disableAgentTeams?: boolean
  statusDriven?: boolean
}

const CLAUDE_EXEC_KNOWN_OPTIONS = new Set([
  '--prompt',
  '--prompt-file',
  '--cwd',
  '--disable-agent-teams',
  '--status-driven',
])

function isValueAttachedOption(token: string): boolean {
  return token.startsWith('--prompt=')
    || token.startsWith('--prompt-file=')
    || token.startsWith('--cwd=')
}

export function extractClaudeExecArgs(argv: string[]): string[] {
  const claudeIndex = argv.lastIndexOf('claude')
  const execIndex = argv.indexOf('exec', claudeIndex >= 0 ? claudeIndex : 0)
  if (execIndex < 0) {
    return []
  }

  const rawTokens = argv.slice(execIndex + 1)
  const passthroughMarkerIndex = rawTokens.indexOf('--')
  if (passthroughMarkerIndex >= 0) {
    return rawTokens.slice(passthroughMarkerIndex + 1)
  }

  const passthrough: string[] = []
  for (let i = 0; i < rawTokens.length; i++) {
    const token = rawTokens[i]
    if (isValueAttachedOption(token)) {
      continue
    }

    if (CLAUDE_EXEC_KNOWN_OPTIONS.has(token)) {
      if (token !== '--disable-agent-teams' && token !== '--status-driven') {
        i++
      }
      continue
    }

    passthrough.push(token)
  }

  return passthrough
}

export async function execClaude(
  claudeArgs: string[],
  options: ClaudeExecCommandOptions,
): Promise<number | RunClaudeExecResult> {
  const rawClaudeArgs = extractClaudeExecArgs(process.argv)
  const result = await runClaudeExec({
    claudeArgs: rawClaudeArgs.length > 0 ? rawClaudeArgs : claudeArgs,
    cwd: options.cwd,
    prompt: options.prompt,
    promptFile: options.promptFile,
    enableAgentTeams: !options.disableAgentTeams,
    statusDriven: options.statusDriven,
  })

  if (typeof result === 'number') {
    if (result !== 0) {
      process.exitCode = result
    }
  }
  else {
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode
    }
    // Status-driven path: output structured result as JSON to stdout
    console.log(JSON.stringify(result, null, 2))
  }

  return result
}

export async function doctorClaude(options: Pick<ClaudeExecCommandOptions, 'disableAgentTeams'> = {}): Promise<void> {
  const launchSpec = await resolveClaudeLaunchSpec()
  const env = buildClaudeLaunchEnv(process.env, { enableAgentTeams: !options.disableAgentTeams })
  const permissionMode = getDefaultClaudePermissionMode(env, !options.disableAgentTeams)
  const defaultClaudeArgs = buildClaudeExecArgs([], env, !options.disableAgentTeams)
  const hasOverride = Boolean(process.env.CCSM_CLAUDE_PATH)
  const appendLocalNoProxy = process.env.CCSM_CLAUDE_APPEND_LOCAL_NO_PROXY === '1'

  console.log()
  console.log(ansis.cyan.bold('  Claude launcher'))
  console.log(ansis.gray(`    command: ${launchSpec.command}`))
  console.log(ansis.gray(`    args: ${launchSpec.args.join(' ') || '(none)'}`))
  console.log(ansis.gray(`    source: ${launchSpec.source}`))
  console.log(ansis.gray(`    discovery: PATH first, override fallback`))
  console.log(ansis.gray(`    proxy passthrough: enabled`))
  console.log(ansis.gray(`    local NO_PROXY append: ${appendLocalNoProxy ? 'enabled' : 'disabled'}`))
  console.log(ansis.gray(`    NO_PROXY: ${env.NO_PROXY || ''}`))
  console.log(ansis.gray(`    agent teams: ${options.disableAgentTeams ? 'disabled' : 'enabled'}`))
  console.log(ansis.gray(`    permission mode: ${permissionMode || 'inherit'}`))
  console.log(ansis.gray(`    default args: ${defaultClaudeArgs.join(' ') || '(none)'}`))
  if (hasOverride) {
    console.log(ansis.gray(`    CCSM_CLAUDE_PATH: configured${launchSpec.source === 'override' ? ' (active)' : ' (inactive; PATH won)'}`))
  }
}
