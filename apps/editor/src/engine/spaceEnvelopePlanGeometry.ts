/**
 * spaceEnvelopePlanGeometry — the PURE half of the space envelope's plan symbol: closing
 * the authored ring, and clipping a hatch to it.
 *
 * §RESI-STAGE-G (2026-09-05) · C114 §10 · C73 §2.
 *
 * ⛔ NO THREE, NO `@thatopen/components`, NO DOM. `SpaceEnvelopePlanSymbolBuilder` needs
 * all three and therefore cannot be unit-tested cheaply; these two functions decide the
 * only things that can be WRONG rather than merely invisible — whether the ring closes,
 * and whether a hatch bridges a concave notch — so they are separated in order to be
 * pinned by a test.
 */

/** Hatch spacing, metres, at 45°. A drafting convention, not a dimension of the model. */
const HATCH_SPACING_M = 0.6;

/**
 * ⛔ A CEILING ON HATCH LINES PER ROOM. A 200 m × 200 m ring at 0.6 m spacing is ~470
 * lines; a mis-authored ring of 10 km would be 23,000 and would stall the projection.
 * The cap DEGRADES (coarser hatch), it does not drop the room — an area that vanished
 * because it was large is exactly the silent failure this repository keeps logging.
 */
const MAX_HATCH_LINES = 160;

/**
 * The closed ring as segment pairs at height `y`.
 *
 * ⚠ THE CLOSING EDGE IS DRAWN HERE. `SpaceEnvelope.footprint` is an OPEN loop (the schema
 * says so, and its `y === 0` refine is the neighbouring invariant), so every consumer
 * closes it itself — the 3-D builder's `(i + 1) % n` does exactly this. A producer that
 * forgot would draw every room as an open path with one wall missing.
 */
export function ringSegments(
    ring: readonly { readonly x: number; readonly z: number }[],
    y: number,
): number[] {
    const out: number[] = [];
    const n = ring.length;
    // ⛔ FEWER THAN THREE VERTICES BOUNDS NO AREA, so it draws NOTHING rather than the
    // doubled line `A→B→A` that the modulo below would otherwise emit. A doubled stroke
    // is indistinguishable on screen from a real one-sided edge, which is the kind of
    // wrong-but-plausible picture a reviewer cannot catch.
    if (n < 3) return out;
    for (let i = 0; i < n; i += 1) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) continue;
        out.push(a.x, y, a.z, b.x, y, b.z);
    }
    return out;
}

/**
 * A 45° hatch clipped to `ring`, as segment pairs at height `y`.
 *
 * ⭐ SCANLINE IN A ROTATED FRAME, WHICH IS WHY IT IS CONCAVE-SAFE. Each vertex is
 * projected onto two perpendicular axes (u along the 45° direction, v across it); for
 * each v the edge crossings are collected, SORTED, and paired even/odd. An L-shaped room
 * yields two runs on the scanlines that cross its notch, and a naive "min→max" fill would
 * bridge the notch — which is precisely the concave case
 * `assessSpaceEnvelopeContainment` refuses to get wrong one layer up.
 */
export function hatchSegments(
    ring: readonly { readonly x: number; readonly z: number }[],
    y: number,
    spacingM: number = HATCH_SPACING_M,
): number[] {
    const n = ring.length;
    if (n < 3) return [];
    const INV = Math.SQRT1_2;
    const u = (p: { x: number; z: number }): number => (p.x + p.z) * INV;
    const v = (p: { x: number; z: number }): number => (p.x - p.z) * INV;

    let vMin = Infinity; let vMax = -Infinity;
    for (const p of ring) {
        const vv = v(p);
        if (vv < vMin) vMin = vv;
        if (vv > vMax) vMax = vv;
    }
    if (!Number.isFinite(vMin) || !Number.isFinite(vMax) || vMax - vMin < 1e-6) return [];

    // Degrade rather than drop: widen the spacing until the count fits the ceiling.
    let step = spacingM;
    while ((vMax - vMin) / step > MAX_HATCH_LINES) step *= 2;

    const out: number[] = [];
    for (let vv = vMin + step; vv < vMax - 1e-9; vv += step) {
        const crossings: number[] = [];
        for (let i = 0; i < n; i += 1) {
            const a = ring[i]!;
            const b = ring[(i + 1) % n]!;
            const va = v(a);
            const vb = v(b);
            // Half-open test: a vertex exactly on the scanline is counted once, never twice.
            if ((va <= vv && vb > vv) || (vb <= vv && va > vv)) {
                const t = (vv - va) / (vb - va);
                crossings.push(u(a) + t * (u(b) - u(a)));
            }
        }
        if (crossings.length < 2) continue;
        crossings.sort((p, q) => p - q);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
            const u0 = crossings[k]!;
            const u1 = crossings[k + 1]!;
            if (u1 - u0 < 1e-6) continue;
            // Back to world: x = (u + v)/√2, z = (u − v)/√2.
            out.push(
                (u0 + vv) * INV, y, (u0 - vv) * INV,
                (u1 + vv) * INV, y, (u1 - vv) * INV,
            );
        }
    }
    return out;
}
