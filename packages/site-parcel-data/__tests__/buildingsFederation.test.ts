// LANE FED (E5 partial · DECISION-SUMMARY row 2) — buildings-federation scaffold suite.
// Covers the four deliverables: priority-model-as-data invariants (incl. the REAL Source
// Registry cross-reference — control 6), the typed GERS key and the published-bridge seam,
// bridge/GERS/IoU match+dedup with the weld-split (shape and height provenance assigned
// INDEPENDENTLY on one record), and the ODbL separability boundary (runtime refusal +
// compile-time proof).
//
// ⚠ THE GERS FIXTURES ARE THE MEASURED SHAPE, NOT A REMEMBERED ONE. An earlier draft of this
// suite asserted 32 undashed hex chars while the parser next to it required a dashed UUID —
// the two could not both pass, and neither had been measured. Settled 2026-09-01 against the
// live bucket (1185/1185 dashed; transcript in
// audit/europe-site-intel/2026-08-31/impl/lane-fed-transcripts/).

import { describe, expect, it } from 'vitest';
import type { Pt2 } from '@pryzm/geometry-kernel';
import { SiteIntelBuildingSchema } from '@pryzm/schemas';
import { EE_SOURCES } from '../src/countryAdapters/ee/eeSources.js';
import {
    BUILDINGS_FEDERATION_SOURCES,
    FEDERATION_CONFLATION_STRATEGY,
    FEDERATION_IOU_THRESHOLD,
    addToFederationStore,
    assertUsableFederationSource,
    conflationStrategyFor,
    createFederationStore,
    federateBuildings,
    federationProvenance,
    federationSourceRow,
    geometryIou,
    matchByIdentity,
    matchCandidates,
    parseGersId,
    type FederatedBuilding,
    type FederationCandidate,
    type FederationInput,
    type GersBridge,
    type NonOdblFederatedBuilding,
} from '../src/buildingsFederation/index.js';

/** Real ids from the live Tallinn/Kopli extract (release 2026-07-22.0). */
const GERS_A = parseGersId('eeedff0b-85b9-45a1-879e-fd7ca4ce4214');
const GERS_B = parseGersId('0eab4455-cc9b-41c6-ab94-12872944bb7d');
if (GERS_A === null || GERS_B === null) throw new Error('test fixture GERS ids must parse');

/** Axis-aligned square at (x, y) with side s. */
function square(x: number, y: number, s: number): Pt2[] {
    return [
        [x, y],
        [x + s, y],
        [x + s, y + s],
        [x, y + s],
    ];
}

function cand(over: Partial<FederationCandidate> & { sourceFeatureId: string }): FederationCandidate {
    return {
        gersId: null,
        ring: square(0, 0, 10),
        heightM: null,
        heightMethod: null,
        floorsAbove: null,
        ...over,
    };
}

const AUTH = 'fed-ee-etak-ehr-hooned' as const;
const BACK = 'fed-overture-buildings' as const;

function input(
    source: FederationInput['source'],
    candidates: readonly FederationCandidate[],
): FederationInput {
    // The authority declares its measured national scheme; the pan-EU backbone declares none.
    return {
        source,
        crs: 'EPSG:3301',
        idScheme: source === AUTH ? 'etak_id' : null,
        candidates,
    };
}

describe('source-priority model as data', () => {
    it('module-load validation passed and the table is the documented model', () => {
        expect(BUILDINGS_FEDERATION_SOURCES.map((r) => [r.id, r.tier, r.role, r.status])).toEqual([
            ['fed-ee-etak-ehr-hooned', 1, 'footprint-authority', 'usable'],
            ['fed-overture-buildings', 2, 'backbone', 'usable'],
            ['fed-eubucco-v01', 3, 'attribute-join', 'blocked-licence'],
            ['fed-jrc-ghs-obat', 3, 'attribute-join', 'blocked-join-key'],
            ['fed-ms-globalml', 3, 'attribute-join', 'excluded'],
        ]);
    });

    it('the EE row references THE Source Registry (control 6) — the ref resolves to a real row', () => {
        const ref = federationSourceRow('fed-ee-etak-ehr-hooned').registryRef;
        expect(ref).toBe('ee-etak-ehr-hooned-wfs');
        expect(EE_SOURCES.some((s) => s.id === ref)).toBe(true);
    });

    it('every row carries registryRef XOR an honest gap reason', () => {
        for (const r of BUILDINGS_FEDERATION_SOURCES) {
            expect((r.registryRef === null) !== (r.registryGapReason === null)).toBe(true);
        }
    });

    it('MS GlobalML is recorded but EXCLUDED (control 10: record, do not use)', () => {
        expect(() => assertUsableFederationSource('fed-ms-globalml')).toThrowError(/EXCLUDED/);
    });

    it('EUBUCCO is recorded but refused until its per-country licence is read (control 9)', () => {
        expect(() => assertUsableFederationSource('fed-eubucco-v01')).toThrowError(/BLOCKED-LICENCE/);
    });

    it('GHS-OBAT is recorded with a READ licence but refused on its UNVERIFIED join key (control 9)', () => {
        const row = federationSourceRow('fed-jrc-ghs-obat');
        expect(row.licence).toBe('odbl-share-alike'); // licence read, not the blocker
        expect(() => assertUsableFederationSource('fed-jrc-ghs-obat')).toThrowError(
            /BLOCKED-JOIN-KEY/,
        );
    });
});

describe('per-country conflation strategy (e5-oss-delta §D1) — data, not architecture', () => {
    it('ES conflates by a PUBLISHED BRIDGE that is not consumable yet; EE by geometry', () => {
        const es = conflationStrategyFor('ES');
        expect(es?.strategy).toBe('bridge-file');
        expect(es?.bridgedAuthority).toBe('Instituto Geográfico Nacional (España)');
        expect(es?.bridgeStatus).toBe('blocked-licence'); // the page states no licence
        const ee = conflationStrategyFor('EE');
        expect(ee?.strategy).toBe('geometric');
        expect(ee?.bridgeStatus).toBe('none');
    });

    it('an UNASSESSED country is null, never a "geometric" default (control 9)', () => {
        expect(conflationStrategyFor('PL')).toBeNull();
        expect(FEDERATION_CONFLATION_STRATEGY.some((r) => r.country === 'PL')).toBe(false);
    });
});

describe('GersId', () => {
    it('accepts the MEASURED dashed-UUID shape (1185/1185 of the live sample)', () => {
        expect(parseGersId('eeedff0b-85b9-45a1-879e-fd7ca4ce4214')).not.toBeNull();
    });
    it('refuses uppercase, the undashed 32-hex shape, wrong length, and absence', () => {
        expect(parseGersId('EEEDFF0B-85B9-45A1-879E-FD7CA4CE4214')).toBeNull();
        expect(parseGersId('08b2a1008916dfff0200f2c5de1f2a6b')).toBeNull();
        expect(parseGersId('eeedff0b')).toBeNull();
        expect(parseGersId(null)).toBeNull();
        expect(parseGersId(undefined)).toBeNull();
    });
});

describe('matchCandidates — bridge, then GERS, then IoU (row 2 + e5-oss-delta §D1)', () => {
    it('GERS equality is decisive, wherever the two footprints sit', () => {
        const a = cand({ sourceFeatureId: 'a', gersId: GERS_A, ring: square(0, 0, 10) });
        const b = cand({ sourceFeatureId: 'b', gersId: GERS_A, ring: square(100, 100, 10) });
        expect(matchCandidates(a, b)).toEqual({ verdict: 'same-building', via: 'gers', gersId: GERS_A });
    });

    it('a PUBLISHED BRIDGE outranks geometry — a lookup, not a computation', () => {
        const bridge: GersBridge = {
            label: 'test-bridge',
            nationalFeatureIdFor: (g) => (g === GERS_A ? 'etak-1' : null),
        };
        // Footprints 500 m apart: geometry alone would call these distinct.
        const authority = cand({ sourceFeatureId: 'etak-1', ring: square(0, 0, 10) });
        const backbone = cand({ sourceFeatureId: 'ovt-1', gersId: GERS_A, ring: square(500, 500, 10) });
        expect(matchCandidates(authority, backbone, bridge)).toEqual({
            verdict: 'same-building',
            via: 'bridge',
            nationalFeatureId: 'etak-1',
        });
        // A bridge MISS is an honest absence, not a refutation: geometry still decides.
        const miss: GersBridge = { label: 'empty', nationalFeatureIdFor: () => null };
        expect(matchByIdentity(authority, backbone, miss)).toEqual({ kind: 'no-opinion' });
    });

    it('a GERS CONFLICT is distinct even at high overlap — reported, never merged', () => {
        const a = cand({ sourceFeatureId: 'a', gersId: GERS_A });
        const b = cand({ sourceFeatureId: 'b', gersId: GERS_B, ring: square(0.5, 0, 10) });
        const v = matchCandidates(a, b);
        expect(v.verdict).toBe('distinct');
        if (v.verdict === 'distinct') {
            expect(v.via).toBe('gers-conflict');
            expect(v.via === 'gers-conflict' && v.iou !== null && v.iou > 0.8).toBe(true);
        }
    });

    it('IoU ≥ threshold ⇒ same building; below ⇒ distinct — with the measured value carried', () => {
        // 10×10 squares offset by 2.5 → inter 7.5×10=75, union 125, IoU 0.6.
        const high = matchCandidates(
            cand({ sourceFeatureId: 'a' }),
            cand({ sourceFeatureId: 'b', ring: square(2.5, 0, 10) }),
        );
        expect(high).toEqual({ verdict: 'same-building', via: 'iou', iou: 0.6 });
        // Offset 7.5 → inter 25, union 175, IoU 1/7 < 0.5.
        const low = matchCandidates(
            cand({ sourceFeatureId: 'a' }),
            cand({ sourceFeatureId: 'b', ring: square(7.5, 0, 10) }),
        );
        expect(low.verdict).toBe('distinct');
        if (low.verdict === 'distinct' && low.via === 'iou') {
            expect(low.iou).toBeCloseTo(1 / 7, 12);
            expect(low.iou).toBeLessThan(FEDERATION_IOU_THRESHOLD);
        }
    });

    it('a degenerate ring is UNDECIDABLE — unknown stays distinct from distinct (control 9)', () => {
        const v = matchCandidates(
            cand({ sourceFeatureId: 'a', ring: [[0, 0], [10, 0]] as Pt2[] }),
            cand({ sourceFeatureId: 'b' }),
        );
        expect(v.verdict).toBe('undecidable');
    });

    it('geometryIou refuses a self-intersecting ring by the clipper’s own name for it', () => {
        // Asymmetric bowtie: non-zero shoelace area (so the cheap area guard passes)
        // yet self-intersecting (edge (10,0)→(2,5) crosses edge (8,5)→(0,0)).
        const bowtie: Pt2[] = [
            [0, 0],
            [10, 0],
            [2, 5],
            [8, 5],
        ];
        const r = geometryIou(bowtie, square(0, 0, 10));
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('self-intersecting-input');
    });
});

describe('federateBuildings — priority + dedup + the weld-split', () => {
    it('authority shape wins; matched backbone contributes gersId + fills ONLY null height — each attribute keeps its OWN source', () => {
        const authority = input(AUTH, [
            cand({ sourceFeatureId: 'etak-1', heightM: null, heightMethod: null, floorsAbove: 5 }),
        ]);
        const backbone = input(BACK, [
            cand({
                sourceFeatureId: 'ovt-1',
                gersId: GERS_A,
                ring: square(0.5, 0, 10),
                heightM: 17.9,
                heightMethod: 'MODELLED',
            }),
        ]);
        const { buildings, report } = federateBuildings(authority, backbone, 'EE');
        expect(report.deduped).toBe(1);
        expect(report.matchedViaIou).toBe(1);
        expect(report.matchedViaBridge).toBe(0);
        expect(report.heightsFilledFromBackbone).toBe(1);
        expect(report.floorsFilledFromBackbone).toBe(0); // the authority already had floors
        expect(buildings).toHaveLength(1);
        const b = buildings[0]!.building;
        // The weld, split: shape provenance ≠ height provenance ON THE SAME RECORD.
        expect(b.source).toBe(AUTH);
        expect(b.footprint.coordinates).toEqual([square(0, 0, 10).map((p) => [p[0], p[1]])]);
        expect(b.height).toEqual({ value: 17.9, method: 'MODELLED', source: BACK });
        expect(b.floors).toEqual({ above: 5, below: null, source: AUTH });
        expect(b.gersId).toBe(GERS_A);
        // Backbone (ODbL) contribution ⇒ conservative encumbrance.
        expect(buildings[0]!.licence).toBe('odbl-share-alike');
    });

    it('every federated record validates against the FROZEN canonical schema (control 3)', () => {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1', floorsAbove: 3 })]),
            input(BACK, [
                cand({ sourceFeatureId: 'ovt-1', gersId: GERS_A, ring: square(1, 0, 10), heightM: 9, heightMethod: 'MODELLED' }),
                cand({ sourceFeatureId: 'ovt-far', gersId: GERS_B, ring: square(500, 500, 8) }),
            ]),
            'EE',
        );
        expect(buildings).toHaveLength(2);
        for (const fb of buildings) {
            expect(() => SiteIntelBuildingSchema.parse(fb.building)).not.toThrow();
        }
    });

    it('a national id is stamped ONLY for the national register; the pan-EU backbone gets an honest []', () => {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1' })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-far', gersId: GERS_B, ring: square(500, 500, 8) })]),
            'EE',
        );
        const auth = buildings.find((b) => b.building.source === AUTH)!;
        const back = buildings.find((b) => b.building.source === BACK)!;
        expect(auth.building.nationalIds).toEqual([
            { country: 'EE', scheme: 'etak_id', value: 'etak-1' },
        ]);
        expect(back.building.nationalIds).toEqual([]); // a GERS UUID is NOT a national id
        expect(back.building.gersId).toBe(GERS_B);
        expect(federationProvenance(back).sourceFeatureId).toBe('ovt-far');
    });

    it('an authority without its national id SCHEME is refused (it cannot be stamped honestly)', () => {
        expect(() =>
            federateBuildings(
                { source: AUTH, crs: 'EPSG:3301', idScheme: null, candidates: [] },
                input(BACK, []),
                'EE',
            ),
        ).toThrowError(/must declare the national id scheme/);
    });

    it('an authority height is NEVER overwritten by the backbone', () => {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1', heightM: 12.1, heightMethod: 'SURVEYED' })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-1', ring: square(1, 0, 10), heightM: 99, heightMethod: 'MODELLED' })]),
            'EE',
        );
        expect(buildings[0]!.building.height).toEqual({ value: 12.1, method: 'SURVEYED', source: AUTH });
    });

    it('UNKNOWN stays UNKNOWN: both sides null ⇒ height.value null and the view says UNKNOWN, never 0', () => {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1' })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-1', ring: square(1, 0, 10) })]),
            'EE',
        );
        const fb = buildings[0]!;
        expect(fb.building.height.value).toBeNull();
        expect(federationProvenance(fb)).toEqual({
            source: AUTH,
            sourceFeatureId: 'etak-1',
            gersId: null,
            heightConfidence: 'UNKNOWN',
            heightSource: AUTH,
            floorConfidence: 'UNKNOWN',
            floorSource: AUTH,
        });
    });

    it('an unmatched backbone candidate is minted as an ODbL-tagged backbone building', () => {
        const { buildings, report } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1' })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-far', gersId: GERS_B, ring: square(500, 500, 8) })]),
            'EE',
        );
        expect(report.backboneOnly).toBe(1);
        const minted = buildings.find((b) => b.building.source === BACK);
        expect(minted?.licence).toBe('odbl-share-alike');
        expect(minted?.building.gersId).toBe(GERS_B);
    });

    it('an undecidable pair is QUARANTINED — reported, not minted, not merged', () => {
        const { buildings, report } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1', ring: [[0, 0], [10, 0]] as Pt2[] })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-1' })]),
            'EE',
        );
        expect(report.undecidable).toEqual([
            { authorityFeatureId: 'etak-1', backboneFeatureId: 'ovt-1', reason: 'zero-or-degenerate-ring-area' },
        ]);
        expect(report.backboneOnly).toBe(0);
        expect(buildings).toHaveLength(1); // the authority building only
    });

    it('⭐ ONE degenerate authority ring does NOT quarantine the whole backbone (the prefilter is a CORRECTNESS fix)', () => {
        // The degenerate ring sits at the origin; the far backbone candidate is 500 m away and
        // has nothing to do with it. Before the bounds prefilter, its comparison against the
        // degenerate ring returned `undecidable`, which quarantined it — silently deleting a
        // real building from the federation.
        const { buildings, report } = federateBuildings(
            input(AUTH, [
                cand({ sourceFeatureId: 'etak-degenerate', ring: [[0, 0], [10, 0]] as Pt2[] }),
                cand({ sourceFeatureId: 'etak-2', ring: square(1000, 1000, 10) }),
            ]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-far', ring: square(500, 500, 8) })]),
            'EE',
        );
        expect(report.undecidable).toEqual([]); // provably apart ⇒ nothing to quarantine
        expect(report.backboneOnly).toBe(1);
        expect(buildings.map((b) => b.building.id)).toContain(`${BACK}:ovt-far`);
        // …and the clipper was called for none of the three provably-apart pairs.
        expect(report.geometryComparisons).toBe(0);
    });

    it('the prefilter never suppresses an identity match, and reports overlapping GERS conflicts', () => {
        const { report } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1', gersId: GERS_B })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-1', gersId: GERS_A, ring: square(0.5, 0, 10) })]),
            'EE',
        );
        expect(report.gersConflicts).toHaveLength(1);
        expect(report.gersConflicts[0]!.authorityFeatureId).toBe('etak-1');
        expect(report.gersConflicts[0]!.iou).toBeGreaterThan(0.8);
        expect(report.deduped).toBe(0); // conflicting ids are never merged
    });

    it('structural refusals: wrong roles, CRS mismatch, dishonest height claim', () => {
        const a = input(AUTH, []);
        const b = input(BACK, []);
        expect(() => federateBuildings(b, b, 'EE')).toThrowError(/cannot serve as the footprint authority/);
        expect(() => federateBuildings(a, a, 'EE')).toThrowError(/cannot serve as the backbone/);
        expect(() =>
            federateBuildings(a, { ...b, crs: 'EPSG:4326' }, 'EE'),
        ).toThrowError(/CRS mismatch/);
        expect(() =>
            federateBuildings(
                input(AUTH, [cand({ sourceFeatureId: 'x', heightM: null, heightMethod: 'SURVEYED' })]),
                b,
                'EE',
            ),
        ).toThrowError(/both null \(UNKNOWN\) or both present/);
    });
});

describe('ODbL separability — the one architectural licence constraint (row 2)', () => {
    function eeOnly(): NonOdblFederatedBuilding {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1' })]),
            input(BACK, []),
            'EE',
        );
        const fb = buildings[0]!;
        if (fb.licence !== 'open-non-share-alike') throw new Error('fixture must be unencumbered');
        return fb as NonOdblFederatedBuilding;
    }
    function odblTouched(): FederatedBuilding {
        const { buildings } = federateBuildings(
            input(AUTH, [cand({ sourceFeatureId: 'etak-1' })]),
            input(BACK, [cand({ sourceFeatureId: 'ovt-1', gersId: GERS_A, ring: square(1, 0, 10) })]),
            'EE',
        );
        return buildings[0]!;
    }

    it('runtime: an ODbL-encumbered row is REFUSED from a non-ODbL store, with the refusal named', () => {
        const store = createFederationStore('non-odbl', 'proprietary-derived-attrs');
        const out = addToFederationStore(store, odblTouched() as NonOdblFederatedBuilding);
        expect(out.ok).toBe(false);
        if (!out.ok) {
            expect(out.refusal).toBe('odbl-into-non-odbl-store');
            expect(out.detail).toMatch(/stay separable/);
        }
        expect(store.rows).toHaveLength(0); // refused means NOT stored
    });

    it('runtime: the same row enters an ODbL store; a clean row enters either store', () => {
        const odblStore = createFederationStore('odbl', 'tallinn-context-db');
        expect(addToFederationStore(odblStore, odblTouched()).ok).toBe(true);
        const nonOdbl = createFederationStore('non-odbl', 'proprietary-derived-attrs');
        expect(addToFederationStore(nonOdbl, eeOnly()).ok).toBe(true);
        expect(odblStore.rows).toHaveLength(1);
        expect(nonOdbl.rows).toHaveLength(1);
    });

    it('compile time: a not-narrowed FederatedBuilding does not typecheck against a non-ODbL store', () => {
        const store = createFederationStore('non-odbl', 'proprietary-derived-attrs');
        const fb: FederatedBuilding = odblTouched();
        // @ts-expect-error — the phantom policy brand forbids a possibly-ODbL row here; this
        // line failing to error is the boundary silently opening (the test then FAILS to build).
        const out = addToFederationStore(store, fb);
        expect(out.ok).toBe(false); // and the runtime arm still catches the erased-type call
    });

    it('contamination is monotone: a GERS-only backbone contribution already encumbers (conservative reading, recorded as an open legal question)', () => {
        const fb = odblTouched();
        expect(fb.building.height.value).toBeNull(); // backbone contributed NOTHING but the gersId
        expect(fb.building.gersId).toBe(GERS_A);
        expect(fb.licence).toBe('odbl-share-alike');
    });
});
