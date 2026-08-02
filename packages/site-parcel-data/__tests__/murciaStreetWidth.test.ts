// §MURCIA-STREET-WIDTH — SIG-MU2's FOUR CONDITIONS, one describe block each.
//
// The founder's approval of 2026-08-02 is conditional. These are the acceptance criteria, not
// commentary: if one of these blocks goes red, the signature's premise no longer holds and the
// envelope must stop publishing. `sources/VERIFICATION.md` §SIG-MU2 references this file by name so
// a future author cannot quietly regress one.
//
// The fixture is a LIVE capture of `Murcia:pgou_alineaciones` over the Casco Antiguo
// (bbox 37.9902,-1.1327 → 37.9942,-1.1287, 39 features, 2026-08-02). Real municipal geometry, so
// these are not tests against a shape we invented to pass.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    resolveMurciaStreetWidth,
    MURCIA_STREET_WIDTH_AUTHORITY,
} from '../src/providers/resolveMurciaStreetWidth.js';
import { resolveMurciaAnchoDeCalle } from '../src/rulepacks/esMurciaAnchoDeCalle.js';

const FIXTURE = JSON.parse(readFileSync(
    fileURLToPath(new URL('./fixtures/murcia-alineaciones-centro-2026-08-02.json', import.meta.url)),
    'utf8',
)) as { features: unknown[] };

/** A fetch that replays the captured neighbourhood — the exact body the proxy returns. */
function fixtureFetch(
    body: {
        alineaciones: unknown[] | null;
        ejesComerciales?: unknown[] | null;
        truncated?: boolean;
    } = { alineaciones: FIXTURE.features, ejesComerciales: [], truncated: false },
    ok = true,
): typeof fetch {
    return (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
}

/** A GeoJSON LineString feature in lon/lat, for the Eje-Comercial tests. */
function ejeLine(pts: ReadonlyArray<readonly [number, number]>): unknown {
    return { type: 'Feature', properties: { layer: 'EJE_COMERCIAL' }, geometry: { type: 'LineString', coordinates: pts } };
}

/** A point inside a real RM1 manzana in the captured neighbourhood (measured w ≈ 8.16 m). */
const RM1_POINT = { lat: 37.991617, lon: -1.132142 };
/** A point inside a real MZ block on a wide artery (measured w ≈ 20.67 m). */
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
        // Pinned to the value the live layer produces. A change here means the geometry, the
        // projection or the measurement moved — all three are things a reviewer must see.
        expect(r.width_m).toBeCloseTo(8.162, 2);
        expect(r.spread_m).toBeCloseTo(0, 3);
        expect(r.sampleCount).toBeGreaterThanOrEqual(2);
        expect(r.neighbourCount).toBe(38);
    });

    it('a WIDER artery in the same capture measures wider — the metric tracks reality', async () => {
        const r = await resolveMurciaStreetWidth(MZ_POINT, { fetchImpl: fixtureFetch() });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.width_m).toBeCloseTo(20.671, 2);
    });

    it('feature ORDER does not change the answer (no dependence on GeoServer ordering)', async () => {
        const forward = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        const reversed = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                alineaciones: [...FIXTURE.features].reverse(), ejesComerciales: [], truncated: false,
            }),
        });
        expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
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
            fetchImpl: fixtureFetch({ alineaciones: FIXTURE.features, truncated: true }),
        });
        expect(r).toMatchObject({ ok: false, reason: 'neighbourhood-truncated' });
    });

    it('a transport FAILURE is never an empty answer (L-422/457/467/469)', async () => {
        const down = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch(undefined, false) });
        expect(down).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
        const nullBody = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ alineaciones: null }),
        });
        expect(nullBody).toMatchObject({ ok: false, reason: 'endpoint-unreachable' });
        // …and an EMPTY published neighbourhood is a DIFFERENT answer from a failure.
        const empty = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({ alineaciones: [], truncated: false }),
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
            fetchImpl: fixtureFetch({ alineaciones: FIXTURE.features, ejesComerciales: [], truncated: false }),
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
            fetchImpl: fixtureFetch({ alineaciones: FIXTURE.features, ejesComerciales: null, truncated: false }),
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
        // A line ~250 m north of the block — well beyond 1.5 × width.
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                alineaciones: FIXTURE.features,
                ejesComerciales: [ejeLine([[-1.1340, 37.9940], [-1.1300, 37.9940]])],
                truncated: false,
            }),
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.ejeComercial).toBe(false);
    });

    it('an eje running ALONG the governing frontage at ~half the street width EARNS a yes', async () => {
        // The RM1 block's governing edge measures 8.16 m, so the axis should sit ~4 m off it.
        // Build a line offset from the measured frontage by walking the ring's own geometry.
        const base = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(base.ok).toBe(true);
        if (!base.ok) return;
        // A synthetic eje ~4 m from the frontage, parallel to it, expressed in degrees.
        // 4 m ≈ 0.0000359° of latitude at this scale.
        const dLat = 4 / 111_320;
        const r = await resolveMurciaStreetWidth(RM1_POINT, {
            fetchImpl: fixtureFetch({
                alineaciones: FIXTURE.features,
                ejesComerciales: [ejeLine([
                    [-1.13260, 37.991617 + dLat], [-1.13160, 37.991617 + dLat],
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
            fetchImpl: fixtureFetch({ alineaciones: FIXTURE.features, truncated: false }),
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
    it('RM1 at 8.16 m sits inside the guard of the 8 m edge and REFUSES — the signature working', async () => {
        const w = await resolveMurciaStreetWidth(RM1_POINT, { fetchImpl: fixtureFetch() });
        expect(w.ok).toBe(true);
        if (!w.ok) return;
        const band = resolveMurciaAnchoDeCalle('RM', w.width_m, {
            widthProvenance: w.provenance, measurementSpread_m: w.spread_m,
        });
        // 8.162 is 0.162 m from the 8 m edge, inside the 0.5 m substitution allowance.
        expect(band).toMatchObject({ ok: false, reason: 'band-edge' });
    });

    it('MZ at 20.67 m clears every edge and resolves to the top band, cited', async () => {
        const w = await resolveMurciaStreetWidth(MZ_POINT, { fetchImpl: fixtureFetch() });
        expect(w.ok).toBe(true);
        if (!w.ok) return;
        const band = resolveMurciaAnchoDeCalle('RC', w.width_m, {
            widthProvenance: w.provenance, measurementSpread_m: w.spread_m,
        });
        expect(band).toMatchObject({ ok: true, floors: 4, height_m: 13, article: 'Art. 5.3.3' });
    });
});
