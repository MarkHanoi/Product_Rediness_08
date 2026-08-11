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
import { captureState, diffKind, kindReaders, type StateCapture } from '../capture';
import { finishRow, writeResults, type CertRow } from '../report';
import { deserializeRoom } from '@pryzm/room-topology';

let world: World;
let expected: StateCapture;
let actual: StateCapture;
let loadResult: { success: boolean; loaded: number; failed: number; errors: string[]; warnings: string[] } | null = null;
let loadError = '';
let serializeError = '';
const seedOutcomes: Record<string, string> = {};   // kind → 'SEEDED' | reason it could not be
const mutateOutcomes: Record<string, string> = {}; // verb → outcome line
const rows: CertRow[] = [];
const ROOM_ID = crypto.randomUUID();

// ── Documented derived-state tolerances ──────────────────────────────────────
// RULE: every entry MUST cite the document that declares the field derived.
// This list is EMPTY on purpose: no divergence found by this harness has yet
// been traced to a documented derived-state contract. Findings stay findings.
const DOCUMENTED_TOLERANCES: Array<{ pattern: RegExp; citation: string }> = [];
const tolerated = (path: string): boolean => DOCUMENTED_TOLERANCES.some((t) => t.pattern.test(path));

beforeAll(async () => {
  const { buildWorld } = await import('../world');
  world = await buildWorld();
  const reg = await import('@pryzm/command-registry') as any;
  const cm = world.cm;

  /** Seed helper — a THROW or a refused result is recorded, never swallowed. */
  const seed = (kind: string, fn: () => { success?: boolean; info?: string[] } | void): void => {
    try {
      const r = fn();
      if (r && r.success === false) {
        seedOutcomes[kind] = `REFUSED: ${[...(r.info ?? []), (r as { error?: string }).error ?? ''].filter(Boolean).join('; ') || 'no reason given'}`;
      } else {
        seedOutcomes[kind] = seedOutcomes[kind] === undefined || seedOutcomes[kind] === 'SEEDED'
          ? 'SEEDED' : seedOutcomes[kind];
      }
    } catch (e) {
      seedOutcomes[kind] = `THREW: ${String(e).slice(0, 300)}`;
    }
  };

  // 1 ── seed through REAL commands ─────────────────────────────────────────
  seed('level', () => cm.execute(new reg.AddLevelCommand({ levelId: 'L1', name: 'Level 1', elevation: 3, height: 3 })));
  seed('grid',  () => cm.execute(new reg.AddGridCommand({ gridId: 'cert-grid-1', orientation: 'X', position: 2 })));
  seed('wall',  () => cm.execute(new reg.CreateWallCommand('cert-wall-1', {
    start: { x: 0, z: 0 }, end: { x: 6, z: 0 }, height: 3, thickness: 0.2, levelId: 'L0', materialColor: '#aabbcc',
  })));
  seed('wall',  () => cm.execute(new reg.CreateWallCommand('cert-wall-2', {
    start: { x: 0, z: 4 }, end: { x: 6, z: 4 }, height: 3, thickness: 0.2, levelId: 'L0',
  })));
  seed('door',  () => cm.execute(new reg.CreateWallOpeningCommand({
    wallId: 'cert-wall-1',
    openingData: { type: 'door', offset: 1.5, width: 0.9, height: 2.1, sillHeight: 0, doorType: 'single' },
  })));
  seed('window', () => cm.execute(new reg.CreateWallOpeningCommand({
    wallId: 'cert-wall-2',
    openingData: { type: 'window', offset: 2.0, width: 1.2, height: 1.4, sillHeight: 0.9, windowType: 'single' },
  })));
  seed('slab', () => cm.execute(new reg.CreateSlabCommand({
    id: 'cert-slab-1', levelId: 'L0', position: { x: 3, y: 0, z: 2 },
    polygon: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }],
    thickness: 0.25, width: 6, depth: 4,
  })));
  seed('roof', () => cm.execute(new reg.CreateRoofCommand('cert-roof-1', {
    levelId: 'L0',
    footprint: { polygon: [[-1, -1], [7, -1], [7, 5], [-1, 5]], centroid: [3, 2] },
    roofType: 'flat', overhang: 0.3, baseOffset: 3, thickness: 0.2,
  })));
  seed('column', () => cm.execute(new reg.CreateColumnCommand({
    position: { x: 3, y: 0, z: 2 }, levelId: 'L0', width: 0.3, depth: 0.3, height: 3,
    rotation: 0, profile: 'rectangular', baseOffset: 0,
  })));
  seed('stair', () => cm.execute(new reg.CreateStairCommand({
    id: 'cert-st-1', baseLevelId: 'L0', topLevelId: 'L1', shape: 'I',
    riserHeight: 3 / 18, treadDepth: 0.28, width: 1.0,
    startPosition: { x: 5, y: 0, z: 3 },
    flights: [{ direction: { x: 0, y: 0, z: 1 }, riserCount: 18 }],
  })));
  seed('beam', () => cm.execute(new reg.CreateBeamCommand({
    startPoint: { x: 0, y: 3, z: 0 }, endPoint: { x: 6, y: 3, z: 0 }, levelId: 'L0',
    sectionType: 'rectangular', width: 0.2, depth: 0.4,
  })));
  seed('curtainWall', () => cm.execute(new reg.CreateCurtainWallCommand({
    id: 'cert-cw-1', levelId: 'L0',
    start: { x: 0, z: 6 }, end: { x: 6, z: 6 }, height: 3,
    gridXSpacing: 1.5, gridYSpacing: 1.5,
  })));
  seed('handrail', () => cm.execute(new reg.CreateHandrailCommand({
    id: 'cert-hr-1', start: { x: 0, z: 8 }, end: { x: 4, z: 8 }, height: 0.9, thickness: 0.05, levelId: 'L0',
  })));
  seed('plumbing', () => cm.execute(new reg.CreatePlumbingFixtureCommand({
    id: 'cert-pl-1', levelId: 'L0', fixtureType: 'toilet',
    position: { x: 1, y: 0, z: 1 }, rotation: { x: 0, y: 0, z: 0 }, baseOffset: 0,
  })));
  seed('furniture', () => cm.execute(new reg.CreateFurnitureCommand({
    id: 'cert-fu-1', levelId: 'L0', furnitureType: 'bed', position: { x: 2, y: 0, z: 2 },
    rotation: { x: 0, y: 0, z: 0 }, baseOffset: 0,
    width: 1.6, length: 2.0, height: 0.5, material: 'wood',
  })));
  seed('ceiling', () => cm.execute(new reg.CreateCeilingCommand({
    ceilingId: 'cert-ce-1', ifcGuid: 'cert-ce-1-guid', levelId: 'L0',
    polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
    height: 2.7,
  })));
  seed('floor', () => cm.execute(new reg.CreateFloorCommand({
    floorId: 'cert-fl-1', ifcGuid: 'cert-fl-1-guid', levelId: 'L0',
    polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
  })));
  seed('room', () => cm.execute(new reg.BatchCreateRoomsCommand([deserializeRoom({
    id: ROOM_ID, type: 'room', name: 'Cert Room', levelId: 'L0',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
                height: 3, baseOffset: 0, detectionMethod: 'manual-boundary' },
  })])));
  // opening records ride along with door/window seeding (CreateWallOpeningCommand).
  seedOutcomes['opening'] = seedOutcomes['door'] === 'SEEDED' || seedOutcomes['window'] === 'SEEDED'
    ? 'SEEDED (via door/window CreateWallOpeningCommand)'
    : 'NOT SEEDED (door/window seeding failed)';

  // 2 ── mutate through LIVE bus verbs so persisted values are not defaults ──
  const mutate = async (verb: string, payload: unknown): Promise<void> => {
    const r = await world.dispatch(verb, payload);
    mutateOutcomes[verb] = r.ok ? 'DISPATCHED OK' : `THREW: ${r.err}`;
  };
  await mutate('roof.update', { id: 'cert-roof-1', updates: { thickness: 0.35 } });
  await mutate('wall.updateDimensions', { wallId: 'cert-wall-1', height: 4.2 });
  const doorRec = (await import('@pryzm/geometry-door')).doorStore.getAll()[0];
  if (doorRec) await mutate('door.setOffset', { doorId: doorRec.id, newOffset: 2.5, prevOffset: doorRec.offset });
  const winRec = (await import('@pryzm/geometry-window')).windowStore.getAll()[0];
  if (winRec) await mutate('window.setOffset', { windowId: winRec.id, newOffset: 1.0, prevOffset: winRec.offset });
  await mutate('element.updateParameters', {
    elementId: 'cert-wall-2', elementType: 'wall', parameters: { materialColor: '#112233' },
  });
  await mutate('room.setMaterial', { roomId: ROOM_ID, materialColor: '#ff8800' });

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
    rows,
  });
  console.log('[H1] results written: ' + p);
});
