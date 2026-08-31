import { readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
const ROOT = process.cwd();
const C = path.join(ROOT, 'audit/full-stack/2026-08-31/commands');
const R = path.join(C, '_raw');
const rd = (f) => JSON.parse(readFileSync(path.join(R, f), 'utf8'));
const all = rd('verb-rows.json');
const exec = JSON.parse(readFileSync(path.join(C, '_EXECUTED-READBACKS.json'), 'utf8'));
const execPos = new Map(exec.POSITIVE_store_readback.map((r) => [r.verb, r]));
const execNeg = new Map(exec.NEGATIVE_measured_by_the_same_executed_runs.map((r) => [r.verb, r]));

const undoCovered = new Set(readFileSync(path.join(R, 'undo-covered-keys.txt'), 'utf8').trim().split('\n'));
for (const k of ['walls', 'slabs', 'rooms', 'columns', 'beams', 'stairs', 'handrails', 'roofs', 'floors', 'ceilings', 'grids', 'annotations', 'curtainWall', 'curtainWalls', 'curtain-wall']) undoCovered.add(k);
const undoUnmapped = {};
for (const l of readFileSync(path.join(R, 'undo-unmapped-keys.txt'), 'utf8').trim().split('\n')) { const [k, o] = l.split(' '); undoUnmapped[k] = o; }
undoUnmapped.cube = 'nothing'; undoUnmapped.projectOrigin = 'nothing';

const cmSites = readFileSync(path.join(R, 'commandmanager-sites.txt'), 'utf8').trim().split('\n');
const wdSites = readFileSync(path.join(R, 'window-dispatchevent-sites.txt'), 'utf8').trim().split('\n');

function undoBackend(row) {
  const stores = row.contract.stores;
  const declared = row.registerUndo || '';
  if (/^NONE/i.test(declared)) return { backend: 'NONE', note: 'register declares no undo shape' };
  if (stores.length === 0) {
    if (/legacy/i.test(declared)) return { backend: 'B-legacy-commandManager', note: declared };
    return { backend: 'UNKNOWN', note: 'affectedStores empty or not extractable from the slice; register undo column says: ' + declared };
  }
  const missing = stores.filter((s) => !undoCovered.has(s));
  if (missing.length === 0) return { backend: 'A-ring-buffer(patch-pair)', note: 'all ' + stores.length + ' declared store key(s) are covered by buildUndoStoreMap()' };
  const legacy = missing.filter((s) => undoUnmapped[s] === 'legacy-stack');
  const nothing = missing.filter((s) => undoUnmapped[s] === 'nothing');
  const undeclared = missing.filter((s) => undoUnmapped[s] === undefined);
  if (nothing.length || undeclared.length) {
    return { backend: 'STRANDED', note: '_covered() is ALL-OR-NOTHING; uncovered key(s): ' + missing.join(', ') + ' (owner=nothing: ' + (nothing.join(',') || 'none') + '; UNDECLARED even in UNMAPPED_BUS_STORE_KEYS: ' + (undeclared.join(',') || 'none') + '). The ring entry is declined, performUndo does NOT step the cursor, and it falls through to commandManager.' };
  }
  return { backend: 'B-legacy-commandManager', note: 'uncovered key(s) ' + legacy.join(', ') + ' are DECLARED owner=legacy-stack in UNMAPPED_BUS_STORE_KEYS; the fallback is the intended route' };
}

function readback(row) {
  const p = execPos.get(row.verb), n = execNeg.get(row.verb);
  if (p) return { proven: 'YES-POSITIVE', evidence_class: 'c', against: p.against, proof: p.proof };
  if (n) return { proven: 'NO-MEASURED-NEGATIVE', evidence_class: 'c', finding: n.finding, proof: n.proof };
  const cand = row.readbackCandidate;
  if (cand.composedAndRead.length) return { proven: 'NOT-PROVEN-BY-ME', evidence_class: 'a', note: 'a test file both calls the real composeRuntime() and reads a store AND names this verb: ' + cand.composedAndRead.join(', ') + '. CO-OCCURRENCE ONLY. I did not run it and did not confirm the assertion is about this verb. Class (a).' };
  if (cand.tests) return { proven: 'NO', evidence_class: 'a', note: cand.tests + ' test file(s) name this verb; none of them both composes the real runtime and reads a store.' };
  return { proven: 'NO', evidence_class: 'a', note: 'ZERO test files under apps/ packages/ plugins/ tools/ name this verb literal alongside an executeCommand/.execute call. Absence measured by _tools/readback2.mjs over every *.test.ts / *.spec.ts in those four roots, node_modules excluded.' };
}

function rivals(row) {
  const fam = row.family.replace('-', '');
  const re = new RegExp(fam, 'i');
  const cm = cmSites.filter((l) => re.test(l));
  const wd = wdSites.filter((l) => re.test(l));
  const out = [];
  if (row.mustNots.commandManager) out.push('the HANDLER ITSELF names commandManager (delegation, or a refusal when it is absent)');
  if (row.mustNots.windowDispatchEvent) out.push('the HANDLER ITSELF calls dispatchEvent');
  if (row.mustNots.cascadingDispatch) out.push('the HANDLER ITSELF calls executeCommand/bus.execute (cascading dispatch)');
  return {
    handler_internal: out,
    family_named_commandManager_sites: cm.length,
    family_named_windowDispatchEvent_sites: wd.length,
    sample_commandManager: cm.slice(0, 4),
    sample_windowDispatchEvent: wd.slice(0, 3),
    caveat: 'family_named_* is a NAME match over the two site files, not a resolved dispatch graph. 27 of the 227 commandManager.execute sites pass a VARIABLE (cmd/command/step) and cannot be resolved by name at all. See _ROLLUPS.json rival_dispatch.',
  };
}

const fams = {};
for (const r of all.rows) (fams[r.family] ??= []).push(r);

const summary = {};
for (const [fam, rows] of Object.entries(fams)) {
  const out = {
    family: fam, date: '2026-08-31', phase: 'P3 AXIS C - COMMANDS',
    head_at_start: 'd91d30d4af51bc67317ef8afc0b46b1dbef94038',
    head_note: 'HEAD moved to 6590ac1c mid-phase. git diff --name-only d91d30d4..6590ac1c -> ONE file, audit/full-stack/BRIEF-QUEUED.md (docs only). No production file this phase measured changed.',
    discovery: 'The verb set was reproduced INDEPENDENTLY by audit/full-stack/2026-08-31/commands/_tools/scan.mjs, which re-implements check-verb-register.ts TYPE_DECL_RE + handlerish() over the same three HANDLER_ROOTS. It read 1408 files and found 361 verbs in 50 families - IDENTICAL to the gate on all three numbers. That agreement is a control on DISCOVERY ONLY; it says nothing about any column below.',
    evidence_classes: 'a = a gate or the generated register says so. b = a gate that can prove it would fire says so. c = an executed read-back I ran myself. 59 of 99 gates here are BLIND COMPARATORS (P0), so NO row upgrades (a) to (c) by wording.',
    verbs: rows.length, kinds: {}, rollup: {}, rows: [],
  };
  for (const r of rows) out.kinds[r.kind] = (out.kinds[r.kind] || 0) + 1;
  for (const r of rows) {
    const u = undoBackend(r), rb = readback(r);
    const isBatch = r.kind === 'batch.create' || /Batch/.test(r.sites[0]);
    out.rows.push({
      verb: r.verb, kind: r.kind,
      handler: {
        file: r.sites[0], all_sites: r.sites, site_count: r.siteCount,
        layer: r.sites[0].startsWith('plugins/') ? 'L6 plugin' : r.sites[0].startsWith('apps/editor') ? 'L7 apps/editor (execution-authority root)' : 'packages/command-registry (execution-authority root)',
        registered_where: r.owner, liveness_per_register: r.liveness,
      },
      contract: {
        validates_before_mutation: r.contract.validates,
        typed_DomainError_or_refusal: r.contract.domainError,
        mutates_only_via_immer_draft: r.contract.immerDraft,
        affectedStores_declared: r.contract.affectedStores,
        declared_stores: r.contract.stores,
        storeKey_matches_ctx_stores: r.contract.stores.length ? 'declared: ' + r.contract.stores.join(',') + ' - NOT resolved against the composed ctx.stores in this phase except where readback is class (c)' : 'no store declared',
        no_store_singleton_import: !r.contract.storeSingletonImportInFile,
        withHandlerSpan: r.contract.withHandlerSpan,
        emits_a_typed_domain_event: r.contract.emitsEvent,
        geometry_deferred_to_FrameScheduler: r.contract.frameScheduler,
        caveat: 'REGEX OVER THE HANDLER DECLARATION SLICE, class (a). TRUE means the token is present in the slice, NOT that it runs on the mutation path. FALSE is the stronger reading: the token is absent, so the clause cannot be satisfied.',
      },
      must_nots: {
        no_commandManager_execute: !r.mustNots.commandManager,
        no_cascading_dispatch: !r.mustNots.cascadingDispatch,
        no_window_dispatchEvent: !r.mustNots.windowDispatchEvent,
        no_DOM_access: !r.mustNots.dom,
        no_direct_rAF: !r.mustNots.rAF,
        caveat: 'same slice-regex caveat. no_DOM_access counts any document. / window. token including type-only casts, so a FALSE here is a candidate, not a conviction.',
      },
      mirror: {
        channel: r.mirror.cebCase ? 'CommandEventBridge switch case PRESENT' : 'NO CommandEventBridge case',
        CEB_case_present: r.mirror.cebCase,
        in_ELEMENT_UPDATE_VERBS: r.mirror.inElementUpdateVerbs,
        in_LEVEL_CHANGE_VERBS: r.mirror.inLevelChangeVerbs,
        table_driven_not_a_case_block: (r.mirror.inElementUpdateVerbs || r.mirror.inLevelChangeVerbs) ? 'TABLE-DRIVEN' : (r.mirror.cebCase ? 'HAND-WRITTEN CASE BLOCK (38 of them)' : 'n/a - no mirror at all'),
        evidence_class: 'a - grep over CommandEventBridge.ts (38 strict case labels) and the two verb tables (LEVEL_CHANGE_VERBS 12, ELEMENT_UPDATE_VERBS 10). Per the P0 constraint I do NOT write "the mirror gate is green therefore this verb mirrors".',
      },
      payload: {
        field_names_match_live_caller: null, id_pre_generated_by_caller: null,
        note: 'NOT MEASURED PER VERB at this scale. The three measured cases are in _ROLLUPS.json payload_defects (slab.create boundary-vs-polygon, roof.create id minting, column.batch.create id-less members) and all three were re-proven by MY executed run of CommittedPatchReachesTheStore.test.ts, RC=0.',
      },
      undo: {
        unit_registered: r.registerUndo, backend: u.backend, backend_note: u.note,
        reverts_geometry: rb.proven === 'YES-POSITIVE' && /undo/i.test(rb.proof || '') ? 'PROVEN by my executed run' : 'UNPROVEN',
        evidence_class: 'a - declared shape plus a key-set comparison against buildUndoStoreMap(). The register itself says of this column: "Declared shape, not an executed proof."',
      },
      batch: isBatch ? {
        mode: r.batch.completedFailed ? 'progressive (reports completed + failed)' : 'atomic-or-unreported',
        reports_completed_and_failed: r.batch.completedFailed,
        reports_notAttempted: r.batch.notAttempted,
        reports_undoUnits: r.batch.undoUnits,
      } : { mode: 'none' },
      readback: rb,
      rival_dispatch: rivals(r),
      ladder: (() => {
        const reachable = r.liveness === 'LIVE' ? 'YES (register: LIVE)' : r.liveness === 'REFUSES' ? 'REFUSES IN THE OPEN (registered, answers that it will not act)' : r.liveness === 'SHADOWED' ? 'NO - SHADOWED, a second registration site wins and this one never registers' : 'UNPROVEN (register: UNKNOWN - a lone plugin produceCommand handler)';
        const composable = rb.proven === 'YES-POSITIVE' ? 'YES - proven on the real composeRuntime() bus' : rb.proven === 'NO-MEASURED-NEGATIVE' ? 'NO - measured negative' : 'UNPROVEN';
        const certified = rb.proven === 'YES-POSITIVE' ? 'read-back CERTIFIED at the store. NOT certified at a pixel.' : 'NO';
        return { AUTHORED: 'YES', REACHABLE: reachable, COMPOSABLE: composable, CERTIFIED: certified };
      })(),
      findings: [],
    });
  }
  const rws = out.rows;
  out.rollup = {
    by_kind: out.kinds,
    mirror_coverage: { with_any_mirror: rws.filter((x) => x.mirror.CEB_case_present || x.mirror.in_ELEMENT_UPDATE_VERBS || x.mirror.in_LEVEL_CHANGE_VERBS).length, of: rws.length },
    readback: { proven_positive_class_c: rws.filter((x) => x.readback.proven === 'YES-POSITIVE').length, measured_negative_class_c: rws.filter((x) => x.readback.proven === 'NO-MEASURED-NEGATIVE').length, of: rws.length },
    undo: {
      ring_buffer: rws.filter((x) => x.undo.backend === 'A-ring-buffer(patch-pair)').length,
      legacy_commandManager: rws.filter((x) => x.undo.backend === 'B-legacy-commandManager').length,
      stranded: rws.filter((x) => x.undo.backend === 'STRANDED').length,
      none_or_unknown: rws.filter((x) => ['NONE', 'UNKNOWN'].includes(x.undo.backend)).length, of: rws.length,
    },
    liveness: rws.reduce((a, x) => { a[x.handler.liveness_per_register] = (a[x.handler.liveness_per_register] || 0) + 1; return a; }, {}),
    contract_clause_TRUE_counts: ['validates_before_mutation', 'typed_DomainError_or_refusal', 'mutates_only_via_immer_draft', 'affectedStores_declared', 'withHandlerSpan', 'emits_a_typed_domain_event', 'geometry_deferred_to_FrameScheduler'].reduce((a, k) => { a[k] = rws.filter((x) => x.contract[k] === true).length; return a; }, {}),
    must_not_BREACH_counts: [['no_commandManager_execute', 'commandManager.execute'], ['no_cascading_dispatch', 'cascading dispatch'], ['no_window_dispatchEvent', 'window.dispatchEvent'], ['no_DOM_access', 'DOM access'], ['no_direct_rAF', 'direct rAF']].reduce((a, [k, label]) => { a[label] = rws.filter((x) => x.must_nots[k] === false).length; return a; }, {}),
  };
  const safe = fam.replace(/[^a-zA-Z0-9-]/g, '_');
  writeFileSync(path.join(C, safe + '.json'), JSON.stringify(out, null, 1));
  summary[fam] = { verbs: rows.length, ...out.rollup };
}
writeFileSync(path.join(R, 'family-summary.json'), JSON.stringify(summary, null, 1));
console.log('families written', Object.keys(fams).length, 'verbs', all.rows.length);
