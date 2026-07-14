import { strict as assert } from 'node:assert';
import {
  UI_E2E_CORE_SCREENS,
  UI_E2E_REQUIRED_TEMPLATES,
  UI_E2E_WCAG_LEVEL,
  UiE2eBaselineError,
  assertUiE2eBaselinePasses,
  createLongLogsScenario,
  createReconnectScenario,
  createStaleRevisionScenario,
  createUiE2eBaselineScenario,
  evaluateUiE2eBaseline,
  evaluateWcagBaseline,
  getUiBootstrapModel
} from '../apps/ui/src/index.js';

const scenario = createUiE2eBaselineScenario();
assert.deepEqual(scenario.templates, UI_E2E_REQUIRED_TEMPLATES);
assert.equal(Object.keys(scenario.screens).length, UI_E2E_CORE_SCREENS.length);
assert.equal(scenario.reconnect.passed, true);
assert.equal(scenario.staleRevision.reloadRequired, true);
assert.equal(scenario.longLogs.latestWindow, 2000);
assert.equal(scenario.screens.runDetail.eventPage.truncatedToLast, 2000);
assert.equal(scenario.wcag.level, UI_E2E_WCAG_LEVEL);
assert.equal(scenario.wcag.passed, true);
assert.equal(evaluateUiE2eBaseline(scenario).passed, true);
assert.equal(assertUiE2eBaselinePasses(scenario), true);
assert.equal(createReconnectScenario().sequence.includes('reconnecting'), true);
assert.equal(createStaleRevisionScenario().decisionsDisabledUntilReload, true);
assert.equal(createLongLogsScenario(2100).supportsLatestEvents, true);
assert.equal(evaluateWcagBaseline(scenario.screens).passed, true);
assert.equal(getUiBootstrapModel().uiE2eCoreScreens.includes('audit-settings-maintenance'), true);

const broken = { ...scenario, templates: ['quick-fix'], wcag: { passed: false, violations: [{ screen: 'x' }] } };
const result = evaluateUiE2eBaseline(broken);
assert.equal(result.passed, false);
assert.throws(() => assertUiE2eBaselinePasses(broken), UiE2eBaselineError);
assert.throws(() => createUiE2eBaselineScenario({ templates: ['one'] }), UiE2eBaselineError);

console.log('UI E2E baseline tests OK');
