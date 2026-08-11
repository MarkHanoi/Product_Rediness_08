/**
 * projectLoaderUtils.ts
 *
 * Utilities originally in src/engine/subsystems/core/persistence/ProjectLoader.ts,
 * extracted here for use by ImportProjectCommand (PROJECT-LOAD-PERFORMANCE-13 §2).
 *
 * Migrated to @pryzm/command-registry (Sprint H, 2026-05-10).
 */

import { ProjectSnapshot } from '@pryzm/core-app-model';
import { CreateRoofCommand } from '../roofs/CreateRoofCommand';
import { RoofType, RoofFootprint } from '@pryzm/geometry-roof';
// Type-only imports (erased at runtime — do NOT pull the command's heavy
// geometry/barrel graph into the pure-helper module, keeping these unit-testable
// without standing up the runtime).
import type { CreateFurniturePayload } from '../furniture/CreateFurnitureCommand';
import type { CreateAIElementPayload } from '../furniture/CreateAIElementCommand';
import type { CreateLightingPayload } from '../lighting/CreateLightingCommand';

/**
 * Build a CreateWallOpeningCommand opening payload by merging the wall-opening
 * descriptor with the rich window/door record (if present in the snapshot).
 */
export function findOpeningElementData(snapshot: ProjectSnapshot, opening: any): any {
    if (opening.type === 'window') {
        const win = snapshot.windows.find((w: any) => w.openingId === opening.id || w.id === opening.elementId);
        return win ? {
            frameThickness: win.frameThickness,
            frameWidth: win.frameWidth,
            frameColor: win.frameColor,
            windowType: win.windowType,
            fireRating: win.fireRating
        } : {};
    }
    if (opening.type === 'door') {
        const door = snapshot.doors.find((d: any) => d.openingId === opening.id || d.id === opening.elementId);
        return door ? {
            frameThickness: door.frameThickness,
            frameWidth: door.frameWidth,
            frameColor: door.frameColor,
            leafColor: door.leafColor,
            doorType: door.doorType,
            fireRating: door.fireRating,
            accessibilityType: door.accessibilityType
        } : {};
    }
    return {};
}

/**
 * §LOAD-HEAL-DEGENERATE-POLYGON (2026-06-30) — load-time self-heal for OLD
 * projects.
 *
 * A residential project generated BEFORE the WallJoinResolver collinearity /
 * `_clampEndToShellInnerFace` fix can contain collapsed sub-0.05 m wall baselines.
 * At save time those degenerate walls left room perimeters unsealed, so the
 * persisted ROOM / FLOOR / CEILING polygons were written as zero-area or
 * fewer-than-3-distinct-vertex rings. On the next OPEN those records fail the
 * downstream `validatePolygon`/`validateCeilingBoundary` ("≥3 vertices") guard —
 * one failure per record — which is exactly the founder's persistent
 * "120 elements failed — see console" banner (it can NEVER self-heal because the
 * broken data is baked into the snapshot).
 *
 * The walls themselves already heal on open: the post-load WallJoinResolver
 * restore flush flags the collapsed baselines `invalid` (§RESOLVED-STUB-SWEEP /
 * §WJR-INVALID) so the mesh builder skips them. What is left is the persisted
 * polygon records. We DROP the degenerate ones here, BEFORE they are dispatched,
 * so they neither fail nor inflate the failure count. The post-load
 * REDETECT_ROOMS sweep then re-seals each level's rooms from the now-valid
 * (join-resolved) wall geometry — i.e. an old broken project heals on open
 * instead of reporting failures.
 *
 * Pure + exported so the drop decision is unit-testable without standing up the
 * runtime/command pipeline (mirrors `findOpeningElementData` /
 * `migrateRoofSnapshotToCommand` in this file — pure data transforms, no span).
 */

/** A polygon vertex in either `{x,z}` object form or `[x,z]` tuple form. */
type PolyVertex = { x?: number; z?: number; y?: number } | [number, number] | number[];

function _vx(p: PolyVertex): number { return Array.isArray(p) ? (p[0] ?? 0) : (p.x ?? 0); }
function _vz(p: PolyVertex): number {
    // Polygons are authored in the XZ plane; a few legacy records used {x,y}.
    if (Array.isArray(p)) return p[1] ?? 0;
    return p.z ?? p.y ?? 0;
}

/**
 * §LOAD-HEAL-DEGENERATE-POLYGON — true when `polygon` cannot form a valid filled
 * ring: missing, fewer than 3 vertices, fewer than 3 DISTINCT vertices (after
 * collapsing near-coincident points), or effectively zero signed area (all
 * vertices collinear / a sliver). Mirrors the generation-time
 * `§RESI-CEILING-DEGENERATE-GUARD-2` test so a record dropped at SAVE for new
 * projects is dropped at LOAD for already-saved ones.
 *
 * @param polygon  candidate ring (object or tuple vertices)
 * @param epsilon  coincidence tolerance in metres (default 1 mm)
 * @param minArea  minimum |signed area| in m² to be considered non-degenerate
 */
export function isDegeneratePolygon(
    polygon: PolyVertex[] | null | undefined,
    epsilon = 1e-3,
    minArea = 1e-4,
): boolean {
    if (!Array.isArray(polygon) || polygon.length < 3) return true;

    // Collapse near-coincident consecutive (and wrap-around) vertices.
    const distinct: Array<[number, number]> = [];
    for (const p of polygon) {
        const x = _vx(p), z = _vz(p);
        if (!Number.isFinite(x) || !Number.isFinite(z)) return true; // NaN/Inf → degenerate
        const last = distinct[distinct.length - 1];
        if (last && Math.hypot(last[0] - x, last[1] - z) < epsilon) continue;
        distinct.push([x, z]);
    }
    // Drop a closing vertex equal to the first.
    if (distinct.length >= 2) {
        const f = distinct[0]!, l = distinct[distinct.length - 1]!;
        if (Math.hypot(f[0] - l[0], f[1] - l[1]) < epsilon) distinct.pop();
    }
    if (distinct.length < 3) return true;

    // Shoelace signed area — collinear / sliver rings fall below minArea.
    let area2 = 0;
    for (let i = 0; i < distinct.length; i++) {
        const a = distinct[i]!, b = distinct[(i + 1) % distinct.length]!;
        area2 += a[0] * b[1] - b[0] * a[1];
    }
    return Math.abs(area2) / 2 < minArea;
}

/**
 * §LOAD-HEAL-DEGENERATE-POLYGON — partition an array of snapshot records into the
 * ones whose polygon is valid (`kept`) and the ones to drop because their polygon
 * is degenerate (`dropped`). `getPolygon` extracts the ring from each record
 * (records nest it differently — floors at `.boundary.polygon`, ceilings/rooms at
 * `.polygon` / `.boundary.polygon`). Records with NO polygon at all are KEPT (the
 * downstream command supplies a default / the record is not polygon-bearing) —
 * we only drop records that HAVE a polygon and it is degenerate.
 *
 * @returns `{ kept, dropped }` — `dropped` carries each record + the reason, for
 *          a single concise load log instead of N per-record failures.
 */
export function dropDegeneratePolygonRecords<T>(
    records: ReadonlyArray<T> | null | undefined,
    getPolygon: (r: T) => PolyVertex[] | null | undefined,
): { kept: T[]; dropped: T[] } {
    const kept: T[] = [];
    const dropped: T[] = [];
    if (!Array.isArray(records)) return { kept, dropped };
    for (const r of records) {
        const poly = getPolygon(r);
        // Only judge records that actually carry a polygon. A record without one
        // is left for the downstream command (it may default the boundary).
        if (poly !== undefined && poly !== null && isDegeneratePolygon(poly)) {
            dropped.push(r);
        } else {
            kept.push(r);
        }
    }
    return { kept, dropped };
}

/**
 * §OPEN-OLD-CEILING-RESTORE (2026-07-01) — map a serialised ceiling snapshot
 * record to the flat fields `CreateCeilingCommand` expects.
 *
 * ROOT CAUSE this fixes: a persisted ceiling is the full `CeilingData` object,
 * whose polygon/height/thickness/baseOffset live nested under `.boundary`
 * (`CeilingData.boundary: CeilingBoundary`). Every restore site read the FLAT
 * fields (`ceiling.polygon`, `ceiling.height`, …), which are `undefined` on a
 * real snapshot → `validateCeilingPolygon(undefined)` failed → EVERY ceiling was
 * counted as a failed element and never restored (the "N elements failed" banner
 * + missing ceilings on open). This reads `.boundary` first with a flat fallback
 * so both current snapshots and any legacy flat-shaped record round-trip.
 *
 * Pure + exported so the mapping is unit-testable without the command pipeline
 * (mirrors `findOpeningElementData` / `migrateRoofSnapshotToCommand`).
 *
 * @returns the sub-object of `CreateCeilingPayload` derivable from the record
 *          (polygon/height/thickness/baseOffset). The caller supplies the ids,
 *          levelId, label, layers, finishSpec, etc.
 */
export function ceilingRestoreBoundaryFields(ceiling: any): {
    polygon: any;
    height: any;
    thickness: any;
    baseOffset: any;
} {
    const b = ceiling?.boundary ?? {};
    return {
        polygon:    b.polygon    ?? ceiling?.polygon,
        height:     b.height     ?? ceiling?.height,
        thickness:  b.thickness  ?? ceiling?.thickness,
        baseOffset: b.baseOffset ?? ceiling?.baseOffset,
    };
}

/**
 * §FIX-PERSIST-KITCHEN-WARDROBE-LIGHTING (L-85) — map a serialised furniture
 * snapshot record to the `CreateFurnitureCommand` payload.
 *
 * ROOT CAUSE this guards: kitchen (`kitchen_*` furnitureType + `kitchenConfig`)
 * and wardrobe (`wardrobe_*` + `wardrobeCabinetConfig`) RUN groups are ordinary
 * `FurnitureData` in the geometry `FurnitureStore` (the kitchen/wardrobe tools →
 * `furniture.create` bus command → `furniture.created` bridge → `furnitureStore`).
 * They serialise via `ProjectSerializer.serializeFurniture` (which persists the
 * two configs), but if the RESTORE path drops a parametric field the
 * `FurnitureFactory` either throws ("requires kitchenConfig" /
 * "requires wardrobeCabinetConfig") or silently collapses the RUN to a single
 * primitive — so the run vanishes / degrades on reopen (Contract 13 §2: every
 * parametric input that drives geometry MUST round-trip). Centralising the
 * mapping here keeps the restore payload byte-faithful and unit-testable.
 *
 * Pure + exported (mirrors `ceilingRestoreBoundaryFields`) so the mapping is
 * testable without the command pipeline / THREE-touching barrel.
 */
export function buildFurnitureRestorePayload(f: any): CreateFurniturePayload {
    return {
        id:                    f.id,
        furnitureType:         f.furnitureType,
        position:              f.position,
        rotation:              f.rotation,
        levelId:               f.levelId,
        baseOffset:            f.baseOffset ?? 0.2,
        width:                 f.width,
        length:                f.length,
        height:                f.height,
        widthBranchTwo:        f.widthBranchTwo,
        lengthBranchTwo:       f.lengthBranchTwo,
        widthMain:             f.widthMain,
        lengthSide:            f.lengthSide,
        seatDepthMain:         f.seatDepthMain,
        seatDepthSide:         f.seatDepthSide,
        material:              f.material ?? 'wood',
        color:                 f.color,
        hasHeadboard:          f.hasHeadboard,
        lo3:                   f.lo3,
        startPoint:            f.startPoint,
        cornerPoint:           f.cornerPoint,
        endPoint:              f.endPoint,
        wardrobeConfig:        f.wardrobeConfig,
        // The two parametric RUN configs — the fields whose loss regressed
        // kitchen / wardrobe groups on reopen (L-85).
        kitchenConfig:         f.kitchenConfig,
        wardrobeCabinetConfig: f.wardrobeCabinetConfig,
        furnitureCategory:     f.furnitureCategory,
        metadata:              f.metadata,
    };
}

/**
 * §FIX-PERSIST-AI-ELEMENT (L-85 follow-up) — map a serialised `ai_element`
 * furniture record to a `CreateAIElementCommand` payload, or `null` when the
 * record is NOT an ai_element (or is missing the load-bearing keys) so the
 * caller falls back to the ordinary `CreateFurnitureCommand` path.
 *
 * ROOT CAUSE this fixes (same silent-drop CLASS as kitchen/wardrobe, L-85): an
 * `ai_element` is a fully-procedural mesh whose geometry is defined ENTIRELY by
 * its `aiElementConfig` (components + parameters). It is CREATED via
 * `CreateAIElementCommand` (which stores `aiElementConfig` on the `FurnitureData`)
 * and SERIALISED by `ProjectSerializer.serializeFurniture` (which persists
 * `aiElementConfig`). But BOTH restore paths — the default-on `ImportProjectCommand`
 * fast path AND the legacy `ProjectLoader` — replayed EVERY furniture record
 * through `CreateFurnitureCommand`, whose payload has no `aiElementConfig` field
 * and which rebuilds a generic primitive from `width/length/height`. So an
 * `ai_element` came back on reopen with NO config → the FurnitureFragmentBuilder
 * had nothing to build → the element rendered empty / vanished (Contract 13 §2:
 * every parametric input that drives geometry MUST round-trip). Routing the
 * record back through `CreateAIElementCommand` restores the config verbatim.
 *
 * Pure + exported (mirrors `buildFurnitureRestorePayload` /
 * `buildLightingRestorePayload`) so the mapping is unit-testable without the
 * command pipeline. Returns `null` (not a throw) so a non-ai_element record, or a
 * malformed one, transparently falls back to the ordinary furniture restore
 * rather than being dropped.
 */
export function buildAIElementRestorePayload(f: any): CreateAIElementPayload | null {
    if (!f || typeof f !== 'object') return null;
    if (f.furnitureType !== 'ai_element') return null;
    // The config IS the element — without it there is nothing to restore, so let
    // the caller fall back to the generic furniture path (byte-identical to the
    // pre-fix behaviour for that one malformed record) rather than dispatching a
    // doomed CreateAIElementCommand.
    if (!f.aiElementConfig || typeof f.aiElementConfig !== 'object') return null;
    if (!f.id || !f.levelId || !f.position) return null;
    return {
        id:              f.id,
        levelId:         f.levelId,
        baseOffset:      f.baseOffset ?? 0,
        position:        f.position,
        rotation:        f.rotation ?? { x: 0, y: 0, z: 0 },
        material:        f.material ?? 'wood',
        color:           f.color,
        aiElementConfig: f.aiElementConfig,
    };
}

/**
 * §FIX-PERSIST-KITCHEN-WARDROBE-LIGHTING (L-85) — map a serialised lighting
 * snapshot record to the `CreateLightingCommand` payload, or `null` when the
 * record is malformed (missing id / fixtureType / levelId / position) so the
 * caller skips it instead of dispatching a doomed command.
 *
 * ROOT CAUSE this fixes: lighting fixtures ARE persisted (`ProjectSerializer`
 * §PERSIST-LIGHTING sources them from the window-managed `LightingStore`) and the
 * `LightingStore` is registered in the `ProjectScopeRegistry`, so
 * `ClearProjectCommand.clearAll()` WIPES it on every open — but the default-on
 * `ImportProjectCommand` fast load path had NO lighting restore step (only the
 * legacy per-command `ProjectLoader` path did, Step 10b). Result: every light the
 * user placed was cleared and never re-created on reopen. This helper feeds the
 * new restore step so lighting round-trips on the fast path too.
 *
 * Pure + exported so the mapping is unit-testable without the command pipeline.
 */
export function buildLightingRestorePayload(lt: any): CreateLightingPayload | null {
    if (!lt || typeof lt !== 'object') return null;
    if (!lt.id || !lt.fixtureType || !lt.levelId || !lt.position) return null;
    return {
        id:          lt.id,
        fixtureType: lt.fixtureType,
        position:    lt.position,
        rotation:    lt.rotation,
        levelId:     lt.levelId,
        roomId:      lt.roomId,
        hostId:      lt.hostId,
        tags:        lt.tags,
        properties:  lt.properties,
    };
}

/**
 * Convert a serialised roof snapshot record into a CreateRoofCommand.
 */
export function migrateRoofSnapshotToCommand(roof: any): CreateRoofCommand | null {
    try {
        let footprint: RoofFootprint;

        if (roof.footprint && Array.isArray(roof.footprint.polygon) && roof.footprint.polygon.length >= 3) {
            footprint = {
                polygon: roof.footprint.polygon,
                centroid: roof.footprint.centroid ?? [0, 0],
            };
        } else if (Array.isArray(roof.polygon) && roof.polygon.length >= 3) {
            const pts: [number, number][] = roof.polygon.map((p: any) =>
                Array.isArray(p) ? [p[0], p[1]] : [p.x ?? 0, p.y ?? 0]
            );
            let cx = 0, cz = 0;
            if (roof.position) {
                cx = roof.position.x ?? 0;
                cz = roof.position.z ?? 0;
            } else {
                for (const [x, z] of pts) { cx += x; cz += z; }
                cx /= pts.length; cz /= pts.length;
            }
            footprint = { polygon: pts, centroid: [cx, cz] };
        } else {
            const w = roof.width ?? 1;
            const d = roof.depth ?? 1;
            const cx = roof.position?.x ?? 0;
            const cz = roof.position?.z ?? 0;
            footprint = {
                polygon: [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]],
                centroid: [cx, cz],
            };
        }

        const modeToType: Record<string, RoofType> = {
            'single_slope': 'shed',
            'hip_roof': 'hip',
            'by_region': 'by_region',
            'flat': 'flat',
        };
        const roofType: RoofType = roof.roofType
            ?? modeToType[roof.mode ?? '']
            ?? 'flat';

        return new CreateRoofCommand(roof.id ?? crypto.randomUUID(), {
            levelId: roof.levelId,
            footprint,
            roofType,
            slope: roof.slope,
            overhang: roof.overhang ?? 0.3,
            baseOffset: roof.baseOffset ?? 3.0,
            thickness: roof.thickness ?? 0.2,
            fascia: roof.fascia,
            materialColor: roof.materialColor,
            materialId: roof.materialId,
            // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID so the roof's IFC
            // round-trip join key survives reload. Absent (legacy snapshot) the
            // command mints one, which is the pre-existing behaviour.
            ifcGuid: roof.ifcData?.guid,
        });
    } catch (e) {
        console.error('[projectLoaderUtils] migrateRoofSnapshotToCommand failed:', e);
        return null;
    }
}
