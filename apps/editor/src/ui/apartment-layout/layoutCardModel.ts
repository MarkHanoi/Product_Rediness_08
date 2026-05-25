// Apartment Layout — pure card view-model (SPEC §11, A5-modal-core).
//
// Turns a ScoredLayoutOption into the flat data the §11 modal card renders:
// title, overall /100, the 4-axis score bars, the room list with areas, and
// element counts. ZERO runtime imports (the ai-host import is type-only →
// erased), so it unit-tests in plain Node without the core-app-model barrel.

import type { ScoredLayoutOption } from '@pryzm/ai-host';

/** One score axis as a 0-100 bar for the breakdown. */
export interface ScoreBar {
    readonly key: 'naturalLight' | 'privacy' | 'kitchenWorkflow' | 'corridorEfficiency';
    readonly label: string;
    readonly pct: number;            // 0-100, rounded
}

export interface RoomRow {
    readonly name: string;
    readonly type: string;
    readonly area: number;           // m², rounded to 0.1
    readonly windows: number;
}

export interface LayoutCardModel {
    readonly index: number;
    readonly title: string;          // summary, or `Option N` when blank
    readonly overall: number;        // 0-100
    readonly bars: readonly ScoreBar[];
    readonly rooms: readonly RoomRow[];
    readonly roomCount: number;
    readonly wallCount: number;
    readonly doorCount: number;
    readonly totalAreaM2: number;    // rounded to 0.1
}

const BAR_LABELS: Record<ScoreBar['key'], string> = {
    naturalLight: 'Light',
    privacy: 'Privacy',
    kitchenWorkflow: 'Kitchen',
    corridorEfficiency: 'Circulation',
};

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (n01: number): number => Math.max(0, Math.min(100, Math.round(n01 * 100)));

/** Build the card view-model for option at `index` (0-based). Pure. */
export function buildLayoutCardModel(option: ScoredLayoutOption, index: number): LayoutCardModel {
    const b = option.score.breakdown;
    const bars: ScoreBar[] = [
        { key: 'naturalLight', label: BAR_LABELS.naturalLight, pct: pct(b.naturalLight) },
        { key: 'privacy', label: BAR_LABELS.privacy, pct: pct(b.privacy) },
        { key: 'kitchenWorkflow', label: BAR_LABELS.kitchenWorkflow, pct: pct(b.kitchenWorkflow) },
        { key: 'corridorEfficiency', label: BAR_LABELS.corridorEfficiency, pct: pct(b.corridorEfficiency) },
    ];
    const rooms: RoomRow[] = option.rooms.map(r => ({
        name: r.name,
        type: r.type,
        area: round1(r.area),
        windows: r.windowCount,
    }));
    const totalAreaM2 = round1(option.rooms.reduce((s, r) => s + (r.area || 0), 0));
    const title = option.summary && option.summary.trim().length > 0
        ? option.summary
        : `Option ${index + 1}`;

    return {
        index,
        title,
        overall: Math.max(0, Math.min(100, Math.round(option.score.overall))),
        bars,
        rooms,
        roomCount: option.rooms.length,
        wallCount: option.walls.length,
        doorCount: option.doors.length,
        totalAreaM2,
    };
}
