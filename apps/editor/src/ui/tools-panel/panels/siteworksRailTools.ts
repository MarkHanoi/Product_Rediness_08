// siteworksRailTools — the three siteworks entries on the Master planning rail.
// C116 · C116 §11 · ADR-0384 D1 / D7 / D8 · C82 · C16 CA-2 · P6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ C82 IS THE ACCEPTANCE BAR: 267 OF 280 TOOLBAR PAIRS WERE MEASURED SILENTLY DEAD
// ═══════════════════════════════════════════════════════════════════════════════
//
// So these entries do not "activate a mode" that nothing implements. Each one ARMS the
// real `SiteworksPlanToolHandler` on every attached plan surface, and a click there
// draws a real, selectable, undoable, persisted surface into `runtime.stores.siteworks`.
// When there is NO plan surface to arm, the entry says so out loud and names the route
// back — never a click that quietly does nothing.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐⭐ 2026-09-10 — THESE BUTTONS NOW DRAW. THEY USED TO PLACE AT THE PLAN ORIGIN.
// ═══════════════════════════════════════════════════════════════════════════════
//
// The founder:
//   *"the new category tab is created — but it doesn't work — none of the elements on
//    selection works, the element doesn't create anything on neither PRYZM 2D view or
//    PRYZM 3D view."*
//
// He was right, and the previous revision of this file had already predicted him. It
// said, in as many words: *"they do not yet let you DRAW the centreline … Pressing Road
// places a surface at the plan origin on the active level"* — and a 40 m road laid at
// world (0,0) on a plan the architect has scrolled a kilometre away from is, from where
// he is sitting, indistinguishable from creating nothing at all. The honest label for
// what shipped is not "a partial feature"; it is a control whose visible effect was
// zero.
//
// ⛔ THE PLACE-AT-ORIGIN PATH IS GONE RATHER THAN KEPT AS A FALLBACK. A button that
// draws when a plan pane is open and silently drops a surface at the origin when one is
// not is the silent-fallback shape this repository has paid for repeatedly
// ([[envelope-reject-silent-fallback]]): the failing branch is invisible precisely when
// the user most needs to be told. One gesture, one outcome, and a REFUSAL with a route
// when the gesture cannot run.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHERE THE DRAWING ACTUALLY LIVES, AND WHY THIS FILE HOLDS NO GESTURE
// ═══════════════════════════════════════════════════════════════════════════════
//
// The previous revision recorded the reason it could not ship the gesture, and it was a
// measurement rather than a shrug: `BoundaryLinePlanToolHandler` is 549 lines and
// ALREADY strokes an ortho / curved / looping polyline, so a second implementation
// beside it would be [[same-rule-two-implementations]] with a guarding test green on
// whichever copy it happened to measure. Recorded as C116 §11. That extraction has now
// landed — `PlanPolylineStroke` — and `SiteworksPlanToolHandler` is its SECOND caller,
// re-implementing none of it.
//
// ⚠ AND IT IS NOT THE `armEnvelopeDraw` DRIVER, which the note added by the
// ARRAY-ALONG-PATH lane already established: that one binds through
// `EnvelopeDrawSurface` (Cesium / MapLibre) and cannot serve a `PlanToolDrawContext`,
// and the inverse holds too. Two surfaces, two drivers, one set of
// `@pryzm/geometry-slab` rules underneath both.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ ONE KIND, THREE ROLES — THREE BUTTONS, ONE TOOL (ADR-0384 D1)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The three entries do not arm three tools. They set the ROLE — the second authoring
// axis, held in `activeSiteworksAuthoring` exactly as the wall's system type is held in
// `activeWallSystemType` — and then arm the ONE `siteworks` tool. Minting three tool
// ids would be the `railing`/`handrail` split (L-4601) committed deliberately, and it
// would put three rows in `ELEMENT_CREATION_MATRIX` for one element kind.
//
// ⛔ AND THE FORM IS NOT SET HERE EITHER. `linear` vs `areal` is read off the GESTURE
// the architect makes — an open finish is a centreline, a closed finish is a boundary —
// see `SiteworksPlanToolHandler`. A stored form can disagree with the shape just drawn.

import { SITEWORKS_ROLES, SITEWORKS_DEFAULT_WIDTH_M, type SiteworksRole } from '@pryzm/schemas';
import { registerMasterPlanningTool } from './masterPlanningRailRegistry.js';
import { setActiveSiteworksRole } from '@app/engine/views/plantools/activeSiteworksAuthoring';
import { activatePlanOnlyToolOrExplain } from '@app/ui/create/activatePlanOnlyTool';

/** The plan-tool key. ⛔ ONE id for the family — `PLAN_TOOL_KEYS` and the matrix agree. */
export const SITEWORKS_TOOL_ID = 'siteworks';

/**
 * The user-facing name per role.
 *
 * ⚠ Each of these MUST have a row in `creationToolShortcuts.ts` — the rail stamps every
 * tool's accelerator from that map and a completeness test fails on a missing one. All
 * three are already there (Alt+Shift+J / U / X).
 */
export const SITEWORKS_RAIL_LABEL: Readonly<Record<SiteworksRole, string>> = Object.freeze({
    road: 'Road',
    parking: 'Parking Area',
    pedestrian: 'Pedestrian Area',
});

/** The rail glyph per role. ⛔ Every one of these must be a key in `_ICON_MAP`. */
export const SITEWORKS_RAIL_ICON: Readonly<Record<SiteworksRole, string>> = Object.freeze({
    road: 'material-symbols:add-road-outline',
    parking: 'material-symbols:local-parking-outline',
    pedestrian: 'material-symbols:directions-walk',
});

/**
 * Set the role and ARM the draw tool on every attached plan surface.
 *
 * ⭐ THE ROLE IS WRITTEN BEFORE THE ARM, and the order is load-bearing: the session's
 * "click in the PLAN pane" sentence, the mode strip and the tool's own hint all read
 * `resolveActiveSiteworksRole()`, so arming first would show the architect the previous
 * role's name and default width for one frame.
 *
 * ⛔ P6 — NOTHING IS DISPATCHED HERE AND NO ID IS MINTED HERE. The gesture dispatches
 * `siteworks.batch.create` when it finishes, and mints the id at that moment (C16 CA-2:
 * `execute()` runs again on redo, so an id minted at the palette click would be reused
 * by every surface drawn in that session).
 *
 * @returns true when at least one plan surface accepted the tool.
 */
export function armSiteworks(role: SiteworksRole): boolean {
    setActiveSiteworksRole(role);
    return activatePlanOnlyToolOrExplain(SITEWORKS_TOOL_ID, SITEWORKS_RAIL_LABEL[role]);
}

/**
 * The sentence the rail shows on hover, naming the CITED default width.
 *
 * ⭐ READ FROM THE SCHEMA, NEVER RETYPED. `SITEWORKS_DEFAULT_WIDTH_M` carries the
 * citation with the number (road 7.00 m Norma 3.1-IC · pedestrian 1.80 m VIV/561/2010 ·
 * parking 5.00 m marked `convention`), and a retyped citation is one that can drift
 * away from the ordinance it names.
 */
export function siteworksRailTooltip(role: SiteworksRole): string {
    const d = SITEWORKS_DEFAULT_WIDTH_M[role];
    return `${SITEWORKS_RAIL_LABEL[role]} — draw in the plan pane · ${d.valueM.toFixed(2)} m default`;
}

/**
 * Register the three siteworks entries into the shared Master planning registry.
 *
 * ⭐ GENERATED FROM `SITEWORKS_ROLES`, the L0 union — not three hand-written blocks. A
 * fourth role added to the schema appears here the day it lands, and the two maps above
 * fail to compile until it has a name and a glyph, which is the point.
 *
 * ⚠ THE `getRuntime` THUNK IS GONE. It existed so the entries could reach the bus, and
 * they no longer touch it: arming is not a mutation. Keeping an unused parameter is how
 * a wire comes to look live while carrying nothing.
 */
export function registerSiteworksRailTools(): void {
    for (const role of SITEWORKS_ROLES) {
        registerMasterPlanningTool({
            key: `siteworks.${role}`,
            label: SITEWORKS_RAIL_LABEL[role],
            icon: SITEWORKS_RAIL_ICON[role],
            action: () => { armSiteworks(role); },
        });
    }
}
