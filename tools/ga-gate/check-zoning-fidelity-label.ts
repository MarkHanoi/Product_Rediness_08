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
 * Hard-fail = exit 1 on ANY violation. This is a blocker; it does not ratchet.
 *
 * Authority: C58 §6, ADR-0269, ADR-0279 BLOCKER-1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/\/$/, '');

const RENDER_FILE = join(ROOT, 'apps/editor/src/ui/layout/GISAreaLayout.ts');
const SCHEMA_FILE = join(ROOT, 'packages/schemas/src/site/zoning/ProvenanceFlags.ts');

// Confidence tiers that DESCRIBE A NUMERIC ENVELOPE and are AUTHORITATIVE-grade
// (certificate / real / constructed). These may wear the plain green pill.
const AUTHORITATIVE = new Set(['authoritative', 'structured', 'block-constructed']);
// `not-determined` is the REFUSAL path — it carries no numeric envelope, so it is
// handled by Check C (refusal-code), not the numeric badge ladder.
const REFUSAL_TIERS = new Set(['not-determined']);

interface Failure {
  check: string;
  detail: string;
  loc?: string;
}
const failures: Failure[] = [];
function fail(check: string, detail: string, loc?: string) {
  failures.push({ check, detail, loc });
}

function read(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    fail('setup', `Cannot read required file: ${path.replace(ROOT, '')}`);
    return '';
  }
}

/** Line number (1-based) of the first index in `src`, for file:line reporting. */
function lineOf(src: string, index: number): number {
  if (index < 0) return 0;
  return src.slice(0, index).split('\n').length;
}

/** Slice from the first occurrence of `start` to the first `end` after it. */
function region(src: string, start: string, end: string): { text: string; at: number } | null {
  const a = src.indexOf(start);
  if (a === -1) return null;
  const b = src.indexOf(end, a + start.length);
  if (b === -1) return null;
  return { text: src.slice(a, b), at: a };
}

// ── Parse the non-authoritative confidence tiers from the schema enum ─────────
function parseNonAuthoritativeTiers(schemaSrc: string): string[] {
  const m = schemaSrc.match(/EnvelopeConfidenceSchema\s*=\s*z\.enum\(\[([\s\S]*?)\]\)/);
  if (!m) {
    fail('setup', 'Could not locate EnvelopeConfidenceSchema z.enum([...]) in ProvenanceFlags.ts');
    return [];
  }
  const values = [...m[1].matchAll(/['"]([a-z-]+)['"]/g)].map((x) => x[1]);
  if (values.length === 0) {
    fail('setup', 'EnvelopeConfidenceSchema enum parsed to zero values');
    return [];
  }
  return values.filter((v) => !AUTHORITATIVE.has(v) && !REFUSAL_TIERS.has(v));
}

const src = read(RENDER_FILE);
const schemaSrc = read(SCHEMA_FILE);
// Report paths repo-relative with forward slashes, regardless of OS separator.
const REL = RENDER_FILE.split(/[\\/]/).join('/').replace(ROOT.split(/[\\/]/).join('/') + '/', '');

if (src && schemaSrc) {
  const nonAuthTiers = parseNonAuthoritativeTiers(schemaSrc);

  // ─────────────────────────────────────────────────────────────────────────
  // Locate the confidence-badge assignment region.
  // `const badge = …;` … ends where the next statement (`const heightTxt =`)
  // begins. Both markers are stable in GISAreaLayout.ts.
  // ─────────────────────────────────────────────────────────────────────────
  const badge = region(src, 'const badge =', 'const heightTxt');

  // ── CHECK A — field-estimate forces an "Estimated" headline (C58 §5.4a) ────
  if (!badge) {
    fail(
      'A/badge-region',
      'Could not locate the `const badge =` … `const heightTxt` region — the confidence-badge render moved or was removed.',
    );
  } else {
    const hasEstimateSeam =
      badge.text.includes('hasEstimatedField') && /Estimated/.test(badge.text);
    if (!hasEstimateSeam) {
      fail(
        'A/estimate-forcing-seam',
        'The badge block does not force an "Estimated" headline on `headline.hasEstimatedField`. ' +
          'A `structured`/`block-constructed` scalar with an estimated field would badge as authoritative (the L-630 seam).',
        `${REL}:${lineOf(src, badge.at)}`,
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

    for (const tier of nonAuthTiers) {
      const branched =
        badge.text.includes(`'${tier}'`) || badge.text.includes(`"${tier}"`);
      if (!branched) {
        fail(
          'B/unbadged-nonauthoritative',
          `Confidence tier '${tier}' has NO dedicated badge branch in the badge ladder` +
            (greenFallback
              ? `, so it falls through to the generic green (certificate-styled) \`\${env.confidence}\` pill — rendering a non-authoritative value with the SAME treatment as authoritative/structured/block-constructed. C58 §1.6 requires a distinct, louder-than-estimated affordance and NO certificate styling.`
              : `. Add an explicit low-confidence badge branch for it.`),
          `${REL}:${lineOf(src, badge.at)}`,
        );
      }
    }
  }

  // ── CHECK C — a refusal must render its refusal CODE in every reason arm ───
  // The refusal card builds `const reasonLine = …;` as a chain of ternary arms,
  // each a backtick HTML template. Every arm must interpolate `r.code`.
  const reason = region(src, 'const reasonLine =', 'panel.innerHTML =');
  if (!reason) {
    fail(
      'C/refusal-region',
      'Could not locate the `const reasonLine =` … `panel.innerHTML =` refusal region.',
    );
  } else {
    // Each ternary arm is a backtick-delimited template literal.
    const arms = [...reason.text.matchAll(/`[^`]*`/g)].map((m) => m[0]);
    if (arms.length === 0) {
      fail(
        'C/refusal-arms',
        'The reasonLine assignment contains no HTML template arms to inspect.',
        `${REL}:${lineOf(src, reason.at)}`,
      );
    }
    const armsMissingCode = arms.filter((arm) => !/r\.code/.test(arm));
    if (armsMissingCode.length > 0) {
      fail(
        'C/refusal-without-code',
        `${armsMissingCode.length} of ${arms.length} refusal reason arm(s) render a refusal WITHOUT interpolating \`r.code\`. ` +
          `A refusal shown without its code is an unattributable "no" (C58 §1.13, L-550/L-574).`,
        `${REL}:${lineOf(src, reason.at)}`,
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
      REL,
    );
  }
  const provPlacedNextToValue = /<b>\$\{[^}]*(valueText|value)[^}]*\}<\/b>\s*\$\{prov\}/.test(src);
  if (provDecl && !provPlacedNextToValue) {
    fail(
      'D/provenance-not-adjacent',
      'The per-field provenance badge `${prov}` is not rendered adjacent to the numeric value `<b>${…}</b>` — the value could read as authoritative without its provenance (C58 §1.4).',
      REL,
    );
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(
    '[zoning-fidelity-label] ✅ PASS — envelope render is honest: field estimates force "Estimated", ' +
      'every non-authoritative confidence tier has a distinct badge, refusals carry their code, ' +
      'and numeric rows carry PUB/EST provenance. (C58 §6 / ADR-0279 BLOCKER-1)',
  );
  process.exit(0);
} else {
  console.error(`[zoning-fidelity-label] ❌ FAIL — ${failures.length} fidelity-label violation(s):\n`);
  for (const f of failures) {
    console.error(`  [${f.check}] ${f.loc ?? REL}`);
    console.error(`    ${f.detail}\n`);
  }
  console.error(
    'Authority: C58 §6 ("an estimated zoning value is never rendered as authoritative") / ADR-0269 / ADR-0279 BLOCKER-1.',
  );
  console.error('Fix the render — do NOT relax this gate.');
  process.exit(1);
}
