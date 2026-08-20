/**
 * §L-1570 — IS THERE WALL CORRUPTION? THE REPRODUCTION, AND THE PROBE THAT NAMES IT.
 *
 * Founder session 2026-08-20, item 2.1: *"Check for wall corruption"*, followed by a
 * console log of one wall drag. Four subsystems each printed one honest line and
 * nothing read them together:
 *
 *   §L-942-UNBLOCK          "would re-baseline 2 non-subject wall(s) by up to 75 mm … the move proceeds"
 *   §MOVE-REWELD-REFUSED    "AMBIGUOUS_WELD_AUTHORSHIP × 2 … LEFT UNREPAIRED"
 *   §NEAR-CORNER-L DEGRADED "gap=83mm … the corner closes VISUALLY … endpoints do NOT actually meet"
 *   §FIX-T-JOIN-PENETRATION "penetrates host by 310.0 mm (depth cap 101.5 mm) … Left UNHANDLED"
 *
 * ── THE FIXTURE IS BUILT FROM THE FOUNDER'S OWN NUMBERS ──────────────────────
 * Every constant below is read off that log rather than chosen:
 *   • host thickness 0.100 m — the ONLY value for which the log's `depth cap
 *     101.5 mm` is `thickness + CLASH_EPS_M (0.0015)`;
 *   • the partner's welded endpoint 0.075 m axially from the host's end — the
 *     ONLY value for which `AMBIGUOUS_WELD_AUTHORSHIP` reports `75` mm, since
 *     that refusal's `beyondMm` IS `axialFromEndM` (WallMoveReweld.ts §L-926);
 *   • it is inside the ambiguous band because `cornerBand = t/2 + COINCIDENT_M
 *     = 51 mm` and `stemBand = t + COINCIDENT_M = 101 mm`;
 *   • a drag of 0.260 m — the ONLY value that puts the partner's endpoint
 *     310 mm past the host's near face, which is the log's penetration.
 *
 * ── WHAT IS BEING MEASURED, IN ORDER ─────────────────────────────────────────
 *   1. The engine refuses the junction, with the founder's exact two numbers.
 *   2. The refusal means NOTHING repairs it — no entry names the partner.
 *   3. The resulting stored geometry is CORRUPT, and the probe says so, naming
 *      the junctions and carrying both numbers for each.
 *   4. The probe is SILENT on the same building drawn correctly — including on
 *      a healthy T-stem, whose stored endpoint legitimately sits one host
 *      half-thickness inside the solid, and on a healthy L, whose two endpoints
 *      are one model point.
 *
 * @file packages/geometry-wall/__tests__/L1570WallTopologyCorruption.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    auditWallTopology,
    describeWallTopologyFinding,
    summariseWallTopologyAudit,
    type WallTopologyInput,
} from '../src/WallTopologyIntegrity';
import { computeMoveReweldCensus } from '../src/WallMoveReweld';

const T = 0.100;          // host thickness, from the log's 101.5 mm depth cap
const AXIAL = 0.075;      // the ambiguous abutment, from the log's "up to 75 mm"
const DRAG = 0.260;       // the drag that yields the log's 310 mm penetration

const p = (x: number, z: number) => ({ x, y: 0, z });
const w = (id: string, a: [number, number], b: [number, number]): WallTopologyInput =>
    ({ id, baseLine: [p(a[0], a[1]), p(b[0], b[1])], thickness: T });

describe('§L-1570 — the founder\'s wall drag, reproduced', () => {

    it('1. the engine refuses the junction as AMBIGUOUS_WELD_AUTHORSHIP with BOTH of the log\'s numbers', () => {
        // M is the moved wall, running along +x, thickness 100 mm.
        // P terminates on M at 75 mm from M's far end — inside the band where a
        // corner and a T-stem are the same picture.
        const census = computeMoveReweldCensus(
            {
                id: 'M',
                prevBaseLine: [p(0, 0), p(5, 0)],
                newBaseLine: [p(0, DRAG), p(5, DRAG)],
                thickness: T,
            },
            [{ id: 'P', baseLine: [p(5 - AXIAL, 0), p(5 - AXIAL, 3)] }],
        );

        expect(census.refusals).toHaveLength(1);
        const r = census.refusals[0]!;
        expect(r.reason).toBe('AMBIGUOUS_WELD_AUTHORSHIP');
        expect(r.partnerId).toBe('P');
        // THE FOUNDER'S FIRST NUMBER, verbatim.
        expect(r.beyondMm).toBe(75);
        // THE SECOND NUMBER (C83 §10.3) — `stemBand = t + COINCIDENT_M`.
        expect(r.limitMm).toBe(101);
    });

    it('2. the refusal leaves the junction with NOBODY to repair it — no entry names the partner', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'M',
                prevBaseLine: [p(0, 0), p(5, 0)],
                newBaseLine: [p(0, DRAG), p(5, DRAG)],
                thickness: T,
            },
            [{ id: 'P', baseLine: [p(5 - AXIAL, 0), p(5 - AXIAL, 3)] }],
        );
        // The partner appears in `refusals` and in NOTHING else. It is not an
        // entry (nothing moves it) and not a not-applicable (this is not a
        // junction that needed no work). The move, meanwhile, has already been
        // committed by `UpdateWallBaselineCommand` before this engine ever runs.
        expect(census.entries.map(e => e.wallId)).not.toContain('P');
        expect(census.notApplicable.map(n => n.partnerId)).not.toContain('P');
        // And no corner was formed for the subject to seat on either, so the
        // subject does not adapt to close it from its own side.
        expect(census.subjectSeat.cornersOffered).not.toContain('P');
    });

    it('3. the state this leaves on disk is CORRUPT, and the probe names both junctions', () => {
        // The level AFTER the unrepaired move:
        //   M  dragged 260 mm to z = 0.260
        //   P  left exactly where it was — its endpoint is now 310 mm past M's
        //      near face, i.e. out the FAR side: the log's through-crossing.
        //   Q  an L-partner whose end is 83 mm from M's new start — the log's
        //      §NEAR-CORNER-L gap, inside the mitre zone, drawn CLOSED.
        const level: WallTopologyInput[] = [
            w('M', [0, DRAG], [5, DRAG]),
            w('P', [5 - AXIAL, 0], [5 - AXIAL, 3]),
            w('Q', [0, 3], [0, DRAG + 0.083]),
        ];

        const audit = auditWallTopology(level);
        expect(audit.corrupt).toBe(true);
        expect(audit.wallsAudited).toBe(3);
        expect(audit.wallsWithoutThickness).toBe(0);

        // The two junctions the founder's log named, asserted by IDENTITY.
        //
        // ⭐ THE CROSSING IS THE 310 mm PENETRATION, SEEN FROM THE MODEL RATHER
        // THAN FROM THE GESTURE. `WallJoinResolver` measured it as "P's endpoint
        // is 310 mm past M's entry face"; from the stored baselines the same fact
        // reads "M and P pass through each other, 75 mm from M's end". Both are
        // true of one geometry, and 75 mm is ALSO the number the re-weld engine
        // refused on — `axialFromEndM`. One defect, three subsystems, one number.
        const crossing = audit.findings.find(
            f => f.kind === 'BODY_CROSSING'
                && new Set([f.guestWallId, f.hostWallId]).has('P')
                && new Set([f.guestWallId, f.hostWallId]).has('M'),
        );
        expect(crossing).toBeDefined();
        expect(crossing!.measuredMm).toBe(75);
        expect(crossing!.limitMm).toBe(50);      // the end-cap reach it had to clear

        const open = audit.findings.find(f => f.kind === 'VISUALLY_CLOSED_TOPOLOGICALLY_OPEN');
        expect(open).toBeDefined();
        expect(new Set([open!.guestWallId, open!.hostWallId])).toEqual(new Set(['M', 'Q']));
        expect(open!.measuredMm).toBe(83);
        expect(open!.limitMm).toBe(1);   // COINCIDENT_M — what two endpoints must clear to BE one point

        // THE THIRD FINDING, and it is not padding: M's own END is stranded
        // 125 mm inside P's solid. The crossing above says the two bodies pass
        // through each other; this says WHOSE endpoint is left in the wrong
        // place, which is the fact a repair needs and the crossing does not
        // carry. Three findings, three distinct facts, one broken junction.
        const stranded = audit.findings.find(f => f.kind === 'ENDPOINT_INSIDE_BODY');
        expect(stranded).toBeDefined();
        expect(stranded!.guestWallId).toBe('M');
        expect(stranded!.guestSide).toBe('end');
        expect(stranded!.hostWallId).toBe('P');
        expect(stranded!.measuredMm).toBe(125);
        expect(stranded!.limitMm).toBe(51);   // halfT + COINCIDENT_M — the authored T depth

        expect(audit.findings).toHaveLength(3);

        // C83 §10.3 — the SENTENCE a human reads carries both numbers.
        for (const f of audit.findings) {
            const s = describeWallTopologyFinding(f);
            expect(s).toContain(String(f.measuredMm));
            expect(s).toContain(String(f.limitMm));
        }
        const line = summariseWallTopologyAudit('L0', audit);
        expect(line).toContain('§WALL-TOPOLOGY-CORRUPT');
        expect(line).toContain('BODY_CROSSING×1');
        expect(line).toContain('VISUALLY_CLOSED_TOPOLOGICALLY_OPEN×1');
        expect(line).toContain('83');
    });

    it('4. the probe is SILENT on the same building drawn correctly — including a healthy T-stem', () => {
        // Same three walls, authored soundly:
        //   • P's endpoint snapped to M's CENTRELINE — the authoring convention
        //     §FIX-T-JOIN-PENETRATION states, and 50 mm inside a 100 mm solid.
        //     A probe that flagged depth > 0 would call this corrupt; it is not.
        //   • P attaches at MID-SPAN, not 75 mm from M's end. That 75 mm offset
        //     is not a detail of the founder's fixture, it IS the defect: it is
        //     what puts the abutment inside the band where `classifyWeldAuthorship`
        //     cannot tell a corner from a stem. A stem drawn there is already
        //     un-authorable, so it cannot appear in a CLEAN control.
        //   • Q's end and M's start are the SAME model point.
        const level: WallTopologyInput[] = [
            w('M', [0, DRAG], [5, DRAG]),
            w('P', [2.5, DRAG], [2.5, 3]),
            w('Q', [0, 3], [0, DRAG]),
        ];
        const audit = auditWallTopology(level);
        expect(audit.findings).toEqual([]);
        expect(audit.corrupt).toBe(false);
        expect(audit.wallsAudited).toBe(3);
        expect(summariseWallTopologyAudit('L0', audit)).toBeNull();
    });

    it('5. "0 findings" and "nothing was audited" are DIFFERENT VALUES (§CONTEXT-DATA-HONESTY)', () => {
        const empty = auditWallTopology([]);
        expect(empty.corrupt).toBe(false);
        expect(empty.wallsAudited).toBe(0);

        // A wall with no declared thickness cannot be a HOST — no face, no band —
        // and the count says so rather than the audit quietly halving itself.
        const noT = auditWallTopology([
            { id: 'A', baseLine: [p(0, 0), p(5, 0)] },
            { id: 'B', baseLine: [p(2, 0), p(2, 3)] },
        ]);
        expect(noT.wallsAudited).toBe(2);
        expect(noT.wallsWithoutThickness).toBe(2);
        expect(noT.findings).toEqual([]);
    });

    it('6. the verdict is deterministic — same walls, same findings, in the same order', () => {
        const level: WallTopologyInput[] = [
            w('M', [0, DRAG], [5, DRAG]),
            w('P', [5 - AXIAL, 0], [5 - AXIAL, 3]),
            w('Q', [0, 3], [0, DRAG + 0.083]),
        ];
        const a = auditWallTopology(level);
        const b = auditWallTopology([...level].reverse());
        expect(JSON.stringify(b.findings.map(f => f.kind)))
            .toBe(JSON.stringify(a.findings.map(f => f.kind)));
        expect(b.corrupt).toBe(a.corrupt);
    });
});
