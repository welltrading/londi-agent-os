import { strict as assert } from 'node:assert';
import {
  NOTIFICATION_ESCALATION_MINUTES,
  NOTIFICATION_REMINDER_MINUTES,
  WindowsNotificationError,
  assertNotificationIsNonSensitive,
  createWindowsNotification,
  handleNotificationAction,
  scheduleNotificationFollowups
} from '../apps/ui/src/index.js';

const now = '2026-07-14T10:00:00.000Z';
const notification = createWindowsNotification({
  run: { id: 'run-1', title: 'Needs Attention', severity: 'warning' },
  reason: 'Approval needed for run; token=abc123 should be redacted.',
  uiUrl: 'http://127.0.0.1:43110/runs/run-1',
  now
});
assert.equal(notification.opensUi, true);
assert.equal(notification.approvalCapable, false);
assert.equal(notification.autoDecisionCapable, false);
assert.equal(notification.sensitive, false);
assert.equal(notification.body.includes('abc123'), false);
assert.equal(assertNotificationIsNonSensitive(notification), true);

const followups = scheduleNotificationFollowups({ notification, now });
assert.equal(followups.uiClosedDoesNotBlockRun, true);
assert.equal(followups.followups[0].kind, 'reminder');
assert.equal(followups.followups[0].dueAt, '2026-07-14T10:15:00.000Z');
assert.equal(followups.followups[1].kind, 'stop-reminders');
assert.equal(followups.followups[1].dueAt, '2026-07-14T11:00:00.000Z');
assert.equal(NOTIFICATION_REMINDER_MINUTES, 15);
assert.equal(NOTIFICATION_ESCALATION_MINUTES, 60);

const openUi = handleNotificationAction({ notification, action: 'open-ui' });
assert.equal(openUi.effect, 'open-ui');
assert.equal(openUi.decision, null);
assert.equal(openUi.runContinuesIfUiClosed, true);
const dismissed = handleNotificationAction({ notification, action: 'dismiss', uiOpen: false });
assert.equal(dismissed.effect, 'dismiss');
assert.equal(dismissed.runContinuesIfUiClosed, true);

assert.throws(() => handleNotificationAction({ notification, action: 'approve' }), WindowsNotificationError);
assert.throws(() => handleNotificationAction({ notification, action: 'auto-decision' }), WindowsNotificationError);
assert.throws(() => createWindowsNotification({ run: { id: 'run-1' }, uiUrl: 'https://example.com/runs/run-1' }), WindowsNotificationError);
assert.throws(() => assertNotificationIsNonSensitive({ title: 'x', body: 'Bearer live-secret-token', uiUrl: 'http://127.0.0.1:1/', approvalCapable: false, autoDecisionCapable: false }), WindowsNotificationError);

console.log('Windows notification tests OK');
