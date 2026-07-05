// hostedPickPriority — §FIX-3D-DOOR-PICK-PRIORITY (L-99b) — C04 §3.2 picking.
//
// A wall-hosted door/window is a SMALL element set into a much larger host wall (and it
// sits in the wall reveal, so the wall's near face can be a few cm closer to the camera at
// the clicked pixel). The founder could not select a door in 3D at all — every pick
// resolved to the host WALL (or the FLOOR), never the door. When the door IS registered in
// the pick buffer but loses the exact-pixel race to its host, this pure resolver lets the
// nearer small hosted element WIN over the big host that is essentially coplanar with it.
//
// It operates on the depth-sorted candidate list from a small neighbourhood `pickRect`
// probe (front-to-back). It is a no-op when the frontmost hit is already a hosted element,
// or when no hosted element is present near the host (e.g. the door genuinely isn't under
// the cursor, or — the other L-99b root — the door mesh carries no pick id at all, which
// the diagnostics surface separately).

import { withSpanSync } from './otel.js';

/** Large "host" element kinds that a hosted opening should be able to win over. */
const HOST_KINDS: ReadonlySet<string> = new Set(['wall', 'slab', 'floor', 'ceiling', 'roof']);

/** Wall-hosted opening kinds that should win over their (coplanar) host. */
const HOSTED_KINDS: ReadonlySet<string> = new Set(['door', 'window', 'opening']);

export interface HostedPickCandidate {
    readonly elementId: string;
    /** Runtime element kind string (lower-cased userData.elementType). */
    readonly elementKind: string;
    /** Camera→hit distance in scene units (metres). */
    readonly distance: number;
}

export interface HostedPickPriorityOptions {
    /**
     * How much FARTHER than the frontmost host a hosted opening may be and still win.
     * A door set into a wall reveal is within roughly the wall thickness of the host's
     * near face, so the default (0.6 m) comfortably covers standard wall thicknesses
     * without letting a genuinely distant opening steal the pick.
     */
    readonly depthEpsilonM?: number;
}

/**
 * Given the depth-sorted pick candidates under (or immediately around) the cursor, return
 * the candidate that should be selected — preferring a wall-hosted door/window that is
 * essentially coplanar with a frontmost host wall/slab/floor. Returns the frontmost
 * candidate unchanged when no such preference applies, or null for an empty list.
 *
 * P8: emits `pryzm.picking.hosted_priority`.
 */
export function resolveHostedPickPriority(
    candidates: readonly HostedPickCandidate[],
    opts: HostedPickPriorityOptions = {},
): HostedPickCandidate | null {
    return withSpanSync(
        'pryzm.picking.hosted_priority',
        { 'pryzm.pick.candidate_count': candidates.length },
        (span) => {
            if (candidates.length === 0) {
                span.setAttribute('pryzm.pick.result', 'empty');
                return null;
            }
            const sorted = [...candidates].sort((a, b) => a.distance - b.distance);
            const front = sorted[0]!;
            const frontKind = front.elementKind?.toLowerCase?.() ?? front.elementKind;

            // Already a hosted win, or the frontmost is neither a host nor hosted → leave it.
            if (HOSTED_KINDS.has(frontKind)) {
                span.setAttribute('pryzm.pick.result', 'front-hosted');
                return front;
            }
            if (!HOST_KINDS.has(frontKind)) {
                span.setAttribute('pryzm.pick.result', 'front-other');
                return front;
            }

            // Frontmost is a large host — promote the NEAREST hosted opening that is within
            // the coplanar epsilon of the host's near face.
            const epsilon = opts.depthEpsilonM ?? 0.6;
            const hosted = sorted.find(
                (c) => HOSTED_KINDS.has(c.elementKind?.toLowerCase?.() ?? c.elementKind)
                    && c.distance <= front.distance + epsilon,
            );
            if (hosted) {
                span.setAttribute('pryzm.pick.result', 'hosted-promoted');
                span.setAttribute('pryzm.pick.promoted_kind', hosted.elementKind);
                return hosted;
            }
            span.setAttribute('pryzm.pick.result', 'front-host');
            return front;
        },
    );
}
