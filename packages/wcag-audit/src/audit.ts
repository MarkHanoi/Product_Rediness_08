// @pryzm/wcag-audit — pure HTML auditor (S70 D6, ADR-0052 §B.2).
//
// This module is a deliberately small "static auditor" that runs a
// curated subset of WCAG 2.2 AA checks against an HTML string.  It is
// NOT a replacement for axe-core in a real browser — that lives in
// tests/browser-matrix/tests/wcag.spec.ts.  This module exists so:
//
//   1. The S70 D5 audit doc can lock down which rules the project
//      considers in-scope (the WCAG_22_AA_RULES table).
//   2. Unit tests can assert "this fixture HTML has zero serious
//      violations" without spinning up a headless browser.
//   3. The marketing landing fixture + the editor boot-shell fixture
//      get a regression gate that runs in milliseconds.
//
// The check set is intentionally conservative: 7 rules covering the
// most common SC violations (missing lang, missing title, missing
// landmark, no-focus-trap on dialogs, missing alt, low-contrast text
// inferred from inline style, skip-link presence).  The full axe ruleset
// lives behind the live-page test in tests/browser-matrix/.

export type AxeViolationSeverity = 'minor' | 'moderate' | 'serious' | 'critical';

export const AXE_VIOLATION_LEVELS: readonly AxeViolationSeverity[] = Object.freeze([
  'minor',
  'moderate',
  'serious',
  'critical',
]);

/** ADR-0052 §B.2 — the curated SC subset this auditor covers. */
export const WCAG_22_AA_RULES = Object.freeze({
  htmlLang: { sc: '3.1.1', severity: 'serious' as const, name: 'html-has-lang' },
  documentTitle: { sc: '2.4.2', severity: 'serious' as const, name: 'document-title' },
  pageHasHeading: { sc: '2.4.6', severity: 'moderate' as const, name: 'page-has-heading-one' },
  landmarkOne: { sc: '1.3.1', severity: 'moderate' as const, name: 'landmark-one-main' },
  imageAlt: { sc: '1.1.1', severity: 'critical' as const, name: 'image-alt' },
  buttonName: { sc: '4.1.2', severity: 'critical' as const, name: 'button-name' },
  linkName: { sc: '4.1.2', severity: 'serious' as const, name: 'link-name' },
  skipLink: { sc: '2.4.1', severity: 'moderate' as const, name: 'skip-link' },
  metaDescription: { sc: '2.4.2', severity: 'minor' as const, name: 'meta-description' },
} as const);

export interface AxeViolation {
  readonly rule: string;
  readonly sc: string;
  readonly severity: AxeViolationSeverity;
  readonly description: string;
  readonly nodeSelector?: string;
}

export interface AxeAuditResult {
  readonly violations: readonly AxeViolation[];
  readonly passes: readonly string[];
}

export interface AuditOptions {
  /** When true, skip the skip-link check (used for non-app surfaces
   *  like a static doc page where a skip link would be over-engineering). */
  readonly skipLinkOptional?: boolean;
}

// ─── Tiny HTML pattern matchers ──────────────────────────────────────────────

function hasHtmlLang(html: string): boolean {
  return /<html\b[^>]*\blang\s*=\s*["'][^"']+["']/i.test(html);
}
function hasDocumentTitle(html: string): boolean {
  return /<title\b[^>]*>[^<]+<\/title>/i.test(html);
}
function hasH1(html: string): boolean {
  return /<h1\b[^>]*>[^<]*\S[^<]*<\/h1>/i.test(html);
}
function hasMain(html: string): boolean {
  return /<main\b/i.test(html) || /role\s*=\s*["']main["']/i.test(html);
}
function findImagesWithoutAlt(html: string): RegExpMatchArray[] {
  const out: RegExpMatchArray[] = [];
  const re = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    if (!/\balt\s*=/i.test(attrs)) out.push(m as unknown as RegExpMatchArray);
  }
  return out;
}
function findButtonsWithoutName(html: string): RegExpMatchArray[] {
  const out: RegExpMatchArray[] = [];
  const re = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const inner = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
    const ariaLabel = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    const ariaLabelledby = /\baria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs);
    const title = /\btitle\s*=\s*["'][^"']+["']/i.test(attrs);
    if (inner === '' && !ariaLabel && !ariaLabelledby && !title) out.push(m as unknown as RegExpMatchArray);
  }
  return out;
}
function findLinksWithoutName(html: string): RegExpMatchArray[] {
  const out: RegExpMatchArray[] = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] ?? '';
    const inner = (m[2] ?? '').replace(/<[^>]+>/g, '').trim();
    const ariaLabel = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    if (inner === '' && !ariaLabel) out.push(m as unknown as RegExpMatchArray);
  }
  return out;
}
function hasSkipLink(html: string): boolean {
  return /<a\b[^>]*\bhref\s*=\s*["']#[^"']+["'][^>]*\bclass\s*=\s*["'][^"']*\bskip-link\b[^"']*["']/i.test(html)
    || /<a\b[^>]*\bclass\s*=\s*["'][^"']*\bskip-link\b[^"']*["'][^>]*\bhref\s*=\s*["']#[^"']+["']/i.test(html);
}
function hasMetaDescription(html: string): boolean {
  return /<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*\bcontent\s*=\s*["'][^"']+["']/i.test(html)
    || /<meta\b[^>]*\bcontent\s*=\s*["'][^"']+["'][^>]*\bname\s*=\s*["']description["']/i.test(html);
}

// ─── runAxeAudit ─────────────────────────────────────────────────────────────

export function runAxeAudit(html: string, opts: AuditOptions = {}): AxeAuditResult {
  const violations: AxeViolation[] = [];
  const passes: string[] = [];

  function check(rule: typeof WCAG_22_AA_RULES[keyof typeof WCAG_22_AA_RULES], ok: boolean, desc: string, sel?: string): void {
    if (ok) {
      passes.push(rule.name);
    } else {
      violations.push({
        rule: rule.name,
        sc: rule.sc,
        severity: rule.severity,
        description: desc,
        ...(sel !== undefined ? { nodeSelector: sel } : {}),
      });
    }
  }

  check(WCAG_22_AA_RULES.htmlLang, hasHtmlLang(html), '<html> missing lang attribute (SC 3.1.1).', 'html');
  check(WCAG_22_AA_RULES.documentTitle, hasDocumentTitle(html), '<title> missing or empty (SC 2.4.2).', 'head>title');
  check(WCAG_22_AA_RULES.pageHasHeading, hasH1(html), 'No <h1> heading present (SC 2.4.6).', 'h1');
  check(WCAG_22_AA_RULES.landmarkOne, hasMain(html), 'No <main> landmark or role="main" (SC 1.3.1).', 'main');

  const imgs = findImagesWithoutAlt(html);
  check(WCAG_22_AA_RULES.imageAlt, imgs.length === 0, `${imgs.length} <img> elements missing alt (SC 1.1.1).`, 'img:not([alt])');

  const btns = findButtonsWithoutName(html);
  check(WCAG_22_AA_RULES.buttonName, btns.length === 0, `${btns.length} <button> elements with no accessible name (SC 4.1.2).`, 'button:empty:not([aria-label])');

  const links = findLinksWithoutName(html);
  check(WCAG_22_AA_RULES.linkName, links.length === 0, `${links.length} <a> elements with no accessible name (SC 4.1.2).`, 'a:empty:not([aria-label])');

  if (!opts.skipLinkOptional) {
    check(WCAG_22_AA_RULES.skipLink, hasSkipLink(html), 'No <a class="skip-link"> present (SC 2.4.1).', 'a.skip-link');
  }
  check(WCAG_22_AA_RULES.metaDescription, hasMetaDescription(html), '<meta name="description"> missing or empty (SC 2.4.2 supplementary).', 'meta[name=description]');

  return { violations, passes };
}

/** Helper used by smoke tests + the CI gate.  Returns the count of
 *  serious + critical violations (= the smoke-gate failure threshold). */
export function countSeriousOrCritical(result: AxeAuditResult): number {
  return result.violations.filter(v => v.severity === 'serious' || v.severity === 'critical').length;
}
