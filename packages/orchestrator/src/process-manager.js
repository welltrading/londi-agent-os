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

export const ATTEMPT_SUPERVISION_DEFAULTS = Object.freeze({
  heartbeatIntervalMs: 30_000,
  unresponsiveAfterMs: 120_000,
  failureAfterMs: 300_000,
  timeoutAfterMs: 30 * 60_000
});

export const ATTEMPT_SUPERVISION_STATES = Object.freeze([
  'Running',
  'Heartbeat Due',
  'Unresponsive',
  'Failed',
  'Timeout Decision Required'
]);

export class AttemptSupervisionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'AttemptSupervisionError';
    this.code = 'ERR_ATTEMPT_SUPERVISION';
    this.details = details;
  }
}

export function createAttemptSupervisor({
  nowMs = () => Date.now(),
  heartbeatIntervalMs = ATTEMPT_SUPERVISION_DEFAULTS.heartbeatIntervalMs,
  unresponsiveAfterMs = ATTEMPT_SUPERVISION_DEFAULTS.unresponsiveAfterMs,
  failureAfterMs = ATTEMPT_SUPERVISION_DEFAULTS.failureAfterMs,
  timeoutAfterMs = ATTEMPT_SUPERVISION_DEFAULTS.timeoutAfterMs
} = {}) {
  validateSupervisionThresholds({ heartbeatIntervalMs, unresponsiveAfterMs, failureAfterMs, timeoutAfterMs });
  const attempts = new Map();
  const events = [];

  function currentMs() {
    const value = Number(nowMs());
    if (!Number.isFinite(value)) throw new AttemptSupervisionError('Supervisor clock must return a finite millisecond timestamp.');
    return value;
  }

  function record(event) {
    const entry = Object.freeze({ observedAtMs: currentMs(), ...event });
    events.push(entry);
    return entry;
  }

  function getAttempt(attemptId) {
    const attempt = attempts.get(attemptId);
    if (!attempt) throw new AttemptSupervisionError('Unknown supervised attempt.', { attemptId });
    return attempt;
  }

  function classify(attempt, observedAtMs = currentMs()) {
    const elapsedMs = Math.max(0, observedAtMs - attempt.startedAtMs);
    const silenceMs = Math.max(0, observedAtMs - attempt.lastHeartbeatAtMs);

    if (elapsedMs >= timeoutAfterMs && silenceMs < unresponsiveAfterMs) {
      return {
        state: 'Timeout Decision Required',
        action: 'request-timeout-decision',
        reason: 'attempt-timeout-with-recent-heartbeat'
      };
    }
    if (silenceMs >= failureAfterMs) {
      return { state: 'Failed', action: 'mark-failed', reason: 'heartbeat-missing-300s' };
    }
    if (silenceMs >= unresponsiveAfterMs) {
      return { state: 'Unresponsive', action: 'mark-unresponsive', reason: 'heartbeat-missing-120s' };
    }
    if (silenceMs >= heartbeatIntervalMs) {
      return { state: 'Heartbeat Due', action: 'request-heartbeat', reason: 'heartbeat-due-30s' };
    }
    return { state: 'Running', action: 'none', reason: 'heartbeat-fresh' };
  }

  function snapshot(attempt, observedAtMs = currentMs()) {
    const classification = classify(attempt, observedAtMs);
    return Object.freeze({
      attemptId: attempt.attemptId,
      startedAtMs: attempt.startedAtMs,
      lastHeartbeatAtMs: attempt.lastHeartbeatAtMs,
      observedAtMs,
      elapsedMs: Math.max(0, observedAtMs - attempt.startedAtMs),
      silenceMs: Math.max(0, observedAtMs - attempt.lastHeartbeatAtMs),
      ...classification
    });
  }

  return Object.freeze({
    registerAttempt({ attemptId, startedAtMs = currentMs(), initialHeartbeatAtMs = startedAtMs } = {}) {
      if (!attemptId) throw new AttemptSupervisionError('Attempt id is required for supervision.');
      if (attempts.has(attemptId)) throw new AttemptSupervisionError('Attempt is already supervised.', { attemptId });
      const attempt = { attemptId, startedAtMs: Number(startedAtMs), lastHeartbeatAtMs: Number(initialHeartbeatAtMs) };
      if (!Number.isFinite(attempt.startedAtMs) || !Number.isFinite(attempt.lastHeartbeatAtMs)) throw new AttemptSupervisionError('Attempt timestamps must be finite milliseconds.', { attemptId });
      attempts.set(attemptId, attempt);
      record({ type: 'attempt.supervision.registered', attemptId });
      return snapshot(attempt);
    },

    recordHeartbeat({ attemptId, heartbeatAtMs = currentMs() } = {}) {
      const attempt = getAttempt(attemptId);
      const heartbeatTime = Number(heartbeatAtMs);
      if (!Number.isFinite(heartbeatTime)) throw new AttemptSupervisionError('Heartbeat timestamp must be a finite millisecond value.', { attemptId });
      if (heartbeatTime < attempt.lastHeartbeatAtMs) throw new AttemptSupervisionError('Heartbeat cannot move backwards.', { attemptId, heartbeatAtMs });
      attempt.lastHeartbeatAtMs = heartbeatTime;
      record({ type: 'attempt.heartbeat.received', attemptId, heartbeatAtMs: heartbeatTime });
      return snapshot(attempt, heartbeatTime);
    },

    evaluateAttempt({ attemptId, observedAtMs = currentMs() } = {}) {
      const attempt = getAttempt(attemptId);
      const result = snapshot(attempt, Number(observedAtMs));
      record({ type: 'attempt.supervision.evaluated', attemptId, state: result.state, action: result.action, reason: result.reason });
      return result;
    },

    listAttempts() {
      return [...attempts.values()].map((attempt) => snapshot(attempt));
    },

    getEvents() {
      return [...events];
    }
  });
}

function validateSupervisionThresholds({ heartbeatIntervalMs, unresponsiveAfterMs, failureAfterMs, timeoutAfterMs }) {
  const values = { heartbeatIntervalMs, unresponsiveAfterMs, failureAfterMs, timeoutAfterMs };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(Number(value)) || Number(value) <= 0) throw new AttemptSupervisionError('Supervision thresholds must be positive millisecond values.', { name, value });
  }
  if (!(heartbeatIntervalMs < unresponsiveAfterMs && unresponsiveAfterMs < failureAfterMs && failureAfterMs < timeoutAfterMs)) {
    throw new AttemptSupervisionError('Supervision thresholds must be ordered: heartbeat < unresponsive < failure < timeout.', values);
  }
}
