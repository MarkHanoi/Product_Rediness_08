// Layout program-feasibility notices — pure, brand-correct HTML builders shared
// by the apartment + house generate modals (tracker A.21.D5 editor follow-up).
//
// The engine already KNOWS when it could not honour the requested programme:
//   • §FEASIBILITY-ALLOC (A.21.D5) — a requested room (e.g. a 4th bedroom) that the
//     subdivider could not place at its minimum size on this plate is REPORTED, not
//     silently dropped (`droppedRooms` on the candidate / `subdivideWithReport`).
//   • §ENVELOPE-DIAGNOSTIC / v153 min-area + mandatory rejection — when NO viable
//     layout exists (plate too small for the requested rooms at minimum sizes) the
//     apartment relay returns `status:'rejected'` with a structured `reason`.
//
// Today neither surfaces in the modal: a reduced programme just shows fewer rooms,
// and a rejected plate shows a blank/empty result. These pure builders turn that
// engine information into a NON-BLOCKING, dismissible notice (reduced programme) or
// a rejection banner (no viable layout). Brand: white + #6600FF, reusing the
// modal's `alm-*` chrome. Pure → unit-tests in plain Node (the apps/editor vitest
// env is 'node', no DOM). No engine import — the caller passes the already-computed
// shortfall / reason in.
//
// GAP NOTE (TODO, engine-side — do NOT fix here): the engine's per-candidate
// `droppedRooms` is NOT currently threaded onto the exported `ScoredLayoutOption`
// (`runDeterministicLayout.ts` returns `{ ...labelled, score }`, dropping the
// candidate's `droppedRooms`). Until ai-host threads it up, the house path derives
// the shortfall from `requested − built` room counts (which IS available), and the
// reduced-programme notice renders from THAT. `summariseDroppedRoomTypes` is kept
// ready for the day the structured `DroppedRoom[]` reaches the editor.

/** Local pure HTML escape — recognised by the xss-guards gate as a safe guard. */
function escHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** A per-room-type shortfall: the engine could not fit `dropped` of the requested
 *  rooms of this `type` at their minimum size. `requested` / `built` are the
 *  whole-programme counts for that type so the notice can read "built B of R". */
export interface ProgramShortfall {
    readonly type: string;
    readonly requested: number;
    readonly built: number;
    /** requested − built (always ≥ 1 for an entry that appears in the list). */
    readonly dropped: number;
}

/** Friendly singular/plural room-type label for a notice. */
function roomTypeLabel(type: string, count: number): string {
    const t = String(type ?? '').toLowerCase();
    const map: Record<string, [string, string]> = {
        bedroom:  ['bedroom', 'bedrooms'],
        master:   ['master bedroom', 'master bedrooms'],
        bathroom: ['bathroom', 'bathrooms'],
        ensuite:  ['en-suite', 'en-suites'],
        wc:       ['WC', 'WCs'],
        living:   ['living room', 'living rooms'],
        kitchen:  ['kitchen', 'kitchens'],
        dining:   ['dining room', 'dining rooms'],
        study:    ['study', 'studies'],
        utility:  ['utility', 'utilities'],
    };
    const pair = map[t];
    if (pair) return count === 1 ? pair[0] : pair[1];
    // Generic fallback — Title-case the raw type, naive plural.
    const base = t ? t.charAt(0).toUpperCase() + t.slice(1) : 'room';
    return count === 1 ? base : `${base}s`;
}

/**
 * Compute the per-type programme shortfall from the requested vs built room
 * counts. Only types where `built < requested` produce an entry (a positive
 * `dropped`). Deterministic — entries are ordered by the canonical priority
 * (bedroom/master first, then bath/ensuite/wc, then the rest), so a notice reads
 * consistently. Pure. Empty input maps ⇒ empty result (no notice).
 */
export function computeProgramShortfall(
    requestedByType: Readonly<Record<string, number>>,
    builtByType: Readonly<Record<string, number>>,
): ProgramShortfall[] {
    const ORDER = ['bedroom', 'master', 'bathroom', 'ensuite', 'wc', 'living', 'kitchen', 'dining', 'study', 'utility'];
    const rank = (t: string): number => {
        const i = ORDER.indexOf(t.toLowerCase());
        return i < 0 ? ORDER.length : i;
    };
    const out: ProgramShortfall[] = [];
    for (const [type, requestedRaw] of Object.entries(requestedByType)) {
        const requested = Math.max(0, Math.round(Number(requestedRaw) || 0));
        const built = Math.max(0, Math.round(Number(builtByType[type]) || 0));
        if (requested > built) {
            out.push({ type, requested, built, dropped: requested - built });
        }
    }
    out.sort((a, b) => rank(a.type) - rank(b.type) || a.type.localeCompare(b.type));
    return out;
}

/**
 * §FEASIBILITY-ALLOC — collapse a structured `DroppedRoom[]` (when the engine ever
 * threads it up — see GAP NOTE) into per-type counts for the reduced-programme
 * notice. Kept ready; the house path uses `computeProgramShortfall` today because
 * `droppedRooms` is not yet on `ScoredLayoutOption`. Pure.
 */
export function summariseDroppedRoomTypes(
    dropped: ReadonlyArray<{ readonly type: string }>,
): Record<string, number> {
    const byType: Record<string, number> = {};
    for (const d of dropped) {
        const t = String(d?.type ?? '').toLowerCase();
        if (!t) continue;
        byType[t] = (byType[t] ?? 0) + 1;
    }
    return byType;
}

/** One-line human summary of a shortfall list, e.g.
 *  "1 bedroom and 1 bathroom couldn't fit at minimum size on this plot". */
export function summariseShortfall(shortfall: readonly ProgramShortfall[]): string {
    if (shortfall.length === 0) return '';
    const parts = shortfall.map(s => `${s.dropped} ${roomTypeLabel(s.type, s.dropped)}`);
    const list = parts.length === 1
        ? parts[0]!
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return `${list} couldn't fit at minimum size on this plot`;
}

/**
 * §FEASIBILITY-ALLOC reduced-programme notice — a NON-BLOCKING, dismissible chip
 * shown near the result score when the engine built FEWER rooms than requested.
 * Lists the dropped room type(s) + a "built N of M" roll-up. Returns '' when the
 * shortfall is empty (no notice). The `data-role="reduced-program-notice"` hook
 * lets the modal place/refresh it; `[data-action="dismiss-notice"]` is the close
 * button (the modal wires it to hide the banner — purely cosmetic, never blocks
 * "Use this layout"). Pure + XSS-guarded.
 */
export function buildReducedProgramNoticeHtml(shortfall: readonly ProgramShortfall[]): string {
    if (shortfall.length === 0) return '';
    const summary = summariseShortfall(shortfall);
    // "built N of M" across all shortfall types (the requested-vs-built totals).
    const builtTotal = shortfall.reduce((n, s) => n + s.built, 0);
    const requestedTotal = shortfall.reduce((n, s) => n + s.requested, 0);
    const builtRollup = `built ${builtTotal} of ${requestedTotal}`;
    return (
        '<div class="alm-notice alm-notice--reduced" data-role="reduced-program-notice" role="status">' +
        '<span class="alm-notice-icon" aria-hidden="true">◐</span>' +
        '<span class="alm-notice-body">' +
        '<span class="alm-notice-title">Reduced programme</span>' +
        `<span class="alm-notice-text">${escHtml(summary)} — ${escHtml(builtRollup)}.</span>` +
        '</span>' +
        '<button type="button" class="alm-notice-close" data-action="dismiss-notice" aria-label="Dismiss">×</button>' +
        '</div>'
    );
}

/**
 * §ENVELOPE-DIAGNOSTIC rejection banner — shown when the engine returned no viable
 * layout (`status:'rejected'` / empty variants because the plate is too small for
 * the requested rooms at minimum sizes). Surfaces the engine's structured `reason`
 * + a fix hint ("increase the plot size or reduce bedrooms") instead of a blank
 * result. Returns '' when there is no reason (caller shows the generic empty
 * state). Pure + XSS-guarded.
 */
export function buildRejectionNoticeHtml(reason: string | undefined): string {
    const trimmed = String(reason ?? '').trim();
    if (!trimmed) return '';
    return (
        '<div class="alm-notice alm-notice--rejected" data-role="rejection-notice" role="alert">' +
        '<span class="alm-notice-icon" aria-hidden="true">⚠</span>' +
        '<span class="alm-notice-body">' +
        '<span class="alm-notice-title">No layout fits this plot</span>' +
        `<span class="alm-notice-text">${escHtml(trimmed)}</span>` +
        '<span class="alm-notice-hint">Try a larger plot, or reduce the number of bedrooms / room sizes.</span>' +
        '</span>' +
        '</div>'
    );
}
