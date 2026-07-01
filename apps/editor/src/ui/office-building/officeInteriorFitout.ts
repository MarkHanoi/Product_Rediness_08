// §OFFICE-INTERIOR-FITOUT (founder 2026-07-01: "the office is missing EVERYTHING inside —
// desks, chairs, meeting rooms, cafe, core walls, entrance, roof") — PURE, DOM-free, THREE-free
// placement math for the office interior fit-out. The executor (OfficeBuildingExecutor) turns
// these plans into real elements via the command bus / commandManager; this module owns ONLY the
// geometry so it is I/O-free and unit-testable in plain Node.
//
// FRAME: the office floor-plate zones are in a LOCAL centroid frame centred at the origin (0,0)
// (see officeFloorPlate.generateOfficeFloorPlate — every circlePolygon is centred at 0). The
// executor uses the disc verbatim as world coords, so every placement here is in that same
// origin-centred metric frame (metres, plan {x,z}).

/** A finite plan point (m, {x,z}). */
export interface Pt2 { readonly x: number; readonly z: number }

/** One placed furniture item in the LOCAL origin-centred frame. */
export interface PlacedFurniture {
    readonly x: number;
    readonly z: number;
    /** Y rotation (radians). */
    readonly rotY: number;
    readonly width: number;
    readonly length: number;
}

/** A desk + its chair (chair sits on the −Z side of the desk, facing +Z into the desk). */
export interface DeskChair {
    readonly desk: PlacedFurniture;
    readonly chair: PlacedFurniture;
}

const DESK_W = 1.4;          // desk top width (along the row)
const DESK_L = 0.8;          // desk depth
const DESK_CHAIR_SIZE = 0.55;
const DESK_ROW_PITCH = 2.0;  // centre-to-centre between back-to-back desk rows (desk + chair + aisle)
const DESK_COL_PITCH = 1.6;  // centre-to-centre between adjacent desks in a row

/** True iff a point is inside the annulus [rIn, rOut] centred at the origin. */
function inAnnulus(x: number, z: number, rIn: number, rOut: number): boolean {
    const r = Math.hypot(x, z);
    return r >= rIn && r <= rOut;
}

/**
 * §OFFICE-DESK-GRID — lay a regular grid of desk+chair pairs inside the open-plan annulus
 * [innerR, outerR] (origin-centred), capped at `maxDesks` so a dense plate stays performant.
 * Desks face outward (chair on the inner side, +row direction), arranged in rows along +X.
 * A desk is placed only when its full footprint (desk + chair clearance) fits inside the
 * annulus band (both radii), so no desk pokes into the core or past the glass. PURE.
 */
export function deskGrid(innerR: number, outerR: number, maxDesks: number): DeskChair[] {
    const out: DeskChair[] = [];
    if (!(outerR > innerR) || maxDesks <= 0) return out;
    const half = outerR;
    // March a grid over the bounding box of the outer circle; keep only cells whose desk AND
    // chair footprint sits within the annulus band.
    const marginDesk = Math.hypot(DESK_W, DESK_L) / 2 + 0.1;
    for (let z = -half + DESK_ROW_PITCH; z <= half - DESK_ROW_PITCH; z += DESK_ROW_PITCH) {
        for (let x = -half + DESK_COL_PITCH; x <= half - DESK_COL_PITCH; x += DESK_COL_PITCH) {
            if (out.length >= maxDesks) return out;
            // Desk centre must be clear of the core and the glass by the desk half-diagonal.
            if (!inAnnulus(x, z, innerR + marginDesk, outerR - marginDesk)) continue;
            // Chair sits ~0.7 m toward the core (−radial), still inside the band.
            const rad = Math.hypot(x, z) || 1;
            const cx = x - (x / rad) * 0.7;
            const cz = z - (z / rad) * 0.7;
            if (!inAnnulus(cx, cz, innerR + 0.2, outerR)) continue;
            // Face outward (radially): rotate so the desk depth points along the radial.
            const rotY = Math.atan2(x, z);   // heading toward +radial
            out.push({
                desk: { x, z, rotY, width: DESK_W, length: DESK_L },
                chair: { x: cx, z: cz, rotY, width: DESK_CHAIR_SIZE, length: DESK_CHAIR_SIZE },
            });
        }
    }
    return out;
}

/** A meeting room: a table with `seats` chairs around it, at a point on a ring. */
export interface MeetingRoom {
    readonly table: PlacedFurniture;
    readonly chairs: readonly PlacedFurniture[];
    readonly centre: Pt2;
}

/**
 * §OFFICE-MEETING-ROOMS — place `count` meeting clusters (a table ringed by chairs) evenly
 * around the perimeter-office ring at mid-radius `midR`. Each cluster is a boardroom table
 * with 6 chairs. Angles are spread so clusters never overlap. PURE + deterministic.
 */
export function meetingRooms(midR: number, count: number, startAngle = 0): MeetingRoom[] {
    const out: MeetingRoom[] = [];
    if (count <= 0 || !(midR > 0)) return out;
    const TABLE_W = 2.4, TABLE_L = 1.2, CHAIR = 0.5;
    for (let i = 0; i < count; i++) {
        const a = startAngle + (2 * Math.PI * i) / count;
        const cx = Math.cos(a) * midR, cz = Math.sin(a) * midR;
        const rotY = a + Math.PI / 2;   // long axis tangent to the ring
        const cos = Math.cos(rotY), sin = Math.sin(rotY);
        // Chairs: 3 per long side, offset perpendicular to the table long axis.
        const chairs: PlacedFurniture[] = [];
        const perpX = -sin, perpZ = cos;    // perpendicular to the table long axis
        const alongX = cos, alongZ = sin;
        for (const side of [-1, 1]) {
            for (const t of [-0.7, 0, 0.7]) {
                chairs.push({
                    x: cx + perpX * side * (TABLE_L / 2 + 0.35) + alongX * t,
                    z: cz + perpZ * side * (TABLE_L / 2 + 0.35) + alongZ * t,
                    rotY: rotY + (side === -1 ? Math.PI : 0),
                    width: CHAIR, length: CHAIR,
                });
            }
        }
        out.push({
            table: { x: cx, z: cz, rotY, width: TABLE_W, length: TABLE_L },
            chairs,
            centre: { x: cx, z: cz },
        });
    }
    return out;
}

/** A cafe/breakout cluster: a round table + chairs. */
export interface CafeCluster {
    readonly table: PlacedFurniture;
    readonly chairs: readonly PlacedFurniture[];
}

/**
 * §OFFICE-CAFE — small round cafe tables (4 chairs each) spread around a ring at radius `r`.
 * Used for the ground-floor breakout / cafe zone. PURE + deterministic.
 */
export function cafeClusters(r: number, count: number, startAngle = 0): CafeCluster[] {
    const out: CafeCluster[] = [];
    if (count <= 0 || !(r > 0)) return out;
    const TABLE = 0.9, CHAIR = 0.5;
    for (let i = 0; i < count; i++) {
        const a = startAngle + (2 * Math.PI * i) / count;
        const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
        const chairs: PlacedFurniture[] = [];
        for (let k = 0; k < 4; k++) {
            const ca = (2 * Math.PI * k) / 4;
            chairs.push({
                x: cx + Math.cos(ca) * 0.75,
                z: cz + Math.sin(ca) * 0.75,
                rotY: ca + Math.PI,
                width: CHAIR, length: CHAIR,
            });
        }
        out.push({ table: { x: cx, z: cz, rotY: 0, width: TABLE, length: TABLE }, chairs });
    }
    return out;
}

/**
 * §OFFICE-CORE-WALLS — a SQUARE core enclosure inscribed inside the circular core disc of
 * radius `coreR` (origin-centred). Returns the four corner points (CCW) of a square whose
 * half-side is `coreR / √2` (so the square fits inside the core circle) minus a small inset,
 * plus which edge (index 0 = +Z lobby edge) should host the door. PURE.
 */
export function coreSquare(coreR: number, insetM = 0.2): { corners: Pt2[]; doorEdgeIndex: number } | null {
    if (!(coreR > 1.0)) return null;   // too small to enclose
    const h = Math.max(0.6, (coreR / Math.SQRT2) - insetM);
    const corners: Pt2[] = [
        { x: -h, z: -h },
        { x: h, z: -h },
        { x: h, z: h },
        { x: -h, z: h },
    ];
    // Door on the +X-facing edge (edge index 1: corner[1]→corner[2]) — faces the open-plan lobby.
    return { corners, doorEdgeIndex: 1 };
}

/**
 * §OFFICE-LOBBY — the ground-floor reception zone: a reception desk + a small waiting-seating
 * cluster, placed near the entrance angle (`entranceAngle`, radians) just inside the perimeter
 * circulation ring at radius `r`. The reception desk faces the entrance (inward). PURE.
 */
export function lobbyPlan(r: number, entranceAngle: number): {
    reception: PlacedFurniture;
    seats: readonly PlacedFurniture[];
} {
    const rx = Math.cos(entranceAngle), rz = Math.sin(entranceAngle);
    // Reception desk set back from the glass toward the core, facing the entrance (outward).
    const deskR = Math.max(1.0, r - 3.0);
    const reception: PlacedFurniture = {
        x: rx * deskR, z: rz * deskR,
        rotY: Math.atan2(rx, rz),
        width: 2.4, length: 0.7,
    };
    // A couple of waiting sofas flanking the approach, tangential to the entrance radial.
    const tx = -rz, tz = rx;   // tangent
    const seatR = Math.max(0.8, r - 4.5);
    const seats: PlacedFurniture[] = [
        { x: rx * seatR + tx * 2.2, z: rz * seatR + tz * 2.2, rotY: Math.atan2(rx, rz), width: 1.8, length: 0.8 },
        { x: rx * seatR - tx * 2.2, z: rz * seatR - tz * 2.2, rotY: Math.atan2(rx, rz), width: 1.8, length: 0.8 },
    ];
    return { reception, seats };
}

/**
 * §OFFICE-CEILING-LIGHTS — a regular grid of ceiling downlight points inside the disc of
 * radius `r` (origin-centred), skipping the core keep-out disc [0, coreR]. Capped at `max`.
 * Used to seed downlights on a representative floor. PURE.
 */
export function ceilingLightGrid(r: number, coreR: number, pitchM: number, max: number): Pt2[] {
    const out: Pt2[] = [];
    if (!(r > 0) || pitchM <= 0) return out;
    for (let z = -r + pitchM; z <= r - pitchM; z += pitchM) {
        for (let x = -r + pitchM; x <= r - pitchM; x += pitchM) {
            if (out.length >= max) return out;
            const rr = Math.hypot(x, z);
            if (rr > r - 0.5 || rr < coreR + 0.5) continue;
            out.push({ x, z });
        }
    }
    return out;
}
