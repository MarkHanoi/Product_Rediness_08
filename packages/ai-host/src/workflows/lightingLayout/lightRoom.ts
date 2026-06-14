// D-LE — per-room lighting placement.
//
// Pure + deterministic. Emits:
//   - ONE ceiling fixture (the first archetype item with mount === 'ceiling'
//     whose `minAreaM2` threshold the room meets), centred on the centroid
//     at ceiling Y.
//   - ZERO OR MORE wall-mount fixtures (every archetype item with
//     mount === 'wall' whose `minAreaM2` threshold the room meets), each at
//     centroid XZ + vanity Y (levelElevation + WALL_FIXTURE_Y), ceilingMounted
//     false. The centroid XZ is a placeholder — proper vanity-wall snapping
//     comes with the bathroom D-FLE integration (F1.6').
//
// Rooms with no archetype (e.g. 'unknown') return [].
//
// Future extensions (not in MVP):
//   - Multiple downlights laid out on a regular grid for rooms > 30 m².
//   - Wall sconces beside bedroom doors / living-room mirrors.
//   - Vanity-wall detection for mirror_light XZ snapping.

import { archetypeForLighting } from './archetypes.js';
import type { LightRoomInput, PlacedLight, Pt } from './types.js';

const DEFAULT_CEILING_H = 2.7;
/** Standard vanity / mirror-light mounting height above finished floor (m). */
const WALL_FIXTURE_Y    = 1.8;
/** §CEILING-GRID (generative-quality polish, 2026-06-14) — one ceiling downlight per
 *  ~this many m², so a large room is evenly lit instead of by a single central fixture
 *  (the founder's "proper lighting"; the documented MVP extension). Tuned so a typical
 *  bedroom (~12 m²) keeps ONE light and a 30 m² living room gets ~2-3. */
const CEIL_AREA_PER_LIGHT_M2 = 12;
/** Hard cap on ceiling downlights per room (a sane ceiling for a very large space). */
const CEIL_MAX_LIGHTS        = 6;
/** Keep grid fixtures this far off the room walls (m) so a downlight never sits on a wall. */
const CEIL_WALL_INSET_M      = 0.6;
/** §MORE-LIGHTING (#11) — how far a corner floor lamp insets from the room
 *  bounding-box corner so its body sits clear of the walls (m). */
const FLOOR_LAMP_INSET  = 0.45;

/**
 * §MORE-LIGHTING (#11) — the room's bounding-box corners, inset by FLOOR_LAMP_INSET,
 * ordered by distance from the centroid DESCENDING (the most "corner-y" first) then
 * by lower x, then z — fully deterministic. A floor lamp seats in one of these.
 */
function cornerSeats(input: LightRoomInput): Pt[] {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of input.polygon) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const i = FLOOR_LAMP_INSET;
    const corners: Pt[] = [
        { x: x0 + i, z: z0 + i }, { x: x1 - i, z: z0 + i },
        { x: x1 - i, z: z1 - i }, { x: x0 + i, z: z1 - i },
    ];
    const cx = input.centroid.x, cz = input.centroid.z;
    const d2 = (p: Pt): number => (p.x - cx) * (p.x - cx) + (p.z - cz) * (p.z - cz);
    return [...corners].sort((a, b) => (d2(b) - d2(a)) || (a.x - b.x) || (a.z - b.z));
}

/** Even-odd point-in-polygon (room polygon, plan XZ). */
function pointInPoly(px: number, pz: number, poly: readonly Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i]!.x, zi = poly[i]!.z, xj = poly[j]!.x, zj = poly[j]!.z;
        if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / ((zj - zi) || 1e-30) + xi)) inside = !inside;
    }
    return inside;
}

/**
 * §CEILING-GRID — ceiling-fixture seats for a room: ONE centred fixture for a small
 * room (≤ ~1.5× the per-light area → byte-identical to the pre-grid MVP), else an
 * area-scaled, aspect-matched grid centred in the room's wall-inset bbox, filtered to
 * points actually inside the room polygon (so an L/T room never lights a notch). Pure +
 * deterministic. Falls back to the centroid if the inset/polygon filter leaves no seat.
 */
function ceilingGridSeats(polygon: readonly Pt[], centroid: Pt, areaM2: number): Pt[] {
    const n = Math.max(1, Math.min(CEIL_MAX_LIGHTS, Math.round(areaM2 / CEIL_AREA_PER_LIGHT_M2)));
    if (n <= 1) return [centroid];                       // small room — centred (byte-identical)

    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of polygon) { x0 = Math.min(x0, p.x); z0 = Math.min(z0, p.z); x1 = Math.max(x1, p.x); z1 = Math.max(z1, p.z); }
    const ix0 = x0 + CEIL_WALL_INSET_M, ix1 = x1 - CEIL_WALL_INSET_M;
    const iz0 = z0 + CEIL_WALL_INSET_M, iz1 = z1 - CEIL_WALL_INSET_M;
    if (ix1 <= ix0 || iz1 <= iz0) return [centroid];     // too small to inset → centred

    // Aspect-matched grid: more columns along the longer axis.
    const aspect = (ix1 - ix0) / Math.max(1e-6, iz1 - iz0);
    const rows = Math.max(1, Math.round(Math.sqrt(n / Math.max(1e-6, aspect))));
    const cols = Math.max(1, Math.ceil(n / rows));

    const seats: Pt[] = [];
    for (let r = 0; r < rows && seats.length < n; r++) {
        for (let c = 0; c < cols && seats.length < n; c++) {
            const x = cols === 1 ? (ix0 + ix1) / 2 : ix0 + ((c + 0.5) / cols) * (ix1 - ix0);
            const z = rows === 1 ? (iz0 + iz1) / 2 : iz0 + ((r + 0.5) / rows) * (iz1 - iz0);
            if (pointInPoly(x, z, polygon)) seats.push({ x, z });
        }
    }
    return seats.length > 0 ? seats : [centroid];        // notch-only fallback
}

export function lightRoom(input: LightRoomInput): readonly PlacedLight[] {
    const arch = archetypeForLighting(input.occupancy);
    if (!arch || arch.items.length === 0) return [];

    const ceilY = typeof input.ceilingY === 'number'
        ? input.ceilingY
        : input.levelElevation + DEFAULT_CEILING_H;

    const out: PlacedLight[] = [];

    // First-fit ceiling pick (default mount is 'ceiling' when unset).
    const ceilingItem = arch.items.find(it =>
        (it.mount ?? 'ceiling') === 'ceiling' && input.areaM2 >= it.minAreaM2,
    );
    if (ceilingItem) {
        // §CEILING-GRID — one centred fixture for a small room (byte-identical), an
        // area-scaled centred grid for a larger room so it is evenly lit (the founder's
        // "proper lighting"). Each seat is the SAME ceiling fixture kind at ceiling Y.
        for (const seat of ceilingGridSeats(input.polygon, input.centroid, input.areaM2)) {
            out.push({
                kind: ceilingItem.kind,
                origin: { x: seat.x, y: ceilY, z: seat.z },
                roomId: input.roomId,
                ceilingMounted: true,
            });
        }
    }

    // Every eligible wall-mount item — emitted IN ADDITION to the ceiling pick.
    const wallY = input.levelElevation + WALL_FIXTURE_Y;
    for (const it of arch.items) {
        if (it.mount !== 'wall') continue;
        if (input.areaM2 < it.minAreaM2) continue;
        out.push({
            kind: it.kind,
            origin: { x: input.centroid.x, y: wallY, z: input.centroid.z },
            roomId: input.roomId,
            ceilingMounted: false,
        });
    }

    // §MORE-LIGHTING (#11) — FLOOR lamps seated in the room's far corners (at floor
    // level), emitted IN ADDITION to the ceiling + wall picks. `count` lamps (default
    // 1) are spread across the corners FARTHEST from the centroid, deterministically.
    // Each successive floor item takes the next-farthest free corner so two living-
    // room lamps land in DIFFERENT corners. Pure — no RNG, no collision (floor lamps
    // are small accents; the furniture engine owns floor circulation).
    const seats = cornerSeats(input);
    let seatIx = 0;
    for (const it of arch.items) {
        if (it.mount !== 'floor') continue;
        if (input.areaM2 < it.minAreaM2) continue;
        const n = it.count ?? 1;
        for (let k = 0; k < n; k++) {
            const seat = seats[seatIx % Math.max(1, seats.length)] ?? input.centroid;
            seatIx++;
            out.push({
                kind: it.kind,
                origin: { x: seat.x, y: input.levelElevation, z: seat.z },
                roomId: input.roomId,
                ceilingMounted: false,
            });
        }
    }

    return out;
}
