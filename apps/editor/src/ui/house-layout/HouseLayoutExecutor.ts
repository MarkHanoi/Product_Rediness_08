// Casa Unifamiliar — multi-storey HOUSE editor executor (tracker A.21.d–g).
//
// The multi-storey SIBLING of ApartmentLayoutExecutor. Given a footprint shell on
// the active (ground) level + a program + a storey count, it:
//   (a) mints storeys 1…n above the ground level (real editor level ids it owns),
//   (b) calls the pure `generateHouseLayout(...)` with `levelIdForStorey` pointing
//       at the minted ids (so the result references REAL editor levels),
//   (c) per storey, runs the apartment-style per-level command fan-out (walls +
//       door/window openings + doors + boundaries) stamped with that storey's
//       levelId — REUSING the apartment `buildLayoutCommands` pure core,
//   (d) emits a per-storey structural slab (the ground slab + each upper floor),
//   (e) places a stair per StairCore (its `autoCreateOpening` punches the
//       stairwell void in the slab above — see §VOID below),
//   (f) caps the stack with a roof over the top storey's footprint,
// all inside ONE `batchCoordinator.runBatch` → one undo unit + one room-redetect.
//
// ADDITIVE: this does NOT touch ApartmentLayoutExecutor. It reuses the apartment
// engine's PURE pieces (`buildLayoutCommands`, `analyseShell`) + the apartment
// command verbs (`wall.batch.create`, `wall.createOpening`, `door.batch.create`)
// + the apartment opening/boundary batch commands. The single-storey case is a
// strict superset of the apartment single-plate path (no stairs, no voids, a
// roof on top).
//
// P6: every mutation flows through the command bus / commandManager (no direct
// store writes). The pure generator carries no spans (it mirrors the apartment
// tgl convention — spans live at the AiPlane boundary, not in this offline
// deterministic path; the apartment executor likewise adds none).

import { batchCoordinator, storeRegistry } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import {
    AddLevelCommand,
    CreateStairCommand,
    CreateSlabCommand,
    CreateRoofCommand,
    CreateWallOpeningsBatchCommand,
    CreateRoomBoundingLinesBatchCommand,
} from '@pryzm/command-registry';
import { facadeOrientationService } from '@pryzm/spatial-index';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateHouseLayout,
    analyseShell,
    type ShellAnalysis,
    type ShellWallInput,
    type HouseLayoutResult,
    type StairCore,
    type StoreyPlate,
    type RoofDescriptor,
    type ScoredLayoutOption,
    type ApartmentProgram,
    type ApartmentConstraints,
    type ScoringWeights,
    type IdPrefix,
    type LayoutExecuteOptions,
    type LayoutCommandSet,
    buildLayoutCommands,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';

const MM_PER_M = 1000;
const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_SLAB_THICKNESS_M = 0.2;
const DEFAULT_ROOF_THICKNESS_M = 0.25;
const DEFAULT_ROOF_OVERHANG_M = 0.4;     // ~400 mm eave overhang beyond the shell
const DEFAULT_ROOF_PITCH_DEG = 32;       // domestic pitch fallback (~32°) when the engine omits one
const STAIR_RISER_TARGET_M = 0.18;       // ~180 mm — the architectural sweet-spot
const STAIR_RISER_MIN_M = 0.15;
const STAIR_RISER_MAX_M = 0.19;
const STAIR_TREAD_M = 0.27;              // ≥ 250 mm minimum
const STAIR_WIDTH_M = 1.0;               // ≥ 900 mm minimum

/** One flight as the CreateStairCommand consumes it (A.21.D18). `startOverride`
 *  pins flight 2's start for U-shape parallel return runs. */
interface FlightInput {
    direction: { x: number; y: number; z: number };
    riserCount: number;
    startOverride?: { x: number; y: number; z: number };
}

/** A minimal command-manager handle — the legacy synchronous execute path the
 *  apartment executor + floor/ceiling triggers use. */
interface CommandManagerLike {
    execute?: (cmd: unknown, opts?: { source?: string }) => { success?: boolean; info?: string[] } | undefined;
}
function getCommandManager(): CommandManagerLike | undefined {
    return (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
}

/** Wall record as read from the wall store (same shape the apartment executor reads). */
interface WallRecord {
    id: string;
    levelId: string;
    height?: number;
    baseLine?: ReadonlyArray<{ x: number; z: number }>;
    openings?: ReadonlyArray<{ type: 'window' | 'door'; elementId?: string }>;
}

/** T1.W-C parity — gather EXTERNAL shell walls on a level (world metres) so
 *  engine-emitted shell windows resolve to existing wall ids. */
function gatherShellWalls(levelId: string): readonly { id: string; start: { x: number; z: number }; end: { x: number; z: number } }[] {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const facades = facadeOrientationService.getFacades(levelId);
    const out: { id: string; start: { x: number; z: number }; end: { x: number; z: number } }[] = [];
    for (const w of all) {
        if (w.levelId !== levelId) continue;
        if (!facades.get(w.id)?.isExterior) continue;
        const bl = w.baseLine;
        if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
        out.push({ id: w.id, start: { x: bl[0].x, z: bl[0].z }, end: { x: bl[1].x, z: bl[1].z } });
    }
    return out;
}

/** Build a ShellAnalysis from the active level's EXTERIOR walls (mirrors the
 *  apartment shellReader — entrance = first door's host wall, window counts +
 *  SL-3 orientation per face). The house orchestrator reads `shell.perimeter`
 *  for the footprint + `shell.netAreaM2` for the per-storey area budget. */
function analyseActiveShell(levelId: string): ShellAnalysis | null {
    const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
    const all = wallStore?.getAll?.() ?? [];
    const facades = facadeOrientationService.getFacades(levelId);

    const walls: ShellWallInput[] = [];
    const windowCountByWall: Record<string, number> = {};
    const orientationByWall: Record<string, 'N' | 'E' | 'S' | 'W' | null> = {};
    let entranceWallId = '';

    for (const w of all) {
        if (w.levelId !== levelId) continue;
        if (!facades.get(w.id)?.isExterior) continue;
        const bl = w.baseLine;
        if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
        walls.push({ id: w.id, baseLine: [{ x: bl[0].x, z: bl[0].z }, { x: bl[1].x, z: bl[1].z }] });
        windowCountByWall[w.id] = (w.openings ?? []).filter(o => o.type === 'window').length;
        orientationByWall[w.id] = facades.get(w.id)?.orientation ?? null;
        if (!entranceWallId && (w.openings ?? []).some(o => o.type === 'door')) entranceWallId = w.id;
    }
    if (walls.length < 3) return null;
    if (!entranceWallId) entranceWallId = walls[0]!.id;

    return analyseShell(walls, { entranceWallId, windowCountByWall, orientationByWall });
}

/** Result the executor returns to the caller (for logging / test assertions). */
export interface HouseExecuteResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly levelIds?: readonly string[];
    readonly stairCount?: number;
    readonly slabCount?: number;
    readonly roofCreated?: boolean;
}

export interface HouseExecuteInput {
    /** Number of storeys (≥1). Ground level reuses the active level. */
    readonly storeyCount: number;
    /** Floor-to-floor height (m). Default 3.0. */
    readonly floorToFloorM?: number;
    /** Partial room program (bedrooms/bathrooms/…); spread over the gathered
     *  active-level program. */
    readonly program?: Partial<ApartmentProgram>;
    /** Roof form. Default 'gable'. */
    readonly roofKind?: 'flat' | 'gable' | 'hip';
}

export class HouseLayoutExecutor {
    /**
     * Generate + build a complete multi-storey house on the active level's shell.
     * Never throws — returns {ok,reason}. All scene mutation happens inside ONE
     * `batchCoordinator.runBatch` so undo removes the whole house in one step.
     */
    async execute(
        runtime: PryzmRuntime,
        input: HouseExecuteInput,
        program: ApartmentProgram,
        constraints: ApartmentConstraints,
        weights: ScoringWeights,
        siteLatitudeDeg?: number,
    ): Promise<HouseExecuteResult> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };
        try {
            const storeyCount = Math.max(1, Math.floor(input.storeyCount || 1));
            const floorToFloorM = input.floorToFloorM && input.floorToFloorM > 0 ? input.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
            const roofKind = input.roofKind ?? 'gable';

            const ground = resolveActiveLevel();
            if (!ground?.id) { toast('No active level — draw a boundary first.', 'error'); return { ok: false, reason: 'no active level' }; }

            const shell = analyseActiveShell(ground.id);
            if (!shell) { toast('Need a closed exterior shell (≥3 walls) on the active level.', 'error'); return { ok: false, reason: 'no shell' }; }

            const baseElevationM = ground.elevation ?? 0;
            console.log('[house-layout] executor: ground level', ground.id, 'storeys', storeyCount, 'ftf', floorToFloorM, 'shell area', shell.netAreaM2.toFixed(1));

            // ── (a) Mint storeys 1…n-1 ABOVE the ground. Ground reuses the active
            // level id; upper levels are minted here so we own the real ids and
            // feed them to the pure generator via `levelIdForStorey`. AddLevelCommand
            // accepts the id we pass → we capture it directly (no read-back). ──────
            const cm = getCommandManager();
            const levelIds: string[] = [ground.id];
            for (let i = 1; i < storeyCount; i++) {
                const levelId = `L-house-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
                const elevation = baseElevationM + i * floorToFloorM;
                const name = `Level ${i.toString().padStart(2, '0')}`;
                let added = false;
                if (cm?.execute) {
                    const res = cm.execute(new AddLevelCommand({ levelId, name, elevation, height: floorToFloorM }), { source: 'HOUSE_PIPELINE_LEVEL' });
                    added = res?.success ?? false;
                }
                if (!added) {
                    console.warn('[house-layout] AddLevelCommand failed for', levelId, '— aborting');
                    toast('Could not create storey levels. See console.', 'error');
                    return { ok: false, reason: 'level creation failed' };
                }
                levelIds.push(levelId);
            }
            console.log('[house-layout] minted levels', levelIds);

            // ── (b) Pure generation against the REAL editor level ids. ────────────
            const result: HouseLayoutResult = generateHouseLayout(
                shell, program, constraints, weights,
                {
                    storeyCount,
                    floorToFloorM,
                    baseElevationM,
                    levelIdForStorey: (i: number) => levelIds[i] ?? `storey-${i}`,
                    roofKind,
                    ...(typeof siteLatitudeDeg === 'number' ? { solar: { latDeg: siteLatitudeDeg } } : {}),
                },
            );
            console.log('[house-layout] generated — storeys', result.storeys.length, 'stairs', result.stairs.length, 'voids', result.voids.length, 'roof', result.roof.kind);

            // The wall height per storey = floorToFloor (so partitions reach the
            // slab above). Shell walls already exist on the GROUND level only; upper
            // levels have no pre-existing shell, so we DON'T skip exterior walls
            // there (the generator's per-storey walls include the perimeter for the
            // upper plates). On the ground level we skip exteriors (shell exists).
            const wallHeightM = floorToFloorM;

            // Pre-build the per-storey command sets (pure, no mutation yet).
            const perStorey: Array<{ levelId: string; set: LayoutCommandSet; option: ScoredLayoutOption }> = [];
            for (let i = 0; i < result.storeys.length; i++) {
                const storey = result.storeys[i]!;
                const option = result.perStoreyLayout[i];
                if (!option) { console.warn('[house-layout] storey', i, 'produced no layout option — skipping fan-out'); continue; }
                const isGround = i === 0;
                const shellWalls = isGround ? gatherShellWalls(storey.levelId) : [];
                const opts: LayoutExecuteOptions = {
                    levelId: storey.levelId,
                    baseElevationM: storey.elevationM,
                    wallHeightM,
                    // Ground: shell already drawn → build interior partitions only.
                    // Upper storeys: no shell exists yet → build the perimeter too.
                    skipExteriorWalls: isGround,
                    ...(shellWalls.length > 0 ? { shellWalls } : {}),
                };
                const set = buildLayoutCommands(option, opts, (p: IdPrefix) => createId(p));
                perStorey.push({ levelId: storey.levelId, set, option });
            }

            // ── (c-f) ONE batch → one undo unit. Order matters:
            //   1. walls (all storeys)
            //   2. slabs (all storeys) — MUST precede stairs so the stair's
            //      autoCreateOpening can punch the void on the slab above (§VOID).
            //   3. stairs (punch the slab-void as a side-effect).
            //   4. roof on top.
            //   5. doors + windows + boundaries (deferred to after the walls land —
            //      done in a second batch like the apartment executor, since
            //      wall.createOpening reads the committed wall store).
            // We dispatch walls + slabs + stairs + roof here; openings ride a
            // follow-up batch (the host walls must exist first). ──────────────────
            const totalWallCount = perStorey.reduce((n, s) => n + s.set.wallIds.length, 0);
            const allLevelIds = perStorey.map(s => s.levelId);

            batchCoordinator.runBatch(() => {
                // 1. Walls per storey (async bus commands; we don't await — the
                //    batch drains them, exactly like the apartment executor).
                for (const s of perStorey) {
                    try {
                        const r = runtime.bus.executeCommand(s.set.wallBatch.command, s.set.wallBatch.payload) as unknown;
                        if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                            (r as Promise<unknown>).catch((e: unknown) => console.warn('[house-layout] wall.batch.create failed on', s.levelId, e));
                        }
                    } catch (e) { console.warn('[house-layout] wall.batch.create threw on', s.levelId, e); }
                }

                // 2. Structural slab per storey (the floor plate). World-XZ polygon;
                //    position at origin (SlabTool convention: polygon carries world
                //    coords, position.x/z = 0). Upper storeys' voids are punched by
                //    the stair below (§VOID), so the slab polygon has NO holes here.
                if (cm?.execute) {
                    for (const storey of result.storeys) {
                        this._createStorageSlab(cm, storey);
                    }
                }

                // 3. Stairs — one per adjacent storey pair. autoCreateOpening (default
                //    true) punches the stairwell void on the slab whose
                //    levelId === topLevelId. Since the upper slabs were just created
                //    in step 2 (same batch, synchronous cm.execute), the slab exists
                //    when the stair runs → the void IS punched. §VOID.
                if (cm?.execute) {
                    for (const stair of result.stairs) {
                        this._createStair(cm, stair, floorToFloorM, baseElevationM, result.storeys);
                    }
                }

                // 4. Roof cap over the top storey footprint.
                if (cm?.execute) {
                    this._createRoof(cm, result.roof, wallHeightM);
                }
            }, { levelIds: allLevelIds, totalElementCount: totalWallCount + result.storeys.length + result.stairs.length + 1, skipRedetectRooms: true });

            // ── Openings + doors + windows + boundaries, per storey, once the walls
            // have landed (wall.createOpening reads the committed wall store). One
            // coalesced batch with the FINAL room redetect. ──────────────────────
            this._finishOpenings(perStorey);

            // `house.layout-executed` is a house-specific event not in the typed
            // RuntimeEvents union — emit through a loose view (same idiom the
            // apartment pipeline uses for its custom events). Downstream finish
            // passes (floor/ceiling/furnish/light) can subscribe to it.
            (runtime.events as unknown as { emit(k: string, p: unknown): void }).emit('house.layout-executed', {
                levelIds,
                storeyCount: result.storeys.length,
                stairCount: result.stairs.length,
                voidCount: result.voids.length,
                roofKind: result.roof.kind,
            });
            toast(`Built ${result.storeys.length}-storey house — ${result.stairs.length} stair(s), roof on top.`, 'success');

            return {
                ok: true,
                levelIds,
                stairCount: result.stairs.length,
                slabCount: result.storeys.length,
                roofCreated: true,
            };
        } catch (err) {
            console.error('[house-layout] executor threw:', err);
            toast(`House build failed: ${String(err)}`, 'error');
            return { ok: false, reason: String(err) };
        }
    }

    /** Create one structural floor slab for a storey from its footprint polygon. */
    private _createStorageSlab(cm: CommandManagerLike, storey: StoreyPlate): void {
        try {
            const poly: ReadonlyArray<{ x: number; z: number }> = storey.footprint;
            if (poly.length < 3) return;
            const xs = poly.map((p: { x: number; z: number }) => p.x);
            const zs = poly.map((p: { x: number; z: number }) => p.z);
            const width = Math.max(...xs) - Math.min(...xs);
            const depth = Math.max(...zs) - Math.min(...zs);
            // SlabTool convention: polygon vertices are WORLD-XZ ({x: world.x, y: world.z});
            // position.x/z = 0; world Y resolved from level.elevation at projection.
            const slabId = createId('slab');
            cm.execute?.(new CreateSlabCommand({
                id: slabId,
                ifcGuid: createId('slab'),
                width: Math.max(width, 0.1),
                depth: Math.max(depth, 0.1),
                thickness: DEFAULT_SLAB_THICKNESS_M,
                position: { x: 0, y: 0, z: 0 },
                levelId: storey.levelId,
                polygon: poly.map((p: { x: number; z: number }) => ({ x: p.x, y: p.z })),
            }), { source: 'HOUSE_PIPELINE_SLAB' });
            console.log('[house-layout] slab created on', storey.levelId);
        } catch (e) { console.warn('[house-layout] slab create failed (skipped):', e); }
    }

    /** Place the stair connecting a storey pair, honouring the shape (I/L/U) the
     *  pure engine chose (A.21.D18). Risers are sized to match the level gap
     *  (canExecute enforces ±50 mm) and, for L/U, split across the two flights.
     *  autoCreateOpening (default true) computes the stair's BOUNDING footprint
     *  rect — over all flights AND landings (computeStairFootprintRect) — and
     *  punches that exact hole on the slab above, so the void fits the L/U shape.
     *  §VOID. */
    private _createStair(
        cm: CommandManagerLike,
        stair: StairCore,
        floorToFloorM: number,
        baseElevationM: number,
        storeys: readonly StoreyPlate[],
    ): void {
        try {
            // Total risers sized to the gap: count = round(ftf / target), clamped so
            // the per-riser height stays in [0.15, 0.19] m and the total matches ftf.
            let totalRisers = Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
            let riserHeight = floorToFloorM / totalRisers;
            while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) { totalRisers++; riserHeight = floorToFloorM / totalRisers; }
            while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) { totalRisers--; riserHeight = floorToFloorM / totalRisers; }

            // Stair core rect (mm → m).
            const x0 = stair.rectMm.x / MM_PER_M;
            const z0 = stair.rectMm.y / MM_PER_M;
            const wM = stair.rectMm.w / MM_PER_M;
            const hM = stair.rectMm.h / MM_PER_M;
            const runAlongZ = hM >= wM;          // longer dimension carries flight 1
            const fromLevel = storeys.find(s => s.levelId === stair.fromLevelId);
            const startY = (fromLevel?.elevationM ?? baseElevationM);

            const shape = (stair.shape ?? 'I') as 'I' | 'L' | 'U';
            const width = STAIR_WIDTH_M;
            const tread = STAIR_TREAD_M;

            // Flight 1 direction along the longer axis; flight 2 (L/U) follows the
            // engine's resolved directions (carried on stair.flights). Fall back to
            // an I run if the engine didn't carry flights (older results).
            const engFlights = stair.flights && stair.flights.length > 0 ? stair.flights : null;
            const dir1 = engFlights
                ? engFlights[0]!.direction
                : (runAlongZ ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 });

            // Riser split (L/U). risersBeforeLanding from the engine, else ≈half.
            const before = engFlights && engFlights.length === 2
                ? engFlights[0]!.riserCount
                : (shape === 'I' ? totalRisers : Math.max(1, stair.risersBeforeLanding ?? Math.floor(totalRisers / 2)));
            // Re-normalise the split to the gap-derived totalRisers so risers×height
            // === ftf (the command's ±50 mm gate keys off the SUM of riserCounts).
            const split = this._normaliseSplit(shape, totalRisers, before);

            // Start position: near corner of the core, nudged so flight 1 sits inside.
            const startPosition = runAlongZ
                ? { x: x0 + wM / 2, y: startY, z: z0 }
                : { x: x0, y: startY, z: z0 + hM / 2 };

            const built = this._buildFlights(shape, startPosition, dir1, split, width, tread, engFlights);

            cm.execute?.(new CreateStairCommand({
                id: createId('stair'),
                baseLevelId: stair.fromLevelId,
                topLevelId: stair.toLevelId,
                shape,
                riserHeight,
                treadDepth: tread,
                width,
                startPosition,
                flights: built.flights,
                ...(built.landings.length > 0 ? { landings: built.landings } : {}),
                ...(shape === 'L' ? { turnDirection: 'left' as const, stepsBeforeLanding: split.before } : {}),
                ...(shape === 'U' ? { secondRunSide: 'left' as const, stepsBeforeLanding: split.before } : {}),
                accessibilityType: 'standard',
                // autoCreateOpening defaults to true → punches the slab-void above,
                // sized to the stair's full bounding footprint (covers L/U too).
            }), { source: 'HOUSE_PIPELINE_STAIR' });
            console.log('[house-layout] stair created', stair.fromLevelId, '→', stair.toLevelId,
                `(${shape}, ${totalRisers} risers @ ${(riserHeight * 1000).toFixed(0)}mm)`);
        } catch (e) { console.warn('[house-layout] stair create failed (skipped):', e); }
    }

    /** Re-normalise the L/U riser split so the two flights sum to `totalRisers`
     *  (the ±50 mm height gate keys off the SUM of riserCounts). The executor may
     *  derive a slightly different totalRisers than the engine (its own min/max
     *  riser-height clamp), so we re-key the split off the executor's total here.
     *  I → one flight (all risers). */
    private _normaliseSplit(
        shape: 'I' | 'L' | 'U',
        totalRisers: number,
        before: number,
    ): { before: number; after: number } {
        if (shape === 'I' || totalRisers < 3) return { before: totalRisers, after: 0 };
        let b = Math.max(1, Math.min(totalRisers - 1, Math.round(before || Math.floor(totalRisers / 2))));
        if (totalRisers - b < 1) b = totalRisers - 1;
        return { before: b, after: totalRisers - b };
    }

    /** Build the CreateStairInput flights + landings for the chosen shape, mirroring
     *  StairCreationController so the geometry (and thus the auto-opening footprint)
     *  matches what the renderer expects. Directions come from the engine when
     *  present; lengths derive from riserCount × treadDepth. */
    private _buildFlights(
        shape: 'I' | 'L' | 'U',
        start: { x: number; y: number; z: number },
        dir1: { x: number; y: number; z: number },
        split: { before: number; after: number },
        width: number,
        tread: number,
        engFlights: ReadonlyArray<{ riserCount: number; direction: { x: number; y: number; z: number } }> | null,
    ): { flights: FlightInput[]; landings: { depth: number }[] } {
        const d1 = this._unit(dir1);
        if (shape === 'I') {
            return { flights: [{ direction: d1, riserCount: split.before }], landings: [] };
        }
        // Flight-2 direction: from the engine if present, else derived
        // (L = left turn (-z,0,x); U = reverse). Matches StairCreationController.
        const d2raw = engFlights && engFlights.length === 2
            ? engFlights[1]!.direction
            : (shape === 'L' ? { x: -d1.z, y: 0, z: d1.x } : { x: -d1.x, y: 0, z: -d1.z });
        const d2 = this._unit(d2raw);

        if (shape === 'L') {
            // Landing depth = one stair width (corner landing). The command derives
            // flight-2's start from flight-1 end + landing along dir1, so no override.
            return {
                flights: [
                    { direction: d1, riserCount: split.before },
                    { direction: d2, riserCount: split.after },
                ],
                landings: [{ depth: width }],
            };
        }
        // U: flight 2 runs parallel back the other way, offset across by the stair
        // width; landing depth spans both runs (2×width). Mirror StairCreationController.
        const firstLen = split.before * tread;
        const perp = this._unit({ x: -d1.z, y: 0, z: d1.x }); // left side
        const secondStart = {
            x: start.x + d1.x * (firstLen + tread) + perp.x * width,
            y: start.y,
            z: start.z + d1.z * (firstLen + tread) + perp.z * width,
        };
        return {
            flights: [
                { direction: d1, riserCount: split.before },
                // startOverride pins flight 2's parallel return run (U-shape).
                { direction: d2, riserCount: split.after, startOverride: secondStart },
            ],
            landings: [{ depth: 2 * width }],
        };
    }

    /** Normalise an XZ direction to a unit vector (y forced to 0). */
    private _unit(d: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
        const len = Math.hypot(d.x, d.z) || 1;
        return { x: d.x / len, y: 0, z: d.z / len };
    }

    /** Cap the stack with a roof over the top storey footprint. */
    private _createRoof(cm: CommandManagerLike, roof: RoofDescriptor, wallHeightM: number): void {
        try {
            const poly: ReadonlyArray<{ x: number; z: number }> = roof.footprint;
            if (poly.length < 3) return;
            const polygon: [number, number][] = poly.map((p: { x: number; z: number }) => [p.x, p.z] as [number, number]);
            let cx = 0, cz = 0;
            for (const p of poly) { cx += p.x; cz += p.z; }
            cx /= poly.length; cz /= poly.length;
            // A.21.D18 — domestic pitched roof. The engine carries a pitch in
            // DEGREES (gable default ~30°); CreateRoofCommand expects `slope` as
            // rise/run = tan(pitch). Convert so the roof gets a sensible domestic
            // pitch sized to the shell, with an eave OVERHANG beyond the walls.
            // NOTE: CreateRoofCommand has no dedicated "pitch°" or "eave" param —
            // pitch is expressed via `slope`, eaves via `overhang` (the command
            // lacks a separate fascia-driven eave; `overhang` is the eave depth).
            const pitchDeg = roof.kind !== 'flat'
                ? (typeof roof.pitchDeg === 'number' && roof.pitchDeg > 0 ? roof.pitchDeg : DEFAULT_ROOF_PITCH_DEG)
                : 0;
            const slope = pitchDeg > 0 ? Math.tan((pitchDeg * Math.PI) / 180) : undefined;
            cm.execute?.(new CreateRoofCommand(createId('roof'), {
                levelId: roof.levelId,
                footprint: { polygon, centroid: [cx, cz] },
                roofType: roof.kind,
                ...(roof.kind !== 'flat' && slope ? { slope } : {}),
                // Eave overhang beyond the shell (~400 mm) so the roof projects past
                // the walls like a real house. Flat roofs get a small/zero eave.
                overhang: roof.kind !== 'flat' ? DEFAULT_ROOF_OVERHANG_M : 0,
                // Sit the roof at the top of the top storey's walls.
                baseOffset: wallHeightM,
                autoBaseOffset: true,
                thickness: DEFAULT_ROOF_THICKNESS_M,
            }), { source: 'HOUSE_PIPELINE_ROOF' });
            console.log('[house-layout] roof created on', roof.levelId, `(${roof.kind}, ~${pitchDeg.toFixed(0)}°, eave ${(DEFAULT_ROOF_OVERHANG_M * 1000).toFixed(0)}mm)`);
        } catch (e) { console.warn('[house-layout] roof create failed (skipped):', e); }
    }

    /**
     * After the walls have committed, dispatch every storey's doors + windows +
     * boundaries through the legacy synchronous opening/boundary batch commands
     * (mirrors ApartmentLayoutExecutor._finishLayout). One coalesced batch with
     * the FINAL room redetect across all storey levels.
     */
    private _finishOpenings(
        perStorey: ReadonlyArray<{ levelId: string; set: LayoutCommandSet; option: ScoredLayoutOption }>,
    ): void {
        // All host walls the openings need, across all storeys.
        const neededWallIds = new Set<string>();
        for (const s of perStorey) for (const op of s.set.openingCommands) neededWallIds.add((op.payload as { wallId: string }).wallId);

        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const wallsReady = (): boolean => !!wallStore?.getById && [...neededWallIds].every(id => wallStore.getById!(id) != null);

        let done = false;
        const go = (): void => {
            if (done) return;
            done = true;
            const cm = getCommandManager();
            if (!cm?.execute) { console.warn('[house-layout] commandManager unavailable — openings skipped'); return; }
            const allLevelIds = perStorey.map(s => s.levelId);
            let totalItems = 0;
            try {
                batchCoordinator.runBatch(() => {
                    for (const s of perStorey) {
                        const set = s.set;
                        const openingItems = [
                            ...set.openingCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
                            ...set.shellWindowOpeningCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
                        ];
                        if (openingItems.length > 0) {
                            try {
                                cm.execute!(new CreateWallOpeningsBatchCommand(openingItems.map(it => ({ wallId: it.p.wallId, openingData: it.p.opening }))));
                                totalItems += openingItems.length;
                            } catch (e) { console.warn('[house-layout] openings batch failed on', s.levelId, e); }
                        }
                        if (set.boundaryCommands.length > 0) {
                            try {
                                cm.execute!(new CreateRoomBoundingLinesBatchCommand(
                                    set.boundaryCommands.map(bc => bc.payload as { id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } }),
                                ));
                                totalItems += set.boundaryCommands.length;
                            } catch (e) { console.warn('[house-layout] boundaries batch failed on', s.levelId, e); }
                        }
                    }
                }, { levelIds: allLevelIds, totalElementCount: totalItems, skipRedetectRooms: false });
            } catch (e) { console.warn('[house-layout] openings+boundaries batch failed (non-fatal):', e); }
            console.log('[house-layout] openings + boundaries dispatched —', totalItems, 'item(s) across', perStorey.length, 'storey(s)');
        };

        if (neededWallIds.size === 0) return;
        // Poll the wall store (~150 ms) until the host walls land, then dispatch;
        // force after ~6 s so we never hang. Mirrors the apartment executor.
        const tick = (n: number): void => {
            if (done) return;
            if (wallsReady() || n <= 0) { go(); return; }
            setTimeout(() => tick(n - 1), 150);
        };
        if (wallsReady()) go(); else tick(40);
    }
}
