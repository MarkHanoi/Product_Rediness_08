// ─── The certification SEED — one model, used by every harness ───────────────
//
// Extracted from `__tests__/persistence.cert.ts` (unchanged in content) so that
// `regenerable.cert.ts` measures THE SAME MODEL rather than a lookalike. Two
// harnesses seeding two similar-but-not-identical models is how a divergence
// gets blamed on the code when it belongs to the fixture.
//
// Everything here goes through REAL `@pryzm/command-registry` commands on the
// REAL `CommandManager` — no store is written directly, so a kind that cannot be
// composed by a real command is REPORTED as unseeded rather than faked into
// existence.

import type { World } from './world';

export interface SeedOutcome {
  seedOutcomes: Record<string, string>;
  mutateOutcomes: Record<string, string>;
  roomId: string;
}

export async function seedWorld(world: World, roomId: string): Promise<SeedOutcome> {
  const reg = await import('@pryzm/command-registry') as any;
  const { deserializeRoom } = await import('@pryzm/room-topology');
  const cm = world.cm;
  const seedOutcomes: Record<string, string> = {};
  const mutateOutcomes: Record<string, string> = {};

  /** A THROW or a refused result is recorded, never swallowed. */
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
    id: roomId, type: 'room', name: 'Cert Room', levelId: 'L0',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 6, z: 0 }, { x: 6, z: 4 }, { x: 0, z: 4 }],
                height: 3, baseOffset: 0, detectionMethod: 'manual-boundary' },
  })])));
  // ── §MT-06-SUBJECT — the `opening` kind seeds its OWN subject ──────────────
  //
  // THIS LINE USED TO READ:
  //
  //   seedOutcomes['opening'] = seedOutcomes['door'] === 'SEEDED' || … ? 'SEEDED
  //     (via door/window CreateWallOpeningCommand)' : 'NOT SEEDED (…)'
  //
  // …and that is the whole of certification finding F-5 ("`persist:opening` is
  // MISCONFIGURED for its kind"). It declared the kind SEEDED on the strength of
  // a DOOR or a WINDOW having been created — but `capture.ts` reads the kind
  // back through `openingStore.getAll()`, and `openingStore` has never held a
  // door or a window in its life. The census committed alongside this change
  // (`packages/command-registry/__tests__/openingAuthorityCensus.test.ts`,
  // §MT-06-CENSUS) measures the two collections and finds ZERO overlap:
  //
  //     CreateWallOpeningCommand  -> WallData.openings[] 1, windowStore 1,
  //                                  openingStore 0
  //     CreateOpeningCommand      -> openingStore 1, WallData.openings[] 0
  //
  // and `CreateOpeningCommand.canExecute` resolves its host through `slabStore`
  // ONLY, so a wall id is REFUSED by construction. The seed and the reader were
  // pointed at two different kinds. The row was never measuring anything: it
  // reported `SEEDED` and then `expectedRecords=0`, which the comparator
  // correctly refused to call "clean".
  //
  // THE FIX IS AT THE INSTRUMENT, NOT AT A LEDGER, and it POLICES MORE than
  // before rather than less. Previously `persist:opening` compared 0 records and
  // proved nothing. Now it composes the kind `openingStore` actually holds — a
  // standalone slab opening, the stairwell-cut / shaft / service-penetration
  // record — through the REAL `CreateOpeningCommand`, so the row exercises
  // ProjectSerializer's `snapshot.openings` write AND ImportProjectCommand's
  // Step 5d restore. That load path is the one §L-B3 (DAILY-USE-AUDIT
  // 2026-05-20) found silently dropping every stairwell cut after one autosave,
  // and until now NOTHING in the certification suite executed it.
  //
  // The wall-hosted half is not orphaned by this: it is measured by the
  // `persist:door` / `persist:window` rows, and `wall.*.openings.0.*` is a
  // declared path in authoritative-state.cert.ts.
  //
  // Hosted on `cert-slab-1`, so this must stay AFTER the slab seed above.
  seed('opening', () => cm.execute(new reg.CreateOpeningCommand({
    id: 'cert-op-1', hostId: 'cert-slab-1', levelId: 'L0',
    profile: [{ x: 1, y: 1 }, { x: 2.2, y: 1 }, { x: 2.2, y: 2.4 }, { x: 1, y: 2.4 }],
    baseOffset: 0,
  })));

  // ── mutate through LIVE bus verbs so persisted values are not defaults ──────
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
  await mutate('room.setMaterial', { roomId, materialColor: '#ff8800' });

  return { seedOutcomes, mutateOutcomes, roomId };
}
