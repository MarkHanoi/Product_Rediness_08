// Murcia (INE 30030) — the WIRING tests. Not "does the mapper map?" (that is `murciaZoning.test.ts`)
// but "is the mapper REACHABLE, and does it come back with the right answer for the founder's
// parcel?" — the question the Murcia files could not answer while they sat orphaned.
//
// The chain these tests walk is the one a real click walks, minus the two ends that are not L2:
//
//   isInMurcia (S2 routing gate)
//     → resolveMurciaZoning (S3, the live municipal records — fetch INJECTED here)
//       → murciaEnvelopeDisposition (S4, PURE)
//         → buildRefusedEnvelope (the rendered artefact)
//   …and, independently, resolveZoneDisposition (S5, the registry the coverage globe reads).
//
// The L5 half (a real `dispatchParcelBoundary` on a Murcia site) is proven in
// `apps/editor/__tests__/murciaSiteDispatch.test.ts`, which drives the SAME resolver through the
// editor's dispatcher.
//
// The fixtures are VERBATIM attribute sets returned by an exact point-intersect against
// https://geoserver.murcia.es/geoserver/wfs on 2026-07-31 (the same ones `murciaZoning.test.ts`
// uses), wrapped in the GeoJSON envelope the `/api/es/murcia-pgou` proxy returns.

import { describe, expect, it, vi } from 'vitest';
import {
    isInMurcia,
    MURCIA_INE_CODE,
    composeIneCode,
} from '../src/providers/murciaBbox.js';
import {
    MURCIA_JURISDICTION_ID,
    MURCIA_ENVELOPE_VERIFIED,
    murciaNoRulePackRefusal,
    detectDerivedPlanMarkers,
} from '../src/rulepacks/esMurciaEnvelope.js';
import {
    ES_MURCIA_PGOU2012_PACK,
    MURCIA_PGOU2012_ZONE_CODES,
    MURCIA_PGOU2012_VARIANT_ZONE_CODES,
} from '../src/rulepacks/esMurciaPgou2012.js';
import { murciaEnvelopeDisposition } from '../src/providers/murciaZoningProvider.js';
import {
    resolveMurciaZoning,
    readMurciaCalificacion,
    readMurciaSector,
    MURCIA_PGOU_PATH,
} from '../src/providers/resolveMurciaZoning.js';
import { resolveZoneDisposition, listJurisdictionCoverage } from '../src/rulepacks/registry.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';

/** The founder's parcel, resolved live from Catastro on 2026-07-31. */
const PARCEL = {
    refcat: '3481104XH6038S',
    lat: 38.0061,
    lon: -1.138028,
    address: 'PL U.A. 5ª DEL P.P. CR-5  P1 MURCIA (CHURRA) (MURCIA)',
} as const;

const ASOF = '2026-07-31';

/** `Murcia:pgou_alineaciones` at the founder parcel — verbatim, in GeoJSON dress. */
const CAL_FEATURE = {
    type: 'Feature',
    properties: {
        calificacion: 'RR',
        descripcion: 'Residencial, ordenación remitida al planeamiento anterior',
        uso_global: 'Residencial',
        sector: 'TA-379',
        url: 'RR.pdf',
        f_inicial: '2021-09-09Z',
        f_fin: '2999-12-30Z',
    },
};

/** `Murcia:pgou_sectores` at the founder parcel — verbatim, in GeoJSON dress. */
const SECTOR_FEATURE = {
    type: 'Feature',
    properties: {
        sector: 'TA-379',
        clase_suelo: 'Urbanizable',
        categoria: 'Urbanizable Transitorio',
        uso_global: 'Residencial',
        pedania: 'EL PUNTAL',
        superficie: 383313,
        f_inicial: '2024-01-17Z',
        f_fin: '2999-12-30Z',
    },
};

/** A fake same-origin proxy. Records the URLs it was called with, so the route is checkable. */
function fakeProxy(
    body: unknown,
    init: { ok?: boolean; calls?: string[] } = {},
): typeof fetch {
    return vi.fn(async (input: RequestInfo | URL) => {
        init.calls?.push(String(input));
        return {
            ok: init.ok ?? true,
            status: (init.ok ?? true) ? 200 : 502,
            json: async () => body,
        } as unknown as Response;
    }) as unknown as typeof fetch;
}

describe('S2 — the routing gate is the DATA, never a name', () => {
    it('routes the founder parcel and nothing else that is called "Murcia"', () => {
        expect(isInMurcia(PARCEL.lat, PARCEL.lon)).toBe(true);
        // OSM relation 11366415 — Murcia, Negros Occidental, Philippines.
        expect(isInMurcia(10.6, 123.05)).toBe(false);
    });

    it('composes the INE code from Catastro\'s own province + municipality codes', () => {
        expect(composeIneCode('30', '30')).toBe(MURCIA_INE_CODE);
    });
});

describe('S3 — resolveMurciaZoning reaches the municipal records through the proxy', () => {
    it('calls the same-origin route with the parcel point (never the GeoServer directly)', async () => {
        const calls: string[] = [];
        await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            {
                asOf: ASOF,
                fetchImpl: fakeProxy({ calificaciones: [CAL_FEATURE], sectores: [SECTOR_FEATURE] }, { calls }),
            },
        );
        expect(calls).toHaveLength(1);
        expect(calls[0]!.startsWith(MURCIA_PGOU_PATH)).toBe(true);
        expect(calls[0]).toContain(`lat=${PARCEL.lat}`);
        expect(calls[0]).toContain('lon=-1.138028');
        // ⚠ Never a cross-origin call: the browser cannot reach geoserver.murcia.es under CSP.
        expect(calls[0]).not.toContain('geoserver.murcia.es');
    });

    it('reads the calificación + ámbito VERBATIM', async () => {
        const r = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            {
                asOf: ASOF,
                fetchImpl: fakeProxy({ calificaciones: [CAL_FEATURE], sectores: [SECTOR_FEATURE] }),
            },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.records.calificacion?.calificacion).toBe('RR');
        expect(r.records.calificacion?.sector).toBe('TA-379');
        expect(r.records.sector?.clase_suelo).toBe('Urbanizable');
        expect(r.records.sector?.categoria).toBe('Urbanizable Transitorio');
        expect(r.records.sector?.superficie).toBe(383313);
        expect(r.records.supersededCount).toBe(0);
    });

    it('refuses a point outside the municipal box without any fetch at all', async () => {
        const calls: string[] = [];
        const r = await resolveMurciaZoning(
            { lat: 41.3874, lon: 2.1686 }, // Barcelona
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: [], sectores: [] }, { calls }) },
        );
        expect(r).toEqual({ ok: false, reason: 'out-of-murcia' });
        expect(calls).toHaveLength(0);
    });

    it('keeps FAILURE and ABSENCE apart — the §CONTEXT-DATA-HONESTY property', async () => {
        const unreachable = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ error: 'upstream' }, { ok: false }) },
        );
        expect(unreachable).toEqual({ ok: false, reason: 'endpoint-unreachable' });

        // Both layers answered `null` (neither upstream responded) — still a failure, not an empty.
        const bothNull = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: null, sectores: null }) },
        );
        expect(bothNull).toEqual({ ok: false, reason: 'endpoint-unreachable' });

        // Both layers answered, empty — a REAL negative, and it must not read as a failure.
        const absent = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: [], sectores: [] }) },
        );
        expect(absent).toEqual({ ok: false, reason: 'no-records-here' });
    });

    it('drops SUPERSEDED records rather than quote a repealed rule', async () => {
        const superseded = {
            type: 'Feature',
            properties: { ...CAL_FEATURE.properties, calificacion: 'OLD', f_fin: '2012-01-01Z' },
        };
        const r = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            {
                asOf: ASOF,
                fetchImpl: fakeProxy({ calificaciones: [superseded, CAL_FEATURE], sectores: [SECTOR_FEATURE] }),
            },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.records.calificacion?.calificacion).toBe('RR');
        expect(r.records.supersededCount).toBe(1);
    });

    it('reports "only superseded" as its OWN answer, never as "nothing here"', async () => {
        const superseded = {
            type: 'Feature',
            properties: { ...CAL_FEATURE.properties, f_fin: '2012-01-01Z' },
        };
        const r = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: [superseded], sectores: [] }) },
        );
        expect(r).toEqual({ ok: false, reason: 'only-superseded-records' });
    });

    it('refuses a zone boundary rather than pick features[0]', async () => {
        const other = {
            type: 'Feature',
            properties: { ...CAL_FEATURE.properties, calificacion: 'MC', sector: 'UH' },
        };
        const r = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: [CAL_FEATURE, other], sectores: [] }) },
        );
        expect(r).toEqual({ ok: false, reason: 'ambiguous-zone' });
    });

    it('collapses an identical duplicate — the same polygon twice is not ambiguity', async () => {
        const r = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            {
                asOf: ASOF,
                fetchImpl: fakeProxy({ calificaciones: [CAL_FEATURE, { ...CAL_FEATURE }], sectores: [] }),
            },
        );
        expect(r.ok).toBe(true);
        if (!r.ok) throw new Error('unreachable');
        expect(r.records.calificacion?.calificacion).toBe('RR');
    });

    it('never throws — a hostile body is a typed refusal', async () => {
        const hostile = vi.fn(async () => {
            throw new TypeError('network down');
        }) as unknown as typeof fetch;
        await expect(
            resolveMurciaZoning({ lat: PARCEL.lat, lon: PARCEL.lon }, { asOf: ASOF, fetchImpl: hostile }),
        ).resolves.toEqual({ ok: false, reason: 'endpoint-unreachable' });

        const junk = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            { asOf: ASOF, fetchImpl: fakeProxy({ calificaciones: [{ type: 'Feature' }], sectores: [] }) },
        );
        expect(junk).toEqual({ ok: false, reason: 'unparsable-response' });
    });

    it('reads a feature with no properties as null, never as an empty record', () => {
        expect(readMurciaCalificacion(null)).toBeNull();
        expect(readMurciaCalificacion({ type: 'Feature', properties: {} })).toBeNull();
        expect(readMurciaSector({ type: 'Feature', properties: {} })).toBeNull();
    });
});

describe('S3 → S4 — the END-TO-END chain a Murcia click walks', () => {
    it('resolves the founder parcel to the LEGALLY GROUNDED derived-plan refusal', async () => {
        // The exact sequence `applyMurciaZoningThenFallback` performs.
        expect(isInMurcia(PARCEL.lat, PARCEL.lon)).toBe(true);
        const markers = detectDerivedPlanMarkers(PARCEL.address);
        const resolution = await resolveMurciaZoning(
            { lat: PARCEL.lat, lon: PARCEL.lon },
            {
                asOf: ASOF,
                fetchImpl: fakeProxy({ calificaciones: [CAL_FEATURE], sectores: [SECTOR_FEATURE] }),
            },
        );
        expect(resolution.ok).toBe(true);
        if (!resolution.ok) throw new Error('unreachable');

        const disposition = murciaEnvelopeDisposition(
            resolution.records.calificacion,
            resolution.records.sector,
            ASOF,
            markers,
        );
        expect(disposition.kind).toBe('refusal');
        if (disposition.kind !== 'refusal') throw new Error('unreachable');

        // ⚠ The substantive claim: the ORDINANCE answered, and its answer was "that other document".
        expect(disposition.refusal.code).toBe('derived-plan');
        expect(disposition.refusal.legallyGrounded).toBe(true);
        expect(disposition.refusal.ordinanceRef).toContain('6.6.2');
        expect(disposition.refusal.ordinanceRef).toContain('5.24.5');
        expect(disposition.refusal.detail).toContain('expediente 379');
        expect(disposition.refusal.detail).toContain('Plan Parcial CR-5');
        expect(disposition.refusal.knownFacts.join(' ')).toContain('Urbanizable Transitorio');
        expect(disposition.refusal.knownFacts.join(' ')).toContain('EL PUNTAL');

        // …and what actually reaches the massing / the C19 parcel: nothing extrudable.
        const env = buildRefusedEnvelope(
            resolution.records.calificacion!.calificacion!,
            disposition.refusal,
            'none',
        );
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.zoneCode).toBe('RR');
        expect(env.insetPolygon).toEqual([]);
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxCoverage).toBeNull();
        expect(env.confidence).toBe('not-determined');
        // The competitor's "proxy PGOU" figure must appear nowhere in what we publish.
        expect(`${env.refusal?.headline} ${env.refusal?.detail}`).not.toMatch(/\b262\b/);
    });
});

describe('S5 — the registry answers for Murcia (the coverage globe reads this)', () => {
    const coverage = listJurisdictionCoverage();
    const murcia = coverage.find((c) => c.jurisdictionId === MURCIA_JURISDICTION_ID);

    it('is REGISTERED — without this the C60 globe is dark over Murcia', () => {
        expect(murcia).toBeDefined();
        expect(murcia!.countryCode).toBe('ES');
        expect(murcia!.displayName).toBe('Murcia');
    });

    it('lights the founder parcel with the SAME predicate the dispatcher routes on', () => {
        expect(murcia!.contains(PARCEL.lat, PARCEL.lon)).toBe(true);
        expect(murcia!.contains).toBe(isInMurcia);
    });

    // §MURCIA-PACK-REGISTERED (2026-08-01) — this used to assert `packZoneCodes` was EMPTY, on the
    // ground that "there is no transcribed Murcia instrument". That ground no longer holds: the PGOU
    // *Normas Urbanísticas* TR-2012 has been sourced and 14 calificaciones transcribed, so the pack
    // is now registered. The assertion is REPLACED, not deleted — and what replaces it pins the two
    // facts that matter: the codes are exactly the pack's, and registration published NOTHING.
    it('claims exactly the 14 transcribed calificaciones (+ the 2 published sub-variants)', () => {
        expect([...murcia!.packZoneCodes].sort()).toEqual(
            [...MURCIA_PGOU2012_ZONE_CODES, ...MURCIA_PGOU2012_VARIANT_ZONE_CODES].sort(),
        );
        // The count claim RATE.md §ENVELOPE makes, pinned so prose and code cannot drift.
        expect(MURCIA_PGOU2012_ZONE_CODES).toHaveLength(14);
        expect(MURCIA_PGOU2012_VARIANT_ZONE_CODES).toEqual(['IXT', 'RF1']);
        // ⚠ …and every one of those codes is DERIVED from the pack, never re-typed beside it.
        expect([...MURCIA_PGOU2012_ZONE_CODES].sort()).toEqual(
            ES_MURCIA_PGOU2012_PACK.zones.map((z) => z.code.toUpperCase()).sort(),
        );
    });

    it('⚠ AUTHORISATION IS NOW GIVEN — and DELEGATION still outranks the pack', () => {
        // Was "REGISTRATION IS NOT AUTHORISATION — the gate is still shut". The gate was signed by
        // the founder on 2026-08-01, so the first assertion flips WITH the signature.
        expect(MURCIA_ENVELOPE_VERIFIED).toBe(true);
        // …and the PURE disposition — the only thing the L5 dispatch consults — now returns the
        // TRANSCRIBED ENVELOPE for a packed, NON-delegated calificación. Pre-signature this same
        // input asserted `refusal` / `no-rule-pack`; that expectation was correct then and is
        // wrong now, so it is RE-AIMED, not deleted. This is the whole observable effect of the
        // signature, and if it ever reverts to a refusal the gate has been silently un-flipped.
        const d = murciaEnvelopeDisposition(
            {
                calificacion: 'RM1', descripcion: 'Manzana cerrada', uso_global: 'Residencial',
                sector: null, url: null, f_inicial: '2012-12-01Z', f_fin: '2999-12-30Z',
            },
            null,
            '2026-08-01',
        );
        expect(d.kind).toBe('envelope');
        // ⚠ THE INVARIANT THAT SURVIVES THE SIGNATURE, and the reason this test still earns its
        // place: DELEGATION outranks the pack. A signature authorises publishing where we MAY
        // publish; it does not overrule the ordinance. Arts. 5.25.3.3 / 5.26.3.3 hand altura and
        // edificabilidad to the partial plan whatever the zonal code says — pinned by the
        // sibling test below ("answers a DELEGATED Murcia zone code with a refusal") and by the
        // founder's own parcel `3481104XH6038S`, which must keep refusing.
    });

    it('answers a DELEGATED Murcia zone code with a refusal, never an estimated fallback', () => {
        const d = resolveZoneDisposition(MURCIA_JURISDICTION_ID, 'RR', {
            zoneLabel: 'Residencial, ordenación remitida al planeamiento anterior',
        });
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') throw new Error('unreachable');
        // ⚠ `RR` is the DELEGATED-land calificación and is deliberately NOT in the pack — the PGOU
        // declines to order that land, so no transcription of the PGOU could ever cover it.
        expect(MURCIA_PGOU2012_ZONE_CODES).not.toContain('RR');
        // ⚠ The REGISTRY path has no live records, so it may only make the weaker claim. The
        // stronger `derived-plan` one belongs to the dispatcher, which has read the ámbito.
        expect(d.refusal.code).toBe('no-rule-pack');
        expect(d.refusal.legallyGrounded).toBe(false);
    });

    it('does NOT route Murcia through any Catalan / other jurisdiction — exactly one claims it', () => {
        const claiming = coverage.filter((c) => c.contains(PARCEL.lat, PARCEL.lon));
        expect(claiming.map((c) => c.jurisdictionId)).toEqual([MURCIA_JURISDICTION_ID]);
    });

    it('does not claim Barcelona, Madrid or Córdoba land', () => {
        for (const [lat, lon] of [[41.3874, 2.1686], [40.4168, -3.7038], [37.8882, -4.7794]] as const) {
            expect(murcia!.contains(lat, lon)).toBe(false);
        }
    });
});

describe('the coverage refusal stays a statement about PRYZM, not about the law', () => {
    it('never upgrades legallyGrounded, however much the address says', () => {
        const r = murciaNoRulePackRefusal(null, null, [], detectDerivedPlanMarkers(PARCEL.address));
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toContain('Plan Parcial CR-5');
    });
});
