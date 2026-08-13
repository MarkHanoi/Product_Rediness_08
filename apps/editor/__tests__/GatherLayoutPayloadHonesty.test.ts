// GR-10 — determinePayloadWalls differentiating tests (the pure half of
// gatherLayoutPayload; the store glue routes every wall through THIS function
// and reports its refusal via console + `onUndetermined`).
//
// The old shape mapped `openings: (w.openings ?? []).map(…)`: a wall whose
// opening set was NEVER RECORDED entered the generate payload claiming zero
// openings, and the generator computed windowIds / entranceDoorId / spans from
// a fact nobody measured. The mapping now REFUSES, typed, on an unrecorded
// opening set — and still proceeds on a PRESENT empty one (a real
// zero-openings answer, C71 §4.4). The refusal assertions fail against the
// `?? []` shape, which produced walls in both cases.

import { describe, it, expect } from 'vitest';
import { determinePayloadWalls } from '../src/ui/apartment-layout/layoutRequestPayload';

const LVL = 'lvl-gather-honesty';
const notExterior = (): boolean => false;

const RECORDED_WALL = {
    id: 'w-recorded',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }],
    openings: [], // PRESENT and empty — a determined zero-openings answer
};

describe('determinePayloadWalls — unrecorded openings refuse; empty openings answer', () => {
    it('walls with PRESENT opening sets (incl. empty) map to payload walls, no refusal', () => {
        const d = determinePayloadWalls([RECORDED_WALL], notExterior, LVL);
        expect(d.kind).toBe('determined');
        if (d.kind === 'determined') {
            expect(d.walls).toHaveLength(1);
            expect(d.walls[0]!.openings).toEqual([]);
        }
    });

    it('ONE wall with an UNRECORDED opening set refuses the WHOLE mapping, typed and named', () => {
        const d = determinePayloadWalls(
            [
                RECORDED_WALL,
                { id: 'w-unrecorded', baseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }] },
            ],
            notExterior,
            LVL,
        );
        // The old `?? []` shape produced two payload walls here, silently
        // claiming w-unrecorded has no openings.
        expect(d.kind).toBe('undetermined');
        if (d.kind === 'undetermined') {
            expect(d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
            expect(d.scope).toContain('1 of 2');
            expect(d.detail).toContain('w-unrecorded');
        }
    });

    it('negative control: zero walls is a DETERMINED empty mapping, not a refusal', () => {
        expect(determinePayloadWalls([], notExterior, LVL)).toEqual({ kind: 'determined', walls: [] });
    });

    it('openings with real entries survive the mapping intact', () => {
        const d = determinePayloadWalls(
            [{
                id: 'w-door',
                baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
                openings: [{ type: 'door' as const, elementId: 'd1', offset: 1, width: 0.9 }],
            }],
            () => true,
            LVL,
        );
        expect(d.kind).toBe('determined');
        if (d.kind === 'determined') {
            expect(d.walls[0]!.isExterior).toBe(true);
            expect(d.walls[0]!.openings).toEqual([{ type: 'door', elementId: 'd1', offset: 1, width: 0.9 }]);
        }
    });
});
