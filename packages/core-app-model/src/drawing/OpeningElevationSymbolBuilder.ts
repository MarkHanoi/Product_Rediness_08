/**
 * OpeningElevationSymbolBuilder — §ELEV-SYMBOL-OPENING (L-1240)
 *
 * **THE INJECTION SEAM for the authored door/window elevation symbol.** It is the sibling of
 * `PlumbingElevationSymbolBuilder` (L-221 P3) — the only prior elevation symbol builder in the
 * tree — and it is deliberately the SAME seam, in the same order, so there is one way an
 * elevation symbol reaches a drawing rather than two:
 *
 *     local set-out → world transform → toDrawingSpace → addProjectionLines → registerSegmentUUID
 *
 * ⭐ **WHERE IT DIFFERS FROM THE PLUMBING PRECEDENT, AND WHY THAT DIFFERENCE IS THE POINT.**
 * `PlumbingElevationSymbolBuilder` injects onto a FLAT `'A-PLMB'` — a layer with no zone suffix,
 * which `drawingZoneFromLayerName()` classifies as `null`. That is the zone ladder being
 * flattened at the last mile, and it is the SAME shape as the L-280 defect this family already
 * shipped once (`SymbolicRuleRenderer`'s header records it at length). This builder emits onto
 * ZONE-SUFFIXED layers — `A-GLAZ-SYM:proj`, `A-DOOR-SYM:hidden` — so every injected line
 * arrives at `PlanViewCanvas` carrying a real zone, resolves its pen through
 * `graphicsRulesEngine.resolveStyle()` like every other line in the drawing, and a per-view or
 * per-element override reaches it. ⛔ Do not "simplify" these to a flat layer.
 *
 * ⭐ **AND IT STAMPS `elementUUID`.** That is not bookkeeping: `PlanViewCanvas` reads it back to
 * key the ELEMENT-tier (priority 10000) graphics rule, so *"re-weight THIS window"* reaches
 * these lines. The founder has already lived the opposite — L-280's *"the founder could
 * re-weight his windows and watch nothing happen"* — and `PenOverrideReachesElevationSymbol`
 * in `OpeningElevationSymbol.test.ts` is the differentiating test for it.
 *
 * ── THE `-SYM` LAYER SUFFIX IS A SAFETY PROPERTY, NOT A NAMING TASTE ─────────────────────────
 * `symbolicRuleForLayer()`'s elevation arm requires `-SYM` before it will route anything. Only
 * linework this builder injects carries it. So enabling the elevation arm cannot re-route a
 * single line that already exists on `A-GLAZ:proj` / `A-DOOR:proj` — it can only route lines
 * that did not exist before this builder ran. That is what makes the change additive by
 * construction rather than by inspection.
 *
 * ⚠ **WHAT THIS DOES NOT DO, STATED SO IT IS NOT ASSUMED.** It does NOT suppress the existing
 * raw mesh edge-dump for doors and windows in elevation. Until that suppression lands (the
 * `skipInElevation` sibling, in `EdgeProjectorService`), an elevation shows the authored symbol
 * ON TOP OF the solid's wireframe — strictly more correct linework, and strictly no less
 * clutter. Both halves are named in L-1240; shipping the symbol first is what makes the
 * suppression provable rather than a swap of one unverified drawing for another.
 *
 * Contract compliance:
 *   C09 §4.6.1 / §4.6.4b — zone-suffixed layers; the pen table stays the only pen authority
 *   C86 §10.1 PR-1       — the outline comes from ONE producer; nothing is re-derived here
 *   C86 §10.2            — head and sill horizontal in every elevation
 *   C05 §4               — no DOM; THREE + OBC only, as every drawing-side builder uses
 *
 * @module OpeningElevationSymbolBuilder
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { resolveWallBaseYOrLevel } from '@pryzm/geometry-wall';
import { storeRegistry } from '../StoreRegistry';
import { registerSegmentUUID } from '../views/DrawingSelectionIndex';
import { layerForZone, type DrawingZone } from './DrawingZone';
import {
    buildOpeningElevationSymbol,
    nearFaceSign,
    type ElevationSymbolOpening,
    type ElevationSymbolPolyline,
    type SymbolDetail,
} from './OpeningElevationSymbol';

/** The two base layers. The `-SYM` token is what the elevation symbol arm keys on. */
export const GLAZ_SYM_LAYER = 'A-GLAZ-SYM';
export const DOOR_SYM_LAYER = 'A-DOOR-SYM';

interface ReadableWallStore {
    getAll: () => Array<{
        id: string;
        levelId?: string;
        baseLine: Array<{ x: number; y?: number; z: number }>;
        thickness: number;
        baseOffset?: number;
        rakeAngleDeg?: number | null;
        arc?: unknown;
        openings?: Array<{
            id: string;
            type: 'window' | 'door';
            offset: number;
            width: number;
            height: number;
            sillHeight: number;
            elementId?: string;
            doorType?: 'single' | 'double';
            windowType?: 'single' | 'double';
            openingProfile?: unknown;
        }>;
    }>;
}

interface ReadableDoorStore {
    getAll?: () => Array<{
        id: string;
        openingId?: string;
        hingesSide?: 'left' | 'right';
        swingDirection?: 'inward' | 'outward';
    }>;
}

/** Minimal view shape — deliberately structural, so the builder needs no L4 view type. */
export interface ElevationSymbolViewDef {
    readonly id: string;
    readonly viewType?: string;
    readonly spatial?: {
        readonly levelId?: string;
        readonly projectionDirection?: { x: number; y?: number; z: number };
        readonly detailLevel?: unknown;
    };
}

export interface InjectResult {
    /** Openings whose symbol was emitted. */
    readonly injected: number;
    /**
     * Openings the producer REFUSED, with their reasons.
     *
     * ⛔ Returned rather than swallowed. C16 CA-18: a refusal the caller cannot see is a silent
     * narrowing, and this family already has the precedent — an envelope hard-reject that fell
     * through to `[]` and looked exactly like "no constraints apply".
     */
    readonly refusals: ReadonlyArray<{ openingId: string; code: string; reason: string }>;
}

export class OpeningElevationSymbolBuilder {
    /**
     * Inject the authored elevation symbol for every opening visible in this elevation.
     *
     * Filters by the view's level when it carries one; a building-wide elevation (no `levelId`)
     * takes every opening and lets the crop and the occlusion pass cull — the same rule
     * `PlumbingElevationSymbolBuilder` uses, restated rather than re-decided.
     */
    inject(drawing: OBC.TechnicalDrawing, viewDef: ElevationSymbolViewDef): InjectResult {
        const wallStore = storeRegistry.getStoreForType('wall') as unknown as ReadableWallStore | undefined;
        if (!wallStore || typeof wallStore.getAll !== 'function') return { injected: 0, refusals: [] };

        const levelId = viewDef.spatial?.levelId;
        const dir = viewDef.spatial?.projectionDirection ?? { x: 0, y: 0, z: -1 };
        const detail = _resolveDetail(viewDef.spatial?.detailLevel);
        const swingByOpening = _readSwings();

        let injected = 0;
        const refusals: Array<{ openingId: string; code: string; reason: string }> = [];

        for (const wall of wallStore.getAll()) {
            const openings = wall.openings;
            if (!openings?.length) continue;
            if (levelId && wall.levelId && wall.levelId !== levelId) continue;
            const a = wall.baseLine?.[0];
            const b = wall.baseLine?.[1];
            if (!a || !b) continue;

            // §WALL-Y-DATUM (L-968) — THE PUBLISHED datum, never a second derivation. A wall on
            // a raised slab has a base plane no wall record can express, and re-deriving it as
            // `level.elevation + baseOffset` is exactly how a hosted element came to be seated
            // from the wrong rise once already.
            const baseY = resolveWallBaseYOrLevel(wall.id, Number(a.y) || 0, wall.baseOffset);
            const host = {
                baseStart: { x: a.x, z: a.z },
                baseEnd:   { x: b.x, z: b.z },
                baseY,
                thickness: wall.thickness,
                rakeAngleDeg: wall.rakeAngleDeg ?? null,
                curved: wall.arc != null,
            };
            const faceSign = nearFaceSign(host, { x: Number(dir.x) || 0, z: Number(dir.z) || 0 });

            for (const op of openings) {
                const swing = op.elementId ? swingByOpening.get(op.elementId) : undefined;
                const symOpening: ElevationSymbolOpening = {
                    id: op.id,
                    type: op.type === 'door' ? 'door' : 'window',
                    offset: op.offset,
                    width: op.width,
                    height: op.height,
                    sillHeight: op.sillHeight,
                    openingProfile: op.openingProfile,
                    leafCount: (op.type === 'door' ? op.doorType : op.windowType) ?? null,
                    hingesSide: swing?.hingesSide ?? null,
                    swingDirection: swing?.swingDirection ?? null,
                };

                const result = buildOpeningElevationSymbol(symOpening, host, { detail, faceSign });
                if (result.refusal) {
                    refusals.push({
                        openingId: op.id,
                        code: result.refusal.code,
                        reason: `${result.refusal.reason} — ${result.refusal.alternative}`,
                    });
                    continue;
                }
                if (result.polylines.length === 0) continue;

                const base = symOpening.type === 'door' ? DOOR_SYM_LAYER : GLAZ_SYM_LAYER;
                if (_emit(drawing, base, result.polylines, op.elementId ?? op.id)) injected++;
            }
        }

        if (refusals.length > 0) {
            console.warn(
                `[OpeningElevationSymbolBuilder] ${refusals.length} opening(s) REFUSED in view `
                + `${viewDef.id}: ` + refusals.map(r => `${r.openingId} (${r.code}) — ${r.reason}`).join(' · '),
            );
        }
        if (injected > 0) {
            console.log(
                `[OpeningElevationSymbolBuilder] §ELEV-SYMBOL-OPENING injected ${injected} `
                + `opening elevation symbol(s) into view ${viewDef.id}`,
            );
        }
        return { injected, refusals };
    }
}

/** Group by zone so each zone's polylines share one LineSegments — one pen resolution each. */
function _emit(
    drawing: OBC.TechnicalDrawing,
    baseLayer: string,
    polylines: readonly ElevationSymbolPolyline[],
    elementUUID: string,
): boolean {
    const byZone = new Map<DrawingZone, number[]>();
    for (const pl of polylines) {
        const pts = pl.points;
        if (pts.length < 2) continue;
        const buf = byZone.get(pl.zone) ?? [];
        const n = pts.length;
        const last = pl.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
            const p0 = pts[i]!;
            const p1 = pts[(i + 1) % n]!;
            buf.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
        }
        byZone.set(pl.zone, buf);
    }
    if (byZone.size === 0) return false;

    for (const [zone, positions] of byZone) {
        if (positions.length === 0) continue;
        const layer = layerForZone(baseLayer, zone);
        if (!drawing.layers.has(layer)) drawing.layers.create(layer);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x000000 }));
        lines.updateWorldMatrix(true, false);

        const projected = OBC.TechnicalDrawing.toDrawingSpace(lines, drawing);
        projected.name = layer;
        projected.userData.layerName = layer;
        // The ELEMENT tier (priority 10000) of the graphics-rules chain keys on this. Without
        // it a per-element pen override cannot reach an injected symbol — L-280, exactly.
        projected.userData.elementUUID = elementUUID;
        drawing.addProjectionLines(projected, layer);
        registerSegmentUUID(drawing, projected, elementUUID);
        geo.dispose();
        (lines.material as THREE.Material).dispose();
    }
    return true;
}

function _resolveDetail(v: unknown): SymbolDetail {
    const s = typeof v === 'string' ? v.toLowerCase() : '';
    if (s === 'coarse' || s === 'medium' || s === 'fine') return s;
    // Matches DEFAULT_DETAIL_LEVEL — raised to 'fine' by L-252, not re-decided here.
    return 'fine';
}

/**
 * Door swing, keyed by the door's element id.
 *
 * Returns an EMPTY map when the door store is absent or shaped differently — and that is a
 * deliberate, visible outcome: {@link buildOpeningElevationSymbol} draws NO swing indicator
 * when the hand is unknown, rather than defaulting to `'left'` as the door schema does. A
 * defaulted hinge side on a construction drawing is a construction error.
 */
function _readSwings(): Map<string, { hingesSide?: 'left' | 'right'; swingDirection?: 'inward' | 'outward' }> {
    const out = new Map<string, { hingesSide?: 'left' | 'right'; swingDirection?: 'inward' | 'outward' }>();
    const store = storeRegistry.getStoreForType('door') as unknown as ReadableDoorStore | undefined;
    if (!store || typeof store.getAll !== 'function') return out;
    try {
        for (const d of store.getAll()) {
            if (!d?.id) continue;
            out.set(d.id, { hingesSide: d.hingesSide, swingDirection: d.swingDirection });
        }
    } catch {
        // A store that throws is a store that cannot answer — the same value as absent, and the
        // symbol correctly omits the swing rather than inventing one.
    }
    return out;
}

/** Singleton, mirroring `plumbingElevationSymbolBuilder`. */
export const openingElevationSymbolBuilder = new OpeningElevationSymbolBuilder();
