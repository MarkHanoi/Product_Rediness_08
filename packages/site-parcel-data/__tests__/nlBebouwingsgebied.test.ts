// §NL-BEBOUWINGSGEBIED — a derived geometry: the IPLO construction as half-planes, the art. 22.36 formula,
// and the honest bounds when the oorspronkelijk hoofdgebouw is unknown.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import {
    deriveNlBebouwingsgebied,
    nlBebouwingsgebiedToRuleState,
    nlBruidsschatBijbehorendHeightRegime,
    nlBruidsschatMaxBijbehorendOppervlakM2,
    NL_BEBOUWINGSGEBIED_DEFINITIONS,
} from '../src/rulepacks/nlBebouwingsgebied.js';

const REF = {
    country: 'NL',
    authority: 'omgevingsplan (bruidsschat) art. 22.36',
    dataset: 'BRK + BAG + BGT (derived)',
    plan_id: null,
    object_id: null,
    document: null,
    article: 'art. 22.36 lid 1 onder a',
    page: null,
} as const;

// A 20 m × 40 m perceel, street along z = 0 (edge 0). hoofdgebouw 10 × 10 m at x 4..14, z 5..15.
const PERCEEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 40 },
    { x: 0, z: 40 },
];
const HOOFD: Pt[] = [
    { x: 4, z: 5 },
    { x: 14, z: 5 },
    { x: 14, z: 15 },
    { x: 4, z: 15 },
];
const SINGLE_FRONT = ['front', 'side', 'rear', 'side'] as const;
// Corner lot: edge 3 (x = 0, west) is ALSO public-adjacent.
const CORNER = ['front', 'side', 'rear', 'front'] as const;

describe('the art. 22.36 oppervlakte formula', () => {
    it('is the bruidsschat’s three-band formula with continuity at 100 and 300 and the 150 cap', () => {
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(0)).toBe(0);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(60)).toBe(30);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(100)).toBe(50);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(200)).toBe(70);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(300)).toBe(90);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(590)).toBe(119);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(900)).toBe(150);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(5000)).toBe(150);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(-5)).toBe(0);
        expect(nlBruidsschatMaxBijbehorendOppervlakM2(Number.NaN)).toBe(0);
    });
});

describe('deriveNlBebouwingsgebied — single street', () => {
    it('lays the line 1 m behind the voorkant, subtracts the hoofdgebouw, applies the formula', () => {
        const r = deriveNlBebouwingsgebied({
            perceel: PERCEEL,
            perceelEdges: [...SINGLE_FRONT],
            hoofdgebouw: HOOFD,
            oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'BAG bouwjaar 1932, no later pand mutation' },
        });
        expect(r.kind).toBe('derived');
        if (r.kind !== 'derived') return;
        expect(r.voorkant.edgeIndex).toBe(0);
        expect(r.voorkant.offsetBehindFaceM).toBe(1);
        expect(r.voorkant.point.z).toBeCloseTo(6, 6); // face at z = 5, line at z = 6
        expect(r.zijgevelLines).toEqual([]);
        // region z ≥ 6: 20 × 34 = 680; hoofdgebouw inside region: 10 × 9 = 90 → achtererf 590
        expect(r.achtererfgebied.areaM2).toBeCloseTo(590, 3);
        expect(r.hoofdgebouwM2).toBeCloseTo(100, 3);
        expect(r.bebouwingsgebiedM2).toBe(590);
        expect(r.maxBijbehorendM2).toBe(119);
        expect(r.remainingBijbehorendM2).toBeNull();
        expect(r.caveats.some((c) => c.includes('GROSS'))).toBe(true);
    });

    it('an oorspronkelijk ring within the hoofdgebouw adds the extension’s ground to the bebouwingsgebied', () => {
        const r = deriveNlBebouwingsgebied({
            perceel: PERCEEL,
            perceelEdges: [...SINGLE_FRONT],
            hoofdgebouw: HOOFD,
            // original 10 × 7 (z 5..12) = 70 m²; extension 30 m² at the back
            oorspronkelijkHoofdgebouw: { kind: 'ring', ring: [{ x: 4, z: 5 }, { x: 14, z: 5 }, { x: 14, z: 12 }, { x: 4, z: 12 }], evidence: 'bouwtekening 1932 (gemeentearchief)' },
            existingBijbehorendeBouwwerkenM2: 22,
        });
        expect(r.kind).toBe('derived');
        if (r.kind !== 'derived') return;
        expect(r.bebouwingsgebiedM2).toBe(620); // 590 + 100 − 70
        expect(r.maxBijbehorendM2).toBe(122); // 90 + 0.1 × 320
        expect(r.remainingBijbehorendM2).toBe(100);
    });

    it('an UNKNOWN oorspronkelijk hoofdgebouw yields BOUNDS, never a number — and the RuleState carries them as partial', () => {
        const r = deriveNlBebouwingsgebied({
            perceel: PERCEEL,
            perceelEdges: [...SINGLE_FRONT],
            hoofdgebouw: HOOFD,
            oorspronkelijkHoofdgebouw: { kind: 'unknown' },
        });
        expect(r.kind).toBe('derived');
        if (r.kind !== 'derived') return;
        expect(r.bebouwingsgebiedM2).toEqual({ lowerM2: 590, upperExclusiveM2: 690 });
        expect(r.maxBijbehorendM2).toEqual({ lowerM2: 119, upperExclusiveM2: 129 });
        const s = nlBebouwingsgebiedToRuleState(r, REF);
        expect(s.rule).toBe('D3');
        expect(s.status).toBe('unrecovered');
        if (s.status === 'unrecovered') {
            expect(s.failure).toBe('semantic');
            expect(s.mechanism).toBe('present');
            expect(s.partial?.value).toBe('119–129');
            expect(s.partial?.verbatim).toContain('150 m2');
        }
    });

    it('a known result projects to a resolved, derivable D3 in m2', () => {
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: [...SINGLE_FRONT], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'x' } });
        const s = nlBebouwingsgebiedToRuleState(r, REF);
        expect(s.status === 'resolved' && s.value).toBe(119);
        expect(s.status === 'resolved' && s.reachability).toBe('derivable');
        expect(s.status === 'resolved' && s.unit).toBe('m2');
    });

    it('the winding of the perceel does not change the answer', () => {
        const cw = [...PERCEEL].reverse();
        const cwEdges = ['side', 'rear', 'side', 'front'] as const; // edges of the reversed ring: (0,40)→(20,40) rear … (20,0)→(0,0) is edge 3
        const r = deriveNlBebouwingsgebied({ perceel: cw, perceelEdges: [...cwEdges], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'x' } });
        expect(r.kind).toBe('derived');
        if (r.kind === 'derived') expect(r.achtererfgebied.areaM2).toBeCloseTo(590, 3);
    });
});

describe('deriveNlBebouwingsgebied — corner lot (IPLO hoekperceel rule)', () => {
    it('the voorkant is the face NEAREST public area; the other public side gets a zijgevel line at offset 0', () => {
        // west face at x = 4 is nearer to the west street (4 m) than the south face is to the south street (5 m)
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: [...CORNER], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'x' } });
        expect(r.kind).toBe('derived');
        if (r.kind !== 'derived') return;
        expect(r.voorkant.edgeIndex).toBe(3);
        expect(r.voorkant.point.x).toBeCloseTo(5, 6); // 1 m behind the west face
        expect(r.zijgevelLines.length).toBe(1);
        expect(r.zijgevelLines[0]!.edgeIndex).toBe(0);
        expect(r.zijgevelLines[0]!.offsetBehindFaceM).toBe(0);
        expect(r.zijgevelLines[0]!.point.z).toBeCloseTo(5, 6);
        // region x ≥ 5, z ≥ 5: 15 × 35 = 525; hoofdgebouw inside region: 9 × 10 = 90 → 435
        expect(r.achtererfgebied.areaM2).toBeCloseTo(435, 3);
    });

    it('an exact tie between two public faces is resolved deterministically AND flagged for a human', () => {
        const hoofd = [{ x: 5, z: 5 }, { x: 14, z: 5 }, { x: 14, z: 15 }, { x: 5, z: 15 }]; // 5 m from both streets
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: [...CORNER], hoofdgebouw: hoofd, oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'x' } });
        expect(r.kind).toBe('derived');
        if (r.kind === 'derived') {
            expect(r.voorkant.edgeIndex).toBe(0);
            expect(r.caveats.some((c) => c.includes('equally near'))).toBe(true);
        }
    });
});

describe('deriveNlBebouwingsgebied — refusals are named, never repaired', () => {
    it('no public-adjacent edge → refused, and the RuleState is inaccessible (supply A3 and retry)', () => {
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: ['side', 'side', 'rear', 'side'], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'unknown' } });
        expect(r.kind === 'refused' && r.reason).toBe('no-public-adjacent-edge');
        const s = nlBebouwingsgebiedToRuleState(r, REF);
        expect(s.status === 'unrecovered' && s.failure).toBe('inaccessible');
    });

    it('a hoofdgebouw straddling the perceel → refused (pre-clip the pand)', () => {
        const straddling = [{ x: -3, z: 5 }, { x: 14, z: 5 }, { x: 14, z: 15 }, { x: -3, z: 15 }];
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: [...SINGLE_FRONT], hoofdgebouw: straddling, oorspronkelijkHoofdgebouw: { kind: 'unknown' } });
        expect(r.kind === 'refused' && r.reason).toBe('hoofdgebouw-outside-perceel');
    });

    it('a hoofdgebouw sharing the parcel boundary (row house party wall) is NOT outside', () => {
        const partyWall = [{ x: 0, z: 5 }, { x: 10, z: 5 }, { x: 10, z: 15 }, { x: 0, z: 15 }];
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: [...SINGLE_FRONT], hoofdgebouw: partyWall, oorspronkelijkHoofdgebouw: { kind: 'same-as-current', evidence: 'x' } });
        expect(r.kind).toBe('derived');
    });

    it('an oorspronkelijk ring not within the hoofdgebouw → refused, semantic', () => {
        const r = deriveNlBebouwingsgebied({
            perceel: PERCEEL,
            perceelEdges: [...SINGLE_FRONT],
            hoofdgebouw: HOOFD,
            oorspronkelijkHoofdgebouw: { kind: 'ring', ring: [{ x: 4, z: 5 }, { x: 14, z: 5 }, { x: 14, z: 18 }, { x: 4, z: 18 }], evidence: 'x' },
        });
        expect(r.kind === 'refused' && r.reason).toBe('oorspronkelijk-not-within-hoofdgebouw');
        expect(nlBebouwingsgebiedToRuleState(r, REF).status === 'unrecovered' && (nlBebouwingsgebiedToRuleState(r, REF) as { failure: string }).failure).toBe('semantic');
    });

    it('edge classifications must be per edge', () => {
        const r = deriveNlBebouwingsgebied({ perceel: PERCEEL, perceelEdges: ['front'], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'unknown' } });
        expect(r.kind === 'refused' && r.reason).toBe('edge-classification-mismatch');
    });

    it('a degenerate perceel is refused with the defect named', () => {
        const r = deriveNlBebouwingsgebied({ perceel: [{ x: 0, z: 0 }, { x: 1, z: 1 }], perceelEdges: ['front', 'side'], hoofdgebouw: HOOFD, oorspronkelijkHoofdgebouw: { kind: 'unknown' } });
        expect(r.kind === 'refused' && r.reason).toBe('perceel-invalid');
    });
});

describe('the procedural height regime (art. 22.36 — the 4 m switch)', () => {
    it('distance unknown → neither regime can be named', () => {
        expect(nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: null }).kind).toBe('distance-unknown');
    });

    it('within 4 m: the 5 m bound is always known; the cap resolves only when the other two are held', () => {
        const partial = nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: 2 });
        expect(partial.kind).toBe('within-4m');
        if (partial.kind === 'within-4m') {
            expect(partial.upperBoundM).toBe(5);
            expect(partial.resolvedCapM).toBeNull();
            expect(partial.unresolved.length).toBe(2);
        }
        const full = nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: 4, tweedeBouwlaagScheidingTopM: 3.1, hoofdgebouwHeightM: 9 });
        expect(full.kind === 'within-4m' && full.resolvedCapM).toBeCloseTo(3.4, 9);
    });

    it('beyond 4 m: dakvoet 3 m, ≥ 2 schuine dakvlakken ≤ 55°, daknok = min(5, 0.47 × afstand + 3)', () => {
        const r = nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: 6, distanceDaknokToPerceelsgrensM: 2 });
        expect(r.kind).toBe('beyond-4m');
        if (r.kind === 'beyond-4m') {
            expect(r.dakvoetMaxM).toBe(3);
            expect(r.hellingMaxDeg).toBe(55);
            expect(r.daknokMaxM).toBeCloseTo(3.94, 9);
            expect(r.daknokCap5mStatus).toBe('applied-conservatively-not-re-verified');
        }
        const far = nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: 6, distanceDaknokToPerceelsgrensM: 10 });
        expect(far.kind === 'beyond-4m' && far.daknokMaxM).toBe(5); // the conservative cap, not 7.7
        const noDist = nlBruidsschatBijbehorendHeightRegime({ distanceToOorspronkelijkHoofdgebouwM: 6 });
        expect(noDist.kind === 'beyond-4m' && noDist.daknokMaxM).toBeNull();
    });
});

describe('the definitions are the national catalogue’s, with URIs', () => {
    it('bebouwingsgebied and achtererfgebied carry regelgeving.omgevingswet.overheid.nl concept URIs', () => {
        expect(NL_BEBOUWINGSGEBIED_DEFINITIONS.bebouwingsgebied.uri).toContain('regelgeving.omgevingswet.overheid.nl');
        expect(NL_BEBOUWINGSGEBIED_DEFINITIONS.bebouwingsgebied.definitie).toBe('Achtererfgebied en de grond onder het hoofdgebouw, uitgezonderd de grond onder het oorspronkelijk hoofdgebouw.');
        expect(NL_BEBOUWINGSGEBIED_DEFINITIONS.achtererfgebied.definitie).toContain('1 m achter de voorkant');
    });
});
