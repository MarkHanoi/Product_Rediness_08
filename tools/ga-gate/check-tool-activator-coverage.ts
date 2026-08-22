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
 * Exit codes: 0 OK · 1 FAIL (a ratchet breached / a phantom found) · 2 MISCONFIGURED.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'tool-activator-coverage';

const MATRIX_FILE = join(
    REPO_ROOT,
    'apps/editor/src/engine/views/plantools/elementCreationMatrix.ts',
);
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
const REGISTER_FILES = [
    join(REPO_ROOT, 'apps/editor/src/ui/layout/ToolsAreaLayout.ts'),
    join(REPO_ROOT, 'apps/editor/src/PluginRegistry.ts'),
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
const UNCOVERED_BASELINE = 0;

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

function die(msg: string): never {
    console.error(`[${LABEL}] MISCONFIGURED (exit 2) — ${msg}`);
    process.exit(2);
}

function read(path: string, what: string): string {
    if (!existsSync(path)) die(`${what} not found at ${path}`);
    const src = readFileSync(path, 'utf8');
    if (src.trim() === '') die(`${what} is empty at ${path}`);
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
    // caught it, which is the only reason it is not still wrong.
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

// ── Run ──────────────────────────────────────────────────────────────────────

const matrixSrc = read(MATRIX_FILE, 'elementCreationMatrix.ts');
const registerSrcs = REGISTER_FILES.map((f) => read(f, `register site ${f}`));

const declared = declaredToolIds(matrixSrc);
const registered = registeredToolIds(registerSrcs);

// A MISCONFIGURED guard, not a check: if either sweep finds nothing, the regexes
// have rotted against a refactor and a "0 gaps" reading would be meaningless.
// §CONTEXT-DATA-HONESTY — "found nothing" and "nothing is wrong" must not share
// a value, which is the exact failure this whole gate is about.
if (declared.size === 0) die('found ZERO declared tool ids — the matrix regex has rotted.');
if (registered.size === 0) die('found ZERO register() calls — the register regex has rotted.');

const uncovered: string[] = [];
const exempted: string[] = [];
for (const id of [...declared].sort()) {
    if (registered.has(id)) continue;
    if (id in ACTIVATOR_EXEMPT) { exempted.push(id); continue; }
    uncovered.push(id);
}

const phantom = [...registered]
    .filter((id) => !declared.has(id) && !PSEUDO_FAMILIES.has(id))
    .sort();

// A stale exemption is itself a lie: it claims a gap that no longer exists.
const staleExemptions = Object.keys(ACTIVATOR_EXEMPT)
    .filter((id) => !declared.has(id) || registered.has(id))
    .sort();

console.log(
    `[${LABEL}] ${declared.size} declared matrix tool id(s) · ` +
    `${registered.size} registered activator id(s) · ` +
    `${exempted.length} named exemption(s) · ` +
    `ARM A uncovered ${uncovered.length}/${UNCOVERED_BASELINE} · ` +
    `ARM B phantom ${phantom.length}/0`,
);

if (exempted.length > 0) {
    console.log(`[${LABEL}] NAMED exemptions (declared, deliberately unbound):`);
    for (const id of exempted) console.log(`    · ${id} — ${ACTIVATOR_EXEMPT[id]}`);
}

let failed = false;

if (uncovered.length > UNCOVERED_BASELINE) {
    failed = true;
    console.error(
        `\n[${LABEL}] ARM A FAIL — ${uncovered.length} declared tool id(s) have NO registered activator ` +
        `(baseline ${UNCOVERED_BASELINE}):\n` +
        uncovered.map((id) => `    · ${id}`).join('\n') +
        '\n  runtime.tools.activate() on these records an active-tool id and arms NOTHING.' +
        '\n  FIX: add runtime.tools.register(\'<id>\', …) in apps/editor/src/ui/layout/ToolsAreaLayout.ts,' +
        '\n       or add the id to ACTIVATOR_EXEMPT in this file WITH THE REASON.' +
        '\n  ⛔ Do NOT raise UNCOVERED_BASELINE.',
    );
} else if (uncovered.length < UNCOVERED_BASELINE) {
    console.log(
        `[${LABEL}] ARM A improved — ratchet UNCOVERED_BASELINE down to ${uncovered.length}.`,
    );
}

if (phantom.length > 0) {
    failed = true;
    console.error(
        `\n[${LABEL}] ARM B FAIL — ${phantom.length} registered id(s) match no declared family ` +
        'and are not a declared pseudo-family:\n' +
        phantom.map((id) => `    · ${id}`).join('\n') +
        '\n  Nothing resolves these ids, so the registration is dead wiring that LOOKS like coverage.' +
        '\n  FIX: add the row to ELEMENT_CREATION_MATRIX, or list it in PSEUDO_FAMILIES with a reason.',
    );
}

if (staleExemptions.length > 0) {
    failed = true;
    console.error(
        `\n[${LABEL}] FAIL — ${staleExemptions.length} STALE exemption(s) in ACTIVATOR_EXEMPT:\n` +
        staleExemptions.map((id) => `    · ${id}`).join('\n') +
        '\n  Each is either no longer declared by the matrix, or now HAS an activator.' +
        '\n  An exemption that no longer describes a real gap is a false statement in the repo. Delete it.',
    );
}

if (failed) process.exit(1);

console.log(`[${LABEL}] OK — every declared tool id is wired or named.`);
