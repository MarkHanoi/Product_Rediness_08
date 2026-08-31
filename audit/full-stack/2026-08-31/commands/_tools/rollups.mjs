import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const C = path.join(ROOT, 'audit/full-stack/2026-08-31/commands');
const R = path.join(C, '_raw');
let rows = [];
for (const f of readdirSync(C).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
  rows = rows.concat(JSON.parse(readFileSync(path.join(C, f), 'utf8')).rows);
}
const KINDS = ['create', 'batch.create', 'update', 'delete', 'move', 'split', 'join', 'regenerate', 'other'];
const mir = (r) => r.mirror.CEB_case_present || r.mirror.in_ELEMENT_UPDATE_VERBS || r.mirror.in_LEVEL_CHANGE_VERBS;
const fam = (r) => r.verb.includes('.') ? r.verb.split('.')[0] : r.verb;

// 1 VERBS BY KIND PER FAMILY
const byFam = {};
for (const r of rows) { const f = fam(r); (byFam[f] ??= { total: 0 }); byFam[f].total++; byFam[f][r.kind] = (byFam[f][r.kind] || 0) + 1; }

// 2 MIRROR COVERAGE MATRIX
const mirrorByKind = {};
for (const k of KINDS) {
  const rs = rows.filter((r) => r.kind === k); if (!rs.length) continue;
  const any = rs.filter(mir);
  mirrorByKind[k] = {
    verbs: rs.length,
    CEB_case: rs.filter((r) => r.mirror.CEB_case_present).length,
    ELEMENT_UPDATE_VERBS: rs.filter((r) => r.mirror.in_ELEMENT_UPDATE_VERBS).length,
    LEVEL_CHANGE_VERBS: rs.filter((r) => r.mirror.in_LEVEL_CHANGE_VERBS).length,
    any_mirror: any.length,
    pct: (100 * any.length / rs.length).toFixed(0) + '%',
    of_those_emitting_into_ZERO_subscribers: rs.filter((r) => r.mirror.channel_subscriber_count === 0).length,
  };
}

// 3 READ-BACK COVERAGE
const rbByKind = {}, rbByFam = {};
for (const k of KINDS) {
  const rs = rows.filter((r) => r.kind === k); if (!rs.length) continue;
  rbByKind[k] = { verbs: rs.length, proven_positive_class_c: rs.filter((r) => r.readback.proven === 'YES-POSITIVE').length, measured_negative_class_c: rs.filter((r) => r.readback.proven === 'NO-MEASURED-NEGATIVE').length, pct_proven: (100 * rs.filter((r) => r.readback.proven === 'YES-POSITIVE').length / rs.length).toFixed(1) + '%' };
}
for (const r of rows) { const f = fam(r); (rbByFam[f] ??= { verbs: 0, proven: 0 }); rbByFam[f].verbs++; if (r.readback.proven === 'YES-POSITIVE') rbByFam[f].proven++; }
for (const f in rbByFam) rbByFam[f].pct = (100 * rbByFam[f].proven / rbByFam[f].verbs).toFixed(1) + '%';

// 4 RIVAL DISPATCH
const cmFiles = new Set(readFileSync(path.join(R, 'cm-in-handlers-noncomment.txt'), 'utf8').trim().split('\n').map((l) => l.split(':')[0]));
const verbsInCmFiles = rows.filter((r) => r.handler.all_sites.some((s) => cmFiles.has(s.split(':')[0])));
const cmByKind = {}; for (const v of verbsInCmFiles) cmByKind[v.kind] = (cmByKind[v.kind] || 0) + 1;

// 5 NO CONSEQUENCE
const noCons = {
  measured_class_c: rows.filter((r) => r.consequence.verdict.startsWith('NO CONSEQUENCE - MEASURED')).map((r) => r.verb),
  shadowed: rows.filter((r) => r.consequence.verdict.startsWith('NO CONSEQUENCE - SHADOWED')).map((r) => r.verb),
  refuses_by_design: rows.filter((r) => r.consequence.verdict.startsWith('BY DESIGN')).length,
  refuses_by_design_verbs: rows.filter((r) => r.consequence.verdict.startsWith('BY DESIGN')).map((r) => r.verb),
  quadruple_negative_candidates: rows.filter((r) => r.consequence.verdict.startsWith('CANDIDATE')).map((r) => r.verb),
  undo_stranded: rows.filter((r) => r.undo.backend === 'STRANDED').map((r) => r.verb),
  mirror_that_reaches_nobody: rows.filter((r) => r.mirror.channel_subscriber_count === 0).map((r) => r.verb + ' -> ' + r.mirror.zero_subscriber_channel),
};

const out = {
  phase: 'P3 - AXIS C - COMMANDS', date: '2026-08-31',
  head_at_start: 'd91d30d4af51bc67317ef8afc0b46b1dbef94038',
  head_at_end: 'SEE _ROLLUPS head_at_end field, recorded after the last write',
  head_moved: 'YES - to 6590ac1ca2202c1ed238cba7ef7af62d8c6a29ce. git diff --name-only d91d30d4..6590ac1c -> exactly ONE file: audit/full-stack/BRIEF-QUEUED.md (a docs commit by another lane). NO production file this phase measured changed between the two SHAs.',
  denominator: { verbs_measured: rows.length, families: Object.keys(byFam).length, extrapolated: 'NONE. Every number here is over 361 rows actually emitted to disk.' },
  ROLLUP_1_verbs_by_kind: { totals: KINDS.reduce((a, k) => { const n = rows.filter((r) => r.kind === k).length; if (n) a[k] = n; return a; }, {}), per_family: byFam,
    classifier_note: 'delete=40 by this classifier vs 39 in P1. The one-verb difference is slab.removeHole, which this pass classes delete by its remove* shape while it is simultaneously a row in ELEMENT_UPDATE_VERBS. Six of the 40 are sub-element removals (removeHole, removeSkylight, removeGridLine, removePanel, removeViewport, removeWidget); the pure *.delete suffix count is 33. Both numbers are stated so neither is mistaken for the other.' },
  ROLLUP_2_mirror_coverage: {
    by_kind: mirrorByKind,
    headline: 'THE CREATION AUDIT FOUND 17 CREATES AND 0 UPDATES. THE CURRENT NUMBERS: create 23/51 (45%), batch.create 7/10 (70%), update 15/166 (9%), delete 2/40 (5%), move 13/31 (42%), split 0/1, join 0/2, regenerate 0/1, other 0/59.',
    the_update_column: 'The 15 update-kind mirrors are NOT 15 hand-written bridge cases. NINE are rows in ELEMENT_UPDATE_VERBS (slab.addHole, slab.removeHole, slab.setThickness, slab.setBaseOffset, slab.setType, roof.setOverhang, roof.setThickness, roof.setShape, roof.setPitch, column.setHeight - ten rows, one of which this pass classes delete) and SIX are hand-written cases (slab.updateLayers, ceiling.updateLayers, floor.updateLayers, boundaryLine.update, boundaryLine.attach, boundaryLine.detach). THREE of those six - the updateLayers trio - emit into ZERO SUBSCRIBERS.',
    the_delete_column: 'TWO of 40 delete verbs have any mirror at all: boundaryLine.delete (a hand-written case at CommandEventBridge.ts:2478) and slab.removeHole (an ELEMENT_UPDATE_VERBS row). There is no element.deleted channel. 38 delete verbs emit nothing.',
    zero_subscriber_overlay: 'NINE verbs have a mirror that reaches nobody: ' + noCons.mirror_that_reaches_nobody.join(' | ') + '. So the honest mirror number is 60 verbs with a channel, of which 51 have a channel with at least one .on() site.',
    evidence_class: 'a - grep over CommandEventBridge.ts and the two tables, plus P1 subscriber counts. NOT class b: nothing here demonstrates a planted violation would be caught.',
  },
  ROLLUP_3_readback_coverage: {
    numerator: 22, denominator: 361, pct: '6.1%', fraction: '22/361',
    families: { with_at_least_one: 13, of: 50, pct: '26.0%' },
    prior_reading: 'The brief carried 7 verbs / 3 families. This pass measures 22 verbs / 13 families - a REFUTATION of the low figure, arrived at by running 16 test files rather than counting the ones the last audit happened to cite.',
    by_kind: rbByKind, by_family: rbByFam,
    what_counts: 'ONLY class (c): a vitest file I executed in this session at RC=0 whose assertion reads a store (or the legacy record) back after a dispatch. Co-occurrence between a composeRuntime() call and a store read in the same file is recorded per-row as class (a) NOT-PROVEN-BY-ME and is NOT in the numerator - 12 further verbs sit there.',
    what_it_does_not_establish: 'Not one of the 22 is proven to a PIXEL. Every proof stops at a store record or an emitted event.',
  },
  ROLLUP_4_rival_dispatch: {
    the_legitimate_path: { executeCommand_production_sites: 638, command: 'grep -rn "executeCommand(" --include=*.ts --include=*.tsx apps/editor/src packages plugins | grep -v node_modules | grep -v "__tests__|.test.|.spec." | wc -l' },
    rival_1_commandManager: {
      production_sites: 227,
      command: 'grep -rn "commandManager\\.execute|commandManager\\?\\.execute|\\[.commandManager.\\]" --include=*.ts --include=*.tsx apps/editor/src packages plugins | grep -v node_modules | grep -v tests -> audit/.../\_raw/commandmanager-sites.txt',
      distinct_callee_tokens: 42,
      UNRESOLVABLE_BY_NAME: 'THIRTY-NINE of the 227 pass a VARIABLE, not a class literal: cmd x27, command x9, step x2, layersCmd, createCommand, build. A name-keyed rival census cannot see those, which is the same name-blindness CLAUDE.md records for check:commandmanager (a gate defeated by renaming).',
      top_named_classes: 'CreateAnnotationCommand 8, ReDetectRoomsCommand 5, CreateWallCommand 3, CreateRoomCommand 3, CreatePlumbingFixtureCommand 3, AddLevelCommand 3, RenameRoomCommand 2, DeleteOpeningCommand 2, CreateStairRailingCommand 2, CreateFurnitureCommand 2.',
      THE_HEADLINE: 'ONE HUNDRED AND THIRTY of the 361 verbs (36%) are declared in a handler FILE that references commandManager outside a comment - 58 distinct files. By kind: ' + JSON.stringify(cmByKind) + '. These are not 130 breaches; most are DECLARED legacy delegation, and the register credits them as LIVE for exactly that reason. They are the measurement of how much of the bus is a facade over the legacy authority.',
      verbs: verbsInCmFiles.map((r) => r.verb),
    },
    rival_2_window_dispatchEvent: {
      production_sites: 205,
      inside_a_bus_handler_file: 20,
      worst: 'plugins/wall/src/handlers/UpdateWallsHeightBatch.ts fires window.dispatchEvent(new CustomEvent(WALL_HEIGHT_BATCH_REPORT_EVENT)) at :177, :231 and :290 - a batch REPORT delivered on the DOM event bus rather than as a HandlerResult. Top non-handler holders: packages/ai-host/src/QueryEngine.ts 15, packages/input-host/src/FloorPlanUnderlayTool.ts 11, packages/input-host/src/SelectionManager.ts 9.',
    },
    rival_3_second_registration_site: { count: 1, verb: 'sheet.create', sites: 'plugins/sheets/src/handlers/CreateSheet.ts:51 AND apps/editor/src/engine/initBusHandlers.ts:2641. The register classes it SHADOWED - the boot-order guard means the plugin one wins and the live bridge never registers. Exactly ONE verb of 361 has two registration sites.' },
    rival_4_per_family_deleters: 'P1 measured 27 per-family deleters as rivals to the LIVE element.delete / element.deleteBatch. This pass confirms the shape and adds the reachability column: 29 of the 40 delete verbs have ZERO literal dispatch site outside their own handler, and 24 of them are quadruple-negative.',
  },
  ROLLUP_5_verbs_with_no_consequence: {
    ...noCons,
    counts: {
      measured_class_c: noCons.measured_class_c.length,
      shadowed: noCons.shadowed.length,
      refuses_by_design: noCons.refuses_by_design,
      quadruple_negative_candidates: noCons.quadruple_negative_candidates.length,
      undo_stranded: noCons.undo_stranded.length,
      mirror_that_reaches_nobody: noCons.mirror_that_reaches_nobody.length,
    },
    reading_rule: 'These five sets OVERLAP and must not be summed. The only convictions are the four in measured_class_c plus the one SHADOWED. refuses_by_design is the HONEST form and is reported so nobody counts it as a defect. quadruple_negative is a CANDIDATE set carrying a measured 41% false-zero rate on its dispatch leg.',
  },
  CONTRACT_CONFORMANCE_over_all_361: {
    validates_before_mutation: 360, typed_DomainError_or_refusal: 70, mutates_only_via_immer_draft: 215,
    affectedStores_declared: 288, no_store_singleton_import_in_file: 267, withHandlerSpan: 279,
    emits_a_typed_domain_event: 2, geometry_deferred_to_FrameScheduler: 0,
    reading: 'The last two are NOT 359 and 361 defects. Emission is architecturally the CommandEventBridge job, not the handler job - which is precisely why ROLLUP 2 matters: a handler that emits nothing is CORRECT, and a bridge with no case for it is the gap. FrameScheduler deferral at 0 of 361 is the honest reading that no handler in this repo defers geometry by naming the scheduler; whether geometry is deferred DOWNSTREAM of the patch is an AXIS-B question this phase did not measure.',
    evidence_class: 'a - regex over the handler declaration slice. A TRUE means the token is present, not that it runs on the mutation path.',
  },
  MUST_NOT_BREACHES_over_all_361: {
    commandManager_execute_literal_in_slice: 2, cascading_dispatch: 6, window_dispatchEvent: 20, DOM_access: 61, direct_rAF: 0,
    reading: 'direct rAF = 0 of 361 is a CLEAN result and corroborates P3 (single rAF owner) from a different subject - though note check-raf-count is one of the 59 BLIND COMPARATORS, so this is an independent look at the same invariant, not a re-run of its word. DOM_access 61 counts any document./window. token including type-only casts and is a candidate list, not a conviction list. The commandManager literal count of 2 is a SLICE count and is NOT the real figure - see ROLLUP 4, where the FILE-level measurement is 130 verbs across 58 files.',
  },
  UNDO_BACKENDS_over_all_361: {
    A_ring_buffer_patch_pair_fully_covered: 157, B_legacy_commandManager: 123, STRANDED: 47, NONE_or_UNKNOWN: 34,
    method: 'Each verb affectedStores set was compared against the key set of buildUndoStoreMap() (apps/editor/src/engine/undo/performUndoRedo.ts:398-514) and against UNMAPPED_BUS_STORE_KEYS (:567+). _covered() is ALL-OR-NOTHING, so one uncovered key strands the whole entry.',
    STRANDED_means: 'performUndo declines the ring entry, does NOT step the cursor, and falls through to commandManager - which for these keys owns nothing. Ctrl+Z is a no-op. 47 of 361 verbs.',
    caveat: 'class (a). The undo column of the generated register says of itself: "Declared shape, not an executed proof." The ONE executed undo proof in this phase is liftUndoRoundTrip.test.ts (R-3..R-7), which I ran at RC=0 and which ALSO proves the lift entry is still one key short (door).',
  },
};
writeFileSync(path.join(C, '_ROLLUPS.json'), JSON.stringify(out, null, 1));
console.log('rollups written');
