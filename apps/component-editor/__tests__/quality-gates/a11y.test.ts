// family-a11y — §13 / §19.7 quality gate (S58 deliverable #5).
//
// Spec source: PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md §19.7
// "Full keyboard nav across every panel (focus rings, skip-links,
// screen-reader live region for solver status)" + §13 gates table
// row `family-a11y` "axe-core scan: zero serious or critical issues
// across every panel".
//
// Scope of this STRUCTURAL gate (S58 starter):
//   • Skip-link is the FIRST focusable element and targets `#main-content`.
//   • The `#main-content` element is programmatically focusable.
//   • A `role=status, aria-live=polite, aria-atomic=true` live region exists.
//   • Every interactive element has a discernible name (text content, aria-label,
//     aria-labelledby, or title).
//   • Every `[role=tab]` has `aria-selected`.
//   • Every named landmark (`<nav>`, `<header>`, `<footer>`, `<main>`,
//     `<section[aria-label]>`) has a non-empty accessible name OR is one of
//     the implicit-name landmarks (`<header>` / `<footer>`).
//   • The view-tab bar exposes `aria-label`.
//
// DEFERRED (recorded in the §S58 closure note in replit.md):
//   • Full axe-core integration — `axe-core` is not yet a workspace
//     devDep (would require `pnpm install` + lockfile churn outside
//     this sprint's surface).  Manually-runnable command after a
//     follow-up `pnpm add -D axe-core --filter @pryzm/component-editor`:
//       cd apps/component-editor && npx vitest run __tests__/quality-gates/a11y --reporter=default
//   • Color-contrast checks (require axe-core or a CSSOM-walker).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mountAppShell, type MountResult } from '../../src/app/AppShell.js';

const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);

describe('family-a11y — §13 / §19.7 quality gate (S58 D5)', () => {
  let host: HTMLElement;
  let handle: MountResult;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    handle = mountAppShell(host);
  });

  afterEach(() => {
    handle.unmount();
    host.remove();
  });

  it('skip-link is present, points at #main-content, and is the first focusable element', () => {
    const skip = host.querySelector<HTMLAnchorElement>('a[data-role="a11y-skip-link"]');
    expect(skip).not.toBeNull();
    expect(skip!.getAttribute('href')).toBe('#main-content');
    // First-focusable: it must be the first <a>/<button>/<input> in DOM order.
    const firstInteractive = host.querySelector(
      'a, button, input, select, textarea',
    );
    expect(firstInteractive).toBe(skip);
  });

  it('main-content target is present and programmatically focusable', () => {
    const main = host.querySelector<HTMLElement>('#main-content');
    expect(main).not.toBeNull();
    expect(main!.getAttribute('tabindex')).toBe('-1');
  });

  it('exposes a polite, atomic, status-role live region', () => {
    const region = host.querySelector<HTMLElement>('[data-role="a11y-live-region"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute('role')).toBe('status');
    expect(region!.getAttribute('aria-live')).toBe('polite');
    expect(region!.getAttribute('aria-atomic')).toBe('true');
  });

  it('view-tab bar has an aria-label and every tab button has aria-selected', () => {
    const bar = host.querySelector<HTMLElement>('nav[data-role="view-tab-bar"]');
    expect(bar).not.toBeNull();
    expect(bar!.getAttribute('aria-label')).toBeTruthy();
    const tabs = bar!.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    expect(tabs.length).toBeGreaterThan(0);
    for (const tab of Array.from(tabs)) {
      expect(tab.getAttribute('aria-selected')).toMatch(/^(true|false)$/);
    }
  });

  it('every interactive element has a discernible accessible name', () => {
    const nameless: string[] = [];
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('*'))) {
      if (!INTERACTIVE_TAGS.has(el.tagName)) continue;
      if (hasDiscernibleName(el)) continue;
      nameless.push(`<${el.tagName.toLowerCase()}${describeElement(el)}>`);
    }
    expect(
      nameless,
      `interactive elements without a discernible name: ${nameless.join(', ') || '(none)'}`,
    ).toEqual([]);
  });

  it('every named landmark has a non-empty accessible name', () => {
    const violators: string[] = [];
    // Sections that opt-in via aria-label MUST have a non-empty value.
    for (const section of Array.from(host.querySelectorAll<HTMLElement>('section[aria-label]'))) {
      const label = section.getAttribute('aria-label') ?? '';
      if (label.trim().length === 0) violators.push(`<section${describeElement(section)}>`);
    }
    for (const nav of Array.from(host.querySelectorAll<HTMLElement>('nav'))) {
      const label = nav.getAttribute('aria-label') ?? '';
      if (label.trim().length === 0) violators.push(`<nav${describeElement(nav)}>`);
    }
    expect(
      violators,
      `landmarks with empty aria-label: ${violators.join(', ') || '(none)'}`,
    ).toEqual([]);
  });

  it('the live region announces a tab switch (status update is keyboard-discoverable)', async () => {
    handle.viewTabStore.setActive('parameters');
    await Promise.resolve();
    const region = host.querySelector<HTMLElement>('[data-role="a11y-live-region"]');
    expect(region!.textContent ?? '').toContain('parameters');
  });
});

function hasDiscernibleName(el: HTMLElement): boolean {
  const text = (el.textContent ?? '').trim();
  if (text.length > 0) return true;
  if ((el.getAttribute('aria-label') ?? '').trim().length > 0) return true;
  if ((el.getAttribute('aria-labelledby') ?? '').trim().length > 0) return true;
  if ((el.getAttribute('title') ?? '').trim().length > 0) return true;
  if (el.tagName === 'INPUT') {
    const type = (el.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') return true;
    const id = el.getAttribute('id');
    if (id && el.ownerDocument?.querySelector(`label[for="${id}"]`)) return true;
  }
  return false;
}

function describeElement(el: HTMLElement): string {
  const role = el.getAttribute('role');
  const dataRole = el.dataset.role;
  const id = el.id;
  const cls = el.className;
  return [
    role ? ` role=${role}` : '',
    dataRole ? ` data-role=${dataRole}` : '',
    id ? ` id=${id}` : '',
    cls ? ` class=${cls}` : '',
  ].join('');
}
