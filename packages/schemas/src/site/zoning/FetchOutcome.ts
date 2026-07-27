// STRUCTURAL-SEAM-4 (§CONTEXT-DATA-HONESTY / L-422/457/467/469) — the ONE shared fetch-outcome union
// every parcel/zoning provider, resolver and proxy classifies through, so a TRANSIENT fetch failure
// and a GENUINE data-absence can never again collapse to the same VALUE (and therefore the same card).
//
// WHY THIS IS HERE, AND PURE
// --------------------------
// This is the L0 generalisation of the PROVEN context-building union
// (`'ok'|'aborted'|'unavailable'|'disabled'`, `contextBuildings.ts`, C12 §8) that already keeps an
// empty apart from an unavailable end-to-end. It is a pure data shape + pure classifiers — zero I/O,
// zero THREE, zero DOM (P5) — so both L0-consuming resolvers (`@pryzm/site-parcel-data`) and the L5
// dispatcher (`apps/editor`) bind to the SAME vocabulary rather than each re-inventing an ad-hoc
// reason enum. The retry-with-backoff that acts on a `'transient'` lives one layer up (it needs a
// clock); this module stays pure.
//
// Contract: C57 §1.5 (AMENDED 2026-07-26 — providers return this, never a bare `T | null`) and
// C58 §1.13.8 (the sibling amendment: the resolver's transient-vs-absent status MUST reach the card).
// The discriminant names here (`found | absent | transient | aborted`) are the ones C57 §1.5 fixes
// normatively.

/**
 * The result of a fetch through a provider/resolver/proxy, classified so an empty answer and a
 * failure are DIFFERENT answers.
 *
 *   • `found`     — the source answered and there IS a value (the parcel/plan/ring/…). CACHEABLE.
 *   • `absent`    — the source answered and there is genuinely NOTHING here (no parcel, no adopted
 *                   plan, no bouwvlak at this point). A DURABLE coverage fact — cacheable, and NOT
 *                   retryable: re-asking will return the same empty. Surfaces as "no plan published
 *                   here", never as "retrying".
 *   • `transient` — a network error / non-OK upstream / timeout: the source did not answer. RETRYABLE
 *                   (see the bounded retry one layer up). Surfaces as "temporarily unavailable —
 *                   retrying", NEVER cached, NEVER shown as "nothing here".
 *   • `aborted`   — superseded by a newer request (the user re-selected). NOT a failure, NOT cached,
 *                   buys no fallback — the newer request paints. Mirrors the context-building `aborted`.
 */
export type FetchOutcome<T> =
    | { readonly status: 'found'; readonly value: T }
    | { readonly status: 'absent'; readonly reason: string }
    | { readonly status: 'transient'; readonly reason: string }
    | { readonly status: 'aborted'; readonly reason?: string };

/** Construct a `found` outcome. */
export function fetchFound<T>(value: T): FetchOutcome<T> {
    return { status: 'found', value };
}
/** Construct an `absent` outcome (a durable "nothing here"). */
export function fetchAbsent<T>(reason: string): FetchOutcome<T> {
    return { status: 'absent', reason };
}
/** Construct a `transient` outcome (a retryable "the source did not answer"). */
export function fetchTransient<T>(reason: string): FetchOutcome<T> {
    return { status: 'transient', reason };
}
/** Construct an `aborted` outcome (superseded — not a failure). */
export function fetchAborted<T>(reason?: string): FetchOutcome<T> {
    return { status: 'aborted', reason };
}

/** Is this outcome the retryable transient class? (The ONLY class the auto-retry acts on.) */
export function isTransientOutcome<T>(o: FetchOutcome<T>): boolean {
    return o.status === 'transient';
}

/**
 * The closed set of resolver/provider REASON tokens that mean "the source did not answer" — i.e.
 * classify to `transient`, not `absent`. Every zoning resolver in `@pryzm/site-parcel-data` shares
 * `endpoint-unreachable` (+ its `no-fetch` internal alias) for exactly this; the others are the
 * proxy/network vocabulary. Anything NOT in this set (`no-plan`, `no-bouwvlak`, `no-feature`,
 * `degenerate-geometry`, `no-point`, `ringref-mismatch`, …) is a GENUINE-ABSENCE reason.
 *
 * ⚠ This is the load-bearing table the CI honesty gate asserts against: mapping a member of this set
 * to `absent` (or a non-member to `transient`) IS the failure≠empty conflation §CONTEXT-DATA-HONESTY
 * forbids. Add a new transient token HERE, once, rather than at a call site.
 */
export const TRANSIENT_FETCH_REASONS = [
    'endpoint-unreachable',
    'no-fetch',
    'upstream-unreachable',
    'upstream-failed',
    'timeout',
    'network-error',
] as const;

export type TransientFetchReason = (typeof TRANSIENT_FETCH_REASONS)[number];

/** Is a resolver reason token a TRANSIENT (source-did-not-answer) reason, vs a genuine absence? */
export function isTransientFetchReason(reason: string): boolean {
    return (TRANSIENT_FETCH_REASONS as readonly string[]).includes(reason);
}

/**
 * Map a resolver's `{ ok:true, ... } | { ok:false, reason }` resolution — the shape every
 * `@pryzm/site-parcel-data` zoning resolver already returns — onto the shared `FetchOutcome`.
 * Pure and total: `ok` → `found(resolution)`; `!ok` → `transient` iff the reason is in
 * `TRANSIENT_FETCH_REASONS`, else `absent`. This is the single bridge, so the classification lives
 * in ONE place (the CI gate pins it) and no dispatcher re-derives it from a reason string by hand.
 */
export function resolutionToFetchOutcome<S extends { ok: true }, F extends { ok: false; reason: string }>(
    resolution: S | F,
): FetchOutcome<S> {
    if (resolution.ok) return fetchFound(resolution as S);
    return isTransientFetchReason(resolution.reason)
        ? fetchTransient(resolution.reason)
        : fetchAbsent(resolution.reason);
}
