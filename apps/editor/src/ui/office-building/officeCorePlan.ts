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
// SPEC §3 (core, never empty): the core must ALWAYS carry vertical circulation (staircase + fire
// escape stair + lift shaft(s) + fire-rated lobby) AND toilets (male · female · accessible WC ·
// cleaning closet · service shaft) with cubicle counts SCALED by floor size. SPEC §4/§9: the floor
// algorithm defines GFA → core position → primary circulation + escape routes → support rooms →
// internal partitions + glazed enclosures — SOLVING CIRCULATION BEFORE ROOMS.

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

/** The full core service plan for one floor. */
export interface OfficeCorePlan {
    readonly band: FloorSizeBand;
    /** The main passenger/fire switchback staircase (LEFT of the core lobby). */
    readonly mainStair: StairPlan;
    /** The fire-escape (egress) switchback staircase (RIGHT, opposite the main run). */
    readonly fireStair: StairPlan;
    /** Passenger lift shaft(s). ≥1; a large/very-large floor gets a 2-car bank. */
    readonly lifts: readonly LiftShaftPlan[];
    /** The fire-rated lobby room (the protected landing all cores share). */
    readonly fireLobby: RectRoom;
    /** Toilet + service rooms: male · female · accessible WC · cleaning closet · service shaft. */
    readonly toiletRooms: readonly RectRoom[];
    /** Cubicles per gender (SPEC §3 scaled). */
    readonly cubiclesPerGender: number;
    /** Wall segments enclosing the toilet + service block (drawn as partitions). */
    readonly toiletWalls: readonly WallSeg[];
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/**
 * §OFFICE-CORE-SERVICES — plan the FULL core (never empty): main stair + fire-escape stair +
 * lift shaft(s) + fire-rated lobby, PLUS a toilet + service block (male · female · accessible
 * WC · cleaning closet · service shaft) whose cubicle counts scale with floor size.
 *
 * The core disc (radius `coreR`, origin-centred) is divided into a 2×2 functional quadrant grid
 * around a central fire lobby:
 *   • main stair  — LEFT half, back band
 *   • lift bank   — RIGHT half, back band (1 car small/medium, 2 cars large+)
 *   • fire stair  — LEFT half, front band (opposite the main run for a second, remote egress)
 *   • toilets     — RIGHT half, front band (M/F/accessible + cleaning + service shaft strip)
 *   • fire lobby  — the protected central band the fire door opens into.
 * All footprints are clamped inside the inscribed square of the core circle so nothing pokes
 * through the core wall. PURE + deterministic. Returns null when the core is too small to host a
 * real service plan (caller degrades to the shell-only core).
 */
export function planOfficeCore(
    coreR: number,
    grossFloorAreaM2: number,
    usableAreaM2: number,
): OfficeCorePlan | null {
    if (!(coreR > 1.5)) return null;   // too small for a real core service plan
    const band = classifyFloorSize(grossFloorAreaM2);
    const cubicles = cubiclesPerGender(band, usableAreaM2);

    // The inscribed square (half-side h) the core circle can hold, with a small inset so the
    // service rooms sit clear of the core RC wall.
    const inset = 0.3;
    const h = Math.max(1.0, coreR / Math.SQRT2 - inset);
    // Split into a front band (−z, toward the lobby the fire door faces) and a back band (+z),
    // with the fire lobby a central strip between them.
    const lobbyHalfDepth = Math.min(1.2, h * 0.35);
    const backZ0 = lobbyHalfDepth;          // back band z ∈ [lobbyHalfDepth, h]
    const backZ1 = h;
    const frontZ0 = -h;                      // front band z ∈ [−h, −lobbyHalfDepth]
    const frontZ1 = -lobbyHalfDepth;

    // Vertical-circulation footprints (sized to the available half-quadrant).
    const stairWidth = Math.min(2.0, Math.max(1.0, h * 0.6));
    const stairRun = Math.max(1.2, (backZ1 - backZ0) * 0.9);
    const shaftW = Math.min(2.0, Math.max(1.4, h * 0.55));
    const shaftD = Math.min(2.4, Math.max(1.4, (backZ1 - backZ0) * 0.9));

    // Main stair — LEFT/back. Runs +Z (into the back band).
    const mainStair: StairPlan = {
        cx: round4(-h / 2),
        cz: round4(backZ0 + 0.1),
        widthM: round4(stairWidth),
        runDepthM: round4(stairRun),
        runDir: { x: 0, z: 1 },
    };
    // Fire-escape stair — LEFT/front. Runs −Z (opposite the main run) for a remote second egress.
    const fireStair: StairPlan = {
        cx: round4(-h / 2),
        cz: round4(frontZ1 - 0.1),
        widthM: round4(stairWidth),
        runDepthM: round4(Math.max(1.2, (frontZ1 - frontZ0) * 0.9)),
        runDir: { x: 0, z: -1 },
    };
    // Lift bank — RIGHT/back. 1 car for small/medium, 2 cars for large+.
    const liftCount = band === 'small' || band === 'medium' ? 1 : 2;
    const lifts: LiftShaftPlan[] = [];
    const liftBandX0 = 0.2, liftBandX1 = h;      // right half
    const liftSpanX = liftBandX1 - liftBandX0;
    for (let i = 0; i < liftCount; i++) {
        const step = liftCount > 1 ? liftSpanX / liftCount : liftSpanX;
        const cx = liftBandX0 + step * (i + 0.5);
        lifts.push({
            cx: round4(cx),
            cz: round4(backZ0 + shaftD / 2 + 0.1),
            widthM: round4(Math.min(shaftW, step - 0.2)),
            depthM: round4(shaftD),
            rotationY: 0,
        });
    }

    // Fire-rated lobby — the central protected band (between front + back).
    const fireLobby: RectRoom = {
        label: 'Fire-rated lobby',
        x0: round4(-h), z0: round4(frontZ1),
        x1: round4(h), z1: round4(backZ0),
    };

    // Toilet + service block — RIGHT/front quadrant, split into M / F / accessible WC + a
    // cleaning closet + a service shaft strip. Sized from the available quadrant width.
    const toiletX0 = 0.2, toiletX1 = h;
    const toiletZ0 = frontZ0, toiletZ1 = frontZ1;
    const toiletRooms: RectRoom[] = [];
    const toiletWalls: WallSeg[] = [];
    const qW = toiletX1 - toiletX0;
    const qD = toiletZ1 - toiletZ0;
    if (qW > 1.5 && qD > 1.5) {
        // A service-shaft strip on the far (+x) edge; the rest split M | F stacked with an
        // accessible WC + cleaning closet sharing the near strip.
        const shaftStripW = Math.min(0.8, qW * 0.18);
        const mfX1 = toiletX1 - shaftStripW;
        const midX = (toiletX0 + mfX1) / 2;
        const midZ = (toiletZ0 + toiletZ1) / 2;
        // Male (near-x, back-z) / Female (far-x, back-z) / Accessible WC (near-x, front-z) /
        // Cleaning closet (far-x, front-z).
        toiletRooms.push(
            { label: `Male WC (${cubicles} cubicles)`, x0: round4(toiletX0), z0: round4(midZ), x1: round4(midX), z1: round4(toiletZ1) },
            { label: `Female WC (${cubicles} cubicles)`, x0: round4(midX), z0: round4(midZ), x1: round4(mfX1), z1: round4(toiletZ1) },
            { label: 'Accessible WC', x0: round4(toiletX0), z0: round4(toiletZ0), x1: round4(midX), z1: round4(midZ) },
            { label: 'Cleaning closet', x0: round4(midX), z0: round4(toiletZ0), x1: round4(mfX1), z1: round4(midZ) },
            { label: 'Service shaft', x0: round4(mfX1), z0: round4(toiletZ0), x1: round4(toiletX1), z1: round4(toiletZ1) },
        );
        // Partition walls: the outer rectangle + the internal cross + the shaft strip line.
        const rect = (x0: number, z0: number, x1: number, z1: number): WallSeg[] => [
            { start: { x: x0, z: z0 }, end: { x: x1, z: z0 } },
            { start: { x: x1, z: z0 }, end: { x: x1, z: z1 } },
            { start: { x: x1, z: z1 }, end: { x: x0, z: z1 } },
            { start: { x: x0, z: z1 }, end: { x: x0, z: z0 } },
        ];
        toiletWalls.push(...rect(toiletX0, toiletZ0, toiletX1, toiletZ1));
        toiletWalls.push({ start: { x: toiletX0, z: midZ }, end: { x: mfX1, z: midZ } });   // horizontal split
        toiletWalls.push({ start: { x: midX, z: toiletZ0 }, end: { x: midX, z: toiletZ1 } }); // vertical split
        toiletWalls.push({ start: { x: mfX1, z: toiletZ0 }, end: { x: mfX1, z: toiletZ1 } }); // shaft strip
    }

    return {
        band, mainStair, fireStair, lifts, fireLobby,
        toiletRooms, cubiclesPerGender: cubicles, toiletWalls,
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
        meeting: 'Meeting room', kitchenette: 'Kitchenette', storage: 'Storage', plant: 'Plant / service room',
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
    const encLabels = ['Executive office (glazed)', 'Focus room (glazed)', 'Interview room (glazed)'];
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
                label: encLabels[i] ?? 'Glazed office',
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

    const diagnostic = `§DIAG-OFFICE-CIRCULATION-FIRST order=[${steps.join(' → ')}]`;
    return { circulation, supportRooms, partitionWalls, glazedEnclosures, diagnostic };
}
