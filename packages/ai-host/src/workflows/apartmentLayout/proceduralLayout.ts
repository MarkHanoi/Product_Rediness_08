// Apartment Layout — procedural (non-AI) fallback generator (SPEC §10 fallback).
//
// When the live AI relay is unavailable (offline / 401 / over quota), the
// generator must still produce a REAL, shell-fitted layout — not a fixed stub.
// This subdivides the shell's bounding box into program-sized rooms with straight
// partition walls + a door per partition, in the shell's WORLD frame (so it lands
// where the apartment actually is). Pure + deterministic. The real AI handles the
// exact polygon (incl. concave/L shapes) + smarter planning; this is the offline
// demo that proves the build pipeline end-to-end.

import type {
    ScoredLayoutOption,
    LayoutOption,
    LayoutWall,
    LayoutDoor,
    LayoutRoom,
    RoomType,
    ApartmentProgram,
    ApartmentConstraints,
    ScoringWeights,
} from './types.js';
import type { ShellAnalysis } from './shellAnalysis.js';
import { polygonAreaM2 } from './shellAnalysis.js';
import { scoreLayout } from './score.js';
// C73 §3.1 — THE point-in-polygon predicate. This file used to carry its own
// even-odd ray cast; it is the same body, so it delegates. Sibling migrations:
// `tgl/enumerate.ts`, `tgl/subdivide.ts`, `environment/daylightDepthField.ts`.
import { pointInPolygonXZ } from '@pryzm/geometry-kernel';

const M = 1000; // metres → mm (LayoutWall coords are mm; buildLayoutPlan maps /1000 back)
const DOOR_W_MM = 900;

// ── §L-907a HONEST-REGION (2026-08-14) ───────────────────────────────────────
// The strip slicer used to subdivide the shell's BOUNDING BOX unconditionally —
// on a non-rectangular captured footprint that plans rooms OUTSIDE the real
// boundary (measured: 10/18 partition endpoints outside on a T-shell probe).
// Per L-907(a) / C73 §4 refusal doctrine the honest orderings are: plan inside
// the real boundary (the strip slicer cannot consume a polygon); else plan on
// the LARGEST INSCRIBED axis-aligned rectangle WITH DISCLOSURE in the chooser
// summary; else REFUSE with the reason. Silently pretending the site is a
// rectangle is the one forbidden option.

/** Bbox-area ratio above which the perimeter IS the bbox (a rectangle) and the
 *  legacy behaviour is already honest. */
const RECT_AREA_RATIO = 0.98;
/** Rasterisation resolution for the inscribed-rectangle search (cells per
 *  axis). Deterministic; ~0.3 m cells on a 20 m shell. */
const INSCRIBE_GRID = 64;
/** Smallest inscribed rectangle side (m) worth planning rooms into. */
const MIN_INSCRIBED_SIDE_M = 3;

/**
 * Largest inscribed AXIS-ALIGNED rectangle of a simple polygon (world metres,
 * XZ). Deterministic raster method: mark grid cells whose 4 corners + centre
 * all lie inside the polygon (conservative), then run the classic
 * largest-rectangle-in-binary-matrix histogram scan. Approximate to one grid
 * cell — always a SUBSET of the polygon, never an over-claim. Returns null
 * when no cell is fully inside.
 */
export function largestInscribedAxisRect(
    perimeter: ReadonlyArray<{ x: number; z: number }>,
): { x0: number; z0: number; w: number; d: number } | null {
    if (perimeter.length < 3) return null;
    const xs = perimeter.map(p => p.x), zs = perimeter.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const W = maxX - minX, D = maxZ - minZ;
    if (!(W > 0) || !(D > 0)) return null;
    const n = INSCRIBE_GRID;
    const cw = W / n, cd = D / n;

    // inside[r][c] — cell fully inside (4 corners + centre).
    const inside: boolean[][] = [];
    for (let r = 0; r < n; r++) {
        const row: boolean[] = [];
        const z0 = minZ + r * cd, z1 = z0 + cd, zc = z0 + cd / 2;
        for (let c = 0; c < n; c++) {
            const x0 = minX + c * cw, x1 = x0 + cw, xc = x0 + cw / 2;
            row.push(
                pointInPolygonXZ(x0, z0, perimeter) &&
                pointInPolygonXZ(x1, z0, perimeter) &&
                pointInPolygonXZ(x0, z1, perimeter) &&
                pointInPolygonXZ(x1, z1, perimeter) &&
                pointInPolygonXZ(xc, zc, perimeter),
            );
        }
        inside.push(row);
    }

    // Largest rectangle in the binary matrix (histogram-of-heights scan).
    let best = { area: 0, r0: 0, c0: 0, rows: 0, cols: 0 };
    const heights = new Array<number>(n).fill(0);
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) heights[c] = inside[r]![c] ? heights[c]! + 1 : 0;
        // For each column, expand left/right at the limiting height (O(n²) total
        // via a simple stack-free scan — n is 64, cost is trivial and stable).
        for (let c = 0; c < n; c++) {
            const h = heights[c]!;
            if (h === 0) continue;
            let lo = c, hi = c;
            while (lo > 0 && heights[lo - 1]! >= h) lo--;
            while (hi < n - 1 && heights[hi + 1]! >= h) hi++;
            const area = h * (hi - lo + 1);
            if (area > best.area) best = { area, r0: r - h + 1, c0: lo, rows: h, cols: hi - lo + 1 };
        }
    }
    if (best.area === 0) return null;
    return {
        x0: minX + best.c0 * cw,
        z0: minZ + best.r0 * cd,
        w: best.cols * cw,
        d: best.rows * cd,
    };
}

/** Ordered room program → the room types to lay out, longest-lived first. */
function roomProgram(p: ApartmentProgram): RoomType[] {
    const types: RoomType[] = [];
    if (p.entranceHall) types.push('hall');
    if (p.livingRoom) types.push('living');
    types.push('kitchen');
    if (p.openPlanKitchenDining) types.push('dining');
    const beds = Math.max(0, Math.floor(p.bedrooms));
    for (let i = 0; i < beds; i++) types.push(i === 0 && p.masterEnSuite ? 'master' : 'bedroom');
    const baths = Math.max(0, Math.floor(p.bathrooms));
    for (let i = 0; i < baths; i++) types.push('bathroom');
    return types.length >= 2 ? types : ['living', 'bedroom'];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** §L-907a — the honest strip-slicer result: options plus, on the refusal arm,
 *  the NAMED reason (never a silent empty array for a non-degenerate shell). */
export interface ProceduralLayoutResult {
    readonly options: ScoredLayoutOption[];
    /** Set ONLY when the slicer REFUSED (non-rectangular footprint with no
     *  usable inscribed rectangle). Callers must surface it to the user. */
    readonly refusal?: string;
}

/**
 * Generate up to `count` procedural layouts that fit the shell's HONEST planar
 * region (§L-907a): the full shell when the captured perimeter IS a rectangle;
 * else the largest inscribed axis-aligned rectangle, with the disclosure carried
 * in every option summary; else a REFUSAL with the reason. Each option is a set
 * of parallel partition walls (sliced along the longer axis) with a centred door
 * per partition + program-typed rooms chained by those doors.
 */
export function generateProceduralLayoutHonest(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    count: number,
): ProceduralLayoutResult {
    const xs = shell.perimeter.map(p => p.x);
    const zs = shell.perimeter.map(p => p.z);
    let minX = xs.length ? Math.min(...xs) : 0;
    let minZ = zs.length ? Math.min(...zs) : 0;
    let w = shell.widthM;
    let d = shell.depthM;
    // Need a real, sizeable shell — a zero/degenerate shell yields no layout.
    if (!(w >= 1) || !(d >= 1)) return { options: [] };

    // §L-907a — is the captured perimeter actually the bounding box? If not,
    // slicing the bbox plans rooms OUTSIDE the real boundary. Plan on the
    // largest inscribed axis-aligned rectangle WITH DISCLOSURE, or refuse.
    let disclosure = '';
    const polyArea = shell.perimeter.length >= 3 ? polygonAreaM2(shell.perimeter) : 0;
    const bboxArea = w * d;
    if (shell.perimeter.length >= 3 && bboxArea > 0 && polyArea < RECT_AREA_RATIO * bboxArea) {
        const rect = largestInscribedAxisRect(shell.perimeter);
        if (!rect || rect.w < MIN_INSCRIBED_SIDE_M || rect.d < MIN_INSCRIBED_SIDE_M) {
            return {
                options: [],
                refusal:
                    `site footprint is non-rectangular (${polyArea.toFixed(1)} m² inside a ` +
                    `${w.toFixed(1)}×${d.toFixed(1)} m box) and no inscribed rectangle of at least ` +
                    `${MIN_INSCRIBED_SIDE_M}×${MIN_INSCRIBED_SIDE_M} m fits — refusing to plan on an ` +
                    `invented rectangle (L-907a)`,
            };
        }
        minX = rect.x0; minZ = rect.z0; w = rect.w; d = rect.d;
        disclosure = ` — planned on inscribed ${rect.w.toFixed(1)}×${rect.d.toFixed(1)} m rectangle; site is non-rectangular`;
    }

    const sliceAlongX = w >= d;       // slice across the LONGER axis
    const span = sliceAlongX ? w : d; // length we divide into rooms
    const cross = sliceAlongX ? d : w; // partition wall length

    const types = roomProgram(program);
    const n = Math.max(2, types.length);
    const cellM = span / n;
    const variants = Math.max(1, Math.min(count, 2));
    const out: ScoredLayoutOption[] = [];

    for (let v = 0; v < variants; v++) {
        const order = v === 0 ? types : [...types].reverse();
        const walls: LayoutWall[] = [];
        const doors: LayoutDoor[] = [];
        const rooms: LayoutRoom[] = [];

        for (let i = 0; i < n; i++) {
            if (i < n - 1) {
                const posM = (i + 1) * cellM; // distance along span from the min corner
                const wall: LayoutWall = sliceAlongX
                    ? { start: { x: (minX + posM) * M, y: minZ * M }, end: { x: (minX + posM) * M, y: (minZ + cross) * M } }
                    : { start: { x: minX * M, y: (minZ + posM) * M }, end: { x: (minX + cross) * M, y: (minZ + posM) * M } };
                walls.push(wall);
                // Door centred on the partition (offset measured from the wall start).
                doors.push({ wallRef: walls.length - 1, offset: Math.max(0, (cross * M) / 2 - DOOR_W_MM / 2), width: DOOR_W_MM });
            }
            const type = order[i % order.length]!;
            rooms.push({
                name: `${cap(type)} ${i + 1}`,
                type,
                area: cellM * cross,
                windowCount: 1,
                hasDirectAccess: true,
                adjacentTo: [],
            });
        }

        // §L-907c — the slicer's rooms form a LINEAR CHAIN, each pair joined by
        // the door it just emitted on the shared partition. Record that graph on
        // the rooms (adjacentTo + doorAdjacentTo) so the chooser's circulation
        // metric measures the REAL built graph instead of BFS-ing an empty one
        // and reporting a false "~0%".
        for (let i = 0; i < rooms.length; i++) {
            const links: string[] = [];
            if (i > 0) links.push(rooms[i - 1]!.name);
            if (i < rooms.length - 1) links.push(rooms[i + 1]!.name);
            rooms[i]!.adjacentTo = links;
            rooms[i]!.doorAdjacentTo = [...links];
        }

        const opt: LayoutOption = {
            summary: `Procedural ${v === 0 ? 'A' : 'B'} — ${n} rooms (offline demo)${disclosure}`,
            rooms,
            walls,
            doors,
            corridorWidthMin: constraints.minCorridorWidth,
        };
        out.push({ ...opt, score: scoreLayout(opt, weights) });
    }
    return { options: out.slice(0, count) };
}

/**
 * Back-compat array-shaped surface (barrel-exported). Prefer
 * `generateProceduralLayoutHonest` — this wrapper DROPS the refusal reason, so
 * callers that can surface a refusal to the user must not use it.
 */
export function generateProceduralLayout(
    shell: ShellAnalysis,
    program: ApartmentProgram,
    constraints: ApartmentConstraints,
    weights: ScoringWeights,
    count: number,
): ScoredLayoutOption[] {
    return generateProceduralLayoutHonest(shell, program, constraints, weights, count).options;
}
