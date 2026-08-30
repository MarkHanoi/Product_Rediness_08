// WallAnchor — THE ONE implementation of the wall-attachment anchor (ADR-0374, §GRAPH115).
//
// The identity half of §PLUMBFRAME: that convention (082d2225) fixed WHERE a
// wall-placed fixture's origin sits (the wall-contact edge midpoint) and WHICH
// WAY it faces (yaw from the wall's room-side normal) — and then the placement
// tools threw the wall's id away, so a wall-hung WC could not record the wall it
// hangs on (host-move-propagation-matrix.json, `plumbing × wall` SILENT;
// `furniture × wall` "THE LARGEST GAP IN THIS MATRIX").
//
// The anchor is a STORE-FIELD relationship (C78 §3.2(b)) on the element record:
// position/rotation stay authoritative on the element. This is deliberately NOT
// a C15 hosted element — C15 §0.1.1's own rule sends a family that cannot supply
// all four wall-host requirements (openings[], derived offset, a void, the
// bim-wall-updated rebuild) to "a sibling mechanism, not an amendment". This is
// that sibling, for point-placed families.
//
// ⛔ ONE implementation, per C84 EI-9. Mint, reseat and agreement all live HERE;
// no tool, tracker or command may re-derive the frame maths privately. The yaw
// convention is §PLUMBFRAME's exactly: for `Euler(0, yaw, 0)` local +Z lands on
// (sin yaw, cos yaw), so the yaw carrying a direction (dx, dz) is atan2(dx, dz),
// and local +X lands on (cos yaw, −sin yaw) = (dz, −dx)/len for that direction.

import { trace, type Tracer } from '@opentelemetry/api';

// P8 / C10 §2 — same tracer idiom as `DeleteElementsBatchCommand.ts` /
// `moveReweldPreflight.ts` in this package (C84 EI-9: one tracer authority per
// package, never a second wrapper). The span sits on the DECISION —
// `wallAnchorAgreement` — not on the frame maths it calls: a trace per
// projection would drown the one event an operator needs to see, which is
// "this anchor went stale and the follower DETACHED".
let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** The persisted anchor record. Additive-optional on the element (C47). */
export interface WallAnchor {
    /** The host element's id — a wall or a curtain wall. */
    readonly hostId: string;
    /** Which family the host belongs to, i.e. which store resolves it. */
    readonly hostKind: 'wall' | 'curtainWall';
    /**
     * Metres along the host baseline from `baseLine[0]` to the projection of
     * the element's anchor point — C15 §1's offset convention, reused rather
     * than rivalled (C84 EI-8: one vocabulary per concept).
     */
    readonly t: number;
    /**
     * Signed perpendicular metres from the baseline to the element's anchor
     * point. The sign encodes the FACE (which side of the centreline), the
     * magnitude encodes half-thickness + any authored gap. Positive is the
     * local +X side of the baseline direction, i.e. perp = (dirZ, −dirX).
     */
    readonly d: number;
    /** Element yaw MINUS host baseline yaw at anchor time (radians, (−π, π]). */
    readonly yawOffset: number;
}

/** Structural host shape — WallData and CurtainWallData both satisfy it. */
export interface AnchorHostBaselineLike {
    readonly id: string;
    readonly levelId?: string;
    readonly baseLine: ReadonlyArray<{ readonly x: number; readonly y?: number; readonly z: number }>;
}

/** Reseat tolerance: an element within this of its predicted pose still AGREES. */
export const WALL_ANCHOR_AGREE_EPS_M = 0.02;
/** Yaw agreement tolerance (~1°) — a user-rotated element must detach, not snap back. */
export const WALL_ANCHOR_AGREE_EPS_RAD = 0.0175;
/** Furniture back-face → wall face gap inside which placement mints an anchor. */
export const WALL_ANCHOR_SNAP_M = 0.15;
/** Slack past the baseline ends before a reseat refuses as off-host. */
export const WALL_ANCHOR_END_TOL_M = 0.001;

export interface WallAnchorHostFrame {
    readonly ax: number;
    readonly az: number;
    readonly dirX: number;
    readonly dirZ: number;
    readonly length: number;
    /** atan2(dirX, dirZ) — the yaw whose local +Z is the baseline direction. */
    readonly yaw: number;
}

/** Normalise an angle into (−π, π]. */
export function normalizeAnchorAngle(rad: number): number {
    let a = rad % (2 * Math.PI);
    if (a <= -Math.PI) a += 2 * Math.PI;
    if (a > Math.PI) a -= 2 * Math.PI;
    return a;
}

/**
 * The host's 2-D frame, or `null` for a degenerate baseline. `null` is a typed
 * refusal input, never silently treated as a zero frame (C78 §1.4).
 */
export function wallAnchorHostFrame(host: AnchorHostBaselineLike): WallAnchorHostFrame | null {
    const a = host.baseLine?.[0];
    const b = host.baseLine?.[1];
    if (!a || !b) return null;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-6) return null;
    const dirX = dx / length;
    const dirZ = dz / length;
    return { ax: a.x, az: a.z, dirX, dirZ, length, yaw: Math.atan2(dirX, dirZ) };
}

/**
 * Mint an anchor from the element's placed pose against the host it was placed
 * on. Creation-time authoring only — the host is the tool's own snap target,
 * never a later proximity search (C79 §2.2/§2.3).
 */
export function mintWallAnchor(
    element: { readonly x: number; readonly z: number; readonly yaw: number },
    host: AnchorHostBaselineLike,
    hostKind: WallAnchor['hostKind'],
): WallAnchor | null {
    const f = wallAnchorHostFrame(host);
    if (!f) return null;
    const vx = element.x - f.ax;
    const vz = element.z - f.az;
    // perp = (dirZ, −dirX): the local +X direction of the baseline yaw.
    const t = vx * f.dirX + vz * f.dirZ;
    const d = vx * f.dirZ - vz * f.dirX;
    return {
        hostId: host.id,
        hostKind,
        t,
        d,
        yawOffset: normalizeAnchorAngle(element.yaw - f.yaw),
    };
}

export type ReseatFromAnchorResult =
    | { readonly state: 'ok'; readonly x: number; readonly z: number; readonly yaw: number }
    | { readonly state: 'refused'; readonly reason: 'DEGENERATE_HOST' }
    /** C74 — a refusal carries BOTH numbers. */
    | { readonly state: 'refused'; readonly reason: 'OFF_HOST'; readonly t: number; readonly hostLength: number };

/** The element's pose implied by its anchor against the given host state. */
export function reseatFromWallAnchor(anchor: WallAnchor, host: AnchorHostBaselineLike): ReseatFromAnchorResult {
    const f = wallAnchorHostFrame(host);
    if (!f) return { state: 'refused', reason: 'DEGENERATE_HOST' };
    if (anchor.t < -WALL_ANCHOR_END_TOL_M || anchor.t > f.length + WALL_ANCHOR_END_TOL_M) {
        return { state: 'refused', reason: 'OFF_HOST', t: anchor.t, hostLength: f.length };
    }
    return {
        state: 'ok',
        x: f.ax + anchor.t * f.dirX + anchor.d * f.dirZ,
        z: f.az + anchor.t * f.dirZ - anchor.d * f.dirX,
        yaw: normalizeAnchorAngle(f.yaw + anchor.yawOffset),
    };
}

export type WallAnchorAgreement =
    | { readonly agrees: true }
    /** The anchor's prediction could not be computed against this host state. */
    | { readonly agrees: false; readonly why: 'UNPREDICTABLE'; readonly reason: 'DEGENERATE_HOST' | 'OFF_HOST' }
    /** The element is not where the anchor predicts — it was moved independently. */
    | { readonly agrees: false; readonly why: 'DIVERGED'; readonly distanceM: number; readonly yawDeltaRad: number };

/**
 * Does the element still sit where the anchor predicts against the PRE-move
 * host state? Divergence means the user moved/rotated the element since the
 * anchor was minted — the anchor is STALE and the follower must DETACH audibly,
 * never teleport authored geometry (C78 §1.4; C71 §1.2 semantic 5).
 */
export function wallAnchorAgreement(
    anchor: WallAnchor,
    hostBefore: AnchorHostBaselineLike,
    element: { readonly x: number; readonly z: number; readonly yaw: number },
): WallAnchorAgreement {
    return _tracer().startActiveSpan('pryzm.attachment.wallAnchorAgreement', (span) => {
        try {
            const r = _wallAnchorAgreement(anchor, hostBefore, element);
            span.setAttribute('pryzm.anchor.hostId', anchor.hostId);
            span.setAttribute('pryzm.anchor.hostKind', anchor.hostKind);
            span.setAttribute('pryzm.anchor.agrees', r.agrees);
            // UNPREDICTABLE and DIVERGED are DIFFERENT facts and must stay
            // readable apart: the first says the anchor could not be evaluated
            // against this host state, the second says the user moved the
            // element. Collapsing them to one boolean is the exact conflation
            // C71 §4.4 forbids.
            //
            // ⚠ Read through a widened structural view, NOT by narrowing on
            // `r.agrees`. This package's `tsconfig.json` does not narrow a
            // boolean-literal discriminant (`WallAnchorDependencyTracker.ts`
            // carries the identical pre-existing TS2339s for the same reason),
            // so narrowing here would compile at the root and fail the package
            // check. Every field is optional in this view precisely because
            // which ones exist depends on the arm.
            const d = r as {
                readonly why?: 'UNPREDICTABLE' | 'DIVERGED';
                readonly reason?: string;
                readonly distanceM?: number;
                readonly yawDeltaRad?: number;
            };
            if (!r.agrees && d.why) {
                span.setAttribute('pryzm.anchor.why', d.why);
                if (d.why === 'UNPREDICTABLE') {
                    if (d.reason) span.setAttribute('pryzm.anchor.reason', d.reason);
                } else {
                    if (typeof d.distanceM === 'number') span.setAttribute('pryzm.anchor.distanceM', d.distanceM);
                    if (typeof d.yawDeltaRad === 'number') span.setAttribute('pryzm.anchor.yawDeltaRad', d.yawDeltaRad);
                }
            }
            return r;
        } finally {
            span.end();
        }
    });
}

function _wallAnchorAgreement(
    anchor: WallAnchor,
    hostBefore: AnchorHostBaselineLike,
    element: { readonly x: number; readonly z: number; readonly yaw: number },
): WallAnchorAgreement {
    const predicted = reseatFromWallAnchor(anchor, hostBefore);
    if (predicted.state === 'refused') {
        return { agrees: false, why: 'UNPREDICTABLE', reason: predicted.reason };
    }
    const distanceM = Math.hypot(element.x - predicted.x, element.z - predicted.z);
    const yawDeltaRad = Math.abs(normalizeAnchorAngle(element.yaw - predicted.yaw));
    if (distanceM > WALL_ANCHOR_AGREE_EPS_M || yawDeltaRad > WALL_ANCHOR_AGREE_EPS_RAD) {
        return { agrees: false, why: 'DIVERGED', distanceM, yawDeltaRad };
    }
    return { agrees: true };
}

/** Baseline byte-equality — the one predicate deciding "this update moved the host". */
export function anchorHostBaselineChanged(
    prev: AnchorHostBaselineLike | undefined,
    next: AnchorHostBaselineLike,
): boolean {
    if (!prev) return true;
    const pa = prev.baseLine?.[0]; const pb = prev.baseLine?.[1];
    const na = next.baseLine?.[0]; const nb = next.baseLine?.[1];
    if (!pa || !pb || !na || !nb) return true;
    return pa.x !== na.x || pa.z !== na.z || pb.x !== nb.x || pb.z !== nb.z;
}
