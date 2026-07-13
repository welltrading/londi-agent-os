import { spawn } from 'node:child_process';

export class ProcessControlError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProcessControlError';
    this.code = 'ERR_PROCESS_CONTROL';
    this.details = details;
  }
}

export function createAttemptProcessManager({ now = () => new Date().toISOString(), killTimeoutMs = 250 } = {}) {
  const attempts = new Map();
  const events = [];

  function record(event) {
    const recorded = Object.freeze({ timestamp: now(), ...event });
    events.push(recorded);
    return recorded;
  }

  return {
    startAttempt({ attemptId, command, args = [], cwd, env = {}, spawnOptions = {} } = {}) {
      if (!attemptId) throw new ProcessControlError('Attempt id is required to start a process.');
      if (attempts.has(attemptId)) throw new ProcessControlError('Attempt already has a tracked process.', { attemptId });
      if (!command) throw new ProcessControlError('Command is required to start a process.', { attemptId });

      const child = spawn(command, args, {
        cwd,
        env: { ...process.env, ...env },
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...spawnOptions
      });
      const attempt = {
        attemptId,
        pid: child.pid,
        child,
        status: 'Running',
        startedAt: now(),
        cancelledAt: null,
        exitedAt: null,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: ''
      };
      child.stdout?.on('data', (chunk) => { attempt.stdout += chunk.toString(); });
      child.stderr?.on('data', (chunk) => { attempt.stderr += chunk.toString(); });
      child.once('exit', (code, signal) => {
        attempt.status = attempt.status === 'Cancelling' ? 'Cancelled' : 'Exited';
        attempt.exitedAt = now();
        attempt.exitCode = code;
        attempt.signal = signal;
        record({ type: 'process.exit', attemptId, pid: attempt.pid, code, signal });
      });
      attempts.set(attemptId, attempt);
      record({ type: 'process.start', attemptId, pid: child.pid, jobObject: deriveJobObjectName(attemptId) });
      return snapshotAttempt(attempt);
    },

    async cancelAttempt({ attemptId, signal = 'SIGTERM' } = {}) {
      const attempt = attempts.get(attemptId);
      if (!attempt) throw new ProcessControlError('Cannot cancel an unknown attempt process.', { attemptId });
      if (attempt.status !== 'Running') return snapshotAttempt(attempt);
      attempt.status = 'Cancelling';
      attempt.cancelledAt = now();
      record({ type: 'process.cancel.requested', attemptId, pid: attempt.pid, signal });
      killProcessTree(attempt.pid, signal);
      await waitForExit(attempt.child, killTimeoutMs, () => killProcessTree(attempt.pid, 'SIGKILL'));
      if (!hasProcessExited(attempt.child)) {
        throw new ProcessControlError('Child process survived cancel/kill tree.', { attemptId, pid: attempt.pid });
      }
      attempt.status = 'Cancelled';
      record({ type: 'process.cancelled', attemptId, pid: attempt.pid });
      return snapshotAttempt(attempt);
    },

    assertControlledProcess({ attemptId, pid } = {}) {
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.pid !== pid) {
        const event = record({ type: 'process.control.blocked', attemptId, pid, reason: 'not-child-of-attempt' });
        throw new ProcessControlError('Refusing to control a process that is not the tracked attempt child.', { attemptId, pid, auditEvent: event });
      }
      return { controlled: true, attemptId, pid };
    },

    listAttempts() {
      return [...attempts.values()].map(snapshotAttempt);
    },

    getEvents() {
      return [...events];
    }
  };
}

export function deriveJobObjectName(attemptId) {
  const slug = String(attemptId ?? '').replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 48);
  if (!slug) throw new ProcessControlError('Attempt id is required for Job Object naming.');
  return `LondiAgentOS-${slug}`;
}

function snapshotAttempt(attempt) {
  return Object.freeze({
    attemptId: attempt.attemptId,
    pid: attempt.pid,
    status: attempt.status,
    startedAt: attempt.startedAt,
    cancelledAt: attempt.cancelledAt,
    exitedAt: attempt.exitedAt,
    exitCode: attempt.exitCode,
    signal: attempt.signal,
    stdout: attempt.stdout,
    stderr: attempt.stderr,
    jobObject: deriveJobObjectName(attempt.attemptId)
  });
}

function killProcessTree(pid, signal) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', signal === 'SIGKILL' ? '/F' : ''], { stdio: 'ignore' });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    try { process.kill(pid, signal); } catch { /* already exited */ }
  }
}

function hasProcessExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs, onTimeout) {
  if (hasProcessExited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      onTimeout();
      setTimeout(resolve, 50);
    }, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}
