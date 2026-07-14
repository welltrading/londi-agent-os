import { strict as assert } from 'node:assert';
import {
  ACTION_STATE,
  DashboardModelError,
  assertDashboardCountsMatchApi,
  bucketRuns,
  createDashboardModel,
  describeExpectedTransition,
  evaluateActionFreshness,
  getUiBootstrapModel,
  listRunActions
} from '../apps/ui/src/index.js';

const runs = [
  { id: 'run-1', title: 'Active', state: 'Running', resourceVersion: 'rv-1' },
  { id: 'run-2', title: 'Approval', state: 'Awaiting Approval', resourceVersion: 'rv-2' },
  { id: 'run-3', title: 'Needs', state: 'Needs Attention', resourceVersion: 'rv-3' },
  { id: 'run-4', title: 'Done', state: 'Completed', resourceVersion: 'rv-4' }
];
const approvals = [
  { id: 'ap-1', kind: 'pipeline', state: 'Pending', scope: { runId: 'run-2' }, revisionHash: 'rv-2' },
  { id: 'ap-2', kind: 'handoff', state: 'Approved', scope: { runId: 'run-1' }, revisionHash: 'rv-1' }
];

const dashboard = createDashboardModel({ runs, approvals, systemHealth: { status: 'ok', warnings: ['safe'] }, now: '2026-07-14T10:00:00.000Z' });
assert.equal(dashboard.counts.active, 1);
assert.equal(dashboard.counts.waitingApproval, 2);
assert.equal(dashboard.counts.needsAttention, 1);
assert.equal(dashboard.counts.completed, 1);
assert.equal(dashboard.approvalsInbox.length, 1);
assert.equal(dashboard.needsAttention[0].id, 'run-3');
assert.equal(assertDashboardCountsMatchApi(dashboard, dashboard.counts), true);
assert.throws(() => assertDashboardCountsMatchApi(dashboard, { ...dashboard.counts, active: 999 }), DashboardModelError);

const buckets = bucketRuns(runs);
assert.equal(buckets.active[0].id, 'run-1');
assert.equal(buckets.waitingApproval[0].id, 'run-2');
assert.equal(buckets.needsAttention[0].id, 'run-3');
assert.equal(buckets.completed[0].id, 'run-4');

const approvalActions = listRunActions(runs[1]);
assert.equal(approvalActions[0].requiresFreshRevision, true);
assert.equal(describeExpectedTransition(approvalActions[0]), 'Approval returns the run to Running.');
const stale = evaluateActionFreshness(approvalActions[0], 'rv-new');
assert.equal(stale.state, ACTION_STATE.stale);
assert.equal(stale.reloadRequired, true);
const fresh = evaluateActionFreshness(approvalActions[0], 'rv-2');
assert.equal(fresh.state, ACTION_STATE.available);

const needsActions = listRunActions(runs[2]);
assert.deepEqual(needsActions.map((item) => item.action), ['retry', 'replace-agent', 'stop']);
assert.equal(needsActions.every((item) => item.expectedTransition), true);

const secretDashboard = createDashboardModel({ runs: [{ id: 'run-secret', title: 'Bearer abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_', state: 'Running', resourceVersion: 'rv' }] });
assert.equal(JSON.stringify(secretDashboard).includes('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOP_'), false);
assert.equal(getUiBootstrapModel().dashboard.counts.active, 0);

console.log('Dashboard tests OK');
