// Murcia (INE 30030) — the TRANSCRIBED PGOU pack (Normas Urbanísticas, TR diciembre 2012).
//
// These tests protect four things, in descending order of what it costs to get them wrong:
//
//   1. THE DELEGATION ORDER. Arts. 5.25.3.3 / 5.26.3.3 say a zonal code's scope inside a
//      delegating ámbito "se reduce a las condiciones de uso y tipología … pero no a los
//      parámetros definitorios de la altura o edificabilidad". So the remitted-ámbito gate must
//      fire BEFORE the pack. Getting this backwards publishes a general-plan number for land the
//      general plan expressly declines to order — which is exactly the "proxy PGOU" error a
//      competitor made on the founder's own parcel.
//   2. REACHABILITY. The pack must be reached by the SAME chain a real click walks
//      (resolveMurciaZoning → murciaEnvelopeDisposition), not merely by a direct import. If the
//      branch is deleted, these tests fail.
//   3. THE HONESTY GATE. `MURCIA_ENVELOPE_VERIFIED` is false, so a packed zone must still render
//      NO number — but its refusal must NAME its article, because "PRYZM holds no Murcia
//      ordinance" is now a false statement about our own coverage.
//   4. NULL ≠ 0. Every parameter classified `constructed` / `not-the-rule-kind` / `unknown` must
//      be null in the pack, never 0 and never a plausible-looking figure (C58 §1.7a, L-616).

import { describe, expect, it } from 'vitest';
import {
    ES_MURCIA_PGOU2012_PACK,
    MURCIA_CALIFICACION_CLASSIFICATION,
    MURCIA_NO_LIMIT_FINDINGS,
    MURCIA_PARCEL_SIZE_CONDITIONS,
    MURCIA_PGOU_BORM_REFERENCE,
    MURCIA_PGOU_SOURCE,
    murciaCalificacionClassification,
    resolveMurciaPgouZone,
} from '../src/rulepacks/esMurciaPgou2012.js';
import { MURCIA_ENVELOPE_VERIFIED, MURCIA_JURISDICTION_ID } from '../src/rulepacks/esMurciaEnvelope.js';
import { murciaEnvelopeDisposition } from '../src/providers/murciaZoningProvider.js';
import { resolveMurciaZoning } from '../src/providers/resolveMurciaZoning.js';

const ASOF = '2026-08-01';

/** A polygon that covers the query point — the §MURCIA-COVERS-POINT filter demands real geometry. */
const coveringSquare = (lat: number, lon: number) => ({
    type: 'Polygon',
    coordinates: [[
        [lon - 0.001, lat - 0.001], [lon + 0.001, lat - 0.001],
        [lon + 0.001, lat + 0.001], [lon - 0.001, lat + 0.001],
        [lon - 0.001, lat - 0.001],
    ]],
});

const PT = { lat: 37.9922, lon: -1.1307 } as const; // Murcia city centre

const calFeature = (calificacion: string, sector: string | null, descripcion = 'x') => ({
    type: 'Feature',
    properties: {
        calificacion, descripcion, uso_global: 'Residencial', sector,
        url: `${calificacion}.pdf`, f_inicial: '2012-12-01Z', f_fin: '2999-12-30Z',
    },
    geometry: coveringSquare(PT.lat, PT.lon),
});

const secFeature = (sector: string | null, clase = 'Urbano', categoria = 'Urbano Consolidado') => ({
    type: 'Feature',
    properties: {
        sector, clase_suelo: clase, categoria, uso_global: 'Residencial',
        pedania: 'Murcia', superficie: 1000, f_inicial: '2012-12-01Z', f_fin: '2999-12-30Z',
    },
    geometry: coveringSquare(PT.lat, PT.lon),
});

/** A fake proxy that answers with the given features. Same envelope shape the real proxy returns. */
const fakeProxy = (calificaciones: unknown[], sectores: unknown[]) =>
    (async () =>
        ({
            ok: true,
            json: async () => ({ calificaciones, sectores }),
        }) as unknown as Response) as unknown as typeof fetch;

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('Murcia PGOU TR-2012 pack — provenance and shape', () => {
    it('is registered to the Murcia jurisdiction id and cites the document it was read from', () => {
        expect(ES_MURCIA_PGOU2012_PACK.jurisdictionId).toBe(MURCIA_JURISDICTION_ID);
        expect(MURCIA_PGOU_SOURCE).toContain('Texto Refundido diciembre 2012');
        expect(MURCIA_PGOU_SOURCE).toContain('Ayuntamiento de Murcia');
    });

    it('does NOT claim a BORM approval reference it never located', () => {
        // A confident citation to an instrument we have not read is worse than none.
        expect(MURCIA_PGOU_BORM_REFERENCE).toBe('not-located-in-source');
    });

    it('gives every zone an ordinanceRef naming a Título 5 article and quoting the source', () => {
        expect(ES_MURCIA_PGOU2012_PACK.zones.length).toBeGreaterThan(0);
        for (const z of ES_MURCIA_PGOU2012_PACK.zones) {
            expect(z.ordinanceRef, `${z.code} has no citation`).toBeTruthy();
            expect(z.ordinanceRef, `${z.code} cites no article`).toMatch(/Art\. 5\.\d+\.\d+/);
            expect(z.ordinanceRef, `${z.code} does not name its source document`).toContain(
                'Texto Refundido diciembre 2012',
            );
            // Verbatim Spanish quotation marks — a citation with no quote is an assertion.
            expect(z.ordinanceRef, `${z.code} carries no verbatim quote`).toContain('«');
        }
    });

    it('NEVER borrows a Catalan article — Murcia is not routed through any AMB path', () => {
        const all = JSON.stringify(ES_MURCIA_PGOU2012_PACK);
        for (const foreign of ['242.2', '322.1', 'PGM', 'Barcelona', 'clau', 'edificabilitat']) {
            expect(all, `pack mentions ${foreign}`).not.toContain(foreign);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('Murcia PGOU TR-2012 pack — null is UNKNOWN, never 0, never a plausible number', () => {
    it('leaves every CONSTRUCTED or NOT-THE-RULE-KIND parameter null on the packed zones', () => {
        for (const cls of MURCIA_CALIFICACION_CLASSIFICATION) {
            if (!cls.packed) continue;
            const r = resolveMurciaPgouZone(cls.code);
            expect(r.ok, `${cls.code} is classified packed but resolves to no zone`).toBe(true);
            if (!r.ok) continue;
            const z = r.zone;
            if (cls.far !== 'stated') {
                expect(z.plotRatioFAR, `${cls.code} FAR is ${cls.far} but carries a number`).toBeNull();
            }
            if (cls.coverage !== 'stated') {
                expect(z.maxCoverage, `${cls.code} coverage is ${cls.coverage} but carries a number`).toBeNull();
            }
            if (cls.height !== 'stated') {
                expect(z.maxHeight_m, `${cls.code} height is ${cls.height} but carries a number`).toBeNull();
            }
        }
    });

    it('records "altura libre" as a NO-LIMIT FINDING with its quote, and encodes it as null', () => {
        const noLimit = new Set(MURCIA_NO_LIMIT_FINDINGS.map((f) => f.code));
        expect(noLimit).toEqual(new Set(['IC', 'IX', 'IG']));
        for (const f of MURCIA_NO_LIMIT_FINDINGS) {
            expect(f.quote.toLowerCase()).toContain('libre');
            expect(f.article).toMatch(/Art\. 5\.\d+\.\d+/);
            const r = resolveMurciaPgouZone(f.code);
            expect(r.ok).toBe(true);
            if (r.ok) {
                // ⚠ null, never a big number: "no limit" must not be clamped by a fabricated ceiling.
                expect(r.zone.maxHeight_m, `${f.code} encodes a height despite altura libre`).toBeNull();
                expect(r.zone.maxFloors).toBeNull();
            }
        }
    });

    it('keeps parcel-size-conditional rules OUT of the flat scalars, and records them', () => {
        const codes = new Set(MURCIA_PARCEL_SIZE_CONDITIONS.map((c) => c.code));
        expect(codes.has('RH')).toBe(true);
        expect(codes.has('RL')).toBe(true);
        for (const c of MURCIA_PARCEL_SIZE_CONDITIONS) {
            expect(c.quote.length).toBeGreaterThan(20);
            expect(c.article).toMatch(/Art\. 5\.\d+\.\d+/);
        }
        // RH's 20 % ocupación IS stated and packed; the 200 m² absolute cap is not expressible and
        // must not have been smuggled in as a coverage figure.
        const rh = resolveMurciaPgouZone('RH');
        expect(rh.ok).toBe(true);
        if (rh.ok) expect(rh.zone.maxCoverage).toBe(0.2);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('Murcia PGOU TR-2012 pack — what is packed and what is refused', () => {
    it('packs exactly the calificaciones classified packed:true, and no others', () => {
        const packedCodes = new Set(ES_MURCIA_PGOU2012_PACK.zones.map((z) => z.code));
        for (const cls of MURCIA_CALIFICACION_CLASSIFICATION) {
            expect(packedCodes.has(cls.code), `${cls.code} packed flag disagrees with the pack`)
                .toBe(cls.packed);
        }
    });

    it('REFUSES every zone whose height is a street-width table — no Murcia street-width source exists', () => {
        for (const code of ['RC', 'RM', 'RN']) {
            const cls = murciaCalificacionClassification(code);
            expect(cls?.height, `${code} should be CONSTRUCTED`).toBe('constructed');
            expect(resolveMurciaPgouZone(code).ok, `${code} must not be packed`).toBe(false);
        }
    });

    it('REFUSES MZ even though its height IS stated — a height with no footprint is not an envelope', () => {
        const cls = murciaCalificacionClassification('MZ');
        expect(cls?.height).toBe('stated');
        expect(cls?.far).toBe('constructed');   // 2,66 × (parcel + ½ street ≤10 m)
        expect(cls?.coverage).toBe('unknown');  // expressly delegated to an Estudio de Detalle
        expect(resolveMurciaPgouZone('MZ').ok).toBe(false);
    });

    it('REFUSES the existing-building-derived zones as NOT-THE-RULE-KIND, not as a gap', () => {
        for (const code of ['RB', 'RU', 'RT']) {
            const cls = murciaCalificacionClassification(code);
            expect(cls?.ruleKind, `${code}`).toBe('existing-building-derived');
            expect(resolveMurciaPgouZone(code).ok).toBe(false);
        }
    });

    it('packs the two named RM subzones but NOT the RM base zone', () => {
        expect(resolveMurciaPgouZone('RM1').ok).toBe(true);
        expect(resolveMurciaPgouZone('RM2').ok).toBe(true);
        expect(resolveMurciaPgouZone('RM').ok).toBe(false);
    });

    it('never guesses a zone for an unrecognised or generic calificación', () => {
        // The Arts. 6.2.2.4 / 6.5.1 generic codes, the Arts. 5.24.5/5.24.6 remitted codes, and a
        // one-off local variant that carries no allow-list entry.
        for (const code of ['RX', 'RJ', 'RS', 'UC', 'IP', 'TC', 'GP', 'AE', 'RR', 'TR', 'IR', 'GR', 'RB-Ch6', 'ZZZ']) {
            const r = resolveMurciaPgouZone(code);
            expect(r.ok, `${code} must not resolve to a zone`).toBe(false);
        }
        expect(resolveMurciaPgouZone(null).ok).toBe(false);
        expect(resolveMurciaPgouZone('   ').ok).toBe(false);
    });

    it('resolves only the explicitly allow-listed sub-variants', () => {
        const rf1 = resolveMurciaPgouZone('RF1');
        expect(rf1.ok).toBe(true);
        if (rf1.ok) expect(rf1.matchedCode).toBe('RF');
        const ixt = resolveMurciaPgouZone('IXt');
        expect(ixt.ok).toBe(true);
        if (ixt.ok) expect(ixt.matchedCode).toBe('IX');
    });

    it('gives alignment zones an alignment rule with a real profundidad edificable', () => {
        for (const code of ['MC', 'MG', 'RM1', 'RM2', 'RD1']) {
            const r = resolveMurciaPgouZone(code);
            expect(r.ok).toBe(true);
            if (!r.ok) continue;
            expect(r.zone.geometricRule?.kind, `${code} must be an alignment zone`).toBe('alignment');
            const gr = r.zone.geometricRule as { buildableDepth_m?: number } | null;
            // 15 m is the *profundidad edificable* every Murcia manzana-cerrada ordinance states.
            expect(gr?.buildableDepth_m, `${code} depth`).toBe(15);
        }
    });

    it('transcribes the stated scalars exactly as the articles write them', () => {
        const expectations: Record<string, Partial<{ h: number | null; f: number | null; far: number | null; cov: number | null }>> = {
            MC: { h: 16, f: 5 },
            MG: { h: 28, f: 9 },
            RM1: { h: 25, f: 8 },
            RM2: { h: 16, f: 5 },
            RD: { h: 7, f: 2, far: 1.3 },
            RF: { h: 7, f: 2, cov: 0.4 },
            RG: { h: 7, f: 2, cov: 0.3 },
            RH: { h: 7, f: 2, cov: 0.2 },
            RL: { h: 7, f: 2, far: 0.25 },
            IC: { far: 1.0, cov: 1.0 },
            IX: { far: 0.7, cov: 0.7 },
            IG: { far: 0.6, cov: 0.6 },
            AJ: { h: 7, f: 2, far: 0.4, cov: 0.3 },
        };
        for (const [code, e] of Object.entries(expectations)) {
            const r = resolveMurciaPgouZone(code);
            expect(r.ok, code).toBe(true);
            if (!r.ok) continue;
            if (e.h !== undefined) expect(r.zone.maxHeight_m, `${code} height`).toBe(e.h);
            if (e.f !== undefined) expect(r.zone.maxFloors, `${code} floors`).toBe(e.f);
            if (e.far !== undefined) expect(r.zone.plotRatioFAR, `${code} FAR`).toBe(e.far);
            if (e.cov !== undefined) expect(r.zone.maxCoverage, `${code} coverage`).toBe(e.cov);
        }
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('Murcia disposition — the pack is REACHABLE, and the delegation order holds', () => {
    it('reaches the pack branch for a PGOU-direct calificación and names its article', () => {
        // ⚠ THE BRANCH-REMOVAL TEST. Delete the `resolveMurciaPgouZone` block from
        // `murciaEnvelopeDisposition` and this fails: the refusal falls back to the generic
        // coverage text, which carries no `ordinanceRef` at all.
        const d = murciaEnvelopeDisposition(
            { calificacion: 'RM1', descripcion: 'Manzana Cerrada Tradicional', uso_global: 'Residencial', sector: 'U', url: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            { sector: 'U', clase_suelo: 'Urbano', categoria: 'Urbano Consolidado', uso_global: 'Residencial', pedania: 'Murcia', superficie: 800, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            ASOF,
        );
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.ordinanceRef).toContain('Art. 5.5.3');
        expect(d.refusal.ordinanceRef).toContain('Texto Refundido diciembre 2012');
        // The gate is CLOSED, so no number is published…
        expect(MURCIA_ENVELOPE_VERIFIED).toBe(false);
        expect(d.refusal.detail).toMatch(/SIGNATURE/i);
        // …and the refusal is a statement about OUR verification, not about the law.
        expect(d.refusal.legallyGrounded).toBe(false);
    });

    it('emits the ENVELOPE only when verification is injected true — the post-signature shape', () => {
        const d = murciaEnvelopeDisposition(
            { calificacion: 'RM1', descripcion: null, uso_global: null, sector: 'U', url: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            { sector: 'U', clase_suelo: 'Urbano', categoria: 'Urbano Consolidado', uso_global: null, pedania: null, superficie: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            ASOF,
            [],
            true,
        );
        expect(d.kind).toBe('envelope');
        if (d.kind !== 'envelope') return;
        expect(d.zone.code).toBe('RM1');
        expect(d.zone.maxHeight_m).toBe(25);
        expect(d.classification?.article).toBe('Art. 5.5.3');
        // ⚠ THE SAFETY INTERLOCK. The L5 dispatcher branches on `kind === 'refusal'` and reads
        // `.reason` off everything else. If the gate were opened before L5 learns this branch,
        // Murcia must degrade to a cited refusal — not fail to compile, and not silently render
        // nothing on a compliance surface. Dropping `reason` breaks the editor build.
        expect(typeof d.reason).toBe('string');
        expect(d.reason.length).toBeGreaterThan(0);
    });

    it('⚠ the REMITTED ámbito wins over the pack — Arts. 5.25.3.3 / 5.26.3.3', () => {
        // Same RM1 calificación, but inside a TA ámbito. The PGOU expressly declines to fix the
        // height/edificabilidad here, so the RM1 ordinance MUST NOT answer. Reordering the two
        // branches in the disposition breaks this test — which is the whole point of it.
        for (const ambito of ['TA-379', 'UA-030', 'UM-114', 'TM-201', 'UH-647']) {
            const d = murciaEnvelopeDisposition(
                { calificacion: 'RM1', descripcion: null, uso_global: null, sector: ambito, url: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
                { sector: ambito, clase_suelo: 'Urbanizable', categoria: 'Urbanizable Transitorio', uso_global: null, pedania: null, superficie: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
                ASOF,
            );
            expect(d.kind, ambito).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.code, ambito).toBe('derived-plan');
            expect(d.refusal.legallyGrounded, ambito).toBe(true);
            // And it must not have leaked an RM1 number into the prose.
            expect(d.refusal.detail).not.toContain('25 m');
        }
    });

    it("leaves the founder's own parcel a legally-grounded derived-plan refusal, as before", () => {
        // 3481104XH6038S — calificación RR, ámbito TA-379, inside Plan Parcial CR-5.
        // Transcribing the PGOU does NOT unlock it, and this test pins that.
        const d = murciaEnvelopeDisposition(
            { calificacion: 'RR', descripcion: 'Residencial, ordenación remitida al planeamiento anterior', uso_global: 'Residencial', sector: 'TA-379', url: 'RR.pdf', f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            { sector: 'TA-379', clase_suelo: 'Urbanizable', categoria: 'Urbanizable Transitorio', uso_global: 'Residencial', pedania: 'Churra', superficie: 935, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            ASOF,
        );
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.code).toBe('derived-plan');
        expect(d.refusal.legallyGrounded).toBe(true);
        expect(d.refusal.ordinanceRef).toContain('6.6.2');
    });

    it('keeps the generic coverage refusal for a calificación nobody has classified', () => {
        const d = murciaEnvelopeDisposition(
            { calificacion: 'RX', descripcion: 'Tipologías mixtas alineadas a vial (zona genérica)', uso_global: 'Residencial', sector: 'ZM-SV2', url: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            { sector: 'ZM-SV2', clase_suelo: 'Urbanizable', categoria: 'Urbanizable Sectorizado', uso_global: 'Residencial', pedania: null, superficie: null, f_inicial: '2012-12-01', f_fin: '2999-12-30' },
            ASOF,
        );
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.code).toBe('no-rule-pack');
        expect(d.refusal.ordinanceRef).toBeNull();
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════
describe('Murcia — the pack is reachable from the LIVE resolver chain, not just a direct import', () => {
    it('resolveMurciaZoning → murciaEnvelopeDisposition lands on the transcribed article', async () => {
        const res = await resolveMurciaZoning(PT, {
            fetchImpl: fakeProxy([calFeature('RD', 'U', 'Vivienda Unifamiliar Adosada')], [secFeature('U')]),
            asOf: ASOF,
        });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.records.calificacion?.calificacion).toBe('RD');

        const d = murciaEnvelopeDisposition(res.records.calificacion, res.records.sector, ASOF);
        expect(d.kind).toBe('refusal');
        if (d.kind !== 'refusal') return;
        expect(d.refusal.ordinanceRef).toContain('Art. 5.9.3');
        // ⚠ THE GATE-LEAK TEST. RD's FAR (1,3) and height (7 m / 2 plantas) ARE transcribed and
        // sit in the classification `note` — so it is one interpolation away from being published
        // in prose while the gate is shut. A gate you can read around is not a gate.
        const cls = murciaCalificacionClassification('RD');
        expect(cls?.note).toContain('1,3');           // the note really does carry the number…
        expect(d.refusal.detail).not.toContain(cls!.note); // …and the refusal really does not.
        for (const leak of ['1,3', '1.3', '7 m', '2 plantas', '3,5 m']) {
            expect(d.refusal.detail, `refusal leaked "${leak}"`).not.toContain(leak);
        }
    });

    it('a half-down proxy is still an unreachable-endpoint answer, not a silent "nothing here"', async () => {
        const res = await resolveMurciaZoning(PT, {
            fetchImpl: (async () =>
                ({ ok: true, json: async () => ({ calificaciones: null, sectores: [] }) }) as unknown as Response) as unknown as typeof fetch,
            asOf: ASOF,
        });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('endpoint-unreachable');
    });
});
