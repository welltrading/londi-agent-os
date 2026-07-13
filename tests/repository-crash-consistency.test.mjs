import { strict as assert } from 'node:assert';
import { rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadDefaultLocalConfig } from '../packages/contracts/src/index.js';
import {
  RUN_STATES,
  StateTransitionError,
  applyRunTransition,
  createApprovalRequest,
  hashApprovalPayload,
  appendEventAndAudit,
  createInMemoryEventStore,
  executeCommandPipeline,
  sha256
} from '../packages/orchestrator/src/index.js';
import { CURRENT_SCHEMA_VERSION, getSchemaVersion, runMigrations, withTransaction } from '../packages/migrations/src/index.js';

const root = './.tmp-repository-crash-tests';
rmSync(root, { recursive: true, force: true });

const config = {
  ...loadDefaultLocalConfig(),
  dataRoot: root,
  paths: {
    database: `${root}/db/londi-agent-os.sqlite`,
    runs: `${root}/runs`,
    worktrees: `${root}/worktrees`,
    backups: `${root}/backups`,
    obsidianSnapshots: `${root}/obsidian-snapshots`
  }
};

runMigrations({ config });
assert.equal(getSchemaVersion(config.paths.database), CURRENT_SCHEMA_VERSION);

const db = new DatabaseSync(config.paths.database);
db.prepare("INSERT INTO projects (id, repository_path, default_target_branch) VALUES ('project-crash', './repo', 'main')").run();
db.prepare("INSERT INTO runs (id, status, template, project_id, task, pipeline_type, state) VALUES ('run-crash', 'active', 'direct', 'project-crash', 'task', 'direct', 'Draft')").run();

assert.throws(
  () => withTransaction(db, (database) => {
    database.prepare("UPDATE runs SET state = 'Running' WHERE id = 'run-crash'").run();
    database.prepare("INSERT INTO events (type, run_id, payload_redacted) VALUES ('run.state.changed', 'run-crash', '{}')").run();
    throw new Error('simulated crash before audit');
  }),
  /simulated crash/
);
assert.equal(db.prepare("SELECT state FROM runs WHERE id = 'run-crash'").get().state, 'Draft');
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM events WHERE run_id = 'run-crash'").get().count, 0);

const lockOne = db.prepare("INSERT INTO attempts (id, step_id, active) VALUES ('bad-attempt', 'missing-step', 1)");
assert.throws(() => lockOne.run(), /FOREIGN KEY constraint failed|constraint failed/i);

db.prepare("INSERT INTO steps (id, run_id, role, ordinal) VALUES ('step-crash', 'run-crash', 'build', 1)").run();
db.prepare("INSERT INTO attempts (id, step_id, active) VALUES ('attempt-active-1', 'step-crash', 1)").run();
assert.throws(
  () => db.prepare("INSERT INTO attempts (id, step_id, active) VALUES ('attempt-active-2', 'step-crash', 1)").run(),
  /UNIQUE constraint failed/
);

const store = createInMemoryEventStore();
for (let index = 0; index < 100; index += 1) {
  const approval = createApprovalRequest({
    id: `approval-fi-${index}`,
    kind: 'pipeline',
    scope: { runId: 'run-crash', index },
    payloadHash: hashApprovalPayload({ runId: 'run-crash', index }),
    revisionHash: `revision-${index}`,
    requestedAt: '2026-01-01T00:00:00.000Z'
  });
  const result = appendEventAndAudit(store, {
    event: { type: 'fault-injection.transition', runId: 'run-crash', payloadRedacted: { index, approvalId: approval.id } },
    audit: { id: `audit-fi-${index}`, actor: 'fault-suite', action: 'transition', target: approval.id, result: 'ok', metadataRedacted: { approvalState: approval.state } }
  });
  assert.equal(result.event.eventId, index + 1);
}
assert.equal(store.listEvents().length, 100);
assert.equal(store.listAudit({ runId: 'run-crash' }).length, 100);

const runTransitionCases = [
  ['Draft', 'Start Preflight', { requiredFieldsComplete: true, projectPathExists: true }],
  ['Preflight Running', 'Critical check failed', { blockedChecks: 1 }],
  ['Preflight Running', 'Checks passed', { preflightStatus: 'Ready' }],
  ['Ready', 'Present pipeline', { recommendationComplete: true, contextComplete: true, manifestComplete: true }],
  ['Awaiting Pipeline Approval', 'Approve', { approvalMatchesRevision: true, warningsApproved: true }],
  ['Preparing Workspace', 'Worktree ready', { gitReady: true, aclReady: true, lockAcquired: true, baseCommitValid: true }],
  ['Running', 'Sensitive action requested', { validGrant: false }],
  ['Awaiting Approval', 'Reject essential', { actionEssential: true }],
  ['Unresponsive', 'Crash/restart', { attemptUncertain: true }],
  ['Recovery Required', 'Stop', { checkpointSaved: true }],
  ['Running', 'Unrecoverable failure', { retryAllowed: false }],
  ['Maintenance Hold', 'Controlled Stop', { transactionOpen: false }],
  ['Running', 'Pipeline success', { pipelineSuccessCriteriaMet: true }],
  ['Awaiting Acceptance', 'Accept', { diffPresented: true, testsPresented: true, reviewPresented: true }],
  ['Accepted', 'Verify merge success', { targetContainsChange: true, noConflict: true, acceptedAt: '2026-01-01T00:00:00Z', mergeVerifiedAt: '2026-01-01T00:01:00Z', targetCommit: 'abc123' }],
  ['Needs Attention', 'Stop', { userConfirmed: true }]
];
let coveredStates = new Set();
for (const [state, event, context] of runTransitionCases) {
  const transition = applyRunTransition(state, event, context);
  coveredStates.add(transition.from);
  coveredStates.add(transition.to);
}
assert.equal(coveredStates.size / RUN_STATES.length >= 0.9, true);
assert.throws(
  () => applyRunTransition('Ready', 'Present pipeline', { recommendationComplete: true, contextComplete: false, manifestComplete: true }),
  StateTransitionError
);

let effects = 0;
const success = executeCommandPipeline({
  type: 'fault.external.effect',
  validate: () => true,
  guard: () => ({ from: 'Running', event: 'Pipeline success', to: 'Awaiting Acceptance' }),
  transaction: (work) => work({ applyState: () => {}, appendEvent: () => {}, appendAudit: () => {} }),
  artifact: { path: `${root}/runs/run-crash/artifact.txt`, content: 'safe', required: true, expectedHash: sha256('safe') },
  publish: () => {
    effects += 1;
    return ['published'];
  }
});
assert.equal(success.ok, true);
assert.equal(effects, 1);
assert.throws(
  () => executeCommandPipeline({
    type: 'fault.external.effect.fail',
    guard: () => { throw new Error('guard crash'); },
    publish: () => {
      effects += 1;
      return ['should-not-publish'];
    }
  }),
  (error) => error.code === 'ERR_COMMAND_PIPELINE_FAILED'
);
assert.equal(effects, 1);

db.close();
rmSync(root, { recursive: true, force: true });
console.log('Repository crash consistency tests OK');
