// L-664 §ENVELOPE-CONFIDENCE-LADDER — THE NO-SILENT-REVALUATION GUARD.
//
// WHAT THIS TEST IS FOR
// ---------------------
// L-664 reconciled ONE confidence ontology across contract → schema → packs → scorecard → UI. The
// single largest risk in a vocabulary reconciliation is that it quietly PROMOTES or DEMOTES a
// published number: a pack that shipped `pipeline-extracted-unverified` (machine-read, human-
// unverified, legally must-not-be-relied-on) drifting to `estimated-ruleset` would turn a red
// "⚠ Unverified · machine-extracted" chip into a violet "Estimated" one, with no code review
// showing a number change. That is the §CONTEXT-DATA-HONESTY family at the vocabulary layer.
//
// So: a FROZEN MANIFEST of every rule pack's PUBLISHED confidence, asserted at runtime against the
// packs themselves. Re-labelling the vocabulary must not move a single one of these values. If a
// pack's confidence genuinely should change, that is a deliberate act with a citation — and this
// test is the place it must be argued.
//
// ⚠ TOTALITY. The manifest is also asserted COMPLETE against the `src/rulepacks/` directory: every
// file that declares a `defaultConfidence` must appear here. A new pack cannot ship an unpinned
// confidence, and a pack cannot drop out of the guard by being renamed.
//
// Authority: C58 §1.2/§1.6 · C63 §3.2 (L-664) · ORDINANCE-EXTRACTION-PIPELINE.md §3.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EnvelopeConfidenceSchema,
    RulePackDefaultConfidenceSchema,
    ENVELOPE_CONFIDENCE_ORDER,
    type RulePackDefaultConfidence,
} from '@pryzm/schemas';
// ⚠ Imported from the PACK MODULES, not the package barrel: several packs
// (`ES_MADRID_PGOUM97_PACK`, `ES_BARCELONA_22ARROBA_PACK`, …) are deliberately not re-exported
// from `src/index.ts`, and a guard that silently skipped them would be the "passes while measuring
// nothing" defect this file exists to prevent.
import { ES_BARCELONA_ENSANCHE_PACK } from '../src/rulepacks/esBarcelonaEnsanche.js';
import { ES_BARCELONA_SEMIINTENSIVA_PACK } from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { ES_BARCELONA_NUCLI_ANTIC_PACK } from '../src/rulepacks/esBarcelonaNucliAntic.js';
import { ES_BARCELONA_20A_AILLADA_PACK } from '../src/rulepacks/esBarcelona20aAillada.js';
import { ES_BARCELONA_22ARROBA_PACK } from '../src/rulepacks/esBarcelona22Arroba.js';
import { ES_MURCIA_PGOU2012_PACK } from '../src/rulepacks/esMurciaPgou2012.js';
import { ES_VALENCIA_PGOU_PACK } from '../src/rulepacks/esValenciaPgou.js';
import { ES_BARCELONA_INDUSTRIAL_PACK } from '../src/rulepacks/esBarcelonaIndustrial.js';
import { ES_BARCELONA_VOLUMETRIA_18_PACK } from '../src/rulepacks/esBarcelonaVolumetria18.js';
import { ES_MADRID_NZ1_PACK } from '../src/rulepacks/esMadridNZ1.js';
import {
    ES_MADRID_PGOUM97_PACK,
    MADRID_PGOUM97_DEFAULT_CONFIDENCE,
} from '../src/rulepacks/esMadridPgoum97.js';
import {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
} from '../src/rulepacks/esCordobaPGOU2001.js';
import { NL_BESTEMMINGSPLAN_PACK } from '../src/rulepacks/nlBestemmingsplan.js';
import { FR_PARIS_PLU_PACK } from '../src/rulepacks/frParisPluBioclimatique.js';
import { CH_ZONING_PACK } from '../src/rulepacks/chZoning.js';
import { CH_ZURICH_BZO_PACK } from '../src/rulepacks/chZurichBzo.js';
import { SA_RIYADH_DEMO_PACK } from '../src/rulepacks/saRiyadhDemo.js';
import { ESTIMATED_DEFAULT_PACK } from '../src/rulepacks/estimatedDefault.js';
import { ES_TELDE_PGO2003_PACK } from '../src/rulepacks/esTeldePgo2003.js';
import { ES_ZARAGOZA_PGOU2024_PACK } from '../src/rulepacks/esZaragoza.js';
import { ES_SEVILLA_PGOU_PACK } from '../src/rulepacks/esSevilla.js';
import { ES_EL_SAUZAL_PACK } from '../src/rulepacks/esElSauzal.js';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FROZEN MANIFEST — every pack's PUBLISHED `defaultConfidence`, as shipped before L-664.
// A change to any line here is a change to what a user is told about a legal number.
// ─────────────────────────────────────────────────────────────────────────────────────────────
const PUBLISHED: ReadonlyArray<readonly [string, { defaultConfidence: RulePackDefaultConfidence }, RulePackDefaultConfidence]> = [
    // Murcia PGOU-2012 — landed after this manifest was first frozen. Ships the curated-estimate
    // seed and DELIBERATELY UNDERSTATES until MURCIA_ENVELOPE_VERIFIED is signed.
    ['esMurciaPgou2012', ES_MURCIA_PGOU2012_PACK, 'estimated-ruleset'],
    // València PGOU-1991 — landed after this manifest was frozen. ⚠ Its `zones` array is EMPTY by
    // construction (the plan sets the envelope on the Plano C DRAWING, which is not published as
    // data), so this seed describes NOTHING today. It is pinned at the floor tier precisely so a
    // future zone cannot inherit a flattering default by being added to an unpinned pack.
    ['esValenciaPgou', ES_VALENCIA_PGOU_PACK, 'estimated-ruleset'],
    // Sevilla PGOU-2006 — landed after this manifest was frozen. ⚠ 2026-08-03: carries one
    // transcribed zone (`SB`) but is STILL pinned at the floor tier — `SEVILLA_PACK_DEFAULT_
    // CONFIDENCE` ('estimated-ruleset') is the honest ceiling for a human/agent-transcribed pack,
    // same reasoning as València's line above, so a future zone cannot inherit a flattering
    // default silently.
    ['esSevilla', ES_SEVILLA_PGOU_PACK, 'estimated-ruleset'],
    // Telde PGO-2003 (Canarias SIPU) — landed after this manifest was frozen. ⚠ Its numbers are
    // PUBLISHED STRUCTURED DATA (the Gobierno de Canarias' own typed EDIF columns), which is
    // stronger provenance than an OCR read — and it is pinned at `estimated-ruleset` ANYWAY,
    // because nobody has checked those columns against the Normas Urbanísticas they summarise.
    // Better plumbing is not a better legal claim, and this line is what stops the two being
    // confused.
    ['esTeldePgo2003', ES_TELDE_PGO2003_PACK, 'estimated-ruleset'],
    // Barcelona — every clau ships the curated-estimate seed. The `block-constructed` tier is
    // ENGINE-stamped per parcel (C58 §1.2 / L-572); a pack cannot self-certify.
    ['ES_BARCELONA_ENSANCHE_PACK', ES_BARCELONA_ENSANCHE_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_SEMIINTENSIVA_PACK', ES_BARCELONA_SEMIINTENSIVA_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_NUCLI_ANTIC_PACK', ES_BARCELONA_NUCLI_ANTIC_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_20A_AILLADA_PACK', ES_BARCELONA_20A_AILLADA_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_22ARROBA_PACK', ES_BARCELONA_22ARROBA_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_INDUSTRIAL_PACK', ES_BARCELONA_INDUSTRIAL_PACK, 'estimated-ruleset'],
    ['ES_BARCELONA_VOLUMETRIA_18_PACK', ES_BARCELONA_VOLUMETRIA_18_PACK, 'estimated-ruleset'],
    // Madrid NZ-1 — ring-only, cited COEF_Z; deliberately an estimate, not a computed envelope.
    ['ES_MADRID_NZ1_PACK', ES_MADRID_NZ1_PACK, 'estimated-ruleset'],
    // The two OCR-seeded packs — the permanent bottom tier. These are the lines that matter most:
    // a promotion here would silently launder a machine read into a curated estimate.
    ['ES_MADRID_PGOUM97_PACK', ES_MADRID_PGOUM97_PACK, 'pipeline-extracted-unverified'],
    ['ES_CORDOBA_PGOU2001_PACK', ES_CORDOBA_PGOU2001_PACK, 'pipeline-extracted-unverified'],
    // Zaragoza PGOU 2024 (Grado A1, subgrados 3.1/3.2/4.1/4.2) — landed after this manifest was
    // frozen. Human/agent-transcribed VERBATIM from the ordinance text (not OCR), so it ships the
    // curated-estimate ceiling `estimated-ruleset`, never the OCR-pipeline bottom tier.
    ['ES_ZARAGOZA_PGOU2024_PACK', ES_ZARAGOZA_PGOU2024_PACK, 'estimated-ruleset'],
    // El Sauzal (INE 38041, Canarias) — Normativa Urbanística Título X Cap.3 (Ciudad Jardín,
    // RE-ViUf-*). Human/agent-transcribed VERBATIM from the PGOU ordinance text (not OCR), so it
    // ships the curated-estimate ceiling `estimated-ruleset` — the same tier as Zaragoza/Telde,
    // never higher: the RE-ViUf ↔ Ciudad Jardín typology binding is itself an inference (see
    // EL_SAUZAL_TYPOLOGY_BINDING_INFERENCE in esElSauzal.ts), and a per-area "fichero de
    // ordenación anexo" this transcription did not find could override any packed figure.
    ['ES_EL_SAUZAL_PACK', ES_EL_SAUZAL_PACK, 'estimated-ruleset'],
    // The rest.
    ['NL_BESTEMMINGSPLAN_PACK', NL_BESTEMMINGSPLAN_PACK, 'estimated-ruleset'],
    ['FR_PARIS_PLU_PACK', FR_PARIS_PLU_PACK, 'estimated-ruleset'],
    ['CH_ZONING_PACK', CH_ZONING_PACK, 'estimated-ruleset'],
    ['CH_ZURICH_BZO_PACK', CH_ZURICH_BZO_PACK, 'estimated-ruleset'],
    ['SA_RIYADH_DEMO_PACK', SA_RIYADH_DEMO_PACK, 'estimated-ruleset'],
    ['ESTIMATED_DEFAULT_PACK', ESTIMATED_DEFAULT_PACK, 'estimated-ruleset'],
] as const;

/** Rulepack source files that declare a `defaultConfidence` — the totality denominator. */
const RULEPACK_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/rulepacks');
function filesDeclaringDefaultConfidence(): string[] {
    return readdirSync(RULEPACK_DIR)
        .filter((f) => f.endsWith('.ts'))
        .filter((f) => /^\s*defaultConfidence:/m.test(readFileSync(join(RULEPACK_DIR, f), 'utf8')));
}

describe('L-664 — no pack\'s PUBLISHED confidence changed when the vocabulary was reconciled', () => {
    it.each(PUBLISHED)('%s still publishes its original confidence', (_name, pack, expected) => {
        expect(pack.defaultConfidence).toBe(expected);
    });

    it('every published value is a legal RulePackDefaultConfidence (no invented tier crept in)', () => {
        for (const [name, pack] of PUBLISHED) {
            const r = RulePackDefaultConfidenceSchema.safeParse(pack.defaultConfidence);
            expect(r.success, `${name} publishes an illegal tier`).toBe(true);
        }
    });

    it('every published value is also on the canonical L0 ladder (one vocabulary, not two)', () => {
        for (const [, pack] of PUBLISHED) {
            expect(ENVELOPE_CONFIDENCE_ORDER as readonly string[]).toContain(pack.defaultConfidence);
            expect(EnvelopeConfidenceSchema.safeParse(pack.defaultConfidence).success).toBe(true);
        }
    });

    it('the two OCR-seeded constants are unmoved from the permanent bottom tier', () => {
        expect(CORDOBA_INTENDED_DEFAULT_CONFIDENCE).toBe('pipeline-extracted-unverified');
        expect(MADRID_PGOUM97_DEFAULT_CONFIDENCE).toBe('pipeline-extracted-unverified');
    });

    it('NO pack self-certifies — `authoritative` and `block-constructed` are not pack-declarable', () => {
        // Both are ENGINE/authority-assigned, never a pack seed (C58 §1.2 / L-572). The schema
        // enforces it; this asserts the schema still does, so the guard cannot rot.
        expect(RulePackDefaultConfidenceSchema.safeParse('authoritative').success).toBe(false);
        expect(RulePackDefaultConfidenceSchema.safeParse('block-constructed').success).toBe(false);
        expect(RulePackDefaultConfidenceSchema.safeParse('not-determined').success).toBe(false);
        for (const [, pack] of PUBLISHED) {
            expect(pack.defaultConfidence).not.toBe('authoritative');
            expect(pack.defaultConfidence).not.toBe('block-constructed');
        }
    });

    it('the manifest is TOTAL — every rulepack file declaring a defaultConfidence is pinned here', () => {
        // The file-count denominator. `dkPlandataEnvelope.ts` builds its pack in a FUNCTION
        // (`dkPlandataResolvedPack`) rather than a module constant, so it is pinned by its own
        // suite (`dkPlandataEnvelope.test.ts` — `structured`) and named here as a known exception.
        // `esMurciaAnchoDeCalle.ts` is the same shape: its pack is built per-parcel by
        // `murciaAnchoResolvedPack` once a street width has been measured, so there is no module
        // constant to pin. It is pinned by `murciaAnchoDeCalle.test.ts` (`estimated-ruleset` — the
        // tier SIG-MU2 signed, and ADR-0285: a signature on METHODOLOGY does not promote the tier).
        // `esBalearsMuib.ts` is the SAME SHAPE, and deliberately so: the Balears pack is built
        // per-parcel by `balearsResolvedPack()` from the live MUIB fitxa, because the 5,273 distinct
        // fitxes are a LIVE source, not a table anyone should freeze into a module constant. There is
        // therefore no constant to pin, and it is pinned by `balearsRealParcelEnvelope.test.ts`
        // (`estimated-ruleset` — see `BALEARS_PACK_CONFIDENCE` for why NOT `structured`, even though
        // every number is machine-read: only 2.0 % of fitxes cite the governing article, so claiming
        // the table cell IS the determination would over-state what has been established).
        const FUNCTION_BUILT = new Set([
            'dkPlandataEnvelope.ts',
            'esMurciaAnchoDeCalle.ts',
            'esBalearsMuib.ts',
        ]);
        const declaring = filesDeclaringDefaultConfidence().filter((f) => !FUNCTION_BUILT.has(f));
        expect(declaring.length).toBeGreaterThan(0);
        expect(declaring.length).toBe(PUBLISHED.length);
    });
});
