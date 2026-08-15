/**
 * §ROOF-FOLLOWS-WALL — does a roof FOLLOW a wall it is bounded by, when that
 * wall moves? (GR-12 · C79 §5.1/§5.2 · check-move-propagation A7.)
 *
 * ─── WHY THIS FILE EXISTS, RED, BEFORE ANY FIX ───────────────────────────────
 * `f5a2c726` (L0 `Roof.boundingWallIds`) and `6cd4e8e5` (L1
 * `RoofData.boundingWallIds`) made a roof reference-CAPABLE and said so in their
 * own commit messages: *"This makes a roof reference-CAPABLE. It does NOT yet
 * make one FOLLOW."* `check-move-propagation`'s roof arm cannot tell the
 * difference, because that arm is purely STRUCTURAL — it greps `RoofTypes.ts`
 * for the strings `hostReference|HostReferenceEdge|boundingWallIds|sketch?:`
 * (gate line 523) and passes when one is present. Adding the FIELD turned that
 * arm green without a single roof moving, and the gate's own header still
 * carries the now-false premise that justified the structural shortcut:
 * *"(e) The roof arm reads the roof DATA MODEL. It does not execute a roof move,
 * because `RoofData` has no field a reference could occupy."*
 *
 * A green structural arm over an unexecuted behaviour is exactly the inherited
 * green C70 §7.1 forbids. This suite executes the move the gate does not, so the
 * behaviour is measured rather than inferred from a field's existence.
 *
 * ─── WHAT IS MEASURED HERE, AT ITS CURRENT VALUE ─────────────────────────────
 * Arm 1 drives the production creation shape (`traceRoofRegionAtPoint` →
 * `RoofTool._normalisePolygon`'s centroid-local footprint → `RoofStore.add`),
 * then moves a bounding wall 2 m north — the region the roof was traced from
 * grows 36 m² → 48 m². The roof's STORED footprint stays 36 m². Nothing in
 * `packages/geometry-roof` subscribes to a wall store; the gate confirms it
 * ("the only wallStore.subscribe sites are door, window, slab ×2, room-topology
 * and four snap providers").
 *
 * Arm 2 asks the C79 §5.2 question the slab path already answers: after the
 * move, what STATE does the roof report? There is no roof recompute channel at
 * all, so the answer is not `undetermined` — it is silence, which §5.2.1 and
 * ADR-0299 both forbid ("a refusal and an empty result must not collapse to the
 * same value"). Silence is worse than either.
 *
 * Arm 3 is the honest-refusal case: a wall move that puts the traced region's
 * anchor OUTSIDE any closed loop. The roof must say `undetermined` with a typed
 * C78 §8.1 reason, NEVER an empty polygon and never a preserved-looking ring.
 *
 * The wall move below moves THREE walls' shared endpoints, not one baseline in
 * isolation: that is what the live `CASCADE_WALL_BASELINE` corner weld produces,
 * and a test that broke the loop open would be measuring a torn model rather
 * than a moved one.
 */

import { describe, it, expect } from 'vitest';
import { traceRoofRegionAtPoint, type RegionWallLike } from '../src/RoofRegionTrace';
import type { RoofData } from '../src/RoofTypes';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** A plain 6 × 6 room — 36 m², four straight walls, stable ids. */
function room6x6(): RegionWallLike[] {
    return [
        { id: 'w-south', baseLine: [{ x: 0, z: 0 }, { x: 6, z: 0 }] },
        { id: 'w-east', baseLine: [{ x: 6, z: 0 }, { x: 6, z: 6 }] },
        { id: 'w-north', baseLine: [{ x: 6, z: 6 }, { x: 0, z: 6 }] },
        { id: 'w-west', baseLine: [{ x: 0, z: 6 }, { x: 0, z: 0 }] },
    ] as RegionWallLike[];
}

/**
 * Move the north wall `dz` north, welding the two corners it shares with east
 * and west — the shape `CASCADE_WALL_BASELINE` commits. 6 × 6 → 6 × (6 + dz).
 */
function moveNorthWall(walls: RegionWallLike[], dz: number): RegionWallLike[] {
    return walls.map((w) => ({
        ...w,
        baseLine: (w as any).baseLine.map((p: { x: number; z: number }) =>
            p.z >= 6 - 1e-9 ? { x: p.x, z: p.z + dz } : p,
        ),
    })) as RegionWallLike[];
}

/** `RoofTool._normalisePolygon` — the footprint is stored CENTROID-LOCAL. */
function normalise(raw: [number, number][]): { polygon: [number, number][]; centroid: [number, number] } {
    let cx = 0, cz = 0;
    for (const [x, z] of raw) { cx += x; cz += z; }
    cx /= raw.length; cz /= raw.length;
    return { polygon: raw.map(([x, z]) => [x - cx, z - cz] as [number, number]), centroid: [cx, cz] };
}

function areaOf(polygon: ReadonlyArray<[number, number]>): number {
    let a = 0;
    for (let i = 0; i < polygon.length; i++) {
        const p = polygon[i]!, q = polygon[(i + 1) % polygon.length]!;
        a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
}

/** A roof created exactly the way the by-region path creates one. */
function roofFromTrace(walls: RegionWallLike[], x: number, z: number): RoofData {
    const traced = traceRoofRegionAtPoint(walls, x, z)!;
    const { polygon, centroid } = normalise(traced.polygon);
    return {
        id: 'r1', type: 'roof', levelId: 'L0',
        footprint: { polygon, centroid },
        roofType: 'flat', overhang: 0.3, baseOffset: 0, thickness: 0.2,
        boundingWallIds: traced.attribution.hostWallIds,
        properties: {},
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 't', version: 1 },
    } as RoofData;
}

// ── Arms ─────────────────────────────────────────────────────────────────────

describe('§ROOF-FOLLOWS-WALL — a roof and a wall that moves under it', () => {
    it('the fixture itself is sound: the region grows 36 m² → 48 m² when the wall moves', () => {
        // Not the subject — the CONTROL. If the traced region did not change,
        // "the roof did not follow" would be unfalsifiable.
        const before = traceRoofRegionAtPoint(room6x6(), 3, 3)!;
        const after = traceRoofRegionAtPoint(moveNorthWall(room6x6(), 2), 3, 3)!;
        expect(areaOf(before.polygon)).toBeCloseTo(36, 6);
        expect(areaOf(after.polygon)).toBeCloseTo(48, 6);
        expect(before.attribution.hostWallIds).toContain('w-north');
    });

    /**
     * THE BASELINE THIS SUITE WAS COMMITTED RED ON (86d1d4e0), kept as the
     * regression pin so the number that made the case cannot quietly return:
     *
     *   × MEASURED TODAY — a bounding wall moves 2 m and the roof record does not change
     *     AssertionError: expected 36 to be close to 48, received difference is 12
     *
     * Both halves are asserted together, because the point was never that 36 is
     * wrong — it is the correct authoring-time area — but that NOTHING carried
     * the record from 36 to 48 when the region did. The un-recomputed record
     * still reads 36 (data is not magic); routing it through the re-derivation
     * now reads 48.
     */
    it('REGRESSION PIN — the 36 m² record now reaches 48 m² through the re-derivation', async () => {
        const roof = roofFromTrace(room6x6(), 3, 3);
        expect(areaOf(roof.footprint.polygon)).toBeCloseTo(36, 6); // the old value

        const { recomputeRoofForWall } = await import('../src/RoofDependencyTracker');
        const [verdict] = recomputeRoofForWall([roof], moveNorthWall(room6x6(), 2), 'w-north');

        expect(areaOf(verdict!.footprint!.polygon)).toBeCloseTo(48, 6); // the new one
        expect(verdict!.numbers).toEqual({ oldAreaM2: 36, newAreaM2: 48 });
    });

    it("ARM 1 — the roof's STORED footprint follows a 2 m move of a bounding wall", async () => {
        const roof = roofFromTrace(room6x6(), 3, 3);
        expect(areaOf(roof.footprint.polygon)).toBeCloseTo(36, 6);

        const { recomputeRoofForWall } = await import('../src/RoofDependencyTracker');
        const verdicts = recomputeRoofForWall([roof], moveNorthWall(room6x6(), 2), 'w-north');

        expect(verdicts).toHaveLength(1);
        expect(verdicts[0]!.state).toBe('resized');
        expect(areaOf(verdicts[0]!.footprint!.polygon)).toBeCloseTo(48, 6);
    });

    it('ARM 2 — the re-derivation reports exactly ONE of C79 §5.2’s five states, with BOTH numbers', async () => {
        const roof = roofFromTrace(room6x6(), 3, 3);
        const { recomputeRoofForWall } = await import('../src/RoofDependencyTracker');

        // Zero move — re-derived from live walls, nothing changed.
        const still = recomputeRoofForWall([roof], room6x6(), 'w-north');
        expect(still[0]!.state).toBe('preserved');

        // Real move — resized, and C79 §5.2.2 / C73 §4 require BOTH numbers.
        const moved = recomputeRoofForWall([roof], moveNorthWall(room6x6(), 2), 'w-north');
        expect(moved[0]!.state).toBe('resized');
        expect(moved[0]!.numbers!.oldAreaM2).toBeCloseTo(36, 3);
        expect(moved[0]!.numbers!.newAreaM2).toBeCloseTo(48, 3);
    });

    it('ARM 3 — a roof that cannot be re-derived says UNDETERMINED with a typed reason, never an empty ring', async () => {
        const roof = roofFromTrace(room6x6(), 3, 3);
        const { recomputeRoofForWall } = await import('../src/RoofDependencyTracker');

        // The north wall is dragged PAST the south wall: no closed loop encloses
        // the roof's anchor any more. §check-no-empty-means-unknown: the answer
        // must be a typed refusal, not `[]` and not a preserved-looking ring.
        const verdicts = recomputeRoofForWall([roof], moveNorthWall(room6x6(), -8), 'w-north');

        expect(verdicts).toHaveLength(1);
        expect(verdicts[0]!.state).toBe('undetermined');
        expect(verdicts[0]!.reason).toBeTruthy();
        expect(verdicts[0]!.subReason).toBeTruthy();
        expect(verdicts[0]!.footprint).toBeUndefined();
    });

    it('ARM 4 — a roof that was never region-traced is not re-derived, and does not pretend to be', async () => {
        const drawnByRectangle = roofFromTrace(room6x6(), 3, 3);
        delete (drawnByRectangle as any).boundingWallIds; // rectangle/polyline path

        const { recomputeRoofForWall } = await import('../src/RoofDependencyTracker');
        const verdicts = recomputeRoofForWall([drawnByRectangle], moveNorthWall(room6x6(), 2), 'w-north');

        // `undefined` = never attributed. Not a dependent of this wall at all —
        // so no verdict, which is a different fact from every one of the five.
        expect(verdicts).toHaveLength(0);
    });
});
