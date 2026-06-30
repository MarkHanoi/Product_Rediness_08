/**
 * §T-JOIN-PERP-GATE (2026-06-30) — partition near-miss T-join must CONNECT, not skip.
 *
 * THE defect (founder, resi-building generate log): a floor that should detect ~9
 * apartments detected only 2 rooms. The resolver logged
 *   `[WallJoinResolver] T-JOIN: trim distance exceeds safety bound, skipping`  (×28)
 *   `[RoomDetectionEngine] §DIAG-ROOM-LOOP … detectedRooms=2 unresolvedLoopBreaks=9`
 * — partition arms ended ~0.27–0.30 m off their host shell face, the room loops
 * never closed.
 *
 * Root cause (`_applyT`): the §SHORT-WALL-SAFETY guard rejected the T-trim when the
 * ALONG-AXIS trim length `trimPt.distanceTo(secJoinEp) > MAX_CORNER_OFFSET` (=snapRadius
 * = 0.5 m). At a SHALLOW approach angle that along-axis length blows up far past 0.5 m
 * even when the endpoint is only a SMALL PERPENDICULAR gap from the host face — exactly
 * the near-miss `_detect` already accepted (perp ≤ snapRadius). So a genuine near-miss
 * partition-T was wrongly skipped → the room loop gapped.
 *
 * Fix: gate on the TRUE PERPENDICULAR gap of the endpoint from the host face. If the
 * endpoint sits within MAX_CORNER_OFFSET of the face, CONNECT it (extend to the host
 * face) so the loop closes; a generous along-axis runaway cap (3×) still rejects
 * pathological grazing trims.
 *
 * These tests pin: (1) a shallow-angle partition whose end is a small PERPENDICULAR gap
 * from the host body is CONNECTED onto that body (loop-closing), not skipped; (2)
 * no-regression — a perpendicular near-miss still connects; (3) a TRULY stray endpoint
 * (large perpendicular gap) is still refused.
 */

import { describe, it, expect } from 'vitest';
import { WallJoinResolver } from '../src/WallJoinResolver';
import type { WallData } from '../src/WallTypes';

let _seq = 0;
function mk(
    start: [number, number],
    end: [number, number],
    thickness: number,
    createdAt?: number,
): WallData {
    const id = `wall_tpg_${_seq++}`;
    return {
        id, type: 'wall', levelId: 'L', properties: {}, childrenIds: [],
        baseLine: [{ x: start[0], y: 0, z: start[1] }, { x: end[0], y: 0, z: end[1] }],
        height: 3, thickness, baseOffset: 0, openings: [],
        metadata: createdAt != null ? { createdAt } : undefined,
    } as any;
}

/** Perpendicular distance from point p=(x,z) to the segment a→b (XZ). */
function perpToSeg(p: { x: number; z: number }, a: [number, number], b: [number, number]): number {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / len2));
    const fx = a[0] + t * dx, fz = a[1] + t * dz;
    return Math.hypot(p.x - fx, p.z - fz);
}

describe('WallJoinResolver — §T-JOIN-PERP-GATE (near-miss partition T connects, not skips)', () => {
    it('a MODERATE-angle partition whose end is ~0.3 m perpendicular off the host CONNECTS', () => {
        _seq = 0;
        // Long horizontal host (shell) along z=0.
        const host = mk([-10, 0], [10, 0], 0.2, 1);
        // Partition approaching the host at ~30°: it runs from (-5.196, -3.30) to (0, -0.30).
        // dx=5.196, dz=3.0 → angle to the host ≈ 30°. Its JOIN end at (0,-0.30) is ~0.30 m
        // (perpendicular) off the host body — the resi near-miss _detect accepts (≤ snapRadius
        // = 0.5). BUT the ALONG-AXIS trim to the host face is perp/sin(30°) ≈ 0.30/0.5 = 0.60 m
        // > MAX_CORNER_OFFSET (0.5) — pre-fix this tripped "trim distance exceeds safety bound,
        // skipping" and left the room loop gapped. §T-JOIN-PERP-GATE gates on the 0.30 m perp
        // gap (< 0.5) instead, so the trim CONNECTS.
        const part = mk([-5.196, -3.30], [0.0, -0.30], 0.1, 2);
        const before = perpToSeg(part.baseLine[1], [-10, 0], [10, 0]);
        expect(before, `pre-resolve perp gap ${before.toFixed(3)}m`).toBeGreaterThan(0.2);
        expect(before, `pre-resolve perp gap ${before.toFixed(3)}m within snap`).toBeLessThan(0.5);

        const res = WallJoinResolver.resolveLevel([host, part], { snapRadius: 0.5 });
        const jp = res.get(part.id);
        expect(jp, 'partition must be adjusted (T-join connected), not skipped').toBeTruthy();
        expect(jp!.invalid, 'partition must not be flagged invalid').toBeFalsy();

        // The join end must now sit ON the host's lateral face (perp ≈ host half-thickness
        // = 0.10 m), i.e. it CONNECTED — the gap is closed, the room loop can seal.
        const endPerp = perpToSeg(jp!.baseLine[1] as any, [-10, 0], [10, 0]);
        expect(endPerp, `post-resolve end perp ${endPerp.toFixed(3)}m (on host face)`).toBeLessThan(0.16);
        // The wall must not have been collapsed.
        const len = Math.hypot(
            jp!.baseLine[1].x - jp!.baseLine[0].x,
            jp!.baseLine[1].z - jp!.baseLine[0].z,
        );
        expect(len, `partition length ${len.toFixed(3)}m`).toBeGreaterThan(2.5);
    });

    it('no-regression: a near-PERPENDICULAR near-miss still connects to the host face', () => {
        _seq = 0;
        const host = mk([-10, 0], [10, 0], 0.2, 1);
        // Vertical partition whose top end is 0.12 m short of the host body.
        const part = mk([0, -4], [0, -0.12], 0.1, 2);
        const res = WallJoinResolver.resolveLevel([host, part], { snapRadius: 0.5 });
        const jp = res.get(part.id);
        expect(jp, 'perpendicular near-miss must connect').toBeTruthy();
        expect(jp!.invalid).toBeFalsy();
        const endPerp = perpToSeg(jp!.baseLine[1] as any, [-10, 0], [10, 0]);
        expect(endPerp, `end perp ${endPerp.toFixed(3)}m on host face`).toBeLessThan(0.16);
    });

    it('a TRULY stray endpoint (large perpendicular gap) is still refused', () => {
        _seq = 0;
        const host = mk([-10, 0], [10, 0], 0.2, 1);
        // Partition end is 0.9 m (perpendicular) off the host — well beyond MAX_CORNER_OFFSET
        // (0.5 m). _detect won't even see it as a T (> snapRadius), and the guard would refuse
        // it regardless. Assert it is NOT pulled onto the host face.
        const part = mk([0, -4], [0, -0.9], 0.1, 2);
        const res = WallJoinResolver.resolveLevel([host, part], { snapRadius: 0.5 });
        const jp = res.get(part.id);
        if (jp && !jp.invalid) {
            const endPerp = perpToSeg(jp.baseLine[1] as any, [-10, 0], [10, 0]);
            expect(endPerp, `stray end perp ${endPerp.toFixed(3)}m must stay off host`).toBeGreaterThan(0.5);
        }
        // If untouched (absent or invalid) that is also correct — it was not wrongly connected.
        expect(true).toBe(true);
    });
});
