import type { HostRuntime, InstallResult, ModelType, SkillRole } from '../types'
import fs from 'fs-extra'
import { homedir } from 'node:os'
import { basename, join } from 'pathe'
import { installBundledMonitor, removeClaudeMonitorHooks } from './claude-monitor'
import {
  getAllCommandIds,
  getDefaultCommandIds,
  getWorkflowById,
  getWorkflowConfigs,
  getWorkflowPreset,
  WORKFLOW_PRESETS,
} from './installer-data'
import {
  ALL_CODEX_SKILL_NAMES,
  ALL_RULE_FILES,
  CANONICAL_CODEX_SKILL_NAMES,
  CANONICAL_NAMESPACE,
  CANONICAL_RUNTIME_DIRNAME,
  CANONICAL_RULE_FILES,
  DEPRECATED_CODEX_SKILL_NAME_MAP,
  DEPRECATED_CODEX_SKILL_NAMES,
  DEPRECATED_HOST_NAMESPACES,
  DEPRECATED_RULE_FILES,
  EXECUTION_CODEX_SKILL_NAMES,
  MANAGED_CODEX_SKILL_MARKER,
  MANAGED_EXECUTION_SKILL_MARKER,
} from './identity'
import {
  injectConfigVariables,
  PACKAGE_ROOT,
  replaceHomePathsInTemplate,
} from './installer-template'
import { getHostHomeDir } from './host'
import { collectInvocableSkills, collectSkills, installSkillCommands, parseFrontmatter } from './skill-registry'

export {
  getAllCommandIds,
  getDefaultCommandIds,
  getWorkflowById,
  getWorkflowConfigs,
  getWorkflowPreset,
  WORKFLOW_PRESETS,
} from './installer-data'
export type { WorkflowPreset } from './installer-data'

export { injectConfigVariables } from './installer-template'

export {
  installAceTool,
  installAceToolRs,
  installContextWeaver,
  installFastContext,
  installMcpServer,
  syncMcpToCodex,
  uninstallAceTool,
  uninstallContextWeaver,
  uninstallFastContext,
  uninstallMcpServer,
} from './installer-mcp'
export type { ContextWeaverConfig } from './installer-mcp'

export {
  removeFastContextPrompt,
  writeFastContextPrompt,
} from './installer-prompt'

export {
  collectInvocableSkills,
  collectSkills,
  parseFrontmatter,
} from './skill-registry'
export type { SkillMeta } from './skill-registry'

interface InstallConfig {
  routing: {
    mode: string
    frontend: { models: string[], primary: string }
    backend: { models: string[], primary: string }
    review: { models: string[] }
  }
  ownership?: {
    orchestrator: ModelType
    executionHost: HostRuntime
  }
  mcpProvider: string
  skipImpeccable?: boolean
}

interface InstallContext {
  hostHomeDir: string
  claudeHomeDir: string
  canonicalHomeDir: string
  codexHomeDir: string
  codexSkillConflicts: Set<string>
  executionHomeDir: string
  executionSkillConflicts: Set<string>
  force: boolean
  config: InstallConfig
  templateDir: string
  result: InstallResult
}

function appendSkillRoleSummary(
  result: InstallResult,
  summary: {
    role: SkillRole
    names: string[]
    destinationHost: HostRuntime
    destinationPath: string
  },
): void {
  result.skillRoleSummary ||= []
  const key = JSON.stringify({
    role: summary.role,
    names: [...summary.names],
    destinationHost: summary.destinationHost,
    destinationPath: summary.destinationPath.replace(/\\/g, '/'),
  })
  const exists = result.skillRoleSummary.some(existing =>
    JSON.stringify({
      role: existing.role,
      names: [...existing.names],
      destinationHost: existing.destinationHost,
      destinationPath: existing.destinationPath.replace(/\\/g, '/'),
    }) === key,
  )
  if (!exists)
    result.skillRoleSummary.push(summary)
}

function normalizeManagedCodexSkillContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd()
}

function markManagedCodexSkill(content: string): string {
  if (content.includes(MANAGED_CODEX_SKILL_MARKER))
    return content
  return `${content.trimEnd()}\n\n${MANAGED_CODEX_SKILL_MARKER}\n`
}

async function isManagedCodexSkill(skillFile: string, expectedContent?: string): Promise<boolean> {
  if (!(await fs.pathExists(skillFile)))
    return false

  const content = await fs.readFile(skillFile, 'utf-8')
  if (content.includes(MANAGED_CODEX_SKILL_MARKER))
    return true

  if (expectedContent) {
    return normalizeManagedCodexSkillContent(content) === normalizeManagedCodexSkillContent(expectedContent)
  }

  return false
}

function normalizeManagedExecutionSkillContent(content: string): string {
  return content.replace(/\r\n/g, '\n').trimEnd()
}

function markManagedExecutionSkill(content: string): string {
  if (content.includes(MANAGED_EXECUTION_SKILL_MARKER))
    return content
  return `${content.trimEnd()}\n\n${MANAGED_EXECUTION_SKILL_MARKER}\n`
}

async function isManagedExecutionSkill(skillFile: string, expectedContent?: string): Promise<boolean> {
  if (!(await fs.pathExists(skillFile)))
    return false

  const content = await fs.readFile(skillFile, 'utf-8')
  if (content.includes(MANAGED_EXECUTION_SKILL_MARKER))
    return true

  if (expectedContent) {
    return normalizeManagedExecutionSkillContent(content) === normalizeManagedExecutionSkillContent(expectedContent)
  }

  return false
}

async function copyMdTemplates(
  ctx: InstallContext,
  srcDir: string,
  destDir: string,
  options: { inject?: boolean } = {},
): Promise<string[]> {
  const installed: string[] = []
  if (!(await fs.pathExists(srcDir))) {
    console.error(`[CCSM] Template source directory not found: ${srcDir}`)
    return installed
  }

  await fs.ensureDir(destDir)
  const files = await fs.readdir(srcDir)
  for (const file of files) {
    if (!file.endsWith('.md'))
      continue

    const destFile = join(destDir, file)
    if (ctx.force || !(await fs.pathExists(destFile))) {
      let content = await fs.readFile(join(srcDir, file), 'utf-8')
      if (options.inject)
        content = injectConfigVariables(content, ctx.config)
      content = replaceHomePathsInTemplate(content, {
        claudeHomeDir: ctx.claudeHomeDir,
        codexHomeDir: ctx.codexHomeDir,
        canonicalHomeDir: ctx.canonicalHomeDir,
      })
      await fs.writeFile(destFile, content, 'utf-8')
    }
    installed.push(file.replace('.md', ''))
  }

  return installed
}

async function installCommandFiles(ctx: InstallContext, workflowIds: string[]): Promise<void> {
  const commandsDir = join(ctx.hostHomeDir, 'commands', CANONICAL_NAMESPACE)
  await fs.ensureDir(commandsDir)

  for (const workflowId of workflowIds) {
    const workflow = getWorkflowById(workflowId)
    if (!workflow) {
      ctx.result.errors.push(`Unknown workflow: ${workflowId}`)
      ctx.result.success = false
      continue
    }

    for (const cmd of workflow.commands) {
      const srcFile = join(ctx.templateDir, 'commands', `${cmd}.md`)
      const destFile = join(commandsDir, `${cmd}.md`)

      try {
        if (!(await fs.pathExists(srcFile))) {
          ctx.result.errors.push(`Missing command template: templates/commands/${cmd}.md`)
          ctx.result.success = false
          continue
        }

        if (ctx.force || !(await fs.pathExists(destFile))) {
          let content = await fs.readFile(srcFile, 'utf-8')
          content = injectConfigVariables(content, ctx.config)
          content = replaceHomePathsInTemplate(content, {
            claudeHomeDir: ctx.claudeHomeDir,
            codexHomeDir: ctx.codexHomeDir,
            canonicalHomeDir: ctx.canonicalHomeDir,
          })
          await fs.writeFile(destFile, content, 'utf-8')
        }

        ctx.result.installedCommands.push(cmd)
      }
      catch (error) {
        ctx.result.errors.push(`Failed to install ${cmd}: ${error}`)
        ctx.result.success = false
      }
    }
  }
}

async function installAgentFiles(ctx: InstallContext): Promise<void> {
  try {
    await copyMdTemplates(
      ctx,
      join(ctx.templateDir, 'commands', 'agents'),
      join(ctx.hostHomeDir, 'agents', CANONICAL_NAMESPACE),
      { inject: true },
    )
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install agents: ${error}`)
    ctx.result.success = false
  }
}

async function installPromptFiles(ctx: InstallContext): Promise<void> {
  const promptsTemplateDir = join(ctx.templateDir, 'prompts')
  const promptsDir = join(ctx.canonicalHomeDir, 'prompts')
  if (!(await fs.pathExists(promptsTemplateDir))) {
    ctx.result.errors.push(`Prompts template directory not found: ${promptsTemplateDir}`)
    ctx.result.success = false
    return
  }

  const promptModels = ['codex', 'claude']

  for (const model of promptModels) {
    try {
      const installed = await copyMdTemplates(
        ctx,
        join(promptsTemplateDir, model),
        join(promptsDir, model),
      )
      for (const name of installed)
        ctx.result.installedPrompts.push(`${model}/${name}`)
    }
    catch (error) {
      ctx.result.errors.push(`Failed to install ${model} prompts: ${error}`)
      ctx.result.success = false
    }
  }
}

async function collectSkillNames(dir: string, depth = 0): Promise<string[]> {
  const names: string[] = []
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        names.push(...await collectSkillNames(join(dir, entry.name), depth + 1))
      }
      else if (entry.name === 'SKILL.md' && depth > 0) {
        names.push(basename(dir))
      }
    }
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT')
      console.error(`[CCSM] Failed to read skills directory ${dir}: ${code || error}`)
  }
  return names
}

async function removeDirCollectMdNames(dir: string): Promise<string[]> {
  if (!(await fs.pathExists(dir)))
    return []

  const files = await fs.readdir(dir)
  const names = files.filter(file => file.endsWith('.md')).map(file => file.replace('.md', ''))
  await fs.remove(dir)
  return names
}

async function installSkillFiles(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'skills')
  const skillsDestDir = join(ctx.canonicalHomeDir, 'skills', CANONICAL_NAMESPACE)

  if (!(await fs.pathExists(skillsTemplateDir))) {
    ctx.result.errors.push(`Skills template directory not found: ${skillsTemplateDir}`)
    ctx.result.success = false
    return
  }

  try {
    const oldSkillsRoots = [
      join(ctx.canonicalHomeDir, 'skills'),
      join(ctx.hostHomeDir, 'skills'),
    ]
    const legacyItems = ['tools', 'orchestration', 'SKILL.md', 'run_skill.js']
    const migrationRoot = oldSkillsRoots.find(asyncCandidate => fs.existsSync(join(asyncCandidate, 'tools')))
    const needsMigration = !await fs.pathExists(skillsDestDir) && Boolean(migrationRoot)

    if (needsMigration) {
      await fs.ensureDir(skillsDestDir)
      for (const item of legacyItems) {
        const oldPath = join(migrationRoot!, item)
        const newPath = join(skillsDestDir, item)
        if (await fs.pathExists(oldPath)) {
          try {
            await fs.move(oldPath, newPath, { overwrite: true })
          }
          catch (error) {
            ctx.result.errors.push(`Skills migration: failed to move ${item}: ${error}`)
          }
        }
      }
    }

    await fs.copy(skillsTemplateDir, skillsDestDir, {
      overwrite: true,
      errorOnExist: false,
    })

    const replacePathsInDir = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          await replacePathsInDir(fullPath)
        }
        else if (entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8')
          const processed = replaceHomePathsInTemplate(content, {
            claudeHomeDir: ctx.claudeHomeDir,
            codexHomeDir: ctx.codexHomeDir,
            canonicalHomeDir: ctx.canonicalHomeDir,
          })
          if (processed !== content)
            await fs.writeFile(fullPath, processed, 'utf-8')
        }
      }
    }

    await replacePathsInDir(skillsDestDir)

    const installedSkills = await collectSkillNames(skillsDestDir)
    ctx.result.installedSkills = installedSkills.length
    if (installedSkills.length === 0) {
      ctx.result.errors.push(`Skills copy completed but no SKILL.md was found in ${skillsDestDir}`)
      ctx.result.success = false
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install skills: ${error}`)
    ctx.result.success = false
  }
}

async function installCodexWorkflowSkills(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'codex-skills')
  const orchestratorHost = ctx.config.ownership?.orchestrator || 'codex'
  const orchestratorHomeDir = orchestratorHost === 'codex' ? ctx.codexHomeDir : ctx.claudeHomeDir
  const orchestratorSkillsDir = join(orchestratorHomeDir, 'skills')

  if (!(await fs.pathExists(skillsTemplateDir))) {
    ctx.result.errors.push(`Codex skills template directory not found: ${skillsTemplateDir}`)
    ctx.result.success = false
    return
  }

  try {
    await fs.ensureDir(orchestratorSkillsDir)
    const installed: string[] = []

    for (const skillName of CANONICAL_CODEX_SKILL_NAMES) {
      const srcDir = join(skillsTemplateDir, skillName)
      const skillFile = join(srcDir, 'SKILL.md')
      if (!(await fs.pathExists(skillFile))) {
        ctx.result.errors.push(`Missing Codex workflow skill template: ${skillFile}`)
        ctx.result.success = false
        continue
      }

      let content = await fs.readFile(skillFile, 'utf-8')
      content = injectConfigVariables(content, ctx.config)
      content = replaceHomePathsInTemplate(content, {
        claudeHomeDir: ctx.claudeHomeDir,
        codexHomeDir: ctx.codexHomeDir,
        canonicalHomeDir: ctx.canonicalHomeDir,
      })
      const destDir = join(orchestratorSkillsDir, skillName)
      const destSkillFile = join(destDir, 'SKILL.md')
      if (await fs.pathExists(destDir) && !await isManagedCodexSkill(destSkillFile, content)) {
        ctx.result.errors.push(`Codex workflow skill conflict: ${skillName} already exists and is not managed by CCSM`)
        ctx.result.success = false
        ctx.codexSkillConflicts.add(skillName)
        continue
      }

      await fs.ensureDir(destDir)
      content = markManagedCodexSkill(content)
      await fs.writeFile(destSkillFile, content, 'utf-8')
      installed.push(skillName)
    }

    ctx.result.installedCodexSkills = installed
    if (installed.length > 0) {
      appendSkillRoleSummary(ctx.result, {
        role: 'orchestration' as SkillRole,
        names: [...installed],
        destinationHost: orchestratorHost,
        destinationPath: orchestratorSkillsDir,
      })
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install Codex workflow skills: ${error}`)
    ctx.result.success = false
  }
}

async function installExecutionSkills(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'codex-skills', 'execution')
  const executionSkillsDir = join(ctx.executionHomeDir, 'skills')

  if (!(await fs.pathExists(skillsTemplateDir))) {
    return
  }

  try {
    await fs.ensureDir(executionSkillsDir)
    const installed: string[] = []

    for (const skillName of EXECUTION_CODEX_SKILL_NAMES) {
      const srcDir = join(skillsTemplateDir, skillName)
      const skillFile = join(srcDir, 'SKILL.md')
      if (!(await fs.pathExists(skillFile))) {
        ctx.result.errors.push(`Missing execution skill template: ${skillFile}`)
        ctx.result.success = false
        continue
      }

      let content = await fs.readFile(skillFile, 'utf-8')
      content = injectConfigVariables(content, ctx.config)
      content = replaceHomePathsInTemplate(content, {
        claudeHomeDir: ctx.claudeHomeDir,
        codexHomeDir: ctx.codexHomeDir,
        canonicalHomeDir: ctx.canonicalHomeDir,
      })
      const destDir = join(executionSkillsDir, skillName)
      const destSkillFile = join(destDir, 'SKILL.md')
      if (await fs.pathExists(destDir) && !await isManagedExecutionSkill(destSkillFile, content)) {
        ctx.result.errors.push(`Execution skill conflict: ${skillName} already exists and is not managed by CCSM`)
        ctx.result.success = false
        ctx.executionSkillConflicts.add(skillName)
        continue
      }

      await fs.ensureDir(destDir)
      content = markManagedExecutionSkill(content)
      await fs.writeFile(destSkillFile, content, 'utf-8')
      installed.push(skillName)
    }

    ctx.result.installedExecutionSkills = installed
    if (installed.length > 0) {
      const executionHost: HostRuntime = ctx.executionHomeDir === ctx.claudeHomeDir ? 'claude' : 'codex'
      appendSkillRoleSummary(ctx.result, {
        role: 'execution' as SkillRole,
        names: [...installed],
        destinationHost: executionHost,
        destinationPath: executionSkillsDir,
      })
    }
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install execution skills: ${error}`)
    ctx.result.success = false
  }
}

async function installSkillGeneratedCommands(ctx: InstallContext): Promise<void> {
  const skillsTemplateDir = join(ctx.templateDir, 'skills')
  const skillsInstallDir = join(ctx.canonicalHomeDir, 'skills', CANONICAL_NAMESPACE)
  const commandsDir = join(ctx.hostHomeDir, 'commands', CANONICAL_NAMESPACE)

  if (!(await fs.pathExists(skillsTemplateDir)))
    return

  try {
    const existingCommandNames = new Set<string>()
    const existingFiles = await fs.readdir(commandsDir).catch(() => [] as string[])
    for (const file of existingFiles) {
      if (file.endsWith('.md'))
        existingCommandNames.add(basename(file, '.md'))
    }

    const skipCategories: import('./skill-registry').SkillCategory[] = []
    if (ctx.config.skipImpeccable)
      skipCategories.push('impeccable')

    const generated = await installSkillCommands(
      skillsTemplateDir,
      skillsInstallDir,
      commandsDir,
      existingCommandNames,
      skipCategories,
    )

    if (generated.length > 0) {
      ctx.result.installedCommands.push(...generated)
      ctx.result.installedSkillCommands = generated.length
    }
  }
  catch (error) {
    ctx.result.errors.push(`Skill Registry command generation warning: ${error}`)
  }
}

async function installRuleFiles(ctx: InstallContext): Promise<void> {
  try {
    const installed = await copyMdTemplates(
      ctx,
      join(ctx.templateDir, 'rules'),
      join(ctx.hostHomeDir, 'rules'),
    )
    if (installed.length > 0)
      ctx.result.installedRules = true
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install rules: ${error}`)
    ctx.result.success = false
  }
}

async function cleanupDeprecatedEntryPoints(ctx: InstallContext): Promise<void> {
  const orchestratorHost = ctx.config.ownership?.orchestrator || 'codex'
  const orchestratorHomeDir = orchestratorHost === 'codex' ? ctx.codexHomeDir : ctx.claudeHomeDir
  const alternateHostHome = orchestratorHost === 'codex' ? ctx.claudeHomeDir : ctx.codexHomeDir
  const deprecatedCommandDirs = DEPRECATED_HOST_NAMESPACES.map(namespace => join(ctx.hostHomeDir, 'commands', namespace))
  const deprecatedAgentDirs = DEPRECATED_HOST_NAMESPACES.map(namespace => join(ctx.hostHomeDir, 'agents', namespace))
  const deprecatedSkillDirs = DEPRECATED_HOST_NAMESPACES.map(namespace => join(ctx.hostHomeDir, 'skills', namespace))
  const deprecatedPromptDirs = DEPRECATED_HOST_NAMESPACES.map(namespace => join(ctx.hostHomeDir, 'prompts', namespace))

  for (const dir of [
    ...deprecatedCommandDirs,
    ...deprecatedAgentDirs,
    ...deprecatedSkillDirs,
    ...deprecatedPromptDirs,
  ]) {
    if (await fs.pathExists(dir)) {
      await fs.remove(dir)
    }
  }

  for (const ruleFile of DEPRECATED_RULE_FILES) {
    const rulePath = join(ctx.hostHomeDir, 'rules', ruleFile)
    if (await fs.pathExists(rulePath)) {
      await fs.remove(rulePath)
    }
  }

  // Keep the canonical slash-command/agent surface bound to the configured orchestrator host.
  // In tests we may install commands into a sandbox root instead of an actual host home, so only
  // clean the alternate host surface when commands are being installed into the orchestrator home.
  if (ctx.hostHomeDir === orchestratorHomeDir) {
    for (const staleDir of [
      join(alternateHostHome, 'commands', CANONICAL_NAMESPACE),
      join(alternateHostHome, 'agents', CANONICAL_NAMESPACE),
    ]) {
      if (await fs.pathExists(staleDir)) {
        await fs.remove(staleDir)
      }
    }

    for (const ruleFile of CANONICAL_RULE_FILES) {
      const staleRulePath = join(alternateHostHome, 'rules', ruleFile)
      if (await fs.pathExists(staleRulePath)) {
        await fs.remove(staleRulePath)
      }
    }
  }

  for (const hostSkillsDir of [join(ctx.codexHomeDir, 'skills'), join(ctx.claudeHomeDir, 'skills')]) {
    for (const skillName of DEPRECATED_CODEX_SKILL_NAMES) {
      const skillDir = join(hostSkillsDir, skillName)
      const canonicalSkillName = DEPRECATED_CODEX_SKILL_NAME_MAP[skillName]
      if (ctx.codexSkillConflicts.has(canonicalSkillName)) {
        continue
      }
      if (await fs.pathExists(skillDir)) {
        await fs.remove(skillDir)
      }
    }
  }

  // Remove stale managed orchestration skills from the non-orchestrator host.
  const alternateSkillsDir = join(alternateHostHome, 'skills')
  for (const skillName of CANONICAL_CODEX_SKILL_NAMES) {
    const skillDir = join(alternateSkillsDir, skillName)
    const skillFile = join(skillDir, 'SKILL.md')
    if (await fs.pathExists(skillDir) && await isManagedCodexSkill(skillFile)) {
      await fs.remove(skillDir)
    }
  }
}

export async function installWorkflows(
  workflowIds: string[],
  installDir: string,
  force = false,
  config?: {
    routing?: {
      mode?: string
      frontend?: { models?: string[], primary?: string }
      backend?: { models?: string[], primary?: string }
      review?: { models?: string[] }
    }
    ownership?: {
      orchestrator: ModelType
      executionHost: HostRuntime
    }
    mcpProvider?: string
    skipImpeccable?: boolean
    claudeHomeDir?: string
    codexHomeDir?: string
    canonicalHomeDir?: string
  },
): Promise<InstallResult> {
  const ownership = config?.ownership || { orchestrator: 'codex' as const, executionHost: 'claude' as const }
  const executionHost = ownership.executionHost
  const ctx: InstallContext = {
    hostHomeDir: installDir,
    claudeHomeDir: config?.claudeHomeDir || getHostHomeDir('claude'),
    canonicalHomeDir: config?.canonicalHomeDir || join(installDir, CANONICAL_RUNTIME_DIRNAME),
    codexHomeDir: config?.codexHomeDir || join(homedir(), '.codex'),
    codexSkillConflicts: new Set<string>(),
    executionHomeDir: executionHost === 'claude'
      ? (config?.claudeHomeDir || getHostHomeDir('claude'))
      : (config?.codexHomeDir || join(homedir(), '.codex')),
    executionSkillConflicts: new Set<string>(),
    force,
    config: {
      routing: config?.routing as InstallConfig['routing'] || {
        mode: 'smart',
        frontend: { models: ['codex'], primary: 'codex' },
        backend: { models: ['codex'], primary: 'codex' },
        review: { models: ['codex'] },
      },
      ownership,
      mcpProvider: config?.mcpProvider || 'skip',
      skipImpeccable: config?.skipImpeccable || false,
    },
    templateDir: join(PACKAGE_ROOT, 'templates'),
    result: {
      success: true,
      installedCommands: [],
      installedPrompts: [],
      installedCodexSkills: [],
      installedExecutionSkills: [],
      skillRoleSummary: [],
      errors: [],
      configPath: '',
    },
  }

  if (!(await fs.pathExists(ctx.templateDir))) {
    ctx.result.errors.push(
      `Template directory not found: ${ctx.templateDir} (PACKAGE_ROOT=${PACKAGE_ROOT})`,
    )
    ctx.result.success = false
    return ctx.result
  }

  await fs.ensureDir(join(ctx.hostHomeDir, 'commands', CANONICAL_NAMESPACE))
  await fs.ensureDir(join(ctx.canonicalHomeDir, 'prompts'))

  await installCommandFiles(ctx, workflowIds)
  await installAgentFiles(ctx)
  await installPromptFiles(ctx)
  await installSkillFiles(ctx)
  await installCodexWorkflowSkills(ctx)
  await installExecutionSkills(ctx)
  await installSkillGeneratedCommands(ctx)
  await installRuleFiles(ctx)
  await cleanupDeprecatedEntryPoints(ctx)

  try {
    ctx.result.monitorPath = await installBundledMonitor(ctx.canonicalHomeDir)
    ctx.result.monitorInstalled = true
  }
  catch (error) {
    ctx.result.errors.push(`Failed to install Claude monitor assets: ${error}`)
    ctx.result.success = false
  }

  if (ctx.result.installedCommands.length === 0 && ctx.result.errors.length === 0) {
    ctx.result.errors.push(`No commands were installed (expected ${workflowIds.length})`)
    ctx.result.success = false
  }

  ctx.result.configPath = ctx.canonicalHomeDir
  return ctx.result
}

export interface UninstallResult {
  success: boolean
  removedCommands: string[]
  removedPrompts: string[]
  removedAgents: string[]
  removedSkills: string[]
  removedCodexSkills: string[]
  removedExecutionSkills: string[]
  removedRules: boolean
  errors: string[]
}

export async function uninstallWorkflows(
  installDir: string,
  options?: { codexHomeDir?: string, claudeHomeDir?: string, canonicalHomeDir?: string },
): Promise<UninstallResult> {
  const result: UninstallResult = {
    success: true,
    removedCommands: [],
    removedPrompts: [],
    removedAgents: [],
    removedSkills: [],
    removedCodexSkills: [],
    removedExecutionSkills: [],
    removedRules: false,
    errors: [],
  }

  const commandsDirs = [
    join(installDir, 'commands', CANONICAL_NAMESPACE),
    ...DEPRECATED_HOST_NAMESPACES.map(namespace => join(installDir, 'commands', namespace)),
  ]
  const agentsDirs = [
    join(installDir, 'agents', CANONICAL_NAMESPACE),
    ...DEPRECATED_HOST_NAMESPACES.map(namespace => join(installDir, 'agents', namespace)),
  ]
  const canonicalHomeDir = options?.canonicalHomeDir || join(installDir, CANONICAL_RUNTIME_DIRNAME)
  const skillsDirs = [join(canonicalHomeDir, 'skills', CANONICAL_NAMESPACE)]
  const rulesDir = join(installDir, 'rules')
  const runtimeDirs = [
    join(canonicalHomeDir, 'prompts'),
    join(canonicalHomeDir, 'backup'),
    join(canonicalHomeDir, 'claude-monitor'),
    join(canonicalHomeDir, 'codex-monitor'),
  ]
  const runtimeFiles = [join(canonicalHomeDir, 'config.toml')]
  const hostSkillDirs = Array.from(new Set([
    join(options?.codexHomeDir || join(homedir(), '.codex'), 'skills'),
    join(options?.claudeHomeDir || getHostHomeDir('claude'), 'skills'),
  ]))

  for (const commandsDir of commandsDirs) {
    try {
      result.removedCommands.push(...await removeDirCollectMdNames(commandsDir))
    }
    catch (error) {
      result.errors.push(`Failed to remove commands directory ${commandsDir}: ${error}`)
      result.success = false
    }
  }

  for (const agentsDir of agentsDirs) {
    try {
      result.removedAgents.push(...await removeDirCollectMdNames(agentsDir))
    }
    catch (error) {
      result.errors.push(`Failed to remove agents directory ${agentsDir}: ${error}`)
      result.success = false
    }
  }

  for (const skillsDir of skillsDirs) {
    if (await fs.pathExists(skillsDir)) {
      try {
        result.removedSkills.push(...await collectSkillNames(skillsDir))
        await fs.remove(skillsDir)
      }
      catch (error) {
        result.errors.push(`Failed to remove skills ${skillsDir}: ${error}`)
        result.success = false
      }
    }
  }

  for (const hostSkillsDir of hostSkillDirs) {
    for (const skillName of ALL_CODEX_SKILL_NAMES) {
      const skillDir = join(hostSkillsDir, skillName)
      const skillFile = join(skillDir, 'SKILL.md')
      try {
        if (await fs.pathExists(skillDir) && await isManagedCodexSkill(skillFile)) {
          await fs.remove(skillDir)
          if (!result.removedCodexSkills.includes(skillName))
            result.removedCodexSkills.push(skillName)
        }
      }
      catch (error) {
        result.errors.push(`Failed to remove Codex workflow skill ${skillName}: ${error}`)
        result.success = false
      }
    }
  }

  for (const hostSkillsDir of hostSkillDirs) {
    for (const skillName of EXECUTION_CODEX_SKILL_NAMES) {
      const skillDir = join(hostSkillsDir, skillName)
      const skillFile = join(skillDir, 'SKILL.md')
      try {
        if (await fs.pathExists(skillDir) && await isManagedExecutionSkill(skillFile)) {
          await fs.remove(skillDir)
          if (!result.removedExecutionSkills.includes(skillName))
            result.removedExecutionSkills.push(skillName)
        }
      }
      catch (error) {
        result.errors.push(`Failed to remove execution skill ${skillName}: ${error}`)
        result.success = false
      }
    }
  }

  if (await fs.pathExists(rulesDir)) {
    try {
      for (const ruleFile of [...CANONICAL_RULE_FILES, ...ALL_RULE_FILES]) {
        const rulePath = join(rulesDir, ruleFile)
        if (await fs.pathExists(rulePath)) {
          await fs.remove(rulePath)
          result.removedRules = true
        }
      }
    }
    catch (error) {
      result.errors.push(`Failed to remove rules: ${error}`)
      result.success = false
    }
  }

  for (const runtimeDir of runtimeDirs) {
    if (await fs.pathExists(runtimeDir)) {
      try {
        await fs.remove(runtimeDir)
        result.removedPrompts.push(basename(runtimeDir))
      }
      catch (error) {
        result.errors.push(`Failed to remove runtime directory ${runtimeDir}: ${error}`)
        result.success = false
      }
    }
  }

  for (const runtimeFile of runtimeFiles) {
    try {
      if (await fs.pathExists(runtimeFile)) {
        await fs.remove(runtimeFile)
      }
    }
    catch (error) {
      result.errors.push(`Failed to remove runtime file ${runtimeFile}: ${error}`)
      result.success = false
    }
  }

  try {
    await removeClaudeMonitorHooks(installDir)
  }
  catch (error) {
    result.errors.push(`Failed to remove Claude monitor hooks: ${error}`)
    result.success = false
  }

  return result
}
