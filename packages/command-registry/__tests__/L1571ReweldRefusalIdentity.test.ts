/**
 * §L-1571 — THE REFUSAL THAT TOLD THE GATE SOMEBODY ELSE'S STORY.
 *
 * ── THE FOUNDER'S LINE, AND WHY IT WAS FALSE THREE TIMES OVER ────────────────
 * Session 2026-08-20, item 2.1, first line of the drag:
 *
 *   [wallPlacementGate] §L-942-UNBLOCK wall …9A4H…: the re-weld would re-baseline
 *   2 non-subject wall(s) by up to 75 mm (C83 §10.2.2). REPORTED, NOT REFUSED
 *
 * The next line of the same log says what those two junctions actually were:
 * `AMBIGUOUS_WELD_AUTHORSHIP × 2`. So —
 *   • **nothing would be re-baselined.** That refusal exists precisely so that
 *     no wall moves; "would re-baseline" is the opposite of what it decided.
 *   • **75 mm is not a shift.** `AMBIGUOUS_WELD_AUTHORSHIP`'s `beyondMm` is
 *     `axialFromEndM` — how far ALONG the moved wall the abutment sits.
 *     `maxIncumbentShiftMm` printed it as a displacement.
 *   • **the second number was dropped.** C83 §10.3 requires both; the 101 mm
 *     band the 75 mm was measured against never reached the caller.
 *
 * ── AND THE MISLABEL WAS LOAD-BEARING ────────────────────────────────────────
 * `incumbentBreach` is the flag §L-942-UNBLOCK downgrades to report-only. That
 * downgrade was the founder's decision about ONE trade — a neighbour that
 * over-follows, *"KNOWN, VISIBLE, UNDOABLE"*. All six of the engine's refusal
 * codes were being funnelled onto it, so five other refusals inherited a
 * decision nobody took about them, and theirs is not visible or undoable: it is
 * a junction left open which the mitre pass then draws shut.
 *
 * ⚠ WHAT THIS FILE DOES NOT ASSERT: that anything now blocks. `allowed` is
 * measured to be UNCHANGED. Re-blocking the core gesture is L-942 and it is not
 * this lane's to repeat; whether the non-incumbent codes should stop a move is a
 * C83 §10.6 amendment and the founder's call.
 *
 * @file packages/command-registry/__tests__/L1571ReweldRefusalIdentity.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { previewMoveReweld, type PreflightWallStoreRef } from '../src/walls/moveReweldPreflight';

const LEVEL = 'L0';
const T = 0.100;       // the founder's host thickness (log: depth cap 101.5 mm)
const AXIAL = 0.075;   // the founder's ambiguous abutment (log: "up to 75 mm")
const DRAG = 0.260;

let seq = 0;
function wall(id: string, a: [number, number], b: [number, number]): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        _sourceBaseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        height: 3, thickness: T, baseOffset: 0, openings: [],
        metadata: { createdAt: ++seq },
    } as unknown as WallData;
}

/** M is the subject; P abuts it 75 mm from its end — the ambiguous band. */
function fixture(): PreflightWallStoreRef {
    const walls = [
        wall('M', [0, 0], [5, 0]),
        wall('P', [5 - AXIAL, 0], [5 - AXIAL, 3]),
    ];
    return {
        getById: (id) => walls.find(w => w.id === id),
        getAll: () => walls,
        getByLevel: () => walls,
    };
}

const ask = () => previewMoveReweld({
    wallStore: fixture(),
    wallId: 'M',
    prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    newBaseLine: [{ x: 0, y: 0, z: DRAG }, { x: 5, y: 0, z: DRAG }],
    joinedWallIds: ['P'],
});

describe('§L-1571 — a refusal keeps its own identity through the pre-flight', () => {

    it('reports the refusal\'s OWN code, not INCUMBENT_EXTENSION_REQUIRED', () => {
        const pre = ask();
        expect(pre.reason).toBe('AMBIGUOUS_WELD_AUTHORSHIP');
        // The code it used to be flattened to must not appear anywhere.
        expect(pre.reason).not.toContain('INCUMBENT_EXTENSION_REQUIRED');
        expect(pre.blockingIssues?.join(' ')).not.toContain('INCUMBENT_EXTENSION_REQUIRED');
    });

    it('does NOT claim a non-subject wall would be re-baselined — because none would', () => {
        const pre = ask();
        // THE HEADLINE. This is what §L-942-UNBLOCK's console line reads from,
        // and it is now empty for a refusal that moves nobody.
        expect(pre.incumbentBreach).toBe(false);
        expect(pre.incumbentWallIds).toEqual([]);
        // 75 mm is an axial position, not a displacement, so it must not be
        // reported as "up to N mm of shift".
        expect(pre.maxIncumbentShiftMm).toBe(0);
    });

    it('carries the junction, its code and BOTH numbers (C83 §10.3)', () => {
        const pre = ask();
        expect(pre.unrepairableJunctions).toHaveLength(1);
        const u = pre.unrepairableJunctions[0]!;
        expect(u.partnerId).toBe('P');
        expect(u.reason).toBe('AMBIGUOUS_WELD_AUTHORSHIP');
        expect(u.measuredMm).toBe(75);
        expect(u.limitMm).toBe(101);       // stemBand = t + COINCIDENT_M
        // The SENTENCE is `describeReweldRefusal`'s — one mint, so the pre-move
        // report and the post-move §MOVE-REWELD-REFUSED backstop cannot describe
        // one junction with two stories.
        expect(u.sentence).toContain('AMBIGUOUS_WELD_AUTHORSHIP');
        expect(u.sentence).toContain('75 mm');
        expect(u.sentence).toContain('101 mm');
    });

    it('changes NO DECISION — `allowed` is still false, `ok` is still true', () => {
        const pre = ask();
        // Unchanged from before this lane: a refusal still denies, and the
        // cascade itself still never got to object. §L-942-UNBLOCK's branch in
        // `wallPlacementGate` therefore behaves byte-identically.
        expect(pre.allowed).toBe(false);
        expect(pre.ok).toBe(true);
        expect(pre.partnerIds).toEqual(['P']);
    });

    it('a move that breaks nothing reports a POSITIVE empty, not an absence', () => {
        const store = fixture();
        const pre = previewMoveReweld({
            wallStore: store,
            wallId: 'M',
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
            newBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],  // no move
            joinedWallIds: ['P'],
        });
        expect(pre.allowed).toBe(true);
        expect(pre.unrepairableJunctions).toEqual([]);
        expect(pre.incumbentBreach).toBe(false);
    });
});
