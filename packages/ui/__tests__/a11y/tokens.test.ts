// S70 D7 — A11y tokens contrast + injection tests per ADR-0052 §B.2.
//
// Locks WCAG SC 1.4.11 (non-text contrast ≥ 3:1) for the focus ring
// against both the light + dark editor backgrounds, and verifies the
// stylesheet injector is idempotent.

import { describe, it, expect } from 'vitest';
import {
  A11Y_STYLESHEET,
  EDITOR_BG_DARK_RGB,
  EDITOR_BG_LIGHT_RGB,
  FOCUS_RING_COLOR,
  FOCUS_RING_RGB,
  FOCUS_RING_WIDTH_PX,
  SKIP_LINK_TARGET_ID,
  contrastRatio,
  injectA11yStylesheet,
  relativeLuminance,
} from '../../src/a11y/index.js';

describe('@pryzm/ui — a11y tokens (S70 D7)', () => {
  it('focus-ring colour matches the documented #3a7bd5 hex', () => {
    expect(FOCUS_RING_COLOR.toLowerCase()).toBe('#3a7bd5');
    expect(FOCUS_RING_RGB).toEqual([0x3a, 0x7b, 0xd5]);
    expect(FOCUS_RING_WIDTH_PX).toBe(2);
  });

  it('relativeLuminance handles black + white edges', () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 4);
  });

  it('contrastRatio focus-ring vs LIGHT bg ≥ 3:1 (WCAG SC 1.4.11)', () => {
    const r = contrastRatio(FOCUS_RING_RGB, EDITOR_BG_LIGHT_RGB);
    expect(r).toBeGreaterThanOrEqual(3);
  });

  it('contrastRatio focus-ring vs DARK bg ≥ 3:1 (WCAG SC 1.4.11)', () => {
    const r = contrastRatio(FOCUS_RING_RGB, EDITOR_BG_DARK_RGB);
    expect(r).toBeGreaterThanOrEqual(3);
  });

  it('contrastRatio is symmetric', () => {
    expect(contrastRatio(FOCUS_RING_RGB, EDITOR_BG_LIGHT_RGB))
      .toBeCloseTo(contrastRatio(EDITOR_BG_LIGHT_RGB, FOCUS_RING_RGB), 6);
  });

  it('SKIP_LINK_TARGET_ID is "main" — matches index.html landmark id', () => {
    expect(SKIP_LINK_TARGET_ID).toBe('main');
  });

  it('A11Y_STYLESHEET contains :focus-visible + .skip-link + .sr-only', () => {
    expect(A11Y_STYLESHEET).toMatch(/:focus-visible/);
    expect(A11Y_STYLESHEET).toMatch(/\.skip-link/);
    expect(A11Y_STYLESHEET).toMatch(/\.sr-only/);
    expect(A11Y_STYLESHEET).toContain(FOCUS_RING_COLOR);
  });

  it('injectA11yStylesheet is idempotent', () => {
    const a = injectA11yStylesheet(document);
    const b = injectA11yStylesheet(document);
    expect(a).toBe(b);
    expect(document.querySelectorAll('#pryzm-a11y-tokens').length).toBe(1);
    expect(a.tagName).toBe('STYLE');
    expect(a.textContent).toContain('.skip-link');
  });
});
