// C58 §1.6 / C23 §1.1 — per-value ordinance-extraction provenance (the retained
// audit that turns human verification from "open the 82-page PDF and find the
// cell" into "glance at a crop + the article").
//
// L0-pure: Zod only (P5). No I/O, no THREE, no DOM. This is the TYPED shape of
// the C23 provenance the horizontal ordinance-extraction pipeline
// (`@pryzm/ordinance-extraction`) retains for every machine-extracted value, so
// the retention is a contract invariant a CI gate can bind to — not free text.
//
// Strategic context — docs/04-reference/ORDINANCE-EXTRACTION-PIPELINE.md §3.1b / §4;
// docs/02-decisions/contracts/C58-ZONING-RULES-AND-BUILDABLE-ENVELOPE.md §1.6;
// C23 (provenance & AI audit) §1.1.

import { z } from 'zod';

/**
 * The Stage-0 supersession verdict (`ORDINANCE-EXTRACTION-PIPELINE.md` §2 Stage 0).
 *
 * ⚠ Extracting from a superseded instrument yields a DOUBLY-wrong citation (wrong
 * value AND dead instrument), so this is checked BEFORE the document is ever
 * fetched for extraction. Retained here so the value's provenance records that the
 * gate ran and what it said:
 *   - `vigent`       — in force (Barcelona `detall.vigencia` VIGENT / Córdoba SIU
 *                      `Planeamiento_Vigente`, no later *modificación*).
 *   - `derogated`    — repealed (`EXP_DEROG` / `TANCAMENT_OUT`). MUST NOT extract.
 *   - `under-appeal` — `RECURS_O_SENTENCIA`: in force but litigated; extract with a caveat.
 *   - `unknown`      — the register did not answer; treated as coarser-than-vigent.
 */
export const SupersessionStatusSchema = z.enum([
    'vigent',
    'derogated',
    'under-appeal',
    'unknown',
]);
export type SupersessionStatus = z.infer<typeof SupersessionStatusSchema>;

/**
 * Per-value extraction provenance (C23 §1.1 retention, typed). One of these is
 * stored for EVERY machine-extracted numeric field, and it is what a human sees
 * when verifying: the crop, the page, the article, both passes' agreement, and
 * which cheap cross-checks ran.
 *
 * `humanVerifiedBy` is the SINGLE DOOR out of the `pipeline-extracted-unverified`
 * tier: null until a human signs off. `canGraduateTier` (in
 * `@pryzm/ordinance-extraction`) reads exactly this field, so the no-silent-
 * graduation invariant is a property of the data, not of any one code path.
 */
export const ExtractionProvenanceSchema = z.object({
    /** RPUC `idDocument` / COACo file id — the document the value came from. */
    documentId: z.string().min(1),
    /** 0-based page index the crop was taken from. */
    page: z.number().int().min(0),
    /**
     * Object-storage key of the source-image CROP (C23). The crop is what makes
     * verification seconds, not minutes — never null: a value with no crop cannot
     * be verified against the original and must not exist in the pipeline output.
     */
    cropRef: z.string().min(1),
    /** The governing article, e.g. `"PGOU-2001 Art. 13.6.3"` — never empty. */
    ordinanceRef: z.string().min(1),
    /** Model id + version that produced the extraction (C23 reproducibility). */
    extractionModel: z.string().min(1),
    /** Hash of the exact prompt used (C23 reproducibility). */
    promptHash: z.string().min(1),
    /** Stage-4 dual-pass agreement result: did OCR-then-extract == direct-vision? */
    dualPassAgreed: z.boolean(),
    /**
     * The cheap cross-checks that RAN and their outcome, e.g.
     * `["arithmetic:ok", "range:ok", "locale:normalised"]` /
     * `["arithmetic:flag", "range:ok"]`. An empty array means no check was
     * applicable (a prose scalar with no redundant sibling), NOT that checks
     * were skipped.
     */
    crossChecks: z.array(z.string().min(1)).default([]),
    /** The Stage-0 supersession verdict recorded at extraction time. */
    supersededCheck: SupersessionStatusSchema,
    /**
     * The human who verified this value against the crop, or null. ⚠ THE GRADUATION
     * GATE: a value may leave `pipeline-extracted-unverified` for any higher tier
     * ONLY when this is non-null with a matching C23 `AIArtefact.humanApproval`. No
     * code path may raise the tier without it (`ORDINANCE-EXTRACTION-PIPELINE.md`
     * §3.2 lock 3).
     */
    humanVerifiedBy: z.string().min(1).nullable().default(null),
    /** ISO timestamp of the human verification, or null while unverified. */
    verifiedAt: z.string().min(1).nullable().default(null),
});
export type ExtractionProvenance = z.infer<typeof ExtractionProvenanceSchema>;
