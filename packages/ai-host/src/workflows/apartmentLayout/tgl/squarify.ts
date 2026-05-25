// TGL P3a — squarified treemap (Bruls, Huizing & van Wijk 2000).
//
// Packs items (by area) into a rectangle so each cell's aspect ratio is as close
// to 1 as possible — i.e. rooms come out as sensible near-square rectangles, NOT
// the thin full-depth strips the naive slicer produced. Deterministic + pure.
// Cells exactly tile the bounds (areas scaled to fill). Coordinates: metres {x,z}.

import type { Rect } from './rectDecomposition.js';

export interface AreaItem { readonly id: string; readonly area: number }
export interface PlacedItem { readonly id: string; readonly rect: Rect }

const w = (r: Rect): number => r.x1 - r.x0;
const h = (r: Rect): number => r.z1 - r.z0;

/** Worst (largest) aspect ratio in a row of cell-areas laid along `side`. */
function worstRatio(row: readonly number[], rowSum: number, side: number): number {
    if (rowSum <= 0 || side <= 0 || row.length === 0) return Infinity;
    let max = -Infinity, min = Infinity;
    for (const a of row) { if (a > max) max = a; if (a < min) min = a; }
    const s2 = rowSum * rowSum, side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
}

/**
 * Squarified treemap of `items` into `bounds`. Item areas are scaled to fill the
 * bounds exactly; returns one PlacedItem per item (input order preserved in id
 * mapping, not necessarily spatial order). Empty/degenerate input → [].
 */
export function squarify(bounds: Rect, items: readonly AreaItem[]): PlacedItem[] {
    const boundsArea = w(bounds) * h(bounds);
    const totalArea = items.reduce((s, i) => s + Math.max(0, i.area), 0);
    if (boundsArea <= 0 || totalArea <= 0 || items.length === 0) return [];

    const scale = boundsArea / totalArea;
    const scaled = items.map(i => ({ id: i.id, area: Math.max(0, i.area) * scale }));

    const out: PlacedItem[] = [];
    let free: Rect = bounds;
    let i = 0;
    while (i < scaled.length) {
        const fw = w(free), fh = h(free);
        const side = Math.min(fw, fh);
        if (side <= 0) break;

        // Greedily extend the row while it improves (lowers) the worst ratio.
        const rowAreas: number[] = [scaled[i]!.area];
        let rowSum = scaled[i]!.area;
        let j = i + 1;
        while (j < scaled.length) {
            const cand = [...rowAreas, scaled[j]!.area];
            const candSum = rowSum + scaled[j]!.area;
            if (worstRatio(cand, candSum, side) <= worstRatio(rowAreas, rowSum, side)) {
                rowAreas.push(scaled[j]!.area); rowSum = candSum; j++;
            } else break;
        }

        const thickness = rowSum / side;   // depth of the row strip
        if (fw <= fh) {
            // lay the row left→right across the top; strip height = thickness
            let x = free.x0;
            for (let k = i; k < j; k++) {
                const cw = scaled[k]!.area / thickness;
                out.push({ id: scaled[k]!.id, rect: { x0: x, z0: free.z0, x1: x + cw, z1: free.z0 + thickness } });
                x += cw;
            }
            free = { x0: free.x0, z0: free.z0 + thickness, x1: free.x1, z1: free.z1 };
        } else {
            // lay the row bottom→top down the left; strip width = thickness
            let z = free.z0;
            for (let k = i; k < j; k++) {
                const ch = scaled[k]!.area / thickness;
                out.push({ id: scaled[k]!.id, rect: { x0: free.x0, z0: z, x1: free.x0 + thickness, z1: z + ch } });
                z += ch;
            }
            free = { x0: free.x0 + thickness, z0: free.z0, x1: free.x1, z1: free.z1 };
        }
        i = j;
    }
    return out;
}
