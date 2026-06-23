// Residential building (multi-family) — §RESI-GROUND-FLOOR pure placement helpers.
//
// PURE, side-effect-free helpers the ResidentialBuildingExecutor uses to host the
// ground-floor MAIN ENTRANCE door on the commercial-shell perimeter. Kept in their own
// module (no THREE, no DOM, no command-bus imports) so they are cheap to unit-test in a
// node env without dragging in the executor's heavy runtime dependencies.
//
// The executor builds the ground shell as one wall per footprint edge (pre-minted ids,
// WORLD parcel coords). The orchestrator hands a WORLD entrance point (rotated from its
// LOCAL frame). `resolveEntranceOnShell` decides which shell wall hosts the door and where
// along it the opening sits.

/** A shell wall as the executor's wall.batch.create payload carries it: a pre-minted id +
 *  a 2-point baseLine in WORLD plan coords. Extra fields are ignored. */
export interface ShellWallLike {
    readonly id?: unknown;
    readonly baseLine?: unknown;
}

/** What `resolveEntranceOnShell` resolves: the host shell wall + its length + the projected
 *  CENTRE distance of the entrance point along it. The caller turns this into a concrete
 *  opening `offset` (the opening's START edge) given the door width via `entranceOffsetOnWall`. */
export interface EntranceHostHit {
    readonly wallId: string;
    /** The host wall's length (m). */
    readonly wallLengthM: number;
    /** Distance along the wall (m, from baseLine[0]) of the entrance CENTRE. */
    readonly centerAlongM: number;
}

/**
 * §RESI-GROUND-FLOOR — resolve which shell wall the WORLD entrance point sits on. The host is
 * the shell wall whose segment passes NEAREST the entrance point; `centerAlongM` is the
 * projection of the point onto that segment (the door's intended centre). Returns `undefined`
 * when no workable wall exists. Pure + deterministic. The opening's start `offset` is derived
 * separately by `entranceOffsetOnWall` (it needs the door width — kept out of the host search).
 */
export function resolveEntranceOnShell(
    walls: ReadonlyArray<ShellWallLike>,
    worldCenter: { x: number; z: number },
): EntranceHostHit | undefined {
    let best: EntranceHostHit | undefined;
    let bestDist = Infinity;
    for (const w of walls) {
        const id = typeof w.id === 'string' ? w.id : undefined;
        const line = w.baseLine as ReadonlyArray<{ x: number; z: number }> | undefined;
        if (!id || !Array.isArray(line) || line.length < 2) continue;
        const a = line[0]!, b = line[1]!;
        if (!a || !b || typeof a.x !== 'number' || typeof b.x !== 'number') continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        // Projection parameter t of the point onto the segment, clamped to [0,1].
        const tRaw = ((worldCenter.x - a.x) * dx + (worldCenter.z - a.z) * dz) / (len * len);
        const t = Math.max(0, Math.min(1, tRaw));
        const px = a.x + t * dx, pz = a.z + t * dz;
        const dist = Math.hypot(worldCenter.x - px, worldCenter.z - pz);
        if (dist < bestDist) {
            bestDist = dist;
            best = { wallId: id, wallLengthM: len, centerAlongM: t * len };
        }
    }
    return best;
}

/**
 * §RESI-GROUND-FLOOR — turn a resolved entrance CENTRE into the opening's START offset, given
 * the door width. The opening occupies `[offset, offset + widthM]` (WallOccupancyStore
 * convention), so we clamp the start so the whole leaf fits inside the wall, leaving `marginM`
 * at each jamb. A wall too short to host the door at the requested width falls back to centring
 * a shrunk leaf. Pure. Returns the start offset + the (possibly shrunk) effective width.
 */
export function entranceOffsetOnWall(
    hit: EntranceHostHit,
    widthM: number,
    marginM = 0.4,
): { offset: number; width: number } {
    const len = hit.wallLengthM;
    // Shrink the door if the wall can't host it with margins.
    const width = Math.min(widthM, Math.max(0.6, len - 2 * marginM));
    const minStart = marginM;
    const maxStart = Math.max(marginM, len - width - marginM);
    const desiredStart = hit.centerAlongM - width / 2;
    const offset = Math.max(minStart, Math.min(maxStart, desiredStart));
    return { offset, width };
}
