// L-402 (C58 §1.3) — the COMPLIANCE "EXPLAIN-WHY" REPORT.
//
// WHY THIS EXISTS
// ---------------
// A buildable envelope is only trustworthy if the user can see WHY each number is what
// it is. C58 §1.3 already requires every numeric constraint to carry a `DerivationEntry`
// (value + zoneCode + source + fieldProvenance + ordinanceRef). This module turns that
// raw trace into a PRESENTABLE, ordered report model — the thing a competitor (Archistar)
// actually sells: "3.0 m side setback ← zone P2, Plandata.dk §X", not just "3.0".
//
// PURE + L2: no DOM, no I/O, no formatting-locale surprises beyond `toFixed`. The UI layer
// renders these rows; tests pin the semantics. Nothing here recomputes geometry — it only
// EXPLAINS the envelope the engine already produced (single source of truth).
//
// HONESTY RULE (C58 §1.4): the report NEVER dresses an estimate up as authority. Each row
// carries its own provenance, and `estimatedRowCount` / `hasAnyEstimate` let the UI badge
// the report as a whole. A missing `ordinanceRef` renders as "no citation", not as blank.

import type { BuildableEnvelope, DerivationConstraint, FieldProvenance } from '@pryzm/schemas';

/** A single presentable "why" row — one constraint, fully sourced. */
export interface ComplianceReportRow {
    /** The raw constraint key (stable id for tests / UI keys). */
    readonly constraint: DerivationConstraint;
    /** Human label, e.g. "Front setback". */
    readonly label: string;
    /** Formatted value with unit, e.g. "3.0 m", "2.00", "residential" — or "—" when null. */
    readonly valueText: string;
    /** The zone the value came from (e.g. "P2"). */
    readonly zoneCode: string;
    /** The rule pack / provider that supplied it (e.g. "plandata-dk", "estimated-default"). */
    readonly source: string;
    /** Per-field provenance — drives the per-row badge. */
    readonly provenance: FieldProvenance;
    /** Citation where one exists, else null (UI shows "no citation"). */
    readonly ordinanceRef: string | null;
    /** True when this row is an ESTIMATE (not published/ordinance-backed). */
    readonly isEstimate: boolean;
    /**
     * §PARCEL-LAW-UNRESOLVED -- FALSE when the entry exists but resolved to NO VALUE (`valueText`
     * is the em-dash). The source WAS consulted and states nothing, which is a different fact from
     * both "2.00 from Plandata §4.3" and "nothing in our pack addressed this". Without it the
     * renderer prints a bare em-dash under a green PUB pill, which reads as "published: nothing".
     */
    readonly hasStatedValue: boolean;
}

// -- §PARCEL-LAW-UNRESOLVED (STR §25.1 block B · C58 §1.3/§1.4 · L-616) ----------------------
//
// THE DEFECT THIS CLOSES. `buildComplianceReport` used to `continue` past any constraint the
// derivation did not carry, so a constraint the CARD PRINTS A ROW FOR -- block B renders Max
// height / Storeys / Max FAR / Max site coverage on EVERY parcel -- vanished entirely from the
// "Why these numbers?" fold beneath it. The reader was then unable to separate two facts that
// carry opposite consequences on real land:
//
//   * "we did not look up FAR for this zone"  <- a hole in OUR data
//   * "this zone states no FAR limit"          <- a finding about the ORDINANCE
//
// L-616 names the cost: an UNKNOWN constraint that reads as absent is an OVERSTATEMENT on real
// land, because the reader completes it as "unbounded". STR §25.1 requires the citation to be held
// PER ROW; a row whose citation slot silently disappears is the same conflation wearing a fold.
//
// AND IT MINTS NO VALUE. An unresolved row carries a LABEL and a REASON and never a number -- it
// is the honest blank, not a synthesised figure (§CONFIDENT-REGISTER-ROWS: the prose-justified
// verdicts were the wrong ones; the honest blanks were the safe ones).
//
// IT IS DELIBERATELY NOT "every constraint in CONSTRAINT_ORDER". Minting "Upper-floor band ratio
// -- not derived" on a Danish parcel would be an overstatement in the OPPOSITE direction: a claim
// that Art. 350.2 was something we should have looked up there. Only the constraints the card
// ASSERTS A ROW FOR unconditionally earn an unresolved slot, because only those were promised to
// the reader. Setbacks are excluded for the same reason: on an alignment zone they are null BY
// DESIGN (§L-518c), so an unresolved setback row would report a correct determination as a gap.
//
// `rows` IS UNCHANGED. A derivation entry whose VALUE is null still produces an ordinary row (it
// has a real zone/source/citation -- we consulted a source and it stated nothing, which is a
// stronger fact than silence). `hasStatedValue` lets the renderer say so instead of printing a
// bare em-dash under a green PUB pill. Membership of `rows`, `estimatedRowCount` and the
// `resolveHeadlineProvenance` ladder are all untouched, so no confidence reading moves.

/**
 * A slot the card promised and the derivation trace does not fill. It has no value of its own and
 * never invents one; it exists so the citation slot survives the absence.
 */
export interface ComplianceUnresolvedRow {
    /**
     * Stable id. Equals the `DerivationConstraint` for the three constraint-backed rows;
     * `maxFloors` for the storey count, which is an envelope FIELD with no constraint key.
     * Deliberately a plain string rather than a widened L0 enum -- adding a literal to
     * `DerivationConstraintSchema` to satisfy a UI fold would push a presentation need into a
     * pure schema (P5).
     */
    readonly id: string;
    /** Human label -- the SAME wording block B's own row uses, so the two read as one fact. */
    readonly label: string;
    /**
     * `no-value` -- the card row reads "not derived" and there is nothing to cite. The honest
     * sentence is "a missing lookup, NOT a finding that the zone is unlimited" (L-616).
     *
     * `value-without-citation` -- the envelope carries a NUMBER for this field and the derivation
     * carries no entry explaining it, so block B PRINTS A FIGURE the fold cannot source. C58 §1.3
     * requires every numeric constraint to carry a `DerivationEntry`; this is that breach, and it
     * is the worse of the two because a number on screen with no provenance reads as authoritative.
     */
    readonly reason: 'no-value' | 'value-without-citation';
}

/**
 * The constraints block B of the Parcel Law card (STR §25.1) prints on EVERY parcel. Exported so a
 * test can pin the SET rather than a count -- this repo's own recurring lesson is that a count can
 * be right while the range is wrong.
 */
export const CARD_ASSERTED_CONSTRAINTS: readonly DerivationConstraint[] = [
    'maxHeight',
    'maxFAR',
    'maxCoverage',
];

/** Label for the storey row, which is an envelope field and has no `DerivationConstraint`. */
const MAX_FLOORS_LABEL = 'Storeys';
/** Stable id for that same row. */
export const MAX_FLOORS_ROW_ID = 'maxFloors';

/** The full report model the UI renders. */
export interface ComplianceReport {
    /** Envelope-level confidence label (C58 §1.2) — never absent. */
    readonly confidence: BuildableEnvelope['confidence'];
    /** Solver status — `ok` means a usable envelope was produced. */
    readonly status: BuildableEnvelope['status'];
    /** Ordered constraint rows (setbacks → height → FAR → coverage → use). */
    readonly rows: readonly ComplianceReportRow[];
    /** Buildable footprint area (m²) — the inset ring's area. */
    readonly buildableFootprintM2: number;
    /** Max height (m) when known. */
    readonly maxHeightM: number | null;
    /** Max FAR when known. */
    readonly maxFAR: number | null;
    /** `footprint × FAR` — the indicative max gross floor area (m²), when FAR is known. */
    readonly maxGrossFloorAreaM2: number | null;
    /** How many rows are estimates (drives the "Estimated" badge + caveat). */
    readonly estimatedRowCount: number;
    /** True when ANY row is an estimate — the report must not read as authoritative. */
    readonly hasAnyEstimate: boolean;
    /**
     * §PARCEL-LAW-UNRESOLVED — the slots block B of the Parcel Law card promised and the
     * derivation does not fill. NEVER folded into `rows`: `rows.length` is the denominator of the
     * "N of M value(s) are ESTIMATED" sentence, and quietly growing it would restate an existing
     * honest sentence as a different quantity (the L-526 failure class).
     */
    readonly unresolvedRows: readonly ComplianceUnresolvedRow[];
    /** How many promised slots are unfilled (drives the fold's own caveat). */
    readonly unresolvedRowCount: number;
}

/** Stable presentation order — how an architect reads a zoning determination. */
const CONSTRAINT_ORDER: readonly DerivationConstraint[] = [
    // ADR-0270 P4 — the alignment rows lead. On an *ensanche* parcel the alignment + depth ARE
    // the governing rule; the setback triple is a secondary detail (often all-zero). Listing
    // them first is not cosmetic: reading order is what tells an architect which rule shaped
    // the envelope, and burying the depth under three zeros is how the old panel misled.
    'alignment.depth',
    // ADR-0271 — immediately after the depth it explains. A constructed depth read without its
    // binding looks like a figure the ordinance stated, which is the one thing it is not.
    'alignment.depthBinding',
    // §BCN-OV-CONFIDENCE (L-1660) — leads for the same reason the depth rows do: on an
    // explicit-area parcel the published footprint IS the governing rule, and this row names
    // the fact that the envelope was clipped to it (vs covering the whole plot).
    'explicitArea.footprintBinding',
    'alignment.offset',
    'alignment.sideTreatment',
    // §L-590b / ADR-0273 — the tier rows lead for the same reason the alignment rows do: on an
    // Art. 350.2 parcel the tier split IS the governing rule, and a reader who meets "Max height"
    // first will take one number for the whole building when the ordinance grants two. The ratio
    // comes before the depth it produces, and the block-interior height last, because that is the
    // order the article argues in (350.2.b → its depth → 350.2.e).
    'tier.bandAreaRatio',
    'tier.bandDepth',
    'tier.interiorHeight',
    // ADR-0288 — occupation-capped alignment (§COR-MC-FOOTPRINT). Same reasoning as the two
    // families above: on this kind the occupation cap IS what shaped the footprint, so the ratio
    // and the depth PRYZM constructed from it lead, ahead of the plain setback/coverage rows.
    'occupationCap.ratio',
    'occupationCap.targetAreaM2',
    'occupationCap.depth_m',
    'setback.front',
    'setback.side',
    'setback.rear',
    'maxHeight',
    'maxFAR',
    'maxCoverage',
    'permittedUse',
];

const LABELS: Record<DerivationConstraint, string> = {
    // Keep the local legal term alongside the English — it is what appears in the ordinance the
    // citation points at, so a user checking the source can find the clause.
    'alignment.depth': 'Buildable depth (profundidad edificable)',
    'alignment.depthBinding': 'Depth determined by',
    // §BCN-OV-CONFIDENCE (L-1660) — the explicit-area analogue of "Depth determined by".
    'explicitArea.footprintBinding': 'Footprint determined by',
    'alignment.offset': 'Offset from alignment (alineación)',
    'alignment.sideTreatment': 'Lateral boundaries',
    // §L-590b / ADR-0273. "of the block" is IN the label, not only in the citation: the whole
    // hazard of Art. 350's numbers is that 70 % and 90 % appear in the same article measured
    // against different things (C58 §1.11), and a row reading just "Band area" beside "Max site
    // coverage 90 %" invites exactly that conflation.
    'tier.bandAreaRatio': 'Upper-floor band, as a share of the BLOCK (franja concèntrica)',
    'tier.bandDepth': 'Upper-floor band depth from the block alignments',
    'tier.interiorHeight': 'Height in the block interior, beyond the band',
    // ADR-0288 — ⚠ the depth here is a PRYZM-CONSTRUCTED shape choice, not an ordinance-stated
    // figure (see `OccupationCappedAlignmentRuleSchema`'s header) — the label says "constructed"
    // rather than echoing the "Buildable depth" wording used for a genuinely stated depth above,
    // so a reader cannot mistake the two for the same kind of fact.
    'occupationCap.ratio': 'Occupation cap (ocupación)',
    'occupationCap.targetAreaM2': 'Target footprint area from the occupation cap',
    'occupationCap.depth_m': 'PRYZM-constructed depth to meet the occupation cap (not ordinance-stated)',
    'setback.front': 'Front setback',
    'setback.side': 'Side setback',
    'setback.rear': 'Rear setback',
    maxHeight: 'Max height',
    maxFAR: 'Max FAR',
    maxCoverage: 'Max site coverage',
    permittedUse: 'Permitted use',
};

/** Human wording for the `sideTreatment` enum — never show a raw code to a user. */
const SIDE_TREATMENT_TEXT: Record<string, string> = {
    'party-wall': 'Party wall (medianera) — built to both side boundaries',
    setback: 'Side setback',
};

/**
 * ADR-0271 — human wording for the block-depth `binding`. These are not synonyms: each names a
 * DIFFERENT article doing the work, and an architect checking the citation needs to land on the
 * right clause. `min-floor` in particular is a warning, not a result — it means the Art. 242.2
 * construction wanted LESS than the ordinance floor, so the floor is what governs.
 */
/**
 * §BCN-OV-CONFIDENCE (L-1660) — human wording for the explicit-area `footprintBinding` tokens.
 * Both name the SAME source of authority (the ordinance's own per-site ordering, published as
 * geometry); they differ in whether the published shape actually bit into this parcel.
 */
const FOOTPRINT_BINDING_TEXT: Record<string, string> = {
    'clipped-to-published-footprint':
        'The published per-site ordering (the plan publishes the buildable footprint as geometry; the envelope is the parcel ∩ that footprint)',
    'footprint-covers-parcel':
        'The published per-site ordering — its footprint covers this parcel entirely, so the whole plot is buildable',
};

const DEPTH_BINDING_TEXT: Record<string, string> = {
    'interior-ratio': 'The interior free-space rule (≥30% of the block, PGM Art. 242.2)',
    'max-cap': 'The ordinance depth cap (30 m) — the block is deep enough that the free-space rule did not bind',
    'min-floor': 'The ordinance depth floor (11 m) — the free-space rule alone would give less',
};

/**
 * The single spelling of "this constraint resolved to nothing". §PARCEL-LAW-UNRESOLVED reads
 * `hasStatedValue` off a comparison against THIS constant rather than re-deciding emptiness with a
 * second predicate beside the formatter that already decided it.
 */
export const EMPTY_VALUE_TEXT = '—';

/** Format a derivation value with the unit its constraint implies. */
export function formatConstraintValue(
    constraint: DerivationConstraint,
    value: number | string | readonly string[] | null,
): string {
    if (value === null || value === undefined) return EMPTY_VALUE_TEXT;
    if (typeof value === 'string') {
        if (value.trim() === '') return EMPTY_VALUE_TEXT;
        // ADR-0270 P4 — expand the sideTreatment enum into words. Rendering `party-wall` raw
        // would show an internal token where a legal concept belongs.
        if (constraint === 'alignment.sideTreatment') return SIDE_TREATMENT_TEXT[value] ?? value;
        // ADR-0271 — same reason: `interior-ratio` is a token, not a legal statement.
        if (constraint === 'alignment.depthBinding') return DEPTH_BINDING_TEXT[value] ?? value;
        // §BCN-OV-CONFIDENCE (L-1660) — same reason again for the explicit-area binding tokens.
        if (constraint === 'explicitArea.footprintBinding') return FOOTPRINT_BINDING_TEXT[value] ?? value;
        return value;
    }
    if (typeof value === 'number') {
        // Numeric: ratio for FAR, percent for coverage, metres for setbacks/height.
        if (constraint === 'maxFAR') return value.toFixed(2);
        // Coverage may arrive as a 0–1 fraction OR an already-percent number — normalise.
        if (constraint === 'maxCoverage') return `${(value <= 1 ? value * 100 : value).toFixed(0)}%`;
        // §L-590b — the band ratio is a SHARE OF THE BLOCK, not a length. Without this it would
        // fall through to the metres default and print "0.7 m" for Art. 350.2.b's 70 %: a real
        // ordinance figure rendered as a completely different quantity, under a correct citation
        // — the C58 §1.11 category error, produced by a formatting default. The unit is spelled
        // out rather than left to the `%` sign because the row sits two lines from "Max site
        // coverage 90 %", which is a share of the PARCEL.
        if (constraint === 'tier.bandAreaRatio') {
            return `${(value <= 1 ? value * 100 : value).toFixed(0)}% of the block`;
        }
        return `${value.toFixed(1)} m`;
    }
    // Remaining case: a list of permitted uses (readonly string[]).
    return value.length > 0 ? value.join(', ') : EMPTY_VALUE_TEXT;
}

/**
 * Build the presentable compliance report from an envelope. PURE — it only explains what
 * the engine produced; it never recomputes or "improves" a number. Rows appear in
 * CONSTRAINT_ORDER; constraints absent from the derivation are simply omitted (we never
 * invent a row for a value the engine did not resolve).
 */
export function buildComplianceReport(envelope: BuildableEnvelope | null): ComplianceReport | null {
    if (!envelope) return null;

    const byConstraint = new Map<DerivationConstraint, BuildableEnvelope['derivation'][number]>();
    for (const entry of envelope.derivation ?? []) {
        // First entry wins — the engine emits one per resolved constraint (C58 §1.3).
        if (!byConstraint.has(entry.constraint)) byConstraint.set(entry.constraint, entry);
    }

    const rows: ComplianceReportRow[] = [];
    for (const constraint of CONSTRAINT_ORDER) {
        const e = byConstraint.get(constraint);
        if (!e) continue;
        const valueText = formatConstraintValue(constraint, e.value);
        rows.push({
            constraint,
            label: LABELS[constraint],
            valueText,
            zoneCode: e.zoneCode,
            source: e.source,
            provenance: e.fieldProvenance,
            ordinanceRef: e.ordinanceRef ?? null,
            isEstimate: e.fieldProvenance === 'estimated',
            // §PARCEL-LAW-UNRESOLVED — the formatter is the ONE authority on "did this resolve to
            // anything": it already collapses null, '' and [] to the em-dash, and re-deciding that
            // here with a second predicate is how a card comes to disagree with its own fold.
            hasStatedValue: valueText !== EMPTY_VALUE_TEXT,
        });
    }

    // ── §PARCEL-LAW-UNRESOLVED — the promised-but-unfilled slots (C58 §1.3/§1.4, L-616). ──
    // Read off the ENVELOPE's own scalars, because the two arms are only distinguishable there:
    // a field carrying a number with no derivation entry is a §1.3 breach (an uncited figure is
    // on screen); a field carrying null with no entry is an honest hole. `rows` is not consulted
    // and not modified.
    const numberOrNull = (v: unknown): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? v : null;
    const envelopeScalarFor = (id: string): number | null => {
        switch (id) {
            case 'maxHeight': return numberOrNull(envelope.maxHeight_m);
            case 'maxFAR': return numberOrNull(envelope.maxFAR);
            case 'maxCoverage': return numberOrNull(envelope.maxCoverage);
            case MAX_FLOORS_ROW_ID: return numberOrNull(envelope.maxFloors);
            default: return null;
        }
    };
    const unresolvedRows: ComplianceUnresolvedRow[] = [];
    for (const constraint of CARD_ASSERTED_CONSTRAINTS) {
        if (byConstraint.has(constraint)) continue;
        unresolvedRows.push({
            id: constraint,
            label: LABELS[constraint],
            reason: envelopeScalarFor(constraint) !== null ? 'value-without-citation' : 'no-value',
        });
    }
    // Storeys last, mirroring block B's own reading order. It has NO constraint key at all, so it
    // is always unresolved-or-uncited by construction — which is itself the honest statement: the
    // card prints a storey count that the explain-why trace has never been able to source.
    unresolvedRows.push({
        id: MAX_FLOORS_ROW_ID,
        label: MAX_FLOORS_LABEL,
        reason: envelopeScalarFor(MAX_FLOORS_ROW_ID) !== null ? 'value-without-citation' : 'no-value',
    });

    const estimatedRowCount = rows.reduce((n, r) => n + (r.isEstimate ? 1 : 0), 0);
    const footprint = Number.isFinite(envelope.insetAreaM2) ? envelope.insetAreaM2 : 0;
    const far = typeof envelope.maxFAR === 'number' && Number.isFinite(envelope.maxFAR) ? envelope.maxFAR : null;

    return {
        confidence: envelope.confidence,
        status: envelope.status,
        rows,
        buildableFootprintM2: footprint,
        maxHeightM:
            typeof envelope.maxHeight_m === 'number' && Number.isFinite(envelope.maxHeight_m)
                ? envelope.maxHeight_m
                : null,
        maxFAR: far,
        // Indicative only — the real GFA depends on the authored storeys; this is the
        // zoning CEILING (footprint × FAR), which is what a feasibility read wants.
        maxGrossFloorAreaM2: far !== null ? footprint * far : null,
        estimatedRowCount,
        hasAnyEstimate: estimatedRowCount > 0,
        unresolvedRows,
        unresolvedRowCount: unresolvedRows.length,
    };
}

// ── STRUCTURAL-SEAM-3 (C58 §5.4) — the HEADLINE chip is a pure derivation over the SAME per-field
// provenance the rows carry ─────────────────────────────────────────────────────────────────────
//
// WHY THIS EXISTS (L-630, the NL smoking gun)
// -------------------------------------------
// The card shows ONE headline confidence chip. Historically it was keyed off the scalar
// `env.confidence` alone, so it could read `structured` / `block-constructed` while a *field* in
// the very same "Why these numbers?" table was `estimated` — the header out-ranking its own rows.
// And the inverse, live on prod: a real Amsterdam PDOK envelope (height = published-structured
// 16.5 m, footprint = real zone geometry) was badged "ESTIMATED / Default rule pack" because the
// whole-envelope `confidence` was pushed to `estimated-ruleset` for a DIFFERENT reason (the
// footprint is a zone-extent UPPER BOUND) than the caption claimed. The scalar collapsed the
// per-field truth and then mis-stated the reason.
//
// THE RULE (C58 §5.4a): the headline reflects the WEAKEST per-field provenance — it must never read
// stronger than its weakest row, and it must never read `estimated` when NO field is estimated.
// This helper is the single pure authority for that; the card only maps its output to pixels.

/** Provenance strength ladder (C58 §1.6). Higher = stronger; the headline takes the MINIMUM. */
const PROVENANCE_RANK: Record<FieldProvenance, number> = {
    'published-structured': 3,
    'ordinance-pdf': 2,
    'pipeline-extracted': 1,
    estimated: 0,
};

/** The headline-chip honesty model, derived purely from a `ComplianceReport`. */
export interface HeadlineProvenance {
    /** The WEAKEST per-field provenance across all derivation rows; null when there are no rows. */
    readonly weakestField: FieldProvenance | null;
    /** True when ≥1 derivation row carries a real (non-`estimated`) provenance. */
    readonly hasRealField: boolean;
    /** True when ≥1 derivation row is an `estimated` value (mirrors `report.hasAnyEstimate`). */
    readonly hasEstimatedField: boolean;
    /**
     * L-630. TRUE when the envelope-level `confidence` reads WEAKER than the rows justify —
     * specifically `estimated-ruleset` while NO field is actually estimated (every row is real /
     * published). The scalar was reduced for a reason OTHER than field provenance (a zone-extent /
     * upper-bound footprint — the NL PDOK case), so the card MUST NOT badge it "Estimated /
     * default rule pack": it must reflect the real fields and state the true reason.
     */
    readonly confidenceUnderRatesFields: boolean;
}

/**
 * Resolve the headline-chip honesty model from a compliance report (C58 §5.4a). PURE — a total
 * function of the report's per-field provenance + its echoed `confidence`; it invents nothing and
 * never out-ranks the rows. The UI maps the result to a chip + caption; tests pin the semantics.
 */
export function resolveHeadlineProvenance(report: ComplianceReport | null): HeadlineProvenance {
    if (!report) {
        return {
            weakestField: null,
            hasRealField: false,
            hasEstimatedField: false,
            confidenceUnderRatesFields: false,
        };
    }
    let weakest: FieldProvenance | null = null;
    for (const row of report.rows) {
        if (weakest === null || PROVENANCE_RANK[row.provenance] < PROVENANCE_RANK[weakest]) {
            weakest = row.provenance;
        }
    }
    const hasEstimatedField = report.hasAnyEstimate;
    const hasRealField = report.rows.some((r) => !r.isEstimate);
    const confidenceUnderRatesFields =
        report.confidence === 'estimated-ruleset' && hasRealField && !hasEstimatedField;
    return { weakestField: weakest, hasRealField, hasEstimatedField, confidenceUnderRatesFields };
}
