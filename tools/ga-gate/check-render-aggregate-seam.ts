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
 *     group.mesh.userData.id = 'instanced-group-' + key;
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
 * Occurrences of the LITERAL `instanced-group-` in production source outside
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
 *     "levelId but NO userData.id"; that is FALSE — `_createGroup` stamps
 *     BOTH (:480 id, :490 levelId). Comment corrected by this lane; behaviour
 *     deliberately left alone, because excluding aggregates would stop level-hide
 *     reaching instanced walls.
 *
 * ⛔ ARM A may NEVER acquire a baseline. ARM B's baseline is SHRINK-ONLY: verify a
 * member, fix it, lower the number. Do not raise it to absorb a new blind harvest
 * — a new consumer IMPORTS the predicate and opts in, which is the whole design
 * (see the module header of the canonical file).
 *
 * ─── §BLIND-COMPARATOR — CORRECTED 2026-08-31 (audit W3d) ────────────────────
 *
 * Until this pass, everything above was ASSERTED. The gate carried a subject
 * floor (below) and, having been registered in nothing until lane W1c, had never
 * been observed to fire on anything at all. Its own audit named the defect:
 *
 *     "A subject floor proves the walk FOUND FILES, never that the PREDICATE
 *      matches its subject."
 *
 * A floored gate that has never been watched failing is a BLIND COMPARATOR: it
 * can prove it read a tree, and cannot prove it would catch the thing it exists
 * to catch. `selfTest()` below now materialises two synthetic workspaces and runs
 * the SAME `analyse()` the production run uses, at the SAME production baseline
 * (`ARM_B_BASELINE`), so what the control proves is what production enforces:
 *
 *   • PLANTED — two re-rolled copies of the literal in live code (ARM A must fire
 *     and must NAME both, with line numbers), and PLANTED_ARM_B_HARVESTS blind
 *     scene harvests spanning all four read spellings the gate claims to see
 *     (`userData.id`, `userData?.id`, `userData['id']`, `userData?.['id']`) over
 *     both iteration spellings (`.traverse(`, `.children`). ARM B must fire.
 *   • CLEAN — every shape this gate has RECORDED as a false positive, so each
 *     guard is EXECUTED rather than merely commented:
 *       – the literal in PROSE only (the importsCanonical lesson, inverted),
 *       – `userData.id` in PROSE only inside a file that traverses (initTools),
 *       – a WRITE of `userData.id` inside a traverse, with the padded-whitespace
 *         spelling that defeated an earlier lookahead (WaterMeshBuilder,
 *         RhinoImporter),
 *       – a harvest that IMPORTS the canonical predicate (opted in),
 *       – a harvest that tests `userData.isInstancedGroup` (opted in),
 *       – a read on ONE already-resolved object, with no iteration at all,
 *       – the literal inside CANONICAL and MINTER (the two allowed homes),
 *       – the literal inside a __tests__ fixture.
 *     It must read 0 on BOTH arms.
 *
 * If any planted arm stays silent, or the clean tree reads dirty, the gate exits
 * 2 as a BLIND COMPARATOR rather than 0.
 *
 * ⭐ A CONSEQUENCE THAT IS THE POINT, NOT A SIDE EFFECT. Because the control runs
 * at the LIVE baseline, RAISING `ARM_B_BASELINE` through `PRYZM_RAS_ARM_B_MAX`
 * lifts it past the planted harvest count, ARM B stops firing, and the gate exits
 * 2 as a blind comparator INSTEAD of going green. The one forbidden fix
 * (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836) now announces itself.
 *   Measured 2026-08-31: `PRYZM_RAS_ARM_B_MAX=999` → RC=2, "B did not fire".
 * ARM A cannot be disarmed this way because it is HARD-0 with no threshold at
 * all — which is exactly why it may never acquire one.
 *
 * The converse — legitimately SHRINKING ARM_B_BASELINE — leaves the control
 * intact: PLANTED_ARM_B_HARVESTS is a fixed literal above the current ceiling, so
 * a lower ceiling still fires. It must be re-pinned only if the ceiling is ever
 * driven ABOVE it, and that direction is forbidden anyway.
 *
 * Exit: 0 = clean/at baseline · 1 = ARM A (hard invariant) · 2 = scan
 * misconfigured or blind comparator · 3 = ARM B shrink-only ratchet exceeded.
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(import.meta.dirname, '..', '..');
const LABEL = 'check-render-aggregate-seam';

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
 *
 * The env override exists ONLY so the §BLIND-COMPARATOR property above is
 * demonstrable: raising it disarms the planted violation and the gate exits 2.
 * It is not a knob for going green.
 */
const ARM_B_BASELINE = Number(process.env.PRYZM_RAS_ARM_B_MAX ?? 43);

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
 *
 * ⭐ 2026-08-31 (W3d): every departure and every arrival named above is now a
 * CLEAN-tree fixture below. The seven judgements that produced 49 -> 43 were made
 * by reading; from this commit they are re-made by executing, on every run.
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
 *
 * ⚠ AND IT IS NOT ENOUGH ON ITS OWN — see §BLIND-COMPARATOR in the header. A
 * floor proves the walk found files; only the executed controls prove the
 * predicate matches its subject.
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
 * The CLEAN control tree carries that exact padded spelling, so the guard is
 * EXECUTED, not asserted.
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

// ─── The measurement, over an arbitrary root ─────────────────────────────────

type Arm = 'A' | 'B';

interface Finding {
    readonly arm: Arm;
    readonly key: string;
    readonly detail: string;
}

interface Analysis {
    readonly filesScanned: number;
    readonly armA: readonly string[];
    readonly armB: readonly string[];
    /** Non-null when the gate could not evaluate its subject at all (exit 2). */
    readonly misconfigured: string | null;
    readonly findings: readonly Finding[];
}

/**
 * The WHOLE measurement. Parameterised by root/dirs/minFiles ONLY so the executed
 * controls can drive this identical code path over a synthetic tree; the BASELINE
 * passed in is the production one in both cases, so a control that fires proves
 * the arm that SHIPS fires. A control against a private copy proves nothing.
 */
function analyse(
    root: string,
    dirs: readonly string[],
    minFiles: number,
    armBBaseline: number,
): Analysis {
    const files: string[] = [];
    for (const d of dirs) walk(join(root, d), files);

    // ── SUBJECT FLOOR — exit 2 (MISCONFIGURED), never 0 and never 1 ─────────
    // Three states, three exit codes, no aliasing: 0 clean · 1 or 3 a real finding ·
    // 2 "this gate could not evaluate its subject".
    if (files.length < minFiles) {
        return {
            filesScanned: files.length,
            armA: [],
            armB: [],
            findings: [],
            misconfigured:
                'walked only ' + files.length + ' file(s) across ' + dirs.join(', ') +
                '; the floor is ' + minFiles + '.\n' +
                'A walk this small did not read this repository, so neither arm below means anything.\n' +
                'Check that ROOT resolved (' + root + ') and that SCAN_DIRS still exist.',
        };
    }

    // The gate's PREMISE, floored separately from its walk: if the canonical predicate
    // or the minter has moved, ARM A is excluding files that no longer exist and ARM B
    // is measuring a seam that no longer has an owner. Either way the number is void.
    for (const required of [CANONICAL, MINTER]) {
        if (!existsSync(join(root, required))) {
            return {
                filesScanned: files.length,
                armA: [],
                armB: [],
                findings: [],
                misconfigured:
                    required + ' does not exist under ' + root + '.\n' +
                    'This gate polices the seam between that module and its consumers. With the\n' +
                    'module gone there is no seam to police and a clean reading would be a lie.',
            };
        }
    }

    const armA: string[] = [];
    const armB: string[] = [];

    for (const abs of files) {
        const rel = relative(root, abs).split(sep).join('/');
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

        // ── ARM A — a re-rolled copy of the test ────────────────────────────
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

        // ── ARM B — a scene harvest with no predicate ───────────────────────
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

    const findings: Finding[] = [];
    if (armA.length > 0) {
        findings.push({
            arm: 'A',
            key: `A::literal=${armA.length}>0`,
            detail:
                `${armA.length} production file(s) re-roll the '${LITERAL}' literal: [${armA.join(' · ')}]. ` +
                `ARM A is HARD-0 and may never acquire a baseline.`,
        });
    }
    if (armB.length > armBBaseline) {
        findings.push({
            arm: 'B',
            key: `B::harvests=${armB.length}>${armBBaseline}`,
            detail:
                `${armB.length} blind scene id-harvest(s), baseline ${armBBaseline}. ` +
                `SHRINK-ONLY: verify a member, fix it, lower the number.`,
        });
    }

    return { filesScanned: files.length, armA, armB, misconfigured: null, findings };
}

// ─── Executed controls — an arm never watched failing is UNPROVEN ────────────

function writeTree(base: string, files: Record<string, string>): void {
    rmSync(base, { recursive: true, force: true });
    for (const [p, body] of Object.entries(files)) {
        const abs = join(base, p.split('/').join(sep));
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, body, 'utf8');
    }
}

/** The literal, assembled at runtime so this gate's own source never re-rolls it. */
const L = LITERAL;

/**
 * ⚠ A FIXED literal, deliberately NOT derived from ARM_B_BASELINE. That is the
 * whole §BLIND-COMPARATOR property: if this scaled with the ceiling, raising the
 * ceiling would keep the control green and the forbidden fix would stay silent.
 * Pinned at 44 = the 2026-08-30 measured ceiling (43) + 1. Shrinking the ceiling
 * leaves it valid; the only thing that invalidates it is RAISING the ceiling past
 * it, which is exactly the move it exists to expose.
 */
const PLANTED_ARM_B_HARVESTS = 44;

/** A blind harvest, cycling all four read spellings and both iteration spellings. */
function plantedHarvest(i: number): string {
    const reads = [
        'const id = child.userData.id;',
        'const id = child.userData?.id;',
        "const id = child.userData['id'];",
        "const id = child.userData?.['id'];",
    ];
    const read = reads[i % reads.length]!;
    if (i % 2 === 0) {
        return (
            'export function harvest' + i + '(root: any): string[] {\n' +
            '  const out: string[] = [];\n' +
            '  root.traverse((child: any) => {\n' +
            '    ' + read + '\n' +
            '    if (id) out.push(String(id));\n' +
            '  });\n' +
            '  return out;\n' +
            '}\n'
        );
    }
    return (
        'export function harvest' + i + '(root: any): string[] {\n' +
        '  const out: string[] = [];\n' +
        '  for (const child of root.children as any[]) {\n' +
        '    ' + read + '\n' +
        '    if (id) out.push(String(id));\n' +
        '  }\n' +
        '  return out;\n' +
        '}\n'
    );
}

/** CANONICAL + MINTER, which the PREMISE floor requires to exist under any root. */
const PREMISE: Record<string, string> = {
    [CANONICAL]:
        "export const RENDER_AGGREGATE_ID_PREFIX = '" + L + "';\n" +
        'export function isRenderAggregateId(id: string): boolean {\n' +
        '  return id.startsWith(RENDER_AGGREGATE_ID_PREFIX);\n' +
        '}\n',
    [MINTER]:
        'export function mintGroup(group: any, key: string): void {\n' +
        "  group.mesh.userData.id = '" + L + "' + key;\n" +
        '}\n',
};

const PLANTED: Record<string, string> = (() => {
    const t: Record<string, string> = { ...PREMISE };
    // ── ARM A: two re-rolled copies of the test, in LIVE code. Must fire, and
    // must NAME both files with their line numbers.
    t['apps/rogue/src/SelectionManager.ts'] =
        'export function isSynthetic(id: string): boolean {\n' +
        "  return id.startsWith('" + L + "');\n" +
        '}\n';
    t['plugins/rogue/src/ContextualEditBar.ts'] =
        'export function label(id: string): string {\n' +
        '  return id.indexOf("' + L + '") === 0 ? "batch" : id;\n' +
        '}\n';
    // ── ARM B: PLANTED_ARM_B_HARVESTS blind harvests, one file each.
    for (let i = 0; i < PLANTED_ARM_B_HARVESTS; i++) {
        t[`packages/rogue-${i}/src/Harvest${i}.ts`] = plantedHarvest(i);
    }
    return t;
})();

/**
 * Every shape this gate has RECORDED as a false positive. Each one is a judgement
 * that was previously made by a human reading a file; here it is re-made by
 * executing the gate. Must read 0 on BOTH arms.
 */
const CLEAN: Record<string, string> = {
    ...PREMISE,

    // 1. The literal in PROSE ONLY. ARM A must not count documentation.
    'apps/editor/src/ui/prose.ts':
        '/**\n' +
        " * The synthetic id is spelled '" + L + "<key>'. Do NOT re-roll this test;\n" +
        ' * import isRenderAggregateId instead.\n' +
        ' */\n' +
        'export function noop(): void {}\n',

    // 2. userData.id in PROSE ONLY, in a file that really does traverse
    //    (apps/editor/src/engine/initTools.ts :2750/:2810 · traversal at :3414).
    'apps/editor/src/engine/initTools.ts':
        '/**\n' +
        ' * Historic defect: this traversal used to read userData.id and inherited\n' +
        ' * render aggregates as though they were elements. It no longer does.\n' +
        ' */\n' +
        'export function collectPreviews(root: any): any[] {\n' +
        '  const out: any[] = [];\n' +
        '  root.traverse((child: any) => { if (child.userData.isPreview) out.push(child); });\n' +
        '  return out;\n' +
        '}\n',

    // 3. A WRITE inside a traverse — a STAMP, not a harvest — in the PADDED
    //    spelling that defeated an earlier lookahead
    //    (WaterMeshBuilder :150/:177 · RhinoImporter :269).
    'apps/editor/src/engine/WaterMeshBuilder.ts':
        'export function stampWater(root: any, prefix: string): void {\n' +
        '  let n = 0;\n' +
        '  root.traverse((child: any) => {\n' +
        '    child.userData.id   =  prefix + n;\n' +
        '    child.userData["id"]  =  prefix + n;\n' +
        '    n = n + 1;\n' +
        '  });\n' +
        '}\n',

    // 4. A harvest that IMPORTS the canonical predicate — opted in deliberately.
    'apps/editor/src/ui/SpatialTreeFixed.ts':
        "import { realElementIdOf } from '@pryzm/core-app-model/" + CANONICAL_IMPORT + "';\n" +
        'export function idsMatching(root: any): string[] {\n' +
        '  const out: string[] = [];\n' +
        '  root.traverse((child: any) => {\n' +
        '    const id = child.userData.id;\n' +
        '    if (id && realElementIdOf(child)) out.push(String(id));\n' +
        '  });\n' +
        '  return out;\n' +
        '}\n',

    // 5. A harvest that tests the aggregate flag — the other legal opt-in.
    'packages/topology/src/TopologyLayer.ts':
        'export function harvestOptIn(root: any): string[] {\n' +
        '  const out: string[] = [];\n' +
        '  root.traverse((child: any) => {\n' +
        '    if (child.userData.isInstancedGroup) return;\n' +
        '    const id = child.userData.id;\n' +
        '    if (id) out.push(String(id));\n' +
        '  });\n' +
        '  return out;\n' +
        '}\n',

    // 6. A read on ONE already-resolved object. No iteration, nothing inherited.
    'packages/core-app-model/src/selection/labelOf.ts':
        'export function labelOf(obj: any): string {\n' +
        "  return String(obj.userData.id ?? '');\n" +
        '}\n',

    // 7. A __tests__ fixture that legitimately hard-codes the literal AND harvests.
    'packages/core-app-model/__tests__/aggregate.test.ts':
        "export const FIXTURE_ID = '" + L + "wall|default';\n" +
        'export function harvest(root: any): string[] {\n' +
        '  const out: string[] = [];\n' +
        '  root.traverse((child: any) => { const id = child.userData.id; if (id) out.push(id); });\n' +
        '  return out;\n' +
        '}\n',
};

interface Control {
    readonly ok: boolean;
    readonly lines: readonly string[];
    readonly armsFired: readonly string[];
}

function selfTest(): Control {
    const base = join(tmpdir(), `pryzm-${LABEL}-selftest`);
    const lines: string[] = [];
    let armsFired: string[] = [];
    let ok = true;
    try {
        writeTree(join(base, 'planted'), PLANTED);
        writeTree(join(base, 'clean'), CLEAN);

        // minFiles 1: the honesty floor exists to catch a walk that reached nothing,
        // and these trees are deliberately tiny. The BASELINE stays the production
        // one — a control run at a relaxed threshold proves nothing about the gate
        // that ships.
        const bad = analyse(join(base, 'planted'), SCAN_DIRS, 1, ARM_B_BASELINE);
        const good = analyse(join(base, 'clean'), SCAN_DIRS, 1, ARM_B_BASELINE);

        // A control that scanned nothing is itself a blind comparator. Floor the
        // controls against their own fixture counts, so "0 findings" can never mean
        // "0 files".
        for (const [name, got, want] of [
            ['planted', bad.filesScanned, Object.keys(PLANTED).length],
            ['clean', good.filesScanned, Object.keys(CLEAN).length],
        ] as const) {
            if (got !== want) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — the ${name} control walked ${got} file(s), fixture has ${want}.`);
            }
        }
        for (const [name, a] of [['planted', bad], ['clean', good]] as const) {
            if (a.misconfigured) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — the ${name} control could not evaluate: ${a.misconfigured.split('\n')[0]}`);
            }
        }

        const fired = new Set(bad.findings.map((f) => f.arm));
        armsFired = [...fired].sort();
        lines.push(
            `Negative control (planted tree): ${bad.findings.length} finding(s), ` +
            `arms fired [${armsFired.join(', ')}]`,
        );
        for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
        for (const arm of ['A', 'B'] as const) {
            if (!fired.has(arm)) {
                ok = false;
                lines.push(
                    `    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation` +
                    (arm === 'B'
                        ? ` (planted ${PLANTED_ARM_B_HARVESTS} harvests against ARM_B_BASELINE ${ARM_B_BASELINE} —` +
                          ` a ceiling RAISED past the planted count disarms this arm, which is the point).`
                        : '.'),
                );
            }
        }

        // ARM A must NAME the sites, not merely count them: a summary that loses the
        // name is how a gate reports a breach as a clean number.
        lines.push(`    planted ARM A sites named: [${bad.armA.join(', ') || 'NONE'}]`);
        for (const want of ['apps/rogue/src/SelectionManager.ts:', 'plugins/rogue/src/ContextualEditBar.ts:']) {
            if (!bad.armA.some((s) => s.startsWith(want))) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — ARM A did not name the planted site ${want}<line>.`);
            }
        }
        if (bad.armB.length !== PLANTED_ARM_B_HARVESTS) {
            ok = false;
            lines.push(
                `    ✗ BLIND COMPARATOR — ARM B saw ${bad.armB.length} of ${PLANTED_ARM_B_HARVESTS} planted harvests; ` +
                `at least one read or iteration spelling this gate claims to see is invisible to it.`,
            );
        }

        lines.push(
            `Positive control (clean tree — literal in prose, userData.id in prose, a padded WRITE ` +
            `inside a traverse, a canonical-importing harvest, an isInstancedGroup harvest, a ` +
            `single-object read, canonical + minter, a __tests__ fixture): ` +
            `${good.findings.length} finding(s) — must be 0`,
        );
        lines.push(`    clean tree read: arm A ${good.armA.length} · arm B ${good.armB.length} · ${good.filesScanned} file(s)`);
        for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}: ${f.detail}`);
        if (good.findings.length > 0) ok = false;
        if (good.armA.length !== 0) {
            ok = false;
            lines.push(`    ✗ FALSE POSITIVE — ARM A counted a documented/allowed shape: [${good.armA.join(', ')}]`);
        }
        if (good.armB.length !== 0) {
            ok = false;
            lines.push(`    ✗ FALSE POSITIVE — ARM B counted a stamp, prose or an opted-in harvest: [${good.armB.join(', ')}]`);
        }
    } catch (e) {
        ok = false;
        lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
    } finally {
        rmSync(base, { recursive: true, force: true });
    }
    return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const a = analyse(ROOT, SCAN_DIRS, MIN_SCANNED_FILES, ARM_B_BASELINE);

if (a.misconfigured) {
    console.error(`\n[${LABEL}] MISCONFIGURED (exit 2) — ${a.misconfigured}\n`);
    process.exit(2);
}

console.log(
    `\n[${LABEL}] scanned ${a.filesScanned} file(s) across ${SCAN_DIRS.join(', ')}\n` +
    `  canonical predicate : ${CANONICAL}\n` +
    `  minter (allowed)    : ${MINTER}\n` +
    `  tests excluded (fixtures legitimately hard-code the literal)\n`,
);

console.log(`  ARM A — re-rolled '${LITERAL}' literal in production source : ${a.armA.length}`);
for (const f of a.armA) console.log(`      ⛔ ${f}`);
console.log(`  ARM B — scene id-harvest with no aggregate predicate       : ${a.armB.length}`);
for (const f of a.armB) console.log(`      ⛔ ${f}`);

// A blind comparator is a MISCONFIGURATION, not a pass and not a violation: exit 2,
// the same code the subject floor uses for a scan that looked nowhere. It is
// checked BEFORE the arms below, because a silent arm makes everything printed
// above unproven — including a clean reading.
if (!control.ok) {
    console.error(
        `\n[${LABEL}] MISCONFIGURED (exit 2) — BLIND COMPARATOR. The executed controls did not\n` +
        `establish that this gate's arms fire. Whatever it printed about the real tree above is\n` +
        `unproven: a subject floor proves the walk FOUND FILES, never that the PREDICATE matches\n` +
        `its subject.\n` +
        `If ARM B is the silent arm, check whether ARM_B_BASELINE (${ARM_B_BASELINE}) was RAISED\n` +
        `past the ${PLANTED_ARM_B_HARVESTS} planted harvests. Raising a shrink-only ratchet is the\n` +
        `one forbidden fix (§RATCHET-EXCEEDED-IS-NEVER-DEBT, R7 / L-836) and this is it announcing\n` +
        `itself rather than going green.\n`,
    );
    process.exit(2);
}

// ─── EXIT CODES — three facts, three codes (run-all.ts's contract) ──────────
// 1 = a HARD-0 invariant failed and MAY be absorbed by gate-debt.json if someone
//     chooses to; 3 = a SHRINK-ONLY RATCHET WAS EXCEEDED, which
//     §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836) makes permanently
//     unabsorbable. ARM A is the former, ARM B is the latter, and collapsing them
//     onto 1 — which this gate did while it was registered nowhere and nothing
//     read its exit code — would hand a future lane the one forbidden fix.
if (a.findings.length > 0) {
    console.error(
        `\n[${LABEL}] FAIL — arm A ${a.armA.length}/0, arm B ${a.armB.length}/${ARM_B_BASELINE}.\n` +
        `ARM A is HARD-0 and may never acquire a baseline. ARM B is SHRINK-ONLY.\n\n` +
        `ARM A: do not re-roll \`id.startsWith('${LITERAL}')\`. Import \`isRealElementId\` /\n` +
        `  \`isRenderAggregateId\` from \`@pryzm/core-app-model/render-aggregate-identity\`.\n` +
        `ARM B: a traversal that reads \`userData.id\` inherits GPU render batches as though they\n` +
        `  were BIM elements. Harvest with \`realElementIdOf(child)\`, which returns undefined for\n` +
        `  render-owned objects — or test \`userData.isInstancedGroup\` and opt IN deliberately.\n` +
        `  This is the arm that would have caught L-10530: the two topology harvests contained no\n` +
        `  magic string to grep for, they contained NO CHECK AT ALL.\n`,
    );
    process.exit(a.armA.length > 0 ? 1 : 3);
}

console.log(
    `\n[${LABEL}] ✓ arm A ${a.armA.length}/0 (HARD) · ` +
    `arm B ${a.armB.length}/${ARM_B_BASELINE} (census, shrink-only) · ` +
    `controls: arms proven to fire [${control.armsFired.join(', ')}].\n` +
    `  ARM A pre-fix reading was 3 — SelectionManager ×2, ContextualEditBar ×1 — all now\n` +
    `  routed through ${CANONICAL}.\n` +
    `  ⚠ ARM B is a CENSUS, NOT a defect count: 2 of its members were verified and FIXED\n` +
    `  (TopologyLayer, TopologySpatialIndex), 2 more are verified and OPEN\n` +
    `  (ElementSpatialIndex, SpatialTree — see this file's header). The rest are\n` +
    `  UNVERIFIED candidates and must be read before being called defects.`,
);
