/**
 * slabEditorTarget — §FIX-SLAB-EDITOR-CHOICE (L-1320)
 *
 * WHICH EDITOR DOES A SLAB OPEN, AND WHY — asked as the question the user actually
 * asked, instead of a proxy for it.
 *
 * ─── THE DEFECT THIS EXISTS TO CLOSE ──────────────────────────────────────────
 *
 * `SlabTool.enterProfileEditMode` opened the vertex-drag outline editor UNLESS the
 * slab had a positive width and depth, in which case it silently redirected to the
 * Width/Depth dimension panel:
 *
 *     if ((slab.width ?? 0) > 0 && (slab.depth ?? 0) > 0) {
 *         this._showDimensionEditPanel(slabId); return;
 *     }
 *
 * That was CORRECT when only the rectangle/hollow branch supplied `dimensions` and
 * every region- or polyline-created slab stored `width: 0, depth: 0`.
 *
 * Then §FIX-REGION-SLAB-3D-LADDER (L-1121) fixed those zeros at `SlabTool.ts:448`
 * — `const resolvedDims = dimensions ?? bboxOf(polygon)` — on the entirely sound
 * reasoning that *"a zero is not a gap here, it is a WRONG MEASUREMENT"*.
 *
 * ⭐ BOTH CHANGES ARE RIGHT. THEIR COMPOSITION WAS NOT. Every slab now carries a
 * non-zero width/depth, so the guard swallowed ALL of them and the outline editor
 * became unreachable from all four routes — `SelectionManager:428`,
 * `PropertyInspector:607`, `ContextualEditBar:1212`, `initTools:556` — each of which
 * is labelled **"Edit Profile"**. `committed ≠ reachable`, with two authors, and
 * neither author's tests could have caught it: the guard's precondition lived in a
 * different file from the fix that invalidated it and nothing named the dependency.
 *
 * ─── ⭐ THE ROOT CAUSE, STATED SO IT IS NOT REPEATED ──────────────────────────
 *
 * **The predicate could not express the question it was being asked.**
 * *"Does this slab have dimensions?"* was standing in for *"which editor did the
 * user ask for?"* — and once every slab had dimensions, the proxy answered the same
 * way for every input. A predicate whose answer no longer varies is not a gate.
 *
 * The fix is therefore NOT to restore the zeros (that re-breaks the 3-D ladder) and
 * NOT to special-case rectangles at the call site (that was the original sin). It is
 * to let the CALLER NAME THE EDITOR IT WANTS, and to judge that request against a
 * property that actually answers it.
 *
 * ─── ⚠ WHY `dimensions` IS STILL REFUSED FOR SOME SLABS, AND MEASURED HOW ─────
 *
 * `SlabDimensionsEditor` *"Computes a 4-corner axis-aligned rectangle polygon"* and
 * applies it through `UpdateSlabPolygonCommand` (its own header, `:16-17`, `:43`).
 * Opening it on a CIRCULAR slab and pressing Apply would therefore REPLACE the
 * circle with a rectangle — a silently-wrong element, which this repo forbids by
 * name (`WallRake.ts:50-62`).
 *
 * So the dimension editor is offered only where its own write is faithful: when the
 * ring ALREADY IS an axis-aligned rectangle. ⭐ That is not "special-casing
 * rectangles" — it is asking the real question (*"is this editor's output the same
 * shape as this slab?"*) instead of the proxy (*"does it have numbers?"*). The
 * measurement is on the RING, which cannot go stale the way a derived scalar did.
 *
 * Pure: no THREE, no DOM, no store, no bus.
 */

/** The slab shape this module reads. Deliberately minimal — it must not be able to
 *  read anything it has no business reading. */
export interface SlabEditorSubject {
    readonly polygon?: ReadonlyArray<{ x: number; y: number }> | null;
    readonly width?: number;
    readonly depth?: number;
}

/** The two editors a slab can open. NAMED BY THE CALLER — that is the whole fix. */
export type SlabEditorKind = 'outline' | 'dimensions';

export interface SlabEditorVerdict {
    readonly ok: boolean;
    /** Present iff `!ok`. Names the reason AND the live alternative (C16 CA-18). */
    readonly reason?: string;
}

/** Coincidence tolerance, metres. Matches the plate family's authoring grid. */
export const SLAB_RING_EPS_M = 1e-6;

/**
 * Is this ring an AXIS-ALIGNED RECTANGLE?
 *
 * Exactly four vertices, each edge parallel to X or Z, and a non-degenerate extent.
 * A rotated rectangle is deliberately NOT one: `SlabDimensionsEditor` writes an
 * axis-aligned box, so it would silently un-rotate the slab.
 */
export function isAxisAlignedRectangleRing(
    ring: ReadonlyArray<{ x: number; y: number }> | null | undefined,
): boolean {
    if (!Array.isArray(ring) || ring.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
        const p = ring[i];
        const q = ring[(i + 1) % 4];
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
        const dx = Math.abs(q.x - p.x);
        const dz = Math.abs(q.y - p.y);
        // Each edge must run along exactly one axis.
        const alongX = dz <= SLAB_RING_EPS_M && dx > SLAB_RING_EPS_M;
        const alongZ = dx <= SLAB_RING_EPS_M && dz > SLAB_RING_EPS_M;
        if (!alongX && !alongZ) return false;
    }
    return true;
}

/** ≥3 finite vertices — the least a draggable outline can be. */
export function hasEditableRing(
    ring: ReadonlyArray<{ x: number; y: number }> | null | undefined,
): boolean {
    return Array.isArray(ring)
        && ring.length >= 3
        && ring.every((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
}

/**
 * MAY this slab open the editor the caller ASKED FOR?
 *
 * ⭐ Note what is absent: there is no arm that redirects one request to the other
 * editor. A request the slab cannot serve is REFUSED WITH A REASON, never silently
 * answered with a different tool — that substitution is exactly L-1320.
 */
export function slabEditorAvailability(
    slab: SlabEditorSubject | null | undefined,
    requested: SlabEditorKind,
): SlabEditorVerdict {
    if (!slab) {
        return { ok: false, reason: 'That slab is no longer in the model.' };
    }

    if (requested === 'outline') {
        if (!hasEditableRing(slab.polygon)) {
            return {
                ok: false,
                reason:
                    'This slab has no outline to edit — it carries fewer than three ' +
                    'vertices. Use Edit Dimensions to set its width and depth instead.',
            };
        }
        // ⭐ NO width/depth ARM. A rectangular slab opens the outline editor exactly
        // as a circular one does; that is what "Edit Profile" means and it is the
        // behaviour L-1320 removed.
        return { ok: true };
    }

    // requested === 'dimensions'
    if (!isAxisAlignedRectangleRing(slab.polygon)) {
        return {
            ok: false,
            reason:
                'Width and depth only describe a rectangular slab, and this one is not ' +
                'rectangular — applying them would replace its outline with a box. ' +
                'Use Edit Profile to drag its vertices instead.',
        };
    }
    const w = slab.width ?? 0;
    const d = slab.depth ?? 0;
    if (!(w > 0) || !(d > 0)) {
        return {
            ok: false,
            reason:
                'This slab has no stored width and depth to edit. ' +
                'Use Edit Profile to drag its vertices instead.',
        };
    }
    return { ok: true };
}
