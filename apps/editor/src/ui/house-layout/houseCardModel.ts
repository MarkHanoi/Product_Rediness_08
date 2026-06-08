// House Layout — pure card view-model for the "Choose a house layout" modal
// (A.21.k / A.21.D21 modal slice). The house SIBLING of the apartment's
// `buildLayoutCardModel`.
//
// A whole-house variant carries N STOREYS (ground + upper(s)), each with its own
// room set + score, so a house card is a PER-STOREY breakdown rather than the
// apartment's single plate. This module turns a `ScoredHouseLayoutOption` into the
// flat data the modal renders: the aggregate /100 score, plus one
// `StoreyCardSummary` per storey (storey label + the chosen `ScoredLayoutOption`
// for that storey, so the modal can draw the per-storey plan thumbnail + the
// per-storey room list + score). PURE: no DOM, no THREE — type-only ai-host
// imports (erased at compile time), so this unit-tests in plain Node.

import type { ScoredHouseLayoutOption, ScoredLayoutOption } from '@pryzm/ai-host';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** Friendly storey label from a 0-based storey index. 0 → "Ground floor",
 *  1 → "First floor", 2 → "Second floor", … (architectural ordinals). */
export function storeyLabel(storeyIndex: number): string {
    if (storeyIndex <= 0) return 'Ground floor';
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
    const name = ordinals[storeyIndex - 1];
    return name ? `${name} floor` : `Floor ${storeyIndex}`;
}

/** One storey's per-card summary: the storey label, the chosen layout option
 *  (so the renderer can draw the plan thumbnail), and the derived room/score
 *  rollups for the compact summary line. */
export interface StoreyCardSummary {
    readonly storeyIndex: number;
    readonly label: string;
    /** The chosen layout option for this storey (drives the plan thumbnail). */
    readonly option: ScoredLayoutOption;
    /** Per-storey score 0-100 (the option's overall). */
    readonly score: number;
    readonly roomCount: number;
    readonly totalAreaM2: number;     // rounded to 0.1
    /** Short room-type roll-up, e.g. "3 bed · 2 bath · kitchen". */
    readonly roomSummary: string;
}

/** The whole-house card view-model — one per modal card. */
export interface HouseCardModel {
    readonly index: number;            // variant index (0-based, best-first)
    readonly title: string;            // "House layout N"
    readonly overall: number;          // 0-100 aggregate
    readonly storeyCount: number;
    readonly stairCount: number;
    readonly roofKind: string;
    readonly storeys: readonly StoreyCardSummary[];
}

/** Count rooms by a coarse type bucket so the summary reads like a brief. */
function roomSummaryLine(option: ScoredLayoutOption): string {
    let bed = 0, bath = 0;
    let kitchen = false, living = false;
    for (const r of option.rooms ?? []) {
        const t = (r.type || '').toLowerCase();
        const occ = ((r as { occupancy?: string }).occupancy || '').toLowerCase();
        if (t.includes('bed') || occ.includes('bed')) bed++;
        else if (t.includes('bath') || t.includes('wc') || occ.includes('bath')) bath++;
        else if (t.includes('kitchen') || occ.includes('kitchen')) kitchen = true;
        else if (t.includes('living') || occ.includes('living')) living = true;
    }
    const parts: string[] = [];
    if (bed > 0) parts.push(`${bed} bed`);
    if (bath > 0) parts.push(`${bath} bath`);
    if (kitchen) parts.push('kitchen');
    if (living) parts.push('living');
    return parts.length > 0 ? parts.join(' · ') : `${option.rooms?.length ?? 0} rooms`;
}

/** Build the per-storey summary for a single storey option. */
function buildStoreySummary(option: ScoredLayoutOption, storeyIndex: number): StoreyCardSummary {
    const rooms = option.rooms ?? [];
    const totalAreaM2 = round1(rooms.reduce((s, r) => s + (r.area || 0), 0));
    return {
        storeyIndex,
        label: storeyLabel(storeyIndex),
        option,
        score: clampPct(option.score?.overall ?? 0),
        roomCount: rooms.length,
        totalAreaM2,
        roomSummary: roomSummaryLine(option),
    };
}

/**
 * Build the card view-model for one whole-house variant at `index` (0-based).
 * Pure. `perStoreyLayout` is STRICTLY index-aligned with `storeys` (HSE-AUDIT-1):
 * `perStoreyLayout[i]` is the option for `storeys[i]`, or `null` for a blank plate.
 * We zip the two positionally and render only the storeys that have a real layout.
 */
export function buildHouseCardModel(houseOption: ScoredHouseLayoutOption, index: number): HouseCardModel {
    const result = houseOption.result;
    const storeys: StoreyCardSummary[] = [];
    // Positional zip: perStoreyLayout[i] is the option for storeys[i] (or null for a
    // blank plate). Skip the null slots; keep storeyIndex from the plate so the labels
    // stay accurate even when a lower storey produced no option.
    const chosen = result.perStoreyLayout ?? [];
    const plates = result.storeys ?? [];
    for (let i = 0; i < plates.length; i++) {
        const opt = chosen[i];
        if (opt) {
            storeys.push(buildStoreySummary(opt, plates[i]!.storeyIndex));
        }
    }

    return {
        index,
        title: `House layout ${index + 1}`,
        overall: clampPct(houseOption.overallScore),
        storeyCount: result.storeys?.length ?? 0,
        stairCount: result.stairs?.length ?? 0,
        roofKind: result.roof?.kind ?? 'flat',
        storeys,
    };
}
