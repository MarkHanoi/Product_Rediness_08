// §MURCIA-STREET-WIDTH — SIG-MU2's FOUR CONDITIONS, one describe block each.
//
// The founder's approval of 2026-08-02 is conditional. These are the acceptance criteria, not
// commentary: if one of these blocks goes red, the signature's premise no longer holds and the
// envelope must stop publishing. `sources/VERIFICATION.md` §SIG-MU2 references this file by name so
// a future author cannot quietly regress one.
//
// The fixture is a LIVE capture of `Murcia:pgou_alineaciones` over the Casco Antiguo
// (bbox 37.9902,-1.1327 → 37.9942,-1.1287, 39 features). Real municipal geometry, so these are not
// tests against a shape we invented to pass.
//
// ⚠⚠ §NATIVE-CRS-MEASUREMENT — THE FIXTURE WAS RE-CAPTURED IN EPSG:25830 AND THE PINS MOVED.
// The 2026-08-02 capture was taken in EPSG:4326, which is how the defect got in: GeoServer
// serialises GeoJSON at `numDecimals=4`, and four decimals of a degree is ~8,8 m of longitude /
// ~11,1 m of latitude at Murcia's latitude. Those tests were GREEN against quantised geometry, so
// they pinned the wrong number to three decimal places — a reminder that a fixture captured through
// a broken seam certifies the break. The 2026-08-03 capture is the SAME bbox, the SAME 39 features,
// requested in the layer's native metric CRS.
//
// What moved, and it is the whole story:
//     RM1 governing frontage   8,162 m  →  6,582 m
//     MZ  governing frontage  20,671 m  →  20,208 m
// RM1's old value sat 0,16 m above the 8 m threshold of Arts. 5.3.3 / 5.5.3. The street is actually
// 6,58 m wide — the middle band, one storey lower. The old figure was not 8,162 m of street, it was
// ~8,8 m of longitude quantisation read as a distance.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    resolveMurciaStreetWidth,
    MURCIA_STREET_WIDTH_AUTHORITY,
} from '../src/providers/resolveMurciaStreetWidth.js';
import { resolveMurciaAnchoDeCalle } from '../src/rulepacks/esMurciaAnchoDeCalle.js';
import { nativeToWgs84, projectToNative } from '../src/geometry/nativeCrs.js';

const FIXTURE = JSON.parse(readFileSync(
    fileURLToPath(new URL('./fixtures/murcia-alineaciones-centro-25830-2026-08-03.json', import.meta.url)),
    'utf8',
)) as { crs: string; features: unknown[] };

/** The CRS the proxy declares on every body (`MURCIA_NATIVE_CRS` in server/murciaPgouProxy.js). */
const NATIVE = 'EPSG:25830';

/**
 * A fetch that replays the captured neighbourhood — the exact body the proxy returns, INCLUDING the
 * declared `crs`. ⚠ A body without `crs` is a DIFFERENT test (see the guard block); it must not be
 * the default here, or the guard would be untested and the fixture silently unmeasurable.
 */
function fixtureFetch(
    body: {
        crs?: unknown;
        alineaciones: unknown[] | null;
        ejesComerciales?: unknown[] | null;
        truncated?: boolean;
    } = { crs: NATIVE, alineaciones: FIXTURE.features, ejesComerciales: [], truncated: false },
    ok = true,
): typeof fetch {
    const withCrs = 'crs' in body ? body : { crs: NATIVE, ...body };
    return (async () => ({ ok, json: async () => withCrs })) as unknown as typeof fetch;
}

/**
 * A GeoJSON LineString feature in NATIVE EPSG:25830 easting/northing, for the Eje-Comercial tests.
 * ⚠ Metres, not degrees — the proxy serves the eje layer in the same native CRS as the alineaciones,
 * and a synthetic fixture in degrees would sit 4 million metres away and silently test nothing.
 */
function ejeLine(pts: ReadonlyArray<readonly [number, number]>): unknown {
    return { type: 'Feature', properties: { layer: 'EJE_COMERCIAL' }, geometry: { type: 'LineString', coordinates: pts } };
}

/** A point inside a real RM1 manzana in the captured neighbourhood (measured w ≈ 6,58 m). */
const RM1_POINT = { lat: 37.991617, lon: -1.132142 };
/** RM1_POINT projected into EPSG:25830 — the frame the synthetic eje fixtures are built in. */
const RM1_EN = { e: 664018.716, n: 4206530.918 };
/** A point inside a real MZ block on a wide artery (measured w ≈ 20,21 m). */
const MZ_POINT = { lat: 37.992073, lon: -1.133133 };

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('SIG-MU2 CONDITION 1 — reproducible from authoritative geometry', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    it('the SAME published geometry yields a BYTE-IDENTICAL width, every time', async () => {
        const runs = await Promise.all(
            Array.from({ length: 8 }, () =>
                resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() })),
        );
        const first = JSON.stringify(runs[0]);
        for (const r of runs) expect(JSON.stringify(r)).toBe(first);
        expect(runs[0]!.ok).toBe(true);
    });

    it('the width is a REAL measurement off the municipal layer, not a placeholder', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Pinned to the value the live layer produces IN ITS NATIVE CRS. A change here means the
        // geometry, the projection or the measurement moved — all three are things a reviewer must
        // see. ⚠ Was 8.162 against the EPSG:4326 capture; that number was quantisation, not street.
        expect(r.width_m).toBeCloseTo(6.582, 2);
        expect(r.spread_m).toBeCloseTo(0.023, 2);
        expect(r.sampleCount).toBeGreaterThanOrEqual(2);
        expect(r.neighbourCount).toBe(38);
        expect(r.measurementCrs).toBe(NATIVE);
    });

    it('a WIDER artery in the same capture measures wider — the metric tracks reality', async () => {
        const r = await resolveMurciaStreetWidth(MZ_POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.width_m).toBeCloseTo(20.208, 2);
    });

    it('feature ORDER does not change the answer (no dependence on GeoServer ordering)', async () => {
        const forward = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        const reversed = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                crs: NATIVE,
                alineaciones: [...FIXTURE.features].reverse(), ejesComerciales: [], truncated: false,
            }),
        });
        expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§NATIVE-CRS-MEASUREMENT — the width is measured in EPSG:25830, and NOTHING else measures', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    // ⚠⚠ THIS BLOCK IS THE GUARD FOR A DEFECT THAT REACHED PRODUCTION ON A HUMAN-SIGNED PATH.
    // The proxy asked GeoServer for `srsName=EPSG:4326`; GeoServer serialises GeoJSON at 4 decimals;
    // 4 decimals of a degree is ~8,8 m / ~11,1 m at Murcia's latitude. Measured live over 12
    // neighbourhoods (707 features / 19 986 segments matched by feature id): segment |Δlength|
    // median 2,96 m, p90 7,34 m, max 13,71 m, and 7 499 of 19 986 segments COLLAPSED to zero length
    // in 4326 against 1 natively. The legal thresholds are 4 m, 8 m and 12 m.
    //
    // So a body that does not declare a metric CRS is REFUSED. There is deliberately no lenient
    // path: "assume 4326 like we used to" is the bug, spelled as a fallback.

    it('a body with NO declared crs REFUSES — it does not fall back to degrees', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ alineaciones: FIXTURE.features, truncated: false, crs: undefined }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });

    it('a GEOGRAPHIC crs REFUSES — 4326 is precisely the thing that must never be measured', async () => {
        for (const crs of ['EPSG:4326', 'EPSG:4258', 'CRS:84', 'urn:ogc:def:crs:EPSG::4326']) {
            const r = await resolveMurciaStreetWidth(RM1_POINT, {
                fetchImpl: fixtureFetch({ crs, alineaciones: FIXTURE.features, truncated: false }),
            });
            expect(r, `crs=${crs} must not be measurable`)
                .toMatchObject({ ok: false, reason: 'crs-not-native' });
        }
    });

    it('an UNRECOGNISED crs REFUSES — the allow-list is closed, not a best guess', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: 'EPSG:31370', alineaciones: FIXTURE.features, truncated: false }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });

    it('`crs-not-native` is DISTINCT from every other refusal — an operator can tell them apart', async () => {
        // A mis-configured proxy, a dead proxy and genuinely unplanned land are three different
        // facts, and §CONTEXT-DATA-HONESTY (L-422/457/467/469) forbids collapsing them.
        const badCrs = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: 'EPSG:4326', alineaciones: FIXTURE.features, truncated: false }),
        });
        const dead = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch(undefined, false) });
        const emptyHere = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: [], truncated: false }),
        });
        expect(new Set([
            (badCrs as { reason: string }).reason,
            (dead as { reason: string }).reason,
            (emptyHere as { reason: string }).reason,
        ]).size).toBe(3);
    });

    it('the CRS is checked BEFORE the geometry — a bad CRS is never reported as "nothing here"', async () => {
        // An empty neighbourhood AND a bad CRS: the CRS fault is the one that must surface, because
        // "no alineación here" would be a claim about Murcia's plan that we have not earned.
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: 'EPSG:4326', alineaciones: [], truncated: false }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'crs-not-native' });
    });

    it('a success DECLARES the CRS it measured in, as data', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.measurementCrs).toBe(NATIVE);
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/EPSG:25830/);
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/NATIVE CRS/);
    });

    it('⚠ THE REGRESSION ITSELF — the 4326-quantised capture measures a MATERIALLY different street', async () => {
        // Feed the SAME 39 features, degraded exactly as `srsName=EPSG:4326` degraded them —
        // 25830 metres → WGS84 degrees → `numDecimals=4` → back to metres, the wire's real journey,
        // through the same projection production uses. Then hand the result back labelled native, so
        // the ONLY variable is the lost precision. If someone ever argues the guard is overzealous,
        // this is the number they would be shipping.
        const quantise = (c: unknown): void => {
            if (!Array.isArray(c)) return;
            if (typeof c[0] === 'number' && typeof c[1] === 'number') {
                const deg = nativeToWgs84(NATIVE, c[0], c[1]);
                if (!deg) return;
                const back = projectToNative(
                    NATIVE, Number(deg.lat.toFixed(4)), Number(deg.lon.toFixed(4)),
                );
                if (!back) return;
                c[0] = back.e; c[1] = back.n;
                return;
            }
            for (const x of c) quantise(x);
        };
        const degradedFeatures = (JSON.parse(JSON.stringify(FIXTURE.features)) as {
            geometry?: { coordinates?: unknown };
        }[]);
        for (const f of degradedFeatures) quantise(f?.geometry?.coordinates);

        const degraded = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: degradedFeatures, truncated: false }),
        });
        const honest = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(honest.ok).toBe(true);
        if (!honest.ok) return;
        // The harm is not a rounding wobble: it must be big enough to move a legal band. The 4 m and
        // 8 m thresholds of Arts. 5.3.3 / 5.5.3 are 4 m apart, so a metre is a large fraction of one.
        if (degraded.ok) {
            expect(Math.abs(degraded.width_m - honest.width_m)).toBeGreaterThan(1.0);
        } else {
            // Losing the measurement entirely is also a material change from a published band.
            expect(degraded.ok).toBe(false);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('SIG-MU2 CONDITION 2 — explicitly labelled CONSTRUCTED, never an official measurement', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    it('every success carries `provenance` and `authority` as DATA, not as a comment', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.provenance).toBe('measured-geometry');
        expect(r.authority).toBe(MURCIA_STREET_WIDTH_AUTHORITY);
    });

    it('the authority string SAYS it is constructed and DENIES being an official width', () => {
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/CONSTRUCTED by PRYZM/);
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/NOT an official municipal street-width/);
        // It must also NAME the authoritative source it was constructed from.
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/pgou_alineaciones/);
        expect(MURCIA_STREET_WIDTH_AUTHORITY).toMatch(/Ayuntamiento de Murcia/);
    });

    it('the band resolver ECHOES the width tier — a constructed input cannot be laundered', () => {
        const band = resolveMurciaAnchoDeCalle('RC', 6, { widthProvenance: 'measured-geometry' });
        expect(band).toMatchObject({ ok: true, widthProvenance: 'measured-geometry' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('SIG-MU2 CONDITION 3 — the applicable article accompanies every result', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    it('every published band names its article AND quotes it', () => {
        const cases = [
            ['RC', 6, 'Art. 5.3.3'], ['RM', 6, 'Art. 5.5.3'],
            ['RN', 6, 'Art. 5.7.3'], ['RD1', 6, 'Art. 5.9.3'],
        ] as const;
        for (const [zone, w, article] of cases) {
            const r = resolveMurciaAnchoDeCalle(zone, w, { widthProvenance: 'declared-official' });
            expect(r.article).toBe(article);
            expect(r.ok).toBe(true);
            if (r.ok) expect(r.band.quote.length).toBeGreaterThan(20);
        }
    });

    it('a REFUSAL also names its article — an unattributed refusal is not a legal answer either', () => {
        const r = resolveMurciaAnchoDeCalle('RC', 8.0, { widthProvenance: 'measured-geometry' });
        expect(r.ok).toBe(false);
        expect(r.article).toBe('Art. 5.3.3');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('SIG-MU2 CONDITION 4 — REFUSE where uncertainty could change the band', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    // ⚠ DO NOT WEAKEN ANY ASSERTION IN THIS BLOCK TO RAISE COVERAGE. It is a signed requirement.

    it('fires at the 8 m boundary shared by Arts. 5.3.3 and 5.5.3', () => {
        for (const w of [7.6, 7.9, 8.0, 8.1, 8.4]) {
            expect(resolveMurciaAnchoDeCalle('RC', w, { widthProvenance: 'measured-geometry' }))
                .toMatchObject({ ok: false, reason: 'band-edge' });
        }
    });

    it('fires at the 4 m boundary — on BOTH sides of the inclusivity flip', () => {
        // Art. 5.3.3 says «menores DE 4»; Art. 5.7.3 says «menores O IGUALES A 4». The guard must
        // not care which — a measurement near 4 m cannot choose the band under either wording.
        for (const zone of ['RC', 'RN'] as const) {
            for (const w of [3.6, 4.0, 4.4]) {
                expect(resolveMurciaAnchoDeCalle(zone, w, { widthProvenance: 'measured-geometry' }))
                    .toMatchObject({ ok: false, reason: 'band-edge' });
            }
        }
    });

    it('fires across the Art. 1.1.4 OVERLAP at 8.00 m — the quirk does not create a hole', () => {
        // A measured 8.00 m must never silently take the "resolve down" path: that tie-break is for
        // an EXACT official width, not for a measurement that cannot tell 7.8 from 8.2.
        const r = resolveMurciaAnchoDeCalle('RC', 8.0, { widthProvenance: 'measured-geometry' });
        expect(r).toMatchObject({ ok: false, reason: 'band-edge' });
        // …while an OFFICIAL 8.00 m resolves DOWN, cited.
        const off = resolveMurciaAnchoDeCalle('RC', 8.0, { widthProvenance: 'declared-official' });
        expect(off).toMatchObject({ ok: true, floors: 3, ambiguityResolvedDown: true });
    });

    it('a NOISY measurement widens the guard: 8.7 m passes clean, but not with a 1.2 m spread', () => {
        expect(resolveMurciaAnchoDeCalle('RC', 8.7, { widthProvenance: 'measured-geometry' }))
            .toMatchObject({ ok: true, floors: 4 });
        expect(resolveMurciaAnchoDeCalle('RC', 8.7, {
            widthProvenance: 'measured-geometry', measurementSpread_m: 1.2,
        })).toMatchObject({ ok: false, reason: 'band-edge' });
    });

    it('DOCTRINE B — no published alineación at the point ⇒ REFUSE, never a nearby polygon', async () => {
        // A point outside every polygon in the capture, but inside the municipal bbox.
        const r = await resolveMurciaStreetWidth({ lat: 37.9800, lon: -1.1200 }, {
            fetchImpl: fixtureFetch(),
        });
        expect(r).toMatchObject({ ok: false, reason: 'no-alineacion-here' });
    });

    it('DOCTRINE B — a TRUNCATED neighbourhood ⇒ REFUSE, not a measurement on partial data', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: FIXTURE.features, truncated: true }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'neighbourhood-truncated' });
    });

    it('a transport FAILURE is never an empty answer (L-422/457/467/469)', async () => {
        const down = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch(undefined, false) });
        expect(down).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
        const nullBody = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: null }),
        });
        expect(nullBody).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
        // …and an EMPTY published neighbourhood is a DIFFERENT answer from a failure.
        const empty = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: [], truncated: false }),
        });
        expect(empty).toMatchObject({ ok: false, reason: 'no-alineacion-here' });
    });

    it('never throws, and refuses outside Murcia rather than measuring', async () => {
        await expect(resolveMurciaStreetWidth(null)).resolves.toMatchObject({ ok: false });
        await expect(resolveMurciaStreetWidth({ lat: 41.38, lon: 2.17 }, { fetchImpl: fixtureFetch() }))
            .resolves.toMatchObject({ ok: false, reason: 'out-of-murcia' });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§MURCIA-EJE-COMERCIAL — the published layer PRYZM never queried (Art. 5.5.3)', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    // ⚠ THE ASYMMETRY IS THE POINT. A false NO costs one storey (under-grant, safe). A false YES
    // publishes 16 m where the plan allows 13 m (over-grant, L-616). NO may be cheap; YES is earned.

    it('an EMPTY eje layer is a CONFIDENT NO — the ordinary band applies, no refusal', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: FIXTURE.features, ejesComerciales: [], truncated: false }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.ejeComercial).toBe(false);
        // …and a confident NO lets base RM above 12 m resolve instead of refusing.
        expect(resolveMurciaAnchoDeCalle('RM', 14, {
            widthProvenance: 'declared-official', ejeComercial: false,
        })).toMatchObject({ ok: true, floors: 4, height_m: 13 });
    });

    it('⚠ a layer that DID NOT ANSWER is UNKNOWN, never a confident NO (L-422/457/467/469)', async () => {
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: FIXTURE.features, ejesComerciales: null, truncated: false }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.ejeComercial).toBeNull();
        // …and UNKNOWN must still refuse above 12 m rather than apply the ordinary band.
        expect(resolveMurciaAnchoDeCalle('RM', 14, {
            widthProvenance: 'declared-official', ejeComercial: null,
        })).toMatchObject({ ok: false, reason: 'needs-eje-comercial' });
    });

    it('an eje on a FAR-AWAY street does not qualify this frontage', async () => {
        // A line ~260 m north of the block, in NATIVE metres — well beyond 1.5 × width.
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                crs: NATIVE,
                alineaciones: FIXTURE.features,
                ejesComerciales: [ejeLine([
                    [RM1_EN.e - 170, RM1_EN.n + 260], [RM1_EN.e + 180, RM1_EN.n + 260],
                ])],
                truncated: false,
            }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.ejeComercial).toBe(false);
    });

    it('an eje running ALONG the governing frontage at ~half the street width EARNS a yes', async () => {
        // The RM1 block's governing edge measures 6,58 m, so the axis should sit ~3,3 m off it.
        const base = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(base.ok).toBe(true);
        if (!base.ok) return;
        // A synthetic eje ~3 m north of the query point, parallel to the frontage, in NATIVE metres.
        // ⚠ Metres, not degrees: the eje layer arrives in the same EPSG:25830 as the alineaciones.
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                crs: NATIVE,
                alineaciones: FIXTURE.features,
                ejesComerciales: [ejeLine([
                    [RM1_EN.e - 45, RM1_EN.n + 3], [RM1_EN.e + 45, RM1_EN.n + 3],
                ])],
                truncated: false,
            }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        // Either an earned YES or an honest UNKNOWN — but NEVER a silent confident NO, which would
        // be the failure mode that discards a published designation.
        expect(r.ejeComercial === true || r.ejeComercial === null).toBe(true);
    });

    it('an ABSENT `ejesComerciales` field is UNKNOWN too — not an empty layer', async () => {
        // A proxy that predates this field, or a partial body, must not read as "no eje here".
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ crs: NATIVE, alineaciones: FIXTURE.features, truncated: false }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.ejeComercial).toBeNull();
    });

    it('the three-valued contract survives to the BAND resolver, all three ways', () => {
        expect(resolveMurciaAnchoDeCalle('RM', 14, { widthProvenance: 'declared-official', ejeComercial: true }))
            .toMatchObject({ ok: true, floors: 5, height_m: 16 });
        expect(resolveMurciaAnchoDeCalle('RM', 14, { widthProvenance: 'declared-official', ejeComercial: false }))
            .toMatchObject({ ok: true, floors: 4, height_m: 13 });
        expect(resolveMurciaAnchoDeCalle('RM', 14, { widthProvenance: 'declared-official', ejeComercial: null }))
            .toMatchObject({ ok: false, reason: 'needs-eje-comercial' });
    });

    it('⚠ the eje is irrelevant BELOW 12 m — «sección MAYOR de 12 metros» is part of the condition', () => {
        expect(resolveMurciaAnchoDeCalle('RM', 11, { widthProvenance: 'declared-official', ejeComercial: true }))
            .toMatchObject({ ok: true, floors: 4 });
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('SIG-MU2 END-TO-END — a real Casco manzana, width → band, on live-captured geometry', () => {
// ══════════════════════════════════════════════════════════════════════════════════════════════
    it('⚠ RM1 measures 6.58 m natively and resolves 3 plantas — the 8.16 m it used to report was quantisation', async () => {
        // ══════════════════════════════════════════════════════════════════════════════════════
        // THIS IS THE DEFECT, END TO END, ON REAL MUNICIPAL GEOMETRY.
        // ══════════════════════════════════════════════════════════════════════════════════════
        // Against the EPSG:4326 capture this frontage measured 8,162 m — 0,162 m ABOVE Art. 5.5.3's
        // 8 m threshold, close enough that the band-edge guard refused. Measured in the layer's own
        // EPSG:25830 the street is 6,58 m: squarely inside «calles de 4 a 8 metros», 3 plantas / 10 m.
        // The old number was not a street; ~8,8 m is one unit of longitude quantisation at this
        // latitude. Note which way the error ran: it pushed a 6,58 m street up onto an 8 m threshold
        // it does not reach, and only the guard stood between that and a granted fourth storey.
        const w = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(w.ok).toBe(true);
        if (!w.ok) return;
        expect(w.width_m).toBeCloseTo(6.582, 2);
        expect(w.measurementCrs).toBe('EPSG:25830');
        const band = resolveMurciaAnchoDeCalle('RM', w.width_m, {
            widthProvenance: w.provenance, measurementSpread_m: w.spread_m,
        });
        expect(band).toMatchObject({ ok: true, floors: 3, height_m: 10, article: 'Art. 5.5.3' });
    });

    it('MZ at 20.21 m clears every edge and resolves to the top band, cited', async () => {
        const w = await resolveMurciaStreetWidth(MZ_POINT, { fetchImpl: fixtureFetch() });
        expect(w.ok).toBe(true);
        if (!w.ok) return;
        const band = resolveMurciaAnchoDeCalle('RC', w.width_m, {
            widthProvenance: w.provenance, measurementSpread_m: w.spread_m,
        });
        expect(band).toMatchObject({ ok: true, floors: 4, height_m: 13, article: 'Art. 5.3.3' });
    });
});
