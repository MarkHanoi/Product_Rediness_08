// §OFFICE-CORE-SERVICES + §OFFICE-CIRCULATION-FIRST (Phase 1 of SPEC-OFFICE-GENERATION-ENGINE
// §3/§4/§9 steps 1–6) — PURE, DOM-free, THREE-free planning math for the office CORE services
// (vertical circulation + toilets) and the CIRCULATION-FIRST floor architecture (primary
// circulation → escape routes → support rooms → internal partitions + glazed enclosures).
//
// The executor (OfficeBuildingExecutor) turns these plans into real elements via the command
// bus / commandManager; this module owns ONLY the geometry so it is I/O-free and unit-testable
// in plain Node. Every placement is in the SAME origin-centred metric frame the floor plate uses
// (metres, plan {x,z}); the circular disc is centred at (0,0).
//
// §OFFICE-CORE-WELLPROPORTIONED (founder 2026-07-01: "the office core is a giant empty room with
// 4 tiny 3.8 m² boxes crammed in one corner — NO circulation, no proper WCs, no run to the
// toilets"). The core is now laid out with REAL absolute dimensions (a rectangular service BAR,
// mirroring the residential building's proven `_createCore`): a switchback stair + a fire-escape
// stair + a lift bank + a lift LOBBY + a full toilet block (M/F/accessible WC ~4–6 m² each with
// cubicles + cleaning + service shaft) — all reached by a CIRCULATION CORRIDOR (entrance → lift
// lobby → WCs → office floor). Every core room carries a real NAME (drives the graph-authoritative
// RoomData so it never falls back to the auto "Room 00-NNN" label).
//
// SPEC §3 (core, never empty): the core must ALWAYS carry vertical circulation (staircase + fire
// escape stair + lift shaft(s) + fire-rated lobby) AND toilets (male · female · accessible WC ·
// cleaning closet · service shaft) with cubicle counts SCALED by floor size. SPEC §4/§9: the floor
// algorithm defines GFA → core position → primary circulation + escape routes → support rooms →
// internal partitions + glazed enclosures — SOLVING CIRCULATION BEFORE ROOMS.

import { ringPlanSegments } from './officePerimeterGlazing.js';

/** A finite plan point (m, {x,z}). */
export interface Pt2 { readonly x: number; readonly z: number }

/** An axis-aligned rectangular room footprint in the origin-centred frame (LOCAL). */
export interface RectRoom {
    /** Human label (drives the room name / semantic use). */
    readonly label: string;
    /** Min corner (m). */
    readonly x0: number;
    readonly z0: number;
    /** Max corner (m). */
    readonly x1: number;
    readonly z1: number;
}

/** A wall segment (baseline start → end) in the origin-centred frame (LOCAL, m). */
export interface WallSeg {
    readonly start: Pt2;
    readonly end: Pt2;
}

/** §OFFICE-CORE-WELLPROPORTIONED — a NAMED room the executor materialises as a graph-authoritative
 *  RoomData (so it ships with a real name, not "Room 00-NNN") + room-bounding lines. The polygon is
 *  the axis-aligned rectangle corners (CCW) in the LOCAL origin-centred frame. `occupancyType` is an
 *  optional engine occupancy string (validated + defaulted downstream). */
export interface NamedRoom {
    readonly name: string;
    /** CCW rectangle corners (LOCAL m). */
    readonly corners: readonly Pt2[];
    /** Optional RoomOccupancyType string (defaults to 'unclassified' downstream when unknown). */
    readonly occupancyType?: string;
    /** 'core' rooms get the core/WC finish tone; 'floor' rooms the office finish tone. */
    readonly finishGroup: 'core' | 'floor';
}

/** Rectangle → CCW corner list (LOCAL m). */
function rectCorners(x0: number, z0: number, x1: number, z1: number): Pt2[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}

// ── §OFFICE-CORE-SERVICES — floor-size classification + toilet cubicle scaling ────────────

/** Coarse floor-size band, driving toilet cubicle counts (SPEC §3). */
export type FloorSizeBand = 'small' | 'medium' | 'large' | 'very-large';

/**
 * §OFFICE-CORE-SERVICES — classify a floor by its GROSS floor area (m²) into a size band.
 * Thresholds picked so a 22 m-radius demo plate (~1520 m²) lands 'large' and a minimum 10 m
 * plate (~314 m²) lands 'small'. PURE + deterministic.
 */
export function classifyFloorSize(grossFloorAreaM2: number): FloorSizeBand {
    if (!(grossFloorAreaM2 > 0)) return 'small';
    if (grossFloorAreaM2 < 600) return 'small';
    if (grossFloorAreaM2 < 1200) return 'medium';
    if (grossFloorAreaM2 < 2600) return 'large';
    return 'very-large';
}

/**
 * §OFFICE-CORE-SERVICES — cubicles PER GENDER, scaled by floor size / occupant load (SPEC §3):
 *   small → 2 · medium → 3–4 · large → 5+ · very-large → scale by occupant load.
 * Occupant load is estimated from usable area (≈ 1 person / 10 m² NIA) so a very-large plate
 * scales the WC provision to roughly BS/ADA fixture ratios (~1 WC per ~20 occupants/gender).
 * PURE + deterministic. Always ≥ 2 (a real WC block is never a single cubicle).
 */
export function cubiclesPerGender(band: FloorSizeBand, usableAreaM2: number): number {
    switch (band) {
        case 'small': return 2;
        case 'medium': return usableAreaM2 >= 900 ? 4 : 3;
        case 'large': return 5;
        case 'very-large': {
            // ~1 occupant / 10 m², split by gender, ~1 WC per 20 occupants/gender, floor at 5.
            const occupants = usableAreaM2 / 10;
            const perGender = occupants / 2;
            return Math.max(5, Math.round(perGender / 20));
        }
    }
}

// ── §OFFICE-CORE-SERVICES — the core service plan (vertical circulation + toilets) ────────

/** One lift shaft placement (plan centre + shaft footprint). */
export interface LiftShaftPlan {
    readonly cx: number;
    readonly cz: number;
    readonly widthM: number;
    readonly depthM: number;
    /** Plan-direction angle (rad) — the shaft depth axis heading. */
    readonly rotationY: number;
}

/** The main switchback (U) staircase footprint centre + geometry. */
export interface StairPlan {
    readonly cx: number;
    readonly cz: number;
    readonly widthM: number;
    /** Run-direction length (m) reserved for the switchback body. */
    readonly runDepthM: number;
    /** Run direction (unit) — flight 1 heads this way. */
    readonly runDir: Pt2;
}

/** §OFFICE-CORE-WELLPROPORTIONED — the circulation corridor connecting entrance → lift lobby →
 *  WCs → office floor. An axis-aligned rectangular run (LOCAL m). */
export interface CoreCorridor {
    readonly x0: number;
    readonly z0: number;
    readonly x1: number;
    readonly z1: number;
}

/** The full core service plan for one floor. */
export interface OfficeCorePlan {
    readonly band: FloorSizeBand;
    /** The main passenger/fire switchback staircase (LEFT of the core lobby). */
    readonly mainStair: StairPlan;
    /** The fire-escape (egress) switchback staircase (RIGHT, opposite the main run). */
    readonly fireStair: StairPlan;
    /** Passenger lift shaft(s). ≥1; a large/very-large floor gets a 2-car bank. */
    readonly lifts: readonly LiftShaftPlan[];
    /** The fire-rated lift LOBBY room (the protected landing all cores share + lift approach). */
    readonly fireLobby: RectRoom;
    /** Toilet + service rooms: male · female · accessible WC · cleaning closet · service shaft. */
    readonly toiletRooms: readonly RectRoom[];
    /** Cubicles per gender (SPEC §3 scaled). */
    readonly cubiclesPerGender: number;
    /** Wall segments enclosing the toilet + service block (drawn as partitions). */
    readonly toiletWalls: readonly WallSeg[];
    /** §OFFICE-CORE-WELLPROPORTIONED — the circulation corridor the founder asked for ("the
     *  toilets don't have a run") connecting the core entrance → lift lobby → WCs → office floor. */
    readonly corridor: CoreCorridor;
    /** §OFFICE-CORE-WELLPROPORTIONED — every core/service room as a NAMED room (stair, fire escape,
     *  lift lobby, WCs, cleaning, service, corridor) so the shipped rooms carry real names. */
    readonly namedRooms: readonly NamedRoom[];
    /** The half-side (m) of the square core enclosure the executor draws the core walls on. */
    readonly coreHalfSideM: number;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * §OFFICE-CORE-SERVICES + §OFFICE-CORE-WELLPROPORTIONED — plan the FULL core (never empty) with
 * REAL absolute dimensions, mirroring the residential building's proven `_createCore`: a main
 * switchback stair + fire-escape stair + lift bank + lift LOBBY, PLUS a toilet + service block
 * (male · female · accessible WC · cleaning closet · service shaft) whose WCs are ~4–6 m² EACH and
 * whose cubicle counts scale with floor size — all reached by a CIRCULATION CORRIDOR (core entrance
 * → lift lobby → WCs → office floor).
 *
 * The core square (inscribed in the circular core disc, half-side `coreHalfSideM`) is a rectangular
 * SERVICE BAR laid out on a real column-grid rhythm, NOT a 2×2 quadrant of tiny boxes:
 *   • a central CORRIDOR spine (−z lobby side toward the office floor) runs the full core width;
 *   • the LEFT half hosts the main stair (back) + the fire-escape stair (front, remote egress);
 *   • the RIGHT-back band hosts the lift bank + its LOBBY (the protected landing);
 *   • the RIGHT-front band hosts the toilet block (M | F WCs + accessible WC + cleaning + service),
 *     each WC a real ~4–6 m² room, all opening onto the corridor.
 * Every room carries a real NAME so the shipped rooms never fall back to "Room 00-NNN".
 * PURE + deterministic. Returns null when the core is too small to host a real service plan.
 */
export function planOfficeCore(
    coreR: number,
    grossFloorAreaM2: number,
    usableAreaM2: number,
): OfficeCorePlan | null {
    if (!(coreR > 2.2)) return null;   // too small for a real, well-proportioned core service plan
    const band = classifyFloorSize(grossFloorAreaM2);
    const cubicles = cubiclesPerGender(band, usableAreaM2);

    // The inscribed square (half-side h) the core circle can hold, with a small inset so the
    // service rooms sit clear of the core RC wall. This is the SAME square the executor draws the
    // core enclosure walls on (coreSquare(coreR)), so the rooms sit exactly inside those walls.
    const inset = 0.2;
    const h = Math.max(2.0, coreR / Math.SQRT2 - inset);
    const side = 2 * h;                       // full core square side (m)
    const x0 = -h, x1 = h, z0 = -h, z1 = h;   // core square extents (LOCAL, origin-centred)

    // ── Circulation CORRIDOR spine — a real ~1.6–2.2 m clear run across the −z (office-facing) band
    // of the core, so every service room opens onto a proper corridor (founder: "the toilets don't
    // have a run"). The corridor is the protected route: office floor → lift lobby → WCs.
    const corridorW = Math.min(2.2, Math.max(1.6, side * 0.16));
    // Corridor sits just inside the +X (lobby/entrance) edge band; it spans the full core width so
    // it links the stairs (left) → lift lobby (right-back) → WCs (right-front).
    const corridorZ0 = round4(-corridorW / 2);
    const corridorZ1 = round4(corridorW / 2);
    const corridor: CoreCorridor = { x0: round4(x0), z0: corridorZ0, x1: round4(x1), z1: corridorZ1 };

    // Bands above (+z back) and below (−z front) the corridor spine.
    const backZ0 = corridorZ1, backZ1 = z1;    // back band (stairs-back / lift bank)
    const frontZ0 = z0, frontZ1 = corridorZ0;  // front band (fire stair / toilet block)
    const backDepth = backZ1 - backZ0;
    const frontDepth = frontZ1 - frontZ0;

    // Split the core square into a LEFT half (vertical circulation) and a RIGHT half (lift lobby +
    // toilets), with a small gap for the corridor to link them.
    const midX = 0;                             // left | right divide at x=0
    const leftX0 = x0, leftX1 = midX;
    const rightX0 = midX, rightX1 = x1;

    // ── Vertical-circulation footprints (REAL dimensions: ~1.2 m stair width, real run depth). ──
    const stairWidth = Math.min(1.5, Math.max(1.1, (leftX1 - leftX0) * 0.4));
    const stairRun = Math.max(2.4, backDepth * 0.9);

    // Main stair — LEFT/back. Runs +Z (into the back band). Centred in the left-back quadrant.
    const mainStairCx = (leftX0 + leftX1) / 2;
    const mainStair: StairPlan = {
        cx: round4(mainStairCx),
        cz: round4(backZ0 + 0.2),
        widthM: round4(stairWidth),
        runDepthM: round4(stairRun),
        runDir: { x: 0, z: 1 },
    };
    // Fire-escape stair — LEFT/front. Runs −Z (opposite the main run) for a remote second egress.
    const fireStair: StairPlan = {
        cx: round4(mainStairCx),
        cz: round4(frontZ1 - 0.2),
        widthM: round4(stairWidth),
        runDepthM: round4(Math.max(2.4, frontDepth * 0.9)),
        runDir: { x: 0, z: -1 },
    };

    // ── Lift bank + LOBBY — RIGHT/back. 1 car for small/medium, 2 cars for large+. The lobby is the
    // protected landing the lifts open into (the fire-rated lobby), sized as a real approach space.
    const liftCount = band === 'small' || band === 'medium' ? 1 : 2;
    const lifts: LiftShaftPlan[] = [];
    // The lift shafts sit against the +z (back) wall; the lobby is the band between them and the
    // corridor. Shaft depth ~2.0 m; lobby depth = the remaining back band.
    const shaftD = Math.min(2.4, Math.max(1.8, backDepth * 0.5));
    const liftBandX0 = rightX0 + 0.2, liftBandX1 = rightX1 - 0.2;
    const liftSpanX = liftBandX1 - liftBandX0;
    const shaftW = Math.min(2.2, Math.max(1.5, liftSpanX / liftCount - 0.3));
    for (let i = 0; i < liftCount; i++) {
        const step = liftCount > 1 ? liftSpanX / liftCount : liftSpanX;
        const cx = liftBandX0 + step * (i + 0.5);
        lifts.push({
            cx: round4(cx),
            cz: round4(backZ1 - shaftD / 2 - 0.2),
            widthM: round4(Math.min(shaftW, step - 0.2)),
            depthM: round4(shaftD),
            rotationY: 0,
        });
    }
    // Lift LOBBY — the protected landing between the lift shafts and the corridor (RIGHT-back band).
    const fireLobby: RectRoom = {
        label: 'Lift Lobby',
        x0: round4(rightX0), z0: round4(backZ0),
        x1: round4(rightX1), z1: round4(backZ1 - shaftD - 0.4),
    };

    // ── Toilet + service block — RIGHT/front band, split into REAL WCs: Male | Female stacked, an
    // Accessible WC, a Cleaning closet + a Service shaft. Each WC is a real ~4–6 m² room. All open
    // onto the corridor spine (the +z edge of this band is the corridor).
    const toiletRooms: RectRoom[] = [];
    const toiletWalls: WallSeg[] = [];
    const namedRooms: NamedRoom[] = [];

    const tX0 = rightX0, tX1 = rightX1;
    const tZ0 = frontZ0, tZ1 = frontZ1;
    const tW = tX1 - tX0;
    const tD = tZ1 - tZ0;
    if (tW > 2.0 && tD > 2.0) {
        // A narrow service-shaft strip on the far (+x) edge; a cleaning closet beside it; the rest =
        // the WC zone. The WC zone is split LEFT (Male + Female stacked, each a real scaled WC) and a
        // near-corridor Accessible WC of BOUNDED size (~4–6 m², not ballooned on a big core). All open
        // onto the corridor. Mirrors a real office toilet core (BS 6465 / Approved Doc M provision).
        const shaftStripW = Math.min(1.0, tW * 0.16);
        const cleanW = Math.min(1.4, tW * 0.22);
        const wcAreaX1 = tX1 - shaftStripW - cleanW;   // the M/F/accessible WC zone right edge
        const wcAreaW = wcAreaX1 - tX0;
        // The accessible WC is a bounded ~2.2 m-deep room on the corridor (+z) side of the WC zone,
        // spanning a sensible width (≤ 2.5 m) so it stays ~4–6 m² even on a large core.
        const accW = Math.min(2.5, Math.max(1.8, wcAreaW * 0.45));
        const accDepth = Math.min(2.6, Math.max(1.8, tD * 0.4));
        const accZ0 = tZ1 - accDepth;                  // accessible WC hugs the corridor edge (+z)
        // Male | Female WCs stacked below the accessible WC (front, −z), each spanning the full WC
        // zone width and half the remaining depth — real scaled WCs (grow with the core, not tokens).
        const mfZ1 = accZ0;
        const mfMidZ = (tZ0 + mfZ1) / 2;               // Male (back half) | Female (front half)

        const maleR: RectRoom = { label: `WC — Male (${cubicles} cubicles)`, x0: round4(tX0), z0: round4(mfMidZ), x1: round4(wcAreaX1), z1: round4(mfZ1) };
        const femaleR: RectRoom = { label: `WC — Female (${cubicles} cubicles)`, x0: round4(tX0), z0: round4(tZ0), x1: round4(wcAreaX1), z1: round4(mfMidZ) };
        const accessR: RectRoom = { label: 'Accessible WC', x0: round4(tX0), z0: round4(accZ0), x1: round4(tX0 + accW), z1: round4(tZ1) };
        const cleanR: RectRoom = { label: 'Cleaning', x0: round4(wcAreaX1), z0: round4(tZ0), x1: round4(wcAreaX1 + cleanW), z1: round4(tZ1) };
        const shaftR: RectRoom = { label: 'Service Shaft', x0: round4(wcAreaX1 + cleanW), z0: round4(tZ0), x1: round4(tX1), z1: round4(tZ1) };
        toiletRooms.push(maleR, femaleR, accessR, cleanR, shaftR);

        // Partition walls: the outer rectangle + the internal splits + the strip lines.
        const rect = (rx0: number, rz0: number, rx1: number, rz1: number): WallSeg[] => [
            { start: { x: rx0, z: rz0 }, end: { x: rx1, z: rz0 } },
            { start: { x: rx1, z: rz0 }, end: { x: rx1, z: rz1 } },
            { start: { x: rx1, z: rz1 }, end: { x: rx0, z: rz1 } },
            { start: { x: rx0, z: rz1 }, end: { x: rx0, z: rz0 } },
        ];
        toiletWalls.push(...rect(tX0, tZ0, tX1, tZ1));
        toiletWalls.push({ start: { x: tX0, z: mfMidZ }, end: { x: wcAreaX1, z: mfMidZ } });   // M | F split
        toiletWalls.push({ start: { x: tX0, z: accZ0 }, end: { x: wcAreaX1, z: accZ0 } });     // WCs ↔ accessible split
        toiletWalls.push({ start: { x: tX0 + accW, z: accZ0 }, end: { x: tX0 + accW, z: tZ1 } }); // accessible | (WC-zone corridor spur)
        toiletWalls.push({ start: { x: wcAreaX1, z: tZ0 }, end: { x: wcAreaX1, z: tZ1 } });    // WC zone | cleaning
        toiletWalls.push({ start: { x: wcAreaX1 + cleanW, z: tZ0 }, end: { x: wcAreaX1 + cleanW, z: tZ1 } }); // cleaning | shaft
    }

    // ── §OFFICE-CORE-WELLPROPORTIONED — every core/service room as a NAMED room so the shipped rooms
    // carry a real name (Stair / Fire Escape Stair / Lift Lobby / WC — Male / … ) not "Room 00-NNN".
    // Stair footprints as rooms (a real room the switchback stair sits in).
    const stairHalfW = stairWidth / 2 + 0.3;
    namedRooms.push({
        name: 'Stair', finishGroup: 'core', occupancyType: 'circulation',
        corners: rectCorners(round4(mainStairCx - stairHalfW), round4(backZ0), round4(mainStairCx + stairHalfW), round4(backZ1)),
    });
    namedRooms.push({
        name: 'Fire Escape Stair', finishGroup: 'core', occupancyType: 'circulation',
        corners: rectCorners(round4(mainStairCx - stairHalfW), round4(frontZ0), round4(mainStairCx + stairHalfW), round4(frontZ1)),
    });
    namedRooms.push({
        name: 'Lift Lobby', finishGroup: 'core', occupancyType: 'circulation',
        corners: rectCorners(fireLobby.x0, fireLobby.z0, fireLobby.x1, fireLobby.z1),
    });
    namedRooms.push({
        name: 'Corridor', finishGroup: 'core', occupancyType: 'circulation',
        corners: rectCorners(corridor.x0, corridor.z0, corridor.x1, corridor.z1),
    });
    for (const r of toiletRooms) {
        namedRooms.push({
            name: r.label, finishGroup: 'core',
            occupancyType: r.label.toLowerCase().includes('shaft') ? 'service' : 'sanitary',
            corners: rectCorners(r.x0, r.z0, r.x1, r.z1),
        });
    }

    return {
        band, mainStair, fireStair, lifts, fireLobby,
        toiletRooms, cubiclesPerGender: cubicles, toiletWalls,
        corridor, namedRooms, coreHalfSideM: round4(h),
    };
}

// ── §OFFICE-CIRCULATION-FIRST — circulation-solved-first floor architecture (SPEC §4/§9) ──

/** A circulation corridor ring/band (drawn as bounding lines so detection reads it). */
export interface CirculationRing {
    readonly label: string;
    /** Ring inner radius (m). */
    readonly innerR: number;
    /** Ring outer radius (m). */
    readonly outerR: number;
    readonly kind: 'primary' | 'secondary' | 'escape';
}

/** A glazed (curtain-wall) office enclosure — a chord wall + its two return walls. */
export interface GlazedEnclosure {
    readonly label: string;
    /** The enclosure footprint corners (CCW, LOCAL m) — a small room at the glass. */
    readonly corners: readonly Pt2[];
    /** The wall segments forming the enclosure (glazed curtain-wall system). */
    readonly walls: readonly WallSeg[];
}

/** A support-space room footprint on the floor (meeting / kitchenette / storage / plant). */
export interface SupportRoom extends RectRoom {
    readonly kind: 'meeting' | 'kitchenette' | 'storage' | 'plant';
}

/** The circulation-first floor plan: circulation solved BEFORE rooms (SPEC §4/§9 steps 3–5). */
export interface OfficeFloorArchitecture {
    /** Step 3 — primary circulation + escape routes (rings around the core). */
    readonly circulation: readonly CirculationRing[];
    /** Step 4 — support spaces (meeting / kitchenette / storage / plant). */
    readonly supportRooms: readonly SupportRoom[];
    /** Step 5 — internal partition walls (opaque). */
    readonly partitionWalls: readonly WallSeg[];
    /** Step 5 — glazed office enclosures (curtain-wall systems). */
    readonly glazedEnclosures: readonly GlazedEnclosure[];
    /** §OFFICE-CORE-WELLPROPORTIONED — the floor's NAMED rooms (open-plan office + support rooms +
     *  glazed offices) so the open-plan area ships as a named "Office" (not one giant "Room 00-001").*/
    readonly namedRooms: readonly NamedRoom[];
    /** Diagnostic string (the ordered pipeline steps, for logging + tests). */
    readonly diagnostic: string;
}

/**
 * §OFFICE-CIRCULATION-FIRST — plan ONE representative office floor by SOLVING CIRCULATION
 * BEFORE ROOMS (SPEC §4/§9 steps 3–5). The order is enforced by construction:
 *   1. GFA + core position are inputs (steps 1–2, done upstream by the plate generator).
 *   3. PRIMARY circulation (the inner ring around the core) + a SECONDARY perimeter ring +
 *      ESCAPE routes (radial spokes to the perimeter) are laid FIRST.
 *   4. SUPPORT spaces (meeting rooms · kitchenette · storage · plant) are placed in the band
 *      between the circulation rings — only AFTER circulation exists.
 *   5. INTERNAL partitions + a few GLAZED office enclosures are added last, at the glass.
 * Returns the plan; the executor draws the corridors as bounding lines, the support rooms as
 * partitioned rooms, and the glazed enclosures as curtain-wall segments. PURE + deterministic.
 */
export function planOfficeFloorArchitecture(input: {
    discR: number;
    coreR: number;
    /** Inner-circulation ring outer radius from the plate (primary corridor outer edge). */
    innerCircOuterR: number;
    /** Open-plan ring outer radius (where support rooms sit inboard of the glass). */
    openPlanOuterR: number;
    /** Perimeter-office ring mid radius (where glazed enclosures sit at the glass). */
    perimMidR: number;
}): OfficeFloorArchitecture {
    const { discR, coreR, innerCircOuterR, openPlanOuterR, perimMidR } = input;
    const steps: string[] = [];

    // ── Step 3: CIRCULATION FIRST — primary (around the core) + secondary (perimeter) + escape.
    const circulation: CirculationRing[] = [];
    const primaryInner = Math.max(coreR, coreR + 0.1);
    const primaryOuter = innerCircOuterR > primaryInner ? innerCircOuterR : primaryInner + 1.8;
    circulation.push({ label: 'Primary circulation (core corridor)', innerR: round4(primaryInner), outerR: round4(primaryOuter), kind: 'primary' });
    const secOuter = discR;
    const secInner = Math.max(perimMidR, discR - 2.0);
    if (secOuter > secInner) {
        circulation.push({ label: 'Secondary circulation (perimeter loop)', innerR: round4(secInner), outerR: round4(secOuter), kind: 'secondary' });
    }
    // Escape routes: 4 radial spokes (N/E/S/W) from the primary ring to the perimeter — the
    // fire-egress paths, laid BEFORE any room is placed so no room can block them.
    const escapeInner = round4(primaryOuter);
    const escapeOuter = round4(secOuter);
    circulation.push({ label: 'Escape routes (radial spokes)', innerR: escapeInner, outerR: escapeOuter, kind: 'escape' });
    steps.push('3:circulation(primary+secondary+escape)');

    // ── Step 4: SUPPORT spaces — meeting / kitchenette / storage / plant in the band between
    // the primary ring and the glass, placed on the 4 diagonal quadrants (clear of the N/E/S/W
    // escape spokes). Only placed AFTER circulation is solved.
    const supportRooms: SupportRoom[] = [];
    const bandInner = round4(primaryOuter + 0.3);
    const bandOuter = round4(Math.min(openPlanOuterR, secInner - 0.3));
    const roomKinds: Array<SupportRoom['kind']> = ['meeting', 'kitchenette', 'storage', 'plant'];
    const roomLabels: Record<SupportRoom['kind'], string> = {
        meeting: 'Meeting Room', kitchenette: 'Kitchenette', storage: 'Storage', plant: 'Plant / Service Room',
    };
    if (bandOuter > bandInner + 1.0) {
        const midR = (bandInner + bandOuter) / 2;
        const halfW = Math.min(2.4, (bandOuter - bandInner) / 2 - 0.2);
        const halfD = Math.min(2.4, (bandOuter - bandInner) / 2 - 0.2);
        // Diagonal headings NE, SE, SW, NW so rooms avoid the axial escape spokes.
        const diagAngles = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4];
        for (let i = 0; i < roomKinds.length; i++) {
            const a = diagAngles[i]!;
            const cx = Math.cos(a) * midR, cz = Math.sin(a) * midR;
            supportRooms.push({
                kind: roomKinds[i]!,
                label: roomLabels[roomKinds[i]!],
                x0: round4(cx - halfW), z0: round4(cz - halfD),
                x1: round4(cx + halfW), z1: round4(cz + halfD),
            });
        }
    }
    steps.push(`4:support(${supportRooms.length})`);

    // ── Step 5: INTERNAL partitions + GLAZED office enclosures. Partitions = the rectangle
    // edges of the support rooms (opaque). Glazed enclosures = a few executive/focus offices at
    // the glass, built as curtain-wall chord walls on the perimeter ring.
    const partitionWalls: WallSeg[] = [];
    for (const r of supportRooms) {
        partitionWalls.push(
            { start: { x: r.x0, z: r.z0 }, end: { x: r.x1, z: r.z0 } },
            { start: { x: r.x1, z: r.z0 }, end: { x: r.x1, z: r.z1 } },
            { start: { x: r.x1, z: r.z1 }, end: { x: r.x0, z: r.z1 } },
            { start: { x: r.x0, z: r.z1 }, end: { x: r.x0, z: r.z0 } },
        );
    }
    const glazedEnclosures: GlazedEnclosure[] = [];
    // A few glazed enclosures (executive / focus / phone rooms) on the perimeter ring, on the
    // axial headings (E/N/W/S) between the diagonal support rooms — visually open glass boxes.
    const glassR = Math.min(perimMidR > 0 ? perimMidR : discR - 1.5, discR - 1.0);
    const encLabels = ['Executive Office (glazed)', 'Focus Room (glazed)', 'Interview Room (glazed)'];
    const axialAngles = [0, Math.PI / 2, Math.PI];
    if (glassR > coreR + 2.0) {
        for (let i = 0; i < axialAngles.length; i++) {
            const a = axialAngles[i]!;
            const cx = Math.cos(a) * glassR, cz = Math.sin(a) * glassR;
            // Tangent + radial unit vectors for a chord-aligned box at the glass.
            const tx = -Math.sin(a), tz = Math.cos(a);   // tangent
            const rx = Math.cos(a), rz = Math.sin(a);    // radial (outward)
            const halfChord = 1.8;   // box half-width along the glass
            const depth = 2.2;       // box depth inward from the glass
            const p1 = { x: round4(cx + tx * halfChord), z: round4(cz + tz * halfChord) };
            const p2 = { x: round4(cx - tx * halfChord), z: round4(cz - tz * halfChord) };
            const p3 = { x: round4(cx - tx * halfChord - rx * depth), z: round4(cz - tz * halfChord - rz * depth) };
            const p4 = { x: round4(cx + tx * halfChord - rx * depth), z: round4(cz + tz * halfChord - rz * depth) };
            const corners = [p1, p2, p3, p4];
            glazedEnclosures.push({
                label: encLabels[i] ?? 'Glazed Office',
                corners,
                walls: [
                    { start: p2, end: p3 },   // return wall
                    { start: p3, end: p4 },   // inboard glazed wall
                    { start: p4, end: p1 },   // return wall
                ],
            });
        }
    }
    steps.push(`5:partitions(${partitionWalls.length})+glazed(${glazedEnclosures.length})`);

    // ── §OFFICE-CORE-WELLPROPORTIONED — NAMED rooms so the floor ships named, not "Room 00-001":
    // the open-plan office as ONE ring-donut "Office" room + each support/glazed room by name.
    const namedRooms: NamedRoom[] = [];
    // Open-plan office donut: a coarse ring (32-gon) between the primary corridor outer edge and the
    // glass. Represented as its OUTER ring corners (a filled disc room minus core is approximated as
    // the outer disc — detection/finish treats it as the office floor plate). We use the open-plan
    // outer radius so the office room reads as the working floor.
    const officeOuterR = openPlanOuterR > primaryOuter ? openPlanOuterR : discR - 1.0;
    if (officeOuterR > primaryOuter + 0.5) {
        const ring = Array.from({ length: 24 }, (_v, i) => {
            const a = (2 * Math.PI * i) / 24;
            return { x: round4(Math.cos(a) * officeOuterR), z: round4(Math.sin(a) * officeOuterR) };
        });
        namedRooms.push({ name: 'Open-Plan Office', finishGroup: 'floor', occupancyType: 'office', corners: ring });
    }
    for (const r of supportRooms) {
        namedRooms.push({
            name: r.label, finishGroup: 'floor',
            occupancyType: r.kind === 'kitchenette' ? 'kitchen' : r.kind === 'meeting' ? 'office' : 'storage',
            corners: rectCorners(r.x0, r.z0, r.x1, r.z1),
        });
    }
    for (const enc of glazedEnclosures) {
        namedRooms.push({ name: enc.label.replace(' (glazed)', ''), finishGroup: 'floor', occupancyType: 'office', corners: [...enc.corners] });
    }

    const diagnostic = `§DIAG-OFFICE-CIRCULATION-FIRST order=[${steps.join(' → ')}]`;
    return { circulation, supportRooms, partitionWalls, glazedEnclosures, namedRooms, diagnostic };
}

/**
 * §FIX-OFFICE-CIRC-RBL-UNDEFINED-PLACEMENT (L-170) — the PURE producer of the RoomBoundingLine
 * segments the office FLOOR architecture materialises. Only the real rectangular SUPPORT rooms
 * (meeting / kitchenette / storage / plant) yield bounding lines; the circulation RINGS are
 * DELIBERATELY NOT materialised as RoomBoundingLines.
 *
 * Why circulation rings are NOT emitted (the L-170 fix — STOP creating them, don't "populate"):
 *   • They never carve rooms — office floors are GRAPH-AUTHORITATIVE (the executor dispatches
 *     BatchCreateRoomsCommand + markGraphAuthoritative from the NamedRooms), so auto-detection is
 *     explicitly overridden and no bounding line establishes room identity here. Circulation is
 *     represented by the named 'Corridor' / 'Open-Plan Office' rooms instead.
 *   • They never rendered — the shared RoomBoundingLineStore fires an {id}-only DOM event, so the
 *     RoomBoundingLineBuilder receives no `placement` and the §RBL-PLACEMENT-GUARD skips every line
 *     however finite the emitted endpoints are (a shared store/builder-wiring issue).
 *   • They were pure waste + a redetect storm — a 32-gon per radius × 2 circles × N rings minted
 *     ~190 RoomBoundingLine records PER FLOOR, each burning a command + mark id AND firing
 *     RoomTopologyObserver's per-add redetect (ungated by the batch's skipRedetectRooms), tripping
 *     the same-geometry circuit-breaker 60+×.
 *
 * Every emitted support-room edge is routed through the SAME `ringPlanSegments`
 * §RBL-PLACEMENT-AT-SOURCE guard the zone lines use, so no undefined / NaN / degenerate (< 10 mm)
 * endpoint ever reaches a `CREATE_ROOM_BOUNDING_LINE` payload. Pure + deterministic.
 */
export function officeFloorArchitectureBoundingLineSegments(
    arch: Pick<OfficeFloorArchitecture, 'supportRooms'>,
): Array<{ start: Pt2; end: Pt2 }> {
    const out: Array<{ start: Pt2; end: Pt2 }> = [];
    for (const r of arch.supportRooms) {
        // §RBL-PLACEMENT-AT-SOURCE — the shared guard: only finite-endpoint, non-degenerate edges.
        out.push(...ringPlanSegments(rectCorners(r.x0, r.z0, r.x1, r.z1)));
    }
    return out;
}
