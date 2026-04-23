#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const userHome = homedir()
const claudeHome = join(userHome, '.claude')
const codexHome = process.env.CODEX_HOME || join(userHome, '.codex')
const skillCreatorHome = join(codexHome, 'skills', '.system', 'skill-creator')
const quickValidatePath = join(skillCreatorHome, 'scripts', 'quick_validate.py')
const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const contractsPath = join(scriptDir, 'evals', 'spec-skill-contracts.json')

const installedSkills = {
  'spec-init': join(codexHome, 'skills', 'spec-init'),
  'spec-research': join(codexHome, 'skills', 'spec-research'),
  'spec-plan': join(codexHome, 'skills', 'spec-plan'),
  'spec-impl': join(codexHome, 'skills', 'spec-impl'),
  'spec-review': join(codexHome, 'skills', 'spec-review'),
}

const evalCases = JSON.parse(readFileSync(contractsPath, 'utf-8'))

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function validateSkillStructure(skillPath) {
  assert(existsSync(skillPath), `Skill directory not found: ${skillPath}`)
  assert(existsSync(quickValidatePath), `quick_validate.py not found: ${quickValidatePath}`)
  execFileSync('python', [quickValidatePath, skillPath], { stdio: 'pipe' })
}

function resolveSnippet(snippet) {
  return snippet
    .replaceAll('{{CLAUDE_HOME}}', claudeHome.replace(/\\/g, '/'))
    .replaceAll('{{CODEX_HOME}}', codexHome.replace(/\\/g, '/'))
}

function evaluateSkillIntent(name, skillPath) {
  const filePath = join(skillPath, 'SKILL.md')
  assert(existsSync(filePath), `SKILL.md not found: ${filePath}`)
  const content = readFileSync(filePath, 'utf-8')
  const testCase = evalCases[name]

  assert(testCase, `${name}: missing contract definition in ${contractsPath}`)

  for (const snippet of testCase.mustContain || []) {
    assert(content.includes(resolveSnippet(snippet)), `${name}: missing required contract snippet: ${snippet}`)
  }

  for (const snippet of testCase.mustNotContain || []) {
    assert(!content.includes(resolveSnippet(snippet)), `${name}: found forbidden contract snippet: ${snippet}`)
  }

  for (const snippet of testCase.pathAssertions?.mustContain || []) {
    assert(content.includes(resolveSnippet(snippet)), `${name}: missing required path contract: ${snippet}`)
  }

  for (const snippet of testCase.pathAssertions?.mustNotContain || []) {
    assert(!content.includes(resolveSnippet(snippet)), `${name}: found forbidden path contract: ${snippet}`)
  }

  return {
    name,
    goal: testCase.goal,
  }
}

function main() {
  const results = []

  for (const [name, skillPath] of Object.entries(installedSkills)) {
    validateSkillStructure(skillPath)
    results.push(evaluateSkillIntent(name, skillPath))
  }

  console.log('Installed spec skills passed structure and intent checks:\n')
  for (const result of results) {
    console.log(`- ${result.name}: ${result.goal}`)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
