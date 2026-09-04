// FRANCE — the PLANNING-REGIME LOOKUP: which body of rules governs a point, from facts the
// national Géoportail de l'urbanisme ALREADY SERVES. Founder blocker review 2026-09-04 §4 / §11.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHY A CLASSIFIER, AND WHY IT REFUSES TO INFER
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The 100-parcel audit (seed 20260904) recorded 59 `missing-source` states. Re-read against the
// raw trace, NONE of them sat in an RNU commune (`is_rnu=true` → 0 of 59). They decompose as:
//   • 49 — seven rural parcels where GPU's `municipality` says `is_rnu=false` (a local document
//          is DECLARED) and GPU's `document` layer serves NOTHING at the point. Two statements
//          from one publisher that do not agree.
//   • 6  — one carte-communale parcel (`du_type=CC`) with no zone_urba / prescriptions — which is
//          exactly what a CC looks like: sectors, no règlement. The rules are the RNU's.
//   • 4  — two PLU parcels with a règlement reference and no prescription of the family.
// The founder's inference ("some of the 59 are RNU communes wrongly concluded") therefore does not
// hold for THIS sample — but his correction of the LABEL does: *"no PLU found" is the observation;
// "no source" is the wrong inference.* For the 49 the honest regime is UNDETERMINED, named as a
// publisher self-contradiction, and — ⛔ — it is NOT resolved to RNU: since 2020 a document must
// be published on the GPU to become enforceable (L.133-1 s. / L.153-23), but documents in force
// BEFORE 2020 remain enforceable without GPU publication, so absence from the GPU does not imply
// absence of a document. Inferring RNU here would apply national rules on land a PLU governs.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE SEVEN REGIMES, and which of them the RNU pack answers for
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   PLU / PLUi   — a local règlement governs; parameters are its (the PDF / pack legs).
//   PSMV         — building-by-building heritage plan (L.313-1 s.); no generic envelope.
//   CC           — carte communale: sectors zone the land; the SUBSTANTIVE rules are the RNU's.
//                  ⭐ RNU pack applies; the PAU test does NOT (the CC's own sectors replace it —
//                  L.161-4). Founder cites art. R.162-1 for the instruction basis; carried as HIS
//                  citation, not re-verified here.
//   RNU          — no local document (`is_rnu=true`, nothing served). RNU pack + PAU test.
//   POS-caduc    — a POS served at the point: lapsed by law 27 March 2017 (L.174-1, loi ALUR);
//                  RNU applies — the SHIPPED doctrine (`frNoExtraction.frPosCaducRefusal`).
//                  RNU pack + PAU test, with the flag disagreement named.
//   undetermined-declared-not-served — `is_rnu=false`, no document served (the 49 above).
//   undetermined-conflict            — `is_rnu=true` AND a non-POS document served, or no
//                                      commune served at all. Two statements; neither applied.
//
// PURE + deterministic (C58 §1.1/§1.9). Takes already-fetched GPU facts; performs no I/O. The
// fetch seam is `countryAdapters/fr/frGpuClient.ts` (not this lane's file); this module is the
// rule-pack side of the join.

export const FR_PLANNING_REGIMES = [
    'PLU',
    'PLUi',
    'PSMV',
    'CC',
    'RNU',
    'POS-caduc',
    'undetermined-declared-not-served',
    'undetermined-conflict',
] as const;
export type FrPlanningRegime = (typeof FR_PLANNING_REGIMES)[number];

/** The already-fetched GPU facts the classifier reads. `null` = the layer was not consulted/served. */
export interface FrRegimeFacts {
    /** `municipality.is_rnu` — null when no commune feature was served at the point. */
    readonly isRnu: boolean | null;
    /** `document.du_type` verbatim (`PLU`, `PLUI`/`PLUi`, `POS`, `PSMV`, `CC`, …) or null when none served. */
    readonly duType: string | null;
    /** Did `zone_urba` serve a zone at the point? */
    readonly zoneServed: boolean;
    /** Did `secteur_cc` serve a carte-communale sector at the point? */
    readonly secteurCcServed: boolean;
}

export interface FrRegimeVerdict {
    readonly regime: FrPlanningRegime;
    /** Do the RNU's substantive articles (R.111-1 s.) supply the rules at this point? */
    readonly rnuRulesApply: boolean;
    /** Does the L.111-3 constructibilité-limitée test (PAU membership) gate construction here? */
    readonly pauTestApplies: boolean;
    /** Statutory basis, for the citation on every emitted state. */
    readonly articles: readonly string[];
    /** One line a reader sees first — the observation, never the inference. */
    readonly basis: string;
}

function normaliseDuType(raw: string | null): string | null {
    if (raw === null) return null;
    const t = raw.trim().toUpperCase();
    return t === '' ? null : t;
}

/**
 * Classify the planning regime at a point. **Pure, total, deterministic.**
 *
 * ⚠ THE ONE RULE: a regime is asserted only from a statement the publisher made; it is never
 * inferred from a silence. Two disagreeing statements yield `undetermined-conflict`, not the more
 * convenient of the two.
 */
export function classifyFrPlanningRegime(f: FrRegimeFacts): FrRegimeVerdict {
    const du = normaliseDuType(f.duType);

    if (f.isRnu === null) {
        return {
            regime: 'undetermined-conflict',
            rnuRulesApply: false,
            pauTestApplies: false,
            articles: [],
            basis: 'GPU municipality served no commune at this point — no regime statement exists to read.',
        };
    }

    if (du === 'POS') {
        return {
            regime: 'POS-caduc',
            rnuRulesApply: true,
            pauTestApplies: true,
            articles: ['L.174-1 (caducité des POS, 27 mars 2017)', 'L.111-1 s.', 'R.111-1 s.'],
            basis:
                `GPU document du_type=POS served; POS lapsed by law on 27 March 2017 (L.174-1) — the RNU ` +
                `applies. GPU is_rnu=${String(f.isRnu)}${f.isRnu ? '' : ' (flag disagrees with the caducity; both statements carried)'}.`,
        };
    }

    if (f.isRnu) {
        if (du !== null) {
            return {
                regime: 'undetermined-conflict',
                rnuRulesApply: false,
                pauTestApplies: false,
                articles: [],
                basis:
                    `GPU is_rnu=true (no local document) AND GPU document du_type=${du} served at the point — ` +
                    'two publisher statements that do not agree; neither regime is applied.',
            };
        }
        return {
            regime: 'RNU',
            rnuRulesApply: true,
            pauTestApplies: true,
            articles: ['L.111-1 s.', 'L.111-3 / L.111-4 (constructibilité limitée)', 'R.111-1 s.'],
            basis: 'GPU municipality is_rnu=true and no document served — the Règlement national d’urbanisme governs.',
        };
    }

    // is_rnu === false — a local document is declared.
    if (du === 'PSMV') {
        return {
            regime: 'PSMV',
            rnuRulesApply: false,
            pauTestApplies: false,
            articles: ['L.313-1 s.'],
            basis: 'GPU document du_type=PSMV — a building-by-building heritage plan governs.',
        };
    }
    if (du === 'CC' || (du === null && f.secteurCcServed)) {
        return {
            regime: 'CC',
            rnuRulesApply: true,
            pauTestApplies: false,
            articles: ['L.160-1 s. / L.161-4 (carte communale)', 'R.162-1 (founder citation — instruction on the RNU basis; not re-verified)', 'R.111-1 s.'],
            basis:
                'Carte communale: the CC delimits constructible / non-constructible sectors and has no ' +
                'règlement of its own — the substantive rules are the RNU’s. The L.111-3 PAU test does ' +
                'not apply; the sector does.',
        };
    }
    if (du === 'PLUI' || du === 'PLUIH' || du === 'PLUI-H') {
        return { regime: 'PLUi', rnuRulesApply: false, pauTestApplies: false, articles: ['L.151-1 s.'], basis: `GPU document du_type=${du}.` };
    }
    if (du === 'PLU' || du === 'PLUH') {
        return { regime: 'PLU', rnuRulesApply: false, pauTestApplies: false, articles: ['L.151-1 s.'], basis: `GPU document du_type=${du}.` };
    }
    if (du !== null) {
        // An unlisted du_type (e.g. a document "tenant lieu de PLU") — a local instrument is served;
        // it is not RNU. Classified with the PLU family, verbatim type carried in the basis.
        return { regime: 'PLU', rnuRulesApply: false, pauTestApplies: false, articles: ['L.151-1 s.'], basis: `GPU document du_type=${du} (unlisted type; a local instrument is served).` };
    }
    return {
        regime: 'undetermined-declared-not-served',
        rnuRulesApply: false,
        pauTestApplies: false,
        articles: [],
        basis:
            'GPU municipality is_rnu=false (a local document is DECLARED) and GPU document / zone_urba / ' +
            'secteur_cc serve NOTHING at the point. The observation is "no document served on the GPU"; ' +
            '"RNU applies" is NOT inferred from it (a pre-2020 document is enforceable without GPU publication).',
    };
}
