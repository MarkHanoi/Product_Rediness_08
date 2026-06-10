// §DIAG-EXEC-STAIR support — per-level stair keep-out AABBs in WORLD XZ (metres).
//
// The HouseLayoutExecutor knows each stair's world footprint (it rotates the
// engine's layout-frame `rectMm` to world by `principalAxisRad` about `pivot` —
// see the §DIAG-STAIR block). The §DIAG-EXEC-STAIR per-room overlap test lives in
// `houseExecDiagnostics`, which runs later (after room detection, from the naming
// pass) and does NOT have the stair geometry. This tiny module is the seam: the
// executor RECORDS the world AABB per affected level id here, and the diagnostics
// pass READS it back. Cleared at the start of every build so a re-generate never
// carries a stale rect. Pure data — no behaviour change (read by logging only).

export interface StairRectWorld {
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
}

const rectsByLevel = new Map<string, StairRectWorld[]>();

/** Clear all recorded stair rects (call once at the start of a house build). */
export function resetStairRects(): void {
    rectsByLevel.clear();
}

/** Record a stair keep-out AABB (world XZ, metres) on a level id. */
export function recordStairRect(levelId: string, rect: StairRectWorld): void {
    const arr = rectsByLevel.get(levelId);
    if (arr) arr.push(rect);
    else rectsByLevel.set(levelId, [rect]);
}

/** The stair keep-out AABBs recorded for a level (empty if none). */
export function getStairRects(levelId: string): readonly StairRectWorld[] {
    return rectsByLevel.get(levelId) ?? [];
}
