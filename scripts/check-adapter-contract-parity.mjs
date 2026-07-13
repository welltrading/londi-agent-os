#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  ADAPTER_OPERATIONS,
  CLAUDE_CODE_ADAPTER_ID,
  CODEX_ADAPTER_ID,
  createClaudeCodeAdapter,
  createCodexAdapter
} from '../packages/adapters/src/index.js';

const ADAPTERS = Object.freeze([
  {
    adapterId: CLAUDE_CODE_ADAPTER_ID,
    factory: createClaudeCodeAdapter,
    implementationFile: 'packages/adapters/src/claude-code.js',
    testFile: 'tests/claude-code-adapter.test.mjs'
  },
  {
    adapterId: CODEX_ADAPTER_ID,
    factory: createCodexAdapter,
    implementationFile: 'packages/adapters/src/codex.js',
    testFile: 'tests/codex-adapter.test.mjs'
  }
]);

const ORCHESTRATOR_FORBIDDEN_BRANCHES = [
  /if\s*\([^)]*adapterId\s*={0,2}={0,1}\s*['"]claude-code['"]/,
  /if\s*\([^)]*adapterId\s*={0,2}={0,1}\s*['"]codex['"]/,
  /switch\s*\([^)]*adapterId[^)]*\)/
];

export function buildAdapterContractParityReport({ rootDir = process.cwd(), writeReport = false, reportPath = 'reports/adapter-contract-parity.md' } = {}) {
  const adapters = ADAPTERS.map((adapter) => inspectAdapter({ rootDir, ...adapter }));
  const operationRows = ADAPTER_OPERATIONS.map((operation) => {
    const testedBy = Object.fromEntries(adapters.map((adapter) => [adapter.adapterId, adapter.testedOperations.includes(operation)]));
    return {
      operation,
      testedBy,
      parity: Object.values(testedBy).every(Boolean)
    };
  });
  const orchestratorBranches = findOrchestratorAdapterBranches(rootDir);
  const report = Object.freeze({
    contractOperations: [...ADAPTER_OPERATIONS],
    adapters,
    operationRows,
    coveragePercent: Math.round((operationRows.filter((row) => row.parity).length / ADAPTER_OPERATIONS.length) * 100),
    parityOk: operationRows.every((row) => row.parity),
    orchestratorBranches,
    orchestratorBranchOk: orchestratorBranches.length === 0
  });
  const markdown = renderAdapterContractParityMarkdown(report);
  if (writeReport) {
    const destination = resolve(rootDir, reportPath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, markdown);
  }
  return { report, markdown };
}

function inspectAdapter({ rootDir, adapterId, factory, implementationFile, testFile }) {
  const adapter = factory({
    processManager: createFakeProcessManager(),
    runCommand(command, args) {
      if (args.join(' ') === '--version') return { status: 0, stdout: `${command} parity-version`, stderr: '' };
      if (args.join(' ') === 'auth status') return { status: 0, stdout: 'authenticated', stderr: '' };
      return { status: 0, stdout: '', stderr: '' };
    }
  });
  const implementationOperations = ADAPTER_OPERATIONS.filter((operation) => typeof adapter[operation] === 'function');
  const testSource = readFileSync(resolve(rootDir, testFile), 'utf8');
  const testedOperations = ADAPTER_OPERATIONS.filter((operation) => testSource.includes(`.${operation}(`));
  return Object.freeze({
    adapterId,
    implementationFile,
    testFile,
    descriptorOperations: [...adapter.descriptor.operations],
    implementationOperations,
    testedOperations,
    missingImplementationOperations: ADAPTER_OPERATIONS.filter((operation) => !implementationOperations.includes(operation)),
    missingTestOperations: ADAPTER_OPERATIONS.filter((operation) => !testedOperations.includes(operation))
  });
}

function createFakeProcessManager() {
  const attempts = new Map();
  return {
    startAttempt({ attemptId, command, args = [], cwd, env = {} }) {
      const attempt = { attemptId, pid: attempts.size + 3000, command, args, cwd, env, status: 'Running' };
      attempts.set(attemptId, attempt);
      return attempt;
    },
    async cancelAttempt({ attemptId }) {
      const attempt = attempts.get(attemptId);
      if (!attempt) throw new Error('unknown attempt');
      attempt.status = 'Cancelled';
      return attempt;
    },
    listAttempts() { return [...attempts.values()]; }
  };
}

function findOrchestratorAdapterBranches(rootDir) {
  const files = ['packages/orchestrator/src/index.js', 'packages/orchestrator/src/process-manager.js'];
  const matches = [];
  for (const file of files) {
    const source = readFileSync(resolve(rootDir, file), 'utf8');
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (ORCHESTRATOR_FORBIDDEN_BRANCHES.some((pattern) => pattern.test(line))) {
        matches.push({ file, line: index + 1, text: line.trim() });
      }
    });
  }
  return matches;
}

export function renderAdapterContractParityMarkdown(report) {
  const rows = report.operationRows.map((row) => `| \`${row.operation}\` | ${row.testedBy['claude-code'] ? 'yes' : 'no'} | ${row.testedBy.codex ? 'yes' : 'no'} | ${row.parity ? 'yes' : 'no'} |`).join('\n');
  const adapterRows = report.adapters.map((adapter) => `| \`${adapter.adapterId}\` | ${adapter.implementationOperations.length}/${ADAPTER_OPERATIONS.length} | ${adapter.testedOperations.length}/${ADAPTER_OPERATIONS.length} | ${adapter.missingImplementationOperations.join(', ') || 'none'} | ${adapter.missingTestOperations.join(', ') || 'none'} |`).join('\n');
  const branchRows = report.orchestratorBranches.length === 0
    ? 'No adapter-specific orchestrator branches found.'
    : report.orchestratorBranches.map((match) => `- ${match.file}:${match.line} — \`${match.text}\``).join('\n');

  return `# E3-T07 Adapter Contract Parity Report\n\n## Summary\n\n- Contract coverage parity: **${report.coveragePercent}%**\n- Parity OK: **${report.parityOk ? 'yes' : 'no'}**\n- Orchestrator branch OK: **${report.orchestratorBranchOk ? 'yes' : 'no'}**\n\n## Operation Coverage\n\n| Operation | Claude Code tested | Codex tested | Parity |\n|---|---:|---:|---:|\n${rows}\n\n## Adapter Coverage\n\n| Adapter | Implemented operations | Tested operations | Missing implementation | Missing tests |\n|---|---:|---:|---|---|\n${adapterRows}\n\n## Orchestrator Branch Check\n\n${branchRows}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { report, markdown } = buildAdapterContractParityReport({ writeReport: true });
  process.stdout.write(markdown);
  if (!report.parityOk || !report.orchestratorBranchOk || report.coveragePercent !== 100) process.exit(1);
}
