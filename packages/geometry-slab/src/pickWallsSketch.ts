/**
 * pickWallsSketch — pure (THREE-free, DOM-free) authoring helper for the
 * "Pick Walls" slab mode.
 *
 * §PICK-WALLS-FALLBACK-AT-AUTHORING (C79 §4.3, 2026-08-12)
 *
 * THE DEFECT THIS CLOSES: `SlabPickWallsController.complete()` emitted
 * `HostReferenceEdge`s with NO `fallback`. C79 §4.3 names the consequence
 * exactly: `WallFaceResolver.degrade` → `resolveOrFallback` returns **null**
 * when the host is gone and no fallback was stored, and
 * `SlabDependencyTracker` then keeps the original unresolvable edge — so a
 * wall deleted before any rebuild had cached a fallback left an edge that
 * degrades to NOTHING. The wall's geometry is sitting in the store at the
 * moment the user presses "Create Slab"; shipping the edge without it is a
 * loss of information that was present all along (the same shape as C79 §0).
 *
 * The fallback here is the wall's **centreline at offset 0** — `baseLine`
 * mapped into slab 2D space (x = world.x, y = world.z), which is exactly what
 * `WallFaceResolver.computeSegment` resolves for
 * `reference: 'centerLine', offset: 0` (zero face offset, zero lateral
 * offset). So the stored fallback equals the live resolution at authoring
 * time — the §3.1 traced-frame rule, honoured by construction.
 *
 * A wall whose record cannot be read at authoring time gets NO invented
 * fallback (inventing coordinates would be C79 §2.3's wrong-answer defect);
 * instead it is COUNTED, so the caller can report it rather than absorb it
 * (C79 §2.6 — zero-fallback and all-fallback must not be the same value).
 *
 * Extracted as a pure module (the controller imports THREE/OBC/BUI and cannot
 * run under a Node test) — the same thin-adapter pattern as
 * `RoofRegionTrace.ts` (§ROOF-REGION-SHARED-TRACER).
 */
import type { HostReferenceEdge } from './SketchTypes';

/** Minimal wall shape this helper reads — a subset of WallData. */
export interface PickedWallLike {
    id?: string;
    /** Wall centreline endpoints in world space. Only x/z are read. */
    baseLine?: ReadonlyArray<{ x: number; z: number }> | null;
}

/** Result of {@link buildPickedWallEdges}. */
export interface PickedWallEdgesResult {
    edges: HostReferenceEdge[];
    /** Edges that ship WITH a fallback captured from the live wall geometry. */
    fallbacksPopulated: number;
    /**
     * Edges whose wall record could not be read at authoring time — shipped
     * WITHOUT a fallback (never invented), and counted so the caller can say so.
     */
    fallbacksUnavailable: number;
}

/**
 * Build the pick-walls sketch edges — BYTE-identical in shape to what
 * `SlabPickWallsController.complete()` always emitted
 * (`{ type: 'hostReference', hostId, hostType: 'wall',
 * reference: 'centerLine', offset: 0 }`, the C79 §3.4 canonical shape) — plus
 * the §4.3 `fallback`, populated from the wall's own centreline at authoring
 * time.
 */
export function buildPickedWallEdges(
    pickedWallIds: ReadonlyArray<string>,
    getWallById: (id: string) => PickedWallLike | null | undefined,
): PickedWallEdgesResult {
    const edges: HostReferenceEdge[] = [];
    let fallbacksPopulated = 0;
    let fallbacksUnavailable = 0;

    for (const wallId of pickedWallIds) {
        const edge: HostReferenceEdge = {
            type: 'hostReference',
            hostId: wallId,
            hostType: 'wall',
            reference: 'centerLine',
            offset: 0,
        };

        const wall = getWallById(wallId);
        const p0 = wall?.baseLine?.[0];
        const p1 = wall?.baseLine?.[1];
        if (p0 && p1) {
            // centreline @ offset 0 ⇒ the resolved segment IS the baseLine in
            // slab 2D space (x = world.x, y = world.z) — WallFaceResolver's own
            // documented frame, so live resolution and fallback coincide.
            edge.fallback = {
                start: { x: p0.x, y: p0.z },
                end: { x: p1.x, y: p1.z },
            };
            fallbacksPopulated++;
        } else {
            // No geometry to capture — refuse to invent one (C79 §2.3), count it.
            fallbacksUnavailable++;
        }

        edges.push(edge);
    }

    return { edges, fallbacksPopulated, fallbacksUnavailable };
}
