// §PL-INDICATIVE-RATE (lane PL-COST-AND-CREATE-HOUSE, 2026-09-06) — the slot holding the
// ADJUSTABLE cost per m² (STR §25.7) and the push channel that makes every surface showing it
// LIVE.
//
// ⭐ THE SHAPE IS COPIED FROM `targetFootprintAreaState.ts` ON PURPOSE, and the reason is
// structural rather than stylistic: a control WRITES, surfaces SUBSCRIBE and repaint themselves.
// That is what makes *"the panel changed the value but the other panel never heard"* impossible
// here instead of a branch someone remembered to write. §25.7's *"everything shall be live"* is
// exactly this property, and it is the one the intended-area fold on the envelope card does NOT
// have today (its refresh triggers are a fixed event list that contains no space-envelope signal
// — measured at `GISAreaLayout.ts:5600`).
//
// ⛔ SESSION-ONLY, NOT PERSISTED, AND THAT IS A NAMED GAP RATHER THAN A DECISION I AM PROUD OF.
// The §MANUALENV159 typed HEIGHT persists (`userSuppliedStudyHeightState.ts`) because it stands
// in for a MISSING MEASUREMENT. A cost rate is the same KIND of fact — an explicit decision that
// nothing external will ever hand back — so by that argument it SHOULD persist, through the C47
// additive-optional `ProjectSnapshot` route that `serializeUserSuppliedStudyHeights` uses.
// It does not yet: `ProjectSerializer.ts` / `ProjectLoader.ts` / the file-format schema are owned
// by other lanes this session and a third writer in them is how a lockfile-shaped conflict starts.
// The gap is recorded in the lane report and in the ISSUE-LOG row rather than left for a reader
// to discover by losing a number. ⚠ Until it closes, a reload clears the rate and the section
// renders its `no-rate` arm — which SAYS the rate is unset, so nothing reads as a stale figure.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no I/O, no clock
// beyond the caller-supplied `setAtIso`.

import type { IndicativeRate } from '@pryzm/core-app-model';

/** The rate currently in force, or `null` when the user has not set one. */
let _rate: IndicativeRate | null = null;

type Listener = (next: IndicativeRate | null) => void;
const _listeners = new Set<Listener>();

/**
 * The rate the user has set, or `null`.
 *
 * ⛔ `null` MEANS "NOT SET", NEVER "ZERO". `estimateAtIndicativeRate` renders those as two
 * different refusals with two different sentences, which is the whole point of the discriminant.
 */
export function getIndicativeRate(): IndicativeRate | null {
    return _rate;
}

/**
 * Set (or clear, with `null`) the rate, and notify every subscriber.
 *
 * Notification is unconditional rather than change-gated: a re-set of the same value is a user
 * gesture that should still repaint (the user may have re-typed it after an edit elsewhere), and
 * a change-gate here would need a deep compare that could disagree with `IndicativeRate`'s shape
 * the day a field is added.
 */
export function setIndicativeRate(next: IndicativeRate | null): void {
    _rate = next;
    for (const fn of [..._listeners]) {
        try {
            fn(next);
        } catch (e) {
            console.warn('[site][indicative-rate] a subscriber threw (non-fatal):', e);
        }
    }
}

/** Subscribe to rate changes. Returns the unsubscribe. Never fires synchronously on subscribe. */
export function subscribeIndicativeRate(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
}

/**
 * Parse a raw input string into a rate, or say why it cannot be one.
 *
 * ⛔ THE EMPTY STRING IS `null`, NOT AN ERROR. A user who clears the field is UNSETTING the rate,
 * which is a legitimate gesture with its own downstream arm (`no-rate`). Treating it as invalid
 * would put an error message where an instruction belongs.
 */
export function parseIndicativeRateInput(
    raw: string | null | undefined,
    currency: string,
    nowIso: string,
): { readonly ok: true; readonly rate: IndicativeRate | null }
    | { readonly ok: false; readonly text: string } {
    const trimmed = (raw ?? '').trim();
    if (trimmed.length === 0) return { ok: true, rate: null };
    const n = Number(trimmed);
    if (!Number.isFinite(n)) {
        return {
            ok: false,
            text: `"${trimmed}" is not a number, so PRYZM has not changed the rate. `
                + 'Type a cost per m² such as 1800.',
        };
    }
    if (!(n > 0)) {
        return {
            ok: false,
            text: 'A cost per m² must be greater than zero. A rate of zero is not a free building; '
                + 'it is a rate nobody has decided yet.',
        };
    }
    const cur = currency.trim();
    if (cur.length === 0) {
        return {
            ok: false,
            text: 'No currency was chosen. PRYZM never infers a currency from your locale (C38 §1.2).',
        };
    }
    return {
        ok: true,
        rate: { amountPerM2: n, currency: cur, source: 'user-supplied', setAtIso: nowIso },
    };
}

/** C13 §4 — project teardown must not leak project A's rate into project B. Also used by specs. */
export function resetIndicativeRateState(): void {
    _rate = null;
    _listeners.clear();
}
