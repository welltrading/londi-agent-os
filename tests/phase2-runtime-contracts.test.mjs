import { strict as assert } from 'node:assert';
import {
  OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER,
  PHASE2_ACTIVE_SKILL_IDS,
  PHASE2_AGENT_IDS,
  PHASE2_SKILL_IDS,
  Phase2RuntimeContractError,
  createManualRunRecord,
  createMinimalRun,
  createObsidianRunSummaryFilename,
  createProjectBrowserSnapshot,
  createProjectWorkspace,
  listPhase2AgentCards,
  listPhase2Skills,
  normalizeAgentUsage,
  renderRunSummaryMarkdown,
  validatePhase2RuntimeContracts
} from '../packages/contracts/src/index.js';

assert.equal(validatePhase2RuntimeContracts(), true);
assert.deepEqual(PHASE2_AGENT_IDS, ['agent-zero', 'codex', 'claude-code', 'hermes']);
assert.equal(OBSIDIAN_RUN_SUMMARY_TARGET_FOLDER, 'Londi Agent OS/Runs/');
assert.deepEqual(PHASE2_ACTIVE_SKILL_IDS, ['obsidian-run-summary', 'local-agent-status', 'usage-status-refresh']);
assert.equal(PHASE2_SKILL_IDS.includes('code-execution-task'), true);

const cards = listPhase2AgentCards({ now: '2026-07-14T18:00:00.000Z' });
assert.equal(cards.length, 4);
assert.equal(cards.find((item) => item.id === 'agent-zero').status, 'active');
assert.equal(cards.find((item) => item.id === 'hermes').status, 'planned');
assert.equal(cards.find((item) => item.id === 'codex').usage.mode, 'subscription');
assert.equal(cards.every((item) => item.skills.length >= 2), true);

const skills = listPhase2Skills();
assert.equal(skills.filter((item) => item.active).length, 3);
assert.equal(skills.find((item) => item.id === 'obsidian-run-summary').agentIds.includes('agent-zero'), true);

const usage = normalizeAgentUsage({ mode: 'subscription', label: 'Claude Max', used: 4, limit: 10, unit: 'sessions', source: 'manual', warning: false });
assert.equal(usage.used, 4);
assert.throws(() => normalizeAgentUsage({ mode: 'credits', label: 'bad', unit: 'credits', source: 'api' }), Phase2RuntimeContractError);

const project = createProjectWorkspace({ id: 'Client Portal', name: 'Client Portal', rootPath: 'C:/Projects/client-portal' });
assert.equal(project.id, 'client-portal');
assert.deepEqual(project.agentIds, PHASE2_AGENT_IDS);
assert.deepEqual(project.skillIds, PHASE2_ACTIVE_SKILL_IDS);
assert.equal(project.doxPath, 'AGENTS.md');
assert.equal(project.contextRoot, 'context/');
assert.equal(project.decisionsLogPath, 'decisions/log.md');
assert.throws(() => createProjectWorkspace({ id: 'x', name: 'X', agentIds: ['agent-zero', 'unknown'] }), Phase2RuntimeContractError);
assert.throws(() => createProjectWorkspace({ id: 'x', name: 'X', doxPath: '../AGENTS.md' }), Phase2RuntimeContractError);

const run = createMinimalRun({ id: 'Run 42', title: 'Write summary', projectId: project.id, status: 'succeeded' });
assert.equal(run.projectId, 'client-portal');
assert.equal(run.agentId, 'agent-zero');
assert.equal(run.skillId, 'obsidian-run-summary');
const manualRun = createManualRunRecord({ id: 'Manual Run 1', title: 'Manual Run', prompt: 'Prompt text', summary: 'Summary text', createdAt: '2026-07-14T18:01:00.000Z' });
assert.equal(manualRun.type, 'manual');
assert.equal(manualRun.action, 'ask-agent-zero-general-task');
assert.equal(manualRun.status, 'succeeded');
assert.equal(manualRun.skillId, 'orchestration-control');
assert.equal(manualRun.createdAt, '2026-07-14T18:01:00.000Z');
assert.throws(() => createManualRunRecord({ id: 'x', title: 'x', summary: 'missing prompt' }), Phase2RuntimeContractError);
const browserSnapshot = createProjectBrowserSnapshot({ projectId: project.id, relativePath: '.', entries: [{ name: 'src', path: 'src', type: 'directory', selectableAsContext: false }, { name: 'index.js', path: 'src/index.js', type: 'file', size: 42 }] });
assert.equal(browserSnapshot.entries[0].type, 'directory');
assert.equal(browserSnapshot.entries[1].selectableAsContext, true);
assert.throws(() => createProjectBrowserSnapshot({ entries: [{ name: 'bad', path: '../bad', type: 'file' }] }), Phase2RuntimeContractError);

assert.equal(createObsidianRunSummaryFilename({ date: '2026-07-14T18:00:00.000Z', runId: 'run-42', title: 'Write Run Summary!' }), '2026-07-14__run-42__write-run-summary.md');
const markdown = renderRunSummaryMarkdown({ runId: 'run-42', projectId: project.id, title: 'Write Run Summary', summary: 'Summary created.', artifacts: ['vault/path.md'], timestamp: '2026-07-14T18:00:00.000Z' });
assert.equal(markdown.includes('- Project ID: client-portal'), true);
assert.equal(markdown.includes('Created by Londi Agent OS via HostConnector.'), true);

console.log('Phase 2 runtime contract tests OK');
