// §L-456 — the MODEL-MEASUREMENT ADAPTER: the *designed* side of the capacity comparison.
//
// WHAT THIS IS
// ------------
// `buildCapacityComparison` (L2, `@pryzm/site-parcel-data`) already compares a `MeasuredDesign`
// against a `BuildableEnvelope`. Nothing produced the `MeasuredDesign`. This file does — and
// only that. It reads the AUTHORED BIM model (levels, floor plates, rooms) and reports what it
// can honestly measure, returning `null` — with a stated reason — for everything else.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS LIVES AT L5 (`apps/editor`) AND NOT IN A PACKAGE — the layering argument
// ─────────────────────────────────────────────────────────────────────────────────────────
// The obvious home looks like `@pryzm/site-parcel-data`, next to the model it feeds. It is the
// wrong one, and CI would be right to say so:
//
//   • `@pryzm/site-parcel-data` is a PURE L2 rules engine — its whole contract (C58 §1.1) is
//     "deterministic, no THREE/DOM/I-O, depends on `@pryzm/schemas` only". Reaching into
//     `WallStore`/`SlabStore`/`RoomStore` would make it depend on the authored-model layer that
//     sits ABOVE it. That is an upward import: forbidden by the 8-layer rule, and it would
//     destroy the property that makes the zoning engine testable.
//   • `packages/stores` (L3) cannot host it either: `boundaries/element-types` restricts
//     `L1-stores` to `persistence-client, file-format, schemas, protocol, stores`, and the
//     authored geometry (`SlabData`, `RoomData`) lives in none of those. It genuinely cannot
//     see the data.
//   • `packages/geometry-kernel` is explicitly barred from importing stores.
//
// What is actually happening here is a JOIN between two subsystems that are peers — the BIM
// authored model and the site/zoning model — neither of which may import the other. A join
// between peers belongs at the composition layer, which for this surface is the editor app.
// That is also where the other half of the join already lives (`getLastBuildableEnvelope()` in
// `siteDispatch.ts`). So: L5, beside the envelope it is compared against.
//
// NOT A SECOND GEOMETRY ENGINE. The only area arithmetic here is `polygonAreaXZ` — the shoelace
// already exported by the sibling `siteInspectorData.ts`, reused, not reimplemented. The one
// piece of geometry this file adds is `ringsOverlap`, a PREDICATE. It constructs nothing; it
// exists solely so the adapter can DECLINE to sum floor plates it cannot prove are disjoint.
// The repo has no polygon-union operation (see `packages/site-parcel-data/src/geometry/
// insetPolygon.ts` — "the repo has none"), so a union is not available to us; a refusal is.
//
// ─────────────────────────────────────────────────────────────────────────────────────────
// HONESTY RULE 3 — MEASURE, NEVER INFER (this file is where that rule is actually kept)
// ─────────────────────────────────────────────────────────────────────────────────────────
// The L2 model deliberately does not reconstruct GFA as footprint × floors, because a plausible
// number is worse than no number. This adapter inherits that discipline verbatim:
//
//   • GFA is summed from REAL floor plates, per level. No storey multiplication, ever.
//   • Net area is summed from REAL room boundaries. It is never approximated from GFA.
//   • Footprint is the REAL ground-storey plate. It is never approximated from the envelope.
//   • An empty project measures as `null`, NOT as `0`. Zero is a measurement; absence is not,
//     and "0 m² designed" against a 500 m² ceiling would render as a PASS on a project with no
//     building in it — a fabricated compliance claim. (Pinned by test.)
//   • Every `null` carries an `UnmeasuredReason`, so the panel can say WHY rather than "—".
//
// KNOWN DEFECT, REPORTED NOT PAPERED OVER (L-584, C58 §1.3):
//   *Altura reguladora* is measured by ordinance from the RASANT AT THE FAÇADE. PRYZM's level
//   datums are relative to the PROJECT datum, and the terrain sampler takes a single point at
//   the block centroid. On a sloping site the two differ, and the difference is legal, not
//   cosmetic. We therefore measure height above the project datum, state exactly that in a
//   caveat the panel renders, and do NOT claim the value is the regulated height.
//
// Contracts: C58 §1.3 (explain-why), §1.4 (never present a guess as a fact), §1.8 (envelope →
// design bridge); C19 §1.6 (site model read shapes); C03 (state is read, never written here).
// P4 — no `(window as any)`: this module touches no globals at all; every source is INJECTED.
// P6 — this module performs no mutation; it is a read-model adapter.
// P8 — every exported function opens an OpenTelemetry span.

import { trace } from '@opentelemetry/api';
import type { MeasuredDesign } from '@pryzm/site-parcel-data';
import { polygonAreaXZ, type XZVertex } from './siteInspectorData';

const _tracer = trace.getTracer('pryzm.site.designMeasurement');

/** Areas below this (m²) are treated as authoring noise, not a floor plate. */
const MIN_PLATE_AREA_M2 = 0.01;

// ─────────────────────────────────────────────────────────────────────────────
// The normalised snapshot — the authored model reduced to what measurement needs
// ─────────────────────────────────────────────────────────────────────────────

/** A storey datum, as the BIM level store records it. Elevation in metres above project datum. */
export interface AuthoredLevel {
    readonly id: string;
    readonly name: string | null;
    readonly elevation: number;
    /** Floor-to-floor height (m). `null` when the record does not carry one. */
    readonly height: number | null;
}

/** One authored floor plate (a structural slab), in scene-XZ metres. */
export interface AuthoredFloorPlate {
    /** `null` when the record carries no resolvable level — the plate is UNATTRIBUTABLE. */
    readonly levelId: string | null;
    readonly ring: readonly XZVertex[];
    readonly holes: readonly (readonly XZVertex[])[];
}

/** One authored room. `areaM2` is the store's own recomputed net area where available. */
export interface AuthoredRoom {
    readonly levelId: string | null;
    readonly areaM2: number | null;
}

export interface AuthoredModelSnapshot {
    readonly levels: readonly AuthoredLevel[];
    readonly floorPlates: readonly AuthoredFloorPlate[];
    readonly rooms: readonly AuthoredRoom[];
    /**
     * The `levelId` of every authored building element seen (walls, slabs, rooms). A level is a
     * DESIGNED STOREY only if it appears here — an empty level the user added but never built on
     * is not a storey, and counting it would inflate the storey count against the ordinance cap.
     */
    readonly elementLevelIds: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// The measurement result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Why a metric could not be measured. This is the whole point of the type: a panel that renders
 * "—" teaches the user nothing, and a user who cannot tell "you have not drawn a slab" from
 * "PRYZM cannot do this" will read the blank as a pass.
 */
export type UnmeasuredReason =
    | 'no-authored-model'
    | 'no-levels'
    | 'no-designed-storey'
    | 'no-floor-plates'
    | 'no-rooms'
    | 'overlapping-floor-plates'
    | 'unattributed-floor-plate'
    | 'no-storey-height'
    | 'no-storey-at-or-above-datum'
    | 'nothing-above-datum';

/** Human-readable, user-facing text for each reason. Rendered verbatim by the panel. */
export const UNMEASURED_REASON_TEXT: Readonly<Record<UnmeasuredReason, string>> = {
    'no-authored-model': 'Nothing has been authored on this site yet.',
    'no-levels': 'The project has no storey datums to measure against.',
    'no-designed-storey': 'No storey carries any authored building element.',
    'no-floor-plates': 'No floor slabs are authored, so built area cannot be measured. PRYZM will not substitute footprint × storeys.',
    'no-rooms': 'No rooms are defined, so net usable area cannot be measured.',
    'overlapping-floor-plates': 'Two or more floor plates on the same storey overlap. Summing them would double-count, and PRYZM has no polygon-union operation to resolve it — so it declines to report a figure.',
    'unattributed-floor-plate': 'A floor plate is not assigned to a storey, so the per-storey totals would be incomplete.',
    'no-storey-height': 'The topmost designed storey carries no floor-to-floor height.',
    'no-storey-at-or-above-datum': 'No designed storey sits at or above the project datum.',
    'nothing-above-datum': 'Nothing is authored above the project datum.',
};

export interface DesignMeasurement {
    /** Exactly the shape `buildCapacityComparison` consumes. Nulls are honest, not defaults. */
    readonly design: MeasuredDesign;
    /** Per-metric reason a value is `null`. `null` here means the metric WAS measured. */
    readonly unmeasured: Readonly<Record<keyof MeasuredDesign, UnmeasuredReason | null>>;
    /** Qualifications that apply to values we DID report. Rendered next to the numbers. */
    readonly caveats: readonly string[];
    /** Storeys that carry authored elements — the basis of every per-level figure above. */
    readonly designedStoreyCount: number;
}

const NOTHING_MEASURED: MeasuredDesign = {
    footprintM2: null,
    grossFloorAreaM2: null,
    netFloorAreaM2: null,
    heightM: null,
    floors: null,
};

/**
 * The caveat that must travel with any reported height. §L-584 — the ordinance measures from the
 * rasant at the façade; we measure from the project datum. Stated, never silently equated.
 */
export const HEIGHT_DATUM_CAVEAT =
    'Height is measured from the PROJECT DATUM to the top of the highest designed storey. '
    + 'The ordinance measures the regulated height from the rasant at the façade — on a sloping '
    + 'site the two differ, and PRYZM does not yet sample terrain at the façade (L-584).';

const FOOTPRINT_PLATE_CAVEAT =
    'Footprint is measured from the ground-storey floor plate, not from a union of the enclosing '
    + 'wall faces — PRYZM has no polygon-union operation.';

const GFA_PLATE_CAVEAT =
    'Built area is summed from the real floor plate of each designed storey. It is never '
    + 'reconstructed as footprint × storeys.';

// ─────────────────────────────────────────────────────────────────────────────
// Source collection — the ONLY impure step, and it is injected, never global
// ─────────────────────────────────────────────────────────────────────────────

/** Duck-typed read handles. Structural typing keeps this file free of store imports. */
export interface AuthoredModelSources {
    /** The BIM level store — `bimManager` satisfies this via `getLevels()`. */
    readonly levels?: { getLevels?: () => unknown[] } | null;
    /** The slab store (`storeRegistry.getStoreForType('slab')`). */
    readonly slabs?: { getAll?: () => unknown[] } | null;
    /** The room store (`storeRegistry.getStoreForType('room')`). */
    readonly rooms?: { getAll?: () => unknown[] } | null;
    /** The wall store — read ONLY to establish which storeys are designed. */
    readonly walls?: { getAll?: () => unknown[] } | null;
}

const isRec = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null;

const finite = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

const nonEmptyStr = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;

/**
 * Read a plan ring off a record in either of the two slab shapes this repo ships:
 *   • legacy `SlabData` — `polygon: {x, y}[]` where the SECOND coordinate is world Z;
 *   • C11 Zod `Slab`   — `boundary: {x, y, z}[]` where, per CreateSlab, `y` is also world Z.
 * Both therefore map to scene-XZ as `{x, z: secondCoord}`. Returns `null` for a degenerate ring.
 */
function readPlanRing(raw: unknown): XZVertex[] | null {
    if (!Array.isArray(raw) || raw.length < 3) return null;
    const out: XZVertex[] = [];
    for (const p of raw) {
        if (!isRec(p)) return null;
        const x = finite(p.x);
        const second = finite(p.y) ?? finite(p.z);
        if (x === null || second === null) return null;
        out.push({ x, z: second });
    }
    return out.length >= 3 ? out : null;
}

/**
 * Normalise live stores into a snapshot. Never throws — a store that is absent, half-migrated or
 * throwing yields an EMPTY contribution, which downstream reads as "unmeasured", not as zero.
 */
export function collectAuthoredModelSnapshot(sources: AuthoredModelSources): AuthoredModelSnapshot {
    const span = _tracer.startSpan('pryzm.site.collectAuthoredModelSnapshot');
    try {
        const levels: AuthoredLevel[] = [];
        const floorPlates: AuthoredFloorPlate[] = [];
        const rooms: AuthoredRoom[] = [];
        const elementLevelIds = new Set<string>();

        try {
            for (const raw of sources.levels?.getLevels?.() ?? []) {
                if (!isRec(raw)) continue;
                const id = nonEmptyStr(raw.id);
                const elevation = finite(raw.elevation);
                if (id === null || elevation === null) continue;
                const h = finite(raw.height);
                levels.push({
                    id,
                    name: nonEmptyStr(raw.name),
                    elevation,
                    height: h !== null && h > 0 ? h : null,
                });
            }
        } catch { /* no level store yet — measured as "no levels", never as zero storeys */ }

        try {
            for (const raw of sources.slabs?.getAll?.() ?? []) {
                if (!isRec(raw)) continue;
                const ring = readPlanRing(raw.polygon ?? raw.boundary);
                if (!ring) continue;
                const holes: XZVertex[][] = [];
                if (Array.isArray(raw.holes)) {
                    for (const h of raw.holes) {
                        const hr = readPlanRing(h);
                        if (hr) holes.push(hr);
                    }
                }
                const levelId = nonEmptyStr(raw.levelId);
                if (levelId !== null) elementLevelIds.add(levelId);
                floorPlates.push({ levelId, ring, holes });
            }
        } catch { /* slab store unavailable — built area stays unmeasured */ }

        try {
            for (const raw of sources.rooms?.getAll?.() ?? []) {
                if (!isRec(raw)) continue;
                const levelId = nonEmptyStr(raw.levelId);
                if (levelId !== null) elementLevelIds.add(levelId);
                // Prefer the store's own recomputed metric; fall back to the authored boundary.
                const computed = isRec(raw.computed) ? finite(raw.computed.area) : null;
                let areaM2 = computed;
                if (areaM2 === null && isRec(raw.boundary)) {
                    const ring = readPlanRing(raw.boundary.polygon);
                    if (ring) areaM2 = polygonAreaXZ(ring);
                }
                rooms.push({ levelId, areaM2: areaM2 !== null && areaM2 > 0 ? areaM2 : null });
            }
        } catch { /* room store unavailable — net area stays unmeasured */ }

        try {
            for (const raw of sources.walls?.getAll?.() ?? []) {
                if (!isRec(raw)) continue;
                const levelId = nonEmptyStr(raw.levelId);
                if (levelId !== null) elementLevelIds.add(levelId);
            }
        } catch { /* wall store unavailable — storey occupancy falls back to slabs + rooms */ }

        span.setAttribute('pryzm.design.levels', levels.length);
        span.setAttribute('pryzm.design.floorPlates', floorPlates.length);
        span.setAttribute('pryzm.design.rooms', rooms.length);
        return { levels, floorPlates, rooms, elementLevelIds: [...elementLevelIds] };
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlap predicate — the reason this adapter can REFUSE instead of guessing
// ─────────────────────────────────────────────────────────────────────────────

function bounds(ring: readonly XZVertex[]): { minX: number; maxX: number; minZ: number; maxZ: number } {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of ring) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
    }
    return { minX, maxX, minZ, maxZ };
}

function pointInRing(pt: XZVertex, ring: readonly XZVertex[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i]!;
        const b = ring[j]!;
        const straddles = (a.z > pt.z) !== (b.z > pt.z);
        if (straddles && pt.x < ((b.x - a.x) * (pt.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
}

const cross = (o: XZVertex, a: XZVertex, b: XZVertex): number =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** PROPER segment intersection only — plates that merely share an edge do not overlap. */
function segmentsCross(p1: XZVertex, p2: XZVertex, p3: XZVertex, p4: XZVertex): boolean {
    const d1 = cross(p3, p4, p1);
    const d2 = cross(p3, p4, p2);
    const d3 = cross(p1, p2, p3);
    const d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * True when two plan rings share interior area.
 *
 * Deliberately a TEST, not a construction: it answers "may I add these two areas together?" and
 * nothing else. An AABB test alone would be too coarse — two abutting L-shaped plates have
 * overlapping bounding boxes and no shared area, and refusing there would make the adapter
 * useless on exactly the plans it is meant to serve. So: AABB as a cheap reject, then proper
 * edge crossing, then containment.
 */
export function ringsOverlap(a: readonly XZVertex[], b: readonly XZVertex[]): boolean {
    const span = _tracer.startSpan('pryzm.site.ringsOverlap');
    try {
        if (a.length < 3 || b.length < 3) return false;
        const ba = bounds(a);
        const bb = bounds(b);
        if (ba.maxX <= bb.minX || bb.maxX <= ba.minX || ba.maxZ <= bb.minZ || bb.maxZ <= ba.minZ) {
            return false;
        }
        for (let i = 0; i < a.length; i++) {
            const a1 = a[i]!;
            const a2 = a[(i + 1) % a.length]!;
            for (let j = 0; j < b.length; j++) {
                if (segmentsCross(a1, a2, b[j]!, b[(j + 1) % b.length]!)) return true;
            }
        }
        // No crossing edges ⇒ disjoint, or one wholly inside the other.
        return pointInRing(a[0]!, b) || pointInRing(b[0]!, a);
    } finally {
        span.end();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Measurement
// ─────────────────────────────────────────────────────────────────────────────

/** Net plate area = outer ring minus its holes, floored at zero. */
function plateAreaM2(plate: AuthoredFloorPlate): number {
    const gross = polygonAreaXZ(plate.ring);
    let holes = 0;
    for (const h of plate.holes) holes += polygonAreaXZ(h);
    return Math.max(0, gross - holes);
}

type PlateSum = { areaM2: number } | { refusal: UnmeasuredReason };

/**
 * Sum the plates of one storey, or refuse. Refusal is the correct answer whenever the sum could
 * double-count: a wrong area presented as a measurement is the failure mode L-456 exists to stop.
 */
function sumPlates(plates: readonly AuthoredFloorPlate[]): PlateSum {
    const kept = plates.filter((p) => plateAreaM2(p) >= MIN_PLATE_AREA_M2);
    if (kept.length === 0) return { refusal: 'no-floor-plates' };
    for (let i = 0; i < kept.length; i++) {
        for (let j = i + 1; j < kept.length; j++) {
            if (ringsOverlap(kept[i]!.ring, kept[j]!.ring)) {
                return { refusal: 'overlapping-floor-plates' };
            }
        }
    }
    let total = 0;
    for (const p of kept) total += plateAreaM2(p);
    return { areaM2: total };
}

/**
 * Measure the authored design. PURE — the snapshot in, a `MeasuredDesign` out. Never throws.
 *
 * Every metric is either MEASURED off real geometry or `null` with a stated reason. There is no
 * third case, and in particular there is no "derive it from the other metrics" case.
 */
export function measureAuthoredDesign(snapshot: AuthoredModelSnapshot): DesignMeasurement {
    const span = _tracer.startSpan('pryzm.site.measureAuthoredDesign');
    try {
        const unmeasured: Record<keyof MeasuredDesign, UnmeasuredReason | null> = {
            footprintM2: null,
            grossFloorAreaM2: null,
            netFloorAreaM2: null,
            heightM: null,
            floors: null,
        };
        const caveats: string[] = [];

        const occupied = new Set(snapshot.elementLevelIds);
        const designedLevels = snapshot.levels
            .filter((l) => occupied.has(l.id))
            .sort((a, b) => a.elevation - b.elevation);

        // ── Nothing authored ⇒ EVERYTHING unmeasured. Emphatically NOT "0 m², 0 storeys":
        //    zero would be judged `within` against any ceiling and render as a pass on an empty
        //    project — permission manufactured out of an empty model.
        if (snapshot.levels.length === 0) {
            const reason: UnmeasuredReason =
                snapshot.elementLevelIds.length === 0 ? 'no-authored-model' : 'no-levels';
            for (const k of Object.keys(unmeasured) as (keyof MeasuredDesign)[]) unmeasured[k] = reason;
            span.setAttribute('pryzm.design.measured', false);
            return { design: NOTHING_MEASURED, unmeasured, caveats, designedStoreyCount: 0 };
        }
        if (designedLevels.length === 0) {
            const reason: UnmeasuredReason =
                snapshot.elementLevelIds.length === 0 ? 'no-authored-model' : 'no-designed-storey';
            for (const k of Object.keys(unmeasured) as (keyof MeasuredDesign)[]) unmeasured[k] = reason;
            span.setAttribute('pryzm.design.measured', false);
            return { design: NOTHING_MEASURED, unmeasured, caveats, designedStoreyCount: 0 };
        }

        // ── PLANTAS — real storeys, counted from level records that carry authored elements.
        const floors = designedLevels.length;

        // ── ALTURA — project datum to the top of the highest designed storey.
        let heightM: number | null = null;
        const top = designedLevels[designedLevels.length - 1]!;
        if (top.height === null) {
            unmeasured.heightM = 'no-storey-height';
        } else {
            const topOfBuilding = top.elevation + top.height;
            if (topOfBuilding <= 0) {
                unmeasured.heightM = 'nothing-above-datum';
            } else {
                heightM = topOfBuilding;
                caveats.push(HEIGHT_DATUM_CAVEAT);
            }
        }

        // ── SUPERFICIE CONSTRUIDA — summed real plates, storey by storey. Never × storeys.
        let grossFloorAreaM2: number | null = null;
        const platesByLevel = new Map<string, AuthoredFloorPlate[]>();
        let unattributedPlate = false;
        for (const p of snapshot.floorPlates) {
            if (plateAreaM2(p) < MIN_PLATE_AREA_M2) continue;
            if (p.levelId === null) { unattributedPlate = true; continue; }
            if (!occupied.has(p.levelId)) continue;
            const list = platesByLevel.get(p.levelId);
            if (list) list.push(p); else platesByLevel.set(p.levelId, [p]);
        }
        if (unattributedPlate) {
            unmeasured.grossFloorAreaM2 = 'unattributed-floor-plate';
        } else if (platesByLevel.size === 0) {
            unmeasured.grossFloorAreaM2 = 'no-floor-plates';
        } else {
            let total = 0;
            let refusal: UnmeasuredReason | null = null;
            for (const plates of platesByLevel.values()) {
                const sum = sumPlates(plates);
                if ('refusal' in sum) { refusal = sum.refusal; break; }
                total += sum.areaM2;
            }
            if (refusal !== null) {
                unmeasured.grossFloorAreaM2 = refusal;
            } else {
                grossFloorAreaM2 = total;
                caveats.push(GFA_PLATE_CAVEAT);
            }
        }

        // ── OCUPACIÓN — the ground storey's real plate. The ground storey is the lowest designed
        //    storey at or above the project datum; a basement is not the footprint on the plot.
        let footprintM2: number | null = null;
        const groundLevel = designedLevels.find((l) => l.elevation >= 0) ?? null;
        if (groundLevel === null) {
            unmeasured.footprintM2 = 'no-storey-at-or-above-datum';
        } else {
            const groundPlates = platesByLevel.get(groundLevel.id) ?? [];
            if (unattributedPlate) {
                unmeasured.footprintM2 = 'unattributed-floor-plate';
            } else if (groundPlates.length === 0) {
                unmeasured.footprintM2 = 'no-floor-plates';
            } else {
                const sum = sumPlates(groundPlates);
                if ('refusal' in sum) {
                    unmeasured.footprintM2 = sum.refusal;
                } else {
                    footprintM2 = sum.areaM2;
                    caveats.push(FOOTPRINT_PLATE_CAVEAT);
                }
            }
        }

        // ── SUPERFICIE ÚTIL — summed real room boundaries. Reported for the schedule; the L2
        //    model never judges it, because zoning does not cap net area.
        let netFloorAreaM2: number | null = null;
        let roomTotal = 0;
        let roomCount = 0;
        for (const r of snapshot.rooms) {
            if (r.levelId === null || !occupied.has(r.levelId)) continue;
            if (r.areaM2 === null || r.areaM2 <= 0) continue;
            roomTotal += r.areaM2;
            roomCount++;
        }
        if (roomCount === 0) unmeasured.netFloorAreaM2 = 'no-rooms';
        else netFloorAreaM2 = roomTotal;

        span.setAttribute('pryzm.design.measured', true);
        span.setAttribute('pryzm.design.storeys', floors);
        return {
            design: { footprintM2, grossFloorAreaM2, netFloorAreaM2, heightM, floors },
            unmeasured,
            caveats,
            designedStoreyCount: floors,
        };
    } finally {
        span.end();
    }
}
