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
import { isGableFriendly } from '@pryzm/geometry-roof';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateHouseLayout,
    generateHouseLayoutOptions,
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
import { nameDetectedRooms } from '../apartment-layout/nameDetectedRooms.js';
import { runHousePostGenChain } from './runHousePostGenChain.js';

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

/** §PERIMETER-SHELL (A.21.D21) — a freshly-minted explicit footprint perimeter for
 *  an upper storey: the `wall.batch.create` payload (pre-minted ids) plus the same
 *  walls projected as `ShellWall`s so engine-emitted shell windows resolve to them. */
interface PerimeterShell {
    /** `wall.batch.create` payload — one wall per footprint edge, pre-minted ids. */
    readonly payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
    /** The same perimeter walls as ShellWall records (id + world XZ endpoints). */
    readonly shellWalls: ReadonlyArray<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }>;
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
    /** A.21.k — when the "Choose a house layout" modal is in play, the index of
     *  the whole-house VARIANT the user picked. When set, the executor builds
     *  that variant via `generateHouseLayoutOptions(...)[variantIndex]` instead
     *  of the single best `generateHouseLayout(...)`. Omitted (legacy path) →
     *  byte-identical single-best build. `variantCount` is the option count the
     *  modal was shown (so the executor enumerates the SAME set and the index
     *  resolves to the SAME variant). */
    readonly variantIndex?: number;
    /** A.21.k — number of variants the modal offered (see `variantIndex`). */
    readonly variantCount?: number;
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
            // A.21.k — when the modal supplied a picked VARIANT, enumerate the SAME
            // N options (deterministic) and build that variant; otherwise build the
            // single best house (legacy, byte-identical). Level ids only affect
            // `levelId` stamping, not room layout/scoring, so the modal's preview
            // (placeholder ids) and this build (real ids) resolve to the SAME
            // variant at the SAME index.
            const houseOpts = {
                storeyCount,
                floorToFloorM,
                baseElevationM,
                levelIdForStorey: (i: number) => levelIds[i] ?? `storey-${i}`,
                roofKind,
                ...(typeof siteLatitudeDeg === 'number' ? { solar: { latDeg: siteLatitudeDeg } } : {}),
            };
            let result: HouseLayoutResult;
            if (typeof input.variantIndex === 'number' && input.variantIndex >= 0) {
                const variantCount = Math.max(input.variantIndex + 1, input.variantCount ?? 1);
                const variants = generateHouseLayoutOptions(shell, program, constraints, weights, houseOpts, variantCount);
                const picked = variants[input.variantIndex] ?? variants[0];
                if (!picked) { toast('Could not build the chosen house layout — no variants generated.', 'error'); return { ok: false, reason: 'no variant' }; }
                result = picked.result;
                console.log('[house-layout] executor: building variant', input.variantIndex, 'of', variants.length, '(score', picked.overallScore, ')');
            } else {
                result = generateHouseLayout(shell, program, constraints, weights, houseOpts);
            }
            console.log('[house-layout] generated — storeys', result.storeys.length, 'stairs', result.stairs.length, 'voids', result.voids.length, 'roof', result.roof.kind);

            // The wall height per storey = floorToFloor (so partitions reach the
            // slab above).
            const wallHeightM = floorToFloorM;

            // §PERIMETER-SHELL (A.21.D21, SPEC-CASA §7) — Defect 3 fix. The GROUND
            // storey reuses the pre-drawn shell (skipExteriorWalls). Each UPPER storey
            // has NO pre-existing shell. The previous build relied on the engine's
            // own `isExternal` walls to close the upper perimeter — but the engine
            // emits an external wall only where a ROOM FACE touches the footprint edge
            // (semanticGraph: isExternal = boundsRoomIds.length === 1). Wherever the
            // interior tiling doesn't reach an edge (a dropped room, the area-budget
            // cap, the carved stair core), that edge has NO wall → the OPEN-SIDED
            // shell the founder hit. FIX: for every upper storey we EXPLICITLY emit
            // the full footprint perimeter (one wall per edge, pre-minted ids) exactly
            // like the ground shell, and set skipExteriorWalls:true so the engine's
            // partial externals never duplicate it. The minted perimeter walls also
            // serve as the storey's `shellWalls` so engine-emitted shell windows
            // resolve to them (no read-back). Result: a CLOSED perimeter on EVERY
            // storey, guaranteed by construction — independent of room coverage.
            const perimeterByLevel = new Map<string, PerimeterShell>();

            // Pre-build the per-storey command sets (pure, no mutation yet).
            const perStorey: Array<{ levelId: string; set: LayoutCommandSet; option: ScoredLayoutOption }> = [];
            for (let i = 0; i < result.storeys.length; i++) {
                const storey = result.storeys[i]!;
                const option = result.perStoreyLayout[i];
                if (!option) { console.warn('[house-layout] storey', i, 'produced no layout option — skipping fan-out'); continue; }
                const isGround = i === 0;
                // Ground reuses the existing drawn shell; upper storeys get a freshly
                // minted explicit perimeter (built + dispatched in the batch below).
                const perimeter = isGround ? null : this._buildPerimeterShell(storey, wallHeightM);
                if (perimeter) perimeterByLevel.set(storey.levelId, perimeter);
                const shellWalls = isGround
                    ? gatherShellWalls(storey.levelId)
                    : (perimeter?.shellWalls ?? []);
                const opts: LayoutExecuteOptions = {
                    levelId: storey.levelId,
                    baseElevationM: storey.elevationM,
                    wallHeightM,
                    // Ground: shell already drawn. Upper storeys: explicit perimeter
                    // emitted below → skip the engine's (partial) externals on BOTH so
                    // we never duplicate a shell wall (coincident walls corrupt room
                    // detection — the apartment invariant).
                    skipExteriorWalls: true,
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
            const totalWallCount = perStorey.reduce((n, s) => n + s.set.wallIds.length, 0)
                + [...perimeterByLevel.values()].reduce((n, p) => n + p.payload.walls.length, 0);
            const allLevelIds = perStorey.map(s => s.levelId);

            batchCoordinator.runBatch(() => {
                // 0. §PERIMETER-SHELL — explicit footprint perimeter for every UPPER
                //    storey (the ground shell already exists). Dispatched FIRST so the
                //    shell-hosted windows (resolved against these minted ids in the
                //    follow-up openings batch) have their host walls committed.
                for (const [levelId, perimeter] of perimeterByLevel) {
                    try {
                        const r = runtime.bus.executeCommand('wall.batch.create', perimeter.payload) as unknown;
                        if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                            (r as Promise<unknown>).catch((e: unknown) => console.warn('[house-layout] perimeter wall.batch.create failed on', levelId, e));
                        }
                    } catch (e) { console.warn('[house-layout] perimeter wall.batch.create threw on', levelId, e); }
                }

                // 1. Interior partition walls per storey (async bus commands; we don't
                //    await — the batch drains them, exactly like the apartment executor).
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

                // 4. Roof cap over the TOP storey footprint (A.21.D24 — the roof
                //    must cap the uppermost storey, never the ground). Pass the top
                //    storey so the roof targets its level + sits on its wall head.
                if (cm?.execute) {
                    const topStorey = result.storeys[result.storeys.length - 1];
                    if (topStorey) this._createRoof(cm, result.roof, topStorey, wallHeightM);
                }
            }, { levelIds: allLevelIds, totalElementCount: totalWallCount + result.storeys.length + result.stairs.length + 1, skipRedetectRooms: true });

            // ── Openings + doors + windows + boundaries, per storey, once the walls
            // have landed (wall.createOpening reads the committed wall store). One
            // coalesced batch with the FINAL room redetect across all storeys.
            // Returns once the redetect batch has run so the post-gen finish chain
            // can read rooms on every storey. Run as a detached async continuation
            // so execute() still returns promptly (the toast/result aren't blocked).
            // ──────────────────────────────────────────────────────────────────────
            void this._finishOpenings(perStorey).then(async () => {
                // §A.21.D25 — NAME + occupancy-tag the rooms PER STOREY, sequenced
                // INSIDE the finish chain (right before each storey is furnished),
                // not all up-front with one flat wait. Floor/ceiling/furnish/light
                // all key off each room's occupancyType; the house executor must tag
                // rooms first or `furnishRoom('')` returns [] ("furnish does
                // nothing", A.21.D24). The PREVIOUS up-front loop + a flat 600 ms
                // wait let the GROUND storey's furnish race ahead of its (async)
                // naming → the ground floor came out BARE while later storeys — named
                // by the time they ran — got furniture (the "only the top floor has
                // furniture" bug). FIX: hand the chain a per-storey naming driver; it
                // calls `nameDetectedRooms` for the storey it's about to finish AND
                // awaits that storey's `apartment.room-name-completed` event before
                // furnishing it, so EVERY storey (ground included) is tagged first.
                const optionByLevel = new Map(perStorey.map(s => [s.levelId, s.option] as const));
                const nameStorey = (levelId: string): void => {
                    const option = optionByLevel.get(levelId);
                    if (!option) { console.warn('[house-layout] no layout option to name storey', levelId); return; }
                    nameDetectedRooms(runtime, levelId, option, '[house-layout]');
                };
                // §A.21.i — fan the post-generation finish chain (name → floor →
                // ceiling → furnish → light) out across EVERY storey level, in
                // sequence. The apartment single-level path is unchanged — this only
                // runs for a house build.
                return runHousePostGenChain(runtime, levelIds, nameStorey);
            }).catch((e: unknown) => console.warn('[house-layout] post-gen finish chain failed (non-fatal):', e));

            // `house.layout-executed` is a house-specific event not in the typed
            // RuntimeEvents union — emit through a loose view (same idiom the
            // apartment pipeline uses for its custom events). Downstream finish
            // passes (floor/ceiling/furnish/light) are driven by
            // runHousePostGenChain above; this event is for other observers
            // (telemetry / GIS) that want to know a house landed.
            (runtime.events as unknown as { emit(k: string, p: unknown): void }).emit('house.layout-executed', {
                levelIds,
                storeyCount: result.storeys.length,
                stairCount: result.stairs.length,
                voidCount: result.voids.length,
                roofKind: result.roof.kind,
            });
            toast(`Built ${result.storeys.length}-storey house — ${result.stairs.length} stair(s), roof on top. Finishing storeys…`, 'success');

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

            // §A.21.D24 — the layout's principal-axis angle + world pivot. `rectMm` is
            // authored in the rotated LAYOUT frame, so we build the stair geometry
            // (start position + flight overrides) IN that frame using LAYOUT-frame
            // directions, then rotate the rigid body back to world by +angle about the
            // pivot. The engine's `stair.flights[].direction` are ALREADY rotated to
            // world, so they replace the layout directions on the final flights. On an
            // axis-aligned plot angle === 0 → identity → byte-identical to the old path.
            const principalAxisRad = stair.principalAxisRad ?? 0;
            const pivot = stair.pivot ?? { x: 0, z: 0 };

            // Flight 1 direction in the LAYOUT frame (along the core's longer axis).
            const engFlights = stair.flights && stair.flights.length > 0 ? stair.flights : null;
            const dir1Layout = runAlongZ ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };

            // Riser split (L/U). risersBeforeLanding from the engine, else ≈half.
            const before = engFlights && engFlights.length === 2
                ? engFlights[0]!.riserCount
                : (shape === 'I' ? totalRisers : Math.max(1, stair.risersBeforeLanding ?? Math.floor(totalRisers / 2)));
            // Re-normalise the split to the gap-derived totalRisers so risers×height
            // === ftf (the command's ±50 mm gate keys off the SUM of riserCounts).
            const split = this._normaliseSplit(shape, totalRisers, before);

            // Start position (LAYOUT frame): near corner of the core, nudged so flight
            // 1 sits inside. startY is the world floor elevation (rotation-invariant).
            const startLayout = runAlongZ
                ? { x: x0 + wM / 2, y: startY, z: z0 }
                : { x: x0, y: startY, z: z0 + hM / 2 };

            // Build flights + landings in the LAYOUT frame (axis-aligned dir1Layout),
            // so any startOverride (U-shape) is computed consistently in that frame.
            const built = this._buildFlights(shape, startLayout, dir1Layout, split, width, tread, null);

            // Rotate the rigid stair body back to WORLD (+angle about pivot): the
            // start position + any per-flight startOverride. y (height) is untouched.
            const startPosition = this._rotateXZ(startLayout, principalAxisRad, pivot);
            const worldFlights: FlightInput[] = built.flights.map((f, idx) => ({
                ...f,
                // Prefer the engine's already-world-rotated direction; fall back to
                // rotating the layout direction (older results without world flights).
                direction: engFlights?.[idx]
                    ? engFlights[idx]!.direction
                    : this._unit(this._rotateXZDir(f.direction, principalAxisRad)),
                ...(f.startOverride ? { startOverride: this._rotateXZ(f.startOverride, principalAxisRad, pivot) } : {}),
            }));

            cm.execute?.(new CreateStairCommand({
                id: createId('stair'),
                baseLevelId: stair.fromLevelId,
                topLevelId: stair.toLevelId,
                shape,
                riserHeight,
                treadDepth: tread,
                width,
                startPosition,
                flights: worldFlights,
                ...(built.landings.length > 0 ? { landings: built.landings } : {}),
                ...(shape === 'L' ? { turnDirection: 'left' as const, stepsBeforeLanding: split.before } : {}),
                ...(shape === 'U' ? { secondRunSide: 'left' as const, stepsBeforeLanding: split.before } : {}),
                accessibilityType: 'standard',
                // autoCreateOpening defaults to true → punches the slab-void above,
                // sized to the stair's full bounding footprint (covers L/U too).
            }), { source: 'HOUSE_PIPELINE_STAIR' });
            console.log('[house-layout] stair created', stair.fromLevelId, '→', stair.toLevelId,
                `(${shape}, ${totalRisers} risers @ ${(riserHeight * 1000).toFixed(0)}mm`
                + `${principalAxisRad !== 0 ? `, rot ${(principalAxisRad * 180 / Math.PI).toFixed(1)}°` : ''})`);
        } catch (e) { console.warn('[house-layout] stair create failed (skipped):', e); }
    }

    /** A.21.D24 — rotate a world point's XZ by `angleRad` about an XZ pivot (metres),
     *  preserving y. Matches `rotatePt` (x' = px + dx·c − dz·s, z' = pz + dx·s + dz·c). */
    private _rotateXZ(
        p: { x: number; y: number; z: number },
        angleRad: number,
        pivot: { x: number; z: number },
    ): { x: number; y: number; z: number } {
        if (angleRad === 0) return { x: p.x, y: p.y, z: p.z };
        const c = Math.cos(angleRad), s = Math.sin(angleRad);
        const dx = p.x - pivot.x, dz = p.z - pivot.z;
        return { x: pivot.x + dx * c - dz * s, y: p.y, z: pivot.z + dx * s + dz * c };
    }

    /** A.21.D24 — rotate a DIRECTION's XZ by `angleRad` about the origin (no pivot). */
    private _rotateXZDir(
        d: { x: number; y: number; z: number },
        angleRad: number,
    ): { x: number; y: number; z: number } {
        if (angleRad === 0) return { x: d.x, y: d.y, z: d.z };
        const c = Math.cos(angleRad), s = Math.sin(angleRad);
        return { x: d.x * c - d.z * s, y: d.y, z: d.x * s + d.z * c };
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

    /**
     * §PERIMETER-SHELL (A.21.D21, SPEC-CASA §7) — build the explicit footprint
     * perimeter for an UPPER storey: one wall per footprint edge, with PRE-MINTED ids
     * (no read-back), stamped with the storey's levelId + height. Mirrors the ground
     * shell drawn by houseFromBoundary so every storey closes the same way. Returns
     * null for a degenerate (<3-vertex) footprint. The walls are also returned as
     * ShellWall records so engine-emitted shell windows host on these ids.
     */
    private _buildPerimeterShell(storey: StoreyPlate, wallHeightM: number): PerimeterShell | null {
        const poly = storey.footprint;
        if (!poly || poly.length < 3) return null;

        // §PERIMETER-CLOSE (A.21.D25 Defect 4 — corner gaps / bad mitres). The
        // previous build SKIPPED a degenerate edge with `continue` — which BREAKS the
        // shared-vertex chain: if edge i (a→b) is skipped, the next emitted wall
        // starts at the NEXT vertex, leaving a gap where two walls no longer meet at
        // a common endpoint, so `WallJoinResolver.resolveLevel` can't miter that
        // corner (the founder's "corner gaps"). FIX: first build a CLEANED vertex
        // RING — drop near-duplicate consecutive vertices (and the wrap duplicate) so
        // every retained vertex is a genuine corner — THEN emit exactly one wall per
        // ring edge (vertex i → vertex i+1, last → first). The ring is closed by
        // construction with EXACT shared endpoints, so every corner is a true
        // two-wall junction the resolver mitres cleanly. House-only; the ground shell
        // (drawn separately) is untouched.
        const ring: { x: number; z: number }[] = [];
        for (const p of poly) {
            const prev = ring[ring.length - 1];
            if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.05) continue;  // drop near-duplicate
            ring.push({ x: p.x, z: p.z });
        }
        // Drop a trailing vertex that coincides with the first (closes the wrap).
        if (ring.length >= 2) {
            const first = ring[0]!;
            const last = ring[ring.length - 1]!;
            if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) ring.pop();
        }
        if (ring.length < 3) return null;

        const walls: Array<Record<string, unknown>> = [];
        const shellWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;   // last → first closes the loop
            const id = createId('wall');
            walls.push({
                id,
                levelId: storey.levelId,
                // Tuple baseLine carrying the storey's world Y (matches the apartment
                // executePlan wall spec shape the batch handler consumes).
                baseLine: [
                    { x: a.x, y: storey.elevationM, z: a.z },
                    { x: b.x, y: storey.elevationM, z: b.z },
                ],
                height: wallHeightM,
                thickness: DEFAULT_SLAB_THICKNESS_M,   // 0.2 m exterior shell (matches houseFromBoundary)
            });
            shellWalls.push({ id, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
        if (walls.length < 3) return null;
        return { payload: { walls, levelId: storey.levelId }, shellWalls };
    }

    /** Cap the stack with a roof over the TOP storey footprint (A.21.D24). The
     *  `topStorey` carries the uppermost level id + its elevation so the roof
     *  caps the top of the stack for ANY storeyCount (1/2/3), independent of the
     *  async-commit timing of the upper-storey walls. */
    private _createRoof(cm: CommandManagerLike, roof: RoofDescriptor, topStorey: StoreyPlate, wallHeightM: number): void {
        try {
            const poly: ReadonlyArray<{ x: number; z: number }> = roof.footprint;
            if (poly.length < 3) return;
            // §ROOF-FRAME (A.21.D21, SPEC-CASA §7.2) — Defect 2 root cause + fix.
            // `roof.footprint` is in WORLD-XZ metres (the orchestrator copies
            // `shell.perimeter`, the same world frame the walls use — confirmed by
            // the engine's roof-footprint-==-shell test). The RoofFootprint contract
            // (RoofTool._normalisePolygon → RoofFragmentBuilder) is: `polygon` is
            // CENTROID-LOCAL and `centroid` carries the world anchor — the fragment
            // builder positions the root group AT the centroid and adds the local-
            // polygon mesh (it does NOT, unlike the slab builder, offset children by
            // −centroid). Passing the ABSOLUTE world polygon as `polygon` (the prior
            // bug) double-counted the centroid → the roof rendered offset off the
            // footprint (the founder's "parallelogram shifted to one side, floating").
            // FIX: subtract the world centroid so `polygon` is local; `centroid` =
            // world. Now world vertex = centroid + local = the true footprint.
            let cx = 0, cz = 0;
            for (const p of poly) { cx += p.x; cz += p.z; }
            cx /= poly.length; cz /= poly.length;
            const polygon: [number, number][] = poly.map(
                (p: { x: number; z: number }) => [p.x - cx, p.z - cz] as [number, number],
            );
            // §ROOF-SHAPE (A.21.D24) — Defect 1 fix (non-90° footprints). A GABLE
            // has a single straight ridge: it reads correctly only on a roughly
            // rectangular (incl. rotated / parallelogram) plate, where the ridge
            // runs along the footprint's principal axis (the geometry builder now
            // does exactly that — §RIDGE-PRINCIPAL-AXIS). On a NON-rectangular plate
            // (an L/T/U or otherwise non-quad shell) a single ridge can't span the
            // shape, so we degrade `gable` → `hip`. A hip roof is derived from the
            // polygon offset (straight-skeleton-style inset) and handles ANY convex
            // footprint by construction — the soundest fallback that still looks
            // like a real pitched roof. Flat/hip are passed through unchanged.
            const effectiveKind: RoofDescriptor['kind'] =
                roof.kind === 'gable' && !isGableFriendly(poly) ? 'hip' : roof.kind;

            // A.21.D18 — domestic pitched roof. The engine carries a pitch in
            // DEGREES (gable default ~30°); CreateRoofCommand expects `slope` as
            // rise/run = tan(pitch). Convert so the roof gets a sensible domestic
            // pitch sized to the shell, with an eave OVERHANG beyond the walls.
            // NOTE: CreateRoofCommand has no dedicated "pitch°" or "eave" param —
            // pitch is expressed via `slope`, eaves via `overhang` (the command
            // lacks a separate fascia-driven eave; `overhang` is the eave depth).
            const pitchDeg = effectiveKind !== 'flat'
                ? (typeof roof.pitchDeg === 'number' && roof.pitchDeg > 0 ? roof.pitchDeg : DEFAULT_ROOF_PITCH_DEG)
                : 0;
            const slope = pitchDeg > 0 ? Math.tan((pitchDeg * Math.PI) / 180) : undefined;

            // §ROOF-LEVEL (A.21.D24) — Defect 2 fix (roof on the WRONG level). The
            // roof MUST cap the TOP storey, never the ground. We target the top
            // storey's level id (== `roof.levelId` from the engine — asserted equal
            // here) and pass an EXPLICIT, deterministic `baseOffset` = top-storey
            // wall height with `autoBaseOffset: false`. The prior `autoBaseOffset:
            // true` recomputed the offset from `wallStore.getByLevel(topLevel)` at
            // command time — but the top-storey walls are dispatched on the ASYNC
            // bus and are NOT committed when this synchronous roof command runs, so
            // the lookup was racy/empty. With the top level + an explicit offset,
            // `RoofFragmentBuilder` resolves `worldY = topLevel.elevation +
            // baseOffset = topStorey.elevationM + wallHeightM` = the top of the
            // uppermost storey's walls, for any storeyCount.
            const topLevelId = topStorey.levelId;
            if (roof.levelId !== topLevelId) {
                console.warn('[house-layout] roof.levelId', roof.levelId, '≠ top storey level', topLevelId, '— forcing top storey');
            }
            cm.execute?.(new CreateRoofCommand(createId('roof'), {
                levelId: topLevelId,
                footprint: { polygon, centroid: [cx, cz] },
                roofType: effectiveKind,
                ...(effectiveKind !== 'flat' && slope ? { slope } : {}),
                // Eave overhang beyond the shell (~400 mm) so the roof projects past
                // the walls like a real house. Flat roofs get a small/zero eave.
                overhang: effectiveKind !== 'flat' ? DEFAULT_ROOF_OVERHANG_M : 0,
                // Sit the roof on the TOP storey's wall head (deterministic, not racy).
                baseOffset: wallHeightM,
                autoBaseOffset: false,
                thickness: DEFAULT_ROOF_THICKNESS_M,
            }), { source: 'HOUSE_PIPELINE_ROOF' });
            console.log('[house-layout] roof created on top level', topLevelId,
                `(${effectiveKind}${effectiveKind !== roof.kind ? ` ←gable-fallback` : ''}, ~${pitchDeg.toFixed(0)}°, eave ${(DEFAULT_ROOF_OVERHANG_M * 1000).toFixed(0)}mm, baseOffset ${wallHeightM}m @ elev ${topStorey.elevationM}m)`);
        } catch (e) { console.warn('[house-layout] roof create failed (skipped):', e); }
    }

    /**
     * After the walls have committed, dispatch every storey's doors + windows +
     * boundaries through the legacy synchronous opening/boundary batch commands
     * (mirrors ApartmentLayoutExecutor._finishLayout). One coalesced batch with
     * the FINAL room redetect across all storey levels.
     *
     * Returns a Promise that resolves once the finalizing batch (which carries
     * `skipRedetectRooms: false` → the room redetect across all storeys) has run,
     * so the caller can sequence the per-storey post-gen finish chain AFTER rooms
     * exist. Always resolves (never rejects) — finish is best-effort.
     */
    private _finishOpenings(
        perStorey: ReadonlyArray<{ levelId: string; set: LayoutCommandSet; option: ScoredLayoutOption }>,
    ): Promise<void> {
        // All host walls the openings need, across all storeys.
        const neededWallIds = new Set<string>();
        for (const s of perStorey) for (const op of s.set.openingCommands) neededWallIds.add((op.payload as { wallId: string }).wallId);

        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const wallsReady = (): boolean => !!wallStore?.getById && [...neededWallIds].every(id => wallStore.getById!(id) != null);

        return new Promise<void>(resolve => {
            let done = false;
            const go = (): void => {
                if (done) return;
                done = true;
                try {
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
                } finally {
                    // Give the room redetect (kicked by the batch above) a brief
                    // settle window before the post-gen chain starts reading rooms.
                    setTimeout(resolve, 400);
                }
            };

            // No openings to host → still run go() so the finalizing batch fires
            // the room redetect across all storeys (walls were created with
            // skipRedetectRooms:true), then the post-gen chain can read rooms.
            if (neededWallIds.size === 0) { go(); return; }
            // Poll the wall store (~150 ms) until the host walls land, then dispatch;
            // force after ~6 s so we never hang. Mirrors the apartment executor.
            const tick = (n: number): void => {
                if (done) return;
                if (wallsReady() || n <= 0) { go(); return; }
                setTimeout(() => tick(n - 1), 150);
            };
            if (wallsReady()) go(); else tick(40);
        });
    }
}
