// §L-586 — the *ample oficial* lookup, and the two ways it can be wrong.
//
// This lookup is tier 1–2 of the *amplada de vial* ladder, so whatever it returns becomes a
// building height with a `curated-cerda-nominal` badge on it. There are exactly two failure modes
// and they are NOT symmetric:
//
//   • MISSING a street costs an absent height — safe, and the module header says an unlisted street
//     is a correct outcome. But it was happening SILENTLY to the four highest-value entries in the
//     table, because the only address source in the system (Catastro `ldt`) writes a street type as
//     a CODE (`PS`, `RB`, `GV`) while those entries are keyed on the type WORD (`PASSEIG`,
//     `RAMBLA`, `GRAN VIA`). Dead data reads exactly like a deliberate omission.
//   • ANSWERING THE WRONG STREET costs a wrong building. `GRACIA` is not a street: `PS GRACIA` is
//     Passeig de Gràcia (~60 m) and `TR GRACIA` is Travessera de Gràcia. Any fix that keys the
//     Passeig on the bare name hands its width to the Travessera.
//
// So the assertions below pin BOTH: the four arteries must now resolve from their real live
// Catastro strings, and a different type code on the same bare name must still miss.

import { describe, it, expect } from 'vitest';
import {
    officialStreetWidthForAddress,
    parseCatastroAddress,
    streetNameFromCatastroAddress,
    normaliseStreetName,
    BCN_OFFICIAL_STREET_WIDTHS,
    BCN_OFFICIAL_STREET_WIDTH_ALIASES,
} from '../src/rulepacks/bcnOfficialStreetWidths.js';

describe('§L-586 — Catastro `ldt` parsing keeps the street TYPE CODE', () => {
    it.each([
        ['CL PAU CLARIS 174 BARCELONA (BARCELONA)', 'CL', 'PAU CLARIS'],
        ['PS GRACIA 67 BARCELONA (BARCELONA)', 'PS', 'GRACIA'],
        ['RB CATALUNYA 43 BARCELONA (BARCELONA)', 'RB', 'CATALUNYA'],
        ['GV CORTS CATALANES 748 BARCELONA (BARCELONA)', 'GV', 'CORTS CATALANES'],
        ['PJ PAULA FONT DE 14 BARCELONA (BARCELONA)', 'PJ', 'PAULA FONT'],
    ])('%s → type %s + street %s', (addr, typeCode, street) => {
        expect(parseCatastroAddress(addr)).toEqual({ typeCode, street });
    });

    it('keeps `streetNameFromCatastroAddress` behaviour unchanged for existing callers', () => {
        expect(streetNameFromCatastroAddress('CL PAU CLARIS 174 BARCELONA (BARCELONA)')).toBe(
            'PAU CLARIS',
        );
        expect(streetNameFromCatastroAddress('')).toBe('');
        expect(streetNameFromCatastroAddress(null as unknown as string)).toBe('');
    });
});

describe('§L-586 — the four arteries Catastro could never reach', () => {
    // All four strings are LIVE Catastro `Consulta_RCCOOR_Distancia` responses recorded by the
    // L-586 probe over 83 real Barcelona manzanas — not constructed examples.
    it.each([
        ['PS GRACIA 67 BARCELONA (BARCELONA)', 60],
        ['RB CATALUNYA 43 BARCELONA (BARCELONA)', 30],
        ['GV CORTS CATALANES 748 BARCELONA (BARCELONA)', 50],
    ])('%s resolves its declared width (%s m)', (addr, width) => {
        const r = officialStreetWidthForAddress(addr);
        expect(r, `${addr} must reach the allow-list`).not.toBeNull();
        expect(r!.width_m).toBe(width);
        // It is a CURATED nominal, never a surveyed figure — the badge must survive the alias hop.
        expect(r!.provenance).toBe('curated-cerda-nominal');
    });

    it('⚠ a DIFFERENT type code on the same bare name must NOT inherit the artery width', () => {
        // Travessera de Gràcia is a different street from Passeig de Gràcia. Keying the 60 m
        // figure on the bare name `GRACIA` would hand it the Passeig's width — a fabricated height
        // wearing a curated badge, which is the failure this whole module exists to prevent.
        expect(officialStreetWidthForAddress('TR GRACIA 100 BARCELONA (BARCELONA)')).toBeNull();
        expect(officialStreetWidthForAddress('CL GRACIA 10 BARCELONA (BARCELONA)')).toBeNull();
        // And the bare name must not have been added as a key by the back door.
        expect(BCN_OFFICIAL_STREET_WIDTHS.has('GRACIA')).toBe(false);
        expect(BCN_OFFICIAL_STREET_WIDTHS.has('CATALUNYA')).toBe(false);
        expect(BCN_OFFICIAL_STREET_WIDTHS.has('CORTS CATALANES')).toBe(false);
    });

    it('every alias points at an entry that actually exists', () => {
        // An alias to a missing entry is a silent null — the same invisible failure, relocated.
        for (const [alias, canonical] of BCN_OFFICIAL_STREET_WIDTH_ALIASES) {
            expect(BCN_OFFICIAL_STREET_WIDTHS.has(canonical), `${alias} → ${canonical}`).toBe(true);
        }
    });

    it('every alias key is TYPE-QUALIFIED — an unqualified alias would re-open the ambiguity', () => {
        for (const alias of BCN_OFFICIAL_STREET_WIDTH_ALIASES.keys()) {
            const [code, ...rest] = alias.split(' ');
            expect(code, alias).toMatch(/^[A-Z]{2,3}$/);
            expect(rest.length, alias).toBeGreaterThan(0);
        }
    });
});

describe('§L-586 — the allow-list stays an ALLOW-list', () => {
    it('an unlisted street still returns null rather than a default', () => {
        expect(officialStreetWidthForAddress('CL ENRIC GRANADOS 21 BARCELONA (BARCELONA)')).toBeNull();
        expect(officialStreetWidthForAddress('PJ PAULA FONT DE 14 BARCELONA (BARCELONA)')).toBeNull();
        expect(officialStreetWidthForAddress('')).toBeNull();
    });

    it('the bare-name path is untouched for the 20 m Cerdà grid', () => {
        const r = officialStreetWidthForAddress('CL PAU CLARIS 174 BARCELONA (BARCELONA)');
        expect(r!.width_m).toBe(20);
        // Particles go, the type WORD stays — which is exactly why an entry keyed `PASSEIG GRACIA`
        // needs the alias hop above to meet Catastro's `PS GRACIA`, and why the normaliser alone
        // was never going to close the gap.
        expect(normaliseStreetName("de Pau Claris")).toBe('PAU CLARIS');
        expect(normaliseStreetName('Carrer de Pau Claris')).toBe('CARRER PAU CLARIS');
    });

    it('is deterministic (C58 §1.1)', () => {
        const a = officialStreetWidthForAddress('PS GRACIA 67 BARCELONA (BARCELONA)');
        const b = officialStreetWidthForAddress('PS GRACIA 67 BARCELONA (BARCELONA)');
        expect(a).toEqual(b);
    });
});
