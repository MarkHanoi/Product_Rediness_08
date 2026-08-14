#!/usr/bin/env tsx
/**
 * tools/ga-gate/check-verb-register.ts
 *
 * §VERB-REGISTER — C69. The API verb register is GENERATED from the code and
 * DIFFED against the committed artefact. It is never hand-maintained.
 *
 * ─── Why this is a generator and not a list ──────────────────────────────────
 *
 * The founder asked for "all the API verbs documented in a contractual document…
 * whenever a new one is added it should be added there." The obvious build is a
 * markdown table somebody updates. This repository has spent months proving that
 * artefact rots, in writing, in its own governance documents:
 *
 *   • `CLAUDE.md` said the contract suite was C01–C15; it is C01–C68. Fifty-three
 *     contracts sat outside the stated conflict-resolution order, two of them
 *     CANONICAL and binding on every capability PR.
 *   • Four mutually inconsistent NFT target sets existed at once; benches asserted
 *     their own headers and passed while missing the contract by 10×.
 *   • `check-layer-boundaries.ts` — the file the strategy docs call "the
 *     authority" — carried three numbers for two invariants.
 *   • The capability count read 41 in four documents while the gate measured 45.
 *
 * Every one of those is the same defect: a HUMAN PROMISE to keep a number in
 * sync. So C69 §3 forbids the transcribed form. The register is produced by this
 * file from the handler sources, and CI fails when the committed artefact and the
 * regenerated one differ. A PR that registers a new bus command and does not
 * regenerate the register CANNOT merge — not because a reviewer remembers, but
 * because the diff is red and names the verb.
 *
 * ─── The checks ──────────────────────────────────────────────────────────────
 *
 *   V0  SUBJECT FLOOR (exit 2, never 1). The walk must read ≥ MIN_FILES files and
 *       discover ≥ MIN_VERBS verbs, and the three declaration sources must load.
 *       A gate that enumerated nothing has no verbs to police, and reporting that
 *       as "the register is complete" is the failure the whole artefact exists to
 *       prevent. Exit 2 (misconfigured) and exit 1 (failed) are different facts
 *       and MUST NOT alias — see lib/sourceScan.ts.
 *
 *   V1  SYMMETRY, BOTH DIRECTIONS (hard). Every discovered bus command has a row;
 *       every row maps to a discovered bus command. Neither direction alone is a
 *       register: one-way coverage lets a deleted verb keep its row forever, and
 *       the other way lets a new verb hide. `check-chat-capability-coverage.ts`
 *       is the strongest gate in this repo precisely because it checks both.
 *
 *   V2  NO DRIFT (hard). The committed artefact is compared to the regenerated
 *       one. The failure names the rows that changed, added or vanished.
 *
 *   V3  NO BLANK CELLS (hard). C69 §4 — a column that could not be derived reads
 *       UNKNOWN, never blank and never a favourable default. "Failure and
 *       emptiness are never the same value" is the standing doctrine here
 *       (§CONTEXT-DATA-HONESTY); an empty `authoritative store` cell would read
 *       as "fine" and mean "nobody looked".
 *
 *   V4  NAMED SHRINK-ONLY BASELINES (ratchet). SHADOWED and UNKNOWN-liveness
 *       verbs are enumerated BY NAME below, not counted. A count lets a PR fix one
 *       verb, break another, and stay level; a named list cannot be defeated that
 *       way, and it fails in BOTH directions — a verb that leaves the class must
 *       leave the list in the same commit, or the list rots into a set of things
 *       that are secretly fine (the `gate-debt.json` rule, applied per verb).
 *
 * ─── What this gate CANNOT see, stated so nobody reads it as full coverage ────
 *
 *   1. RUNTIME registration. Discovery is static: a `type` declaration in a
 *      handler-shaped file. A handler that is authored but never added to a
 *      handler set is counted as registered here. The SHADOWED class below is
 *      the inverse case, and it is the one that bites: a handler that IS in a
 *      handler set and still never registers.
 *   2. Whether a LIVE verb's write is CORRECT. Liveness answers "does this reach
 *      an execution authority", not "does it compute the right value".
 *   3. Dynamic verbs. A `type` assembled at runtime from a template literal is
 *      invisible to a source scan. None are known; none would be found.
 *   4. The undo column is DECLARED shape (`affectedStores` + the presence of a
 *      forward/inverse pair), not an executed proof that one Ctrl+Z reverts one
 *      edit. `284a8db7` is the standing evidence that those differ.
 *
 * Usage:
 *   npx tsx tools/ga-gate/check-verb-register.ts            # check (CI)
 *   npx tsx tools/ga-gate/check-verb-register.ts --write    # regenerate artefact
 *
 * Exit: 0 = register matches the code · 1 = FAILED · 2 = MISCONFIGURED.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk, relPath } from './lib/sourceScan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const WRITE = process.argv.includes('--write');

/** The generated artefact. C69 §3 — this path is the register. */
const REGISTER_PATH = 'docs/04-reference/API-VERB-REGISTER.md';

/**
 * Roots that register CommandBus handlers. This is the UNION of the two existing
 * gates' roots — `check-chat-capability-coverage.ts` walks
 * `plugins/​*​/src/handlers/*.ts` + two editor files; `check-sync-disposition.ts`
 * walks `plugins`, `apps/editor/src/engine`, `packages/command-registry/src`.
 * Taking the union rather than either one is deliberate: where the two disagree
 * about what a bus command is, that disagreement is a FINDING (reported below),
 * and a register built on the smaller of two rival subjects would inherit it.
 */
const HANDLER_ROOTS = ['plugins', 'apps/editor/src/engine', 'packages/command-registry/src'];

/**
 * ⚠ HONESTY FLOOR (lib/sourceScan.ts idiom). Below this the walk has not
 * established its subject. These are MISCONFIGURATION detectors, not targets:
 * NEVER raise either to make the gate green, and never lower one either — a
 * floor beneath the real subject detects nothing.
 *
 * Set well below the reading at freeze (2026-08-11), because the reading moves:
 * six agents were authoring verbs in this tree while the gate was written, and
 * the verb count changed three times in an hour. The register PRINTS the measured
 * numbers on every run — read the run output, never this comment.
 */
const MIN_FILES = 900;
const MIN_VERBS = 250;

/**
 * A verb declaration. Matches BOTH handler forms, because a first draft that
 * matched only one is the documented way this repo produces a confidently-wrong
 * gate (see check-chat-capability-coverage.ts, which saw 102 of ~300):
 *
 *    object literal / BridgeSpec →  `type: 'roof.update',`
 *    class handler              →  `readonly type = 'wall.create';`
 *                                  `readonly type: CommandType = 'wall.create';`
 *
 * Most verbs are dotted, and four are not (`zoom-fit`, `zoom-selected`,
 * `copy-selection`, `paste-clipboard`). Both are accepted, but NOT on equal
 * evidence — see `handlerish()`.
 */
const TYPE_DECL_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

/**
 * Is this `type` declaration a bus-command registration?
 *
 * STRICT evidence is a declared store list — `affectedStores` for a bus handler,
 * `stores` for an `initBusHandlers` BridgeSpec — or, in the editor engine only,
 * the `validate` + `run`/`fn` spec shape that `_generationCmds` and
 * `_projectOriginCmds` use (they register through the bus without naming a store).
 *
 * WEAK evidence is the file's location: a plugin's `src/handlers/` directory,
 * which is `check-chat-capability-coverage.ts`'s own authority for "this file
 * registers bus commands".
 *
 * A DOTLESS verb requires STRICT evidence. Weak evidence alone admits ordinary
 * discriminated-union tags: `plugins/floor/src/handlers/CreateFloor.ts:120` says
 * `type: 'floor'` inside an element literal, and `plugins/pool` does the same —
 * both are counted as registered bus commands by the chat gate today, and both
 * are element kinds, not verbs. It is the identical noise that puts 'door',
 * 'rectangular' and 'sitsOn' in `check-sync-disposition.ts`'s handler table.
 */
const STRICT_RE = /\b(affectedStores|stores)\s*[:=]/;
const SPEC_RE = /\bvalidate\s*:/;
const SPEC_BODY_RE = /\b(run|fn)\s*:/;

function handlerish(verb: string, slice: string, rel: string): boolean {
  const head = slice.slice(0, 900);
  const strict = STRICT_RE.test(head)
    || (rel.startsWith('apps/editor/src/engine/') && SPEC_RE.test(head) && SPEC_BODY_RE.test(head));
  if (strict) return true;
  if (!verb.includes('.')) return false;
  return /\/src\/handlers\//.test(rel);
}

// ─────────────────────────────────────────────────────────────────────────────
// V4 — NAMED shrink-only baselines. NOT counts. See the header.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ SHRINK-ONLY, BY NAME. Verbs declared at TWO registration sites — a plugin
 * handler AND an `initBusHandlers` bridge.
 *
 * `CommandBus.register()` THROWS on a duplicate type (CommandBus.ts:94), so
 * `initBusHandlers.ts:2202` guards every bridge with
 *
 *     if (runtime.bus.registry?.has?.(spec.type)) continue;
 *
 * FIRST REGISTRATION WINS, and plugins register first (composeRuntime runs before
 * initBusHandlers; the guard's own comment names composeRuntime as the reason it
 * exists). So for every verb below the PLUGIN handler is the one the bus holds and
 * the bridge — the arm that delegates to the legacy `commandManager` command and
 * therefore reaches the geometry stores the builders, projector, exporter and
 * persistence read — is DEAD CODE that logs nothing.
 *
 * This is the `roof.update` defect, and it is not one verb: it is SIXTEEN.
 * Baseline frozen 2026-08-11 by running this gate. A verb leaves this list only
 * by deleting one of its two declarations — and it must leave in the same commit,
 * or the list rots into a record of things that are secretly fine.
 *
 * ⚠ WHAT THIS CLASSIFICATION DOES NOT ASSERT: that the surviving plugin handler
 * writes nothing. That is the UNKNOWN_LIVENESS question, and for these sixteen it
 * is answered UNKNOWN too. What IS asserted is narrower and provable from source:
 * a live bridge was written, and boot order guarantees it never registers.
 */
const SHADOWED_BASELINE: readonly string[] = [
  // §FIX-CEILING-UPDATE-REACH-RECORD — 'ceiling.update' PAID and removed in the same
  // commit, per the rule three paragraphs up. `plugins/ceiling/src/handlers/UpdateCeiling.ts`
  // is deleted and the verb left CEILING_HANDLER_TYPES, so the `initBusHandlers` bridge
  // → `UpdateCeilingCommand` → geometry `ceilingStore` now registers. Read-back proof:
  // `apps/editor/__tests__/CeilingUpdateReachesGeometryStore.test.ts` (4 cases, watched
  // failing 3/4 first). 16 → 15 was roof; 15 → 14 is ceiling.
  // §FIX-SHADOWED-DEAD-FILES (BIM20 C5 Wave 4) — 'door.setHeight', 'door.setWidth',
  // 'window.setSize', 'window.setSillHeight' and 'wall.updateDimensions' PAID and
  // removed in the same change, per the rule three paragraphs up. These five were the
  // half of the list ALREADY resolved at runtime: §FIX-DIMS-REACH-RECORD (ADR-0315 U1,
  // L-815) took their plugin handlers out of the registered handler sets, so the
  // initBusHandlers bridges — the arms that reach the geometry stores through
  // UpdateElementParameterCommand / UpdateWallDimensionsCommand — have owned the verbs
  // on every real bus since then. What kept them SHADOWED was the ORPHANED handler
  // files still carrying the `type` declarations this gate's static discovery
  // (correctly) counts. Those five files are now deleted, with their barrel exports;
  // each verb has exactly ONE declaring site again. 14 → 9. The remaining nine are
  // genuinely dual-registered (plugin handler in a live handler set, registering
  // before the bridge) and each needs the ceiling-precedent treatment: delete the
  // plugin declaration, prove the bridge write with a read-back test.
  //
  // §FIX-TEMPLATE-ASSIGN-SHADOW (MT-03) — 'template.assignToNode' PAID and removed in
  // the same commit, per the rule three paragraphs up. Both declarations built the SAME
  // `AssignTemplateToNodeCommand` (plugins/rooms/src/handlers/legacyCommands.ts re-exports
  // it from @pryzm/command-registry), so this was never two different things — it was one
  // command with a rival wrapper, and the plugin wrapper was the worse one: it swallowed a
  // failed `commandManager.execute` into `{forward:[],inverse:[]}` (C16 CA-18 PROHIBITED),
  // no-op'd silently when `window.commandManager` was absent, and dropped the bridge's
  // `assignedBy: 'user'` default. Authority declared: the §E.5.7 bridge at
  // initBusHandlers.ts:2352. `plugins/rooms/src/handlers/AssignTemplateToNode.ts` is
  // DELETED with its barrel exports and its ROOM_HANDLER_TYPES entry, so the §OI-053
  // `registry.has()` skip at :2575 no longer fires and the bridge registers. Pin:
  // `plugins/rooms/__tests__/templateAssignShadow.test.ts` (3 cases incl. a negative
  // control on `room.create`, watched failing 3/3 first). 9 → 8.
  //
  // §FIX-ELEMENT-MARK-SHADOW (MT-03 / L-MT8) — 'element.updateMark' PAID and removed in
  // the same commit, per the rule at the head of this list. The selection plugin's
  // `UpdateElementMarkHandler` (contributed by PluginRegistry at composeRuntime, so it won
  // boot) was the CA-18 swallow shape — `catch { console.error }` → `{forward:[],inverse:[]}`,
  // silent no-op when `window.commandManager` is absent — AND it routed
  // `UpdateElementMarkCommand`, which writes `properties.mark` for every type, while the
  // schedule reads the TOP-LEVEL `mark` field (C28; PropertyPanel.ts:1035). The
  // §FIX-ELEMENT-MARK-UNHANDLED bridge at initBusHandlers.ts:2041 routes the ONE generic
  // `UpdateElementParameterCommand` with the stair `properties.mark` mapping handled
  // explicitly. Authority declared: the bridge.
  // `plugins/selection/src/handlers/UpdateElementMark.ts` is DELETED with its barrel
  // exports and its SELECTION_HANDLER_TYPES entry, so the §OI-053 `registry.has()` skip
  // no longer fires and the bridge registers. Pin:
  // `plugins/selection/__tests__/handlers/ElementMarkShadow.test.ts` (3 cases incl. a
  // negative control on `selection.select`, watched failing 3/3 first). 8 → 7.
  'furniture.updateParameters',
  'level.add',
  'sheet.addViewport',
  'stair.create',
  'stair.move',
  'view.setCrop',
  'view.updateDefinition',
];

/**
 * ⚠ SHRINK-ONLY, BY NAME — see the generated register for the full rows.
 *
 * A verb is UNKNOWN when its single registration site is a plugin handler that
 * `produceCommand`s against `ctx.stores`, with no `commandManager` delegation.
 * `check-chat-capability-coverage.ts` records that presumption being right 13 of
 * 13 times (§FIX-CHAT-DEAD-ROUTES) — and ALSO records, at
 * MAX_UNCLASSIFIED_GLOBAL_ROUTES, why `wall.create` is nonetheless NOT declared
 * dead: composeRuntime registers it as the authoritative wall route. Both facts
 * are true, so the honest value is UNKNOWN, never LIVE and never DEAD.
 *
 * This list is intentionally the LARGEST thing in this file. It is the answer to
 * the question the register exists to ask — "which verbs can a user dispatch
 * without anyone being able to say what they write" — and shrinking it is the
 * work. It is populated by running `--write` and is checked in both directions.
 */
const UNKNOWN_LIVENESS_BASELINE: readonly string[] = [
  'annotation.create',
  'annotation.delete',
  'annotation.move',
  'annotation.setColor',
  'annotation.setKind',
  'annotation.setRotation',
  'annotation.setText',
  'annotation.setTextHeight',
  'annotation.update',
  'beam.batch.create',
  'beam.create',
  'beam.delete',
  'beam.setSection',
  'beam.setType',
  'ceiling.batch.create',
  'ceiling.create',
  'ceiling.delete',
  'ceiling.setBoundary',
  'ceiling.setHeight',
  'ceiling.updateLayers',
  'column.batch.create',
  'column.create',
  'column.delete',
  'column.setHeight',
  'column.setType',
  'copy-selection',
  'cube.move',
  'curtain-wall.addGridLine',
  'curtain-wall.addPanel',
  'curtain-wall.batch.create',
  'curtain-wall.batch.delete',
  'curtain-wall.batch.update',
  'curtain-wall.create',
  'curtain-wall.delete',
  'curtain-wall.move',
  'curtain-wall.removeGridLine',
  'curtain-wall.removePanel',
  'curtain-wall.replacePanel',
  'curtain-wall.resize',
  'curtain-wall.rotatePanel',
  'curtain-wall.setGrid',
  'curtain-wall.setMullionType',
  'curtain-wall.setOutline',
  'curtain-wall.setPanelType',
  'curtain-wall.setTransomType',
  'curtain-wall.swapPanel',
  'dimension.create',
  'dimension.createMany',
  'dimension.delete',
  'dimension.setPrecision',
  'dimension.setText',
  'dimension.setUnit',
  'door.batch.create',
  // §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6 Wave 4) — 'door.create' PAID and removed in
  // the same change, per the rule at the head of this list. It was one of the three
  // OBSERVED LIVENESS LIES: the CA-21 executed read-back saw it report success while
  // the authoritative doorStore (the store ProjectSerializer imports) did not change,
  // and it left door.delete `seed-did-not-land`. It now REFUSES with a typed reason
  // naming the real creation path — wall.createOpening → CreateWallOpeningCommand,
  // the one atomic command that mints BOTH the wall opening and the doorStore record.
  // It therefore leaves UNKNOWN for REFUSES. Evidence: the liveness ledger row is
  // `dispatch-threw: canExecute rejected`, and zero readback-negative rows remain for
  // the door family.
  'door.delete',
  'door.setAccessibility',
  'door.setFireRating',
  'door.setSwing',
  'door.setType',
  'floor.create',
  'floor.updateLayers',
  'furniture.batch.create',
  'furniture.create',
  'furniture.delete',
  'furniture.setActiveLod',
  'furniture.setRepresentation',
  'furniture.setScale',
  'grid.create',
  'grid.delete',
  'grid.setExtent',
  'grid.setSpacing',
  'handrail.create',
  'handrail.delete',
  'handrail.recompute',
  'handrail.setHost',
  'handrail.setPath',
  'handrail.setShape',
  'lighting.create',
  'lighting.delete',
  'lighting.setEmergency',
  'lighting.setIntensity',
  'paste-clipboard',
  'plumbing.create',
  'plumbing.delete',
  'plumbing.setSystem',
  'pool.create',
  'pool.delete',
  'roof.addSkylight',
  'roof.changeLevel',
  'roof.create',
  'roof.delete',
  'roof.joinRoofs',
  'roof.removeSkylight',
  'roof.setOverhang',
  'roof.setPitch',
  'roof.setShape',
  'roof.setThickness',
  'room.recomputeBoundary',
  'room.redetect',
  'schedule.column.add',
  'schedule.column.remove',
  'schedule.create',
  'schedule.delete',
  'schedule.setFilter',
  'schedule.setGroupBy',
  'section.create',
  'section.delete',
  'section.setDepth',
  'section.setMark',
  'section.setScale',
  'selection.clear',
  'selection.deselect',
  'selection.select',
  'sheet.addWidget',
  'sheet.create',
  'sheet.delete',
  'sheet.removeViewport',
  'sheet.removeWidget',
  'sheet.rename',
  'sheet.reorder',
  'sheet.setSheetMetadata',
  'sheet.setTitleBlock',
  'sheet.setViewportScale',
  'slab.addHole',
  'slab.batch.create',
  'slab.create',
  'slab.delete',
  'slab.removeHole',
  'slab.setBaseOffset',
  'slab.setThickness',
  'slab.setType',
  'slab.update',
  'slab.updateLayers',
  'slab.updatePolygon',
  'stair.batch.create',
  'stair.delete',
  'stair.setRiserHeight',
  'stair.setShape',
  'stair.setTreadCount',
  'stair.setType',
  'stair.setWidth',
  'structural.create',
  'structural.delete',
  'structural.setBraceEndOffset',
  'structural.setDimensions',
  'structural.setKind',
  'view.create',
  'view.delete',
  'view.rename',
  'view.setOutput',
  'view.setRange',
  'view.setUnderlay',
  'view.switch',
  'view.updateCamera',
  'wall.batch.create',
  'wall.changeLevel',
  'wall.create',
  'wall.createBetweenMarks',
  'wall.createFromSlab',
  'wall.createOpening',
  'wall.cut',
  'wall.delete',
  'wall.join',
  'wall.opening.create',
  'wall.setSystemType',
  // §FEAT-WALL-SPLIT-ID (GE-10, 2026-08-14) — `wall.split` is a SECOND ID over the
  // one opening-aware cut handler (`SplitWallHandler` holds a `CutWallHandler` and
  // calls its unwrapped core). It is UNKNOWN for EXACTLY the reason `wall.cut` two
  // lines up is UNKNOWN, and not one reason more: a lone plugin `produceCommand`
  // handler against `ctx.stores.wall`, with no `commandManager` delegation. It is
  // listed rather than argued away — the alternative was to claim a liveness its
  // parent does not have, which is the precise dishonesty this list exists to stop.
  // ⚠ IT PAYS OFF WITH `wall.cut`, NOT SEPARATELY. The two share one implementation,
  // so whatever proof retires `wall.cut` from this list retires this verb in the same
  // commit; a fix that retired only one of them would be evidence the cut path had
  // been forked, which `plugins/wall/__tests__/wallSplitId.test.ts` fails on.
  'wall.split',
  'wall.updateBaseline',
  // §FIX-CW-UPDATE-REACH-RECORD — 'wall.updateCurtainWall' PAID and removed in the same
  // commit. It was UNKNOWN rather than SHADOWED because it had only ONE declaring site:
  // TASK-07 Phase A deleted its `initBusHandlers` bridge outright, leaving
  // `UpdateCurtainWallCommand` — the sole writer of the geometry `curtainWallStore` on an
  // update — orphaned, and all four dispatchers (3-D gizmo, plan Move tool, property
  // sheet, Material control) silent no-ops. The bridge is restored and the plugin handler
  // deleted, so the verb still has exactly one declaring site; it has moved from
  // plugins/curtain-wall to apps/editor and is now LIVE. Read-back proof:
  // `apps/editor/__tests__/CurtainWallUpdateReachesGeometryStore.test.ts` (4 cases,
  // watched failing 3/4 first).
  'window.batch.create',
  // §FIX-CREATE-LIVENESS-LIE (BIM20 C5/C6 Wave 4) — 'window.create' PAID and removed
  // in the same change, for the identical measured reason as 'door.create' above:
  // readback-negative against the authoritative windowStore. It now REFUSES and names
  // wall.createOpening → CreateWallOpeningCommand as the atomic creation path.
  'window.delete',
  'window.setFireRating',
  'window.setType',
];

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

interface Site {
  readonly file: string;
  /** Source between this declaration and the next one in the same file. */
  readonly slice: string;
}

interface Row {
  readonly verb: string;
  readonly owner: string;
  readonly sites: readonly Site[];
  readonly liveness: 'LIVE' | 'REFUSES' | 'SHADOWED' | 'UNKNOWN';
  readonly authoritativeStore: string;
  readonly undo: string;
  readonly sync: string;
  readonly chat: string;
}

function ownerOf(file: string): string {
  const p = file.replace(/\\/g, '/');
  if (p.startsWith('plugins/')) return p.split('/').slice(0, 2).join('/');
  if (p.startsWith('packages/')) return p.split('/').slice(0, 2).join('/');
  if (p.startsWith('apps/')) return p.split('/').slice(0, 2).join('/');
  return 'UNKNOWN';
}

function storesOf(slice: string): string[] {
  const head = slice.slice(0, 900);
  const m = /\b(?:affectedStores|stores)\s*(?::[^=\[]*)?[:=]\s*\[([^\]]*)\]/.exec(head);
  if (m === null) return [];
  return [...m[1]!.matchAll(/'([A-Za-z0-9_.-]+)'/g)].map((x) => x[1]!);
}

/**
 * True when `canExecute` CANNOT RETURN `{ valid: true }` on any path — the
 * §FIX-DEAD-VERB-REFUSE shape (5e74b178): every payload validates and the handler
 * still refuses, because it cannot reach authoritative state.
 *
 * ⚠ The first draft of this predicate asked "does the LAST `return` say
 * `valid: false`?" and reported 28 refusals where there are 17. `MoveStair`,
 * `SetHandrailPath` and `SetCeilingBoundary` all END on a `not found` rejection
 * while returning `{ valid: true }` one branch earlier — ordinary validation,
 * misread as a dead verb. Left recorded because a gate that over-reports
 * REFUSES is a gate that would let a real refusal hide in the noise, and
 * "confidently wrong" is the failure mode this whole family is written against.
 *
 * The rule below is structural rather than positional: a validator that never
 * produces a valid result is one, and only one, thing.
 */
function refusesInCanExecute(slice: string): boolean {
  const at = slice.indexOf('canExecute');
  if (at === -1) return false;
  const after = slice.slice(at);
  const end = after.search(/\n\s{2}(?:async\s+)?execute\s*[(<]/);
  const body = end === -1 ? after : after.slice(0, end);
  if (!/valid:\s*false/.test(body)) return false;
  return !/valid:\s*true/.test(body);
}

/**
 * §REFUSAL-IS-A-VALUE — the SECOND refusal shape, and the one C16 CA-18
 * actually prescribes.
 *
 * ⚠ Recorded because this gate was CONFIDENTLY WRONG about it (MT-02,
 * 2026-08-14). `refusesInCanExecute` above knows exactly ONE refusal: the
 * §FIX-DEAD-VERB-REFUSE shape, where `canExecute` can never return
 * `{ valid: true }`. But `canExecute({valid:false})` is converted by
 * `CommandBus.ts:426-432` into a THROWN `CommandBusError`, and a throw is
 * precisely what a fire-and-forget `catch {}` swallows. So C16 CA-18 requires
 * the *better* shape — the refusal rides back as a VALUE on
 * `HandlerResult.refusal` (`CapabilityRefusal`, C80 §1.4) beside an empty patch
 * pair — and this gate graded a handler written that way `UNKNOWN`, whose
 * published meaning is "nobody has proven either way", about a handler that
 * refuses in the open, by construction, with both numbers and a named reason.
 * The strictly better refusal read as the weakest available verdict, and the
 * register published that reading.
 *
 * `room.regenerate` (`plugins/rooms/src/handlers/RegenerateRooms.ts`,
 * `59187a0b`) is the first such verb and was the WHOLE of the V4 UNKNOWN
 * failure at HEAD.
 *
 * The rule is structural, and deliberately narrow so this arm cannot become the
 * over-reporting sink the ⚠ on `refusesInCanExecute` warns about. It requires
 * the refusal to be a PROPERTY OF THE SAME OBJECT LITERAL as the empty patch
 * pair, and requires the body to carry no populated patch array at all.
 *
 * ⚠ The adjacency clause is not cosmetic — the first draft asked only "does the
 * body mention `refusal:` anywhere", and it promoted
 * `slab.updateSystemTypeBatch` from LIVE to REFUSES on the strength of
 * `let refusal: string | null = null` — a LOCAL VARIABLE DECLARATION in a
 * bridge that mutates through `commandManager` and throws that string. A gate
 * that grades a working bridge "refuses" is worse than the defect it was
 * written to fix, so the shape is matched, not the word. A handler that refuses
 * on SOME paths and mutates on others also stays out: a conditional refusal is
 * not a dead verb, exactly as `MoveStair` is not.
 */
const CA18_SHAPE =
  /forward:\s*\[\s*\]\s*,\s*inverse:\s*\[\s*\]\s*,\s*(?:\/\/[^\n]*\n\s*)*refusal:\s*\S/;

function refusesByValue(slice: string): boolean {
  const at = slice.search(/\n\s{2}(?:async\s+)?execute\s*[(<]/);
  if (at === -1) return false;
  const body = slice.slice(at);
  if (!CA18_SHAPE.test(body)) return false;
  // A populated patch array anywhere ⇒ this handler CAN mutate ⇒ not a refusal.
  return !/\b(?:forward|inverse):\s*\[\s*[^\]\s]/.test(body);
}

function refuses(slice: string): boolean {
  return refusesInCanExecute(slice) || refusesByValue(slice);
}

/** The legacy-bridge signature `check-chat-capability-coverage.ts` accepts as
 *  LIVE: the handler delegates to `commandManager` and owns no store, so undo
 *  lives on the legacy stack. `_cmExec` is initBusHandlers' local alias. */
function isBridge(slice: string, stores: readonly string[]): boolean {
  return (/\b(commandManager|_cmExec)\b/.test(slice)) && stores.length === 0;
}

function undoOf(slice: string, stores: readonly string[], bridge: boolean): string {
  if (bridge) return 'legacy-stack (no affectedStores)';
  if (/forward:\s*\[\]\s*,\s*inverse:\s*\[\]/.test(slice)) return 'NONE (empty patch pair)';
  const pair = /\bproduceCommand\b/.test(slice) || (/\bforward\b/.test(slice) && /\binverse\b/.test(slice));
  if (pair && stores.length > 0) return `patch-pair → ${stores.join(' + ')}`;
  if (pair) return 'patch-pair → NONE declared';
  if (stores.length > 0) return `UNKNOWN (declares ${stores.join(' + ')})`;
  return 'UNKNOWN';
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

function fail2(msg: string): never {
  console.error(`\n[check-verb-register] MISCONFIGURED (exit 2) — ${msg}\n` +
    `  This is NOT a pass. A register whose subject could not be established\n` +
    `  cannot be complete, and reporting it as complete is precisely the defect\n` +
    `  C69 exists to prevent.`);
  process.exit(2);
}

// The three declaration sources are CITED, never copied (C69 §3.2 / C64 §2.13).
// A failure to load one is a MISCONFIGURATION: the register would otherwise
// silently report every verb as chat-unreachable or sync-undeclared.
interface Sources {
  readonly SYNC_DISPOSITIONS: Record<string, { kind: string; subject?: string; conflict?: string; reason?: string }>;
  readonly allChatCapabilities: () => readonly { id: string; busCommand: string | null; alsoDispatches?: readonly string[] }[];
  readonly CHAT_UNAVAILABLE: ReadonlyMap<string, unknown>;
  readonly CHAT_CLASSIFIED: ReadonlyMap<string, { cls: string }>;
}

async function loadSources(): Promise<Sources> {
  try {
    const sync = await import('../../packages/sync-client/src/syncDisposition.js');
    const reg = await import('../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js');
    const cls = await import('../../packages/ai-host/src/capabilities/ChatCommandClassification.js');
    return {
      SYNC_DISPOSITIONS: (sync as never as Sources).SYNC_DISPOSITIONS,
      allChatCapabilities: (reg as never as Sources).allChatCapabilities,
      CHAT_UNAVAILABLE: (reg as never as Sources).CHAT_UNAVAILABLE,
      CHAT_CLASSIFIED: (cls as never as Sources).CHAT_CLASSIFIED,
    };
  } catch (err) {
    return fail2(`a declaration source failed to load — ${String(err)}`);
  }
}

const { SYNC_DISPOSITIONS, allChatCapabilities, CHAT_UNAVAILABLE, CHAT_CLASSIFIED } = await loadSources();

const registry = new Map<string, Site[]>();
let filesRead = 0;

for (const dir of HANDLER_ROOTS) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = relPath(ROOT, abs);
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    if (rel.includes('/__tests__/')) continue;
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    filesRead++;
    TYPE_DECL_RE.lastIndex = 0;
    const hits: { verb: string; at: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = TYPE_DECL_RE.exec(src)) !== null) hits.push({ verb: (m[1] ?? m[2])!, at: m.index });
    for (let i = 0; i < hits.length; i += 1) {
      const slice = src.slice(hits[i]!.at, hits[i + 1]?.at ?? src.length);
      if (!handlerish(hits[i]!.verb, slice, rel)) continue;
      const list = registry.get(hits[i]!.verb) ?? [];
      if (!list.some((s) => s.file === rel)) list.push({ file: rel, slice });
      registry.set(hits[i]!.verb, list);
    }
  }
}

if (filesRead < MIN_FILES) fail2(`the handler walk READ only ${filesRead} file(s); floor is ${MIN_FILES}. Roots: ${HANDLER_ROOTS.join(', ')}`);
if (registry.size < MIN_VERBS) fail2(`the walk read ${filesRead} files but discovered only ${registry.size} verb(s); floor is ${MIN_VERBS}. The declaration regex stopped matching.`);

// ── chat reachability, cited from the capability registry ────────────────────
const capOf = new Map<string, string>();
for (const c of allChatCapabilities()) {
  for (const v of [c.busCommand, ...(c.alsoDispatches ?? [])]) {
    if (v !== null && v !== undefined && !capOf.has(v)) capOf.set(v, c.id);
  }
}
const unavailableHas = (v: string): boolean =>
  typeof (CHAT_UNAVAILABLE as ReadonlyMap<string, unknown>).has === 'function'
    ? (CHAT_UNAVAILABLE as ReadonlyMap<string, unknown>).has(v)
    : false;

// ── C08 §PROPERTY-VERB shape rule, cited verbatim from check-sync-disposition ─
const PROPERTY_VERB_RE =
  /^[a-z][\w-]*\.(update|set|add|remove|replace|rename|move|modify|cascade)[A-Z\w.-]*$/;
const isPropertyVerb = (t: string): boolean =>
  t.includes('.') && !/\.(create|delete|batch\.create)$/.test(t) && PROPERTY_VERB_RE.test(t);

const rows: Row[] = [];
for (const verb of [...registry.keys()].sort()) {
  const sites = registry.get(verb)!;
  const primary = sites[0]!;
  const stores = storesOf(primary.slice);
  const bridge = sites.some((s) => isBridge(s.slice, storesOf(s.slice)));
  const doesRefuse = sites.some((s) => refuses(s.slice));

  const pluginSite = sites.find((s) => s.file.startsWith('plugins/'));
  const bridgeSite = sites.find((s) => s.file.startsWith('apps/editor/src/engine/'));
  const shadowed = sites.length > 1 && pluginSite !== undefined && bridgeSite !== undefined;

  const owner = ownerOf(primary.file);
  const inAuthorityRoot = sites.some((s) =>
    s.file.startsWith('packages/command-registry/') || s.file.startsWith('apps/editor/'));

  let liveness: Row['liveness'];
  if (doesRefuse) liveness = 'REFUSES';
  else if (shadowed) liveness = 'SHADOWED';
  else if (inAuthorityRoot || bridge) liveness = 'LIVE';
  else liveness = 'UNKNOWN';

  let authoritativeStore: string;
  if (liveness === 'REFUSES') authoritativeStore = 'NONE';
  else if (liveness === 'SHADOWED') authoritativeStore = 'UNKNOWN';
  else if (liveness === 'UNKNOWN') authoritativeStore = 'UNKNOWN';
  else if (stores.length > 0) authoritativeStore = stores.join(' + ');
  else authoritativeStore = 'legacy geometry store (via commandManager)';

  const d = Object.prototype.hasOwnProperty.call(SYNC_DISPOSITIONS, verb)
    ? SYNC_DISPOSITIONS[verb]! : undefined;
  const sync = d === undefined
    ? (isPropertyVerb(verb) ? 'UNDECLARED' : 'n/a (not a property verb)')
    : d.kind === 'not-synced'
      ? 'not-synced (reason declared)'
      : `synced via '${d.subject}' (${d.conflict})`;

  const chat = capOf.has(verb) ? `capability: ${capOf.get(verb)}`
    : unavailableHas(verb) ? 'deferred (CHAT_UNAVAILABLE)'
    : CHAT_CLASSIFIED.has(verb) ? `classified ${CHAT_CLASSIFIED.get(verb)!.cls}`
    : 'UNDECLARED';

  rows.push({
    verb, owner, sites, liveness, authoritativeStore,
    undo: undoOf(primary.slice, stores, bridge && stores.length === 0),
    sync, chat,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

const tally = (pred: (r: Row) => boolean): number => rows.filter(pred).length;
const esc = (s: string): string => s.replace(/\|/g, '\\|');

function render(): string {
  const L: string[] = [];
  L.push('# PRYZM — API Verb Register (C69)');
  L.push('');
  L.push('> ⚠ **GENERATED FILE — DO NOT EDIT BY HAND.**');
  L.push('> Produced by `tools/ga-gate/check-verb-register.ts`. Regenerate with');
  L.push('> `npx tsx tools/ga-gate/check-verb-register.ts --write`.');
  L.push('> `check-verb-register.ts` fails CI when this file and the code disagree, in either');
  L.push('> direction, so a PR that registers a new bus command and does not regenerate here');
  L.push('> cannot merge. Governed by [C69](../02-decisions/contracts/C69-API-VERB-REGISTER.md).');
  L.push('');
  L.push('Every row is a **wire identifier**. A command type appears in `project_command_log`');
  L.push('and in replayed collaboration history, so renaming one is a PERSISTENCE-BREAKING');
  L.push('change, not a rename — see C69 §2.');
  L.push('');
  L.push('## Measured at generation');
  L.push('');
  L.push('| | |');
  L.push('|---|---|');
  L.push(`| Handler files read | ${filesRead} (floor ${MIN_FILES}) |`);
  L.push(`| **Verbs** | **${rows.length}** (floor ${MIN_VERBS}) |`);
  L.push(`| LIVE | ${tally((r) => r.liveness === 'LIVE')} |`);
  L.push(`| REFUSES | ${tally((r) => r.liveness === 'REFUSES')} |`);
  L.push(`| SHADOWED (dead route) | ${tally((r) => r.liveness === 'SHADOWED')} |`);
  L.push(`| UNKNOWN | ${tally((r) => r.liveness === 'UNKNOWN')} |`);
  L.push(`| authoritative store NONE or UNKNOWN | ${tally((r) => r.authoritativeStore === 'NONE' || r.authoritativeStore === 'UNKNOWN')} |`);
  L.push(`| sync UNDECLARED (property verbs) | ${tally((r) => r.sync === 'UNDECLARED')} |`);
  L.push(`| chat UNDECLARED | ${tally((r) => r.chat === 'UNDECLARED')} |`);
  L.push('');
  L.push('These numbers are re-derived on every run. Do not transcribe them anywhere else');
  L.push('(C64 §2.13) — cite this file.');
  L.push('');
  L.push('## Column meanings');
  L.push('');
  L.push('| Column | Derivation |');
  L.push('|---|---|');
  L.push('| **verb** | the `type` literal a handler registers. Wire identifier. |');
  L.push('| **owner** | workspace containing the declaring file. |');
  L.push('| **liveness** | `LIVE` — declared in an execution-authority root (`packages/command-registry`, `apps/editor`) or a legacy bridge. `REFUSES` — the verb is registered and answers, in the open, that it will not act. TWO shapes count, and both are checked: `canExecute` can never return `{valid:true}` (§FIX-DEAD-VERB-REFUSE), **or** `execute` returns a `CapabilityRefusal` on `HandlerResult.refusal` beside an empty patch pair and mutates nothing (§REFUSAL-IS-A-VALUE, the shape C16 CA-18 prescribes — a refusal the caller reads, rather than a throw a `catch {}` can swallow). `SHADOWED` — two registration sites; the boot-order guard means the plugin one wins and the live bridge never registers. `UNKNOWN` — a lone plugin `produceCommand` handler; nobody has proven either way. |');
  L.push('| **authoritative store** | the `affectedStores` names when LIVE; `NONE` when the verb refuses; `UNKNOWN` otherwise. Never blank, never a favourable default. |');
  L.push('| **undo** | the declared shape — a forward/inverse pair and the stores `affectedStores` names, or the legacy stack, or NONE. Declared shape, not an executed proof. |');
  L.push('| **sync** | cited from `packages/sync-client/src/syncDisposition.ts`. `UNDECLARED` = a property-mutation verb with no disposition. |');
  L.push('| **chat** | cited from `ChatCapabilityRegistry` / `CHAT_UNAVAILABLE` / `ChatCommandClassification`. |');
  L.push('');
  L.push('## Register');
  L.push('');
  L.push('| verb | owner | liveness | authoritative store | undo | sync | chat |');
  L.push('|---|---|---|---|---|---|---|');
  for (const r of rows) {
    L.push(`| \`${r.verb}\` | ${esc(r.owner)} | ${r.liveness} | ${esc(r.authoritativeStore)} | ${esc(r.undo)} | ${esc(r.sync)} | ${esc(r.chat)} |`);
  }
  L.push('');
  L.push('## Declaring sites');
  L.push('');
  L.push('Verbs with more than one declaring file are SHADOWED — listed here in full because');
  L.push('the second site is the one nobody knew was dead.');
  L.push('');
  L.push('| verb | sites |');
  L.push('|---|---|');
  for (const r of rows) {
    if (r.sites.length < 2) continue;
    L.push(`| \`${r.verb}\` | ${r.sites.map((s) => `\`${s.file}\``).join(' · ')} |`);
  }
  L.push('');
  return L.join('\n');
}

const generated = render();
const target = path.join(ROOT, REGISTER_PATH);

if (WRITE) {
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, generated, 'utf8');
  console.log(`[check-verb-register] wrote ${REGISTER_PATH} — ${rows.length} verbs.`);
  process.exit(0);
}

// ── V1/V2/V3/V4 ──────────────────────────────────────────────────────────────

const failures: string[] = [];

// V2 — drift, reported as named row differences (never a bare "files differ").
if (!existsSync(target)) {
  failures.push(
    `V2 ${REGISTER_PATH} does not exist. The register is GENERATED — run ` +
    `\`npx tsx tools/ga-gate/check-verb-register.ts --write\` and commit it.`);
} else {
  // §CRLF — normalise line endings on BOTH sides. `core.autocrlf` is on by default
  // on Windows, so a byte-comparison would fail on every Windows checkout and pass
  // on Linux: a gate that is red for a whole platform teaches people to ignore it,
  // which is the "green on the runner, red locally" split lib/sourceScan.ts was
  // written to avoid. Caught while negative-testing V2.
  const committed = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  if (committed !== generated) {
    // V1 — symmetry, both directions, computed from the committed rows.
    const rowRe = /^\| `([a-z][\w.-]+)` \|/gm;
    const committedVerbs = new Set([...committed.matchAll(rowRe)].map((m) => m[1]!));
    const codeVerbs = new Set(rows.map((r) => r.verb));
    const missing = [...codeVerbs].filter((v) => !committedVerbs.has(v)).sort();
    const stale = [...committedVerbs].filter((v) => !codeVerbs.has(v)).sort();
    if (missing.length > 0) {
      failures.push(
        `V1 ${missing.length} registered bus command(s) have NO row in ${REGISTER_PATH}: ` +
        `${missing.join(', ')}. This is the founder's ask made mechanical — a new verb ` +
        `must be added to the register, and the register is generated, so regenerate it.`);
    }
    if (stale.length > 0) {
      failures.push(
        `V1 ${stale.length} register row(s) map to no registered bus command: ` +
        `${stale.join(', ')}. A row for a verb that no longer exists is a declaration ` +
        `nobody executed — the exact defect the register exists to expose.`);
    }
    if (missing.length === 0 && stale.length === 0) {
      const cLines = committed.split('\n');
      const gLines = generated.split('\n');
      const changed: string[] = [];
      for (let i = 0; i < Math.max(cLines.length, gLines.length) && changed.length < 25; i += 1) {
        if (cLines[i] !== gLines[i]) changed.push(`    line ${i + 1}\n      committed: ${cLines[i] ?? '<absent>'}\n      code says: ${gLines[i] ?? '<absent>'}`);
      }
      failures.push(
        `V2 ${REGISTER_PATH} is STALE — the verb set matches but ${changed.length >= 25 ? '≥25' : changed.length} ` +
        `line(s) disagree with the code (a liveness, store, undo, sync or chat column moved). ` +
        `Regenerate with --write.\n${changed.join('\n')}`);
    }
  }
}

// V3 — no blank cells, no favourable defaults.
for (const r of rows) {
  for (const [col, val] of Object.entries({
    owner: r.owner, authoritativeStore: r.authoritativeStore,
    undo: r.undo, sync: r.sync, chat: r.chat,
  })) {
    if (val.trim().length === 0) {
      failures.push(`V3 ${r.verb}: column "${col}" is BLANK. C69 §4 — an underivable column reads UNKNOWN, never empty.`);
    }
  }
}

// V4 — named shrink-only baselines, checked in BOTH directions.
function namedRatchet(label: string, actual: readonly string[], baseline: readonly string[], banner: string): void {
  const b = new Set(baseline);
  const a = new Set(actual);
  const added = [...a].filter((v) => !b.has(v)).sort();
  const gone = [...b].filter((v) => !a.has(v)).sort();
  if (added.length > 0) {
    failures.push(`V4 ${added.length} NEW ${label}: ${added.join(', ')}.\n      ${banner}`);
  }
  if (gone.length > 0) {
    failures.push(
      `V4 ${gone.length} ${label} on the baseline no longer qualif${gone.length === 1 ? 'ies' : 'y'}: ` +
      `${gone.join(', ')}. Paid debt must LEAVE the list in the same commit, or the baseline ` +
      `rots into a record of things that are secretly fine (the gate-debt.json rule, per verb).`);
  }
}

namedRatchet('SHADOWED verb(s)',
  rows.filter((r) => r.liveness === 'SHADOWED').map((r) => r.verb), SHADOWED_BASELINE,
  'A second registration site cannot register — initBusHandlers.ts:2202 skips it. Delete one declaration.');
namedRatchet('UNKNOWN-liveness verb(s)',
  rows.filter((r) => r.liveness === 'UNKNOWN').map((r) => r.verb), UNKNOWN_LIVENESS_BASELINE,
  'A lone plugin produceCommand handler. Prove it reaches authoritative state, or route it through the live path.');

// ── Report ───────────────────────────────────────────────────────────────────

const bar = '─'.repeat(78);
console.log(bar);
console.log('C69 §VERB-REGISTER — the API verb register is generated, and CI diffs it');
console.log(bar);
console.log(`Handler files read                 : ${filesRead}  (floor ${MIN_FILES})`);
console.log(`Verbs discovered                   : ${rows.length}  (floor ${MIN_VERBS})`);
console.log(`  LIVE                             : ${tally((r) => r.liveness === 'LIVE')}`);
console.log(`  REFUSES                          : ${tally((r) => r.liveness === 'REFUSES')}`);
console.log(`  SHADOWED (dead route)            : ${tally((r) => r.liveness === 'SHADOWED')}`);
console.log(`  UNKNOWN                          : ${tally((r) => r.liveness === 'UNKNOWN')}`);
console.log(`Authoritative store NONE / UNKNOWN : ${tally((r) => r.authoritativeStore === 'NONE' || r.authoritativeStore === 'UNKNOWN')}`);
console.log(`Sync UNDECLARED (property verbs)   : ${tally((r) => r.sync === 'UNDECLARED')}`);
console.log(`Chat UNDECLARED                    : ${tally((r) => r.chat === 'UNDECLARED')}`);
console.log(bar);
console.log(
  'NOTE (C66 §1.1 — a claim and a measurement must not be written the same way):\n' +
  'LIVE means the verb is declared in an execution-authority root or delegates to the\n' +
  'legacy commandManager. It does NOT mean the write is correct, that undo reverts it,\n' +
  'or that a collaborator sees it — see the sync column, and check-sync-disposition\'s\n' +
  'own note that no CRDT transport is deployed (L-391).');

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`   • ${f}\n`);
  process.exit(1);
}
console.log(`\n✓ ${REGISTER_PATH} matches the code, both directions.\n`);
process.exit(0);
