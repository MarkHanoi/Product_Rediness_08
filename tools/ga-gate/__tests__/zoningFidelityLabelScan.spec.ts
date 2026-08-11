/**
 * §FIX-ZONING-GATE-BLIND — behavioural specs for the zoning fidelity-label gate
 * (`tools/ga-gate/check-zoning-fidelity-label.ts`, C58 §6 / ADR-0269 / ADR-0279
 * BLOCKER-1).
 *
 * The gate is a static scrape of the envelope render. Before this file it had NO
 * test of its own, and it shipped two defects that a test would have caught the
 * day it landed:
 *
 *   1. CHECK C sliced from `const reasonLine =` to `panel.innerHTML =` and
 *      harvested arms with /`[^`]*`/g, so it counted an admin BUTTON template and
 *      a backtick inside a COMMENT as "refusal reason arms" and reported "2 of 6
 *      arms render a refusal without `r.code`" against a render where all four
 *      real arms interpolate `${escHtml(r.code)}`. §MIS-SLICE below pins that.
 *
 *   2. It read ONE hardcoded path with no floor. A rename blinded it, and the
 *      blindness surfaced as exit 1 — the same code as a real violation, and so
 *      absorbable by `gate-debt.json`. §SUBJECT-FLOOR below pins the exit-2 split.
 *
 * The keystone is §KEYSTONE-CODELESS-ARM: it strips the refusal code out of the
 * REAL `GISAreaLayout.ts` source in memory and asserts the gate still catches it.
 * If that spec ever passes trivially, the gate is blind and the C58 §1.13
 * "a refusal carries its code" invariant is unenforced.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  tokenize,
  sliceStatement,
  refusalArms,
  parseConfidenceTiers,
  nonAuthoritativeTiers,
  analyze,
  MIN_REFUSAL_ARMS,
  MIN_CONFIDENCE_TIERS,
  MIN_SCANNED_FILES,
  MIN_SUBJECT_FILES,
  REQUIRED_ANCHORS,
  SUBJECT_CONFIRM_MARKER,
  SUBJECT_DISCOVERY_PATTERN,
} from '../check-zoning-fidelity-label.js';

// Vitest transforms this module, so `import.meta.url` is not a file: URL here —
// the repo root is the runner's cwd (matching `writeRouteScan.spec.ts`).
const ROOT = process.cwd().replace(/[\\/]$/, '');
const RENDER_FILE = join(ROOT, 'apps', 'editor', 'src', 'ui', 'layout', 'GISAreaLayout.ts');
const SCHEMA_FILE = join(
  ROOT, 'packages', 'schemas', 'src', 'site', 'zoning', 'ProvenanceFlags.ts',
);
const REL = 'apps/editor/src/ui/layout/GISAreaLayout.ts';

const realSrc = (): string => readFileSync(RENDER_FILE, 'utf8');
const realSchema = (): string => readFileSync(SCHEMA_FILE, 'utf8');

/** Backtick, spelled out so fixtures can be written in ordinary quoted strings. */
const BT = '`';

/**
 * A minimal render carrying every REQUIRED_ANCHOR, so anchor-presence never
 * masks the behaviour a given spec is actually pinning.
 */
function fixture(reasonArms: string[], opts: { badge?: string } = {}): string {
  const badge = opts.badge ?? "hasEstimatedField ? 'Estimated' : String(env.confidence)";
  return [
    'const badge = ' + badge + ';',
    "const heightTxt = '';",
    'const reasonLine = ' + reasonArms.join(' : ') + ';',
    'panel.innerHTML = reasonLine;',
  ].join('\n');
}

/** One HTML arm; `withCode` controls whether it interpolates the refusal code. */
function arm(withCode: boolean, label = 'x'): string {
  const body = withCode ? '${escHtml(r.code)}' : 'no code here';
  return 'cond ? ' + BT + '<div>' + label + ' ' + body + '</div>' + BT;
}

// ── §1 — Tokenizer: comments and strings are not code ────────────────────────

describe('tokenize — a backtick in a comment is not a template literal', () => {
  it('T01 — blanks a line comment, and does not open a template from it', () => {
    const src = 'const a = 1; // asks ' + BT + 'GET /api/session/whoami' + BT + '\nconst b = 2;';
    const tok = tokenize(src);
    expect(tok.templates).toHaveLength(0);
    expect(tok.mask).toContain('const b = 2;');
    expect(tok.mask).not.toContain('whoami');
  });

  it('T02 — blanks a block comment without losing line alignment', () => {
    const src = 'const a = 1;\n/* ' + BT + 'x' + BT + '\n   more */\nconst b = 2;';
    const tok = tokenize(src);
    expect(tok.templates).toHaveLength(0);
    expect(tok.mask.split('\n')).toHaveLength(src.split('\n').length);
  });

  it('T03 — a semicolon inside a single-quoted string is not a statement end', () => {
    const src = "const a = 'x;y';\nconst b = 2;";
    const tok = tokenize(src);
    expect(tok.mask.indexOf(';')).toBe(src.indexOf("';") + 1);
  });

  it('T04 — records the OUTERMOST template only, and swallows nested ones', () => {
    const src = 'const a = ' + BT + '<i>${xs.map((x) => ' + BT + '<b>${x}</b>' + BT + ').join(\'\')}</i>' + BT + ';';
    const tok = tokenize(src);
    expect(tok.templates).toHaveLength(1);
    expect(src.slice(tok.templates[0]!.start, tok.templates[0]!.end)).toContain('<b>');
  });

  it('T05 — a semicolon inside template HTML does not terminate the statement', () => {
    const src = 'const reasonLine = ' + BT + '<div style="a:b;c:d">${r.code}</div>' + BT + ';\nconst next = 1;';
    const stmt = sliceStatement(src, 'const reasonLine =');
    expect(stmt).not.toBeNull();
    expect(stmt!.text.endsWith('</div>' + BT + ';')).toBe(true);
    expect(stmt!.text).not.toContain('const next');
  });
});

// ── §2 — MIS-SLICE: the defect the old gate shipped ──────────────────────────

describe('§MIS-SLICE — the refusal region is the reasonLine STATEMENT, nothing after it', () => {
  it('T06 — a template declared AFTER the statement is not counted as a refusal arm', () => {
    const src =
      'const reasonLine = ' + arm(true, 'a') + ' : ' + BT + '<div>b ${escHtml(r.code)}</div>' + BT + ';\n' +
      '// the admin affordance asks ' + BT + 'GET /api/session/whoami' + BT + '\n' +
      'const manualZoneAffordance = isGap ? ' + BT + '<button>Set zone manually</button>' + BT + " : '';\n" +
      'panel.innerHTML = reasonLine;';
    const found = refusalArms(src);
    expect(found).not.toBeNull();
    expect(found!.arms).toHaveLength(2);
    expect(found!.arms.join('\n')).not.toContain('button');
    expect(found!.arms.every((a) => /r\.code/.test(a))).toBe(true);
  });

  it('T07 — the REAL render yields exactly its four refusal arms, all carrying r.code', () => {
    const found = refusalArms(realSrc());
    expect(found).not.toBeNull();
    expect(found!.arms).toHaveLength(4);
    expect(found!.arms.filter((a) => !/r\.code/.test(a))).toEqual([]);
  });

  it('T08 — the REAL render is clean: no failures, no misconfiguration', () => {
    const out = analyze(realSrc(), realSchema(), REL);
    expect(out.misconfigurations).toEqual([]);
    expect(out.failures).toEqual([]);
  });
});

// ── §3 — KEYSTONE: the gate can still FAIL ───────────────────────────────────

describe('§KEYSTONE-CODELESS-ARM — a refusal without its code is caught (C58 §1.13)', () => {
  it('T09 — stripping r.code from ONE real arm produces exactly one C/ failure', () => {
    const src = realSrc();
    const mutated = src.replace('${escHtml(r.code)}', '${escHtml(r.headline)}');
    expect(mutated).not.toBe(src);

    const out = analyze(mutated, realSchema(), REL);
    expect(out.misconfigurations).toEqual([]);
    expect(out.failures.map((f) => f.check)).toContain('C/refusal-without-code');
    expect(out.failures.find((f) => f.check === 'C/refusal-without-code')!.detail)
      .toContain('1 of 4 refusal reason arm(s)');
  });

  it('T10 — stripping the code from EVERY arm is reported as every arm, not one', () => {
    const mutated = realSrc().split('${escHtml(r.code)}').join('${escHtml(r.headline)}');
    const out = analyze(mutated, realSchema(), REL);
    expect(out.failures.find((f) => f.check === 'C/refusal-without-code')!.detail)
      .toContain('4 of 4 refusal reason arm(s)');
  });

  it('T11 — a synthetic codeless arm among four is caught', () => {
    const src = fixture([arm(true, 'a'), arm(true, 'b'), arm(false, 'c'), arm(true, 'd')]);
    const out = analyze(src, realSchema(), REL);
    expect(out.misconfigurations).toEqual([]);
    expect(out.failures.map((f) => f.check)).toContain('C/refusal-without-code');
  });
});

// ── §4 — SUBJECT FLOOR: blindness is exit 2, never a pass and never exit 1 ───

describe('§SUBJECT-FLOOR — "looked nowhere" is not "found nothing wrong"', () => {
  for (const anchor of REQUIRED_ANCHORS) {
    it(`T12/${anchor} — a missing anchor is a MISCONFIGURATION, not a clean render`, () => {
      const src = realSrc().split(anchor).join(anchor.replace('const ', 'const renamed'). replace('panel.', 'renamedPanel.'));
      const out = analyze(src, realSchema(), REL);
      expect(out.misconfigurations.length).toBeGreaterThan(0);
      expect(out.misconfigurations.join('\n')).toContain(anchor);
      // Crucially: it does NOT report a clean pass.
      expect(out.failures.length + out.misconfigurations.length).toBeGreaterThan(0);
    });
  }

  it('T13 — too few refusal arms is a misconfiguration, not a pass', () => {
    const src = fixture([arm(true, 'a'), arm(true, 'b')]);
    const out = analyze(src, realSchema(), REL);
    expect(out.misconfigurations.join('\n')).toContain('floor is ' + MIN_REFUSAL_ARMS);
    expect(out.failures.map((f) => f.check)).not.toContain('C/refusal-without-code');
  });

  it('T14 — an unparseable confidence enum is a misconfiguration (CHECK B would be vacuous)', () => {
    const out = analyze(realSrc(), '// the enum was refactored away', REL);
    expect(out.misconfigurations.join('\n')).toContain('EnvelopeConfidenceSchema');
    expect(out.failures).toEqual([]);
  });

  it('T15 — the real schema parses at or above the tier floor, and yields a non-empty worklist', () => {
    const tiers = parseConfidenceTiers(realSchema());
    expect(tiers.length).toBeGreaterThanOrEqual(MIN_CONFIDENCE_TIERS);
    expect(nonAuthoritativeTiers(tiers).length).toBeGreaterThan(0);
  });

  it('T16 — the floors are set where a real regression trips them, not at zero', () => {
    expect(MIN_SCANNED_FILES).toBeGreaterThan(0);
    expect(MIN_SUBJECT_FILES).toBeGreaterThanOrEqual(1);
    expect(MIN_REFUSAL_ARMS).toBeGreaterThanOrEqual(1);
  });

  it('T17 — subject discovery is by CONTENT, so a file rename cannot blind the gate', () => {
    const src = realSrc();
    expect(SUBJECT_DISCOVERY_PATTERN.test(src)).toBe(true);
    expect(src).toContain(SUBJECT_CONFIRM_MARKER);
  });
});
