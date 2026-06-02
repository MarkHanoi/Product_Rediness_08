// L1-α-4 — formatLayoutSummary — human-readable summary of a layout.
//
// Pure L2 transform. Produces a single-line "2-bed apartment · 78m² ·
// master 16m² · bedroom 12m² · living 22m² · kitchen 8m² · bath 5m² ·
// corridor 6m²" string for log entries, modal copy, and AI artefact
// descriptions.
//
// L2-pure: no DOM. No locale formatting — m² + integer-rounded counts
// + en-dash separator. The L5 modal can re-format for the active
// locale.

import type { LayoutOption, RoomType } from './types.js';

const ROOM_LABEL: Readonly<Record<RoomType, string>> = {
    master: 'master',
    bedroom: 'bedroom',
    living: 'living',
    kitchen: 'kitchen',
    dining: 'dining',
    bathroom: 'bath',
    ensuite: 'ensuite',
    wc: 'wc',
    hall: 'hall',
    corridor: 'corridor',
    study: 'study',
    utility: 'utility',
};

/** Order rooms appear in the summary — programme-first then service. */
const TYPE_ORDER: readonly RoomType[] = [
    'master',
    'bedroom',
    'living',
    'dining',
    'kitchen',
    'ensuite',
    'bathroom',
    'wc',
    'study',
    'hall',
    'corridor',
    'utility',
];

function roundArea(m2: number): number {
    return Math.round(m2);
}

/**
 * Count bedrooms (master + secondary) — the user-facing "N-bed" tag.
 */
function bedroomTag(rooms: readonly LayoutOption['rooms'][number][]): string {
    let count = 0;
    for (const r of rooms) {
        if (r.type === 'master' || r.type === 'bedroom') count++;
    }
    if (count === 0) return 'studio';
    if (count === 1) return '1-bed';
    return `${count}-bed`;
}

/**
 * Sum every room area to give the apartment's net interior area.
 * Caller's responsibility to provide rooms with sensible m² values
 * (the LayoutOption shape requires positive numbers).
 */
function totalAreaM2(rooms: readonly LayoutOption['rooms'][number][]): number {
    let total = 0;
    for (const r of rooms) total += r.area;
    return total;
}

/**
 * Per-type aggregated counts + summed areas, ordered by `TYPE_ORDER`.
 *
 *   - Multiple rooms of the same type collapse into one entry
 *     ("bedroom 24m²" when there are two 12m² bedrooms — the per-instance
 *     breakdown lives in the full layout; this is a summary).
 *   - Types with no rooms are omitted.
 */
function aggregateByType(
    rooms: readonly LayoutOption['rooms'][number][],
): Array<{ type: RoomType; count: number; areaM2: number }> {
    const buckets = new Map<RoomType, { count: number; areaM2: number }>();
    for (const r of rooms) {
        const b = buckets.get(r.type) ?? { count: 0, areaM2: 0 };
        b.count++;
        b.areaM2 += r.area;
        buckets.set(r.type, b);
    }
    return TYPE_ORDER.filter((t) => buckets.has(t)).map((t) => ({
        type: t,
        count: buckets.get(t)!.count,
        areaM2: buckets.get(t)!.areaM2,
    }));
}

/**
 * Format ONE room aggregate. Single rooms render as "master 16m²";
 * multi-room types render as "bedroom ×2 24m²" so the human reader
 * sees both the count + the total.
 */
function formatEntry(t: RoomType, count: number, areaM2: number): string {
    const label = ROOM_LABEL[t];
    if (count === 1) {
        return `${label} ${roundArea(areaM2)}m²`;
    }
    return `${label} ×${count} ${roundArea(areaM2)}m²`;
}

/**
 * Produce the single-line summary.
 *
 *   "2-bed apartment · 78m² · master 16m² · bedroom 12m² ·
 *    living 22m² · kitchen 8m² · bath 5m² · corridor 6m²"
 *
 * For an empty layout: `'empty apartment · 0m²'`.
 */
export function formatLayoutSummary(layout: LayoutOption): string {
    const rooms = layout.rooms;
    if (rooms.length === 0) return 'empty apartment · 0m²';
    const bedTag = bedroomTag(rooms);
    const total = roundArea(totalAreaM2(rooms));
    const entries = aggregateByType(rooms).map(({ type, count, areaM2 }) =>
        formatEntry(type, count, areaM2),
    );
    return `${bedTag} apartment · ${total}m² · ${entries.join(' · ')}`;
}
