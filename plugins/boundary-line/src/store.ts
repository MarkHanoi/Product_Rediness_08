// BoundaryLineStore — the boundary line's ONE authority.
// §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7910) · C106 §1 · C84 EI-1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS FAMILY HAS EXACTLY ONE STORE, AND THAT IS A DELIBERATE DEPARTURE.
// ═══════════════════════════════════════════════════════════════════════════════
//
// C84 §1 measures FIVE rival representations per element family, and rows 2 and 3 —
// the plugin DTO store and the legacy geometry store — are the pair that keeps
// diverging. `plugins/wall/src/handlers/MoveWall.ts` REFUSES `wall.move` in its own
// words because *"it writes the detached plugin wall store that nothing renders,
// exports or persists"*, and `elementMove.ts` had to mint DISTINCT verb names
// (`slab.movePolygon`, `handrail.moveBaseLine`) so plugin handlers could not shadow
// the ones that reach the real store.
//
// A NEW family does not have to inherit that. `boundaryLine` has exactly one store —
// this one — built once by `PluginRegistry` and reachable at `runtime.stores.boundaryLine`.
// There is no geometry twin to drift from, so C84 EI-1 ("one authority per family,
// and it is NAMED") holds by construction rather than by discipline.
//
// ⚠ THE CLAIM IS CHECKED, NOT ASSERTED. `boundaryLineHasOneStore.test.ts` greps the
// repository for a second `class .*BoundaryLineStore` and for a `window.boundaryLineStore`
// assignment, and fails on either. A claim of singularity that nothing measures is
// exactly the kind of prose this repository keeps finding to be stale.
//
// ─── WHAT LIVES HERE AND WHAT DOES NOT (C03 §3.2 — one owner per slice) ────────
// The line's own record: vertices, closed, drawMode, hasVolume, the dimension
// overrides, and its ATTACHMENTS. Nothing else. The walls, slabs and columns anchored
// to it live in THEIR OWN stores — that is the point. A wall drawn on a boundary line
// IS a wall, so the schedule (C28), the IFC exporter (C25), the material dispatcher
// and the join resolver must all find it where every other wall is. The boundary line
// references them by anchor; it does not contain them.
//
// ⛔ AND IT DOES NOT OWN THEM EITHER. Unlike `pool` (ADR-0124 §3) and `balcony`
// (C103 §2), a boundary line is NOT a compound: `childrenIds` stays empty and
// `boundaryLine.delete` removes ONLY the line. Deleting the setting-out line an
// architect drew a building against must not delete the building. C106 §6 states
// this as a rule so a later lane cannot "fix" the asymmetry into a cascade delete.

import { Store } from '@pryzm/plugin-sdk';
import type { BoundaryLineData, BoundaryLineAttachment } from '@pryzm/geometry-boundary-line';

export type { BoundaryLineData, BoundaryLineAttachment };

/** The record view handed to handlers via `ctx.stores.boundaryLine`. */
export type BoundaryLinesState = Record<string, BoundaryLineData>;

export class BoundaryLineStore extends Store<BoundaryLineData> {
    constructor() {
        super('boundaryLine');
    }

    ids(): readonly string[] {
        return [...this.state.keys()];
    }

    get(id: string): Readonly<BoundaryLineData> | undefined {
        return this.state.get(id);
    }

    /** Every boundary line on a given level. O(N). */
    byLevel(levelId: string): readonly BoundaryLineData[] {
        const out: BoundaryLineData[] = [];
        for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
        return out;
    }

    /**
     * ⭐ THE REVERSE INDEX — "which boundary line is this element attached to?"
     *
     * The edge is stored on the HOST (C106 §3.2, and C84 EI-PROP-d's requirement that
     * the record hold an edge to walk), so answering the question from the DEPENDENT's
     * side is a scan. It is O(lines × attachments) and that is acceptable: a project
     * has tens of construction lines, not thousands, and the alternative — a
     * `boundaryLineId` field on Wall, Slab, Column, Beam, Roof, Stair, Furniture and
     * Plumbing — is EIGHT schema amendments across C85–C99 for one host, each of which
     * could then disagree with this one.
     *
     * Returns every line that claims the element, not just the first: two lines
     * claiming one wall is a real (if unusual) authoring state, and silently returning
     * one of them would make a propagation half-run with nothing said.
     */
    linesHolding(elementId: string): readonly BoundaryLineData[] {
        const out: BoundaryLineData[] = [];
        for (const b of this.state.values()) {
            if (b.attachments.some((a) => a.elementId === elementId)) out.push(b);
        }
        return out;
    }

    /** Every element attached to a line, as `(id, kind)` pairs. */
    attachmentsOf(boundaryLineId: string): readonly BoundaryLineAttachment[] {
        return this.state.get(boundaryLineId)?.attachments ?? [];
    }
}
