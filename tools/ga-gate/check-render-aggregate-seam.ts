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

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
const ARM_B_BASELINE = 43;

/**
 * ─── 49 -> 43 (2026-08-30, lane W1c — THE REGISTRATION LANE) ────────────────
 * This gate was committed 2026-08-24 in 377dd06b and REGISTERED IN NOTHING —
 * not run-all.ts, not ci.yml, not package.json. Registering it is what produced
 * this re-pin, and the shape is worth recording: an unregistered gate drifts in
 * silence, which is the same authored-but-unwired failure the runner's own
 * committed-but-unregistered pre-flight exists to shout about.
 *
 * At HEAD it read 50/49 — ONE over a shrink-only ceiling. The delta was NOT one
 * new blind harvest. It was TWO arrivals and one departure, and BOTH arrivals
 * were FALSE POSITIVES OF THIS GATE:
 *   • apps/editor/src/engine/WaterMeshBuilder.ts — only ever WRITES the id
 *     (:150, :177). A stamp is not a harvest. Its one traverse (:289) disposes
 *     geometry and materials and reads no id at all.
 *   • apps/editor/src/engine/initTools.ts — the text userData.id occurs at :2750
 *     and :2810 and nowhere else, both times inside PROSE about a past defect.
 *     Its one traversal (:3414) reads userData.isPreview.
 *
 * ⭐ THE SECOND IS THIS GATE'S OWN NAMED DEFECT, INVERTED. The importsCanonical
 * comment below already says: a gate satisfiable by writing prose about it
 * measures prose. ARM A stripped comments before counting; ARM B did not — so
 * prose could not take a file OFF this census but could put one ON it. Both arms
 * now share ONE stripComments helper (C84 EI-9, one authority per concept).
 *
 * The narrowing is faithful to the subject this gate declares above — "a HARVEST,
 * an id READ inside an iteration" — and every one of the SEVEN departures was
 * read individually before it was allowed to leave:
 *   WRITE, not a read : WaterMeshBuilder :150/:177 · RhinoImporter :269 (stamping
 *                       ids onto freshly imported objects inside a traverse)
 *   PROSE, not code   : initTools :2750/:2810 · lineworkProbe :80 (JSDoc) ·
 *                       GLBExporter :232/:592 (JSDoc) · FloorPanelBuilder :420 ·
 *                       InstancedMeshCoalescer :15
 *
 * ⭐ The read test also WIDENED, in the direction that costs: an optional-chained
 * bracket read was invisible to the old bracket regex. visibilitySceneApplier.ts
 * :111 is exactly that, and it STAYS on the census because of the widening, not
 * in spite of it — so this pass is not one-way narrowing.
 *
 * ⛔ Lowering a shrink-only ceiling TO ITS MEASURED VALUE is always allowed, and
 * here it is required: a ceiling above the measurement is not a safety margin, it
 * is a blind spot with a number on it. RAISING one is the forbidden move and
 * nothing in this note licenses it.
 */

/**
 * ─── SUBJECT FLOOR (R5 · L-811 · §CONTEXT-DATA-HONESTY) ─────────────────────
 * "I walked 7984 files and found nothing" and "I walked nothing" must never print
 * the same value. This gate shipped with NEITHER a floor nor an exit-2 path, and
 * was the last unfloored gate in tools/ga-gate/ — precisely what
 * check-gate-subject-floors.ts exists to name.
 *
 * Floored at 4000 against a measured 7984 (2026-08-30): well below the reading so
 * a legitimate tree shrink cannot fire it, and far above the failure that matters
 * — a walk that resolves the wrong root, throws inside readdirSync, swallows it,
 * and prints a clean number over an unscanned tree (the batch-9 check-xss-guards
 * defect, recorded in check-gate-subject-floors.ts's own header).
 */
const MIN_SCANNED_FILES = 4000;

/** Tests legitimately hard-code the literal to build fixtures — that is the point of a fixture. */
function isTest(rel: string): boolean {
    return /(^|[\\/])__tests__[\\/]|\.test\.tsx?$|\.spec\.tsx?$/.test(rel);
}

/**
 * Source with whole-line comments removed. THE ONE comment authority in this file
 * (C84 EI-9) — ARM A has always stripped, ARM B never did, and that asymmetry is
 * what let two files onto the census by PROSE ALONE (see the ARM_B_BASELINE note).
 *
 * Line-granular on purpose, matching what ARM A has always done: a trailing
 * comment on a live code line is left in place rather than half-parsed. Erring
 * toward KEEPING a line is the safe direction for a census that must not shrink
 * by accident.
 */
function stripComments(src: string): string {
    return src
        .split('\n')
        .filter((l) => {
            const t = l.trim();
            return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
        })
        .join('\n');
}

/**
 * A READ of userData.id — dot, optional-chained dot, or bracket — that is NOT the
 * left-hand side of an assignment. The negative lookahead is what separates a
 * HARVEST from a STAMP: InstancedElementRenderer is not the only producer that
 * writes userData.id, and a builder stamping identity onto its own group has
 * inherited nothing from anybody.
 *
 * ⚠ The lookahead must NOT consume the whitespace it looks past. An earlier draft
 * put it after a greedy whitespace class and the engine simply backtracked that
 * class to zero width, so an assignment padded with spaces still read as a read.
 */
const READ_DOT = /userData\s*(?:\?\.|\.)\s*id\b(?!\s*=[^=])/;
const READ_BRACKET = /userData\s*(?:\?\.)?\s*\[\s*['"]id['"]\s*\](?!\s*=[^=])/;

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

// ── SUBJECT FLOOR — exit 2 (MISCONFIGURED), never 0 and never 1 ─────────────
// Three states, three exit codes, no aliasing: 0 clean · 1 or 3 a real finding ·
// 2 "this gate could not evaluate its subject".
if (files.length < MIN_SCANNED_FILES) {
    console.error(
        '\n[check-render-aggregate-seam] MISCONFIGURED (exit 2) — walked only ' +
        files.length + ' file(s) across ' + SCAN_DIRS.join(', ') + '; the floor is ' +
        MIN_SCANNED_FILES + '.\n' +
        'A walk this small did not read this repository, so neither arm below means anything.\n' +
        'Check that ROOT resolved (' + ROOT + ') and that SCAN_DIRS still exist.\n',
    );
    process.exit(2);
}

// The gate's PREMISE, floored separately from its walk: if the canonical predicate
// or the minter has moved, ARM A is excluding files that no longer exist and ARM B
// is measuring a seam that no longer has an owner. Either way the number is void.
for (const required of [CANONICAL, MINTER]) {
    if (!existsSync(join(ROOT, required))) {
        console.error(
            '\n[check-render-aggregate-seam] MISCONFIGURED (exit 2) — ' + required +
            ' does not exist.\n' +
            'This gate polices the seam between that module and its consumers. With the\n' +
            'module gone there is no seam to police and a clean reading would be a lie.\n',
        );
        process.exit(2);
    }
}

const armA: string[] = [];
const armB: string[] = [];

for (const abs of files) {
    const rel = relative(ROOT, abs).split(sep).join('/');
    if (rel === CANONICAL || rel === MINTER) continue;
    if (isTest(rel)) continue;

    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }

    // ⭐ ONE stripped view per file, shared by BOTH arms. ARM A always had this
    // (inline, below); ARM B never did, and that asymmetry is how two files joined
    // the census by prose alone. See the ARM_B_BASELINE note.
    const live = stripComments(src);

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
        // not a copy. Only count it when it appears outside comment lines — which is
        // exactly what `live` is, and what ARM B now reads too.
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
    const harvests = /\.children\b/.test(live) || /\.traverse\s*\(/.test(live);
    // ⭐ A READ — not a mention, and not a WRITE. Prose about userData.id is not a
    // harvest (initTools :2750/:2810), and stamping userData.id onto an object you
    // just built is not a harvest either (WaterMeshBuilder :150, RhinoImporter
    // :269): a PRODUCER has inherited nothing from anybody. Both spellings also
    // accept the optional-chained bracket form the old bracket regex could not see,
    // which is a real harvest (visibilitySceneApplier :111).
    const readsId = READ_DOT.test(live) || READ_BRACKET.test(live);
    // Only a HARVEST — an id read inside an iteration — is in scope. A file that
    // reads `obj.userData.id` for one already-resolved object is not enumerating
    // the scene and cannot inherit an aggregate it was not handed.
    if (harvests && readsId && !importsCanonical) {
        // The aggregate-aware flag is an equally valid opt-in marker: a file that
        // already tests `isInstancedGroup` has made the decision consciously.
        if (!/isInstancedGroup/.test(live)) armB.push(rel);
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

// ─── EXIT CODES — three facts, three codes (run-all.ts's contract) ──────────
// 1 = a HARD-0 invariant failed and MAY be absorbed by gate-debt.json if someone
//     chooses to; 3 = a SHRINK-ONLY RATCHET WAS EXCEEDED, which
//     §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836) makes permanently
//     unabsorbable. ARM A is the former, ARM B is the latter, and collapsing them
//     onto 1 — which this gate did while it was registered nowhere and nothing
//     read its exit code — would hand a future lane the one forbidden fix.
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
    process.exit(armA.length > 0 ? 1 : 3);
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
