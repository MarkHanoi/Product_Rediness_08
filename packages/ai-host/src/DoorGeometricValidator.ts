/**
 * @file DoorGeometricValidator.ts
 * @description Pure geometric utility for validating door/window gap placement on walls.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer / 05-BIM-UI-ARCHITECTURE-CONTRACT):
 *  - NEVER mutates stores. NEVER calls builders. NEVER calls commandManager.execute().
 *  - Pure utility: takes raw AI pixel data → returns geometry result.
 *  - Zero coupling to the BIM engine, scene, or any store.
 *  - No side effects beyond returning a value.
 *
 * Fix history:
 *   v1 — Junction node exclusion (count ≥ 3).
 *   v2 — Junction node exclusion upgraded: TWO-STAGE check.
 *        a) PRIMARY: transverse wall (>60°) endpoint at candidate point → T-junction.
 *        b) SECONDARY: 3+ walls of any direction converge here → collinear junction.
 *        Catches T-junctions where only 2 walls exist at the point (spine + partition).
 *   v3 — Wall-span guard: if detected gap spans >70% of total wall pixel length,
 *        it is the wall's own start/end endpoints being used as terminators, not a
 *        real door gap. Prevents gap-probe tiebreaker from accepting whole-wall spans.
 */

import { DetectedWall } from './FloorPlanAIFactory.js';

// ── Public types ────────────────────────────────────────────────────────────────

/**
 * Result returned by findCollinearEndpoints() when a valid real gap is found.
 * All measurements are in image pixel units, measured along the target wall's axis.
 */
export interface CollinearGapResult {
    /** 1D offset of the gap centre from targetWall.startPx along its axis (pixels). */
    gapCentreOffset1D: number;
    /** 1D offset of the gap start (closestBelow endpoint, pixels). */
    gapStart1D: number;
    /** 1D offset of the gap end (closestAbove endpoint, pixels). */
    gapEnd1D: number;
    /** Width of the detected gap in pixels. */
    gapWidthPx: number;
    /**
     * 2D pixel coordinate of the gap centre, reconstructed by projecting
     * gapCentreOffset1D back along the wall's unit direction vector from startPx.
     *
     * This point is axis-locked: its perpendicular distance to the wall centreline
     * is exactly 0. Use this instead of the AI-reported centrePx to guarantee the
     * opening sits on the wall centreline (Geometric Feedback Loop fix).
     */
    correctedCentrePx: { x: number; y: number };
}

// ── Constants ───────────────────────────────────────────────────────────────────

/**
 * v3 wall-span guard: maximum ratio of gap width to total wall pixel length.
 * A "gap" spanning more than 70% of the wall is not a real architectural opening —
 * it is the wall's own endpoints being picked as terminators (no intermediate gap).
 * Real doors (0.6–2.5 m) are always a small fraction of a typical wall's length.
 */
const MAX_GAP_TO_WALL_RATIO = 0.70;

/**
 * v4 corridor jamb proximity exception:
 * If a candidate endpoint projects within this many pixels of the opening centre
 * along the wall axis, it is treated as a potential DOOR JAMB rather than a
 * pure T-junction interior point, and is NOT excluded by isJunctionNode().
 *
 * Rationale: in corridor configurations, the room partition endpoints that form
 * the two sides of a corridor door gap look identical to T-junction nodes (a
 * transverse wall endpoint on the spine with no collinear stub). Without this
 * exception, isJunctionNode() would reject all corridor door jambs, leaving
 * findCollinearEndpoints() with no valid terminators and returning null for every
 * corridor door — preventing geometric offset correction.
 *
 * 200 px covers the widest realistic door gap at high image resolutions
 * (e.g. a 2.4 m door at 1:50 scale on a 2000 px image ≈ 96 px half-width).
 * Distant T-junctions (> 200 px from the opening centre) are still excluded.
 */
const CORRIDOR_JAMB_PROXIMITY_PX = 200;

// ── Main function ───────────────────────────────────────────────────────────────

/**
 * Finds the true gap centre for a door or window opening on `targetWall` by
 * analysing the 1D projections of all wall endpoints onto the target wall's axis.
 *
 * Algorithm:
 *   1. Project every wall endpoint onto the target wall's 1D axis (perpendicular
 *      distance filter: only keep endpoints within `collinearDistTol` of the axis).
 *   2. Split projected positions into those below and above the opening marker centre.
 *   3. Junction node exclusion (v2) — two-stage:
 *      a) PRIMARY: transverse wall endpoint at point → T-junction, excluded.
 *      b) SECONDARY: 3+ walls converge → collinear junction, excluded.
 *   4. Pick closestBelow = max(validBelow), closestAbove = min(validAbove).
 *   5. Gap continuity check — no collinear wall covers >50% of the interval.
 *   6. Wall-span guard (v3) — gap must not exceed 70% of total wall length.
 *   7. Return gap centre and bounds.
 *
 * @param targetWall        The wall hosting the opening (pixel-space DetectedWall)
 * @param walls             All AI-detected walls (pixel space)
 * @param openingCentrePx   Pixel centre of the door/window marker from the AI response
 * @param collinearDistTol  Max perpendicular pixel distance to qualify as on-axis (default 12)
 * @returns CollinearGapResult or null when no valid real gap can be confirmed
 */
export function findCollinearEndpoints(
    targetWall: DetectedWall,
    walls: DetectedWall[],
    openingCentrePx: { x: number; y: number },
    collinearDistTol: number = 12,
): CollinearGapResult | null {
    // ── Compute target wall axis unit vector ──────────────────────────────────
    const dx = targetWall.endPx.x - targetWall.startPx.x;
    const dy = targetWall.endPx.y - targetWall.startPx.y;
    const wallPixelLen = Math.hypot(dx, dy);
    if (wallPixelLen < 1) return null;

    const wDirX = dx / wallPixelLen;
    const wDirY = dy / wallPixelLen;

    // ── Project opening centre onto the wall's 1D axis ────────────────────────
    const ocDx = openingCentrePx.x - targetWall.startPx.x;
    const ocDy = openingCentrePx.y - targetWall.startPx.y;
    const openingProj1D = ocDx * wDirX + ocDy * wDirY;

    // ── Build candidates1D: endpoints of all walls on this axis ───────────────
    const candidates1D: number[] = [];

    for (const w of walls) {
        for (const pt of [w.startPx, w.endPx] as const) {
            const toPtX = pt.x - targetWall.startPx.x;
            const toPtY = pt.y - targetWall.startPx.y;
            const perpD = Math.abs(toPtX * wDirY - toPtY * wDirX);
            if (perpD > collinearDistTol) continue;
            const proj1D = toPtX * wDirX + toPtY * wDirY;
            candidates1D.push(proj1D);
        }
    }

    // Issue 9 — Own endpoint exclusion (v4):
    // Filter out projections that fall within ENDPOINT_EXCLUSION_PX of the target wall's
    // own boundary endpoints (0 and wallPixelLen). The target wall's startPx/endPx are
    // hard boundary points — using them as gap terminators places doors at wall ends
    // instead of at real opening gaps in the middle of the wall.
    const ENDPOINT_EXCLUSION_PX = 10;
    const filteredCandidates = candidates1D.filter(p =>
        p > ENDPOINT_EXCLUSION_PX &&
        p < wallPixelLen - ENDPOINT_EXCLUSION_PX,
    );

    const below = filteredCandidates.filter(p => p < openingProj1D - 1);
    const above = filteredCandidates.filter(p => p > openingProj1D + 1);

    if (below.length === 0 || above.length === 0) return null;

    // ── Junction node exclusion (v2 revised, v4 corridor jamb exception) ────────
    // A junction node is a point where a TRANSVERSE wall (>60° off axis) has an
    // endpoint AND there is no collinear wall stub ending cleanly here as a gap face.
    //
    // KEY DISTINCTION:
    //   TRUE T-JUNCTION (exclude): a transverse wall meets the target wall's interior.
    //     The transverse wall endpoint is ON the target wall body — not a gap terminator.
    //   GAP FACE (keep): a collinear wall stub ends here, AND a transverse wall also
    //     happens to start here (corner of the room). This IS a valid gap terminator.
    //
    // v4 CORRIDOR JAMB EXCEPTION: if the candidate is within CORRIDOR_JAMB_PROXIMITY_PX
    // of the opening centre along the wall axis, do NOT exclude it. In corridor
    // configurations, room partition endpoints flanking a door gap look exactly like
    // T-junction nodes, but they ARE the door jambs. Distant T-junctions (> 200 px
    // from the opening) are still excluded to prevent false positives.
    //
    // The fix: only exclude a candidate if a TRANSVERSE wall has an endpoint here
    // AND no collinear wall stub ends here (i.e. the point has no collinear wall
    // ending within collinearDistTol on the same axis).
    const isJunctionNode = (proj1D: number): boolean => {
        // v4: corridor jamb proximity exception — never exclude candidates close to
        // the opening centre, as they may be the door jamb endpoints
        if (Math.abs(proj1D - openingProj1D) <= CORRIDOR_JAMB_PROXIMITY_PX) {
            return false;
        }

        const ptX = targetWall.startPx.x + proj1D * wDirX;
        const ptY = targetWall.startPx.y + proj1D * wDirY;

        // Check if a collinear wall stub ends exactly here (= real gap face endpoint)
        let hasCollinearEndpoint = false;
        for (const w of walls) {
            for (const pt of [w.startPx, w.endPx]) {
                const d = Math.hypot(pt.x - ptX, pt.y - ptY);
                if (d >= collinearDistTol) continue;
                const wLen = Math.hypot(w.endPx.x - w.startPx.x, w.endPx.y - w.startPx.y);
                if (wLen < 1) continue;
                const wdx = (w.endPx.x - w.startPx.x) / wLen;
                const wdy = (w.endPx.y - w.startPx.y) / wLen;
                const dot = Math.abs(wdx * wDirX + wdy * wDirY);
                if (dot >= 0.5) { // collinear (within 60°) wall has an endpoint here
                    hasCollinearEndpoint = true;
                    break;
                }
            }
            if (hasCollinearEndpoint) break;
        }

        // If a collinear endpoint exists here, this is a real gap face — do NOT exclude
        if (hasCollinearEndpoint) return false;

        // STAGE A: transverse wall (>60° off axis) endpoint here, no collinear endpoint
        // → this is a pure T-junction interior point, not a gap face
        for (const w of walls) {
            for (const pt of [w.startPx, w.endPx]) {
                const d = Math.hypot(pt.x - ptX, pt.y - ptY);
                if (d >= collinearDistTol) continue;
                const wLen = Math.hypot(w.endPx.x - w.startPx.x, w.endPx.y - w.startPx.y);
                if (wLen < 1) continue;
                const wdx = (w.endPx.x - w.startPx.x) / wLen;
                const wdy = (w.endPx.y - w.startPx.y) / wLen;
                const dot = Math.abs(wdx * wDirX + wdy * wDirY);
                if (dot < 0.5) return true; // transverse, no collinear endpoint → T-junction
            }
        }

        // STAGE B: 3+ walls of any direction converge here → collinear junction
        let count = 0;
        for (const w of walls) {
            const dStart = Math.hypot(w.startPx.x - ptX, w.startPx.y - ptY);
            const dEnd   = Math.hypot(w.endPx.x   - ptX, w.endPx.y   - ptY);
            if (dStart < collinearDistTol || dEnd < collinearDistTol) count++;
        }
        return count >= 3;
    };

    const validBelow = below.filter(p => !isJunctionNode(p));
    const validAbove = above.filter(p => !isJunctionNode(p));

    if (validBelow.length === 0 || validAbove.length === 0) return null;

    const closestBelow = Math.max(...validBelow);
    const closestAbove = Math.min(...validAbove);

    if (closestAbove <= closestBelow) return null;

    const gapStart = closestBelow;
    const gapEnd   = closestAbove;

    // ── Gap continuity check ──────────────────────────────────────────────────
    // If any collinear wall covers >50% of [gapStart, gapEnd] → segment boundary, not opening.
    const gapIsFilled = walls.some(w => {
        const wSegDx = w.endPx.x - w.startPx.x;
        const wSegDy = w.endPx.y - w.startPx.y;
        const wSegLen = Math.hypot(wSegDx, wSegDy);
        if (wSegLen < 1) return false;

        const wDx2 = wSegDx / wSegLen;
        const wDy2 = wSegDy / wSegLen;

        const dot = Math.abs(wDx2 * wDirX + wDy2 * wDirY);
        if (dot < 0.985) return false; // not collinear (>10° off)

        const perpD = Math.abs(
            (w.startPx.x - targetWall.startPx.x) * wDirY -
            (w.startPx.y - targetWall.startPx.y) * wDirX,
        );
        if (perpD > collinearDistTol) return false;

        const s1D = (w.startPx.x - targetWall.startPx.x) * wDirX +
                    (w.startPx.y - targetWall.startPx.y) * wDirY;
        const e1D = (w.endPx.x   - targetWall.startPx.x) * wDirX +
                    (w.endPx.y   - targetWall.startPx.y) * wDirY;
        const wMin = Math.min(s1D, e1D);
        const wMax = Math.max(s1D, e1D);

        const overlap = Math.min(wMax, gapEnd) - Math.max(wMin, gapStart);
        return overlap > (gapEnd - gapStart) * 0.5;
    });

    if (gapIsFilled) return null;

    const gapWidthPx = gapEnd - gapStart;

    // ── Wall-span guard (v3) ──────────────────────────────────────────────────
    // A gap spanning >70% of the wall's total length is not a real opening.
    // This catches cases where the wall's own startPx/endPx are the only collinear
    // endpoints — the "gap" is just the whole wall, not a structural gap.
    if (gapWidthPx > wallPixelLen * MAX_GAP_TO_WALL_RATIO) {
        console.debug(
            `[DoorGeometricValidator] Gap ${gapWidthPx.toFixed(0)}px rejected — ` +
            `spans ${((gapWidthPx / wallPixelLen) * 100).toFixed(0)}% of wall ` +
            `(max ${MAX_GAP_TO_WALL_RATIO * 100}%)`,
        );
        return null;
    }

    const gapCentreOffset1D = (gapStart + gapEnd) / 2;

    // Reconstruct the axis-locked 2D pixel coordinate from the 1D offset.
    // wDirX / wDirY are the wall's unit direction vectors already computed above.
    // Projecting along the unit vector guarantees perpendicular distance = 0.
    const correctedCentrePx = {
        x: targetWall.startPx.x + wDirX * gapCentreOffset1D,
        y: targetWall.startPx.y + wDirY * gapCentreOffset1D,
    };

    return { gapCentreOffset1D, gapStart1D: gapStart, gapEnd1D: gapEnd, gapWidthPx, correctedCentrePx };
}