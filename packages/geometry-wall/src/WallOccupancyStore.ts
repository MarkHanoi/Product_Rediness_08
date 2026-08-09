/**
 * WallOccupancyStore — §OCCUPANCY Opening Placement Validator
 *
 * MODIFICATION DECLARATION
 * Layer:          Side System (Command validation utility)
 * Phase:          Phase I — Semantic Model & Core Engine
 * Files:          src/elements/walls/WallOccupancyStore.ts
 * Classification: A — New Side System (no change to existing layers)
 * Impact:         Adds overlap detection for opening placement.
 *                 CreateWallOpeningCommand.canExecute() now rejects placements
 *                 that would overlap any existing opening on the same wall.
 *                 Undo/redo, project loading, and IFC import are unaffected —
 *                 this system reads WallStore state directly and carries no
 *                 independent state of its own.
 * Risk:           LOW — purely additive.  Existing placements are unchanged.
 *                 canExecute() validation was previously always returning ok:true
 *                 (only checked wall existence); this adds a conflict check on top.
 * Rationale:      Pascal WallSpatialGrid pattern adapted to PRYZM's stateless
 *                 architecture.  See Priority 2 in master analysis doc.
 *
 * Design principle:
 *   WallOccupancyStore is a PURE-QUERY side system.  It reads wall.openings[]
 *   directly from a frozen WallData record at query time.  It carries no
 *   independent state — WallStore is the single source of truth.
 *
 *   This means:
 *     • No register() / unregister() lifecycle management
 *     • Transparent to undo/redo (wall state reverts → occupancy query reverts)
 *     • Transparent to project loading (openings already in WallData)
 *     • Zero risk of stale state accumulation
 *
 * Contract compliance:
 *   §06-8.5  — Defines this class and its query contract
 *   §03-4.8  — canExecute() must call canPlace() before adding an opening
 *   R-1      — WallStore is source of truth; this system never writes to it
 *   §2.7     — Builder is never called from here
 */

import { WallData, Opening } from './WallTypes';
import { wallCentrelineLength } from './WallArcParam';
// §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) — the same predicate WallStore uses,
// so the pre-flight decline and the store's last-line guard can never disagree.
import { isVerticalRake } from './WallRake';

/**
 * §LOAD-REDETECT-FREEZE (2026-06-25) — true while a project restore replays the
 * Create* commands. Restoring a persisted building runs canPlace() once per
 * opening, so the success log below fires hundreds–thousands of times on the
 * load thread — pure noise (every opening was already validated when first
 * authored, and on restore the data is known-good). ProjectLoader.load() sets
 * `globalThis.__pryzmProjectLoadActive` for the load window; live edits are
 * unaffected and still log normally.
 */
function __pryzmLoadActive(): boolean {
    // §GEN-LOG-GATING (L-369, 2026-07-17) — also suppress on the building-generation path
    // (`__pryzmBuildingGenActive`, set by buildingGenerationLifecycle). A resi/office/house
    // generation runs canPlace() once per opening (hundreds), so the success log below floods
    // the console during generation exactly as it does on a bulk restore — pure noise, since
    // every opening was validated when the generator authored it. Live edits still log.
    const g = globalThis as unknown as { __pryzmProjectLoadActive?: boolean; __pryzmBuildingGenActive?: boolean };
    return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CanPlaceResult {
    valid:       boolean;
    conflictIds: string[];   // Opening.id values of conflicting entries
    reason?:     string;     // Human-readable failure message (absent when valid)
}

/**
 * §FIX-WINDOW-OOB-OPENING-RESTORE — a hosted opening's four positional /
 * dimensional degrees of freedom along + across its host wall.
 */
export interface OpeningDims {
    offset:     number;   // LEFT-EDGE offset along the wall baseline (metres)
    width:      number;   // horizontal extent (metres)
    height:     number;   // vertical extent (metres)
    sillHeight: number;   // height of the opening base above the wall base (metres)
}

export interface ClampToWallResult extends OpeningDims {
    /** true when any field was adjusted to keep the frame inside the wall. */
    clamped: boolean;
}

// ─── WallOccupancyStore ───────────────────────────────────────────────────────

/**
 * Pure-query side system for opening placement validation.
 *
 * Usage:
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const result = wallOccupancyStore.canPlace(wall, offsetM, widthM);
 *   if (!result.valid) return { ok: false, reason: result.reason };
 */
export class WallOccupancyStore {

    /**
     * 1 mm tolerance so that openings that share an exact edge
     * (e.g., a door flush against a window) are NOT treated as conflicting.
     */
    private static readonly EPSILON_M = 0.001;

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE — smallest hosted-opening dimension the
     * clamp will leave when a wall is too small to fit the requested frame.
     * Keeps the opening a valid, positive, cuttable span (never zero/negative).
     */
    static readonly MIN_OPENING_M = 0.05;

    /**
     * §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — clamp a hosted opening's dimensions
     * so the frame span [offset, offset+width] × [sillHeight, sillHeight+height]
     * stays ENTIRELY within the host wall's extent (length × height).
     *
     * A window/door dimension edit (width / height / offset / sillHeight) had no
     * wall-extent guard — only the MOVE path validated via canPlace(). An
     * out-of-bounds edit produced an opening that exceeded the wall, orphaned the
     * cut, and (once desynced from the WallStore) could neither re-cut nor be
     * deleted. Guarding every dimension write through this pure clamp makes the
     * out-of-bounds state impossible: the frame can never exceed the wall, so the
     * opening is always a valid in-bounds span that the builder can cut, and any
     * later in-bounds edit recovers cleanly.
     *
     * Behaviour (mirrors WindowTool's existing placement clamp
     * `offset = max(0, min(offset, wallLength - width))`):
     *   • horizontal: width ∈ [MIN, wallLength]; offset ∈ [0, wallLength - width]
     *     — a width that fits is preserved by shifting the offset inward; only a
     *     width larger than the whole wall is itself shrunk.
     *   • vertical:   height ∈ [MIN, wallHeight]; sillHeight ∈ [0, wallHeight - height].
     *
     * PURE — reads `wall.baseLine` / `wall.curve` (planar XZ CENTRELINE length; Y
     * carries level elevation per the canonical schema) and `wall.height`;
     * writes nothing.
     *
     * §FEAT-HOSTED-ON-CURVED-WALL — the horizontal extent is the CENTRELINE ARC
     * length, not the chord. A curved wall's arc is always ≥ its chord, so the
     * old chord clamp squeezed every opening on a curved host into the chord's
     * shorter span and pushed it off the far end of the wall. For a straight
     * wall `wallCentrelineLength` returns the chord, so this is a no-op there.
     */
    clampToWall(wall: WallData, dims: OpeningDims): ClampToWallResult {
        const wallLength = wallCentrelineLength(wall);
        const wallHeight = (typeof wall.height === 'number' && wall.height > 0)
            ? wall.height
            : Number.POSITIVE_INFINITY;

        const MIN = WallOccupancyStore.MIN_OPENING_M;
        const clamp = (v: number, lo: number, hi: number): number =>
            Math.min(Math.max(v, lo), Math.max(lo, hi));

        let { offset, width, height, sillHeight } = dims;

        // Degenerate wall — cannot fit any opening; leave dims untouched so the
        // caller / builder can surface the real problem (zero-length wall).
        if (!(wallLength > 0)) {
            return { offset, width, height, sillHeight, clamped: false };
        }

        // ── Horizontal: keep the requested width if it fits by shifting offset ──
        width  = clamp(width, MIN, wallLength);
        offset = clamp(offset, 0, wallLength - width);

        // ── Vertical ────────────────────────────────────────────────────────────
        if (Number.isFinite(wallHeight)) {
            height     = clamp(height, MIN, wallHeight);
            sillHeight = clamp(sillHeight, 0, wallHeight - height);
        } else {
            height     = Math.max(height, MIN);
            sillHeight = Math.max(sillHeight, 0);
        }

        const clamped =
            offset     !== dims.offset ||
            width      !== dims.width ||
            height     !== dims.height ||
            sillHeight !== dims.sillHeight;

        return { offset, width, height, sillHeight, clamped };
    }

    /**
     * Checks whether a new opening [offsetM, offsetM + widthM] can be placed
     * on `wall` without overlapping any existing opening in wall.openings[].
     *
     * The check is purely 1-D along the wall baseline (horizontal extent).
     * Vertical stacking (different sill heights) is NOT permitted — BIM
     * semantics require each horizontal span to be exclusively owned by one
     * opening element (§06-8.5).
     *
     * @param wall        Frozen WallData — provides openings[] and baseLine
     * @param offsetM     Distance from wall start to LEFT edge of new opening (metres)
     * @param widthM      Width of the new opening (metres)
     * @param excludeId   Optional id to skip during the conflict check. Matched
     *                    against BOTH `Opening.id` AND `Opening.elementId` so a
     *                    caller may pass either the opening id OR the hosted
     *                    element id (door/window id). This is essential for the
     *                    MOVE path: a small in-place nudge of a door/window
     *                    produces a NEW range that overlaps the element's OWN
     *                    pre-move slot — without excluding it by elementId the
     *                    move is wrongly rejected as a self-conflict, because
     *                    Opening.id is distinct from the hosted element id.
     *
     * @returns  { valid: true } when placement is clear.
     *           { valid: false, conflictIds, reason } when blocked.
     */
    canPlace(
        wall:       WallData,
        offsetM:    number,
        widthM:     number,
        excludeId?: string,
    ): CanPlaceResult {

        // ── Compute wall length ────────────────────────────────────────────
        // §FEAT-HOSTED-ON-CURVED-WALL — the occupancy interval [offset, offset+width]
        // is measured along the wall CENTRELINE. For a curved host that is the ARC
        // length; chord maths would under-report the available span (arc ≥ chord),
        // wrongly rejecting legal placements near the far end and mis-judging
        // overlap between two openings set out along the arc.
        // For a straight wall this is the planar chord — identical to the previous
        // 3-D `baseLine` distance, because `baseLine[*].y` carries LEVEL ELEVATION
        // (identical at both ends), never a vertical run.
        const wallLengthM = wallCentrelineLength(wall);

        if (wallLengthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      'Wall has zero length — cannot place openings',
            };
        }

        // ── §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH (L-812) ───────────────────────
        //
        // A RAKED host cannot carry an opening: the carve is a vertical band and
        // the door/window transform assumes a vertical host face (C15, ADR-0310).
        // `WallStore.addOpening()` already refuses this — correctly — by THROWING
        // a `WallSchemaError`.
        //
        // The throw is the problem. Reported from production 2026-08-09: placing a
        // window on a raked wall produced
        //   `[CommandManager] FATAL ERROR DURING EXECUTION WallSchemaError: …`
        // and the user simply saw "windows cannot be hosted". A deliberate POLICY
        // REFUSAL was being delivered as a crash, and the carefully-written reason
        // reached the devtools console instead of the person who needed it.
        //
        // Checking it HERE fixes both. `canPlace()` is already invoked on hover by
        // every placement path (the console shows it firing continuously as the
        // cursor moves), it already returns a human-readable `reason`, and callers
        // already treat `valid:false` as an ordinary decline. So the refusal now
        // happens BEFORE the command is dispatched: no fatal error, no aborted
        // command, and the reason travels the channel built for exactly this.
        //
        // The store guard STAYS. It is the last line of defence for any path that
        // bypasses this one, and defence-in-depth on a geometric invariant is
        // cheap. What changes is that it should now be unreachable from the UI.
        //
        // ⚠ The panel already refused the RAKE ROW on a wall that hosts openings.
        // The mirror case — refusing an OPENING on a wall that is raked — was
        // simply never implemented, so the panel and the store disagreed about who
        // enforced the rule. That asymmetry was the actual defect.
        if (!isVerticalRake((wall as { rakeAngleDeg?: number | null }).rakeAngleDeg)) {
            return {
                valid:       false,
                conflictIds: [],
                reason:
                    'This wall is angled (raked), so it cannot host a door or window yet — ' +
                    'the opening is cut as a vertical band and the leaf/frame assume a ' +
                    'vertical face. Set the wall\'s Vertical Angle back to 90° first.',
            };
        }

        // ── Basic bounds validation ────────────────────────────────────────
        if (widthM <= 0) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      `Opening width must be > 0 (got ${widthM.toFixed(3)} m)`,
            };
        }

        const eps = WallOccupancyStore.EPSILON_M;

        if (offsetM < -eps) {
            return {
                valid:       false,
                conflictIds: [],
                reason:      `Offset ${offsetM.toFixed(3)} m is before wall start`,
            };
        }

        const newEnd = offsetM + widthM;
        if (newEnd > wallLengthM + eps) {
            return {
                valid:       false,
                conflictIds: [],
                reason: (
                    `Opening [${offsetM.toFixed(3)} m, ${newEnd.toFixed(3)} m] ` +
                    `extends beyond wall length ${wallLengthM.toFixed(3)} m`
                ),
            };
        }

        // ── Overlap detection ─────────────────────────────────────────────
        //
        // Two 1-D intervals [a, a+wa] and [b, b+wb] overlap when:
        //   a < b + wb - ε   (new opening starts before existing ends)
        //   AND
        //   a + wa > b + ε   (new opening ends after existing starts)
        //
        // The EPSILON ensures that touching edges (a+wa == b, within 1 mm) are
        // treated as NON-overlapping so adjacent windows can share a frame edge.

        const conflicts: string[] = [];
        const openings: Opening[] = wall.openings ?? [];

        for (const existing of openings) {
            // §MOVE-EXCLUDE-SELF: skip the element's OWN slot during a move so a
            // small in-place nudge isn't rejected as a self-conflict. The MOVE
            // commands pass the hosted element id (door/window id) as excludeId,
            // which equals Opening.elementId — NOT Opening.id — so we must match
            // either field. (Create still passes the new opening id, which won't
            // exist in openings[] yet, so this is a no-op for the create path.)
            if (excludeId && (existing.id === excludeId || existing.elementId === excludeId)) continue;

            const exStart = existing.offset;
            const exEnd   = existing.offset + existing.width;

            const overlaps = (
                offsetM < exEnd   - eps &&
                newEnd  > exStart + eps
            );

            if (overlaps) {
                conflicts.push(existing.id);
                console.log(
                    `[WallOccupancyStore] CONFLICT: new=[${offsetM.toFixed(3)},${newEnd.toFixed(3)}]m ` +
                    `vs existing ${existing.id} [${exStart.toFixed(3)},${exEnd.toFixed(3)}]m ` +
                    `on wall ${wall.id}`
                );
            }
        }

        if (conflicts.length > 0) {
            return {
                valid:       false,
                conflictIds: conflicts,
                reason:      `Opening overlaps existing opening(s): ${conflicts.join(', ')}`,
            };
        }

        if (!__pryzmLoadActive()) {
            console.log(
                `[WallOccupancyStore] canPlace OK: wall=${wall.id} ` +
                `offset=${offsetM.toFixed(3)}m width=${widthM.toFixed(3)}m ` +
                `wallLen=${wallLengthM.toFixed(3)}m`
            );
        }

        return { valid: true, conflictIds: [] };
    }

    /**
     * Returns all existing openings on a wall, sorted by offset.
     * Useful for tool UI that needs to display the occupied spans.
     *
     * Read-only — does not modify WallData.
     */
    getOccupiedSpans(wall: WallData): ReadonlyArray<{
        openingId: string;
        type:      'window' | 'door';
        offsetM:   number;
        endM:      number;
    }> {
        const openings: Opening[] = wall.openings ?? [];
        return openings
            .map(o => ({
                openingId: o.id,
                type:      o.type,
                offsetM:   o.offset,
                endM:      o.offset + o.width,
            }))
            .sort((a, b) => a.offsetM - b.offsetM);
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Module-level singleton — import and call directly, no constructor needed.
 *
 * @example
 *   import { wallOccupancyStore } from './WallOccupancyStore';
 *   const { valid, reason } = wallOccupancyStore.canPlace(wall, 1.2, 0.9);
 */
export const wallOccupancyStore = new WallOccupancyStore();
