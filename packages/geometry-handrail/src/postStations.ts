/**
 * §FEAT-HANDRAIL-POST-REDISTRIBUTE (C95 §15.3, R5) — WHERE THE POSTS GO.
 *
 * ─── THE DEFECT THIS REPLACES ───────────────────────────────────────────────
 * `HandrailFragmentBuilder` placed intermediate members at `i * spacing` for
 * `i` in `1..floor(length/spacing) - 1`. **The `- 1` was unexplained and wrong at
 * the boundary.** On a 4.000 m run at 1.0 m spacing it emitted interior posts at
 * 1, 2 and 3 m — correct. On a **4.001 m** run it emitted *the same three*,
 * leaving a **2.001 m final bay**. The last bay was silently up to TWICE the
 * authored spacing, and the identical `- 1` governed balusters.
 *
 * For a decorative pitch that is ugly. For a **guard** it is a code failure: the
 * founder's framing — *"every 10 cm, every 20 cm"* — and `infillMaxGap`'s
 * §9.3 wording both read the number as a **MAXIMUM clear spacing**, and a bay of
 * double the maximum is the one bay a 100 mm sphere passes through.
 *
 * ─── DECIDED (lane HR1, 2026-08-19, under the founder's standing "decide
 * yourself") — DEFAULT IS **REDISTRIBUTE** ──────────────────────────────────
 * C95 §15.3 tabled three defensible conventions and marked B as SHOULD but
 * unapplied, on the ground that switching would move every existing baluster.
 * **The decision is B, as the DEFAULT, including for records that carry no
 * `postEndCondition`** — and the reason the migration objection does not carry is
 * that the thing being preserved is not a user's authored intent, it is the
 * off-by-one above. Preserving A here would mean preserving a run whose end bay
 * exceeds the authored maximum, which is the unsafe direction for a guard. Under
 * B the authored value is an **upper bound that is never exceeded**, which is
 * what a guarding schedule assumes and what `infillMaxGap` already means.
 *
 * A and C remain reachable — they are real conventions, not mistakes — but they
 * must be **asked for by name** via `postEndCondition`. The convention is
 * therefore always explicit in the record or explicit in this default; it is
 * never an accident of a `- 1`.
 *
 * ─── MUST / MUST NOT, from C95 §15.3 ───────────────────────────────────────
 * ✅ **PURE FUNCTION of `(length, spacing, endCondition)`.** No store read, no
 *    THREE, no clock, no random. Same inputs, same stations, forever.
 * ⛔ **NO RANDOM IDENTITY.** `migrateToGridSystem` mints `crypto.randomUUID()` on
 *    nine `??` call sites — a C73 §1.1 determinism violation that L-1051 proved
 *    made a delete button dead for every wall with no stored grid. A railing's
 *    posts get their identity from {@link derivedPostId}, exported so that no
 *    caller transcribes the format.
 */

/** The three conventions C95 §15.3 tabled. */
export type HandrailEndCondition =
    /** `n = ceil(L/s)` equal bays of `L/n`. Actual pitch ≤ authored. **DEFAULT.** */
    | 'redistribute'
    /** Fixed pitch `s` from the start; the remainder is one short bay at the end. */
    | 'fixed'
    /** Fixed pitch `s`, with the remainder split into two equal short END bays. */
    | 'centred';

export const DEFAULT_HANDRAIL_END_CONDITION: HandrailEndCondition = 'redistribute';

/**
 * Floating-point slack, in metres. A station within this of an end coincides with
 * the end post that is always emitted there, and emitting both would produce the
 * doubled, z-fighting stub §FEAT-HANDRAIL-RUN-JOIN exists to prevent.
 *
 * 1e-6 m = one micron: far below any modelling tolerance, far above the ~1e-13
 * error `ceil`/`floor` on metre-scale divisions actually produces.
 */
const EPS = 1e-6;

/**
 * The INTERIOR member stations along a run, in metres from its start, strictly
 * between 0 and `length`.
 *
 * ⚠ INTERIOR ONLY. The two end members are the caller's business — a handrail
 * segment in a multi-segment run suppresses its start post (§FEAT-HANDRAIL-RUN-JOIN)
 * and this function must not have an opinion about that.
 *
 * Degenerate inputs return `[]` rather than throwing or guessing: a non-finite or
 * non-positive `spacing` or `length` is *"no intermediate members"*, which is the
 * same answer the old code gave and the only honest one.
 */
export function postStations(
    length: number,
    spacing: number,
    endCondition: HandrailEndCondition = DEFAULT_HANDRAIL_END_CONDITION,
): number[] {
    if (!Number.isFinite(length) || !Number.isFinite(spacing)) return [];
    if (length <= 0 || spacing <= 0) return [];

    const out: number[] = [];

    if (endCondition === 'redistribute') {
        // `n` BAYS of `length / n`, where n is the fewest bays that keeps every
        // bay at or under the authored maximum. A run shorter than one spacing
        // gives n = 1 and therefore no interior member — the same answer 'fixed'
        // gives, so short runs are unaffected by the default change.
        const n = Math.max(1, Math.ceil(length / spacing - EPS));
        const pitch = length / n;
        for (let i = 1; i < n; i++) out.push(i * pitch);
        return out;
    }

    if (endCondition === 'fixed') {
        // Every station at the authored pitch until one would land on (or past)
        // the end post. Note the ABSENCE of the historical `- 1`: that is the
        // whole defect, and `x < length - EPS` is the condition it should have
        // been.
        for (let x = spacing; x < length - EPS; x += spacing) out.push(x);
        return out;
    }

    // 'centred' — k full bays of `spacing`, with the remainder split evenly into
    // two short bays, one at each end. Symmetrical; two odd bays.
    const k = Math.floor(length / spacing + EPS);
    if (k < 1) return [];
    const remainder = length - k * spacing;
    const offset = remainder / 2;
    for (let i = 0; i <= k; i++) {
        const x = offset + i * spacing;
        // Drops the two that coincide with the end members when the run divides
        // exactly (remainder 0 ⇒ offset 0 ⇒ stations at 0 and at `length`).
        if (x > EPS && x < length - EPS) out.push(x);
    }
    return out;
}

/**
 * THE ONLY source of a post's identity.
 *
 * Derived from `(railId, index)` and nothing else, so the same run produces the
 * same ids on every rebuild, in every session, on every peer. ⛔ Never
 * `crypto.randomUUID()` — see the header, and L-1051 for what that costs.
 *
 * `kind` distinguishes the two member families that share a station space, so a
 * baluster and a post at the same index do not collide.
 */
export function derivedPostId(railId: string, index: number, kind: 'post' | 'baluster' = 'post'): string {
    return `${railId}#${kind}-${index}`;
}
