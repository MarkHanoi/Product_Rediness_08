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
import type { FloorPattern } from '@pryzm/core-app-model';
// §DEFERWORK-RESI-ADOPT — background-tab-resilient deferral.  `deferWork` honours
// the delay via setTimeout while the tab is VISIBLE (foreground identical) but
// rides the unthrottled BackgroundHeartbeat when `document.hidden`, so these
// deferred finishing passes / poll loops keep advancing instead of crawling
// under the ≥1 s background setTimeout clamp.  See §BACKGROUND-TAB-KEEPALIVE.
import { deferWork } from '@pryzm/frame-scheduler';
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
    CreateFloorCommand,
    UpdateRoomFinishesCommand,
} from '@pryzm/command-registry';
import { roomDataFromGraphSpec, type GraphRoomSpec, type RoomData, type RoomFinishes } from '@pryzm/room-topology';
import type { FurnitureType, FurnitureMaterial } from '@pryzm/geometry-furniture';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    buildLayoutCommands,
    clampOpeningToWall,
    type ResidentialBuildingOk,
    type ResidentialRigidTransform,
    type GroundFloorDescriptor,
    type PlacedApartment,
    type ScoredLayoutOption,
    type IdPrefix,
    type LayoutExecuteOptions,
    type LayoutCommandSet,
} from '@pryzm/ai-host';
import { computeStairFootprintRect } from '@pryzm/geometry-stair';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { triggerFloorLayout } from '../floor-layout/floorLayoutTrigger.js';
import { triggerCeilingLayout } from '../ceiling-layout/ceilingLayoutTrigger.js';
import { nameDetectedRooms } from '../apartment-layout/nameDetectedRooms.js';
// §RESI-DOUBLE-ROOM-TAGS (ADR-0069 GR1) — the PURE graph-authority decision + pre-mark
// (mirrors the house executor's pre-mark chokepoint); decided ONCE before the async
// wall commits so no observer-driven redetect can mint a generic "Room NN" to double
// against the engine's named graph rooms.
import { decideAndPreMarkGraphAuthority, type GraphAuthorityObserverLike } from './residentialGraphAuthority.js';
// §RESI-CORRIDOR-FINISH-SHAPE (founder 2026-06-26) — the public-corridor floor finish is
// the CLEAN RESIDUAL region (shell interior − apartment cells − core), not a union of thin
// per-band strips. PURE residual-grid + ring tracer (LOCAL frame; caller rotates to world).
import { computeCorridorResidualRings } from './residentialCorridorResidual.js';
// §RESI-STAIR-VOID-IN-FINISH (2026-06-24) — the shared stairwell-void registry the floor/ceiling
// finish passes read (getStairVoidsForLevel) to CUT the finish over the open stairwell. Mirrors
// the house: record the stair's footprint on its UPPER (host) level so the finish never re-covers
// the slab void you can see through.
import { resetStairVoids, recordStairVoid, getStairVoidsForLevel } from '../house-layout/houseStairVoids.js';
import { resolveEntranceOnShell, type EntranceHostHit } from './groundFloorPlacement.js';

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
/** §RESI-CORE-REWORK — the architectural approach clearance (m): the clear run in front of the
 *  stair's first riser (to step ON) + the lift door. MUST equal `APPROACH_CLEAR_M` in the ai-host
 *  `coreSizing` module (the orchestrator sizes the core to hold this approach; the executor seats the
 *  stair lobby to it). Kept as a local mirror so the editor needn't import a value across the
 *  worktree package boundary; the coreSizing unit tests pin the ai-host side at the same 1.2 m. */
const RESI_APPROACH_CLEAR_M = 1.2;
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
// §RESI-STAIR-QUALITY-MATCH-HOUSE (2026-06-24) — the stairwell-void guardrail height, matching the
// house (HouseLayoutExecutor.STAIR_HANDRAIL_HEIGHT_M = 1.050, baluster fill = the stair's own rail).
const STAIR_HANDRAIL_HEIGHT_M = 1.050;
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
     *  cell-perimeter wall (the corridor-facing `doorEdge`) hosts it + the offset and clear
     *  width. Deferred-punched once the perimeter wall lands, like the windows.
     *  §RESI-ENTRY-INTO-CORRIDOR — `corridorAligned` ⇒ `offset` already targets where the
     *  internal corridor meets the edge; the punch keeps it verbatim (no re-centre). */
    readonly entryDoor?: { readonly wallId: string; readonly offset: number; readonly width: number; readonly corridorAligned: boolean };
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

        // §RESI-STAIR-VOID-IN-FINISH (2026-06-24) — clear any voids from a PRIOR generation so a
        // re-build (same session) doesn't leak stale stairwell holes into this building's finishes.
        resetStairVoids();

        const floorToFloorM = input?.floorToFloorM && input.floorToFloorM > 0 ? input.floorToFloorM : DEFAULT_FLOOR_TO_FLOOR_M;
        const baseElevationM = ground.elevation ?? 0;
        // §RESI-GROUND-HEIGHT-4500 (founder 2026-06-24: "the ground commercial floor must be taller —
        // 4.5 m floor-to-floor — and EVERYTHING above shifts up so nothing overlaps"). The GROUND
        // storey (index 0) is a tall ~4.5 m commercial floor; every UPPER residential storey keeps the
        // normal `floorToFloorM`. These two helpers are the SINGLE SOURCE for per-level storey height
        // and the cascaded elevation — every elevation / wall-height / stair-rise below derives from
        // them (NOT the orchestrator's uniform `lvl.elevationM`, which assumed one height for all).
        const GROUND_FTF_M = Math.max(4.5, floorToFloorM);
        // Storey height of level `index` (the gap from this floor up to the next).
        const ftfAt = (index: number): number => (index === 0 ? GROUND_FTF_M : floorToFloorM);
        // World elevation (floor level) of level `index` = base + ground storey (if above ground) +
        // each intervening UPPER storey. So level 1 sits at base + 4.5, level 2 at base + 4.5 + ftf, …
        const elevationAt = (index: number): number =>
            baseElevationM + (index <= 0 ? 0 : GROUND_FTF_M + (index - 1) * floorToFloorM);
        // The top of the whole stack (the roof level floor) = elevation of level N.
        const roofElevationCascadeM = elevationAt(result.levels.length);
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
            // §RESI-GROUND-HEIGHT-4500 — cascaded elevation + this storey's own height (the ground's
            // 4.5 m shifts every upper level up), NOT the orchestrator's uniform `lvl.elevationM`.
            const res = cm.execute(new AddLevelCommand({ levelId, name, elevation: elevationAt(lvl.levelIndex), height: ftfAt(lvl.levelIndex) }), { source: 'RESI_PIPELINE_LEVEL' });
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
            // §RESI-GROUND-HEIGHT-4500 — the roof level sits on the top storey's wall head, via the
            // cascade (= base + ground 4.5 m + (N−1)·ftf), so it shifts up with the taller ground.
            const roofElevationM = roofElevationCascadeM;
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
        // §RESI-CORE-REWORK (founder 2026-06-26: "two confusing doors on the same core wall") — the
        // earlier §RESI-LIFT-LANDING-DOORS added a SECOND door on the core's z0 PERIMETER wall (the
        // lift "landing" door) right next to the centred fire door. Architecturally wrong: the core
        // perimeter has exactly ONE pedestrian access door (the fire/lobby door into the core lobby);
        // the lift is then reached from WITHIN the lobby. A lift LANDING door belongs on the lift
        // SHAFT face (the wall the cab opens onto) — but the resi lift is a mesh (CreateVertical
        // Circulation), NOT modelled as its own shaft walls, so there is no shaft face to host it.
        // Per the rework, the perimeter landing door is REMOVED entirely (the landing-door collection
        // + finish pass are gone); the core keeps its single fire door.
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
            // §RESI-GROUND-HEIGHT-4500 — this storey's own height (4.5 m on the ground, ftf above) +
            // its cascaded floor elevation; every wall height / apartment base below uses these.
            const levelFtf = ftfAt(lvl.levelIndex);
            const levelElevation = elevationAt(lvl.levelIndex);

            // Building shell perimeter (one wall per footprint edge) + slab on EVERY floor.
            // `lvl.footprint` is already WORLD (the drawn parcel) → no transform here.
            // §RESI-GROUND-CURTAIN — the GROUND floor is a glazed commercial shopfront: curtain
            // walls on every façade edge except a solid entrance bay (which still hosts the main
            // door). Upper floors keep the solid perimeter shell that hosts their façade windows.
            let shellPayload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
            if (lvl.levelIndex === 0) {
                const wec = this._rotate({ x: result.groundFloor.entranceCenter.x, z: result.groundFloor.entranceCenter.z }, xf);
                const g = this._buildGroundShell(levelId, lvl.footprint, levelFtf, wec, groundCurtain);
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
                    groundCorridorPayload = this._buildGroundCorridor(levelId, g.doorCenter, fireDoor, corridorW, levelFtf);
                }
            } else {
                shellPayload = this._buildShellPerimeter(levelId, lvl.footprint, levelFtf);
            }
            // §RESI-FACADE-COLOUR / §RESI-FACADE-INTERIOR-WHITE — the EXTERIOR shell walls read the
            // façade colour OUTSIDE and WHITE INSIDE (founder 2026-06-24). Make them LAYERED walls
            // (exterior finish = façade colour, interior finish = white), ordered per-wall so the
            // façade layer faces AWAY from the building centroid. No-op (plain wall) when no façade
            // colour is set (all-white default keeps a single default material).
            this._paintShellWallsTwoFace(shellPayload, lvl.footprint, facadeColor);
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
                const cp = this._buildCorePerimeter(levelId, result.core, levelFtf, xf);
                // §RESI-FACADE-COLOUR-PERSIST (founder 2026-06-24: "exterior face of the perimeter
                // walls — NOT interior partitions") — the core enclosure is an INTERIOR room (the
                // lift/stair shaft), so it keeps its default material; only the building shell takes
                // the façade colour.
                corePerimeterPayloads.push(cp.payload);
                coreDoorSpecs.push(...cp.doors);
                // §RESI-CORE-REWORK — NO second perimeter door. The single fire/lobby door (in
                // cp.doors) is the core's only pedestrian access; the lift is reached from the lobby.
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
                const perimeter = this._buildCellPerimeter(levelId, apt, levelFtf, xf);
                // §RESI-FACADE-COLOUR-PERSIST (founder 2026-06-24: "NOT interior partitions") — the
                // cell perimeter is party/corridor-facing INTERIOR wall, so it keeps its default
                // material; only the exterior building shell carries the façade colour.
                cellPerimeterPayloads.push(perimeter.payload);
                const opts: LayoutExecuteOptions = {
                    levelId,
                    // §RESI-GROUND-HEIGHT-4500 — the apartment sits at its CASCADED floor elevation +
                    // this storey's height, NOT the orchestrator's uniform `lvl.elevationM`/ftf.
                    baseElevationM: levelElevation,
                    wallHeightM: levelFtf,
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
            // §RESI-CORE-REWORK — single fire/lobby door on the roof headhouse too (no second
            // perimeter landing door); the lift is reached from the headhouse lobby.
        }

        console.log(`[resi-building] prepared — ${placedCount} apartment(s), ${rejectedCount} rejected, ${shellPayloads.length} shell ring(s)`);

        // ── §RESI-DOUBLE-ROOM-TAGS (founder 2026-06-26: "every space ships with the correct
        // name AND a duplicate generic 'Room NN' overlaid on it") — ADR-0069 GR1, mirroring the
        // HOUSE fix's pre-mark chokepoint. ROOT CAUSE: graph-authoritative was set TOO LATE —
        // only deep inside `_finishOneApartment` (the DEFERRED `_finishApartments` batch, which
        // polls for the async host walls to land). But the structural batch below dispatches the
        // apartment walls via the bus (async), and each `bim-wall-mutation-committed` arms the
        // RoomTopologyObserver's 300 ms soft-coalesce → `_executeRedetect`. The structural +
        // corridor batches only arm a 1 s post-batch cooldown; once it lapses (and BEFORE the
        // deferred finish batch marks the level), that auto-redetect RUNS on a NOT-YET-authoritative
        // level → it mints the generic "Room NN" set. Then `_finishApartments` adds the NAMED
        // graph rooms on top → the two coexist (the founder's double tags). FIX: decide
        // graph-authority ONCE here (all-or-nothing across the apartment levels, identical rule to
        // `_finishApartments`) and PRE-MARK every apartment level authoritative BEFORE any wall
        // commits, so no observer-driven redetect can ever create a generic room to double against.
        // Reversible: window.__pryzmGraphRooms === false forces legacy detection.
        const graphRoomsEnabled = (window as unknown as { __pryzmGraphRooms?: boolean }).__pryzmGraphRooms !== false;
        const { useGraphRooms } = decideAndPreMarkGraphAuthority(
            apartmentBuilds.map(b => ({ levelId: b.levelId, roomCommandCount: b.set.roomCommands.length })),
            graphRoomsEnabled,
            (window as unknown as { roomTopologyObserver?: GraphAuthorityObserverLike }).roomTopologyObserver,
        );
        console.log(
            `[resi-building] §DIAG-GRAPH-GATE useGraphRooms=${useGraphRooms} graphRoomsEnabled=${graphRoomsEnabled} ` +
            `apartmentLevels=[${apartmentBuilds.map(b => `${b.levelId}:${b.set.roomCommands.length}`).join(', ')}]`,
        );

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
            // §RESI-FACADE-COLOUR-PERSIST (founder 2026-06-24: "the colour got applied to the roof
            // floor — which is NOT what I wanted") — the roof keeps its DEFAULT material; the façade
            // colour lands ONLY on the exterior shell walls.
            if (topLvl) this._createRoof(cm, topLvl.footprint, roofLevelId);
            // 3c. §RESI-ROOF-GARDEN — turn the flat roof into a walkable amenity deck: a perimeter
            // glass guard ringing the footprint + a handful of EXISTING furniture amenities, all on
            // the roof level. The deck IS the flat roof slab (no slab change). Core is the keep-out.
            if (roofGarden && topLvl) {
                this._createRoofGuardrail(cm, topLvl.footprint, roofLevelId);
                if (result.core) this._furnishRoofDeck(cm, topLvl.footprint, result.core, roofLevelId, xf);
            }
            // §RESI-CORE-PENTHOUSE-CAP (founder 2026-06-24) — the rooftop core overrun (stair/lift
            // headhouse) is enclosed by walls + a door on the roof level but was OPEN-TOPPED. Cap it
            // with a small flat roof over the CORE footprint (default material, NOT the façade
            // colour). Built whenever the roof-level core enclosure is (= roofGarden && core).
            if (roofGarden && result.core) {
                this._createCoreRoofCap(cm, result.core, roofLevelId, floorToFloorM, xf);
            }
            // 4. Central core — a stair per adjacent level pair + ONE lift ground→top.
            //    §RESI-ROOF-GARDEN — when ON, the core climbs ONE flight higher to the roof level.
            //    §RESI-GROUND-HEIGHT-4500 — pass the cascade so the GROUND→1 flight spans the tall
            //    4.5 m rise (more risers, re-fitted by the switchback) and every floor sits at its
            //    cascaded elevation, not a uniform idx·ftf.
            const coreResult = this._createCore(cm, result, levelIdByIndex, floorToFloorM, baseElevationM, xf, roofGarden, ftfAt, elevationAt);
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

        // §RESI-EXTERIOR-WALL-MITER (founder 2026-06-24: "the exterior wall corners show a vertical
        // SEAM where two perpendicular shell walls meet — they're not mitred"). The shell/perimeter/
        // core walls are built as one wall per footprint edge, and consecutive edges ALREADY share the
        // EXACT corner endpoint (ring[i+1] is edge i's end + edge i+1's start) — but landing them in
        // the store does NOT run the corner-join pass, so they meet with SQUARE caps (the seam). The
        // house/apartment generators fix this by calling `__wallRebuildControl.rebuildWalls(ids)` after
        // their walls commit, which forces WallRebuildCoordinator._flush → WallJoinResolver.resolveLevel
        // → the bisector MITRE on every shared corner. Do the SAME here for the ground shell + every
        // storey's shell perimeter + the core (+ the ground corridor), once they've landed.
        this._mitreShellCorners([
            ...shellPayloads,
            ...corePerimeterPayloads,
            ...cellPerimeterPayloads,
            ...(groundCorridorPayload ? [groundCorridorPayload] : []),
        ]);

        toast(`Built building — ${placedCount} apartment(s), ${stairCount} stair(s), ${liftCount} lift(s).`, 'success');

        // ── Deferred openings + doors + windows + rooms per apartment, once the host
        // walls have landed (the bus is async — openings READ the committed store).
        // §RESI-DOUBLE-ROOM-TAGS — pass the graph-authority decision computed (and
        // pre-marked) above so the deferred finish batch uses the SAME all-or-nothing
        // value (skipRedetectRooms must be consistent with the pre-mark).
        void this._finishApartments(runtime, apartmentBuilds, useGraphRooms);

        // §RESI-GROUND-FLOOR — deferred MAIN ENTRANCE door on the ground shell. Like the
        // apartment openings, the shell wall.batch.create is async (the bus READs the
        // committed store), so we host the door once the ground shell walls have landed.
        if (groundLevelId && groundShellPayload) {
            this._buildEntranceDoor(groundLevelId, groundShellPayload, result.groundFloor, xf, groundDoorBay);
        }
        // §RESI-CORE-DOORS — punch the single fire/lobby door per level on the core walls (deferred).
        // §RESI-CORE-REWORK — the second perimeter "lift landing" door is removed; one door per core.
        this._finishCoreDoors(coreDoorSpecs);

        // §RESI-GROUND-COMMERCIAL-CURTAIN — when the ground floor is the SOLID-shell commercial mode
        // (the default), punch the big shopfront windows on the ground shell walls (deferred — the
        // shell wall.batch.create is async via the bus).
        this._finishGroundCommercialWindows(groundCommercialWindowSpecs);

        // §RESI-PUBLIC-FLOOR-FINISH (founder 2026-06-24: "finishes EVERYWHERE — the public/shared
        // floors are bare grey slab") — lay floor finishes over the PUBLIC areas the per-room finish
        // (§RESI-FLOOR-FINISH) never touches: the ground commercial floor, every level's public
        // corridor band(s), and the per-level core lobby. Room-independent (no detection needed), so
        // dispatch directly. Deferred a beat so the structural slabs have settled in the store.
        this._finishPublicFloors(cm, result, levelIdByIndex, xf);

        // §RESI-WALL-CEILING-FINISH (founder 2026-06-24: "Wall Finish + Ceiling Finish are all '—'") —
        // over ALL building levels (ground + residential, so commercial/corridor/core rooms are
        // covered too): (a) CREATE a ceiling in every detected room — the D-CE engine auto-fires only
        // on `apartment.layout-executed`, which the residential pipeline never emits, so ceilings
        // would otherwise never be built — and (b) author a full `room.finishes` set (floor + WALLS +
        // ceiling, each NAMED) on every room so the schedule's Floor / Wall / Ceiling columns ALL
        // populate (the RoomFinishResolver now falls back to room.finishes when no layered element
        // finish exists). Both passes defer internally past the room-detection settle.
        this._ceilRoomsPerLevel(runtime, levelIds);
        this._scheduleRoomFinishes(runtime, levelIds);

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

    /** §RESI-FACADE-INTERIOR-WHITE (founder 2026-06-24: "the exterior wall reads the façade colour
     *  OUTSIDE but WHITE INSIDE — only the exterior face keeps the façade colour") — make each
     *  EXTERIOR shell wall a LAYERED wall so the renderer draws each face its own finish:
     *    [ finish-exterior (façade colour) · structure (default) · finish-interior (WHITE) ]
     *  The WallFragmentBuilder stacks layers across the wall thickness from `-thick/2` toward the
     *  outward normal `(-dir.z, dir.x)` (layer 0 = the −outward / RIGHT-of-direction side). We ORDER
     *  the two finish layers PER WALL using the footprint CENTROID so the façade layer always faces
     *  AWAY from the building (exterior), regardless of the ring winding. `materialColor` is also kept
     *  on the wall record as the schedule/property tint (= the EXTERIOR colour). No-op when no façade
     *  colour is set (a plain default-material wall). `footprint` is the wall ring (WORLD-XZ). */
    private _paintShellWallsTwoFace<T extends { walls: ReadonlyArray<Record<string, unknown>> }>(
        payload: T,
        footprint: ReadonlyArray<{ x: number; z: number }>,
        exteriorColor?: string,
    ): T {
        if (!exteriorColor) return payload;
        const INTERIOR_WHITE = '#f4f1ec';     // matt-emulsion white (matches the room wall finish)
        const ring = this._cleanRing(footprint);
        let cx = 0, cz = 0;
        for (const p of ring) { cx += p.x; cz += p.z; }
        const n = ring.length || 1; cx /= n; cz /= n;   // building centroid (WORLD)
        for (const w of payload.walls) {
            const rec = w as Record<string, unknown>;
            const bl = rec.baseLine as ReadonlyArray<{ x: number; z: number }> | undefined;
            const thickness = typeof rec.thickness === 'number' ? rec.thickness : SHELL_WALL_THICKNESS_M;
            // Keep the whole-wall tint = the EXTERIOR colour (schedule/property panel + any non-layered
            // fallback render path reads this).
            rec.materialColor = exteriorColor;
            if (!bl || bl.length < 2) continue;
            const a = bl[0]!, b = bl[1]!;
            const dx = b.x - a.x, dz = b.z - a.z;
            // outward (the layer-stack axis) = (-dz, dx) = LEFT of a→b; layer 0 sits on the −outward side.
            const outX = -dz, outZ = dx;
            const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
            // Centroid side along +outward: >0 ⇒ centroid is on the +outward (LEFT) side ⇒ the −outward
            // (layer-0) side is EXTERIOR ⇒ layer 0 = façade. <0 ⇒ layer 0 = interior (white).
            const centroidDotOut = (cx - midX) * outX + (cz - midZ) * outZ;
            const ext = { name: 'Façade Finish', function: 'finish-exterior', thickness: 0.02, materialColor: exteriorColor };
            const str = { name: 'Structure', function: 'structure', thickness: Math.max(0.04, thickness - 0.04), materialColor: '#d9d4cc' };
            const intr = { name: 'Paint - Matt Emulsion', function: 'finish-interior', thickness: 0.02, materialColor: INTERIOR_WHITE };
            // Layer 0 is the −outward side. If the centroid is on +outward, −outward is exterior ⇒
            // [exterior, structure, interior]; else [interior, structure, exterior].
            rec.layers = centroidDotOut > 0 ? [ext, str, intr] : [intr, str, ext];
        }
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
        // §RESI-GROUND-WINDOW-EVEN-DIVIDE (founder 2026-06-24 EXACT spec: "cornerMargin reserved at
        // BOTH ends; usable = wallLength − 2·cornerMargin; consistent windowWidth building-wide;
        // spacing = (usable − count·windowWidth)/(count−1); first window at cornerMargin, last ENDS at
        // exactly segLen − cornerMargin → never protrudes past the corner"). The window WIDTH is a
        // building-wide CONSTANT (same on every façade); only the COUNT + the equal inter-window
        // spacing vary per segment. All distances are ALONG the wall's local baseLine axis (the
        // CreateWallOpening `offset` is an along-wall distance), so a ROTATED plot behaves identically
        // to an axis-aligned one — no world X/Z is used here.
        const WIN_PANE_W_M = 1.8;          // CONSTANT glazed-pane width, building-wide (≤ 2 m)
        const WIN_GAP_TARGET_M = 0.7;      // preferred inter-window spacing (sets the per-segment count)
        const WIN_GAP_MIN_M = 0.4;         // a count is only accepted if its spacing clears this floor
        // §RESI-GROUND-WINDOW-CORNER-MARGIN (founder 2026-06-24: "the ground windows are too close to
        // the corners") — reserve a FATTER ~0.9 m solid corner pier at BOTH ends of every windowed
        // segment. At a building corner the two perpendicular walls EACH leave ~0.9 m ⇒ a clean ~1.8 m
        // solid corner. The even-divide is otherwise unchanged (constant 1.8 m width, equal spacing,
        // last window flush to wallLength − cornerMargin); a short segment that can't fit ≥1 window
        // with the bigger margins is left SOLID.
        const WIN_EDGE_MARGIN_M = 0.9;     // CONSTANT corner setback reserved at BOTH ends (the cornerMargin)
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
                // §RESI-GROUND-WINDOW-EVEN-DIVIDE — the founder's EXACT placement (all distances ALONG
                // the wall's local baseLine axis; `len` is the wall length, `offset` is along-wall):
                //   cornerMargin (both ends) → usable = len − 2·cornerMargin
                //   constant windowWidth (building-wide) → pick the count
                //   spacing = (usable − count·windowWidth) / (count − 1)   [equal gaps, count ≥ 2]
                //   first offset = cornerMargin; next = prev + windowWidth + spacing
                //   ⇒ the last window ENDS at exactly len − cornerMargin (never past the corner).
                // Tall: sill 0.01 m → head 3.5 m (clamped under the wall head, ≥0.1 m lintel).
                const head = Math.min(WIN_HEAD_M, groundWallH - 0.1);
                const winH = Math.max(0.6, head - WIN_SILL_M);
                const usable = len - 2 * WIN_EDGE_MARGIN_M;
                // Choose the window COUNT that lands the inter-window spacing nearest the target gap,
                // i.e. count ≈ usable / (windowWidth + targetGap), then clamp so the constant-width
                // windows actually fit (count·windowWidth ≤ usable) and the resulting spacing ≥ the
                // minimum (a too-tight count is reduced; never squeeze a narrow odd pane).
                const fitCount = Math.floor((usable + WIN_GAP_TARGET_M) / (WIN_PANE_W_M + WIN_GAP_TARGET_M));
                let count = fitCount;
                // Ensure the constant-width windows fit the usable run with ≥0 spacing.
                while (count >= 2 && count * WIN_PANE_W_M > usable + 1e-6) count--;
                // With count ≥ 2, enforce the minimum spacing; drop count if the gaps would be too tight.
                while (count >= 2 && (usable - count * WIN_PANE_W_M) / (count - 1) < WIN_GAP_MIN_M) count--;
                if (count >= 2) {
                    // EXACT even-divide: equal cornerMargin both ends, equal spacing between windows,
                    // first at cornerMargin, last ending at len − cornerMargin.
                    const spacing = (usable - count * WIN_PANE_W_M) / (count - 1);
                    let cursor = WIN_EDGE_MARGIN_M;
                    for (let k = 0; k < count; k++) {
                        // Clamp [offset, offset+width] ⊆ [cornerMargin, len − cornerMargin] (belt-and-braces;
                        // the math already lands inside — this guards FP drift so nothing overruns a corner).
                        const offset = Math.min(Math.max(WIN_EDGE_MARGIN_M, cursor), len - WIN_EDGE_MARGIN_M - WIN_PANE_W_M);
                        commercialWindows.push({
                            wallId: id,
                            offset,
                            width: WIN_PANE_W_M,
                            sillHeight: WIN_SILL_M,
                            height: winH,
                            levelId,
                        });
                        cursor += WIN_PANE_W_M + spacing;
                    }
                } else if (usable >= WIN_PANE_W_M) {
                    // Exactly one window fits → CENTRE it (offset = (len − windowWidth)/2).
                    commercialWindows.push({
                        wallId: id,
                        offset: (len - WIN_PANE_W_M) / 2,
                        width: WIN_PANE_W_M,
                        sillHeight: WIN_SILL_M,
                        height: winH,
                        levelId,
                    });
                }
                // else: usable can't fit even ONE full-width window + margins (a short door-bay flanking
                // run) → leave SOLID. Never an odd squeezed pane, never an overflow past the corner.
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
    /** §RESI-ENTRY-INTO-CORRIDOR — resolve the front-door along-edge offset so the door opens into
     *  the apartment's INTERNAL circulation where it meets the corridor-facing cell edge. Mirrors the
     *  pure ai-host `resolveEntryDoorOffset` (kept local so the editor needn't import a new symbol
     *  across the worktree package boundary; the ai-host unit tests pin the same logic). Reads the
     *  engine layout's circulation-room (corridor/hall) footprints (plan-mm polygons) and centres the
     *  door within the widest one touching the edge. Returns null when none reaches the edge ⇒ caller
     *  falls back to a centred door. Pure. */
    private _resolveEntryDoorOffset(
        rooms: ReadonlyArray<{ type?: string; occupancy?: string; polygon?: ReadonlyArray<{ x: number; y: number }> }>,
        doorEdge: 'x0' | 'x1' | 'z0' | 'z1',
        cell: { x0: number; z0: number; x1: number; z1: number },
        doorWidth: number,
        jambM = 0.2,
    ): { offset: number } | null {
        const MM = 1e-3, TOUCH = 0.25;
        const CIRC_T = new Set(['corridor', 'hall', 'entry', 'entry-hall', 'landing']);
        const CIRC_O = new Set(['corridor', 'entrance-lobby', 'hall', 'entry-hall']);
        const isCirc = (rm: { type?: string; occupancy?: string }): boolean =>
            (rm.type !== undefined && CIRC_T.has(rm.type)) || (rm.occupancy !== undefined && CIRC_O.has(rm.occupancy));
        const horizontal = doorEdge === 'z0' || doorEdge === 'z1';
        const wallLo = horizontal ? Math.min(cell.x0, cell.x1) : Math.min(cell.z0, cell.z1);
        const wallHi = horizontal ? Math.max(cell.x0, cell.x1) : Math.max(cell.z0, cell.z1);
        const wallLen = wallHi - wallLo;
        if (!(wallLen > 0) || !(doorWidth > 0) || doorWidth + 2 * jambM > wallLen) return null;
        const edgeCoord = doorEdge === 'z0' ? cell.z0 : doorEdge === 'z1' ? cell.z1 : doorEdge === 'x0' ? cell.x0 : cell.x1;
        let bestLo = NaN, bestHi = NaN, bestSpan = -Infinity;
        for (const rm of rooms) {
            if (!isCirc(rm) || !rm.polygon || rm.polygon.length < 3) continue;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const p of rm.polygon) {
                const x = p.x * MM, z = p.y * MM;
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            const reaches = horizontal
                ? (Math.abs(minZ - edgeCoord) <= TOUCH || Math.abs(maxZ - edgeCoord) <= TOUCH)
                : (Math.abs(minX - edgeCoord) <= TOUCH || Math.abs(maxX - edgeCoord) <= TOUCH);
            if (!reaches) continue;
            const rLo = horizontal ? minX : minZ, rHi = horizontal ? maxX : maxZ;
            const lo = Math.max(rLo, wallLo), hi = Math.min(rHi, wallHi);
            const span = hi - lo;
            if (span > bestSpan && span > 0) { bestSpan = span; bestLo = lo; bestHi = hi; }
        }
        if (!(bestSpan > 0)) return null;
        const spanCentreAlong = (bestLo + bestHi) / 2 - wallLo;
        let offset = spanCentreAlong - doorWidth / 2;
        offset = Math.min(Math.max(jambM, offset), Math.max(jambM, wallLen - jambM - doorWidth));
        return { offset };
    }

    private _buildCellPerimeter(
        levelId: string,
        apt: PlacedApartment,
        wallHeightM: number,
        xf: ResidentialRigidTransform,
    ): {
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        shellWalls: ReadonlyArray<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }>;
        entryDoor: { wallId: string; offset: number; width: number; corridorAligned: boolean };
    } {
        const r = apt.cell.rect;
        // §NONRECT-CELLS-P1 / §RESI-NONRECT-DEFAULT — when the cell was RESHAPED to a non-rectangular
        // footprint (its polygon has > 4 vertices), build the perimeter walls along the POLYGON edges
        // (not the bbox rect) so the unit's walls follow the real drawn boundary. The corridor-fronting
        // (door) edge carries the entry door. DEFAULT-ON to match the partition (which now emits non-rect
        // cells by default); the `__pryzmNonRectCells` flag is an OPT-OUT kill-switch (`=== false` ⇒ the
        // byte-identical 4-edge rect path below). A plain rect cell (≤ 4 verts) always takes the rect path.
        const nonRectCells = (window as unknown as { __pryzmNonRectCells?: boolean }).__pryzmNonRectCells !== false;
        const cellPoly = (apt.cell as { polygon?: ReadonlyArray<{ x: number; z: number }> }).polygon;
        if (nonRectCells && cellPoly && cellPoly.length > 4) {
            return this._buildPolygonCellPerimeter(levelId, apt, wallHeightM, xf, cellPoly);
        }
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
        // §RESI-ENTRY-INTO-CORRIDOR (founder 2026-06-26: "I enter into a BEDROOM") — align the front
        // door to where the apartment's INTERNAL CORRIDOR/HALL meets the corridor-facing edge, so the
        // door opens INTO circulation, not a habitable room. `resolveEntryDoorOffset` reads the engine
        // layout's circulation-room footprints; when none reaches the edge it returns null and we fall
        // back to the centred offset (and the engine-side entry-leg routing is what makes a corridor
        // reach the edge). `aligned` ⇒ the executor must NOT re-centre this door (see _finishOneApartment).
        const aligned = this._resolveEntryDoorOffset(
            (apt.layout?.rooms ?? []) as ReadonlyArray<{ type?: string; occupancy?: string; polygon?: ReadonlyArray<{ x: number; y: number }> }>,
            apt.cell.doorEdge,
            r,
            doorWidth,
        );
        const centredOffset = Math.max(0, (edgeLenM - doorWidth) / 2);
        const entryDoor = {
            wallId: doorWallId ?? shellWalls[0]?.id ?? createId('wall'),
            offset: aligned ? aligned.offset : centredOffset,
            width: doorWidth,
            // When the offset is corridor-aligned, the deferred punch keeps it verbatim (no re-centre).
            corridorAligned: aligned != null,
        };
        return { payload: { walls, levelId }, shellWalls, entryDoor };
    }

    /** §NONRECT-CELLS-P1 — build a RESHAPED (non-rect) cell's perimeter walls along its polygon edges
     *  (LOCAL → world via xf), one wall per edge. The corridor-fronting edge (the one nearest the
     *  cell's `doorEdge` side of its bbox) carries the entry door. Façade edges that coincide with the
     *  building shell are still skipped (the shell hosts them) — an interior/party/door edge is kept.
     *  Mirrors `_buildCellPerimeter`'s contract; used only when the flag is ON + the cell is non-rect. */
    private _buildPolygonCellPerimeter(
        levelId: string,
        apt: PlacedApartment,
        wallHeightM: number,
        xf: ResidentialRigidTransform,
        poly: ReadonlyArray<{ x: number; z: number }>,
    ): {
        payload: { walls: ReadonlyArray<Record<string, unknown>>; levelId: string };
        shellWalls: ReadonlyArray<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }>;
        entryDoor: { wallId: string; offset: number; width: number; corridorAligned: boolean };
    } {
        const r = apt.cell.rect;
        const walls: Array<Record<string, unknown>> = [];
        const shellWalls: Array<{ id: string; start: { x: number; z: number }; end: { x: number; z: number } }> = [];
        // The door-edge constant coordinate of the cell bbox (the corridor-facing side).
        const doorConst = apt.cell.doorEdge === 'z0' ? r.z0 : apt.cell.doorEdge === 'z1' ? r.z1
            : apt.cell.doorEdge === 'x0' ? r.x0 : r.x1;
        const doorAxisIsZ = apt.cell.doorEdge === 'z0' || apt.cell.doorEdge === 'z1';
        let doorWallId: string | undefined, doorEdgeLenM = 0;
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            if (len < 0.05) continue;
            const wa = this._rotate({ x: a.x, z: a.z }, xf);
            const wb = this._rotate({ x: b.x, z: b.z }, xf);
            const id = createId('wall');
            walls.push({
                id, levelId,
                baseLine: [{ x: wa.x, y: 0, z: wa.z }, { x: wb.x, y: 0, z: wb.z }],
                height: wallHeightM, thickness: CELL_WALL_THICKNESS_M,
            });
            shellWalls.push({ id, start: { x: wa.x, z: wa.z }, end: { x: wb.x, z: wb.z } });
            // The door edge is the polygon edge lying ON the cell's corridor-facing side: both endpoints
            // share the door-axis constant coordinate (within tol) and the edge runs along the other axis.
            const onDoorSide = doorAxisIsZ
                ? (Math.abs(a.z - doorConst) < 0.1 && Math.abs(b.z - doorConst) < 0.1)
                : (Math.abs(a.x - doorConst) < 0.1 && Math.abs(b.x - doorConst) < 0.1);
            if (onDoorSide && len > doorEdgeLenM) { doorWallId = id; doorEdgeLenM = len; }
        }
        const edgeLenM = doorEdgeLenM > 0 ? doorEdgeLenM : (doorAxisIsZ ? r.x1 - r.x0 : r.z1 - r.z0);
        const doorWidth = Math.min(0.9, Math.max(0.7, edgeLenM - 0.4));
        const aligned = this._resolveEntryDoorOffset(
            (apt.layout?.rooms ?? []) as ReadonlyArray<{ type?: string; occupancy?: string; polygon?: ReadonlyArray<{ x: number; y: number }> }>,
            apt.cell.doorEdge, r, doorWidth,
        );
        const entryDoor = {
            wallId: doorWallId ?? shellWalls[0]?.id ?? createId('wall'),
            offset: aligned ? aligned.offset : Math.max(0, (edgeLenM - doorWidth) / 2),
            width: doorWidth,
            corridorAligned: aligned != null,
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
    /** §RESI-CORE-REWORK — the lift cab's LOCAL x within the core (RIGHT half, behind the shared
     *  lobby band; mirrors `_createCore`). Single source of truth for the lift mesh's shaft x.
     *  Pure → unit-testable. (The former lift "landing door" that this also fed has been removed:
     *  the core has ONE perimeter fire door; the lift is reached from the lobby.) */
    private static _liftLocalCx(core: { x0: number; x1: number }): number {
        return core.x0 + (core.x1 - core.x0) * 0.75;
    }

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
        // Returns the minted wall id (undefined if the edge degenerated and was skipped).
        const seg = (a: { x: number; z: number }, b: { x: number; z: number }, door: boolean): string | undefined => {
            const wa = this._rotate(a, xf);
            const wb = this._rotate(b, xf);
            if (Math.hypot(wb.x - wa.x, wb.z - wa.z) < 0.05) return undefined;
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
            return id;
        };
        const c0 = { x: core.x0, z: core.z0 };
        const c1 = { x: core.x1, z: core.z0 };
        const c2 = { x: core.x1, z: core.z1 };
        const c3 = { x: core.x0, z: core.z1 };
        // §RESI-CORE-CIRCULATION R-CORE-7 (2026-06-24) — ONE fire door, on the z0 LOBBY edge only.
        // The stair sets back from z0 (its run climbs +Z toward z1), so a z1 door would open against
        // the BACK of the stair run (the blocked "wall in front" the founder reported). z0 is the
        // lobby/approach side the corridor connects to → the single sound access door goes there.
        // §RESI-CORE-REWORK — this is the core's ONLY pedestrian door; the lift is reached from the
        // lobby this door opens into (no second perimeter landing door).
        seg(c0, c1, true);    // z0 edge — the single fire/lobby door (stair run-in + lift, corridor side).
        seg(c1, c2, false);   // x1 edge — solid RC.
        seg(c2, c3, false);   // z1 edge — SOLID (backs the top of the stair run; no door).
        seg(c3, c0, false);   // x0 edge — solid RC.
        return { payload: { walls, levelId }, doors };
    }

    /** §RESI-DOOR-CENTRE-ALL (founder 2026-06-24: "center ALL resi doors") — the single, shared
     *  door-centring rule for EVERY door the executor punches (entrance bay, CORE fire/lobby door,
     *  apartment corridor entry). Reads the host wall's ACTUAL length from its committed `baseLine`
     *  in the store (NOT a pre-computed length, which can go stale / mismatch the rotated-frame
     *  geometry) and centres the leaf on it: `offset = (storedLen − width)/2`, clamped so the frame
     *  stays inside an equal jamb at each end. The `offset` is a distance ALONG the wall's local
     *  baseLine axis, so a ROTATED plot behaves identically. Asserts the result is centred. Falls
     *  back to `fallbackLen` if the store read misses. Returns the centred along-wall offset. */
    private _centredDoorOffset(wallId: string, width: number, fallbackLen: number, tag: string, jambM = 0.2): number {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const w = wallStore?.getById?.(wallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
        let storedLen = fallbackLen;
        const bl = w?.baseLine;
        if (bl && bl.length >= 2) {
            const a = bl[0]!, b = bl[1]!;
            const l = Math.hypot(b.x - a.x, b.z - a.z);
            if (Number.isFinite(l) && l > 0.05) storedLen = l;
        }
        let offset = Math.max(0, (storedLen - width) / 2);
        // Clamp [offset, offset+width] ⊆ [jamb, storedLen − jamb] (belt-and-braces vs FP drift).
        offset = Math.min(Math.max(jambM, offset), Math.max(0, storedLen - jambM - width));
        const centreErr = Math.abs(offset - (storedLen - width) / 2);
        if (centreErr > 0.02) {
            console.warn(`[resi-building] §RESI-DOOR-CENTRE-ALL ⚠ ${tag} door not centred (offset=${offset.toFixed(2)} expected=${((storedLen - width) / 2).toFixed(2)} len=${storedLen.toFixed(2)})`);
        }
        return offset;
    }

    /** Read a committed wall's ACTUAL length (m) from its `baseLine` in the store, or `null` when
     *  the wall hasn't landed / has no usable baseLine. The stored wall is MITRED (corner-trimmed)
     *  so it can be a few cm shorter than the generation-time edge length — which is exactly why a
     *  pre-computed opening offset/width can overrun it. Shared read for §RESI-OPENING-IN-WALL. */
    private _storedWallLengthM(wallId: string): number | null {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        if (!wallStore?.getById) return null;   // no store read available → caller keeps its value
        const w = wallStore.getById(wallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
        const bl = w?.baseLine;
        if (!bl || bl.length < 2) return null;
        const a = bl[0]!, b = bl[1]!;
        const l = Math.hypot(b.x - a.x, b.z - a.z);
        return Number.isFinite(l) && l > 0.05 ? l : null;
    }

    /** §RESI-OPENING-IN-WALL (founder 2026-06-26: "1 element failed — Opening [15.827, 16.727] >
     *  16.665") — the emit-stage clamp for a WINDOW opening, mirroring `_centredDoorOffset`'s
     *  stored-length read for doors. The executor computes window offsets/widths against the
     *  GENERATION-time edge length, but the committed wall is MITRED (shorter), so a window at
     *  `len − margin − width` overruns the now-shorter stored wall and the occupancy validator
     *  REJECTS it (the "1 element failed"). This reads the wall's ACTUAL stored length and clamps
     *  the span into [0, storedLen] (shrinking an over-wide width, pulling the offset in) via the
     *  pure `clampOpeningToWall`. Returns the clamped {offset,width}, or `null` to DROP the opening
     *  when even a minimal one can't fit. When the wall length can't be read (store miss / not yet
     *  landed) the input is kept verbatim (the punch is gated on the wall having landed anyway). */
    private _clampWindowToStoredWall(
        wallId: string, offset: number, width: number, tag: string,
    ): { offset: number; width: number } | null {
        const storedLen = this._storedWallLengthM(wallId);
        if (storedLen === null) return { offset, width };   // can't read → keep verbatim
        const res = clampOpeningToWall(offset, width, storedLen);
        if (res === null) {
            console.warn(`[resi-building] §RESI-OPENING-IN-WALL ⚠ ${tag} window dropped — wall ${wallId.slice(0, 8)} len=${storedLen.toFixed(3)}m too short for a minimal opening (req off=${offset.toFixed(3)} w=${width.toFixed(3)}).`);
            return null;
        }
        if (res.clamped) {
            console.warn(`[resi-building] §RESI-OPENING-IN-WALL ${tag} window clamped to stored wall ${wallId.slice(0, 8)} (len=${storedLen.toFixed(3)}m): off ${offset.toFixed(3)}→${res.offset.toFixed(3)} w ${width.toFixed(3)}→${res.width.toFixed(3)} — never emitted past the wall end.`);
        }
        return { offset: res.offset, width: res.width };
    }

    /** §RESI-OPENING-IN-WALL — pull a corridor-ALIGNED door offset into bounds on its STORED (mitred)
     *  host wall WITHOUT re-centring (the alignment puts the door where the internal corridor meets
     *  the edge — re-centring would break §RESI-ENTRY-INTO-CORRIDOR). The verbatim offset is computed
     *  against the generation-time edge length, so on a mitred (shorter) cell wall the door's far edge
     *  can poke past the wall end and the occupancy validator REJECTS it (the apartment then ships a
     *  SEALED box — no way in). This keeps the leaf WIDTH (a door must not shrink) and only pulls the
     *  offset into [jamb, storedLen − jamb − width]; if the leaf can't fit even minimally it returns
     *  `null` so the caller falls back to the centred offset. Store miss → keep the offset verbatim. */
    private _clampDoorOffsetToStoredWall(
        wallId: string, offset: number, width: number, jambM = 0.2,
    ): number | null {
        const storedLen = this._storedWallLengthM(wallId);
        if (storedLen === null) return offset;   // can't read → keep verbatim (punch is gated on landing)
        const maxOff = storedLen - jambM - width;
        if (maxOff < jambM - 1e-6) return null;  // wall too short to host the leaf with jambs → centred fallback
        const clamped = Math.min(Math.max(offset, jambM), maxOff);
        if (Math.abs(clamped - offset) > 1e-4) {
            console.warn(`[resi-building] §RESI-OPENING-IN-WALL apt-entry door offset clamped to stored wall ${wallId.slice(0, 8)} (len=${storedLen.toFixed(3)}m): ${offset.toFixed(3)}→${clamped.toFixed(3)} — corridor-aligned but pulled in-bounds (never past the wall end).`);
        }
        return clamped;
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
            if (!ready() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
            try {
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(specs.map(s => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'door',
                            // §RESI-DOOR-CENTRE-ALL — re-centre on the STORED core wall length at punch
                            // time (the pre-computed s.offset was (len−w)/2 ⇒ fallback len = 2·offset+w).
                            offset: this._centredDoorOffset(s.wallId, s.width, 2 * s.offset + s.width, 'core'),
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
                deferWork(() => {
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
            if (!ready() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
            try {
                // §RESI-OPENING-IN-WALL — clamp each window to its STORED (mitred) host-wall length
                // BEFORE emit, so a pane computed at the generation-time edge length never overruns
                // the now-shorter committed wall (the "1 element failed — Opening […] > […]"). A
                // pane that can't fit even minimally on the stored wall is DROPPED (not emitted OOB).
                const items = specs
                    .map(s => {
                        const c = this._clampWindowToStoredWall(s.wallId, s.offset, s.width, 'ground-commercial');
                        return c ? { s, offset: c.offset, width: c.width } : null;
                    })
                    .filter((it): it is { s: typeof specs[number]; offset: number; width: number } => it !== null);
                if (items.length === 0) { console.warn('[resi-building] ground commercial windows — all dropped (no host wall could fit a pane)'); return; }
                batchCoordinator.runBatch(() => {
                    cm.execute?.(new CreateWallOpeningsBatchCommand(items.map(({ s, offset, width }) => ({
                        wallId: s.wallId,
                        openingData: {
                            id: createId('opening'),
                            type: 'window',
                            windowType: 'single',
                            offset,
                            width,
                            height: s.height,
                            sillHeight: s.sillHeight,
                            elementId: createId('window'),
                            // Clear commercial glazing (timber/alu casement default) so the
                            // shopfront reads as real see-through glass-in-frame.
                            systemTypeId: 'wt-timber-casement',
                        },
                    }))));
                }, { levelIds, totalElementCount: items.length, skipRedetectRooms: true });
                deferWork(() => {
                    try { window.__wallRebuildControl?.rebuildWalls?.(wallIds); }
                    catch (e) { console.warn('[resi-building] ground-window rebuildWalls failed (non-fatal):', e); }
                }, 250);
                console.log(`[resi-building] ground commercial windows — ${items.length}/${specs.length} punched on ${levelIds.length} level(s)`);
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

    /** §RESI-EXTERIOR-WALL-MITER-FIX2 (founder 2026-06-24: the generated build STILL shows square-cap
     *  corner seams; manually creating any element on a level then mitres ALL that level's corners) —
     *  run the corner-join / MITRE pass on the committed shell / perimeter / core walls. Consecutive
     *  perimeter edges already SHARE the exact corner endpoint by construction, so the only thing
     *  missing is RUNNING the resolver: `__wallRebuildControl.rebuildWalls(ids)` re-queues each wall
     *  as an `update` (no prevState) → `WallRebuildCoordinator._flush` → `WallJoinResolver.resolveLevel`
     *  per level — the EXACT path a manual window create exercises.
     *
     *  ROOT CAUSE the v1 call didn't land (investigation): a `wall.batch.create` opens the
     *  §BATCH-BUS-DISCARD window (`__wallRebuildControl.discardAndSuppress`), which DROPS wall-rebuild
     *  signals for the whole batch drain. The v1 fire-on-a-fixed-timeout raced that window and was
     *  silently discarded (a manual edit works only BECAUSE it happens later, with no discard window).
     *  Fix: (1) wait for every host wall to land in the store, then (2) fire INSIDE
     *  `batchCoordinator.onNextSettle` BUT deferred one macrotask (`deferWork(…, 0)`) so it runs AFTER the
     *  batch's onComplete has called `__wallRebuildControl.restore()` (which closes the discard window
     *  — the settle listeners fire a few lines BEFORE restore in the SAME onComplete, so a macrotask
     *  hop clears it). (3) Re-fire a couple more times on a short delay so any LATER deferred batch
     *  (openings / finishes) that re-opens then closes the discard window can't leave the corners
     *  square. Each rebuildWalls deliberately ignores discard/pause and runs the whole-level resolve. */
    private _mitreShellCorners(
        payloads: ReadonlyArray<{ walls: ReadonlyArray<Record<string, unknown>>; levelId: string }>,
    ): void {
        const ids: string[] = [];
        for (const p of payloads) for (const w of p.walls) {
            const id = (w as { id?: unknown }).id;
            if (typeof id === 'string' && id.length > 0) ids.push(id);
        }
        if (ids.length === 0) return;
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as { getById?: (id: string) => unknown } | undefined;
        const ready = (): boolean => !wallStore?.getById ? true : ids.every(id => wallStore.getById!(id) != null);

        // Fire ONE whole-level resolve over all ids, AFTER the current batch's discard window has
        // closed. `onNextSettle` fires once the batch is settled; the `deferWork(…, 0)` then hops past
        // the rest of that synchronous onComplete (incl. `restore()`), so the rebuild is no longer
        // dropped. A small retry chain re-applies after any later openings/finish batch settles too.
        const fireAfterSettle = (retriesLeft: number): void => {
            batchCoordinator.onNextSettle(() => {
                deferWork(() => {
                    try {
                        window.__wallRebuildControl?.rebuildWalls?.(ids);
                        console.log(`[resi-building] §RESI-EXTERIOR-WALL-MITER-FIX2 — corner-join pass on ${ids.length} wall(s) (post-settle, discard window closed)`);
                    } catch (e) { console.warn('[resi-building] §RESI-EXTERIOR-WALL-MITER-FIX2 rebuildWalls failed (non-fatal):', e); }
                    // Re-fire later so a subsequent deferred batch (openings/finishes) that re-squares
                    // via its own discard cycle gets re-mitred. Each pass is idempotent (resolveLevel
                    // on already-mitred walls is a no-op-equivalent re-resolve).
                    if (retriesLeft > 0) deferWork(() => fireAfterSettle(retriesLeft - 1), 1500);
                }, 0);
            });
        };

        // Budget scales with wall count (large buildings dispatch more async creates), floored at 40
        // ticks (~6 s, small builds byte-identical) and capped at 60 (~9 s) so it can't hang the UI.
        const budget = Math.min(60, Math.max(40, Math.ceil(ids.length / 8)));
        const tryMitre = (n: number): void => {
            if (!ready() && n > 0) { deferWork(() => tryMitre(n - 1), 150); return; }
            // Walls have landed (or the budget ran out) → schedule the settle-gated, post-restore
            // resolve, with 3 re-fires to outlast the openings + finish + entrance/window batches.
            fireAfterSettle(3);
        };
        tryMitre(budget);
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

    /** §RESI-CORE-PENTHOUSE-CAP (founder 2026-06-24: "the rooftop core room has no roof — it's
     *  open-topped"). When the core enclosure is extended onto the ROOF level (the stair/lift
     *  overrun headhouse), its top is open. This caps it with a small flat roof over the CORE
     *  footprint (NOT the building footprint) on the roof level, sitting on the core wall heads.
     *  Mirrors `_createRoof`'s flat-slab geometry: a flat slab extrudes DOWN from its origin, so
     *  `baseOffset = thickness` lifts the slab so its bottom rests on the core wall head. Default
     *  material (NOT the façade colour). `core` is the LOCAL `{x0,x1,z0,z1}` rect, rotated to world
     *  by `xf` (the same transform the core walls used). Guards a degenerate/missing core rect. */
    private _createCoreRoofCap(
        cm: CommandManagerLike,
        core: { x0: number; x1: number; z0: number; z1: number },
        roofLevelId: string,
        wallHeightM: number,
        xf: ResidentialRigidTransform,
    ): void {
        try {
            const w = Math.abs(core.x1 - core.x0), d = Math.abs(core.z1 - core.z0);
            if (!(w > 0.2) || !(d > 0.2)) return;   // degenerate core rect — nothing to cap
            // The four LOCAL core corners → world (same rotation the core walls used).
            const corners = [
                this._rotate({ x: core.x0, z: core.z0 }, xf),
                this._rotate({ x: core.x1, z: core.z0 }, xf),
                this._rotate({ x: core.x1, z: core.z1 }, xf),
                this._rotate({ x: core.x0, z: core.z1 }, xf),
            ];
            const poly = this._cleanRing(corners);
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
                // The roof LEVEL datum is the top-storey wall head; the core OVERRUN walls rise one
                // floor (wallHeightM) above it. A flat slab extrudes DOWN from its origin (=
                // roofLevel.elevation + baseOffset), so baseOffset = wallHeightM + THICK lifts the
                // cap so its BOTTOM rests exactly on the core overrun wall heads, capping the room.
                baseOffset: wallHeightM + THICK,
                thickness: THICK,
                autoBaseOffset: false,
                // Default material — the penthouse cap is NOT the façade colour.
            }), { source: 'RESI_PIPELINE_CORE_ROOF_CAP' });
        } catch (e) { console.warn('[resi-building] core roof-cap create failed (skipped):', e); }
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

        // §RESI-ROOF-AMENITY-DECK (founder 2026-06-24) — the deck is a LUXURY AMENITY TERRACE laid out
        // in non-overlapping ZONES within the footprint, clear of the core penthouse, all ON the slab.
        // Deterministic (no RNG; index-varied). Real placeable FurnitureType values only (audited).
        // Helpers:
        //  • deck rectangle (WORLD-AABB) → split into 4 quadrants around the core; each amenity zone
        //    takes a quadrant the core does NOT occupy, so zones never overlap each other or the core;
        //  • POOL has no asset → built from floor finishes (coping + water-blue surface), P2-safe;
        //  • UMBRELLA has no asset AND CreateSlabCommand forces y=0 (can't float a canopy) → omitted,
        //    reported as a follow-up rather than built as a broken flat-on-deck slab.
        const fxs = ring.map(p => p.x), fzs = ring.map(p => p.z);
        const minX = Math.min(...fxs), maxX = Math.max(...fxs);
        const minZ = Math.min(...fzs), maxZ = Math.max(...fzs);
        const deckCx = (minX + maxX) / 2, deckCz = (minZ + maxZ) / 2;
        const MARGIN = 1.4;                       // keep amenities off the parapet/guard
        // A free-rectangle test: the candidate zone centre must be on the deck, clear of the core,
        // and clear of the parapet margin (a conservative point test at the zone centre + corners).
        const onDeckClear = (x: number, z: number, halfW: number, halfL: number): boolean => {
            if (x - halfW < minX + MARGIN || x + halfW > maxX - MARGIN) return false;
            if (z - halfL < minZ + MARGIN || z + halfL > maxZ - MARGIN) return false;
            // Reject if the zone AABB intersects the (padded) core AABB.
            if (x + halfW > coreMinX && x - halfW < coreMaxX && z + halfL > coreMinZ && z - halfL < coreMaxZ) return false;
            return true;
        };
        // The four quadrant centres (offset from deck centre toward each corner), ranked so the LARGEST
        // open quadrant (farthest from the core) hosts the pool. Deterministic order.
        const quadOffX = (maxX - minX) / 4, quadOffZ = (maxZ - minZ) / 4;
        const quadrants = [
            { x: deckCx - quadOffX, z: deckCz - quadOffZ },
            { x: deckCx + quadOffX, z: deckCz - quadOffZ },
            { x: deckCx + quadOffX, z: deckCz + quadOffZ },
            { x: deckCx - quadOffX, z: deckCz + quadOffZ },
        ].map(q => ({ ...q, coreDist: Math.hypot(q.x - coreCx, q.z - coreCz) }))
            .sort((a, b) => b.coreDist - a.coreDist);   // farthest-from-core first

        // A thin coloured floor FINISH over a polygon on the roof level (CreateFloorCommand — P2-safe,
        // honours finishColor + a baseOffset to stack layers; the green deck, the pool coping + water).
        const rectPoly = (cx: number, cz: number, hw: number, hl: number): Array<{ x: number; z: number }> => [
            { x: cx - hw, z: cz - hl }, { x: cx + hw, z: cz - hl }, { x: cx + hw, z: cz + hl }, { x: cx - hw, z: cz + hl },
        ];
        const layRoofFinish = (poly: ReadonlyArray<{ x: number; z: number }>, color: string, name: string, baseOff: number): void => {
            if (poly.length < 3) return;
            try {
                cm.execute?.(new CreateFloorCommand({
                    floorId: createId('floor'), ifcGuid: createId('floor'),
                    polygon: poly.map(p => ({ x: p.x, z: p.z })),
                    levelId: roofLevelId, label: name,
                    baseOffset: baseOff,                 // stack each layer just above the one below
                    finishSpec: { finishColor: color, finishPattern: 'none', materialName: name, exposedScreed: false },
                }), { source: 'RESI_PIPELINE_ROOF_AMENITY' });
            } catch (e) { console.warn('[resi-building] roof finish skipped:', name, e); }
        };

        // ── GREEN DECK — a grass-green garden FINISH over the whole roof footprint, so the terrace
        // reads as a planted amenity deck, not bare slab. Seated on the deck top; the pool/coping
        // stack just above it, so the water reads on top of the lawn.
        layRoofFinish(ring, '#6f9e4a', 'Roof Garden Lawn', ROOF_DECK_THICKNESS_M);
        placed++;

        // ── A. POOL — a recessed water basin built from floor finishes (no pool asset exists). A light
        // COPING rectangle (stone surround) with a water-blue WATER rectangle inset on top. ~4×8 m, in
        // the largest open quadrant. Floor finishes are P2-safe (CreateFloorCommand, no raw THREE).
        const poolHalfW = 2.0, poolHalfL = 4.0;     // 4 × 8 m basin
        const poolQuad = quadrants.find(q => onDeckClear(q.x, q.z, poolHalfW + 0.6, poolHalfL + 0.6)) ?? quadrants[0]!;
        const poolCx = poolQuad.x, poolCz = poolQuad.z;
        if (onDeckClear(poolCx, poolCz, poolHalfW + 0.6, poolHalfL + 0.6)) {
            // Coping (stone surround) slightly larger, stacked just ABOVE the green lawn; water inset
            // just above the coping (small baseOffset steps avoid Z-fighting the lawn beneath).
            layRoofFinish(rectPoly(poolCx, poolCz, poolHalfW + 0.5, poolHalfL + 0.5), '#cfd3d6', 'Pool Coping (Stone)', ROOF_DECK_THICKNESS_M + 0.02);
            layRoofFinish(rectPoly(poolCx, poolCz, poolHalfW, poolHalfL), '#3fa3d6', 'Pool Water', ROOF_DECK_THICKNESS_M + 0.04);
            placed++;
            // ── B. SUNBATHING — a row of sun-loungers (closest real asset: lounge_chair, sized low/wide
            // as a sunbed) along the long side of the pool, facing the water. Deterministic stagger.
            // (No umbrella/parasol asset exists, and CreateSlabCommand forces y=0 so a slab mast+canopy
            // can't float — a literal umbrella is reported as a follow-up rather than built broken.)
            const sideX = poolCx + (poolCx <= deckCx ? -(poolHalfW + 1.4) : (poolHalfW + 1.4));
            const faceY = poolCx <= deckCx ? Math.PI / 2 : -Math.PI / 2;   // face toward the pool
            for (let k = 0; k < 3; k++) {
                const lz = poolCz - poolHalfL * 0.6 + k * (poolHalfL * 0.6);
                if (onDeckClear(sideX, lz, 0.5, 1.0)) place('lounge_chair', sideX, lz, 0.8, 2.0, 0.5, 'fabric', faceY);
            }
        }

        // ── C. BAR — a counter (kitchen_island, the closest counter asset) + 3 stools (chair), in the
        // next open quadrant. Stools line the counter front facing the deck.
        const barQuad = quadrants.find(q => q !== poolQuad && onDeckClear(q.x, q.z, 1.6, 1.2)) ?? quadrants[1]!;
        if (onDeckClear(barQuad.x, barQuad.z, 1.6, 1.2)) {
            place('kitchen_island', barQuad.x, barQuad.z, 2.4, 0.8, 1.05, 'wood', 0);
            for (let k = 0; k < 3; k++) place('chair', barQuad.x - 0.8 + k * 0.8, barQuad.z + 0.9, 0.45, 0.45, 1.0, 'metal', Math.PI);
            placed++;
        }

        // ── D. DINING — an outdoor table + 4 chairs cluster, in the next open quadrant.
        const dineQuad = quadrants.find(q => q !== poolQuad && q !== barQuad && onDeckClear(q.x, q.z, 1.4, 1.4)) ?? quadrants[2]!;
        if (onDeckClear(dineQuad.x, dineQuad.z, 1.4, 1.4)) {
            place('dining_table', dineQuad.x, dineQuad.z, 1.6, 0.9, 0.75, 'wood', 0);
            const dc: Array<[number, number, number]> = [[-1.0, 0, Math.PI / 2], [1.0, 0, -Math.PI / 2], [0, -0.8, 0], [0, 0.8, Math.PI]];
            for (const [dx2, dz2, ry] of dc) place('dining_chair', dineQuad.x + dx2, dineQuad.z + dz2, 0.45, 0.5, 0.9, 'wood', ry);
            placed++;
        }

        // ── E. LOUNGE — a sofa + 2 armchairs around a coffee table, in the last open quadrant.
        const loungeQuad = quadrants.find(q => q !== poolQuad && q !== barQuad && q !== dineQuad && onDeckClear(q.x, q.z, 1.6, 1.6)) ?? quadrants[3]!;
        if (onDeckClear(loungeQuad.x, loungeQuad.z, 1.6, 1.6)) {
            place('coffee_table', loungeQuad.x, loungeQuad.z, 1.0, 0.6, 0.4, 'wood', 0);
            place('sofa_2seat', loungeQuad.x, loungeQuad.z - 1.1, 1.8, 0.8, 0.8, 'fabric', 0);
            place('armchair', loungeQuad.x - 1.2, loungeQuad.z + 0.3, 0.8, 0.8, 0.8, 'fabric', Math.PI / 2);
            place('armchair', loungeQuad.x + 1.2, loungeQuad.z + 0.3, 0.8, 0.8, 0.8, 'fabric', -Math.PI / 2);
            placed++;
        }

        // ── F. GARDEN / TREES — a few realistic hi-fi trees (shortest species) as deck focal points,
        // pulled well inside the parapet so the crown clears the guard. Founder explicitly wants TREES
        // this round; the engine sizes them from the species table (height arg ignored), so we use the
        // SHORTEST species (arbol_t_15 ≈ 6 m, arbol_t_02/_19 ≈ 7 m) and place only a few, in corners
        // away from the seating zones. Trees are NOT height-capped by `place`'s clamp (the engine
        // controls their height), so they are emitted via a dedicated tree call below.
        const TREE_SPECIES: FurnitureType[] = ['arbol_t_15', 'arbol_t_19', 'arbol_t_02'];
        const treeInset = 3.2;                  // well inside the parapet so the crown clears the guard
        const treeSpots = [
            { x: minX + treeInset, z: minZ + treeInset },
            { x: maxX - treeInset, z: minZ + treeInset },
            { x: maxX - treeInset, z: maxZ - treeInset },
            { x: minX + treeInset, z: maxZ - treeInset },
        ];
        let tk = 0;
        for (const s of treeSpots) {
            if (!onDeckClear(s.x, s.z, 1.0, 1.0)) continue;
            // A tree near a furnished quadrant centre would clash → only place where the local area is open.
            const nearZone = [poolQuad, barQuad, dineQuad, loungeQuad].some(q => Math.hypot(q.x - s.x, q.z - s.z) < 3.0);
            if (nearZone) continue;
            this._roofTree(cm, TREE_SPECIES[tk % TREE_SPECIES.length]!, s.x, s.z, roofLevelId);
            tk++;
            if (tk >= 2) break;                 // keep it tidy — max 2 trees so the deck doesn't read as a forest
        }
        placed += tk;

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

        console.log(`[resi-building] §RESI-ROOF-AMENITY-DECK terrace — ${placed} zone(s)/item(s): pool + sunbathing + bar + dining + lounge + garden (deterministic)`);
    }

    /** §RESI-ROOF-AMENITY-DECK — emit ONE hi-fi (cross-billboard) tree on the roof deck. Separate from
     *  `place` because the parametric tree engine sizes the tree from the species table (the `height`
     *  arg is ignored), so the ROOF_AMENITY_MAX_H clamp must NOT apply — we instead pick a SHORT
     *  species upstream. `position.y` is forced to the roof level elevation in execute(); baseOffset =
     *  deck thickness seats the trunk on the slab top. */
    private _roofTree(
        cm: CommandManagerLike,
        species: FurnitureType,
        x: number, z: number,
        roofLevelId: string,
    ): void {
        try {
            cm.execute?.(new CreateFurnitureCommand({
                id: createId('furniture'),
                furnitureType: species,
                position: { x, y: 0, z },
                rotation: { x: 0, y: 0, z: 0 },
                levelId: roofLevelId,
                baseOffset: ROOF_DECK_THICKNESS_M,
                width: 3.0, length: 3.0, height: 6.0,   // engine uses the species table; these are hints
                material: 'wood',
            }), { source: 'RESI_PIPELINE_ROOF_AMENITY' });
        } catch (e) { console.warn('[resi-building] roof tree skipped:', e); }
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
        // §RESI-GROUND-HEIGHT-4500 — per-level storey height + cascaded elevation. Default to a
        // uniform `floorToFloorM` stack (byte-identical to the pre-cascade behaviour) when omitted.
        ftfAt: (index: number) => number = () => floorToFloorM,
        elevationAt: (index: number) => number = (i) => baseElevationM + i * floorToFloorM,
    ): { stairs: number; lifts: number } {
        const core = result.core;   // LOCAL (principal-axis) frame.
        const coreW = core.x1 - core.x0;
        const coreD = core.z1 - core.z0;
        const cz0 = core.z0;
        // §RESI-GROUND-HEIGHT-4500 — the stair must FIT the TALLEST storey it serves (the 4.5 m
        // ground), so the switchback depth/width re-fit + riser-count is sized against the MAX ftf;
        // each flight then uses its own from-level rise. The lift cab height per segment also varies.
        let maxFtf = floorToFloorM;
        for (let idx = 0; idx <= result.levels.length; idx++) maxFtf = Math.max(maxFtf, ftfAt(idx));
        // §RESI-RIGID-TRANSFORM — the stair RUN is along LOCAL +Z; rotate the run direction
        // to the WORLD parcel so the stair aligns with the rotated core (θ=0 ⇒ {x:0,z:1}).
        const runDir = this._rotateDir({ x: 0, z: 1 }, xf);

        // §RESI-GROUND-HEIGHT-4500 — size the SWITCHBACK FOOTPRINT against the TALLEST storey it
        // serves (`maxFtf`, i.e. the 4.5 m ground), so the depth-fit reserves enough run for the
        // worst-case rise; a shorter storey simply uses fewer risers in the SAME footprint. Risers
        // sized to that gap, clamped to the architectural band.
        let totalRisers = Math.max(2, Math.round(maxFtf / STAIR_RISER_TARGET_M));
        let riserHeight = maxFtf / totalRisers;
        while (riserHeight > STAIR_RISER_MAX_M && totalRisers < 40) { totalRisers++; riserHeight = maxFtf / totalRisers; }
        while (riserHeight < STAIR_RISER_MIN_M && totalRisers > 2) { totalRisers--; riserHeight = maxFtf / totalRisers; }

        // §RESI-CORE-CIRCULATION (R-CORE-2/6, founder 2026-06-24) — a shared LOBBY band at the core's
        // z0 (corridor) edge that the fire door opens into; BOTH the stair and the lift are set BACK
        // behind it so neither blocks the approach. Stair = LEFT half, lift = RIGHT half.
        // §RESI-LIFT-LANDING-DOORS — single source of truth for the lift's LOCAL x so the landing
        // door (hosted on the z0 wall) lands centred on the SAME shaft the cab uses.
        const liftCx = ResidentialBuildingExecutor._liftLocalCx(core);
        const shaftWidth = Math.min(2.0, Math.max(1.6, coreW / 2 - 0.2));

        // §RESI-CORE-STAIR-FIT (founder 2026-06-24: "the stair flight STILL extends PAST the core wall
        // into the adjacent room") — HARD-GUARANTEE the ENTIRE U-stair footprint (BOTH half-flights +
        // the half-turn landing, in BOTH axes) lives INSIDE the core walls' inner rect minus a margin.
        // The earlier strict-width + reduce-risers pass was NOT enough: the half-turn LANDING was
        // 2·stairWidth deep (a half-turn landing only needs ~stairWidth) AND the depth check ignored
        // the landing entirely, so the run-direction footprint (flight-1 run + landing) overflowed the
        // ~4 m core. The RC core wall is CENTRED on the rect edge (thickness SHELL_WALL_THICKNESS_M),
        // so the inner faces inset by SHELL_WALL_THICKNESS_M/2; we keep a further clearance all round.
        const STAIR_CORE_CLEARANCE_M = 0.1;
        const innerHalfT = SHELL_WALL_THICKNESS_M / 2;
        // The core INNER rect (LOCAL), the absolute keep-inside box for the whole stair body.
        const innerX0 = core.x0 + innerHalfT + STAIR_CORE_CLEARANCE_M;
        const innerX1 = core.x1 - innerHalfT - STAIR_CORE_CLEARANCE_M;
        const innerZ0 = cz0 + innerHalfT + STAIR_CORE_CLEARANCE_M;
        const innerZ1 = core.z1 - innerHalfT - STAIR_CORE_CLEARANCE_M;
        const xInnerDepth = Math.max(0, innerX1 - innerX0);
        const zInnerDepth = Math.max(0, innerZ1 - innerZ0);

        // §RESI-STAIR-GUARD-CONTAIN-FIX2 (founder 2026-06-25: the L-shaped baluster guard pokes
        // THROUGH the white core wall) — the L is the stair's OWN left+right flight balustrade
        // (CreateStairCommand.proposeRailings hardcodes BOTH sides, following flight1 → landing →
        // flight2 = the L/U the founder sees); the resi caller cannot disable a side. Its baluster line
        // sits at the flight EDGE (centreline ± width/2) and extends OUTWARD by ~balusterWidth/2. So
        // the LEFT flight (run-2) rail, whose left edge was anchored at innerX0 (only 0.1 m off the RC
        // wall inner face), pokes its balusters into the wall. FIX: reserve a dedicated RAIL CLEARANCE
        // so the stair's leftmost flight edge sits a clean gap off the wall — the left rail then stands
        // inside the void with visible air to the wall. Folded into the lateral fit + the start anchor.
        const STAIR_RAIL_CLEAR_M = 0.18;   // ≥ baluster half-width + a visible air gap to the RC wall
        // ── LATERAL (x) fit. A U-stair is TWO flights side-by-side ⇒ lateral footprint = 2·stairWidth,
        // PLUS the left rail clearance off the wall. It must fit the band from the LEFT inner face
        // (+ rail clear) to the lift's left edge (clear of the lift too).
        const xBandLeft = innerX0 + STAIR_RAIL_CLEAR_M;     // left flight edge sits here, off the wall
        const xBandRight = Math.min(innerX1, (liftCx - shaftWidth / 2) - STAIR_CORE_CLEARANCE_M);
        const xBand = Math.max(0, xBandRight - xBandLeft);
        // CLAMP the lateral footprint `2·stairWidth` to fit INSIDE the cleared band by construction:
        // stairWidth ≤ min(xBand, xInnerDepth − rail clear)/2. The width MUST also be ≥ the command
        // MIN_WIDTH (0.9 m) or `canExecute` BLOCKS (§RESI-CORE-STAIR-ALWAYS) — a contained 0.9 m stair
        // still beats a clashing one, so the 0.9 floor wins on a sub-1.8 m core (tiny single-axis
        // overhang; the through-wall rail clash is gone).
        const STAIR_MIN_WIDTH_M = 0.9;   // == STAIR_CONSTRAINTS.MIN_WIDTH (command rejects below this)
        const xContain = Math.min(xBand, xInnerDepth - STAIR_RAIL_CLEAR_M) / 2;
        const stairWidth = Math.max(STAIR_MIN_WIDTH_M, Math.min(STAIR_WIDTH_M, xContain));
        // Run-1 centre x: anchor the footprint's leftmost edge (= run-2's left edge = stairCenterX −
        // 1.5·w) at the CLEARED band's left (innerX0 + rail clear), so the LEFT flight balustrade
        // stands STAIR_RAIL_CLEAR_M off the core RC wall inner face (no through-wall balusters).
        const stairCenterX = xBandLeft + 1.5 * stairWidth;

        // ── DEPTH (z) fit. §RESI-STAIR-LANDING-RECONNECT — with the HOUSE half-turn contract, the U
        // body's RUN-direction (z) footprint is just `flight1Run + ONE tread` (flight 2 starts one
        // tread past flight 1 and runs BACK within flight 1's z-band; the `2·width` landing span is
        // LATERAL/cross-run, budgeted in the x-fit above as `2·stairWidth ≤ xBand`). So the depth
        // budget reserves `flight1Run + tread`, NOT `flight1Run + 2·width` — the old over-reservation
        // made the body look far deeper than it is and fed the detached-landing math.
        const beforeOf = (n: number): number => Math.ceil(n / 2);
        const stairRunDepth = (n: number): number => beforeOf(n) * STAIR_TREAD_M + STAIR_TREAD_M;
        // §RESI-GROUND-HEIGHT-4500 / §RESI-CORE-STAIR-ALWAYS — re-fit the switchback to the TALLEST
        // rise (the 4.5 m ground): drop risers (raising riser height) until the run depth fits the
        // inner depth — BUT the riser height is NEVER allowed above the command MAX (0.19), or
        // `canExecute` BLOCKS and the stair is silently never created. The depth-fit stops BEFORE the
        // next drop would exceed 0.19; a residual overflow is CONTAINED (not warned-and-overhung)
        // below by seating the body flush to z0 and clamping the lateral width — §RESI-STAIR-GUARD-CONTAIN.
        {
            let guard = 60;
            while (guard-- > 0) {
                if (stairRunDepth(totalRisers) <= zInnerDepth || totalRisers <= 3) break;
                if (maxFtf / (totalRisers - 1) > STAIR_RISER_MAX_M) break;
                totalRisers--;
                riserHeight = maxFtf / totalRisers;
            }
        }
        const preferredRisersInFootprint = totalRisers;
        const beforeRisers = beforeOf(totalRisers);
        const flight1Run = beforeRisers * STAIR_TREAD_M;
        // The landing depth PASSED to the command is the house value 2·width (the mesh's CROSS-RUN
        // span, set inline at the CreateStair call); the RUN-direction footprint is `flight1Run + tread`.
        const stairDepth = flight1Run + STAIR_TREAD_M;     // the U body's RUN-direction (z) depth
        // §RESI-STAIR-GUARD-CONTAIN / §RESI-CORE-REWORK — seat the stair so a proper 1.2 m approach
        // run sits in front of its first riser (to step ON) AND the whole body stays inside the inner
        // rect. The core is now sized (deriveCoreSizing) so the inner depth holds APPROACH_CLEAR_M
        // (1.2 m) lobby + the stair body, so we TARGET that 1.2 m approach as the lobby depth (capped
        // by the real slack so the body never overruns z1). On a tight legacy core the slack may be
        // <1.2 m; then the lobby shrinks (down to 0) keeping the body seated as far from z1 as
        // possible — the per-flight loop caps risers at 0.19 and the width-fit contains the lateral
        // landing, so the only unavoidable case is a 4.5 m rise in a sub-minimum core.
        const slackZ = Math.max(0, zInnerDepth - stairDepth);
        const lobbyDepth = Math.min(slackZ, RESI_APPROACH_CLEAR_M);
        const stairStartZ = innerZ0 + lobbyDepth;
        // Containment check (now on the TRUE run depth). 2·stairWidth ≤ xInnerDepth holds by the x-fit
        // (stairWidth ≤ xBand/2 ≤ xInnerDepth/2). Warn only if the rise genuinely cannot fit the depth.
        // §RESI-STAIR-GUARD-CONTAIN-FIX2 — the body occupies [xBandLeft, xBandLeft + 2·w] laterally
        // (left edge inset by the rail clearance), so containment is `xBandLeft + 2·w ≤ innerX1`.
        const widthFits = xBandLeft + 2 * stairWidth <= innerX1 + 1e-6;
        const depthFits = stairStartZ + stairDepth <= innerZ1 + 1e-6;
        if (!widthFits || !depthFits) {
            console.warn(
                `[resi-building] §RESI-STAIR-GUARD-CONTAIN ⚠ core too small to fully contain the stair+rail ` +
                `(coreD=${coreD.toFixed(2)} runDepth=${stairDepth.toFixed(2)}/${(innerZ1 - stairStartZ).toFixed(2)} ` +
                `rightEdge=${(xBandLeft + 2 * stairWidth).toFixed(2)}/${innerX1.toFixed(2)}) — geometry seated flush to the left wall + z0.`,
            );
        }
        // Lift sits BEHIND the lobby line, in the RIGHT half. Its depth fits the remaining inner depth.
        const shaftDepth = Math.min(2.4, Math.max(1.2, Math.min(zInnerDepth, coreD - lobbyDepth - 0.2)));
        const liftCz = innerZ0 + lobbyDepth + shaftDepth / 2;   // lift FRONT (door) on the lobby line

        // §RESI-ROOF-GARDEN — the top INDEX the circulation reaches. Normally the top apartment
        // floor (levels.length − 1); when the roof deck is ON, the roof level (registered at index
        // levels.length in `levelIdByIndex`) so the stair adds a final top→roof flight + the lift a
        // roof cab. Off-by-one here puts the roof flight one storey wrong (spike risk E2).
        const topIndex = roofGarden ? result.levels.length : result.levels.length - 1;
        let stairs = 0;
        // §RESI-CORE-STAIR-ALWAYS — count the EXPECTED inter-level pairs so we can assert below that a
        // stair was created for EVERY one (regression guard: a missing stair = a silent canExecute block).
        let expectedStairPairs = 0;
        // A stair between each adjacent level pair (ground→1, 1→2, …).
        for (let idx = 0; idx < topIndex; idx++) {
            const fromLevelId = levelIdByIndex.get(idx);
            const toLevelId = levelIdByIndex.get(idx + 1);
            if (!fromLevelId || !toLevelId) continue;
            expectedStairPairs++;
            // §RESI-GROUND-HEIGHT-4500 — this flight's rise = the gap between the two CASCADED floor
            // elevations (the GROUND→1 flight spans the tall 4.5 m; uppers span ftf).
            const startY = elevationAt(idx);
            const flightRise = elevationAt(idx + 1) - startY;
            // §RESI-CORE-STAIR-ALWAYS — derive THIS flight's riser count so the riser height is ALWAYS
            // inside the command's valid band [0.15, 0.19] (else CreateStairCommand BLOCKS → missing
            // stair). The MINIMUM count to keep riser ≤ 0.19 is ceil(rise / 0.19); the MAXIMUM to keep
            // riser ≥ 0.15 is floor(rise / 0.15). Start from the footprint's preferred count, then
            // clamp into [minForMax, maxForMin] so the riser is valid by construction.
            // ceil(rise/0.19) ≤ count ≤ floor(rise/0.15) ⇒ rise/count ∈ [0.15, 0.19] EXACTLY (so the
            // stair tops out at the real level gap AND the riser is command-valid). Prefer the
            // footprint's count, clamped into that valid window; the window is always non-empty for any
            // real storey rise (e.g. 4.5 m ⇒ 24..30 risers; 3.0 m ⇒ 16..20).
            const minRisersForMaxHeight = Math.max(2, Math.ceil(flightRise / STAIR_RISER_MAX_M));
            const maxRisersForMinHeight = Math.max(minRisersForMaxHeight, Math.floor(flightRise / STAIR_RISER_MIN_M));
            // Target-derived count, but prefer the footprint's count when that is ALSO valid (keeps the
            // body as contained as the depth allows); then clamp into the command-valid window so the
            // riser height is in [0.15, 0.19] by construction — VALIDITY wins over containment.
            let fRisers = Math.round(flightRise / STAIR_RISER_TARGET_M);
            if (preferredRisersInFootprint >= minRisersForMaxHeight && preferredRisersInFootprint <= maxRisersForMinHeight) {
                fRisers = Math.min(fRisers, preferredRisersInFootprint);   // prefer the contained count
            }
            if (fRisers < minRisersForMaxHeight) fRisers = minRisersForMaxHeight;
            if (fRisers > maxRisersForMinHeight) fRisers = maxRisersForMinHeight;
            // The riser height is in [0.15, 0.19] by construction; total = fRisers·fRiserH = flightRise.
            const fRiserH = flightRise / fRisers;
            const fBefore = Math.ceil(fRisers / 2);
            const fAfter = fRisers - fBefore;
            const fFlight1Run = fBefore * STAIR_TREAD_M;
            // §RESI-CORE-STAIR-FIT — the stair seats at `stairStartZ` (z0 inner face + any lobby
            // slack); run 1 is centred at `stairCenterX` (anchored at the left inner face) so the
            // whole U body sits inside the core inner rect on BOTH axes (asserted above). Stair runs
            // +Z (flight 1 = the LONGER half), folds across a square half-turn landing, and flight 2
            // runs BACK within flight 1's Z band — so no flight/landing crosses any core wall. (fBefore
            // ≤ beforeRisers ≤ the footprint-fitted max, so this flight's run ≤ flight1Run ⇒ fits.)
            const startLocal = this._rotate({ x: stairCenterX, z: stairStartZ }, xf);
            const startPosition = { x: startLocal.x, y: startY, z: startLocal.z };
            const dir = { x: runDir.x, y: 0, z: runDir.z };
            const reverseDir = { x: -runDir.x, y: 0, z: -runDir.z };
            const perpDir = { x: -runDir.z, y: 0, z: runDir.x };
            // §RESI-STAIR-LANDING-RECONNECT (founder 2026-06-24: "the landing/second flight floats,
            // detached") — match the HOUSE U-stair contract EXACTLY (HouseLayoutExecutor:2792-2796 +
            // StairMeshBuilder:487-539): flight 2 starts ONE TREAD past flight 1's end (NOT past the
            // whole landing), offset one stair-width across (perpDir), up the flight-1 rise. The mesh
            // builder draws the half-turn LANDING from `landings[0].depth` as the CROSS-RUN (perpDir)
            // span (= 2·width), so flight 2 sits flush against flight 1 + the landing — connected, not
            // an orphaned box ~2·width-tread beyond it.
            const secondStart = {
                x: startPosition.x + dir.x * (fFlight1Run + STAIR_TREAD_M) + perpDir.x * stairWidth,
                y: startPosition.y + fBefore * fRiserH,
                z: startPosition.z + dir.z * (fFlight1Run + STAIR_TREAD_M) + perpDir.z * stairWidth,
            };
            try {
                // §RESI-CORE-STAIR-ALWAYS — capture the result: `CreateStairCommand.canExecute` returns
                // `{ success: false }` (it does NOT throw) when a blocking constraint trips (riser >0.19,
                // width <0.9, tread <0.25, …) → the stair is silently not created. The geometry above is
                // now built so every constraint passes; we still HARD-CHECK the result and log loudly so
                // any residual reject surfaces instead of vanishing.
                const res = cm.execute?.(new CreateStairCommand({
                    id: createId('stair'),
                    baseLevelId: fromLevelId,
                    topLevelId: toLevelId,
                    shape: 'U',
                    riserHeight: fRiserH,
                    treadDepth: STAIR_TREAD_M,
                    width: stairWidth,
                    startPosition,
                    flights: [
                        { direction: dir, riserCount: fBefore },
                        { direction: reverseDir, riserCount: fAfter, startOverride: secondStart },
                    ],
                    // §RESI-STAIR-LANDING-RECONNECT — the mesh builder consumes landing.depth as the
                    // CROSS-RUN (perpDir) span of the half-turn landing = 2·width (the house value), so
                    // the landing bridges flight 1 ↔ flight 2 (which sit one tread + one width apart).
                    landings: [{ depth: 2 * stairWidth }],
                    // §RESI-STAIR-LANDING-RECONNECT — flight 2 is offset to the LEFT of flight 1 (perpDir
                    // = +outward-left), matching the geometry we built; the house passes this and the
                    // resi omitted it (also fixes the rotated-parcel landing-side bug).
                    secondRunSide: 'left',
                    accessibilityType: 'standard',
                }), { source: 'RESI_PIPELINE_STAIR' });
                if (res && res.success === false) {
                    console.error(
                        `[resi-building] §RESI-CORE-STAIR-ALWAYS ⚠ stair ${idx}→${idx + 1} REJECTED by CreateStairCommand ` +
                        `(rise=${flightRise.toFixed(2)} risers=${fRisers} riserH=${fRiserH.toFixed(3)} width=${stairWidth.toFixed(2)} tread=${STAIR_TREAD_M}) — ` +
                        `reason=${(res.info ?? []).join('; ') || 'unknown'}`,
                    );
                    continue;   // not created → don't count it or record a void for a non-existent stair
                }
                stairs++;
                // §RESI-STAIR-VOID-IN-FINISH (2026-06-24) — CreateStairCommand auto-punched the SLAB
                // void from `computeStairFootprintRect(input)`; recompute the SAME world-XZ rect from
                // the SAME inputs and record it on the void's HOST = the UPPER level (`toLevelId`), so
                // the floor finish + core-lobby finish on that level CUT the open stairwell instead of
                // re-tiling over it. Best-effort — a footprint miss must never break the stair.
                try {
                    const vr = computeStairFootprintRect({
                        shape: 'U',
                        width: stairWidth,
                        treadDepth: STAIR_TREAD_M,
                        startPosition,
                        flights: [
                            { direction: dir, riserCount: fBefore },
                            { direction: reverseDir, riserCount: fAfter, startOverride: secondStart },
                        ],
                        // §RESI-STAIR-LANDING-RECONNECT — SAME landing depth (2·width) the stair command
                        // got, so the recorded void footprint matches the real stair body exactly.
                        landings: [{ depth: 2 * stairWidth }],
                    });
                    if (vr && vr.length >= 3) {
                        recordStairVoid(toLevelId, vr);
                        // §RESI-STAIR-QUALITY-MATCH-HOUSE (2026-06-24) — guard the OPEN stairwell void
                        // on the UPPER floor with a 3-edge baluster handrail (the 4th, step-off edge —
                        // the one the final flight tops out toward — stays OPEN for access), exactly
                        // like HouseLayoutExecutor._createVoidGuardrail. Without this the core stair's
                        // open hole had no rail (the founder's "bad handrail"). 1.050 m, baluster fill.
                        // §RESI-STAIR-GUARD-CONTAIN — rail ONLY the lobby (z0) edge, corners clamped
                        // inside the core inner rect so no rail clashes the RC wall or the flight rails.
                        // lobbyDir = reverseDir (points toward the z0 fire door = the open step-off side).
                        this._createStairVoidGuard(
                            cm, vr, toLevelId, reverseDir,
                            { x0: innerX0, z0: innerZ0, x1: innerX1, z1: innerZ1 },
                            STAIR_CORE_CLEARANCE_M, xf,
                        );
                    }
                } catch (e) { console.warn('[resi-building] §RESI-STAIR-VOID-IN-FINISH void/guard failed (skipped):', e); }
            } catch (e) { console.warn('[resi-building] stair create failed (skipped):', e); }
        }

        // §RESI-CORE-STAIR-ALWAYS — regression assertion: a stair MUST connect EVERY inter-level pair
        // (ground→1 … top→roof). If this trips, a CreateStairCommand reject slipped through (the exact
        // missing-stair bug) — log loudly so it's caught in dev/console instead of shipping a building
        // with no stair. The geometry above guarantees command-valid inputs, so this should hold.
        if (stairs !== expectedStairPairs) {
            console.error(
                `[resi-building] §RESI-CORE-STAIR-ALWAYS ✗ REGRESSION: created ${stairs}/${expectedStairPairs} inter-level stair(s) ` +
                `(coreW=${coreW.toFixed(2)} coreD=${coreD.toFixed(2)} maxFtf=${maxFtf.toFixed(2)} stairWidth=${stairWidth.toFixed(2)}) — a core stair is MISSING.`,
            );
        } else {
            console.log(`[resi-building] §RESI-CORE-STAIR-ALWAYS ✓ ${stairs}/${expectedStairPairs} inter-level stairs created.`);
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
                    // §RESI-GROUND-HEIGHT-4500 — cab base at the CASCADED floor elevation (so the
                    // ground cab is the tall 4.5 m one); the cab span = next−this elevation.
                    origin: { x: liftOrigin.x, y: elevationAt(idx), z: liftOrigin.z },
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

    /** §RESI-STAIR-GUARD-CONTAIN (founder 2026-06-24: "doubled verticals on the right" = void guard ON
     *  TOP of the stair's own flight rails + ON the core RC wall) — the core is FULLY ENCLOSED by RC
     *  perimeter walls on all 4 sides (the z0 edge has the fire door), and `CreateStairCommand` ALREADY
     *  emits BOTH left+right flight rails (proposeRailings). So the void only needs ONE fall-rail: the
     *  edge facing the LOBBY (the z0 / fire-door side you step off into), where there is neither an RC
     *  wall right against it nor a flight rail. Railing the other 3 edges doubled the balusters + clashed
     *  the RC wall. We therefore rail ONLY the lobby-facing edge, with both its corners CLAMPED inside
     *  the core INNER rect (minus clearance) so the rail can never coincide with a core wall.
     *  `voidRect` is WORLD-XZ; `lobbyDir` points from the core toward the z0 fire door (the open side);
     *  `innerLocal` is the core inner rect (LOCAL) + `xf` to test/clamp corners. Best-effort. */
    private _createStairVoidGuard(
        cm: CommandManagerLike,
        voidRect: ReadonlyArray<{ x: number; z: number }>,
        topLevelId: string,
        lobbyDir: { x: number; y?: number; z: number },
        innerLocal: { x0: number; z0: number; x1: number; z1: number },
        clearance: number,
        xf: ResidentialRigidTransform,
    ): void {
        const c = voidRect.slice(0, 4).map(p => ({ x: p.x, z: p.z }));
        if (c.length < 4) return;
        const cx = (c[0]!.x + c[1]!.x + c[2]!.x + c[3]!.x) / 4;
        const cz = (c[0]!.z + c[1]!.z + c[2]!.z + c[3]!.z) / 4;
        const edges: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0]];
        // The LOBBY (open / step-off) edge = the one whose outward midpoint normal best aligns with the
        // direction toward the z0 fire door — that's the only fall edge not bounded by an RC wall.
        const ldLen = Math.hypot(lobbyDir.x, lobbyDir.z) || 1;
        const ldx = lobbyDir.x / ldLen, ldz = lobbyDir.z / ldLen;
        let openIdx = 0, bestDot = -Infinity;
        edges.forEach(([i, j], idx) => {
            const mx = (c[i]!.x + c[j]!.x) / 2, mz = (c[i]!.z + c[j]!.z) / 2;
            const ox = mx - cx, oz = mz - cz;
            const olen = Math.hypot(ox, oz) || 1;
            const dot = (ox / olen) * ldx + (oz / olen) * ldz;
            if (dot > bestDot) { bestDot = dot; openIdx = idx; }
        });
        // Clamp a WORLD corner into the core INNER rect (minus clearance): de-rotate to LOCAL, clamp,
        // re-rotate to WORLD — so the rail never sits on or beyond a core RC wall.
        const inX0 = innerLocal.x0 + clearance, inX1 = innerLocal.x1 - clearance;
        const inZ0 = innerLocal.z0 + clearance, inZ1 = innerLocal.z1 - clearance;
        const clampWorld = (p: { x: number; z: number }): { x: number; z: number } => {
            const l = this._unrotate(p, xf);
            const cl = { x: Math.min(Math.max(l.x, inX0), inX1), z: Math.min(Math.max(l.z, inZ0), inZ1) };
            return this._rotate(cl, xf);
        };
        const [i, j] = edges[openIdx]!;
        const a = clampWorld(c[i]!), b = clampWorld(c[j]!);
        if (Math.hypot(b.x - a.x, b.z - a.z) < 0.1) return;   // degenerate after clamp → skip
        try {
            cm.execute?.(new CreateHandrailCommand({
                id: createId('handrail'),
                start: { x: a.x, z: a.z },
                end: { x: b.x, z: b.z },
                height: STAIR_HANDRAIL_HEIGHT_M,
                thickness: 0.05,
                levelId: topLevelId,
                baseOffset: 0,
                fillType: 'baluster',
                railProfile: 'rectangular',
            }), { source: 'RESI_PIPELINE_STAIR_VOID_GUARD' });
            console.log(`[resi-building] §RESI-STAIR-GUARD-CONTAIN stair-void fall-rail — 1 lobby edge railed on ${topLevelId} (others bounded by RC walls + flight rails)`);
        } catch (e) { console.warn('[resi-building] stair-void guard edge skipped:', e); }
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
    private _finishApartments(runtime: PryzmRuntime, builds: readonly ApartmentBuild[], useGraphRooms: boolean): void {
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
        // §DEFERWORK-RESI-ADOPT — `poll` now holds the deferWork canceller (a fn)
        // rather than a raw timer handle, so the wall-ready poll keeps ticking
        // when the tab is backgrounded instead of crawling under the ≥1 s clamp.
        let poll: (() => void) | undefined;

        // Graph-authoritative rooms (default ON) — when used, this batch skips the
        // room redetect so detection never re-segments the engine's designed rooms.
        // When the flag is OFF (no graph rooms minted), detection RUNS so the
        // apartments still get rooms (mirrors the apartment executor's
        // `skipRedetectRooms: useGraphRooms`). All-or-nothing across this batch.
        // §RESI-DOUBLE-ROOM-TAGS — `useGraphRooms` is now DECIDED ONCE by the caller
        // (`execute`), which ALSO pre-marks the apartment levels graph-authoritative
        // BEFORE the structural batch's async wall commits. We MUST reuse that exact
        // value here so the batch's `skipRedetectRooms` stays consistent with the
        // pre-mark — recomputing it could diverge and re-open the double-room window.

        const go = (): void => {
            if (done) return;
            done = true;
            if (poll) poll();   // §DEFERWORK-RESI-ADOPT — cancel the pending deferWork poll
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
                deferWork(() => {
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
            poll = deferWork(() => tick(n - 1), 150);
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
            deferWork(() => {
                try {
                    if (pc) pc.activeLevelId = lid;
                    // §RESI-CORRIDOR-FINISH-NO-DOUBLE — skip circulation rooms here; the public
                    // corridor is laid as ONE merged-union finish by `_finishPublicFloors` (§FIX2),
                    // so flooring the detected corridor sub-rooms again would seam-patch over it.
                    triggerFloorLayout(runtime, { skipCirculation: true });
                } catch (e) { console.warn('[resi-building] floor-finish failed on', lid, '(non-fatal):', e); }
            }, 500 + i * 250);
        });
    }

    /** §RESI-WALL-CEILING-FINISH (founder 2026-06-24: "WALL FINISH + CEILING FINISH are all '—' —
     *  every room must have a sound, fully-scheduled set of finishes") — author a complete
     *  `room.finishes` (floor + WALLS + ceiling, each with a schedule `materialName`) on EVERY
     *  detected room on every built level. The room schedule (via RoomFinishResolver) now falls back
     *  to `room.finishes.{floor,walls,ceiling}.materialName` when no layered element finish exists, so
     *  setting it here makes the Floor / Wall / Ceiling Finish columns ALL populate. Defaults by
     *  occupancy: WALLS = painted-plaster matt emulsion everywhere ("if it is paint, but paint");
     *  CEILING = painted plasterboard (moisture-resistant in wet rooms); FLOOR keyed to the room kind
     *  (the floor element pass also sets it, this is the schedule-side guarantee). Deferred per level
     *  so the rooms have settled. Best-effort: a miss on one room/level logs + skips. */
    private _scheduleRoomFinishes(_runtime: PryzmRuntime, levelIds: readonly string[]): void {
        const cm = getCommandManager();
        if (!cm?.execute) return;
        // Wet rooms take a moisture-resistant ceiling + a wipeable wall finish; everything else gets
        // the habitable-room defaults. `materialColor` keeps the renderer/IFC happy + the schema valid.
        const WET = new Set(['bathroom', 'kitchen', 'utility-room', 'wc', 'shower-room', 'en-suite']);
        const finishFor = (occ: string): RoomFinishes => {
            const wet = WET.has(occ);
            const wall = wet
                ? { materialName: 'Paint - Wipeable Matt (Wet Area)', materialColor: '#eef0ef' }
                : { materialName: 'Paint - Matt Emulsion', materialColor: '#f2efe9' };
            const ceiling = wet
                ? { materialName: 'Moisture-Resistant Plasterboard, Painted', materialColor: '#f5f6f5' }
                : { materialName: 'Painted Plasterboard', materialColor: '#f5f5f0' };
            const floor =
                occ === 'bathroom' || occ === 'wc' || occ === 'shower-room' || occ === 'en-suite'
                    ? { materialName: 'Porcelain Tile (Wet)', materialColor: '#d8d4cc' }
                    : occ === 'kitchen' || occ === 'utility-room'
                    ? { materialName: 'Porcelain Tile', materialColor: '#d9d2c6' }
                    // §RESI-CORRIDOR-FINISH-NO-DOUBLE — circulation rooms read the SAME finish the
                    // merged public-corridor surface lays (§FIX2 CORRIDOR), so the Floor Finish
                    // schedule column matches what's on the floor (not a default oak it never got).
                    : occ === 'corridor' || occ === 'entrance-lobby'
                    ? { materialName: 'Stone-Effect Vinyl (Corridor)', materialColor: '#c9c2b6' }
                    : occ === 'living-room' || occ === 'dining-room' || occ === 'kitchen'
                    ? { materialName: 'Engineered Oak', materialColor: '#caa472' }
                    : { materialName: 'Engineered Oak', materialColor: '#caa472' };
            return { floor, walls: wall, ceiling };
        };
        const roomStore = storeRegistry.getStoreForType('room') as unknown as
            { getAll?(): Array<{ id: string; levelId: string; occupancyType?: string }> } | undefined;
        const levelSet = new Set(levelIds);
        const readRooms = (): Array<{ id: string; levelId: string; occupancyType?: string }> =>
            (roomStore?.getAll?.() ?? []).filter(r => levelSet.has(r.levelId));
        // POLL for rooms to land before authoring finishes — apartment room detection runs on its own
        // (size-scaled) budget in _finishApartments, so a fixed delay would race a large plate. Wait
        // until the room count STABILISES (or the ~24 s budget runs out), then author once.
        let prevCount = -1, stable = 0;
        const tryFinish = (n: number): void => {
            const rooms = readRooms();
            // Stable for 2 consecutive ticks (detection settled) OR budget exhausted ⇒ go.
            if (rooms.length > 0 && rooms.length === prevCount) stable++; else stable = 0;
            prevCount = rooms.length;
            if (!(stable >= 2 || n <= 0)) { deferWork(() => tryFinish(n - 1), 300); return; }
            if (rooms.length === 0) { console.log('[resi-building] §RESI-WALL-CEILING-FINISH — no rooms to schedule-finish'); return; }
            try {
                let k = 0;
                batchCoordinator.runBatch(() => {
                    for (const r of rooms) {
                        try {
                            cm.execute?.(new UpdateRoomFinishesCommand(r.id, finishFor(r.occupancyType ?? '')), { source: 'RESI_PIPELINE_ROOM_FINISH' });
                            k++;
                        } catch (e) { console.warn('[resi-building] room-finish failed for', r.id, '(non-fatal):', e); }
                    }
                }, { levelIds: [...levelSet], totalElementCount: rooms.length, skipRedetectRooms: true });
                console.log(`[resi-building] §RESI-WALL-CEILING-FINISH — authored finishes (floor+wall+ceiling) on ${k} room(s)`);
            } catch (e) { console.warn('[resi-building] room-finish pass failed (non-fatal):', e); }
        };
        deferWork(() => tryFinish(80), 1400);   // first check after the floor-finish stagger; ~24 s budget
    }

    /** §RESI-WALL-CEILING-FINISH — create a CEILING in every detected room on every level (the D-CE
     *  ceiling engine auto-fires only on `apartment.layout-executed`, which the residential pipeline
     *  does NOT emit, so ceilings would otherwise never be built). Mirrors `_finishFloorsPerLevel`:
     *  set the level active, then fire the shared ceiling trigger per level, staggered so each level's
     *  rooms have settled. Best-effort. */
    private _ceilRoomsPerLevel(runtime: PryzmRuntime, levelIds: readonly string[]): void {
        const pc = (window as unknown as { projectContext?: { activeLevelId?: string | null } }).projectContext;
        const roomStore = storeRegistry.getStoreForType('room') as unknown as
            { getAll?(): Array<{ levelId: string; boundary?: { polygon?: ReadonlyArray<unknown> } }> } | undefined;
        // §RESI-CEILING-INVALID-POLYGON (founder 2026-06-24: "~120 ceilings fail Invalid polygon on
        // reload, frozen project") — a room can EXIST in the store before its boundary polygon has
        // been computed (count > 0 but polygon has 0–2 vertices). Firing the ceiling trigger then
        // builds ceilings over those EMPTY polygons → degenerate ceilings persist into the save →
        // fail `Polygon must have ≥3 vertices` on load. So gate on VALID rooms only: a room counts as
        // ready ONLY when its boundary polygon has ≥3 vertices. We wait until the VALID-room count
        // stabilises before firing, and never fire while any room on the level still lacks a polygon.
        const validRoomsOn = (lid: string): number =>
            (roomStore?.getAll?.() ?? []).filter(r => r.levelId === lid && (r.boundary?.polygon?.length ?? 0) >= 3).length;
        const anyDegenerateOn = (lid: string): boolean =>
            (roomStore?.getAll?.() ?? []).some(r => r.levelId === lid && (r.boundary?.polygon?.length ?? 0) > 0 && (r.boundary?.polygon?.length ?? 0) < 3);
        // Per level, WAIT for that level's VALID room count to stabilise (detection settled + every
        // room has a real polygon) before firing — large plates land rooms on a size-scaled budget.
        levelIds.forEach((lid) => {
            let prev = -1, stable = 0;
            const fire = (n: number): void => {
                const c = validRoomsOn(lid);
                // Stable only when the valid count holds AND no room is still mid-detection (no polygon).
                if (c > 0 && c === prev && !anyDegenerateOn(lid)) stable++; else stable = 0;
                prev = c;
                if (!(stable >= 2 || n <= 0)) { deferWork(() => fire(n - 1), 300); return; }
                if (c === 0) return;   // no VALID rooms on this level (e.g. a bare core-only level) → nothing to ceil
                // Budget exhausted but rooms still degenerate ⇒ DO NOT ceil (a degenerate ceiling would
                // break the save). Better to ship un-ceiled than to freeze the project on reload.
                if (n <= 0 && anyDegenerateOn(lid)) {
                    console.warn('[resi-building] §RESI-CEILING-INVALID-POLYGON — rooms on', lid, 'still lack polygons after the budget; skipping ceilings to avoid a broken save.');
                    return;
                }
                try {
                    if (pc) pc.activeLevelId = lid;
                    triggerCeilingLayout(runtime);
                } catch (e) { console.warn('[resi-building] ceiling pass failed on', lid, '(non-fatal):', e); }
            };
            deferWork(() => fire(80), 900);   // first check after the floor stagger; ~24 s budget per level
        });
    }

    /** §RESI-PUBLIC-FLOOR-FINISH (founder 2026-06-24) — lay a thin applied floor FINISH over the
     *  PUBLIC/shared areas that the per-room finish (§RESI-FLOOR-FINISH, which only finishes detected
     *  apartment ROOMS) never covers, so no public floor ships as bare grey slab:
     *    • GROUND commercial floor — the whole ground footprint (the core area reads commercial; a
     *      separate ground core-lobby is intentionally NOT laid to avoid overlapping/Z-fighting a
     *      second thin finish on the same plate — a simple polygon can't carry a core hole).
     *    • PUBLIC CORRIDOR band(s) on each residential level (the lobby/circulation strip).
     *    • CORE LOBBY on each residential level (the core interior circulation floor).
     *  Distinct tones so each public area reads as finished. `CreateFloorCommand` lays a thin finish
     *  seated on the slab top over an arbitrary polygon on a level — room-independent (no detection),
     *  so we dispatch directly. Deferred a beat so the structural slabs have settled. Degenerate
     *  polygons (< 3 distinct corners or near-zero area) are guarded + skipped. Never throws. */
    private _finishPublicFloors(
        cm: CommandManagerLike,
        result: ResidentialBuildingOk,
        levelIdByIndex: Map<number, string>,
        xf: ResidentialRigidTransform,
    ): void {
        // Distinct public-area finish tones + patterns + schedule names (Notting-Hill-neutral palette)
        // so each public area reads as a FINISHED floor (not raw slab) AND the room schedule's Floor
        // Finish column reads the materialName.
        const COMMERCIAL = { color: '#b8b4ad', pattern: 'tile-600x600' as const, name: 'Porcelain Tile 600×600 (Commercial)' };
        // §RESI-CORRIDOR-FINISH-CONTINUOUS-FIX2 — ONE tone for the whole merged circulation cross
        // (runs + spine + core lobby), so it reads as a single continuous surface, not patches.
        const CORRIDOR = { color: '#c9c2b6', pattern: 'seamless' as const, name: 'Stone-Effect Vinyl (Corridor)' };

        // §RESI-STAIR-VOID-IN-FINISH — build floor service-holes (CW-wound, vs the CCW finish ring)
        // for every recorded stairwell void on `levelId` whose centroid falls inside `worldPoly`, so
        // a direct finish (the core lobby) is CUT around the open stairwell instead of re-covering it.
        // Exactly mirrors CreateFloorsByRoomTypeCommand._serviceHolesForRoom.
        const signedArea = (poly: ReadonlyArray<{ x: number; z: number }>): number => {
            let s = 0;
            for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.z - b.x * a.z; }
            return s * 0.5;
        };
        const polyCentroid = (poly: ReadonlyArray<{ x: number; z: number }>): { x: number; z: number } => {
            let sx = 0, sz = 0; for (const p of poly) { sx += p.x; sz += p.z; } const n = poly.length || 1; return { x: sx / n, z: sz / n };
        };
        const pointInPoly = (pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const a = poly[i]!, b = poly[j]!;
                if (((a.z > pt.z) !== (b.z > pt.z)) && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
            }
            return inside;
        };
        const voidHolesFor = (levelId: string, ring: ReadonlyArray<{ x: number; z: number }>): Array<Record<string, unknown>> => {
            const holes: Array<Record<string, unknown>> = [];
            for (const v of getStairVoidsForLevel(levelId)) {
                if (v.polygon.length < 3) continue;
                if (!pointInPoly(polyCentroid(v.polygon), ring)) continue;
                // Force the void CW (opposite the CCW finish ring) — the canonical hole winding.
                const cw = signedArea(v.polygon) > 0 ? [...v.polygon].reverse() : [...v.polygon];
                holes.push({
                    id: createId('opening'), elementId: createId('opening'),
                    subType: 'floor-hatch', shape: 'polygon',
                    polygon: cw.map(p => ({ x: p.x, z: p.z })), label: 'Stairwell void',
                });
            }
            return holes;
        };

        // Lay ONE thin finish over a WORLD-XZ polygon on a level. Guards degenerate rings + area.
        // §RESI-STAIR-VOID-IN-FINISH — when `cutVoids` is set, the finish is CUT around any recorded
        // stairwell void inside it (the core lobby uses this so the stair hole stays open).
        const layFinish = (levelId: string, worldPoly: ReadonlyArray<{ x: number; z: number }>, finish: { color: string; pattern: FloorPattern; name: string }, label: string, cutVoids = false): boolean => {
            const ring = this._cleanRing(worldPoly);
            if (ring.length < 3) return false;
            // Shoelace area guard — skip a near-zero (sliver) finish.
            let area2 = 0;
            for (let i = 0; i < ring.length; i++) {
                const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
                area2 += a.x * b.z - b.x * a.z;
            }
            if (Math.abs(area2) / 2 < 0.25) return false;   // < 0.25 m² ⇒ not a real floor
            const serviceHoles = cutVoids ? voidHolesFor(levelId, ring) : [];
            try {
                cm.execute?.(new CreateFloorCommand({
                    floorId: createId('floor'),
                    ifcGuid: createId('floor'),
                    polygon: ring.map(p => ({ x: p.x, z: p.z })),
                    levelId,
                    label,
                    // Bare thin applied finish seated on the slab top (default thickness/baseOffset),
                    // tinted + patterned + NAMED so the room schedule's Floor Finish column reads it.
                    finishSpec: { finishColor: finish.color, finishPattern: finish.pattern, materialName: finish.name, exposedScreed: false },
                    // §RESI-STAIR-VOID-IN-FINISH — cut the open stairwell out of the finish.
                    ...(serviceHoles.length > 0 ? { serviceHoles: serviceHoles as never } : {}),
                }), { source: 'RESI_PIPELINE_PUBLIC_FLOOR' });
                return true;
            } catch (e) { console.warn('[resi-building] public floor-finish failed on', levelId, label, '(non-fatal):', e); return false; }
        };

        // Rotate a LOCAL rect's 4 corners → WORLD (same transform the core/corridor walls used).
        const rectToWorld = (r: { x0: number; z0: number; x1: number; z1: number }): Array<{ x: number; z: number }> => [
            this._rotate({ x: r.x0, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z0 }, xf),
            this._rotate({ x: r.x1, z: r.z1 }, xf),
            this._rotate({ x: r.x0, z: r.z1 }, xf),
        ];

        let laid = 0;
        // Defer a beat so the structural slabs (and the bus dispatches) have settled.
        deferWork(() => {
            try {
                batchCoordinator.runBatch(() => {
                    for (let i = 0; i < result.levels.length; i++) {
                        const lvl = result.levels[i]!;
                        const levelId = levelIdByIndex.get(lvl.levelIndex);
                        if (!levelId) continue;
                        if (lvl.levelIndex === 0) {
                            // GROUND commercial floor — the whole (WORLD) footprint.
                            if (layFinish(levelId, lvl.footprint, COMMERCIAL, 'Commercial floor')) laid++;
                        } else {
                            // §RESI-CORRIDOR-FINISH-SHAPE (founder 2026-06-26: "the public-corridor
                            // finish is ONE finish now [good] but its SHAPE is a comb of thin strips —
                            // it should be the CLEAN RESIDUAL: the leftover circulation space = the
                            // shell interior MINUS all apartment cells MINUS the core"). The previous
                            // §FIX2 UNIONED the tightened per-band corridor runs from the parallel-
                            // corridor grid, which renders as parallel strips. Now we compute the
                            // RESIDUAL region directly — interiorPoly − ∪cells − core — which yields the
                            // clean H/cross hugging the apartment walls, the shell, and the core.
                            //
                            // Cells/core are LOCAL (axis-aligned); the level footprint is WORLD, so we
                            // un-rotate it to LOCAL to subtract against, then rotate the residual rings
                            // back to world for the finish. The stairwell void is still cut (cutVoids).
                            const perLevel = result.perLevelApartments[i];
                            const cellRects = (perLevel?.apartments ?? [])
                                .filter(a => a.status === 'ok')
                                .map(a => a.cell.rect);
                            const interiorLocal = this._cleanRing(
                                lvl.footprint.map(p => this._unrotate({ x: p.x, z: p.z }, xf)),
                            );
                            const rings = computeCorridorResidualRings(
                                interiorLocal,
                                cellRects,
                                result.core ? { x0: result.core.x0, z0: result.core.z0, x1: result.core.x1, z1: result.core.z1 } : null,
                            );
                            if (rings.length === 0) {
                                // Degenerate fallback — lay the core lobby alone so the level isn't bare.
                                if (result.core && layFinish(levelId, rectToWorld(result.core), CORRIDOR, 'Corridor floor', true)) laid++;
                            } else {
                                for (const ring of rings) {
                                    if (layFinish(levelId, ring.map(p => this._rotate({ x: p.x, z: p.z }, xf)), CORRIDOR, 'Corridor floor', true)) laid++;
                                }
                            }
                        }
                    }
                }, { levelIds: [...new Set(levelIdByIndex.values())], totalElementCount: result.levels.length, skipRedetectRooms: true });
                console.log(`[resi-building] §RESI-PUBLIC-FLOOR-FINISH — laid ${laid} public floor finish(es)`);
            } catch (e) { console.warn('[resi-building] public floor-finish batch failed (non-fatal):', e); }
        }, 700);   // §DEFERWORK-RESI-ADOPT — background-resilient defer
    }

    /** Create one apartment's doors + windows + boundaries + graph rooms inside the
     *  (already-open) batch. Mirrors the apartment executor's per-level fan-out.
     *  `useGraphRooms` is the batch-wide decision (so a level marked
     *  graph-authoritative is consistent with the batch's skipRedetectRooms). */
    private _finishOneApartment(cm: CommandManagerLike, b: ApartmentBuild, useGraphRooms: boolean): void {
        const set = b.set;
        const levelId = b.levelId;
        // Doors + shell windows → ONE opening batch.
        // §RESI-OPENING-IN-WALL — the SHELL WINDOW openings are placed against the engine's cell
        // geometry, but the committed cell walls are MITRED (shorter) at their corners, so a window
        // at `len − margin − width` can overrun the now-shorter stored wall and be REJECTED ("1
        // element failed — Opening […] > […]"). Clamp each shell-window span to its stored host wall
        // BEFORE emit; a window that can't fit even minimally is dropped (never emitted OOB). Door
        // openings are left verbatim (the engine already seats doors clear of the cell corners, and
        // a clamp could shift a door off its intended hinge side).
        type OpeningItem = { p: { wallId: string; opening: unknown } };
        const shellWindowItems = set.shellWindowOpeningCommands
            .map((op): OpeningItem | null => {
                const p = op.payload as { wallId: string; opening: { offset?: number; width?: number } };
                const off = typeof p.opening.offset === 'number' ? p.opening.offset : NaN;
                const wid = typeof p.opening.width === 'number' ? p.opening.width : NaN;
                if (!Number.isFinite(off) || !Number.isFinite(wid)) return { p };   // unknown shape → keep verbatim
                const c = this._clampWindowToStoredWall(p.wallId, off, wid, 'apt-shell');
                if (c === null) return null;   // can't fit even minimally → drop (never emit OOB)
                return { p: { wallId: p.wallId, opening: { ...p.opening, offset: c.offset, width: c.width } } };
            })
            .filter((it): it is OpeningItem => it !== null);
        const openingItems = [
            ...set.openingCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
            ...shellWindowItems,
        ];
        // §RESI-APT-ENTRY — the apartment FRONT DOOR onto the public corridor, hosted on the
        // cell's corridor-facing perimeter wall. Single-leaf, standard height. Without this the
        // apartment is a sealed box (no way in from the corridor).
        // §RESI-ENTRY-INTO-CORRIDOR — when the offset is corridor-aligned (it targets where the
        // internal corridor meets the edge) keep it VERBATIM so the door opens into circulation;
        // otherwise (no corridor reached the edge) re-centre on the stored wall length (§RESI-DOOR-
        // CENTRE-ALL), the old behaviour.
        // §RESI-OPENING-IN-WALL — a corridor-ALIGNED offset is computed against the generation-time
        // edge length, so on a mitred (shorter) cell wall it can overrun the wall end and the entry
        // door is REJECTED (sealed apartment). Pull it in-bounds WITHOUT re-centring; only when the
        // leaf can't fit at all do we fall back to the centred offset (§RESI-DOOR-CENTRE-ALL).
        const entryOffset = b.entryDoor
            ? (b.entryDoor.corridorAligned
                ? (this._clampDoorOffsetToStoredWall(b.entryDoor.wallId, b.entryDoor.offset, b.entryDoor.width)
                    ?? this._centredDoorOffset(b.entryDoor.wallId, b.entryDoor.width, 2 * b.entryDoor.offset + b.entryDoor.width, 'apt-entry'))
                : this._centredDoorOffset(b.entryDoor.wallId, b.entryDoor.width, 2 * b.entryDoor.offset + b.entryDoor.width, 'apt-entry'))
            : 0;
        const entryItems = b.entryDoor
            ? [{
                wallId: b.entryDoor.wallId,
                opening: {
                    id: createId('opening'),
                    type: 'door',
                    offset: entryOffset,
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
            if (!shellReady() && n > 0) { deferWork(() => tryPunch(n - 1), 150); return; }
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
            // §RESI-DOOR-CENTRE-FIX-2 (founder 2026-06-24: "the entrance door is STILL hard against the
            // LEFT edge of its wall — likely the SAME rotated-plot / wrong-anchor bug as the windows").
            // Read the door host's ACTUAL length from its committed baseLine in the store (NOT the
            // pre-computed `doorBay.wallLengthM`, which could go stale / mismatch). The opening `offset`
            // is a distance ALONG the wall's local baseLine axis, so this works identically on a ROTATED
            // façade — no world X/Z is used. Then centre the door on THAT real length:
            //   usableLength = wallLength − 2·margin ; doorPosition = margin + (usableLength − width)/2
            //   = (wallLength − width)/2 ⇒ equal margins, door frame ⊆ [margin, wallLength − margin].
            const storedLen = ((): number => {
                const w = wallStore?.getById?.(hostWallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
                const bl = w?.baseLine;
                if (bl && bl.length >= 2) {
                    const a = bl[0]!, b = bl[1]!;
                    const l = Math.hypot(b.x - a.x, b.z - a.z);
                    if (Number.isFinite(l) && l > 0.05) return l;
                }
                return hostLenM;   // fallback to the pre-computed bay length if the store read missed
            })();
            const ENTRANCE_MARGIN_M = 0.4;          // equal solid jamb reserved at BOTH wall ends
            // Cap the leaf so it fits inside both margins, floored so a tiny bay still yields a leaf.
            const width = Math.max(0.6, Math.min(gf.entranceWidthM, storedLen - 2 * ENTRANCE_MARGIN_M));
            // §RESI-DOOR-CENTRE-ALL — centre via the shared helper (stored-wall midpoint + assert), the
            // SAME rule every other resi door uses; `storedLen` already read above is the fallback.
            const offset = this._centredDoorOffset(hostWallId, width, storedLen, 'entrance', ENTRANCE_MARGIN_M);
            const hit: EntranceHostHit = { wallId: hostWallId, wallLengthM: storedLen, centerAlongM: storedLen / 2 };
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
                deferWork(() => {
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

    /** §RESI-STAIR-GUARD-CONTAIN — inverse of `_rotate`: WORLD parcel XZ → LOCAL (principal-axis) by
     *  −θ about the pivot, so a world point can be clamped against the LOCAL core inner rect. Pure. */
    private _unrotate(p: { x: number; z: number }, xf: ResidentialRigidTransform): { x: number; z: number } {
        if (!xf.thetaRad) return { x: p.x, z: p.z };
        const c = Math.cos(-xf.thetaRad), s = Math.sin(-xf.thetaRad);
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
