// §ROOM-MODULE-RULE-ENGINE P3 — kitchen SCORING pass (§59 P3, SPEC §5).
//
// P2 (kitchenValidation.ts) gates a kitchen layout on the HARD safety rules. P3
// RANKS the survivors: it computes the eight SPEC §5 scorecard axes from the
// placement + the ontology and combines them with `weightedTotal` using the
// KITCHEN_SCORECARD_WEIGHTS (sum = 100). The engine (kitchenLayout.generate-N)
// generates a few candidate arrangements, HARD-validates each, and keeps the
// highest-scoring VALID one — so the rank only decides which of MULTIPLE valid
// candidates ships.
//
// Pure + deterministic (ADR-0061 purity): NO geometry/THREE/DOM imports, NO RNG,
// NO Date.now — only the placements + the ontology + the room polygon/openings.
// Metres, world XZ. Returns a LayoutScore (the per-axis 0..100 sub-scores + the
// weighted total) the caller logs (§DIAG-KITCHEN-SCORE) and ranks on.
//
// The eight axes (SPEC §5 corpus, default weights in KITCHEN_SCORECARD_WEIGHTS):
//   • workflow      (25) — the sink↔hob↔fridge WORK-TRIANGLE: each leg 1.2–2.7 m,
//                          total perimeter 4–7.9 m (NKBA). Outside the band → penalty.
//   • circulation   (20) — clear passage in front of the runs (≥1.0–1.2 m).
//   • storage       (15) — total cabinet storage volume vs the family-size need.
//   • mep           (10) — sink/hob near services, hob NOT under a window.
//   • naturalLight  (10) — the sink under/near a window (rewards the v174 win-sink).
//   • buildability  (10) — run continuity (modules butt into long unbroken runs).
//   • cost          (5)  — corner efficiency (fewer wrapped corners = cheaper).
//   • aesthetics    (5)  — symmetry / balance of the runs about the room centroid.

import type { PlacedFurniture, FurnitureKind, OpeningPose, Pt, RoomWallSeg, FurnishRoomInput }
    from '../types.js';
import type { LayoutScore, RoomOntology, ScorecardWeights } from './ruleSchema.js';
import { KITCHEN_SCORECARD_WEIGHTS, weightedTotal } from './ruleSchema.js';
import { KITCHEN_ONTOLOGY, kitchenModule } from './moduleOntology.js';

// ── geometry helpers (local, pure) ───────────────────────────────────────────
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);
const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Map a D-FLE FurnitureKind to its ontology module type (the same bridge the
 *  validator uses — kept local so scoring + validation can't drift on the names). */
const KIND_TO_MODULE: Partial<Record<FurnitureKind, string>> = {
    sink: 'SinkUnit', hob: 'HobUnit', oven: 'OvenTower', dishwasher: 'Dishwasher',
    fridge: 'Fridge', extractor: 'Extractor', base_unit: 'BaseCabinet',
    washing_machine: 'BaseCabinet', kitchen_island: 'Island', pantry_cabinet: 'Pantry',
};

/** Storage volume (litres) a placed kind contributes, from the ontology. A
 *  parametric run carries no loose modules → its storage is estimated from the
 *  cabinet-unit count instead (see storageAxis). */
function storageVolumeOf(kind: FurnitureKind, ontology: RoomOntology): number {
    const type = KIND_TO_MODULE[kind];
    if (!type) return 0;
    const meta = ontology.modules[type] ?? kitchenModule(type);
    return meta?.storageVolumeL ?? 0;
}

/** AABB half-extents of a placement after its (cardinal) yaw. `w` runs along the
 *  wall, `l` is depth into the room; yaw 90/270 swaps them. */
function halfExtents(p: PlacedFurniture): { hx: number; hz: number } {
    const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
    const ew = (q === 1 || q === 3) ? p.footprint.l : p.footprint.w;
    const el = (q === 1 || q === 3) ? p.footprint.w : p.footprint.l;
    return { hx: ew / 2, hz: el / 2 };
}

// ── work-triangle extraction ──────────────────────────────────────────────────
//
// The three stations (sink / hob / fridge) come either from loose appliance
// placements (planKitchen) OR from the parametric run's appliance-slot unit
// positions (planKitchenRun). For the loose path we read the kinds directly; for
// the run path we synthesise approximate station points from the run's footprint +
// the appliance slots so the triangle still scores. Returns null when fewer than
// three stations resolve (an I kitchen with two stations still scores its partial).

interface Triangle { readonly sink: Pt; readonly hob: Pt; readonly fridge: Pt }

/** Loose-module triangle: the sink / hob / fridge placement centres. */
function looseTriangle(placed: readonly PlacedFurniture[]): Triangle | null {
    const find = (k: FurnitureKind): Pt | null => {
        const p = placed.find(x => x.kind === k);
        return p ? { x: p.position.x, z: p.position.z } : null;
    };
    const sink = find('sink'), hob = find('hob'), fridge = find('fridge');
    if (!sink || !hob || !fridge) return null;
    return { sink, hob, fridge };
}

/** Parametric-run triangle: project the run's appliance slots back to world points.
 *  The run is anchored at its spine midpoint; unit `index` i sits along the spine
 *  width at (i + 0.5) cell widths from the run's start end. Returns null when the
 *  run carries no sink+hob+fridge slots. Deterministic. */
function runTriangle(run: PlacedFurniture): Triangle | null {
    const cfg = run.kitchenConfig;
    if (!cfg?.units) return null;
    const yaw = run.rotationY;
    // Run's local +X along the spine; group is centred so unit i centre is at
    // x_local = (i + 0.5) * cellW - length/2. Rotate by yaw into world.
    const cellW = 0.60;
    const len = cfg.length;
    const dirX = Math.cos(yaw), dirZ = -Math.sin(yaw);   // local +X → world (yaw about Y)
    const c = run.position;
    const pointFor = (arm: string, index: number): Pt => {
        // Only the main arm projects cleanly along the spine; left/right arms wrap a
        // corner — we approximate them as offset off the spine ends (good enough to
        // give the triangle a non-degenerate leg). Deterministic.
        const along = (index + 0.5) * cellW - len / 2;
        const base: Pt = { x: c.x + dirX * along, z: c.z + dirZ * along };
        if (arm === 'main') return base;
        // secondary arm: nudge it off the nearest spine end perpendicular into room.
        const end: Pt = arm === 'left'
            ? { x: c.x - dirX * (len / 2), z: c.z - dirZ * (len / 2) }
            : { x: c.x + dirX * (len / 2), z: c.z + dirZ * (len / 2) };
        // perpendicular (into-room) unit from yaw
        const px = Math.sin(yaw), pz = Math.cos(yaw);
        const off = (index + 0.5) * cellW;
        return { x: end.x + px * off, z: end.z + pz * off };
    };
    const slotFor = (appliances: string[]): Pt | null => {
        const u = cfg.units!.find(x => x.appliance && appliances.includes(x.appliance));
        return u ? pointFor(u.arm, u.index) : null;
    };
    const sink = slotFor(['sink_inox', 'sink']);
    const hob = slotFor(['hob']);
    const fridge = slotFor(['fridge_combi_silver', 'fridge']);
    if (!sink || !hob || !fridge) return null;
    return { sink, hob, fridge };
}

/** The work-triangle for a placement set: loose modules first, else the parametric
 *  run's appliance slots. */
function workTriangle(placed: readonly PlacedFurniture[]): Triangle | null {
    const loose = looseTriangle(placed);
    if (loose) return loose;
    const run = placed.find(p =>
        p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
    return run ? runTriangle(run) : null;
}

// ── axis: workflow (the work-triangle) ────────────────────────────────────────
//
// NKBA: each leg 1.2–2.7 m, total perimeter 4.0–7.9 m. Score each leg by how far
// it sits inside the [lo,hi] band (full credit inside, linear decay outside to a
// floor), and the perimeter likewise. The axis is the mean of the three leg scores
// and the perimeter score, 0..100.

const LEG_LO = 1.2, LEG_HI = 2.7;
const PERIM_LO = 4.0, PERIM_HI = 7.9;

/** 1.0 inside [lo,hi], decaying linearly to 0 at `span` outside the band. */
function bandScore(v: number, lo: number, hi: number, span: number): number {
    if (v >= lo && v <= hi) return 1;
    const d = v < lo ? lo - v : v - hi;
    return clamp01(1 - d / span);
}

/** workflow axis (0..100) from the work-triangle, or a documented partial when the
 *  triangle is incomplete (an I kitchen that resolves <3 stations).
 *
 *  A leg that BUSTS the NKBA hard band (2.7 m max / 1.2 m min) is the founder's HARD
 *  triangle finding — the workflow axis must not reward it. So in addition to the
 *  in-band credit, each leg outside [1.2,2.7] applies a multiplicative HARD penalty
 *  to the whole axis (so a triangle-busting U can never out-workflow an NKBA-sane L
 *  on the heaviest scorecard axis — matching validateKitchenTriangle's hard max). */
function workflowAxis(placed: readonly PlacedFurniture[]): number {
    const tri = workTriangle(placed);
    if (!tri) return 40;   // no resolvable triangle → neutral-low (an I run partial)
    const lSH = dist(tri.sink, tri.hob);
    const lHF = dist(tri.hob, tri.fridge);
    const lFS = dist(tri.fridge, tri.sink);
    const legs = [lSH, lHF, lFS];
    const perim = lSH + lHF + lFS;
    const legSpan = 1.5;     // decay over 1.5 m beyond the band
    const perimSpan = 3.0;
    const legCredit = legs.reduce((s, l) => s + bandScore(l, LEG_LO, LEG_HI, legSpan), 0) / 3;
    const perimS = bandScore(perim, PERIM_LO, PERIM_HI, perimSpan);
    // weight the legs (the day-to-day ergonomics) above the perimeter sum.
    let axis = 100 * (0.7 * legCredit + 0.3 * perimS);
    // HARD-band penalty: any leg outside [1.2,2.7] (the NKBA hard band) multiplies
    // the axis down by how far OUT it sits — a 3.1 m leg (0.4 m over) → ×~0.6; this
    // keeps a busting triangle strictly below an all-in-band one.
    for (const l of legs) {
        if (l > LEG_HI || l < LEG_LO) {
            const over = l > LEG_HI ? l - LEG_HI : LEG_LO - l;
            axis *= clamp01(1 - over / 1.0);   // 0 over → ×1; ≥1.0 m over → ×0
        }
    }
    return axis;
}

// ── axis: circulation (clear passage in front of the runs) ────────────────────
//
// The runs reserve `clearFront` in front (1.0 m on a kitchen run). Score by the
// SMALLEST front-clearance any floor run actually has room for: the room's shorter
// span minus the run depth must leave ≥1.0–1.2 m. We approximate with the room's
// minimum bounding span vs the deepest run depth + the ideal aisle. Deterministic.

const AISLE_MIN = 1.0, AISLE_IDEAL = 1.2;

function bbox(poly: readonly Pt[]): { minX: number; minZ: number; maxX: number; maxZ: number } {
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const p of poly) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, minZ, maxX, maxZ };
}

function circulationAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'polygon'>): number {
    const floor = placed.filter(p => p.footprint.baseOffset < 0.5);
    if (floor.length === 0) return 50;
    const bb = bbox(room.polygon);
    const span = Math.min(bb.maxX - bb.minX, bb.maxZ - bb.minZ);
    // deepest run footprint depth (l into the room).
    let maxDepth = 0;
    for (const p of floor) {
        const { hz } = halfExtents(p);
        maxDepth = Math.max(maxDepth, hz * 2);
    }
    // single-wall (I) leaves span-depth; a wrap (L/U with runs on opposite walls)
    // leaves span - 2·depth. Approximate by checking if runs sit on opposite walls.
    const onTwoOpposite = runsOnOppositeWalls(floor, bb);
    const aisle = onTwoOpposite ? span - 2 * maxDepth : span - maxDepth;
    // score: full at ≥ ideal, 0 at ≤ 0.4 m (impassable), linear between min/ideal.
    if (aisle >= AISLE_IDEAL) return 100;
    if (aisle <= 0.4) return 0;
    if (aisle >= AISLE_MIN) return 80 + 20 * ((aisle - AISLE_MIN) / (AISLE_IDEAL - AISLE_MIN));
    return 80 * ((aisle - 0.4) / (AISLE_MIN - 0.4));
}

/** Do floor runs occupy BOTH a low-side and a high-side wall on either axis (a
 *  galley / U where the aisle is pinched between opposite runs)? Heuristic. */
function runsOnOppositeWalls(floor: readonly PlacedFurniture[], bb: { minX: number; minZ: number; maxX: number; maxZ: number }): boolean {
    const near = (v: number, edge: number): boolean => Math.abs(v - edge) < 1.0;
    let loX = false, hiX = false, loZ = false, hiZ = false;
    for (const p of floor) {
        if (near(p.position.x, bb.minX)) loX = true;
        if (near(p.position.x, bb.maxX)) hiX = true;
        if (near(p.position.z, bb.minZ)) loZ = true;
        if (near(p.position.z, bb.maxZ)) hiZ = true;
    }
    return (loX && hiX) || (loZ && hiZ);
}

// ── axis: storage (cabinet volume vs family need) ─────────────────────────────
//
// Sum the ontology storage volume of every base/tall module (loose path) OR
// estimate from the run's cabinet-unit count × the BaseCabinet volume (run path).
// Compare to a per-family need (we don't carry family size here, so use a fixed
// "good kitchen" target of ~1400 L; clamp). Deterministic.

const STORAGE_TARGET_L = 1400;

function storageAxis(placed: readonly PlacedFurniture[], ontology: RoomOntology): number {
    let vol = 0;
    for (const p of placed) {
        if (p.kitchenConfig?.units) {
            // parametric run: count cabinet (non-appliance) units × base volume,
            // plus L/U arm units.
            const base = ontology.modules['BaseCabinet']?.storageVolumeL ?? 260;
            const cabinetUnits = p.kitchenConfig.units.filter(u => !u.appliance).length;
            vol += cabinetUnits * base;
        } else {
            vol += storageVolumeOf(p.kind, ontology);
        }
    }
    return 100 * clamp01(vol / STORAGE_TARGET_L);
}

// ── axis: mep (services proximity + hob safety) ───────────────────────────────
//
// The sink/hob want to be near service walls (exterior walls carry the risers in a
// flat) and the hob must NOT sit under a window (the HARD rule already gates that;
// the axis REWARDS keeping it clear). We score: sink near a wall (always, it's in a
// run) + hob clear of windows + hob & sink on the same run wall (a single service
// drop). Deterministic.

function mepAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'windows'>): number {
    const windows = room.windows ?? [];
    let score = 60;   // baseline: a run-mounted kitchen always has wall-backed services
    const hob = placed.find(p => p.kind === 'hob');
    const sink = placed.find(p => p.kind === 'sink');
    // hob clear of windows → +20
    if (hob) {
        score += underAnyWindow(hob, windows) ? 0 : 20;
    } else {
        score += 20;   // parametric run: hob-under-window gated by slot assignment
    }
    // sink & hob roughly collinear (same service wall) → +20
    if (hob && sink) {
        const sameWall = Math.abs(hob.rotationY - sink.rotationY) < 1e-3;
        if (sameWall) score += 20;
    } else {
        score += 20;
    }
    return Math.min(100, score);
}

/** True when ANY window's centre falls within the placement's footprint AABB grown
 *  by the window half-width (the module sits under/over the aperture). */
function underAnyWindow(p: PlacedFurniture, windows: readonly OpeningPose[]): boolean {
    const { hx, hz } = halfExtents(p);
    const c = p.position;
    for (const w of windows) {
        const half = w.width / 2;
        if (w.center.x >= c.x - hx - half && w.center.x <= c.x + hx + half &&
            w.center.z >= c.z - hz - half && w.center.z <= c.z + hz + half) return true;
    }
    return false;
}

// ── axis: naturalLight (sink under/near a window — rewards the v174 win-sink) ──
//
// The §27 daylight intent + the founder's "window over the sink": full credit when
// the sink sits directly under a window, decaying with the sink↔window distance.
// For the parametric run we test the run footprint vs the windows + whether the
// sink slot is offset toward a window. Deterministic.

function naturalLightAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'windows'>): number {
    const windows = room.windows ?? [];
    if (windows.length === 0) return 50;   // no window in the room → neutral
    const sink = placed.find(p => p.kind === 'sink');
    if (sink) {
        if (underAnyWindow(sink, windows)) return 100;
        // nearest window distance from the sink centre.
        const d = Math.min(...windows.map(w => dist({ x: sink.position.x, z: sink.position.z }, w.center)));
        return 100 * clamp01(1 - d / 2.5);   // full at 0, 0 at ≥2.5 m
    }
    // parametric run: reward when the run footprint sits under a window AND a sink
    // slot exists (the slot is offset toward the window by sinkUnitIndexUnderWindow).
    const run = placed.find(p =>
        p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
    if (run && underAnyWindow(run, windows) &&
        run.kitchenConfig?.units?.some(u => u.appliance === 'sink_inox' || u.appliance === 'sink')) {
        return 100;
    }
    return 50;
}

// ── axis: buildability (run continuity — unbroken module runs) ────────────────
//
// Cabinets that butt into long unbroken runs are cheaper + cleaner to build than a
// scatter of short stubs. Score by the largest collinear run length relative to the
// total module width. For a parametric run this is ~1 (it IS one continuous run).

function buildabilityAxis(placed: readonly PlacedFurniture[]): number {
    const run = placed.find(p =>
        p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
    if (run) return run.kind === 'kitchen_straight' ? 100 : 90;   // I cleanest; L/U one corner break
    const floor = placed.filter(p => p.footprint.baseOffset < 0.5);
    if (floor.length === 0) return 50;
    // group floor modules by (rotation, perpendicular-axis position) into collinear
    // runs; the largest run's module count vs the total = continuity.
    const groups = new Map<string, number>();
    for (const p of floor) {
        const q = Math.round(p.rotationY / (Math.PI / 2)) & 3;
        const alongX = (q === 0 || q === 2);
        const key = `${q}:${alongX ? round2(p.position.z) : round2(p.position.x)}`;
        groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    const largest = Math.max(...groups.values());
    return 100 * (largest / floor.length);
}

// ── axis: cost (corner efficiency — fewer wrapped corners) ────────────────────
//
// Each wrapped corner adds an awkward (blind / magic) corner cabinet → cost. An I
// run has none, an L one, a U two. Parametric run kind tells us directly; loose
// path infers from how many distinct run orientations are present.

function costAxis(placed: readonly PlacedFurniture[]): number {
    const run = placed.find(p =>
        p.kind === 'kitchen_straight' || p.kind === 'kitchen_l_shape' || p.kind === 'kitchen_u_shape');
    if (run) {
        return run.kind === 'kitchen_straight' ? 100 : run.kind === 'kitchen_l_shape' ? 80 : 60;
    }
    const floor = placed.filter(p => p.footprint.baseOffset < 0.5);
    const orientations = new Set(floor.map(p => Math.round(p.rotationY / (Math.PI / 2)) & 3));
    const corners = Math.max(0, orientations.size - 1);
    return Math.max(0, 100 - corners * 20);
}

// ── axis: aesthetics (symmetry / balance about the centroid) ──────────────────
//
// A balanced kitchen distributes its mass around the room rather than piling it in
// one corner. Score by how close the placed modules' centroid sits to the room
// centroid (normalised by the room half-span). Deterministic.

function aestheticsAxis(placed: readonly PlacedFurniture[], room: Pick<FurnishRoomInput, 'polygon' | 'centroid'>): number {
    const floor = placed.filter(p => p.footprint.baseOffset < 0.5);
    if (floor.length === 0) return 50;
    let sx = 0, sz = 0;
    for (const p of floor) { sx += p.position.x; sz += p.position.z; }
    const cx = sx / floor.length, cz = sz / floor.length;
    const bb = bbox(room.polygon);
    const halfSpan = Math.max(1e-3, Math.max(bb.maxX - bb.minX, bb.maxZ - bb.minZ) / 2);
    const off = dist({ x: cx, z: cz }, room.centroid) / halfSpan;
    return 100 * clamp01(1 - off);
}

// ── the public scorer ─────────────────────────────────────────────────────────

/**
 * Score a kitchen layout's placements on the eight SPEC §5 scorecard axes and
 * combine them via `weightedTotal(KITCHEN_SCORECARD_WEIGHTS)`.
 *
 * Pure + deterministic. `room` carries the polygon/centroid/openings the layout was
 * planned from; `ontology` defaults to the kitchen ontology, `weights` to the SPEC
 * default kitchen weights. `valid`/`hardFailures` are PASSED IN (the caller runs the
 * HARD validator) so scoring stays a pure ranking function — the score is computed
 * regardless so the engine can rank "least-bad" when nothing is fully valid.
 */
export function scoreKitchenLayout(
    placed: readonly PlacedFurniture[],
    room: Pick<FurnishRoomInput, 'polygon' | 'centroid' | 'windows'> &
        { walls?: readonly RoomWallSeg[] },
    opts: {
        ontology?: RoomOntology;
        weights?: ScorecardWeights;
        valid?: boolean;
        hardFailures?: readonly string[];
    } = {},
): LayoutScore {
    const ontology = opts.ontology ?? KITCHEN_ONTOLOGY;
    const weights = opts.weights ?? KITCHEN_SCORECARD_WEIGHTS;

    const axes: Record<keyof ScorecardWeights, number> = {
        workflow: round2(workflowAxis(placed)),
        circulation: round2(circulationAxis(placed, room)),
        storage: round2(storageAxis(placed, ontology)),
        mep: round2(mepAxis(placed, room)),
        naturalLight: round2(naturalLightAxis(placed, room)),
        buildability: round2(buildabilityAxis(placed)),
        cost: round2(costAxis(placed)),
        aesthetics: round2(aestheticsAxis(placed, room)),
    };

    return {
        valid: opts.valid ?? true,
        hardFailures: opts.hardFailures ?? [],
        axes,
        total: round2(weightedTotal(axes, weights)),
    };
}

/** Format a LayoutScore for the §DIAG-KITCHEN-SCORE log line. Pure. */
export function formatKitchenScore(roomId: string, tag: string, score: LayoutScore): string {
    const a = score.axes;
    const axes = `wf=${a.workflow} circ=${a.circulation} stor=${a.storage} mep=${a.mep} ` +
        `light=${a.naturalLight} build=${a.buildability} cost=${a.cost} aes=${a.aesthetics}`;
    const validTag = score.valid ? 'valid' : `INVALID[${score.hardFailures.join(',')}]`;
    return `§DIAG-KITCHEN-SCORE room=${roomId} ${tag} total=${score.total} ${validTag} — ${axes}`;
}
