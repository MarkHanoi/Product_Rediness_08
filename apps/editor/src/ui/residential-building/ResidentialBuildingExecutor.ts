// Residential building (multi-family) — editor executor (P3.3). The SIBLING of
// HouseLayoutExecutor + ApartmentLayoutExecutor, for the multi-FAMILY building.
//
// Given the PURE orchestrator result (`ResidentialBuildingOk`: levels[], a centred
// core rect, per-level packed apartments each carrying a D-TGL `layout`), it:
//   (a) mints editor levels 1…N above the active (ground) level (real ids it owns),
//   (b) per floor, emits the BUILDING SHELL perimeter (one wall per footprint edge,
//       pre-minted ids) + a structural slab,
//   (c) per UPPER-floor apartment, emits the apartment CELL perimeter (4 walls) +
//       the cell's interior partitions/doors/windows/boundaries/rooms by REUSING
//       the apartment engine's PURE `buildLayoutCommands` (same path the apartment
//       executor uses) — a REJECTED apartment is skipped (no walls),
//   (d) builds the CENTRAL CORE: a stair per adjacent level pair (CreateStairCommand)
//       + ONE lift spanning ground→top (CreateVerticalCirculationCommand — the
//       vertical-circulation element),
//   (e) draws each upper floor's PUBLIC CORRIDOR as room-bounding lines (so room
//       detection reads the corridor as its own space),
// all inside ONE `batchCoordinator.runBatch` for the structural walls/slabs/core →
// one undo unit; the per-apartment openings (doors/windows) run in a deferred pass
// once the host walls land (the bus is async — openings READ the committed store),
// exactly like the apartment executor.
//
// P6: every mutation flows through the command bus / commandManager (no direct
// store writes). P2: no THREE here. P8: one OpenTelemetry span at the exported
// `execute` boundary. The pure orchestrator already carries its own spans.

import { trace } from '@opentelemetry/api';
import { batchCoordinator, storeRegistry, storeEventBus } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import {
    AddLevelCommand,
    CreateStairCommand,
    CreateSlabCommand,
    CreateVerticalCirculationCommand,
    CreateWallOpeningsBatchCommand,
    CreateRoomBoundingLinesBatchCommand,
    BatchCreateRoomsCommand,
} from '@pryzm/command-registry';
import { roomDataFromGraphSpec, type GraphRoomSpec, type RoomData } from '@pryzm/room-topology';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildLayoutCommands,
    type ResidentialBuildingOk,
    type ResidentialRigidTransform,
    type PlacedApartment,
    type ScoredLayoutOption,
    type IdPrefix,
    type LayoutExecuteOptions,
    type LayoutCommandSet,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { nameDetectedRooms } from '../apartment-layout/nameDetectedRooms.js';

const _tracer = trace.getTracer('@pryzm/editor', '0.1.0');

const DEFAULT_FLOOR_TO_FLOOR_M = 3.0;
const DEFAULT_SLAB_THICKNESS_M = 0.2;
const SHELL_WALL_THICKNESS_M = 0.2;
const CELL_WALL_THICKNESS_M = 0.1;       // interior apartment party/perimeter wall
const STAIR_RISER_TARGET_M = 0.18;
const STAIR_RISER_MIN_M = 0.15;
const STAIR_RISER_MAX_M = 0.19;
const STAIR_TREAD_M = 0.27;
const STAIR_WIDTH_M = 1.0;

/** A minimal command-manager handle — the legacy synchronous execute path the
 *  apartment / house executors use. */
interface CommandManagerLike {
    execute?: (cmd: unknown, opts?: { source?: string }) => { success?: boolean; info?: string[] } | undefined;
}
function getCommandManager(): CommandManagerLike | undefined {
    return (window as unknown as { commandManager?: CommandManagerLike }).commandManager;
}

export interface ResidentialExecuteInput {
    /** Floor-to-floor height (m). Default 3.0. */
    readonly floorToFloorM?: number;
}

export interface ResidentialExecuteResult {
    readonly ok: boolean;
    readonly reason?: string;
    readonly levelIds?: readonly string[];
    readonly apartmentCount?: number;
    readonly stairCount?: number;
    readonly liftCount?: number;
}

/** A pending per-apartment command set, threaded into the deferred openings pass. */
interface ApartmentBuild {
    readonly levelId: string;
    readonly set: LayoutCommandSet;
    readonly option: ScoredLayoutOption;
}

export class ResidentialBuildingExecutor {
    /**
     * Build a complete multi-family residential building from the orchestrator
     * result. Never throws — returns {ok,reason}. P8: one span at this boundary.
     */
    async execute(
        runtime: PryzmRuntime,
        result: ResidentialBuildingOk,
        input?: ResidentialExecuteInput,
    ): Promise<ResidentialExecuteResult> {
        return _tracer.startActiveSpan('pryzm.editor.residentialBuilding.execute', async (span) => {
            try {
                const out = await this._execute(runtime, result, input);
                span.setAttribute('pryzm.resi.execute.ok', out.ok);
                if (typeof out.apartmentCount === 'number') span.setAttribute('pryzm.resi.execute.apartments', out.apartmentCount);
                if (typeof out.stairCount === 'number') span.setAttribute('pryzm.resi.execute.stairs', out.stairCount);
                span.end();
                return out;
            } catch (err) {
                span.recordException(err as Error);
                span.end();
                throw err;
            }
        });
    }

    private async _execute(
        runtime: PryzmRuntime,
        result: ResidentialBuildingOk,
        input?: ResidentialExecuteInput,
    ): Promise<ResidentialExecuteResult> {
        const toast = (message: string, severity: 'info' | 'success' | 'error' | 'warn'): void => {
            runtime.events?.emit('pryzm:toast', { message, severity });
        };

        const ground = resolveActiveLevel();
        if (!ground?.id) { toast('No active level — cannot build the building.', 'error'); return { ok: false, reason: 'no active level' }; }

        const cm = getCommandManager();
        if (!cm?.execute) { toast('Command manager unavailable — restart the dev server.', 'error'); return { ok: false, reason: 'no command manager' }; }

        const floorToFloorM = input?.floorToFloorM && input.floorToFloorM > 0 ? input.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
        const baseElevationM = ground.elevation ?? 0;

        // ── (a) Mint editor levels 1…N above the ground (ground reuses the active
        // level). We own the ids and map orchestrator levelIndex → editor levelId.
        const levelIdByIndex = new Map<number, string>();
        levelIdByIndex.set(0, ground.id);
        for (const lvl of result.levels) {
            if (lvl.levelIndex === 0) continue;
            const levelId = `L-resi-${Date.now()}-${lvl.levelIndex}-${Math.random().toString(36).slice(2, 8)}`;
            const name = `Level ${lvl.levelIndex.toString().padStart(2, '0')}`;
            const res = cm.execute(new AddLevelCommand({ levelId, name, elevation: lvl.elevationM, height: floorToFloorM }), { source: 'RESI_PIPELINE_LEVEL' });
            if (!res?.success) {
                console.warn('[resi-building] AddLevelCommand failed for', levelId, '— aborting');
                toast('Could not create building levels. See console.', 'error');
                return { ok: false, reason: 'level creation failed' };
            }
            levelIdByIndex.set(lvl.levelIndex, levelId);
        }
        const levelIds = [...levelIdByIndex.values()];
        console.log('[resi-building] minted levels', levelIds);

        // ── Pre-build the per-apartment command sets (pure — no mutation yet). Each
        // apartment cell is a clean plate: emit its 4-wall perimeter (pre-minted) +
        // run the apartment engine's PURE buildLayoutCommands for the interior.
        const apartmentBuilds: ApartmentBuild[] = [];
        // Per (floor) the building shell perimeter walls + slab polygon + corridor lines.
        const shellPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        const slabPolys: Array<{ levelId: string; poly: ReadonlyArray<{ x: number; z: number }> }> = [];
        const cellPerimeterPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        const corridorBoundaryItems: Array<{ id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];

        let placedCount = 0, rejectedCount = 0;

        // §RESI-RIGID-TRANSFORM (2026-06-23) — the orchestrator ran the WHOLE partition/
        // packer/per-cell engine in the parcel's axis-aligned LOCAL (principal-axis) frame and
        // carries the rigid map back to the WORLD parcel here. The core / every apartment
        // cell.rect / every public-corridor band / every per-cell layout are LOCAL — we rotate
        // each emitted coordinate by `transform.thetaRad` about `transform.pivot` so the built
        // building sits ON the drawn (rotated) boundary. `levels[].footprint` is the EXCEPTION
        // (already WORLD), so the shell + slab below need NO transform. θ=0 (an axis-aligned
        // parcel) ⇒ `_rotate` is identity ⇒ byte-identical to the pre-transform behaviour.
        // Mirrors HouseLayoutExecutor._rotateXZ + the engine's principalAxisRad/pivot.
        const xf: ResidentialRigidTransform = result.transform;
        // plan(mm, LOCAL) → world(m, PARCEL): mm→m, then the rigid local→world rotation.
        const planToWorldXZ = (p: { x: number; y: number }): { x: number; z: number } =>
            this._rotate({ x: p.x / 1000, z: p.y / 1000 }, xf);

        for (let i = 0; i < result.levels.length; i++) {
            const lvl = result.levels[i]!;
            const levelId = levelIdByIndex.get(lvl.levelIndex)!;
            const perLevel = result.perLevelApartments[i];

            // Building shell perimeter (one wall per footprint edge) + slab on EVERY floor.
            // `lvl.footprint` is already WORLD (the drawn parcel) → no transform here.
            shellPayloads.push(this._buildShellPerimeter(levelId, lvl.footprint, floorToFloorM));
            slabPolys.push({ levelId, poly: lvl.footprint });

            if (!perLevel) continue;

            // Public-corridor band(s) → room-bounding lines so detection reads them. LOCAL → world.
            for (const band of perLevel.publicCorridor) {
                this._collectCorridorBoundaries(corridorBoundaryItems, levelId, band, xf);
            }

            // Upper-floor apartments.
            for (const apt of perLevel.apartments) {
                if (apt.status !== 'ok' || !apt.layout) { rejectedCount++; continue; }
                placedCount++;
                // Apartment cell perimeter (4 walls, pre-minted) so façade windows resolve.
                // Built from the LOCAL cell.rect, rotated to world by the rigid transform.
                const perimeter = this._buildCellPerimeter(levelId, apt, floorToFloorM, xf);
                cellPerimeterPayloads.push(perimeter.payload);
                const opts: LayoutExecuteOptions = {
                    levelId,
                    baseElevationM: lvl.elevationM,
                    wallHeightM: floorToFloorM,
                    // The cell perimeter is emitted explicitly above → skip the engine's
                    // external walls so we never duplicate (coincident) the shell.
                    skipExteriorWalls: true,
                    shellWalls: perimeter.shellWalls,
                    // §RESI-RIGID-TRANSFORM — map the engine's LOCAL plan-mm geometry onto the
                    // WORLD parcel (the SAME transform the cell perimeter + shellWalls used), so
                    // the apartment interior aligns to the rotated boundary, not axis-aligned.
                    planToWorldXZ,
                };
                try {
                    const set = buildLayoutCommands(apt.layout, opts, (p: IdPrefix) => createId(p));
                    apartmentBuilds.push({ levelId, set, option: apt.layout });
                } catch (e) {
                    console.warn('[resi-building] buildLayoutCommands failed for an apartment (skipped):', e);
                }
            }
        }

        console.log(`[resi-building] prepared — ${placedCount} apartment(s), ${rejectedCount} rejected, ${shellPayloads.length} shell ring(s)`);

        // ── Structural batch: shells + cell perimeters + apartment partitions + slabs
        // + core (stairs + lift) + corridor lines → ONE undo unit.
        const allLevelIds = [...new Set(levelIds)];
        let stairCount = 0, liftCount = 0;
        batchCoordinator.runBatch(() => {
            // 0. Building shell perimeter per floor (host for the slab + the lobby/commercial face).
            for (const payload of shellPayloads) {
                this._dispatchWallBatch(runtime, payload, 'shell');
            }
            // 1. Apartment cell perimeters (host walls for the façade windows).
            for (const payload of cellPerimeterPayloads) {
                this._dispatchWallBatch(runtime, payload, 'cell-perimeter');
            }
            // 2. Apartment interior partitions (the engine's wall.batch.create payload
            //    verbatim — it already carries `walls` + `levelId`).
            for (const b of apartmentBuilds) {
                this._dispatchWallBatch(
                    runtime,
                    b.set.wallBatch.payload as { walls: ReadonlyArray<Record<string, unknown>>; levelId: string },
                    'partition',
                    b.set.wallBatch.command,
                );
            }
            // 3. Structural slab per floor.
            for (const s of slabPolys) {
                this._createSlab(cm, s.levelId, s.poly);
            }
            // 4. Central core — a stair per adjacent level pair + ONE lift ground→top.
            const coreResult = this._createCore(cm, result, levelIdByIndex, floorToFloorM, baseElevationM, xf);
            stairCount = coreResult.stairs;
            liftCount = coreResult.lifts;
        }, {
            levelIds: allLevelIds,
            totalElementCount: shellPayloads.length * 4 + cellPerimeterPayloads.length * 4 + apartmentBuilds.length + slabPolys.length + result.levels.length,
            // Detection runs in the deferred openings pass (the boundaries that carve
            // the apartments + corridor land there), so skip the structural redetect.
            skipRedetectRooms: true,
        });

        // 5. Corridor room-bounding lines (one batch via the legacy command).
        if (corridorBoundaryItems.length > 0) {
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateRoomBoundingLinesBatchCommand(corridorBoundaryItems));
                }, { levelIds: allLevelIds, totalElementCount: corridorBoundaryItems.length, skipRedetectRooms: true });
                console.log(`[resi-building] corridor bounding lines — ${corridorBoundaryItems.length}`);
            } catch (e) { console.warn('[resi-building] corridor bounding-lines batch failed (skipped):', e); }
        }

        toast(`Built building — ${placedCount} apartment(s), ${stairCount} stair(s), ${liftCount} lift(s).`, 'success');

        // ── Deferred openings + doors + windows + rooms per apartment, once the host
        // walls have landed (the bus is async — openings READ the committed store).
        void this._finishApartments(runtime, apartmentBuilds);

        // NOTE: no custom completion event is emitted — `RuntimeEvents` is a typed map
        // (no catch-all index) and registering a new key lives in runtime-composer
        // (out of this slice's scope). The toast + the returned result carry the
        // outcome; downstream chains (furnish/ceiling) are wired off apartment/house
        // events today and are a later residential follow-up.
        console.log(
            `[resi-building] executed — levels=${levelIds.length} apartments=${placedCount} ` +
            `rejected=${rejectedCount} stairs=${stairCount} lifts=${liftCount}`,
        );

        return { ok: true, levelIds, apartmentCount: placedCount, stairCount, liftCount };
    }

    /** Building shell perimeter: one wall per footprint edge, pre-minted ids. */
    private _buildShellPerimeter(
        levelId: string,
        footprint: ReadonlyArray<{ x: number; z: number }>,
        wallHeightM: number,
    ): { walls: ReadonlyArray<Record<string, unknown>>; levelId: string } {
        const ring = this._cleanRing(footprint);
        const walls: Array<Record<string, unknown>> = [];
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            walls.push({
                id: createId('wall'),
                levelId,
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                height: wallHeightM,
                thickness: SHELL_WALL_THICKNESS_M,
            });
        }
        return { walls, levelId };
    }

    /** Apartment cell perimeter: 4 walls around the cell rect, pre-minted ids,
     *  returned with the matching ShellWall records so façade windows resolve.
     *  §RESI-RIGID-TRANSFORM — the cell.rect is in the LOCAL (principal-axis) frame;
     *  every corner is rotated to the WORLD parcel by the rigid transform so the
     *  perimeter (and the shellWalls the engine's façade windows resolve against,
     *  which are also transformed via `planToWorldXZ`) all live in one world frame. */
    private _buildCellPerimeter(
        levelId: string,
        apt: PlacedApartment,
        wallHeightM: number,
        xf: ResidentialRigidTransform,
    ): { payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string }; shellWalls: ReadonlyArray<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }> } {
        const r = apt.cell.rect;
        const corners = [
            this._rotate({ x: r.x0, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z1 }, xf),
            this._rotate({ x: r.x0, z: r.z1 }, xf),
        ];
        const walls: Array<Record<string, unknown>> = [];
        const shellWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];
        for (let i = 0; i < corners.length; i++) {
            const a = corners[i]!;
            const b = corners[(i + 1) % corners.length]!;
            const id = createId('wall');
            walls.push({
                id,
                levelId,
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                height: wallHeightM,
                thickness: CELL_WALL_THICKNESS_M,
            });
            shellWalls.push({ id, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
        }
        return { payload: { walls, levelId }, shellWalls };
    }

    /** Drop near-duplicate consecutive vertices + the wrap duplicate so every edge
     *  is a genuine corner (mirrors HouseLayoutExecutor._buildPerimeterShell). */
    private _cleanRing(poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number }[] {
        const ring: { x: number; z: number }[] = [];
        for (const p of poly) {
            const prev = ring[ring.length - 1];
            if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 0.05) continue;
            ring.push({ x: p.x, z: p.z });
        }
        if (ring.length >= 2) {
            const first = ring[0]!, last = ring[ring.length - 1]!;
            if (Math.hypot(first.x - last.x, first.z - last.z) < 0.05) ring.pop();
        }
        return ring;
    }

    /** Dispatch a wall.batch.create through the bus, swallowing async rejection. */
    private _dispatchWallBatch(
        runtime: PryzmRuntime,
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string },
        tag: string,
        command = 'wall.batch.create',
    ): void {
        try {
            const r = runtime.bus.executeCommand(command, payload) as unknown;
            if (r && typeof (r as { catch?: unknown }).catch === 'function') {
                (r as Promise<unknown>).catch((e: unknown) => console.warn(`[resi-building] ${command} (${tag}) failed on`, payload.levelId, e));
            }
        } catch (e) { console.warn(`[resi-building] ${command} (${tag}) threw on`, payload.levelId, e); }
    }

    /** Structural slab over a floor footprint (SlabTool convention: polygon carries
     *  world-XZ, position 0; world Y resolved from level elevation). */
    private _createSlab(cm: CommandManagerLike, levelId: string, poly: ReadonlyArray<{ x: number; z: number }>): void {
        try {
            if (poly.length < 3) return;
            const xs = poly.map(p => p.x), zs = poly.map(p => p.z);
            const width = Math.max(...xs) - Math.min(...xs);
            const depth = Math.max(...zs) - Math.min(...zs);
            cm.execute?.(new CreateSlabCommand({
                id: createId('slab'),
                ifcGuid: createId('slab'),
                width: Math.max(width, 0.1),
                depth: Math.max(depth, 0.1),
                thickness: DEFAULT_SLAB_THICKNESS_M,
                position: { x: 0, y: 0, z: 0 },
                levelId,
                polygon: poly.map(p => ({ x: p.x, y: p.z })),
            }), { source: 'RESI_PIPELINE_SLAB' });
        } catch (e) { console.warn('[resi-building] slab create failed (skipped):', e); }
    }

    /**
     * Build the central core: a straight (I-shape) stair per adjacent level pair,
     * placed inside the LEFT half of the core rect, + ONE lift (vertical-circulation
     * element) in the RIGHT half spanning ground → top. Returns the counts created.
     */
    private _createCore(
        cm: CommandManagerLike,
        result: ResidentialBuildingOk,
        levelIdByIndex: Map<number, string>,
        floorToFloorM: number,
        baseElevationM: number,
        xf: ResidentialRigidTransform,
    ): { stairs: number; lifts: number } {
        const core = result.core;   // LOCAL (principal-axis) frame.
        const coreW = core.x1 - core.x0;
        const coreD = core.z1 - core.z0;
        // Split the core: LEFT half = stair, RIGHT half = lift shaft.
        const stairCellX0 = core.x0;
        const stairCellW = coreW / 2;
        const liftCx = core.x0 + coreW * 0.75;
        const liftCz = (core.z0 + core.z1) / 2;
        const cz0 = core.z0;
        // §RESI-RIGID-TRANSFORM — the stair RUN is along LOCAL +Z; rotate the run direction
        // to the WORLD parcel so the stair aligns with the rotated core (θ=0 ⇒ {x:0,z:1}).
        const runDir = this._rotateDir({ x: 0, z: 1 }, xf);

        // Risers sized to the gap, clamped to the architectural band.
        let totalRisers = Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
        let riserHeight = floorToFloorM / totalRisers;
        while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) { totalRisers++; riserHeight = floorToFloorM / totalRisers; }
        while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) { totalRisers--; riserHeight = floorToFloorM / totalRisers; }

        const topIndex = result.levels.length - 1;
        let stairs = 0;
        // A stair between each adjacent level pair (ground→1, 1→2, …).
        for (let idx = 0; idx < topIndex; idx++) {
            const fromLevelId = levelIdByIndex.get(idx);
            const toLevelId = levelIdByIndex.get(idx + 1);
            if (!fromLevelId || !toLevelId) continue;
            const startY = baseElevationM + idx * floorToFloorM;
            // Stair runs along +Z, centred in the stair half-cell, starting at its near edge —
            // computed in the LOCAL frame, then rotated to the WORLD parcel.
            const startLocal = this._rotate({ x: stairCellX0 + stairCellW / 2, z: cz0 + 0.1 }, xf);
            const startPosition = { x: startLocal.x, y: startY, z: startLocal.z };
            try {
                cm.execute?.(new CreateStairCommand({
                    id: createId('stair'),
                    baseLevelId: fromLevelId,
                    topLevelId: toLevelId,
                    shape: 'I',
                    riserHeight,
                    treadDepth: STAIR_TREAD_M,
                    width: Math.min(STAIR_WIDTH_M, Math.max(0.9, stairCellW - 0.1)),
                    startPosition,
                    flights: [{ direction: { x: runDir.x, y: 0, z: runDir.z }, riserCount: totalRisers }],
                    accessibilityType: 'standard',
                }), { source: 'RESI_PIPELINE_STAIR' });
                stairs++;
            } catch (e) { console.warn('[resi-building] stair create failed (skipped):', e); }
        }

        // ONE lift from ground → top (the vertical-circulation element). LOCAL → world origin.
        let lifts = 0;
        const baseLevelId = levelIdByIndex.get(0);
        const topLevelId = levelIdByIndex.get(topIndex);
        if (baseLevelId && topLevelId && baseLevelId !== topLevelId) {
            const liftOrigin = this._rotate({ x: liftCx, z: liftCz }, xf);
            try {
                cm.execute?.(new CreateVerticalCirculationCommand({
                    id: createId('verticalCirculation'),
                    baseLevelId,
                    topLevelId,
                    kind: 'passenger',
                    origin: { x: liftOrigin.x, y: baseElevationM, z: liftOrigin.z },
                    shaftWidth: Math.min(2.0, Math.max(1.6, coreW / 2 - 0.2)),
                    shaftDepth: Math.min(2.4, Math.max(1.6, coreD - 0.2)),
                }), { source: 'RESI_PIPELINE_LIFT' });
                lifts++;
            } catch (e) { console.warn('[resi-building] lift create failed (skipped):', e); }
        }

        console.log(`[resi-building] core — ${stairs} stair(s) + ${lifts} lift(s) centred at core (${core.x0.toFixed(1)},${core.z0.toFixed(1)})–(${core.x1.toFixed(1)},${core.z1.toFixed(1)})`);
        return { stairs, lifts };
    }

    /** Add the 4 edges of a corridor band as room-bounding lines so detection reads
     *  the corridor as its own space. §RESI-RIGID-TRANSFORM — the band is LOCAL-frame;
     *  rotate each corner to the WORLD parcel so the corridor sits inside the rotated shell. */
    private _collectCorridorBoundaries(
        out: Array<{ id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } }>,
        levelId: string,
        band: { x0: number; z0: number; x1: number; z1: number },
        xf: ResidentialRigidTransform,
    ): void {
        const c = [
            this._rotate({ x: band.x0, z: band.z0 }, xf),
            this._rotate({ x: band.x1, z: band.z0 }, xf),
            this._rotate({ x: band.x1, z: band.z1 }, xf),
            this._rotate({ x: band.x0, z: band.z1 }, xf),
        ];
        for (let i = 0; i < c.length; i++) {
            // Room-bounding-line ids use the legacy `rbl_` string form (NOT createId —
            // there is no roomBoundingLine ElementType brand), matching how
            // buildLayoutCommands mints its boundary ids.
            const id = `rbl_${levelId}_corr_${i}_${Math.random().toString(36).slice(2, 10)}`;
            out.push({ id, levelId, start: c[i]!, end: c[(i + 1) % c.length]! });
        }
    }

    /**
     * Once the apartment walls are committed, create each apartment's doors +
     * windows + boundaries + graph rooms, gated on the host walls landing in the
     * store (the bus is async — openings READ the committed store). Mirrors the
     * apartment executor's wall-readiness gate + one coalesced batch.
     */
    private _finishApartments(runtime: PryzmRuntime, builds: readonly ApartmentBuild[]): void {
        if (builds.length === 0) return;
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[resi-building] commandManager unavailable — openings skipped'); return; }

        // The build is done when every host wall a door/window needs exists by id.
        const neededWallIds = new Set<string>();
        for (const b of builds) {
            for (const op of b.set.openingCommands) neededWallIds.add((op.payload as { wallId: string }).wallId);
            for (const op of b.set.shellWindowOpeningCommands) neededWallIds.add((op.payload as { wallId: string }).wallId);
        }
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const wallsReady = (): boolean =>
            !wallStore?.getById ? true : [...neededWallIds].every(id => wallStore.getById!(id) != null);

        let done = false;
        let unsub: (() => void) | undefined;
        let poll: ReturnType<typeof setTimeout> | undefined;

        // Graph-authoritative rooms (default ON) — when used, this batch skips the
        // room redetect so detection never re-segments the engine's designed rooms.
        // When the flag is OFF (no graph rooms minted), detection RUNS so the
        // apartments still get rooms (mirrors the apartment executor's
        // `skipRedetectRooms: useGraphRooms`). All-or-nothing across this batch.
        const graphRoomsEnabled = (window as unknown as { __pryzmGraphRooms?: boolean }).__pryzmGraphRooms !== false;
        const useGraphRooms = graphRoomsEnabled && builds.some(b => b.set.roomCommands.length > 0);

        const go = (): void => {
            if (done) return;
            done = true;
            if (poll) clearTimeout(poll);
            unsub?.();
            const levelIds = [...new Set(builds.map(b => b.levelId))];
            try {
                batchCoordinator.runBatch(() => {
                    for (const b of builds) this._finishOneApartment(cm, b, useGraphRooms);
                }, {
                    levelIds,
                    totalElementCount: builds.reduce((n, b) => n + b.set.openingCommands.length + b.set.shellWindowOpeningCommands.length + b.set.boundaryCommands.length + b.set.roomCommands.length, 0),
                    // Graph rooms minted ⇒ skip detection (no double rooms); else let
                    // detection run so the apartments still get rooms.
                    skipRedetectRooms: useGraphRooms,
                });
            } catch (e) { console.warn('[resi-building] openings batch failed (non-fatal):', e); }

            // Flush the host-wall meshes for the openings just added (mirrors §A.21.D28).
            const openingWallIds = [...neededWallIds];
            if (openingWallIds.length > 0) {
                setTimeout(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(openingWallIds); }
                    catch (e) { console.warn('[resi-building] rebuildWalls failed (non-fatal):', e); }
                }, 250);
            }
            // Graph rooms already carry semantic names; only the detection-fallback path
            // (flag OFF / no room polygons) needs the post-detect naming pass.
            if (!useGraphRooms) {
                for (const b of builds) {
                    try { nameDetectedRooms(runtime, b.levelId, b.option, '[resi-building]'); } catch { /* non-fatal */ }
                }
            }
            console.log('[resi-building] apartments finished — openings + rooms committed');
        };

        try {
            unsub = storeEventBus.subscribe((ev) => {
                if (done) return;
                if (ev.elementType !== 'wall' || ev.operation === 'delete') return;
                if (wallsReady()) go();
            });
        } catch { /* poll covers it */ }
        if (!done && wallsReady()) go();

        const tick = (n: number): void => {
            if (done) return;
            if (wallsReady() || n <= 0) { go(); return; }
            poll = setTimeout(() => tick(n - 1), 150);
        };
        tick(40);
    }

    /** Create one apartment's doors + windows + boundaries + graph rooms inside the
     *  (already-open) batch. Mirrors the apartment executor's per-level fan-out.
     *  `useGraphRooms` is the batch-wide decision (so a level marked
     *  graph-authoritative is consistent with the batch's skipRedetectRooms). */
    private _finishOneApartment(cm: CommandManagerLike, b: ApartmentBuild, useGraphRooms: boolean): void {
        const set = b.set;
        const levelId = b.levelId;
        // Doors + shell windows → ONE opening batch.
        const openingItems = [
            ...set.openingCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
            ...set.shellWindowOpeningCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
        ];
        if (openingItems.length > 0) {
            try {
                cm.execute?.(new CreateWallOpeningsBatchCommand(
                    openingItems.map(it => ({ wallId: it.p.wallId, openingData: it.p.opening })),
                ));
            } catch (e) { console.warn('[resi-building] openings batch failed for', levelId, e); }
        }
        // Room-bounding lines (open-plan splitters within the apartment).
        if (set.boundaryCommands.length > 0) {
            try {
                cm.execute?.(new CreateRoomBoundingLinesBatchCommand(
                    set.boundaryCommands.map(bc => bc.payload as { id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } }),
                ));
            } catch (e) { console.warn('[resi-building] boundaries batch failed for', levelId, e); }
        }
        // Graph-authoritative rooms (so the shipped rooms ARE the designed rooms).
        if (useGraphRooms && set.roomCommands.length > 0) {
            const roomHeightM = typeof b.option.floorToCeilingMm === 'number' && b.option.floorToCeilingMm > 0
                ? b.option.floorToCeilingMm / 1000 : 2.7;
            const graphRooms: RoomData[] = [];
            let rn = 0;
            for (const rc of set.roomCommands) {
                const spec = rc.payload as GraphRoomSpec;
                const rd = roomDataFromGraphSpec({ ...spec, levelId }, { levelHeightM: roomHeightM, roomNumber: String(++rn).padStart(2, '0') });
                if (rd) graphRooms.push(rd);
            }
            if (graphRooms.length > 0) {
                try {
                    cm.execute?.(new BatchCreateRoomsCommand(graphRooms));
                    (window as unknown as { roomTopologyObserver?: { markGraphAuthoritative(l: string): void } })
                        .roomTopologyObserver?.markGraphAuthoritative(levelId);
                } catch (e) { console.warn('[resi-building] graph-room batch failed for', levelId, e); }
            }
        }
    }

    /** §RESI-RIGID-TRANSFORM — rotate a LOCAL (principal-axis) XZ point onto the WORLD parcel
     *  by `xf.thetaRad` about `xf.pivot`. Matches the engine's `rotatePt` /
     *  HouseLayoutExecutor._rotateXZ (x' = px + dx·c − dz·s, z' = pz + dx·s + dz·c).
     *  θ = 0 ⇒ identity (an axis-aligned parcel ⇒ no movement). Pure. */
    private _rotate(p: { x: number; z: number }, xf: ResidentialRigidTransform): { x: number; z: number } {
        if (!xf.thetaRad) return { x: p.x, z: p.z };
        const c = Math.cos(xf.thetaRad), s = Math.sin(xf.thetaRad);
        const dx = p.x - xf.pivot.x, dz = p.z - xf.pivot.z;
        return { x: xf.pivot.x + dx * c - dz * s, z: xf.pivot.z + dx * s + dz * c };
    }

    /** §RESI-RIGID-TRANSFORM — rotate a DIRECTION's XZ by `xf.thetaRad` about the origin (no
     *  pivot — a direction has no position). θ = 0 ⇒ identity. Pure. */
    private _rotateDir(d: { x: number; z: number }, xf: ResidentialRigidTransform): { x: number; z: number } {
        if (!xf.thetaRad) return { x: d.x, z: d.z };
        const c = Math.cos(xf.thetaRad), s = Math.sin(xf.thetaRad);
        return { x: d.x * c - d.z * s, z: d.x * s + d.z * c };
    }
}
