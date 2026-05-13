export type SupportedLang = 'zh-CN' | 'en'

export type ModelType = 'codex' | 'claude' | 'opencode'

export type HostRuntime = 'codex' | 'claude'

// Represents a role in the acceptance topology
export type WorkflowRole = 'orchestrator' | 'execution' | 'acceptance-reviewer' | 'acceptance-owner'

// Represents a provider that can participate in the workflow
export type ModelProvider = 'codex' | 'claude' | 'opencode'

// The acceptance topology config
export interface AcceptanceTopology {
  acceptanceOwner: ModelType // who makes the final acceptance decision (default: orchestrator)
  acceptanceReviewer?: ModelType // optional pre-acceptance reviewer (e.g., opencode)
}

export type CollaborationMode = 'parallel' | 'smart' | 'sequential'

export type RoutingStrategy = 'parallel' | 'fallback' | 'round-robin'

export type SkillRole = 'orchestration' | 'execution' | 'shared'

export interface SkillInstallSummary {
  role: SkillRole
  names: string[]
  destinationHost: HostRuntime
  destinationPath: string
}

export interface ModelRouting {
  frontend: {
    models: ModelType[]
    primary: ModelType
    strategy: RoutingStrategy
  }
  backend: {
    models: ModelType[]
    primary: ModelType
    strategy: RoutingStrategy
  }
  review: {
    models: ModelType[]
    strategy: 'parallel'
  }
  mode: CollaborationMode
}

export interface CcgConfig {
  general: {
    version: string
    language: SupportedLang
    createdAt: string
  }
  ownership?: {
    orchestrator: HostRuntime // which host runs the orchestrator (determines home directory)
    executionHost: HostRuntime
    acceptance: ModelType // legacy: maps to acceptanceOwner for backward compat
    acceptanceOwner: ModelType // who makes the final acceptance decision
    acceptanceReviewer?: ModelType // optional pre-acceptance reviewer (e.g., opencode)
  }
  routing: ModelRouting
  workflows: {
    installed: string[]
  }
  paths: {
    hostHome: string
    canonicalHome: string
    commands: string
    prompts: string
    backup: string
  }
  mcp: {
    provider: string
    setup_url: string
  }
  performance?: {
    skipImpeccable?: boolean
  }
}

export interface WorkflowConfig {
  id: string
  name: string
  nameEn: string
  category: string
  commands: string[]
  defaultSelected: boolean
  order: number
  description?: string
  descriptionEn?: string
}

export interface InitOptions {
  lang?: SupportedLang
  skipPrompt?: boolean
  skipMcp?: boolean
  force?: boolean
  orchestrator?: ModelType
  frontend?: string
  backend?: string
  mode?: CollaborationMode
  workflows?: string
  installDir?: string
}

export interface InstallResult {
  success: boolean
  installedCommands: string[]
  installedPrompts: string[]
  installedSkills?: number
  installedCodexSkills?: string[]
  installedExecutionSkills?: string[]
  skillRoleSummary?: SkillInstallSummary[]
  installedSkillCommands?: number
  installedRules?: boolean
  errors: string[]
  configPath: string
  monitorPath?: string
  monitorInstalled?: boolean
}

export interface AceToolConfig {
  baseUrl: string
  token: string
}

export interface FastContextConfig {
  apiKey?: string
  includeSnippets?: boolean
}

export * from './cli'
