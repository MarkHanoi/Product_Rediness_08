// §MURCIA-ANCHO-DE-CALLE — the PGOU street-width height tables.
//
// These bands are STEPS: one metre is a whole storey. So the tests that matter are the ones on the
// BOUNDARIES and on the REFUSALS, not the ones in the middle of a band.
//
// Source (filed, re-readable, byte-identical across both published consolidations):
// corpus/pdf/PGOU-MURCIA_TR-2012-12_vol11_normas-urbanisticas.pdf, Arts. 5.3.3 · 5.5.3 · 5.7.3 · 5.9.3.

import { describe, it, expect } from 'vitest';
import {
    resolveMurciaAnchoDeCalle,
    murciaAnchoResolvedPack,
    MURCIA_ANCHO_ZONE_CODES,
    MURCIA_RC_ANCHO_TABLE,
    MURCIA_RN_ANCHO_TABLE,
    MURCIA_RD1_ANCHO_TABLE,
    MURCIA_ANCHO_TABLES,
    MURCIA_ANCHO_FIELD_PROVENANCE,
} from '../src/rulepacks/esMurciaAnchoDeCalle.js';

/** An OFFICIAL width skips the band-edge guard — the only way to probe exact boundaries. */
const official = { widthProvenance: 'declared-official' } as const;

describe('§MURCIA-ANCHO-DE-CALLE — Art. 5.3.3 (RC)', () => {
    it('reproduces the three stated rows', () => {
        expect(resolveMurciaAnchoDeCalle('RC', 3, official)).toMatchObject({ ok: true, floors: 2, height_m: 7 });
        expect(resolveMurciaAnchoDeCalle('RC', 6, official)).toMatchObject({ ok: true, floors: 3, height_m: 10 });
        expect(resolveMurciaAnchoDeCalle('RC', 12, official)).toMatchObject({ ok: true, floors: 4, height_m: 13 });
    });

    it('⚠ «menores DE 4» — at exactly 4.00 m RC is 3 plantas, NOT 2', () => {
        // Art. 5.3.3's first row is strictly below 4; the second is "de 4 a 8", inclusive of 4.
        expect(resolveMurciaAnchoDeCalle('RC', 4, official)).toMatchObject({ ok: true, floors: 3 });
    });

    it('⭐ the ordinance OVERLAPS at exactly 8.00 m, and Art. 1.1.4 resolves it DOWN', () => {
        // "de 4 a 8 metros" and "de 8 metros o mayor ancho" both claim 8.00. Resolving UP would
        // publish a storey the plan declines to grant.
        const r = resolveMurciaAnchoDeCalle('RC', 8, official);
        expect(r).toMatchObject({ ok: true, floors: 3, height_m: 10, ambiguityResolvedDown: true });
        expect(r.ok && r.ambiguityRef).toMatch(/menor edificabilidad/);
    });

    it('just above the overlap the higher row governs cleanly, with no ambiguity flag', () => {
        const r = resolveMurciaAnchoDeCalle('RC', 8.6, official);
        expect(r).toMatchObject({ ok: true, floors: 4, height_m: 13, ambiguityResolvedDown: false });
        expect(r.ok && r.ambiguityRef).toBeNull();
    });
});

describe('§MURCIA-ANCHO-DE-CALLE — Art. 5.7.3 (RN): the OPPOSITE inclusivity at the same 4 m', () => {
    it('⚠ «menores O IGUALES a 4» — at exactly 4.00 m RN is 2 plantas, where RC is 3', () => {
        expect(resolveMurciaAnchoDeCalle('RN', 4, official)).toMatchObject({ ok: true, floors: 2, height_m: 7 });
        expect(resolveMurciaAnchoDeCalle('RC', 4, official)).toMatchObject({ ok: true, floors: 3, height_m: 10 });
    });

    it('the third storey is RECESSED 3 m — never reported as a third full floor', () => {
        const r = resolveMurciaAnchoDeCalle('RN', 6, official);
        expect(r).toMatchObject({ ok: true, floors: 3, height_m: 10, topStoreySetback_m: 3 });
    });

    it('the two rows PARTITION the axis — no width falls in a gap or in both', () => {
        for (const w of [0.5, 3.9, 4, 4.1, 12, 40]) {
            const matched = MURCIA_RN_ANCHO_TABLE.filter((b) =>
                (b.lo_m === null || (b.loInclusive ? w >= b.lo_m : w > b.lo_m)) &&
                (b.hi_m === null || (b.hiInclusive ? w <= b.hi_m : w < b.hi_m)));
            expect(matched).toHaveLength(1);
        }
    });
});

describe('§MURCIA-ANCHO-DE-CALLE — Art. 5.9.3 (RD1): an ALLOWANCE on top of the packed 2/7', () => {
    it('below 8 m it is the packed unconditional floor — 2 plantas / 7 m', () => {
        expect(resolveMurciaAnchoDeCalle('RD1', 6, official)).toMatchObject({ ok: true, floors: 2, height_m: 7 });
    });
    it('at 8 m or above the third storey appears, RECESSED 3 m', () => {
        expect(resolveMurciaAnchoDeCalle('RD1', 8, official))
            .toMatchObject({ ok: true, floors: 3, topStoreySetback_m: 3 });
    });
});

describe('§MURCIA-ANCHO-DE-CALLE — base RM needs a SECOND input above 12 m', () => {
    it('REFUSES `needs-eje-comercial` when the classification is unknown', () => {
        const r = resolveMurciaAnchoDeCalle('RM', 14, official);
        expect(r).toMatchObject({ ok: false, reason: 'needs-eje-comercial' });
        // Both candidate answers are surfaced so the card can say what it cannot decide between.
        expect(r.ok === false && r.straddles).toEqual([13, 16]);
    });
    it('grants 5 plantas / 16 m only when the Eje Comercial is AFFIRMED', () => {
        expect(resolveMurciaAnchoDeCalle('RM', 14, { ...official, ejeComercial: true }))
            .toMatchObject({ ok: true, floors: 5, height_m: 16 });
    });
    it('an explicit NO falls through to the ordinary table (4 plantas), not to a refusal', () => {
        expect(resolveMurciaAnchoDeCalle('RM', 14, { ...official, ejeComercial: false }))
            .toMatchObject({ ok: true, floors: 4, height_m: 13 });
    });
    it('below 12 m the Eje row cannot apply even when affirmed — «sección MAYOR de 12 metros»', () => {
        expect(resolveMurciaAnchoDeCalle('RM', 11, { ...official, ejeComercial: true }))
            .toMatchObject({ ok: true, floors: 4 });
    });
});

describe('§MURCIA-ANCHO-DE-CALLE — the guard, and the refusals that protect 8.81 pp of the city', () => {
    it('a MEASURED width sitting on a band edge REFUSES rather than choosing a storey', () => {
        const r = resolveMurciaAnchoDeCalle('RC', 8.0, { widthProvenance: 'measured-geometry' });
        expect(r).toMatchObject({ ok: false, reason: 'band-edge' });
        expect(r.ok === false && r.straddles.length).toBeGreaterThan(1);
    });

    it('§L-586 — a NOISY measurement widens the guard; it never narrows it', () => {
        // 8.7 m clears the default 0.5 m guard, but a 1.2 m spread reaches across the 8 m edge.
        expect(resolveMurciaAnchoDeCalle('RC', 8.7, { widthProvenance: 'measured-geometry' }))
            .toMatchObject({ ok: true, floors: 4 });
        expect(resolveMurciaAnchoDeCalle('RC', 8.7, {
            widthProvenance: 'measured-geometry', measurementSpread_m: 1.2,
        })).toMatchObject({ ok: false, reason: 'band-edge' });
        // A tight measurement must not RELAX the 0.5 m substitution allowance.
        expect(resolveMurciaAnchoDeCalle('RC', 8.2, {
            widthProvenance: 'measured-geometry', measurementSpread_m: 0.01,
        })).toMatchObject({ ok: false, reason: 'band-edge' });
    });

    it('an unusable width REFUSES — never a default, never the nearest band', () => {
        for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(resolveMurciaAnchoDeCalle('RC', bad, official)).toMatchObject({
                ok: false, reason: 'bad-input',
            });
        }
    });

    it('the WIDTH provenance is echoed, so a constructed input cannot be rendered as a stated one', () => {
        expect(resolveMurciaAnchoDeCalle('RC', 6, { widthProvenance: 'measured-geometry' }))
            .toMatchObject({ ok: true, widthProvenance: 'measured-geometry' });
        // ADR-0271: the TABLE's tier and the WIDTH's tier are different claims.
        expect(MURCIA_ANCHO_FIELD_PROVENANCE).toBe('ordinance-pdf');
    });
});

describe('§MURCIA-ANCHO-RESOLVED-PACK — the per-parcel pack, and the tier it may NOT exceed', () => {
    const resolved = resolveMurciaAnchoDeCalle('RC', 12, official);

    it('ADR-0285 — a signature on METHODOLOGY does not promote the tier: `estimated-ruleset`', () => {
        // This is the pin `packPublishedConfidenceUnchanged.test.ts` delegates here, because the
        // pack is built per-parcel by a function and has no module constant to freeze.
        expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        const pack = murciaAnchoResolvedPack('RC', resolved, 'test-authority');
        expect(pack.defaultConfidence).toBe('estimated-ruleset');
        // `authoritative` is UNREACHABLE for this ruleset (SIG-MU1) and is not pack-declarable.
        expect(pack.defaultConfidence).not.toBe('authoritative');
    });

    it('ADR-0286 — the pack carries LEGAL source, COMPUTATIONAL source and the article', () => {
        if (!resolved.ok) return;
        const ref = murciaAnchoResolvedPack('RC', resolved, 'AUTHORITY-MARKER-XYZ').zones[0]!.ordinanceRef!;
        expect(ref).toContain('Art. 5.3.3');                       // legal source
        expect(ref).toContain('Texto Refundido diciembre 2012');   // the instrument
        expect(ref).toContain('AUTHORITY-MARKER-XYZ');             // computational source, to the UI
        expect(ref).toContain('STREET WIDTH');
    });

    it('the geometry is the STATED alignment rule — 15 m fondo, no retranqueos', () => {
        if (!resolved.ok) return;
        const zone = murciaAnchoResolvedPack('RC', resolved, 'x').zones[0]!;
        expect(zone.geometricRule).toMatchObject({ kind: 'alignment', buildableDepth_m: 15 });
        expect(zone.setbacks).toMatchObject({ front_m: 0, side_m: 0 });
        expect(zone.maxHeight_m).toBe(13);
        expect(zone.maxFloors).toBe(4);
    });

    it('a RECESSED top storey is declared in the citation, so GFA is not over-extruded', () => {
        const rn = resolveMurciaAnchoDeCalle('RN', 6, official);
        expect(rn.ok).toBe(true);
        if (!rn.ok) return;
        const ref = murciaAnchoResolvedPack('RN', rn, 'x').zones[0]!.ordinanceRef!;
        expect(ref).toMatch(/set back 3 m/);
        expect(ref).toMatch(/NOT a full floor/);
    });

    it('⚠ RD1 is NOT dispatch-wired — it already publishes 2/7 and must not be intercepted', () => {
        expect([...MURCIA_ANCHO_ZONE_CODES].sort()).toEqual(['RC', 'RM', 'RN']);
        expect(MURCIA_ANCHO_ZONE_CODES).not.toContain('RD1');
    });
});

describe('§MURCIA-ANCHO-DE-CALLE — every band carries its article and its verbatim quote (INV-3)', () => {
    it('all four tables are registered with their governing article', () => {
        expect([...MURCIA_ANCHO_TABLES.keys()].sort()).toEqual(['RC', 'RD1', 'RM', 'RN']);
        expect(MURCIA_ANCHO_TABLES.get('RC')!.article).toBe('Art. 5.3.3');
        expect(MURCIA_ANCHO_TABLES.get('RM')!.article).toBe('Art. 5.5.3');
        expect(MURCIA_ANCHO_TABLES.get('RN')!.article).toBe('Art. 5.7.3');
        expect(MURCIA_ANCHO_TABLES.get('RD1')!.article).toBe('Art. 5.9.3');
    });

    it('no band is a bare number — each quotes the ordinance', () => {
        for (const t of [MURCIA_RC_ANCHO_TABLE, MURCIA_RN_ANCHO_TABLE, MURCIA_RD1_ANCHO_TABLE]) {
            for (const b of t) {
                expect(b.quote.length).toBeGreaterThan(20);
                expect(b.height_m).toBeGreaterThan(0);
                expect(b.floors).toBeGreaterThan(0);
            }
        }
    });

    it('the quotes state the SAME figures the bands encode — no transcription drift', () => {
        for (const b of MURCIA_RC_ANCHO_TABLE) {
            expect(b.quote).toContain(`${b.floors} plantas`);
            expect(b.quote).toContain(`${b.height_m} m`);
        }
    });
});
