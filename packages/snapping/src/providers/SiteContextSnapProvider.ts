/**
 * §L-432 — SiteContextSnapProvider: snap to the PARCEL BOUNDARY and the BUILDABLE ENVELOPE.
 *
 * WHY THIS EXISTS
 * ---------------
 * L-425/426/431 made both cadastral references VISIBLE in the PRYZM views, and L-401 makes the
 * GENERATORS build inside the C58 envelope. But a user drawing walls BY HAND had nothing to
 * bite onto, so hand-authored geometry could silently violate the very setback line the
 * envelope panel claims to enforce. Compliance-by-construction held only on the generated
 * path; this extends it to manual authoring. Without it the guides are decorative.
 *
 * THE SETBACK LINE IS THE HIGH-VALUE TARGET: "build to the setback" is the single most common
 * architectural move on a constrained plot, so envelope candidates are ranked marginally above
 * the equivalent parcel ones (see PRIORITIES below).
 *
 * LAYERING (L1): this package may not import the site model, `@pryzm/site-parcel-data` (L2) or
 * anything in `apps/`. The rings are therefore INJECTED via a callback, exactly as
 * `GridSnapProvider` takes `getBimGrids`. The provider stays pure geometry + a data source it
 * knows nothing about.
 *
 * REFERENCE GEOMETRY, NOT MODEL GEOMETRY (C34): these rings must be snappable but never
 * selectable or editable as BIM. This provider only ever EMITS candidates — it owns no
 * elements and registers nothing in any store — so that separation holds by construction.
 *
 * PRIORITIES — deliberate, and the reason they sit where they do:
 *   envelope vertex   96  ┐ just BELOW a real wall ENDPOINT (100): when a wall corner and a
 *   parcel   vertex   94  ┘ site corner are both in range, the user's own geometry wins.
 *   envelope midpoint 77  ┐ likewise below MIDPOINT (80).
 *   parcel   midpoint 75  ┘
 *   envelope edge     56  ┐ ABOVE the uniform math GRID (10) and just above generic EDGE (50):
 *   parcel   edge     54  ┘ the setback line is a legal constraint, a background grid is a
 *                           typing aid, so the constraint should win.
 * Same-class ties resolve envelope-before-parcel, which is what "build to the setback" wants.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { ISnapProvider, SnapCandidate, SnapType } from '../types';

/** A 2D ring in world XZ metres. Open or closed — the closing edge is implied. */
export type SiteRingXZ = ReadonlyArray<{ x: number; z: number }>;

/**
 * The site context this provider snaps to. Supplied by the app layer, which owns the site
 * store read. Either ring may be null (no parcel committed / no valid envelope).
 */
export interface SiteSnapContext {
    /** Committed parcel boundary ring (world XZ metres). */
    readonly parcelRing: SiteRingXZ | null;
    /** Buildable-envelope inset ring — the SETBACK LINE (world XZ metres). */
    readonly envelopeRing: SiteRingXZ | null;
}

/** Priorities — see the header block for why each sits where it does. */
const PRIORITY = {
    envelopeVertex: 96,
    parcelVertex: 94,
    envelopeMidpoint: 77,
    parcelMidpoint: 75,
    envelopeEdge: 56,
    parcelEdge: 54,
} as const;

interface RawCandidate {
    x: number;
    z: number;
    type: SnapType;
    priority: number;
    label: string;
    ref: 'parcel' | 'envelope';
}

/**
 * Nearest point on segment a→b to p, in the XZ plane. Returns the point and whether it is a
 * genuine interior foot (t strictly inside), so an edge candidate is not emitted where a
 * vertex candidate already sits — that would be two candidates at one place, with the lower
 * priority one able to win on a marginally shorter distance.
 */
function nearestOnSegment(
    ax: number, az: number, bx: number, bz: number, px: number, pz: number,
): { x: number; z: number; interior: boolean } {
    const dx = bx - ax;
    const dz = bz - az;
    const lenSq = dx * dx + dz * dz;
    if (lenSq <= 1e-12) return { x: ax, z: az, interior: false };
    let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
    const interior = t > 1e-6 && t < 1 - 1e-6;
    t = Math.max(0, Math.min(1, t));
    return { x: ax + dx * t, z: az + dz * t, interior };
}

export class SiteContextSnapProvider implements ISnapProvider {
    readonly providerType = 'site-context';

    /**
     * Injected reader for the current site context. Called per query (not cached) so a newly
     * committed parcel or a recomputed envelope becomes snappable immediately, matching how
     * the plan pane reads its rings.
     */
    private readonly getContext: () => SiteSnapContext | null;

    /** Master on/off, so the UI can offer "snap to site context" as a user toggle. */
    private enabled = true;

    constructor(getContext: () => SiteSnapContext | null) {
        this.getContext = getContext;
    }

    setEnabled(on: boolean): void {
        this.enabled = on;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    getCandidates(
        queryPoint: THREE.Vector3,
        radius: number,
        enabledTypes: Set<SnapType>,
    ): SnapCandidate[] {
        if (!this.enabled) return [];

        let ctx: SiteSnapContext | null = null;
        try {
            ctx = this.getContext();
        } catch {
            return [];   // a failing site read must never break drawing
        }
        if (!ctx) return [];

        const raw: RawCandidate[] = [];
        // Envelope FIRST so that, at equal distance and priority, it is encountered first.
        this._collectRing(ctx.envelopeRing, 'envelope', queryPoint, enabledTypes, raw);
        this._collectRing(ctx.parcelRing, 'parcel', queryPoint, enabledTypes, raw);
        if (raw.length === 0) return [];

        const out: SnapCandidate[] = [];
        const r2 = radius * radius;
        // Snap in the XZ plane: keep the query's own Y so a candidate does not drag the point
        // vertically (these rings are ground-plane references, not 3D geometry).
        const y = queryPoint.y;
        for (const c of raw) {
            const dx = c.x - queryPoint.x;
            const dz = c.z - queryPoint.z;
            const d2 = dx * dx + dz * dz;
            if (d2 > r2) continue;
            out.push({
                point: new THREE.Vector3(c.x, y, c.z),
                type: c.type,
                priority: c.priority,
                distance: Math.sqrt(d2),
                sourceType: 'site-context',
                sourceId: c.ref,
                // `siteRef` lets the UI paint a DISTINCT glyph: a setback snap must be legible
                // AS a setback snap, not mistaken for a grid or wall snap.
                metadata: { label: c.label, siteRef: c.ref },
            });
        }
        return out;
    }

    private _collectRing(
        ring: SiteRingXZ | null,
        ref: 'parcel' | 'envelope',
        q: THREE.Vector3,
        enabledTypes: Set<SnapType>,
        out: RawCandidate[],
    ): void {
        if (!ring || ring.length < 2) return;

        const isEnv = ref === 'envelope';
        const vertexPriority = isEnv ? PRIORITY.envelopeVertex : PRIORITY.parcelVertex;
        const midPriority = isEnv ? PRIORITY.envelopeMidpoint : PRIORITY.parcelMidpoint;
        const edgePriority = isEnv ? PRIORITY.envelopeEdge : PRIORITY.parcelEdge;
        const name = isEnv ? 'setback' : 'parcel';

        const wantVertex = enabledTypes.has(SnapType.ENDPOINT);
        const wantMid = enabledTypes.has(SnapType.MIDPOINT);
        const wantEdge = enabledTypes.has(SnapType.EDGE);
        if (!wantVertex && !wantMid && !wantEdge) return;

        const n = ring.length;
        for (let i = 0; i < n; i++) {
            const a = ring[i]!;
            const b = ring[(i + 1) % n]!;   // closes the ring; open rings are the norm here

            if (wantVertex) {
                out.push({
                    x: a.x, z: a.z, type: SnapType.ENDPOINT,
                    priority: vertexPriority, label: `${name}Corner`, ref,
                });
            }

            // Skip the degenerate closing edge of an explicitly-closed ring (last === first).
            const dx = b.x - a.x, dz = b.z - a.z;
            if (dx * dx + dz * dz <= 1e-12) continue;

            if (wantMid) {
                out.push({
                    x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, type: SnapType.MIDPOINT,
                    priority: midPriority, label: `${name}EdgeMid`, ref,
                });
            }
            if (wantEdge) {
                const foot = nearestOnSegment(a.x, a.z, b.x, b.z, q.x, q.z);
                // Only emit an interior foot: at an endpoint the vertex candidate already
                // covers that position with a higher priority.
                if (foot.interior) {
                    out.push({
                        x: foot.x, z: foot.z, type: SnapType.EDGE,
                        priority: edgePriority, label: `${name}Edge`, ref,
                    });
                }
            }
        }
    }
}
