// §NSW-LAY-NAME — the quantity semantics NSW *does* serve, at 100%, on a closed vocabulary.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT (live 2026-09-04, `phase0-transcripts/layname-census.json`)
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   `LEGIS_REF_CLAUSE` across the 12 vertical overlay layers ...... 0.0% on ten of them
//   `LAY_NAME`         across the 12 vertical overlay layers ...... **996 / 996 = 100.0%**,
//                                                                  **19 distinct strings**
//
// ⭐ THOSE TWO LINES ARE THE WHOLE LANE IN MINIATURE, AND THEY WERE BEING CONFLATED. NSW does not
// serve the CITATION for its overlays. It does serve the QUANTITY SEMANTICS for every one of them:
// what is measured, in which direction, from which datum. Those are different questions with
// different answers, and treating "uncited" as "unreadable" gave away a 100%-populated field.
//
//   "Maximum Building Height (m)" ................ a cap, metres above existing ground level
//   "Minimum Level Australian Height Datum (AHD)"  a MINIMUM, absolute, on the FLOOR axis
//   "Minimum Floor Height Restriction Heights
//    shown on map in AHD (m)" .................... likewise — the service names its own datum
//   "Building Height Plane" ...................... an inclined plane, parameters elsewhere
//   "Protected Areas" / "Specified Sites" / … .... applicability only; no number here
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE ERROR THIS FILE CORRECTS, WHICH WAS ALREADY IN THE REPO WITH A CONFIDENT COMMENT ON IT
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `PHASE0-REPORT.md` §M3.4 and the first cut of `nswPortalLayers.ts` both classified layer 429
// (Building Height Allowance) as an **ADDITIVE ALLOWANCE**, reading parcel `152//DP877246`'s
// "HOB 8.5 m + 2.1" as a height bonus granted under condition, and built a guard around that.
//
// The service says otherwise on **203 of 203 rows**: `LAY_NAME = "Minimum Level Australian Height
// Datum (AHD)"`, in **BALLINA and BYRON** — coastal flood LGAs where 1.8–2.1 m AHD is a credible
// minimum habitable floor level and an absurd height bonus. It is a MINIMUM, it is ABSOLUTE, and
// it is on the FLOOR axis. It is not a maximum, not additive, and not a building height at all.
//
// `min(8.5, 2.1) = 2.1` remains catastrophic. But the guard written for it was guarding the wrong
// property, and a guard aimed at the wrong property is the failure mode of
// §CONFIDENT-REGISTER-ROWS-ARE-THE-WRONG-ONES: the prose justification read fluently and the
// verdict was wrong. The correct exclusion is not "additive allowances are not maxima" — it is
// **"a minimum-floor-level control is not on the envelope-top axis and never enters height
// precedence at all"**, which is both true and checkable from a 100%-populated field.
//
// ⚠ AND A TRAP RECORDED SO NOBODY BUILDS ON IT: `SUGGESTED_CATEGORY` looks like a served role hint
// and is not one. It reads `"HOB exception"` on all 203 of those minimum-level rows. The
// government's own categorisation is wrong here. ⛔ Do not key legal roles off it.
//
// P5-adjacent purity: pure data + pure total functions. No I/O, no clock, no RNG.
// Contracts: C58 §1.2/§1.4, C62, C74 §0, C75. ADR-0377 (height datum).

/**
 * WHICH AXIS a control's number constrains. ⛔ `envelope-top` is the ONLY one that may enter
 * height precedence — mixing axes is how a 2.1 m minimum floor level becomes a 2.1 m building.
 */
export type NswQuantityAxis = 'envelope-top' | 'floor-level' | 'plane' | 'none';

/** The vertical frame the number is expressed in. `null` when the control carries no number. */
export type NswQuantityDatum = 'existing_ground_level' | 'AHD' | null;

/**
 * What one `LAY_NAME` string means, decomposed. Every field is measured from the served string;
 * nothing here is inferred from the layer id, because the same layer serves more than one
 * `LAY_NAME` (layer 771 serves two, layer 485 two, layer 572 seven).
 */
export interface NswQuantitySemantics {
    /** The `LAY_NAME` this was read from, verbatim. Carried so a refusal can quote the source. */
    readonly layName: string;
    readonly axis: NswQuantityAxis;
    /** `'maximum'` caps, `'minimum'` floors, `null` when the polygon carries no number. */
    readonly direction: 'maximum' | 'minimum' | null;
    readonly datum: NswQuantityDatum;
    /**
     * ⭐ DOES THIS CONTROL LIMIT HOW HIGH THE BUILDING MAY GO? — independent of whether it serves
     * a usable number. A Sun Access Protection polygon bears on the envelope top and serves no
     * number; a Minimum Level AHD polygon serves a number and does not bear on the envelope top.
     *
     * ⚠ SPLITTING THESE TWO QUESTIONS WAS FORCED BY A FAILING TEST AND IT MATTERS. While they were
     * one flag, an applicability-only vertical control — "a sun access plane reaches this parcel,
     * value in the clause" — was filed alongside a minimum floor level as simply "not a height",
     * and the envelope came back CLEAN. That is L-616 exactly: a constraint that can only reduce
     * the envelope, known to exist, rendered as absent. The two absences are not the same absence.
     */
    readonly bearsOnEnvelopeTop: boolean;
    /** `true` when `LAY_CLASS` carries a usable number for this control. */
    readonly servesNumber: boolean;
    /**
     * ⛔ THE PRECEDENCE PREDICATE — `bearsOnEnvelopeTop && servesNumber`. Only these may enter the
     * height comparison. Everything else is reported and excluded — not minimised against the
     * base, not maximised against it, and never silently dropped.
     */
    readonly constrainsEnvelopeTop: boolean;
    /**
     * `true` when the polygon states only that a control APPLIES here and the number lives
     * elsewhere (a clause, a separate map, an embedded label). Reported as a named constraint.
     */
    readonly applicabilityOnly: boolean;
}

/** Not in the measured vocabulary. ⛔ REFUSE — never fall back to "probably a maximum height". */
export const NSW_UNKNOWN_QUANTITY: NswQuantitySemantics = Object.freeze({
    layName: '',
    axis: 'none',
    direction: null,
    datum: null,
    // ⚠ `true`, and that is deliberate: an unrecognised LAY_NAME on a VERTICAL layer might well be
    // a height limit, and the safe reading of "might limit the height" is that the envelope is not
    // settled. Assuming it does NOT bear would render an unknown constraint as absent — L-616.
    bearsOnEnvelopeTop: true,
    servesNumber: false,
    constrainsEnvelopeTop: false,
    applicabilityOnly: false,
});

const MAX_HEIGHT_AGL: Omit<NswQuantitySemantics, 'layName'> = {
    axis: 'envelope-top',
    direction: 'maximum',
    datum: 'existing_ground_level',
    bearsOnEnvelopeTop: true,
    servesNumber: true,
    constrainsEnvelopeTop: true,
    applicabilityOnly: false,
};
const MIN_LEVEL_AHD: Omit<NswQuantitySemantics, 'layName'> = {
    axis: 'floor-level',
    direction: 'minimum',
    datum: 'AHD',
    // ⛔ THE 152//DP877246 FIX. A minimum floor level in AHD constrains where the LOWEST habitable
    // floor may sit. It is not a ceiling, it is not in the same datum as an above-ground height,
    // and it does not belong in a height comparison at all. It DOES serve a real number — so it is
    // reported as a genuine constraint on this land, just not on this axis.
    bearsOnEnvelopeTop: false,
    servesNumber: true,
    constrainsEnvelopeTop: false,
    applicabilityOnly: false,
};
const PLANE: Omit<NswQuantitySemantics, 'layName'> = {
    axis: 'plane',
    direction: 'maximum',
    datum: 'existing_ground_level',
    // The polygon says WHERE; the angle and origin come from CLASS_DESCRIPTION or the clause, so
    // LAY_CLASS itself is a class letter and serves no number. It bears on the envelope top and
    // cannot be evaluated from this field alone — which is precisely a status-C constraint.
    bearsOnEnvelopeTop: true,
    servesNumber: false,
    constrainsEnvelopeTop: false,
    applicabilityOnly: false,
};
/**
 * The polygon says a vertical control REACHES here and serves no number.
 *
 * ⚠ `bearsOnEnvelopeTop: true`. Every string mapped to this constant sits on a layer in the
 * VERTICAL family — sun access planes, airport buffers, meteorological station limits,
 * overshadowing. Each of them can only ever REDUCE the envelope. Filing them as "not a height"
 * because they serve no number is the L-616 error, and it is the one a green suite hides.
 */
const APPLICABILITY: Omit<NswQuantitySemantics, 'layName'> = {
    axis: 'envelope-top',
    direction: 'maximum',
    datum: null,
    bearsOnEnvelopeTop: true,
    servesNumber: false,
    constrainsEnvelopeTop: false,
    applicabilityOnly: true,
};

/**
 * ⭐ THE CLOSED VOCABULARY — every distinct `LAY_NAME` observed on the twelve vertical overlay
 * layers, measured live 2026-09-04 (`phase0-transcripts/layname-census.json`).
 *
 * ⚠ APPEND-ONLY, AND ONLY FROM AN OBSERVED STRING. There are nineteen of them across 996 features
 * in the whole state; this is a finite, hand-completable vocabulary, which is exactly why it is
 * safe to make an unlisted string a REFUSAL instead of a default. ⛔ Never add a pattern match or
 * a `.includes('Maximum')` fallback: "Maximum Building Height" and "Minimum Level Australian
 * Height Datum (AHD)" differ by one word and by the entire meaning of the number.
 */
export const NSW_LAY_NAME_SEMANTICS: Readonly<Record<string, Omit<NswQuantitySemantics, 'layName'>>> =
    Object.freeze({
        // ── Maximum building height, metres above existing ground level. 771 features. ──────────
        'Maximum Building Height (m)': MAX_HEIGHT_AGL,
        'Maximum Building Height': MAX_HEIGHT_AGL,
        'Alternative Maximum Building Height (m)': MAX_HEIGHT_AGL,

        // ── Minimum ABSOLUTE level. ⛔ NOT a height, NOT a maximum, NOT on the envelope axis. ──
        'Minimum Level Australian Height Datum (AHD)': MIN_LEVEL_AHD, // layer 429, 203 features
        'Minimum Floor Height Restriction Heights shown on map in AHD (m)': MIN_LEVEL_AHD, // 469

        // ── Inclined plane. Parameters in CLASS_DESCRIPTION / the clause. ─────────────────────
        'Building Height Plane': PLANE,

        // ── Applicability only: the polygon says a control reaches here; no number is served. ──
        'Protected Areas': APPLICABILITY,
        'Protected Places': APPLICABILITY,
        'Specified Sites': APPLICABILITY,
        'Sun Access Protection': APPLICABILITY,
        'Land affected by Sun Access Protection': APPLICABILITY,
        'Land Affected by Sun Protection Controls': APPLICABILITY,
        'Additional Protection - Parramatta Square': APPLICABILITY,
        'Airport Buffer': APPLICABILITY,
        'Meteorological Station Height Limit': APPLICABILITY,
        // ⚠ Overshadowing serves its value INSIDE a label string — LAY_CLASS reads
        // "C1 Brick Chimney Stack - 29m". That is a number encoded for a human to read off a map,
        // i.e. the `graphic` failure label, and it is deliberately NOT parsed here: a regex over a
        // free-text label is the "plausible face" this lane exists to refuse.
        'Overshadowing Map': APPLICABILITY,
    });

/**
 * Read one `LAY_NAME`. **Total** — an unrecognised string returns `NSW_UNKNOWN_QUANTITY` with the
 * raw text carried, never a guess.
 *
 * ⛔ Exact match after trimming, deliberately. See the vocabulary note: substring matching on
 * "Height" would fold minimum floor levels into maximum building heights, which is the exact
 * fifty-metre-class error this module was written to make unrepresentable.
 */
export function nswQuantitySemantics(layName: string | null | undefined): NswQuantitySemantics {
    const raw = layName?.trim() ?? '';
    if (raw === '') return NSW_UNKNOWN_QUANTITY;
    const hit = NSW_LAY_NAME_SEMANTICS[raw];
    if (!hit) return { ...NSW_UNKNOWN_QUANTITY, layName: raw };
    return { ...hit, layName: raw };
}

/** True when the vocabulary did not recognise the served `LAY_NAME`. A refusal, not a default. */
export function isNswQuantityUnknown(q: NswQuantitySemantics): boolean {
    return q.axis === 'none' && !q.applicabilityOnly;
}

/**
 * ⛔ THE L-616 PREDICATE. `true` for a control that bears on the envelope top and could NOT be
 * evaluated — it serves no number, or its meaning is unknown. Its presence means the reported
 * height is an UPPER BOUND: a constraint that can only reduce the envelope was seen and not
 * applied. ⚠ An off-axis control (a minimum floor level) is NOT one of these; it genuinely does
 * not bound the top, so ignoring it for height purposes overstates nothing.
 */
export function isNswUnevaluatedTopConstraint(q: NswQuantitySemantics): boolean {
    return q.bearsOnEnvelopeTop && !q.servesNumber;
}

/** A reader-facing sentence for a control excluded from height precedence, naming the axis. */
export function describeNswAxisExclusion(q: NswQuantitySemantics): string {
    if (isNswQuantityUnknown(q)) {
        return (
            `The control's LAY_NAME ${JSON.stringify(q.layName)} is not in the measured NSW quantity ` +
            'vocabulary, so what its number measures is unknown. Reported, not applied — assuming ' +
            'it is a maximum building height is the error this refusal exists to prevent.'
        );
    }
    if (q.applicabilityOnly) {
        return (
            `${q.layName} states that a control applies here and serves no number; the value lives ` +
            'in the instrument. Reported as a named constraint, not applied.'
        );
    }
    if (q.axis === 'floor-level') {
        return (
            `${q.layName} is a MINIMUM level in the Australian Height Datum — it constrains where the ` +
            'lowest floor may sit, not how high the building may go, and it is in a different datum ' +
            'from an above-ground height. It does not enter height precedence. ' +
            'Comparing it against a maximum building height is arithmetic on two different axes.'
        );
    }
    return `${q.layName} does not constrain the envelope top.`;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE PRINCIPAL SERVICE HAS A DIFFERENT SCHEMA — `LAY_NAME` DOES NOT EXIST THERE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Measured on the captured bags: `Planning_Portal_Principal_Planning/14` (Height of Buildings)
// serves sixteen fields and **`LAY_NAME` is not among them** —
// `OBJECTID | EPI Name | LGA Name | … | Maximum Building Height | Units | Legislative Clause |
//  … | MAX_B_H_M | MAX_B_H_RL`. `LAY_NAME` is a Local Provisions / SEPP field.
//
// ⭐ THIS WAS CAUGHT BY A TEST, AND IT IS THE SAME SILENT-FALSE-ZERO SHAPE AS THE ALIAS DEFECT.
// The first cut of the reader asked every layer for `LAY_NAME`, got `undefined` from Principal/14,
// and classified the STATE'S PRINCIPAL HEIGHT CONTROL as off-axis — so every fixture parcel
// resolved to `unrecovered` instead of a height. No error was raised anywhere: an absent field and
// an unrecognised value took the same path, which is §CONTEXT-DATA-HONESTY in its third costume.
// Recorded here rather than fixed quietly, because the general lesson is that **the two services
// do not share a schema and a reader that assumes they do fails silently in the safe-looking
// direction** (refusing everything), which is exactly the failure a green test suite hides.

/**
 * The quantity semantics of Principal/14, derived from its own `UNITS` domain.
 *
 * The layer IS the maximum building height control by definition — that is not an inference, it is
 * the Standard Instrument cl 4.3 map — so `direction` is always `'maximum'` and the axis is always
 * the envelope top. Only the DATUM varies, and `UNITS` states it:
 *
 *   `m`     → metres above existing ground level
 *   `m(RL)` → an absolute AHD level (corroborated by a populated `MAX_B_H_RL` column)
 *   `NA`    → the map applies and states no numeric control. ⛔ REFUSE — not unbounded (L-616).
 *
 * ⛔ An unrecognised `UNITS` value returns `constrainsEnvelopeTop: false` rather than defaulting to
 * metres, for the same reason `parseNswHeight` has no default branch: assuming metres for an
 * unknown domain member IS the fifty-metre error.
 */
export function nswPrincipalHobSemantics(units: string | null | undefined): NswQuantitySemantics {
    const u = units?.trim() ?? '';
    const layName = `Height of Buildings Map (UNITS=${u === '' ? 'absent' : u})`;
    if (u === 'm') return { ...MAX_HEIGHT_AGL, layName };
    if (u === 'm(RL)')
        return {
            layName,
            axis: 'envelope-top',
            direction: 'maximum',
            datum: 'AHD',
            bearsOnEnvelopeTop: true,
            servesNumber: true,
            constrainsEnvelopeTop: true,
            applicabilityOnly: false,
        };
    if (u === 'NA')
        return {
            layName,
            axis: 'envelope-top',
            direction: 'maximum',
            datum: null,
            // The control APPLIES and states no number, so it stays on the envelope-top axis: it
            // must reach the refusal path (`no-limit-stated`), not the off-axis exclusion path.
            bearsOnEnvelopeTop: true,
            servesNumber: true,
            constrainsEnvelopeTop: true,
            applicabilityOnly: false,
        };
    return { ...NSW_UNKNOWN_QUANTITY, layName };
}
