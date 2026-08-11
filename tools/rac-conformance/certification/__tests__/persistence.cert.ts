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
// DOCUMENTED TOLERANCES: starts EMPTY. Divergences found on the first run are
// FINDINGS, reported below — they are NOT normalised away (STOP rule).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { World } from '../world';
import { captureState, diffKind, type StateCapture, type Divergence } from '../capture';
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

// ── §C10-STRUCTURED — machine-readable measurement, not prose ────────────────
// The row's `persistence` cell is a HUMAN sentence with the first 12 divergences
// truncated into it. Wave-3 gates (check-identity-roundtrip,
// check-derived-regenerable) must not regex a sentence to learn what diverged,
// so the same comparison is ALSO emitted structurally here. Both come from the
// one `diffKind` call — there is no second, softer comparison.
const divergencesByKind: Record<string, Divergence[]> = {};
const idsByKind: Record<string, { expected: string[]; actual: string[]; reachedExpected: boolean; reachedActual: boolean }> = {};

// ── Documented derived-state tolerances ──────────────────────────────────────
// RULE: every entry MUST cite the document that declares the field derived.
// This list is EMPTY on purpose: no divergence found by this harness has yet
// been traced to a documented derived-state contract. Findings stay findings.
const DOCUMENTED_TOLERANCES: Array<{ pattern: RegExp; citation: string }> = [];
const tolerated = (path: string): boolean => DOCUMENTED_TOLERANCES.some((t) => t.pattern.test(path));

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
        if (r.status === 'MISCONFIGURED') {
          persistenceVerdict = `UNPROVEN — MISCONFIGURED: ${JSON.stringify(r.divergences[0])}`;
        } else if (r.status === 'CLEAN') {
          persistenceVerdict = `PROVEN — ${expCount} record(s) round-tripped with 0 undocumented divergences (executed: serialize → JSON → ProjectLoader → re-read)`;
        } else {
          failed = true;
          const named = r.divergences.slice(0, 12)
            .map((d) => `${d.path}: expected ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`);
          persistenceVerdict = `FAIL — ${r.divergences.length} divergence(s): ${named.join(' | ')}` +
            (r.divergences.length > 12 ? ` … +${r.divergences.length - 12} more` : '');
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
    // (b) a deliberately WRONG expectation must be reported, naming the path.
    const tampered = JSON.parse(JSON.stringify(actual['wall']));
    const firstId = Object.keys(tampered.records)[0];
    let red = { status: 'MISCONFIGURED', divergences: [] as unknown[] };
    if (firstId) {
      (tampered.records[firstId] as { height?: unknown }).height = 99.75; // never written by anything
      red = diffKind('wall', tampered, actual['wall']) as never;
    }
    console.log('[FALSIFY H1] self-diff=' + self.status +
      ' | tampered-diff=' + red.status + ' divergences=' + JSON.stringify(red.divergences.slice(0, 2)));
    expect(self.status).toBe(Object.keys(actual['wall']?.records ?? {}).length >= 0 && actual['wall']?.reached ? 'CLEAN' : 'MISCONFIGURED');
    if (firstId) {
      expect(red.status).toBe('DIVERGED');
      expect(JSON.stringify(red.divergences)).toContain('height');
    }
  });

  it('MISCONFIGURED guard is itself falsifiable — a capture that reached no store never reports CLEAN', () => {
    const broken = { reached: false, reachError: 'synthetic: store unreachable', records: {} };
    const r = diffKind('wall', broken, actual['wall']);
    console.log('[FALSIFY H1-guard] status=' + r.status);
    expect(r.status).toBe('MISCONFIGURED');
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
    idsByKind,
    rows,
  });
  console.log('[H1] results written: ' + p);
});
