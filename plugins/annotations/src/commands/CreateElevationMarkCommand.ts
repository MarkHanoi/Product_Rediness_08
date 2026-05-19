/**
 * DOC-2.7 — CreateElevationMarkCommand
 *
 * Moved from src/engine/subsystems/commands/annotations/ during Sprint C (S5.1-P2).
 * Original path is now a re-export shim.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../legacy-command-protocol';
import { makeAnnotationElement } from '../subsystem/AnnotationTypes';
import { viewDefinitionStore as viewDefinitionStoreSingleton } from '@pryzm/core-app-model';
import { viewIntentInstanceStore as viewIntentInstanceStoreSingleton } from '@pryzm/core-app-model';
import type { ViewSpatialContext, ViewSectionVolume } from '@pryzm/core-app-model';

function resolveAnnotationStore(ctx: CommandContext | undefined): any | null {
    const fromCtx = ctx?.stores?.annotationStore ?? (ctx as any)?.annotationStore;
    if (fromCtx) return fromCtx;
    return typeof window !== 'undefined' ? window.annotationStore ?? null : null;
}
function resolveViewDefinitionStore(ctx: CommandContext | undefined): any {
    return ctx?.stores?.viewDefinitionStore ?? viewDefinitionStoreSingleton;
}
function resolveViewIntentInstanceStore(ctx: CommandContext | undefined): any {
    return ctx?.stores?.viewIntentInstanceStore ?? viewIntentInstanceStoreSingleton;
}
function resolveVgGovernanceStore(ctx: CommandContext | undefined): any | null {
    return ctx?.stores?.vgGovernanceStore
        ?? (typeof window !== 'undefined' ? window.vgGovernanceStore ?? null : null);
}
function resolveRoomStore(ctx: CommandContext | undefined): any | null {
    return (ctx?.stores as any)?.roomStore
        ?? (typeof window !== 'undefined' ? window.roomStore ?? null : null);
}

type RoomCandidate = {
    boundary?: { polygon?: Array<{ x: number; z: number }>; height?: number; baseOffset?: number };
    computed?: { area?: number };
};

function polygonArea(polygon: Array<{ x: number; z: number }>): number {
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!; const b = polygon[(i + 1) % polygon.length]!;
        sum += a.x * b.z - b.x * a.z;
    }
    return Math.abs(sum) / 2;
}

function pointInPolygon(x: number, z: number, polygon: Array<{ x: number; z: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i]!; const pj = polygon[j]!;
        const crosses = (pi.z > z) !== (pj.z > z);
        if (crosses) {
            const xAtZ = ((pj.x - pi.x) * (z - pi.z)) / ((pj.z - pi.z) || 1e-9) + pi.x;
            if (x < xAtZ) inside = !inside;
        }
    }
    return inside;
}

function nearestRayPolygonHit(origin: { x: number; z: number }, dir: { x: number; z: number }, polygon: Array<{ x: number; z: number }>): number | null {
    let nearest = Infinity;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!; const b = polygon[(i + 1) % polygon.length]!;
        const edge = { x: b.x - a.x, z: b.z - a.z }; const ao = { x: a.x - origin.x, z: a.z - origin.z };
        const denom = dir.x * edge.z - dir.z * edge.x;
        if (Math.abs(denom) < 1e-8) continue;
        const t = (ao.x * edge.z - ao.z * edge.x) / denom; const u = (ao.x * dir.z - ao.z * dir.x) / denom;
        if (t >= -1e-6 && u >= -1e-6 && u <= 1 + 1e-6) nearest = Math.min(nearest, Math.max(0, t));
    }
    return Number.isFinite(nearest) ? nearest : null;
}

function round3(value: number): number { return Number(value.toFixed(3)); }

export interface CreateElevationMarkParams {
    elevationViewId: string;
    elevationViewName: string;
    elevationSpatial?: ViewSpatialContext;
    annotationId: string;
    hostViewId: string;
    position: { x: number; y: number; z: number };
    facingDirection: { x: number; z: number };
}

export class CreateElevationMarkCommand implements Command {
    readonly affectedStores = ['view', 'annotation'] as const;
    id        = crypto.randomUUID();
    type      = CommandType.CREATE_ELEVATION_MARK;
    timestamp = Date.now();
    targetIds: string[];

    constructor(private params: CreateElevationMarkParams) {
        this.targetIds = [params.elevationViewId, params.annotationId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!this.params.elevationViewId?.trim()) return { ok: false, reason: 'elevationViewId must be a non-empty string.' };
        if (!this.params.hostViewId?.trim()) return { ok: false, reason: 'hostViewId must be a non-empty string.' };
        const viewStore = resolveViewDefinitionStore(ctx);
        if (viewStore.has(this.params.elevationViewId)) return { ok: false, reason: `A view with id '${this.params.elevationViewId}' already exists.` };
        const annStore = resolveAnnotationStore(ctx);
        if (annStore?.has(this.params.annotationId)) return { ok: false, reason: `Annotation ${this.params.annotationId} already exists.` };
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const viewStore   = resolveViewDefinitionStore(ctx);
        const intentStore = resolveViewIntentInstanceStore(ctx);
        const vgStore     = resolveVgGovernanceStore(ctx);
        const roomStore   = resolveRoomStore(ctx);
        const { position, facingDirection } = this.params;
        const fdLen = Math.sqrt(facingDirection.x ** 2 + facingDirection.z ** 2) || 1;
        const normDir = { x: facingDirection.x / fdLen, y: 0, z: facingDirection.z / fdLen };

        let cropRegion: { minX: number; minZ: number; maxX: number; maxZ: number } | undefined;
        let crop: any;
        let sectionVolume: ViewSectionVolume | undefined;
        try {
            const levelId = this.params.elevationSpatial?.levelId;
            if (roomStore && levelId) {
                let rooms: RoomCandidate[] = [];
                if (typeof roomStore.getRoomsContainingPoint === 'function') {
                    rooms = roomStore.getRoomsContainingPoint(position.x, position.z, levelId);
                } else if (typeof roomStore.getByLevel === 'function') {
                    rooms = roomStore.getByLevel(levelId).filter((room: RoomCandidate) => {
                        const polygon = room.boundary?.polygon;
                        return polygon && polygon.length >= 3 && pointInPolygon(position.x, position.z, polygon);
                    });
                }
                if (rooms.length > 0) {
                    rooms = rooms.filter((room) => {
                        const polygon = room.boundary?.polygon;
                        return polygon && polygon.length >= 3 && pointInPolygon(position.x, position.z, polygon);
                    }).sort((a, b) => {
                        const areaA = a.computed?.area ?? polygonArea(a.boundary?.polygon ?? []);
                        const areaB = b.computed?.area ?? polygonArea(b.boundary?.polygon ?? []);
                        return areaA - areaB;
                    });
                    const room = rooms[0];
                    const polygon = room?.boundary?.polygon;
                    if (polygon && polygon.length >= 3) {
                        const MARGIN = 0.5;
                        const right = { x: -normDir.z, z: normDir.x };
                        const rightOffsets = polygon.map((p) => (p.x - position.x) * right.x + (p.z - position.z) * right.z);
                        const forwardOffsets = polygon.map((p) => (p.x - position.x) * normDir.x + (p.z - position.z) * normDir.z);
                        const minRight = Math.min(...rightOffsets) - MARGIN; const maxRight = Math.max(...rightOffsets) + MARGIN;
                        const rayHit = nearestRayPolygonHit(position, normDir, polygon);
                        const furthestForward = Math.max(...forwardOffsets, 0);
                        const far = Math.max(0.5, (rayHit ?? furthestForward) + MARGIN);
                        const minY = this.params.elevationSpatial?.boundingBox?.min?.[1] ?? position.y + (room.boundary?.baseOffset ?? 0);
                        const maxY = this.params.elevationSpatial?.boundingBox?.max?.[1] ?? minY + Math.max(0.5, room.boundary?.height ?? this.params.elevationSpatial?.viewRange?.farOffset ?? 3);
                        const centerRight = (minRight + maxRight) / 2;
                        const volumeOrigin = { x: position.x + right.x * centerRight, z: position.z + right.z * centerRight };
                        const hAxisIsX = Math.abs(normDir.z) >= Math.abs(normDir.x);
                        const cropEdgeA = { x: position.x + right.x * minRight, z: position.z + right.z * minRight };
                        const cropEdgeB = { x: position.x + right.x * maxRight, z: position.z + right.z * maxRight };
                        const cropH0 = hAxisIsX ? cropEdgeA.x : cropEdgeA.z;
                        const cropH1 = hAxisIsX ? cropEdgeB.x : cropEdgeB.z;
                        sectionVolume = {
                            origin: [round3(volumeOrigin.x), round3(Math.min(minY, maxY)), round3(volumeOrigin.z)],
                            direction: [round3(normDir.x), 0, round3(normDir.z)],
                            width: round3(maxRight - minRight), height: round3(Math.max(0.5, Math.abs(maxY - minY))), near: 0, far: round3(far),
                        };
                        const scopeCorners = [{ r: minRight, d: 0 }, { r: maxRight, d: 0 }, { r: minRight, d: far }, { r: maxRight, d: far }].map(({ r, d }) => ({
                            x: position.x + right.x * r + normDir.x * d, z: position.z + right.z * r + normDir.z * d,
                        }));
                        const xs = scopeCorners.map((p) => p.x); const zs = scopeCorners.map((p) => p.z);
                        cropRegion = { minX: Math.min(...xs) - MARGIN, maxX: Math.max(...xs) + MARGIN, minZ: Math.min(...zs) - MARGIN, maxZ: Math.max(...zs) + MARGIN };
                        crop = { enabled: true, region: { min: [round3(Math.min(cropH0, cropH1)), round3(Math.min(minY, maxY))], max: [round3(Math.max(cropH0, cropH1)), round3(Math.max(minY, maxY))] }, farClip: { ...(levelId ? { levelId } : {}), offset: round3(far) } };
                    }
                }
            }
        } catch { /* Non-fatal */ }
        if (!cropRegion) {
            const DEFAULT_RADIUS = 15;
            cropRegion = { minX: position.x - DEFAULT_RADIUS, maxX: position.x + DEFAULT_RADIUS, minZ: position.z - DEFAULT_RADIUS, maxZ: position.z + DEFAULT_RADIUS };
            const hAxisIsX = Math.abs(normDir.z) >= Math.abs(normDir.x);
            const hBase = hAxisIsX ? position.x : position.z;
            crop = { enabled: true, region: { min: [round3(hBase - 3), round3(position.y)], max: [round3(hBase + 3), round3(position.y + (this.params.elevationSpatial?.viewRange?.farOffset ?? 3))] }, farClip: { ...(this.params.elevationSpatial?.levelId ? { levelId: this.params.elevationSpatial.levelId } : {}), offset: DEFAULT_RADIUS } };
            sectionVolume = { origin: [round3(position.x), round3(position.y), round3(position.z)], direction: [round3(normDir.x), 0, round3(normDir.z)], width: 6, height: round3(this.params.elevationSpatial?.viewRange?.farOffset ?? 3), near: 0, far: DEFAULT_RADIUS };
        }
        const enrichedSpatial: ViewSpatialContext = {
            ...this.params.elevationSpatial,
            projectionDirection: normDir,
            sectionPlane: { normal: [normDir.x, 0, normDir.z], constant: -(normDir.x * position.x + normDir.z * position.z) },
            cropRegion,
            ...(sectionVolume ? { sectionVolume } : {}),
        };
        const view = viewStore.create({ id: this.params.elevationViewId, name: this.params.elevationViewName, viewType: 'elevation', spatial: enrichedSpatial, crop });
        if (!view) return { success: false, affectedElementIds: [], error: 'Failed to create elevation ViewDefinition.' };
        intentStore.assign(this.params.elevationViewId);
        if (vgStore && typeof vgStore.ensureView === 'function') vgStore.ensureView(this.params.elevationViewId, this.params.elevationViewName, 'model-default');

        const ARROW_WORLD_LEN = 1.0;
        const dirEndpoint = { x: position.x + facingDirection.x * ARROW_WORLD_LEN, y: position.y, z: position.z + facingDirection.z * ARROW_WORLD_LEN };
        const ann = makeAnnotationElement(this.params.annotationId, 'elevation-mark', this.params.hostViewId, [], { modelPoints: [position, dirEndpoint], offset: 0 }, { linkedViewId: this.params.elevationViewId, position, facingDirection });
        const annStore = resolveAnnotationStore(ctx);
        if (!annStore) {
            intentStore.delete(this.params.elevationViewId); viewStore.delete(this.params.elevationViewId);
            return { success: false, affectedElementIds: [], error: 'AnnotationStore not initialised.' };
        }
        annStore.add(ann);
        return { success: true, affectedElementIds: [this.params.elevationViewId, this.params.annotationId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const annStore    = resolveAnnotationStore(ctx);
        const viewStore   = resolveViewDefinitionStore(ctx);
        const intentStore = resolveViewIntentInstanceStore(ctx);
        annStore?.remove(this.params.annotationId);
        intentStore.delete(this.params.elevationViewId);
        viewStore.delete(this.params.elevationViewId);
        return { success: true, affectedElementIds: [this.params.elevationViewId, this.params.annotationId] };
    }

    serialize(): SerializedCommand {
        return { type: this.type, payload: { params: this.params }, targetIds: this.targetIds, timestamp: this.timestamp, version: 1 };
    }
}
