import { strict as assert } from 'node:assert';
import { createPhase2DashboardModel, assertProjectHasAllAgents, Phase2DashboardError } from '../apps/ui/src/index.js';

const dashboard = createPhase2DashboardModel({
  generatedAt: '2026-07-14T18:00:00.000Z',
  projects: [{ id: 'Client Project', name: 'Client Project', rootPath: 'C:/Projects/client' }],
  runs: [{ id: 'run-1', title: 'Run summary', projectId: 'client-project', status: 'succeeded', summary: 'ok' }]
});
assert.equal(dashboard.counts.agents, 4);
assert.equal(dashboard.counts.activeProjects, 1);
assert.equal(dashboard.counts.activeSkills, 3);
assert.equal(dashboard.counts.succeededRuns, 1);
assert.equal(dashboard.projects[0].agentIds.includes('codex'), true);
assert.equal(dashboard.actions.find((action) => action.id === 'write-obsidian-run-summary').path, '/api/v1/runs/obsidian-summary');
assert.equal(assertProjectHasAllAgents(dashboard.projects[0]), true);
assert.throws(() => assertProjectHasAllAgents({ id: 'x', name: 'X', agentIds: ['agent-zero'] }), Phase2DashboardError);
console.log('Phase 2 dashboard tests OK');
