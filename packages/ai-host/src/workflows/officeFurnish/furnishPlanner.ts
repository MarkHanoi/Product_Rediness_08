// Office furnish — the OCCUPANCY-DRIVEN, CIRCULATION-AWARE PLACEMENT ENGINE (SPEC §5/§6/§7/§8/§9).
//
// This is the heart of the modular Furnish Office engine. Given the built floor's geometry (the
// radial open-plan band, the core/glass radii, the circulation rings + escape spokes, and the
// architecture's support rooms + glazed enclosures) plus an occupancy-driven MODULE MIX (§8), it:
//
//   1. Fills the OPEN-PLAN band with BENCH / LINEAR workstation ROWS aligned to the band, packed on a
//      grid that RESPECTS the §7 clearances and NEVER overlaps a circulation ring or escape spoke.
//   2. Drops COLLABORATION + BREAKOUT blocks into the open-plan band edges (up to the mix count).
//   3. Places MEETING / EXECUTIVE / PHONE-BOOTH / KITCHEN modules into the architecture's SUPPORT
//      ROOMS + GLAZED ENCLOSURES (SPEC §6 — exec/meeting/focus rooms are glazed).
//   4. Scatters a deterministic BIOPHILIC + ACCESSORY decor layer (seeded by floor index) so the
//      result reads as a real studio, never blocking circulation.
//
// Every module is validated against the keep-outs (§9 step 8) — a candidate that would overlap a
// corridor/escape band is REJECTED before it is emitted, so the output is clearance-clean by
// construction. PURE + DETERMINISTIC — zero THREE / DOM / I/O (L2).

import type { PlacedItem, PlacedModule } from './officeModuleTypes.js';
import { itemsBBox } from './officeModuleTypes.js';
import {
    benchWorkstation, linearWorkstation, singleWorkstation,
    collaborativeBlock, breakoutBlock, meetingRoomBlock,
    executiveOffice, phoneBooth, kitchenBlock, moduleDesks,
} from './moduleRecipes.js';
import { planModuleMix, type ModuleMix } from './occupancyPlan.js';
import {
    validateFurnish, CLEARANCES,
    type FloorKeepouts, type AnnulusKeepout, type SpokeKeepout, type FurnishValidation,
} from './clearanceValidation.js';

/** An axis-aligned rectangular room the architecture placed (support room / glazed enclosure). */
export interface FurnishRoom {
    readonly kind: 'meeting' | 'kitchenette' | 'storage' | 'plant' | 'glazed-exec' | 'glazed-focus' | 'glazed-interview';
    readonly x0: number;
    readonly z0: number;
    readonly x1: number;
    readonly z1: number;
}

/** The geometric context the planner consumes (mirrors the enriched officeBuildContext). */
export interface FurnishFloorInput {
    /** A stable floor index (drives the deterministic decor seed). */
    readonly floorIndex: number;
    /** Usable floor area (m²) — drives occupancy (§8). */
    readonly usableAreaM2: number;
    /** Plate radius (m, origin-centred). */
    readonly discR: number;
    /** Core keep-out radius (m). */
    readonly coreR: number;
    /** Open-plan band inner/outer radius (where workstation rows go). */
    readonly openPlanInnerR: number;
    readonly openPlanOuterR: number;
    /** Primary corridor annulus (around the core) — a keep-out. */
    readonly primaryCorridor: { innerR: number; outerR: number };
    /** Secondary corridor annulus (perimeter loop) — a keep-out. */
    readonly secondaryCorridor: { innerR: number; outerR: number };
    /** Escape spoke headings (radians) — axial fire-egress routes (keep-outs). */
    readonly escapeAngles: readonly number[];
    /** Support rooms + glazed enclosures the architecture created (amenity module hosts). */
    readonly rooms: readonly FurnishRoom[];
    /** Desk budget cap (perf) — bench/linear rows fill up to this. */
    readonly deskBudget: number;
    /** True for the ground floor (reception/cafe handled separately; kitchen still placed). */
    readonly isGroundFloor?: boolean;
}

/** The planned furniture for one floor. */
export interface FurnishFloorPlan {
    readonly mix: ModuleMix;
    readonly modules: readonly PlacedModule[];
    /** The flat list of items (for the editor's batch emit). */
    readonly items: readonly PlacedItem[];
    /** The §9-8 validation result (proves clearance/egress). */
    readonly validation: FurnishValidation;
    /** Desks actually placed. */
    readonly desksPlaced: number;
}

const ESCAPE_HALF_WIDTH_M = CLEARANCES.mainCorridorMinM / 2 + 0.3;   // conservative egress corridor

/** Build the keep-out model (§7) from the floor input. */
function buildKeepouts(input: FurnishFloorInput): FloorKeepouts {
    const annuli: AnnulusKeepout[] = [];
    if (input.primaryCorridor.outerR > input.primaryCorridor.innerR) {
        annuli.push({ label: 'primary circulation', innerR: input.primaryCorridor.innerR, outerR: input.primaryCorridor.outerR });
    }
    if (input.secondaryCorridor.outerR > input.secondaryCorridor.innerR) {
        annuli.push({ label: 'secondary circulation', innerR: input.secondaryCorridor.innerR, outerR: input.secondaryCorridor.outerR });
    }
    const spokes: SpokeKeepout[] = input.escapeAngles.map((a, i) => ({
        label: `escape spoke ${i}`,
        angle: a,
        halfWidthM: ESCAPE_HALF_WIDTH_M,
        innerR: Math.max(0, input.coreR),
        outerR: input.discR,
    }));
    return { coreR: input.coreR, discR: input.discR, annuli, spokes };
}

/** Would a candidate module clear ALL keep-outs? (single-module validation reuse). */
function moduleClears(m: PlacedModule, keepouts: FloorKeepouts): boolean {
    return validateFurnish([m], keepouts).ok;
}

/** A tiny deterministic PRNG (mulberry32) seeded by the floor index for reproducible decor. */
function makeRng(seed: number): () => number {
    let a = (seed | 0) + 0x6d2b79f5;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Centre of a room rect. */
function roomCentre(r: FurnishRoom): { cx: number; cz: number } {
    return { cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2 };
}

/**
 * SPEC §5/§7/§8 — plan the full modular fit-out for ONE floor. Occupancy-driven, circulation-aware,
 * validated. Returns the placed modules + flat item list + the §9-8 validation. PURE + deterministic.
 */
export function planFloorFurnish(input: FurnishFloorInput): FurnishFloorPlan {
    const keepouts = buildKeepouts(input);
    const mix = planModuleMix(input.usableAreaM2, {
        desksTargetOverride: input.deskBudget,
        isGroundFloor: input.isGroundFloor,
    });
    const modules: PlacedModule[] = [];
    let desksPlaced = 0;

    // ── 1. OPEN-PLAN WORKSTATION ROWS (bench/linear) packed on a grid respecting §7 clearances. ──
    // Rows are laid on concentric radial "shelves" inside the open-plan band, each shelf a ring of
    // benches oriented TANGENT to the ring (the longest local axis) so they align to the band. A
    // candidate bench is placed only if it clears every keep-out; otherwise it degrades to a linear
    // or single unit, or is skipped.
    const bandInner = Math.max(input.openPlanInnerR, input.coreR + 0.5);
    const bandOuter = Math.min(input.openPlanOuterR, input.discR - 0.5);
    const BENCH_DEPTH = 3.2;         // back-to-back bench block depth (2 desks + aisle)
    const SHELF_PITCH = BENCH_DEPTH + CLEARANCES.deskClearanceMinM;   // ring-to-ring spacing
    const DESKS_PER_BENCH_SIDE = 3;  // 3 desks per row → 6 desks per bench block

    for (let r = bandInner + BENCH_DEPTH / 2; r <= bandOuter - BENCH_DEPTH / 2 && desksPlaced < mix.desks; r += SHELF_PITCH) {
        // Skip a shelf that falls inside a corridor annulus.
        const circumference = 2 * Math.PI * r;
        const benchWidth = (DESKS_PER_BENCH_SIDE - 1) * 1.6 + 1.4 + 1.2;   // row span + margin
        const slots = Math.max(1, Math.floor(circumference / benchWidth));
        for (let s = 0; s < slots && desksPlaced < mix.desks; s++) {
            const a = (2 * Math.PI * s) / slots;
            const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
            const tangent = a + Math.PI / 2;   // bench long axis tangent to the ring
            // Prefer a full bench; if it clashes a keep-out, try a linear row, then a single desk.
            const remaining = mix.desks - desksPlaced;
            const bench = benchWorkstation(cx, cz, Math.min(DESKS_PER_BENCH_SIDE, Math.ceil(remaining / 2)), tangent);
            let placed: PlacedModule | null = null;
            if (moduleClears(bench, keepouts)) placed = bench;
            else {
                const lin = linearWorkstation(cx, cz, Math.min(DESKS_PER_BENCH_SIDE, remaining), tangent);
                if (moduleClears(lin, keepouts)) placed = lin;
                else {
                    const single = singleWorkstation(cx, cz, tangent);
                    if (moduleClears(single, keepouts)) placed = single;
                }
            }
            if (placed) { modules.push(placed); desksPlaced += moduleDesks(placed); }
        }
    }

    // ── 2. COLLABORATION + BREAKOUT blocks at the open-plan band edges (occupancy-scaled). ──
    const placeRingModules = (
        count: number, radius: number, startAngle: number, make: (cx: number, cz: number, rotY: number) => PlacedModule,
    ): void => {
        if (count <= 0 || !(radius > 0)) return;
        for (let i = 0; i < count; i++) {
            const a = startAngle + (2 * Math.PI * i) / Math.max(count, 1);
            const cx = Math.cos(a) * radius, cz = Math.sin(a) * radius;
            const m = make(cx, cz, a + Math.PI / 2);
            if (moduleClears(m, keepouts)) modules.push(m);
        }
    };
    const innerEdgeR = Math.min(bandInner + 2.5, bandOuter - 1.0);
    placeRingModules(mix.collaborationBlocks, innerEdgeR, Math.PI / 5, collaborativeBlock);
    placeRingModules(mix.breakoutBlocks, Math.min(bandOuter - 2.0, input.discR - 3.0), Math.PI / 3, breakoutBlock);

    // ── 3. AMENITY MODULES into the architecture's SUPPORT ROOMS + GLAZED ENCLOSURES (§6). ──
    // Assign by room kind, honouring the occupancy mix caps. Glazed enclosures host exec/focus rooms.
    let meetingLeft = mix.meetingRooms;
    let execLeft = mix.executiveOffices;
    let boothLeft = mix.phoneBooths;
    let kitchenLeft = mix.kitchenBlocks;
    for (const room of input.rooms) {
        const { cx, cz } = roomCentre(room);
        // Orient the module so its local +Z points radially inward (toward the core) — a stable, clean
        // default that keeps furniture off the glass.
        const rotY = Math.atan2(-cz, -cx) - Math.PI / 2;
        let m: PlacedModule | null = null;
        if (room.kind === 'kitchenette' && kitchenLeft > 0) { m = kitchenBlock(cx, cz, rotY); kitchenLeft--; }
        else if (room.kind === 'meeting' && meetingLeft > 0) { m = meetingRoomBlock(cx, cz, 3, rotY); meetingLeft--; }
        else if (room.kind === 'glazed-exec' && execLeft > 0) { m = executiveOffice(cx, cz, rotY); execLeft--; }
        else if ((room.kind === 'glazed-focus' || room.kind === 'glazed-interview') && boothLeft > 0) { m = phoneBooth(cx, cz, rotY); boothLeft--; }
        else if (room.kind === 'meeting' && execLeft > 0) { m = executiveOffice(cx, cz, rotY); execLeft--; }
        if (m && moduleClears(m, keepouts)) modules.push(m);
    }

    // ── 4. DETERMINISTIC BIOPHILIC + ACCESSORY DECOR SCATTER (seeded by floor index). ──
    // Signature floor planters + desktop plants at the open-plan band edges; never in a keep-out.
    const rng = makeRng(input.floorIndex * 977 + 31);
    const decorItems: PlacedItem[] = [];
    const decorCount = Math.max(3, Math.round(mix.occupancy / 12));
    const plantSkus = ['plant_01', 'plant_02', 'plant_03', 'plant_04', 'plant_05', 'plant_06', 'plant_07', 'plant_08'];
    for (let i = 0; i < decorCount; i++) {
        const a = rng() * 2 * Math.PI;
        const rr = bandInner + rng() * Math.max(0.1, bandOuter - bandInner);
        const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
        const sku = plantSkus[Math.floor(rng() * plantSkus.length)]!;
        const item: PlacedItem = { furnitureType: sku, material: 'fabric', height: 1.2 + rng() * 0.6, x: cx, z: cz, rotY: rng() * 2 * Math.PI, width: 0.5, length: 0.5 };
        // Validate the single decor item as a mini-module so it never blocks circulation.
        const mini: PlacedModule = { kind: 'breakout-block', items: [item], cx, cz, bbox: itemsBBox([item]) };
        if (moduleClears(mini, keepouts)) decorItems.push(item);
    }

    // ── Flatten + final validation (§9 step 8). ──
    const items: PlacedItem[] = [];
    for (const m of modules) items.push(...m.items);
    items.push(...decorItems);
    const validation = validateFurnish(modules, keepouts);

    return { mix, modules, items, validation, desksPlaced };
}
