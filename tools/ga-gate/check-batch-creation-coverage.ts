#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-batch-creation-coverage.ts
 *
 * §PERF2-BATCH-COVERAGE (L-1151) — **live batch-catalogue entries whose command
 * loops over elements OUTSIDE a `batchCoordinator` batch.** Target exit: ZERO,
 * against a NAMED ledger.
 *
 * ─── The defect class ───────────────────────────────────────────────────────
 * `BatchCoordinator` exists because bulk creation without it avalanches. When a
 * creation loop runs with `batchCoordinator.isBatching === false`, every single
 * element pays:
 *
 *   1. TWO full `scene.traverse()` passes. `apps/editor/src/engine/initScene.ts`
 *      answers every `bim-*-added` event with `collectNewPbrMeshes` + a tier
 *      `countMeshes`, deferred ONLY when
 *      `shouldDeferPerAddGeometryPass(batchCoordinator.isBatching)` says so
 *      (`apps/editor/src/engine/perAddGeometryGate.ts:36`). The scene is still
 *      GROWING, so N elements cost O(N^2) node visits. Lane INSTR1 measured the
 *      shape directly: 367 unbatched adds -> **734 ACTUAL traversals**; the same
 *      367 batched -> **0 actual, 367 deferred**.
 *   2. `RoomTopologyObserver._scheduleRedetect` cannot see a batch, so its
 *      starvation guard force-fires REDETECT_ROOMS mid-loop — the recorded
 *      "10 registrations -> 91 REDETECT_ROOMS -> 28 LONGTASKs -> ~2,493 ms".
 *   3. `ViewDependencyTracker` dirties dependent views per element, so
 *      EdgeProjectorService re-projects the level per element.
 *   4. `storeEventBus` never buffers: N adds are N flushes, not one.
 *
 * ─── WHY A GATE AND NOT JUST A FIX ─────────────────────────────────────────
 * ⭐ THIS DEFECT HAS ALREADY RECURRED ONCE, INSIDE ITS OWN FIX.
 * `CreateWallsOnAllSlabsCommand.ts` carries fifty lines diagnosing exactly this
 * failure and wrapping ITS loop in `runBatch`. The per-slab command it calls —
 * `CreateWallsFromSlabCommand`, which has its own live catalogue button — was
 * left naked. So the fix held when the user asked for ALL slabs and evaporated
 * the moment they picked ONE, and it stayed that way until the founder's
 * 367-element gesture froze the viewport for 32.7 seconds.
 *
 * A fix repairs one command. Nothing stopped the next one being written the same
 * way, and nothing did. That is what this file is for.
 *
 * ─── WHY A NAMED LEDGER AND NOT A COUNT ────────────────────────────────────
 * A numeric ratchet ("at most 4 unbatched") is satisfiable by FIXING one command
 * and REGRESSING another — the count holds while the repo gets no better. The
 * tolerated set is therefore listed BY NAME below, which makes both directions
 * fail loudly:
 *   • a command not on the ledger that loops unbatched  -> FAIL (regression)
 *   • a command ON the ledger that no longer loops unbatched -> FAIL (paid debt
 *     must leave the ledger, or the ledger rots into a list of things that are
 *     secretly fine — `gate-debt.json` rule 2, applied one level down)
 *
 * ─── Honesty floor ──────────────────────────────────────────────────────────
 * This gate reads ONE file to find its subjects, so the "scanned nothing and
 * passed" failure mode is acute. Three floors guard it, each exiting 2 (never
 * 0): the catalogue must parse, it must yield at least MIN_LIVE_ENTRIES live
 * entries, and every class named by a live entry must RESOLVE to a source file.
 * An unresolvable class is exit 2 — "I could not tell", which is a different
 * value from "it is batched".
 *
 * ─── Governance ─────────────────────────────────────────────────────────────
 * C11 §4.2 — workflows creating multiple elements MUST use
 * `BatchCoordinator.runBatch()`. C16 §8.7 — N2 JOIN is the correct shape for a
 * command dispatched inside a live batch. C17 §10 — every catalogue entry
 * dispatches the legacy command, so the catalogue is the authoritative list of
 * user-reachable bulk creation. ADR-0314 — `runBatch` is undo-NEUTRAL, so
 * adding it never changes the undo-entry count.
 *
 * Exit codes: 0 = ledger exact · 1 = ledger violated (either direction) ·
 * 2 = the scan could not form an opinion.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'batch-creation-coverage';

const CATALOGUE = 'apps/editor/src/ui/create/batchCatalogue.ts';

/**
 * The floor. The catalogue carries 16 live entries today; 10 is low enough that
 * deliberately retiring entries does not trip it, and high enough that a parse
 * that silently matched nothing cannot pass as "all clear".
 */
const MIN_LIVE_ENTRIES = 10;

/**
 * The SECOND subject (lane W1b, 2026-08-30). `indexCommandFiles` walks packages/,
 * plugins/ and apps/ for `*Command.ts` declarations; 307 classes are indexed
 * today. If that walk collapsed, every class named by a live entry would land in
 * `unresolved` and the gate would exit 2 -- correct, but only by accident, and only
 * while the catalogue itself is non-empty. Floored explicitly so the
 * misconfiguration is NAMED rather than inferred.
 */
const MIN_INDEXED_COMMAND_CLASSES = 150;

/**
 * ─── THE LEDGER ─────────────────────────────────────────────────────────────
 * Commands reachable from a LIVE catalogue entry that loop over elements without
 * a batch. Every line is a known cost, measured 2026-08-19, kept because the
 * file sits inside another lane's active fence or because its per-element cost
 * does not reach the geometry gate.
 *
 * SHRINK-ONLY. Fix one, delete its line in the same commit. Do not add a line
 * without an explicit decision — adding one is choosing to ship the avalanche.
 *
 * ─── PAID AND REMOVED (never re-add without a new measurement) ──────────────
 * • `CreateCurtainWallsFromSlabCommand` — removed 2026-08-30 (lane W2-A). Paid by
 *   `6de40a8b` (§CW4-CW-BY-SLAB-BATCH, L-1162), which wrapped the panel loop in
 *   `_createCurtainWalls` and gave it the two-arm bracket at
 *   `CreateCurtainWallsFromSlabCommand.ts:275` — `isBatching` JOINs, else
 *   `runBatch({ levelIds, totalElementCount })`. The commit landed the FIX but
 *   left this line behind, so the gate correctly reported good news as FAIL for
 *   eleven days. That is the ledger working, not the ledger broken.
 *   The other three lines were RE-MEASURED in the same pass and are STILL REAL:
 *   none of the three files contains the string `batchCoordinator` at all
 *   (`grep -n 'batchCoordinator\|runBatch\|isBatching'` -> no match in each), and
 *   each still dispatches a child command per element inside `execute()`.
 */
const LEDGER: ReadonlyMap<string, string> = new Map([
  ['CreateAllSlabsFromLevelToTopLevelCommand',
   'slabs.from-level-to-top — fires bim-slab-added per slab. packages/command-registry/src/slabs/ ' +
   'has lane SL2 work in flight (C92).'],
  ['CreateMultipleLevelsCommand',
   'levels.create-n — creates levels + plan views, NOT bim-*-added geometry, so it does not reach ' +
   'the per-add geometry gate. Lower impact; still N unbuffered store writes.'],
  ['CreateGridSystemCommand',
   'grid.create-system — creates grid lines, which are not in initScene\'s _rpcGeomEvents list, ' +
   'so it does not reach the per-add geometry gate. Lower impact.'],
]);

// ── source index ───────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'attached_assets', 'coverage']);

/**
 * Index by DECLARATION, not by filename.
 *
 * ⭐ The filename shortcut is what this gate caught on its first run, in its own
 * scaffolding: `ReplicateSelectedSlabToAllLevelsCommand` is declared inside
 * `CreateSlabOnLevelSimilarToSelectedCommand.ts`. A filename index reports that
 * class as NOT-FOUND — and a gate that treated NOT-FOUND as "fine" would have
 * scored a live catalogue entry as clean while never having looked at it.
 * Reading the `class` keyword is the only index that cannot be defeated by a
 * rename, and a file may declare several commands.
 */
function indexCommandFiles(roots: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  const decl = /(?:^|\n)\s*(?:export\s+)?(?:abstract\s+)?class\s+([A-Z][A-Za-z0-9_]*Command)\b/g;
  const walk = (dir: string): void => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.ts') || e.name.endsWith('.d.ts')) continue;
      if (e.name.includes('.test.') || e.name.includes('.spec.')) continue;
      let src: string;
      try { src = readFileSync(p, 'utf8'); } catch { continue; }
      if (!src.includes('Command')) continue;
      decl.lastIndex = 0;
      for (let m = decl.exec(src); m !== null; m = decl.exec(src)) {
        if (!index.has(m[1])) index.set(m[1], p);
      }
    }
  };
  for (const r of roots) walk(join(REPO_ROOT, r));
  return index;
}

/** Strip line- and block-comment lines so a class that merely DISCUSSES runBatch
 *  in prose is never scored as calling it. (The rot this gate exists to catch is
 *  documentation that outran the code — it must not be fooled by documentation.) */
function stripCommentLines(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
    })
    .join('\n');
}

type Verdict = 'BATCHED' | 'UNBATCHED-LOOP' | 'NO-LOOP' | 'NO-EXECUTE';

/**
 * Extract the body of the class's `execute(` method by brace-matching.
 *
 * ⭐ WHY PER-METHOD AND NOT PER-FILE. The first cut of this gate tested the
 * WHOLE FILE for "has a loop" AND "has a mutation" and reported
 * `ReplicateSelectedSlabToAllLevelsCommand` as an unbatched loop. It is not:
 * its `execute()` creates exactly ONE slab, and its only `for` loop is in
 * `undo()`, walking `createdCommands` backwards. The gate had matched a loop in
 * one method against a mutation in another and called that a finding — a census
 * that grepped one spelling and believed itself.
 *
 * `execute()` is the correct unit because it is precisely what a batch must
 * wrap. Sub-loops written as closures (`_processSlabs`, `_createWalls`) are
 * declared inside `execute()`, so they are inside this body too.
 */
function executeBody(code: string): string | null {
  const m = /\n\s*execute\s*\([^)]*\)\s*(?::[^{]*)?\{/.exec(code);
  if (!m) return null;
  const open = code.indexOf('{', m.index + m[0].length - 1);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return null;
}

function classify(file: string): Verdict {
  const code = stripCommentLines(readFileSync(file, 'utf8'));
  if (/batchCoordinator\s*\.\s*runBatch\s*\(/.test(code)) return 'BATCHED';
  const body = executeBody(code);
  // "I could not find execute()" is a THIRD value. It is not NO-LOOP, and
  // reporting it as one would be the same substitution this gate exists to stop.
  if (body === null) return 'NO-EXECUTE';
  const loops = /\bfor\s*\(|\bwhile\s*\(|\.forEach\s*\(/.test(body);
  const mutates = /\.execute\(\s*context\s*\)|Store\s*\.\s*add\s*\(|store\s*\.\s*add\s*\(/.test(body);
  return loops && mutates ? 'UNBATCHED-LOOP' : 'NO-LOOP';
}

// ── catalogue parse ────────────────────────────────────────────────────────
interface Entry { id: string; status: string; classes: string[]; }

function parseCatalogue(src: string): Entry[] {
  const out: Entry[] = [];
  for (const block of src.split(/catalogId:/).slice(1)) {
    const id = /^\s*'([^']+)'/.exec(block)?.[1];
    const status = /status:\s*'([^']+)'/.exec(block)?.[1];
    if (!id || !status) continue;
    const bi = block.indexOf('build:');
    const buildSrc = bi >= 0 ? block.slice(bi, bi + 900) : '';
    const classes = [...new Set(
      [...buildSrc.matchAll(/new\s+([A-Z][A-Za-z0-9_]*Command)\s*\(/g)].map((m) => m[1]),
    )];
    out.push({ id, status, classes });
  }
  return out;
}

const rel = (abs: string): string => relative(REPO_ROOT, abs).split(sep).join('/');

function main(): number {
  let src: string;
  try {
    src = readFileSync(join(REPO_ROOT, CATALOGUE), 'utf8');
  } catch (err) {
    console.error(`[${LABEL}] EXIT 2 — could not read the catalogue at ${CATALOGUE}: ${String(err)}`);
    console.error(`[${LABEL}] This gate has no subjects without it. That is "I cannot tell", not "clean".`);
    return 2;
  }

  const entries = parseCatalogue(src);
  const liveEntries = entries.filter((e) => e.status === 'live');
  if (liveEntries.length < MIN_LIVE_ENTRIES) {
    console.error(
      `[${LABEL}] EXIT 2 — parsed only ${liveEntries.length} live entries from ${CATALOGUE} ` +
      `(floor ${MIN_LIVE_ENTRIES}, ${entries.length} total parsed).`,
    );
    console.error(`[${LABEL}] Either the catalogue shape changed or the parse is broken. Not a pass.`);
    return 2;
  }

  const index = indexCommandFiles(['packages', 'plugins', 'apps']);
  if (index.size < MIN_INDEXED_COMMAND_CLASSES) {
    console.error(
      `[${LABEL}] EXIT 2 — indexed only ${index.size} command class(es) across packages/, plugins/, apps/ ` +
      `(floor ${MIN_INDEXED_COMMAND_CLASSES}).`,
    );
    console.error(`[${LABEL}] The walk, not the repo, is what changed. "I could not tell" is not "everything batches".`);
    return 2;
  }

  const unresolved: Array<{ id: string; cls: string; why: string }> = [];
  const unbatched = new Map<string, { file: string; entries: string[] }>();
  const batched = new Set<string>();

  for (const e of liveEntries) {
    for (const cls of e.classes) {
      const file = index.get(cls);
      if (!file) { unresolved.push({ id: e.id, cls, why: 'no <class> declaration found in packages/, plugins/ or apps/' }); continue; }
      const v = classify(file);
      if (v === 'NO-EXECUTE') { unresolved.push({ id: e.id, cls, why: `no execute() body found in ${rel(file)}` }); continue; }
      if (v === 'BATCHED') { batched.add(cls); continue; }
      if (v === 'NO-LOOP') continue;
      const cur = unbatched.get(cls) ?? { file: rel(file), entries: [] };
      cur.entries.push(e.id);
      unbatched.set(cls, cur);
    }
  }

  console.log(
    `[${LABEL}] live catalogue entries: ${liveEntries.length} (floor ${MIN_LIVE_ENTRIES}) · ` +
    `command classes indexed: ${index.size} (floor ${MIN_INDEXED_COMMAND_CLASSES}) · ` +
    `batched: ${batched.size} · unbatched loops: ${unbatched.size}`,
  );

  if (unresolved.length > 0) {
    console.error(
      `\n[${LABEL}] EXIT 2 — ${unresolved.length} class(es) named by a live entry did not resolve ` +
      `to a source file, so this gate cannot say whether they batch:\n`,
    );
    for (const u of unresolved) console.error(`  ${u.id} -> ${u.cls}
      ${u.why}`);
    console.error(
      '\n  A class this gate cannot find is UNMEASURED, which is a different value from BATCHED.\n' +
      '  Either the class was renamed/inlined, or it lives in a file whose name does not match it.\n',
    );
    return 2;
  }

  // ── the ledger, both directions ──────────────────────────────────────────
  const newViolations = [...unbatched.keys()].filter((c) => !LEDGER.has(c)).sort();
  const paidDebt = [...LEDGER.keys()].filter((c) => !unbatched.has(c)).sort();

  if (newViolations.length === 0 && paidDebt.length === 0) {
    console.log(
      `[${LABEL}] OK: ${unbatched.size} unbatched creation loop(s), exactly the ${LEDGER.size} on the ` +
      `named ledger. No new avalanche path.`,
    );
    return 0;
  }

  if (newViolations.length > 0) {
    console.error(
      `\n[${LABEL}] FAIL: ${newViolations.length} command(s) reachable from a LIVE catalogue entry ` +
      `loop over elements with NO batchCoordinator batch, and are not on the ledger.\n`,
    );
    for (const cls of newViolations) {
      const u = unbatched.get(cls)!;
      console.error(`  ${cls}`);
      console.error(`      ${u.file}`);
      console.error(`      reached by: ${u.entries.join(', ')}`);
    }
    console.error(
      '\n  Every element created by these pays TWO full scene.traverse() passes over a GROWING\n' +
      '  scene (perAddGeometryGate.ts:36 -> initScene), a per-element REDETECT_ROOMS force-fire,\n' +
      '  a per-element view re-projection, and its own event flush. INSTR1 measured 367 unbatched\n' +
      '  adds as 734 actual traversals; batched, the same 367 cost 0.\n' +
      '\n  THE FIX (C11 §4.2, C16 §8.7 N2 — and runBatch is undo-NEUTRAL, ADR-0314, so the undo\n' +
      '  entry count does not change):\n' +
      '\n      const _create = () => { /* the existing loop, unmoved */ };\n' +
      '      if (batchCoordinator.isBatching) _create();          // JOIN a live batch\n' +
      '      else batchCoordinator.runBatch(_create, { levelIds, totalElementCount });\n' +
      '\n  The isBatching test is required, not optional: these commands have two callers, and a\n' +
      '  nested runBatch inside a live batch is re-entrant. Reference implementations:\n' +
      '    packages/command-registry/src/walls/CreateWallsFromSlabCommand.ts (§PERF2-WALLS-BY-SLAB-BATCH)\n' +
      '    packages/command-registry/src/lighting/CreateLightingByRoomCommand.ts (§FLOOR-BATCH-JOIN)\n',
    );
  }

  if (paidDebt.length > 0) {
    console.error(
      `\n[${LABEL}] FAIL: ${paidDebt.length} ledger entr(ies) no longer loop unbatched — the debt was\n` +
      `  paid but the line was left behind:\n`,
    );
    for (const cls of paidDebt) console.error(`  ${cls}  — ${LEDGER.get(cls)}`);
    console.error(
      '\n  Delete these from LEDGER in this file, in the same commit that fixed them. A ledger that\n' +
      '  keeps paid debt rots into a list of things that are secretly fine, and then it can no\n' +
      '  longer tell anyone anything (gate-debt.json rule 2).\n',
    );
  }

  return 1;
}

// exit 2 == the scan could not form an opinion, spelled LITERALLY (lane W1b).
// main() returns 2 from four places -- an unreadable catalogue, a catalogue under
// MIN_LIVE_ENTRIES, an index under MIN_INDEXED_COMMAND_CLASSES, and an
// unresolvable class -- and `process.exit(main())` alone made none of them visible
// to a reader checking whether those floors are enforced at all.
const rc = main();
if (rc === 2) process.exit(2);
process.exit(rc);
