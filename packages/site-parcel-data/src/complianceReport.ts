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
    'alignment.offset',
    'alignment.sideTreatment',
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
    'alignment.offset': 'Offset from alignment (alineación)',
    'alignment.sideTreatment': 'Lateral boundaries',
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
        return value;
    }
    if (typeof value === 'number') {
        // Numeric: ratio for FAR, percent for coverage, metres for setbacks/height.
        if (constraint === 'maxFAR') return value.toFixed(2);
        // Coverage may arrive as a 0–1 fraction OR an already-percent number — normalise.
        if (constraint === 'maxCoverage') return `${(value <= 1 ? value * 100 : value).toFixed(0)}%`;
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
