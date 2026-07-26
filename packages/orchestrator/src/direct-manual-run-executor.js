import { getPipelineTemplate } from '@londi-agent-os/contracts';
import { createClaudeCodeAdapter, createCodexAdapter } from '@londi-agent-os/adapters';
import { createPipelineApprovalGate, decidePipelineApprovalGate } from './approvals.js';
import { createAttemptProcessManager } from './process-manager.js';
import { createInMemoryWorkspaceLockStore, createRunWorkspace } from './workspace-manager.js';

const DIRECT_MANUAL_AGENT_IDS = Object.freeze(['codex', 'claude-code']);

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
    if (heartbeat?.outcome !== 'success') return { status: run?.status ?? 'running', execution };
    const attempt = heartbeat.data?.attempt ?? execution?.attempts?.execute ?? null;
    const nextExecution = { ...(execution ?? {}), attempts: { ...(execution?.attempts ?? {}), execute: safeAttempt(attempt) } };
    if (heartbeat.data?.alive === true || attempt?.status === 'Running') return { status: 'running', execution: nextExecution };
    if (attempt?.exitCode === 0) return { status: 'succeeded', execution: nextExecution };
    return { status: 'failed', error: 'Direct manual run process exited unsuccessfully.', execution: nextExecution };
  }

  async function executeDirectManualRun({ run, input = {}, project } = {}) {
    const execution = {
      pipeline: 'direct',
      agentId: run?.agentId ?? input.agentId ?? null,
      workspace: null,
      gateA: null,
      attempts: { execute: null }
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

      if (heartbeat.data?.alive === true || attempt?.status === 'Running') {
        return { status: 'running', summary: run.summary, artifactPath: null, execution };
      }
      if (attempt?.exitCode === 0) {
        return { status: 'succeeded', summary: run.summary, artifactPath: null, execution };
      }
      throw new DirectManualRunExecutionError('Direct manual run process exited unsuccessfully.', {
        execution,
        attempt: safeAttempt(attempt)
      });
    } catch (error) {
      if (error instanceof DirectManualRunExecutionError) {
        if (!error.details.execution) error.details.execution = execution;
        throw error;
      }
      throw new DirectManualRunExecutionError(error?.message ?? 'Direct manual run execution failed.', {
        execution,
        causeCode: error?.code ?? null
      });
    }
  }

  executeDirectManualRun.refreshRun = refreshDirectManualRun;
  return executeDirectManualRun;
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
