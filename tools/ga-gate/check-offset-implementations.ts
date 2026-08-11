/**
 * @file tools/ga-gate/check-offset-implementations.ts
 *
 * §W2A-ONE-OFFSET (R3) — count INDEPENDENT polygon-offset implementations.
 *
 * ─── Why this gate exists ────────────────────────────────────────────────────
 * The same offset algorithm existed in THREE places at THREE levels of
 * correctness, and the UNTOUCHED copy was the one wired into the shipping
 * committer:
 *
 *   1. `geometry-roof/src/pure/polygonOffset.ts` — a true mitred offset,
 *      written specifically to fix the founder's "overhangs well outside the
 *      building". Correct, and unreachable from the shipping path.
 *   2. `geometry-roof/src/RoofGeometryBuilder._shrinkPolygon` — half-migrated:
 *      the outward offset had been rerouted, the inward one had not.
 *   3. `geometry-kernel/.../_internal/roof/polygon.ts` — `applyOverhang` and
 *      `shrinkPolygon`, verbatim, untouched, and the ones `produceRoof` called.
 *
 * A user asking for a 300 mm eave on a square got 212 mm, because the fix and
 * the shipping code were different files. Fixing a copy the shipping path cannot
 * reach is not a fix, and no test could have told you — each copy passed its own
 * package's tests.
 *
 * COUNTING IS THE POINT. A correctness gate on the surviving implementation
 * cannot catch this class of defect; only a gate on the NUMBER OF THEM can.
 *
 * ─── Baseline and exit target ────────────────────────────────────────────────
 *   BASELINE 0 — MEASURED, not asserted.       EXIT TARGET 0 (already there).
 *
 * ⚠ THE BASELINE IS PINNED AT THE READING, NOT ABOVE IT. The first cut of this
 * gate carried `MAX_IMPLEMENTATIONS = 3` on the strength of the prose list above.
 * Two measurements corrected it and both are worth recording, because a ratchet
 * that sits above its own reading is not a ratchet — it is three free slots:
 *
 *   • PRE-FIX tree (`git show HEAD:` of the three files, scanned with THESE
 *     signatures and THIS exclusion list): **4**, not 3 —
 *         geometry-kernel/.../roof/polygon.ts   × centroid-radial-dilation
 *         geometry-kernel/.../roof/polygon.ts   × edge-shift-miter
 *         geometry-roof/src/RoofGeometryBuilder.ts × edge-shift-miter
 *         geometry-roof/src/pure/polygonOffset.ts  × edge-shift-miter
 *     The prose "3" counted CLONES OF the then-canonical module and so silently
 *     excluded a file this gate's own predicate does count. Off-by-one in the
 *     direction of leniency: exactly the drift the gate exists to stop.
 *   • POST-FIX tree: **0**. Every clone is deleted and `geometry-roof/src/pure/
 *     polygonOffset.ts` is a re-export with no arithmetic in it.
 *
 * SHRINK-ONLY. Do not raise it. If you need behaviour the surviving module does
 * not have, extend that module and add a fixture — that is cheaper than the
 * four-way divergence this gate is here to prevent.
 *
 * ─── What counts as an implementation ────────────────────────────────────────
 * Not "a function with 'offset' in the name" — that would count call sites and
 * re-exports. An offset implementation is recognised by its STRUCTURE: it builds
 * per-edge shifted supporting lines and intersects consecutive ones, or it
 * displaces vertices radially from a centroid and calls the result an offset.
 * Both signatures are matched below, and each is anchored on a line of arithmetic
 * that a caller or a re-export cannot contain.
 *
 * DELIBERATELY NOT COUNTED: the canonical module itself
 * (`geometry-kernel/src/pure/polygonOffset.ts`), which is the ONE that is
 * allowed to exist; and `site-parcel-data/src/geometry/insetPolygon.ts`, which is
 * a capsule-union EROSION with per-edge distances re-tested against an
 * independently-derived predicate — a different construction solving a different
 * problem (see its header), not a clone of this one.
 *
 * ─── Honesty floor ───────────────────────────────────────────────────────────
 * Uses `scanFiles`'s REQUIRED `minFiles` floor (exit 2, not 0) so this gate can
 * never pass by looking nowhere. See `lib/sourceScan.ts`.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { scanFiles, type Match } from './lib/sourceScan.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

/** SHRINK-ONLY, pinned at the MEASURED post-fix reading. Exit target 0 — met. */
const MAX_IMPLEMENTATIONS = 0;

/** The one module that is ALLOWED to contain an offset implementation. */
const CANONICAL = 'packages/geometry-kernel/src/pure/polygonOffset.ts';

/**
 * A DIFFERENT construction for a DIFFERENT problem — a capsule-union erosion
 * with per-edge setbacks, whose output is re-tested against an independently
 * derived predicate. Excluded deliberately and by name, so that the exclusion is
 * a decision on the record rather than a pattern that quietly fails to match.
 */
const NOT_A_CLONE = [
    'packages/site-parcel-data/src/geometry/insetPolygon.ts',
];

const DIRS = ['packages', 'plugins', 'apps', 'src'] as const;

/**
 * Structural signatures. Each must be a line of ARITHMETIC that only an
 * implementation can contain — never a call site, never a re-export.
 */
const SIGNATURES: ReadonlyArray<{ readonly id: string; readonly pattern: RegExp; readonly what: string }> = [
    {
        id: 'edge-shift-miter',
        // The determinant of two shifted supporting lines, then the Cramer solve.
        // This is the parallel-offset construction.
        pattern: /\b\w+\.a\s*\*\s*\w+\.b\s*-\s*\w+\.a\s*\*\s*\w+\.b\b|\b\w+\.nx\s*\*\s*\w+\.nz\s*-\s*\w+\.nx\s*\*\s*\w+\.nz\b/,
        what: 'intersects consecutive edge-shifted supporting lines (a parallel/mitred offset)',
    },
    {
        id: 'centroid-radial-dilation',
        // A vertex displaced along its own centroid ray by d — a SCALE sold as an
        // offset. This is the exact shape of the defect that shipped.
        pattern: /\(\s*d[xz]?\s*\/\s*len\s*\)\s*\*\s*d\b|\bd[xz]\s*\/\s*len\s*\*\s*d\b/,
        what: 'displaces vertices radially from a centroid (a SCALE, not an offset)',
    },
];

let allMatches: Match[] = [];
let scanned = 0;

for (const sig of SIGNATURES) {
    const r = scanFiles({
        root: ROOT,
        dirs: DIRS,
        pattern: sig.pattern,
        // Floor: the four trees hold thousands of .ts files. 500 is far below the
        // real count and far above anything a broken root resolution would reach.
        minFiles: 500,
        label: `check-offset-implementations:${sig.id}`,
        exclude: (rel) =>
            rel === CANONICAL ||
            NOT_A_CLONE.includes(rel) ||
            /(^|\/)__tests__\//.test(rel) ||
            /\.(test|spec|bench)\.tsx?$/.test(rel),
    });
    scanned = Math.max(scanned, r.filesScanned);
    allMatches = allMatches.concat(r.matches.map((m) => ({ ...m, groups: [sig.id, sig.what] })));
}

// COUNTING UNIT = (file × signature), not lines and not files.
//
// Not lines: one algorithm spans several arithmetic lines, so a line count would
// make the number meaningless and would move when someone reformats.
//
// Not files either: the pre-fix `geometry-kernel/.../roof/polygon.ts` held TWO
// independent algorithms — `applyOverhang` (centroid dilation) and
// `shrinkPolygon` (edge-shift) — and calling that "one implementation" because
// they shared a file would have understated exactly the divergence this gate
// measures. Under this unit the PRE-FIX tree measures 4 and the post-fix tree
// measures 0 — see the baseline block in the header for both readings.
const byImpl = new Map<string, Match[]>();
for (const m of allMatches) {
    const key = `${m.file}::${m.groups[0]}`;
    const list = byImpl.get(key) ?? [];
    list.push(m);
    byImpl.set(key, list);
}

const files = [...byImpl.keys()].sort();

console.log(
    `\n[check-offset-implementations] scanned ${scanned} file(s) across ${DIRS.join(', ')}\n` +
    `  canonical (excluded): ${CANONICAL}\n` +
    `  different construction (excluded): ${NOT_A_CLONE.join(', ')}\n`,
);

for (const f of files) {
    const ms = byImpl.get(f)!;
    const kinds = [...new Set(ms.map((m) => m.groups[1]))];
    console.log(`  ${f}  (${ms.length} line(s))`);
    for (const k of kinds) console.log(`      ↳ ${k}`);
}

if (files.length > MAX_IMPLEMENTATIONS) {
    console.error(
        `\n[check-offset-implementations] FAIL — ${files.length} independent polygon-offset ` +
        `implementation(s) outside the canonical module; baseline ${MAX_IMPLEMENTATIONS}, exit target 1.\n` +
        `This ratchet may only SHRINK. The reason it exists: the correct offset and the offset the\n` +
        `shipping committer actually called were DIFFERENT FILES, so the fix for the founder's\n` +
        `"overhangs well outside the building" never reached a single user, and every copy passed its\n` +
        `own package's tests. Extend ${CANONICAL} and add a fixture — do not add a fourth copy and do\n` +
        `not raise this number.`,
    );
    process.exit(1);
}

console.log(
    `\n[check-offset-implementations] ✓ ${files.length}/${MAX_IMPLEMENTATIONS} implementation(s) ` +
    `outside ${CANONICAL} (exit target 0 — met; pre-fix reading was 4).`,
);
