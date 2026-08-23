/**
 * GraphPreviewSubject — what a 3-D NODE-LINK diagram looks like to the shared
 * preview renderer.
 *
 * Layer Affected:  UI (L7) · `apps/editor/src/ui/element-preview/`
 * ADR:             ADR-0364 §3.4
 * Issue log:       L-8440 · L-8441
 * SPEC:            docs/03-execution/specs/SPEC-ANALYSIS-RELATIONSHIP-GRAPH-3D.md §3.4
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS LIVES BESIDE THE ELEMENT PREVIEW AND NOT IN `ui/analysis/`
 * ═════════════════════════════════════════════════════════════════════════════
 * Because the renderer does, and there must be exactly ONE of those. Browsers cap
 * live WebGL contexts (commonly 8–16) and silently kill the OLDEST when a new one
 * is created — in this application the oldest is THE MAIN VIEWPORT. The standing
 * constraint on all of this work is *"don't compromise graphics"*, and the
 * founder is on WebGL with nothing beneath it.
 *
 * So the Analysis surface does not get its own renderer. It describes what it
 * wants drawn in these plain, THREE-free terms and hands them to
 * `ElementPreviewRenderer`, exactly as the opening showroom does.
 *
 * ⛔ NO THREE TYPE APPEARS IN THIS FILE, and none crosses back: the renderer
 * returns projected SCREEN positions, so hit-testing and labels are plain 2-D
 * over the blit. That is what keeps the widget layer free of P2 exposure — and
 * it is also better output, because text drawn into a 2-D canvas at full device
 * resolution stays crisp where an in-scene sprite would not.
 */

/** One node. `p` is in a CENTRED UNIT-ISH CUBE — see {@link normaliseToCube}. */
export interface GraphNodeMark {
    /** The element id. Returned verbatim in the projection readback. */
    readonly id: string;
    readonly p: readonly [number, number, number];
    /** Radius in the same units as `p`. Driven by degree × the node-size control. */
    readonly r: number;
    /** CSS colour string, already resolved by the caller from the brand tokens. */
    readonly colour: string;
    /**
     * 0..1. Dormant nodes draw at low alpha and STAY ON SCREEN — the emphasis
     * rule `seriesFocus.ts` states, applied to the 3-D picture. Nothing is
     * removed, so every count on the card remains true.
     */
    readonly alpha: number;
}

/** One relation. Endpoints are positions, not ids: the renderer never re-looks-up. */
export interface GraphLinkMark {
    readonly a: readonly [number, number, number];
    readonly b: readonly [number, number, number];
    readonly colour: string;
    readonly alpha: number;
}

export interface GraphSubject {
    /**
     * Rebuild key. ⚠ MUST start with `graph:` so it can never collide with an
     * opening-showroom subject key — the two share one `builtKey` slot in the
     * renderer, and a collision would draw one subject under the other's identity.
     */
    readonly key: string;
    readonly nodes: readonly GraphNodeMark[];
    readonly links: readonly GraphLinkMark[];
    /** Short line under the canvas. What the reader is looking at. */
    readonly caption: string;
}

/**
 * Map layout coordinates (`0..extent[k]`, the convention `forceLayoutND` emits)
 * into a cube centred on the origin with a half-extent of 1.
 *
 * ⭐ ONE SCALE FACTOR FOR ALL THREE AXES, deliberately. Normalising each axis
 * independently would stretch the cloud to fill a box and DESTROY the only thing
 * a force layout's geometry means: relative distance. Two nodes twice as far
 * apart must still look twice as far apart after normalisation.
 *
 * ⚠ An empty or degenerate cloud returns the origin rather than dividing by zero.
 */
export function normaliseToCube(
    positions: ReadonlyMap<string, readonly [number, number, number]>,
): Map<string, readonly [number, number, number]> {
    const out = new Map<string, readonly [number, number, number]>();
    if (positions.size === 0) return out;

    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const p of positions.values()) {
        for (let k = 0; k < 3; k++) {
            if (p[k]! < lo[k]!) lo[k] = p[k]!;
            if (p[k]! > hi[k]!) hi[k] = p[k]!;
        }
    }
    const span = Math.max(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!);
    const scale = span > 1e-6 ? 2 / span : 0;
    const mid: [number, number, number] = [
        (hi[0]! + lo[0]!) / 2,
        (hi[1]! + lo[1]!) / 2,
        (hi[2]! + lo[2]!) / 2,
    ];
    for (const [id, p] of positions) {
        out.set(id, [
            (p[0]! - mid[0]!) * scale,
            (p[1]! - mid[1]!) * scale,
            (p[2]! - mid[2]!) * scale,
        ] as const);
    }
    return out;
}
