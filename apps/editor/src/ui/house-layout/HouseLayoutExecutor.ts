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

import { batchCoordinator, storeRegistry, viewDefinitionStore } from '@pryzm/core-app-model';
import { createId } from '@pryzm/schemas';
import {
    AddLevelCommand,
    CreateStairCommand,
    CreateSlabCommand,
    CreateRoofCommand,
    CreateWallOpeningsBatchCommand,
    CreateRoomBoundingLinesBatchCommand,
    CreateHandrailCommand,
    UpdateWallHeightCommand,
} from '@pryzm/command-registry';
import { facadeOrientationService } from '@pryzm/spatial-index';
import { computeStairFootprintRect } from '@pryzm/geometry-stair';
import { isGableFriendly, isConvexPolygon, canDecomposeConcave } from '@pryzm/geometry-roof';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    generateHouseLayout,
    generateHouseLayoutOptions,
    analyseShell,
    classifyPerimeter,
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
    type LayoutCommand,
    type LayoutCommandSet,
    type EntranceDoorDispatch,
    buildLayoutCommands,
    resolveEntranceDoor,
    clampDoorToWallSpan,
    isDoorWithinWallSpan,
    wallExtentForLevel,
    weldPartitionsToShell,
    solveStairContainmentWorld,
    type WeldWall,
} from '@pryzm/ai-host';
import { resolveActiveLevel } from '../apartment-layout/activeLevel.js';
import { nameDetectedRooms } from '../apartment-layout/nameDetectedRooms.js';
import { resolveBlindFacades } from '../apartment-layout/resolveBlindFacades.js';
import { runHousePostGenChain } from './runHousePostGenChain.js';
import { resetStairVoids, recordStairVoid } from './houseStairVoids.js';
import { resetStairRects, recordStairRect } from './houseStairRects.js';
import { resetShellWalls, recordShellWalls } from './houseShellWalls.js';
import { reseatEntranceOnHallWall } from './houseEntranceWall.js';

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
const STAIR_HANDRAIL_HEIGHT_M = 1.050;   // §A.21.D26 — matches StairTypes default handrailHeight

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

            // §DIAG-SHAPE (2026-06-08) — classify the plate the generator actually
            // receives (§PERIMETER-CLASS). A CONVEX-RECT takes the clean zoning+squarify
            // path; an elongated CONVEX-POLY (aspect > 3:1) or an L/T-U is exactly where
            // top-down slicing produces tunnels + can't guarantee adjacencies (the merge
            // root) — so this log tells us, per prod test, whether the founder's poor
            // layouts come from a hard plate shape (→ needs the rectangular-dual solver)
            // or a clean plate the engine still mishandles. Pure/read-only; makes the
            // staged classifier live without changing any layout behavior.
            try {
                const pc = classifyPerimeter(shell.perimeter);
                console.log(`[house-layout] §DIAG-SHAPE plate=${pc.class} corners=${pc.corners} reflex=${pc.reflexCorners} aspect=${pc.aspect.toFixed(2)} (area ${shell.netAreaM2.toFixed(1)}m² ${shell.widthM.toFixed(1)}×${shell.depthM.toFixed(1)}m)`);
                if (pc.class !== 'CONVEX-RECT') console.warn(`[house-layout] §DIAG-SHAPE ⚠ non-rectangular plate (${pc.class}) — top-down slicing may tunnel/merge; rectangular-dual solver is the structural cure.`);
            } catch (e) { console.warn('[house-layout] §DIAG-SHAPE failed (non-fatal):', e); }

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

            // ── §ROOF-LEVEL (founder 2026-06-09) — mint a DEDICATED "Roof" level
            // ABOVE the top storey. The roof must NOT render in the top storey's
            // plan view (it currently does, because it's stamped on the top level);
            // moving it to its own level gives it its own "Roof Plan" view and
            // removes it from the first-floor / top-storey plan. The roof level's
            // elevation = the top storey's WALL HEAD = baseElevationM + storeyCount ×
            // floorToFloorM (the exact world Y the roof currently sits at — see
            // _createRoof). Captured here + threaded into _createRoof so the roof,
            // built with baseOffset:0 on this level, keeps its world Y UNCHANGED.
            // Mirrors the storey-level mint (same AddLevelCommand path, same abort).
            let roofLevelId: string | null = null;
            {
                const id = `L-house-${Date.now()}-roof-${Math.random().toString(36).slice(2, 8)}`;
                const elevation = baseElevationM + storeyCount * floorToFloorM;
                let added = false;
                if (cm?.execute) {
                    const res = cm.execute(new AddLevelCommand({ levelId: id, name: 'Roof', elevation, height: floorToFloorM }), { source: 'HOUSE_PIPELINE_ROOF_LEVEL' });
                    added = res?.success ?? false;
                }
                if (!added) {
                    console.warn('[house-layout] AddLevelCommand failed for roof level', id, '— aborting');
                    toast('Could not create the roof level. See console.', 'error');
                    return { ok: false, reason: 'roof level creation failed' };
                }
                roofLevelId = id;
                console.log('[house-layout] §ROOF-LEVEL minted roof level', roofLevelId, '@ elevation', elevation);
            }

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

            // §DIAG-STAIR (2026-06-08) — the founder's recurring "stair conflicts the layout /
            // stair not well located / walls not stretched around it". Log, per stair, its core
            // rect rotated to WORLD vs the SHELL perimeter, so the next prod test shows exactly
            // whether the stair sits INSIDE the footprint (and where) — the precondition for the
            // partitions to bound it. `rectMm` is authored in the rotated LAYOUT frame, so we
            // rotate its centre + corners by principalAxisRad about pivot to world (same transform
            // _createStair uses) before testing containment in the shell polygon. Read-only.
            // §DIAG-EXEC-STAIR support — clear any stair keep-out rects a PREVIOUS
            // build recorded (the §DIAG-STAIR loop below records this build's rects in
            // WORLD XZ so the per-room §DIAG-EXEC-STAIR overlap test can read them back).
            resetStairRects();
            // §DIAG-EXEC-WINDOWS support — clear any shell wall-id set a PREVIOUS build
            // recorded (each storey records its authoritative shell wall ids below so the
            // §DIAG-EXEC-WINDOWS WINDOW-ON-PARTITION test reads shell-vs-partition robustly
            // instead of trusting the façade service, which mis-marked real shell walls).
            resetShellWalls();

            // §DIAG-EXEC-ROTATION (founder 2026-06-10) — the rotation the engine applied
            // to this plate's layout frame (principal axis). On a SKEWED plot the engine
            // rotates the whole layout to the dominant-edge orientation; the stair core
            // carries that `principalAxisRad`. Report it (per the first stair, the uniform
            // plate rotation; 0 for an axis-aligned plate) so the founder's "45° rotated
            // plan" is confirmed as the EXPECTED drawn-boundary principal axis vs an
            // erroneous transform. Read-only.
            try {
                const appliedRad = result.stairs[0]?.principalAxisRad ?? 0;
                const appliedDeg = appliedRad * 180 / Math.PI;
                console.log(`[house-layout] §DIAG-EXEC-ROTATION level=${ground.id} principalAxisDeg=${appliedDeg.toFixed(1)}° (engine layout-frame rotation; 0 ⇒ axis-aligned plate, non-zero ⇒ the drawn-boundary principal axis)`);
            } catch (e) { console.warn('[house-layout] §DIAG-EXEC-ROTATION failed (non-fatal):', e); }

            try {
                const sp = shell.perimeter;
                const sxs = sp.map(p => p.x), szs = sp.map(p => p.z);
                const shellBox = `x[${Math.min(...sxs).toFixed(1)},${Math.max(...sxs).toFixed(1)}] z[${Math.min(...szs).toFixed(1)},${Math.max(...szs).toFixed(1)}]`;
                const inPoly = (pt: { x: number; z: number }, poly: ReadonlyArray<{ x: number; z: number }>): boolean => {
                    let c = false;
                    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                        const a = poly[i]!, b = poly[j]!;
                        if (((a.z > pt.z) !== (b.z > pt.z)) && (pt.x < (b.x - a.x) * (pt.z - a.z) / (b.z - a.z) + a.x)) c = !c;
                    }
                    return c;
                };
                console.log(`[house-layout] §DIAG-STAIR shell perimeter ${shellBox} (${shell.netAreaM2.toFixed(1)}m²); ${result.stairs.length} stair(s)`);
                for (let si = 0; si < result.stairs.length; si++) {
                    const st = result.stairs[si]!;
                    const ax = (st.principalAxisRad ?? 0), piv = st.pivot ?? { x: 0, z: 0 };
                    const x0 = st.rectMm.x / MM_PER_M, z0 = st.rectMm.y / MM_PER_M, w = st.rectMm.w / MM_PER_M, h = st.rectMm.h / MM_PER_M;
                    const cornersLayout = [{ x: x0, z: z0 }, { x: x0 + w, z: z0 }, { x: x0 + w, z: z0 + h }, { x: x0, z: z0 + h }];
                    const cornersWorld = cornersLayout.map(c => this._rotateXZ({ x: c.x, y: 0, z: c.z }, ax, piv));
                    const centreWorld = this._rotateXZ({ x: x0 + w / 2, y: 0, z: z0 + h / 2 }, ax, piv);
                    const cornersIn = cornersWorld.filter(c => inPoly(c, sp)).length;
                    const centreIn = inPoly(centreWorld, sp);
                    // §DIAG-EXEC-STAIR support — record this stair's WORLD-XZ keep-out
                    // AABB on BOTH the level its body sits on (fromLevelId) and the level
                    // whose slab it voids (toLevelId), so the per-room §DIAG-EXEC-STAIR
                    // overlap test (run after detection) can flag any HABITABLE room that
                    // tiled into the stair footprint. Read-only — logging support only.
                    {
                        const cxs = cornersWorld.map(c => c.x), czs = cornersWorld.map(c => c.z);
                        const rect = { minX: Math.min(...cxs), maxX: Math.max(...cxs), minZ: Math.min(...czs), maxZ: Math.max(...czs) };
                        recordStairRect(st.fromLevelId, rect);
                        recordStairRect(st.toLevelId, rect);
                    }
                    console.log(`[house-layout] §DIAG-STAIR #${si} ${st.fromLevelId}→${st.toLevelId} shape=${st.shape ?? 'I'} rect=${w.toFixed(1)}×${h.toFixed(1)}m rot=${(ax * 180 / Math.PI).toFixed(1)}° centreWorld=(${centreWorld.x.toFixed(1)},${centreWorld.z.toFixed(1)}) centreInShell=${centreIn} cornersInShell=${cornersIn}/4`);
                    if (!centreIn || cornersIn < 4) console.warn(`[house-layout] §DIAG-STAIR ⚠ stair #${si} is NOT fully inside the shell (${cornersIn}/4 corners in) — it will conflict the perimeter/partitions.`);
                }
            } catch (e) { console.warn('[house-layout] §DIAG-STAIR failed (non-fatal):', e); }

            // §A.21.D29 #1 — clear any stairwell voids recorded by a PREVIOUS build
            // before this one records its own (so a re-generate never carries a stale
            // void into the floor/ceiling finish passes). Each `_createStair` records
            // its void footprint here; the floor + ceiling passes read it back to cut /
            // skip the finish over the open stairwell. Empty for single-storey / no-
            // stair builds, so the apartment path is unaffected.
            resetStairVoids();

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

            // §A.21.D29 #3 — the GROUND-floor main-entrance door. A generated house
            // (unlike the apartment, where the user hand-places the front door before
            // generating) has no external way in. After we know the ground option +
            // its shell walls, resolve ONE external door on the shell wall bounding
            // the entrance hall (deterministic; pure ai-host decision) and dispatch
            // it in the openings batch below. Captured here so it rides the same
            // wall-store-ready gate the interior openings use.
            let entranceDoor: EntranceDoorDispatch | null = null;

            // Pre-build the per-storey command sets (pure, no mutation yet).
            const perStorey: Array<{ levelId: string; set: LayoutCommandSet; option: ScoredLayoutOption }> = [];
            for (let i = 0; i < result.storeys.length; i++) {
                const storey = result.storeys[i]!;
                const option = result.perStoreyLayout[i];
                if (!option) { console.warn('[house-layout] storey', i, 'produced no layout option — skipping fan-out'); continue; }
                const isGround = i === 0;
                // Ground reuses the existing drawn shell; upper storeys get a freshly
                // minted explicit perimeter (built + dispatched in the batch below).
                const perimeter = isGround
                    ? null
                    : this._buildPerimeterShell(storey, wallHeightM, i, result.storeys.length, DEFAULT_SLAB_THICKNESS_M);
                if (perimeter) perimeterByLevel.set(storey.levelId, perimeter);
                const shellWalls = isGround
                    ? gatherShellWalls(storey.levelId)
                    : (perimeter?.shellWalls ?? []);
                // §DIAG-EXEC-WINDOWS support — record this storey's authoritative shell
                // (perimeter) wall ids so the later §DIAG-EXEC-WINDOWS pass decides
                // shell-vs-partition from the EXECUTOR's own shell set (robust), not the
                // façade service (which mis-marked real shell walls → false positives).
                if (shellWalls.length > 0) recordShellWalls(storey.levelId, shellWalls.map(w => w.id));
                // §DIAG-PARTY-WALL (PW.1, 2026-06-09) — blind/party façades for this
                // storey's shell walls. The engine suppresses windows + the entrance
                // door there. Default ⇒ empty ⇒ byte-identical (neighbour DETECTION is
                // the PW.2 follow-up; see resolveBlindFacades + SPEC-PARTY-WALL-AWARENESS).
                const blindFacadeWallIds = resolveBlindFacades(shellWalls);
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
                    ...(blindFacadeWallIds.size > 0 ? { blindFacadeWallIds } : {}),
                };
                let set = buildLayoutCommands(option, opts, (p: IdPrefix) => createId(p));

                // §DIAG-SEAL-DROP (ADR-0066 editor-seam, 2026-06-10) — capture the PRE-weld
                // interior-partition id set so §DIAG-SEAL (below) can report DIVIDERS the weld
                // DROPPED. ROOT CAUSE of the L-shape "openSeams=0 yet rooms MERGE" puzzle: the
                // weld (`_weldGroundPartitions` → `weldPartitionsToShell`) DROPS any partition it
                // collapses below the 0.05 m floor, and §DIAG-SEAL measures the POST-weld set —
                // so a dropped DIVIDER (the wall that was supposed to separate two rooms) is
                // INVISIBLE to the seal check: every SURVIVING endpoint seals (openSeams=0) yet
                // the two rooms it used to divide now flood together (corridor 68m², a 1.3m²
                // NO-ENGINE-MATCH sliver). This snapshot makes the dropped divider VISIBLE.
                const preWeldPartitionIds = new Set<string>(
                    ((set.wallBatch.payload as { walls?: Array<{ id: string }> }).walls ?? []).map(w => w.id),
                );

                // §GROUND-ENGINE-PERIMETER (A.21.Stage-1, audit 2026-06-09 §5) —
                // unify the GROUND room-closure with the UPPER storeys. The upper
                // storeys "subdivide fine" because their perimeter is ENGINE-AUTHORED
                // (`_buildPerimeterShell` builds the footprint ring with the SAME
                // emitter that produced the partitions → partition endpoints are
                // BIT-EXACT on the ring → rooms close with no weld). The GROUND instead
                // reuses the user's PRE-DRAWN shell (mitred by WallJoinResolver, raised
                // by D38), so its post-miter centrelines can drift > the
                // RoomDetectionEngine's 20 mm node grid from where the engine tiled the
                // partitions → the loop never closes → "ONE merged room" → patched by
                // the §WJ-SKEW-tuned weld (D14/D25/D28/D34/D36).
                //
                // KEY DATA-FLOW FACT (traced 2026-06-09): `storey.footprint` for EVERY
                // storey === `shell.perimeter` (houseOrchestrator.ts:337/561), and
                // `shell.perimeter` === `wallsToPolygon(<drawn shell wall baselines>)`
                // (analyseShell). So the engine footprint ring and the DRAWN ground shell
                // are the SAME ring up to the editor's post-miter drift. The engine
                // emits the GROUND partitions at their footprint-aligned plan coords
                // (buildLayoutPlan toWorld — NOT moved by shellWalls), so on a CLEAN
                // plate (drawn shell still on the footprint ring) the partition endpoints
                // ALREADY land on the drawn shell the detector reads → the weld is a
                // NO-OP (proven by the §GROUND-WELD "exact-on-shell = deterministic
                // no-op" unit test).
                //
                // COINCIDENT-WALL HAZARD (executor comment ~L426): the drawn ground
                // shell ALREADY EXISTS and is the persistent building envelope (drawn by
                // houseFromBoundary, height-raised by §WALL-SLAB-CONTINUITY, hosts the
                // entrance door, read by gatherShellWalls). We must NOT mint a SECOND
                // engine ring on the ground (two coincident exterior rings corrupt room
                // detection — the apartment invariant). So this slice does NOT replace
                // the drawn ring; it keys the SAFE engine-perimeter behaviour off the
                // fact that — when the drawn ring is STILL the footprint ring — the
                // engine partitions are already bit-exact on it.
                //
                // THE SLICE: gate on `_groundShellOnEnginePerimeter` (the drawn shell is
                // a clean, axis-aligned, on-footprint ring). When TRUE, SKIP the weld —
                // the ground now closes rooms exactly the way the upper storeys do
                // (engine-authored endpoints on the engine ring), with NONE of the
                // §WJ-SKEW union-find over-grab / endpoint-misplacement risk the weld
                // carries. When FALSE (rotated / drifted / non-rect plate, where the weld
                // is genuinely load-bearing), FALL BACK to `_weldGroundPartitions` — the
                // weld stays as a flag-gated defensive fallback (NOT deleted) so the
                // change is reversible + zero-regression for the unsafe cases.
                //
                // Flag (default ON; founder can disable to force the legacy weld for ALL
                // ground plates): `window.__pryzmHouseGroundEnginePerimeter === false`.
                if (isGround && shellWalls.length >= 3) {
                    const enginePerimeterEnabled =
                        (window as unknown as { __pryzmHouseGroundEnginePerimeter?: boolean })
                            .__pryzmHouseGroundEnginePerimeter !== false;
                    const onRing = enginePerimeterEnabled
                        && this._groundShellOnEnginePerimeter(shellWalls, shell.perimeter);
                    if (onRing) {
                        // §DIAG — ENGINE-PERIMETER path: ground closes like the upper
                        // storeys; the weld is skipped (would be a no-op here anyway).
                        console.log(
                            '[house-layout] §GROUND-ENGINE-PERIMETER ground took the ENGINE-PERIMETER path '
                            + '(drawn shell is on the footprint ring within tolerance) — '
                            + 'partition endpoints are bit-exact on the perimeter, weld SKIPPED '
                            + '(unified with the upper-storey closure; no §WJ-SKEW risk).',
                        );
                    } else {
                        // §DIAG — WELD-FALLBACK path: the drawn shell drifted off the
                        // footprint ring (rotated / mitred / non-rect plate) so the weld
                        // is load-bearing; run it exactly as before.
                        console.log(
                            '[house-layout] §GROUND-ENGINE-PERIMETER ground took the WELD-FALLBACK path '
                            + `(reason: ${enginePerimeterEnabled ? 'drawn shell NOT on the footprint ring within tolerance' : 'engine-perimeter flag OFF'}) — `
                            + 'welding partitions onto the drawn shell (the defensive §WJ-SKEW path).',
                        );
                        set = this._weldGroundPartitions(set, shellWalls);
                    }
                }

                // ── §UPPER-SHELL-WELD (2026-06-09, THE upper-floor room-merge fix) ──
                // The UPPER storeys were ASSUMED bit-exact on their minted perimeter
                // ("`_buildPerimeterShell` builds the ring with the SAME emitter that
                // produced the partitions"). That holds ONLY on an AXIS-ALIGNED plate.
                // On a ROTATED plate (the founder's ~−44° plate) the engine tiles the
                // interior partitions against the AXIS-ALIGNED BBOX/grid of the
                // principal-axis-rotated shell, then rotates the emitted geometry BACK
                // by +angle. The minted perimeter ring, by contrast, is the orchestrator
                // `storey.footprint` (the world perimeter, NOT round-tripped through the
                // rotate/grid). So the partition endpoints land OFF the perimeter ring by
                // the principal-axis residual (the §WJ-SKEW class) — exactly the drift the
                // GROUND weld was written for, but on the UPPER storeys NOTHING welds them.
                //
                // CONSEQUENCE: the off-perimeter partition endpoint is NOT on any
                // perimeter-wall BODY, so the WallJoinResolver §SHELL-ANCHOR-PRESERVE
                // guard (which only fires for an endpoint sitting on a NON-cluster wall
                // body within snapRadius) CANNOT fire — its `_bodyAnchorOf` returns null.
                // The interior cluster then consensus-trims the endpoint (the
                // §MULTI-CLUSTER `primary=0 pinned=0 trimmed=N` signature), the room
                // never seals, and RoomDetectionEngine floods across the gap → the
                // "Bedroom 2 / Bedroom 1 / Bathroom" merge the founder saw on L1 (the
                // bedrooms are the UPPER program — proof the merge is on L1, not ground).
                //
                // FIX (symmetric with the GROUND): when the footprint is NOT a clean
                // axis-aligned rectangle, WELD the upper partitions onto the minted
                // perimeter (`weldPartitionsToShell` via the SAME `_weldGroundPartitions`
                // reconciler, which also fixes openings/doors/boundaries on dropped
                // partitions). The partition endpoints then land ON the perimeter body,
                // so §SHELL-ANCHOR-PRESERVE preserves them and the rooms seal — exactly
                // the way the ground now closes. On an axis-aligned plate the partitions
                // ARE bit-exact (endpoints coincident at corners → weld is a deterministic
                // no-op), so the common case is byte-identical and the bit-exact path is
                // untouched. Flag (default ON): `window.__pryzmHouseUpperShellWeld === false`
                // forces the legacy (no-weld) upper path.
                if (!isGround && shellWalls.length >= 3) {
                    const upperWeldEnabled =
                        (window as unknown as { __pryzmHouseUpperShellWeld?: boolean })
                            .__pryzmHouseUpperShellWeld !== false;
                    const axisAligned = this._footprintIsAxisAlignedRect(storey.footprint);
                    if (upperWeldEnabled && !axisAligned) {
                        console.log(
                            `[house-layout] §UPPER-SHELL-WELD ${storey.levelId} took the WELD path `
                            + '(footprint is NOT an axis-aligned rectangle → rotated-plate residual) — '
                            + 'welding partitions onto the minted perimeter so §SHELL-ANCHOR-PRESERVE '
                            + 'can seat them on the shell and the rooms seal (mirrors the ground fix).',
                        );
                        set = this._weldGroundPartitions(set, shellWalls);
                    } else {
                        console.log(
                            `[house-layout] §UPPER-SHELL-WELD ${storey.levelId} took the BIT-EXACT path `
                            + `(reason: ${upperWeldEnabled ? 'axis-aligned footprint — partitions already bit-exact on the perimeter' : 'upper-weld flag OFF'}) — `
                            + 'no weld (engine-authored endpoints already on the ring).',
                        );
                    }
                }

                perStorey.push({ levelId: storey.levelId, set, option });

                // ── §DIAG-SEAL (2026-06-09, founder room-merge forensics) ─────────────
                // The decisive instrumentation: AFTER the weld decision, for EVERY
                // interior-partition endpoint on this storey, log the distance to the
                // nearest perimeter (shell) wall body AND to the nearest OTHER partition
                // endpoint. RoomDetectionEngine seals a loop only when each sealing
                // endpoint sits within its corner-snap (`_snapNearbyCorners` = 0.30 m) of
                // a perimeter wall OR another partition endpoint; an endpoint whose BOTH
                // distances exceed 0.30 m is an OPEN seam → the detector floods across it
                // → adjacent rooms merge (the founder's "5 rooms → 1 blob"). The headless
                // weld→resolver→detection chain (weldResolverRoomDetectionChain.test.ts)
                // proves the resolver does NOT re-open a seal the weld closed and proves a
                // RESIDUAL > 0.30 m (which the weld's shellSnapTolM=0.30 cannot bridge) is
                // what merges. This per-endpoint log makes that residual VISIBLE in the
                // next prod run: any line with seal > 0.300 m is a confirmed merge seam,
                // and `wld=` shows whether the weld ran on this storey. Pure/read-only.
                try {
                    const sealPartitions = (set.wallBatch.payload as {
                        walls: Array<{ id: string; baseLine: Array<{ x: number; z: number }> }>;
                    }).walls;
                    const distToSeg = (px: number, pz: number, a: { x: number; z: number }, b: { x: number; z: number }): number => {
                        const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
                        let t = len2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / len2 : 0;
                        t = Math.max(0, Math.min(1, t));
                        return Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
                    };
                    type SealEp = { id: string; side: 'start' | 'end'; x: number; z: number };
                    const eps: SealEp[] = [];
                    for (const w of sealPartitions) {
                        const bl = w.baseLine;
                        if (!bl || bl.length < 2 || !bl[0] || !bl[1]) continue;
                        eps.push({ id: w.id, side: 'start', x: bl[0].x, z: bl[0].z });
                        eps.push({ id: w.id, side: 'end', x: bl[1].x, z: bl[1].z });
                    }
                    const SEAL_GRID_M = 0.30;   // RoomDetectionEngine._snapNearbyCorners threshold
                    let openSeamCount = 0;
                    let maxSeal = 0;
                    const lines: string[] = [];
                    // §DIAG-SEAL-TJUNC (v106 forensics, 2026-06-10) — the original §DIAG-SEAL
                    // measured `part=` as endpoint↔ENDPOINT distance only, so it could NOT
                    // distinguish (a) a partition end that floats off the SHELL from (b) a
                    // partition end that floats off ANOTHER partition's MID-SPAN (a T-join).
                    // The v106 Living↔Bedroom1 merge is TWO STACKED rooms — their divider is a
                    // partition whose end must meet either the shell OR a crossing partition's
                    // span; an endpoint sealed to a span shows a LARGE endpoint distance yet is
                    // closed. Add `partSpan=` (nearest OTHER partition SEGMENT, not just its
                    // endpoints): a true seal is min(perim, partSpan) ≤ 0.30 m. The seal verdict
                    // now uses partSpan (the geometry the detector actually traces), so a real
                    // T-junction no longer reads as a false OPEN-SEAM and a genuine floating end
                    // is still caught. Read-only; deterministic.
                    const partSegs = sealPartitions
                        .map(w => ({ id: w.id, a: w.baseLine?.[0], b: w.baseLine?.[1] }))
                        .filter((s): s is { id: string; a: { x: number; z: number }; b: { x: number; z: number } } => !!s.a && !!s.b);
                    for (const ep of eps) {
                        let nearPerim = Infinity;
                        for (const sw of shellWalls) {
                            const d = distToSeg(ep.x, ep.z, sw.start, sw.end);
                            if (d < nearPerim) nearPerim = d;
                        }
                        let nearPart = Infinity;
                        for (const o of eps) {
                            if (o.id === ep.id) continue;   // never its own wall's other end
                            const d = Math.hypot(ep.x - o.x, ep.z - o.z);
                            if (d < nearPart) nearPart = d;
                        }
                        // §DIAG-SEAL-TJUNC — nearest OTHER partition SEGMENT (mid-span T-joins).
                        let nearPartSpan = Infinity;
                        for (const ps of partSegs) {
                            if (ps.id === ep.id) continue;   // not its own wall's span
                            const d = distToSeg(ep.x, ep.z, ps.a, ps.b);
                            if (d < nearPartSpan) nearPartSpan = d;
                        }
                        // A loop closes when the endpoint sits within the detector corner-snap of
                        // the SHELL body OR a crossing partition's SPAN. Endpoint↔endpoint is the
                        // strictest case; the span distance is the true seal for a T-junction.
                        const seal = Math.min(nearPerim, nearPartSpan);
                        maxSeal = Math.max(maxSeal, seal);
                        if (seal > SEAL_GRID_M) openSeamCount++;
                        lines.push(`${ep.id}(${ep.side}) perim=${nearPerim.toFixed(3)}m part=${nearPart.toFixed(3)}m partSpan=${nearPartSpan.toFixed(3)}m seal=${seal.toFixed(3)}m${seal > SEAL_GRID_M ? ' ⚠OPEN-SEAM' : ''}`);
                    }
                    const weldRan = isGround
                        ? (shellWalls.length >= 3)   // ground weld decision logged above
                        : (shellWalls.length >= 3 && !this._footprintIsAxisAlignedRect(storey.footprint));
                    console.log(
                        `[house-layout] §DIAG-SEAL ${storey.levelId} parts=${sealPartitions.length} eps=${eps.length} ` +
                        `wld=${weldRan} maxSeal=${maxSeal.toFixed(3)}m openSeams(>${SEAL_GRID_M}m)=${openSeamCount} ` +
                        `(an OPEN-SEAM endpoint is a confirmed room-merge gap: > detector corner-snap 0.30m)`,
                    );
                    if (openSeamCount > 0) {
                        console.warn(
                            `[house-layout] §DIAG-SEAL ${storey.levelId} ⚠ ${openSeamCount} OPEN-SEAM endpoint(s) — ` +
                            `these WILL merge adjacent rooms (engine residual exceeds the 0.30m weld+detector snap):\n  ` +
                            lines.filter(l => l.includes('OPEN-SEAM')).join('\n  '),
                        );
                    }
                    // §DIAG-SEAL-DROP (ADR-0066, 2026-06-10) — THE missing seal-merge signal.
                    // §DIAG-SEAL above measures only the SURVIVING (post-weld) partitions, so it
                    // reports openSeams=0 even when the weld DROPPED a divider (a partition it
                    // collapsed below the 0.05 m floor) — and a dropped divider is EXACTLY what
                    // merges two rooms into one giant unclassified blob (the L-shape "corridor
                    // 68m²" + 1.3m² NO-ENGINE-MATCH sliver: detection floods across where the
                    // dropped wall used to separate them). Compare the PRE-weld id snapshot to the
                    // surviving set and flag every dropped divider LOUDLY — this is the root-cause
                    // line the puzzle was missing. Read-only; deterministic.
                    const survivingIds = new Set(sealPartitions.map(w => w.id));
                    const droppedDividers = [...preWeldPartitionIds].filter(id => !survivingIds.has(id));
                    if (droppedDividers.length > 0) {
                        console.warn(
                            `[house-layout] §DIAG-SEAL-DROP ${storey.levelId} ⚠ weld DROPPED ${droppedDividers.length} ` +
                            `partition(s) (${preWeldPartitionIds.size} pre-weld → ${survivingIds.size} surviving): ` +
                            `${droppedDividers.join(', ')} — a dropped DIVIDER merges the two rooms it separated ` +
                            `(detection floods the gap; §DIAG-SEAL cannot see it — measures only survivors). ` +
                            `If rooms merged with openSeams=0, THIS is the cause (engine-side: the partition the ` +
                            `weld collapsed must be emitted on the dividing line — another agent owns the weld geometry).`,
                        );
                    } else if (preWeldPartitionIds.size !== survivingIds.size) {
                        console.log(
                            `[house-layout] §DIAG-SEAL-DROP ${storey.levelId} pre-weld=${preWeldPartitionIds.size} ` +
                            `surviving=${survivingIds.size} (count differs but no id dropped — ids preserved).`,
                        );
                    } else {
                        console.log(`[house-layout] §DIAG-SEAL-DROP ${storey.levelId} OK — no partition dropped by the weld (${survivingIds.size} preserved).`);
                    }
                } catch (e) { console.warn('[house-layout] §DIAG-SEAL failed (non-fatal):', e); }

                // §DIAG-ROOMS (2026-06-08) — per-room glazing/access summary so a single
                // console paste shows exactly which rooms lack a window (the founder's
                // "rooms have doors but not windows" + daylight focus). Lists every room
                // with its type + engine windowCount, plus storey totals split into
                // interior vs shell openings.
                try {
                    const rms = (option as { rooms?: Array<{ type?: string; name?: string; windowCount?: number; area?: number }> }).rooms ?? [];
                    const doorN = set.openingCommands.length;
                    const intWin = set.windowOpeningCommands.length;
                    const shellWin = set.shellWindowOpeningCommands.length;
                    const NO_WINDOW_OK = new Set(['corridor', 'hall', 'wc', 'utility', 'storage', 'ensuite']);
                    const windowless = rms.filter(r => (r.windowCount ?? 0) === 0 && !NO_WINDOW_OK.has(r.type ?? '')).map(r => `${r.name ?? r.type}[${r.type}]`);
                    console.log(`[house-layout] §DIAG-ROOMS ${storey.levelId}: rooms=${rms.length} doors=${doorN} windows=${intWin + shellWin} (${intWin} interior + ${shellWin} shell) boundaries=${set.boundaryCommands.length}`);
                    console.log(`[house-layout] §DIAG-ROOMS ${storey.levelId} detail: ${rms.map(r => `${r.name ?? r.type}[${r.type}] a=${(r.area ?? 0).toFixed(1)} w=${r.windowCount ?? '?'}`).join(' | ')}`);
                    if (windowless.length > 0) console.warn(`[house-layout] §DIAG-ROOMS ${storey.levelId} ⚠ WINDOWLESS habitable room(s): ${windowless.join(', ')}`);
                } catch (e) { console.warn('[house-layout] §DIAG-ROOMS failed (non-fatal):', e); }

                // §A.21.D29 #3 — resolve the GROUND-floor main entrance on the drawn
                // shell. Uses the SAME default plan(mm)→world(m) projector
                // buildLayoutCommands used above (no `planToWorldXZ` override in `opts`),
                // so the hall centroid + shell walls share a frame. Only the ground
                // storey gets an external entrance (upper storeys are reached by stair).
                if (isGround && shellWalls.length > 0) {
                    // §ENTRANCE-DOOR-CLEAR (G4, 2026-06-08) — pass the shell-window spans
                    // already claimed on each shell wall so the entrance door lands in a
                    // CLEAR gap (and falls back to another hall-fronting wall if needed),
                    // instead of dead-centre where it collided with a window and the
                    // CreateWallOpenings batch skipped it ("no entrance door" defect).
                    const shellWindowSpans = new Map<string, Array<readonly [number, number]>>();
                    for (const op of set.shellWindowOpeningCommands) {
                        const p = op.payload as { wallId: string; opening: { offset: number; width: number } };
                        const s = p.opening.offset;
                        const span: readonly [number, number] = [s, s + p.opening.width];
                        const arr = shellWindowSpans.get(p.wallId);
                        if (arr) arr.push(span); else shellWindowSpans.set(p.wallId, [span]);
                    }
                    entranceDoor = resolveEntranceDoor(
                        option, shellWalls, undefined, shellWindowSpans,
                        // §DIAG-PARTY-WALL (PW.1) — never place the entrance on a blind/party
                        // façade. Empty ⇒ byte-identical to the pre-PW.1 entrance resolution.
                        blindFacadeWallIds.size > 0 ? blindFacadeWallIds : undefined,
                    );
                    // §DIAG-ENTRANCE-FIX (ADR-0066 editor-seam, 2026-06-10) — the resolver's
                    // STRICT vertex-on-wall hall-bounding test (tolM 0.2 m) reports boundsHall=⚠
                    // and falls back to a centroid-nearest (often NEIGHBOUR) façade whenever the
                    // pre-drawn shell drifted off the engine footprint ring (WELD-FALLBACK /
                    // rotated plate) by > 0.2 m. RE-SEAT the door onto the shell wall the hall
                    // actually FRONTS (longest collinear-and-alongside hall-boundary overlap,
                    // generous 0.65 m perp tol to survive the drift), placing it in a window-clear
                    // gap of that frontage. No-op when the resolver already chose a hall-fronting
                    // wall, or when the hall is genuinely not perimeter-adjacent (logged LOUD —
                    // an engine-side failure another agent owns; resolver pick kept).
                    {
                        const hall =
                            (option.rooms ?? []).find(r => r.type === 'hall')
                            ?? (option.rooms ?? []).find(r => r.type === 'corridor')
                            ?? null;
                        entranceDoor = reseatEntranceOnHallWall(
                            entranceDoor, hall, shellWalls, '[house-layout]', shellWindowSpans,
                        );
                    }
                    if (entranceDoor) {
                        // §DOOR-IN-WALL-SPAN (founder v46) — defensively VERIFY (and, if
                        // needed, clamp) the resolved entrance door against its host
                        // shell wall length so the door is genuinely hosted IN the wall,
                        // never floating off / overrunning a corner. resolveEntranceDoor
                        // already clamps, but we re-check against the live wall length
                        // here (the authoritative span) so a frame mismatch can't ship
                        // an off-wall door. A door that can't be made to fit is dropped.
                        const host = shellWalls.find(w => w.id === entranceDoor!.shellWallId);
                        if (host) {
                            const wallLenM = Math.hypot(host.end.x - host.start.x, host.end.z - host.start.z);
                            if (!isDoorWithinWallSpan(entranceDoor.offsetM, entranceDoor.widthM, wallLenM)) {
                                const clamped = clampDoorToWallSpan(entranceDoor.offsetM, entranceDoor.widthM, wallLenM);
                                if (clamped) {
                                    console.warn('[house-layout] §DOOR-IN-WALL-SPAN entrance door off-wall — clamped',
                                        `[${entranceDoor.offsetM.toFixed(2)},${entranceDoor.widthM.toFixed(2)}] → [${clamped.offsetM.toFixed(2)},${clamped.widthM.toFixed(2)}] on ${wallLenM.toFixed(2)}m wall`);
                                    entranceDoor = { ...entranceDoor, offsetM: clamped.offsetM, widthM: clamped.widthM };
                                } else {
                                    console.warn('[house-layout] §DOOR-IN-WALL-SPAN entrance host wall too short for a door — dropping entrance');
                                    entranceDoor = null;
                                }
                            }
                        }
                    } else {
                        console.warn('[house-layout] §A.21.D29 no entrance door resolved (no hall-bounding shell wall fit a door)');
                    }
                    if (entranceDoor) {
                        console.log('[house-layout] §A.21.D29 main entrance → wall', entranceDoor.shellWallId,
                            `offset ${entranceDoor.offsetM.toFixed(2)}m width ${entranceDoor.widthM.toFixed(2)}m`);
                    }
                }
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

                // 0.5 §WALL-SLAB-CONTINUITY (D38) — the GROUND shell is pre-drawn at
                //     the nominal wall head; raise its EXTERIOR walls by slab/2 so their
                //     tops penetrate the level-1 slab and overlap the level-1 walls
                //     (whose bases dropped slab/2 in `_buildPerimeterShell`), hiding the
                //     dark exposed-slab band at the ground↔level-1 junction. Only for a
                //     MULTI-storey house (a single storey has no junction → no bump, so
                //     the apartment / single-storey path is byte-identical). Best-effort.
                if (cm?.execute && result.storeys.length > 1) {
                    try {
                        const groundShell = gatherShellWalls(ground.id);
                        if (groundShell.length > 0) {
                            // §WALL-TOP-AT-SLAB-BOTTOM (2026-06-08, founder directive) — the
                            // ground shell walls' TOP must equal the BOTTOM of the level-above
                            // slab (= the upper floor elevation = wallHeightM), NOT wallHeightM +
                            // slab/2. The previous +slab/2 raise topped the ground walls at 3.1 m
                            // — 0.1 m ABOVE the L1 floor — so they protruded into the storey above
                            // and rendered in the first-floor plan ("ground walls showing on the
                            // first-floor plan"). Setting the head exactly to wallHeightM abuts the
                            // L1 slab bottom; the junction band stays hidden by the UPPER wall's
                            // base, which still drops slab/2 into the slab below (_buildPerimeterShell
                            // / wallExtentForLevel) — so the overlap is preserved from the upper side
                            // WITHOUT the ground wall poking up.
                            cm.execute(new UpdateWallHeightCommand({
                                wallIds: groundShell.map(w => w.id),
                                newHeight: wallHeightM,
                            }), { source: 'HOUSE_PIPELINE_SLAB_CONTINUITY' });
                            console.log('[house-layout] §WALL-TOP-AT-SLAB-BOTTOM set', groundShell.length,
                                `ground shell wall(s) to ${wallHeightM.toFixed(3)}m (= L1 floor = slab bottom; no protrusion into the floor-above plan)`);
                        }
                    } catch (e) { console.warn('[house-layout] §WALL-TOP-AT-SLAB-BOTTOM ground set failed (skipped):', e); }
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
                        this._createStair(cm, stair, floorToFloorM, baseElevationM, result.storeys, shell.perimeter);
                    }
                }

                // 4. Roof cap over the TOP storey footprint (A.21.D24 — the roof
                //    must cap the uppermost storey, never the ground). §ROOF-LEVEL:
                //    the roof now lives on its OWN dedicated "Roof" level (above the
                //    top storey) so it no longer renders in the top-storey plan. We
                //    still pass the top storey (for footprint + arithmetic) plus the
                //    roof level id; _createRoof keeps the roof's world Y unchanged.
                if (cm?.execute && roofLevelId) {
                    const topStorey = result.storeys[result.storeys.length - 1];
                    if (topStorey) this._createRoof(cm, result.roof, topStorey, wallHeightM, roofLevelId);
                }
            }, { levelIds: allLevelIds, totalElementCount: totalWallCount + result.storeys.length + result.stairs.length + 1, skipRedetectRooms: true });

            // ── Openings + doors + windows + boundaries, per storey, once the walls
            // have landed (wall.createOpening reads the committed wall store). One
            // coalesced batch with the FINAL room redetect across all storeys.
            // Returns once the redetect batch has run so the post-gen finish chain
            // can read rooms on every storey. Run as a detached async continuation
            // so execute() still returns promptly (the toast/result aren't blocked).
            // ──────────────────────────────────────────────────────────────────────
            void this._finishOpenings(perStorey, entranceDoor).then(async () => {
                // §DIAG-LEVELS (2026-06-08) — the founder reported "elements that should
                // belong to level 1 are on the ground floor" + "no rooms on the upper
                // floor". Three candidate roots are indistinguishable without a runtime
                // count: (A) upper walls actually stamped to ground; (B) the L1 plan view
                // shows ground walls (filter); (C) upper walls FAILED to mirror into the
                // legacy WallStore (the §P2.1 bridge throws LevelResolveError when the
                // minted level isn't in the legacy bimKernel → wall dropped → upper floor
                // empty). This logs, from the AUTHORITATIVE legacy store the inspector +
                // room detection + renderer read, the wall count PER level id vs the
                // INTENDED per-storey count — so the next prod test paste says exactly
                // which. Best-effort; never blocks the finish chain.
                try {
                    const ws = storeRegistry.getStoreForType('wall') as unknown as { getAll?(): WallRecord[] } | undefined;
                    const live = ws?.getAll?.() ?? [];
                    const liveByLevel = new Map<string, number>();
                    for (const w of live) liveByLevel.set(w.levelId, (liveByLevel.get(w.levelId) ?? 0) + 1);
                    const intendedByLevel = new Map<string, number>();
                    for (const s of perStorey) intendedByLevel.set(s.levelId, (intendedByLevel.get(s.levelId) ?? 0) + s.set.wallIds.length);
                    for (const [lvl, p] of perimeterByLevel) intendedByLevel.set(lvl, (intendedByLevel.get(lvl) ?? 0) + p.payload.walls.length);
                    const lines = levelIds.map((lvl, i) => {
                        const label = i === 0 ? 'Ground(L0)' : `Level ${i.toString().padStart(2, '0')}`;
                        const got = liveByLevel.get(lvl) ?? 0;
                        const want = intendedByLevel.get(lvl) ?? 0;
                        const flag = got < want ? ` ⚠ MISSING ${want - got} (mirror failed? → empty floor)` : (got > want ? ` ⚠ EXTRA ${got - want}` : '');
                        return `  ${label} [${lvl}]: live=${got} intended≈${want}${flag}`;
                    });
                    // Orphan walls whose levelId is NONE of the house's levels (mis-stamp candidate A).
                    const known = new Set(levelIds);
                    const orphan = [...liveByLevel.entries()].filter(([lvl]) => !known.has(lvl));
                    console.log('[house-layout] §DIAG-LEVELS wall distribution (authoritative legacy store) vs intended:\n' + lines.join('\n'));
                    if (orphan.length > 0) console.warn('[house-layout] §DIAG-LEVELS ⚠ walls on UNKNOWN levels (not this house):', orphan.map(([l, n]) => `${l}=${n}`).join(', '));
                } catch (e) { console.warn('[house-layout] §DIAG-LEVELS failed (non-fatal):', e); }

                // §FLR-VIEWS (2026-06-08) — auto-create one "Floor Plans" ViewDefinition
                // per GENERATED upper storey. DefaultViewsManager already seeds the ground
                // plan view (id `vd-sys-plan-l0`, spatial.levelId 'L0'), so upper storeys
                // built here got NO plan view → the panel listed only "Ground Floor". We
                // dispatch the SAME P6 bus command the Views rail uses (view.createDefinition
                // → CreateViewDefinitionCommand), one per storey, skipping (a) the ground
                // storey (storeyIndex 0) and (b) any level that ALREADY has a plan view
                // (re-generate dedupe). Runs after the levels exist + the openings batch
                // drained, so the views reference real levels. Single-storey/apartment →
                // only storeyIndex 0 → zero views created → byte-identical.
                for (const storey of result.storeys) {
                    if (storey.storeyIndex === 0) continue; // ground = vd-sys-plan-l0
                    const hasPlan = viewDefinitionStore
                        .getByLevel(storey.levelId)
                        .some(v => v.viewType === 'plan');
                    if (hasPlan) continue;                  // already has a plan view (re-generate)
                    const name = `Level ${storey.storeyIndex.toString().padStart(2, '0')}`;
                    try {
                        runtime.bus.executeCommand('view.createDefinition', {
                            id:       `vd-plan-${storey.levelId}`,
                            name,
                            viewType: 'plan',
                            spatial:  { levelId: storey.levelId },
                            // §GHOST-FIX (founder 2026-06-09) — belowLevelDepth-0 plan
                            // intent so the storey BELOW does not ghost through this plan.
                            intent:   'system-architectural-plan-current-level',
                        });
                        console.log('[house-layout] §FLR-VIEWS created plan view', name, 'for', storey.levelId, '(no below-level projection)');
                    } catch (e) {
                        console.warn('[house-layout] §FLR-VIEWS plan view create failed for', storey.levelId, e);
                    }
                }

                // §ROOF-VIEW (founder 2026-06-09) — a dedicated "Roof Plan" view for
                // the roof level, mirroring the per-storey plan views above (same P6
                // view.createDefinition bus command + same dedupe guard). So the roof,
                // which now lives on its own level, is viewable in its own plan rather
                // than the top-storey plan. Only when a roof level was minted (house /
                // multi-storey path) — the apartment path never mints one.
                if (roofLevelId) {
                    const roofHasPlan = viewDefinitionStore
                        .getByLevel(roofLevelId)
                        .some(v => v.viewType === 'plan');
                    if (!roofHasPlan) {
                        try {
                            runtime.bus.executeCommand('view.createDefinition', {
                                id:       `vd-plan-${roofLevelId}`,
                                name:     'Roof Plan',
                                viewType: 'plan',
                                spatial:  { levelId: roofLevelId },
                                // §GHOST-FIX — roof plan must not project the top storey below it.
                                intent:   'system-architectural-plan-current-level',
                            });
                            console.log('[house-layout] §ROOF-VIEW created Roof Plan view for', roofLevelId);
                        } catch (e) {
                            console.warn('[house-layout] §ROOF-VIEW Roof Plan view create failed for', roofLevelId, e);
                        }
                    }
                }

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
                // §LANDING-NOT-HALL (G14, 2026-06-09) — the stair arrives on an UPPER
                // storey at a LANDING, not an entrance hall. The engine no longer mints
                // a `hall`/"Entrance Hall" on upper storeys (storeyAllocation +
                // houseProgramFloor leave entranceHall OFF); the stair-arrival
                // circulation is the engine's `corridor`. RELABEL that corridor "Landing"
                // on upper storeys (storeyIndex > 0) so it reads as a stair landing, not
                // a generic corridor. GROUND (levelIds[0]) is untouched — it keeps its
                // real "Entrance Hall". Pure metadata: we clone the option + rename only
                // the corridor room's display name (type/occupancy unchanged), so the
                // furnish/floor/ceiling occupancy keys are byte-identical.
                const groundLevelId = levelIds[0];
                const relabelUpperCirculation = (option: ScoredLayoutOption): ScoredLayoutOption => ({
                    ...option,
                    rooms: option.rooms.map(r =>
                        r.type === 'corridor' ? { ...r, name: 'Landing' } : r,
                    ),
                });
                const nameStorey = (levelId: string): void => {
                    const option = optionByLevel.get(levelId);
                    if (!option) { console.warn('[house-layout] no layout option to name storey', levelId); return; }
                    const isGround = levelId === groundLevelId;
                    nameDetectedRooms(
                        runtime,
                        levelId,
                        isGround ? option : relabelUpperCirculation(option),
                        '[house-layout]',
                    );
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

    /**
     * §GROUND-ENGINE-PERIMETER (A.21.Stage-1, audit 2026-06-09 §5) — is the drawn
     * GROUND shell still ON the engine footprint ring within tolerance?
     *
     * Returns TRUE only when it is PROVABLY SAFE to treat the drawn shell as the
     * engine-authored perimeter — i.e. the user's drawn exterior walls have NOT
     * drifted off the footprint ring `buildLayoutCommands` tiled the partitions
     * against. In that regime the engine emits the GROUND partitions terminating on
     * the footprint edge AND the detector reads the drawn walls AT those same edges,
     * so the rooms close with NO weld (the weld would be a no-op) — the ground behaves
     * exactly like an upper storey. When this returns FALSE the caller keeps the weld.
     *
     * The test is intentionally CONSERVATIVE (favours the weld fallback on any doubt):
     *   1. The footprint ring must be an AXIS-ALIGNED CONVEX-RECT. A rotated /
     *      L-/T-/U- / elongated plate is exactly where the post-miter principal-axis
     *      residuals exceed the detector grid (the §WJ-SKEW class) — keep the weld.
     *   2. EVERY drawn shell wall's two endpoints must lie within `tolM` (the
     *      RoomDetectionEngine ~20 mm node grid) of the footprint ring's perimeter.
     *      If any endpoint drifted further, the detector's perimeter ≠ the partition
     *      endpoints → the weld is load-bearing → keep it.
     *
     * Pure + deterministic (no Date.now/Math.random) per ADR-0061. Read-only.
     */
    private _groundShellOnEnginePerimeter(
        shellWalls: readonly { id: string; start: { x: number; z: number }; end: { x: number; z: number } }[],
        footprint: ReadonlyArray<{ x: number; z: number }>,
    ): boolean {
        try {
            if (shellWalls.length < 3 || footprint.length < 3) return false;

            // (1) Axis-aligned convex rectangle only. A non-rect / rotated plate has
            // post-miter residuals beyond the detector grid → the weld is needed.
            const xs = footprint.map(p => p.x), zs = footprint.map(p => p.z);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minZ = Math.min(...zs), maxZ = Math.max(...zs);
            const w = maxX - minX, d = maxZ - minZ;
            if (w < 1e-3 || d < 1e-3) return false;
            const AXIS_EPS = 0.02;   // 20 mm — every footprint vertex sits on a bbox edge
            const onBBoxEdge = footprint.every(p =>
                Math.abs(p.x - minX) < AXIS_EPS || Math.abs(p.x - maxX) < AXIS_EPS ||
                Math.abs(p.z - minZ) < AXIS_EPS || Math.abs(p.z - maxZ) < AXIS_EPS);
            if (!onBBoxEdge) return false;
            // A clean rectangle's area equals its bbox area; an L/T/U fills < bbox.
            const RECT_AREA_TOL = 0.02;   // 2 % of the bbox
            let signed = 0;
            for (let i = 0; i < footprint.length; i++) {
                const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
                signed += a.x * b.z - b.x * a.z;
            }
            const polyArea = Math.abs(signed) / 2;
            if (Math.abs(polyArea - w * d) > RECT_AREA_TOL * (w * d)) return false;

            // (2) Every drawn shell wall endpoint within the detector grid of the ring.
            // Distance from a point to the closed footprint ring (min over edges).
            const tolM = 0.02;   // ~RoomDetectionEngine 20 mm node grid
            const distToRing = (p: { x: number; z: number }): number => {
                let best = Infinity;
                for (let i = 0; i < footprint.length; i++) {
                    const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
                    const dx = b.x - a.x, dz = b.z - a.z;
                    const len2 = dx * dx + dz * dz;
                    let t = len2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : 0;
                    t = Math.max(0, Math.min(1, t));
                    const cx = a.x + t * dx, cz = a.z + t * dz;
                    const dd = Math.hypot(p.x - cx, p.z - cz);
                    if (dd < best) best = dd;
                }
                return best;
            };
            for (const sw of shellWalls) {
                if (distToRing(sw.start) > tolM || distToRing(sw.end) > tolM) return false;
            }
            return true;
        } catch {
            return false;   // any failure → conservative: keep the weld
        }
    }

    /**
     * §UPPER-SHELL-WELD (2026-06-09) — is the storey footprint a CLEAN, AXIS-ALIGNED
     * rectangle? On such a plate the engine tiles the interior partitions bit-exact on
     * the (axis-aligned) perimeter ring, so the upper-storey weld is a deterministic
     * no-op and we keep the legacy bit-exact path. When this returns FALSE (rotated /
     * L-/T-/U- / elongated plate) the engine's principal-axis tiling leaves the
     * partition endpoints OFF the minted ring by the §WJ-SKEW residual, so the caller
     * welds them onto the perimeter (the same cure the ground uses).
     *
     * This is the FOOTPRINT-only sister of `_groundShellOnEnginePerimeter` (which ALSO
     * tests drawn-shell drift): the upper perimeter is minted EXACTLY on the footprint,
     * so the only question is whether the PLATE itself is axis-aligned-rectangular.
     * Pure + deterministic; read-only.
     */
    private _footprintIsAxisAlignedRect(
        footprint: ReadonlyArray<{ x: number; z: number }>,
    ): boolean {
        try {
            if (footprint.length < 3) return false;
            const xs = footprint.map(p => p.x), zs = footprint.map(p => p.z);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minZ = Math.min(...zs), maxZ = Math.max(...zs);
            const w = maxX - minX, d = maxZ - minZ;
            if (w < 1e-3 || d < 1e-3) return false;
            // Every vertex must sit on a bbox edge (axis-aligned), …
            const AXIS_EPS = 0.02;   // 20 mm — matches the detector node grid
            const onBBoxEdge = footprint.every(p =>
                Math.abs(p.x - minX) < AXIS_EPS || Math.abs(p.x - maxX) < AXIS_EPS ||
                Math.abs(p.z - minZ) < AXIS_EPS || Math.abs(p.z - maxZ) < AXIS_EPS);
            if (!onBBoxEdge) return false;
            // … and the polygon must FILL its bbox (a true rectangle, not an L/T/U).
            const RECT_AREA_TOL = 0.02;   // 2 % of the bbox
            let signed = 0;
            for (let i = 0; i < footprint.length; i++) {
                const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
                signed += a.x * b.z - b.x * a.z;
            }
            const polyArea = Math.abs(signed) / 2;
            return Math.abs(polyArea - w * d) <= RECT_AREA_TOL * (w * d);
        } catch {
            return false;   // any failure → conservative: treat as non-axis-aligned → weld
        }
    }

    /**
     * §GROUND-WELD (A.21.D39) — weld the GROUND interior partition baselines onto the
     * pre-drawn shell + to each other, so room detection closes every ground room the
     * same way the upper floors do (where `_buildPerimeterShell` already guarantees
     * exact shared endpoints). Pure decision (`weldPartitionsToShell` from ai-host);
     * here we map the wall-batch payload in/out and reconcile any opening/door whose
     * host partition the weld dropped (collapsed below the editor's 0.05 m min length).
     * Boundaries (open-plan splitters) are likewise welded onto the shell so they reach
     * it and the open-plan zone closes. Returns a NEW LayoutCommandSet; the input is
     * untouched. Best-effort — on any failure the original set passes through unwelded.
     */
    private _weldGroundPartitions(
        set: LayoutCommandSet,
        shellWalls: readonly { id: string; start: { x: number; z: number }; end: { x: number; z: number } }[],
    ): LayoutCommandSet {
        try {
            const payload = set.wallBatch.payload as {
                walls: Array<{ id: string; levelId: string; baseLine: Array<{ x: number; y?: number; z: number }>; height?: number; thickness?: number }>;
                levelId: string;
            };
            const inWalls = payload.walls;
            if (!Array.isArray(inWalls) || inWalls.length === 0) return set;

            const shell: WeldWall[] = shellWalls.map(s => ({ id: s.id, start: { x: s.start.x, z: s.start.z }, end: { x: s.end.x, z: s.end.z } }));
            const partitions: WeldWall[] = inWalls.map(w => ({
                id: w.id,
                start: { x: w.baseLine[0]!.x, z: w.baseLine[0]!.z },
                end:   { x: w.baseLine[1]!.x, z: w.baseLine[1]!.z },
            }));

            const welded = weldPartitionsToShell(partitions, shell);
            const weldedById = new Map(welded.map(w => [w.id, w]));

            // §DIVIDER-RETAIN (ADR-0066 editor-seam, 2026-06-10) — the weld DROPS any partition it
            // collapses below its 0.05 m floor. When that partition was a USABLE DIVIDER (its
            // ORIGINAL, pre-weld length was a real wall, ≥ DIVIDER_MIN_LEN_M), dropping it MERGES
            // the two rooms it separated (the §DIAG-SEAL-DROP root cause). A divider sitting a few
            // cm off the shell is FAR better than a missing one — the detector's own 0.30 m
            // corner-snap + the welded survivors still close the loop, whereas a dropped divider
            // GUARANTEES a flood-merge. So instead of dropping a collapsed USABLE divider we
            // RETAIN its ORIGINAL baseline (un-welded). Genuinely degenerate engine stubs (original
            // length < DIVIDER_MIN_LEN_M) are STILL dropped — keeping those would re-introduce the
            // phantom-wall hazard (WallJoinResolver degenerate-wall bug). On a clean axis-aligned
            // plate nothing collapses, so this is a byte-identical no-op there.
            const DIVIDER_MIN_LEN_M = 0.5;   // a real interior divider; above the 0.05 m floor, below a corridor strip
            const origLenById = new Map<string, number>();
            for (const w of inWalls) {
                const bl = w.baseLine;
                if (bl && bl[0] && bl[1]) origLenById.set(w.id, Math.hypot(bl[1].x - bl[0].x, bl[1].z - bl[0].z));
            }

            // Rebuild the wall payload preserving every kept wall's y / height / thickness;
            // §DIVIDER-RETAIN keeps a collapsed-but-usable divider at its original baseline.
            const keptIds = new Set<string>();
            const retainedDividers: string[] = [];
            const newWalls = inWalls
                .filter(w => weldedById.has(w.id) || (origLenById.get(w.id) ?? 0) >= DIVIDER_MIN_LEN_M)
                .map(w => {
                    keptIds.add(w.id);
                    const ww = weldedById.get(w.id);
                    const y = w.baseLine[0]!.y ?? 0;
                    if (ww) {
                        return { ...w, baseLine: [{ x: ww.start.x, y, z: ww.start.z }, { x: ww.end.x, y, z: ww.end.z }] };
                    }
                    // Weld collapsed this divider — retain its ORIGINAL (un-welded) baseline.
                    retainedDividers.push(w.id);
                    return w;
                });

            const droppedCount = inWalls.length - newWalls.length;
            if (droppedCount > 0) {
                console.warn('[house-layout] §GROUND-WELD dropped', droppedCount, 'degenerate ground partition(s) after welding to shell');
            }
            if (retainedDividers.length > 0) {
                console.warn(
                    '[house-layout] §DIVIDER-RETAIN kept', retainedDividers.length,
                    'collapsed-but-usable divider(s) at original baseline (a slightly-off divider beats a missing one →',
                    'prevents the §DIAG-SEAL-DROP room-merge):', retainedDividers.join(', '),
                );
            }
            console.log('[house-layout] §GROUND-WELD welded', newWalls.length, 'ground partition(s) onto', shell.length, 'shell wall(s)');

            // Reconcile openings/doors hosted on a dropped wall (skip them).
            const keepOpening = (cmd: LayoutCommand): boolean => {
                const wid = (cmd.payload as { wallId?: string }).wallId;
                return wid === undefined || keptIds.has(wid);
            };
            const openingCommands = set.openingCommands.filter(keepOpening);
            const windowOpeningCommands = set.windowOpeningCommands.filter(keepOpening);
            const doorBatch = this._filterDoorBatch(set.doorBatch, keptIds);
            const windowBatch = this._filterWindowBatch(set.windowBatch, keptIds);

            // §GROUND-WELD — boundaries (open-plan splitters) must also reach the shell.
            // Weld each boundary's two endpoints onto the shell (treating the boundary as
            // a one-off partition); endpoints that don't reach a shell wall are left as-is.
            const boundaryCommands = set.boundaryCommands.map(bc => {
                const p = bc.payload as { id: string; levelId: string; start: { x: number; z: number }; end: { x: number; z: number } };
                const w = weldPartitionsToShell(
                    [{ id: p.id, start: { x: p.start.x, z: p.start.z }, end: { x: p.end.x, z: p.end.z } }],
                    shell,
                    { partitionWeldTolM: 0 },   // a lone boundary: shell-snap only, no self-weld
                );
                if (w.length === 0) return bc;  // collapsed — keep original (best-effort)
                return { ...bc, payload: { ...p, start: { x: w[0]!.start.x, z: w[0]!.start.z }, end: { x: w[0]!.end.x, z: w[0]!.end.z } } };
            });

            return {
                ...set,
                wallBatch: { ...set.wallBatch, payload: { ...payload, walls: newWalls } },
                openingCommands,
                windowOpeningCommands,
                doorBatch,
                windowBatch,
                boundaryCommands,
            };
        } catch (e) {
            console.warn('[house-layout] §GROUND-WELD failed (passing through unwelded):', e);
            return set;
        }
    }

    /** Drop doors from a door.batch.create payload whose host wall id was dropped. */
    private _filterDoorBatch(doorBatch: LayoutCommand | null, keptIds: Set<string>): LayoutCommand | null {
        if (!doorBatch) return null;
        const p = doorBatch.payload as { doors: Array<{ wallId?: string }> };
        const doors = (p.doors ?? []).filter(d => d.wallId === undefined || keptIds.has(d.wallId));
        if (doors.length === 0) return null;
        return { ...doorBatch, payload: { ...p, doors } };
    }

    /** Drop windows from a window.batch.create payload whose host wall id was dropped. */
    private _filterWindowBatch(windowBatch: LayoutCommand | null, keptIds: Set<string>): LayoutCommand | null {
        if (!windowBatch) return null;
        const p = windowBatch.payload as { windows: Array<{ wallId?: string }> };
        const windows = (p.windows ?? []).filter(w => w.wallId === undefined || keptIds.has(w.wallId));
        if (windows.length === 0) return null;
        return { ...windowBatch, payload: { ...p, windows } };
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
        shellPolyWorld?: ReadonlyArray<{ x: number; z: number }>,
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
            // §STAIR-HALF-LANDING-INWARD (2026-06-09) — pass the engine's interior side
            // (layout frame, same as dir1Layout) so a U-stair's half-landing folds toward
            // the plate INTERIOR, not out past the flush perimeter wall.
            const built = this._buildFlights(shape, startLayout, dir1Layout, split, width, tread, null, stair.interiorSide);

            // Rotate the rigid stair body back to WORLD (+angle about pivot): the
            // start position + any per-flight startOverride. y (height) is untouched.
            const startPosition0 = this._rotateXZ(startLayout, principalAxisRad, pivot);
            const worldFlights0: FlightInput[] = built.flights.map((f, idx) => ({
                ...f,
                // Prefer the engine's already-world-rotated direction; fall back to
                // rotating the layout direction (older results without world flights).
                direction: engFlights?.[idx]
                    ? engFlights[idx]!.direction
                    : this._unit(this._rotateXZDir(f.direction, principalAxisRad)),
                ...(f.startOverride ? { startOverride: this._rotateXZ(f.startOverride, principalAxisRad, pivot) } : {}),
            }));

            // §STAIR-CONTAIN-UPSTREAM (2026-06-09, founder "circulation must be perfectly
            // orchestrated") — the stair was CONTAINED inside the (rotated) shell UPSTREAM, in
            // the orchestrator, BEFORE the room-tiling keep-out was carved (see
            // houseOrchestrator.containStairCoreUpstream). The orchestrator solved the inward
            // offset against the SAME world geometry this executor builds and handed it back as
            // `stair.containOffsetWorld`. We APPLY that pre-computed shift to the rigid body so
            // the SHIPPED footprint == the carved keep-out by construction — closing the §8.5
            // "position → keep-out → tile → nudge" desync. The §STAIR-CONTAIN nudge that used to
            // run HERE (independently, AFTER the rooms were tiled) is now a VERIFICATION: we
            // re-run the SAME pure solver on the ALREADY-SHIFTED body and expect a {0,0} residual.
            // A non-zero residual means upstream and the executor DISAGREED (a desync) — we still
            // apply the defensive residual so the body ships inside the shell, but log it LOUDLY.
            // {0,0} upstream offset on an axis-aligned/fitting core → byte-identical (no regression).
            const upstreamDx = stair.containOffsetWorld?.x ?? 0;
            const upstreamDz = stair.containOffsetWorld?.z ?? 0;
            let containDx = upstreamDx, containDz = upstreamDz;
            try {
                if (shellPolyWorld && shellPolyWorld.length >= 3) {
                    // Footprint of the body AFTER the upstream shift — this is what ships.
                    const startShifted = { x: startPosition0.x + upstreamDx, y: startPosition0.y, z: startPosition0.z + upstreamDz };
                    const flightsShifted: FlightInput[] = (upstreamDx || upstreamDz)
                        ? worldFlights0.map(f => ({ ...f, ...(f.startOverride ? { startOverride: { x: f.startOverride.x + upstreamDx, y: f.startOverride.y, z: f.startOverride.z + upstreamDz } } : {}) }))
                        : worldFlights0;
                    const fpS = computeStairFootprintRect({
                        shape, width, treadDepth: tread, startPosition: startShifted, flights: flightsShifted,
                        ...(built.landings.length > 0 ? { landings: built.landings } : {}),
                    });
                    if (fpS && fpS.length >= 3) {
                        const fpSXZ = fpS.map(c => ({ x: c.x, z: c.z }));
                        // Inward direction = the LAYOUT-frame interior side rotated to world
                        // (same as the upstream solve); central/absent → the solver falls back
                        // to the shell centroid internally.
                        const sideLayout =
                            stair.interiorSide === 'left'  ? { x: 1, y: 0, z: 0 } :
                            stair.interiorSide === 'right' ? { x: -1, y: 0, z: 0 } :
                            stair.interiorSide === 'back'  ? { x: 0, y: 0, z: -1 } :
                            { x: 0, y: 0, z: 0 };
                        const inward = this._rotateXZDir(sideLayout, principalAxisRad);
                        const solved = solveStairContainmentWorld(fpSXZ, shellPolyWorld, { x: inward.x, z: inward.z });

                        if (solved.dx === 0 && solved.dz === 0) {
                            // Expected normal path — the upstream containment held.
                            console.log(`[house-layout] §STAIR-CONTAIN verification: upstream offset `
                                + `(${upstreamDx.toFixed(2)},${upstreamDz.toFixed(2)})m held — ${solved.cornersInShell}/4 corners inside, no residual nudge`);
                        } else {
                            // DESYNC — the upstream containment did NOT fully contain the shipped body.
                            containDx += solved.dx; containDz += solved.dz;
                            console.warn('[house-layout] §STAIR-CONTAIN ⚠ DESYNC — upstream-contained stair still '
                                + `pokes out; residual nudge (${solved.dx.toFixed(2)},${solved.dz.toFixed(2)})m applied on top of upstream `
                                + `(${upstreamDx.toFixed(2)},${upstreamDz.toFixed(2)})m`
                                + `${solved.viaCentroid ? ' (via shell centroid)' : ''} — keep-out may not match shipped footprint`);
                        }
                        if (solved.cornersInShell < 4) {
                            console.warn(`[house-layout] §STAIR-CONTAIN-GATE ⚠ stair still ${solved.cornersInShell}/4 corners inside after nudge — could not fully contain (best-effort, body shipped as nudged)`);
                        }
                    }
                }
            } catch (e) { console.warn('[house-layout] §STAIR-CONTAIN check failed (skipped):', e); }

            // Apply the (upstream + any residual) inward shift to the whole rigid body.
            const startPosition = (containDx || containDz)
                ? { x: startPosition0.x + containDx, y: startPosition0.y, z: startPosition0.z + containDz }
                : startPosition0;
            const worldFlights: FlightInput[] = (containDx || containDz)
                ? worldFlights0.map(f => ({
                    ...f,
                    ...(f.startOverride ? { startOverride: { x: f.startOverride.x + containDx, y: f.startOverride.y, z: f.startOverride.z + containDz } } : {}),
                }))
                : worldFlights0;

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
                // §STAIR-HALF-LANDING-INWARD — keep secondRunSide consistent with the
                // interior-folded offset the U flights were actually built with.
                ...(shape === 'U' ? { secondRunSide: built.secondRunSide, stepsBeforeLanding: split.before } : {}),
                accessibilityType: 'standard',
                // autoCreateOpening defaults to true → punches the slab-void above,
                // sized to the stair's full bounding footprint (covers L/U too).
            }), { source: 'HOUSE_PIPELINE_STAIR' });
            console.log('[house-layout] stair created', stair.fromLevelId, '→', stair.toLevelId,
                `(${shape}, ${totalRisers} risers @ ${(riserHeight * 1000).toFixed(0)}mm`
                + `${principalAxisRad !== 0 ? `, rot ${(principalAxisRad * 180 / Math.PI).toFixed(1)}°` : ''})`);

            // §A.21.D29 #1 — RECORD this stair's void footprint for the finish passes.
            // CreateStairCommand.autoCreateOpening punched the SLAB void from
            // `computeStairFootprintRect(input)`; we recompute the SAME world-XZ rect
            // from the SAME inputs (shape/width/tread/startPosition/worldFlights/
            // landings) and stash it under the void's host level (stair.toLevelId), so
            // the upper-storey FLOOR FINISH and the CEILING beneath it cut / skip the
            // finish over the open stairwell — matching the slab void exactly. Without
            // this the finish + ceiling plates re-cover the void you can see through.
            // Best-effort: a footprint failure must never break the stair. The
            // resulting `voidRect` (4 world-XZ corners of the stair's bounding
            // footprint) is the SINGLE SOURCE OF TRUTH for all three void surfaces:
            // the slab hole (CreateStairCommand.autoCreateOpening), the floor/ceiling
            // hole (recorded here for the finish passes), AND the guardrail below —
            // so the rail edges coincide EXACTLY with the slab + floor void edges.
            let voidRect: ReadonlyArray<{ x: number; z: number }> | null = null;
            try {
                voidRect = computeStairFootprintRect({
                    shape,
                    width,
                    treadDepth: tread,
                    startPosition,
                    flights: worldFlights,
                    ...(built.landings.length > 0 ? { landings: built.landings } : {}),
                });
                if (voidRect && voidRect.length >= 3) {
                    recordStairVoid(stair.toLevelId, voidRect);
                    console.log('[house-layout] §VOID-FINISH recorded stairwell void on', stair.toLevelId,
                        '— floor finish + ceiling will be cut to match.');
                }
            } catch (e) { console.warn('[house-layout] void-footprint record failed (skipped):', e); }

            // §A.21.D26 / §A.21.D33(a) — STAIRWELL-VOID GUARDRAIL. The stair
            // auto-punches a slab void on the upper floor; its open edges are a fall
            // hazard, so guard them with a handrail of the SAME type the stair carries
            // (height 1.050 m, baluster fill). The edge the stair tops out toward is
            // left OPEN (that's where you step off onto the floor); the other 3 are
            // railed.
            //
            // §A.21.D33(a) ALIGNMENT FIX — rail the EXACT SAME footprint the slab +
            // floor/ceiling voids use (`voidRect` from `computeStairFootprintRect`),
            // NOT the `stair.rectMm`-derived core rect (`{x0,z0,wM,hM}`). The core
            // rect is the stair's allocated cell, which differs from the stair's
            // actual flight/landing bounding footprint the void is cut from — so
            // railing the core rect left the railing OFFSET from the hole. By
            // construction `voidRect` is the identical polygon all three surfaces
            // share → the rail edges coincide exactly with the slab + floor void
            // edges. `computeStairFootprintRect` already returns WORLD-XZ corners
            // (it is fed the already-rotated `startPosition` + `worldFlights`), so the
            // guardrail no longer rotates anything itself. Best-effort: a guardrail
            // failure must never break the stair itself.
            try {
                if (voidRect && voidRect.length >= 4) {
                    const lastDir = worldFlights[worldFlights.length - 1]?.direction
                        ?? { x: dir1Layout.x, y: 0, z: dir1Layout.z };
                    this._createVoidGuardrail(cm, voidRect, stair.toLevelId, lastDir);
                } else {
                    console.warn('[house-layout] no void footprint for guardrail — skipped (rail must match the hole)');
                }
            } catch (e) { console.warn('[house-layout] void guardrail failed (skipped):', e); }
        } catch (e) { console.warn('[house-layout] stair create failed (skipped):', e); }
    }

    /**
     * §A.21.D26 / §A.21.D33(a) — rail the three exposed edges of the stairwell
     * void on the upper floor (matching the stair's own handrail type), leaving
     * open the edge the stair tops out toward.
     *
     * `voidRect` is the EXACT footprint polygon the slab + floor/ceiling voids are
     * cut from — the 4 WORLD-XZ corners `computeStairFootprintRect` returned for
     * THIS stair (the same value passed to `recordStairVoid`). The guardrail rails
     * those corners verbatim, so the rail edges coincide exactly with the slab +
     * floor void edges (§A.21.D33(a) — previously the rail used the `stair.rectMm`
     * core rect, which differs from this bounding footprint, so the rail was
     * offset from the hole). No rotation is applied here: the corners are already
     * in world space. `lastDir` is the final flight's WORLD direction — the void
     * edge most aligned with it is the step-off (open) side. The rails are created
     * on `topLevelId` (the floor the void sits in).
     */
    private _createVoidGuardrail(
        cm: CommandManagerLike,
        voidRect: ReadonlyArray<{ x: number; z: number }>,
        topLevelId: string,
        lastDir: { x: number; y: number; z: number },
    ): void {
        // The 4 oriented-rect corners (world XZ) — the SAME polygon the slab/floor
        // void was cut from. CCW order A→B→C→D as returned by computeStairFootprintRect.
        const c = voidRect.slice(0, 4).map(p => ({ x: p.x, z: p.z }));
        if (c.length < 4) { console.warn('[house-layout] void guardrail needs 4 corners — skipped'); return; }
        // Centroid of the void (world XZ).
        const cx = (c[0]!.x + c[1]!.x + c[2]!.x + c[3]!.x) / 4;
        const cz = (c[0]!.z + c[1]!.z + c[2]!.z + c[3]!.z) / 4;
        // 4 edges as corner-index pairs (a closed loop A→B→C→D→A).
        const edges: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 0]];
        const ld = this._unit(lastDir);
        // The OPEN edge: the one whose outward direction (midpoint − centroid)
        // best aligns with the final flight's travel — that's the step-off side.
        let openIdx = 0;
        let bestDot = -Infinity;
        edges.forEach(([i, j], idx) => {
            const mx = (c[i]!.x + c[j]!.x) / 2;
            const mz = (c[i]!.z + c[j]!.z) / 2;
            const ox = mx - cx, oz = mz - cz;
            const olen = Math.hypot(ox, oz) || 1;
            const dot = (ox / olen) * ld.x + (oz / olen) * ld.z;
            if (dot > bestDot) { bestDot = dot; openIdx = idx; }
        });
        let railed = 0;
        edges.forEach(([i, j], idx) => {
            if (idx === openIdx) return; // step-off side stays open
            try {
                cm.execute?.(new CreateHandrailCommand({
                    id:          createId('handrail'),
                    start:       { x: c[i]!.x, z: c[i]!.z },
                    end:         { x: c[j]!.x, z: c[j]!.z },
                    height:      STAIR_HANDRAIL_HEIGHT_M, // match the stair's own rail
                    thickness:   0.05,
                    levelId:     topLevelId,
                    baseOffset:  0,
                    fillType:    'baluster',
                    railProfile: 'rectangular',
                }), { source: 'HOUSE_PIPELINE_VOID_GUARD' });
                railed++;
            } catch (e) { console.warn('[house-layout] void guard edge skipped:', e); }
        });
        console.log(`[house-layout] stairwell-void guardrail — ${railed}/3 edge(s) railed on ${topLevelId} (1 step-off side open)`);
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
        // §STAIR-HALF-LANDING-INWARD (2026-06-09) — the plate-side the INTERIOR is on,
        // in the SAME LAYOUT frame as `start`/`dir1` (the engine's StairCore.interiorSide):
        //   'left' → interior +x · 'right' → interior −x · 'back' → interior −z.
        // Used (U-shape only) to fold the half-landing + return flight TOWARD the
        // interior instead of always to the left of flight 1. Absent / 'central' /
        // parallel-to-flight-1 ⇒ legacy left-of-flight-1 offset (byte-identical).
        interiorSide?: 'central' | 'left' | 'right' | 'back',
    ): { flights: FlightInput[]; landings: { depth: number }[]; secondRunSide: 'left' | 'right' } {
        const d1 = this._unit(dir1);
        if (shape === 'I') {
            return { flights: [{ direction: d1, riserCount: split.before }], landings: [], secondRunSide: 'left' };
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
                secondRunSide: 'left',
            };
        }
        // U: flight 2 runs parallel back the other way, offset across by the stair
        // width; landing depth spans both runs (2×width). Mirror StairCreationController.
        const firstLen = split.before * tread;
        // §STAIR-HALF-LANDING-INWARD (2026-06-09, founder "set the half-landing towards the
        // inside") — the offset side that pins flight 2's parallel return run. LEGACY: always
        // "left of flight 1" (perp = (−d1.z, d1.x)), which on a wall-flush U-stair poked the
        // half-landing OUT past the perimeter (prod §DIAG-STAIR cornersInShell=1/4). FIX: when
        // the engine tells us which side the plate INTERIOR is on (`interiorSide`, layout
        // frame), offset toward THAT side. We project the interior unit direction onto the
        // axis PERPENDICULAR to flight 1 (the only valid offset axis) and take its sign:
        //   'left' → +x · 'right' → −x · 'back' → −z. If the interior direction is parallel
        // to flight 1 (no perpendicular component), 'central', or absent, we keep the legacy
        // left-of-flight-1 offset — so I/L, central plates, and any plate where the legacy
        // left already faced interior are BYTE-IDENTICAL.
        const legacyPerp = this._unit({ x: -d1.z, y: 0, z: d1.x }); // left of flight 1
        const interiorDir =
            interiorSide === 'left'  ? { x: 1,  z: 0 } :
            interiorSide === 'right' ? { x: -1, z: 0 } :
            interiorSide === 'back'  ? { x: 0,  z: -1 } :
            null;
        // The component of the interior direction along the perpendicular (offset) axis.
        // `legacyPerp` already IS that axis (a unit perpendicular to d1); a non-zero dot
        // means the interior has a perpendicular component → offset along legacyPerp with
        // that sign. A ~zero dot (interior parallel to flight 1, e.g. 'back' on a Z-run)
        // gives no usable side → fall back to legacy left.
        const interiorDot = interiorDir ? interiorDir.x * legacyPerp.x + interiorDir.z * legacyPerp.z : 0;
        const perp = Math.abs(interiorDot) > 1e-6
            ? this._unit({ x: legacyPerp.x * Math.sign(interiorDot), y: 0, z: legacyPerp.z * Math.sign(interiorDot) })
            : legacyPerp;
        const secondStart = {
            x: start.x + d1.x * (firstLen + tread) + perp.x * width,
            y: start.y,
            z: start.z + d1.z * (firstLen + tread) + perp.z * width,
        };
        // §STAIR-HALF-LANDING-INWARD — report the side flight 2 was offset to relative to
        // flight 1, so the `secondRunSide` flag passed to CreateStairCommand stays
        // consistent with the geometry we built. `perp === legacyPerp` ⇒ left (default).
        const secondRunSide: 'left' | 'right' =
            (Math.abs(interiorDot) > 1e-6 && Math.sign(interiorDot) < 0) ? 'right' : 'left';
        return {
            flights: [
                { direction: d1, riserCount: split.before },
                // startOverride pins flight 2's parallel return run (U-shape).
                { direction: d2, riserCount: split.after, startOverride: secondStart },
            ],
            landings: [{ depth: 2 * width }],
            secondRunSide,
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
    private _buildPerimeterShell(
        storey: StoreyPlate,
        wallHeightM: number,
        storeyIndex: number,
        storeyCount: number,
        slabThicknessM: number,
    ): PerimeterShell | null {
        const poly = storey.footprint;
        if (!poly || poly.length < 3) return null;

        // §WALL-SLAB-CONTINUITY (D38) — extend this storey's exterior shell walls
        // vertically so they OVERLAP the slab band at each floor junction by slab/2,
        // hiding the dark exposed-slab band the founder saw. An upper storey always
        // has a level below (drop its base by slab/2 into that slab); it has a level
        // above only when it isn't the top storey (raise its top by slab/2 into that
        // slab — the top storey's head is left at the wall head for the roof to cap).
        // The DECISION is the pure ai-host `wallExtentForLevel`; here we just apply it
        // to the perimeter walls. Ground shell is pre-drawn (untouched). Falls back to
        // the nominal extent for a single storey (no junction → no overlap).
        const hasLevelBelow = storeyIndex > 0;
        const hasLevelAbove = storeyIndex < storeyCount - 1;
        const extent = wallExtentForLevel(storey.elevationM, wallHeightM, slabThicknessM, hasLevelBelow, hasLevelAbove);
        const wallBaseY = extent.baseY;
        const wallH = extent.heightM;

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
                // Tuple baseLine carrying the wall's world Y. §WALL-SLAB-CONTINUITY:
                // the base drops by slab/2 into the slab below so the exterior face
                // overlaps the slab band (no exposed-slab gap). The height likewise
                // extends up by slab/2 at any junction above (top storey excluded).
                baseLine: [
                    { x: a.x, y: wallBaseY, z: a.z },
                    { x: b.x, y: wallBaseY, z: b.z },
                ],
                height: wallH,
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
    private _createRoof(cm: CommandManagerLike, roof: RoofDescriptor, topStorey: StoreyPlate, wallHeightM: number, roofLevelId: string): void {
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
            //
            // §ROOF-CONCAVE-DECOMPOSE (founder L-shape defect, 2026-06-10) — the founder
            // does NOT want a flat roof on an L-shape house; he wants a real PITCHED roof
            // that follows the L (an L-shaped gable with a valley where the wings meet).
            // The single-ridge hip/gable builders are convex-only (their inward edge-shift
            // normals cross at a re-entrant corner → clashing planes), BUT geometry-roof
            // now has a concave-aware path: `RoofGeometryBuilder.generate` decomposes a
            // rectilinear concave footprint into rectangular WINGS and puts one gable on
            // each wing at the same pitch & eave height (valley by construction). So for a
            // concave footprint we KEEP the pitched kind as long as geometry-roof can
            // decompose it (`canDecomposeConcave`); flat is now ONLY the final fallback
            // for a NON-rectilinear concave shell (which the builder also flat-degrades,
            // logged). Convex footprints (rectangle / parallelogram / convex hex) are
            // UNCHANGED → gable/hip pass through exactly as before (no regression).
            const polyTuples = poly.map(p => [p.x, p.z] as [number, number]);
            const concave = !isConvexPolygon(poly);
            const decomposable = concave && canDecomposeConcave(polyTuples);
            const effectiveKind: RoofDescriptor['kind'] =
                concave
                    ? (decomposable
                        // Keep a pitched kind so geometry-roof routes through the per-wing
                        // gable decomposition. `gable` reads as the L-shaped pitched roof.
                        ? (roof.kind === 'flat' ? 'gable' : roof.kind)
                        : 'flat') // non-rectilinear concave → genuine flat fallback
                    : roof.kind === 'gable' && !isGableFriendly(poly) ? 'hip' : roof.kind;

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

            // §ROOF-LEVEL (founder 2026-06-09) — the roof now lives on its OWN
            // dedicated "Roof" level ABOVE the top storey, so it NO LONGER renders in
            // the top-storey plan view (the founder's request) and gets its own "Roof
            // Plan" view. World-Y MUST stay identical to before:
            //   • OLD: levelId = topStorey.level (elev = topStorey.elevationM),
            //          baseOffset = wallHeightM → worldY = topStorey.elevationM + wallHeightM.
            //   • NEW: levelId = roof level (elev = baseElevationM + storeyCount × ftf
            //          = topStorey.elevationM + floorToFloorM = topStorey.elevationM +
            //          wallHeightM, since wallHeightM === floorToFloorM), baseOffset = 0
            //          → worldY = roofLevel.elevation + 0 = topStorey.elevationM + wallHeightM.
            // Both resolve to the SAME world Y = the top storey's wall head → the roof
            // does NOT move vertically; only its owning level (and hence plan view)
            // changes. We still compute the expected cap elevation for the log so a
            // regression is visible. `autoBaseOffset:false` keeps it deterministic.
            const roofBaseOffset = 0;
            const expectedRoofElevM = typeof roof.baseElevationM === 'number'
                ? roof.baseElevationM
                : topStorey.elevationM + wallHeightM;
            cm.execute?.(new CreateRoofCommand(createId('roof'), {
                levelId: roofLevelId,
                footprint: { polygon, centroid: [cx, cz] },
                roofType: effectiveKind,
                ...(effectiveKind !== 'flat' && slope ? { slope } : {}),
                // Eave overhang beyond the shell (~400 mm) so the roof projects past
                // the walls like a real house. Flat roofs get a small/zero eave.
                overhang: effectiveKind !== 'flat' ? DEFAULT_ROOF_OVERHANG_M : 0,
                // The roof level's elevation already IS the top storey's wall head, so
                // the roof sits flush at baseOffset 0 (same world Y as the old top-level
                // + wallHeightM offset). Deterministic, not racy.
                baseOffset: roofBaseOffset,
                autoBaseOffset: false,
                thickness: DEFAULT_ROOF_THICKNESS_M,
            }), { source: 'HOUSE_PIPELINE_ROOF' });
            console.log('[house-layout] §ROOF-LEVEL roof created on dedicated roof level', roofLevelId,
                `(${effectiveKind}${effectiveKind !== roof.kind ? ` ←gable-fallback` : ''}, ~${pitchDeg.toFixed(0)}°, eave ${(DEFAULT_ROOF_OVERHANG_M * 1000).toFixed(0)}mm, baseOffset ${roofBaseOffset}m → roof caps @ ${expectedRoofElevM.toFixed(2)}m = top wall head, world-Y unchanged)`);
            // §DIAG-ROOF (founder L-shape verification, 2026-06-10) — ALWAYS-ON. Shows
            // the roof FOOTPRINT vertex count + convexity + requested-vs-chosen kind so
            // the next run proves which branch fired. A concave RECTILINEAR footprint
            // (e.g. an L's 6 verts, convex=false) now KEEPS a pitched kind (gable) and
            // geometry-roof builds one gable per decomposed wing (§ROOF-CONCAVE-DECOMPOSE);
            // flat is only the chosenKind for a NON-rectilinear concave shell.
            console.log(
                `[house-layout] §DIAG-ROOF footprint verts=${poly.length} convex=${isConvexPolygon(poly)} ` +
                `requestedKind=${roof.kind} chosenKind=${effectiveKind}` +
                `${concave ? (decomposable
                    ? ' (§ROOF-CONCAVE-DECOMPOSE: concave+rectilinear → pitched per-wing gable, valley at wing junction)'
                    : ' (§ROOF-CONCAVE flat-degrade: concave but NON-rectilinear → undecomposable → flat)') : ''}`,
            );
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
        entranceDoor?: EntranceDoorDispatch | null,
    ): Promise<void> {
        // All host walls the openings need, across all storeys.
        const neededWallIds = new Set<string>();
        for (const s of perStorey) for (const op of s.set.openingCommands) neededWallIds.add((op.payload as { wallId: string }).wallId);
        // §A.21.D29 #3 — the main entrance hosts on an EXISTING ground shell wall;
        // include it so the wall-store-ready gate covers it too (it's already
        // committed, so this never delays the batch).
        if (entranceDoor) neededWallIds.add(entranceDoor.shellWallId);

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
                                    // §WINDOW-VOID-FIX (2026-06-08) — windows hosted on NEW interior/partition
                                    // walls were built into the plan but never dispatched (only doors + shell
                                    // windows were punched), so they got a frame but NO void cut in the wall.
                                    // Punch them through the SAME CreateWallOpenings batch so each lands in
                                    // wall.openings[] and the hole is carved.
                                    ...set.windowOpeningCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
                                    ...set.shellWindowOpeningCommands.map(op => ({ p: op.payload as { wallId: string; opening: unknown } })),
                                ];
                                // §DOOR-LIVE-CLAMP (2026-06-08, CRITICAL accessibility) — the
                                // WallJoinResolver (run by the earlier wall.batch.create) can TRIM a
                                // host wall AFTER the engine sized the door for the untrimmed length.
                                // Re-clamp every DOOR opening against the LIVE wall span here — exactly
                                // the guard the entrance door already has (§DOOR-IN-WALL-SPAN, ~line 403)
                                // — so a trimmed wall yields a FITTED door instead of an "extends beyond
                                // wall length" SKIP that seals the room (the bathroom-no-door defect:
                                // "all rooms must be accessible"). Windows pass through unchanged (a
                                // window overrun is cosmetic; a door overrun makes a room inaccessible).
                                const liveDoorOpening = (wallId: string, opening: unknown): unknown | null => {
                                    const o = opening as { type?: string; offset?: number; width?: number };
                                    if (o.type !== 'door' || typeof o.offset !== 'number' || typeof o.width !== 'number') return opening;
                                    const w = wallStore?.getById?.(wallId) as { baseLine?: ReadonlyArray<{ x: number; z: number }> } | undefined;
                                    const bl = w?.baseLine;
                                    if (!bl || bl.length < 2 || !bl[0] || !bl[1]) return opening;   // wall not found → leave as-is
                                    const len = Math.hypot(bl[1].x - bl[0].x, bl[1].z - bl[0].z);
                                    if (isDoorWithinWallSpan(o.offset, o.width, len)) return opening;
                                    const clamped = clampDoorToWallSpan(o.offset, o.width, len);
                                    if (!clamped) {
                                        console.warn('[house-layout] §DOOR-LIVE-CLAMP host wall too short for any door — dropping', wallId, `liveLen=${len.toFixed(2)}m`);
                                        return null;                                                 // can't fit even a minimal door → drop (was being skipped anyway)
                                    }
                                    return { ...o, offset: clamped.offsetM, width: clamped.widthM };
                                };
                                if (openingItems.length > 0) {
                                    try {
                                        const mapped: Array<{ wallId: string; openingData: unknown }> = [];
                                        for (const it of openingItems) {
                                            const od = liveDoorOpening(it.p.wallId, it.p.opening);
                                            if (od !== null) mapped.push({ wallId: it.p.wallId, openingData: od });
                                        }
                                        if (mapped.length > 0) {
                                            cm.execute!(new CreateWallOpeningsBatchCommand(mapped));
                                            totalItems += mapped.length;
                                        }
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
                            // §A.21.D29 #3 — the GROUND-floor main entrance: one door
                            // opening on the EXISTING shell wall (same CreateWallOpenings
                            // batch path the interior doors use, so it renders the swing
                            // arc + leaf identically). Mint the opening + door element id
                            // here (the door id === opening.elementId so the C15 cascade
                            // removes both on undo). Inside the same batch → one undo unit.
                            if (entranceDoor) {
                                try {
                                    const openingId = createId('opening');
                                    const doorId = createId('door');
                                    cm.execute!(new CreateWallOpeningsBatchCommand([{
                                        wallId: entranceDoor.shellWallId,
                                        openingData: {
                                            id: openingId,
                                            type: 'door',
                                            offset: entranceDoor.offsetM,
                                            width: entranceDoor.widthM,
                                            height: entranceDoor.heightM,
                                            sillHeight: 0,
                                            elementId: doorId,          // === door id (C15 cascade)
                                            doorType: 'single',
                                            name: entranceDoor.name,
                                            ...(entranceDoor.systemTypeId ? { systemTypeId: entranceDoor.systemTypeId } : {}),
                                        },
                                    }]));
                                    totalItems += 1;
                                    console.log('[house-layout] §A.21.D29 main entrance door created on shell wall', entranceDoor.shellWallId);
                                } catch (e) { console.warn('[house-layout] §A.21.D29 entrance door batch failed (non-fatal):', e); }
                            }
                        }, { levelIds: allLevelIds, totalElementCount: totalItems, skipRedetectRooms: false });
                    } catch (e) { console.warn('[house-layout] openings+boundaries batch failed (non-fatal):', e); }
                    console.log('[house-layout] openings + boundaries dispatched —', totalItems, 'item(s) across', perStorey.length, 'storey(s)');

                    // §A.21.D28 — flush the wall meshes for the openings just added.
                    // Same defect as the apartment path: the opening batch overlaps the
                    // preceding wall batch's §BATCH-BUS-DISCARD window, so each opening's
                    // implicit `addOpening → emit('update')` rebuild signal is dropped —
                    // openings land in the data but wall bodies stay solid until a manual
                    // edit forces a whole-level rebuild. Re-queue every host wall for an
                    // EXPLICIT rebuild from current store data (the manual-WindowTool
                    // path), deferred so it runs after this batch's discard window restores.
                    const openingWallIds = [...new Set([
                        ...perStorey.flatMap(s => [
                            ...s.set.openingCommands.map(op => (op.payload as { wallId: string }).wallId),
                            // §WINDOW-VOID-FIX (2026-06-08) — rebuild interior-window host walls too.
                            ...s.set.windowOpeningCommands.map(op => (op.payload as { wallId: string }).wallId),
                            ...s.set.shellWindowOpeningCommands.map(op => (op.payload as { wallId: string }).wallId),
                        ]),
                        // §A.21.D29 #3 — rebuild the entrance door's shell host so its
                        // mesh shows the opening (same flush the interior openings get).
                        ...(entranceDoor ? [entranceDoor.shellWallId] : []),
                    ])];
                    if (openingWallIds.length > 0) {
                        // Deferred past the openings batch's (short, wall-free) drain so the
                        // §BATCH-BUS-DISCARD window has restored and the explicit rebuild's
                        // builds run synchronously rather than being re-queued by isBatching.
                        setTimeout(() => {
                            try {
                                // §A.21.D40 #3 — rebuild ONLY the host-wall BODIES (the new
                                // opening holes), reusing each wall's already-resolved miter
                                // cache, WITHOUT the whole-level resolveLevel re-trim. The
                                // old `rebuildWalls` (no prevState → whole-level) re-resolved
                                // the GROUND level after the partitions were welded ONTO the
                                // pre-drawn shell, and that zoom-dependent re-resolve treated
                                // partition↔shell contacts as fresh corner joins → it RE-TRIMMED
                                // (moved) the shell baselines: the "ground walls go off at the
                                // end" the founder hit. Opening creation never moves a baseline,
                                // so a body-only rebuild shows the holes while leaving the welded
                                // ground shell EXACTLY put. Falls back to whole-level when the
                                // helper isn't present (older runtime).
                                const ctl = window.__wallRebuildControl;
                                if (ctl?.rebuildWallBodies) ctl.rebuildWallBodies(openingWallIds);
                                else ctl?.rebuildWalls?.(openingWallIds);
                            } catch (e) { console.warn('[house-layout] §A.21.D40 rebuildWallBodies failed (non-fatal):', e); }
                        }, 250);
                    }
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
