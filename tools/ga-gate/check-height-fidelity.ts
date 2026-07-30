#!/usr/bin/env npx tsx
/**
 * @file tools/ga-gate/check-height-fidelity.ts
 *
 * GA Gate — Building-height fidelity render (L-646 / L-647).
 *
 * The heights analogue of check-zoning-fidelity-label.ts. It binds to the build the
 * §3 invariant of docs/04-reference/BUILDING-HEIGHT-REPLICATION-STANDARD.md:
 *
 *     "a fabricated / non-measured building height is never rendered as authoritative."
 *
 * ── WHAT IT PROTECTS ─────────────────────────────────────────────────────────
 * The 3D-Site near-tier context-building render (apps/editor/src/ui/geospatial/
 * CesiumViewport.ts, §CTX-HEIGHT-FIDELITY-RENDER, L-647) must key the building's
 * appearance off its HEIGHT PROVENANCE (contextBuildings.ts `heightProvenance`),
 * NOT off the height value:
 *   - `heightProvenance === 'tagged'` (a surveyed-ish real height) → SOLID extrude
 *     (`fill: true`) = LOD200 (true boundary + true height).
 *   - anything else (derived-levels / assumed / untagged) → SEE-THROUGH WIREFRAME
 *     (`fill: false`) in the uncertain accent (`FORMA_PALETTE.contextUncertainHeight`).
 * A fabricated `DEFAULT_BUILDING_HEIGHT_M` must therefore never be drawn as a
 * confident opaque solid. If L-647 is reverted to an unconditional `fill: true`
 * near-tier extrude, this gate fails (§CONTEXT-DATA-HONESTY in the render).
 *
 * ── STRATEGY (static, mirrors check-zoning-fidelity-label.ts) ─────────────────
 * Read the render source as text, slice the §CTX-HEIGHT-FIDELITY-RENDER region by
 * stable markers, and assert the provenance-driven branch is intact. No app
 * execution, no THREE, deterministic. Hard-fail = exit 1. Blocker; does not ratchet.
 *
 * Authority: BUILDING-HEIGHT-REPLICATION-STANDARD §3, C62, C58 §1.2, audit L-646/L-647.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/, '$1')
  .replace(/\/$/, '');

const RENDER_FILE = join(ROOT, 'apps/editor/src/ui/geospatial/CesiumViewport.ts');
const HEIGHT_FILE = join(ROOT, 'apps/editor/src/ui/geospatial/contextBuildings.ts');

interface Failure { check: string; detail: string; loc?: string; }
const failures: Failure[] = [];
function fail(check: string, detail: string, loc?: string) { failures.push({ check, detail, loc }); }

function read(path: string): string {
  try { return readFileSync(path, 'utf8'); }
  catch { fail('setup', `Cannot read required file: ${path.replace(ROOT, '')}`); return ''; }
}
function lineOf(src: string, index: number): number {
  return index < 0 ? 0 : src.slice(0, index).split('\n').length;
}
/** Slice from the first `start` to the first `end` after it. */
function region(src: string, start: string, end: string): { text: string; at: number } | null {
  const a = src.indexOf(start);
  if (a === -1) return null;
  const b = src.indexOf(end, a + start.length);
  if (b === -1) return null;
  return { text: src.slice(a, b), at: a };
}

const src = read(RENDER_FILE);
const heightSrc = read(HEIGHT_FILE);
const REL = RENDER_FILE.split(/[\\/]/).join('/').replace(ROOT.split(/[\\/]/).join('/') + '/', '');

if (src && heightSrc) {
  // Locate the L-647 near-tier fidelity render. The §-tag marks the start; the
  // entity `add({` … `})` that follows is the block we assert on. End marker is the
  // push into contextBuildingEntities that immediately follows the add.
  const block = region(src, '§CTX-HEIGHT-FIDELITY-RENDER', 'contextBuildingEntities.push');

  // ── CHECK A — the provenance-driven render block exists ─────────────────────
  if (!block) {
    fail(
      'A/render-region',
      'Could not locate the §CTX-HEIGHT-FIDELITY-RENDER block (L-647) in the near-tier context-building render. ' +
        'The honest-height render was moved or removed.',
      REL,
    );
  } else {
    // ── CHECK B — appearance keyed off PROVENANCE, not the height value ───────
    const drivesOffProvenance = /heightAccurate\s*=\s*[^\n;]*heightProvenance\s*===\s*['"]tagged['"]/.test(block.text);
    if (!drivesOffProvenance) {
      fail(
        'B/not-provenance-driven',
        "The render does not derive `heightAccurate` from `heightProvenance === 'tagged'`. " +
          'Height trustworthiness must be driven by PROVENANCE, never by the height value (a tall derived-levels block must still read as uncertain).',
        `${REL}:${lineOf(src, block.at)}`,
      );
    }

    // ── CHECK C — estimated heights render TRANSLUCENT + a DISTINCT material, never the opaque solid ──
    // Founder 2026-07-30: the estimated treatment is a slightly-darker TRANSLUCENT GREY MASSING (a soft
    // ghost block), not a wireframe. The honesty invariant that survives that visual change: the estimated
    // branch must NOT share the opaque solid material of the measured/tagged branch — it must be a
    // translucent (alpha < 1), visually-distinct fill, so a fabricated/estimated height can never read as
    // authoritative surveyed massing.
    const conditionalMaterial = /material:\s*heightAccurate\s*\?/.test(block.text);
    const estimatedTranslucent = /contextEstimatedHeight\b[\s\S]{0,120}?\.withAlpha\(\s*0?\.\d/.test(src);
    if (!conditionalMaterial || !estimatedTranslucent) {
      fail(
        'C/estimated-not-translucent',
        'The near-tier render must set `material: heightAccurate ? <opaque solid> : <translucent estimated>` so a NON-measured/tagged height draws as a TRANSLUCENT distinct massing, never the opaque solid used for measured/tagged. ' +
          (!conditionalMaterial ? 'Conditional `material: heightAccurate ? …` not found. ' : '') +
          (!estimatedTranslucent ? '`FORMA_PALETTE.contextEstimatedHeight` must be applied at a translucent alpha (`.withAlpha(0.x)`).' : ''),
        `${REL}:${lineOf(src, block.at)}`,
      );
    }

    // ── CHECK D — the estimated branch uses the DISTINCT estimated palette + a conditional outline ──
    const usesEstimatedAccent =
      /FORMA_PALETTE\.contextEstimatedHeight/.test(src) &&
      /outlineColor:\s*heightAccurate\s*\?/.test(block.text);
    if (!usesEstimatedAccent) {
      fail(
        'D/no-estimated-accent',
        'The estimated-height branch must render in the distinct `FORMA_PALETTE.contextEstimatedHeight` grey (a conditional `outlineColor: heightAccurate ? outline : estimatedEdge`), so it reads unambiguously as "estimated" and never as authoritative solid massing.',
        `${REL}:${lineOf(src, block.at)}`,
      );
    }
  }

  // ── CHECK E (fail-closed) — the fabricated default still exists + is provenance-tagged ──
  // If DEFAULT_BUILDING_HEIGHT_M is used, contextBuildings MUST tag it as a non-'tagged'
  // provenance ('assumed'), so the render above can catch it. A default with no provenance
  // flag would slip past the render gate.
  if (/DEFAULT_BUILDING_HEIGHT_M/.test(heightSrc)) {
    const tagsAssumed = /['"]assumed['"]/.test(heightSrc) && /heightProvenance/.test(heightSrc);
    if (!tagsAssumed) {
      fail(
        'E/default-untagged',
        "contextBuildings.ts uses DEFAULT_BUILDING_HEIGHT_M but does not tag it with a non-'tagged' `heightProvenance` ('assumed'). " +
          'An untagged fabricated default would render as authoritative (the render gate keys off provenance).',
        HEIGHT_FILE.split(/[\\/]/).join('/').replace(ROOT.split(/[\\/]/).join('/') + '/', ''),
      );
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length === 0) {
  console.log(
    '[height-fidelity] ✅ PASS — the 3D-Site render is honest about height: `tagged` heights draw SOLID (LOD200), ' +
      'every non-measured height draws as a see-through wireframe in the uncertain accent, and the fabricated default ' +
      'is provenance-tagged so it can never read as authoritative. (BUILDING-HEIGHT-REPLICATION-STANDARD §3 / L-646 / L-647)',
  );
  process.exit(0);
} else {
  console.error(`[height-fidelity] ❌ FAIL — ${failures.length} height-fidelity violation(s):\n`);
  for (const f of failures) {
    console.error(`  [${f.check}] ${f.loc ?? REL}`);
    console.error(`    ${f.detail}\n`);
  }
  console.error('Authority: BUILDING-HEIGHT-REPLICATION-STANDARD §3 / C62 / C58 §1.2 / L-646 / L-647.');
  console.error('Fix the render — do NOT relax this gate.');
  process.exit(1);
}
