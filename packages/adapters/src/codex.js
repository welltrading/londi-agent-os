import { spawnSync } from 'node:child_process';
import { createAdapterDescriptor, normalizeAdapterResult } from './index.js';

export const CODEX_ADAPTER_ID = 'codex';
export const DEFAULT_CODEX_COMMAND = 'codex';
// `codex exec` runs with `sandbox: read-only` unless a mode is given, so writes are rejected and
// the process still exits 0. Runs happen inside an isolated Git worktree, so the workspace scope
// is the correct one; `danger-full-access` and approval bypass are deliberately not used.
export const CODEX_EXEC_SANDBOX_MODE = 'workspace-write';
export const CODEX_FORBIDDEN_SANDBOX_ARGS = Object.freeze(['danger-full-access', '--dangerously-bypass-approvals-and-sandbox', '--dangerously-bypass-hook-trust']);
// `codex exec resume` accepts no `--sandbox` flag, so it falls back to the read-only default and
// silently rejects every write — the same failure `--sandbox` was added to fix. The config override
// is the only supported way to set the mode on a resumed session.
export const CODEX_RESUME_SANDBOX_ARGS = Object.freeze(['-c', `sandbox_mode=${CODEX_EXEC_SANDBOX_MODE}`]);
// The CLI prints `session id: <uuid>` in its run header; the value is what `exec resume` takes.
const CODEX_SESSION_ID_PATTERN = /session id:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;

export function parseCodexSessionId(value) {
  // The header is ANSI-bold, so the escape sequences sit between the label and the id.
  const match = CODEX_SESSION_ID_PATTERN.exec(String(value ?? '').replace(/\u001b\[[0-9;]*m/g, ''));
  return match ? match[1] : null;
}

export function createCodexAdapter({
  command = DEFAULT_CODEX_COMMAND,
  version = 'unknown',
  processManager,
  runCommand = defaultRunCommand,
  resolveInvocation = defaultResolveCodexInvocation,
  redact = sanitizeAdapterText
} = {}) {
  const descriptor = createAdapterDescriptor({
    adapterId: CODEX_ADAPTER_ID,
    displayName: 'Codex CLI',
    version,
    executable: command,
    metadata: { activeAdapter: true, localCli: true }
  });

  return Object.freeze({
    descriptor,

    // Exposed on the adapter so callers never have to know how this CLI reports its session.
    parseSessionId: parseCodexSessionId,

    async health() {
      const versionCheck = runCommand(command, ['--version'], resolveInvocation);
      const legacyAuthCheck = runCommand(command, ['auth', 'status'], resolveInvocation);
      const authCheck = legacyAuthCheck.status !== 0 && isUnsupportedAuthStatusCommand(legacyAuthCheck)
        ? runCommand(command, ['login', 'status'], resolveInvocation)
        : legacyAuthCheck;
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
        error: ok ? null : { message: 'Codex health/auth check failed.', code: 'CODEX_HEALTH_FAILED' },
        exitCode: ok ? 0 : firstNonZero(versionCheck.status, authCheck.status)
      });
    },

    async capabilities() {
      return normalizeAdapterResult({
        operation: 'capabilities',
        outcome: 'success',
        data: {
          adapterId: CODEX_ADAPTER_ID,
          capabilities: ['code-editing', 'repository-analysis', 'test-running', 'debugging'],
          constraints: ['local-cli-required', 'git-worktree-only', 'no-automatic-merge'],
          access: ['workspace-read', 'workspace-write', 'artifact-write', 'process-spawn']
        }
      });
    },

    async start({ attemptId, cwd, env = {}, args = [] } = {}) {
      if (!processManager) return adapterTerminalFailure('start', 'Process manager is required for Codex start.', 'CODEX_PROCESS_MANAGER_REQUIRED');
      try {
        const invocation = resolveInvocation(command, args);
        const attempt = processManager.startAttempt({ attemptId, command: invocation.command, args: invocation.args, cwd, env, spawnOptions: invocation.spawnOptions ?? {} });
        return normalizeAdapterResult({ operation: 'start', outcome: 'success', data: { attempt: snapshotAttempt(attempt) } });
      } catch (error) {
        return adapterTerminalFailure('start', error.message, error.code, error);
      }
    },

    async deliverTask({ attemptId, prompt, cwd, env = {}, args = [], responseFile = null, sessionId = null } = {}) {
      if (!processManager) return adapterTerminalFailure('deliverTask', 'Process manager is required for Codex task delivery.', 'CODEX_PROCESS_MANAGER_REQUIRED');
      if (!prompt) return adapterTerminalFailure('deliverTask', 'Prompt is required for Codex task delivery.', 'CODEX_PROMPT_REQUIRED');
      try {
        // `--output-last-message` is the CLI's own contract for the agent's final message, which
        // is far more reliable than scraping it out of the interleaved transcript on stdout.
        const responseArgs = responseFile ? ['--output-last-message', responseFile] : [];
        // Continuing a session is what carries prior turns into this one; without it every message
        // starts cold. The sandbox mode has to be restated because `resume` has no flag for it.
        const execArgs = sessionId
          ? ['exec', 'resume', sessionId, ...CODEX_RESUME_SANDBOX_ARGS, ...responseArgs, prompt]
          : ['exec', '--sandbox', CODEX_EXEC_SANDBOX_MODE, ...responseArgs, prompt];
        const invocation = resolveInvocation(command, [...args, ...execArgs]);
        const attempt = processManager.startAttempt({ attemptId, command: invocation.command, args: invocation.args, cwd, env, spawnOptions: invocation.spawnOptions ?? {} });
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
      if (!processManager) return adapterTerminalFailure('cancel', 'Process manager is required for Codex cancel.', 'CODEX_PROCESS_MANAGER_REQUIRED');
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
  return normalizeAdapterResult({ operation, outcome: 'terminal_failure', error: { message, code: code ?? 'CODEX_ADAPTER_FAILURE', detail: error?.details ?? null } });
}

function defaultRunCommand(command, args, resolveInvocation = defaultResolveCodexInvocation) {
  const invocation = resolveInvocation(command, args);
  return spawnSync(invocation.command, invocation.args, { encoding: 'utf8', ...(invocation.spawnOptions ?? {}) });
}

function defaultResolveCodexInvocation(command, args = []) {
  if (process.platform !== 'win32' || command !== DEFAULT_CODEX_COMMAND) return { command, args };
  const appData = process.env.APPDATA;
  const codexPs1 = appData ? `${appData}\\npm\\codex.ps1` : null;
  if (codexPs1) {
    return { command: 'powershell.exe', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', codexPs1, ...args] };
  }
  return { command, args, spawnOptions: { shell: true } };
}

function firstNonZero(...codes) {
  return codes.find((code) => code && code !== 0) ?? 1;
}

function isUnsupportedAuthStatusCommand(result = {}) {
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
  return /(?:unrecognized|unknown|unsupported|invalid)\s+(?:subcommand|command|argument)[\s\S]*\b(?:auth|status)\b|\b(?:auth|status)\b[\s\S]*(?:unrecognized|unknown|unsupported|invalid)/i.test(output);
}



