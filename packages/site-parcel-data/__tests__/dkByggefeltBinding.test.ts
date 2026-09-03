// LANE DK-BINDING (2026-09-02) — the byggefelt BINDING-vs-MAXIMUM distinction, proven against the
// RECORDED census fixtures rather than invented shapes.
//
// WHAT IS BEING PROVED — behaviours, not the implementation restated:
//   §BINDING-IS-OBLIGATION   a bygkunifelt=true field (LP 593) types as a MANDATORY placement, not a
//                            maximum: footprintIsUpperBound=false AND footprintIsRequired=true, cited.
//   §MAXIMUM-IS-CURRENT      a bygkunifelt=false field (LP 477, advisory) types as a buildable-area
//                            UPPER BOUND — footprintIsUpperBound=true, footprintIsRequired=false.
//   §OBLIGATION-OWED         the binding field carries the OWED marker + the exact "REQUIRED field"
//                            caveat — the MIN semantics are recorded, never faked into the frozen schema.
//   §UNDERSTATE-GUARD        mistyping a binding field as merely permitted/maximum FAILS the arm.
//   §THROUGH-DKPLANDATA      height/storeys ride through resolveDkPlanEnvelope (the L-449 signed map).
//   §NEVER-OVERSTATE         a byggefelt that EXCEEDS the parcel is clipped to it by the REAL
//                            solveExplicitArea — the field can never over-state past the plot.
//   §NULL-IS-NOT-FALSE       a contradictory / null-flag field types as NEITHER (not-placeable).

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { solveExplicitArea } from '../src/index.js';
import type { DkByggefeltProperties } from '../src/evidence/byggefeltEvidence.js';
import {
    resolveDkByggefeltEnvelopeContribution,
    dkByggefeltCitation,
    DK_BYGGEFELT_OBLIGATION_OWED,
    DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT,
} from '../src/rulepacks/dkByggefeltBinding.js';
import {
    BINDING_FEATURE,
    ADVISORY_FEATURE,
    NOT_DECLARED_FEATURE,
    CONTRADICTORY_FEATURE,
} from './fixtures/byggefeltFixtures.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// RECORDED CENSUS FIXTURES — real `theme_pdk_byggefelt_vedtaget` features, verbatim from the census
// transcript `audit/envelope-geometry-census/2026-09-02/transcripts-nordic-baltic/
// dk-byggefelt-cph.json` (GetFeature at Strandgade, Christianshavn, GeoJSON EPSG:4326, HTTP 200,
// totalFeatures 2826). Only classification-relevant properties + the geometry are kept, VERBATIM.
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** MAXIMUM exemplar — feature 1490813, Lokalplan 477 "Strandgade Nord" (København). bygkunifelt
 *  false / bygvejledende true → an ADVISORY (indicative) field: a buildable-area UPPER BOUND. */
const CPH_MAX_1490813: DkByggefeltProperties = {
    id: 1490813,
    planid: 9438203,
    lokplan_id: 1468290,
    komnr: 101,
    kommunenavn: 'København',
    lp_plannr: '477',
    lp_plannavn: 'Strandgade Nord',
    doklink: 'https://dokument.plandata.dk/20_1468290_1786976657855.pdf',
    datovedt: 20120620,
    bygkunifelt: false,
    bygvejledende: true,
    maxetager: 2,
    maxbygnhjd: 6,
    eareal: 250,
};

/** The verbatim ring for 1490813 (EPSG:4326 [lon,lat]), MultiPolygon → the one outer ring. */
const CPH_MAX_1490813_RING: ReadonlyArray<readonly [number, number]> = [
    [12.5957240557, 55.6760893799],
    [12.5958157227, 55.6760256072],
    [12.5956740188, 55.6759618781],
    [12.5955874751, 55.6760243863],
    [12.5955055553, 55.6760835545],
    [12.5956405411, 55.6761474808],
    [12.5957240557, 55.6760893799],
];

/** BINDING exemplar — feature 1214869, Lokalplan 593 "Lindgreens Allé II" (København). bygkunifelt
 *  TRUE / bygvejledende false → "may build ONLY inside the field": a MANDATORY placement. */
const CPH_BINDING_1214869: DkByggefeltProperties = {
    id: 1214869,
    planid: 9669527,
    lokplan_id: 9654905,
    komnr: 101,
    kommunenavn: 'København',
    lp_plannr: '593',
    lp_plannavn: 'Lindgreens Allé II',
    doklink: 'https://dokument.plandata.dk/20_9654905_1593760927385.pdf',
    datovedt: 20200624,
    bygkunifelt: true,
    bygvejledende: false,
    maxetager: 1,
    maxbygnhjd: 4,
    eareal: null,
};

// ──────────────────────────────────────────────────────────────────────────────────────────────
// GEOMETRY HELPERS (test-local, deterministic)
// ──────────────────────────────────────────────────────────────────────────────────────────────

/** Equirectangular projection [lon,lat] → scene-XZ metres about a local anchor (the balears test
 *  pattern). Strips a duplicated closing vertex so the ring is open, distinct vertices only. */
function projectRing(ring: ReadonlyArray<readonly [number, number]>): Pt[] {
    const lon0 = ring[0]![0];
    const lat0 = ring[0]![1];
    const mLat = 111_320;
    const mLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);
    const out: Pt[] = ring.map(([lon, lat]) => ({ x: (lon - lon0) * mLon, z: (lat - lat0) * mLat }));
    // Drop a closing duplicate if present.
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.z - last.z) < 1e-9) out.pop();
    return out;
}

/** Shoelace area (absolute), scene-XZ. */
function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a) / 2;
}

const square = (cx: number, cz: number, half: number): Pt[] => [
    { x: cx - half, z: cz - half },
    { x: cx + half, z: cz - half },
    { x: cx + half, z: cz + half },
    { x: cx - half, z: cz + half },
];

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('LANE DK-BINDING — §BINDING-IS-OBLIGATION (LP 593, bygkunifelt=true)', () => {
    const c = resolveDkByggefeltEnvelopeContribution(CPH_BINDING_1214869);

    it('types the field as a binding OBLIGATION, not a maximum', () => {
        expect(c.semantics).toBe('binding-obligation');
        expect(c.legalStatus).toBe('binding');
        expect(c.bygkunifelt).toBe(true);
        expect(c.bygvejledende).toBe(false);
    });

    it('the MAX side is false and the MIN side is true (the never-UNDERSTATE distinction)', () => {
        // A mandatory placement is NOT an upper bound.
        expect(c.footprintIsUpperBound).toBe(false);
        // The obligation half — carried here because the schema cannot hold it.
        expect(c.footprintIsRequired).toBe(true);
        expect(c.obligationRepresentation).toBe('owed');
    });

    it('§OBLIGATION-OWED — records the debt by name + the exact REQUIRED-field caveat', () => {
        expect(c.obligationOwed).toBe(DK_BYGGEFELT_OBLIGATION_OWED);
        expect(c.obligationOwed?.id).toBe('OBLIGATION-SEMANTICS-OWED');
        expect(c.obligationOwed?.proposedField).toContain('footprintIsRequired');
        expect(c.caveats).toContain(DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT);
        expect(c.caveats.some((v) => /UNDERSTATE/.test(v))).toBe(true);
    });

    it('is CITED to Lokalplan 593 with the doklink PDF (never fabricated)', () => {
        expect(c.citation.document).toContain('Lokalplan 593');
        expect(c.citation.document).toContain('Lindgreens Allé II');
        expect(c.citation.url).toBe('https://dokument.plandata.dk/20_9654905_1593760927385.pdf');
    });

    it('§THROUGH-DKPLANDATA — height/storeys came through resolveDkPlanEnvelope', () => {
        expect(c.maxHeightM).toBe(4); // maxbygnhjd
        expect(c.maxStoreys).toBe(1); // maxetager
        expect(c.maxGfaM2).toBeNull(); // eareal absent on this feature
    });
});

describe('LANE DK-BINDING — §MAXIMUM-IS-CURRENT (LP 477, bygkunifelt=false / advisory)', () => {
    const c = resolveDkByggefeltEnvelopeContribution(CPH_MAX_1490813);

    it('types the field as a buildable-area MAXIMUM (upper bound)', () => {
        expect(c.semantics).toBe('maximum');
        expect(c.footprintIsUpperBound).toBe(true);
        expect(c.footprintIsRequired).toBe(false);
        expect(c.obligationRepresentation).toBe('schema-native');
        expect(c.obligationOwed).toBeNull();
    });

    it('carries no obligation caveat, but is cited to LP 477 + doklink', () => {
        expect(c.caveats).not.toContain(DK_BYGGEFELT_REQUIRED_FIELD_CAVEAT);
        expect(c.citation.document).toContain('Lokalplan 477');
        expect(c.citation.document).toContain('Strandgade Nord');
        expect(c.citation.url).toBe('https://dokument.plandata.dk/20_1468290_1786976657855.pdf');
    });

    it('§THROUGH-DKPLANDATA — maxetager 2 / maxbygnhjd 6 / eareal 250 pass through', () => {
        expect(c.maxHeightM).toBe(6);
        expect(c.maxStoreys).toBe(2);
        expect(c.maxGfaM2).toBe(250);
    });
});

describe('LANE DK-BINDING — §UNDERSTATE-GUARD (mistyping a binding field as permitted is caught)', () => {
    it('the binding fixture must NOT type as the same permissive shape as the maximum fixture', () => {
        const binding = resolveDkByggefeltEnvelopeContribution(CPH_BINDING_1214869);
        const maximum = resolveDkByggefeltEnvelopeContribution(CPH_MAX_1490813);
        // If a regression collapsed the binding field to the maximum reading, these diverge-asserts
        // fail — this arm is the tripwire the lane's falsification names.
        expect(binding.semantics).not.toBe(maximum.semantics);
        expect(binding.footprintIsRequired).toBe(true);
        expect(maximum.footprintIsRequired).toBe(false);
        // A binding field drawn as merely an upper bound would UNDERSTATE the obligation.
        expect(binding.footprintIsUpperBound).toBe(false);
        // And the owed record must be present exactly on the binding side.
        expect(binding.obligationOwed).not.toBeNull();
        expect(maximum.obligationOwed).toBeNull();
    });
});

describe('LANE DK-BINDING — §NEVER-OVERSTATE (a maximum field flipped to exceed the parcel is clipped)', () => {
    // The REAL never-overstate primitive: the buildable ring is parcel ∩ footprint, so a byggefelt
    // larger than the plot can never publish more than the plot.
    it('a byggefelt EXCEEDING the parcel clips to the parcel (footprint cannot over-state)', () => {
        const parcel = square(0, 0, 10); // 20×20 → 400 m²
        const exceeding = square(0, 0, 20); // 40×40 → 1600 m², strictly contains the parcel
        const r = solveExplicitArea({ parcelRing: parcel, footprintParts: [{ outer: exceeding }] });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.areaM2).toBeCloseTo(400, 3); // == parcel, NOT 1600
            expect(r.footprintCoversParcel).toBe(true);
            expect(r.areaM2).toBeLessThan(ringArea(exceeding)); // the excess was clipped away
        }
    });

    it('a byggefelt INSIDE the parcel keeps its own (smaller) area — no invented expansion', () => {
        const parcel = square(0, 0, 10); // 400 m²
        const inside = square(0, 0, 5); // 100 m²
        const r = solveExplicitArea({ parcelRing: parcel, footprintParts: [{ outer: inside }] });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.areaM2).toBeCloseTo(100, 3);
            expect(r.footprintCoversParcel).toBe(false);
        }
    });

    it('the RECORDED 1490813 ring is a real closed field with positive area, clipping to itself never over-states', () => {
        const ring = projectRing(CPH_MAX_1490813_RING);
        expect(ring.length).toBeGreaterThanOrEqual(3);
        const area = ringArea(ring);
        expect(area).toBeGreaterThan(0);
        // The recorded geometry flows through the REAL solve (not just its properties). Clipping
        // the field to itself never yields MORE than the field — the never-overstate direction.
        const r = solveExplicitArea({ parcelRing: ring, footprintParts: [{ outer: ring }] });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.areaM2).toBeCloseTo(area, 2);
            expect(r.areaM2).toBeLessThanOrEqual(area + 1e-6);
        }
    });
});

describe('LANE DK-BINDING — the four classifier buckets map to three envelope semantics', () => {
    it('BINDING_FEATURE (Silkeborg, bygkunifelt=true) → binding-obligation + owed', () => {
        const c = resolveDkByggefeltEnvelopeContribution(BINDING_FEATURE.properties!);
        expect(c.semantics).toBe('binding-obligation');
        expect(c.footprintIsRequired).toBe(true);
        expect(c.obligationOwed).not.toBeNull();
    });

    it('ADVISORY_FEATURE (bygvejledende=true) → maximum, schema-native', () => {
        const c = resolveDkByggefeltEnvelopeContribution(ADVISORY_FEATURE.properties!);
        expect(c.semantics).toBe('maximum');
        expect(c.footprintIsUpperBound).toBe(true);
        expect(c.footprintIsRequired).toBe(false);
    });

    it('NOT_DECLARED_FEATURE (both false) → maximum (upper bound; plan text is the source)', () => {
        const c = resolveDkByggefeltEnvelopeContribution(NOT_DECLARED_FEATURE.properties!);
        expect(c.semantics).toBe('maximum');
        expect(c.footprintIsUpperBound).toBe(true);
    });

    it('§NULL-IS-NOT-FALSE — CONTRADICTORY_FEATURE (both true) → not-placeable, no geometry', () => {
        const c = resolveDkByggefeltEnvelopeContribution(CONTRADICTORY_FEATURE.properties!);
        expect(c.semantics).toBe('not-placeable');
        expect(c.legalStatus).toBe('unknown');
        expect(c.unknownCause).toBe('metadata-conflict');
        expect(c.footprintIsRequired).toBe(false);
    });

    it('a NULL bindingness flag → not-placeable (metadata-unavailable), never a fake maximum', () => {
        const c = resolveDkByggefeltEnvelopeContribution({
            ...NOT_DECLARED_FEATURE.properties!,
            bygkunifelt: null,
            bygvejledende: null,
        });
        expect(c.semantics).toBe('not-placeable');
        expect(c.unknownCause).toBe('metadata-unavailable');
    });
});

describe('dkByggefeltCitation — built from the plan fields, never fabricated', () => {
    it('composes plannr + kommune + plannavn + doklink', () => {
        const cit = dkByggefeltCitation(CPH_BINDING_1214869);
        expect(cit.document).toBe('Lokalplan 593 (København) — Lindgreens Allé II');
        expect(cit.url).toBe('https://dokument.plandata.dk/20_9654905_1593760927385.pdf');
    });

    it('omits the url when no doklink is published (no invented link)', () => {
        const cit = dkByggefeltCitation({ lp_plannr: '12', kommunenavn: 'X' });
        expect(cit.document).toBe('Lokalplan 12 (X)');
        expect(cit.url).toBeUndefined();
    });
});
