// ─── HARNESS 1 — PERSISTENCE COMPARATOR (BIM 2.0 directive §10) ──────────────
//
// Invariant under test: **model before save ≡ model after reload**, per
// property, per element, for every element kind the world can compose.
//
// Flow (oracle discipline per directive §7 — the expected state is captured
// INDEPENDENTLY, before the serializer runs; the reloaded state is read back
// through the REAL loader path, never through the handler that wrote it):
//
//   1. seed a model through REAL commands (CommandManager + @pryzm/command-registry)
//   2. mutate a subset through LIVE bus verbs (the commandManager bridges)
//   3. EXPECTED  = deep capture of every authoritative store
//   4. snapshot  = REAL ProjectSerializer.serialize(real store bundle)
//   5. wire      = JSON.parse(JSON.stringify(snapshot))   — the actual save format
//   6. reload    = REAL ProjectLoader(cm).load(wire)      — clears + re-creates
//   7. ACTUAL    = deep capture again
//   8. per kind: diff. Any divergence not on the DOCUMENTED-TOLERANCES list is
//      reported by path. A kind whose capture reached no store = MISCONFIGURED.
//
// DOCUMENTED TOLERANCES: started EMPTY (the STOP rule); the first run's
// divergences were reported as FINDINGS and then GOVERNED, not normalised —
// ADR-0319 is the governance act. The comparator now excludes exactly the
// fields that ADR enumerates BY NAME, in two separately-named, single-sourced
// lists from ../capture.ts (the same module the undo comparator reads — there
// is no second list):
//
//   class 3 (`metadata.createdAt`, `metadata.modifiedAt`) — DERIVED-INCIDENTAL,
//     excludable across a restore AND an undo (ADR-0319 §3);
//   class 2 (`metadata.version`, `_renderVersion`) — DERIVED-BUT-CAUSAL,
//     excludable across a RESTORE ONLY (ADR-0319 §2: "may differ across a
//     restore; may NOT differ across an undo"). THIS comparator measures a
//     restore, so it may consume the class-2 list; the UNDO comparator
//     (undoredo.cert.ts) must NEVER consume it, and the TWO-LIST SEPARATION
//     test below asserts exactly that split.
//
// Every row that excluded anything prints the count, the field names, and the
// ADR-0319 § citation — a green row never hides what was dropped.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { World } from '../world';
import {
  captureState, diffKind, diffState,
  isAdr0319Class3, isAdr0319Class2RestoreOnly,
  ADR0319_CLASS3_FIELDS, ADR0319_CLASS2_RESTORE_ONLY,
  ADR0319_CLASS3_CITATION, ADR0319_CLASS2_RESTORE_CITATION,
  type StateCapture, type Divergence,
} from '../capture';
import { finishRow, writeResults, type CertRow } from '../report';
import { seedWorld } from '../seed';

let world: World;
let expected: StateCapture;
let actual: StateCapture;
let loadResult: { success: boolean; loaded: number; failed: number; errors: string[]; warnings: string[] } | null = null;
let loadError = '';
let serializeError = '';
let seedOutcomes: Record<string, string> = {};   // kind → 'SEEDED' | reason it could not be
let mutateOutcomes: Record<string, string> = {}; // verb → outcome line
const rows: CertRow[] = [];
const ROOM_ID = crypto.randomUUID();
// CE-03 — the exact JSON wire the loader consumed, retained so the IndexedDB
// round-trip arm below measures the SAME bytes, not a re-serialization.
let savedWire: unknown = null;

// ── §C10-STRUCTURED — machine-readable measurement, not prose ────────────────
// The row's `persistence` cell is a HUMAN sentence with the first 12 divergences
// truncated into it. Wave-3 gates (check-identity-roundtrip,
// check-derived-regenerable) must not regex a sentence to learn what diverged,
// so the same comparison is ALSO emitted structurally here. Both come from the
// one `diffKind` call — there is no second, softer comparison.
const divergencesByKind: Record<string, Divergence[]> = {};
// §C10-STRUCTURED, same rule for the EXCLUDED side: what the comparator dropped
// under ADR-0319 is emitted structurally too, per kind, full paths — a gate must
// be able to see what was tolerated without parsing a sentence.
const excludedByKind: Record<string, Divergence[]> = {};
const idsByKind: Record<string, { expected: string[]; actual: string[]; reachedExpected: boolean; reachedActual: boolean }> = {};

// ── Documented derived-state tolerances ──────────────────────────────────────
// RULE: every entry MUST cite the document that declares the field derived.
// The ONLY tolerances are the two ADR-0319 lists, imported from ../capture.ts —
// single-sourced with the undo comparator, never duplicated here (a second copy
// is how a tolerance list starts growing to fit whatever is failing, which the
// acceptance plan's §0 rule 3 forbids). This is a RESTORE comparator, so BOTH
// classes apply (ADR-0319 §2 + §3); the undo comparator applies §3 alone.
const tolerated = (path: string): boolean => isAdr0319Class3(path) || isAdr0319Class2RestoreOnly(path);

/** Render what a row excluded — count + FIELD NAMES + the ADR-0319 § citation,
 *  per class. Empty string when nothing was excluded. Never a bare count. */
function exclNote(toleratedDivergences: Divergence[]): string {
  if (toleratedDivergences.length === 0) return '';
  const parts: string[] = [];
  for (const [cls, predicate, citation] of [
    ['§3', isAdr0319Class3, ADR0319_CLASS3_CITATION],
    ['§2', isAdr0319Class2RestoreOnly, ADR0319_CLASS2_RESTORE_CITATION],
  ] as const) {
    const hit = toleratedDivergences.filter((d) => predicate(d.path));
    if (hit.length === 0) continue;
    const names = [...new Set(hit.map((d) => d.path.split('.').slice(2).join('.')))];
    parts.push(`${hit.length} excluded [${names.join(', ')}] per ADR-0319 ${cls} — ${citation}`);
  }
  return `; ${parts.join('; ')}`;
}

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();
  // 1-2 ── seed through REAL commands + mutate through LIVE bus verbs ────────
  // The model is defined ONCE in ../seed.ts so regenerable.cert.ts measures the
  // SAME model, not a lookalike (see that file's header).
  ({ seedOutcomes, mutateOutcomes } = await seedWorld(world, ROOM_ID));

  // 3 ── EXPECTED: independent capture, BEFORE the serializer is asked anything
  expected = captureState(world);

  // 4-6 ── REAL serializer → JSON wire → REAL loader ─────────────────────────
  try {
    const modS = await import('../../../../apps/editor/src/engine/persistence/ProjectSerializer');
    const snapshot = modS.ProjectSerializer.serialize(
      world.stores as never, world.bimManager as never, { projectName: 'bim20-cert' });
    const wire = JSON.parse(JSON.stringify(snapshot));
    savedWire = wire;
    try {
      const modL = await import('../../../../apps/editor/src/engine/persistence/ProjectLoader');
      const loader = new modL.ProjectLoader(world.cm as never);
      loadResult = await loader.load(wire);
    } catch (e) {
      loadError = String(e).slice(0, 600);
    }
  } catch (e) {
    serializeError = String(e).slice(0, 600);
  }

  // 7 ── ACTUAL: capture after reload ────────────────────────────────────────
  actual = captureState(world);
}, 600_000);

describe('HARNESS 1 — persistence round-trip comparator (§10)', () => {
  it('the run is not silently empty (MISCONFIGURED guard)', () => {
    const seededKinds = Object.entries(seedOutcomes).filter(([, v]) => v.startsWith('SEEDED')).map(([k]) => k);
    console.log('[H1] seed outcomes: ' + JSON.stringify(seedOutcomes, null, 2));
    console.log('[H1] mutate outcomes: ' + JSON.stringify(mutateOutcomes, null, 2));
    console.log('[H1] serializeError=' + (serializeError || 'none') + ' loadError=' + (loadError || 'none'));
    console.log('[H1] loadResult=' + JSON.stringify(loadResult && {
      success: loadResult.success, loaded: loadResult.loaded, failed: loadResult.failed,
      errors: loadResult.errors?.slice(0, 10), warnings: loadResult.warnings?.slice(0, 10),
    }));
    const expectedTotal = Object.values(expected).reduce((n, k) => n + Object.keys(k.records).length, 0);
    console.log('[H1] expected capture total records=' + expectedTotal + ' across kinds=' + Object.keys(expected).length);
    // A comparator that reached no store must say MISCONFIGURED, never "0 divergences".
    expect(seededKinds.length, 'no kind seeded — the whole harness is MISCONFIGURED').toBeGreaterThan(0);
    expect(expectedTotal, 'expected capture is EMPTY — MISCONFIGURED, refusing to compare').toBeGreaterThan(0);
  });

  for (const [kind] of [
    ['level'], ['grid'], ['wall'], ['door'], ['window'], ['opening'], ['slab'], ['roof'],
    ['column'], ['beam'], ['stair'], ['curtainWall'], ['handrail'], ['plumbing'],
    ['furniture'], ['ceiling'], ['floor'], ['room'],
  ] as const) {
    it(`round-trip: ${kind}`, () => {
      const seedState = seedOutcomes[kind] ?? 'NOT ATTEMPTED';
      const exp = expected[kind];
      const act = actual[kind];
      const expCount = Object.keys(exp?.records ?? {}).length;

      // §C10-STRUCTURED — record the identity sets for EVERY kind, including the
      // ones whose comparison is skipped below. A kind that was never compared
      // must be visible to a gate as "not compared", never as "no divergences".
      idsByKind[kind] = {
        expected: Object.keys(exp?.records ?? {}),
        actual: Object.keys(act?.records ?? {}),
        reachedExpected: exp?.reached === true,
        reachedActual: act?.reached === true,
      };

      let persistenceVerdict: string;
      let failed = false;

      if (serializeError) {
        persistenceVerdict = `UNPROVEN — serializer unreachable headlessly: ${serializeError}`;
      } else if (loadError) {
        persistenceVerdict = `UNPROVEN — ProjectLoader unreachable headlessly: ${loadError}`;
      } else if (!seedState.startsWith('SEEDED')) {
        persistenceVerdict = `UNPROVEN — kind could not be composed headlessly (${seedState})`;
      } else if (expCount === 0) {
        persistenceVerdict = `UNPROVEN — seed reported success but the authoritative store holds 0 records (MISCONFIGURED for this kind)`;
      } else {
        const r = diffKind(kind, exp, act, tolerated);
        divergencesByKind[kind] = r.divergences;
        excludedByKind[kind] = r.toleratedDivergences;
        if (r.status === 'MISCONFIGURED') {
          persistenceVerdict = `UNPROVEN — MISCONFIGURED: ${JSON.stringify(r.divergences[0])}`;
        } else if (r.status === 'CLEAN') {
          persistenceVerdict = `PROVEN — ${expCount} record(s) round-tripped with 0 undocumented divergences ` +
            `(executed: serialize → JSON → ProjectLoader → re-read)${exclNote(r.toleratedDivergences)}`;
        } else {
          failed = true;
          const named = r.divergences.slice(0, 12)
            .map((d) => `${d.path}: expected ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`);
          persistenceVerdict = `FAIL — ${r.divergences.length} divergence(s): ${named.join(' | ')}` +
            (r.divergences.length > 12 ? ` … +${r.divergences.length - 12} more` : '') +
            exclNote(r.toleratedDivergences);
        }
      }

      const row = finishRow({
        capability: `persist:${kind}`,
        intent: `a ${kind} present in the model before save is identical after reload`,
        command: 'ProjectSerializer.serialize → JSON → ProjectLoader.load',
        authoritativeState: seedState.startsWith('SEEDED') && expCount > 0
          ? `PROVEN — ${expCount} record(s) present in the authoritative store before save (executed read-back)`
          : `UNPROVEN — ${seedState}; records=${expCount}`,
        geometry: 'UNPROVEN — no fragment builders run headlessly; meshes never built in this harness',
        persistence: persistenceVerdict,
        undo: 'n/a — measured by Harness 2',
        redo: 'n/a — measured by Harness 2',
        collaboration: 'UNPROVEN — no transport exists (L-391 leg C); by construction',
        report: loadResult
          ? `PROVEN — loader returned a structured LoadResult (success=${loadResult.success}, loaded=${loadResult.loaded}, failed=${loadResult.failed})`
          : 'UNPROVEN — loader never ran',
        evidence: [
          `seed=${seedState}`,
          `expectedRecords=${expCount}`,
          `loadResult=${JSON.stringify(loadResult && { success: loadResult.success, loaded: loadResult.loaded, failed: loadResult.failed })}`,
        ],
      });
      rows.push(row);
      console.log(`[H1 ${kind}] ${row.status} | persistence: ${persistenceVerdict}`);

      // The test itself fails ONLY on a real measured divergence — UNPROVEN rows
      // are reported, not failed (they are the honest default, not a defect of
      // the harness). A FAIL row is the jackpot and must be loud.
      if (failed) {
        expect.soft(persistenceVerdict, `persistence divergence for ${kind}`).toMatch(/^PROVEN/);
      }
      expect(typeof persistenceVerdict).toBe('string');
    });
  }

  it('FALSIFIABILITY — the comparator goes RED on a mutated expectation and GREEN on truth', () => {
    // (a) truth vs truth over the ACTUAL capture: must be CLEAN.
    const self = diffKind('wall', actual['wall'], actual['wall']);
    // (b) a deliberately WRONG class-1 expectation must be reported, naming the
    //     path — and it must STILL be reported WITH the ADR-0319 exclusions
    //     active. `height` is AUTHORITATIVE (ADR-0319 §1: no tolerance, ever);
    //     if adopting the §2/§3 exclusion lists had widened the comparator
    //     enough to swallow it, this test is the tripwire.
    const tampered = JSON.parse(JSON.stringify(actual['wall']));
    const firstId = Object.keys(tampered.records)[0];
    let red = { status: 'MISCONFIGURED', divergences: [] as unknown[] };
    let redWithExclusions = { status: 'MISCONFIGURED', divergences: [] as unknown[], toleratedCount: 0 };
    if (firstId) {
      (tampered.records[firstId] as { height?: unknown }).height = 99.75; // never written by anything
      red = diffKind('wall', tampered, actual['wall']) as never;
      redWithExclusions = diffKind('wall', tampered, actual['wall'], tolerated) as never;
    }
    console.log('[FALSIFY H1] self-diff=' + self.status +
      ' | tampered-diff=' + red.status + ' divergences=' + JSON.stringify(red.divergences.slice(0, 2)) +
      ' | tampered-diff WITH ADR-0319 exclusions=' + redWithExclusions.status +
      ' (tolerated=' + redWithExclusions.toleratedCount + ')');
    expect(self.status).toBe(Object.keys(actual['wall']?.records ?? {}).length >= 0 && actual['wall']?.reached ? 'CLEAN' : 'MISCONFIGURED');
    if (firstId) {
      expect(red.status).toBe('DIVERGED');
      expect(JSON.stringify(red.divergences)).toContain('height');
      // The exclusion must not have widened: a class-1 tamper stays RED under
      // the exact predicate the round-trip rows above were graded with.
      expect(redWithExclusions.status, 'ADR-0319 exclusions swallowed a CLASS-1 field — the exclusion has WIDENED').toBe('DIVERGED');
      expect(JSON.stringify(redWithExclusions.divergences)).toContain('height');
    }
  });

  it('TWO-LIST SEPARATION — class 2 is excluded by the RESTORE predicate only; the UNDO predicate still fails on it', () => {
    // ADR-0319 §2: counters MAY differ across a restore, may NEVER differ across
    // an undo. So the two comparators consume DIFFERENT predicates over two
    // separately-named lists, and this test pins the split from both sides:
    // a tampered class-2 counter is excluded HERE (with a printed citation) and
    // is a reported divergence under the undo comparator's predicate
    // (isAdr0319Class3 — the exact argument undoredo.cert.ts passes).
    const base = actual['wall'];
    const wallId = Object.keys(base?.records ?? {})[0];
    expect(wallId, 'no wall record to tamper — separation test MISCONFIGURED').toBeTruthy();
    const tampered = JSON.parse(JSON.stringify(base));
    const w = tampered.records[wallId] as {
      _renderVersion?: number;
      metadata?: { version?: number; modifiedAt?: number };
    };
    w._renderVersion = (w._renderVersion ?? 0) + 7;
    if (w.metadata) w.metadata.version = (w.metadata.version ?? 0) + 7;

    // The lists themselves must stay disjoint — a field on both would let one
    // comparator's ruling silently rewrite the other's.
    for (const f of ADR0319_CLASS2_RESTORE_ONLY) {
      expect(ADR0319_CLASS3_FIELDS, `'${f}' appears on BOTH ADR-0319 lists`).not.toContain(f);
    }

    // PERSISTENCE predicate (this suite's `tolerated`): excluded, cited, counted.
    const restore = diffKind('wall', base, tampered, tolerated);
    console.log('[SEPARATION H1] restore comparator: status=' + restore.status +
      ' excluded=' + restore.toleratedCount +
      ' [' + restore.toleratedDivergences.map((d) => d.path).join(', ') + ']' +
      ' — ' + ADR0319_CLASS2_RESTORE_CITATION);
    expect(restore.status).toBe('CLEAN');
    expect(restore.toleratedDivergences.map((d) => d.path)).toContain(`wall.${wallId}._renderVersion`);

    // UNDO predicate (class 3 alone): the same counters are REPORTED divergences.
    const undo = diffKind('wall', base, tampered, isAdr0319Class3);
    const undoPaths = undo.divergences.map((d) => d.path);
    console.log('[SEPARATION H1] undo comparator: status=' + undo.status + ' kept=' + JSON.stringify(undoPaths));
    expect(undo.status, '_renderVersion must stay a FAILURE across an undo (ADR-0319 §2)').toBe('DIVERGED');
    expect(undoPaths).toContain(`wall.${wallId}._renderVersion`);
    if (w.metadata) expect(undoPaths).toContain(`wall.${wallId}.metadata.version`);
  });

  it('MISCONFIGURED guard is itself falsifiable — a capture that reached no store never reports CLEAN', () => {
    const broken = { reached: false, reachError: 'synthetic: store unreachable', records: {} };
    const r = diffKind('wall', broken, actual['wall']);
    console.log('[FALSIFY H1-guard] status=' + r.status);
    expect(r.status).toBe('MISCONFIGURED');
  });

  // ─── CE-03 — the IndexedDB round-trip arm ──────────────────────────────────
  //
  // WHY THIS ARM EXISTS (gap register CE-03): the per-kind rows above prove the
  // model survives serialize → JSON → ProjectLoader — an IN-MEMORY wire. The
  // browser save path additionally parks that wire in IndexedDB
  // (@pryzm/persistence-client IndexedDBStore, C05 §1.2 tier 2.5; plus the
  // IndexedDbBackend event log), and NOTHING in this suite measured that leg,
  // so the register row read UNCERTIFIED-NOT-UNTESTED (the package's own 15/15
  // unit suite is evidence, not certification — C70 §0.1: no seeded world, no
  // whole-store comparator, not enrolled in certify.ts).
  //
  // SUBSTRATE, DECLARED LOUDLY: IndexedDB here is **fake-indexeddb, a shim,
  // not a browser**. That distinction is load-bearing: the shim executes the
  // real structured-clone semantics in-process, but nothing this arm proves
  // extends to browser storage quotas, eviction, or multi-tab locking.
  //
  // WHAT STAYS UNPROVEN, NAMED RATHER THAN SCOPED PAST: the Supabase
  // remote-save leg has ZERO executed client tests anywhere in the repo. This
  // arm measures the LOCAL IndexedDB tier only and says so in its row.
  it('CE-03 — IndexedDB round-trip: seed → save → reload → whole-store compare (fake-indexeddb, a shim, not a browser)', async () => {
    // Floors first (C70 §7): a verdict over an empty subject is refused.
    const expectedTotal = Object.values(expected).reduce((n, k) => n + Object.keys(k.records).length, 0);
    const floorsMet = expectedTotal >= 12 && savedWire !== null && !serializeError;
    const hadNativeIdb = typeof (globalThis as { indexedDB?: unknown }).indexedDB !== 'undefined';
    const SHIM_DECL = 'IndexedDB provided by fake-indexeddb, a SHIM, not a browser — nothing here proves quotas, eviction, or multi-tab behaviour';

    let persistenceVerdict: string;
    let failed = false;
    const evidence: string[] = [
      `substrate=fake-indexeddb (shim, not a browser); environment had native indexedDB before shim install: ${hadNativeIdb}`,
      `expectedCaptureRecords=${expectedTotal} (floor 12)`,
    ];

    if (!floorsMet) {
      persistenceVerdict = `UNPROVEN — MISCONFIGURED for this arm: expected capture holds ${expectedTotal} records ` +
        `(floor 12) / wire ${savedWire === null ? 'ABSENT' : 'present'} / serializeError=${serializeError || 'none'} — ` +
        'a comparator over an empty or unserialized subject reports nothing and this arm refuses to grade it.';
    } else {
      await import('fake-indexeddb/auto'); // installs indexedDB + IDBKeyRange + friends
      // The shim installs onto `window` when one exists (happy-dom). The real
      // backends read `globalThis.indexedDB` / bare `indexedDB` — mirror the
      // shim across so BOTH production classes see the same fake, and nothing
      // half-installed can masquerade as a browser.
      {
        const g = globalThis as Record<string, unknown>;
        const wg = window as unknown as Record<string, unknown>;
        for (const k of ['indexedDB', 'IDBKeyRange', 'IDBDatabase', 'IDBTransaction', 'IDBObjectStore', 'IDBRequest', 'IDBOpenDBRequest', 'IDBCursor', 'IDBFactory']) {
          if (typeof g[k] === 'undefined' && typeof wg[k] !== 'undefined') g[k] = wg[k];
        }
      }
      // Direct module imports — NOT the package barrel (module-scope side
      // effects in unrelated barrel members must not decide this arm's verdict;
      // the SCC/barrel lesson).
      const { IndexedDBStore } = await import('../../../../packages/persistence-client/src/IndexedDBStore');
      const { IndexedDbBackend } = await import('../../../../packages/persistence-client/src/backends/IndexedDbBackend');
      const { PERSISTED_EVENT_VERSION } = await import('../../../../packages/persistence-client/src/types');
      const problems: string[] = [];
      const proofs: string[] = [];

      // ── Leg 1: the REAL production wire through the REAL IndexedDBStore ────
      // (the C05 §1.2 tier-2.5 offline snapshot cache), read back through a
      // FRESH instance — never the handle that wrote it (oracle discipline §7).
      const writer = new IndexedDBStore();
      await writer.init();
      await writer.saveSnapshot('bim20-cert-idb', savedWire);
      const reader = new IndexedDBStore();
      await reader.init();
      const wireBack = await reader.loadSnapshot('bim20-cert-idb');
      const wireBytesEqual = JSON.stringify(wireBack) === JSON.stringify(savedWire);
      if (wireBytesEqual) {
        proofs.push('the production save wire is BYTE-IDENTICAL after the IndexedDB round trip (IndexedDBStore.saveSnapshot → fresh instance → loadSnapshot), so every per-kind round-trip verdict above applies verbatim to the IndexedDB-persisted bytes');
      } else {
        problems.push('production wire NOT byte-identical after the IndexedDB round trip');
      }
      evidence.push(`wireBytesEqualThroughIdb=${wireBytesEqual}`);

      // ── Leg 2: WHOLE-STORE comparator across the IDB leg ───────────────────
      // The whole-store EXPECTED capture itself goes through IndexedDB and is
      // compared with the SAME diffState comparator, zero tolerances: every
      // kind, every record, every property, per path.
      await writer.saveSnapshot('bim20-cert-capture', expected);
      const captureBack = (await reader.loadSnapshot('bim20-cert-capture')) as StateCapture;
      // Watched RED before this green was accepted (C70 §5.6): a planted
      // corruption of the reloaded capture (wall height 12.34) was reported as
      // `wall.cert-wall-1.height` by this exact comparator on 2026-08-14, then
      // the tamper was removed. The POSITIVE control below re-proves the same
      // property on every run.
      const wholeStore = diffState(expected, captureBack);
      if (wholeStore.clean) {
        proofs.push(`whole-store compare across the IDB leg: ${expectedTotal} records, ALL kinds, 0 divergences, 0 tolerances consumed`);
      } else {
        problems.push(`whole-store compare across the IDB leg: ${wholeStore.divergences.length} divergence(s), ` +
          `misconfigured kinds [${wholeStore.misconfigured.join(',')}]: ` +
          wholeStore.divergences.slice(0, 6).map((d) => d.path).join(' | '));
      }
      evidence.push(`wholeStoreDivergencesThroughIdb=${wholeStore.divergences.length}`);

      // ── POSITIVE control (runs EVERY invocation): the comparator must be able
      // to SEE a corruption through the IDB leg, or its green means nothing.
      const tamperedCapture: StateCapture = JSON.parse(JSON.stringify(expected));
      const wallIds = Object.keys(tamperedCapture['wall']?.records ?? {});
      let controlFired = false;
      if (wallIds.length > 0) {
        (tamperedCapture['wall'].records[wallIds[0]] as { height?: unknown }).height = 99.75; // never written by anything
        await writer.saveSnapshot('bim20-cert-capture-tampered', tamperedCapture);
        const tamperedBack = (await reader.loadSnapshot('bim20-cert-capture-tampered')) as StateCapture;
        const red = diffState(expected, tamperedBack);
        controlFired = red.divergences.some((d) => d.path.endsWith('.height'));
      }
      if (!controlFired) {
        problems.push('POSITIVE CONTROL FAILED — a planted class-1 corruption (wall height 99.75) stored in IDB was NOT reported by the comparator; the whole-store green above is therefore blind and refused');
      }
      evidence.push(`positiveControlFired=${controlFired}`);

      // ── NEGATIVE control: emptiness is never a pass. An absent snapshot must
      // read as null (a refusal the caller can see), never as an empty model.
      const absent = await reader.loadSnapshot('bim20-cert-NEVER-WRITTEN');
      const absentIsNull = absent === null;
      if (!absentIsNull) problems.push(`NEGATIVE CONTROL FAILED — a never-written project id returned ${JSON.stringify(absent).slice(0, 80)} instead of null`);
      evidence.push(`absentSnapshotReadsNull=${absentIsNull}`);

      // ── Leg 3: the REAL IndexedDbBackend event log over the same shim ──────
      // (the OTHER IndexedDB store in persistence-client — separate schema,
      // separate consumer). The event carries the real wire as payload so the
      // round trip is over production-sized content, replayed in order.
      const backend = new IndexedDbBackend({ projectId: 'bim20-cert-eventlog' });
      const mkEvent = (seq: number): unknown => ({
        seq, version: PERSISTED_EVENT_VERSION, persistedAt: new Date(0).toISOString(),
        event: {
          id: `cert-${seq}`, type: 'cert.wire', payload: { wire: savedWire },
          affectedStores: ['cert'], patches: [], forward: [], inverse: [],
          audit: { actorId: 'cert-harness', projectId: 'bim20-cert', clientId: 'node', timestamp: new Date(0).toISOString() },
        },
      });
      await backend.append(mkEvent(1) as never);
      await backend.append(mkEvent(2) as never);
      const replayed: Array<{ seq: number }> = [];
      for await (const ev of backend.replay(0)) replayed.push(ev as never);
      const eventLogOk = replayed.length === 2 && replayed[0].seq === 1 && replayed[1].seq === 2 &&
        JSON.stringify((replayed[1] as { event?: { payload?: { wire?: unknown } } }).event?.payload?.wire) === JSON.stringify(savedWire);
      await backend.close();
      if (eventLogOk) {
        proofs.push('the REAL IndexedDbBackend event log round-tripped 2 events carrying the full wire, in seq order, byte-identical payload');
      } else {
        problems.push(`IndexedDbBackend event-log round trip diverged (replayed=${replayed.length})`);
      }
      evidence.push(`eventLogRoundTripOk=${eventLogOk}`);

      failed = problems.length > 0;
      persistenceVerdict = (failed
        ? `FAIL — ${problems.join('; ')}`
        : `PROVEN — ${proofs.join('; ')}`) +
        `. Substrate: ${SHIM_DECL}. ` +
        'Supabase remote-save leg: UNPROVEN — zero executed client tests exist for the remote leg anywhere in the repo; ' +
        'this arm measures the LOCAL IndexedDB tier (C05 §1.2 tier 2.5) only and does not scope past that silently.';
    }

    const row = finishRow({
      capability: 'persist:indexeddb-roundtrip',
      intent: 'the exact save wire and the whole-store capture survive the IndexedDB tier byte-identically (CE-03)',
      command: 'IndexedDBStore.saveSnapshot → fresh instance → loadSnapshot (+ IndexedDbBackend append → replay)',
      authoritativeState: floorsMet
        ? `PROVEN — the EXPECTED capture held ${expectedTotal} records across ${Object.keys(expected).length} kinds before the IDB leg ran (floor 12)`
        : `UNPROVEN — subject not established (records=${expectedTotal})`,
      geometry: 'UNPROVEN — no fragment builders run headlessly; meshes never built in this harness',
      persistence: persistenceVerdict,
      undo: 'n/a — measured by Harness 2',
      redo: 'n/a — measured by Harness 2',
      collaboration: 'UNPROVEN — no transport exists (L-391 leg C); by construction',
      report: 'PROVEN — every leg above returns a typed value the arm read (null for absent, thrown errors surface); the SHIM and the UNPROVEN Supabase leg are declared in the verdict, never silently scoped past',
      evidence,
    });
    rows.push(row);
    console.log(`[H1 CE-03 indexeddb] ${row.status}\n  ${persistenceVerdict}`);
    console.log(`[H1 CE-03 indexeddb] SUBSTRATE: ${SHIM_DECL}`);
    console.log('[H1 CE-03 indexeddb] Supabase remote-save leg: UNPROVEN — zero executed client tests; NOT certified by this arm.');

    expect(floorsMet, 'CE-03 arm could not establish its subject').toBe(true);
    expect.soft(persistenceVerdict, 'CE-03 IndexedDB round-trip').toMatch(/^PROVEN/);
    if (failed) expect.soft(persistenceVerdict, 'CE-03 divergence detail').toBe('');
  });
});

afterAll(() => {
  const p = writeResults('persistence.json', {
    harness: 'H1-persistence', generatedAt: new Date().toISOString(),
    seedOutcomes, mutateOutcomes, serializeError, loadError,
    loadResult: loadResult && {
      success: loadResult.success, loaded: loadResult.loaded, failed: loadResult.failed,
      errors: loadResult.errors, warnings: loadResult.warnings,
    },
    registrationFailures: world?.registrationFailures ?? [],
    // §C10-STRUCTURED — see the declaration block at the top of this file.
    // `comparedKinds` is the list of kinds whose comparison ACTUALLY RAN; a gate
    // that grades a kind absent from this list is grading nothing and must say so.
    comparedKinds: Object.keys(divergencesByKind),
    divergencesByKind,
    // What ADR-0319 allowed this comparator to drop, per kind, FULL paths +
    // values — the machine-readable twin of the per-row exclusion note. An
    // empty object here plus green rows means nothing was excluded at all.
    excludedByKind,
    exclusionRule: {
      class3: { fields: ADR0319_CLASS3_FIELDS, citation: ADR0319_CLASS3_CITATION },
      class2RestoreOnly: { fields: ADR0319_CLASS2_RESTORE_ONLY, citation: ADR0319_CLASS2_RESTORE_CITATION },
    },
    idsByKind,
    rows,
  });
  console.log('[H1] results written: ' + p);
});
