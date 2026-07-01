// Office furnish — the MODULE RECIPES (SPEC-OFFICE-GENERATION-ENGINE §5/§6/§11).
//
// Each recipe is a PURE function that, given an anchor centre + orientation (+ a size budget), emits
// the CLUSTER of furniture items for one reusable office module (SPEC §5). Composition follows the
// §11 component library — bench desk systems, ergonomic task chairs, monitors, mobile pedestals,
// privacy screens, biophilic planting, amenity pieces — assembled from the EXISTING FurnitureType
// vocabulary (the engine invents NO element types; nearest-existing substitutions are documented in
// ADR-0096). Every item is placed in the origin-centred plan frame (metres, {x,z}); `rotY` (radians)
// rotates the whole cluster so a module snaps to the circulation grid (SPEC §7).
//
// PURE + DETERMINISTIC — zero THREE / DOM / I/O (L2).

import type { PlacedItem, PlacedModule, ModuleMaterial } from './officeModuleTypes.js';
import { itemsBBox, moduleDeskCount } from './officeModuleTypes.js';

// ── Component dimensions (m) — the §11 curated library, kept as named constants. ──────────────
const DESK_W = 1.4;            // bench desk top width (along the row)
const DESK_D = 0.8;            // desk depth
const CHAIR = 0.55;            // task chair footprint
const MONITOR_W = 0.5, MONITOR_D = 0.12;
const PEDESTAL = 0.42;         // mobile storage pedestal
const SCREEN_D = 0.04;         // desktop privacy divider (thin)
const AISLE_BENCH = 1.0;       // back-to-back bench aisle (desk-clearance §7: 900–1200mm)
const DESK_PITCH = 1.6;        // centre-to-centre desks along a row

/** Rotate a LOCAL offset (dx,dz) by `rotY` and translate to the world anchor (cx,cz). */
function place(
    furnitureType: string, material: ModuleMaterial, height: number,
    cx: number, cz: number, rotY: number,
    dx: number, dz: number, localRot: number, width: number, length: number,
): PlacedItem {
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    return {
        furnitureType, material, height,
        x: cx + dx * cos - dz * sin,
        z: cz + dx * sin + dz * cos,
        rotY: rotY + localRot,
        width, length,
    };
}

function toModule(kind: PlacedModule['kind'], cx: number, cz: number, items: PlacedItem[]): PlacedModule {
    return { kind, items, cx, cz, bbox: itemsBBox(items) };
}

/** The desk sub-cluster: desk + task chair + monitor + under-desk pedestal, at a LOCAL offset. */
function deskUnit(cx: number, cz: number, rotY: number, dx: number, dz: number): PlacedItem[] {
    return [
        place('desk', 'wood', 0.74, cx, cz, rotY, dx, dz, 0, DESK_W, DESK_D),
        // Task chair sits on the user side (−Z local), facing the desk.
        place('desk_chair', 'fabric', 1.0, cx, cz, rotY, dx, dz - 0.55, 0, CHAIR, CHAIR),
        // Monitor on the far edge of the desktop (+Z local).
        place('tv', 'metal', 0.45, cx, cz, rotY, dx, dz + DESK_D / 2 - 0.1, 0, MONITOR_W, MONITOR_D),
        // Mobile storage pedestal tucked beside the desk.
        place('bookshelf', 'wood', 0.6, cx, cz, rotY, dx + DESK_W / 2 - PEDESTAL / 2, dz, 0, PEDESTAL, PEDESTAL),
    ];
}

/**
 * §5 SINGLE WORKSTATION — one desk + task chair + monitor + pedestal. The atomic workstation used to
 * top up a zone that can't fit a full row. PURE.
 */
export function singleWorkstation(cx: number, cz: number, rotY = 0): PlacedModule {
    return toModule('single-workstation', cx, cz, deskUnit(cx, cz, rotY, 0, 0));
}

/**
 * §5 LINEAR WORKSTATION — `n` desks in a single row (chair + monitor + pedestal per desk) + a low
 * privacy screen running the row spine. Desks march along the module's local +X from the anchor.
 * PURE + deterministic.
 */
export function linearWorkstation(cx: number, cz: number, n: number, rotY = 0): PlacedModule {
    const count = Math.max(1, Math.floor(n));
    const items: PlacedItem[] = [];
    const rowLen = (count - 1) * DESK_PITCH;
    const x0 = -rowLen / 2;
    for (let i = 0; i < count; i++) items.push(...deskUnit(cx, cz, rotY, x0 + i * DESK_PITCH, 0));
    // Privacy screen along the far edge of the row (SPEC §11 desktop dividers).
    items.push(place('wall_art', 'glass', 0.5, cx, cz, rotY, 0, DESK_D / 2 + 0.02, 0, rowLen + DESK_W, SCREEN_D));
    return toModule('linear-workstation', cx, cz, items);
}

/**
 * §5 BENCH WORKSTATION — TWO rows of `n` desks BACK-TO-BACK sharing a central spine (power/cable
 * tray) + a screen down the spine (SPEC §11 bench system). Row A faces −Z, row B faces +Z, separated
 * by the bench aisle. PURE + deterministic.
 */
export function benchWorkstation(cx: number, cz: number, n: number, rotY = 0): PlacedModule {
    const count = Math.max(1, Math.floor(n));
    const items: PlacedItem[] = [];
    const rowLen = (count - 1) * DESK_PITCH;
    const x0 = -rowLen / 2;
    const rowOff = AISLE_BENCH / 2 + DESK_D / 2;
    for (let i = 0; i < count; i++) {
        // Row A (near the spine on +Z, user faces +Z outward).
        items.push(...deskUnit(cx, cz, rotY, x0 + i * DESK_PITCH, rowOff));
        // Row B mirrored across the spine (rotated 180° so its user faces −Z outward).
        items.push(...deskUnit(cx, cz, rotY + Math.PI, x0 + i * DESK_PITCH, rowOff));
    }
    // Shared spine screen down the centre (the back-to-back divider).
    items.push(place('wall_art', 'glass', 0.55, cx, cz, rotY, 0, 0, 0, rowLen + DESK_W, SCREEN_D));
    // A biophilic floor planter capping each end of the bench (SPEC §11 signature planting).
    items.push(place('plant_02', 'fabric', 1.4, cx, cz, rotY, x0 - DESK_PITCH * 0.6, 0, 0, 0.6, 0.6));
    items.push(place('plant_02', 'fabric', 1.4, cx, cz, rotY, -x0 + DESK_PITCH * 0.6, 0, 0, 0.6, 0.6));
    return toModule('bench-workstation', cx, cz, items);
}

/**
 * §5 COLLABORATIVE BLOCK — a sofa L + coffee table + wall screen + whiteboard + plants: an informal
 * collaboration corner. PURE.
 */
export function collaborativeBlock(cx: number, cz: number, rotY = 0): PlacedModule {
    const items: PlacedItem[] = [
        place('sofa_3seat', 'fabric', 0.8, cx, cz, rotY, -0.9, -0.9, 0, 2.2, 0.9),
        place('sofa_2seat', 'fabric', 0.8, cx, cz, rotY, 1.0, 0.2, Math.PI / 2, 1.6, 0.9),
        place('coffee_table', 'wood', 0.4, cx, cz, rotY, 0, 0, 0, 1.0, 0.6),
        place('tv', 'metal', 1.2, cx, cz, rotY, -0.9, 1.4, 0, 1.2, 0.1),          // wall screen
        place('wall_art', 'metal', 1.2, cx, cz, rotY, 0.9, 1.4, 0, 1.2, 0.05),    // whiteboard
        place('plant_04', 'fabric', 1.6, cx, cz, rotY, 1.9, 1.3, 0, 0.6, 0.6),
        place('plant_01', 'fabric', 0.5, cx, cz, rotY, 0.6, -0.3, 0, 0.3, 0.3),   // desktop plant
    ];
    return toModule('collaborative-block', cx, cz, items);
}

/**
 * §5 MEETING ROOM BLOCK — a boardroom table ringed by `seats` chairs (3 per long side default) + a
 * wall TV + whiteboard + a storage credenza. Sized to fit an enclosed meeting room. PURE.
 */
export function meetingRoomBlock(cx: number, cz: number, seatsPerSide = 3, rotY = 0): PlacedModule {
    const perSide = Math.max(1, Math.floor(seatsPerSide));
    const TABLE_W = Math.max(1.6, perSide * 0.7), TABLE_D = 1.1;
    const items: PlacedItem[] = [
        place('table', 'wood', 0.74, cx, cz, rotY, 0, 0, 0, TABLE_W, TABLE_D),
    ];
    const spread = TABLE_W / (perSide + 1);
    for (let s = 0; s < perSide; s++) {
        const lx = -TABLE_W / 2 + spread * (s + 1);
        items.push(place('chair', 'fabric', 0.9, cx, cz, rotY, lx, TABLE_D / 2 + 0.35, 0, CHAIR, CHAIR));
        items.push(place('chair', 'fabric', 0.9, cx, cz, rotY, lx, -(TABLE_D / 2 + 0.35), Math.PI, CHAIR, CHAIR));
    }
    items.push(place('tv', 'metal', 1.4, cx, cz, rotY, TABLE_W / 2 + 0.4, 0, Math.PI / 2, 1.4, 0.1));   // presentation TV
    items.push(place('wall_art', 'metal', 1.2, cx, cz, rotY, 0, TABLE_D / 2 + 0.7, 0, 1.6, 0.05));      // whiteboard
    items.push(place('sideboard', 'wood', 0.75, cx, cz, rotY, -(TABLE_W / 2 + 0.4), 0, Math.PI / 2, 1.4, 0.45)); // storage
    return toModule('meeting-room-block', cx, cz, items);
}

/**
 * §5 EXECUTIVE OFFICE — a large desk + task chair + two visitor chairs + a storage credenza + a small
 * round meeting table with chairs. Fills a glazed enclosure (SPEC §6). PURE.
 */
export function executiveOffice(cx: number, cz: number, rotY = 0): PlacedModule {
    const items: PlacedItem[] = [
        place('desk', 'wood', 0.74, cx, cz, rotY, 0, 0.8, 0, 1.8, 0.9),
        place('desk_chair', 'fabric', 1.0, cx, cz, rotY, 0, 1.5, 0, CHAIR, CHAIR),
        place('chair', 'fabric', 0.9, cx, cz, rotY, -0.6, 0, Math.PI, CHAIR, CHAIR),   // visitor
        place('chair', 'fabric', 0.9, cx, cz, rotY, 0.6, 0, Math.PI, CHAIR, CHAIR),    // visitor
        place('sideboard', 'wood', 0.75, cx, cz, rotY, 1.4, 0.8, Math.PI / 2, 1.4, 0.45),
        // Small meeting table + two chairs at the front of the office.
        place('coffee_table', 'wood', 0.5, cx, cz, rotY, -1.2, -1.4, 0, 1.0, 0.7),
        place('chair', 'fabric', 0.9, cx, cz, rotY, -1.2, -0.9, Math.PI, CHAIR, CHAIR),
        place('chair', 'fabric', 0.9, cx, cz, rotY, -1.2, -1.9, 0, CHAIR, CHAIR),
        place('plant_03', 'fabric', 1.5, cx, cz, rotY, 1.4, -1.4, 0, 0.5, 0.5),
    ];
    return toModule('executive-office', cx, cz, items);
}

/**
 * §5 PHONE BOOTH — an acoustic pod: a compact desk + a task chair + a task lamp. Fits inside a small
 * glazed focus enclosure (SPEC §6). PURE.
 */
export function phoneBooth(cx: number, cz: number, rotY = 0): PlacedModule {
    const items: PlacedItem[] = [
        place('desk', 'wood', 0.74, cx, cz, rotY, 0, 0.3, 0, 1.0, 0.5),
        place('desk_chair', 'fabric', 1.0, cx, cz, rotY, 0, -0.25, 0, CHAIR, CHAIR),
        place('lamp', 'metal', 0.5, cx, cz, rotY, 0.35, 0.4, 0, 0.2, 0.2),
    ];
    return toModule('phone-booth', cx, cz, items);
}

/**
 * §5 KITCHEN BLOCK — a base-cabinet run (cabinetry) + island + high table with stools + coffee /
 * fridge / microwave appliances. Fills the kitchenette support room. PURE.
 */
export function kitchenBlock(cx: number, cz: number, rotY = 0): PlacedModule {
    const items: PlacedItem[] = [
        place('kitchen_straight', 'wood', 0.9, cx, cz, rotY, 0, 1.4, 0, 3.0, 0.6),   // cabinetry run
        place('kitchen_island', 'wood', 0.9, cx, cz, rotY, 0, 0, 0, 2.0, 0.9),       // island
        place('fridge', 'metal', 1.8, cx, cz, rotY, -1.6, 1.4, 0, 0.7, 0.6),
        place('base_unit', 'metal', 0.9, cx, cz, rotY, 1.4, 1.4, 0, 0.6, 0.6),       // coffee/microwave counter
        // High table + stools (breakout counter).
        place('table', 'wood', 1.05, cx, cz, rotY, 0, -1.6, 0, 1.6, 0.7),
        place('chair', 'fabric', 0.75, cx, cz, rotY, -0.5, -2.1, 0, 0.45, 0.45),
        place('chair', 'fabric', 0.75, cx, cz, rotY, 0.5, -2.1, 0, 0.45, 0.45),
        place('plant_05', 'fabric', 1.4, cx, cz, rotY, 1.6, -1.6, 0, 0.5, 0.5),
    ];
    return toModule('kitchen-block', cx, cz, items);
}

/**
 * §5 BREAKOUT BLOCK — sofas + lounge chairs + coffee tables + planting: a lounge/breakout zone. The
 * amenity counterpart to the collaborative block, sized larger. PURE.
 */
export function breakoutBlock(cx: number, cz: number, rotY = 0): PlacedModule {
    const items: PlacedItem[] = [
        place('sofa_3seat', 'fabric', 0.8, cx, cz, rotY, 0, -1.2, 0, 2.2, 0.9),
        place('lounge_chair', 'fabric', 0.8, cx, cz, rotY, -1.3, 0.3, Math.PI / 3, 0.9, 0.9),
        place('lounge_chair', 'fabric', 0.8, cx, cz, rotY, 1.3, 0.3, -Math.PI / 3, 0.9, 0.9),
        place('coffee_table', 'wood', 0.4, cx, cz, rotY, 0, -0.2, 0, 1.1, 0.6),
        place('side_table', 'wood', 0.5, cx, cz, rotY, 1.6, -1.2, 0, 0.4, 0.4),
        place('plant_06', 'fabric', 1.7, cx, cz, rotY, -1.9, -1.2, 0, 0.7, 0.7),
        place('plant_07', 'fabric', 1.5, cx, cz, rotY, 1.9, 0.9, 0, 0.6, 0.6),
    ];
    return toModule('breakout-block', cx, cz, items);
}

/** Convenience: the desk count a module contributes (workstation modules only). */
export function moduleDesks(m: PlacedModule): number {
    return moduleDeskCount(m.kind, m.items);
}
