// Apartment Layout — pure card view-model (SPEC §11, A5-modal-core).
//
// Turns a ScoredLayoutOption into the flat data the §11 modal card renders:
// title, overall /100, the score bars, the room list with areas, and
// element counts. ZERO runtime imports (the ai-host import is type-only →
// erased), so it unit-tests in plain Node without the core-app-model barrel.
//
// §L1-α-4 + §L2-β-5 (2026-05-30) — extended from the 4 user-facing axes
// (Light / Privacy / Kitchen / Circulation) to surface the 11 additional
// cognition-layer axes carried on the breakdown when the layout came from
// the D-TGL path. Each cognition axis is OPTIONAL — emitted only when the
// breakdown carries the value, so AI-relay layouts (which carry only the
// 4 primary axes) render unchanged.

import type { ScoredLayoutOption } from '@pryzm/ai-host';

/** Axis key — closed union. The 4 primary axes are always present; the
 *  11 cognition axes are emitted only when the breakdown carries them. */
export type ScoreBarKey =
    // Primary (always present)
    | 'naturalLight' | 'privacy' | 'kitchenWorkflow' | 'corridorEfficiency'
    // Quality gates (D2/T2 — D3.1 + T3.3)
    | 'shapeQuality' | 'topologyQuality'
    // Cognition L2 — Spatial Hierarchy + Arrival
    | 'hierarchy' | 'entrySightline' | 'arrivalSequence' | 'spatialClimax'
    // Cognition L3 — Semantic Topology
    | 'edgeRealisation'
    // Cognition L4 — Compositional Geometry
    | 'openingCadence' | 'proportionalElegance' | 'wetStackAlignment' | 'alignmentField'
    // Cognition L1 — Environmental Intelligence
    | 'facadeAlignment';

/** One score axis as a 0-100 bar for the breakdown. */
export interface ScoreBar {
    readonly key:   ScoreBarKey;
    readonly label: string;
    readonly pct:   number;            // 0-100, rounded
    /** §L2-β-5 (2026-05-30) — group tag so the modal can stack bars under
     *  visual section headings ("Primary" / "Quality" / "Cognition L2/3/4")
     *  when the renderer chooses to. Primary bars carry 'primary'. */
    readonly group: 'primary' | 'quality' | 'cognition-L1' | 'cognition-L2' | 'cognition-L3' | 'cognition-L4';
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

const BAR_LABELS: Record<ScoreBarKey, string> = {
    // Primary
    naturalLight:        'Light',
    privacy:             'Privacy',
    kitchenWorkflow:     'Kitchen',
    corridorEfficiency:  'Circulation',
    // Quality
    shapeQuality:        'Shape',
    topologyQuality:     'Topology',
    // Cognition L2
    hierarchy:           'Hierarchy',
    entrySightline:      'Entry sightline',
    arrivalSequence:     'Arrival',
    spatialClimax:       'Spatial climax',
    // Cognition L3
    edgeRealisation:     'Edge realisation',
    // Cognition L4
    openingCadence:      'Opening cadence',
    proportionalElegance:'Proportions',
    wetStackAlignment:   'Wet stack',
    alignmentField:      'Alignment',
    // Cognition L1
    facadeAlignment:     'Façade',
};

/** Per-key group classification — used by the renderer to stack bars under
 *  visual section headings. */
const BAR_GROUPS: Record<ScoreBarKey, ScoreBar['group']> = {
    naturalLight:        'primary',
    privacy:             'primary',
    kitchenWorkflow:     'primary',
    corridorEfficiency:  'primary',
    shapeQuality:        'quality',
    topologyQuality:     'quality',
    hierarchy:           'cognition-L2',
    entrySightline:      'cognition-L2',
    arrivalSequence:     'cognition-L2',
    spatialClimax:       'cognition-L2',
    edgeRealisation:     'cognition-L3',
    openingCadence:      'cognition-L4',
    proportionalElegance:'cognition-L4',
    wetStackAlignment:   'cognition-L4',
    alignmentField:      'cognition-L4',
    facadeAlignment:     'cognition-L1',
};

const round1 = (n: number): number => Math.round(n * 10) / 10;
const pct = (n01: number): number => Math.max(0, Math.min(100, Math.round(n01 * 100)));

/** Local helper — emit one bar for a primary (always-present) axis. */
const primaryBar = (key: ScoreBarKey, value: number): ScoreBar =>
    ({ key, label: BAR_LABELS[key], pct: pct(value), group: BAR_GROUPS[key] });

/** Local helper — emit a bar ONLY when the optional cognition value is set
 *  on the breakdown. Returns null when the field is absent (AI-relay path)
 *  so it can be filtered out cleanly. */
const cognitionBar = (key: ScoreBarKey, value: number | undefined): ScoreBar | null =>
    typeof value === 'number' && Number.isFinite(value)
        ? { key, label: BAR_LABELS[key], pct: pct(value), group: BAR_GROUPS[key] }
        : null;

/** Build the card view-model for option at `index` (0-based). Pure. */
export function buildLayoutCardModel(option: ScoredLayoutOption, index: number): LayoutCardModel {
    const b = option.score.breakdown;
    const maybeBars: Array<ScoreBar | null> = [
        // Primary — always emitted.
        primaryBar('naturalLight',       b.naturalLight),
        primaryBar('privacy',            b.privacy),
        primaryBar('kitchenWorkflow',    b.kitchenWorkflow),
        primaryBar('corridorEfficiency', b.corridorEfficiency),
        // Quality gates (present on D-TGL path, absent on AI relay path).
        cognitionBar('shapeQuality',     b.shapeQuality),
        cognitionBar('topologyQuality',  b.topologyQuality),
        // Cognition L2 — spatial hierarchy + arrival narrative.
        cognitionBar('hierarchy',        b.hierarchy),
        cognitionBar('entrySightline',   b.entrySightline),
        cognitionBar('arrivalSequence',  b.arrivalSequence),
        cognitionBar('spatialClimax',    b.spatialClimax),
        // Cognition L3 — semantic topology.
        cognitionBar('edgeRealisation',  b.edgeRealisation),
        // Cognition L4 — compositional geometry.
        cognitionBar('openingCadence',   b.openingCadence),
        cognitionBar('proportionalElegance', b.proportionalElegance),
        cognitionBar('wetStackAlignment', b.wetStackAlignment),
        cognitionBar('alignmentField',   b.alignmentField),
        // Cognition L1 — environmental intelligence (façade-quality match).
        cognitionBar('facadeAlignment',  b.facadeAlignment),
    ];
    const bars: ScoreBar[] = maybeBars.filter((bar): bar is ScoreBar => bar !== null);
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
