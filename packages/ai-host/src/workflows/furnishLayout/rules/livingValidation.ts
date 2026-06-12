// §LIVING-ROOM-RULE-ENGINE (founder #12, 2026-06-12) — the LIVING-ROOM rule module.
//
// Modelled on the §59 kitchen rule engine (ruleSchema.ts / kitchenValidation.ts /
// kitchenScoring.ts). Pure types + DATA + HARD rules + an 8-axis scorecard for a
// living-room layout, SHARING the §59 schema (ModuleMeta / RoomOntology /
// ScorecardWeights / LayoutScore / weightedTotal) so the engine, property panel,
// and estimators read one source of truth.
//
// Pure + deterministic (ADR-0061 purity): NO geometry/THREE/DOM imports, NO RNG,
// NO Date.now — only the placements + the ontology + the room polygon/openings.
// Metres, world XZ. The validator returns { valid, violations[] }; the scorer
// returns a LayoutScore (8 sub-scores + weighted total) — both pure, both used by
// furnishRoom to REPORT (§DIAG-LIVING-RULES / §DIAG-LIVING-SCORE) and to prefer a
// better arrangement when one is available.
//
// The HARD rules (founder #12 corpus — "the TV and the furniture for the TV should
// be placed in front of / as front as possible to the sofa"):
//   • TV-FACE   the TV/media-unit FACES the sofa (its into-room normal within a
//               tolerance of the unit→sofa direction).
//   • TV-OPP    the TV sits roughly OPPOSITE the sofa across the coffee table — the
//               sofa→TV direction is anti-parallel to the sofa's facing.
//   • TV-DIST   the sofa↔TV viewing distance is within a sane band (2.2–4.5 m).
//   • SOFA-FOCAL the primary seating faces the focal wall (the TV/media wall), not
//               a blank wall or the entry door.
//   • AISLE     a circulation aisle ≥0.9 m is kept between the sofa front and the
//               TV unit (you can walk across the room without climbing the table).
//
// The scorecard axes (mapped onto the shared ScorecardWeights record so the existing
// LayoutScore/weightedTotal compose unchanged — the kitchen names are REUSED with a
// living meaning, documented per axis):
//   • workflow      → sofa↔TV alignment (the TV faces + is opposite the sofa).
//   • circulation   → the aisle between the sofa front and the TV unit (≥0.9 m).
//   • storage       → conversation grouping (sofa + secondary seat face a shared
//                     centre — the coffee-table focus).
//   • mep           → focal-wall use (the TV unit anchors a real wall, centred on
//                     the sofa axis).
//   • naturalLight  → daylight NOT blocked (no tall piece — sofa back / media — sits
//                     across a window aperture).
//   • buildability  → viewing distance inside the band (the TV-DIST comfort axis).
//   • cost          → balance (the seating + media mass distributed about the room).
//   • aesthetics    → symmetry of the TV unit on the sofa centre-line.

import type {
    PlacedFurniture, FurnitureKind, OpeningPose, Pt, RoomWallSeg, FurnishRoomInput,
} from '../types.js';
import type {
    ModuleMeta, RoomOntology, ScorecardWeights, LayoutScore,
} from './ruleSchema.js';
import { weightedTotal } from './ruleSchema.js';

// ── geometry helpers (local, pure) ───────────────────────────────────────────
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const dot2 = (a: Pt, b: Pt): number => a.x * b.x + a.z * b.z;
const norm2 = (a: Pt): Pt => { const l = Math.hypot(a.x, a.z) || 1; return { x: a.x / l, z: a.z / l }; };

/** The into-room FORWARD direction (unit) of a placement from its yaw. The solver
 *  places an item with its front (+localZ) along this normal — yawFromNormal(n) =
 *  atan2(n.x, n.z) ⇒ n = (sin yaw, cos yaw). */
const forwardOf = (p: PlacedFurniture): Pt => ({ x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) });

const xz = (p: PlacedFurniture): Pt => ({ x: p.position.x, z: p.position.z });

/** §67.3 — a corner (L-shape) sofa carries a DIFFERENT pose semantics than a
 *  straight sofa: its `position` is the inside-back CORNER origin (not the seating
 *  centroid) and its facing is the opening BISECTOR (localX+localZ), not localZ.
 *  These helpers return the seating CENTRE the viewer occupies and the FORWARD
 *  direction the seating looks toward, correctly for BOTH sofa kinds — so the
 *  TV-facing rules + the viewing distance measure from where a person actually
 *  sits and looks, not the geometric anchor. */
const isCornerSofa = (p: PlacedFurniture): boolean => p.kind === 'corner_sofa';

/** The forward (look) direction of a sofa. For a straight sofa it is localZ. For a
 *  corner sofa it is the PRIMARY (main-run) facing = +localZ (v): the CornerSofaBuilder
 *  backs the main run on the localX edge, so the main run's cushions look along +v.
 *  A TV opposite +v is watchable from the main run (the longer seating) — a single
 *  cardinal direction (so it lines up squarely with one facing wall, not a 45°
 *  diagonal no wall can satisfy). Unit. */
function sofaForward(p: PlacedFurniture): Pt {
    const v: Pt = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };    // localZ
    return v;
}

/** The seating CENTRE (where the viewer sits). For a straight sofa it is the
 *  placement centre. For a corner sofa it is the MAIN run's cushion centre: the
 *  corner origin pushed half the main-run width along +localX (u) and one seat depth
 *  along +localZ (v) — the middle of the long seat, looking along +v. */
function sofaSeatCentre(p: PlacedFurniture): Pt {
    if (!isCornerSofa(p)) return xz(p);
    const u: Pt = { x: Math.cos(p.rotationY), z: -Math.sin(p.rotationY) };   // localX (main run)
    const v: Pt = { x: Math.sin(p.rotationY), z: Math.cos(p.rotationY) };    // localZ (look dir)
    const halfMain = p.footprint.w / 2;   // along the main run
    const seatDepth = 0.45;               // half the ~0.9 m run depth
    return {
        x: p.position.x + u.x * halfMain + v.x * seatDepth,
        z: p.position.z + u.z * halfMain + v.z * seatDepth,
    };
}

// ── the living-room module ontology (pure DATA, §59 ModuleMeta shape) ─────────
//
// Mirrors the kitchen ontology: each placeable living-room module's metadata +
// the founder's clearances. Distances in mm. The HARD/SCORING rules READ these
// values rather than hard-coding them, so the rule engine + estimators share one
// source. `forbiddenZones` reuses the §59 ForbiddenZone union.

const LIVING_MODULES: Record<string, ModuleMeta> = {
    Sofa: {
        moduleType: 'Sofa', widthMm: 2000, depthMm: 900, heightMm: 800,
        services: {},
        clearance: { frontMm: 900 },   // walkway / coffee-table zone in front
        preferredAdjacent: ['CoffeeTable', 'SideTable'], forbiddenAdjacent: [],
        weights: { workflow: 10, ergonomic: 8, cost: 4, visual: 8, scoreWeight: 10 },
    },
    CornerSofa: {
        moduleType: 'CornerSofa', widthMm: 2600, depthMm: 2000, heightMm: 850,
        services: {},
        clearance: { frontMm: 900 },
        preferredAdjacent: ['CoffeeTable'], forbiddenAdjacent: [],
        weights: { workflow: 10, ergonomic: 8, cost: 6, visual: 8, scoreWeight: 10 },
    },
    MediaUnit: {
        moduleType: 'MediaUnit', widthMm: 1600, depthMm: 400, heightMm: 500,
        services: { power: true },
        clearance: { frontMm: 600 },   // the sofa keeps off the front of the unit
        preferredAdjacent: ['Tv'], forbiddenAdjacent: [],
        // T04-style: a tall/wide media wall never over a window (daylight glare on
        // the screen + the unit would block the aperture).
        forbiddenZones: ['underWindow'],
        weights: { workflow: 9, ergonomic: 7, cost: 6, visual: 8, scoreWeight: 9 },
    },
    Tv: {
        moduleType: 'Tv', widthMm: 1400, depthMm: 80, heightMm: 800,
        services: { power: true },
        clearance: {},
        preferredAdjacent: ['MediaUnit'], forbiddenAdjacent: [],
        forbiddenZones: ['underWindow'],
        weights: { workflow: 9, ergonomic: 7, cost: 4, visual: 7, scoreWeight: 9 },
    },
    CoffeeTable: {
        moduleType: 'CoffeeTable', widthMm: 1100, depthMm: 600, heightMm: 400,
        services: {}, clearance: { frontMm: 300 },
        preferredAdjacent: ['Sofa'], forbiddenAdjacent: [],
        weights: { workflow: 6, ergonomic: 7, cost: 3, visual: 6, scoreWeight: 6 },
    },
    LoungeChair: {
        moduleType: 'LoungeChair', widthMm: 850, depthMm: 850, heightMm: 950,
        services: {}, clearance: { frontMm: 200 },
        preferredAdjacent: ['CoffeeTable'], forbiddenAdjacent: [],
        weights: { workflow: 5, ergonomic: 7, cost: 3, visual: 6, scoreWeight: 5 },
    },
};

/** The living-room room ontology (the §59 RoomOntology seed). */
export const LIVING_ONTOLOGY: RoomOntology = { roomType: 'living-room', modules: LIVING_MODULES };

/** Lookup a living module's metadata by type (undefined if not in the ontology). Pure. */
export function livingModule(moduleType: string): ModuleMeta | undefined {
    return LIVING_MODULES[moduleType];
}

/** §59 default living-room scorecard weights (sum = 100). Heaviest on the founder's
 *  ask — the sofa↔TV alignment (workflow) + the viewing distance (buildability). */
export const LIVING_SCORECARD_WEIGHTS: ScorecardWeights = {
    workflow: 25,       // sofa↔TV alignment (TV faces + opposite the sofa)
    circulation: 15,    // aisle between sofa front and TV unit
    storage: 10,        // conversation grouping
    mep: 10,            // focal-wall use (TV unit on a real wall, on the sofa axis)
    naturalLight: 10,   // daylight not blocked
    buildability: 15,   // viewing-distance comfort band
    cost: 5,            // balance
    aesthetics: 10,     // TV centred on the sofa centre-line
};

// ── thresholds (founder #12 corpus) ──────────────────────────────────────────
/** Viewing distance comfort band (m): closer than 2.0 m is too close for comfort
 *  (compact-flat minimum; the founder's ~2.2 m ideal sits inside this), farther than
 *  4.5 m and the TV is too small / the room reads cavernous. The HARD floor is 2.0 m
 *  so a typical 3.4–3.8 m-deep apartment living room (sofa↔screen ≈ 2.0–3.0 m once
 *  the sofa + media-unit depths are subtracted) is not falsely rejected; the IDEAL
 *  remains ~2.5–4.0 m, rewarded by the buildability scoring axis. */
export const VIEW_DIST_LO = 2.0;
export const VIEW_DIST_HI = 4.5;
/** TV-FACE tolerance: the TV's forward direction must be within this of the
 *  unit→sofa direction (cosine ≥ this many → within ~35°). */
const FACE_COS_MIN = 0.82;
/** TV-OPP tolerance: the sofa→TV direction must be anti-parallel to the sofa
 *  forward within ~35° (cosine ≥ FACE_COS_MIN). */
const OPP_COS_MIN = 0.82;
/** SOFA-FOCAL tolerance: the sofa must face roughly toward the TV (cosine of the
 *  sofa forward vs the sofa→TV direction ≥ this → within ~40°). */
const FOCAL_COS_MIN = 0.76;
/** Circulation aisle minimum (m) between the sofa seat front and the TV unit. */
export const AISLE_MIN_M = 0.9;

// ── the sofa / TV / media resolution ─────────────────────────────────────────

/** Every sofa-like placed kind (straight + corner). */
const SOFA_KINDS = new Set<FurnitureKind>(['sofa', 'corner_sofa']);
/** The TV/media kinds whose facing/distance the founder cares about. */
const TV_KINDS = new Set<FurnitureKind>(['tv', 'tv_unit']);

interface LivingItems {
    readonly sofa: PlacedFurniture | null;
    /** The media reference for FACING + DISTANCE — the tv if present, else the unit. */
    readonly tv: PlacedFurniture | null;
    /** The floor-standing media unit (for the aisle + focal-wall axis). */
    readonly mediaUnit: PlacedFurniture | null;
    readonly coffeeTable: PlacedFurniture | null;
}

/** Resolve the sofa + TV + media unit + coffee table from a placement set. The TV
 *  reference prefers the wall-mounted `tv` (the eye-line target); the media unit is
 *  the floor cabinet (`tv_unit`). Either alone counts as the media reference. */
export function resolveLivingItems(placed: readonly PlacedFurniture[]): LivingItems {
    const sofa = placed.find(p => SOFA_KINDS.has(p.kind)) ?? null;
    const tvPanel = placed.find(p => p.kind === 'tv') ?? null;
    const mediaUnit = placed.find(p => p.kind === 'tv_unit') ?? null;
    const coffeeTable = placed.find(p => p.kind === 'coffee_table') ?? null;
    return { sofa, tv: tvPanel ?? mediaUnit, mediaUnit, coffeeTable };
}

// ── HARD-rule validation ─────────────────────────────────────────────────────

/** One HARD-rule violation. `rule` is the stable id; `kind` is the offending kind;
 *  `detail` is a human string for the §DIAG log. */
export interface LivingViolation {
    readonly rule: string;   // 'TV-FACE' | 'TV-OPP' | 'TV-DIST' | 'SOFA-FOCAL' | 'AISLE'
    readonly kind: FurnitureKind;
    readonly detail: string;
    readonly position: Pt;
}

export interface LivingValidationResult {
    readonly valid: boolean;                       // false ⇒ ≥1 HARD violation
    readonly violations: readonly LivingViolation[];
}

/** True when ANY window's centre projects onto the placement's footprint AABB grown
 *  by the window half-width (the piece sits under/over the aperture). */
function underAnyWindow(p: PlacedFurniture, windows: readonly OpeningPose[]): OpeningPose | null {
    const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
    const ew = (q === 1 || q === 3) ? p.footprint.l : p.footprint.w;
    const el = (q === 1 || q === 3) ? p.footprint.w : p.footprint.l;
    const c = xz(p);
    for (const w of windows) {
        const half = w.width / 2;
        if (w.center.x >= c.x - ew / 2 - half && w.center.x <= c.x + ew / 2 + half &&
            w.center.z >= c.z - el / 2 - half && w.center.z <= c.z + el / 2 + half) return w;
    }
    return null;
}

/**
 * Validate a living-room layout against the founder #12 HARD rules. Pure +
 * deterministic. `room` carries the polygon/openings the layout was planned from;
 * `ontology` defaults to the living ontology. Returns every HARD violation; `valid`
 * is true iff none fired. When the room has no sofa AND no TV (an unfurnished or
 * tiny living room) the validator is vacuously valid — there is nothing to align.
 */
export function validateLivingLayout(
    placed: readonly PlacedFurniture[],
    room: Pick<FurnishRoomInput, 'polygon' | 'doors' | 'windows'> &
        { walls?: readonly RoomWallSeg[] },
    ontology: RoomOntology = LIVING_ONTOLOGY,
): LivingValidationResult {
    void ontology;   // the living HARD rules are geometric; the ontology drives scoring + estimators.
    const violations: LivingViolation[] = [];
    const windows = room.windows ?? [];
    const { sofa, tv, mediaUnit } = resolveLivingItems(placed);

    // Nothing to align without BOTH a sofa and a media reference.
    if (sofa && tv) {
        const sofaC = sofaSeatCentre(sofa);
        const tvC = xz(tv);
        const sofaFwd = sofaForward(sofa);
        const tvFwd = forwardOf(tv);
        const sofaToTv = norm2({ x: tvC.x - sofaC.x, z: tvC.z - sofaC.z });
        const tvToSofa = { x: -sofaToTv.x, z: -sofaToTv.z };
        const viewDist = dist(sofaC, tvC);

        // ── TV-FACE — the TV faces the sofa ──────────────────────────────────
        // The TV's forward (into-room normal) must point back toward the sofa.
        if (dot2(tvFwd, tvToSofa) < FACE_COS_MIN) {
            violations.push({
                rule: 'TV-FACE', kind: tv.kind, position: tvC,
                detail: `the ${tv.kind} does not face the sofa ` +
                    `(facing·toSofa=${dot2(tvFwd, tvToSofa).toFixed(2)} < ${FACE_COS_MIN})`,
            });
        }

        // ── TV-OPP — the TV is roughly OPPOSITE the sofa across the table ─────
        // The sofa→TV direction must be anti-parallel to the sofa's forward (the
        // TV is "in front of" the sofa, not off to one side / behind it).
        if (dot2(sofaFwd, sofaToTv) < OPP_COS_MIN) {
            violations.push({
                rule: 'TV-OPP', kind: tv.kind, position: tvC,
                detail: `the ${tv.kind} is not opposite the sofa across the coffee table ` +
                    `(sofaFwd·toTv=${dot2(sofaFwd, sofaToTv).toFixed(2)} < ${OPP_COS_MIN})`,
            });
        }

        // ── TV-DIST — viewing distance within the comfort band ───────────────
        if (viewDist < VIEW_DIST_LO - 1e-6 || viewDist > VIEW_DIST_HI + 1e-6) {
            violations.push({
                rule: 'TV-DIST', kind: tv.kind, position: tvC,
                detail: `sofa↔${tv.kind} viewing distance ${viewDist.toFixed(2)}m ` +
                    `outside [${VIEW_DIST_LO}, ${VIEW_DIST_HI}]m`,
            });
        }

        // ── SOFA-FOCAL — the primary seating faces the focal (TV) wall ───────
        if (dot2(sofaFwd, sofaToTv) < FOCAL_COS_MIN) {
            violations.push({
                rule: 'SOFA-FOCAL', kind: sofa.kind, position: sofaC,
                detail: `the sofa does not face the focal wall ` +
                    `(sofaFwd·toTv=${dot2(sofaFwd, sofaToTv).toFixed(2)} < ${FOCAL_COS_MIN})`,
            });
        }

        // ── AISLE — circulation ≥0.9 m between the sofa front and the media ──
        // The clear gap between the sofa's front face and the media unit's front
        // face (along the sofa→media axis). Uses the media UNIT when present (the
        // floor cabinet you'd walk into), else the tv reference.
        const front = mediaUnit ?? tv;
        const frontC = xz(front);
        // measure from the seat centre toward the media; the sofa's seat-front half-
        // extent is its seat depth (≈0.9 m for both straight + corner runs).
        const sofaHalf = isCornerSofa(sofa) ? 0.45 : sofa.footprint.l / 2;
        const gap = dist(sofaC, frontC) - sofaHalf - front.footprint.l / 2;
        if (gap >= 0 && gap < AISLE_MIN_M - 1e-6) {
            violations.push({
                rule: 'AISLE', kind: front.kind, position: frontC,
                detail: `aisle between sofa front and ${front.kind} is ${gap.toFixed(2)}m ` +
                    `(< ${AISLE_MIN_M}m)`,
            });
        }
    }

    // ── window not blocked by a tall media piece — daylight HARD guard ──────
    for (const p of placed) {
        if (TV_KINDS.has(p.kind) && p.footprint.h >= 0.7) {
            const w = underAnyWindow(p, windows);
            if (w) {
                violations.push({
                    rule: 'TV-WINDOW', kind: p.kind, position: xz(p),
                    detail: `${p.kind} overlaps a window aperture (glare + blocks daylight)`,
                });
            }
        }
    }

    return { valid: violations.length === 0, violations };
}

/** Format a validation result for the §DIAG-LIVING-RULES log line. Pure. */
export function formatLivingViolations(roomId: string, res: LivingValidationResult): string {
    if (res.valid) return `§DIAG-LIVING-RULES room=${roomId} valid — 0 HARD violations`;
    const summary = res.violations.map(v => `${v.rule}:${v.kind}`).join(', ');
    return `§DIAG-LIVING-RULES room=${roomId} INVALID ${res.violations.length} HARD ` +
        `violation(s) — ${summary}`;
}

// ── SCORING — the 8-axis living scorecard ────────────────────────────────────

/** workflow → sofa↔TV alignment. Mean of (TV faces the sofa) + (TV opposite the
 *  sofa). Full credit when both cosines are 1; decays toward 0 at the HARD floor. */
function alignmentAxis(items: LivingItems): number {
    const { sofa, tv } = items;
    if (!sofa || !tv) return 40;   // no resolvable pair → neutral-low
    const sofaC = sofaSeatCentre(sofa), tvC = xz(tv);
    const sofaFwd = sofaForward(sofa), tvFwd = forwardOf(tv);
    const sofaToTv = norm2({ x: tvC.x - sofaC.x, z: tvC.z - sofaC.z });
    const tvToSofa = { x: -sofaToTv.x, z: -sofaToTv.z };
    // map cosine [FACE_COS_MIN..1] → [0..1], clamped (anything below the HARD floor
    // is 0 credit on this axis).
    const grade = (cos: number, floor: number): number => clamp01((cos - floor) / (1 - floor));
    const face = grade(dot2(tvFwd, tvToSofa), FACE_COS_MIN);
    const opp = grade(dot2(sofaFwd, sofaToTv), OPP_COS_MIN);
    return 100 * (0.5 * face + 0.5 * opp);
}

/** circulation → the aisle between the sofa front and the media unit (≥0.9 m). */
function circulationAxis(items: LivingItems): number {
    const { sofa, mediaUnit, tv } = items;
    const front = mediaUnit ?? tv;
    if (!sofa || !front) return 50;
    const sofaHalf = isCornerSofa(sofa) ? 0.45 : sofa.footprint.l / 2;
    const gap = dist(sofaSeatCentre(sofa), xz(front)) - sofaHalf - front.footprint.l / 2;
    if (gap >= 1.2) return 100;
    if (gap <= 0.3) return 0;
    if (gap >= AISLE_MIN_M) return 80 + 20 * ((gap - AISLE_MIN_M) / (1.2 - AISLE_MIN_M));
    return 80 * ((gap - 0.3) / (AISLE_MIN_M - 0.3));
}

/** storage → conversation grouping. Reward a secondary seat (lounge chair) that
 *  shares the coffee-table focus with the sofa (both within a sane radius of the
 *  group centre). A lone sofa still scores a baseline. */
function conversationAxis(placed: readonly PlacedFurniture[], items: LivingItems): number {
    const { sofa, coffeeTable } = items;
    if (!sofa) return 50;
    const sofaC = sofaSeatCentre(sofa), sofaFwd = sofaForward(sofa);
    const focus = coffeeTable ? xz(coffeeTable)
        : { x: sofaC.x + sofaFwd.x * 1.0, z: sofaC.z + sofaFwd.z * 1.0 };
    const seats = placed.filter(p => SOFA_KINDS.has(p.kind) || p.kind === 'lounge_chair');
    if (seats.length <= 1) return 70;   // a single seating piece — fine, not a group
    // every seat within ~2.8 m of the focus reads as one conversation circle (the
    // corner sofa's anchor is its back-corner, so allow a touch more reach).
    const seatPt = (s: PlacedFurniture): Pt => (SOFA_KINDS.has(s.kind) ? sofaSeatCentre(s) : xz(s));
    const near = seats.filter(s => dist(seatPt(s), focus) <= 2.8).length;
    return 100 * clamp01(near / seats.length);
}

/** mep → focal-wall use. The media unit anchors a real wall AND sits on the sofa's
 *  centre-line (the sofa→unit direction aligned with the sofa forward). */
function focalWallAxis(items: LivingItems, room: Pick<FurnishRoomInput, 'walls'>): number {
    const { sofa, mediaUnit, tv } = items;
    const unit = mediaUnit ?? tv;
    if (!sofa || !unit) return 50;
    let score = 50;
    // unit backed by a wall (its back face within ~0.2 m of a wall line)?
    const walls = room.walls ?? [];
    const n = forwardOf(unit);
    const backX = unit.position.x - n.x * (unit.footprint.l / 2);
    const backZ = unit.position.z - n.z * (unit.footprint.l / 2);
    const onWall = walls.some(w => {
        const d = norm2({ x: w.b.x - w.a.x, z: w.b.z - w.a.z });
        const t = (backX - w.a.x) * d.x + (backZ - w.a.z) * d.z;
        if (t < -0.1 || t > w.length + 0.1) return false;
        const px = w.a.x + d.x * t, pz = w.a.z + d.z * t;
        return Math.hypot(backX - px, backZ - pz) < 0.25;
    });
    if (onWall) score += 25;
    // unit on the sofa centre-line (sofa forward aligned with sofa→unit)?
    const sofaC = sofaSeatCentre(sofa);
    const sofaToUnit = norm2({ x: xz(unit).x - sofaC.x, z: xz(unit).z - sofaC.z });
    if (dot2(sofaForward(sofa), sofaToUnit) > 0.9) score += 25;
    return Math.min(100, score);
}

/** naturalLight → daylight NOT blocked. Full credit when no tall living piece sits
 *  across a window; penalised per blocking piece. */
function naturalLightAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'windows'>): number {
    const windows = room.windows ?? [];
    if (windows.length === 0) return 50;   // no window → neutral
    let blocked = 0;
    for (const p of placed) {
        // tall pieces only: media wall, bookshelf, the sofa back at full height.
        if ((TV_KINDS.has(p.kind) || p.kind === 'bookshelf_glass') && p.footprint.h >= 0.7) {
            if (underAnyWindow(p, windows)) blocked++;
        }
    }
    return blocked === 0 ? 100 : Math.max(0, 100 - blocked * 50);
}

/** buildability → viewing-distance comfort. Full credit inside [2.2,4.5]m, decaying
 *  outside the band. (Reuses the §59 bandScore idea.) */
function viewingDistanceAxis(items: LivingItems): number {
    const { sofa, tv } = items;
    if (!sofa || !tv) return 50;
    const v = dist(sofaSeatCentre(sofa), xz(tv));
    if (v >= VIEW_DIST_LO && v <= VIEW_DIST_HI) return 100;
    const d = v < VIEW_DIST_LO ? VIEW_DIST_LO - v : v - VIEW_DIST_HI;
    return 100 * clamp01(1 - d / 2.0);   // decay over 2 m beyond the band
}

/** cost → balance. The seating + media mass distributed about the room centroid
 *  (close to centre = balanced). Mirrors the §59 aesthetics axis. */
function balanceAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'polygon' | 'centroid'>): number {
    const floor = placed.filter(p => p.footprint.baseOffset < 0.5);
    if (floor.length === 0) return 50;
    let sx = 0, sz = 0;
    for (const p of floor) { sx += p.position.x; sz += p.position.z; }
    const cx = sx / floor.length, cz = sz / floor.length;
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of room.polygon) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    const halfSpan = Math.max(1e-3, Math.max(maxX - minX, maxZ - minZ) / 2);
    const off = dist({ x: cx, z: cz }, room.centroid) / halfSpan;
    return 100 * clamp01(1 - off);
}

/** aesthetics → the TV/media unit centred on the sofa centre-line (lateral offset
 *  from the sofa axis is small). Full credit at 0 offset, decaying to 0 at ~1.0 m. */
function symmetryAxis(items: LivingItems): number {
    const { sofa, mediaUnit, tv } = items;
    const unit = mediaUnit ?? tv;
    if (!sofa || !unit) return 50;
    const sofaC = sofaSeatCentre(sofa), unitC = xz(unit);
    const fwd = sofaForward(sofa);
    const along = perpAlong(sofaC, unitC, fwd);   // lateral offset off the sofa axis
    return 100 * clamp01(1 - along / 1.0);
}

/** Lateral (perpendicular) offset of `q` from the line through `p` with direction
 *  `fwd` — the component of (q−p) perpendicular to `fwd`. */
function perpAlong(p: Pt, q: Pt, fwd: Pt): number {
    const dx = q.x - p.x, dz = q.z - p.z;
    const along = dx * fwd.x + dz * fwd.z;
    const px = dx - along * fwd.x, pz = dz - along * fwd.z;
    return Math.hypot(px, pz);
}

/**
 * Score a living-room layout on the 8 scorecard axes and combine them via
 * `weightedTotal(LIVING_SCORECARD_WEIGHTS)`. Pure + deterministic. `valid` /
 * `hardFailures` are PASSED IN (the caller runs the HARD validator) so scoring
 * stays a pure ranking function; the score is computed regardless so the engine
 * can rank "least-bad" when nothing is fully valid.
 */
export function scoreLivingLayout(
    placed: readonly PlacedFurniture[],
    room: Pick<FurnishRoomInput, 'polygon' | 'centroid' | 'windows' | 'walls'>,
    opts: {
        weights?: ScorecardWeights;
        valid?: boolean;
        hardFailures?: readonly string[];
    } = {},
): LayoutScore {
    const weights = opts.weights ?? LIVING_SCORECARD_WEIGHTS;
    const items = resolveLivingItems(placed);

    const axes: Record<keyof ScorecardWeights, number> = {
        workflow: round2(alignmentAxis(items)),
        circulation: round2(circulationAxis(items)),
        storage: round2(conversationAxis(placed, items)),
        mep: round2(focalWallAxis(items, room)),
        naturalLight: round2(naturalLightAxis(placed, room)),
        buildability: round2(viewingDistanceAxis(items)),
        cost: round2(balanceAxis(placed, room)),
        aesthetics: round2(symmetryAxis(items)),
    };

    return {
        valid: opts.valid ?? true,
        hardFailures: opts.hardFailures ?? [],
        axes,
        total: round2(weightedTotal(axes, weights)),
    };
}

/** Format a LayoutScore for the §DIAG-LIVING-SCORE log line. Pure. */
export function formatLivingScore(roomId: string, tag: string, score: LayoutScore): string {
    const a = score.axes;
    const axes = `align=${a.workflow} circ=${a.circulation} conv=${a.storage} focal=${a.mep} ` +
        `light=${a.naturalLight} view=${a.buildability} bal=${a.cost} sym=${a.aesthetics}`;
    const validTag = score.valid ? 'valid' : `INVALID[${score.hardFailures.join(',')}]`;
    return `§DIAG-LIVING-SCORE room=${roomId} ${tag} total=${score.total} ${validTag} — ${axes}`;
}
