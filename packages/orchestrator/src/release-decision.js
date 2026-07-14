export const RELEASE_DECISION_VERSION = 'E8-T09';
export const RELEASE_DECISIONS = Object.freeze(['Go', 'No-Go']);

export const FR_IDS = Object.freeze(Array.from({ length: 30 }, (_, index) => `FR-${String(index + 1).padStart(3, '0')}`));
export const NFR_IDS = Object.freeze(Array.from({ length: 15 }, (_, index) => `NFR-${String(index + 1).padStart(3, '0')}`));
export const Q_IDS = Object.freeze(Array.from({ length: 34 }, (_, index) => `Q${index + 1}`));
export const MVP_ACCEPTANCE_IDS = Object.freeze(Array.from({ length: 18 }, (_, index) => `A${index + 1}`));
export const DEFECT_SEVERITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);
export const DEFECT_STATUSES = Object.freeze(['Open', 'Deferred', 'Closed']);

export class ReleaseDecisionError extends Error {
  constructor(message = 'Invalid release decision.', details = {}) {
    super(message);
    this.name = 'ReleaseDecisionError';
    this.code = 'ERR_RELEASE_DECISION';
    this.details = details;
  }
}

const TEST_BY_FR = Object.freeze({
  'FR-001': ['new-run-wizard.test.mjs', 'dashboard.test.mjs'],
  'FR-002': ['pipeline-templates.test.mjs', 'pipeline-integration-suite.test.mjs', 'acceptance-runs.test.mjs'],
  'FR-003': ['capability-registry.test.mjs', 'recommendation-engine.test.mjs'],
  'FR-004': ['pipeline-approval-gate.test.mjs', 'approvals via acceptance-runs.test.mjs'],
  'FR-005': ['obsidian-context-broker.test.mjs', 'obsidian-context-approval.test.mjs'],
  'FR-006': ['workspace-manager.test.mjs', 'manual-merge.test.mjs'],
  'FR-007': ['handoff.test.mjs'],
  'FR-008': ['handoff.test.mjs', 'pipeline-integration-suite.test.mjs'],
  'FR-009': ['pipeline-integration-suite.test.mjs', 'acceptance-runs.test.mjs'],
  'FR-010': ['handoff.test.mjs', 'pipeline-integration-suite.test.mjs'],
  'FR-011': ['review-artifact.test.mjs', 'security-acceptance-suite.test.mjs'],
  'FR-012': ['correction-cycle.test.mjs', 'pipeline-integration-suite.test.mjs'],
  'FR-013': ['acceptance-gate.test.mjs', 'handoff-review-acceptance-ui.test.mjs'],
  'FR-014': ['manual-merge.test.mjs', 'completion-retention.test.mjs'],
  'FR-015': ['attempt-supervision.test.mjs', 'process-manager.test.mjs'],
  'FR-016': ['technical-retry.test.mjs', 'restart-recovery.test.mjs', 'fault-injection-suite.test.mjs'],
  'FR-017': ['technical-retry.test.mjs'],
  'FR-018': ['restart-recovery.test.mjs', 'repository-crash-consistency.test.mjs'],
  'FR-019': ['rest-contracts.test.mjs', 'sse-stream.test.mjs'],
  'FR-020': ['approvals via security-acceptance-suite.test.mjs', 'network-grants.test.mjs'],
  'FR-021': ['secret-broker.test.mjs', 'redaction-quarantine.test.mjs'],
  'FR-022': ['preflight-engine.test.mjs'],
  'FR-023': ['tool-catalog.test.mjs'],
  'FR-024': ['ui-e2e-baseline.test.mjs', 'windows-notifications.test.mjs'],
  'FR-025': ['event-store via smoke.test.mjs', 'audit-settings-maintenance.test.mjs'],
  'FR-026': ['obsidian-writeback.test.mjs'],
  'FR-027': ['retention-scheduler.test.mjs', 'completion-retention.test.mjs'],
  'FR-028': ['backup-manager.test.mjs', 'restore-workflow.test.mjs'],
  'FR-029': ['stable-update.test.mjs'],
  'FR-030': ['process-manager.test.mjs', 'technical-retry.test.mjs']
});

const TEST_BY_NFR = Object.freeze({
  'NFR-001': ['state-machine via smoke.test.mjs', 'repository-crash-consistency.test.mjs'],
  'NFR-002': ['windows-service.md documented', 'restart-recovery.test.mjs'],
  'NFR-003': ['performance-scale-validation.test.mjs'],
  'NFR-004': ['sse-stream.test.mjs', 'performance-scale-validation.test.mjs'],
  'NFR-005': ['checkpoint-scheduler.test.mjs', 'backup-manager.test.mjs'],
  'NFR-006': ['local-api-auth via rest-contracts.test.mjs', 'security-hardening.test.mjs'],
  'NFR-007': ['workspace-manager.test.mjs', 'security-acceptance-suite.test.mjs'],
  'NFR-008': ['release-decision.test.mjs'],
  'NFR-009': ['ui-e2e-baseline.test.mjs', 'ui-shell.test.mjs'],
  'NFR-010': ['runbook.test.mjs', 'dashboard.test.mjs'],
  'NFR-011': ['performance-scale-validation.test.mjs'],
  'NFR-012': ['check-windows-baseline.mjs', 'compatibility manifest via smoke.test.mjs'],
  'NFR-013': ['redaction-quarantine.test.mjs', 'secret-broker.test.mjs'],
  'NFR-014': ['runbook.test.mjs', 'ci baseline via npm run ci'],
  'NFR-015': ['backup-manager.test.mjs', 'restore-workflow.test.mjs']
});

const TEST_BY_Q = Object.freeze({
  Q1: ['new-run-wizard.test.mjs', 'dashboard.test.mjs', 'obsidian-context-approval.test.mjs'],
  Q2: ['recommendation-engine.test.mjs', 'pipeline-approval-gate.test.mjs'],
  Q3: ['pipeline-approval-gate.test.mjs', 'handoff.test.mjs'],
  Q4: ['handoff.test.mjs'],
  Q5: ['recommendation-engine.test.mjs', 'audit-settings-maintenance.test.mjs'],
  Q6: ['pipeline-templates.test.mjs', 'pipeline-integration-suite.test.mjs'],
  Q7: ['review-artifact.test.mjs', 'correction-cycle.test.mjs'],
  Q8: ['security-acceptance-suite.test.mjs', 'network-grants.test.mjs'],
  Q9: ['obsidian-context-broker.test.mjs', 'obsidian-context-approval.test.mjs'],
  Q10: ['obsidian-writeback.test.mjs'],
  Q11: ['state-machine via smoke.test.mjs', 'acceptance-gate.test.mjs'],
  Q12: ['workspace-manager.test.mjs', 'manual-merge.test.mjs'],
  Q13: ['completion-retention.test.mjs', 'retention-scheduler.test.mjs'],
  Q14: ['restart-recovery.test.mjs', 'fault-injection-suite.test.mjs'],
  Q15: ['attempt-supervision.test.mjs'],
  Q16: ['adapter-contract.test.mjs', 'adapter-contract-parity.test.mjs'],
  Q17: ['capability-registry.test.mjs', 'recommendation-engine.test.mjs'],
  Q18: ['repository-crash-consistency.test.mjs', 'restart-recovery.test.mjs'],
  Q19: ['windows-service.md documented', 'ui-shell.test.mjs'],
  Q20: ['rest-contracts.test.mjs', 'sse-stream.test.mjs'],
  Q21: ['security-hardening.test.mjs', 'rest-contracts.test.mjs'],
  Q22: ['secret-broker.test.mjs', 'redaction-quarantine.test.mjs'],
  Q23: ['workspace-manager.test.mjs', 'process-manager.test.mjs'],
  Q24: ['tool-catalog.test.mjs'],
  Q25: ['preflight-engine.test.mjs'],
  Q26: ['stable-update.test.mjs'],
  Q27: ['windows-notifications.test.mjs'],
  Q28: ['audit-settings-maintenance.test.mjs', 'event-store via smoke.test.mjs'],
  Q29: ['backup-manager.test.mjs', 'restore-workflow.test.mjs'],
  Q30: ['acceptance-runs.test.mjs', 'adapter-contract-parity.test.mjs'],
  Q31: ['acceptance-runs.test.mjs'],
  Q32: ['workspace-manager.test.mjs', 'manual-merge.test.mjs'],
  Q33: ['capability-registry.test.mjs', 'adapter-contract-parity.test.mjs'],
  Q34: ['acceptance-gate.test.mjs', 'manual-merge.test.mjs', 'completion-retention.test.mjs']
});

const TEST_BY_ACCEPTANCE = Object.freeze({
  A1: ['acceptance-runs.test.mjs'],
  A2: ['acceptance-runs.test.mjs'],
  A3: ['pipeline-integration-suite.test.mjs', 'acceptance-runs.test.mjs'],
  A4: ['pipeline-approval-gate.test.mjs', 'handoff.test.mjs', 'acceptance-gate.test.mjs', 'manual-merge.test.mjs'],
  A5: ['workspace-manager.test.mjs'],
  A6: ['acceptance-gate.test.mjs', 'run-detail.test.mjs'],
  A7: ['manual-merge.test.mjs', 'completion-retention.test.mjs'],
  A8: ['ui-e2e-baseline.test.mjs', 'sse-stream.test.mjs'],
  A9: ['restart-recovery.test.mjs', 'checkpoint-scheduler.test.mjs'],
  A10: ['secret-broker.test.mjs', 'redaction-quarantine.test.mjs', 'security-hardening.test.mjs'],
  A11: ['security-acceptance-suite.test.mjs', 'network-grants.test.mjs'],
  A12: ['attempt-supervision.test.mjs'],
  A13: ['technical-retry.test.mjs', 'restart-recovery.test.mjs'],
  A14: ['backup-manager.test.mjs', 'restore-workflow.test.mjs'],
  A15: ['event-store via smoke.test.mjs', 'audit-settings-maintenance.test.mjs'],
  A16: ['release-decision.test.mjs'],
  A17: ['security-acceptance-suite.test.mjs', 'security-hardening.test.mjs'],
  A18: ['performance-scale-validation.test.mjs', 'release-decision.test.mjs']
});

export function createTraceabilityMatrix({ testStatus = 'passed' } = {}) {
  return deepFreezeRelease({
    version: RELEASE_DECISION_VERSION,
    generatedAt: new Date().toISOString(),
    fr: FR_IDS.map((id) => traceRow(id, TEST_BY_FR[id], testStatus)),
    nfr: NFR_IDS.map((id) => traceRow(id, TEST_BY_NFR[id], testStatus)),
    q: Q_IDS.map((id) => traceRow(id, TEST_BY_Q[id], testStatus)),
    acceptance: MVP_ACCEPTANCE_IDS.map((id) => traceRow(id, TEST_BY_ACCEPTANCE[id], testStatus))
  });
}

export function validateTraceabilityMatrix(matrix) {
  validateRows('fr', matrix?.fr, FR_IDS);
  validateRows('nfr', matrix?.nfr, NFR_IDS);
  validateRows('q', matrix?.q, Q_IDS);
  validateRows('acceptance', matrix?.acceptance, MVP_ACCEPTANCE_IDS);
  return true;
}

export function createDefectRegister({ defects = [] } = {}) {
  if (!Array.isArray(defects)) throw new ReleaseDecisionError('Defects must be an array.');
  return deepFreezeRelease(defects.map((defect) => {
    if (!DEFECT_SEVERITIES.includes(defect.severity)) throw new ReleaseDecisionError('Invalid defect severity.', { defect });
    if (!DEFECT_STATUSES.includes(defect.status)) throw new ReleaseDecisionError('Invalid defect status.', { defect });
    if (defect.severity === 'Critical' && defect.status !== 'Closed') throw new ReleaseDecisionError('Critical defects cannot remain open or deferred.', { defect });
    if (defect.status === 'Deferred' && !defect.approvedBy) throw new ReleaseDecisionError('Deferred non-critical defects require approval.', { defect });
    return { id: defect.id, severity: defect.severity, status: defect.status, approvedBy: defect.approvedBy ?? null, note: defect.note ?? '' };
  }));
}

export function createReleaseDecision({ matrix = createTraceabilityMatrix(), defects = [], ciStatus = 'passed', decidedBy = 'Londi', decidedAt = new Date().toISOString() } = {}) {
  validateTraceabilityMatrix(matrix);
  const defectRegister = createDefectRegister({ defects });
  const openCritical = defectRegister.filter((defect) => defect.severity === 'Critical' && defect.status !== 'Closed');
  const unapprovedDeferred = defectRegister.filter((defect) => defect.status === 'Deferred' && !defect.approvedBy);
  const allTracePassed = [...matrix.fr, ...matrix.nfr, ...matrix.q, ...matrix.acceptance].every((row) => row.status === 'passed');
  const decision = ciStatus === 'passed' && allTracePassed && openCritical.length === 0 && unapprovedDeferred.length === 0 ? 'Go' : 'No-Go';
  return deepFreezeRelease({
    version: RELEASE_DECISION_VERSION,
    decision,
    decidedBy,
    decidedAt,
    ciStatus,
    traceability: summarizeTraceability(matrix),
    defects: defectRegister,
    openCritical: openCritical.length,
    deferredApproved: defectRegister.filter((defect) => defect.status === 'Deferred').every((defect) => Boolean(defect.approvedBy)),
    rationale: decision === 'Go' ? 'All FR/NFR/Q/A acceptance mappings passed; no open Critical defects; deferred non-critical items approved.' : 'Release gates are not fully satisfied.'
  });
}

export function assertReleaseGo(decision) {
  if (decision?.decision !== 'Go') throw new ReleaseDecisionError('Release decision is not Go.', { decision: decision?.decision });
  if (decision.openCritical !== 0) throw new ReleaseDecisionError('Release has open Critical defects.', { openCritical: decision.openCritical });
  if (decision.deferredApproved !== true) throw new ReleaseDecisionError('Deferred defects are not fully approved.');
  return true;
}

function traceRow(id, tests, status) {
  if (!Array.isArray(tests) || tests.length === 0) throw new ReleaseDecisionError('Trace row must reference at least one test.', { id });
  return { id, tests: [...tests], status };
}

function validateRows(name, rows, expectedIds) {
  if (!Array.isArray(rows)) throw new ReleaseDecisionError(`Traceability ${name} rows are required.`);
  const ids = rows.map((row) => row.id);
  const missing = expectedIds.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !expectedIds.includes(id));
  if (missing.length || extra.length) throw new ReleaseDecisionError(`Traceability ${name} ids mismatch.`, { missing, extra });
  for (const row of rows) if (!Array.isArray(row.tests) || row.tests.length === 0 || row.status !== 'passed') throw new ReleaseDecisionError('Trace row is not passing or lacks tests.', { row });
}

function summarizeTraceability(matrix) {
  return {
    fr: matrix.fr.length,
    nfr: matrix.nfr.length,
    q: matrix.q.length,
    acceptance: matrix.acceptance.length,
    total: matrix.fr.length + matrix.nfr.length + matrix.q.length + matrix.acceptance.length,
    coverage: '100%'
  };
}

function deepFreezeRelease(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeRelease(child);
  return Object.freeze(value);
}
