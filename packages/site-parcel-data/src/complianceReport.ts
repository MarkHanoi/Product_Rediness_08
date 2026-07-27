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
}

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
    'alignment.offset': 'Offset from alignment (alineación)',
    'alignment.sideTreatment': 'Lateral boundaries',
    // §L-590b / ADR-0273. "of the block" is IN the label, not only in the citation: the whole
    // hazard of Art. 350's numbers is that 70 % and 90 % appear in the same article measured
    // against different things (C58 §1.11), and a row reading just "Band area" beside "Max site
    // coverage 90 %" invites exactly that conflation.
    'tier.bandAreaRatio': 'Upper-floor band, as a share of the BLOCK (franja concèntrica)',
    'tier.bandDepth': 'Upper-floor band depth from the block alignments',
    'tier.interiorHeight': 'Height in the block interior, beyond the band',
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
const DEPTH_BINDING_TEXT: Record<string, string> = {
    'interior-ratio': 'The interior free-space rule (≥30% of the block, PGM Art. 242.2)',
    'max-cap': 'The ordinance depth cap (30 m) — the block is deep enough that the free-space rule did not bind',
    'min-floor': 'The ordinance depth floor (11 m) — the free-space rule alone would give less',
};

/** Format a derivation value with the unit its constraint implies. */
export function formatConstraintValue(
    constraint: DerivationConstraint,
    value: number | string | readonly string[] | null,
): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') {
        if (value.trim() === '') return '—';
        // ADR-0270 P4 — expand the sideTreatment enum into words. Rendering `party-wall` raw
        // would show an internal token where a legal concept belongs.
        if (constraint === 'alignment.sideTreatment') return SIDE_TREATMENT_TEXT[value] ?? value;
        // ADR-0271 — same reason: `interior-ratio` is a token, not a legal statement.
        if (constraint === 'alignment.depthBinding') return DEPTH_BINDING_TEXT[value] ?? value;
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
    return value.length > 0 ? value.join(', ') : '—';
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
        rows.push({
            constraint,
            label: LABELS[constraint],
            valueText: formatConstraintValue(constraint, e.value),
            zoneCode: e.zoneCode,
            source: e.source,
            provenance: e.fieldProvenance,
            ordinanceRef: e.ordinanceRef ?? null,
            isEstimate: e.fieldProvenance === 'estimated',
        });
    }

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
