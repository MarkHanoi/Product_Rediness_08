// Apartment Layout — pure card view-model (SPEC §11, A5-modal-core).
//
// Turns a ScoredLayoutOption into the flat data the §11 modal card renders:
// title, overall /100, the score bars, the room list with areas, and
// element counts. ZERO runtime imports for the SHAPE; the validation badge
// (see below) imports `validateAndFormatLayout` from `@pryzm/ai-host` — a
// PURE function (no I/O, no THREE, no DOM), so the card model still
// unit-tests in plain Node without the core-app-model barrel.
//
// §L1-α-4 + §L2-β-5 (2026-05-30) — extended from the 4 user-facing axes
// (Light / Privacy / Kitchen / Circulation) to surface the 11 additional
// cognition-layer axes carried on the breakdown when the layout came from
// the D-TGL path. Each cognition axis is OPTIONAL — emitted only when the
// breakdown carries the value, so AI-relay layouts (which carry only the
// 4 primary axes) render unchanged.
//
// §VALIDATION-BADGE (2026-05-31, first live-path wire-in of the validator
// framework) — every card now carries a `validation: ValidationBadge`
// derived from `validateAndFormatLayout(option)`. The card model owns a
// PRIVATE projector (`optionToDto`) that maps the `LayoutOption`
// (rooms + adjacency-by-NAME + walls) onto the validator's `DtglLayoutDto`
// (rooms-by-id + edges-by-id). The projector is best-effort:
//   • widthM / lengthM default to `sqrt(area)` (square approximation —
//     LayoutRoom carries no rect today).
//   • longestUsableWallM defaults to `max(widthM, lengthM)` — over-reports.
//   • externalFrontageM / glazedAreaM2 default to 0 — conservative.
//   • hasExteriorEdge defaults to `false` — A-7 may surface false flags.
// The whole call is wrapped in try/catch so a projector or validator throw
// NEVER blocks the modal from rendering — defensive '? Unknown' badge is
// returned instead. The live AI generation path is UNCHANGED.

// IMPORTANT: the `@pryzm/ai-host` root barrel pulls in heavy runtime modules
// (geometry-slab → @thatopen/ui → `HTMLElement`) that break this card model
// under Node test envs. We therefore reach for `validateAndFormatLayout` via
// the deep validator-tree path (which is PURE — no THREE, no DOM, no
// @thatopen). Types stay type-only on the root barrel: type imports are
// erased at compile time and don't trip the runtime barrel.
import { validateAndFormatLayout } from '@pryzm/ai-host/validators/validate-and-format';
import type {
    DtglLayoutDto,
    DtglLayoutEdge,
    DtglLayoutRoom,
} from '@pryzm/ai-host/validators/layout-adapter';
import type { LayoutOption, LayoutRoom, ScoredLayoutOption } from '@pryzm/ai-host';

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

/** Per-card validation summary derived from `validateAndFormatLayout`.
 *  Surfaced as a small pill on the modal card so users can see at a glance
 *  whether the layout passes legality (zero errors) before they pick it.
 *  §VALIDATION-DETAILS (2026-06-01) — extended with `markdownReport`, the
 *  full human-readable violation report the modal expands inline when the
 *  user clicks the pill. Defensive empty string on the projector-error
 *  path so the renderer can always read it without an existence check. */
export interface ValidationBadge {
    /** True if zero errors. Layouts with only warnings still pass legality. */
    readonly passesLegality: boolean;
    /** Total violation count. */
    readonly total: number;
    /** Error count. */
    readonly errors: number;
    /** Warning count. */
    readonly warnings: number;
    /** Short pill label, e.g. "✓ Passes" / "1 warning" / "3 errors". */
    readonly label: string;
    /** Longer one-line summary, e.g. the formatter's
     *  "1 violation: 0 errors, 1 warning (A-2×1)". Defensive empty form
     *  on the projector-error path. */
    readonly summaryLine: string;
    /** §VALIDATION-DETAILS (2026-06-01) — full markdown report
     *  (`formatViolationReport(report)`) so the modal can expand the pill
     *  into a per-class details panel. Always a string: empty on the
     *  projector-error path (defensive — modal shows "Validation skipped"). */
    readonly markdownReport: string;
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
    /** §VALIDATION-BADGE (2026-05-31) — derived from
     *  `validateAndFormatLayout(option)`. Always present; defensive
     *  '? Unknown' badge on projector/validator throw. */
    readonly validation: ValidationBadge;
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

// ── §VALIDATION-BADGE projector + derivation ───────────────────────────────
//
// The validator framework wants a `DtglLayoutDto` (rooms keyed by id,
// edges keyed by id). The `LayoutOption` shape carries rooms with a
// `name` (no `id`) and adjacency-by-NAME. The projector below maps
// names → ids 1:1 (the name IS the id, because layout-option names are
// unique within an option) and dedupes the symmetric `adjacentTo` edges.
//
// Geometry-derived fields the modal layer doesn't know:
//   • widthM / lengthM — `sqrt(area)` (square approximation).
//   • longestUsableWallM / externalFrontageM / hasExteriorEdge /
//     glazedAreaM2 — fall back to the adapter's CONSERVATIVE defaults
//     (see layout-adapter.ts header).
// A future slice can enrich the projector with real opening/frontage
// data from the LayoutWall + LayoutWindow arrays.

/** Defensive badge returned when the projector or validator throws — keeps
 *  the modal alive on a malformed option (NaN area, missing rooms, etc.).
 *  `markdownReport` is the empty string so the modal renderer can detect the
 *  skipped-validation case and surface "Validation skipped" rather than an
 *  empty details panel. */
const UNKNOWN_BADGE: ValidationBadge = Object.freeze({
    passesLegality: true,
    total: 0,
    errors: 0,
    warnings: 0,
    label: '? Unknown',
    summaryLine: 'validation skipped (projector error)',
    markdownReport: '',
});

/** True iff `n` is a finite, non-negative number. */
function isFiniteNonNeg(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

/** Project one `LayoutRoom` into a validator `DtglLayoutRoom`. Throws on
 *  a fundamentally malformed room (so the outer try/catch surfaces the
 *  defensive badge) — every defensive default is applied INSIDE
 *  `validateAndFormatLayout`'s adapter, not here. */
function projectRoom(r: LayoutRoom): DtglLayoutRoom {
    if (!r || typeof r.name !== 'string' || r.name.length === 0) {
        throw new Error('projectRoom: missing name');
    }
    if (typeof r.type !== 'string' || r.type.length === 0) {
        throw new Error('projectRoom: missing type');
    }
    if (!isFiniteNonNeg(r.area)) {
        throw new Error(`projectRoom: room '${r.name}' has non-finite area`);
    }
    // Square approximation: the modal-layer LayoutRoom carries no rect.
    const side = Math.sqrt(r.area);
    return {
        id: r.name,
        type: r.type,
        areaM2: r.area,
        widthM: side,
        lengthM: side,
        // Leave the rest UNSET — the adapter applies its CONSERVATIVE
        // defaults (longestUsableWallM = max(widthM,lengthM);
        // externalFrontageM = 0; hasExteriorEdge = false; glazedAreaM2 = 0).
    };
}

/** Dedupe + project the per-room `adjacentTo` lists into a symmetric edge
 *  set. Uses a sorted-pair key so {A,B} and {B,A} collapse to one edge. */
function projectEdges(rooms: ReadonlyArray<LayoutRoom>): DtglLayoutEdge[] {
    const known = new Set<string>();
    for (const r of rooms) known.add(r.name);
    const seen = new Set<string>();
    const out: DtglLayoutEdge[] = [];
    for (const r of rooms) {
        const adj = Array.isArray(r.adjacentTo) ? r.adjacentTo : [];
        for (const other of adj) {
            if (typeof other !== 'string' || other.length === 0) continue;
            if (!known.has(other)) continue;   // dangling reference — skip
            if (other === r.name) continue;    // self-loop — skip
            const key = r.name < other ? `${r.name}|${other}` : `${other}|${r.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ aId: r.name, bId: other });
        }
    }
    return out;
}

/** Project a `LayoutOption` into the validator's `DtglLayoutDto`. PRIVATE
 *  helper — exposed only via `buildLayoutCardModel`. */
function optionToDto(option: LayoutOption): DtglLayoutDto {
    if (!option || !Array.isArray(option.rooms)) {
        throw new Error('optionToDto: malformed option (no rooms array)');
    }
    const rooms = option.rooms.map(projectRoom);
    const edges = projectEdges(option.rooms);
    return { rooms, edges };
}

/** Build the per-card ValidationBadge. Wraps the validator call in
 *  try/catch — a projector or validator throw NEVER blocks the modal. */
function buildValidationBadge(option: LayoutOption): ValidationBadge {
    try {
        const dto = optionToDto(option);
        const { report, passesLegality, summaryLine, markdownReport } =
            validateAndFormatLayout(dto);
        const total    = report.total;
        const errors   = report.errors;
        const warnings = report.warnings;
        const label =
            passesLegality && total === 0
                ? '✓ Passes'
                : passesLegality
                    ? `${warnings} warning${warnings === 1 ? '' : 's'}`
                    : `${errors} error${errors === 1 ? '' : 's'}`;
        return {
            passesLegality,
            total,
            errors,
            warnings,
            label,
            summaryLine,
            // §VALIDATION-DETAILS (2026-06-01) — plumb the full markdown
            // report through so the modal can expand the pill into a
            // per-class details panel. Defensive `?? ''` keeps the field
            // typed as a string in case a future formatter returns undefined.
            markdownReport: markdownReport ?? '',
        };
    } catch {
        return UNKNOWN_BADGE;
    }
}

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
        validation: buildValidationBadge(option),
    };
}
