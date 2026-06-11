/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Spatial / Detection Engine
 * File:             src/elements/rooms/RoomDetectionEngine.ts
 * Contract:         docs/01_ELEMENTS/09_Rooms_Contract/02-ROOM-BOUNDARY-ENGINE-CONTRACT.md
 *                   docs/01_ELEMENTS/09_Rooms_Contract/ROOM-IMPLEMENTATION-PLAN.md §2.2
 *
 * Wraps PlanarTopologyEngine to detect rooms from live WallStore data.
 * Pure computation — no store mutations, no Command creation, no side effects.
 * Commands are responsible for writing detected rooms to RoomStore.
 *
 * Layer compliance:
 *   - Reads WallStore (read-only).
 *   - Calls PlanarTopologyEngine (pure computation).
 *   - Returns RoomData[] — does NOT write to any store.
 *   - No THREE.js scene access.
 *
 * ## FIX: T-Junction Endpoint Snapping
 *
 * Previous _splitAtTJunctions only split the HOST wall at the T-junction point P,
 * but left the GUEST wall's endpoint at its original position (up to 80mm from P).
 * With NODE_GRID_MM = 10mm in buildWallGraph, those two points were quantized to
 * different grid cells → separate graph nodes → no connection → face traversal
 * produced one large room instead of the expected sub-rooms.
 *
 * Fix: _splitAtTJunctions now ALSO snaps the guest wall's endpoint to the exact
 * split point P so both the host sub-segment and the guest wall share the same
 * coordinates, collapsing to the same grid node in buildWallGraph.
 *
 * ## FIX: Body-Crossing (X-Junction) Split
 *
 * Previous pipeline had no handler for the case where a partition wall
 * PHYSICALLY CROSSES through an outer wall — i.e. the partition's line intersects
 * the outer wall at strictly interior points of BOTH segments (an X-junction).
 *
 * In this situation:
 *   • The partition endpoints are beyond the outer walls so _snapNearbyCorners
 *     (endpoint-to-endpoint, ≤1 m) does not fire.
 *   • The partition endpoints may be > 0.5 m past the outer walls so
 *     _splitAtTJunctions (endpoint-near-interior, ≤0.5 m) also does not fire.
 *   • The result: the outer wall and the partition share no node in the WallGraph
 *     → face traversal sees one large undivided region → no sub-rooms detected.
 *
 * Fix: added _splitAtBodyCrossings() which calls the already-existing
 * splitWallsAtCrossings() from WallIntersectionResolver. This splits BOTH walls
 * at the exact intersection point P, giving sub-segments that share the same
 * endpoint coordinates and collapse to the same NODE_GRID_MM cell.
 *
 * The new pipeline order is:
 *   _snapNearbyCorners → _splitAtBodyCrossings → _splitAtTJunctions → buildWallGraph
 *
 * ## FIX (Apr 2026): join-trim offsets disconnect new walls at corners
 *
 * Two related symptoms produced the same outcome — a freshly drawn wall
 * snapped onto an existing corner ended up "dangling" in the planar graph
 * and the user's partition room was silently dropped:
 *
 *   1. §T-INTO-CORNER (90° L + new wall at any angle).
 *      The resolver trims the new wall's endpoint onto the LATERAL FACE of
 *      the perpendicular host wall.  The trimmed endpoint is written back
 *      to `WallStore.baseLine` (correct for rendering) but sits
 *      `hostThickness/2` (50–200 mm) away from the geometric corner node.
 *
 *   2. Non-perpendicular L (e.g. 120°/150° corner) + new wall.
 *      When walls A and B were originally L-joined the pair-wise miter loop
 *      extended their centrelines past the geometric corner along the angle
 *      bisector — `thickness / (2·tan(half-angle))`, ~58 mm at 120°, ~370 mm
 *      at 150°, larger at sharper angles.  A new wall C snapping onto A's
 *      visible end therefore lands at A's **bisector miter point**, not at
 *      the original geometric corner.
 *
 * In both cases the post-resolver `baseLine` for ALL walls in the cluster
 * actually converges to the same world-space point — the trimmed face point
 * for case 1, the bisector miter point for case 2 — so `baseLine` is the
 * right input for topology.  The only thing that was wrong was the corner-
 * snap threshold: the §STRICT-ROOMS pass tightened it to 50 mm, which is
 * smaller than the legitimate `hostThickness/2` and miter-bisector offsets
 * the resolver itself produces.
 *
 * Fix: keep using `baseLine` (single source of truth — what is actually at
 * that point in space) and widen `_snapNearbyCorners` from 50 mm to 300 mm.
 * 300 mm covers typical interior wall thicknesses up to 600 mm and oblique
 * miter offsets through ~150° corners while staying well below the 1 m
 * setting that historically caused unrelated wall ends to fuse together.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { WallStore } from '@pryzm/geometry-wall';
import { CurtainWallStore } from '@pryzm/geometry-curtain-wall';
import { buildWallGraph, splitWallsAtCrossings } from './WallIntersectionResolver';
import { PathResolver } from '@pryzm/geometry-wall';
import { computeTopology } from './PlanarTopologyEngine';
import {
  RoomData,
  RoomVertex,
  RoomBoundary,
} from './RoomTypes';
import {
  computeRoomMetrics,
  ensureCCW,
  sanitisePolygon,
  isSimple,
  repairToSimplePolygon,
  MIN_ROOM_AREA_M2,
} from './RoomPolygonUtils';
import { UiPreferences } from '@pryzm/core-app-model';

// ── Lazy imports (avoid circular deps at module-load time) ────────────────────
// RoomBoundingLineStore and ColumnStore are accessed via type-only imports here
// and imported as singletons lazily inside detectRoomsForLevel to prevent
// initialisation order issues (both modules are registered in initBuilders).
type IColumnStore = { getAll(): Array<{ id: string; levelId: string; position: { x: number; z: number }; width: number; depth: number; profile: string }> };
type IRoomBoundingLineStore = { getByLevel(levelId: string): Array<{ id: string; placement: { start: { x: number; z: number }; end: { x: number; z: number } }; properties: { isActive: boolean } }> };

/** Radius (m) within which an existing room centroid is considered a match for semantic preservation. */
const CENTROID_MATCH_RADIUS = 2.0;

/**
 * Cycling colour palette for newly-detected rooms.
 * Each detected room gets a distinct colour so they are visually distinguishable
 * even before the user assigns occupancy types.
 * Colours are the AIA occupancy design tokens from RoomColourSystem.ts.
 */
const DETECTION_COLOUR_PALETTE: string[] = [
  '#B8D4F0', // soft blue
  '#C8E6C9', // soft green
  '#FFE0B2', // soft orange
  '#F8BBD9', // soft pink
  '#E1BEE7', // soft purple
  '#FFF9C4', // soft yellow
  '#FFCCBC', // soft salmon
  '#B2EBF2', // soft cyan
  '#DCEDC8', // light green
  '#CFD8DC', // blue-grey
  '#81D4FA', // light blue
  '#A5D6A7', // medium green
  '#FFAB91', // medium salmon
  '#CE93D8', // medium purple
  '#80DEEA', // medium cyan
];

export class RoomDetectionEngine {
  constructor(
    private readonly wallStore: WallStore,
    private readonly curtainWallStore?: CurtainWallStore,
    private readonly columnStore?: IColumnStore,
    private readonly roomBoundingLineStore?: IRoomBoundingLineStore,
  ) {}

  /**
   * Detects all rooms on the given level using wall + optional curtain wall /
   * column / room-bounding-line topology.
   *
   * Participation of each element type is controlled by UiPreferences:
   *   - Walls:            ALWAYS participate (cannot be disabled).
   *   - Curtain Walls:    participate only when roomBoundingCurtainWalls=true (default OFF).
   *   - Columns:          participate only when roomBoundingColumns=true (default OFF).
   *   - RoomBoundingLine: ALWAYS participate when isActive=true (user-placed virtual partition).
   *
   * Returns new RoomData objects — does NOT mutate any store.
   * Caller (commands) are responsible for store writes.
   */
  detectRoomsForLevel(
    levelId: string,
    levelElevation: number,
    levelHeight: number,
  ): RoomData[] {
    const walls = this.wallStore.getByLevel(levelId);

    // ── UiPreferences — Room Bounding toggles ─────────────────────────────
    const includeCurtainWalls = UiPreferences.get('roomBoundingCurtainWalls');
    const includeColumns      = UiPreferences.get('roomBoundingColumns');

    // Curtain walls — only when toggle is ON (default OFF per §ROOM-BOUNDING spec)
    const curtainWalls = (includeCurtainWalls && this.curtainWallStore)
      ? this.curtainWallStore.getAll().filter(cw => cw.levelId === levelId)
      : [];

    // Room Bounding Lines — always active (user-placed virtual partitions)
    const roomBoundingLines = this.roomBoundingLineStore
      ? this.roomBoundingLineStore.getByLevel(levelId).filter(l => l.properties.isActive)
      : [];

    const hasAnyInput = walls.length > 0 || curtainWalls.length > 0 || roomBoundingLines.length > 0;
    if (!hasAnyInput) {
      console.debug(`[RoomDetectionEngine] No bounding segments on level '${levelId}' — skipping detection`);
      return [];
    }

    // Build WallGraph from WallData.
    // Curved walls are tessellated into arc sub-segments using PathResolver so the
    // topology engine sees the actual arc shape rather than a straight chord from
    // baseLine[0] to baseLine[1]. Each sub-segment gets a unique ID using the _c
    // suffix convention (stripped by the /(_[cs]\d+)+$/ regex at room output time).
    //
    // §JOIN-TRIM-FIX (Apr 2026): use `baseLine` (the post-resolver, world-space
    // endpoints) — for any wall cluster at a junction the resolver guarantees
    // every member's baseLine converges to the same point (lateral face for
    // §T-INTO-CORNER, bisector miter for non-perpendicular L).  The corner-snap
    // pre-pass below absorbs the residual offset from `hostThickness/2` and
    // miter-bisector trim.  See file-header notes for the full rationale.
    // §DIAG-ROOM-LOOP / §TJUNCTION-SHELL-THICKNESS: thickness of every host wall by
    // BASE id (sub-segment suffixes stripped at lookup time). _splitAtTJunctions uses
    // this to widen the T-junction snap radius to cover a thick host's half-thickness:
    // the WallJoinResolver §PARTITION-SHELL-INNER-FACE clamp pulls a partition endpoint
    // back to the shell's INNER FACE — i.e. hostHalfThickness from the shell centreline.
    // For a shell ≥ 0.40 m the endpoint then sits ≥ 0.20 m from the centreline, beyond
    // the legacy fixed 0.20 m snap, so the T-junction is missed and the room loop floods.
    const thicknessByBaseId = new Map<string, number>();
    for (const wall of walls) {
      if (typeof wall.thickness === 'number' && wall.thickness > 0) {
        thicknessByBaseId.set(wall.id, wall.thickness);
      }
    }
    for (const cw of curtainWalls) {
      const t = (cw as { thickness?: number }).thickness;
      if (typeof t === 'number' && t > 0) thicknessByBaseId.set(cw.id, t);
    }

    const wallGraphInput: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> = [];
    for (const wall of walls) {
      if (wall.curve) {
        const wStart = new THREE.Vector3(wall.baseLine[0].x, wall.baseLine[0].y ?? levelElevation, wall.baseLine[0].z);
        const wEnd   = new THREE.Vector3(wall.baseLine[1].x, wall.baseLine[1].y ?? levelElevation, wall.baseLine[1].z);
        const ctrl   = new THREE.Vector3(wall.curve.control.x, wall.curve.control.y ?? levelElevation, wall.curve.control.z);
        const pts    = PathResolver.toPolyline({ kind: 'Arc', start: wStart, end: wEnd, control: ctrl }, wall.curve.segments ?? 16);
        for (let i = 0; i < pts.length - 1; i++) {
          wallGraphInput.push({ wallUUID: `${wall.id}_c${i}`, start: pts[i], end: pts[i + 1] });
        }
      } else {
        wallGraphInput.push({
          wallUUID: wall.id,
          start: new THREE.Vector3(wall.baseLine[0].x, wall.baseLine[0].y ?? levelElevation, wall.baseLine[0].z),
          end:   new THREE.Vector3(wall.baseLine[1].x, wall.baseLine[1].y ?? levelElevation, wall.baseLine[1].z),
        });
      }
    }

    // Curtain wall segments — only when toggle ON
    const curtainGraphInput = curtainWalls.map(cw => ({
      wallUUID: cw.id,
      start: new THREE.Vector3(cw.baseLine[0].x, cw.baseLine[0].y ?? levelElevation, cw.baseLine[0].z),
      end:   new THREE.Vector3(cw.baseLine[1].x, cw.baseLine[1].y ?? levelElevation, cw.baseLine[1].z),
    }));

    // Room Bounding Line segments — virtual partitions placed by the user
    const rblGraphInput = roomBoundingLines.map(rbl => ({
      wallUUID: rbl.id,
      start: new THREE.Vector3(rbl.placement.start.x, levelElevation, rbl.placement.start.z),
      end:   new THREE.Vector3(rbl.placement.end.x,   levelElevation, rbl.placement.end.z),
    }));

    // Column footprint edges — only when toggle ON
    // Each rectangular column contributes 4 edges forming its footprint perimeter.
    // Circular columns use their bounding square as an approximation.
    const columnGraphInput: typeof wallGraphInput = [];
    if (includeColumns && this.columnStore) {
      const columnsOnLevel = this.columnStore.getAll().filter(c => c.levelId === levelId);
      for (const col of columnsOnLevel) {
        const cx = col.position.x;
        const cz = col.position.z;
        const hw = (col.width  ?? 0.3) / 2;
        const hd = (col.depth  ?? 0.3) / 2;
        const y  = levelElevation;
        // Four corner points of the column footprint (clockwise in XZ plane)
        const corners: [number, number][] = [
          [cx - hw, cz - hd],
          [cx + hw, cz - hd],
          [cx + hw, cz + hd],
          [cx - hw, cz + hd],
        ];
        for (let i = 0; i < 4; i++) {
          const [sx, sz] = corners[i];
          const [ex, ez] = corners[(i + 1) % 4];
          columnGraphInput.push({
            wallUUID: `${col.id}_col_edge_${i}`,
            start: new THREE.Vector3(sx, y, sz),
            end:   new THREE.Vector3(ex, y, ez),
          });
        }
      }
    }

    // Merge all segment sources into one unified input array
    const combinedInput = [...wallGraphInput, ...curtainGraphInput, ...rblGraphInput, ...columnGraphInput];

    if (includeCurtainWalls && curtainWalls.length > 0) {
      console.debug(`[RoomDetectionEngine] Including ${curtainWalls.length} curtain wall(s) in room detection on level '${levelId}'`);
    }
    if (includeColumns && columnGraphInput.length > 0) {
      console.debug(`[RoomDetectionEngine] Including ${columnGraphInput.length / 4} column(s) (${columnGraphInput.length} edges) in room detection on level '${levelId}'`);
    }
    if (roomBoundingLines.length > 0) {
      console.debug(`[RoomDetectionEngine] Including ${roomBoundingLines.length} room bounding line(s) on level '${levelId}'`);
    }

    // Pre-pass: snap near-miss corners so that walls forming a closed loop
    // but with a small numerical gap are treated as connected.
    //
    // §JOIN-TRIM-FIX (Apr 2026): threshold widened from 0.05 m → 0.30 m.
    //   The §STRICT-ROOMS pass had tightened this to 50 mm to avoid the false
    //   fusions that the legacy 1 m radius produced.  In practice 50 mm is
    //   smaller than the legitimate join-resolver offsets (`hostThickness/2`
    //   for §T-INTO-CORNER trims, and `t/(2·tan(half-angle))` for non-90° L
    //   miter bisector extensions — up to ~370 mm at 150° corners on 200 mm
    //   walls).  Those offsets are the resolver's correct rendering geometry,
    //   not user error, so the topology engine must absorb them.  300 mm
    //   covers typical interior walls up to 600 mm thick and oblique miter
    //   offsets through ~150° while staying well below room-dimension scales
    //   (>0.5 m for any normal floor plan), so unrelated wall ends are not
    //   accidentally fused.  See file-header notes for the full rationale.
    const wallGraphInputCornerSnapped = this._snapNearbyCorners(combinedInput, 0.30);

    // §PARTITION-REACH (tracker §68.12, 2026-06-11) — reconnect a DANGLING partition
    // endpoint that the editor's whole-level WallJoinResolver trimmed ~0.3–1.2 m short
    // of the host it was meant to T-junction onto. ROOT CAUSE: on a generated house the
    // engine emits 3 partitions meeting at one EXACT Y-junction point; the resolver then
    // CLUSTERS those endpoints and, finding no pinnable pair, TRIMS one member back along
    // its own axis (§MULTI-CLUSTER pinned=0 trimmed=N) — leaving a free end up to ~1 m
    // from the host wall's body. That gap vastly exceeds the thickness-driven T-junction
    // snap (≤ 0.20 m for a thin partition), so `_splitAtTJunctions` misses it → the room
    // loop never closes → RoomDetection floods across the gap → the founder's compound
    // merges ("Kitchen / Dining", "Bedroom 2 / Corridor"), 55.7 m² no-door flood cell,
    // and HABITABLE-ON-STAIR.
    //
    // This pass moves ONLY a GENUINELY-DANGLING endpoint (not connected to ANY other
    // wall by corner OR existing T-junction) onto the nearest host wall BODY when the
    // dangling wall RUNS UP TO that host (the gap direction is collinear with the wall's
    // own axis, and the perpendicular foot is strictly INSIDE the host span). A precisely-
    // drawn plan has NO such ends — every partition either already meets its host (within
    // the corner/T-snap, so it is NOT dangling) or genuinely terminates free in open space
    // (its axis does NOT aim at a host body) — so the pass is a strict no-op there. Bounded
    // reach + collinearity + dangling guards keep it from teleporting unrelated walls (the
    // §STRICT-ROOMS hazard). Runs BEFORE body-crossing + T-junction split so the reconnected
    // endpoint is then split into the host exactly like a clean emit.
    const wallGraphInputReconnected = this._reconnectDanglingEnds(wallGraphInputCornerSnapped, thicknessByBaseId);

    // Pre-pass: split walls at true body-to-body crossings (X-junctions).
    // When a partition wall physically crosses through another wall (e.g. extends
    // past the outer wall on both sides) this splits BOTH walls at the exact
    // intersection point so the graph builder sees them as connected nodes.
    // This is the critical fix for "room not detected when wall doesn't end precisely
    // at the intersection point with an existing wall".
    const wallGraphInputCrossings = this._splitAtBodyCrossings(wallGraphInputReconnected);

    // Split walls at T-junctions AND snap guest endpoints to split points.
    // This ensures interior partition endpoints share the exact same coordinates
    // as the outer wall sub-segment endpoints, collapsing to the same graph node.
    const wallGraphInputSplit = this._splitAtTJunctions(wallGraphInputCrossings, thicknessByBaseId);

    const wallGraph = buildWallGraph(wallGraphInputSplit);
    const topology = computeTopology(wallGraph);

    if (!topology.hasValidTopology || topology.rooms.length === 0) {
      console.debug(`[RoomDetectionEngine] No enclosed rooms detected on level '${levelId}'`);
      return [];
    }

    const now = Date.now();
    const detected: RoomData[] = [];
    let colourIdx = 0;

    for (const detectedRoom of topology.rooms) {
      // Use polygon vertices directly from the face traversal — these are WallGraph node
      // positions and are guaranteed to form a closed polygon in the correct order.
      // Fall back to wall-endpoint tracing only if the topology engine gave no vertices.
      let polygon: RoomVertex[];
      if (detectedRoom.polygonVertices && detectedRoom.polygonVertices.length >= 3) {
        polygon = detectedRoom.polygonVertices.map(v => ({ x: v.x, z: v.z }));
      } else {
        polygon = this._polygonFromBoundaryWalls(
          detectedRoom.boundaryWallIds,
          walls,
          detectedRoom.centroid,
        );
      }

      const sanitised = sanitisePolygon(polygon);
      if (!sanitised) {
        console.debug(`[RoomDetectionEngine] Degenerate polygon for detected room — skipping`);
        continue;
      }

      // §A.21.D58 — the face-tracer can emit a SELF-INTERSECTING ring on the
      // upper (central-stair) storey: a pinch/figure-8 where a partition bridges
      // the outer shell to the stairwell-void loop, or a collinear spur left by a
      // dangling / §WJR-INVALID edge. Such a polygon fails RoomStore's isSimple()
      // Zod gate and the room is silently dropped (missing floor/furniture).
      // Detect-and-repair into the largest simple ring so the room registers.
      // Ground-floor rooms (already simple) pass through untouched.
      let finalPolygon = sanitised;
      if (!isSimple(sanitised)) {
        const repaired = repairToSimplePolygon(sanitised);
        if (!repaired) {
          console.warn(
            `[RoomDetectionEngine] Self-intersecting room boundary could not be ` +
            `repaired to a simple polygon (${sanitised.length} verts) — skipping`,
          );
          continue;
        }
        console.debug(
          `[RoomDetectionEngine] §A.21.D58 repaired self-intersecting boundary: ` +
          `${sanitised.length} → ${repaired.length} verts (largest simple ring)`,
        );
        finalPolygon = repaired;
      }

      ensureCCW(finalPolygon);

      const boundary: RoomBoundary = {
        polygon: finalPolygon,
        height: levelHeight,
        baseOffset: 0,
        detectionMethod: 'auto-topology',
      };

      const computed = computeRoomMetrics(boundary);

      if (computed.area < MIN_ROOM_AREA_M2) {
        console.debug(`[RoomDetectionEngine] Room area ${computed.area.toFixed(2)} m² < minimum — skipping`);
        continue;
      }

      // Assign a distinct colour from the cycling palette so each detected room
      // is visually distinguishable before the user assigns occupancy types.
      const colour = DETECTION_COLOUR_PALETTE[colourIdx % DETECTION_COLOUR_PALETTE.length];
      colourIdx++;

      const room: RoomData = {
        id:               crypto.randomUUID(),
        type:             'room',
        levelId,
        parentId:         levelId,
        name:             '',
        roomNumber:       '',
        boundary,
        boundingWallIds:  [...new Set(detectedRoom.boundaryWallIds.map(wid => {
          // Strip all sub-segment suffixes produced by the detection pre-passes:
          //   _s\d+  — from _splitAtTJunctions  (T-junction splits)
          //   _c\d+  — from _splitAtBodyCrossings (body crossing splits)
          // Both may be stacked (e.g. "wallId_c0_s1") when a crossing sub-segment
          // is further split at a T-junction. Strip all trailing _c/_s tokens so
          // boundingWallIds always contains the ORIGINAL WallStore IDs.
          // Doors and windows reference original IDs — any suffix mismatch produces
          // zero results in all contained-element lookups.
          return wid.replace(/(_[cs]\d+)+$/, '');
        }))],
        boundingSlabIds:  [],
        boundingColumnIds: [],
        occupancyType:    'unclassified',
        colour,
        finishes:         {},
        computed,
        properties:       {},
        metadata: {
          createdAt:        now,
          modifiedAt:       now,
          createdBy:        'system',
          version:          1,
          detectionVersion: 1,
        },
      };

      detected.push(room);
    }

    console.log(`[RoomDetectionEngine] Detected ${detected.length} room(s) on level '${levelId}'`);

    // §DIAG-ROOM-LOOP (2026-06-11): flag any partition endpoint that sits on a host
    // wall's BODY (mid-span) but beyond the legacy fixed 0.20 m T-junction floor — the
    // signature of a §PARTITION-SHELL-INNER-FACE clamp onto a thick shell. Each such
    // endpoint is a room-loop break UNLESS the data-driven per-host snap now covers it.
    // A flagged endpoint with coveredByHostSnap=false means the loop did NOT close and
    // detection will flood (founder's "Room NN" blanks + compound merges).
    this._diagRoomLoop(combinedInput, thicknessByBaseId, levelId, detected.length);

    return detected;
  }

  /**
   * §DIAG-ROOM-LOOP — always-on room-loop-break audit. For every guest endpoint that
   * projects onto another wall's mid-span (a body T-junction), report whether the
   * guest→host-centreline distance is within that host's snap radius. Distances above
   * the legacy 0.20 m floor but within the widened per-host radius are the thick-shell
   * partition endpoints this fix rescues; any distance ABOVE the per-host radius is a
   * genuine loop break the engine could not close.
   */
  private _diagRoomLoop(
    segs: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
    thicknessByBaseId: Map<string, number>,
    levelId: string,
    detectedRoomCount: number,
  ): void {
    const SNAP_FLOOR = 0.20;
    const SHELL_MARGIN = 0.02;
    let flagged = 0;
    let breaks = 0;
    for (const host of segs) {
      const dx = host.end.x - host.start.x;
      const dz = host.end.z - host.start.z;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-6) continue;
      const baseId = host.wallUUID.replace(/(_[cs]\d+)+$/, '');
      const th = thicknessByBaseId.get(baseId);
      const hostSnap = (typeof th === 'number' && th > 0)
        ? Math.max(SNAP_FLOOR, th / 2 + SHELL_MARGIN)
        : SNAP_FLOOR;
      for (const guest of segs) {
        if (guest.wallUUID === host.wallUUID) continue;
        for (const pt of [guest.start, guest.end]) {
          const t = ((pt.x - host.start.x) * dx + (pt.z - host.start.z) * dz) / len2;
          if (t <= 0.01 || t >= 0.99) continue; // endpoint zone, not a body-T
          const cx = host.start.x + t * dx;
          const cz = host.start.z + t * dz;
          const dist = Math.hypot(pt.x - cx, pt.z - cz);
          if (dist <= SNAP_FLOOR || dist >= hostSnap + 1e-6) {
            // Within legacy floor (always fine) OR beyond even the widened radius.
            if (dist > SNAP_FLOOR && dist >= hostSnap + 1e-6 && dist < 1.0) {
              breaks++;
              console.warn(
                `[RoomDetectionEngine] §DIAG-ROOM-LOOP BREAK level='${levelId}' guest=${guest.wallUUID} ` +
                `on host=${host.wallUUID} body — endpoint ${(dist * 1000).toFixed(0)}mm from centreline ` +
                `EXCEEDS hostSnap ${(hostSnap * 1000).toFixed(0)}mm → loop will NOT close (flood/merge risk)`,
              );
            }
            continue;
          }
          // dist in (SNAP_FLOOR, hostSnap] — rescued only by the data-driven widening.
          flagged++;
          console.log(
            `[RoomDetectionEngine] §DIAG-ROOM-LOOP level='${levelId}' guest=${guest.wallUUID} → ` +
            `thick-shell host=${host.wallUUID} (thick=${((th ?? 0) * 1000).toFixed(0)}mm): endpoint ` +
            `${(dist * 1000).toFixed(0)}mm from centreline > 200mm floor, coveredByHostSnap=✓ ` +
            `(hostSnap=${(hostSnap * 1000).toFixed(0)}mm) — T-junction registers, room loop closes`,
          );
        }
      }
    }
    console.log(
      `[RoomDetectionEngine] §DIAG-ROOM-LOOP level='${levelId}' detectedRooms=${detectedRoomCount} ` +
      `thickShellTJunctionsRescued=${flagged} unresolvedLoopBreaks=${breaks}`,
    );
  }

  /**
   * §PARTITION-REACH (tracker §68.12, 2026-06-11) — reconnect a DANGLING partition
   * endpoint onto the host wall body it was meant to meet.
   *
   * THE DEFECT it closes (verified by repro): on a generated multi-room house the
   * D-TGL engine emits up to 3 interior partitions sharing one EXACT Y-junction point.
   * The editor's whole-level WallJoinResolver then clusters those coincident endpoints,
   * finds no pinnable pair, and TRIMS one member back along its own axis (its
   * §MULTI-CLUSTER pinned=0 trimmed=N path) — leaving that partition's end up to ~1 m
   * SHORT of the host. The thickness-driven T-junction snap (`_splitAtTJunctions`,
   * ≤ 0.20 m for a thin partition) cannot bridge a ~1 m gap, so the loop never closes
   * and detection floods across it → the founder's compound merges + flood cells.
   *
   * THE FIX — move ONLY a genuinely-DANGLING endpoint onto the nearest host BODY when:
   *   (a) DANGLING: the endpoint is not already connected to ANY other wall — it has no
   *       other endpoint within {@link CORNER_CONNECTED_TOL_M} AND does not already lie
   *       within that host's T-snap radius of any wall body (so a clean junction is
   *       NEVER touched — the pass is a strict no-op on a precisely-drawn / clean-emit
   *       plan);
   *   (b) RUNS-UP-TO the host: the gap from the endpoint to its perpendicular foot on the
   *       host is COLLINEAR with the dangling wall's own axis (|cos| ≥ {@link REACH_COLLINEAR_MIN})
   *       — i.e. the partition aims at the host, it is not a wall that merely passes near
   *       a parallel neighbour;
   *   (c) BOUNDED + INTERIOR: the gap ≤ {@link REACH_MAX_M} and the perpendicular foot is
   *       strictly INSIDE the host span (a real body-T, not an end-to-end corner — corners
   *       are owned by `_snapNearbyCorners`).
   *
   * A wall that genuinely terminates free in open space (a peninsula / return) fails (b)
   * — its axis does not point at a host body — so it is left untouched. The reconnected
   * endpoint then flows into `_splitAtBodyCrossings` + `_splitAtTJunctions` and closes the
   * loop exactly like a clean emit. Pure geometry; deterministic (stable nearest-host pick
   * tie-broken by the smaller gap then wallUUID).
   */
  private _reconnectDanglingEnds(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
    thicknessByBaseId?: Map<string, number>,
  ): Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> {
    if (walls.length < 2) {
      return walls.map(w => ({ wallUUID: w.wallUUID, start: w.start.clone(), end: w.end.clone() }));
    }

    // Endpoint is "already connected" to another wall within this distance (corner) — it
    // is NOT dangling. Matches `_snapNearbyCorners`'s 0.30 m corner radius so anything that
    // pass fused is excluded here (no double handling).
    const CORNER_CONNECTED_TOL_M = 0.30;
    // Max gap a dangling end may be moved to reach a host body. Covers the observed
    // ~0.96 m resolver trim with headroom, but well below a real room dimension so a wall
    // is never dragged across a room. (A gap beyond this is left for the §DIAG-ROOM-LOOP
    // audit to flag — it is not a confident reconnection.)
    const REACH_MAX_M = 1.25;
    // The gap direction must be ≥ this |cos| with the dangling wall's own axis — the
    // partition RUNS UP TO the host, it is not merely near a parallel neighbour. ~25°.
    const REACH_COLLINEAR_MIN = 0.9;
    // Strictly-interior margin on the host span (a body-T, not a corner the snap owns).
    const SPAN_MARGIN_M = 0.05;
    const SNAP_FLOOR = 0.20;
    const SHELL_MARGIN = 0.02;

    const result = walls.map(w => ({ wallUUID: w.wallUUID, start: w.start.clone(), end: w.end.clone() }));

    const snapForHost = (hostUUID: string): number => {
      if (!thicknessByBaseId || thicknessByBaseId.size === 0) return SNAP_FLOOR;
      const baseId = hostUUID.replace(/(_[cs]\d+)+$/, '');
      const th = thicknessByBaseId.get(baseId);
      if (typeof th !== 'number' || th <= 0) return SNAP_FLOOR;
      return Math.max(SNAP_FLOOR, th / 2 + SHELL_MARGIN);
    };

    // Flat endpoint list (reference into `result` so a move mutates the segment).
    type Side = 'start' | 'end';
    interface EpRef { wallIdx: number; side: Side; x: number; z: number }
    const eps: EpRef[] = [];
    for (let i = 0; i < result.length; i++) {
      eps.push({ wallIdx: i, side: 'start', x: result[i]!.start.x, z: result[i]!.start.z });
      eps.push({ wallIdx: i, side: 'end',   x: result[i]!.end.x,   z: result[i]!.end.z   });
    }

    // Closest point on segment + perpendicular distance + along-param (metres).
    const closestOnSeg = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      if (len2 < 1e-9) return { fx: ax, fz: az, perp: Math.hypot(px - ax, pz - az), along: 0, len: 0 };
      const len = Math.sqrt(len2);
      let t = ((px - ax) * dx + (pz - az) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const fx = ax + t * dx, fz = az + t * dz;
      return { fx, fz, perp: Math.hypot(px - fx, pz - fz), along: t * len, len };
    };

    // True when endpoint (px,pz) is ALREADY connected to wall `oi` — either by a near
    // corner (any of its endpoints within the corner tol) or already on its body within
    // that host's T-snap radius. Such an endpoint is NOT dangling and is skipped.
    const connectedToWall = (px: number, pz: number, oi: number): boolean => {
      const o = result[oi]!;
      if (Math.hypot(px - o.start.x, pz - o.start.z) <= CORNER_CONNECTED_TOL_M) return true;
      if (Math.hypot(px - o.end.x,   pz - o.end.z)   <= CORNER_CONNECTED_TOL_M) return true;
      const c = closestOnSeg(px, pz, o.start.x, o.start.z, o.end.x, o.end.z);
      if (c.len > 1e-6 && c.along > SPAN_MARGIN_M && c.along < c.len - SPAN_MARGIN_M
        && c.perp <= snapForHost(o.wallUUID)) return true;     // already a body-T
      return false;
    };

    let reconnected = 0;
    for (const ep of eps) {
      const ownIdx = ep.wallIdx;
      // (a) DANGLING — not already connected to ANY other wall.
      let dangling = true;
      for (let oi = 0; oi < result.length && dangling; oi++) {
        if (oi === ownIdx) continue;
        if (connectedToWall(ep.x, ep.z, oi)) dangling = false;
      }
      if (!dangling) continue;

      // The dangling wall's OWN axis (unit), pointing OUTWARD from the far end through
      // this endpoint (the direction the partition is heading).
      const own = result[ownIdx]!;
      const farX = ep.side === 'start' ? own.end.x : own.start.x;
      const farZ = ep.side === 'start' ? own.end.z : own.start.z;
      const adx = ep.x - farX, adz = ep.z - farZ;
      const aLen = Math.hypot(adx, adz);
      if (aLen < 1e-6) continue;
      const aux = adx / aLen, auz = adz / aLen;

      // The nearest host TARGET this endpoint runs up to (collinear, bounded). Two kinds,
      // both guarded identically (dangling + collinear + bounded):
      //   • BODY-T — perpendicular foot strictly INSIDE a host span (the classic T-junction
      //              the resolver trimmed away from);
      //   • CORNER — the dangling axis aims at another wall's ENDPOINT (the host is split into
      //              two COLLINEAR segments meeting exactly at the targeted junction, so the
      //              body-T test alone misses it — the foot falls at the shared end). A bounded
      //              collinear corner-reach onto a free end is safe BECAUSE this endpoint is
      //              provably dangling (connects to nothing).
      const cands: Array<{ fx: number; fz: number; gap: number; hostUUID: string }> = [];
      for (let oi = 0; oi < result.length; oi++) {
        if (oi === ownIdx) continue;
        const o = result[oi]!;
        const c = closestOnSeg(ep.x, ep.z, o.start.x, o.start.z, o.end.x, o.end.z);
        if (c.len < 1e-6) continue;
        const interior = c.along > SPAN_MARGIN_M && c.along < c.len - SPAN_MARGIN_M;
        let tx = 0, tz = 0, gap = -1;
        if (interior) {
          // (c) BODY-T — bounded gap beyond the host's own T-snap radius.
          if (c.perp > snapForHost(o.wallUUID)) { tx = c.fx; tz = c.fz; gap = c.perp; }
        } else {
          // CORNER — the foot is at (or past) a host end; aim at the NEARER host endpoint.
          const ds = Math.hypot(ep.x - o.start.x, ep.z - o.start.z);
          const de = Math.hypot(ep.x - o.end.x,   ep.z - o.end.z);
          // Only a gap beyond the corner-snap (≥ CORNER_CONNECTED_TOL_M, already excluded as
          // "connected") is a real reach; nearer ones were handled by _snapNearbyCorners.
          if (ds <= de && ds > CORNER_CONNECTED_TOL_M) { tx = o.start.x; tz = o.start.z; gap = ds; }
          else if (de < ds && de > CORNER_CONNECTED_TOL_M) { tx = o.end.x; tz = o.end.z; gap = de; }
        }
        if (gap <= 0 || gap > REACH_MAX_M) continue;
        const gdx = (tx - ep.x) / gap, gdz = (tz - ep.z) / gap;
        if (Math.abs(gdx * aux + gdz * auz) < REACH_COLLINEAR_MIN) continue;   // (b) collinear
        cands.push({ fx: tx, fz: tz, gap, hostUUID: o.wallUUID });
      }
      // Deterministic pick: smallest gap, tie-broken by hostUUID.
      cands.sort((a, b) => (a.gap - b.gap) || (a.hostUUID < b.hostUUID ? -1 : a.hostUUID > b.hostUUID ? 1 : 0));
      const chosen = cands.length > 0 ? cands[0]! : null;

      if (chosen) {
        const seg = result[ownIdx]!;
        if (ep.side === 'start') { seg.start.x = chosen.fx; seg.start.z = chosen.fz; }
        else { seg.end.x = chosen.fx; seg.end.z = chosen.fz; }
        ep.x = chosen.fx; ep.z = chosen.fz;
        reconnected++;
        console.log(
          `[RoomDetectionEngine] §DIAG-PARTITION-REACH reconnected guest=${seg.wallUUID}.${ep.side} ` +
          `onto host=${chosen.hostUUID} body — closed a ${(chosen.gap * 1000).toFixed(0)}mm dangling gap ` +
          `(resolver-trim recovery; loop now closes)`,
        );
      }
    }

    if (reconnected > 0) {
      console.log(`[RoomDetectionEngine] §DIAG-PARTITION-REACH reconnected ${reconnected} dangling partition end(s)`);
    }
    return result;
  }

  /**
   * Merges detected rooms with existing rooms to preserve semantic data.
   * For each detected room, finds the existing room whose centroid is within
   * CENTROID_MATCH_RADIUS. If matched, copies semantic fields from existing room.
   * If no match, keeps the detected room with empty semantics.
   * (Semantic Preservation Rule — §R-9)
   */
  mergeWithExisting(detected: RoomData[], existing: RoomData[]): RoomData[] {
    const now = Date.now();

    // PARTITION-FIX (Apr 2026): Track which existing room IDs have already been
    // claimed during this merge so a single existing room cannot be matched by
    // multiple detected polygons. Without this, splitting an existing room
    // (e.g. by drawing an internal partition wall) caused both halves to match
    // the same parent room → both halves got the parent's ID → second
    // roomStore.update() overwrote the first → net 1 room instead of 2.
    const used = new Set<string>();

    return detected.map(d => {
      const match = this._findBestCentroidMatch(d, existing, used);
      if (!match) return d;

      used.add(match.id);

      // Preserve semantic data from existing matched room
      const merged: RoomData = {
        ...d,
        id:            match.id,    // preserve ID so undo works
        name:          match.name,
        roomNumber:    match.roomNumber,
        department:    match.department,
        occupancyType: match.occupancyType,
        occupancyLoad: match.occupancyLoad,
        programmeArea: match.programmeArea,
        finishes:      { ...match.finishes },
        colour:        match.colour ?? d.colour, // preserve existing colour, fall back to newly assigned
        opacity:       match.opacity,
        properties:    { ...match.properties },
        ifcData:       match.ifcData,
        revitId:       match.revitId,
        phase:         match.phase,
        metadata: {
          ...match.metadata,
          modifiedAt:       now,
          detectionVersion: (match.metadata.detectionVersion ?? 0) + 1,
        },
      };

      return merged;
    });
  }

  // ── Private Helpers ──────────────────────────────────────────────────────────

  private _findBestCentroidMatch(
    detected: RoomData,
    existing: RoomData[],
    used: Set<string> = new Set<string>(),
  ): RoomData | undefined {
    const { x: cx, z: cz } = detected.computed.centroid;
    let best: RoomData | undefined;
    let bestDist = CENTROID_MATCH_RADIUS;

    for (const room of existing) {
      if (used.has(room.id)) continue;          // already claimed by another detected room
      const dx = room.computed.centroid.x - cx;
      const dz = room.computed.centroid.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist < bestDist) {
        bestDist = dist;
        best = room;
      }
    }

    return best;
  }

  /**
   * Derives a polygon from wall endpoints.
   * Orders vertices by tracing connected wall segments around the boundary.
   * Falls back to centroid-sorted ordering if tracing fails.
   */
  private _polygonFromBoundaryWalls(
    wallIds: string[],
    allWalls: import('@pryzm/geometry-wall').WallData[],
    centroid: { x: number; z: number },
  ): RoomVertex[] {
    const wallMap = new Map(allWalls.map(w => [w.id, w]));
    const boundaryWalls = wallIds.map(id => wallMap.get(id)).filter(Boolean) as import('@pryzm/geometry-wall').WallData[];

    if (boundaryWalls.length === 0) {
      return [];
    }

    // Build endpoint pairs — curved walls are tessellated into arc sub-segments
    // so the traced chain follows the arc shape rather than a straight chord.
    //
    // §JOIN-TRIM-FIX (Apr 2026): use `baseLine` (post-resolver, world-space
    // endpoints) for the same reason as the main wallGraphInput build above —
    // every wall in a junction cluster converges to the same baseLine point.
    const segments: Array<{ a: RoomVertex; b: RoomVertex; wallId: string }> = [];
    for (const w of boundaryWalls) {
      if (w.curve) {
        const wStart = new THREE.Vector3(w.baseLine[0].x, 0, w.baseLine[0].z);
        const wEnd   = new THREE.Vector3(w.baseLine[1].x, 0, w.baseLine[1].z);
        const ctrl   = new THREE.Vector3(w.curve.control.x, 0, w.curve.control.z);
        const pts    = PathResolver.toPolyline({ kind: 'Arc', start: wStart, end: wEnd, control: ctrl }, w.curve.segments ?? 16);
        for (let i = 0; i < pts.length - 1; i++) {
          segments.push({ a: { x: pts[i].x, z: pts[i].z }, b: { x: pts[i + 1].x, z: pts[i + 1].z }, wallId: w.id });
        }
      } else {
        segments.push({
          a: { x: w.baseLine[0].x, z: w.baseLine[0].z },
          b: { x: w.baseLine[1].x, z: w.baseLine[1].z },
          wallId: w.id,
        });
      }
    }

    // Try to trace connected chain
    const traced = this._traceConnectedChain(segments);
    if (traced.length >= 3) {
      return traced;
    }

    // Fallback: sort all endpoints by angle from centroid
    const allPoints: RoomVertex[] = [];
    for (const seg of segments) {
      allPoints.push(seg.a, seg.b);
    }

    // Deduplicate and sort by angle
    const unique = this._deduplicatePoints(allPoints);
    unique.sort((a, b) => {
      const angleA = Math.atan2(a.z - centroid.z, a.x - centroid.x);
      const angleB = Math.atan2(b.z - centroid.z, b.x - centroid.x);
      return angleA - angleB;
    });

    return unique;
  }

  private _traceConnectedChain(
    segments: Array<{ a: RoomVertex; b: RoomVertex; wallId: string }>,
  ): RoomVertex[] {
    if (segments.length === 0) return [];

    const SNAP = 0.05; // metres — snap tolerance for shared endpoints
    const snap = (v: RoomVertex) => `${Math.round(v.x / SNAP)},${Math.round(v.z / SNAP)}`;

    const remaining = [...segments];
    const chain: RoomVertex[] = [remaining[0].a, remaining[0].b];
    remaining.splice(0, 1);

    let iterations = 0;
    const maxIter = segments.length * 2 + 4;

    while (remaining.length > 0 && iterations < maxIter) {
      iterations++;
      const tail = chain[chain.length - 1];
      const tailKey = snap(tail);

      let found = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const aKey = snap(seg.a);
        const bKey = snap(seg.b);

        if (aKey === tailKey) {
          chain.push(seg.b);
          remaining.splice(i, 1);
          found = true;
          break;
        } else if (bKey === tailKey) {
          chain.push(seg.a);
          remaining.splice(i, 1);
          found = true;
          break;
        }
      }

      if (!found) break;
    }

    // Remove closing duplicate if last ≈ first
    if (chain.length > 3) {
      const first = chain[0];
      const last = chain[chain.length - 1];
      if (Math.abs(first.x - last.x) < SNAP && Math.abs(first.z - last.z) < SNAP) {
        chain.pop();
      }
    }

    return chain;
  }

  private _deduplicatePoints(points: RoomVertex[]): RoomVertex[] {
    const SNAP = 0.05;
    const seen = new Set<string>();
    const result: RoomVertex[] = [];
    for (const p of points) {
      const key = `${Math.round(p.x / SNAP)},${Math.round(p.z / SNAP)}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(p);
      }
    }
    return result;
  }

  /**
   * Pre-pass: snap near-miss corner endpoints together so that walls forming a
   * visually-closed loop but with a small gap (up to `threshold` metres) are
   * treated as connected by the graph builder.
   *
   * ## Algorithm: Union-Find Clustering
   *
   * Previous implementation used pairwise midpoint snapping (O(n²×4)), which
   * has a well-known failure mode for 3+ endpoints that all belong to the same
   * corner: each pairwise snap moves endpoints to a different midpoint, leaving
   * them in distinct positions. With NODE_GRID_MM = 10 mm, even a 6 mm drift
   * is enough to produce separate graph nodes → no connection → room not detected.
   *
   * New implementation:
   *   1. Collect all wall endpoints into a flat list of refs.
   *   2. Build a union-find structure: join any two endpoints from DIFFERENT
   *      walls that are within `threshold` of each other.
   *   3. For each cluster (connected component), compute the centroid of ALL
   *      original positions in the cluster.
   *   4. Set every endpoint in the cluster to that same centroid.
   *
   * This guarantees all endpoints in the same "corner cluster" get an IDENTICAL
   * position, so they collapse to the same NODE_GRID_MM cell in buildWallGraph.
   *
   * Endpoints already co-located (dist < 1 mm) are considered pre-merged.
   * Only endpoint-to-endpoint snapping is performed here; T-junction
   * snapping (endpoint near wall interior) is handled by _splitAtTJunctions.
   *
   * @param walls     Input wall list (NOT mutated).
   * @param threshold Maximum gap in metres to bridge (e.g. 1.0).
   * @returns New array with cloned, potentially adjusted endpoints.
   */
  private _snapNearbyCorners(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
    threshold: number,
  ): Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> {
    if (walls.length < 2) {
      return walls.map(w => ({ wallUUID: w.wallUUID, start: w.start.clone(), end: w.end.clone() }));
    }

    // Clone all walls so we can safely mutate endpoints
    const result = walls.map(w => ({
      wallUUID: w.wallUUID,
      start: w.start.clone(),
      end:   w.end.clone(),
    }));

    // Build a flat list of endpoint references: { wallIdx, side, vec }
    type Side = 'start' | 'end';
    interface EpRef { wallIdx: number; side: Side; vec: THREE.Vector3; origX: number; origZ: number; }
    const eps: EpRef[] = [];
    for (let i = 0; i < result.length; i++) {
      eps.push({ wallIdx: i, side: 'start', vec: result[i].start, origX: result[i].start.x, origZ: result[i].start.z });
      eps.push({ wallIdx: i, side: 'end',   vec: result[i].end,   origX: result[i].end.x,   origZ: result[i].end.z   });
    }

    const n = eps.length;

    // ── Union-Find ─────────────────────────────────────────────────────────────
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(i: number): number {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    }
    function union(i: number, j: number): void {
      const ri = find(i); const rj = find(j);
      if (ri !== rj) parent[ri] = rj;
    }

    const threshSq = threshold * threshold;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        // Never merge endpoints from the same wall segment
        if (eps[i].wallIdx === eps[j].wallIdx) continue;

        const dx = eps[i].origX - eps[j].origX;
        const dz = eps[i].origZ - eps[j].origZ;
        const distSq = dx * dx + dz * dz;

        // Skip already-connected (< 1 mm) and pairs beyond threshold
        if (distSq < 0.000001 || distSq >= threshSq) continue;

        union(i, j);
      }
    }

    // ── Cluster → centroid ────────────────────────────────────────────────────
    // Group endpoints by their root. Compute centroid from ORIGINAL positions.
    const clusters = new Map<number, EpRef[]>();
    for (let i = 0; i < n; i++) {
      const root = find(i);
      if (!clusters.has(root)) clusters.set(root, []);
      clusters.get(root)!.push(eps[i]);
    }

    let snapCount = 0;
    for (const [, members] of clusters) {
      if (members.length < 2) continue; // singleton — nothing to snap

      // Centroid of all ORIGINAL positions in this cluster
      let sumX = 0; let sumZ = 0;
      for (const m of members) { sumX += m.origX; sumZ += m.origZ; }
      const cx = sumX / members.length;
      const cz = sumZ / members.length;

      // Set all endpoint vectors to the same centroid position
      for (const m of members) {
        m.vec.x = cx;
        m.vec.z = cz;
      }
      snapCount++;
    }

    if (snapCount > 0) {
      console.debug(`[RoomDetectionEngine] Corner snap (union-find): ${snapCount} cluster(s) merged`);
    }

    return result;
  }

  /**
   * Pre-pass: split walls at true body-to-body crossing points (X-junctions).
   *
   * ## Problem solved
   *
   * When a partition wall physically crosses through an outer wall — i.e. the
   * partition's line intersects the outer wall's line at a strictly interior point
   * of BOTH segments — neither `_snapNearbyCorners` nor `_splitAtTJunctions`
   * resolves the connectivity because:
   *   - The partition endpoints are far from each other (no corner snap applies).
   *   - Neither endpoint may be within SNAP (0.5 m) of the outer wall's interior
   *     (the endpoint extends past the outer wall by more than 0.5 m).
   *
   * ## Fix
   *
   * For every pair of wall segments (A, B) where segment A's LINE and segment B's
   * LINE intersect at strictly interior positions (tA ∈ (T_MARGIN, 1-T_MARGIN) and
   * tB ∈ (T_MARGIN, 1-T_MARGIN)):
   *   1. Split A into A₀ and A₁ at the intersection point P.
   *   2. Split B into B₀ and B₁ at the SAME intersection point P.
   *
   * Both sub-segments now share the exact same endpoint coordinates → they collapse
   * to the same NODE_GRID_MM cell in buildWallGraph → the planar graph is correctly
   * connected → face traversal produces the expected sub-rooms.
   *
   * ## Suffix convention
   *
   * Split sub-segments are named  `{originalUUID}_c{idx}` (c = crossing).
   * Walls that were NOT split retain their original UUID (no suffix).
   * When `_splitAtTJunctions` runs afterwards it may further split crossing
   * sub-segments into `{originalUUID}_c{i}_s{j}` — all suffixes are stripped
   * back to the original WallStore UUID in the `boundingWallIds` cleanup pass.
   *
   * @param walls  Input wall list (NOT mutated).
   * @returns New array with crossing-split sub-segments inserted.
   */
  private _splitAtBodyCrossings(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
  ): Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> {
    // splitWallsAtCrossings works on a { start, end } array (no wallUUID).
    const stripped = walls.map(w => ({ start: w.start, end: w.end }));
    const { result, splitCount } = splitWallsAtCrossings(stripped);

    if (splitCount === 0) {
      // Fast path — nothing was split; re-use existing objects to avoid alloc.
      return walls;
    }

    console.debug(
      `[RoomDetectionEngine] Body-crossing split: ${splitCount} crossing(s) resolved, ` +
      `${walls.length} wall(s) → ${result.length} segment(s)`,
    );

    // Count how many sub-segments each parent produces so we know whether to
    // keep the original UUID (1 sub-segment = not split) or add _c{idx}.
    const subCountPerParent = new Map<number, number>();
    for (const entry of result) {
      subCountPerParent.set(entry.parentIdx, (subCountPerParent.get(entry.parentIdx) ?? 0) + 1);
    }

    const subIdxPerParent = new Map<number, number>();

    return result.map(entry => {
      const parentUUID = walls[entry.parentIdx].wallUUID;
      const subCount = subCountPerParent.get(entry.parentIdx) ?? 1;

      if (subCount === 1) {
        // Wall was not split — preserve original UUID and clone vectors.
        return {
          wallUUID: parentUUID,
          start: entry.start.clone(),
          end: entry.end.clone(),
        };
      }

      const subIdx = subIdxPerParent.get(entry.parentIdx) ?? 0;
      subIdxPerParent.set(entry.parentIdx, subIdx + 1);

      return {
        wallUUID: `${parentUUID}_c${subIdx}`,
        start: entry.start.clone(),
        end: entry.end.clone(),
      };
    });
  }

  /**
   * Splits wall segments at T-junction points so that interior partition walls
   * properly create connected nodes in the WallGraph.
   *
   * ## The Fix (T-junction endpoint snapping)
   *
   * Previous behaviour: only the HOST wall was split. The GUEST wall's endpoint
   * remained at its original position (potentially up to SNAP=80mm from the split
   * point P). Because buildWallGraph quantises to a 10mm grid (NODE_GRID_MM), the
   * host sub-segment and the guest wall were placed in DIFFERENT nodes → no
   * connectivity → face traversal returned one big room.
   *
   * New behaviour: for each detected T-junction (host wall W at parameter t,
   * guest wall G whose endpoint E projects onto W within SNAP):
   *   1. Split W into sub-segments ending/starting exactly at P.
   *   2. Snap G's endpoint E to exactly P.
   *
   * Both the host sub-segment endpoint and the guest endpoint are now identical,
   * so buildWallGraph collapses them to the same grid node and the partition is
   * properly connected in the planar graph.
   *
   * Algorithm:
   *   Pass 1 — collect all T-junctions (O(n²) over endpoints × walls).
   *   Pass 2 — compute endpoint snaps for guest walls.
   *   Pass 3 — build split sub-segments for host walls + apply guest snaps.
   */
  private _splitAtTJunctions(
    walls: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }>,
    thicknessByBaseId?: Map<string, number>,
  ): Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> {
    // SNAP covers the common case where a wall endpoint was trimmed to the HOST FACE
    // (offset from the host centreline by hostWall.thickness/2). For typical interior
    // walls (100–200 mm thick) that offset is 50–100 mm; for thicker masonry walls
    // (up to 400 mm thick) it is up to 200 mm.
    //
    // §STRICT-ROOMS (Apr 2026): reduced from 0.75 m → 0.20 m.
    //   The previous 0.75 m radius caused unrelated wall endpoints up to 75 cm away
    //   from another wall's body to be teleported onto that wall's centreline,
    //   producing room polygons that bore no resemblance to the user's wall layout.
    //   200 mm covers walls up to 400 mm thick (which is already very thick) without
    //   distorting precisely-drawn floor plans.
    //
    // §TJUNCTION-SHELL-THICKNESS (2026-06-11): the fixed 200 mm floor SILENTLY MISSED
    //   T-junctions onto shells ≥ 0.40 m thick. The WallJoinResolver
    //   §PARTITION-SHELL-INNER-FACE clamp pulls each partition endpoint back to the
    //   host shell's INNER FACE — exactly hostHalfThickness from the centreline. The
    //   guest-endpoint→host-centreline distance measured here is therefore ≈
    //   hostHalfThickness; for a 0.40 m shell that is 0.20 m, NOT < 0.20, so the
    //   junction was dropped → the room loop never closed → detection flooded across
    //   the gap (founder's "Room NN" blanks + "Bedroom 1 / Bathroom" compound merges).
    //   Fix: make the snap radius DATA-DRIVEN per host — max(0.20, hostHalfT + margin).
    //   THIN shells (hostHalfT ≤ 0.20) are byte-identical: the floor still wins, so
    //   apartment 0.10 m partitions (hostHalfT 0.05) behave exactly as before.
    const SNAP = 0.20;        // metres — T-junction detection radius (floor)
    const SHELL_MARGIN = 0.02; // 20 mm safety so the inner-face endpoint clears the bound

    // Per-host snap radius: covers a thick host's half-thickness without inflating the
    // radius for thin walls. `host` is the wall being split (the shell); the guest
    // endpoint sits ≈ hostHalfThickness from this host's centreline after the clamp.
    const snapForHost = (hostUUID: string): number => {
      if (!thicknessByBaseId || thicknessByBaseId.size === 0) return SNAP;
      const baseId = hostUUID.replace(/(_[cs]\d+)+$/, '');
      const th = thicknessByBaseId.get(baseId);
      if (typeof th !== 'number' || th <= 0) return SNAP;
      return Math.max(SNAP, th / 2 + SHELL_MARGIN);
    };

    // ── Pass 1: collect all T-junction pairs ─────────────────────────────────

    interface TJunction {
      hostWallUUID: string;   // wall being split
      t: number;              // parametric split position on host wall (0–1)
      guestWallUUID: string;  // wall whose endpoint is snapped to the split point
      guestIsStart: boolean;  // true = guest.start is snapped; false = guest.end
    }

    const junctions: TJunction[] = [];

    for (const wall of walls) {
      const dx = wall.end.x - wall.start.x;
      const dz = wall.end.z - wall.start.z;
      const len2 = dx * dx + dz * dz;

      if (len2 < 1e-6) continue;

      // `wall` is the HOST being split. Widen the snap to cover its half-thickness
      // (see §TJUNCTION-SHELL-THICKNESS) so partition endpoints clamped to a thick
      // shell's INNER FACE are still recognised as T-junctions.
      const hostSnap = snapForHost(wall.wallUUID);

      for (const other of walls) {
        if (other.wallUUID === wall.wallUUID) continue;

        for (const [isStart, pt] of [
          [true,  other.start],
          [false, other.end],
        ] as [boolean, THREE.Vector3][]) {
          const t = ((pt.x - wall.start.x) * dx + (pt.z - wall.start.z) * dz) / len2;
          // Reduced endpoint exclusion zone from 5% to 1% so T-junctions very
          // close to the host wall's ends are still detected and split.
          if (t <= 0.01 || t >= 0.99) continue; // endpoint zone — not a T-junction

          const cx = wall.start.x + t * dx;
          const cz = wall.start.z + t * dz;
          const dist = Math.sqrt((pt.x - cx) ** 2 + (pt.z - cz) ** 2);

          if (dist < hostSnap) {
            junctions.push({
              hostWallUUID: wall.wallUUID,
              t,
              guestWallUUID: other.wallUUID,
              guestIsStart: isStart,
            });
          }
        }
      }
    }

    if (junctions.length === 0) {
      // No T-junctions — return walls as-is
      return walls.map(w => ({ wallUUID: w.wallUUID, start: w.start.clone(), end: w.end.clone() }));
    }

    console.debug(`[RoomDetectionEngine] Found ${junctions.length} T-junction(s)`);

    // ── Pass 2: compute EXACT split points and guest endpoint snaps ─────────
    //
    // Critical fix: both the host-split point and the guest endpoint snap
    // must reference the SAME Vector3 coordinates. Previous code computed
    // the guest snap from the exact j.t but recomputed the host split from
    // Math.round(j.t * 1000) / 1000 (rounded). For long walls (>5 m) the
    // 0.5 mm rounding on t produces up to 10 mm displacement → different
    // NODE_GRID_MM cells → disconnected graph → room not detected.
    //
    // Fix: store the exact splitPt (Vector3) in splitsPerHost, not the t
    // value.  Pass 3 uses the stored splitPt directly instead of recomputing.

    // Map: wallUUID → { start?: Vector3, end?: Vector3 } — overrides applied in Pass 3
    const endpointSnaps = new Map<string, { start?: THREE.Vector3; end?: THREE.Vector3 }>();

    // Map: hostWallUUID → Array<{ t: number, splitPt: THREE.Vector3 }>
    // Stores the t for ordering/deduplication AND the exact Vector3 for sub-segment boundaries.
    const splitsPerHost = new Map<string, Array<{ t: number; splitPt: THREE.Vector3 }>>();

    for (const j of junctions) {
      const host = walls.find(w => w.wallUUID === j.hostWallUUID);
      if (!host) continue;

      const dx = host.end.x - host.start.x;
      const dz = host.end.z - host.start.z;
      const y  = host.start.y;

      // EXACT split point on host wall centreline — used for BOTH the host
      // sub-segment boundary AND the guest endpoint snap.
      const splitPt = new THREE.Vector3(
        host.start.x + j.t * dx,
        y,
        host.start.z + j.t * dz,
      );

      // Record split for host wall (with exact point, not rounded t)
      if (!splitsPerHost.has(j.hostWallUUID)) splitsPerHost.set(j.hostWallUUID, []);
      splitsPerHost.get(j.hostWallUUID)!.push({ t: j.t, splitPt });

      // Record endpoint snap for guest wall — same exact splitPt as above
      if (!endpointSnaps.has(j.guestWallUUID)) endpointSnaps.set(j.guestWallUUID, {});
      const guestSnap = endpointSnaps.get(j.guestWallUUID)!;
      if (j.guestIsStart) {
        // Only snap if not already snapped (first junction wins)
        if (!guestSnap.start) guestSnap.start = splitPt.clone();
      } else {
        if (!guestSnap.end) guestSnap.end = splitPt.clone();
      }
    }

    // ── Pass 3: build result segments ────────────────────────────────────────

    const result: Array<{ wallUUID: string; start: THREE.Vector3; end: THREE.Vector3 }> = [];

    for (const wall of walls) {
      // Apply endpoint snaps for this wall (if it was a guest in any T-junction)
      const snap = endpointSnaps.get(wall.wallUUID);
      const wallStart = snap?.start ?? wall.start.clone();
      const wallEnd   = snap?.end   ?? wall.end.clone();

      const splits = splitsPerHost.get(wall.wallUUID);

      if (!splits || splits.length === 0) {
        // Not a host wall — emit as-is (with possibly snapped endpoints)
        result.push({ wallUUID: wall.wallUUID, start: wallStart, end: wallEnd });
        continue;
      }

      // Deduplicate by rounded t (1 mm precision) and sort ascending.
      // Use the STORED splitPt rather than recomputing from rounded t —
      // this guarantees host sub-segment endpoints exactly match the guest snaps.
      const seen1mm = new Set<number>();
      const uniqueSplits: Array<{ t: number; splitPt: THREE.Vector3 }> = [];
      for (const s of [...splits].sort((a, b) => a.t - b.t)) {
        const tKey = Math.round(s.t * 1000);
        if (!seen1mm.has(tKey)) {
          seen1mm.add(tKey);
          uniqueSplits.push(s);
        }
      }

      let prevPt = wallStart.clone();

      for (let i = 0; i < uniqueSplits.length; i++) {
        // Use the stored exact splitPt — NOT recomputed from rounded t.
        const splitPt = uniqueSplits[i].splitPt.clone();
        result.push({
          wallUUID: `${wall.wallUUID}_s${i}`,
          start:    prevPt.clone(),
          end:      splitPt,
        });
        prevPt = splitPt;
      }

      // Final sub-segment from last split point to wall end
      result.push({
        wallUUID: `${wall.wallUUID}_s${uniqueSplits.length}`,
        start:    prevPt.clone(),
        end:      wallEnd,
      });
    }

    return result;
  }
}
