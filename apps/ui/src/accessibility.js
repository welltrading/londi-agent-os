export const ACCESSIBILITY_BASELINE = Object.freeze({
  landmarks: ['banner', 'navigation', 'main', 'status'],
  skipLinkTarget: 'main-content',
  focusVisible: true,
  keyboardShortcuts: Object.freeze(['Tab', 'Shift+Tab', 'Enter', 'Escape']),
  colorOnlyStatus: false
});

export function createAccessibilityModel(overrides = {}) {
  return Object.freeze({ ...ACCESSIBILITY_BASELINE, ...overrides });
}

export function validateAccessibilityModel(model = ACCESSIBILITY_BASELINE) {
  if (!model.landmarks?.includes('main')) throw new Error('Accessibility baseline requires a main landmark.');
  if (!model.skipLinkTarget) throw new Error('Accessibility baseline requires a skip link target.');
  if (model.colorOnlyStatus !== false) throw new Error('Status must not be color-only.');
  if (!model.keyboardShortcuts?.includes('Tab')) throw new Error('Keyboard navigation baseline requires Tab.');
  return true;
}
