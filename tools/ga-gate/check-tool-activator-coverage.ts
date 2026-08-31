#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-tool-activator-coverage.ts
 *
 * §FIX-DECLARED-TOOL-WITH-NO-ACTIVATOR (L-4601, lane PERF13, founder 2026-08-22)
 *
 * ─── The defect this gate exists to catch ────────────────────────────────────
 *
 * The founder typed "Create Stair" into the PRYZM chat and was told
 *
 *     "Stair tool is active — move the mouse in the canvas to preview it and
 *      click to place — nothing is created until you click."
 *
 * Nothing was created, and no panel appeared. The sentence is generated from
 * `ELEMENT_CREATION_MATRIX` — the shared capability table — so it was TRUTHFUL
 * ABOUT INTENT AND FALSE ABOUT EFFECT, which is the defect shape this repo has
 * paid for repeatedly (`[[committed-is-not-reachable]]`, `[[authored-but-unwired-is-the-bottleneck]]`).
 *
 * The mechanism was `ToolsSlot.activate()` in `packages/runtime-composer`:
 * it looked up an activator, called it IF PRESENT, and then recorded
 * `activeToolId` and notified subscribers **either way**, returning `void`. A
 * caller could not distinguish "armed" from "no activator has ever been
 * registered under this id". `activate()` now returns a boolean (L-4600); this
 * gate stops the gap from reopening.
 *
 * ─── ⭐ WHY THIS GATE COMPARES SETS AND NEVER A COUNT ─────────────────────────
 *
 * This is the whole reason it is worth writing. Measured 2026-08-22, BEFORE the
 * fix:
 *
 *     matrix tool ids declared          = 20
 *     runtime.tools.register(...) calls = 20
 *
 * **The counts matched exactly, and that is precisely what hid the problem.**
 * The SETS did not: measured across ALL register sites at `git show HEAD:` (so
 * the reading could not include this lane's own edits), **FOUR** declared ids had
 * no activator — `grid`, `lift`, `railing`, `stair-path` — while the registered
 * side carried pseudo-families the matrix does not declare (`ceiling:auto`,
 * `floor:auto`, `handrail`, `ramp`, `room-bounding`, `room:level`, plus 25
 * PluginRegistry discipline ids). A count-based gate reads 20 == 20 and passes
 * forever.
 *
 * `railing` is the sharpest case: the matrix declares the family as `railing`,
 * `ToolsAreaLayout` registered it as `handrail`. One family, two spellings, and
 * the id every matrix-driven caller resolves to armed nothing.
 *
 * ⚠ **THIS GATE'S FIRST READING SAID SIX, NOT FOUR, AND THE CORRECTION IS PART OF
 * THE RECORD.** It read `ToolsAreaLayout.ts` alone and so reported `furniture` and
 * `lighting` unbound; `PluginRegistry.ts` binds both and always did. Acting on the
 * over-count nearly shipped a rival `lighting` registration that would have
 * clobbered a working one (see `REGISTER_FILES`). **A gate is a measurement, and a
 * measurement over the wrong denominator is exactly the failure it was built to
 * stop.** Recorded rather than quietly amended.
 *
 * This is the same lesson `check-contract-index-equivalence.ts` records for the
 * C00 suite — a correct count with a wrong range still demotes real rows — and it
 * is now recorded twice because it cost twice.
 *
 * ─── What it checks ──────────────────────────────────────────────────────────
 *
 *  ARM A — COVERAGE (shrink-only ratchet, baseline below).
 *    Every `tool:` id in `ELEMENT_CREATION_MATRIX` must either have a
 *    `runtime.tools.register('<id>', …)` call, or be listed in
 *    `ACTIVATOR_EXEMPT` with a written reason. Unexplained gaps are counted and
 *    may only fall.
 *
 *  ARM B — NO PHANTOM REGISTRATIONS (hard, zero tolerance).
 *    Every registered id must be a declared matrix id OR a declared
 *    pseudo-family in `PSEUDO_FAMILIES`. A registration under a name nothing
 *    resolves to is dead wiring that looks like coverage.
 *
 * Both arms are SET operations. Neither compares a length to a length.
 *
 * ─── Scope, stated honestly ──────────────────────────────────────────────────
 *
 * ⚠ THIS GATE PROVES WIRING, NOT BEHAVIOUR. It establishes that an activator is
 * registered under every declared id. It does NOT establish that the activator
 * arms a working tool, that a canvas click places anything, or that a panel
 * appears — those need a browser and are recorded as UNVERIFIED in ISSUE-LOG
 * L-4600..L-4604. A green reading here means "the silent-success path is
 * closed", never "the stair tool works".
 *
 * ⚠ NOT A RIVAL OF `check-chat-capability-coverage.ts`. That gate's subject is
 * BUS COMMAND VERBS reachable from chat (`plugins/*∕src/handlers/*.ts` →
 * `ChatCapability`). This gate's subject is TOOL ACTIVATION IDS
 * (`ELEMENT_CREATION_MATRIX` → `runtime.tools.register`). Disjoint sources,
 * disjoint failure mode; neither can see the other's gap.
 *
 * ─── §BLIND-COMPARATOR — EXECUTED CONTROLS, ADDED 2026-08-31 (audit W3b) ─────
 *
 * Everything above describes a comparator. None of it established that the
 * comparator FIRES. That distinction is not academic here: a LIVE blindness was
 * demonstrated against this exact file — a fake repo root (`GA_GATE_REPO_ROOT`)
 * carrying a 2-id matrix and 3 registrations printed
 * `ARM A uncovered 0/0 — OK` at RC=0. The gate read a tree it could not possibly
 * have covered and reported success. The subject floors added in lane W1b close
 * that specific hole, but a floor proves THE WALK FOUND FILES; it can never
 * prove THE PREDICATE MATCHES ITS SUBJECT. This file has already shipped one
 * predicate that did not: the matrix regex missing its leading `\s*`, which
 * silently dropped every indented block row.
 *
 * `selfTest()` therefore materialises two synthetic REPO ROOTS at the real
 * relative paths and drives the SAME `analyse()` the production run drives:
 *
 *   • PLANTED — must fire all FIVE arms:
 *       ARM-A            `ghost-family` declared with no activator, and `grid`
 *                        declared while only `grid:tool` is registered (the
 *                        colon distinction that once made `grid` look bound).
 *       ARM-B            `phantom-tool` registered, declared by nothing.
 *       STALE            an exemption for `wall` (which HAS an activator) and
 *                        one for `defunct-family` (which the matrix no longer
 *                        declares) — both legs of the staleness disjunction.
 *       FLOOR-DECLARED   4 declared ids, under the live floor of 15.
 *       FLOOR-REGISTERED 4 registered ids, under the live floor of 30.
 *     ARM-A must NAME `ghost-family` and `grid`; ARM-B must NAME `phantom-tool`
 *     and must NOT name `grid:tool`. A count that loses the name is how this
 *     gate's own author once nearly shipped a rival `lighting` registration.
 *
 *   • CLEAN — must read 0, and carries every recorded FALSE-POSITIVE shape:
 *       ‣ INDENTED BLOCK ROWS (`curtain-wall`, `railing`, `stair`) — the
 *         leading-`\s*` defect. Drop it and the clean tree's declared set
 *         collapses below the floor, so the regression is loud.
 *       ‣ A SECOND REGISTER SITE holding `lighting` alone — reading only
 *         `ToolsAreaLayout.ts` reports a COVERED family as uncovered, which is
 *         the over-count recorded at REGISTER_FILES.
 *       ‣ PSEUDO-FAMILIES (`grid:tool`, `handrail`, `ceiling:auto`, …)
 *         registered and undeclared — ARM B must not call these phantoms.
 *       ‣ A NAMED EXEMPTION (`legacy-family`) — declared, unbound, exempt:
 *         neither uncovered nor stale.
 *
 * If a planted arm stays silent, or the clean tree reads dirty, the gate exits 2
 * as a BLIND COMPARATOR. Whatever it printed about the real tree is then
 * unproven, and unproven is not green.
 *
 * ⭐ THE CONTROLS RUN AT THE LIVE BASELINES AND THE LIVE FLOORS, NEVER AT
 * FIXTURE VALUES — and that is the point, not an implementation detail. Because
 * the planted violations are measured against production thresholds, the
 * FORBIDDEN FIX ANNOUNCES ITSELF: raise the ceiling
 * (`PRYZM_TOOLACT_MAX_UNCOVERED`) and the planted ARM-A violation is disarmed,
 * so the gate exits 2 as a blind comparator instead of going green. Lower a
 * floor (`PRYZM_TOOLACT_MIN_DECLARED` / `_MIN_REGISTERED`) and the planted
 * FLOOR arms fall silent the same way. Editing the constants in this file has
 * the identical effect — the env knobs exist so the property is demonstrable,
 * not so the thresholds are negotiable.
 *   Measured 2026-08-31: `PRYZM_TOOLACT_MAX_UNCOVERED=99` → RC=2,
 *   "ARM-A did not fire on a deliberately planted violation."
 * The converse — legitimately TIGHTENING a floor above the CLEAN fixture's 18
 * declared / 33 registered ids — makes the clean control read dirty. That is a
 * fixture that must move in the same commit as the threshold.
 *
 * Exit codes: 0 OK · 1 FAIL (a ratchet breached / a phantom / a stale exemption)
 * · 2 MISCONFIGURED (a subject floor breached, a subject unreadable, or a BLIND
 * COMPARATOR).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'tool-activator-coverage';

/**
 * Repo-RELATIVE, not absolute. The executed controls materialise a synthetic repo
 * root carrying these SAME paths, so the control drives the identical file
 * resolution the production run drives -- which is the setup the demonstrated
 * blindness used (a fake GA_GATE_REPO_ROOT), now turned against itself.
 */
const MATRIX_REL = 'apps/editor/src/engine/views/plantools/elementCreationMatrix.ts';
/**
 * EVERY production `runtime.tools.register` call site.
 *
 * ⭐ READING ONLY THE FIRST OF THESE IS HOW THIS GATE'S OWN AUTHOR GOT THE ANSWER
 * WRONG. Diffing the matrix against `ToolsAreaLayout.ts` alone reported SIX unbound
 * families; `PluginRegistry.ts` holds 27 further registrations and already binds two
 * of them (`furniture`, `lighting`), so the real pre-existing gap was FOUR
 * (`grid`, `lift`, `railing`, `stair-path`).
 *
 * ⛔ The over-count was not the dangerous half. Acting on it nearly shipped a SECOND
 * `lighting` registration — and `activators.set()` means the LAST one wins, so it
 * would have silently replaced PluginRegistry's activator (which CONSTRUCTS the
 * tool) with a bare call on whatever `window.lightingTool` happened to hold. A gate
 * that reads one of three sources does not merely miss things; it invites a fix that
 * breaks a working one.
 *
 * Keep this list complete. `grep -rln "tools\.register(" --include=*.ts --exclude-dir=node_modules apps packages plugins`
 * is the command that finds a new one.
 */
const REGISTER_RELS: readonly string[] = [
    'apps/editor/src/ui/layout/ToolsAreaLayout.ts',
    'apps/editor/src/PluginRegistry.ts',
];

/**
 * ARM A ceiling — shrink-only. This is a count of UNEXPLAINED gaps; the SETS are
 * what is compared, and this number only bounds how many set members may be
 * missing. 0 on the day it was written: five of the six gaps were wired
 * (L-4601), and the sixth is a NAMED exemption below.
 *
 * ⛔ SHRINK-ONLY. Never raise this. If a new family cannot have an activator,
 * name it in ACTIVATOR_EXEMPT with the reason — that is the honest move, and it
 * keeps the reason in the repo instead of in a number.
 */
/**
 * The env knob is NOT a relief valve. It exists so the self-announcing property
 * of the executed controls is DEMONSTRABLE: because the planted violation is
 * judged against this very value, raising it disarms the plant and the gate
 * exits 2 as a BLIND COMPARATOR rather than going green. Editing the literal has
 * exactly the same effect. There is no setting of this number that both hides a
 * gap and passes.
 */
const UNCOVERED_BASELINE = Number(process.env.PRYZM_TOOLACT_MAX_UNCOVERED ?? 0);

/**
 * Subject floors (RATCHET R5, lane W1b 2026-08-30).
 *
 * The guards in the Run section tested `size === 0`. Zero is the only value a
 * floor of zero can catch, and neither of these regexes fails all-or-nothing: the
 * matrix regex ALREADY silently skipped every indented block row once (see
 * declaredToolIds' leading-\s* note), which truncated the declared set without
 * emptying it. A floor at zero would not have noticed.
 *
 * Measured 2026-08-30: 24 declared matrix tool ids, 51 registered activator ids.
 * The floors sit well under both -- they fire when a SET COLLAPSES, not when a
 * family is retired.
 */
// Env-overridable for the same reason as UNCOVERED_BASELINE, and with the same
// consequence: LOWERING either floor silences the planted FLOOR arm below, so the
// gate exits 2. A floor that can be lowered without the gate noticing is the
// blindness this lane exists to close.
const MIN_DECLARED_TOOL_IDS = Number(process.env.PRYZM_TOOLACT_MIN_DECLARED ?? 15);
const MIN_REGISTERED_ACTIVATORS = Number(process.env.PRYZM_TOOLACT_MIN_REGISTERED ?? 30);

/**
 * Declared matrix ids that deliberately have NO activator, with the reason.
 *
 * ⭐ AN EXEMPTION IS A STATEMENT, NOT A SUPPRESSION. Each entry says why binding
 * an activator would be WORSE than leaving the id unbound — and the chat's
 * "NO ACTIVATOR registered" reply is the user-visible consequence, which is
 * true and therefore acceptable.
 */
const ACTIVATOR_EXEMPT: Readonly<Record<string, string>> = {
    // ⭐ EMPTY, AND THAT IS A CORRECTION. This map briefly carried `furniture`, with a
    // confident paragraph explaining why binding it would be wrong. The paragraph was
    // reasonable and the premise was false: `PluginRegistry.ts` registers `furniture`
    // and always did. The gate only "found" it unbound because it read one of three
    // register sites. `[[confident-register-rows-are-the-wrong-ones]]` — the
    // prose-justified entry was the wrong one; the honest blank is correct.
    //
    // The staleness check below would now fail on that entry, which is the property
    // worth keeping: an exemption whose gap has closed is a false statement, and this
    // gate refuses to hold one.
};

/**
 * Registered ids the matrix does not declare, and legitimately never will.
 * These are MODE-BOUND pseudo-families (`x:auto`) and family ALIASES retained so
 * existing callers keep working. ARM B allows exactly these.
 */
const PSEUDO_FAMILIES: ReadonlySet<string> = new Set([
    // ── PluginRegistry discipline/plugin tool ids ────────────────────────────
    // A DIFFERENT ID SPACE from the element-creation families, sharing one
    // activator Map. These are plugin surfaces (importers, viewers, AI panes),
    // not things `ELEMENT_CREATION_MATRIX` could ever declare a row for.
    // ⚠ `grid:tool` is NOT the matrix's `grid` — the colon is the whole
    // difference, and mistaking one for the other is what made `grid` look bound.
    'ai-floorplan', 'ai-query', 'ai-voice', 'annotation', 'bcf', 'cross',
    'dimension', 'dxf', 'export-pdf', 'grid:tool', 'ifc-export', 'ifc-import',
    'ifc-inspector', 'levels', 'multiplayer', 'navigate', 'plan-view', 'rooms',
    'schedules', 'section-view', 'selection', 'sheets', 'structural', 'toy-cube',
    'view',
    // ── ToolsAreaLayout mode-bound + alias families ──────────────────────────
    'ceiling:auto',   // the generic activator with mode 'auto' bound (L-918)
    'floor:auto',     // ditto
    'handrail',       // alias — the matrix spells this family `railing` (L-4601)
    'ramp',           // legacy window.rampTool bridge, no matrix row yet
    'room-bounding',  // RoomBoundingLineTool, a sibling tool not a creation family
    'room:level',     // detectRoomsForLevel, a bound-argument variant of `room`
]);


// ── Subject loading ──────────────────────────────────────────────────────────

function die(msg: string): never {
    console.error(`[${LABEL}] MISCONFIGURED (exit 2) — ${msg}`);
    process.exit(2);
}

/**
 * THROWS rather than exiting, so the executed controls can drive the same reader
 * over a synthetic root. Production wraps it and dies with exit 2, unchanged.
 */
function read(path: string, what: string): string {
    if (!existsSync(path)) throw new Error(`${what} not found at ${path}`);
    const src = readFileSync(path, 'utf8');
    if (src.trim() === '') throw new Error(`${what} is empty at ${path}`);
    return src;
}

/** Tool ids declared by ELEMENT_CREATION_MATRIX. */
function declaredToolIds(src: string): Set<string> {
    const out = new Set<string>();
    // Matches `tool: 'wall'` in BOTH row styles the matrix uses:
    //   inline  →  `{ tool: 'wall', label: 'Wall', …`
    //   block   →  `{\n        tool: 'railing', label: 'Railing',`
    //
    // ⚠ THE LEADING `\s*` IS LOAD-BEARING. Without it this regex anchored `^`
    // directly against `tool:` and silently skipped every INDENTED block row —
    // which is how `railing` (the one family this gate was written to catch)
    // read as "registered but not declared" on the gate's first run. ARM B
    // caught it, which is the only reason it is not still wrong. The CLEAN
    // control tree now carries three INDENTED block rows, so this is EXECUTED
    // on every run instead of asserted in a comment.
    for (const m of src.matchAll(/(?:^\s*|[{,]\s*)tool:\s*'([a-z][a-z0-9:-]*)'/gm)) {
        out.add(m[1]!);
    }
    return out;
}

/** Tool ids passed to runtime.tools.register(...), across every call site. */
function registeredToolIds(sources: readonly string[]): Set<string> {
    const out = new Set<string>();
    for (const src of sources) {
        for (const m of src.matchAll(/tools\.register\(\s*'([a-zA-Z][a-zA-Z0-9:._-]*)'/g)) {
            out.add(m[1]!);
        }
    }
    return out;
}

/**
 * A SUBJECT is everything the measurement is taken over: the two source sets and
 * the exemption map that speaks about them. The exemption map travels WITH the
 * subject — a control tree needs its own, or the STALE arm could never be
 * watched firing against a production map that is deliberately empty. The
 * BASELINE and the FLOORS do NOT travel with the subject: they stay production
 * values in every run, which is the whole point of the controls.
 */
interface Subject {
    readonly matrixSrc: string;
    readonly registerSrcs: readonly string[];
    readonly registerSiteCount: number;
    readonly exempt: Readonly<Record<string, string>>;
}

function loadSubject(root: string, exempt: Readonly<Record<string, string>>): Subject {
    const matrixSrc = read(join(root, MATRIX_REL), 'elementCreationMatrix.ts');
    const registerSrcs = REGISTER_RELS.map((rel) => read(join(root, rel), `register site ${rel}`));
    return { matrixSrc, registerSrcs, registerSiteCount: REGISTER_RELS.length, exempt };
}

// ── The arms ─────────────────────────────────────────────────────────────────

type Arm = 'ARM-A' | 'ARM-B' | 'STALE' | 'FLOOR-DECLARED' | 'FLOOR-REGISTERED';

const ALL_ARMS: readonly Arm[] = ['ARM-A', 'ARM-B', 'FLOOR-DECLARED', 'FLOOR-REGISTERED', 'STALE'];

interface Finding {
    readonly arm: Arm;
    readonly key: string;
    readonly detail: string;
}

interface Analysis {
    readonly declared: ReadonlySet<string>;
    readonly registered: ReadonlySet<string>;
    readonly uncovered: readonly string[];
    readonly exempted: readonly string[];
    readonly phantom: readonly string[];
    readonly stale: readonly string[];
    readonly findings: readonly Finding[];
}

/**
 * The whole measurement, over an arbitrary subject. Parameterised by the SUBJECT
 * only; the ceiling and the two floors are passed in so the controls can run at
 * the PRODUCTION values, never at relaxed fixture ones — a control judged by a
 * softer rule than the one that ships proves nothing about the one that ships.
 *
 * It COLLECTS floor breaches as findings instead of exiting on them. Production
 * still exits 2 on any FLOOR finding, before it reports anything else; the
 * difference is that a floor is now an arm that can be WATCHED FIRING.
 */
function analyse(
    subject: Subject,
    maxUncovered: number,
    minDeclared: number,
    minRegistered: number,
): Analysis {
    const declared = declaredToolIds(subject.matrixSrc);
    const registered = registeredToolIds(subject.registerSrcs);

    const findings: Finding[] = [];

    // FLOOR arms. §CONTEXT-DATA-HONESTY — "found nothing" and "nothing is wrong"
    // must not share a value, which is the exact failure this whole gate is about.
    if (declared.size < minDeclared) {
        findings.push({
            arm: 'FLOOR-DECLARED',
            key: `FLOOR-DECLARED::declared=${declared.size}<${minDeclared}`,
            detail:
                `found ${declared.size} declared tool id(s) in the matrix — floor is ${minDeclared}. `
                + 'The matrix regex has rotted against a refactor, so ARM A would compare against a truncated set.',
        });
    }
    if (registered.size < minRegistered) {
        findings.push({
            arm: 'FLOOR-REGISTERED',
            key: `FLOOR-REGISTERED::registered=${registered.size}<${minRegistered}`,
            detail:
                `found ${registered.size} registered activator id(s) across ${subject.registerSiteCount} site(s) — floor is ${minRegistered}. `
                + 'A truncated register sweep reports COVERED ids as uncovered, which is how this gate once nearly shipped a rival lighting registration.',
        });
    }

    const uncovered: string[] = [];
    const exempted: string[] = [];
    for (const id of [...declared].sort()) {
        if (registered.has(id)) continue;
        if (id in subject.exempt) { exempted.push(id); continue; }
        uncovered.push(id);
    }

    const phantom = [...registered]
        .filter((id) => !declared.has(id) && !PSEUDO_FAMILIES.has(id))
        .sort();

    // A stale exemption is itself a lie: it claims a gap that no longer exists.
    const stale = Object.keys(subject.exempt)
        .filter((id) => !declared.has(id) || registered.has(id))
        .sort();

    if (uncovered.length > maxUncovered) {
        findings.push({
            arm: 'ARM-A',
            key: `ARM-A::uncovered=${uncovered.length}>${maxUncovered}`,
            detail:
                `${uncovered.length} declared tool id(s) have NO registered activator (baseline ${maxUncovered}):\n`
                + uncovered.map((id) => `    · ${id}`).join('\n')
                + '\n  runtime.tools.activate() on these records an active-tool id and arms NOTHING.'
                + '\n  FIX: add runtime.tools.register(<id>, …) in apps/editor/src/ui/layout/ToolsAreaLayout.ts,'
                + '\n       or add the id to ACTIVATOR_EXEMPT in this file WITH THE REASON.'
                + '\n  ⛔ Do NOT raise UNCOVERED_BASELINE.',
        });
    }

    if (phantom.length > 0) {
        findings.push({
            arm: 'ARM-B',
            key: `ARM-B::phantom=${phantom.length}>0`,
            detail:
                `${phantom.length} registered id(s) match no declared family and are not a declared pseudo-family:\n`
                + phantom.map((id) => `    · ${id}`).join('\n')
                + '\n  Nothing resolves these ids, so the registration is dead wiring that LOOKS like coverage.'
                + '\n  FIX: add the row to ELEMENT_CREATION_MATRIX, or list it in PSEUDO_FAMILIES with a reason.',
        });
    }

    if (stale.length > 0) {
        findings.push({
            arm: 'STALE',
            key: `STALE::exemptions=${stale.length}>0`,
            detail:
                `${stale.length} STALE exemption(s) in ACTIVATOR_EXEMPT:\n`
                + stale.map((id) => `    · ${id}`).join('\n')
                + '\n  Each is either no longer declared by the matrix, or now HAS an activator.'
                + '\n  An exemption that no longer describes a real gap is a false statement in the repo. Delete it.',
        });
    }

    return { declared, registered, uncovered, exempted, phantom, stale, findings };
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

/** A matrix row in the INLINE style the real file uses for short rows. */
function inlineRow(id: string): string {
    return `    { tool: '${id}', label: '${id}', views: ['plan', '3d'] },`;
}

/** A matrix row in the INDENTED BLOCK style — the leading-\\s* defect's subject. */
function blockRow(id: string): string {
    return `    {\n        tool: '${id}', label: '${id}',\n        views: ['plan', '3d'],\n    },`;
}

function matrixFile(rows: readonly string[]): string {
    return `export const ELEMENT_CREATION_MATRIX = [\n${rows.join('\n')}\n];\n`
        + 'export function creationCapability(tool: string) { return tool; }\n';
}

function registerFile(ids: readonly string[]): string {
    return ids.map((id) => `        runtime.tools.register('${id}', () => {});`).join('\n') + '\n';
}

/**
 * PLANTED — every arm has a violation waiting for it.
 *
 *   3 declared ids   → under the live floor of 15  (FLOOR-DECLARED)
 *   4 registered ids → under the live floor of 30  (FLOOR-REGISTERED)
 *   ghost-family declared, never registered        (ARM-A)
 *   grid declared while only grid:tool registered  (ARM-A, the COLON case —
 *       and ARM-B must NOT call grid:tool a phantom, since it is a declared
 *       pseudo-family. One fixture, one arm proven firing and one proven silent.)
 *   phantom-tool registered, declared by nothing   (ARM-B)
 */
const PLANTED_MATRIX = matrixFile([
    inlineRow('wall'),
    blockRow('railing'),
    inlineRow('grid'),
    blockRow('ghost-family'),
]);
const PLANTED_REGISTER_A = registerFile(['wall', 'railing', 'grid:tool']);
const PLANTED_REGISTER_B = registerFile(['phantom-tool']);
/** Both legs of the staleness disjunction: HAS an activator · NO LONGER declared. */
const PLANTED_EXEMPT: Readonly<Record<string, string>> = {
    wall: 'stale — wall HAS an activator, so this exemption is a false statement',
    'defunct-family': 'stale — the matrix no longer declares this family',
};

/**
 * CLEAN — 18 declared / 33 registered, 0 findings, and it carries every
 * false-positive shape this gate has RECORDED:
 *   • three INDENTED BLOCK rows (curtain-wall, railing, stair). Drop the leading
 *     \\s* and the declared set truncates below the floor: loud, not silent.
 *   • `lighting` registered ONLY in the second site — reading one of two files
 *     reports a COVERED family as uncovered, the over-count that nearly shipped
 *     a rival lighting registration.
 *   • pseudo-families registered and undeclared (grid:tool, handrail,
 *     ceiling:auto, floor:auto, ramp, room-bounding, room:level, and the
 *     PluginRegistry discipline ids) — ARM B must call none of them phantoms.
 *   • `grid` declared AND registered alongside `grid:tool` — the colon pair
 *     coexisting, which is the live arrangement.
 *   • a NAMED exemption (legacy-family): declared, unbound, and therefore
 *     neither uncovered nor stale.
 */
const CLEAN_INLINE = ['wall', 'door', 'window', 'slab', 'roof', 'column', 'beam', 'grid',
    'lighting', 'furniture', 'lift', 'stair-path', 'pool', 'balcony', 'legacy-family'];
const CLEAN_BLOCK = ['railing', 'stair', 'curtain-wall'];
const CLEAN_MATRIX = matrixFile([
    ...CLEAN_INLINE.map(inlineRow),
    ...CLEAN_BLOCK.map(blockRow),
]);
const CLEAN_REGISTER_A = registerFile([
    'wall', 'door', 'window', 'slab', 'roof', 'column', 'beam', 'grid',
    'furniture', 'lift', 'stair-path', 'pool', 'balcony',
    'railing', 'stair', 'curtain-wall',
    'grid:tool', 'handrail', 'ceiling:auto', 'floor:auto', 'ramp', 'room-bounding', 'room:level',
]);
const CLEAN_REGISTER_B = registerFile([
    'lighting',
    'ai-floorplan', 'ai-query', 'ai-voice', 'annotation', 'bcf', 'cross', 'dimension',
    'dxf', 'export-pdf',
]);
const CLEAN_EXEMPT: Readonly<Record<string, string>> = {
    'legacy-family': 'declared for the palette, deliberately unbound — the chat NO ACTIVATOR reply is the correct answer',
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
        writeTree(join(base, 'planted'), {
            [MATRIX_REL]: PLANTED_MATRIX,
            [REGISTER_RELS[0]!]: PLANTED_REGISTER_A,
            [REGISTER_RELS[1]!]: PLANTED_REGISTER_B,
        });
        writeTree(join(base, 'clean'), {
            [MATRIX_REL]: CLEAN_MATRIX,
            [REGISTER_RELS[0]!]: CLEAN_REGISTER_A,
            [REGISTER_RELS[1]!]: CLEAN_REGISTER_B,
        });

        // ⭐ THE PRODUCTION BASELINE AND THE PRODUCTION FLOORS, in both controls.
        // Relaxing them here would make the controls prove something other than
        // what ships — and would remove the property that raising a threshold
        // disarms the plant and exits 2 instead of going green.
        const bad = analyse(
            loadSubject(join(base, 'planted'), PLANTED_EXEMPT),
            UNCOVERED_BASELINE, MIN_DECLARED_TOOL_IDS, MIN_REGISTERED_ACTIVATORS,
        );
        const good = analyse(
            loadSubject(join(base, 'clean'), CLEAN_EXEMPT),
            UNCOVERED_BASELINE, MIN_DECLARED_TOOL_IDS, MIN_REGISTERED_ACTIVATORS,
        );

        const fired = new Set(bad.findings.map((f) => f.arm));
        armsFired = [...fired].sort();
        lines.push(`Negative control (planted tree): ${bad.findings.length} finding(s), arms fired [${armsFired.join(', ')}]`);
        for (const f of bad.findings) lines.push(`    ✓ ${f.arm} fired — ${f.key}`);
        for (const arm of ALL_ARMS) {
            if (!fired.has(arm)) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`);
            }
        }

        // NAMING, not merely counting. A count that loses the name is how this
        // gate's own author read six unbound families where there were four, and
        // nearly clobbered a working lighting activator on the strength of it.
        lines.push(`    planted uncovered named: [${bad.uncovered.join(', ') || 'NONE'}] · planted phantom named: [${bad.phantom.join(', ') || 'NONE'}] · planted stale named: [${bad.stale.join(', ') || 'NONE'}]`);
        for (const want of ['ghost-family', 'grid']) {
            if (!bad.uncovered.includes(want)) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — ARM-A did not name the planted uncovered id ${want}.`);
            }
        }
        if (!bad.phantom.includes('phantom-tool')) {
            ok = false;
            lines.push('    ✗ BLIND COMPARATOR — ARM-B did not name the planted phantom id phantom-tool.');
        }
        // The colon case, proven in BOTH directions on one fixture: grid:tool
        // must not cover `grid` (above), and must not itself be a phantom.
        if (bad.phantom.includes('grid:tool')) {
            ok = false;
            lines.push('    ✗ FALSE POSITIVE — ARM-B called the declared pseudo-family grid:tool a phantom.');
        }
        for (const want of ['defunct-family', 'wall']) {
            if (!bad.stale.includes(want)) {
                ok = false;
                lines.push(`    ✗ BLIND COMPARATOR — STALE did not name the planted stale exemption ${want}.`);
            }
        }

        lines.push(
            `Positive control (clean tree — indented block rows, second register site, `
            + `pseudo-families, a named exemption): ${good.findings.length} finding(s) — must be 0`,
        );
        lines.push(
            `    clean tree read: ${good.declared.size} declared · ${good.registered.size} registered · `
            + `${good.uncovered.length} uncovered · ${good.phantom.length} phantom · `
            + `${good.exempted.length} exemption(s) [${good.exempted.join(', ')}]`,
        );
        for (const f of good.findings) lines.push(`    ✗ FALSE POSITIVE — ${f.key}: ${f.detail}`);
        if (good.findings.length > 0) ok = false;
        // The block-row guard, asserted by NAME as well as by count: a truncated
        // matrix regex drops exactly these three and nothing else would say so.
        for (const want of CLEAN_BLOCK) {
            if (!good.declared.has(want)) {
                ok = false;
                lines.push(`    ✗ TRUNCATED SUBJECT — the matrix regex missed the INDENTED block row ${want}; the leading \\s* is gone.`);
            }
        }
        // The multi-site guard: `lighting` lives only in the second register file.
        if (!good.registered.has('lighting')) {
            ok = false;
            lines.push(`    ✗ TRUNCATED SUBJECT — the register sweep missed ${REGISTER_RELS[1]}; a COVERED family would read as uncovered.`);
        }
        if (good.exempted.length !== 1 || good.stale.length !== 0) {
            ok = false;
            lines.push(`    ✗ MISCOUNT — the clean tree has exactly 1 live exemption and 0 stale; the gate read ${good.exempted.length} / ${good.stale.length}.`);
        }
    } catch (e) {
        ok = false;
        lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
    } finally {
        rmSync(base, { recursive: true, force: true });
    }
    return { ok, lines, armsFired };
}

// ── Run ──────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

let subject: Subject;
try {
    subject = loadSubject(REPO_ROOT, ACTIVATOR_EXEMPT);
} catch (e) {
    die((e as Error).message);
}

const a = analyse(subject, UNCOVERED_BASELINE, MIN_DECLARED_TOOL_IDS, MIN_REGISTERED_ACTIVATORS);

// A breached FLOOR still exits 2 BEFORE anything else is reported: a reading
// taken over a truncated subject is not a reading, and printing it as one is the
// defect. Unchanged behaviour — it is simply an arm now, not a bare guard.
const floorFindings = a.findings.filter((f) => f.arm === 'FLOOR-DECLARED' || f.arm === 'FLOOR-REGISTERED');
if (floorFindings.length > 0) die(floorFindings.map((f) => f.detail).join('\n'));

console.log(
    `\n[${LABEL}] ${a.declared.size} declared matrix tool id(s) (floor ${MIN_DECLARED_TOOL_IDS}) · ` +
    `${a.registered.size} registered activator id(s) (floor ${MIN_REGISTERED_ACTIVATORS}) · ` +
    `${a.exempted.length} named exemption(s) · ` +
    `ARM A uncovered ${a.uncovered.length}/${UNCOVERED_BASELINE} · ` +
    `ARM B phantom ${a.phantom.length}/0`,
);

if (a.exempted.length > 0) {
    console.log(`[${LABEL}] NAMED exemptions (declared, deliberately unbound):`);
    for (const id of a.exempted) console.log(`    · ${id} — ${ACTIVATOR_EXEMPT[id]}`);
}

for (const f of a.findings) console.error(`\n[${LABEL}] FAIL ${f.arm} — ${f.detail}`);

if (a.uncovered.length < UNCOVERED_BASELINE) {
    console.log(
        `[${LABEL}] ARM A improved — ratchet UNCOVERED_BASELINE down to ${a.uncovered.length}.`,
    );
}

// A blind comparator is a MISCONFIGURATION, not a pass and not a violation. It is
// checked AFTER the real reading is printed and BEFORE the real reading is
// believed: whatever appears above is unproven if the arms behind it were never
// watched firing, and this file has a demonstrated false green on its record.
if (!control.ok) {
    console.error(
        `\n[${LABEL}] MISCONFIGURED (exit 2) — BLIND COMPARATOR. The executed controls did not ` +
        `establish that this gate's arms fire.\n` +
        `  A fake repo root with a 2-id matrix and 3 registrations once printed "ARM A uncovered 0/0 — OK"\n` +
        `  from this very file. A subject floor proves the walk FOUND FILES; only these controls prove the\n` +
        `  PREDICATE MATCHES ITS SUBJECT. If a threshold was raised or a floor lowered, that is the cause:\n` +
        `  the plant is judged at the live values, so relaxing one disarms it. Restore it — do not relax further.`,
    );
    process.exit(2);
}

if (a.findings.length > 0) process.exit(1);

// ⛔ EVERY NUMBER ON THIS LINE IS MEASURED.
console.log(
    `[${LABEL}] OK — every declared tool id is wired or named ` +
    `(${a.declared.size} declared · ${a.registered.size} registered · ` +
    `${a.uncovered.length}/${UNCOVERED_BASELINE} uncovered · ${a.phantom.length}/0 phantom), ` +
    `controls: arms proven to fire [${control.armsFired.join(', ')}].`,
);
