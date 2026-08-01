// §CATALUNYA (L-658) — the Catalonia-wide cited-refusal jurisdiction.
//
// WHAT THIS FILE PINS, AND WHY EACH PIN EXISTS
// --------------------------------------------
// 1. ROUTING EXCLUSIVITY over REAL coordinates. Barcelona must still resolve to
//    `es-08019-barcelona`, L'Hospitalet to `es-08101-hospitalet`, and Girona / Lleida / Tarragona
//    to `es-ct-catalunya` — never the reverse. The registry's own specificity test proves the RULE;
//    this proves the rule reaches the right verdict on the actual cities the feature is about.
// 2. The harmonised-taxonomy classifier, against the COMPLETE measured vocabulary.
// 3. THE HONESTY PROPERTIES, which are the whole reason this jurisdiction ships:
//      • no refusal ever carries a number;
//      • a FETCH FAILURE, a GENUINE EMPTY and a NOT-ATTEMPTED lookup produce three DIFFERENT
//        answers (§CONTEXT-DATA-HONESTY, L-422/457/467/469);
//      • an unconfirmed instrument is REPORTED and never CLAIMED to govern;
//      • a non-Catalan INE code gets NO Catalan citation (§CATALUNYA-SPILL).
//
// The coordinates are the ones the live MUC probe of 2026-07-31 actually resolved — see the
// measurement block in `esCatalunya.ts`.

import { describe, it, expect } from 'vitest';
import {
    CATALUNYA_JURISDICTION_ID,
    CATALUNYA_ENVELOPE_VERIFIED,
    MUC_HARMONISED_CLASSES,
    MUC_HARMONISED_TAXONOMY_REF,
    classifyMucHarmonisedCode,
    catalunyaNoRulePackRefusal,
    catalunyaRegistryRefusal,
    type CatalunyaRefusalInput,
} from '../src/rulepacks/esCatalunya.js';
import {
    CATALUNYA_BBOX,
    isInCatalunya,
    isCatalanIneCode,
} from '../src/providers/catalunyaBbox.js';
import {
    resolveRegisteredJurisdictionAt,
    resolveZoneDisposition,
    listJurisdictionCoverage,
    BCN_JURISDICTION_ID,
} from '../src/rulepacks/registry.js';
import { LHOSPITALET_JURISDICTION_ID } from '../src/rulepacks/esLHospitalet.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. ROUTING EXCLUSIVITY — real coordinates, both directions.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('§CATALUNYA — routing exclusivity over real Catalan coordinates', () => {
    /** [label, lat, lon, the jurisdiction that MUST win]. */
    const POINTS: ReadonlyArray<readonly [string, number, number, string]> = [
        // ── Municipal / metropolitan registrations must KEEP their own land. ──
        ['Barcelona — Passeig de Gràcia, Eixample', 41.3925, 2.164, BCN_JURISDICTION_ID],
        ['Barcelona — Poblenou (the founder parcel)', 41.404569, 2.208071, BCN_JURISDICTION_ID],
        ["L'Hospitalet de Llobregat — centre", 41.3593, 2.1004, LHOSPITALET_JURISDICTION_ID],
        // ── …and everywhere else in Catalonia must reach the regional answer. ──
        ['Girona — Barri Vell', 41.9847, 2.8249, CATALUNYA_JURISDICTION_ID],
        ['Lleida — centre', 41.6176, 0.62, CATALUNYA_JURISDICTION_ID],
        ['Tarragona — centre', 41.1189, 1.2445, CATALUNYA_JURISDICTION_ID],
        ['Vic (Osona) — a mid-size municipality', 41.9303, 2.2545, CATALUNYA_JURISDICTION_ID],
        ['Lladorre — rural Pallars Sobirà', 42.61, 1.29, CATALUNYA_JURISDICTION_ID],
        ['Sant Aniol de Finestres — rural Garrotxa', 42.116, 2.552, CATALUNYA_JURISDICTION_ID],
        ['Reus — Baix Camp', 41.1549, 1.1069, CATALUNYA_JURISDICTION_ID],
        ['Figueres — Alt Empordà', 42.2662, 2.9622, CATALUNYA_JURISDICTION_ID],
        ['Tortosa — Baix Ebre', 40.8126, 0.5211, CATALUNYA_JURISDICTION_ID],
    ];

    it.each(POINTS)('%s resolves to the right jurisdiction, unambiguously', (label, lat, lon, expected) => {
        const r = resolveRegisteredJurisdictionAt(lat, lon);
        expect(r.kind, label).toBe('resolved');
        if (r.kind !== 'resolved') return;
        expect(r.jurisdiction.jurisdictionId, label).toBe(expected);
    });

    it('Catalonia CLAIMS the Barcelona and L’Hospitalet points — so the RULE, not the box, decides', () => {
        // If it did not claim them, the exclusivity above would be a geometric accident rather than
        // a proof that the specificity ladder works. The whole design depends on the coarse claim
        // genuinely overlapping and genuinely losing.
        for (const [label, lat, lon, expected] of POINTS) {
            if (expected === CATALUNYA_JURISDICTION_ID) continue;
            expect(isInCatalunya(lat, lon), label).toBe(true);
        }
    });

    it('the Catalan cities do NOT resolve to Barcelona — the defect this registration prevents', () => {
        for (const [label, lat, lon, expected] of POINTS) {
            if (expected !== CATALUNYA_JURISDICTION_ID) continue;
            const r = resolveRegisteredJurisdictionAt(lat, lon);
            expect(r.kind, label).toBe('resolved');
            if (r.kind !== 'resolved') continue;
            expect(r.jurisdiction.jurisdictionId, label).not.toBe(BCN_JURISDICTION_ID);
            expect(r.jurisdiction.jurisdictionId, label).not.toBe(LHOSPITALET_JURISDICTION_ID);
        }
    });

    it('registers with EMPTY packs — Catalonia can never publish a number from this entry', () => {
        const cat = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === CATALUNYA_JURISDICTION_ID,
        );
        expect(cat, 'the catalunya registration must be present').toBeDefined();
        expect(cat!.packZoneCodes).toEqual([]);
        expect(cat!.extentResolution).toBe('regional');
        expect(CATALUNYA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('every Catalan zone code reaches a REFUSAL, never the estimated fallback', () => {
        // `'unregistered'` is what let a fabricated setback triple onto ~940 municipalities.
        for (const code of ['7', 'R2', '13a', 'SX1', 'clau-nobody-has-seen', '']) {
            const d = resolveZoneDisposition(CATALUNYA_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('refusal');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE HARMONISED TAXONOMY.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe('§CATALUNYA — the measured CODI_QUAL_MUC vocabulary', () => {
    it('carries exactly the 36 codes the complete 546 696-row scan found', () => {
        expect(MUC_HARMONISED_CLASSES).toHaveLength(36);
        const codes = MUC_HARMONISED_CLASSES.map((c) => c.code).sort();
        expect(codes).toEqual(
            [
                'A1', 'A2', 'A3',
                'D1', 'D2', 'D3', 'D4', 'D5',
                'M1', 'M2', 'M3',
                'N1', 'N2', 'N3', 'N4',
                'R1', 'R2', 'R3', 'R4', 'R5', 'R6',
                'SA', 'SC', 'SD', 'SE', 'SF', 'SH', 'SH0', 'SP', 'SS', 'ST', 'SV',
                'SX0', 'SX1', 'SX2', 'SX3',
            ].sort(),
        );
        // No duplicates — a duplicated code would silently shadow one disposition with another.
        expect(new Set(codes).size).toBe(36);
    });

    it('the measured polygon counts sum to the scanned total — the table is the measurement', () => {
        const total = MUC_HARMONISED_CLASSES.reduce((n, c) => n + c.measuredPolygons, 0);
        expect(total).toBe(546696);
    });

    it('every S… code is a system, and NO non-S code is', () => {
        // The discriminator `esBarcelonaZoneClassification.ts` measured across all of Barcelona
        // (S* = a system in 100 % of 1 014 resolved points) must hold statewide too.
        for (const c of MUC_HARMONISED_CLASSES) {
            expect(c.disposition === 'system', c.code).toBe(c.code.startsWith('S'));
        }
    });

    it('classifies the families the way the refusal path depends on', () => {
        expect(classifyMucHarmonisedCode('R2')?.disposition).toBe('zone');
        expect(classifyMucHarmonisedCode('A1')?.disposition).toBe('zone');
        expect(classifyMucHarmonisedCode('M1')?.disposition).toBe('zone');
        expect(classifyMucHarmonisedCode('D1')?.disposition).toBe('development');
        expect(classifyMucHarmonisedCode('N1')?.disposition).toBe('non-urbanisable');
        expect(classifyMucHarmonisedCode('N3')?.disposition).toBe('non-urbanisable');
        expect(classifyMucHarmonisedCode('SX2')?.disposition).toBe('system');
        expect(classifyMucHarmonisedCode('SV')?.disposition).toBe('system');
        // ⚠ N4 is deliberately NOT `non-urbanisable`: "Activitat autoritzada" is land carrying an
        // authorisation PRYZM does not hold, so refusing it as a legal "no" would deny a permission
        // that may well exist. It takes the COVERAGE refusal instead.
        expect(classifyMucHarmonisedCode('N4')?.disposition).toBe('zone');
    });

    it('is case- and whitespace-insensitive, and makes NO claim on unknown input', () => {
        expect(classifyMucHarmonisedCode(' sx2 ')?.code).toBe('SX2');
        for (const bad of [null, undefined, '', '   ', 'Q9', 'R99', '13a']) {
            expect(classifyMucHarmonisedCode(bad), String(bad)).toBeNull();
        }
    });

    it('an UNKNOWN S… code still classifies as a system — the one narrow fallback', () => {
        // The MUC is a living dataset. A 37th `S…` code must not fall through to "unknown" and let
        // a caller draw a setback triple on public domain.
        const c = classifyMucHarmonisedCode('SZ9');
        expect(c?.disposition).toBe('system');
        // …and no other prefix gets a fallback, because asserting a legal "no" on buildable land is
        // the worse error.
        expect(classifyMucHarmonisedCode('RZ9')).toBeNull();
        expect(classifyMucHarmonisedCode('NZ9')).toBeNull();
        expect(classifyMucHarmonisedCode('DZ9')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. THE REFUSAL — the honesty properties.
// ─────────────────────────────────────────────────────────────────────────────────────────────

const BASE: CatalunyaRefusalInput = {
    ineCode: '17079',
    municipalityName: 'Girona',
    harmonisedCode: 'R1',
    harmonisedLabel: 'Residencial, Nucli antic',
    municipalClau: '7',
    municipalClauLabel: 'Zona de protecció. Sant Narcís i Barri Vell',
    zoningLookup: 'resolved',
    instrumentLookup: 'resolved',
    governingInstrument: {
        expedient: '2001 / 001092 / G',
        tipus: "Pla General d'Ordenació Urbana Municipal (PGOU), revisió",
        filedUnderIne: '17079',
        rpucUrl:
            'http://dtes.gencat.cat/rpucportal/AppJava/cercaExpedient.do?reqCode=veureExpedient&codiPublic=2001/001092/G',
        confirmed: true,
    },
    knownFacts: ['Referència cadastral: 1234567CG8813N'],
};

const inp = (o: Partial<CatalunyaRefusalInput> = {}): CatalunyaRefusalInput => ({ ...BASE, ...o });

describe('§CATALUNYA — the refusal names the instrument and never publishes a number', () => {
    it('a Girona parcel is told the municipality, the qualification AND the governing plan', () => {
        const r = catalunyaNoRulePackRefusal(inp());
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false); // a statement about PRYZM's coverage, not the law
        expect(r.headline).toContain('Girona');
        expect(r.headline).toContain('17079');
        // the qualification it really resolved
        expect(r.detail).toContain('R1');
        expect(r.detail).toContain('Residencial, Nucli antic');
        // …and the instrument that actually governs, with its RPUC record
        expect(r.detail).toContain('2001 / 001092 / G');
        expect(r.detail).toContain('rpucportal');
        expect(r.detail).toContain("Registre de Planejament Urbanístic de Catalunya");
        // the parcel facts survive, so the card is never blank
        expect(r.knownFacts).toEqual(['Referència cadastral: 1234567CG8813N']);
    });

    it('NO refusal in ANY branch contains a buildable number', () => {
        const branches: CatalunyaRefusalInput[] = [
            inp(),
            inp({ harmonisedCode: 'SX2', harmonisedLabel: 'Sistemes, Viari' }),
            inp({ harmonisedCode: 'N3', harmonisedLabel: 'No urbanitzable, Protecció reglada' }),
            inp({ harmonisedCode: 'D1', harmonisedLabel: 'Urbanitzable' }),
            inp({ harmonisedCode: null, zoningLookup: 'no-qualification-at-point' }),
            inp({ zoningLookup: 'unresolved', instrumentLookup: 'unresolved', governingInstrument: null }),
            inp({ instrumentLookup: 'no-base-instrument-registered', governingInstrument: null }),
            inp({ instrumentLookup: 'not-attempted', governingInstrument: null }),
        ];
        // Units a buildable figure would have to wear. The expedient/INE digits are references, not
        // measurements, so the assertion targets UNITS rather than digits.
        const UNIT = /\b\d+([.,]\d+)?\s*(m²|m2|m\b|metres|metros|metres quadrats|%|storeys|plantes|floors)/i;
        for (const b of branches) {
            const r = catalunyaNoRulePackRefusal(b);
            expect(UNIT.test(r.headline), `headline: ${r.headline}`).toBe(false);
            expect(UNIT.test(r.detail), `detail for ${b.harmonisedCode}`).toBe(false);
        }
    });

    it('a *sistema* is a LEGALLY GROUNDED refusal, cited to the taxonomy and NOT to an article', () => {
        const r = catalunyaNoRulePackRefusal(inp({ harmonisedCode: 'SV', harmonisedLabel: 'Sistemes, Espais lliures públics' }));
        expect(r.code).toBe('public-system');
        expect(r.legallyGrounded).toBe(true);
        expect(r.ordinanceRef).toBe(MUC_HARMONISED_TAXONOMY_REF);
        // ⚠ It must SAY it is the weaker tier rather than imply article authority.
        expect(r.detail).toMatch(/weaker evidence tier/i);
        expect(r.detail).toMatch(/rather than.*article/i);
        // …and it must not invent an article number.
        expect(r.ordinanceRef).not.toMatch(/\bArt\.?\s*\d/i);
    });

    it('sòl no urbanitzable refuses the URBAN envelope WITHOUT claiming nothing may be built', () => {
        const r = catalunyaNoRulePackRefusal(inp({ harmonisedCode: 'N1', harmonisedLabel: 'No urbanitzable, Ordinari' }));
        expect(r.code).toBe('protected-soil');
        expect(r.legallyGrounded).toBe(true);
        // The over-claim this wording exists to avoid: Catalan SNU DOES admit exceptional building.
        expect(r.detail).toMatch(/does NOT mean nothing may ever be built/i);
        expect(r.detail).toMatch(/exceptional/i);
    });

    it('urbanitzable names the derived plan WITHOUT borrowing the `derived-plan` legal tier', () => {
        const r = catalunyaNoRulePackRefusal(inp({ harmonisedCode: 'D1', harmonisedLabel: 'Urbanitzable' }));
        // ⚠ NOT `derived-plan`: that code is legallyGrounded=true and is reserved for where a
        // TRANSCRIBED article says so (Murcia's PGOU 6.6.2). PRYZM has transcribed no Catalan
        // article saying it, so claiming that tier would be an unsourced legal claim (L-526).
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toMatch(/pla parcial/i);
    });
});

describe('§CONTEXT-DATA-HONESTY — failure, absence and not-asked are THREE different answers', () => {
    it('a double OUTAGE degrades to a weaker CITED refusal — never silence, never a number', () => {
        const r = catalunyaNoRulePackRefusal(
            inp({ zoningLookup: 'unresolved', instrumentLookup: 'unresolved', governingInstrument: null, harmonisedCode: null }),
        );
        expect(r.code).toBe('source-data-unavailable'); // the ONLY code that earns a retry (L-574)
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toMatch(/TRANSIENT FAILURE/i);
        // ⚠ It must NOT be readable as "your land is unzoned" or "no plan governs it".
        expect(r.detail).toMatch(/not a statement that your land is unzoned/i);
        expect(r.detail.length).toBeGreaterThan(200); // cited prose, not a blank
    });

    it('a genuine EMPTY says the service ANSWERED — and never wears the retry code', () => {
        const r = catalunyaNoRulePackRefusal(
            inp({ zoningLookup: 'no-qualification-at-point', harmonisedCode: null, harmonisedLabel: null, municipalClau: null, municipalClauLabel: null }),
        );
        expect(r.code).not.toBe('source-data-unavailable');
        expect(r.detail).toMatch(/answered for this point/i);
        expect(r.detail).toMatch(/genuine absence — not a failure/i);
    });

    it('a FAILED instrument lookup and a NOT-ATTEMPTED one produce different prose', () => {
        const failed = catalunyaNoRulePackRefusal(inp({ instrumentLookup: 'unresolved', governingInstrument: null }));
        const notAsked = catalunyaNoRulePackRefusal(inp({ instrumentLookup: 'not-attempted', governingInstrument: null }));
        expect(failed.detail).toMatch(/the query\s+FAILED/i);
        expect(notAsked.detail).toMatch(/it did not look/i);
        expect(failed.detail).not.toBe(notAsked.detail);
        // ⚠ Neither may assert a query that did not happen, and neither may guess a plan name.
        expect(notAsked.detail).not.toMatch(/FAILED/);
        for (const r of [failed, notAsked]) {
            expect(r.detail).toMatch(/will not guess a plan name/i);
        }
    });

    it('“the register has no base instrument” is a real fact, distinct from a failure', () => {
        // Barcelona's own case: the PGM-1976 predates the register, so the register genuinely
        // lists no base instrument. That must not read as an outage.
        const r = catalunyaNoRulePackRefusal(
            inp({ ineCode: '08019', municipalityName: 'Barcelona', instrumentLookup: 'no-base-instrument-registered', governingInstrument: null }),
        );
        expect(r.code).not.toBe('source-data-unavailable');
        expect(r.detail).toMatch(/answered for this point and lists no BASE/i);
        expect(r.detail).toMatch(/predates the register/i);
        // ⚠ IT MUST NOT HARDEN AN ABSENCE INTO A CLAIM. "Not located" is not "does not exist":
        // these municipalities certainly have a governing instrument, and the copy says so.
        expect(r.detail).toMatch(/An instrument certainly governs this land/i);
        // …and it must scope the absence honestly rather than implying it is arbitrary.
        expect(r.detail).toContain('73');
    });

    it('quotes the BASE-instrument figure (874), never the misleading any-expedient one (935)', () => {
        // ⚠ 935 municipalities have ≥1 expedient, but 7 119 of the 8 396 rows are *modificacions*.
        // Only 874 have a BASE general-plan instrument — measured through the SHIPPED classifier.
        // Quoting 935 as "we can name the governing plan" would overstate coverage by 61
        // municipalities, which is the kind of quiet over-claim C58 §1.4 exists to stop.
        const r = catalunyaNoRulePackRefusal(inp({ instrumentLookup: 'not-attempted', governingInstrument: null }));
        expect(r.detail).toContain('874');
        expect(r.detail).not.toContain('935');
    });
});

describe('§CATALUNYA — an UNCONFIRMED instrument is reported, never attributed', () => {
    it('a containing plan filed under another municipality is not claimed to govern', () => {
        const r = catalunyaNoRulePackRefusal(
            inp({
                ineCode: '08019',
                municipalityName: 'Barcelona',
                governingInstrument: {
                    expedient: '1985 / 000604 / B',
                    tipus: "Pla General d'Ordenació Urbana (PGOU)",
                    filedUnderIne: '08015', // Badalona — the measured metropolitan-filing case
                    rpucUrl: null,
                    confirmed: false,
                },
            }),
        );
        expect(r.detail).toMatch(/filed under a different municipality/i);
        expect(r.detail).toContain('08015');
        expect(r.detail).toMatch(/WITHOUT claiming it is this municipality’s general plan/i);
        // A CONFIRMED one, by contrast, states the attribution plainly.
        const confirmed = catalunyaNoRulePackRefusal(inp());
        expect(confirmed.detail).toMatch(/The instrument that governs this land is/i);
        expect(confirmed.detail).not.toMatch(/filed under a different municipality/i);
    });
});

describe('§CATALUNYA-SPILL — the rectangle over-claims; the CITATION does not', () => {
    it('the bbox really does claim Aragó, València, Andorra and France — stated, not hidden', () => {
        for (const [label, lat, lon] of [
            ['Fraga (Aragó, Franja de Ponent)', 41.5215, 0.3494],
            ['Vallibona (Castelló, Comunitat Valenciana)', 40.6119, 0.1289],
            ['Andorra la Vella', 42.5063, 1.5218],
            ['Perpignan (France, Pyrénées-Orientales)', 42.6886, 2.8948],
        ] as const) {
            expect(isInCatalunya(lat, lon), label).toBe(true);
        }
    });

    it('records how far south the València spill actually reaches — measured, not assumed', () => {
        // A pleasant surprise worth pinning rather than leaving to be re-discovered: the box's
        // southern edge (40.51, the Generalitat's own declared extent for the Montsià) sits ABOVE
        // most of Castelló, so the Valencian spill is only the northernmost inland strip. Vinaròs,
        // the nearest Valencian coastal town, is NOT claimed. This bound is the reason the spill is
        // narrow; if a future edit widened `minLat` downward, this test is what would say so.
        expect(isInCatalunya(40.4695, 0.4756), 'Vinaròs (Castelló coast)').toBe(false);
        expect(isInCatalunya(39.9864, -0.0513), 'Castelló de la Plana').toBe(false);
        expect(isInCatalunya(39.4699, -0.3763), 'València').toBe(false);
    });

    it('…and a NON-CATALAN INE code gets NO Catalan citation', () => {
        for (const ine of ['22140' /* Huesca */, '12138' /* Castelló */, '50297' /* Zaragoza */, '28079' /* Madrid */]) {
            const r = catalunyaNoRulePackRefusal(inp({ ineCode: ine, municipalityName: null }));
            expect(r.ordinanceRef, ine).toBeNull();
            expect(r.legallyGrounded, ine).toBe(false);
            expect(r.headline, ine).toMatch(/not in Catalonia/i);
            expect(r.detail, ine).toContain(ine);
            // ⚠ It must not cite the Catalan taxonomy or name a Catalan instrument.
            expect(r.detail, ine).not.toMatch(/Mapa Urbanístic de Catalunya/);
            expect(r.detail, ine).not.toMatch(/POUM|Normes Subsidiàries/);
        }
    });

    it('the four Catalan province prefixes pass and nothing else does', () => {
        for (const ine of ['08019', '17079', '25120', '43148', '08237', '25913']) {
            expect(isCatalanIneCode(ine), ine).toBe(true);
        }
        for (const bad of ['28079', '30030', '22140', '', '8019', 'abcde', null, undefined, '080190']) {
            expect(isCatalanIneCode(bad as string | null | undefined), String(bad)).toBe(false);
        }
    });

    it('a NULL INE still answers — the gate rejects a WRONG code, not a missing one', () => {
        // Refusing to answer when the municipality is simply unknown would turn a coverage gap into
        // silence, which is the outcome this whole jurisdiction exists to remove.
        const r = catalunyaNoRulePackRefusal(inp({ ineCode: null, municipalityName: null }));
        expect(r.headline).not.toMatch(/not in Catalonia/i);
        expect(r.headline).toMatch(/this Catalan municipality/i);
    });

    it('the bbox is the Generalitat’s own declared extent, rounded outward', () => {
        // Provenance pin: `MUC:MUCVW_MUCS_TM` WGS84BoundingBox, read 2026-07-31.
        expect(CATALUNYA_BBOX.minLon).toBeLessThanOrEqual(0.0648625156759304);
        expect(CATALUNYA_BBOX.minLat).toBeLessThanOrEqual(40.514895988459564);
        expect(CATALUNYA_BBOX.maxLon).toBeGreaterThanOrEqual(3.3355094632058075);
        expect(CATALUNYA_BBOX.maxLat).toBeGreaterThanOrEqual(42.88423624702984);
        // …and outward-rounding must not be unbounded: never more than 0.01° of slack per edge.
        expect(0.0648625156759304 - CATALUNYA_BBOX.minLon).toBeLessThan(0.01);
        expect(CATALUNYA_BBOX.maxLat - 42.88423624702984).toBeLessThan(0.01);
    });
});

describe('§CATALUNYA — the registry path never asserts a fetch it did not make', () => {
    it('reports a handed zone code but declares BOTH lookups not-attempted, not failed', () => {
        const r = catalunyaRegistryRefusal('7', 'Zona de protecció', ['Àrea: 412 m²']);
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toContain('7');
        expect(r.detail).toMatch(/it did not look/i);
        // ⚠ THE POINT: it must NOT claim the Generalitat's services failed.
        expect(r.detail).not.toMatch(/the query\s+FAILED/i);
        expect(r.detail).not.toBe('');
        expect(r.knownFacts).toEqual(['Àrea: 412 m²']);
    });

    it('with no zone code at all it still returns cited prose, never an empty card', () => {
        const r = catalunyaRegistryRefusal(null, null, []);
        expect(r.detail.length).toBeGreaterThan(200);
        expect(r.detail).toMatch(/947/); // the roadmap line always states the real shape
    });
});
