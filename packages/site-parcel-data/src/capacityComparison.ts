// L-456 (C58 §1.3/§1.4/§1.8) — the CAPACITY COMPARISON model: what you HAVE DESIGNED versus
// what the plot PERMITS.
//
// WHY THIS EXISTS
// ---------------
// An envelope on its own answers "what is the limit here". The question an architect actually
// asks — and what a *proyecto de ejecución* has to answer line by line — is "how much have I
// used, how much is left, and am I over?". That is a COMPARISON, and until now nothing in the
// product computed one: the envelope card showed permitted values, the model held the design,
// and the user did the arithmetic in their head.
//
// PURE + L2. It recomputes NO geometry: the permitted side comes from the envelope the engine
// already produced, the proposed side is measured by the caller from the authored model, and
// this module only compares them. Single source of truth on both sides.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// THE THREE HONESTY RULES — this feature is DANGEROUS without them
// ─────────────────────────────────────────────────────────────────────────────────────────
// A comparison panel invites a green tick, and a green tick is a compliance claim. Everything
// C58 §1.4 forbids about presenting a guess as a fact applies here with MORE force, because a
// verdict is more assertive than a number.
//
//  1. UNKNOWN IS NOT COMPLIANT. If the permitted value is null (no FAR published, no height in
//     the pack), the row is `'unknown'` — never `'within'`. Absence of a limit is not proof of
//     compliance, and rendering it as a pass would manufacture permission out of missing data.
//  2. A VERDICT INHERITS THE WEAKEST INPUT. `basis` carries the envelope's confidence, and
//     `isIndicativeOnly` is true for anything short of an authoritative determination. Checking
//     a design against the ESTIMATED default pack (3.0/1.5/3.0, FAR 2.0) and reporting
//     "COMPLIANT" would be a fabricated compliance claim about a real building.
//  3. MEASURE, NEVER INFER. A proposed value the caller could not measure stays null and reads
//     as unknown. Do not substitute footprint × floors for an unmeasured GFA — that is a
//     plausible number, which is exactly the failure mode that keeps recurring here.
//
// Strategic context: C58 §1.3 (explain-why), §1.4 (never present a guess as a fact),
// §1.8 (envelope → generation bridge), §1.11 (granularity). Audit item L-456.

import type { BuildableEnvelope } from '@pryzm/schemas';

/**
 * The "at the limit" half-band, in the METRIC'S OWN UNIT — m² for areas, m for height,
 * storeys for floors. A proposed value within ±0.05 of the permitted value reads
 * `'at-limit'` rather than `'over'`/`'within'`. This is a DOMAIN VERDICT BAND, not a
 * float epsilon: 0.05 m² / 5 cm is a deliberate judgement of "equal for compliance
 * purposes" (measured GFA is never sub-decimetre-exact). Folding it onto the kernel's
 * `COINCIDENT_M` (0.001 m) would TIGHTEN it 50× and flip real at-limit rows to
 * over/within — a behaviour change, not a cleanup (C73 §2.1: domain bands stay under
 * their own owner).
 */
export const CAPACITY_AT_LIMIT_BAND_M2_OR_M = 0.05;

/**
 * The DESIGN as measured from the authored model. Every field is nullable because every field
 * is genuinely unmeasurable in some project state — an empty project has no floors, a massing
 * study has no rooms. **A null here must travel all the way to the UI as "—", never as 0**:
 * zero is a measurement, absence is not.
 */
export interface MeasuredDesign {
    /** *Ocupación* — the built ground-floor footprint (m²). */
    readonly footprintM2: number | null;
    /** *Superficie construida* — gross floor area, all storeys (m²). */
    readonly grossFloorAreaM2: number | null;
    /** *Superficie útil* — net usable area, i.e. summed room areas (m²). */
    readonly netFloorAreaM2: number | null;
    /** Built height (m), ground to top. */
    readonly heightM: number | null;
    /** Storey count. */
    readonly floors: number | null;
}

export type CapacityMetric =
    | 'footprint'
    | 'grossFloorArea'
    | 'netFloorArea'
    | 'height'
    | 'floors';

/**
 * `'within'`  — measured and permitted, and inside the limit.
 * `'at-limit'` — equal within {@link CAPACITY_AT_LIMIT_BAND_M2_OR_M}.
 * `'over'`    — exceeds the limit.
 * `'unknown'` — either side missing. **NOT a pass** (honesty rule 1).
 * `'no-limit'`— measured, and the ordinance sets no limit for this metric. Distinct from
 *               `'unknown'`: "the rule says nothing" is a FINDING; "we don't know" is not.
 */
export type CapacityStatus = 'within' | 'at-limit' | 'over' | 'unknown' | 'no-limit';

export interface CapacityRow {
    readonly metric: CapacityMetric;
    readonly label: string;
    /** Local legal term, shown alongside the label so it matches the ordinance. */
    readonly localTerm: string | null;
    readonly proposed: number | null;
    readonly permitted: number | null;
    readonly unit: 'm2' | 'm' | 'floors';
    /** `permitted − proposed`; null when either side is unknown. Negative ⇒ over. */
    readonly remaining: number | null;
    /** `proposed / permitted × 100`; null when either side is unknown or permitted is 0. */
    readonly utilisationPct: number | null;
    readonly status: CapacityStatus;
}

export interface CapacityComparison {
    readonly rows: readonly CapacityRow[];
    /** Envelope confidence this verdict rests on (C58 §1.2). */
    readonly basis: BuildableEnvelope['confidence'];
    /**
     * TRUE unless the envelope is an authoritative determination. The UI MUST NOT render an
     * unqualified "compliant" when this is set — see honesty rule 2.
     */
    readonly isIndicativeOnly: boolean;
    /** Rows strictly over the limit. */
    readonly overCount: number;
    /** Rows that could not be judged (either side unknown). */
    readonly unknownCount: number;
    /**
     * `true` only when at least one row was judged AND none is over. **Never `true` on an
     * all-unknown comparison** — that would turn "we know nothing" into "everything is fine".
     */
    readonly allJudgedWithin: boolean;
}

const LABELS: Record<CapacityMetric, { label: string; localTerm: string | null; unit: 'm2' | 'm' | 'floors' }> = {
    footprint: { label: 'Footprint', localTerm: 'ocupación', unit: 'm2' },
    grossFloorArea: { label: 'Gross floor area', localTerm: 'superficie construida', unit: 'm2' },
    netFloorArea: { label: 'Net floor area', localTerm: 'superficie útil', unit: 'm2' },
    height: { label: 'Height', localTerm: 'altura reguladora', unit: 'm' },
    floors: { label: 'Storeys', localTerm: 'plantas', unit: 'floors' },
};

/** Judge one metric. `permitted === undefined` ⇒ the ordinance sets no limit for it. */
function judge(
    metric: CapacityMetric,
    proposed: number | null,
    permitted: number | null | undefined,
): CapacityRow {
    const meta = LABELS[metric];
    const noLimit = permitted === undefined;
    const p = proposed;
    const lim = noLimit ? null : (permitted as number | null);

    let status: CapacityStatus;
    if (p === null || !Number.isFinite(p)) {
        // Nothing measured — unknown regardless of the limit. Cannot judge what isn't measured.
        status = 'unknown';
    } else if (noLimit) {
        status = 'no-limit';
    } else if (lim === null || !Number.isFinite(lim)) {
        // Honesty rule 1 — a missing limit is NOT a pass.
        status = 'unknown';
    } else if (p > lim + CAPACITY_AT_LIMIT_BAND_M2_OR_M) {
        status = 'over';
    } else if (p >= lim - CAPACITY_AT_LIMIT_BAND_M2_OR_M) {
        status = 'at-limit';
    } else {
        status = 'within';
    }

    const judged = status === 'within' || status === 'at-limit' || status === 'over';
    return {
        metric,
        label: meta.label,
        localTerm: meta.localTerm,
        proposed: p,
        permitted: lim,
        unit: meta.unit,
        remaining: judged && p !== null && lim !== null ? lim - p : null,
        utilisationPct:
            judged && p !== null && lim !== null && lim > 0 ? (p / lim) * 100 : null,
        status,
    };
}

/**
 * Compare a measured design against the envelope's permitted capacity.
 *
 * `maxFloors` is passed separately because `BuildableEnvelope` carries it as a resolved number
 * but — a pre-existing gap — never emits a derivation entry for it, so it is not reachable
 * through the compliance report.
 *
 * PURE. Never throws. Returns rows in the order an architect reads a capacity table: what the
 * building covers, then what it contains, then how tall it is.
 */
export function buildCapacityComparison(
    envelope: BuildableEnvelope | null,
    design: MeasuredDesign,
    opts?: { readonly maxFloors?: number | null },
): CapacityComparison | null {
    if (!envelope) return null;

    // The permitted footprint IS the buildable ring's area — that is precisely what the inset
    // polygon means, so no separate coverage rule is needed for this row.
    const permittedFootprint =
        envelope.status === 'ok' && Number.isFinite(envelope.insetAreaM2)
            ? envelope.insetAreaM2
            : null;

    // §1.8 — the zoning ceiling is buildable footprint × FAR. When FAR is absent the ordinance
    // genuinely sets no floor-area ceiling by this mechanism (many PGM-style zones regulate by
    // depth + height instead), which is `no-limit`, NOT `unknown`.
    const maxFAR = envelope.maxFAR;
    const permittedGFA =
        maxFAR === null
            ? undefined
            : permittedFootprint !== null
              ? permittedFootprint * maxFAR
              : null;

    const rows: CapacityRow[] = [
        judge('footprint', design.footprintM2, permittedFootprint),
        judge('grossFloorArea', design.grossFloorAreaM2, permittedGFA),
        // NET floor area has NO regulated counterpart — *superficie útil* is not what zoning
        // caps. It is reported for the *proyecto de ejecución* schedule, never judged, so it
        // gets an explicit no-limit rather than a fabricated comparison against the GFA cap.
        judge('netFloorArea', design.netFloorAreaM2, undefined),
        judge('height', design.heightM, envelope.maxHeight_m),
        // §L-456 UI-WIRING FIX — a storey cap we were not given is UNKNOWN, never `no-limit`.
        // This previously read `opts?.maxFloors ?? undefined`, which routed BOTH "the caller
        // passed null" and "the caller passed nothing" into the `no-limit` branch — i.e. the
        // panel would state that the ordinance sets NO storey cap. `BuildableEnvelope.maxFloors`
        // is `null` both when a rule pack derived no cap and when the ordinance genuinely sets
        // none; the envelope does not distinguish them, so we cannot either. Under honesty
        // rule 1 the two must not be collapsed, and the direction of the collapse matters:
        // `no-limit` is a FINDING about the law, and asserting one we cannot support invents a
        // permission. `null` (unknown) is the only claim the data supports.
        judge('floors', design.floors, opts?.maxFloors ?? null),
    ];

    const overCount = rows.filter((r) => r.status === 'over').length;
    const unknownCount = rows.filter((r) => r.status === 'unknown').length;
    const judgedCount = rows.filter(
        (r) => r.status === 'within' || r.status === 'at-limit' || r.status === 'over',
    ).length;

    return {
        rows,
        basis: envelope.confidence,
        // Only an `authoritative` envelope supports an unqualified verdict. Both
        // `estimated-ruleset` and `structured` remain indicative: structured means the numbers
        // were published, not that a determination was issued.
        isIndicativeOnly: envelope.confidence !== 'authoritative',
        overCount,
        unknownCount,
        allJudgedWithin: judgedCount > 0 && overCount === 0,
    };
}
