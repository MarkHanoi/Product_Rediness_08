// §NATIVE-CRS-MEASUREMENT — THE CI GUARD. A proxy whose geometry is MEASURED must request the
// publisher's NATIVE metric CRS, and this test fails if one drifts back to degrees.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS EXISTS TO PREVENT A SECOND TIME
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `server/murciaPgouProxy.js` asked its GeoServer for `srsName=EPSG:4326`. GeoServer serialises
// GeoJSON at `numDecimals=4`: 0,1 mm in the layer's native EPSG:25830 METRES, but ~8,8 m of
// longitude and ~11,1 m of latitude in DEGREES at Murcia's latitude. The street width that selects
// a storey band under PGOU Arts. 5.3.3 / 5.5.3 / 5.7.3 / 5.9.3 was measured on that geometry.
//
// Measured live 2026-08-02 — the same features in both CRS, matched by WFS feature id (707 features
// / 19 986 segments over 12 neighbourhoods):
//     segment |Δlength|  median 2,96 m · p90 7,34 m · p99 10,33 m · max 13,71 m
//     DEGENERATE (zero-length) segments — 4326: 7 499 of 19 986 (37,5 %) · native 25830: 1
// The legal thresholds are 4 m, 8 m and 12 m. The error was the size of the bands.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY IT IS BUILT THIS WAY — TWO CHECKS, NEITHER OF WHICH CAN DRIFT
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   A. It CALLS THE REAL URL BUILDER and reads `srsName` off the URL that ships. A registry of
//      "what we intended to request" would be a comment that can go stale; a URL cannot.
//   B. It ENUMERATES the providers that import the measurement module and requires each to be
//      declared here. So a new measured region cannot appear silently — adding one turns this test
//      red until its CRS is stated, which is the point.
//
// ⚠ THIS GUARD IS SCOPED TO SOURCES WHOSE GEOMETRY IS MEASURED. A proxy that fetches ATTRIBUTES
// ONLY (Córdoba sends `propertyName` and no geometry; Madrid's normas zonales sends
// `returnGeometry=false`) is not exposed to this defect and is deliberately not policed here —
// over-broad guards get disabled, and a disabled guard protects nothing.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    buildMurciaWfsUrl,
    MURCIA_NATIVE_CRS,
    MURCIA_CALIFICACION_LAYER,
    MURCIA_SECTOR_LAYER,
    MURCIA_EJE_COMERCIAL_LAYER,
} from '../murciaPgouProxy.js';
import { isNativeMetricCrs } from '../../packages/site-parcel-data/src/geometry/nativeCrs.ts';

/**
 * Every source whose geometry reaches a MEASUREMENT, with the CRS it must be requested in.
 *
 * ⚠ ADDING A ROW IS A CLAIM. It says: this geometry is measured, and this is the CRS the publisher
 * holds it in. Both halves must be true, and the second must be verifiable against the publisher's
 * own `GetCapabilities` — never guessed from the magnitude of a coordinate.
 */
const MEASURED_GEOMETRY_SOURCES = [
    {
        id: 'es-murcia/pgou_alineaciones',
        nativeCrs: MURCIA_NATIVE_CRS,
        why: 'SIG-MU2 street width → PGOU Arts. 5.3.3/5.5.3/5.7.3/5.9.3 storey bands (4/8/12 m).',
        urls: () => [
            buildMurciaWfsUrl(MURCIA_CALIFICACION_LAYER, 37.99, -1.13),
            buildMurciaWfsUrl(MURCIA_SECTOR_LAYER, 37.99, -1.13),
            buildMurciaWfsUrl(MURCIA_EJE_COMERCIAL_LAYER, 37.99, -1.13, 0.002, 200),
        ],
    },
];

/** Providers that import the shared measurement module, and are therefore in scope. */
const PROVIDERS_DIR = fileURLToPath(new URL('../../packages/site-parcel-data/src/providers/', import.meta.url));
const MEASUREMENT_MODULE = 'geometry/streetWidth.js';

/**
 * A measured provider must be represented in `MEASURED_GEOMETRY_SOURCES`. Keyed by the token that
 * appears in the provider's filename, so the mapping is obvious and does not need a second registry.
 */
const PROVIDER_TO_SOURCE = new Map([
    ['resolveMurciaStreetWidth.ts', 'es-murcia/pgou_alineaciones'],
    // Barcelona's amplada de vial is measured from Catastro INSPIRE, whose publication grid was
    // MEASURED at 1e-6° ≈ 0,083 m E / 0,111 m N (`blockRing.test.ts`) — two orders of magnitude
    // below the harm above, and not a GeoServer. It is declared here so its absence from the
    // native-CRS registry is a recorded decision rather than an oversight.
    ['__catastro-measured-on-a-decimetric-degree-grid__', null],
]);

describe('§NATIVE-CRS-MEASUREMENT — every MEASURED source is requested in its native metric CRS', () => {
    it.each(MEASURED_GEOMETRY_SOURCES)('$id requests $nativeCrs, never degrees', (src) => {
        expect(isNativeMetricCrs(src.nativeCrs), `${src.nativeCrs} is not an allow-listed metric CRS`)
            .toBe(true);
        for (const url of src.urls()) {
            const srsName = new URL(url).searchParams.get('srsName');
            expect(srsName, `${src.id} sent no srsName at all — the server would pick for us`).toBeTruthy();
            expect(srsName, `${src.id} requested ${srsName}; ${src.why}`).toBe(src.nativeCrs);
            expect(isNativeMetricCrs(srsName), `${src.id} requested a non-metric CRS`).toBe(true);
        }
    });

    it('⚠ the Murcia URL contains NO geographic srsName anywhere — the regression, spelled out', () => {
        for (const url of MEASURED_GEOMETRY_SOURCES[0].urls()) {
            const srsName = new URL(url).searchParams.get('srsName');
            expect(srsName).not.toMatch(/4326|4258|CRS:?84/i);
        }
    });

    it('the BBOX may stay in 4326 — it is a selection window, not the response serialisation', () => {
        // These are different jobs and conflating them is how the fix gets "simplified" away. The
        // bbox is reprojected by GeoServer at full internal precision; only the OUTPUT was lossy.
        const url = MEASURED_GEOMETRY_SOURCES[0].urls()[0];
        expect(new URL(url).searchParams.get('bbox')).toContain('urn:ogc:def:crs:EPSG::4326');
        expect(new URL(url).searchParams.get('srsName')).toBe(MURCIA_NATIVE_CRS);
    });

    it('a new MEASURED provider cannot appear without declaring its CRS here', () => {
        const undeclared = readdirSync(PROVIDERS_DIR)
            .filter((f) => f.endsWith('.ts'))
            .filter((f) => readFileSync(PROVIDERS_DIR + f, 'utf8').includes(MEASUREMENT_MODULE))
            .filter((f) => !PROVIDER_TO_SOURCE.has(f));
        expect(
            undeclared,
            'These providers measure geometry but are not declared in this guard. Add each to ' +
            'PROVIDER_TO_SOURCE and, if it fetches from a metre-CRS publisher, to ' +
            'MEASURED_GEOMETRY_SOURCES with the CRS its publisher holds the data in. See ' +
            'packages/site-parcel-data/src/geometry/nativeCrs.ts.',
        ).toEqual([]);
    });

    it('every declared source name resolves to a real registry row', () => {
        const ids = new Set(MEASURED_GEOMETRY_SOURCES.map((s) => s.id));
        for (const [provider, id] of PROVIDER_TO_SOURCE) {
            if (id === null) continue;
            expect(ids.has(id), `${provider} points at unknown source "${id}"`).toBe(true);
        }
    });
});

describe('§NATIVE-CRS-MEASUREMENT — the proxy DECLARES its CRS so no consumer has to infer it', () => {
    it('exports the native CRS as a value, not only as a comment', () => {
        expect(MURCIA_NATIVE_CRS).toBe('EPSG:25830');
        expect(isNativeMetricCrs(MURCIA_NATIVE_CRS)).toBe(true);
    });

    it('the proxy source states the harm, so the next reader cannot "tidy" the fix away', () => {
        const src = readFileSync(fileURLToPath(new URL('../murciaPgouProxy.js', import.meta.url)), 'utf8');
        expect(src).toContain('§NATIVE-CRS-MEASUREMENT');
        expect(src).toMatch(/numDecimals/);
    });
});
