/**
 * WallProfileEditor — §FEAT-WALL-PROFILE-EDIT (the founder's "I REQUIRED A PROFILE EDIT
 * FEATURE (MODE)" for WALLS).
 *
 * ⭐ §WPE-CHROME-LAYER (L-10200, 2026-08-24). THIS FILE USED TO BUILD THE DIALOG.
 *
 * It declared 359 lines of `document.createElement`, an SVG surface, pointer handlers, a
 * keyboard listener and four buttons — inside an **L2 geometry package**. Nothing about that
 * was a layering *violation* (DOM is not an upward import), which is exactly why it survived:
 * the layer gate cannot see it. What it did instead was make the panel **unreachable by the
 * app's own panel chrome**. `apps/editor/src/ui/makeDraggable.ts` and
 * `apps/editor/src/ui/makeResizable.ts` are L7; `packages/geometry-wall` is L2; L2 may not
 * import L7. So the founder's ask — *"make the wall edit profile panel resizable and
 * draggable"* — was, at HEAD, **not expressible without either a layer violation or a fifth
 * hand-rolled copy of a dragger this repo already has two shared versions of**.
 *
 * The DOM therefore MOVED UP, to `apps/editor/src/ui/WallProfileEditor.ts`, where the two
 * shared helpers are ordinary downward imports. Nothing was deleted: the same class, the same
 * behaviour, plus the chrome. What stayed HERE is what belongs at L2 — the SUBJECT the editor
 * is opened on, the CALLBACKS it commits through, the authoring grid, the implicit rectangle,
 * and the PORT the tool holds. Those are statements about a wall, not about a dialog.
 *
 * ─── WHY A DOM/SVG EDITOR AND NOT A COPY OF SlabProfileEditor ─────────────────
 *
 * `SlabProfileEditor` drags vertices in the WORLD XZ plane: the slab's authoring frame IS
 * a horizontal plane in the scene, so a 3-D handle at (x, 0, z) and an authored vertex are
 * the same point, and a plan camera looks straight down it. A wall profile is authored in
 * the wall's OWN ELEVATION frame (u along the baseline, v above the base plane —
 * `WallProfile.ts` fixes that convention and neither this file nor the panel re-derives it).
 * There is no camera in this repo guaranteed to be looking at that plane, so a 3-D handle
 * editor would have had to first BUILD an elevation view of an arbitrary wall, align a camera
 * to it, and keep the two in sync — three unbuilt things standing between the founder and a
 * feature whose model, gate, persistence and geometry are already finished.
 *
 * So the proven pattern is mirrored where it is the same and only where it is the same:
 * ONE editor object, an `activate` / `deactivate` pair that is idempotent, a commit
 * callback that the TOOL turns into a command (the panel never touches a store or a bus —
 * the same split `SlabProfileEditor` makes when it hands `_commitProfileEdit` a polygon and
 * knows nothing about `UpdateSlabPolygonCommand`), and a cancel callback.
 *
 * ⛔ NO THREE, NO STORE, NO COMMAND BUS, and — since L-10200 — NO DOM in this file.
 */

import type { WallProfileVertex } from './WallProfile';

/** Everything the editor needs to draw a wall's elevation. Deliberately NOT a WallData —
 *  the editor must not be able to read anything it has no business reading. */
export interface WallProfileEditorSubject {
    readonly wallId: string;
    /** Planar (XZ) centreline length, metres — the `u` axis extent. */
    readonly length: number;
    /** Wall height, metres — the `v` axis extent. A profile may only CUT inside this. */
    readonly height: number;
    /** The wall's current ring, or `null` for the implicit rectangle. */
    readonly ring: ReadonlyArray<WallProfileVertex> | null;
    /**
     * ⭐ §RESI-STAGE-G (2026-09-06) — the panel's title bar, when the subject is NOT a wall.
     *
     * ⛔ OPTIONAL, AND ABSENT MEANS THE WALL SENTENCE, BYTE FOR BYTE. C114 §10b joins the
     * space envelope to THIS editor rather than building a second one — but the panel's
     * title is hard-coded `Edit Wall Profile - <length> m long, <height> m high`, and a
     * footprint is neither long nor high: it is wide and deep. Shipping a dialog that calls
     * a storey outline a wall is the naming-vs-behaviour defect C114 §0.2 exists to forbid,
     * one layer out.
     *
     * The field is optional so the wall path is untouched: `wallProfileEditorChrome.test.ts`
     * pins that exact sentence (`:285`), and a subject that omits `title` still produces it.
     * The CALLER owns the wording (C16 CA-18) — this L2 type only carries it.
     */
    readonly title?: string;
}

export interface WallProfileEditorCallbacks {
    /** Commit a ring. `null` means "clear the profile — restore the implicit rectangle". */
    onCommit(ring: WallProfileVertex[] | null): void;
    onCancel(): void;
}

/**
 * §WPE-CHROME-LAYER (L-10200) — the seam `WallTool` holds.
 *
 * The tool must be able to open, close and talk back to an editor WITHOUT knowing that the
 * editor is a DOM dialog, because at L2 it cannot see one. `apps/editor` supplies the
 * implementation through `WallToolCallbacks.createProfileEditor`; this interface is the
 * whole of what the tool is allowed to assume about it.
 *
 * ⚠ A port whose implementation nobody supplies is a dead feature with an interface attached
 * — [[committed-is-not-reachable]], and thirteen instances of it were found in this repo in
 * one session. Two things stop that here, and BOTH are deliberate:
 *   1. `WallTool.enterProfileEditMode` REFUSES OUT LOUD when no factory was supplied
 *      (`showStatus`), rather than returning quietly;
 *   2. `WPE1WallProfileEditMode.test.ts` asserts, from source, that `initTools.ts` actually
 *      passes `createProfileEditor` — the same static-link assertion that already pins
 *      `window.wallTool`, and for the same reason: a missing static link still breaks the
 *      chain, and a chain is only as good as the link nobody tested.
 */
export interface WallProfileEditorPort {
    /** TRUE while an overlay is open. */
    readonly isActive: boolean;
    /** Open the editor over the given wall. MUST be idempotent — activating while already
     *  active closes the previous session first, so two overlays can never co-exist. */
    activate(subject: WallProfileEditorSubject, cbs: WallProfileEditorCallbacks): void;
    /** Close the overlay and drop every listener. MUST be safe to call any number of times. */
    deactivate(): void;
    /** Surface a refusal the TOOL obtained from the gate. The editor owns no refusal text. */
    showRefusal(text: string): void;
}

/**
 * The authoring grid, metres. Hold Shift while dragging for a free value.
 *
 * ⚠ THIS LIVES AT L2 ON PURPOSE. It is a statement about how a wall profile may be authored,
 * not about how a dialog behaves, and C84 EI-9 is one answer per question: if the panel
 * carried its own copy, the hint text ("no 50 mm grid") and the value actually snapped to
 * could drift apart without a single test failing.
 */
export const WALL_PROFILE_SNAP_M = 0.05;

/** Snap `x` (metres) to {@link WALL_PROFILE_SNAP_M} when `on`; otherwise pass it through. */
export function wallProfileEditorSnap(x: number, on: boolean): number {
    return on ? Math.round(x / WALL_PROFILE_SNAP_M) * WALL_PROFILE_SNAP_M : x;
}

/**
 * The implicit rectangle every wall already is — the only honest starting outline for a wall
 * with no authored profile (`WallProfile.ts`'s round-trip guarantee: a profile SUBTRACTS from
 * the rectangle, it never grows it).
 */
export function wallProfileEditorRectangle(
    s: Pick<WallProfileEditorSubject, 'length' | 'height'>,
): WallProfileVertex[] {
    return [
        { u: 0, v: 0 },
        { u: s.length, v: 0 },
        { u: s.length, v: s.height },
        { u: 0, v: s.height },
    ];
}
