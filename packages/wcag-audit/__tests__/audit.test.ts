// S70 D6 — WCAG audit unit tests per ADR-0052 §B.2.
// 9 cases lock the rule coverage + critical-path scaffolding.

import { describe, it, expect } from 'vitest';
import { runAxeAudit, countSeriousOrCritical, WCAG_22_AA_RULES } from '../src/audit.js';
import { CRITICAL_PATHS } from '../src/critical-paths.js';

const MINIMAL_GOOD_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>PRYZM</title>
  <meta name="description" content="PRYZM 2 — BIM authoring platform.">
</head>
<body>
  <a href="#main" class="skip-link">Skip to main content</a>
  <main id="main">
    <h1>Welcome</h1>
    <button type="button">OK</button>
    <a href="https://pryzm.app/docs">Docs</a>
  </main>
</body>
</html>
`;

describe('@pryzm/wcag-audit — runAxeAudit', () => {
  it('clean fixture has zero violations', () => {
    const r = runAxeAudit(MINIMAL_GOOD_HTML);
    expect(r.violations).toEqual([]);
    expect(r.passes.length).toBeGreaterThan(0);
    expect(countSeriousOrCritical(r)).toBe(0);
  });

  it('flags missing html lang as serious', () => {
    const html = MINIMAL_GOOD_HTML.replace('<html lang="en">', '<html>');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.htmlLang.name && v.severity === 'serious')).toBe(true);
  });

  it('flags missing <title> as serious', () => {
    const html = MINIMAL_GOOD_HTML.replace(/<title>[^<]+<\/title>/, '');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.documentTitle.name)).toBe(true);
  });

  it('flags missing <h1> as moderate', () => {
    const html = MINIMAL_GOOD_HTML.replace(/<h1>[^<]+<\/h1>/, '');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.pageHasHeading.name && v.severity === 'moderate')).toBe(true);
  });

  it('flags missing <main> as moderate', () => {
    const html = MINIMAL_GOOD_HTML.replace('<main id="main">', '<div>').replace('</main>', '</div>');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.landmarkOne.name)).toBe(true);
  });

  it('flags <img> without alt as critical', () => {
    const html = MINIMAL_GOOD_HTML.replace('<h1>Welcome</h1>', '<h1>Welcome</h1><img src="logo.png">');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.imageAlt.name && v.severity === 'critical')).toBe(true);
    expect(countSeriousOrCritical(r)).toBeGreaterThan(0);
  });

  it('flags empty <button> as critical (button-name)', () => {
    const html = MINIMAL_GOOD_HTML.replace('<button type="button">OK</button>', '<button type="button"></button>');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.buttonName.name)).toBe(true);
  });

  it('accepts aria-label on otherwise-empty button', () => {
    const html = MINIMAL_GOOD_HTML.replace('<button type="button">OK</button>', '<button type="button" aria-label="Save"></button>');
    const r = runAxeAudit(html);
    expect(r.violations.some(v => v.rule === WCAG_22_AA_RULES.buttonName.name)).toBe(false);
  });

  it('skipLinkOptional suppresses skip-link check', () => {
    const html = MINIMAL_GOOD_HTML.replace(/<a href="#main" class="skip-link">[^<]+<\/a>/, '');
    const withCheck = runAxeAudit(html);
    expect(withCheck.violations.some(v => v.rule === WCAG_22_AA_RULES.skipLink.name)).toBe(true);
    const without = runAxeAudit(html, { skipLinkOptional: true });
    expect(without.violations.some(v => v.rule === WCAG_22_AA_RULES.skipLink.name)).toBe(false);
  });
});

describe('@pryzm/wcag-audit — CRITICAL_PATHS shape', () => {
  it('declares the 4 paths from PHASE-3D §S70 row #5', () => {
    expect(CRITICAL_PATHS.map(p => p.id)).toEqual(['project-hub', 'editor', 'inspector', 'sheet-view']);
    for (const p of CRITICAL_PATHS) {
      expect(p.requiredSelectors.length).toBeGreaterThan(0);
      expect(p.auditableSince).toMatch(/^S\d+/);
    }
  });

  it('marks inspector + sheet-view as deferred to S71', () => {
    const inspector = CRITICAL_PATHS.find(p => p.id === 'inspector')!;
    const sheet = CRITICAL_PATHS.find(p => p.id === 'sheet-view')!;
    expect(inspector.auditableSince).toBe('S71');
    expect(sheet.auditableSince).toBe('S71');
    expect(inspector.deferralNote).toMatch(/stub-only/);
    expect(sheet.deferralNote).toMatch(/stub-only/);
  });
});
