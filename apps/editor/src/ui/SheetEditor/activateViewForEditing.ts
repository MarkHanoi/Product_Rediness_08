/**
 * activateViewForEditing — §SHEET-ACTIVATE-BY-ID-NOT-MODE (L-1842)
 *
 * Opens a ViewDefinition in the main editor so the user can edit its ELEMENTS.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 * The founder, 2026-08-21:
 *   "even double click on the view and be able to modify the elements like if
 *    i was on the view"
 *
 * "Like if I was on the view" is the requirement, and the cheapest honest way to
 * satisfy it is to PUT THEM ON THE VIEW — the real editor, with the real picking
 * stack, the real commands and the real tools. The alternative (element editing
 * inside the sheet viewport) would need a second element-picking path over the
 * composed SVG, and that SVG cannot support one: `SVGCompositeRenderer` groups
 * linework BY LAYER and emits anonymous `<line>` segments, because it reads
 * merged `THREE.LineSegments` buffers in which per-element identity is already
 * gone. There is no attribute to stamp. A second picking stack would therefore
 * have to re-derive identity the drawing no longer carries.
 *
 * ─── THE DEFECT THIS REPLACES ──────────────────────────────────────────────
 * `enterEditInPlace()` called `viewController.activate(viewId)`. But
 * `ViewController.activate()` is declared `(view: OBC.View | ViewMode)` where
 * `ViewMode = '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' |
 * 'Left' | 'Right'`. A ViewDefinition id such as `vd-sys-3d-1` is not a ViewMode
 * and never was. It was only ever reached for 3D views, which is why it survived.
 *
 * The path that demonstrably works is `ViewsRailPanel._onActivateView()`, and it
 * does three things in this order — all three matter:
 *   1. resolve the view's OBC ViewMode from its viewType (+ direction),
 *   2. `viewController.setActiveViewDefinitionId(viewId)`  ← BEFORE activating;
 *      `activate()` reads `_activeDefinitionId` for view-selected dispatch (V001)
 *      and sectionPlane resolution (V002), so setting it afterwards is too late,
 *   3. activate BY MODE.
 *
 * ─── THE MAP, AND WHY IT IS DEFINED HERE ───────────────────────────────────
 * ⚠ Two copies of the viewType→ViewMode table already exist and they DISAGREE:
 *   · `ViewsRailPanel.ts:170`  'section' -> 'Section'
 *   · `LeftNavRail.ts:588`     'section' -> 'Front'
 * `'Section'` is not a member of ViewMode at all. This module does not add a
 * third rival: it resolves 'section' and 'elevation' the same way — from the
 * view's own direction — which is what both tables were approximating. The two
 * older copies are recorded in the ISSUE-LOG and deliberately NOT migrated here:
 * they drive the founder's live navigation rail, and re-pointing a working
 * navigation path without a browser to verify it is how a demo gets broken.
 */

import { viewDefinitionStore } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';

/** The ViewModes `ViewController.activate()` accepts. */
export type ObcViewMode = '3D' | 'Top' | 'Ceiling' | 'ceiling-plan' | 'Front' | 'Back' | 'Left' | 'Right';

const PLAN_LIKE = new Set(['plan', 'structural-plan', 'drafting', 'legend']);
const SPATIAL_3D = new Set(['3d', 'render', 'walkthrough', 'analysis']);
/** Types whose mode depends on which way the view LOOKS, not on its kind. */
const DIRECTIONAL = new Set(['elevation', 'section', 'detail']);

/**
 * Resolve which of the eight OBC ViewModes shows `view`.
 *
 * Directional views (elevation / section / detail) read their facing from
 * `spatial.projectionDirection` when present — set by the elevation-mark tool —
 * and fall back to `spatial.sectionPlane.normal`, which is what section views
 * carry instead. Returning 'Front' for a directionless view is a stated default,
 * not a silent one: a directionless elevation is a real (if degenerate) state.
 */
export function resolveViewMode(view: ViewDefinition): ObcViewMode {
    const t = view.viewType as string;
    if (SPATIAL_3D.has(t)) return '3D';
    if (t === 'ceiling-plan') return 'Ceiling';
    if (PLAN_LIKE.has(t)) return 'Top';
    if (DIRECTIONAL.has(t)) return resolveDirectionalMode(view);
    return '3D';
}

/** Facing for elevation/section/detail views. Exported for testability. */
export function resolveDirectionalMode(view: ViewDefinition): ObcViewMode {
    const dir = (view.spatial as { projectionDirection?: { x?: number; y?: number; z?: number } } | undefined)
        ?.projectionDirection;
    if (dir) {
        const absX = Math.abs(dir.x ?? 0);
        const absZ = Math.abs(dir.z ?? 0);
        if (absZ >= absX) return (dir.z ?? 0) <= 0 ? 'Front' : 'Back';
        return (dir.x ?? 0) <= 0 ? 'Left' : 'Right';
    }
    const n = view.spatial?.sectionPlane?.normal;
    if (!n) return 'Front';
    const nx = n[0] ?? 0;
    const nz = n[2] ?? 0;
    if (Math.abs(nz) >= Math.abs(nx)) return nz <= 0 ? 'Front' : 'Back';
    return nx <= 0 ? 'Left' : 'Right';
}

/** Why an activation did not happen. `ok` means the view was activated. */
export type ActivateOutcome =
    | { ok: true;  mode: ObcViewMode }
    | { ok: false; reason: 'no-view-controller' | 'view-not-found' | 'activate-threw'; detail?: string };

/**
 * Activate `viewId` in the main editor by MODE, having first told the controller
 * which ViewDefinition the mode stands for.
 *
 * Returns a discriminated outcome rather than a bare boolean so the caller can
 * tell the three failures apart — [context-data-honesty]: "no engine yet",
 * "that view is gone" and "activation threw" are different facts, and a UI that
 * renders them identically teaches the user nothing.
 *
 * ⚠ KNOWN GAP, recorded not hidden: the rail's path reaches the controller via
 * `gis.activateView(mode)`, which toggles GIS off first. This calls the
 * controller directly, so activating a view while the Cesium/GIS surface is
 * live will not drop out of GIS. The sheet editor is a DOM overlay on the BIM
 * scene, so that combination is not reachable from here today — but it is an
 * assumption, not a proof, and it is written down so the next caller of this
 * function checks it rather than inheriting it.
 */
export function activateViewForEditing(viewId: string): ActivateOutcome {
    const vc = window.viewController; // TODO(D.4): legacy viewController — replace with runtime.viewRegistry controller
    if (!vc || typeof vc.activate !== 'function') {
        return { ok: false, reason: 'no-view-controller' };
    }

    const view = viewDefinitionStore.get(viewId);
    if (!view) {
        return { ok: false, reason: 'view-not-found', detail: viewId };
    }

    const mode = resolveViewMode(view);

    try {
        // ORDER IS LOAD-BEARING — see the header. activate() reads
        // _activeDefinitionId during the switch, so this must precede it.
        vc.setActiveViewDefinitionId?.(viewId);
        void vc.activate(mode);
        return { ok: true, mode };
    } catch (err) {
        return { ok: false, reason: 'activate-threw', detail: String(err) };
    }
}
