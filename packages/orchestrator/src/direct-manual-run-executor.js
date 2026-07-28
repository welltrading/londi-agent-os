import { spawnSync } from 'node:child_process';
import { getPipelineTemplate } from '@londi-agent-os/contracts';
import { createClaudeCodeAdapter, createCodexAdapter, sanitizeAdapterText } from '@londi-agent-os/adapters';
import { createPipelineApprovalGate, decidePipelineApprovalGate } from './approvals.js';
import { createAttemptProcessManager } from './process-manager.js';
import { createInMemoryWorkspaceLockStore, createRunWorkspace, releaseRunWorkspace } from './workspace-manager.js';
import { RECOVERY_ACTIONS } from './restart-recovery.js';

const DIRECT_MANUAL_AGENT_IDS = Object.freeze(['codex', 'claude-code']);
export const DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES = 2000;
// Signals that the agent understood the task but was refused write access. Without these, a
// blocked run is indistinguishable from an agent that simply chose to do nothing.
const BLOCKED_OUTPUT_PATTERN = /read-only sandbox|patch rejected|writing is blocked|rejected by user approval|permission denied|not permitted/i;

export class DirectManualRunExecutionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'DirectManualRunExecutionError';
    this.code = 'ERR_DIRECT_MANUAL_RUN_EXECUTION';
    this.details = details;
  }
}

export function createDirectManualRunExecutor({
  dataRoot = './data',
  targetBranch = 'main',
  now = () => new Date().toISOString(),
  settleMs = 25,
  processManager = createAttemptProcessManager(),
  lockStore = createInMemoryWorkspaceLockStore(),
  createWorkspace = createRunWorkspace,
  adapterFactories = {
    codex: createCodexAdapter,
    'claude-code': createClaudeCodeAdapter
  }
} = {}) {
  async function refreshDirectManualRun({ run } = {}) {
    const execution = cloneExecution(run?.execution);
    const agentId = execution?.agentId ?? run?.agentId ?? null;
    const attemptId = execution?.attempts?.execute?.attemptId ?? null;
    if (!attemptId || !DIRECT_MANUAL_AGENT_IDS.includes(agentId)) return { status: run?.status ?? 'running', execution };
    const factory = adapterFactories[agentId];
    if (typeof factory !== 'function') return { status: run?.status ?? 'running', execution };
    const adapter = factory({ processManager });
    const heartbeat = await adapter.heartbeat({ attemptId });
    // A non-success heartbeat means the attempt is no longer supervised by this process — the
    // usual cause is a service restart. The run must not stay `running` forever, and we must not
    // fabricate a success we cannot observe.
    if (heartbeat?.outcome !== 'success') return reconcileUnsupervisedRun({ run, execution, reason: heartbeat?.data?.reason ?? 'attempt-not-supervised' });
    const attempt = heartbeat.data?.attempt ?? execution?.attempts?.execute ?? null;
    const diagnostics = captureDiagnostics(attempt) ?? execution?.diagnostics ?? null;
    const nextExecution = { ...(execution ?? {}), attempts: { ...(execution?.attempts ?? {}), execute: safeAttempt(attempt) }, diagnostics };
    if (heartbeat.data?.alive === true || attempt?.status === 'Running') return { status: 'running', execution: nextExecution };
    if (attempt?.exitCode === 0) {
      const verification = verifyWorkspaceChanges(nextExecution.workspace?.worktreePath);
      const verifiedExecution = { ...nextExecution, verification };
      if (verification.changedFiles.length === 0) {
        return { status: 'failed', error: describeNoChangeExit(diagnostics), execution: finishWorkspace(verifiedExecution, run?.id, false) };
      }
      return { status: 'succeeded', execution: finishWorkspace(verifiedExecution, run?.id, true) };
    }
    return { status: 'failed', error: 'Direct manual run process exited unsuccessfully.', execution: finishWorkspace(nextExecution, run?.id, false) };
  }

  function reconcileUnsupervisedRun({ run, execution, reason }) {
    if (run?.status !== 'running' && run?.status !== 'queued') return { status: run?.status ?? 'running', execution };
    const recovery = {
      state: 'Recovery Required',
      reason,
      autoResume: false,
      actions: [...RECOVERY_ACTIONS],
      detectedAt: now()
    };
    return {
      status: 'failed',
      error: 'Run attempt is no longer supervised after restart; recovery decision required.',
      execution: finishWorkspace({ ...(execution ?? {}), recovery }, run?.id, true)
    };
  }

  // Terminal states always release the workspace lock. The worktree/branch are retained whenever
  // they may hold agent work (manual merge is the only path); they are removed only when the run
  // produced nothing.
  function finishWorkspace(execution, runId, retain) {
    if (!execution?.workspace) return execution;
    const release = releaseRunWorkspace({ workspace: execution.workspace, runId, lockStore, retain });
    return { ...execution, workspaceRelease: release };
  }

  async function executeDirectManualRun({ run, input = {}, project } = {}) {
    const execution = {
      pipeline: 'direct',
      agentId: run?.agentId ?? input.agentId ?? null,
      workspace: null,
      gateA: null,
      attempts: { execute: null },
      verification: { changedFiles: [] }
    };

    try {
      assertManualRunInput({ run, project, agentId: execution.agentId });
      const selectedTargetBranch = input.targetBranch ?? project.targetBranch ?? targetBranch;
      if (!selectedTargetBranch || typeof selectedTargetBranch !== 'string') {
        throw new DirectManualRunExecutionError('Direct manual run requires a target branch.', { execution });
      }

      const workspace = createWorkspace({
        repositoryPath: project.rootPath,
        targetBranch: selectedTargetBranch,
        runId: run.id,
        dataRoot,
        lockStore
      });
      execution.workspace = {
        repositoryPath: workspace.repositoryPath,
        targetBranch: workspace.targetBranch,
        baseCommit: workspace.baseCommit,
        worktreePath: workspace.worktreePath,
        branchName: workspace.branchName
      };

      const requestedAt = now();
      const gateA = createPipelineApprovalGate({
        id: `gate-a-${run.id}`,
        runId: run.id,
        template: getPipelineTemplate('direct'),
        assignments: { executor: execution.agentId },
        context: { task: run.prompt, projectPath: project.rootPath },
        preflight: { status: 'Ready', warnings: [] },
        permissions: { filesystem: 'workspace-write', commands: [] },
        network: { mode: 'none', allowedHosts: [] },
        secretAliases: [],
        revisionHash: workspace.baseCommit,
        requestedAt
      });
      const gateADecision = decidePipelineApprovalGate(gateA, {
        actor: 'system:direct-manual-run',
        decision: 'approve',
        payloadHash: gateA.payloadHash,
        revisionHash: gateA.revisionHash,
        timestamp: requestedAt
      });
      execution.gateA = { requestId: gateADecision.requestId, state: gateADecision.state, revisionHash: gateADecision.revisionHash };

      const factory = adapterFactories[execution.agentId];
      const adapter = factory({ processManager });
      const health = await adapter.health();
      assertAdapterSuccess(health, 'health', execution);
      const capabilities = await adapter.capabilities();
      assertAdapterSuccess(capabilities, 'capabilities', execution);
      if (!capabilities.data?.capabilities?.includes('code-editing')) {
        throw new DirectManualRunExecutionError('Adapter does not provide the required code-editing capability.', { execution });
      }

      const attemptId = `${run.id}-execute`;
      const delivery = await adapter.deliverTask({ attemptId, prompt: run.prompt, cwd: workspace.worktreePath });
      assertAdapterSuccess(delivery, 'deliverTask', execution);
      execution.attempts.execute = safeAttempt(delivery.data?.attempt ?? { attemptId });

      let heartbeat = await adapter.heartbeat({ attemptId });
      let attempt = heartbeat.data?.attempt ?? delivery.data?.attempt ?? null;
      if (heartbeat.data?.alive === true && settleMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, settleMs));
        heartbeat = await adapter.heartbeat({ attemptId });
        attempt = heartbeat.data?.attempt ?? attempt;
      }
      execution.attempts.execute = safeAttempt(attempt ?? execution.attempts.execute);
      execution.diagnostics = captureDiagnostics(attempt) ?? execution.diagnostics ?? null;

      if (heartbeat.data?.alive === true || attempt?.status === 'Running') {
        return { status: 'running', summary: run.summary, artifactPath: null, execution };
      }
      if (attempt?.exitCode === 0) {
        execution.verification = verifyWorkspaceChanges(workspace.worktreePath);
        if (execution.verification.changedFiles.length === 0) {
          // Exit 0 with nothing written is never a success: the agent may have been refused write
          // access and still exited cleanly.
          throw new DirectManualRunExecutionError(describeNoChangeExit(execution.diagnostics), {
            execution,
            attempt: safeAttempt(attempt)
          });
        }
        return { status: 'succeeded', summary: run.summary, artifactPath: null, execution: finishWorkspace(execution, run.id, true) };
      }
      throw new DirectManualRunExecutionError('Direct manual run process exited unsuccessfully.', {
        execution,
        attempt: safeAttempt(attempt)
      });
    } catch (error) {
      const releasedExecution = finishWorkspace(execution, run?.id, hasAgentChanges(execution));
      if (error instanceof DirectManualRunExecutionError) {
        error.details.execution = releasedExecution;
        throw error;
      }
      throw new DirectManualRunExecutionError(error?.message ?? 'Direct manual run execution failed.', {
        execution: releasedExecution,
        causeCode: error?.code ?? null
      });
    }
  }

  executeDirectManualRun.refreshRun = refreshDirectManualRun;
  return executeDirectManualRun;
}

function verifyWorkspaceChanges(worktreePath) {
  if (!worktreePath) return { changedFiles: [] };
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: worktreePath, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new DirectManualRunExecutionError('Workspace change verification failed.', {
      worktreePath,
      stderr: result.stderr,
      stdout: result.stdout
    });
  }
  const changedFiles = result.stdout
    .split(/\r?\n/)
    // Porcelain v1 lines are `XY <path>`: the status field is fixed-width, so the raw line must
    // not be trimmed before slicing or the first character of the path is lost.
    .filter((line) => line.length > 3)
    .map((line) => ({ status: line.slice(0, 2).trim(), path: normalizeStatusPath(line.slice(3)) }))
    .filter((entry) => isAgentProducedChange(entry.path));
  return { changedFiles };
}

function normalizeStatusPath(value) {
  // Renames/copies render as `old -> new`; report the resulting path. Git quotes paths that
  // contain special characters.
  const path = String(value).includes(' -> ') ? String(value).split(' -> ').pop() : String(value);
  return path.replace(/^"(.*)"$/, '$1');
}

function hasAgentChanges(execution) {
  return (execution?.verification?.changedFiles?.length ?? 0) > 0;
}

// Adapter output is the only place an agent explains why it did nothing, so a bounded tail is
// persisted with the run. It is redacted through the shared adapter sanitizer first, and only the
// two output streams are kept — never argv, env, or anything credential-shaped.
export function captureDiagnostics(attempt, { maxBytes = DIRECT_MANUAL_DIAGNOSTIC_TAIL_BYTES } = {}) {
  if (!attempt || typeof attempt !== 'object') return null;
  const stdout = boundedRedactedTail(attempt.stdout, maxBytes);
  const stderr = boundedRedactedTail(attempt.stderr, maxBytes);
  if (!stdout.text && !stderr.text) return null;
  return {
    stdoutTail: stdout.text,
    stderrTail: stderr.text,
    truncated: stdout.truncated || stderr.truncated,
    maxBytes,
    blocked: BLOCKED_OUTPUT_PATTERN.test(`${stdout.text}\n${stderr.text}`)
  };
}

function boundedRedactedTail(value, maxBytes) {
  const text = String(value ?? '');
  if (!text) return { text: '', truncated: false };
  const truncated = text.length > maxBytes;
  return { text: sanitizeAdapterText(truncated ? text.slice(-maxBytes) : text), truncated };
}

function describeNoChangeExit(diagnostics) {
  const base = 'Agent exited successfully but produced no workspace changes.';
  return diagnostics?.blocked
    ? `${base} The agent reported it was blocked from writing; check execution.diagnostics.`
    : base;
}

function isAgentProducedChange(filePath) {
  return Boolean(filePath) && !['londi-workspace-manifest.json'].includes(filePath);
}

function assertManualRunInput({ run, project, agentId }) {
  if (!run?.id || !run?.prompt) throw new DirectManualRunExecutionError('Direct manual run requires a run id and prompt.');
  if (!DIRECT_MANUAL_AGENT_IDS.includes(agentId)) {
    throw new DirectManualRunExecutionError('Direct manual execution supports only Codex and Claude Code.', { agentId });
  }
  if (!project?.rootPath || typeof project.rootPath !== 'string') {
    throw new DirectManualRunExecutionError('Direct manual run requires a registered project root.', { projectId: run.projectId ?? null });
  }
}

function assertAdapterSuccess(result, operation, execution) {
  if (result?.outcome === 'success') return;
  throw new DirectManualRunExecutionError(`Adapter ${operation} failed.`, {
    execution,
    adapterError: { operation, code: result?.error?.code ?? null, message: result?.error?.message ?? null }
  });
}

function safeAttempt(attempt) {
  if (!attempt || typeof attempt !== 'object') return null;
  return {
    attemptId: attempt.attemptId ?? null,
    pid: attempt.pid ?? null,
    status: attempt.status ?? null,
    startedAt: attempt.startedAt ?? null,
    exitedAt: attempt.exitedAt ?? null,
    exitCode: attempt.exitCode ?? null,
    signal: attempt.signal ?? null
  };
}

function cloneExecution(execution) {
  if (!execution || typeof execution !== 'object') return null;
  return structuredClone(execution);
}
