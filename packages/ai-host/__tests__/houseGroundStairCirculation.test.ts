// §STUB-BLOB-PRIVATE-ONLY (founder GF stair-circulation fix, 2026-06-18).
//
// THE DEFECT (live §DIAG, house GROUND floor, generous ~188 m² plate, 1 bed + living/
// kitchen/dining/hall/bath + a corner stair):
//   §DIAG-STAIR-CIRC corridor=r4 corridorReachM=0.00 sharesStairWall=NO
//   §STAIR-SPINE-TOUCH stairsBridgedToCorridor=0/1   (the straight grow can't cross the comb)
//   …and NO §STAIR-CIRC-STUB line at all → every strategy §DIAG-TOPO-GATE failed=[circulation]
//
// ROOT CAUSE: the §STUB-ONLY-RESCUE-CLEAN guard suppressed the empty-space corridor STUB on any
// candidate carrying an OVERSIZE (`areaHardMax`/…) room. On a GENEROUS house ground plate the
// PUBLIC + hall rooms are LEGITIMATELY large (living/kitchen/dining/hall over their apartment
// area cap), so the guard wrongly fired on the BEST clean hall-hinge candidate and the stair
// shipped SEALED. The guard was written to skip a genuinely MIS-SIZED candidate (an oversized
// PRIVATE room — a bedroom ballooned to 85 m²), so it must key on PRIVATE-room oversize only.
//
// THE FIX (enumerate.ts §STUB-BLOB-PRIVATE-ONLY): the `preStubBlob` test counts an oversize
// hard-finding ONLY when the room is PRIVATE. A candidate whose only oversize is a big public/
// circulation room on a generous plate now gets its stair-reaching stub, so the stair reaches
// the corridor (`§DIAG-STAIR-CIRC sharesStairWall=YES`, no `corridor-stair`/`circulation` gap).
//
// House-only (apartments pass no keep-out, so the stub block is unreachable → byte-identical,
// ADR-0061). These tests drive the FULL deterministic pipeline (`enumerateLayouts` + the
// §TOPO-HARD-REJECT gate) with the house envelope validator.

import { describe, expect, it } from 'vitest';
import { enumerateLayouts } from '../src/workflows/apartmentLayout/tgl/enumerate.js';
import { validateHouseStorey } from '../src/workflows/houseLayout/houseEnvelope.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram, ScoringWeights } from '../src/workflows/apartmentLayout/types.js';

/** The HOUSE GROUND storey programme: entrance hall + open-plan living/kitchen/dining + a guest
 *  bedroom + a bathroom + (minted) corridor — exactly what a 2-storey house's ground carries. */
const GROUND: ApartmentProgram = {
    bedrooms: 1, bathrooms: 1, masterEnSuite: false,
    includeKitchen: true, livingRoom: true, openPlanKitchenDining: true, entranceHall: true,
};
const WEIGHTS: ScoringWeights = {} as ScoringWeights;

/** The house envelope validator → `envelopeFitGrowth=false`, so the ground stays a 1-guest-
 *  bedroom programme (NOT re-grown to the apartment 2-bed envelope). Apartment never passes a
 *  keep-out, so this combination is exactly + only the multi-storey-house GROUND path. */
const houseValidator = (args: { program: ApartmentProgram; grossAreaM2: number }) =>
    validateHouseStorey({ program: args.program, grossAreaM2: args.grossAreaM2 });

function enumerateGround(wM: number, hM: number, ko: Rect) {
    const poly: Pt[] = [{ x: 0, z: 0 }, { x: wM, z: 0 }, { x: wM, z: hM }, { x: 0, z: hM }];
    const cands = enumerateLayouts({
        shellPolygon: poly, program: GROUND, levelId: 'L0', seed: 's', weights: WEIGHTS, count: 8,
        keepOutRects: [ko], envelopeValidator: houseValidator,
    });
    // The ranker prefers a hard-valid candidate; mirror its first-tier pick.
    const best = cands.find(c => c.hardValid) ?? cands[0];
    return { cands, best };
}

/** Does the stair Space have a CONNECTS_THROUGH (door) edge to a corridor/hall in the realised
 *  graph? (the geometric §DIAG-STAIR-CIRC `sharesStairWall=YES doorOntoCirculation=YES`). */
function stairDoorsOntoCirculation(graph: { nodes: ReadonlyArray<{ guid: string; kind: string; attrs: Record<string, unknown>; sourceId: string }>; edges: ReadonlyArray<{ kind: string; from: string; to: string }> }): boolean {
    const spaceType = new Map<string, string>();
    for (const n of graph.nodes) {
        if (n.kind === 'Space') spaceType.set(n.guid, String(n.attrs.spaceType ?? ''));
    }
    const stairGuids = new Set([...spaceType].filter(([, t]) => t === 'stair').map(([g]) => g));
    const isCirc = (g: string) => { const t = spaceType.get(g); return t === 'corridor' || t === 'hall'; };
    for (const e of graph.edges) {
        if (e.kind !== 'CONNECTS_THROUGH') continue;
        if (stairGuids.has(e.from) && isCirc(e.to)) return true;
        if (stairGuids.has(e.to) && isCirc(e.from)) return true;
    }
    return false;
}

describe('§STUB-BLOB-PRIVATE-ONLY — a generous house GROUND plate reaches its stair (no SEALED stair)', () => {
    // A generous ~187 m² ground plate (13 × 14.4) with a 1-bed programme: the public + hall rooms
    // are LEGITIMATELY oversized vs the apartment caps, which is exactly what used to suppress the
    // stair-reaching stub on the best (hall-hinge) candidate. Tested with the stair at each corner.
    const W = 13, H = 14.4, SW = 3.0, SH = 2.8;
    const CORNERS: ReadonlyArray<readonly [number, number, string]> = [
        [0, 0, 'bottom-left'],
        [W - SW, 0, 'bottom-right'],
        [0, H - SH, 'top-left'],
        [W - SW, H - SH, 'top-right'],
    ];

    for (const [x0, z0, label] of CORNERS) {
        const ko: Rect = { x0, z0, x1: x0 + SW, z1: z0 + SH };

        it(`${label} corner stair — the winning candidate is hard-valid: the corridor reaches the stair and no room is dropped`, () => {
            const { cands, best } = enumerateGround(W, H, ko);
            expect(cands.length, 'the engine produced candidates').toBeGreaterThan(0);
            expect(best, 'a winning candidate exists').toBeDefined();

            // (a) the founder's success signal: NO `circulation` / `corridor-stair` hard-fail —
            // the stair is on circulation, not served through a habitable room.
            expect(best!.hardFailedRules, `${label}: hard-failed rules`).not.toContain('circulation');
            expect(best!.hardFailedRules, `${label}: hard-failed rules`).not.toContain('corridor-stair');
            expect(best!.hardValid, `${label}: the winner is hard-valid`).toBe(true);
            expect(best!.circulationRouted, `${label}: every habitable room is on circulation`).toBe(true);

            // (b) no requested room dropped (the stair-reaching fix must not trade a seal for a drop).
            expect(best!.droppedRooms ?? [], `${label}: dropped rooms`).toHaveLength(0);

            // (c) the geometric guarantee: the stair Space doors directly onto a corridor/hall.
            expect(
                stairDoorsOntoCirculation(best!.graph as never),
                `${label}: the stair must door onto a corridor/hall (sharesStairWall=YES)`,
            ).toBe(true);
        });
    }

    it('is deterministic (same plate → identical winner verdict; no RNG, ADR-0061)', () => {
        const ko: Rect = { x0: W - SW, z0: H - SH, x1: W, z1: H };
        const a = enumerateGround(W, H, ko).best;
        const b = enumerateGround(W, H, ko).best;
        expect(a?.strategy).toEqual(b?.strategy);
        expect(JSON.stringify(a?.hardFailedRules)).toEqual(JSON.stringify(b?.hardFailedRules));
    });
});
