import { MVP_PIPELINE_TEMPLATES } from '@londi-agent-os/contracts';
export const ORCHESTRATOR_PACKAGE = '@londi-agent-os/orchestrator';
export function listSupportedPipelineTemplates() {
  return [...MVP_PIPELINE_TEMPLATES];
}
export { ensureApprovedDataDirectories } from './configuration.js';
export {
  RUN_STATES,
  STEP_STATES,
  FINAL_RUN_STATES,
  RETENTION_STARTING_RUN_STATES,
  StateTransitionError,
  applyRunTransition,
  applyStepTransition,
  assertRunTransition,
  assertStepTransition,
  isRunFinal,
  isOpenRunState,
  startsRetention
} from './state-machine.js';
export {
  CommandPipelineError,
  ArtifactMismatchError,
  executeCommandPipeline,
  writeAtomicArtifact,
  createSqliteCommandTransaction,
  sha256
} from './command-pipeline.js';
export {
  IdempotencyReplayError,
  StaleRevisionError,
  IdempotencyConflictError,
  createInMemoryIdempotencyStore,
  createSqliteIdempotencyStore,
  assertFreshRevision,
  withIdempotency
} from './idempotency.js';
if (process.argv.includes('--build-check')) console.log(`${ORCHESTRATOR_PACKAGE} build OK`);
