// TGL P2 — bubble diagram (adjacency graph) + area targets.
//
// Turns the program brief into: (a) the rooms to place, each with a target area
// scaled to fill the shell (clamped to §8 minima), and (b) the REQUIRED
// adjacencies — the "bubble diagram" architects draw: entrance→hall→living↔
// kitchen/dining; a corridor linking the private zone (bedrooms+bath); master↔
// ensuite. P3 lays rooms out to honour these; P4 places doors on them; P5 scores
// connectivity (space syntax) against them. Pure: ZERO imports except types.

import type { ApartmentProgram, RoomType } from '../types.js';
import { roomRule, doorAllowedBetween } from '../rules/programRules.js';
import { apartmentDimensionsFor } from '../dimensions/roomDimensions.js';
import { computeFacadeValueField, type FacadeValueField } from '../environment/facadeValueField.js';
import { computeDaylightDepthField, type DaylightDepthField } from '../environment/daylightDepthField.js';
import { classifyEdge, type EdgeType } from './edgeTypes.js';
import type { Pt } from './rectDecomposition.js';

export interface ProgramRoom {
    readonly id: string;            // unique in this layout, e.g. 'r0'
    readonly type: RoomType;
    readonly name: string;
    readonly targetAreaM2: number;
    readonly isPrivate: boolean;    // off the corridor (bedrooms, baths, ensuite)
    readonly needsWindow: boolean;  // §8 V2 habitable rooms
    /**
     * §BEDROOM-ENSUITE-2DOOR (founder rule, 2026-06-10) — set ONLY on an
     * `ensuite` room: the id of the bedroom/master this ensuite is PAIRED to.
     * This per-INSTANCE pairing is what lets `buildWallsAndDoors` permit the
     * ensuite↔host door AND grant the host bedroom its extra (ensuite) door
     * slot WITHOUT a global rule change — so only the paired bedroom may open
     * onto its own ensuite, and every other bedroom stays single-door. Absent
     * on every other room type and on an ensuite with no resolved host (the
     * door pipeline then falls back to the type rule — master-only). The
     * apartment's lone ensuite always pairs with the master, where the type
     * rule already permits the door + 2-door cap, so this is byte-identical
     * there (ADR-0061).
     */
    readonly ensuiteHostId?: string;
}

export interface AdjacencyEdge {
    readonly a: string;             // room id
    readonly b: string;             // room id
    readonly via: 'open' | 'door';  // open-plan threshold vs a doorway
    /**
     * §L3-γ-1 / §L3-γ-2 (2026-05-29) — semantic edge classification (see
     * `edgeTypes.ts`). Optional for back-compat: AI-path graphs and tests that
     * build edges directly via the `{a,b,via}` shape don't have to populate
     * it. The deterministic builder ALWAYS sets it; downstream consumers
     * (L3-γ-3 wallsAndDoors, L3-γ-4 edgeRealisation axis) read it when
     * present and fall back to via-only logic when absent.
     */
    readonly kind?: EdgeType;
}

export interface BubbleGraph {
    readonly rooms: readonly ProgramRoom[];
    readonly edges: readonly AdjacencyEdge[];
    /** Corridor room id (the circulation spine), or null when no private rooms. */
    readonly corridorId: string | null;
    /** Hall/entrance room id (where the front door is), or null. */
    readonly entryId: string | null;
    /**
     * §L1-α-3 (2026-05-29) — pre-computed per-shell-edge value field. Present
     * when `buildBubbleGraph` was called with the shell polygon; absent
     * otherwise (the field has zero downstream consumers TODAY — this seam
     * exists so the next commit's façade-priority allocator can read it
     * without reshaping the BubbleGraph interface).
     * Source: `environment/facadeValueField.ts`.
     */
    readonly facadeField?: FacadeValueField;
    /**
     * §L1-α-2 plumb seam (2026-05-29) — pre-computed per-position daylight
     * depth field over the shell polygon. Present when `buildBubbleGraph`
     * was called with the shell polygon (facadeField is its input — both
     * fields share the same trigger). Backward compatible: absent when no
     * polygon supplied. NO downstream consumer YET — follow-on slice will
     * use it to penalise placing windowMandatory rooms in the deep core.
     * Source: `environment/daylightDepthField.ts`.
     */
    readonly daylightField?: DaylightDepthField;
}

// Area weights, minima + habitability are read from the single-source-of-truth
// rules database (rules/programRules.ts) — never duplicated here.
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Scale the program up to match the shell area. The user explicitly required this:
 * "the number of bedrooms and bathrooms should depend on the net area within the
 * perimeter external walls." We never DOWNSCALE (the user's stated counts are a
 * floor); we only ADD rooms when the shell is large enough.
 *
 * Heuristic (post-feedback, 2026-05-26): target ~130 m² of total area per bedroom
 * (an upscale residential rule of thumb that yields a recognisable LUXURY apartment
 * rather than a boarding house). Capped at 5 bedrooms — above that you're not
 * laying out an apartment, you're laying out an HMO / hostel and the brief should
 * be authored explicitly. Bathrooms = ⌊bedrooms/2⌋, capped at 3 (4 bathrooms in a
 * single residential unit is excess). Auto-enable masterEnSuite at ≥3 bedrooms.
 *
 * Curve (with default 2-bed/1-bath input preserved as the floor):
 *   100 m²  → 2 beds / 1 bath          (preserves default)
 *   260 m²  → 2 beds / 1 bath
 *   400 m²  → 3 beds / 1 bath + ensuite
 *   500 m²  → 4 beds / 2 baths + ensuite
 *   650 m²+ → 5 beds / 2 baths + ensuite (cap)
 *
 * §PLATE-ROLE (M-B, ADR-0063 H1, 2026-06-09) — `plateRole` lets the HOUSE
 * orchestrator route a storey's sub-programme through this SAME shared sizer
 * instead of its parallel `enrichStoreyProgramToPlate`/`fillGroundPlate` density
 * model. The convergence finding (`PIPELINE-ARCHITECTURE-APARTMENT-VS-HOUSE.md`
 * M-B): the subdivider fills the real plate EXACTLY (squarify), so the ONLY lever
 * on per-room size is room COUNT. The apartment is coherent because
 * `scaleProgramToShell` scales bedroom COUNT to the plate (~130 m²/bed) — so a
 * larger apartment gets MORE rooms, each in-band, never one ballooned room. The
 * house's parallel sizer capped growth far too low (≤5 enriched / ≤2 ground beds at
 * ~45 m²/bed) so a large house storey was starved of rooms and every room
 * stretched to fill the plate (the founder's "Living 108 m² / Bedroom 88 m²").
 *
 * The role tunes ONLY the density (m² of plate per added bedroom), because the
 * three roles fill the plate with DIFFERENT room mixes:
 *   - `'single'` (apartment / single-storey-house whole programme): ~130 m²/bed —
 *     a full unit (public + private + circulation) per bedroom. UNCHANGED, so the
 *     apartment is BYTE-IDENTICAL (the default).
 *   - `'ground'` / `'upper'` (a house STOREY): a denser ~`HOUSE_AREA_PER_BEDROOM`
 *     (45 m²/bed) because the storey holds only PART of the dwelling (the upper is
 *     bedrooms+baths only; the ground's public set is already minted by the
 *     enricher), so each added bedroom consumes less of the plate. This is the SAME
 *     45 m² the retired §ENRICH-DENSITY-CAP used — promoted from a CAP into the
 *     positive count target.
 * Bathroom/en-suite derivation is identical across roles. Pure + deterministic.
 */
export type PlateRole = 'single' | 'ground' | 'upper';

/** §PLATE-ROLE — m² of plate per bedroom for a HOUSE storey (ground/upper). Denser
 *  than the apartment's 130 because a storey holds only part of the dwelling. */
const HOUSE_AREA_PER_BEDROOM = 45;
/** §PLATE-ROLE — m² of plate per bedroom for a self-contained unit ('single' /
 *  apartment). The original luxury-apartment rule of thumb (UNCHANGED). */
const UNIT_AREA_PER_BEDROOM = 130;
/** §PLATE-ROLE — bedroom-count CEILING per role. 'single' (apartment) keeps the
 *  original 5 (above which it's an HMO, not a flat — BYTE-IDENTICAL). A house storey
 *  may pack more (a large floor genuinely wants more rooms so each stays in-band),
 *  but still bounded so a too-big plate doesn't author a dormitory. */
const MAX_BEDROOMS_SINGLE = 5;
const MAX_BEDROOMS_HOUSE_STOREY = 8;

export function scaleProgramToShell(
    program: ApartmentProgram,
    shellAreaM2: number,
    plateRole: PlateRole = 'single',
    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — apply the §3.1 apartment-
    // envelope-fit bedroom growth (grow the count while the shell exceeds the count's
    // grossMax). DEFAULTS TRUE for the apartment 'single' role so the standalone
    // apartment path (+ its direct callers) get the fix. The HOUSE path passes FALSE
    // because the house already sized + clamped each storey's bedroom count through its
    // own 'ground'/'upper' density — re-growing it to the apartment envelope wrongly
    // inflates a house-storey sub-programme (the §HOUSE-PLATE blob regression). When the
    // role is NOT 'single' the growth never runs regardless (only the apartment has a
    // §3.1 envelope), so this flag only matters for the house's internal 'single'
    // re-scale of a storey programme inside `buildBubbleGraph`.
    envelopeFitGrowth = true,
): ApartmentProgram {
    // An EXPLICIT studio request (bedrooms === 0 AND bathrooms === 0) stays a
    // studio — auto-scale never invents rooms the caller deliberately omitted.
    if (program.bedrooms === 0 && program.bathrooms === 0) return program;
    // §PLATE-ROLE — the density + count ceiling are the ONLY role-dependent terms.
    // 'single' is the original 130 m²/bed @ ≤5 (apartment byte-identical); a house
    // storey packs denser (45 m²/bed) and allows more rooms so each stays in-band.
    const areaPerBedroom = plateRole === 'single' ? UNIT_AREA_PER_BEDROOM : HOUSE_AREA_PER_BEDROOM;
    const maxBedrooms = plateRole === 'single' ? MAX_BEDROOMS_SINGLE : MAX_BEDROOMS_HOUSE_STOREY;
    let targetBedrooms = Math.min(maxBedrooms, Math.max(program.bedrooms, Math.round(shellAreaM2 / areaPerBedroom)));

    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — the #1 recurring residential
    // defect: an OVER-CAPACITY shell (much larger than the program's max area) inflated
    // a fixed small program to fill the plate → rooms collide/merge + every strategy
    // §TOPO-HARD-REJECTs. ROOT CAUSE: the 130 m²/bed density above is FAR sparser than
    // the §3.1 envelope table's real density (~37-55 m²/bed), so a 206 m² shell rounded
    // to only 2 bedrooms — yet the 2-bed envelope hard-maxes at 120 m². The engine then
    // tried to cram a 2-bed program into 206 m² (fillRatio ≈ 1.0, no circulation slack →
    // §EVERY-ROOM-ACCESS-COMB infeasible → overlaps).
    //
    // CURE (apartment 'single' role ONLY — a house storey injects its own envelope so
    // this never reaches it): when the shell EXCEEDS the §3.1 grossMax for the current
    // bedroom count, GROW the count one bedroom at a time until the shell fits inside
    // that count's envelope band (shell ≤ grossMax) — bounded by `maxBedrooms`. This
    // grows MORE rooms of NORMAL size rather than fewer ballooned ones, and aligns
    // `scaleProgramToShell` with the §D3.5 envelope gate (`validateApartmentEnvelope`)
    // so the gate no longer hard-rejects the very shell it could grow into. The 130-rule
    // result is the FLOOR (`Math.max` below never lowers it), so an in-band / small shell
    // is BYTE-IDENTICAL (90 m², 120 m² → 2-bed unchanged; the founder's regression guard).
    // Pure + deterministic (table lookup, no RNG) per ADR-0061.
    if (plateRole === 'single' && envelopeFitGrowth) {
        while (
            targetBedrooms < maxBedrooms &&
            shellAreaM2 > apartmentDimensionsFor(targetBedrooms).grossMax + 1e-6
        ) {
            targetBedrooms += 1;
        }
    }

    const targetBathrooms = Math.min(3, Math.max(program.bathrooms, Math.max(1, Math.floor(targetBedrooms / 2))));
    return {
        ...program,
        bedrooms: targetBedrooms,
        bathrooms: targetBathrooms,
        masterEnSuite: program.masterEnSuite || targetBedrooms >= 3,
    };
}

/**
 * Build the bubble graph for a program, with target areas scaled to fill
 * `availableAreaM2` (then clamped up to §8 minima). The program is auto-scaled
 * to the shell area (see `scaleProgramToShell`) so large shells produce
 * appropriately many rooms instead of huge single-bedroom suites. Room order is
 * public-first (hall, living, kitchen, dining) → corridor → private (bedrooms,
 * ensuite, baths), which P3 uses to keep public space near the entrance.
 */
/** A.25.3 — optional bubble-graph tuning from the Living Design Parameters. */
export interface BubbleGraphOpts {
    /** Habitable-room area-weight multiplier (neutral 1.0). > 1 grows
     *  windowMandatory rooms (living / kitchen / master / bedroom / dining /
     *  study) at the expense of the rest via the existing weighted share. The
     *  `space` slider drives this. Absent / 1.0 ⇒ byte-identical allocation. */
    readonly spaceGenerosity?: number;
    /** §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — apply the §3.1 apartment-
     *  envelope-fit bedroom growth inside the internal `scaleProgramToShell` call.
     *  DEFAULTS TRUE (apartment). The HOUSE passes FALSE so a house-storey sub-programme
     *  (already sized + clamped by the house's own 'ground'/'upper' density) is NOT
     *  re-inflated to the apartment envelope. The DENSITY stays 'single' either way — the
     *  house's internal re-scale was always a 'single' 130-rule FLOOR; only the new growth
     *  is suppressed, so the house allocation is byte-identical to its pre-fix baseline
     *  (ADR-0061). Absent ⇒ true (byte-identical apartment behaviour). */
    readonly envelopeFitGrowth?: boolean;
}

export function buildBubbleGraph(
    rawProgram: ApartmentProgram,
    availableAreaM2: number,
    shellPolygon?: readonly Pt[],
    opts?: BubbleGraphOpts,
): BubbleGraph {
    // §ENVELOPE-FIT-GROWTH — the internal re-scale stays at the 'single' 130-rule density
    // (the house always relied on it as a no-op FLOOR, so the house is byte-identical).
    // Only the NEW §3.1 envelope-fit growth is gated: the apartment enables it (default
    // true) to cure the founder bug #1; the house disables it so a pre-sized storey
    // sub-programme isn't re-inflated to the apartment envelope.
    const program = scaleProgramToShell(
        rawProgram, availableAreaM2, 'single', opts?.envelopeFitGrowth ?? true,
    );
    // A.25.3 — `space` slider: a >1 multiplier grows habitable rooms. Clamped to a
    // sane band so the area arithmetic stays stable. Neutral (1.0) is identity.
    const rawGen = opts?.spaceGenerosity;
    const spaceGenerosity = typeof rawGen === 'number' && Number.isFinite(rawGen)
        ? Math.max(0.5, Math.min(2.0, rawGen))
        : 1.0;
    // §L1-α-3 — when the shell polygon is supplied, compute the per-edge
    // value field and attach to the returned BubbleGraph. Has NO downstream
    // consumer today (the next commit's allocator picks it up); the only
    // observable change is `.facadeField` being defined when polygon supplied.
    const facadeField: FacadeValueField | undefined =
        shellPolygon && shellPolygon.length >= 3
            ? computeFacadeValueField(shellPolygon)
            : undefined;
    // §L1-α-2 plumb seam — daylight depth field derives from the facade
    // value field (it reads per-edge sunlight scores) + the shell polygon
    // (it needs point-in-polygon for the at() query). Same trigger as
    // facadeField; absent together when no polygon supplied.
    const daylightField: DaylightDepthField | undefined =
        shellPolygon && facadeField
            ? computeDaylightDepthField(shellPolygon, facadeField)
            : undefined;
    const rooms: ProgramRoom[] = [];
    const push = (type: RoomType, name: string, isPrivate: boolean): string => {
        const id = `r${rooms.length}`;
        rooms.push({ id, type, name, targetAreaM2: 0, isPrivate, needsWindow: roomRule(type).needsWindow });
        return id;
    };

    const entryId = program.entranceHall ? push('hall', 'Entrance Hall', false) : null;
    const livingId = program.livingRoom ? push('living', 'Living Room', false) : null;
    // §A.21.x-KITCHEN — kitchen only when the program wants one. Absent/true →
    // kitchen (apartment default, unchanged). false → no kitchen (house upper
    // storeys). `link()` no-ops on a null id, so the kitchen links below are safe.
    const kitchenId = program.includeKitchen === false ? null : push('kitchen', 'Kitchen', false);
    const diningId = program.openPlanKitchenDining ? push('dining', 'Dining', false) : null;

    // §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11) — optional public/service
    // ground-floor rooms (study, utility). Minted from the program flags exactly like
    // the kitchen/dining toggles. Both are corridor-served (study.accessFrom +
    // utility.accessFrom include 'corridor'), so they link off the spine below and
    // never seal. Absent ⇒ no room ⇒ byte-identical (apartment never sets the flags).
    const studyId = program.includeStudy === true ? push('study', 'Study', false) : null;
    const utilityId = program.includeUtility === true ? push('utility', 'Utility', false) : null;

    const beds = Math.max(0, Math.floor(program.bedrooms));
    const baths = Math.max(0, Math.floor(program.bathrooms));
    const corridorId = beds + baths > 0 ? push('corridor', 'Corridor', false) : null;

    const bedIds: string[] = [];
    for (let i = 0; i < beds; i++) {
        const isMaster = i === 0 && program.masterEnSuite;
        bedIds.push(push(isMaster ? 'master' : 'bedroom', isMaster ? 'Master Bedroom' : `Bedroom ${i + (program.masterEnSuite ? 0 : 1)}`, true));
    }
    const ensuiteId = program.masterEnSuite && beds > 0 ? push('ensuite', 'En-suite', true) : null;
    // §BEDROOM-ENSUITE-2DOOR (founder rule, 2026-06-10) — PAIR the ensuite to the
    // bedroom that hosts it (today always bed[0] = the master, but the per-instance
    // pairing generalises to any host bedroom). Stamping `ensuiteHostId` is what lets
    // wallsAndDoors permit the ensuite↔host door + grant the host its extra door slot
    // WITHOUT a global rule change (so no OTHER bedroom can door onto an ensuite). The
    // master host is byte-identical (its type rule already permits both); the field is
    // additive metadata only. The ensuite room is rebuilt with the host id in place.
    if (ensuiteId && bedIds[0]) {
        const ei = rooms.findIndex(r => r.id === ensuiteId);
        if (ei >= 0) rooms[ei] = { ...rooms[ei]!, ensuiteHostId: bedIds[0] };
    }
    for (let i = 0; i < baths; i++) push('bathroom', baths > 1 ? `Bathroom ${i + 1}` : 'Bathroom', true);

    // §ROOM-TYPES-BY-NAME (A.26.4, ADR-0061 / C52) — per-INSTANCE TYPE override
    // (sibling of roomAreasByName). RE-TYPE a minted room by its display name —
    // "make Bedroom 2 a Study". Applied HERE, after the rooms are minted but
    // BEFORE area allocation + edge construction, so the new type drives the
    // room's area weight / minima / habitability (roomRule) AND the semantic
    // edges (typeById below reads the re-typed array). Re-typing a PRIVATE room's
    // `isPrivate`/`needsWindow` is re-derived from the new rule. The override
    // never adds/removes/re-orders a room — only its `type` (+ derived
    // needsWindow / isPrivate). An entry equal to the room's existing type is a
    // no-op; a name with no minted room is ignored. Empty/absent ⇒ identity
    // (ADR-0061 I2 — byte-identical baseline). VALID-TYPE-GUARD: a non-RoomType
    // value (or one not in the rules DB) is ignored so an illegal edit can't
    // produce a phantom type.
    const typeOverrides = rawProgram.roomTypesByName;
    if (typeOverrides && Object.keys(typeOverrides).length > 0) {
        for (let i = 0; i < rooms.length; i++) {
            const r = rooms[i]!;
            const next = typeOverrides[r.name];
            if (!next || next === r.type) continue;
            const rule = roomRule(next);
            // roomRule returns the FALLBACK (utility) for an unknown string —
            // reject any value whose rule.type doesn't echo the request, so only
            // real RoomTypes re-type a room.
            if (rule.type !== next) continue;
            rooms[i] = {
                ...r,
                type: next,
                isPrivate: rule.privacy === 'private',
                needsWindow: rule.needsWindow,
            };
        }
    }

    // ── Area targets: weight-scaled to fill the shell, then clamped up to minima.
    // §ROOM-AREAS / §ROOM-AREAS-BY-NAME (2026-05-29):
    //   1. `program.roomAreasByName[r.name]` — per-instance override
    //      ("Bedroom 1" = 14, "Bedroom 2" = 12). Wins when set.
    //   2. `program.roomAreas[r.type]` — per-type override (every bedroom 14).
    //      Used when no name-keyed value is set for this specific room.
    //   3. Weight-scaled share of `availableAreaM2` — engine default.
    // All paths clamp UP to the architectural minimum (`roomRule[type].
    // minAreaM2`) so an override below the legal floor cannot ship.
    const positiveOrUndefined = (v: unknown): number | undefined =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
    const overrideForName = (name: string): number | undefined =>
        positiveOrUndefined(program.roomAreasByName?.[name]);
    const overrideForType = (type: RoomType): number | undefined =>
        positiveOrUndefined(program.roomAreas?.[type]);
    // §L1-α-3 ALLOCATOR — peak facade quality drives a small areaWeight bonus
    // for `windowMandatory` rooms (living / kitchen / master / bedroom / dining
    // / study). Shells with a strong south-facing edge produce more generous
    // habitable rooms; shells with only north-facing edges produce smaller ones
    // (the area is reallocated to other rooms via the existing weighted share).
    //
    // The bonus is INTENTIONALLY small (max +20 % to areaWeight) so that on a
    // perfect southerly shell living grows by ~5 m² in a 2-bed flat, not by
    // 25 m². Tunes layout quality without destabilising the well-tested area
    // arithmetic. When no shellPolygon was supplied (no facadeField), bonus = 0
    // — backwards compatible.
    const peakFacadeValue = facadeField && facadeField.edges.length > 0
        ? facadeField.edges.reduce((m, e) => Math.max(m, e.overallValue), 0)
        : 0;
    const facadeWeightBonus = (type: RoomType): number => {
        if (!facadeField) return 1;
        const rule = roomRule(type);
        if (!rule.windowMandatory) return 1;
        // Up to +20 % at peakFacadeValue = 1.
        return 1 + 0.2 * peakFacadeValue;
    };
    // A.25.3 — `space` slider: scale the area weight of windowMandatory (habitable)
    // rooms by `spaceGenerosity`. The weighted-share allocator then re-normalises,
    // so a >1 multiplier grows the living/bedrooms and shrinks circulation/service
    // (which stay at 1.0) — the visible "bigger living room" the slider promises.
    // Neutral (1.0) leaves every weight unchanged ⇒ byte-identical.
    const spaceWeightFactor = (type: RoomType): number =>
        spaceGenerosity !== 1.0 && roomRule(type).windowMandatory ? spaceGenerosity : 1;
    const totalWeight = rooms.reduce(
        (s, r) => s + roomRule(r.type).areaWeight * facadeWeightBonus(r.type) * spaceWeightFactor(r.type), 0,
    ) || 1;
    const withAreas: ProgramRoom[] = rooms.map(r => {
        const rule = roomRule(r.type);
        const override = overrideForName(r.name) ?? overrideForType(r.type);
        const effectiveWeight = rule.areaWeight * facadeWeightBonus(r.type) * spaceWeightFactor(r.type);
        const raw = override ?? availableAreaM2 * (effectiveWeight / totalWeight);
        // §AREA-FRACTIONS (2026-05-29) — size-scaled clamps on top of the
        // proportional split + absolute minAreaM2:
        //   floor = max(absolute min, minAreaFrac * availableAreaM2)
        //   ceil  = maxAreaFrac * availableAreaM2  (Infinity when no cap)
        // Stops the corridor's 0.85 weight from eating 25 % of a 60 m² studio
        // and stops the master from eating living/kitchen in small flats.
        const floor = Math.max(
            rule.minAreaM2 || 3,
            (rule.minAreaFrac ?? 0) * availableAreaM2,
        );
        const ceil = rule.maxAreaFrac !== undefined
            ? rule.maxAreaFrac * availableAreaM2
            : Number.POSITIVE_INFINITY;
        const targetAreaM2 = Math.min(Math.max(raw, floor), Math.max(ceil, floor));
        return { ...r, targetAreaM2 };
    });

    // §CORRIDOR-PHYSIOGNOMY (A.21.D46, 2026-06-08) — the corridor's STRIP geometry is
    // enforced DOWNSTREAM in the subdivider (the §SINGLE-RECT carve builds a 1.2 m
    // strip; the `reshapeCorridorStrip` post-pass narrows a squarified corridor cell
    // along its SHORT axis — never its length, so a room the spine serves keeps its
    // shared wall). The area target here is intentionally LEFT as the weighted share:
    // squarify rescales every target to fill the shell, so the corridor's final
    // FOOTPRINT is the clamped strip regardless of this target, and leaving the
    // target untouched preserves the well-tested §AREA-FRACTIONS allocation.

    // ── Edges (the bubble diagram).
    const edges: AdjacencyEdge[] = [];
    // Room-id → RoomType lookup so the §L3-γ-2 classifier can attach a
    // semantic `kind` to each edge as it's pushed.
    const typeById = new Map<string, RoomType>(rooms.map(r => [r.id, r.type]));
    const link = (a: string | null, b: string | null, via: AdjacencyEdge['via']): void => {
        if (!a || !b || a === b) return;
        const aType = typeById.get(a);
        const bType = typeById.get(b);
        const kind = aType && bType ? classifyEdge(aType, bType, via) : undefined;
        edges.push(kind !== undefined ? { a, b, via, kind } : { a, b, via });
    };
    // Hall ↔ living is OPEN (no door, no full wall) — but P4 emits a RoomBoundingLine
    // along the shared boundary so the room-detection engine still separates the two
    // spaces (the user's explicit clarification: open is fine, just use a room
    // boundary like between kitchen and living). Without the boundary line they'd
    // collapse into one merged room (the 421 m² "Living Room" defect).
    link(entryId, livingId, 'open');
    // Corridor is a DISTINCT circulation room (door from the hall), not merged into
    // the open public zone — so the layout reads as rooms-off-a-corridor.
    link(entryId, corridorId, 'door');
    // §KITCHEN-DISTINCT (2026-05-29, single-apartment-fix-pass-spec #1) — the
    // kitchen is ALWAYS an enclosed room (walls + door), even with the
    // open-plan-kitchen-dining toggle on. The previous behaviour ('open' edges
    // when the toggle was true) collapsed kitchen + dining + living + hall
    // into one detected megaroom of 30 – 80 m². The fix-pass spec's #1:
    // "A kitchen must be a distinct enclosed room (min 8 m², min short side
    // 2.4 m) adjacent to dining and with access to corridor." Re-interpreting
    // the openPlanKitchenDining toggle: it now controls whether DINING merges
    // with LIVING (the "lounge-diner" pattern), NOT whether the kitchen has
    // walls. The kitchen always gets walls + a door; the §ADJACENCY-PREFERENCE
    // 1.0 weight on kitchen↔dining keeps them clustered architecturally.
    link(livingId ?? corridorId, kitchenId, 'door');
    // §DIAG-MERGE-DIVIDER (tracker §57.3, 2026-06-11) — resolve which pair the open-plan
    // threshold opens.
    //   • LEGACY (apartment default — `openPlanLivingDining` absent/true): the
    //     "lounge-diner" — LIVING ↔ DINING is `open` when openPlanKitchenDining is on,
    //     kitchen always walled (the §KITCHEN-DISTINCT design). Byte-identical.
    //   • `openPlanLivingDining === false` (the multi-storey HOUSE ground): the literal
    //     "open-plan kitchen + dining" — the OPEN merge moves to KITCHEN ↔ DINING (one
    //     kitchen-diner) and LIVING is a SEPARATE WALLED room (`door` to dining). This is
    //     what stops the GROUND-floor "Living Room / Dining" merge: Living keeps its
    //     sealing divider instead of having it suppressed as an open-zone threshold.
    const openPlanLivingDining = program.openPlanLivingDining !== false;
    if (openPlanLivingDining) {
        link(kitchenId, diningId, 'door');
        link(livingId, diningId, program.openPlanKitchenDining ? 'open' : 'door');
    } else {
        // Living is its own walled room; kitchen + dining form the open kitchen-diner.
        link(kitchenId, diningId, program.openPlanKitchenDining ? 'open' : 'door');
        link(livingId, diningId, 'door');
    }
    // Private zone hangs off the corridor (or the hall when there's no corridor).
    const spine = corridorId ?? entryId ?? livingId;
    // §HOUSE-GROUND-PUBLIC-SET (A.21.D28 #4, 2026-06-11) — the study + utility hang off
    // the SAME spine (a 'door' edge), so the corridor carve/comb reaches them just like
    // a bedroom and they never seal. study.accessFrom + utility.accessFrom both include
    // 'corridor', so the door is permitted. No-op when the flag is off (null id).
    link(spine, studyId, 'door');
    link(spine, utilityId, 'door');
    for (const bid of bedIds) link(spine, bid, 'door');
    link(bedIds[0] ?? null, ensuiteId, 'door');     // master ↔ ensuite
    for (const r of withAreas) if (r.type === 'bathroom') link(spine, r.id, 'door');

    // §ROOM-ADJACENCY (SPEC-DYNAMIC-PROGRAM-CANVAS §5.6, C52 E3) — desired-adjacency
    // overrides: the user connected two rooms in the program-canvas graph. Add a
    // `door` edge between the named pair IFF it is PERMITTED (doorAllowedBetween — a
    // forbidden pair like bedroom↔bedroom is ignored, never forced) and not already
    // linked. Name-keyed, per-instance; empty ⇒ no extra edge ⇒ byte-identical (I2).
    const adjPairs = rawProgram.roomAdjacencyByName;
    if (adjPairs && adjPairs.length > 0) {
        const byName = new Map<string, ProgramRoom>();
        for (const r of withAreas) byName.set(r.name, r);
        const linked = (x: string, y: string): boolean =>
            edges.some(e => (e.a === x && e.b === y) || (e.a === y && e.b === x));
        for (const pair of adjPairs) {
            const ra = byName.get(pair[0]);
            const rb = byName.get(pair[1]);
            if (!ra || !rb || ra.id === rb.id) continue;
            if (linked(ra.id, rb.id)) continue;
            if (!doorAllowedBetween(ra.type, rb.type)) {
                console.log(`[D-TGL] §ROOM-ADJACENCY skipped ${ra.name}↔${rb.name} — not a permitted pair`);
                continue;
            }
            link(ra.id, rb.id, 'door');
            console.log(`[D-TGL] §ROOM-ADJACENCY added ${ra.name}↔${rb.name} (door)`);
        }
    }

    // §DIAG-BUBBLE — per-room sizing + total target vs available area (logging only;
    // no behaviour change). One line per room, then a totals line. minShortSideM is
    // sqrt-derived from the room rule's aspect floor where present, else minAreaM2.
    let totalTargetM2 = 0;
    for (const r of withAreas) {
        const rule = roomRule(r.type);
        totalTargetM2 += r.targetAreaM2;
        console.log(
            `[D-TGL] §DIAG-BUBBLE room ${r.id} type=${r.type} ` +
            `targetAreaM2=${r.targetAreaM2.toFixed(1)} minAreaM2=${rule.minAreaM2 ?? 0} ` +
            `minShortSideM=${(rule.minShortSideM ?? 0)} privacy=${rule.privacy} ` +
            `needsWindow=${r.needsWindow} isPrivate=${r.isPrivate}`,
        );
    }
    console.log(
        `[D-TGL] §DIAG-BUBBLE totals: rooms=${withAreas.length} ` +
        `totalTargetM2=${totalTargetM2.toFixed(1)} availableAreaM2=${availableAreaM2.toFixed(1)} ` +
        `fillRatio=${availableAreaM2 > 0 ? (totalTargetM2 / availableAreaM2).toFixed(2) : 'n/a'} ` +
        `corridorId=${corridorId ?? 'none'} entryId=${entryId ?? 'none'}`,
    );

    // §DIAG-PROGRAM-FIT (founder bug #1, 2026-06-10) — surface the §ENVELOPE-FIT-GROWTH
    // decision in one line: the shell area, the requested vs chosen bedroom count, the
    // chosen room count, the final fillRatio, and whether the program GREW to fit the
    // shell or shipped as requested. This is THE line that proves an over-capacity shell
    // now grows MORE rooms of normal size instead of inflating a fixed small program.
    {
        const grewBeds = program.bedrooms - Math.max(0, Math.floor(rawProgram.bedrooms));
        const grewRooms = grewBeds > 0;
        const fit = availableAreaM2 > 0 ? (totalTargetM2 / availableAreaM2) : 0;
        console.log(
            `[D-TGL] §DIAG-PROGRAM-FIT shellAreaM2=${availableAreaM2.toFixed(1)} ` +
            `requestedBeds=${Math.max(0, Math.floor(rawProgram.bedrooms))} chosenBeds=${program.bedrooms} ` +
            `chosenBaths=${program.bathrooms} rooms=${withAreas.length} ` +
            `fillRatio=${fit.toFixed(2)} ` +
            `${grewRooms ? `grew +${grewBeds} bedroom(s) (over-capacity shell)` : 'as-requested'}`,
        );
    }

    return {
        rooms: withAreas, edges, corridorId, entryId,
        ...(facadeField ? { facadeField } : {}),
        ...(daylightField ? { daylightField } : {}),
    };
}

export { cap as capitalize };
