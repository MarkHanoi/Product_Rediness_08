/**
 * @file src/ui/dataworkbench/syncStateColours.ts
 *
 * §PANEL-BRAND-STANDARD (L-1742) — the ONE sync-state → colour mapping.
 *
 * This table was written out TWICE, byte-identical, in `DataSheetPanel.ts` and
 * `HierarchyTreePanel.ts`, and both copies were a palette the product does not
 * have: `#3B8BD4` (a rival blue), `#1D9E75` (a rival green), `#E24B4A`,
 * `#EF9F27`, `#9ca3af`, `#d1d5db` (Tailwind greys). Six states, six hues, none
 * of them token-backed, in the surface the founder reported as "not following
 * the correct PRYZM ui standards".
 *
 * The states are genuinely SEMANTIC — a badge that means "conflict" must not
 * look like one that means "synced" — so this is not collapsed to the brand
 * accent the way the lifecycle-bucket rail was (§DATA-BUCKET-ACCENT-IS-ONE).
 * What changes is that each state now names the token for its meaning:
 *
 *   no-template   idle       nothing has been asked of this node yet
 *   planned-only  border     a faint neutral: planned, not yet modelled
 *   partial       warning    started, not finished
 *   synced        success
 *   conflict      error
 *   derived       accent     an AUTHORED override — brand purple, not orange
 *
 * ⚠ These are CSS `var()` REFERENCES, not hex. Callers must not concatenate an
 * alpha suffix onto them (`colour + '22'` was the old idiom and silently
 * produced the invalid value `var(--x)22`). Use `syncStateTint()` for the soft
 * ground; it composites with `color-mix`, which is what the panel stylesheets
 * already use for the bucket tints.
 *
 * L7 file. Pure data + one string builder: no THREE (P2), no rAF (P3), no
 * `(window as any)` (P4), no store writes (P6).
 */

export type SyncStateKey =
    | 'no-template'
    | 'planned-only'
    | 'partial'
    | 'synced'
    | 'conflict'
    | 'derived';

/** Foreground / dot colour per sync state. Token references, never hex. */
export const SYNC_STATE_COLOUR: Readonly<Record<string, string>> = Object.freeze({
    'no-template':  'var(--app-status-idle)',
    'planned-only': 'var(--app-border)',
    'partial':      'var(--app-status-warning-ink)',
    'synced':       'var(--app-status-success-ink)',
    'conflict':     'var(--app-status-error-ink)',
    'derived':      'var(--app-accent)',
});

/** The colour for an unknown / absent state. */
export const SYNC_STATE_FALLBACK = 'var(--app-status-idle)';

/** Resolve a state to its colour, falling back for unknown keys. */
export function syncStateColour(state: string | null | undefined): string {
    if (state === null || state === undefined) return SYNC_STATE_FALLBACK;
    return SYNC_STATE_COLOUR[state] ?? SYNC_STATE_FALLBACK;
}

/**
 * The soft ground behind a badge of this state.
 *
 * 13% is the alpha the old `+ '22'` suffix meant (0x22 / 0xFF = 0.133), kept so
 * the badges land at the weight they already had.
 */
export function syncStateTint(state: string | null | undefined): string {
    return `color-mix(in srgb, ${syncStateColour(state)} 13%, transparent)`;
}
