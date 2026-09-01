// LANE E1bc — THE MIGRATED BARCELONA `20a` PACK AS DATA (pilot, gate decision
// §F item 4 · verdict §G item 4: "Pilot = Barcelona pack es-08019 golden
// parity … the migrated rules must carry R1/R2/R5 from day one").
//
// The DATA lives in `esBarcelona20aAillada.decl.json` — a
// `DeclarativeRulePackDocument` (§DRAFT-RULEFORMAT schema seat), validated
// HERE at module load: a rule row that does not parse is a build error (the
// EE_SOURCES pattern). 10 zones · 66 scalar rules, each carrying:
//
//   R1 — the typed applicability value object: `basis` cites the document's
//        own MINTED plan record (`plan-es-08019-pgm-1976`) — every basis ref
//        resolves, per the companion contract; `rank` null (one instrument,
//        no ladder); `useScope` empty (rules are not use-conditioned);
//   R2 — `valueBasis` where a value-basis semantic genuinely exists:
//        plotRatioFAR `{scheme:'es-pgm-edificabilitat', code:'neta'}` (the
//        C63 denominator lesson — the index is per NET parcel area);
//        maxCoveragePercent `{scheme:'es-pgm-ocupacio-mesura',
//        code:'Art. 249.1'}` (coverage measured as the orthogonal projection
//        of the WHOLE volume, above or below grade, cossos sortints
//        included);
//   R3 — `validityBasis: 'legal'` on every rule, with the window's ground
//        named in the document `notes[]` (Arts. 342/343 → DOGC núm. 4277
//        publication 2004-12-10; Art. 340.1 → the curated 1976-07-14
//        effectiveDate, Art. 340 NOT being Barcelona-modified);
//   R5 — `normativeForce: null` on every rule — the source serves no force
//        flag; null is NOT an assertion of bindingness (the instrument-status
//        claim lives in `BCN_20A_DECL_INSTRUMENT_CONTEXT` below, cited).
//
// VERBATIM SPANS (`rase.requirement`) exist ONLY where the repo holds the
// quote — Art. 340.1's operative clause (claus/20a/CLAU.md) on the FAR rules,
// and the Art. 342.3 subzona-IVb exception sentence (bcn20aSubzones.ts, read
// from printed p. 180) on 20a/9b's height/floors rules. Every other value is
// a coordinate-read TABLE-CELL transcription (L-590/L-591) with no held
// requirement clause — those rules carry NO rase, and the evaluator resolves
// them on the article-addressed path with the gap NAMED
// ('no-verbatim-span-curated'), never with a fabricated quote.
//
// ⚠ SECOND COPY, DECLARED: during the migration this document and
// `bcn20aSubzones.ts` both state the numbers. That is what golden parity is
// FOR — `declarativeGoldenParity.test.ts` byte-compares the derived C58
// contract against `ES_BARCELONA_20A_AILLADA_PACK`, so a divergence fails
// loudly. The TS pack STAYS LIVE until parity holds at 100% and the founder
// retires it (EUROPE-IMPLEMENTATION-PLAN §E1b); nothing routes through this
// document in production yet.
//
// PURE: data + one schema parse at load. P5-consistent L2 leaf.

import {
    DeclarativeRulePackDocumentSchema,
    type DeclarativeRulePackDocument,
} from '@pryzm/schemas';
import type { DeclarativeInstrumentContext } from './evaluateDeclarative.js';
import rawDoc from './esBarcelona20aAillada.decl.json';

/**
 * The migrated document, schema-validated at module load — "a source row
 * that does not parse is a build error" (the EE_SOURCES discipline).
 */
export const ES_BARCELONA_20A_DECL_DOC: DeclarativeRulePackDocument =
    DeclarativeRulePackDocumentSchema.parse(rawDoc);

/**
 * The instrument context for this pack — country semantics AS DATA beside the
 * pack (the §9 adapter-boundary rule), in the attribution layer's own shapes.
 *
 * `legalStatus: 'binding'` / `legalStatusSource: 'metadata'`: the PGM-1976
 * NNUU consolidated refós is catalogued in force by the RPUC (Registre de
 * Planejament Urbanístic de Catalunya) / AMB Geoportal (NUMAMB) — the same
 * grounds `BCN_ORDINANCE_REF` cites (founder-accepted 2026-07-21, L-449
 * gate). The Barcelona-exclusive Arts. 342/343 text was approved by the
 * Subcomissió d'Urbanisme 20-10-2004, DOGC núm. 4277 of 10-12-2004.
 */
export const BCN_20A_DECL_INSTRUMENT_CONTEXT: DeclarativeInstrumentContext = {
    instrument: {
        id: 'PGM-1976 NNUU (consolidated refós, RPUC/NUMAMB) incl. the Barcelona-exclusive Arts. 342/343 modification (DOGC núm. 4277, 10-12-2004)',
        kind: 'binding-plan',
        effectiveFrom: '1976-07-14',
    },
    legalStatus: 'binding',
    legalStatusSource: 'metadata',
    citation:
        'RPUC / AMB Geoportal de Planejament (NUMAMB) catalogue the consolidated PGM refós as ' +
        'the living in-force text (BCN_ORDINANCE_REF grounds, founder-accepted 2026-07-21, ' +
        'L-449 gate); the Arts. 342/343 tables are read from the Barcelona-exclusive ' +
        'modification, DOGC núm. 4277 of 10-12-2004.',
};
