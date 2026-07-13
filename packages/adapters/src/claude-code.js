import { spawnSync } from 'node:child_process';
import { createAdapterDescriptor, normalizeAdapterResult } from './index.js';

export const CLAUDE_CODE_ADAPTER_ID = 'claude-code';
export const DEFAULT_CLAUDE_CODE_COMMAND = 'claude';

export function createClaudeCodeAdapter({
  command = DEFAULT_CLAUDE_CODE_COMMAND,
  version = 'unknown',
  processManager,
  runCommand = defaultRunCommand,
  redact = sanitizeAdapterText
} = {}) {
  const descriptor = createAdapterDescriptor({
    adapterId: CLAUDE_CODE_ADAPTER_ID,
    displayName: 'Claude Code CLI',
    version,
    executable: command,
    metadata: { activeAdapter: true, localCli: true }
  });

  return Object.freeze({
    descriptor,

    async health() {
      const versionCheck = runCommand(command, ['--version']);
      const authCheck = runCommand(command, ['auth', 'status']);
      const ok = versionCheck.status === 0 && authCheck.status === 0;
      return normalizeAdapterResult({
        operation: 'health',
        outcome: ok ? 'success' : 'terminal_failure',
        data: {
          healthy: ok,
          version: redact(versionCheck.stdout || versionCheck.stderr),
          auth: authCheck.status === 0 ? 'authenticated' : 'unavailable',
          stdout: redact([versionCheck.stdout, authCheck.stdout].filter(Boolean).join('\n')),
          stderr: redact([versionCheck.stderr, authCheck.stderr].filter(Boolean).join('\n'))
        },
        error: ok ? null : { message: 'Claude Code health/auth check failed.', code: 'CLAUDE_HEALTH_FAILED' },
        exitCode: ok ? 0 : firstNonZero(versionCheck.status, authCheck.status)
      });
    },

    async capabilities() {
      return normalizeAdapterResult({
        operation: 'capabilities',
        outcome: 'success',
        data: {
          adapterId: CLAUDE_CODE_ADAPTER_ID,
          capabilities: ['code-editing', 'repository-analysis', 'test-running', 'refactoring', 'planning'],
          constraints: ['local-cli-required', 'git-worktree-only', 'no-automatic-merge'],
          access: ['workspace-read', 'workspace-write', 'artifact-write', 'process-spawn']
        }
      });
    },

    async start({ attemptId, cwd, env = {}, args = [] } = {}) {
      if (!processManager) return adapterTerminalFailure('start', 'Process manager is required for Claude Code start.', 'CLAUDE_PROCESS_MANAGER_REQUIRED');
      try {
        const attempt = processManager.startAttempt({ attemptId, command, args, cwd, env });
        return normalizeAdapterResult({ operation: 'start', outcome: 'success', data: { attempt: snapshotAttempt(attempt) } });
      } catch (error) {
        return adapterTerminalFailure('start', error.message, error.code, error);
      }
    },

    async deliverTask({ attemptId, prompt, cwd, env = {}, args = [] } = {}) {
      if (!processManager) return adapterTerminalFailure('deliverTask', 'Process manager is required for Claude Code task delivery.', 'CLAUDE_PROCESS_MANAGER_REQUIRED');
      if (!prompt) return adapterTerminalFailure('deliverTask', 'Prompt is required for Claude Code task delivery.', 'CLAUDE_PROMPT_REQUIRED');
      try {
        const attempt = processManager.startAttempt({ attemptId, command, args: [...args, '--print', prompt], cwd, env });
        return normalizeAdapterResult({ operation: 'deliverTask', outcome: 'success', data: { attempt: snapshotAttempt(attempt) } });
      } catch (error) {
        return adapterTerminalFailure('deliverTask', error.message, error.code, error);
      }
    },

    async heartbeat({ attemptId } = {}) {
      const attempt = processManager?.listAttempts?.().find((item) => item.attemptId === attemptId);
      if (!attempt) return normalizeAdapterResult({ operation: 'heartbeat', outcome: 'unknown', data: { alive: false, reason: 'attempt-not-found' } });
      return normalizeAdapterResult({ operation: 'heartbeat', outcome: 'success', data: { alive: attempt.status === 'Running', attempt: snapshotAttempt(attempt) } });
    },

    async checkpoint({ checkpointId, artifacts = [], metadata = {} } = {}) {
      return normalizeAdapterResult({ operation: 'checkpoint', outcome: 'success', data: { checkpointId: checkpointId ?? null, metadata }, artifacts });
    },

    async cancel({ attemptId } = {}) {
      if (!processManager) return adapterTerminalFailure('cancel', 'Process manager is required for Claude Code cancel.', 'CLAUDE_PROCESS_MANAGER_REQUIRED');
      try {
        const attempt = await processManager.cancelAttempt({ attemptId });
        return normalizeAdapterResult({ operation: 'cancel', outcome: 'cancelled', data: { attempt: snapshotAttempt(attempt) } });
      } catch (error) {
        return adapterTerminalFailure('cancel', error.message, error.code, error);
      }
    },

    async resume({ attemptId, checkpointId } = {}) {
      return normalizeAdapterResult({ operation: 'resume', outcome: 'success', data: { attemptId: attemptId ?? null, checkpointId: checkpointId ?? null, resumed: true } });
    },

    async collectArtifacts({ artifacts = [] } = {}) {
      return normalizeAdapterResult({ operation: 'collectArtifacts', outcome: 'success', artifacts });
    }
  });
}

export function sanitizeAdapterText(value, knownSecrets = []) {
  let text = String(value ?? '');
  for (const secret of knownSecrets.filter(Boolean).map(String)) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(token|password|secret|credential|api[_-]?key)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/([A-Za-z0-9_-]{43,})/g, '[REDACTED]')
    .replace(/[\r\n\u2028\u2029]+/g, ' ');
}


function snapshotAttempt(attempt) {
  if (!attempt || typeof attempt !== 'object') return attempt;
  return { ...attempt, args: Array.isArray(attempt.args) ? [...attempt.args] : attempt.args, env: attempt.env && typeof attempt.env === 'object' ? { ...attempt.env } : attempt.env };
}

function adapterTerminalFailure(operation, message, code, error = null) {
  return normalizeAdapterResult({ operation, outcome: 'terminal_failure', error: { message, code: code ?? 'CLAUDE_ADAPTER_FAILURE', detail: error?.details ?? null } });
}

function defaultRunCommand(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function firstNonZero(...codes) {
  return codes.find((code) => code && code !== 0) ?? 1;
}
