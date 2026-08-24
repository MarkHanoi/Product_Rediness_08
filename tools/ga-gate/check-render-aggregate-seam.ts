#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-render-aggregate-seam.ts
 *
 * §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530) — C71 §7 (anti-patterns).
 *
 * ─── WHY THIS GATE EXISTS ────────────────────────────────────────────────────
 *
 * `InstancedElementRenderer._createGroup` stamps a SYNTHETIC id on every shared
 * `InstancedMesh` (`InstancedElementRenderer.ts:480`):
 *
 *     group.mesh.userData.id = `instanced-group-${key}`;
 *
 * It is load-bearing for GPU picking and cannot be removed. It is therefore
 * PERMANENTLY mistakable for a BIM element id by anything that traverses the
 * scene reading `userData.id` — and it has been mistaken THREE times in
 * production, by three consumers that never knew about each other:
 *
 *   1. `ProjectIsolationAudit` (§C13-INSTANCED-GROUP-ARM, L-8103) — every
 *      aggregate reported as a foreign element on every load, in every project.
 *   2. `TopologySpatialIndex` (L-10530) — indexed the batch, giving it a union
 *      AABB spanning the whole storey.
 *   3. `TopologyLayer` (L-10530) — made the batch a NODE in the adjacency graph
 *      with real edges to real walls, which is what the founder read in
 *      `bc3aa61b`.
 *
 * Separately, the REJECTION test had been re-rolled by hand as a bare string
 * literal at three more call sites (`SelectionManager` ×2, `ContextualEditBar`).
 * Five hand-written copies of one question is five chances for one to drift —
 * and the two topology harvests show what "drift" means in practice: they simply
 * never got a copy at all.
 *
 * ─── WHAT IS COUNTED ─────────────────────────────────────────────────────────
 *
 * Occurrences of the LITERAL `'instanced-group-'` in production source outside
 * the canonical predicate module and the one minter that produces it.
 *
 * Counting the literal (not the concept) is deliberate and is the right unit
 * here, because the literal IS the defect: a consumer that re-rolls the test
 * writes this string, and a consumer that imports the predicate does not. Unlike
 * `check-predicate-canonical`'s geometric families there is no arithmetic to
 * match structurally — the question "is this id synthetic?" has exactly one
 * spelling.
 *
 *     npx tsx tools/ga-gate/check-render-aggregate-seam.ts
 *
 * ─── THE TWO ARMS ────────────────────────────────────────────────────────────
 *
 * ARM A — HARD-0, no baseline: no production file outside CANONICAL/MINTER may
 * contain the literal. This is the arm that stops a sixth copy.
 *
 * ARM B — a SHRINK-ONLY CENSUS, pinned, and ⚠ **UNVERIFIED except where named**.
 * It reports production files that iterate `scene.children` / `.traverse(` AND
 * read `userData.id` while neither importing the canonical predicate nor testing
 * `userData.isInstancedGroup` — i.e. traversals that inherit render aggregates
 * without ever deciding to. This is the arm that would have caught L-10530, which
 * ARM A could NOT have caught: the two topology harvests contained no magic
 * string to grep for, they contained NO CHECK AT ALL. ⭐ An absence is not
 * greppable as a literal; it is only visible as "harvests ids, does not filter".
 *
 * ⚠ STATED HONESTLY, because a gate that prints unverified findings as breaches
 * is its own defect: the heuristic is BROAD. `.traverse(` plus a `userData.id`
 * read elsewhere in the same file is enough to match, so a file that resolves ONE
 * already-picked object is indistinguishable here from one that harvests a whole
 * collection. The number below is a CENSUS, not a defect count.
 *
 * FOUR members are VERIFIED by reading, and they are why the arm exists:
 *   • `TopologyLayer` / `TopologySpatialIndex` — FIXED by this lane (L-10530).
 *   • `core-app-model/src/drawing/ElementSpatialIndex.ts:18` — `getElementId()`
 *     harvests `userData.id` into `_entriesById` AND falls back to `obj.uuid`, so
 *     it never returns null and every aggregate becomes an indexed "element" with
 *     a storey-spanning AABB. It feeds `ViewRangeFilterService.queryVisible()`,
 *     i.e. plan-view cut-plane visibility — so the fix is NOT a blind filter
 *     (dropping the aggregate could HIDE instanced geometry in plan). Needs its
 *     own lane with a plan-view fixture. NOT fixed here, deliberately.
 *   • `apps/editor/src/ui/SpatialTree.ts:45` — `idsMatching()` harvests scene ids
 *     into VISIBILITY INTENT. Its own comment at :195 claims aggregates carry
 *     "`levelId` but NO `userData.id`"; that is FALSE — `_createGroup` stamps
 *     BOTH (:480 id, :490 levelId). Comment corrected by this lane; behaviour
 *     deliberately left alone, because excluding aggregates would stop level-hide
 *     reaching instanced walls.
 *
 * ⛔ ARM A may NEVER acquire a baseline. ARM B's baseline is SHRINK-ONLY: verify a
 * member, fix it, lower the number. Do not raise it to absorb a new blind harvest
 * — a new consumer IMPORTS the predicate and opts in, which is the whole design
 * (see the module header of the canonical file).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');

/** The one module allowed to declare the literal. */
const CANONICAL = 'packages/core-app-model/src/rendering/renderAggregateIdentity.ts';
/** The one module allowed to PRODUCE it. */
const MINTER = 'packages/core-app-model/src/rendering/InstancedElementRenderer.ts';

const SCAN_DIRS = ['packages', 'apps', 'plugins', 'src'];
const LITERAL = 'instanced-group-';
const CANONICAL_IMPORT = 'render-aggregate-identity';

/**
 * ARM B pinned census. SHRINK-ONLY — lower it when a member is verified and fixed;
 * never raise it. Measured 2026-08-24 (lane TOPO51) immediately AFTER the L-10530
 * fix, so this number already excludes the two harvests this lane repaired.
 */
const ARM_B_BASELINE = 49;

/** Tests legitimately hard-code the literal to build fixtures — that is the point of a fixture. */
function isTest(rel: string): boolean {
    return /(^|[\\/])__tests__[\\/]|\.test\.tsx?$|\.spec\.tsx?$/.test(rel);
}

function walk(dir: string, out: string[]): void {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
        if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'build') continue;
        const full = join(dir, e);
        let st;
        try { st = statSync(full); } catch { continue; }
        if (st.isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(e)) out.push(full);
    }
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(join(ROOT, d), files);

const armA: string[] = [];
const armB: string[] = [];

for (const abs of files) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel === CANONICAL || rel === MINTER) continue;
    if (isTest(rel)) continue;

    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }

    // ⚠ Must be a real IMPORT, not a mention. An earlier revision of this gate used
    // `src.includes(CANONICAL_IMPORT)`, and a COMMENT in `SpatialTree.ts` naming the
    // module was enough to drop it off the census — the gate shrank by one while the
    // code was unchanged. A gate satisfiable by writing prose about it measures prose.
    const importsCanonical = new RegExp(
        `(?:import|require)[^\\n;]*['"\`][^'"\`\\n]*${CANONICAL_IMPORT}['"\`]`,
    ).test(src);

    // ── ARM A — a re-rolled copy of the test ────────────────────────────────
    if (src.includes(`'${LITERAL}`) || src.includes(`"${LITERAL}`) || src.includes(`\`${LITERAL}`)) {
        // A comment naming the string while explaining the seam is documentation,
        // not a copy. Only count it when it appears outside comment lines.
        const live = src
            .split('\n')
            .filter((l) => {
                const t = l.trim();
                return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
            })
            .join('\n');
        if (live.includes(`'${LITERAL}`) || live.includes(`"${LITERAL}`) || live.includes(`\`${LITERAL}`)) {
            const lines = src.split('\n')
                .map((l, i) => [i + 1, l] as const)
                .filter(([, l]) => {
                    const t = l.trim();
                    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false;
                    return l.includes(LITERAL);
                })
                .map(([n]) => n);
            armA.push(`${rel}:${lines.join(',')}`);
        }
    }

    // ── ARM B — a scene harvest with no predicate ───────────────────────────
    const harvests = /\.children\b/.test(src) || /\.traverse\s*\(/.test(src);
    const readsId = /userData\s*(\?\.|\.)\s*id\b/.test(src) || /userData\s*\[\s*['"]id['"]\s*\]/.test(src);
    // Only a HARVEST — an id read inside an iteration — is in scope. A file that
    // reads `obj.userData.id` for one already-resolved object is not enumerating
    // the scene and cannot inherit an aggregate it was not handed.
    if (harvests && readsId && !importsCanonical) {
        // The aggregate-aware flag is an equally valid opt-in marker: a file that
        // already tests `isInstancedGroup` has made the decision consciously.
        if (!/isInstancedGroup/.test(src)) armB.push(rel);
    }
}

armA.sort();
armB.sort();

console.log(
    `\n[check-render-aggregate-seam] scanned ${files.length} file(s) across ${SCAN_DIRS.join(', ')}\n` +
    `  canonical predicate : ${CANONICAL}\n` +
    `  minter (allowed)    : ${MINTER}\n` +
    `  tests excluded (fixtures legitimately hard-code the literal)\n`,
);

console.log(`  ARM A — re-rolled '${LITERAL}' literal in production source : ${armA.length}`);
for (const f of armA) console.log(`      ⛔ ${f}`);
console.log(`  ARM B — scene id-harvest with no aggregate predicate       : ${armB.length}`);
for (const f of armB) console.log(`      ⛔ ${f}`);

if (armA.length > 0 || armB.length > ARM_B_BASELINE) {
    console.error(
        `\n[check-render-aggregate-seam] FAIL — arm A ${armA.length}/0, arm B ${armB.length}/${ARM_B_BASELINE}.\n` +
        `ARM A is HARD-0 and may never acquire a baseline. ARM B is SHRINK-ONLY.\n\n` +
        `ARM A: do not re-roll \`id.startsWith('${LITERAL}')\`. Import \`isRealElementId\` /\n` +
        `  \`isRenderAggregateId\` from \`@pryzm/core-app-model/render-aggregate-identity\`.\n` +
        `ARM B: a traversal that reads \`userData.id\` inherits GPU render batches as though they\n` +
        `  were BIM elements. Harvest with \`realElementIdOf(child)\`, which returns undefined for\n` +
        `  render-owned objects — or test \`userData.isInstancedGroup\` and opt IN deliberately.\n` +
        `  This is the arm that would have caught L-10530: the two topology harvests contained no\n` +
        `  magic string to grep for, they contained NO CHECK AT ALL.\n`,
    );
    process.exit(1);
}

console.log(
    `\n[check-render-aggregate-seam] ✓ arm A ${armA.length}/0 (HARD) · ` +
    `arm B ${armB.length}/${ARM_B_BASELINE} (census, shrink-only).\n` +
    `  ARM A pre-fix reading was 3 — SelectionManager ×2, ContextualEditBar ×1 — all now\n` +
    `  routed through ${CANONICAL}.\n` +
    `  ⚠ ARM B is a CENSUS, NOT a defect count: 2 of its members were verified and FIXED\n` +
    `  (TopologyLayer, TopologySpatialIndex), 2 more are verified and OPEN\n` +
    `  (ElementSpatialIndex, SpatialTree — see this file's header). The rest are\n` +
    `  UNVERIFIED candidates and must be read before being called defects.`,
);
