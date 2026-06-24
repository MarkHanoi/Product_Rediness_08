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
    CreateRoofCommand,
    CreateCurtainWallCommand,
    CreateVerticalCirculationCommand,
    CreateWallOpeningsBatchCommand,
    CreateRoomBoundingLinesBatchCommand,
    BatchCreateRoomsCommand,
    CreateHandrailCommand,
    CreateFurnitureCommand,
} from '@pryzm/command-registry';
import { roomDataFromGraphSpec, type GraphRoomSpec, type RoomData } from '@pryzm/room-topology';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildLayoutCommands,
    type ResidentialBuildingOk,
    type ResidentialRigidTransform,
    type GroundFloorDescriptor,
    type PlacedApartment,
    type ScoredLayoutOption,
    type IdPrefix,
    type LayoutExecuteOptions,
    type LayoutCommandSet,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { triggerFloorLayout } from '../floor-layout/floorLayoutTrigger.js';
import { nameDetectedRooms } from '../apartment-layout/nameDetectedRooms.js';
import { resolveEntranceOnShell, entranceOffsetOnWall, type EntranceHostHit } from './groundFloorPlacement.js';

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
/** §RESI-GROUND-DOOR-BAY — half-width of the solid entrance bay (door + frame). The ground
 *  corridor is built this wide too (founder 2026-06-24: "the corridor can be as wide as the
 *  solid portion of the façade"). */
const ENTRANCE_BAY_HALF_M = 1.6;

// §RESI-BALCONY (2026-06-24) — projecting cantilever balcony tuning (balcony spike D.2).
const BALCONY_DEPTH_M = 1.4;             // cantilever depth off the façade (rule minShortSideM)
const BALCONY_MIN_WIDTH_M = 2.5;         // min façade frontage to drop a balcony
const BALCONY_SLAB_THICKNESS_M = 0.2;    // DEFAULT_SLAB_THICKNESS_M — cantilever floor
const BALCONY_GUARD_HEIGHT_M = 1.1;      // glass guard height (canExecute band 0.3–2.5)
const BALCONY_SIDE_INSET_M = 0.05;       // pull side edges off the wall ends to clear the shell

// §RESI-ROOF-GARDEN (2026-06-24) — roof amenity-deck tuning (roof-garden spike slice 1).
const ROOF_GUARD_HEIGHT_M = 1.1;         // perimeter glass guard height
const ROOF_GUARD_THICKNESS_M = 0.05;     // guard post/profile thickness
const ROOF_DECK_THICKNESS_M = 0.25;      // matches _createRoof THICK — slab top above level datum

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
    /** §RESI-FINISH-COLOUR (founder 2026-06-24: "the user should decide the finish colour … initially
     *  all white"). Optional building finish overrides; absent ⇒ the all-white default (curtain
     *  mullions white-metallic + clear glazing). The modal colour picker threads these through. */
    readonly curtainMullionColor?: string;
    readonly curtainGlazingColor?: string;
    /** §RESI-ROOF-GARDEN (founder 2026-06-24) — OPTIONAL roof amenity deck. Default OFF. When ON:
     *  the core stair + lift extend ONE level higher to the existing roof level (roof access
     *  headhouse + door), the flat roof slab is ringed with a glass guard, and a deterministic
     *  handful of EXISTING furniture amenities (benches, tables, planters, trees) lands on the deck.
     *  Pool / BBQ are a Slice-2 follow-up (they need NEW FurnitureTypes — deferred). */
    readonly roofGarden?: boolean;
    /** §RESI-BALCONIES (modal option, 2026-06-24) — emit projecting cantilever balconies off the
     *  upper-floor apartments' façades. Default ON (absent ⇒ true). When false the balcony pass is
     *  skipped entirely (no slabs / guards). */
    readonly balconies?: boolean;
    /** §RESI-FACADE-COLOUR (modal colour picker, 2026-06-24) — the building FINISH colour (hex
     *  `#rrggbb`). Applied to the opaque SHELL + CORE + CELL-perimeter walls + the flat ROOF (a
     *  yellow façade paints them yellow, Notting-Hill pastel). Glazing (curtain mullions/glass)
     *  keeps its own defaults. Absent ⇒ the all-white default (no per-element colour stamped). */
    readonly facadeColor?: string;
    /** §RESI-GROUND-COMMERCIAL-CURTAIN (modal option, 2026-06-24) — the GROUND-floor shopfront
     *  style. Default false: build SOLID shell walls with BIG commercial window openings + a door
     *  (glass-in-frame). When true: keep the existing curtain-wall shopfront. */
    readonly groundCommercialCurtain?: boolean;
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
    /** §RESI-APT-ENTRY — the main APARTMENT FRONT DOOR from the public corridor: which
     *  cell-perimeter wall (the corridor-facing `doorEdge`) hosts it + the centred offset
     *  and clear width. Deferred-punched once the perimeter wall lands, like the windows. */
    readonly entryDoor?: { readonly wallId: string; readonly offset: number; readonly width: number };
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
        // §RESI-ROOF-GARDEN (2026-06-24) — the optional roof amenity deck (default OFF).
        const roofGarden = input?.roofGarden === true;
        // §RESI-BALCONIES (2026-06-24) — projecting balconies, default ON (absent ⇒ true).
        const balconiesEnabled = input?.balconies !== false;
        // §RESI-GROUND-COMMERCIAL-CURTAIN (2026-06-24) — ground shopfront style. Default false ⇒
        // SOLID shell + big commercial windows; true ⇒ the curtain-wall shopfront.
        const groundCurtain = input?.groundCommercialCurtain === true;
        // §RESI-FACADE-COLOUR (2026-06-24) — the opaque-finish colour for shell / core / cell walls
        // + roof. Validate to a #rrggbb hex; an invalid/absent value ⇒ undefined (all-white default).
        const facadeColor = (typeof input?.facadeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(input.facadeColor))
            ? input.facadeColor : undefined;

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
        // §RESI-ROOF-LEVEL (founder 2026-06-24: "the roof needs to be on the level ABOVE, as a
        // separate level — the same rule the house follows"). Mint a dedicated ROOF level at the
        // top storey's wall head (elevation = baseElevationM + N×ftf), so the flat roof lives on
        // its own level / plan ABOVE the apartments, not embedded in the top apartment floor.
        const roofLevelId = `L-resi-${Date.now()}-roof-${Math.random().toString(36).slice(2, 8)}`;
        {
            const roofElevationM = baseElevationM + result.levels.length * floorToFloorM;
            const res = cm.execute(new AddLevelCommand({ levelId: roofLevelId, name: 'Roof', elevation: roofElevationM, height: floorToFloorM }), { source: 'RESI_PIPELINE_LEVEL' });
            if (!res?.success) console.warn('[resi-building] roof-level AddLevelCommand failed — roof may sit on the top floor');
        }
        // §RESI-ROOF-GARDEN — when the deck is ON, register the roof level at index N (= levels.length)
        // so the core stair + lift loops in _createCore extend ONE flight higher and the stair/lift
        // ARRIVE on the roof level (real roof access), exactly like every other indexed circulation hop.
        if (roofGarden) levelIdByIndex.set(result.levels.length, roofLevelId);
        const levelIds = [...levelIdByIndex.values()];
        console.log('[resi-building] minted levels', levelIds);

        // ── Pre-build the per-apartment command sets (pure — no mutation yet). Each
        // apartment cell is a clean plate: emit its 4-wall perimeter (pre-minted) +
        // run the apartment engine's PURE buildLayoutCommands for the interior.
        const apartmentBuilds: ApartmentBuild[] = [];
        // §RESI-BALCONY (2026-06-24) — the UPPER-floor apartments + their level, for the post-pass
        // that cantilevers a balcony off each living/longest façade edge. Ground (curtain shopfront)
        // has no apartments and the roof is amenity deck, so this only ever holds upper apartments.
        const balconyCandidates: Array<{ levelId: string; apt: PlacedApartment }> = [];
        // Per (floor) the building shell perimeter walls + slab polygon + corridor lines.
        const shellPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        const slabPolys: Array<{ levelId: string; poly: ReadonlyArray<{ x: number; z: number }> }> = [];
        const cellPerimeterPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        // §RESI-CORE-WALLS (founder "a core with proper core walls + the lift inside", 2026-06-23) —
        // RC perimeter walls enclosing the central core (stair + lift) on every floor, with two doors.
        const corePerimeterPayloads: Array<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }> = [];
        // §RESI-CORE-DOORS (founder "instead of two gaps it should have two doors", 2026-06-23) —
        // the core walls are now SOLID; the two spine-facing edges get a real (fire-rated) door,
        // punched in a deferred pass once the core walls land in the store.
        const coreDoorSpecs: Array<{ wallId: string; offset: number; width: number; levelId: string }> = [];
        // §RESI-GROUND-CURTAIN (founder "ground floor should have curtain panels for commercial",
        // 2026-06-24) — the GROUND façade is a glazed commercial shopfront (curtain walls on every
        // façade edge except the solid entrance bay), dispatched in the structural batch.
        const groundCurtainPayloads: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number }; height: number; levelId: string }> = [];
        // §RESI-GROUND-COMMERCIAL-CURTAIN (modal option, 2026-06-24) — when the curtain shopfront is
        // OFF (the DEFAULT), the ground façade is SOLID shell walls with BIG commercial window
        // openings (sill 0.01 m, head 3.5 m) hosted on them. These specs are punched in a deferred
        // pass once the ground shell walls land in the store (like the entrance door / apartment
        // openings) — the bus wall.batch.create is async.
        const groundCommercialWindowSpecs: Array<{ wallId: string; offset: number; width: number; sillHeight: number; height: number; levelId: string }> = [];
        // §RESI-GROUND-CORRIDOR — interior corridor walls linking the ground entrance to the core.
        let groundCorridorPayload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string } | undefined;
        const corridorBoundaryItems: Array<{ id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];
        // §RESI-GROUND-FLOOR — capture the GROUND shell payload (its pre-minted wall ids host
        // the main entrance door) + the ground level id for the deferred entrance pass.
        let groundLevelId: string | undefined;
        let groundShellPayload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string } | undefined;
        // §RESI-DOOR-CENTRE-SPINE — the SOLID door-bay wall id + length (when the ground shell built
        // one), so the deferred entrance pass hosts the door on it, centred on the corridor axis.
        let groundDoorBay: { wallId: string; wallLengthM: number } | undefined;

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
            // §RESI-GROUND-CURTAIN — the GROUND floor is a glazed commercial shopfront: curtain
            // walls on every façade edge except a solid entrance bay (which still hosts the main
            // door). Upper floors keep the solid perimeter shell that hosts their façade windows.
            let shellPayload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
            if (lvl.levelIndex === 0) {
                const wec = this._rotate({ x: result.groundFloor.entranceCenter.x, z: result.groundFloor.entranceCenter.z }, xf);
                const g = this._buildGroundShell(levelId, lvl.footprint, floorToFloorM, wec, groundCurtain);
                shellPayload = g.shellPayload;
                // §RESI-DOOR-CENTRE-SPINE — remember the door-bay wall for the centred entrance pass.
                groundDoorBay = g.doorBay;
                // §RESI-GROUND-COMMERCIAL-CURTAIN — only the curtain shopfront mode emits curtain
                // walls; the SOLID commercial-window mode emits big window openings on the shell.
                for (const cw of g.curtainWalls) groundCurtainPayloads.push(cw);
                for (const ws of g.commercialWindows) groundCommercialWindowSpecs.push(ws);
                // §RESI-GROUND-CORRIDOR — run an interior corridor from the entrance door all the way
                // to the core's z0 FIRE DOOR (so it connects with no gap), as wide as the solid
                // entrance bay (≥ 2 m). The fire door is on the core's LOCAL z0 edge midpoint.
                if (g.doorCenter && result.core) {
                    const core = result.core;
                    const fireDoor = this._rotate({ x: (core.x0 + core.x1) / 2, z: core.z0 }, xf);
                    const corridorW = Math.max(2.0, 2 * ENTRANCE_BAY_HALF_M);   // ≥2 m, bay-wide
                    groundCorridorPayload = this._buildGroundCorridor(levelId, g.doorCenter, fireDoor, corridorW, floorToFloorM);
                }
            } else {
                shellPayload = this._buildShellPerimeter(levelId, lvl.footprint, floorToFloorM);
            }
            // §RESI-FACADE-COLOUR — paint the opaque shell walls (ground solid bay + upper façade).
            this._paintWalls(shellPayload, facadeColor);
            shellPayloads.push(shellPayload);
            // §RESI-NO-DOUBLE-WALL — the building shell walls in the {id,start,end} form the apartment
            // engine's window resolver expects. Façade windows now resolve onto these (the cells skip their
            // coincident façade walls), so a window sits on the real shell wall, not a duplicate cell wall.
            const buildingShellWalls = shellPayload.walls.map((w) => {
                const bl = (w as { baseLine: ReadonlyArray<{ x: number; z: number }> }).baseLine;
                return { id: (w as { id: string }).id, start: { x: bl[0]!.x, z: bl[0]!.z }, end: { x: bl[1]!.x, z: bl[1]!.z } };
            });
            slabPolys.push({ levelId, poly: lvl.footprint });
            // §RESI-CORE-WALLS — enclose the central core (stair+lift) with SOLID RC walls on EVERY
            // floor (LOCAL → world via xf); the two spine-facing edges carry a real door (punched
            // deferred via coreDoorSpecs once the walls land).
            if (result.core) {
                const cp = this._buildCorePerimeter(levelId, result.core, floorToFloorM, xf);
                // §RESI-FACADE-COLOUR — paint the opaque RC core walls the finish colour.
                this._paintWalls(cp.payload, facadeColor);
                corePerimeterPayloads.push(cp.payload);
                coreDoorSpecs.push(...cp.doors);
            }

            // §RESI-GROUND-FLOOR — remember the ground shell (level 0) so the deferred pass can
            // host the main entrance door on the right façade wall once the shell walls land.
            if (lvl.levelIndex === 0) {
                groundLevelId = levelId;
                groundShellPayload = shellPayload;
                // The lobby band is a ground-floor public corridor → room-bounding lines, same
                // as the upper-floor corridor (LOCAL frame, rotated to world by `xf`).
                this._collectCorridorBoundaries(corridorBoundaryItems, levelId, result.groundFloor.lobby, xf);
            }

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
                // §RESI-FACADE-COLOUR — paint the cell-perimeter (party/corridor-facing) walls.
                this._paintWalls(perimeter.payload, facadeColor);
                cellPerimeterPayloads.push(perimeter.payload);
                const opts: LayoutExecuteOptions = {
                    levelId,
                    baseElevationM: lvl.elevationM,
                    wallHeightM: floorToFloorM,
                    // The cell perimeter is emitted explicitly above → skip the engine's
                    // external walls so we never duplicate (coincident) the shell.
                    skipExteriorWalls: true,
                    // §RESI-NO-DOUBLE-WALL — host façade windows on the BUILDING shell walls (the cell no
                    // longer emits its coincident façade walls); the cell's remaining interior walls follow
                    // so any interior-edge resolution still works.
                    shellWalls: [...buildingShellWalls, ...perimeter.shellWalls],
                    // §RESI-RIGID-TRANSFORM — map the engine's LOCAL plan-mm geometry onto the
                    // WORLD parcel (the SAME transform the cell perimeter + shellWalls used), so
                    // the apartment interior aligns to the rotated boundary, not axis-aligned.
                    planToWorldXZ,
                };
                try {
                    const set = buildLayoutCommands(apt.layout, opts, (p: IdPrefix) => createId(p));
                    apartmentBuilds.push({ levelId, set, option: apt.layout, entryDoor: perimeter.entryDoor });
                    // §RESI-BALCONY — this is an UPPER-floor apartment (only upper levels carry
                    // apartments); remember it for the projecting-balcony post-pass.
                    balconyCandidates.push({ levelId, apt });
                } catch (e) {
                    console.warn('[resi-building] buildLayoutCommands failed for an apartment (skipped):', e);
                }
            }
        }

        // §RESI-ROOF-GARDEN — the roof "headhouse": enclose the core on the ROOF level too (RC
        // walls + the same z0 fire door) so the extended stair/lift arrive in an enclosed core with
        // a real door onto the deck, not an open shaft. Built the same way as every storey's core.
        if (roofGarden && result.core) {
            const cp = this._buildCorePerimeter(roofLevelId, result.core, floorToFloorM, xf);
            corePerimeterPayloads.push(cp.payload);
            coreDoorSpecs.push(...cp.doors);
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
            // 0b. Core enclosure (RC) walls per floor — the stair+lift room with fire-door gaps.
            for (const payload of corePerimeterPayloads) {
                this._dispatchWallBatch(runtime, payload, 'core-perimeter');
            }
            // 0c. §RESI-GROUND-CURTAIN — commercial glazed shopfront on the ground façade (legacy
            // cm.execute path, like the slab/stair; the id is pre-minted per the curtain contract).
            for (const cw of groundCurtainPayloads) {
                try {
                    // §RESI-WHITE-FINISH (founder 2026-06-24: "initially all white — curtain
                    // mullions white metallic"). Default the shopfront to white-metallic mullions +
                    // clear glazing; a per-build colour picker in the modal is the next step.
                    cm.execute?.(new CreateCurtainWallCommand({
                        ...cw,
                        mullionColor: input?.curtainMullionColor ?? '#e8eaed',   // white metallic default
                        glazingColor: input?.curtainGlazingColor ?? '#dfe9f0',   // clear glazing default
                    }), { source: 'RESI_PIPELINE_CURTAINWALL' });
                } catch (e) { console.warn('[resi-building] curtain wall create failed (skipped):', e); }
            }
            // 0d. §RESI-GROUND-CORRIDOR — interior corridor walls linking the entrance to the core.
            if (groundCorridorPayload && groundCorridorPayload.walls.length > 0) {
                this._dispatchWallBatch(runtime, groundCorridorPayload, 'ground-corridor');
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
            // 3b. §RESI-ROOF (founder "we need a top level with the roof", 2026-06-23) — a flat
            // roof capping the building on the top level's wall head.
            const topLvl = result.levels[result.levels.length - 1];
            // §RESI-FACADE-COLOUR — the flat roof takes the finish colour too (Notting-Hill pastel).
            if (topLvl) this._createRoof(cm, topLvl.footprint, roofLevelId, facadeColor);
            // 3c. §RESI-ROOF-GARDEN — turn the flat roof into a walkable amenity deck: a perimeter
            // glass guard ringing the footprint + a handful of EXISTING furniture amenities, all on
            // the roof level. The deck IS the flat roof slab (no slab change). Core is the keep-out.
            if (roofGarden && topLvl) {
                this._createRoofGuardrail(cm, topLvl.footprint, roofLevelId);
                if (result.core) this._furnishRoofDeck(cm, topLvl.footprint, result.core, roofLevelId, xf);
            }
            // 4. Central core — a stair per adjacent level pair + ONE lift ground→top.
            //    §RESI-ROOF-GARDEN — when ON, the core climbs ONE flight higher to the roof level.
            const coreResult = this._createCore(cm, result, levelIdByIndex, floorToFloorM, baseElevationM, xf, roofGarden);
            stairCount = coreResult.stairs;
            liftCount = coreResult.lifts;
            // 5. §RESI-BALCONY — projecting cantilever balconies off the upper-floor apartments'
            //    façade (slab + 3-edge glass guard). Upper floors only; clear of the ground curtain
            //    shopfront + the roof deck (those levels are never in `balconyCandidates`).
            //    §RESI-BALCONIES — modal-gated: skipped entirely when the option is OFF.
            if (balconiesEnabled) this._createBalconies(cm, balconyCandidates, xf);
        }, {
            levelIds: allLevelIds,
            totalElementCount: shellPayloads.length * 4 + corePerimeterPayloads.length * 4 + cellPerimeterPayloads.length * 4 + groundCurtainPayloads.length + apartmentBuilds.length + slabPolys.length + result.levels.length,
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

        // §RESI-GROUND-FLOOR — deferred MAIN ENTRANCE door on the ground shell. Like the
        // apartment openings, the shell wall.batch.create is async (the bus READs the
        // committed store), so we host the door once the ground shell walls have landed.
        if (groundLevelId && groundShellPayload) {
            this._buildEntranceDoor(groundLevelId, groundShellPayload, result.groundFloor, xf, groundDoorBay);
        }
        // §RESI-CORE-DOORS — punch the two fire doors per level on the core walls (deferred).
        this._finishCoreDoors(coreDoorSpecs);

        // §RESI-GROUND-COMMERCIAL-CURTAIN — when the ground floor is the SOLID-shell commercial mode
        // (the default), punch the big shopfront windows on the ground shell walls (deferred — the
        // shell wall.batch.create is async via the bus).
        this._finishGroundCommercialWindows(groundCommercialWindowSpecs);

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

    /** §RESI-FACADE-COLOUR — stamp `materialColor` (hex) onto every wall record of a payload, in
     *  place, when a finish colour is set. No-op when `color` is undefined (all-white default ⇒ no
     *  per-element colour, the wall keeps its system-type/default material). Returns the payload. */
    private _paintWalls<T extends { walls: ReadonlyArray<Record<string, unknown>> }>(payload: T, color?: string): T {
        if (!color) return payload;
        for (const w of payload.walls) (w as Record<string, unknown>).materialColor = color;
        return payload;
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

    /** §RESI-GROUND-CURTAIN / §RESI-GROUND-COMMERCIAL-CURTAIN — the ground floor as a commercial
     *  shopfront, in one of two styles:
     *   - `useCurtain === true`  → a CURTAIN WALL along every façade edge except a narrow SOLID door
     *     bay (the historical behaviour): glazed mullion-and-transom front + the door bay host.
     *   - `useCurtain === false` (DEFAULT) → SOLID shell walls on every façade edge, each non-bay
     *     edge carrying a BIG COMMERCIAL WINDOW opening (sill 0.01 m, head 3.5 m) so it reads as a
     *     glass-in-frame shopfront rather than a frameless curtain wall. The window specs are
     *     punched in a deferred pass once the shell walls land (the bus is async).
     *  `footprint` is WORLD; every wall / curtain / window lives in that one world frame. Degenerate
     *  ring ⇒ falls back to the normal solid shell. */
    private _buildGroundShell(
        levelId: string,
        footprint: ReadonlyArray<{ x: number; z: number }>,
        wallHeightM: number,
        worldEntranceCenter: { x: number; z: number },
        useCurtain: boolean,
    ): {
        shellPayload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        curtainWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number }; height: number; levelId: string }>;
        /** §RESI-GROUND-COMMERCIAL-CURTAIN — big window specs for the SOLID-shell mode (per
         *  non-bay façade wall id), deferred-punched once the shell walls land. */
        commercialWindows: Array<{ wallId: string; offset: number; width: number; sillHeight: number; height: number; levelId: string }>;
        /** World-XZ centre of the entrance door (the bay/façade midpoint) — the executor runs the
         *  ground-floor interior corridor from here to the core (§RESI-GROUND-CORRIDOR). */
        doorCenter?: { x: number; z: number };
        /** §RESI-DOOR-CENTRE-SPINE (founder 2026-06-24) — the SOLID door-bay wall id + its length,
         *  so the deferred entrance pass hosts the door on THIS exact wall, centred on it (= the
         *  façade midpoint = the corridor `from`), instead of re-resolving via the orchestrator's
         *  off-centre entrance point. Entrance → corridor → core fire door then share one centred
         *  axis. Absent only on the degenerate-ring fallback. */
        doorBay?: { wallId: string; wallLengthM: number };
    } {
        const ring = this._cleanRing(footprint);
        if (ring.length < 3) {
            return { shellPayload: this._buildShellPerimeter(levelId, footprint, wallHeightM), curtainWalls: [], commercialWindows: [] };
        }
        let doorBay: { wallId: string; wallLengthM: number } | undefined;
        // The entrance edge = the façade edge whose midpoint is nearest the world entrance centre.
        let entranceEdge = 0, best = Infinity;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const d = Math.hypot((a.x + b.x) / 2 - worldEntranceCenter.x, (a.z + b.z) / 2 - worldEntranceCenter.z);
            if (d < best) { best = d; entranceEdge = i; }
        }
        const walls: Array<Record<string, unknown>> = [];
        const curtainWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number }; height: number; levelId: string }> = [];
        const commercialWindows: Array<{ wallId: string; offset: number; width: number; sillHeight: number; height: number; levelId: string }> = [];
        let doorCenter: { x: number; z: number } | undefined;
        const MIN_SEG_M = 0.4;             // skip a curtain/wall stub shorter than this
        // §RESI-GROUND-COMMERCIAL-CURTAIN — big shopfront window geometry (founder: sill 0.01 m,
        // head 3.5 m). Head is clamped just under the wall head so the opening never breaches it.
        const WIN_SILL_M = 0.01;
        const WIN_HEAD_M = 3.5;
        const WIN_SIDE_MARGIN_M = 0.3;     // leave a stub of solid wall either side of the glass
        // §RESI-GROUND-SLAB-COVER (founder 2026-06-24: "on ground→first floor we see the slab; the
        // walls should rise to the slab level on the ground floor"). The first-floor slab sits on the
        // ground-storey head; a curtain/wall only floor-to-floor tall leaves the slab EDGE exposed
        // (the black band). Raise the ground shopfront by the slab thickness so it wraps that edge.
        const groundWallH = wallHeightM + DEFAULT_SLAB_THICKNESS_M;
        // Push a solid wall a→b. `window` ⇒ (commercial mode only) also record a big centred window
        // spec on it. Returns the wall id (or undefined for a degenerate stub).
        const pushWall = (pa: { x: number; z: number }, pb: { x: number; z: number }, windowed = false): string | undefined => {
            const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
            if (len < MIN_SEG_M) return undefined;
            const id = createId('wall');
            walls.push({
                id, levelId,
                baseLine: [{ x: pa.x, y: 0, z: pa.z }, { x: pb.x, y: 0, z: pb.z }],
                height: groundWallH, thickness: SHELL_WALL_THICKNESS_M,
            });
            if (windowed) {
                const winW = len - 2 * WIN_SIDE_MARGIN_M;
                if (winW >= 0.6) {
                    // Head clamped under the wall head (leave ≥0.1 m of lintel).
                    const head = Math.min(WIN_HEAD_M, groundWallH - 0.1);
                    commercialWindows.push({
                        wallId: id,
                        offset: (len - winW) / 2,
                        width: winW,
                        sillHeight: WIN_SILL_M,
                        height: Math.max(0.6, head - WIN_SILL_M),
                        levelId,
                    });
                }
            }
            return id;
        };
        const pushCurtain = (pa: { x: number; z: number }, pb: { x: number; z: number }): void => {
            if (Math.hypot(pb.x - pa.x, pb.z - pa.z) < MIN_SEG_M) return;
            curtainWalls.push({ id: createId('curtainwall'), start: { x: pa.x, z: pa.z }, end: { x: pb.x, z: pb.z }, height: groundWallH, levelId });
        };
        // A non-entrance façade edge: curtain wall (curtain mode) OR solid wall + big window (default).
        const pushFacadeEdge = (pa: { x: number; z: number }, pb: { x: number; z: number }): void => {
            if (useCurtain) pushCurtain(pa, pb);
            else pushWall(pa, pb, true);
        };
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            if (i === entranceEdge) {
                // Split the entrance edge into [glazed/windowed] | solid door-bay | [glazed/windowed].
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                const nx = (b.x - a.x) / len, nz = (b.z - a.z) / len;
                // §RESI-DOOR-CENTRE (founder 2026-06-24: "center the door on the wall outside") —
                // centre the solid door bay on the façade MIDPOINT (not the orchestrator's off-centre
                // entrance point), so the entrance reads centred on the front elevation.
                const t = len / 2;
                const s0 = Math.max(0, t - ENTRANCE_BAY_HALF_M);
                const s1 = Math.min(len, t + ENTRANCE_BAY_HALF_M);
                const at = (s: number): { x: number; z: number } => ({ x: a.x + nx * s, z: a.z + nz * s });
                doorCenter = at(t);                // door centre = façade midpoint (corridor start)
                pushFacadeEdge(a, at(s0));         // glazed / windowed before the bay
                // §RESI-DOOR-CENTRE-SPINE — capture the SOLID door-bay wall id + length so the
                // entrance door is hosted on THIS wall, centred (= the façade midpoint = corridor from).
                const bayWallId = pushWall(at(s0), at(s1));   // solid door bay (hosts the main entrance door)
                if (bayWallId) doorBay = { wallId: bayWallId, wallLengthM: Math.max(0, s1 - s0) };
                pushFacadeEdge(at(s1), b);         // glazed / windowed after the bay
            } else {
                pushFacadeEdge(a, b);
            }
        }
        return { shellPayload: { walls, levelId }, curtainWalls, commercialWindows, ...(doorCenter ? { doorCenter } : {}), ...(doorBay ? { doorBay } : {}) };
    }

    /** §RESI-GROUND-CORRIDOR (founder 2026-06-24: "the corridor must REACH the core (it leaves a
     *  gap) and be ≥2 m wide — as wide as the solid façade portion") — two parallel interior
     *  partition walls forming a `widthM`-wide corridor running the FULL distance from the entrance
     *  door (`from`) to the core fire door (`to`), so it meets the core with no gap. World frame. */
    private _buildGroundCorridor(
        levelId: string,
        from: { x: number; z: number },
        to: { x: number; z: number },
        widthM: number,
        wallHeightM: number,
    ): { walls: ReadonlyArray<Record<string, unknown>>; levelId: string } {
        const dx = to.x - from.x, dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        const walls: Array<Record<string, unknown>> = [];
        if (len < 1.0) return { walls, levelId };  // door already at the core — no corridor needed
        const nx = dx / len, nz = dz / len;        // entrance → core fire door
        const px = -nz, pz = nx;                   // perpendicular (corridor half-width axis)
        const half = widthM / 2;
        const seg = (a: { x: number; z: number }, b: { x: number; z: number }): void => {
            walls.push({
                id: createId('wall'), levelId,
                baseLine: [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }],
                height: wallHeightM, thickness: CELL_WALL_THICKNESS_M,
            });
        };
        // Run both side walls the FULL length, from the entrance door to the core fire door.
        seg({ x: from.x + px * half, z: from.z + pz * half }, { x: to.x + px * half, z: to.z + pz * half });
        seg({ x: from.x - px * half, z: from.z - pz * half }, { x: to.x - px * half, z: to.z - pz * half });
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
    ): {
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        shellWalls: ReadonlyArray<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }>;
        entryDoor: { wallId: string; offset: number; width: number };
    } {
        const r = apt.cell.rect;
        const corners = [
            this._rotate({ x: r.x0, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z1 }, xf),
            this._rotate({ x: r.x0, z: r.z1 }, xf),
        ];
        const walls: Array<Record<string, unknown>> = [];
        const shellWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];
        // §RESI-NO-DOUBLE-WALL (founder "double walls" + "windows on the shell", 2026-06-23) — SKIP the
        // cell's FAÇADE (exterior boundary) walls: the building SHELL wall already sits on that edge and
        // now hosts the façade windows (the build loop passes the building shell walls to the window
        // resolver). Emitting the cell wall too produced a thin wall coincident with the thick shell wall
        // — the founder's double wall. We KEEP the interior walls (party walls between cells) + the
        // corridor-facing wall that carries the entry door. The door edge is NEVER skipped so the entry
        // door always has a host. `facadeEdges` are the true exterior edges (the rest are blind party walls).
        const EDGE_BY_INDEX = ['z0', 'x1', 'z1', 'x0'] as const;
        const facade: ReadonlySet<string> = apt.facadeEdges instanceof Set
            ? (apt.facadeEdges as ReadonlySet<string>)
            : new Set<string>(apt.facadeEdges ?? []);
        let doorWallId: string | undefined;
        for (let i = 0; i < corners.length; i++) {
            const edge = EDGE_BY_INDEX[i]!;
            // The building shell hosts the façade edge + its windows → don't duplicate it with a cell wall.
            if (facade.has(edge) && edge !== apt.cell.doorEdge) continue;
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
            if (edge === apt.cell.doorEdge) doorWallId = id;
        }
        // §RESI-APT-ENTRY — the apartment FRONT DOOR onto the public corridor, hosted on the
        // corridor-facing (door) edge, which is always emitted above (never a façade edge).
        const edgeLenM = (apt.cell.doorEdge === 'z0' || apt.cell.doorEdge === 'z1')
            ? r.x1 - r.x0
            : r.z1 - r.z0;
        const doorWidth = Math.min(0.9, Math.max(0.7, edgeLenM - 0.4));
        const entryDoor = {
            wallId: doorWallId ?? shellWalls[0]?.id ?? createId('wall'),
            offset: Math.max(0, (edgeLenM - doorWidth) / 2),
            width: doorWidth,
        };
        return { payload: { walls, levelId }, shellWalls, entryDoor };
    }

    /** §RESI-CORE-WALLS (founder "a core with proper core walls + the lift inside", 2026-06-23) —
     *  enclose the central core (stair + lift) with reinforced-concrete perimeter walls on a
     *  floor. §RESI-CORE-DOORS (founder "instead of two gaps it should have two doors") — the
     *  walls are SOLID (no gaps); the two spine-facing edges (z0 + z1) each return a centred
     *  fire-door spec so the deferred pass punches a real door once the wall lands. `core` is the
     *  LOCAL (principal-axis) rect (metres); every corner is rotated to the WORLD parcel by `xf`,
     *  exactly like the cell perimeter, so the core sits on the rotated boundary (θ=0 ⇒ identity). */
    private _buildCorePerimeter(
        levelId: string,
        core: { x0: number; x1: number; z0: number; z1: number },
        wallHeightM: number,
        xf: ResidentialRigidTransform,
    ): {
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        doors: Array<{ wallId: string; offset: number; width: number; levelId: string }>;
    } {
        const DOOR_W = 1.0;          // fire-door clear width
        const walls: Array<Record<string, unknown>> = [];
        const doors: Array<{ wallId: string; offset: number; width: number; levelId: string }> = [];
        // One SOLID LOCAL edge a→b. `door` ⇒ also record a centred door spec on it (hosted later).
        const seg = (a: { x: number; z: number }, b: { x: number; z: number }, door: boolean): void => {
            const wa = this._rotate(a, xf);
            const wb = this._rotate(b, xf);
            if (Math.hypot(wb.x - wa.x, wb.z - wa.z) < 0.05) return;
            const id = createId('wall');
            walls.push({
                id,
                levelId,
                baseLine: [{ x: wa.x, y: 0, z: wa.z }, { x: wb.x, y: 0, z: wb.z }],
                height: wallHeightM,
                thickness: SHELL_WALL_THICKNESS_M,   // RC thick wall, same gauge as the shell.
            });
            if (door) {
                const len = Math.hypot(b.x - a.x, b.z - a.z);   // rigid xf ⇒ LOCAL length == world length
                const w = Math.min(DOOR_W, Math.max(0.8, len - 0.4));
                doors.push({ wallId: id, offset: Math.max(0, (len - w) / 2), width: w, levelId });
            }
        };
        const c0 = { x: core.x0, z: core.z0 };
        const c1 = { x: core.x1, z: core.z0 };
        const c2 = { x: core.x1, z: core.z1 };
        const c3 = { x: core.x0, z: core.z1 };
        // §RESI-CORE-CIRCULATION R-CORE-7 (2026-06-24) — ONE fire door, on the z0 LOBBY edge only.
        // The stair sets back from z0 (its run climbs +Z toward z1), so a z1 door would open against
        // the BACK of the stair run (the blocked "wall in front" the founder reported). z0 is the
        // lobby/approach side the corridor connects to → the single sound access door goes there.
        seg(c0, c1, true);    // z0 edge — fire door into the lobby (stair run-in + lift, corridor side).
        seg(c1, c2, false);   // x1 edge — solid RC.
        seg(c2, c3, false);   // z1 edge — SOLID (backs the top of the stair run; no door).
        seg(c3, c0, false);   // x0 edge — solid RC.
        return { payload: { walls, levelId }, doors };
    }

    /** §RESI-CORE-DOORS — punch the two fire doors per level on the (already committed) core
     *  walls. Deferred + polled exactly like the main entrance: the core wall.batch.create is
     *  async via the bus, so we wait (≤6 s) for every host wall to land in the store, then punch
     *  all door openings in ONE batch + flush the host meshes. Never throws. */
    private _finishCoreDoors(
        specs: ReadonlyArray<{ wallId: string; offset: number; width: number; levelId: string }>,
    ): void {
        if (specs.length === 0) return;
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[resi-building] commandManager unavailable — core doors skipped'); return; }
        const wallIds = specs.map(s => s.wallId);
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : wallIds.every(id => wallStore.getById!(id) != null);
        const levelIds = [...new Set(specs.map(s => s.levelId))];
        const tryPunch = (n: number): void => {
            if (!ready() && n > 0) { setTimeout(() => tryPunch(n - 1), 150); return; }
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(specs.map(s => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'door',
                            offset: s.offset,
                            width: s.width,
                            height: 2.1,
                            sillHeight: 0,
                            elementId: createId('door'),
                            doorType: 'single',
                            // §RESI-CORE-DOORS — solid (fire-rated) stair/lift-core door.
                            systemTypeId: 'dt-solid-timber',
                        },
                    }))));
                }, { levelIds, totalElementCount: specs.length, skipRedetectRooms: true });
                setTimeout(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(wallIds); }
                    catch (e) { console.warn('[resi-building] core-door rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[resi-building] core fire doors — ${specs.length} punched on ${levelIds.length} level(s)`);
            } catch (e) { console.warn('[resi-building] core doors batch failed (non-fatal):', e); }
        };
        tryPunch(40);
    }

    /** §RESI-GROUND-COMMERCIAL-CURTAIN — punch the BIG commercial shopfront windows on the
     *  (already committed) ground shell walls. Deferred + polled exactly like the core doors:
     *  the ground shell wall.batch.create is async via the bus, so wait (≤6 s) for every host
     *  wall to land, then punch all window openings in ONE batch + flush the host meshes. The
     *  opening carries the SAME rich fields the engine's shell windows use (windowType +
     *  systemTypeId) so they render as real see-through glazing, not a blind recess. Never throws. */
    private _finishGroundCommercialWindows(
        specs: ReadonlyArray<{ wallId: string; offset: number; width: number; sillHeight: number; height: number; levelId: string }>,
    ): void {
        if (specs.length === 0) return;
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[resi-building] commandManager unavailable — ground windows skipped'); return; }
        const wallIds = specs.map(s => s.wallId);
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : wallIds.every(id => wallStore.getById!(id) != null);
        const levelIds = [...new Set(specs.map(s => s.levelId))];
        const tryPunch = (n: number): void => {
            if (!ready() && n > 0) { setTimeout(() => tryPunch(n - 1), 150); return; }
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(specs.map(s => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'window',
                            windowType: 'single',
                            offset: s.offset,
                            width: s.width,
                            height: s.height,
                            sillHeight: s.sillHeight,
                            elementId: createId('window'),
                            // Clear commercial glazing (timber/alu casement default) so the
                            // shopfront reads as real see-through glass-in-frame.
                            systemTypeId: 'wt-timber-casement',
                        },
                    }))));
                }, { levelIds, totalElementCount: specs.length, skipRedetectRooms: true });
                setTimeout(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(wallIds); }
                    catch (e) { console.warn('[resi-building] ground-window rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[resi-building] ground commercial windows — ${specs.length} punched on ${levelIds.length} level(s)`);
            } catch (e) { console.warn('[resi-building] ground windows batch failed (non-fatal):', e); }
        };
        tryPunch(40);
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

    /** §RESI-ROOF — a flat roof over the building's top level. Mirrors HouseLayoutExecutor
     *  ._createRoof: `footprint` is WORLD-XZ; the RoofFootprint contract is CENTROID-LOCAL
     *  `polygon` + world `centroid`. A FLAT slab extrudes DOWN from its origin, so we lift it
     *  by (floorToFloor + thickness) above the top level's FLOOR so the slab bottom rests on
     *  the top-storey wall head (= top floor elevation + floorToFloor) and sits cleanly above. */
    private _createRoof(
        cm: CommandManagerLike,
        topFootprint: ReadonlyArray<{ x: number; z: number }>,
        roofLevelId: string,
        materialColor?: string,
    ): void {
        try {
            const poly = this._cleanRing(topFootprint);
            if (poly.length < 3) return;
            let cx = 0, cz = 0;
            for (const p of poly) { cx += p.x; cz += p.z; }
            cx /= poly.length; cz /= poly.length;
            const polygon: [number, number][] = poly.map(p => [p.x - cx, p.z - cz] as [number, number]);
            const THICK = 0.25;
            cm.execute?.(new CreateRoofCommand(createId('roof'), {
                levelId: roofLevelId,
                footprint: { polygon, centroid: [cx, cz] },
                roofType: 'flat',
                overhang: 0,
                // The roof LEVEL elevation is already the top-storey wall head, so worldY(origin) =
                // roofLevel.elevation + baseOffset. A flat slab extrudes DOWN from its origin, so
                // baseOffset = thickness lifts it so the slab bottom rests ON the wall head.
                baseOffset: THICK,
                thickness: THICK,
                autoBaseOffset: false,
                // §RESI-FACADE-COLOUR — paint the roof the building finish colour; absent ⇒ the
                // CreateRoofCommand default (#c8a46e tile) stands.
                ...(materialColor ? { materialColor } : {}),
            }), { source: 'RESI_PIPELINE_ROOF' });
        } catch (e) { console.warn('[resi-building] roof create failed (skipped):', e); }
    }

    /** §RESI-ROOF-GARDEN (2026-06-24) — ring the roof footprint with a 1.1 m glass guard so the
     *  flat roof reads as a walkable amenity deck. `footprint` is WORLD-XZ (no transform). Each
     *  edge becomes one CreateHandrailCommand (fillType:'glass' ⇒ IFC GUARDRAIL), copying the
     *  house void-guard call shape. Roof access is via the interior core headhouse (a door punched
     *  on the core's z0 edge), so no perimeter edge gap is needed — ring every edge. The guard
     *  sits on the roof level datum (baseOffset 0); the deck slab top is ~0.25 m above it, so the
     *  guard rises from roughly the deck surface (spike risk E1 — acceptable for slice 1). */
    private _createRoofGuardrail(
        cm: CommandManagerLike,
        footprint: ReadonlyArray<{ x: number; z: number }>,
        roofLevelId: string,
    ): void {
        const ring = this._cleanRing(footprint);
        if (ring.length < 3) return;
        let railed = 0;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % ring.length]!;
            if (Math.hypot(b.x - a.x, b.z - a.z) < 0.1) continue;   // canExecute floor (≥0.1 m)
            try {
                cm.execute?.(new CreateHandrailCommand({
                    id: createId('handrail'),
                    start: { x: a.x, z: a.z },
                    end: { x: b.x, z: b.z },
                    height: ROOF_GUARD_HEIGHT_M,
                    thickness: ROOF_GUARD_THICKNESS_M,
                    levelId: roofLevelId,
                    baseOffset: ROOF_DECK_THICKNESS_M,   // raise to the deck slab top (~0.25 m up)
                    fillType: 'glass',
                    railProfile: 'rectangular',
                }), { source: 'RESI_PIPELINE_ROOF_GARDEN' });
                railed++;
            } catch (e) { console.warn('[resi-building] roof guard edge skipped:', e); }
        }
        console.log(`[resi-building] §RESI-ROOF-GARDEN perimeter guard — ${railed} edge(s) railed on roof level`);
    }

    /** §RESI-ROOF-GARDEN (2026-06-24, founder feedback round 2) — furnish the deck as a DESIGNED roof
     *  terrace, not a random scatter:
     *   - a PLANTER EDGE: a row of potted plants lined just inside the glass guard on each footprint
     *     edge (a green perimeter band) — capped low (≤0.9 m) so nothing pokes over the parapet;
     *   - a central SEATING CLUSTER (two benches facing a coffee table) anchored near the core door,
     *     so the social zone reads as one group instead of scattered single items;
     *   - a clear CENTRAL CIRCULATION path left open from the core out across the deck.
     *  NO tall trees (the parametric tree ignores the requested height and renders ~6 m, towering
     *  over the building — founder feedback); NO RNG — every position is grid/anchor-derived, so the
     *  layout is deterministic. Height is CAPPED at ROOF_AMENITY_MAX_H so nothing breaches ~2.5 m
     *  above the deck. `footprint` is WORLD-XZ; `core` is the LOCAL rect, rotated to world by `xf`.
     *  The command forces position.y = roofLevel.elevation; baseOffset = deck thickness rests items
     *  on the slab top. A proper green LAWN FINISH on the deck slab is a follow-up (CreateSlabCommand
     *  / the roof have no per-element colour-able floor-finish field on this path). */
    private _furnishRoofDeck(
        cm: CommandManagerLike,
        footprint: ReadonlyArray<{ x: number; z: number }>,
        core: { x0: number; x1: number; z0: number; z1: number },
        roofLevelId: string,
        xf: ResidentialRigidTransform,
    ): void {
        const ring = this._cleanRing(footprint);
        if (ring.length < 3) return;
        const ROOF_AMENITY_MAX_H = 2.5;        // founder cap: nothing taller than this above the deck
        // The CORE keep-out in WORLD: rotate the LOCAL rect corners, take their AABB (a slightly
        // conservative box on a tilted parcel — keeps amenities safely clear of the headhouse).
        const cc = [
            this._rotate({ x: core.x0, z: core.z0 }, xf),
            this._rotate({ x: core.x1, z: core.z0 }, xf),
            this._rotate({ x: core.x1, z: core.z1 }, xf),
            this._rotate({ x: core.x0, z: core.z1 }, xf),
        ];
        const coreMinX = Math.min(...cc.map(p => p.x)) - 0.6;
        const coreMaxX = Math.max(...cc.map(p => p.x)) + 0.6;
        const coreMinZ = Math.min(...cc.map(p => p.z)) - 0.6;
        const coreMaxZ = Math.max(...cc.map(p => p.z)) + 0.6;
        const coreCx = (coreMinX + coreMaxX) / 2, coreCz = (coreMinZ + coreMaxZ) / 2;
        const inCore = (x: number, z: number): boolean =>
            x >= coreMinX && x <= coreMaxX && z >= coreMinZ && z <= coreMaxZ;

        let placed = 0;
        const place = (
            type: FurnitureType, x: number, z: number, w: number, l: number, h: number,
            material: FurnitureMaterial, rotY = 0,
        ): void => {
            if (inCore(x, z)) return;
            try {
                cm.execute?.(new CreateFurnitureCommand({
                    id: createId('furniture'),
                    furnitureType: type,
                    position: { x, y: 0, z },               // y forced to level.elevation in execute()
                    rotation: { x: 0, y: rotY, z: 0 },
                    levelId: roofLevelId,
                    baseOffset: ROOF_DECK_THICKNESS_M,      // sit on the deck slab top, not the datum
                    width: w,
                    length: l,
                    height: Math.min(h, ROOF_AMENITY_MAX_H),
                    material,
                }), { source: 'RESI_PIPELINE_ROOF_GARDEN' });
                placed++;
            } catch (e) { console.warn('[resi-building] roof amenity skipped:', e); }
        };

        // ── 1. PLANTER EDGE — a deterministic row of potted plants stepped along each footprint edge,
        // pulled INWARD off the guard by `edgeInset`, cycling 3 small planter species for variety. A
        // green band hugging the parapet (founder: "line planters along the perimeter").
        const edgeInset = 0.9;                 // off the glass guard
        const planterStep = 2.6;               // spacing between perimeter planters
        const PLANTERS: FurnitureType[] = ['plant_01', 'plant_02', 'plant_03'];
        let pk = 0;
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
            const ex = b.x - a.x, ez = b.z - a.z;
            const edgeLen = Math.hypot(ex, ez);
            if (edgeLen < 1.5) continue;
            const ux = ex / edgeLen, uz = ez / edgeLen;       // along the edge
            // Inward normal = perpendicular pointing toward the deck centre (the core centre proxy).
            let nx = -uz, nz = ux;
            const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
            if ((coreCx - midX) * nx + (coreCz - midZ) * nz < 0) { nx = -nx; nz = -nz; }
            const count = Math.floor((edgeLen - 1.0) / planterStep);
            for (let j = 0; j <= count; j++) {
                const t = (edgeLen - count * planterStep) / 2 + j * planterStep;   // centred run
                const px = a.x + ux * t + nx * edgeInset;
                const pz = a.z + uz * t + nz * edgeInset;
                place(PLANTERS[pk % PLANTERS.length]!, px, pz, 0.5, 0.5, 0.85, 'wood');
                pk++;
            }
        }

        // ── 2. SEATING CLUSTER — anchored just OUTSIDE the core's z0 (lobby/door) face, on the deck
        // side, so it reads as the social hub by the roof access without blocking the door. Two benches
        // flank a coffee table; a clear path stays open between the core door and the cluster.
        // Anchor: step from the core centre out along +world-Z of the run direction (deck side away
        // from the building centre is approximated by stepping toward the footprint AABB centre).
        const fxs = ring.map(p => p.x), fzs = ring.map(p => p.z);
        const deckCx = (Math.min(...fxs) + Math.max(...fxs)) / 2;
        const deckCz = (Math.min(...fzs) + Math.max(...fzs)) / 2;
        // Direction from the core toward the deck centre (so the cluster sits in open deck, not the core).
        let dx = deckCx - coreCx, dz = deckCz - coreCz;
        const dlen = Math.hypot(dx, dz) || 1;
        dx /= dlen; dz /= dlen;
        const clusterGap = Math.max(coreMaxX - coreMinX, coreMaxZ - coreMinZ) / 2 + 2.4;   // clear of core
        const cxAnchor = coreCx + dx * clusterGap;
        const czAnchor = coreCz + dz * clusterGap;
        const rotY = Math.atan2(dx, dz);                  // benches face the table along the deck axis
        // perpendicular (bench offset axis)
        const perpX = -dz, perpZ = dx;
        place('coffee_table', cxAnchor, czAnchor, 1.0, 0.6, 0.4, 'wood', rotY);
        place('entry_bench', cxAnchor + perpX * 1.1, czAnchor + perpZ * 1.1, 1.5, 0.5, 0.45, 'wood', rotY);
        place('entry_bench', cxAnchor - perpX * 1.1, czAnchor - perpZ * 1.1, 1.5, 0.5, 0.45, 'wood', rotY + Math.PI);
        // A pair of lounge chairs at the far end of the cluster (still grouped, not scattered).
        place('lounge_chair', cxAnchor + dx * 2.2 + perpX * 0.7, czAnchor + dz * 2.2 + perpZ * 0.7, 0.7, 0.8, 0.8, 'fabric', rotY + Math.PI);
        place('lounge_chair', cxAnchor + dx * 2.2 - perpX * 0.7, czAnchor + dz * 2.2 - perpZ * 0.7, 0.7, 0.8, 0.8, 'fabric', rotY + Math.PI);

        console.log(`[resi-building] §RESI-ROOF-GARDEN terrace — ${placed} item(s) (planter edge + seating cluster, no trees, deterministic)`);
    }

    /** §RESI-BALCONY (2026-06-24, balcony spike D.4) — for each UPPER-floor apartment, drop ONE
     *  projecting cantilever balcony off its LONGEST exterior façade edge (the living room fronts
     *  the longest façade by construction): a cantilever SLAB (~1.4 m deep, 0.2 m thick) + a 3-edge
     *  glass guard (the outer U; the wall-facing edge stays open as the access). The apartment's
     *  existing façade window/door on that edge is the access (no new door minted — slice 1). The
     *  cell.rect is LOCAL (metres); both balcony corners are rotated to the WORLD parcel by `xf`,
     *  exactly like the cell perimeter. The outward normal points AWAY from the cell centre (spike
     *  risk: a backwards normal puts the balcony inside the building). GROUND (curtain shopfront)
     *  and ROOF levels are excluded by the caller — upper apartment floors only. Never throws. */
    private _createBalconies(
        cm: CommandManagerLike,
        builds: ReadonlyArray<{ levelId: string; apt: PlacedApartment }>,
        xf: ResidentialRigidTransform,
    ): void {
        if (builds.length === 0) return;
        const EDGE_CORNERS: Record<string, [{ x: 'x0' | 'x1'; z: 'z0' | 'z1' }, { x: 'x0' | 'x1'; z: 'z0' | 'z1' }]> = {
            z0: [{ x: 'x0', z: 'z0' }, { x: 'x1', z: 'z0' }],
            x1: [{ x: 'x1', z: 'z0' }, { x: 'x1', z: 'z1' }],
            z1: [{ x: 'x1', z: 'z1' }, { x: 'x0', z: 'z1' }],
            x0: [{ x: 'x0', z: 'z1' }, { x: 'x0', z: 'z0' }],
        };
        let slabs = 0, guards = 0;
        for (const { levelId, apt } of builds) {
            const r = apt.cell.rect;
            const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;   // cell centre (LOCAL)
            const facade: ReadonlyArray<string> = apt.facadeEdges instanceof Set
                ? [...(apt.facadeEdges as ReadonlySet<string>)]
                : (apt.facadeEdges ?? []);
            // Pick the LONGEST façade edge that is NOT the corridor door edge (the living room
            // fronts the longest façade) and is long enough to host a real balcony.
            let bestEdge: string | undefined; let bestLen = 0;
            for (const e of facade) {
                if (e === apt.cell.doorEdge) continue;
                const corners = EDGE_CORNERS[e];
                if (!corners) continue;
                const a = { x: r[corners[0].x], z: r[corners[0].z] };
                const b = { x: r[corners[1].x], z: r[corners[1].z] };
                const len = Math.hypot(b.x - a.x, b.z - a.z);
                if (len > bestLen) { bestLen = len; bestEdge = e; }
            }
            if (!bestEdge || bestLen < BALCONY_MIN_WIDTH_M) continue;
            const corners = EDGE_CORNERS[bestEdge]!;
            const ea = { x: r[corners[0].x], z: r[corners[0].z] };   // LOCAL edge endpoints
            const eb = { x: r[corners[1].x], z: r[corners[1].z] };
            // Outward normal (LOCAL): perpendicular to the edge, chosen to point AWAY from the
            // cell centre (otherwise the balcony lands INSIDE the apartment — spike risk).
            const dx = eb.x - ea.x, dz = eb.z - ea.z;
            const len = Math.hypot(dx, dz) || 1;
            let nx = -dz / len, nz = dx / len;                       // one perpendicular
            const mx = (ea.x + eb.x) / 2, mz = (ea.z + eb.z) / 2;    // edge midpoint
            if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz; }   // flip outward
            // Inset the side edges a touch off the wall ends so the balcony clears the shell wall
            // returns / party walls. The four LOCAL corners of the cantilever rectangle.
            const ux = dx / len, uz = dz / len;
            const ia = { x: ea.x + ux * BALCONY_SIDE_INSET_M, z: ea.z + uz * BALCONY_SIDE_INSET_M };
            const ib = { x: eb.x - ux * BALCONY_SIDE_INSET_M, z: eb.z - uz * BALCONY_SIDE_INSET_M };
            const oa = { x: ia.x + nx * BALCONY_DEPTH_M, z: ia.z + nz * BALCONY_DEPTH_M };
            const ob = { x: ib.x + nx * BALCONY_DEPTH_M, z: ib.z + nz * BALCONY_DEPTH_M };
            // LOCAL → WORLD (rigid xf, same as every other cell consumer). Polygon CCW-ish:
            // inner-a → inner-b → outer-b → outer-a.
            const wia = this._rotate(ia, xf), wib = this._rotate(ib, xf);
            const woa = this._rotate(oa, xf), wob = this._rotate(ob, xf);
            // Cantilever slab — polygon footprint (world-XZ as {x, y:z}), thin floor.
            try {
                const poly = [wia, wib, wob, woa];
                const pxs = poly.map(p => p.x), pzs = poly.map(p => p.z);
                cm.execute?.(new CreateSlabCommand({
                    id: createId('slab'),
                    ifcGuid: createId('slab'),
                    width: Math.max(Math.max(...pxs) - Math.min(...pxs), 0.1),
                    depth: Math.max(Math.max(...pzs) - Math.min(...pzs), 0.1),
                    thickness: BALCONY_SLAB_THICKNESS_M,
                    position: { x: 0, y: 0, z: 0 },
                    levelId,
                    polygon: poly.map(p => ({ x: p.x, y: p.z })),
                }), { source: 'RESI_PIPELINE_BALCONY' });
                slabs++;
            } catch (e) { console.warn('[resi-building] balcony slab skipped:', e); }
            // 3-edge glass guard (the outer U): inner-a→outer-a, outer-a→outer-b, outer-b→inner-b.
            // The wall-facing edge (inner-a→inner-b) stays OPEN as the access from the room.
            const guardEdges: Array<[{ x: number; z: number }, { x: number; z: number }]> = [
                [wia, woa], [woa, wob], [wob, wib],
            ];
            for (const [ga, gb] of guardEdges) {
                if (Math.hypot(gb.x - ga.x, gb.z - ga.z) < 0.1) continue;
                try {
                    cm.execute?.(new CreateHandrailCommand({
                        id: createId('handrail'),
                        start: { x: ga.x, z: ga.z },
                        end: { x: gb.x, z: gb.z },
                        height: BALCONY_GUARD_HEIGHT_M,
                        thickness: ROOF_GUARD_THICKNESS_M,
                        levelId,
                        baseOffset: 0,
                        fillType: 'glass',
                        railProfile: 'rectangular',
                    }), { source: 'RESI_PIPELINE_BALCONY' });
                    guards++;
                } catch (e) { console.warn('[resi-building] balcony guard edge skipped:', e); }
            }
        }
        console.log(`[resi-building] §RESI-BALCONY — ${slabs} balcony slab(s) + ${guards} guard edge(s) across ${builds.length} upper apartment(s)`);
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
        roofGarden = false,
    ): { stairs: number; lifts: number } {
        const core = result.core;   // LOCAL (principal-axis) frame.
        const coreW = core.x1 - core.x0;
        const coreD = core.z1 - core.z0;
        const cz0 = core.z0;
        // §RESI-RIGID-TRANSFORM — the stair RUN is along LOCAL +Z; rotate the run direction
        // to the WORLD parcel so the stair aligns with the rotated core (θ=0 ⇒ {x:0,z:1}).
        const runDir = this._rotateDir({ x: 0, z: 1 }, xf);

        // Risers sized to the gap, clamped to the architectural band.
        let totalRisers = Math.max(2, Math.round(floorToFloorM / STAIR_RISER_TARGET_M));
        let riserHeight = floorToFloorM / totalRisers;
        while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) { totalRisers++; riserHeight = floorToFloorM / totalRisers; }
        while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) { totalRisers--; riserHeight = floorToFloorM / totalRisers; }

        // §RESI-CORE-CIRCULATION (R-CORE-2/6, founder 2026-06-24) — a shared LOBBY band at the core's
        // z0 (corridor) edge that the fire door opens into; BOTH the stair and the lift are set BACK
        // behind it so neither blocks the approach. Stair = LEFT half, lift = RIGHT half.
        const halfRunDepth = Math.floor(totalRisers / 2) * STAIR_TREAD_M;   // U-stair folded run depth
        const lobbyDepth = Math.max(0.8, Math.min(1.4, coreD - halfRunDepth - 0.3));
        const shaftDepth = Math.min(2.4, Math.max(1.6, coreD - lobbyDepth - 0.2));
        const liftCx = core.x0 + coreW * 0.75;
        const liftCz = cz0 + lobbyDepth + shaftDepth / 2;   // lift FRONT (door) sits on the lobby line
        const shaftWidth = Math.min(2.0, Math.max(1.6, coreW / 2 - 0.2));

        // §RESI-CORE-STAIR-CLASH (founder 2026-06-24: "the core wall clips the stair") — the RC core
        // perimeter wall is CENTRED on the rect edge (thickness SHELL_WALL_THICKNESS_M), so the LEFT
        // wall's INNER face is at core.x0 + SHELL_WALL_THICKNESS_M/2. The U-stair occupies a LATERAL
        // x-band: run 1 is centred at `stairCenterX`; run 2 is offset −stairWidth (perpDir); each run
        // is ±stairWidth/2 wide. So the footprint spans [stairCenterX − 1.5·w, stairCenterX + 0.5·w]
        // (total 2·w). Previously stairCenterX = core.x0 + coreW/4 with w≈1.0 put the leftmost run
        // edge exactly on core.x0 → INTO the left wall. Fix: compute a CLEARED x-band between the left
        // core wall inner face and the lift's left edge, clamp the stair width to half that band, and
        // anchor the footprint's leftmost edge at the band's left so the stair never touches the wall.
        const STAIR_CORE_CLEARANCE_M = 0.05;
        const xBandLeft = core.x0 + SHELL_WALL_THICKNESS_M / 2 + STAIR_CORE_CLEARANCE_M;
        const xBandRight = (liftCx - shaftWidth / 2) - STAIR_CORE_CLEARANCE_M;   // clear of the lift too
        const xBand = Math.max(0, xBandRight - xBandLeft);
        // Footprint lateral span = 2·stairWidth must fit the band ⇒ stairWidth ≤ band/2. Also keep the
        // architectural floor (≥0.9 m) — if the band is too tight the max() wins and the stair is
        // narrower than ideal but still inside the band (a small overhang is preferable to a wall clip,
        // and a 6 m core comfortably yields ≥0.9 m here).
        const stairWidth = Math.max(0.9, Math.min(STAIR_WIDTH_M, xBand / 2));
        // Run-1 centre x: anchor the footprint's leftmost edge (stairCenterX − 1.5·w) at xBandLeft.
        const stairCenterX = xBandLeft + 1.5 * stairWidth;

        // §RESI-ROOF-GARDEN — the top INDEX the circulation reaches. Normally the top apartment
        // floor (levels.length − 1); when the roof deck is ON, the roof level (registered at index
        // levels.length in `levelIdByIndex`) so the stair adds a final top→roof flight + the lift a
        // roof cab. Off-by-one here puts the roof flight one storey wrong (spike risk E2).
        const topIndex = roofGarden ? result.levels.length : result.levels.length - 1;
        let stairs = 0;
        // A stair between each adjacent level pair (ground→1, 1→2, …).
        for (let idx = 0; idx < topIndex; idx++) {
            const fromLevelId = levelIdByIndex.get(idx);
            const toLevelId = levelIdByIndex.get(idx + 1);
            if (!fromLevelId || !toLevelId) continue;
            const startY = baseElevationM + idx * floorToFloorM;
            // §RESI-CORE-CIRCULATION — the stair starts BACK from z0 by the shared lobby depth, so a
            // clear run-in landing sits between the z0 fire door and the bottom tread (the U-stair's
            // run-OUT folds back into that same lobby). Stair runs +Z; run 1 is centred at the
            // CLEARED `stairCenterX` (§RESI-CORE-STAIR-CLASH) so the U-footprint never touches the
            // left core wall or the lift.
            const startLocal = this._rotate({ x: stairCenterX, z: cz0 + lobbyDepth }, xf);
            const startPosition = { x: startLocal.x, y: startY, z: startLocal.z };
            // §RESI-CORE-USTAIR (founder 2026-06-24: "the stair clashes with the core — the stair can
            // be in U to take less space"). A straight 17-riser run (~4.25 m) overran the 4 m-deep
            // core. Fold it into a U — two half-flights + a half-landing — so it fits the core
            // footprint. Geometry mirrors the canonical StairCommandPlan U-shape (§7.1): run 2 is the
            // reverse of run 1, offset one stair-width laterally, starting halfRun+tread along + up
            // half the rise. `stairWidth` is the cleared lateral band width (hoisted above).
            const dir = { x: runDir.x, y: 0, z: runDir.z };
            const reverseDir = { x: -runDir.x, y: 0, z: -runDir.z };
            const perpDir = { x: -runDir.z, y: 0, z: runDir.x };
            const half = Math.floor(totalRisers / 2);
            const halfRun = half * STAIR_TREAD_M;
            const secondStart = {
                x: startPosition.x + dir.x * (halfRun + STAIR_TREAD_M) + perpDir.x * stairWidth,
                y: startPosition.y + half * riserHeight,
                z: startPosition.z + dir.z * (halfRun + STAIR_TREAD_M) + perpDir.z * stairWidth,
            };
            try {
                cm.execute?.(new CreateStairCommand({
                    id: createId('stair'),
                    baseLevelId: fromLevelId,
                    topLevelId: toLevelId,
                    shape: 'U',
                    riserHeight,
                    treadDepth: STAIR_TREAD_M,
                    width: stairWidth,
                    startPosition,
                    flights: [
                        { direction: dir, riserCount: half },
                        { direction: reverseDir, riserCount: totalRisers - half, startOverride: secondStart },
                    ],
                    landings: [{ depth: 2 * stairWidth }],
                    accessibilityType: 'standard',
                }), { source: 'RESI_PIPELINE_STAIR' });
                stairs++;
            } catch (e) { console.warn('[resi-building] stair create failed (skipped):', e); }
        }

        // §RESI-LIFT-EVERY-FLOOR (founder "I can see the lift — but we need it on every floor",
        // 2026-06-23) — emit ONE lift cab per ADJACENT level pair, mirroring the stair loop above,
        // so the shaft is visible on EVERY floor instead of a single cab. Each segment is one
        // floor-to-floor tall and stacks at the same core origin.
        // §RESI-LIFT-ROTATE (2026-06-23) — the LiftMeshBuilder draws an AXIS-ALIGNED
        // BoxGeometry(shaftWidth, h, shaftDepth) and orients the whole group by
        // `group.rotation.y = lift.rotation`. On a TILTED parcel an unrotated shaft pokes outside
        // the rotated core and reads as "missing"; align the shaft's LOCAL +Z (depth axis) to the
        // rotated run direction `runDir` (THREE: local +Z → world (sin φ, 0, cos φ), φ =
        // atan2(runDir.x, runDir.z)). θ = 0 ⇒ runDir = {0,1} ⇒ φ = 0 ⇒ axis-aligned behaviour.
        let lifts = 0;
        const liftOrigin = this._rotate({ x: liftCx, z: liftCz }, xf);
        const liftRotationY = Math.atan2(runDir.x, runDir.z);
        // shaftWidth + shaftDepth are defined in the core setup (sized so the lift sits BEHIND the
        // lobby band; shaftWidth is also used to bound the stair's cleared x-band above).
        // §RESI-LIFT-TOP-CAB (founder "the lift is not present on the top floor", 2026-06-23) — the
        // mesh height = |topEl − baseEl| (LiftMeshBuilder.resolveSpan), so a cab needs a level ABOVE
        // its base. The TOP floor has none → it was skipped. Loop INCLUSIVE to the top index: lower
        // floors span to the level above (one storey); the top floor passes base===top, which makes
        // resolveSpan fall back to a one-storey cab anchored at origin.y (= the top floor elevation)
        // → a visible lift cab in the top-floor volume too.
        for (let idx = 0; idx <= topIndex; idx++) {
            const fromLevelId = levelIdByIndex.get(idx);
            if (!fromLevelId) continue;
            const toLevelId = levelIdByIndex.get(idx + 1) ?? fromLevelId;
            try {
                cm.execute?.(new CreateVerticalCirculationCommand({
                    id: createId('verticalCirculation'),
                    baseLevelId: fromLevelId,
                    topLevelId: toLevelId,
                    kind: 'passenger',
                    origin: { x: liftOrigin.x, y: baseElevationM + idx * floorToFloorM, z: liftOrigin.z },
                    rotation: liftRotationY,
                    shaftWidth,
                    shaftDepth,
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
            // §RESI-APT-ENTRY — the front-door host (a cell-perimeter wall) must land too.
            if (b.entryDoor) neededWallIds.add(b.entryDoor.wallId);
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
            // §RESI-FLOOR-FINISH (founder "add floor finishes … public vs private vs wet", 2026-06-23)
            // — once the rooms land, lay a per-room floor finish on EVERY built level (timber in
            // living/bed/corridor, porcelain tile in kitchen/bath/wc), exactly like the house. The
            // shared trigger reads each room's occupancyType; we set the level active then fire it per
            // level, staggered so the just-committed graph rooms / redetect have settled in the store.
            this._finishFloorsPerLevel(runtime, levelIds);
            const ready = wallsReady();
            console.log(
                `[resi-building] apartments finished — openings + rooms committed ` +
                `(builds=${builds.length} hostWalls=${neededWallIds.size} wallsReady=${ready}` +
                `${ready ? '' : ' — ⚠ TIMED OUT before all host walls landed; some apartments may be unenclosed (raise §RESI-FINISH-BUDGET)'})`,
            );
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
        // §RESI-FINISH-BUDGET (founder "residential never fills", 2026-06-23) — the wall-ready poll
        // budget MUST scale with the build size. A large plate emits hundreds of apartments → thousands
        // of async wall dispatches that take far longer than the old fixed 6 s (40 × 150 ms) to all land
        // in the store, so the gate TIMED OUT and committed openings/rooms against host walls that had
        // not arrived → only a handful of apartments enclosed and the rest shipped as one ~630 m² void.
        // Scale the FALLBACK budget to the needed host-wall count (~1 tick per 4 walls, 150 ms each),
        // floored at the original 40 (small plates byte-identical) and capped at 400 ticks (~60 s) so a
        // pathological plate can't hang the UI. The subscribe + poll still fire go() the INSTANT
        // wallsReady() is true, so a fast plate finishes early and is unaffected.
        const budgetTicks = Math.min(400, Math.max(40, Math.ceil(neededWallIds.size / 4)));
        console.log(
            `[resi-building] §RESI-FINISH-BUDGET waiting on ${neededWallIds.size} host wall(s) across ` +
            `${builds.length} apartment(s), budget=${budgetTicks} ticks (~${Math.round((budgetTicks * 150) / 1000)}s fallback)`,
        );
        tick(budgetTicks);
    }

    /** §RESI-FLOOR-FINISH — lay the per-room floor finish on each built level. Sets the level
     *  active (the shared trigger resolves rooms via the active level → `projectContext.activeLevelId`)
     *  then fires `triggerFloorLayout`, staggered per level so each level's rooms have settled.
     *  Best-effort: a miss on one level logs + skips. */
    private _finishFloorsPerLevel(runtime: PryzmRuntime, levelIds: readonly string[]): void {
        const pc = (window as unknown as { projectContext?: { activeLevelId?: string | null } }).projectContext;
        levelIds.forEach((lid, i) => {
            setTimeout(() => {
                try {
                    if (pc) pc.activeLevelId = lid;
                    triggerFloorLayout(runtime);
                } catch (e) { console.warn('[resi-building] floor-finish failed on', lid, '(non-fatal):', e); }
            }, 500 + i * 250);
        });
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
        // §RESI-APT-ENTRY — the apartment FRONT DOOR onto the public corridor, centred on the
        // cell's corridor-facing perimeter wall. Single-leaf, standard height. Without this the
        // apartment is a sealed box (no way in from the corridor).
        const entryItems = b.entryDoor
            ? [{
                wallId: b.entryDoor.wallId,
                opening: {
                    id: createId('opening'),
                    type: 'door',
                    offset: b.entryDoor.offset,
                    width: b.entryDoor.width,
                    height: 2.1,
                    sillHeight: 0,
                    elementId: createId('door'),
                    doorType: 'single',
                },
            }]
            : [];
        const allOpenings = [...openingItems.map(it => ({ wallId: it.p.wallId, openingData: it.p.opening })),
            ...entryItems.map(it => ({ wallId: it.wallId, openingData: it.opening }))];
        if (allOpenings.length > 0) {
            try {
                cm.execute?.(new CreateWallOpeningsBatchCommand(allOpenings));
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

    /**
     * §RESI-GROUND-FLOOR — host the MAIN ENTRANCE door on the ground shell. Deferred so the
     * shell wall.batch.create (async via the bus) has landed in the store. Resolves which
     * shell wall the entrance sits on (the wall nearest the world entrance point), computes
     * the offset along it, and punches ONE wide `door` opening via CreateWallOpeningsBatchCommand
     * (P6 — command-only). Wide double-leaf entrance (no dedicated 'entrance' door type exists;
     * Door.doorType is 'single'|'double'). Never throws — a miss logs + skips.
     */
    private _buildEntranceDoor(
        levelId: string,
        shell: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string },
        gf: GroundFloorDescriptor,
        xf: ResidentialRigidTransform,
        doorBay?: { wallId: string; wallLengthM: number },
    ): void {
        const cm = getCommandManager();
        if (!cm?.execute) { console.warn('[resi-building] commandManager unavailable — entrance skipped'); return; }
        // The entrance centre is LOCAL → rotate to the WORLD parcel (same transform as the shell
        // is implicitly in — the shell is WORLD already; the entrance point came LOCAL).
        const worldCenter = this._rotate({ x: gf.entranceCenter.x, z: gf.entranceCenter.z }, xf);

        const shellWallIds = shell.walls
            .map(w => (typeof w.id === 'string' ? w.id : undefined))
            .filter((id): id is string => !!id);
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const shellReady = (): boolean =>
            !wallStore?.getById ? true : shellWallIds.every(id => wallStore.getById!(id) != null);

        // Wait (poll, ≤6 s) for the ground shell walls to land, then punch the entrance.
        const tryPunch = (n: number): void => {
            if (!shellReady() && n > 0) { setTimeout(() => tryPunch(n - 1), 150); return; }
            // §RESI-DOOR-CENTRE-SPINE (founder 2026-06-24: "entrance → corridor → core door must read
            // as ONE centred spine") — host the entrance on the SOLID door-bay wall the ground shell
            // minted (its midpoint IS the corridor `from`), NOT a wall re-resolved from the
            // orchestrator's off-centre entrance point (which could pick a side window wall and centre
            // the door there). Fall back to the nearest-wall resolve only when no bay was built (the
            // degenerate-ring solid-shell fallback). Either way the door is CENTRED on its host wall.
            let hostWallId: string;
            let hostLenM: number;
            if (doorBay) {
                hostWallId = doorBay.wallId;
                hostLenM = doorBay.wallLengthM;
            } else {
                const hit = resolveEntranceOnShell(shell.walls, worldCenter);
                if (!hit) { console.warn('[resi-building] entrance — no shell wall resolved (skipped)'); return; }
                hostWallId = hit.wallId;
                hostLenM = hit.wallLengthM;
            }
            const hit: EntranceHostHit = { wallId: hostWallId, wallLengthM: hostLenM, centerAlongM: hostLenM / 2 };
            const { width } = entranceOffsetOnWall(hit, gf.entranceWidthM);
            // §RESI-DOOR-CENTRE — centre the door on its (bay) host wall so it sits mid-façade, on the
            // corridor axis (host-wall midpoint = corridor `from` = core fire door target).
            const offset = Math.max(0, (hit.wallLengthM - width) / 2);
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand([{
                        wallId: hit.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'door',
                            offset,
                            width,
                            height: 2.4,           // a tall, generous lobby entrance
                            sillHeight: 0,
                            elementId: createId('door'),
                            doorType: 'double',    // wide double-leaf — the building's front door
                            // §RESI-ENTRANCE-GLASS (founder 2026-06-23) — the main entrance is a
                            // GLAZED residential front door (warm-timber frame + fixed glazed
                            // sidelight), not the default Solid Timber. Stamps the built-in
                            // residential glazed entrance type; the door committer resolves its
                            // frame/leaf/glazing finish from DoorSystemTypeStore.
                            systemTypeId: 'dt-modern-entrance-glazed',
                        },
                    }]));
                }, { levelIds: [levelId], totalElementCount: 1, skipRedetectRooms: true });
                // Flush the host wall mesh so the opening shows (mirror of the apartment pass).
                setTimeout(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.([hit.wallId]); }
                    catch (e) { console.warn('[resi-building] entrance rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[resi-building] main entrance — ${width.toFixed(2)}m door on shell wall ${hit.wallId} @ offset ${offset.toFixed(2)}m`);
            } catch (e) { console.warn('[resi-building] entrance door batch failed (non-fatal):', e); }
        };
        tryPunch(40);
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
