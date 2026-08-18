// ─── §ROOF-HOSTED-OPENINGS ───────────────────────────────────────────────────
//
// THE FOUNDER'S ASK, in full: "can you check if we could create openings on
// roofs? I would like to be able to host lucernarios in roofs also — windows
// hosted on roof planar surfaces of the roof."
//
// This is the command that mints one. It follows the SLAB opening model —
// `openingStore` record with `hostId` pointing at the host element — and NOT the
// wall one. That choice is structural, not stylistic:
//
//   · a WALL opening lives INSIDE `WallData.openings[]` as a scalar `offset`
//     along the baseline, gated by `WallOccupancyStore`. A wall is an extruded
//     band with ONE axis, so one scalar locates the void.
//   · a ROOF face is a planar surface, like a slab. Two coordinates locate the
//     void, and the record that already carries two coordinates is
//     `OpeningData.profile`.
//
// ─── WHERE A ROOF HOST DIFFERS FROM C15, STATED EXPLICITLY ───────────────────
//
// C15 is written around walls throughout — §1 defines the host as "the Wall
// entity that contains the hosted element in its `openings[]` array", and §2's
// coordinate model is `baseLine[0] + offset × wallDir`. Neither sentence can be
// applied to a roof. The three substantive divergences:
//
//   C15 §1 (HOST IDENTITY). A wall IS the host. A roof is not: the host is ONE
//     PLANAR FACE OF a roof, and a hip roof has four. The record therefore
//     carries `properties.roofFace.index` alongside `hostId`, and which face is
//     determined BY CONTAINMENT (`resolveHostFace`), never by proximity.
//
//   C15 §2 (COORDINATE MODEL). A wall opening's position is one scalar. A roof
//     opening's is a 2-D point IN THE HOST FACE'S OWN PLANE — `{uM, vM}`, u
//     along the eave, v up the slope. The stored `profile` is that rectangle
//     projected to roof-local plan, which is what the geometry builder cuts;
//     the AUTHORED face-plane rectangle is kept beside it in
//     `properties.roofFace` so the intent survives a slope change. Both are
//     written by ONE function (`faceRectToPlanProfile`) so they cannot drift.
//
//   C15 §5/§7 (DRAG CONSTRAINT, BASELINE REVERSAL). A roof has no baseline, so
//     neither the 1-D drag constraint nor the reversal guard has a roof
//     analogue. What a roof DOES need, and what this command does not yet have,
//     is the slope-change follow-up: change a roof's pitch and the plan
//     projection of every skylight on it becomes stale. Named here as an
//     absence rather than discovered later — see the tail of this file.
//
// ─── WHY THIS DOES NOT REUSE `CreateOpeningCommand` ──────────────────────────
// That command hard-codes `slabStore.getById(hostId)` in both `canExecute` and
// `execute`, and rebuilds through `slabStore.triggerRebuild`. Passing a roof id
// to it fails validation with "Host slab … not found in store". Its `hostId`
// FIELD is host-agnostic; its command is not.

import { trace, type Tracer } from '@opentelemetry/api';
import {
    checkOpeningWithinFace,
    computeRoofFaces,
    faceRectToPlanProfile,
    planToFaceUV,
    resolveHostFace,
    worldXZToRoofLocal,
    type RoofFace,
} from '@pryzm/geometry-roof';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';

let _tracerCache: Tracer | null = null;
function _tracer(): Tracer {
    _tracerCache ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _tracerCache;
}

export interface CreateRoofOpeningPayload {
    /** Id of the opening element to mint. */
    id: string;
    /** The host ROOF. Which FACE of it is determined here, by containment. */
    roofId: string;
    /**
     * Where the architect put it, in WORLD plan XZ metres. Converted to
     * roof-local by `worldXZToRoofLocal` — the roof's `worldXZToSlabLocal`.
     */
    worldX: number;
    worldZ: number;
    /** Extent ALONG THE EAVE, metres — true size on the roof surface. */
    widthM: number;
    /** Extent UP THE SLOPE, metres — true size on the roof surface, NOT plan depth. */
    heightM: number;
}

/** The roof fields this command reads. Structural so a test needs no store. */
interface RoofRecord {
    id: string;
    levelId: string;
    roofType: string;
    footprint: { polygon: Array<[number, number]>; centroid: [number, number] };
    slope?: number;
    overhang?: number;
    thickness: number;
    segments?: unknown[];
    slopeArrows?: unknown[];
}

function readRoof(ctx: CommandContext, roofId: string): RoofRecord | null {
    const store = (ctx.stores as any).roofStore;
    if (!store) return null;
    return (store.getById?.(roofId) ?? store.get?.(roofId) ?? null) as RoofRecord | null;
}

/**
 * Resolve the host face and the plan profile for a payload — the SINGLE
 * determination, shared by `canExecute` and `execute` so validation can never
 * accept something execution then refuses (or worse, accepts differently).
 */
export type RoofOpeningPlacement =
    | { ok: true; face: RoofFace; profile: Array<{ x: number; y: number }>; uM: number; vM: number; levelId: string }
    | { ok: false; reason: string };

export function planRoofOpening(roof: RoofRecord | null, payload: CreateRoofOpeningPayload): RoofOpeningPlacement {
    if (!roof) return { ok: false, reason: `Host roof ${payload.roofId} not found in roofStore` };
    if (!(payload.widthM > 0) || !(payload.heightM > 0)) {
        return { ok: false, reason: `Skylight must have positive extents on the roof plane (got ${payload.widthM} × ${payload.heightM} m)` };
    }

    const faceSet = computeRoofFaces({
        id:          roof.id,
        roofType:    roof.roofType,
        polygon:     roof.footprint?.polygon ?? [],
        slope:       roof.slope,
        overhang:    roof.overhang,
        thickness:   roof.thickness,
        segments:    roof.segments,
        slopeArrows: roof.slopeArrows,
    });
    if (!faceSet.ok) {
        // §CONTEXT-DATA-HONESTY — "this roof cannot host a skylight yet, and here
        // is why" is a different answer from "that point is not on this roof",
        // and the caller gets to tell them apart.
        return { ok: false, reason: `Cannot host a skylight on roof ${roof.id}: ${faceSet.detail}` };
    }

    const planPoint = worldXZToRoofLocal({ x: payload.worldX, z: payload.worldZ }, roof.footprint.centroid);
    const host = resolveHostFace(roof.id, faceSet.faces, planPoint);
    if (!host.ok) return { ok: false, reason: host.detail };

    const uv = planToFaceUV(host.face, planPoint);
    const planProfile = faceRectToPlanProfile(host.face, {
        uM: uv.u, vM: uv.v, widthM: payload.widthM, heightM: payload.heightM,
    });

    // §ROOF-OPENING-STRADDLE — the CENTRE being on this face does not mean the
    // whole skylight is. A rectangle can cross a ridge, a hip or a valley with
    // its centre well inside. Refuse, naming the slope it strayed onto; see
    // `checkOpeningWithinFace` for why refusing beats clipping.
    const fits = checkOpeningWithinFace(roof.id, faceSet.faces, host.face, planProfile);
    if (!fits.ok) return { ok: false, reason: fits.detail };

    const profile = planProfile.map(([x, z]) => ({ x, y: z }));
    return { ok: true, face: host.face, profile, uM: uv.u, vM: uv.v, levelId: roof.levelId };
}

/**
 * Create a skylight ("lucernario") void hosted on one planar face of a roof.
 *
 * The record shape is the slab opening's, deliberately identical so that
 * `OpeningCleanupHandler`, `DeleteElementCommand`, `ProjectSerializer` and
 * `RoomContentsService` need no per-host-type branch — the L-215 `if`-ladder
 * disease this repo has already paid for twice.
 */
export class CreateRoofOpeningCommand implements Command {
    readonly affectedStores = ['roof'] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_ROOF_OPENING;
    readonly timestamp: number;
    targetIds: string[];

    constructor(private payload: CreateRoofOpeningPayload) {
        this.id = `cmd-roof-opening-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        this.timestamp = Date.now();
        this.targetIds = [payload.id];
    }

    canExecute(context: CommandContext): CommandValidationResult {
        if (!this.payload.id)     return { ok: false, reason: 'Missing opening id' };
        if (!this.payload.roofId) return { ok: false, reason: 'Missing roofId' };
        if (!(context.stores as any).openingStore) return { ok: false, reason: 'openingStore is not available' };
        const placement = planRoofOpening(readRoof(context, this.payload.roofId), this.payload);
        return placement.ok ? { ok: true } : { ok: false, reason: placement.reason };
    }

    execute(context: CommandContext): CommandResult {
        const span = _tracer().startSpan('pryzm.roof.create-opening', {
            attributes: { 'pryzm.roof.id': this.payload.roofId, 'pryzm.opening.id': this.payload.id },
        });
        try {
            const roof = readRoof(context, this.payload.roofId);
            const placement = planRoofOpening(roof, this.payload);
            if (!placement.ok) {
                // The refusal is the RESULT, said out loud with the reason the
                // determination produced — never a silently solid roof.
                span.setAttribute('pryzm.roof.opening.refused', placement.reason);
                console.warn(`[CreateRoofOpeningCommand] ${placement.reason}`);
                return { success: false, affectedElementIds: [], info: [placement.reason] };
            }
            span.setAttribute('pryzm.roof.face.index', placement.face.index);
            span.setAttribute('pryzm.roof.face.slope', placement.face.slope);

            const opening = {
                id:         this.payload.id,
                type:       'opening' as const,
                hostId:     this.payload.roofId,
                parentId:   this.payload.roofId,
                levelId:    placement.levelId,
                profile:    placement.profile,
                baseOffset: 0,
                properties: {
                    /**
                     * The host KIND, recorded so a consumer never has to infer it
                     * from which store happens to hold `hostId`.
                     */
                    hostKind: 'roof',
                    /**
                     * The AUTHORED rectangle, in the host face's own plane. This
                     * is the architect's intent — 1.2 × 1.2 m ON THE SLOPE — while
                     * `profile` is its plan projection, which is what the builder
                     * cuts and which changes if the pitch changes.
                     */
                    roofFace: {
                        index:   placement.face.index,
                        uM:      placement.uM,
                        vM:      placement.vM,
                        widthM:  this.payload.widthM,
                        heightM: this.payload.heightM,
                    },
                },
            };

            try { context.bimManager.registerElement(this.payload.id, placement.levelId); }
            catch (e: any) { console.warn('[CreateRoofOpeningCommand] bimManager.registerElement failed:', e?.message); }
            try { elementRegistry.registerSemantic(this.payload.id, 'opening'); }
            catch { /* §SWALLOW-SIDE-INDEX — already registered on the redo path */ }

            (context.stores as any).openingStore.add(opening as any);
            (context.stores as any).roofStore?.triggerRebuild?.(this.payload.roofId);

            return {
                success: true,
                affectedElementIds: [this.payload.id, this.payload.roofId],
                info: [`Skylight ${this.payload.id} created on face ${placement.face.index} of roof ${this.payload.roofId}`],
            };
        } finally {
            span.end();
        }
    }

    undo(context: CommandContext): CommandResult {
        try { context.bimManager.unregisterElement?.(this.payload.id); } catch { /* §SWALLOW-SIDE-INDEX */ }
        try { elementRegistry.unregister(this.payload.id); } catch { /* §SWALLOW-SIDE-INDEX */ }
        (context.stores as any).openingStore?.remove?.(this.payload.id);
        (context.stores as any).roofStore?.triggerRebuild?.(this.payload.roofId);
        return {
            success: true,
            affectedElementIds: [this.payload.id, this.payload.roofId],
            info: [`Skylight ${this.payload.id} removed from roof ${this.payload.roofId}`],
        };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: this.payload as any, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}

// ─── NOT DONE, ON THE RECORD (C79 §7.1 — a field the model cannot honour yet) ─
//
// 1. A SLOPE CHANGE STRANDS THE PROJECTION. `properties.roofFace` holds the
//    authored face-plane rectangle and `profile` holds its plan projection. Change
//    `roof.slope` and the projection is stale — the skylight keeps its plan size
//    and therefore SHRINKS on the surface. The fix is a reconciler modelled on
//    `StairSlabOpeningReconciler.reconcileStairOpening` (update-or-recarve keyed by
//    the same id, never a second void), called from `UpdateRoofCommand`. It is not
//    here because the SAME function must serve every mutation direction or it
//    drifts, and the roof-boundary path (`UpdateRoofBoundaryCommand`) has to be
//    wired in the same change.
// 2. NO DELETE CASCADE. Deleting the roof leaves the opening records orphaned.
//    `OpeningCleanupHandler` already does this for slabs; it needs the roof arm.
// 3. NO UI. The command is reachable through the command registry and the bus
//    adapter, which is what makes the geometry path provable end-to-end; a
//    skylight TOOL (click a roof face, drag a rectangle) is a separate piece.
