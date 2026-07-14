export const NOTIFICATION_REMINDER_MINUTES = 15;
export const NOTIFICATION_ESCALATION_MINUTES = 60;
export const NOTIFICATION_ACTIONS = Object.freeze(['open-ui', 'dismiss']);
export const NOTIFICATION_FORBIDDEN_ACTIONS = Object.freeze(['approve', 'reject', 'accept', 'retry', 'replace-agent', 'stop', 'auto-decision']);

export class WindowsNotificationError extends Error {
  constructor(message, code = 'ERR_WINDOWS_NOTIFICATION', details = {}) {
    super(message);
    this.name = 'WindowsNotificationError';
    this.code = code;
    this.details = details;
  }
}

export function createWindowsNotification({ run, reason, uiUrl, now = new Date().toISOString() } = {}) {
  const normalized = normalizeRun(run);
  if (!uiUrl || !/^https?:\/\/127\.0\.0\.1(?::\d+)?\//.test(uiUrl)) throw new WindowsNotificationError('Notification UI URL must be a local 127.0.0.1 URL.', 'ERR_NOTIFICATION_UI_URL', { uiUrl });
  const body = sanitizeNotificationText(reason ?? `Run ${normalized.title} needs attention.`);
  return deepFreezeNotification({
    id: `notification-${normalized.id}-${Date.parse(now) || 0}`,
    runId: normalized.id,
    title: 'Londi Agent OS needs attention',
    body,
    severity: normalized.severity,
    createdAt: now,
    opensUi: true,
    uiUrl,
    actions: NOTIFICATION_ACTIONS.map((action) => ({ action, enabled: true })),
    approvalCapable: false,
    autoDecisionCapable: false,
    sensitive: false
  });
}

export function scheduleNotificationFollowups({ notification, now = notification?.createdAt ?? new Date().toISOString() } = {}) {
  if (!notification?.id || !notification?.runId) throw new WindowsNotificationError('Notification is required for follow-up scheduling.', 'ERR_NOTIFICATION_REQUIRED');
  const base = Date.parse(now);
  if (!Number.isFinite(base)) throw new WindowsNotificationError('Valid schedule time is required.', 'ERR_NOTIFICATION_TIME', { now });
  return deepFreezeNotification({
    notificationId: notification.id,
    runId: notification.runId,
    uiClosedDoesNotBlockRun: true,
    followups: [
      { kind: 'reminder', dueAt: new Date(base + NOTIFICATION_REMINDER_MINUTES * 60_000).toISOString(), action: 'notify-only', autoDecision: false },
      { kind: 'stop-reminders', dueAt: new Date(base + NOTIFICATION_ESCALATION_MINUTES * 60_000).toISOString(), action: 'silence-notifications', autoDecision: false }
    ]
  });
}

export function handleNotificationAction({ notification, action, uiOpen = false } = {}) {
  if (!notification?.id) throw new WindowsNotificationError('Notification is required.', 'ERR_NOTIFICATION_REQUIRED');
  if (NOTIFICATION_FORBIDDEN_ACTIONS.includes(action)) throw new WindowsNotificationError('Notifications cannot perform approvals or run decisions.', 'ERR_NOTIFICATION_DECISION_FORBIDDEN', { action });
  if (!NOTIFICATION_ACTIONS.includes(action)) throw new WindowsNotificationError('Unknown notification action.', 'ERR_NOTIFICATION_ACTION', { action });
  if (action === 'open-ui') return deepFreezeNotification({ notificationId: notification.id, effect: 'open-ui', uiUrl: notification.uiUrl, decision: null, runContinuesIfUiClosed: true, uiOpen: true });
  return deepFreezeNotification({ notificationId: notification.id, effect: 'dismiss', decision: null, runContinuesIfUiClosed: true, uiOpen });
}

export function assertNotificationIsNonSensitive(notification) {
  const text = `${notification?.title ?? ''} ${notification?.body ?? ''} ${notification?.uiUrl ?? ''}`;
  if (containsSensitiveText(text)) throw new WindowsNotificationError('Notification contains sensitive data.', 'ERR_NOTIFICATION_SENSITIVE');
  if (notification?.approvalCapable !== false || notification?.autoDecisionCapable !== false) throw new WindowsNotificationError('Notification must not approve or auto-decide.', 'ERR_NOTIFICATION_CAPABILITY');
  return true;
}

function normalizeRun(run = {}) {
  if (!run.id) throw new WindowsNotificationError('Run id is required.', 'ERR_NOTIFICATION_RUN');
  return { id: run.id, title: sanitizeNotificationText(run.title ?? run.id), severity: run.severity ?? 'warning' };
}

function sanitizeNotificationText(value) {
  return String(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/(token|password|secret|credential|api[_-]?key)=([^\s&]+)/gi, '$1=[REDACTED]')
    .replace(/sk-[A-Za-z0-9_-]{8,}|[A-Za-z0-9_-]{43,}/g, '[REDACTED]')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .slice(0, 240);
}

function containsSensitiveText(value) {
  return /Bearer\s+(?!\[REDACTED\])|sk-[A-Za-z0-9_-]{8,}|(token|password|secret|credential|api[_-]?key)=((?!\[REDACTED\])[^\s&]+)/i.test(String(value ?? ''));
}

function deepFreezeNotification(value) {
  if (!value || typeof value !== 'object') return value;
  for (const child of Object.values(value)) deepFreezeNotification(child);
  return Object.freeze(value);
}
