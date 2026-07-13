import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export class CommandPipelineError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CommandPipelineError';
    this.code = 'ERR_COMMAND_PIPELINE_FAILED';
    this.details = details;
  }
}

export class ArtifactMismatchError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ArtifactMismatchError';
    this.code = 'ERR_ARTIFACT_MISMATCH';
    this.details = details;
  }
}

export function executeCommandPipeline(command) {
  const normalized = normalizeCommand(command);
  const context = { command: normalized, publications: [], artifact: null };

  try {
    normalized.validate(normalized);
    const transition = normalized.guard(normalized);

    normalized.transaction((repository) => {
      repository.applyState?.(transition);
      repository.appendEvent?.(normalized.event);
      repository.appendAudit?.(normalized.audit);
    }, normalized);

    if (normalized.artifact) {
      context.artifact = writeAtomicArtifact(normalized.artifact);
      if (normalized.artifact.required && context.artifact.hash !== normalized.artifact.expectedHash) {
        normalized.onArtifactMismatch?.({ artifact: context.artifact, command: normalized });
        throw new ArtifactMismatchError('Required artifact hash mismatch.', {
          path: context.artifact.path,
          expectedHash: normalized.artifact.expectedHash,
          actualHash: context.artifact.hash
        });
      }
    }

    context.publications = normalized.publish(normalized.event);
    return { ok: true, transition, event: normalized.event, audit: normalized.audit, artifact: context.artifact, publications: context.publications };
  } catch (error) {
    if (error instanceof ArtifactMismatchError) throw error;
    throw new CommandPipelineError('Command pipeline failed before publication.', {
      cause: error.message,
      commandType: normalized.type
    });
  }
}

export function writeAtomicArtifact({ path, content, expectedHash }) {
  if (!path || typeof path !== 'string') throw new CommandPipelineError('Artifact path is required.');
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ''), 'utf8');
  const hash = sha256(buffer);
  const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(tempPath, buffer);

  try {
    renameSync(tempPath, path);
  } catch (error) {
    rmSync(tempPath, { force: true });
    throw error;
  }

  return { path, hash, size: buffer.byteLength, expectedHash };
}

export function createSqliteCommandTransaction(database) {
  return (work, command) => {
    database.exec('BEGIN IMMEDIATE TRANSACTION');
    try {
      work({
        applyState: (transition) => {
          if (command.aggregate === 'run') {
            database.prepare('UPDATE runs SET state = ?, updated_at = datetime(\'now\'), revision = revision + 1 WHERE id = ?').run(transition.to, command.runId);
          }
        },
        appendEvent: (event) => {
          database.prepare('INSERT INTO events (type, run_id, step_id, severity, payload_redacted) VALUES (?, ?, ?, ?, ?)')
            .run(event.type, event.runId ?? null, event.stepId ?? null, event.severity ?? 'info', JSON.stringify(event.payloadRedacted ?? {}));
        },
        appendAudit: (audit) => {
          const eventId = database.prepare('SELECT MAX(event_id) AS eventId FROM events').get().eventId;
          database.prepare('INSERT INTO audit_entries (id, event_id, actor, action, target, result, metadata_redacted) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(audit.id, eventId, audit.actor, audit.action, audit.target, audit.result, JSON.stringify(audit.metadataRedacted ?? {}));
        }
      });
      database.exec('COMMIT');
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch {}
      throw error;
    }
  };
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeCommand(command = {}) {
  return {
    type: command.type ?? 'unknown',
    aggregate: command.aggregate ?? 'run',
    runId: command.runId,
    validate: command.validate ?? (() => true),
    guard: command.guard ?? (() => ({ from: undefined, event: undefined, to: undefined })),
    transaction: command.transaction ?? (() => {}),
    event: command.event ?? { type: 'command.executed', payloadRedacted: {} },
    audit: command.audit ?? { id: `audit-${Date.now()}`, actor: 'system', action: 'command', target: command.runId ?? 'unknown', result: 'ok', metadataRedacted: {} },
    artifact: command.artifact,
    publish: command.publish ?? (() => []),
    onArtifactMismatch: command.onArtifactMismatch
  };
}
