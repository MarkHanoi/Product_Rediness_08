/**
 * linkMassing — derive a LINKED MODEL's massing bands from a source snapshot.
 *
 * ── WHY MASSING IS THE DEFAULT, AND WHY THIS IS A PURE FUNCTION ──────────────
 *
 * ADR-0346 D6. The founder's scene is draw-call bound and he reports navigation
 * "gets stuck sometimes"; a linked model at least doubles the scene. So the
 * default representation is one box per LEVEL BAND, all of them instances of one
 * shared geometry in one `InstancedMesh` — **one draw call per link, regardless
 * of how large the linked project is.**
 *
 * The honest form of that claim is a STRUCTURAL bound, not a browser reading:
 *
 *   massing  → 1 InstancedMesh, N instances (N = level count)
 *   detailed → ≈ the source project's own mesh count
 *
 * That ratio is what justifies the default and it does not depend on
 * `renderer.info`, which matters because L-2502 measured that the draw-call
 * figure this repo has been quoting on WebGPU is cumulative-since-start rather
 * than per-frame. `linkMassingCost()` below returns the bound so a test can pin
 * it instead of a comment asserting it.
 *
 * ── WHY IT DERIVES FROM THE SNAPSHOT AND NOT FROM THE SCENE ──────────────────
 *
 * The source project is never LOADED (ADR-0346 D1 — its elements enter no store,
 * no registry, no builder). There is therefore no scene to measure. Everything
 * here reads the plain arrays of a `ProjectSnapshot` and returns plain numbers:
 * no THREE (P2), no I/O, no clock. That makes it unit-testable against a real
 * snapshot fixture, which is the C13 §7.4 rule — a fixture copied from the
 * PRODUCER, never written to match the consumer.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
 *
 * It does not reconstruct footprint POLYGONS, only axis-aligned extents. A
 * massing box is an honest abstraction of a building's bulk; a wrong polygon
 * would look like a floor plan and be trusted as one. If per-level footprints are
 * wanted later they belong in the `detailed` path, where the real geometry is.
 */

/** One horizontal slab of the linked building's bulk — a level, as a box. */
export interface LinkMassingBand {
    readonly levelId: string;
    readonly levelName: string;
    /** Metres, source-project scene frame, +Y up. Box base. */
    readonly baseY: number;
    /** Metres. Always > 0 — a degenerate band is dropped, not clamped (see below). */
    readonly height: number;
    /** Axis-aligned extents in the SOURCE project's scene frame, metres. */
    readonly minX: number;
    readonly maxX: number;
    readonly minZ: number;
    readonly maxZ: number;
    /** How many source elements contributed to these extents. Reported, never inferred. */
    readonly contributingElements: number;
}

export interface LinkMassingResult {
    readonly bands: readonly LinkMassingBand[];
    /**
     * Levels the source declared that produced NO band, by name. **Reported, not
     * silently dropped** — an empty level and a level whose geometry this function
     * could not read must not look the same (§CONTEXT-DATA-HONESTY). A user who
     * sees "3 of 5 levels" can ask why; one who sees 3 levels cannot.
     */
    readonly skippedLevels: readonly string[];
    /** Total source elements considered across all levels. */
    readonly elementsConsidered: number;
}

/**
 * Anything with a `levelId` and a way to contribute XZ extent.
 *
 * ⚠ TWO POINT CONVENTIONS REACH THIS FILE, AND CONFLATING THEM WAS §L-3151.
 * `ProjectSerializer` emits Vec3 `{x,y,z}` for placements (`stripVec3`, :541) and
 * Vec2 `{x,y}` for PLAN OUTLINES (`stripVec2`, :555) — and in a Vec2 the `y` IS
 * the plan Z. A reader that takes `p.z` off a slab polygon gets `undefined` on
 * every point, drops them all, and draws the building smaller than it is. So the
 * two conventions get two accessors below, not one that guesses.
 */
interface Pt { x?: unknown; y?: unknown; z?: unknown }

/** Below this a band is a plane, not a volume, and is dropped rather than clamped. */
const MIN_BAND_EXTENT_M = 1e-3;

/** Default storey height used only when a level declares none. Named, not magic. */
const FALLBACK_LEVEL_HEIGHT_M = 3.0;

/**
 * The keys under which the serializer emits a PLAN OUTLINE, top-level or nested
 * under `footprint`. One list, read at both sites, so the two cannot drift.
 */
const PLAN_OUTLINE_KEYS = ['polygon', 'points', 'boundary', 'outline'] as const;

function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Accumulates an XZ bounding box without allocating per point. */
class Extent {
    minX = Number.POSITIVE_INFINITY;
    maxX = Number.NEGATIVE_INFINITY;
    minZ = Number.POSITIVE_INFINITY;
    maxZ = Number.NEGATIVE_INFINITY;
    count = 0;

    /**
     * Fold a Vec3 PLACEMENT — `{x, y, z}`, where `y` is elevation and `z` is plan
     * depth. Used for `position` (columns, slabs) and wall baselines.
     *
     * Strict about `z`: on a placement, a missing `z` genuinely means "no plan
     * depth was recorded", and borrowing `y` would silently substitute an
     * ELEVATION for a plan coordinate. Returns whether the point was accepted, so
     * `contributingElements` can count what actually shaped the band (§L-3153).
     */
    addPoint(p: Pt | null | undefined): boolean {
        if (p == null || typeof p !== 'object') return false;
        return this._fold(num((p as Pt).x), num((p as Pt).z));
    }

    /**
     * Fold a PLAN-OUTLINE vertex — a slab/roof footprint point, which the
     * serializer emits as Vec2 `{x, y}` (`stripVec2`, `ProjectSerializer.ts:555`)
     * where `y` IS the plan Z.
     *
     * `z ?? y` is correct for BOTH shapes and is why this is one accessor rather
     * than two: a Vec3 outline point has a real `z` and uses it; a Vec2 has none
     * and falls through to `y`. §L-3151.
     */
    addPlanPoint(p: Pt | null | undefined): boolean {
        if (p == null || typeof p !== 'object') return false;
        const q = p as Pt;
        return this._fold(num(q.x), num(q.z) ?? num(q.y));
    }

    private _fold(x: number | null, z: number | null): boolean {
        if (x === null || z === null) return false;
        if (x < this.minX) this.minX = x;
        if (x > this.maxX) this.maxX = x;
        if (z < this.minZ) this.minZ = z;
        if (z > this.maxZ) this.maxZ = z;
        return true;
    }

    /** Count ELEMENTS, not points — the report says "how much of the model did I see". */
    noteElement(): void { this.count += 1; }

    get isReal(): boolean {
        return (
            Number.isFinite(this.minX) &&
            this.maxX - this.minX > MIN_BAND_EXTENT_M &&
            this.maxZ - this.minZ > MIN_BAND_EXTENT_M
        );
    }
}

/**
 * The snapshot arrays this function reads. Typed loosely on purpose: `ProjectSnapshot`
 * declares these as `any[]` (`ProjectSerializer.ts:99-115`), and inventing a stricter
 * local type here would be a SECOND definition of the wire shape — the [[fake-more-
 * capable-than-real]] defect, where a hand-written mirror of a header cannot falsify it.
 */
export interface LinkMassingSource {
    readonly levels?: unknown;
    readonly walls?: unknown;
    readonly slabs?: unknown;
    readonly columns?: unknown;
    readonly roofs?: unknown;
}

function asArray(v: unknown): readonly Record<string, unknown>[] {
    return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

/**
 * Fold one element's geometry into its level's extent.
 *
 * ⚠ THIS COMMENT USED TO BE WRONG, AND THE CODE MATCHED THE COMMENT (§L-3151/2).
 * It said `polygon` was `Vec3[]`. It is not: `serializeSlab` emits
 * `polygon: s.polygon.map(stripVec2)` — **Vec2 `{x, y}`** — and in a Vec2 the `y`
 * IS the plan Z. Reading `p.z` off it yielded `undefined` for every vertex, so a
 * slab contributed nothing and a slab-only level (a podium, a plinth, a roof
 * terrace) produced NO massing band at all. The linked building simply rendered
 * smaller than it is, plausibly, with no error — the silent mis-alignment class
 * ADR-0346 D4 exists to refuse.
 *
 * The four shapes the serializer ACTUALLY emits, measured 2026-08-21:
 *   · `baseLine: [Vec3, Vec3]` — walls        (`ProjectSerializer.ts:560-563`)
 *   · `polygon: Vec2[]`        — slabs        (`:757`, via `stripVec2` `:555-558`)
 *   · `footprint: { polygon: Vec2[], centroid }` — roofs, **NESTED** (`:847-852`)
 *   · `position: Vec3`         — columns, slabs (`:780`, `:756`)
 *
 * A roof carries NO top-level `position` and no top-level `polygon` unless one was
 * authored, which is why the nested branch is load-bearing rather than defensive.
 */
function foldElement(el: Record<string, unknown>, extent: Extent): void {
    // §L-3153 — `accepted`, not `touched`. The old flag was set whenever a geometry
    // KEY existed, so an element whose every point was rejected still counted as
    // having shaped the band. A diagnostic that cannot be wrong cannot be trusted
    // ([[probe-can-be-wrong-three-ways]]).
    let accepted = false;

    // Walls: `baseLine: [Vec3, Vec3]` (`ProjectSerializer.ts:560-563`).
    const baseLine = el['baseLine'];
    if (Array.isArray(baseLine)) {
        for (const p of baseLine) { if (extent.addPoint(p as Pt)) accepted = true; }
    }

    // Slabs / roofs / floors: plan outlines. Vec2 OR Vec3 — `addPlanPoint` reads both.
    for (const key of PLAN_OUTLINE_KEYS) {
        const poly = el[key];
        if (Array.isArray(poly)) {
            for (const p of poly) { if (extent.addPlanPoint(p as Pt)) accepted = true; }
        }
    }

    // §L-3152 — roofs nest their outline: `footprint: { polygon, centroid }`
    // (`serializeRoof`, `ProjectSerializer.ts:847-852`). A roof also carries NO
    // top-level `position`, so before this branch a roof contributed NOTHING and a
    // roof-only level was reported "skipped" — the linked building lost its top.
    const footprint = el['footprint'];
    if (footprint != null && typeof footprint === 'object') {
        const fp = footprint as Record<string, unknown>;
        for (const key of PLAN_OUTLINE_KEYS) {
            const poly = fp[key];
            if (Array.isArray(poly)) {
                for (const p of poly) { if (extent.addPlanPoint(p as Pt)) accepted = true; }
            }
        }
        // A footprint with only a centroid still says WHERE the roof is, even though
        // one point alone cannot make a band real. Folded so it can combine with
        // siblings on the same level rather than being discarded.
        if (extent.addPlanPoint(fp['centroid'] as Pt)) accepted = true;
    }

    // Columns and other point-placed elements: `position: Vec3`.
    const pos = el['position'];
    if (pos != null && typeof pos === 'object') {
        if (extent.addPoint(pos as Pt)) accepted = true;
    }

    if (accepted) extent.noteElement();
}

/**
 * Derive massing bands from a source project snapshot.
 *
 * Pure — no THREE, no I/O, no clock. Returns extents in the SOURCE project's own
 * scene frame; placing them in the HOST frame is the anchor's job
 * (`resolveLinkAnchor`), kept separate so the two can be tested independently.
 */
export function deriveLinkMassing(snapshot: LinkMassingSource | null | undefined): LinkMassingResult {
    if (snapshot == null) {
        return { bands: [], skippedLevels: [], elementsConsidered: 0 };
    }

    const levels = asArray(snapshot.levels);
    if (levels.length === 0) {
        return { bands: [], skippedLevels: [], elementsConsidered: 0 };
    }

    const byLevel = new Map<string, Extent>();
    for (const lvl of levels) {
        const id = typeof lvl['id'] === 'string' ? (lvl['id'] as string) : null;
        if (id !== null) byLevel.set(id, new Extent());
    }

    let considered = 0;
    for (const family of [snapshot.walls, snapshot.slabs, snapshot.columns, snapshot.roofs]) {
        for (const el of asArray(family)) {
            const levelId = typeof el['levelId'] === 'string' ? (el['levelId'] as string) : null;
            if (levelId === null) continue;
            const extent = byLevel.get(levelId);
            if (extent === undefined) continue;   // an element on a level the snapshot did not declare
            foldElement(el, extent);
            considered += 1;
        }
    }

    const bands: LinkMassingBand[] = [];
    const skipped: string[] = [];

    for (const lvl of levels) {
        const id = typeof lvl['id'] === 'string' ? (lvl['id'] as string) : null;
        const name = typeof lvl['name'] === 'string' ? (lvl['name'] as string) : (id ?? '(unnamed level)');
        if (id === null) { skipped.push(name); continue; }

        const extent = byLevel.get(id);
        if (extent === undefined || !extent.isReal) { skipped.push(name); continue; }

        const elevation = num(lvl['elevation']) ?? 0;
        const declaredHeight = num(lvl['height']);
        // A level with no declared height still has bulk; using a NAMED fallback is
        // honest, and the name is why it is a constant rather than a literal 3.
        const height = declaredHeight !== null && declaredHeight > MIN_BAND_EXTENT_M
            ? declaredHeight
            : FALLBACK_LEVEL_HEIGHT_M;

        bands.push({
            levelId: id,
            levelName: name,
            baseY: elevation,
            height,
            minX: extent.minX,
            maxX: extent.maxX,
            minZ: extent.minZ,
            maxZ: extent.maxZ,
            contributingElements: extent.count,
        });
    }

    return { bands, skippedLevels: skipped, elementsConsidered: considered };
}

/**
 * The STRUCTURAL cost of drawing a massing link, as a value a test can pin.
 *
 * This is the number ADR-0346 D6 argues from, and it is arithmetic rather than a
 * frame reading on purpose. `drawCalls` is 1 for any non-empty massing because every
 * band is an instance of ONE shared box geometry in ONE `InstancedMesh` — the same
 * construction `LevelMassingRenderer` uses for the host's own level massing
 * (`packages/core-app-model/src/rendering/LevelMassingRenderer.ts:282`).
 */
export function linkMassingCost(result: LinkMassingResult): {
    readonly drawCalls: number;
    readonly meshes: number;
    readonly instances: number;
} {
    const n = result.bands.length;
    return { drawCalls: n === 0 ? 0 : 1, meshes: n === 0 ? 0 : 1, instances: n };
}
