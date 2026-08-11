#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-zoning-fidelity-label.ts
 *
 * GA Gate — Zoning fidelity-label (ADR-0279 BLOCKER-1).
 *
 * Mandated by C58 §6 ("check-zoning-confidence-label", non-negotiable / merge-
 * blocking) + ADR-0269. Until this gate existed, the guarantee that
 *
 *     "an estimated zoning value is never rendered as authoritative"
 *
 * rode on convention, not CI. This gate binds it to the build.
 *
 * ── WHAT IT PROTECTS ─────────────────────────────────────────────────────────
 * The envelope/zoning render (apps/editor/src/ui/layout/GISAreaLayout.ts) turns
 * a `BuildableEnvelope` — a numeric determination carrying an
 * `EnvelopeConfidence` (packages/schemas/src/site/zoning/ProvenanceFlags.ts) and
 * per-field `FieldProvenance` — into a card. The honesty invariants (C58 §1.2 /
 * §1.6 / §5.4a, L-630) are:
 *
 *   A. A field-level estimate FORCES an "Estimated" headline, even when the
 *      scalar `env.confidence` claims `structured` / `block-constructed`
 *      (C58 §5.4a — the header may never read stronger than its weakest row).
 *   B. Every NON-authoritative confidence tier
 *      (`estimated-ruleset`, `pipeline-extracted-unverified`, …) must have its
 *      OWN badge branch. It must NOT be able to fall through to the generic
 *      certificate-styled (green) fallback that renders a raw `${env.confidence}`
 *      pill — that is exactly "a low-confidence value styled as authoritative".
 *   C. A refusal card (status `not-applicable` / `none` + `env.refusal`) must
 *      render its refusal CODE in every reason arm — a refusal without its code
 *      is an unattributable "no" (C58 §1.13, L-550/L-574).
 *   D. A numeric envelope value in the "Why these numbers?" table must carry a
 *      per-field provenance badge (PUB / EST) next to it — no bare number
 *      (C58 §1.4 explain-why).
 *
 * ── STRATEGY (static, mirrors check-ctrl-z-wired.ts / check-xss-guards.ts) ────
 * Read the render source as text, slice the badge / reasonLine / why-block
 * regions by stable statement markers, and assert the invariants above. The
 * non-authoritative confidence set is PARSED from the `EnvelopeConfidenceSchema`
 * enum so a newly-added low-confidence tier automatically demands a badge branch
 * (fail-closed). No app execution, no THREE, deterministic.
 *
 * ── §FIX-ZONING-GATE-BLIND (this pass) ───────────────────────────────────────
 * Two defects in the gate itself, both of the §CONTEXT-DATA-HONESTY family
 * ("failure and emptiness are never the same value"), applied to CI:
 *
 * 1. **CHECK C SLICED TOO MUCH AND MISREPORTED THE RENDER.** The refusal region
 *    ran from `const reasonLine =` all the way to `panel.innerHTML =`, and the
 *    arms were harvested with a naive /`[^`]*`/g. That swept in everything
 *    DECLARED BETWEEN those two statements: the `manualZoneAffordance` admin
 *    button template and a backtick-quoted `GET /api/session/whoami` inside a
 *    COMMENT. Neither is a refusal reason arm, and neither can carry `r.code`.
 *    The gate reported "2 of 6 refusal reason arm(s) render a refusal WITHOUT
 *    interpolating `r.code`" against a render in which ALL FOUR real arms
 *    interpolate `${escHtml(r.code)}`. A false accusation is not a safe error:
 *    the only way to "fix" it is to put a refusal code on a button, i.e. to
 *    damage an honest render to satisfy a mis-slice — and, worse, while the gate
 *    sat on `gate-debt.json` for a violation that did not exist, a REAL codeless
 *    arm added next door would have been invisible inside the same count.
 *
 *    The fix is a template-literal-aware tokenizer (`tokenize`) that blanks
 *    comments and string bodies, so the region is the `const reasonLine = …;`
 *    STATEMENT (terminated at its own semicolon, not at a later statement) and
 *    the arms are its real outermost template literals. Nothing about the
 *    invariant is relaxed: every arm of that statement must still carry
 *    `r.code`, and the negative test in `__tests__/zoningFidelityLabelScan.spec.ts`
 *    proves a codeless arm is still caught.
 *
 * 2. **THE GATE HAD NO SUBJECT FLOOR.** It read ONE hardcoded path. Rename
 *    `GISAreaLayout.ts`, or move the render, and `readFileSync` throws → the old
 *    code recorded a `setup` failure and exited 1, indistinguishable from a real
 *    fidelity violation and therefore absorbable by the debt ledger. A rename of
 *    the badge ladder or the reasonLine statement was worse still: the region
 *    lookups returned null and the gate exited 1 with "the render moved", again
 *    exit 1. "Looked nowhere" and "found nothing wrong" must not be the same
 *    observable state.
 *
 *    So the subject is now DISCOVERED BY CONTENT, not by path: `scanFiles()`
 *    (tools/ga-gate/lib/sourceScan.ts) walks `apps/editor/src` with its own
 *    `minFiles` honesty floor (exit 2 if the walk reads too few files) and finds
 *    every file that declares a `reasonLine` AND touches `env.refusal`. On top of
 *    that: MIN_SUBJECT_FILES, the required-anchor set, MIN_REFUSAL_ARMS and
 *    MIN_CONFIDENCE_TIERS. Any of them breached is a MISCONFIGURATION and exits
 *    **2**, never 0 and never 1.
 *
 * ── EXIT CODES ───────────────────────────────────────────────────────────────
 *   0 — the render is honest.
 *   1 — CHECK FAILED. A real fidelity violation. Absorbable as declared debt.
 *   2 — MISCONFIGURED. The gate could not see its subject, or saw implausibly
 *       little of it. NEVER excusable, NEVER a pass, and deliberately not 1 so
 *       that `gate-debt.json` cannot silently absorb a blind gate.
 *
 * Authority: C58 §6, C58 §1.13, ADR-0269, ADR-0279 BLOCKER-1.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanFiles } from './lib/sourceScan.js';

const ROOT = new URL('../..', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/\/$/, '');

/** Where the envelope render lives. Searched by CONTENT — see SUBJECT_* below. */
export const SUBJECT_DIRS = ['apps/editor/src'] as const;
const SCHEMA_FILE = join(ROOT, 'packages/schemas/src/site/zoning/ProvenanceFlags.ts');

// ── Honesty floors (the §FIX-GATE-NEEDS-RIPGREP / MIN_FILES idiom) ───────────
/**
 * Minimum source files the walk must READ. `apps/editor/src` holds ~1040 .ts
 * files today; 300 catches a broken root or a bad dir list without tripping on
 * ordinary file movement. Enforced by `scanFiles`, which exits 2 below it.
 */
export const MIN_SCANNED_FILES = 300;
/** The envelope refusal render must be found. Zero subjects = blind gate. */
export const MIN_SUBJECT_FILES = 1;
/**
 * The refusal `reasonLine` ternary has four arms today (transient / absent /
 * gap / legal). A slice that yields fewer than four has lost arms to a moved
 * marker — that is a mis-slice, not a clean render.
 */
export const MIN_REFUSAL_ARMS = 4;
/**
 * `EnvelopeConfidenceSchema` has five members today. Fewer than three parsed
 * means the enum regex stopped matching, not that the tiers were deleted.
 */
export const MIN_CONFIDENCE_TIERS = 3;

/** Content markers that identify the envelope-refusal render, whatever its path. */
export const SUBJECT_DISCOVERY_PATTERN = /const\s+reasonLine\s*=/;
export const SUBJECT_CONFIRM_MARKER = 'env.refusal';
/**
 * Statements the checks slice on. If ANY is missing the render was restructured
 * and this gate can no longer see what it polices → exit 2, not a pass.
 */
export const REQUIRED_ANCHORS = ['const badge =', 'const reasonLine =', 'panel.innerHTML ='] as const;

// Confidence tiers that DESCRIBE A NUMERIC ENVELOPE and are AUTHORITATIVE-grade
// (certificate / real / constructed). These may wear the plain green pill.
const AUTHORITATIVE = new Set(['authoritative', 'structured', 'block-constructed']);
// `not-determined` is the REFUSAL path — it carries no numeric envelope, so it is
// handled by Check C (refusal-code), not the numeric badge ladder.
const REFUSAL_TIERS = new Set(['not-determined']);

export interface Failure {
  check: string;
  detail: string;
  loc?: string;
}

/**
 * The two OUTCOMES are kept apart all the way to the exit code. A misconfiguration
 * is not a violation with a different message; it is a statement that the gate did
 * not evaluate the invariant at all.
 */
export interface Analysis {
  readonly failures: Failure[];
  readonly misconfigurations: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokenizer — comment- and string-aware, template-literal-aware.
// ─────────────────────────────────────────────────────────────────────────────
export interface TemplateSpan {
  /** Index of the opening backtick. */
  readonly start: number;
  /** Index one past the closing backtick. */
  readonly end: number;
}

export interface Tokenized {
  /**
   * `src` with every comment body, string body and template body blanked to
   * spaces (newlines preserved, so indices and line numbers still line up).
   * Structural code — declarations, `?`/`:`, `;` — survives. Searching THIS is
   * how a marker or a statement terminator is found without a backtick inside a
   * comment or a `;` inside an HTML string ending the statement early.
   */
  readonly mask: string;
  /** OUTERMOST template literals only, in source order. */
  readonly templates: TemplateSpan[];
}

export function tokenize(src: string): Tokenized {
  const mask = src.split('');
  const templates: TemplateSpan[] = [];
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < src.length; k++) if (mask[k] !== '\n') mask[k] = ' ';
  };

  /** Open template starts, outermost first. */
  const tmplStack: number[] = [];
  /** Per open template: `${`/`{` nesting depth. 0 ⇒ we are in template TEXT. */
  const braceDepth: number[] = [];

  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const d = src[i + 1];

    // Inside template TEXT (not inside one of its `${ … }` holes).
    if (tmplStack.length > 0 && braceDepth[braceDepth.length - 1] === 0) {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '`') {
        const start = tmplStack.pop()!;
        braceDepth.pop();
        blank(start, i + 1);
        if (tmplStack.length === 0) templates.push({ start, end: i + 1 });
        i++;
        continue;
      }
      if (c === '$' && d === '{') { braceDepth[braceDepth.length - 1]!++; i += 2; continue; }
      i++;
      continue;
    }

    // Code (possibly inside a `${ … }` hole of an open template).
    if (c === '/' && d === '/') {
      let e = i;
      while (e < n && src[e] !== '\n') e++;
      blank(i, e);
      i = e;
      continue;
    }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const stop = e === -1 ? n : e + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === "'" || c === '"') {
      let e = i + 1;
      while (e < n) {
        if (src[e] === '\\') { e += 2; continue; }
        if (src[e] === c || src[e] === '\n') { e++; break; }
        e++;
      }
      blank(i, e);
      i = e;
      continue;
    }
    if (c === '`') { tmplStack.push(i); braceDepth.push(0); i++; continue; }
    if (c === '{') { if (braceDepth.length > 0) braceDepth[braceDepth.length - 1]!++; i++; continue; }
    if (c === '}') {
      if (braceDepth.length > 0 && braceDepth[braceDepth.length - 1]! > 0) braceDepth[braceDepth.length - 1]!--;
      i++;
      continue;
    }
    i++;
  }
  // An UNTERMINATED template is a parse failure, not "no templates": blank what
  // is left so a stray backtick cannot make the rest of the file look like code.
  while (tmplStack.length > 0) blank(tmplStack.pop()!, n);
  return { mask: mask.join(''), templates };
}

/** Line number (1-based) of an index. */
export function lineOf(src: string, index: number): number {
  if (index < 0) return 0;
  return src.slice(0, index).split('\n').length;
}

/**
 * Slice the ONE statement that begins at `marker`, ending at ITS OWN terminating
 * `;` — a semicolon in real code, never one inside a comment, a string or an HTML
 * template body. This is what stops the refusal region running on into whatever
 * happens to be declared next.
 */
export function sliceStatement(
  src: string,
  marker: string,
  tok: Tokenized = tokenize(src),
): { text: string; at: number; end: number } | null {
  const a = tok.mask.indexOf(marker);
  if (a === -1) return null;
  const semi = tok.mask.indexOf(';', a + marker.length);
  if (semi === -1) return null;
  return { text: src.slice(a, semi + 1), at: a, end: semi + 1 };
}

/** Slice from the first occurrence of `start` to the first `end` after it. */
export function region(
  src: string,
  start: string,
  end: string,
  tok: Tokenized = tokenize(src),
): { text: string; at: number } | null {
  const a = tok.mask.indexOf(start);
  if (a === -1) return null;
  const b = tok.mask.indexOf(end, a + start.length);
  if (b === -1) return null;
  return { text: src.slice(a, b), at: a };
}

/**
 * The refusal reason arms: the outermost template literals of the
 * `const reasonLine = …;` statement, and nothing else. Returns null when the
 * statement cannot be located — the caller MUST treat that as misconfiguration.
 */
export function refusalArms(
  src: string,
  tok: Tokenized = tokenize(src),
): { arms: string[]; at: number } | null {
  const stmt = sliceStatement(src, 'const reasonLine =', tok);
  if (!stmt) return null;
  const arms = tok.templates
    .filter((t) => t.start >= stmt.at && t.end <= stmt.end)
    .map((t) => src.slice(t.start, t.end));
  return { arms, at: stmt.at };
}

// ── Parse the non-authoritative confidence tiers from the schema enum ─────────
export function parseConfidenceTiers(schemaSrc: string): string[] {
  const m = schemaSrc.match(/EnvelopeConfidenceSchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/);
  if (!m) return [];
  return [...m[1]!.matchAll(/['"]([a-z-]+)['"]/g)].map((x) => x[1]!);
}

export function nonAuthoritativeTiers(tiers: readonly string[]): string[] {
  return tiers.filter((v) => !AUTHORITATIVE.has(v) && !REFUSAL_TIERS.has(v));
}

// ─────────────────────────────────────────────────────────────────────────────
// The checks. PURE — source text in, outcomes out. No process.exit, no fs.
// ─────────────────────────────────────────────────────────────────────────────
export function analyze(src: string, schemaSrc: string, rel: string): Analysis {
  const failures: Failure[] = [];
  const misconfigurations: string[] = [];
  const fail = (check: string, detail: string, loc?: string): void => {
    failures.push({ check, detail, loc });
  };
  const tok = tokenize(src);

  // ── SUBJECT FLOOR — can this gate still SEE what it polices? ───────────────
  for (const anchor of REQUIRED_ANCHORS) {
    if (!tok.mask.includes(anchor)) {
      misconfigurations.push(
        `${rel}: required anchor \`${anchor}\` is GONE. The envelope render was restructured, so ` +
          `this gate can no longer locate the region it polices. That is a blind gate, not a clean render.`,
      );
    }
  }

  const tiers = parseConfidenceTiers(schemaSrc);
  if (tiers.length < MIN_CONFIDENCE_TIERS) {
    misconfigurations.push(
      `Parsed ${tiers.length} member(s) from EnvelopeConfidenceSchema z.enum([…]) in ` +
        `packages/schemas/src/site/zoning/ProvenanceFlags.ts; floor is ${MIN_CONFIDENCE_TIERS}. ` +
        `CHECK B derives its whole worklist from that enum — an unparsed enum makes it vacuous.`,
    );
  }
  if (misconfigurations.length > 0) return { failures, misconfigurations };

  const nonAuth = nonAuthoritativeTiers(tiers);

  // ─────────────────────────────────────────────────────────────────────────
  // Locate the confidence-badge assignment region.
  // `const badge = …;` … ends where the next statement (`const heightTxt =`)
  // begins. Both markers are stable in GISAreaLayout.ts.
  // ─────────────────────────────────────────────────────────────────────────
  const badge = region(src, 'const badge =', 'const heightTxt', tok);

  // ── CHECK A — field-estimate forces an "Estimated" headline (C58 §5.4a) ────
  if (!badge) {
    misconfigurations.push(
      `${rel}: could not locate the \`const badge =\` … \`const heightTxt\` region — the ` +
        `confidence-badge render moved or was removed. CHECKS A and B did not run.`,
    );
  } else {
    const hasEstimateSeam =
      badge.text.includes('hasEstimatedField') && /Estimated/.test(badge.text);
    if (!hasEstimateSeam) {
      fail(
        'A/estimate-forcing-seam',
        'The badge block does not force an "Estimated" headline on `headline.hasEstimatedField`. ' +
          'A `structured`/`block-constructed` scalar with an estimated field would badge as authoritative (the L-630 seam).',
        `${rel}:${lineOf(src, badge.at)}`,
      );
    }

    // ── CHECK B — no non-authoritative tier may reach the green fallback ─────
    // The generic fallback pill interpolates the raw confidence into a green
    // (certificate) chip: background:#eef7ee / color:#2e7d32 + ${env.confidence}.
    // Every non-authoritative tier MUST be branched out before it.
    const greenFallback =
      /\$\{env\.confidence\}/.test(badge.text) &&
      /#eef7ee/.test(badge.text) &&
      /#2e7d32/.test(badge.text);

    for (const tier of nonAuth) {
      const branched =
        badge.text.includes(`'${tier}'`) || badge.text.includes(`"${tier}"`);
      if (!branched) {
        fail(
          'B/unbadged-nonauthoritative',
          `Confidence tier '${tier}' has NO dedicated badge branch in the badge ladder` +
            (greenFallback
              ? `, so it falls through to the generic green (certificate-styled) \`\${env.confidence}\` pill — rendering a non-authoritative value with the SAME treatment as authoritative/structured/block-constructed. C58 §1.6 requires a distinct, louder-than-estimated affordance and NO certificate styling.`
              : `. Add an explicit low-confidence badge branch for it.`),
          `${rel}:${lineOf(src, badge.at)}`,
        );
      }
    }
  }

  // ── CHECK C — a refusal must render its refusal CODE in every reason arm ───
  // The refusal card builds `const reasonLine = …;` as a chain of ternary arms,
  // each a backtick HTML template. Every arm must interpolate `r.code`.
  const reason = refusalArms(src, tok);
  if (!reason) {
    misconfigurations.push(
      `${rel}: could not slice the \`const reasonLine = …;\` statement. CHECK C — the C58 §1.13 ` +
        `"a refusal carries its code" invariant — did not run.`,
    );
  } else if (reason.arms.length < MIN_REFUSAL_ARMS) {
    misconfigurations.push(
      `${rel}:${lineOf(src, reason.at)}: the reasonLine statement yielded ${reason.arms.length} ` +
        `template arm(s); floor is ${MIN_REFUSAL_ARMS}. Either the refusal ternary lost arms to a ` +
        `moved marker, or the slice is wrong. Both mean CHECK C inspected less than the whole render.`,
    );
  } else {
    const armsMissingCode = reason.arms.filter((arm) => !/r\.code/.test(arm));
    if (armsMissingCode.length > 0) {
      fail(
        'C/refusal-without-code',
        `${armsMissingCode.length} of ${reason.arms.length} refusal reason arm(s) render a refusal WITHOUT interpolating \`r.code\`. ` +
          `A refusal shown without its code is an unattributable "no" (C58 §1.13, L-550/L-574).`,
        `${rel}:${lineOf(src, reason.at)}`,
      );
    }
  }

  // ── CHECK D — a numeric envelope value must carry provenance (PUB/EST) ──────
  // In the "Why these numbers?" table, `const prov = r.isEstimate ? EST : PUB`
  // must exist AND be placed next to the value (`<b>${…valueText…}</b> ${prov}`).
  const provDecl = /const prov\s*=[\s\S]{0,400}?r\.isEstimate[\s\S]{0,400}?(EST|PUB)/.test(src);
  if (!provDecl) {
    fail(
      'D/provenance-badge-missing',
      'The "Why these numbers?" table has no `const prov = r.isEstimate ? …EST… : …PUB…` provenance badge — a numeric row could render without provenance (C58 §1.4).',
      rel,
    );
  }
  const provPlacedNextToValue = /<b>\$\{[^}]*(valueText|value)[^}]*\}<\/b>\s*\$\{prov\}/.test(src);
  if (provDecl && !provPlacedNextToValue) {
    fail(
      'D/provenance-not-adjacent',
      'The per-field provenance badge `${prov}` is not rendered adjacent to the numeric value `<b>${…}</b>` — the value could read as authoritative without its provenance (C58 §1.4).',
      rel,
    );
  }

  return { failures, misconfigurations };
}

// ─────────────────────────────────────────────────────────────────────────────
// Subject discovery — by CONTENT, so a rename cannot blind the gate.
// ─────────────────────────────────────────────────────────────────────────────
export interface Subject {
  /** Repo-relative, forward-slashed. */
  readonly rel: string;
  readonly abs: string;
  readonly src: string;
}

/**
 * Files that declare a `reasonLine` AND touch `env.refusal` — i.e. the envelope
 * refusal card, wherever it now lives. `scanFiles` enforces MIN_SCANNED_FILES
 * and exits 2 on its own if the walk read too little.
 */
export function findSubjects(root: string): Subject[] {
  const scan = scanFiles({
    root,
    dirs: [...SUBJECT_DIRS],
    pattern: SUBJECT_DISCOVERY_PATTERN,
    minFiles: MIN_SCANNED_FILES,
    label: 'zoning-fidelity-label',
  });
  const seen = new Set<string>();
  const out: Subject[] = [];
  for (const m of scan.matches) {
    if (seen.has(m.file)) continue;
    seen.add(m.file);
    const abs = join(root, ...m.file.split('/'));
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    if (!src.includes(SUBJECT_CONFIRM_MARKER)) continue;
    out.push({ rel: m.file, abs, src });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
function main(): never {
  const subjects = findSubjects(ROOT);

  if (subjects.length < MIN_SUBJECT_FILES) {
    console.error(
      `\n[zoning-fidelity-label] MISCONFIGURED (exit 2) — found ${subjects.length} envelope-refusal ` +
        `render(s); floor is ${MIN_SUBJECT_FILES}.\n` +
        `  Searched: ${SUBJECT_DIRS.join(', ')}\n` +
        `  Looking for: ${SUBJECT_DISCOVERY_PATTERN} AND "${SUBJECT_CONFIRM_MARKER}"\n` +
        `  This is NOT a pass. If the envelope render was renamed or moved, point this gate at it —\n` +
        `  a gate that cannot find its subject has not checked anything (C58 §6 is merge-blocking).`,
    );
    process.exit(2);
  }

  let schemaSrc = '';
  try {
    schemaSrc = readFileSync(SCHEMA_FILE, 'utf8');
  } catch {
    console.error(
      `\n[zoning-fidelity-label] MISCONFIGURED (exit 2) — cannot read the confidence-tier schema:\n` +
        `  ${SCHEMA_FILE}\n` +
        `  CHECK B derives its worklist from EnvelopeConfidenceSchema; without it the gate is vacuous.`,
    );
    process.exit(2);
  }

  const failures: Failure[] = [];
  const misconfigurations: string[] = [];
  for (const s of subjects) {
    const a = analyze(s.src, schemaSrc, s.rel);
    failures.push(...a.failures);
    misconfigurations.push(...a.misconfigurations);
  }

  if (misconfigurations.length > 0) {
    console.error(
      `\n[zoning-fidelity-label] MISCONFIGURED (exit 2) — ${misconfigurations.length} problem(s) ` +
        `reading the subject. The invariant was NOT evaluated:\n`,
    );
    for (const m of misconfigurations) console.error(`  • ${m}\n`);
    console.error(
      'Exit 2, not 1, on purpose: a blind gate is a different fact from a failing check, and\n' +
        'gate-debt.json must not be able to absorb it. Authority: C58 §6 / ADR-0279 BLOCKER-1.',
    );
    process.exit(2);
  }

  if (failures.length === 0) {
    console.log(
      `[zoning-fidelity-label] ✅ PASS — ${subjects.length} envelope render(s) honest: field estimates force "Estimated", ` +
        'every non-authoritative confidence tier has a distinct badge, refusals carry their code, ' +
        'and numeric rows carry PUB/EST provenance. (C58 §6 / ADR-0279 BLOCKER-1)',
    );
    process.exit(0);
  }

  console.error(`[zoning-fidelity-label] ❌ FAIL — ${failures.length} fidelity-label violation(s):\n`);
  for (const f of failures) {
    console.error(`  [${f.check}] ${f.loc ?? subjects[0]!.rel}`);
    console.error(`    ${f.detail}\n`);
  }
  console.error(
    'Authority: C58 §6 ("an estimated zoning value is never rendered as authoritative") / ADR-0269 / ADR-0279 BLOCKER-1.',
  );
  console.error('Fix the render — do NOT relax this gate.');
  process.exit(1);
}

/**
 * Run the CLI only when executed directly (`npx tsx check-zoning-fidelity-label.ts`,
 * including via `run-all.ts`'s spawn). Under vitest the spec IMPORTS this module for
 * the pure functions above, and must not trigger a process.exit.
 */
const entry = process.argv[1] ? resolve(process.argv[1]) : '';
const selfPath = fileURLToPath(import.meta.url);
const samePath = (a: string, b: string): boolean =>
  a.split(sep).join('/').toLowerCase() === b.split(sep).join('/').toLowerCase();
if (entry !== '' && samePath(entry, selfPath)) main();
