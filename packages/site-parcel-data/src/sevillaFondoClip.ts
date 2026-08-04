// §SEVILLA-FONDO-CLIP — clip a parcel ring against the nearest published `fondo máximo edificable`
// (maximum buildable depth) line, in scene-XZ metres.
//
// WHAT THIS IS, AND ITS ONE NAMED SIMPLIFICATION
// ─────────────────────────────────────────────────────────────────────────────────────────────
// Art. 12.5.6 (SB, PGOU Sevilla 2006) states the buildable depth as a LINE on the official
// planning drawings, not a scalar metres figure — confirmed live as real ArcGIS polyline geometry
// (`resolveSevillaAlignments.ts`, layer `A_INTERIOR-MAXIMA`). This function performs the clip Art.
// 12.5.6's own wording describes: keep the part of the parcel on the STREET (front) side of the
// line, discard the rest.
//
// ⚠ THE ONE NAMED SIMPLIFICATION: a published `A_INTERIOR-MAXIMA` feature can carry more than two
// vertices (a bent line following an irregular block). This function clips against the CHORD from
// the line's first to its last vertex — a single straight cut, not the full polyline. For the
// typical case (a depth line spanning one parcel's frontage) the chord and the polyline are
// nearly identical; for a line spanning a long, curved block frontage the chord under-fits. This
// is documented, not hidden, and is the honest reason a future pass might clip against the full
// polyline (Sutherland–Hodgman against N edges) instead of one.
//
// PURITY: L2-pure (C58 §1.9) — no I/O, no THREE, no DOM, no clock, no RNG. Deterministic.

/** A point in scene-XZ metres — the LTP-ENU frame every parcel ring in this repo already uses. */
export interface FondoClipPt {
    readonly x: number;
    readonly z: number;
}

/**
 * Clip `parcelRing` to the side of the chord `(fondoLine[0] → fondoLine[fondoLine.length-1])` that
 * contains `keepSideRef` (typically the midpoint of the parcel's `front`-classified edge — the
 * street side, per Art. 12.5.6's own "measured from the front" framing).
 *
 * Sutherland–Hodgman, ONE clip edge. Returns `null` when:
 *   - `fondoLine` has fewer than 2 distinct points (cannot define a line), or
 *   - the clip removes every vertex (the line does not actually cross the parcel — e.g. resolved
 *     to a neighbouring parcel's own depth line), or
 *   - the result has fewer than 3 vertices (degenerate — never returned as a "footprint").
 */
export function clipParcelByFondoLine(
    parcelRing: ReadonlyArray<FondoClipPt>,
    fondoLine: ReadonlyArray<FondoClipPt>,
    keepSideRef: FondoClipPt,
): FondoClipPt[] | null {
    if (parcelRing.length < 3 || fondoLine.length < 2) return null;
    const a = fondoLine[0]!;
    const b = fondoLine[fondoLine.length - 1]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.abs(dx) < 1e-9 && Math.abs(dz) < 1e-9) return null; // degenerate chord

    // Signed "cross" side of a point relative to the directed line a→b. Positive on one side,
    // negative on the other; the sign of `keepSideRef` decides which side survives.
    const side = (p: FondoClipPt): number => dx * (p.z - a.z) - dz * (p.x - a.x);
    const keepSign = Math.sign(side(keepSideRef)) || 1;

    const out: FondoClipPt[] = [];
    const n = parcelRing.length;
    for (let i = 0; i < n; i++) {
        const cur = parcelRing[i]!;
        const next = parcelRing[(i + 1) % n]!;
        const curInside = Math.sign(side(cur)) === keepSign || side(cur) === 0;
        const nextInside = Math.sign(side(next)) === keepSign || side(next) === 0;

        if (curInside) out.push(cur);
        if (curInside !== nextInside) {
            const sCur = side(cur);
            const sNext = side(next);
            const denom = sCur - sNext;
            if (Math.abs(denom) > 1e-9) {
                const t = sCur / denom;
                out.push({ x: cur.x + t * (next.x - cur.x), z: cur.z + t * (next.z - cur.z) });
            }
        }
    }
    return out.length >= 3 ? out : null;
}

/**
 * Pick the fondo line whose midpoint is CLOSEST to the parcel centroid — the resolver may return
 * more than one nearby line (e.g. an adjoining parcel's own depth line within the search radius),
 * and only the nearest one is honestly attributable to THIS parcel.
 */
export function nearestFondoLine<T extends { readonly path: ReadonlyArray<readonly [number, number]> }>(
    lines: readonly T[],
    project: (lon: number, lat: number) => FondoClipPt,
    parcelCentroid: FondoClipPt,
): { readonly line: T; readonly projected: FondoClipPt[] } | null {
    let best: { line: T; projected: FondoClipPt[]; distSq: number } | null = null;
    for (const line of lines) {
        if (line.path.length < 2) continue;
        const projected = line.path.map(([lon, lat]) => project(lon, lat));
        const mx = projected.reduce((s, p) => s + p.x, 0) / projected.length;
        const mz = projected.reduce((s, p) => s + p.z, 0) / projected.length;
        const distSq = (mx - parcelCentroid.x) ** 2 + (mz - parcelCentroid.z) ** 2;
        if (!best || distSq < best.distSq) best = { line, projected, distSq };
    }
    return best ? { line: best.line, projected: best.projected } : null;
}
