// SWITZERLAND / City of Zürich — the BZO zone-parameter CATALOGUE + per-parcel REGIME resolution +
// the gated computed envelope.
//
// WHAT THESE TESTS GUARD
// ----------------------
//   1. the catalogue transcribes the founder-supplied BZO 700.100 values correctly, per regime
//      (W2bIII→0.45, Z5→2.00, Z6→2.30, Z7→2.60 in BOTH regimes);
//   2. the W2bIII height DISCREPANCY is preserved (8.5 m under BZO 91/99 vs 9.0 m under BZO 2016) —
//      the reason per-parcel regime resolution is soundness-critical;
//   3. regime resolution REFUSES `regime-ambiguous` when it cannot place the parcel, and never guesses;
//   4. the FAR (AZ) is regime-independent but the ENVELOPE (height) is not;
//   5. the GFA math is AZ × parcel area — but ONLY behind `CH_FAR_CERTIFIED`, which is OFF, so the
//      shipping output is the honest cited refusal, ENRICHED with the transcribed values.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    resolveZurichBzoRegime,
    resolveZurichBzoEnvelopeParams,
    classifyBzoRegimeFromDocText,
    extractOerebDocIds,
    zurichBzoZoneParams,
    zurichBzoFarFor,
    computeZurichBzoGfa,
    computeZurichBzoEnvelope,
    ZURICH_BZO_ZONE_CATALOGUE,
    ZURICH_BZO_REGIME_BY_DOC,
    ZURICH_ZH_FAR_CATALOGUE,
    CH_FAR_CERTIFIED,
    resolveChFarFromCantonCatalogue,
} from '../src/index.js';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
// Imported from the provider module directly (not the barrel) so the L-616 FAR-field helper is under
// test WITHOUT requiring an index.ts export change (index is the orchestrator's to add — out of scope).
import { zurichBzoStructuredFields } from '../src/providers/chZurichBzoCatalogue.js';

describe('Zürich BZO catalogue — the transcribed zone table (both regimes)', () => {
    it('W2bIII AZ is 0.45 in BOTH regimes', () => {
        expect(zurichBzoZoneParams('bzo_91_99', 'W2bIII')?.az).toBe(0.45);
        expect(zurichBzoZoneParams('bzo_2016', 'W2bIII')?.az).toBe(0.45);
    });

    it('the centre zones Z5/Z6/Z7 are 2.00 / 2.30 / 2.60 in BOTH regimes (cross-checked)', () => {
        for (const regime of ['bzo_91_99', 'bzo_2016'] as const) {
            expect(zurichBzoZoneParams(regime, 'Z5')?.az).toBe(2.0);
            expect(zurichBzoZoneParams(regime, 'Z6')?.az).toBe(2.3);
            expect(zurichBzoZoneParams(regime, 'Z7')?.az).toBe(2.6);
        }
    });

    it('the full 91/99 residential ladder transcribes correctly (AZ / VG / height)', () => {
        const c = ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99;
        expect(c.W2bI).toEqual({ az: 0.4, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 });
        expect(c.W2).toEqual({ az: 0.6, maxVollgeschosse: 2, maxGebaeudehoehe_m: 9.0 });
        expect(c.W3).toEqual({ az: 0.9, maxVollgeschosse: 3, maxGebaeudehoehe_m: 9.5 });
        expect(c.W4b).toEqual({ az: 1.05, maxVollgeschosse: 4, maxGebaeudehoehe_m: 12.5 });
        expect(c.W4).toEqual({ az: 1.2, maxVollgeschosse: 4, maxGebaeudehoehe_m: 12.5 });
        expect(c.W5).toEqual({ az: 1.65, maxVollgeschosse: 5, maxGebaeudehoehe_m: 15.5 });
        expect(c.W6).toEqual({ az: 2.05, maxVollgeschosse: 6, maxGebaeudehoehe_m: 18.5 });
    });

    it('Z5 carries its 3.5 m Grundgrenzabstand and W2bIII its 25% Überbauungsziffer (91/99)', () => {
        expect(ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99.Z5?.grundgrenzabstand_m).toBe(3.5);
        expect(ZURICH_BZO_ZONE_CATALOGUE.bzo_91_99.W2bIII?.ueberbauungsziffer).toBe(0.25);
    });

    it('bzo_2016 carries ONLY the cross-checked zones — the rest are NOT guessed', () => {
        expect(Object.keys(ZURICH_BZO_ZONE_CATALOGUE.bzo_2016).sort()).toEqual(['W2bIII', 'Z5', 'Z6', 'Z7']);
        // A zone that exists in 91/99 but was not cross-checked under 2016 is absent (not fabricated).
        expect(zurichBzoZoneParams('bzo_2016', 'W3')).toBeNull();
    });
});

describe('Zürich BZO — the W2bIII height DISCREPANCY (why regime resolution matters)', () => {
    it('W2bIII max Gebäudehöhe is 8.5 m under BZO 91/99 but 9.0 m under BZO 2016', () => {
        expect(zurichBzoZoneParams('bzo_91_99', 'W2bIII')?.maxGebaeudehoehe_m).toBe(8.5);
        expect(zurichBzoZoneParams('bzo_2016', 'W2bIII')?.maxGebaeudehoehe_m).toBe(9.0);
        // …and the AZ agrees, so it is the HEIGHT (not the FAR) that needs the regime.
        expect(zurichBzoZoneParams('bzo_91_99', 'W2bIII')?.az).toBe(
            zurichBzoZoneParams('bzo_2016', 'W2bIII')?.az,
        );
    });
});

describe('resolveZurichBzoRegime — determines the regime, else REFUSES (never guesses)', () => {
    it('an explicit, recognised plan-area tag resolves', () => {
        expect(resolveZurichBzoRegime({ planArea: 'bzo_2016' })).toEqual({ ok: true, regime: 'bzo_2016' });
        expect(resolveZurichBzoRegime({ planArea: '91/99' })).toEqual({ ok: true, regime: 'bzo_91_99' });
        expect(resolveZurichBzoRegime({ planArea: '1991/1999' })).toEqual({ ok: true, regime: 'bzo_91_99' });
    });

    it('a CLASSIFIED ordinance URL now resolves from the static crosswalk', () => {
        // docid 573 was classified bzo_91_99 from its own text (GRB 1815/1816 vom 24. November 1999).
        expect(resolveZurichBzoRegime({ rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=573' })).toEqual(
            { ok: true, regime: 'bzo_91_99' },
        );
        // docid 15172 was classified bzo_2016 (2024 Teilrevision Bau- und Zonenordnung «Harsplen»).
        expect(resolveZurichBzoRegime({ rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=15172' })).toEqual(
            { ok: true, regime: 'bzo_2016' },
        );
    });

    it('an EXCLUDED docid (6808 — image-only scan) → `regime-ambiguous` (never guessed)', () => {
        const res = resolveZurichBzoRegime({ rechtsvorschriftUrl: 'https://oerebdocs.zh.ch/getDoc?docid=6808' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('regime-ambiguous');
    });

    it('a multi-docid URL resolves on CONSENSUS, and refuses on conflict or an unclassified member', () => {
        // Two 91/99 docids ⇒ consensus 91/99.
        expect(
            resolveZurichBzoRegime({
                rechtsvorschriftUrl:
                    'https://oerebdocs.zh.ch/getDoc?docid=573; https://oerebdocs.zh.ch/getDoc?docid=610',
            }),
        ).toEqual({ ok: true, regime: 'bzo_91_99' });
        // 91/99 + 2016 ⇒ genuine conflict ⇒ refuse.
        const conflict = resolveZurichBzoRegime({
            rechtsvorschriftUrl:
                'https://oerebdocs.zh.ch/getDoc?docid=573; https://oerebdocs.zh.ch/getDoc?docid=15172',
        });
        expect(conflict.ok).toBe(false);
        if (!conflict.ok) expect(conflict.reason).toBe('regime-ambiguous');
        // 91/99 + an unclassified (6808) ⇒ cannot confirm ⇒ refuse.
        const withUnknown = resolveZurichBzoRegime({
            rechtsvorschriftUrl:
                'https://oerebdocs.zh.ch/getDoc?docid=573; https://oerebdocs.zh.ch/getDoc?docid=6808',
        });
        expect(withUnknown.ok).toBe(false);
        if (!withUnknown.ok) expect(withUnknown.reason).toBe('regime-ambiguous');
    });

    it('no signal at all → `regime-ambiguous`', () => {
        const res = resolveZurichBzoRegime({});
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('regime-ambiguous');
    });
});

describe('extractOerebDocIds — parses docid(s) from a rechtsvorschrift_url (single + multi)', () => {
    it('extracts a single docid', () => {
        expect(extractOerebDocIds('https://oerebdocs.zh.ch/getDoc?docid=573')).toEqual(['573']);
    });
    it('extracts multiple `; `-separated docids, deduplicated in order', () => {
        expect(
            extractOerebDocIds(
                'https://oerebdocs.zh.ch/getDoc?docid=573; https://oerebdocs.zh.ch/getDoc?docid=6808; https://oerebdocs.zh.ch/getDoc?docid=573',
            ),
        ).toEqual(['573', '6808']);
    });
    it('returns [] for a URL with no docid, null, or a non-string', () => {
        expect(extractOerebDocIds('https://example.org/no-docid-here')).toEqual([]);
        expect(extractOerebDocIds(null)).toEqual([]);
        expect(extractOerebDocIds(undefined)).toEqual([]);
    });
});

describe('classifyBzoRegimeFromDocText — reads the regime off a document’s own text (real markers)', () => {
    it('classifies BZO 91/99 from the GRB 1991/1999 festsetzung lineage', () => {
        expect(
            classifyBzoRegimeFromDocText(
                'Mit Beschlüssen Nrn. 1815 und 1816 vom 24. November 1999 hat der Gemeinderat der Stadt ' +
                    'Zürich die Teile I und II der Bau- und Zonenordnung 1999 (BZO 99) festgesetzt. GRB Nr. 1559 ' +
                    'vom 23. Oktober 1991.',
            ),
        ).toBe('bzo_91_99');
    });

    it('classifies BZO 91/99 from the consolidated-fassung self-label even when it cross-references BZO 2016', () => {
        // The real docid=16945 shape: it self-labels "BZO 91/99" AND mentions BZO 2016 + STRB for
        // grandfathered parcels. The self-label must WIN (never misread as 2016).
        expect(
            classifyBzoRegimeFromDocText(
                'Bau- und Zonenordnung (BZO 91/99) Gemeinderatsbeschluss vom 23. Oktober 1991 mit Änderungen ' +
                    'bis 20. März 2024. Diese Fassung (BZO 91/99) ist anwendbar auf Grundstücke, die von der ' +
                    'Inkraftsetzung der BZO 2016 ausgenommen sind (vgl. STRB Nr. 686/2018).',
            ),
        ).toBe('bzo_91_99');
    });

    it('classifies BZO 2016 from the 2016 fassung / a post-2016 Teilrevision + STRB chain', () => {
        expect(
            classifyBzoRegimeFromDocText(
                'Teilrevision Bau- und Zonenordnung, Zonenplanänderung «Harsplen» Zürich-Witikon. ' +
                    'Stadtratsbeschluss STRB Nr. 859/2024.',
            ),
        ).toBe('bzo_2016');
        expect(classifyBzoRegimeFromDocText('… festgesetzt gemäss BZO 2016 …')).toBe('bzo_2016');
    });

    it('returns null when there is NO clear marker (→ the caller must refuse `regime-ambiguous`)', () => {
        expect(classifyBzoRegimeFromDocText('Beschluss Nr. 4307 vom 8. Juni 2005, Erholungszone E1 Juchhof.')).toBeNull();
        expect(classifyBzoRegimeFromDocText('')).toBeNull();
        expect(classifyBzoRegimeFromDocText(null)).toBeNull();
        expect(classifyBzoRegimeFromDocText('   ')).toBeNull();
    });
});

describe('ZURICH_BZO_REGIME_BY_DOC — parity with the canonical bzo_regime_crosswalk.json artefact', () => {
    it('every classified docid in the JSON crosswalk is in the machine map with the same regime (and vice versa)', () => {
        const jsonPath = fileURLToPath(
            new URL(
                '../../../docs/04-reference/jurisdictions/ch/sources/bzo_regime_crosswalk.json',
                import.meta.url,
            ),
        );
        const artefact = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
            crosswalk: Array<{ docid: string; regime: string }>;
            excluded: Array<{ docid: string }>;
        };
        // Map ⊇ artefact classified rows, with matching regime.
        for (const row of artefact.crosswalk) {
            expect(ZURICH_BZO_REGIME_BY_DOC.get(row.docid)).toBe(row.regime);
        }
        // Map ⊆ artefact classified rows (no machine entry without provenance).
        const classified = new Set(artefact.crosswalk.map((r) => r.docid));
        for (const docid of ZURICH_BZO_REGIME_BY_DOC.keys()) expect(classified.has(docid)).toBe(true);
        expect(ZURICH_BZO_REGIME_BY_DOC.size).toBe(artefact.crosswalk.length);
        // Excluded docids are NOT in the runtime map (they refuse rather than guess).
        for (const row of artefact.excluded) expect(ZURICH_BZO_REGIME_BY_DOC.has(row.docid)).toBe(false);
    });
});

describe('resolveZurichBzoEnvelopeParams — regime-aware {zone, far, maxStoreys, maxHeight_m, …}', () => {
    it('with a known regime → the full params incl. the regime-correct height', () => {
        const a = resolveZurichBzoEnvelopeParams({ typ: 'W2bIII', planArea: 'bzo_91_99' });
        expect(a.ok).toBe(true);
        if (a.ok) {
            expect(a).toMatchObject({ zone: 'W2bIII', far: 0.45, maxStoreys: 2, maxHeight_m: 8.5, regime: 'bzo_91_99' });
            expect(a.legalSources[0]?.bzoVersion).toBe('1991/1999');
        }
        const b = resolveZurichBzoEnvelopeParams({ typ: 'W2bIII', planArea: 'bzo_2016' });
        if (b.ok) expect(b.maxHeight_m).toBe(9.0); // SAME zone, DIFFERENT regime → different height.
    });

    it('regime undetermined → `regime-ambiguous` (refuse, never a guessed height)', () => {
        const res = resolveZurichBzoEnvelopeParams({ typ: 'W2bIII' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('regime-ambiguous');
    });

    it('a zone not carried under the resolved regime → `not-in-regime`', () => {
        const res = resolveZurichBzoEnvelopeParams({ typ: 'W3', planArea: 'bzo_2016' });
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('not-in-regime');
    });
});

describe('Zürich BZO — FAR is regime-independent, the GFA math is AZ × area', () => {
    it('zurichBzoFarFor answers the AZ without a regime', () => {
        expect(zurichBzoFarFor('W2bIII')).toBe(0.45);
        expect(zurichBzoFarFor('Z7')).toBe(2.6);
        expect(zurichBzoFarFor('W3')).toBe(0.9); // 91/99-only zone still answers.
        expect(zurichBzoFarFor('nonsense')).toBeNull();
    });

    it('GFA = AZ × parcel area (and refuses non-positive / non-finite area)', () => {
        expect(computeZurichBzoGfa(0.45, 1000)).toBe(450); // 0.45 × 1000 m² = 450 m² GFA
        expect(computeZurichBzoGfa(2.6, 500)).toBe(1300);
        expect(computeZurichBzoGfa(0.45, 0)).toBeNull();
        expect(computeZurichBzoGfa(0.45, Number.NaN)).toBeNull();
    });

    it('the registered ZH FAR catalogue carries every 91/99 zone as an AZ row', () => {
        expect(ZURICH_ZH_FAR_CATALOGUE.get('W2bIII')).toMatchObject({ far: 0.45, farKind: 'AZ' });
        expect(ZURICH_ZH_FAR_CATALOGUE.get('Z6')).toMatchObject({ far: 2.3, farKind: 'AZ' });
    });
});

describe('L-616 — the Zürich AZ is emitted as `plotRatioFAR` (the ENGINE FAR-cap field)', () => {
    it('zurichBzoStructuredFields emits plotRatioFAR = AZ (the exact field farLimitedHeight_m reads)', () => {
        // W2bIII AZ 0.45; regime 91/99 → height 8.5 m; Vollgeschosse 2. The AZ MUST surface as
        // `plotRatioFAR` (not `far`/`az`) or the shared engine's maxFAR stays null → OVERSTATES-FAR.
        const s = zurichBzoStructuredFields({ typ: 'W2bIII', planArea: 'bzo_91_99' });
        expect(s).not.toBeNull();
        expect(s).toEqual({ plotRatioFAR: 0.45, maxHeight_m: 8.5, maxFloors: 2 });
        // The field name is literally `plotRatioFAR` — the key ZoningRulesEngine's resolveNumber reads.
        expect(Object.prototype.hasOwnProperty.call(s, 'plotRatioFAR')).toBe(true);
    });

    it('the regime-correct height rides with the FAR (Z7 under 2016 → AZ 2.6, 25 m, 7 storeys)', () => {
        const s = zurichBzoStructuredFields({ typ: 'Z7', planArea: 'bzo_2016' });
        expect(s).toEqual({ plotRatioFAR: 2.6, maxHeight_m: 25.0, maxFloors: 7 });
    });

    it('regime undetermined or unknown zone → null (never a guessed FAR/height)', () => {
        expect(zurichBzoStructuredFields({ typ: 'W2bIII' })).toBeNull(); // regime-ambiguous
        expect(zurichBzoStructuredFields({ typ: 'W3', planArea: 'bzo_2016' })).toBeNull(); // not-in-regime
        expect(zurichBzoStructuredFields({ typ: '' })).toBeNull();
    });
});

describe('CH_FAR_CERTIFIED is OFF — the honest refusal ships, enriched (never a fabricated number)', () => {
    it('the gate is OFF (a human flips it, not this agent)', () => {
        expect(CH_FAR_CERTIFIED).toBe(false);
    });

    it('resolveChFarFromCantonCatalogue short-circuits to `not-certified`, even for a real ZH zone', () => {
        const res = resolveChFarFromCantonCatalogue('W2bIII', 'ZH');
        expect(res.ok).toBe(false);
        if (!res.ok) expect(res.reason).toBe('not-certified');
    });

    it('computeZurichBzoEnvelope returns the cited refusal, ENRICHED with pending-cert reference values', () => {
        const out = computeZurichBzoEnvelope({
            typ: 'W2bIII',
            planArea: 'bzo_91_99',
            parcelAreaM2: 1000,
            extraFacts: ['Parcel area: 1000 m²'],
        });
        expect(out.computed).toBe(false);
        if (!out.computed) {
            expect(() => EnvelopeRefusalSchema.parse(out.refusal)).not.toThrow();
            expect(out.refusal.legallyGrounded).toBe(false);
            const facts = out.refusal.knownFacts.join(' | ');
            // The transcribed AZ + height show as pending-cert reference values, clearly labelled.
            expect(facts).toContain('45%');
            expect(facts).toContain('pending certification');
            expect(facts).toContain('8.5 m'); // regime-correct height for 91/99
            expect(facts).toContain('Parcel area: 1000 m²');
            // …but NO computed envelope / GFA is asserted.
            expect(out).not.toHaveProperty('envelope');
        }
    });

    it('with regime undetermined, the refusal surfaces the height AMBIGUITY (both regime values)', () => {
        const out = computeZurichBzoEnvelope({ typ: 'W2bIII', parcelAreaM2: 1000 });
        expect(out.computed).toBe(false);
        if (!out.computed) {
            const facts = out.refusal.knownFacts.join(' | ');
            expect(facts).toContain('8.5 m (BZO 91/99)');
            expect(facts).toContain('9 m (BZO 2016)');
        }
    });
});
