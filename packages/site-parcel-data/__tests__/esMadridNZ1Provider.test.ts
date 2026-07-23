// L-608 — the Madrid NZ 1 PROVIDER/ADAPTER test: sigma layer-6 ArcGIS response → generic
// ExplicitAreaSource → the MERGED solver (`resolveExplicitAreaRing` + `solveExplicitArea`) →
// `computeBuildableEnvelope`. Fixture-driven: no live network. The fixtures are modelled on the
// LIVE probe of 2026-07-23 — real CRS (EPSG:25830), real coordinate magnitudes, and the REAL
// COEF_Z value vocabulary (`"-"`, `"4"`, `"5"`, `"0 / 5"`). This proves the adapter feeds the
// already-merged solver correctly; the remaining act is the server proxy + the L-449 sign-off.

import { describe, it, expect } from 'vitest';
import type { Pt, ExplicitAreaRule } from '@pryzm/schemas';
import {
    resolveExplicitAreaRing,
    solveExplicitArea,
} from '../src/geometry/explicitArea.js';
import { computeBuildableEnvelope } from '../src/index.js';
import { ES_MADRID_NZ1_PACK } from '../src/rulepacks/esMadridNZ1.js';
import {
    parseCoefZ,
    mapMadridConditionsToExplicitAreaSource,
    MadridNZ1RingProvider,
    isInMadrid,
    MADRID_NZ1_RING_REF,
    type ArcGisPolygonQueryResponse,
    type ArcGisPointQueryResponse,
} from '../src/rulepacks/esMadridNZ1Provider.js';

// ── Fixtures anchored on the live 2026-07-23 probe (EPSG:25830 UTM 30N, metres). ──
// A layer-6 "Condiciones de la Edificación" polygon: a 30 m × 20 m buildable band on the street
// edge, closed (Esri repeats the first vertex). Easting/northing near the real observed values.
const E0 = 440000;
const N0 = 4475450;
function conditionsResponse(coefZ: string): ArcGisPolygonQueryResponse {
    return {
        spatialReference: { wkid: 25830 },
        features: [
            {
                attributes: {
                    CODMANZANA: '0105033',
                    NUMORD: '00368',
                    COND_EDIF: 1,
                    COEF_Z: coefZ,
                },
                geometry: {
                    rings: [
                        [
                            [E0, N0],
                            [E0 + 30, N0],
                            [E0 + 30, N0 + 20],
                            [E0, N0 + 20],
                            [E0, N0], // Esri closing duplicate
                        ],
                    ],
                },
            },
        ],
    };
}

// The parcel (from Catastro, in the SAME frame under the default identity projection): 30 m × 40 m,
// street edge at N0 — so parcel ∩ footprint = the 30×20 = 600 m² band, NOT the whole 1200 m².
const PARCEL: Pt[] = [
    { x: E0, z: N0 },
    { x: E0 + 30, z: N0 },
    { x: E0 + 30, z: N0 + 40 },
    { x: E0, z: N0 + 40 },
];
// The pack declares `MADRID_NZ1_RULE: GeometricRule` (the broad union); the resolver wants the
// narrow `ExplicitAreaRule`. Reconstruct it from the exported ring ref — same handle the pack sets.
const MADRID_RULE: ExplicitAreaRule = { kind: 'explicit-area', ringRef: MADRID_NZ1_RING_REF };

const FICHA_HIT: ArcGisPointQueryResponse = {
    features: [{ attributes: { NNUMORD: 368, FESPECIFICA: 'FE-0105033-368' } }],
};
const FICHA_MISS: ArcGisPointQueryResponse = { features: [] };

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('parseCoefZ — the COEF_Z defensive gate (silent-zero prevention)', () => {
    it('placeholder "-" and blanks are ABSENT, never zero', () => {
        expect(parseCoefZ('-')).toEqual({ kind: 'absent' });
        expect(parseCoefZ('')).toEqual({ kind: 'absent' });
        expect(parseCoefZ('  ')).toEqual({ kind: 'absent' });
        expect(parseCoefZ(null)).toEqual({ kind: 'absent' });
        expect(parseCoefZ(undefined)).toEqual({ kind: 'absent' });
    });

    it('a single clean number parses (comma decimal tolerated)', () => {
        expect(parseCoefZ('5')).toEqual({ kind: 'numeric', value: 5 });
        expect(parseCoefZ('4')).toEqual({ kind: 'numeric', value: 4 });
        expect(parseCoefZ('1,20')).toEqual({ kind: 'numeric', value: 1.2 });
        expect(parseCoefZ('2.5')).toEqual({ kind: 'numeric', value: 2.5 });
    });

    it('THE TRAP: the compound code "0 / 5" is CODED, never numeric 0', () => {
        // parseFloat("0 / 5") === 0 — the exact silent-zero this gate exists to stop.
        expect(parseCoefZ('0 / 5')).toEqual({ kind: 'coded', raw: '0 / 5' });
        expect(parseCoefZ('0 / 4')).toEqual({ kind: 'coded', raw: '0 / 4' });
        expect(parseCoefZ('PB+4')).toEqual({ kind: 'coded', raw: 'PB+4' });
        expect(parseCoefZ('abc')).toEqual({ kind: 'coded', raw: 'abc' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('mapMadridConditionsToExplicitAreaSource — ArcGIS layer 6 → ExplicitAreaSource', () => {
    it('maps a layer-6 polygon to a source with the pack ringRef + a clean ring', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('-'), { fichaResponse: FICHA_MISS });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.source.ringRef).toBe(MADRID_NZ1_RING_REF);
        // The Esri closing duplicate is stripped → 4 distinct vertices.
        expect(res.source.footprintRing).toHaveLength(4);
        expect(res.source.hasParcelOverride).toBe(false);
        expect(res.coefZ).toEqual({ kind: 'absent' });
    });

    it('a numeric COEF_Z is WITHHELD from edificabilidad by default (FAR semantics unverified)', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('5'), {});
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.coefZ).toEqual({ kind: 'numeric', value: 5 });
        // Default: NOT promoted — the volume calc never sees an unverified FAR.
        expect(res.source.edificabilidad).toBeNull();
    });

    it('a numeric COEF_Z is promoted only under the explicit assertion (the human L-449 gate)', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('5'), { assertCoefZAsFAR: true });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.source.edificabilidad).toBe(5);
    });

    it('a CODED COEF_Z stays null even WITH the assertion — never coerced to 0', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('0 / 5'), { assertCoefZAsFAR: true });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.coefZ.kind).toBe('coded');
        expect(res.source.edificabilidad).toBeNull(); // NOT 0
    });

    it('a Ficha Específica hit flags hasParcelOverride (the resolver will defer)', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('4'), { fichaResponse: FICHA_HIT });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.source.hasParcelOverride).toBe(true);
    });

    it('an injected projector rebases every vertex (the L5 scene-XZ transform seam)', () => {
        const res = mapMadridConditionsToExplicitAreaSource(conditionsResponse('-'), {
            projectPoint: (e, n) => ({ x: e - E0, z: n - N0 }),
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.source.footprintRing[0]).toEqual({ x: 0, z: 0 });
        expect(res.source.footprintRing[2]).toEqual({ x: 30, z: 20 });
    });

    it('refuses (typed) on no feature / no geometry — never an empty envelope', () => {
        expect(mapMadridConditionsToExplicitAreaSource({ features: [] })).toEqual({ ok: false, reason: 'no-feature' });
        expect(mapMadridConditionsToExplicitAreaSource(null)).toEqual({ ok: false, reason: 'no-feature' });
        expect(
            mapMadridConditionsToExplicitAreaSource({ features: [{ attributes: {}, geometry: { rings: [] } }] }),
        ).toEqual({ ok: false, reason: 'no-geometry' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('THE CHAIN — mapper source feeds the MERGED solver (resolve → solve)', () => {
    it('source → resolveExplicitAreaRing yields the footprint ring for the pack rule', () => {
        const mapped = mapMadridConditionsToExplicitAreaSource(conditionsResponse('-'), {});
        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        const resolved = resolveExplicitAreaRing(MADRID_RULE, mapped.source);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        expect(resolved.footprintRing).toHaveLength(4);
        expect(resolved.edificabilidad).toBeNull();
    });

    it('a Ficha override makes the resolver DEFER (parcel-override), not apply the general footprint', () => {
        const mapped = mapMadridConditionsToExplicitAreaSource(conditionsResponse('4'), { fichaResponse: FICHA_HIT });
        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        const resolved = resolveExplicitAreaRing(MADRID_RULE, mapped.source);
        expect(resolved).toEqual({ ok: false, reason: 'parcel-override' });
    });

    it('a ringRef that is not the pack rule is rejected (ringref-mismatch)', () => {
        const mapped = mapMadridConditionsToExplicitAreaSource(conditionsResponse('-'), { ringRef: 'other:v9' });
        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        expect(resolveExplicitAreaRing(MADRID_RULE, mapped.source)).toEqual({
            ok: false,
            reason: 'ringref-mismatch',
        });
    });

    it('resolved footprint → solveExplicitArea clips the parcel to the 600 m² band', () => {
        const mapped = mapMadridConditionsToExplicitAreaSource(conditionsResponse('-'), {});
        expect(mapped.ok).toBe(true);
        if (!mapped.ok) return;
        const resolved = resolveExplicitAreaRing(MADRID_RULE, mapped.source);
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        const solved = solveExplicitArea({ parcelRing: PARCEL, footprintRing: resolved.footprintRing });
        expect(solved.ok).toBe(true);
        if (!solved.ok) return;
        expect(solved.areaM2).toBeCloseTo(600, 4);
        expect(solved.footprintCoversParcel).toBe(false);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// END-TO-END through `computeBuildableEnvelope` is NOT re-proved here, deliberately. The adapter's
// contract ends at the ExplicitAreaSource → resolver → `solveExplicitArea` chain above (the exact
// "feeds solveExplicitArea correctly" the deliverable asks for). The ENGINE integration of an
// explicit-area footprint (clip-to-band on ok, hard-fail on null) is already the committed
// `explicitAreaEnvelope.test.ts`. Re-driving it here would only add fresh instances of a KNOWN,
// pre-existing tsc defect: `ComputeBuildableEnvelopeInput` (ZoningRulesEngine.ts) never declares
// the `explicitAreaFootprint` field the engine body reads (line 651) — so passing it is a tsc
// error that already reddens the base build. That field belongs in the engine interface, which
// this round must NOT touch; it is flagged in the Madrid record for the engine/schema owner.
// The pure `ES_MADRID_NZ1_PACK`/`computeBuildableEnvelope` imports are kept intentionally
// referenced below so this file still asserts the pack parses and the engine entry exists.
it('the real ES_MADRID_NZ1_PACK is a parseable explicit-area pack the engine can accept', () => {
    expect(typeof computeBuildableEnvelope).toBe('function');
    expect(ES_MADRID_NZ1_PACK.zones[0]!.geometricRule).toEqual({
        kind: 'explicit-area',
        ringRef: MADRID_NZ1_RING_REF,
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('MadridNZ1RingProvider.fetchExplicitAreaSource — the impure seam (never throws)', () => {
    const MADRID = { lat: 40.4168, lon: -3.7038 }; // Puerta del Sol
    const okFetch = (cond: ArcGisPolygonQueryResponse, ficha: ArcGisPointQueryResponse): typeof fetch =>
        (async (url: string) =>
            ({
                ok: true,
                json: async () => (url.includes('/ficha') ? ficha : cond),
            })) as unknown as typeof fetch;

    it('a Madrid point + a layer-6 response → an ExplicitAreaSource result', async () => {
        const res = await MadridNZ1RingProvider.fetchExplicitAreaSource(MADRID.lat, MADRID.lon, {
            fetchImpl: okFetch(conditionsResponse('5'), FICHA_MISS),
        });
        expect(res).not.toBeNull();
        expect(res!.ok).toBe(true);
        if (!res!.ok) return;
        expect(res!.source.ringRef).toBe(MADRID_NZ1_RING_REF);
        expect(res!.source.footprintRing).toHaveLength(4);
        expect(res!.source.hasParcelOverride).toBe(false);
    });

    it('the ficha proxy hit flows through to hasParcelOverride', async () => {
        const res = await MadridNZ1RingProvider.fetchExplicitAreaSource(MADRID.lat, MADRID.lon, {
            fetchImpl: okFetch(conditionsResponse('4'), FICHA_HIT),
        });
        expect(res!.ok).toBe(true);
        if (!res!.ok) return;
        expect(res!.source.hasParcelOverride).toBe(true);
    });

    it('a non-Madrid point → null WITHOUT any fetch (jurisdiction guard)', async () => {
        let calls = 0;
        const counting = (async () => {
            calls++;
            return { ok: true, json: async () => conditionsResponse('5') };
        }) as unknown as typeof fetch;
        const res = await MadridNZ1RingProvider.fetchExplicitAreaSource(41.3874, 2.1686, { fetchImpl: counting }); // Barcelona
        expect(res).toBeNull();
        expect(calls).toBe(0);
    });

    it('an upstream error / throw → null, never throws', async () => {
        const bad = (async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        await expect(
            MadridNZ1RingProvider.fetchExplicitAreaSource(MADRID.lat, MADRID.lon, { fetchImpl: bad }),
        ).resolves.toBeNull();
        const throwing = (async () => {
            throw new Error('sigma down');
        }) as unknown as typeof fetch;
        await expect(
            MadridNZ1RingProvider.fetchExplicitAreaSource(MADRID.lat, MADRID.lon, { fetchImpl: throwing }),
        ).resolves.toBeNull();
    });
});

describe('isInMadrid — the proximity gate', () => {
    it('Madrid in, elsewhere out', () => {
        expect(isInMadrid(40.4168, -3.7038)).toBe(true); // Sol
        expect(isInMadrid(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInMadrid(55.6761, 12.5683)).toBe(false); // Copenhagen
        expect(isInMadrid(NaN, NaN)).toBe(false);
    });
});
