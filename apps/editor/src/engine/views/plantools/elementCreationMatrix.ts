/**
 * elementCreationMatrix — §FEAT-DUAL-VIEW-CREATION-MATRIX (founder, 2026-08-06).
 *
 * THE FOUNDER'S PRINCIPLE:
 *   "ALL ELEMENTS SHOULD BE CAPABLE OF BEING CREATED BOTH IN PLAN VIEW AND IN 3D
 *    VIEW, BY ANY MODE — INCLUDING AUTO."
 *
 * This module is the DECLARATION of that invariant: for every creation tool, the
 * views it supports, the modes it offers, and where AUTO lives. It exists so the
 * matrix is a checked artefact rather than folklore — `elementCreationMatrix.spec.ts`
 * asserts the declaration against the two real registries:
 *
 *   • PLAN  — `createPlanToolHandlers()` (`planToolHandlerRegistry.ts`). BOTH plan
 *             surfaces (`PlanViewToolOverlay` and `SvpPlanToolOverlay`) build their
 *             handler map from it, so plan availability is one fact, not two (L-73).
 *   • 3D    — `TOOL_MANAGER_TOOL_KEYS` (`@pryzm/input-host`), the keys `ToolManager`
 *             publishes via `activateTool(...)`.
 *
 * A tool that claims a view it cannot serve fails the spec. A creation tool present
 * in a registry but absent from this table also fails, so a NEW element type cannot
 * silently ship plan-only or 3D-only: the author must state the capability here.
 *
 * ── CORRECTING THE STANDING HYPOTHESIS ───────────────────────────────────────
 * "Plan-view unavailability is caused by missing `SvpPlanToolOverlay` handler
 * registration" is NOT what the evidence shows, and specifically NOT what was wrong
 * with FLOOR FINISH. `floor` has been in the shared registry all along
 * (`planToolHandlerRegistry.ts` → `'floor': new FloorPlanToolHandler()`), and the
 * split-view overlay has consumed that same shared registry since L-73. The
 * `[SvpPlanToolOverlay] Handler activated: …` log lines list the tools ACTIVATED in
 * that session, not the tools REGISTERED.
 *
 * The real gate was one layer up and is a MODE gate, not a VIEW gate:
 *   §FIX-FINISH-MODE-PLAN-UNREACHABLE — "Auto Floor" / "Auto Ceiling" expressed the
 *   mode as `window.floorTool.setMode('AUTO_FROM_ROOM')`, a field on the 3D tool
 *   INSTANCE. `FloorPlanToolHandler` reads its mode from `floorModePicker`, so the
 *   plan surface never saw AUTO and stayed in polygon mode. AUTO therefore worked in
 *   3D and was inert in plan — indistinguishable, to the user, from "floor finish
 *   cannot be created in plan view". This is the same class of defect as L-255,
 *   which fixed the finish PARAMETERS by exactly this argument but left the MODE
 *   on the 3D instance.
 *
 * ── THE GENERAL SEAM ─────────────────────────────────────────────────────────
 * Plan availability = a handler in the shared plan registry.
 * 3D availability   = a `ToolManager` activator.
 * MODE availability across both = a SURFACE-INDEPENDENT mode store, never a field
 * on one surface's tool instance. Three now exist and should be the pattern every
 * element adopts:
 *   • `activeWallSystemType.ts`  (L-98, wall system type)
 *   • `activeSlabDrawMode.ts`    (§FEAT-SLAB-DRAW-MODES, slab linear/ortho/curved)
 *   • `FloorToolConfigStore`     (L-255, floor finish parameters)
 * The remaining offenders are listed as `modeSource: 'tool-instance'` below: each is
 * a latent repeat of the founder's bug, and closing them is mechanical.
 */

/** Which drawing surfaces a creation tool can be driven from. */
export type CreationView = 'plan' | '3d';

/**
 * Where the MODE the user picked actually lives.
 *   'shared'        — a surface-independent store/picker BOTH surfaces read. Safe.
 *   'tool-instance' — a field on the 3D tool object. The plan surface cannot read
 *                     it, so any mode set this way is 3D-only (the founder's bug).
 *   'n/a'           — the tool has exactly one mode; there is nothing to desync.
 */
export type ModeSource = 'shared' | 'tool-instance' | 'n/a';

export interface ElementCreationCapability {
    /** Registry key — the same string in the plan registry and in ToolManager. */
    readonly tool: string;
    /** Human name, for the matrix report. */
    readonly label: string;
    /** Views this tool can be driven from TODAY. */
    readonly views: readonly CreationView[];
    /** Drawing modes offered. `[]` means a single implicit mode (click to place). */
    readonly modes: readonly string[];
    /** Views in which an AUTO/derive-from-context mode is reachable. */
    readonly autoIn: readonly CreationView[];
    readonly modeSource: ModeSource;
    /**
     * Required whenever `views` is not both. Says WHY — "not implemented" and
     * "not applicable" are different answers and must never be conflated.
     */
    readonly gap?: string;
}

/**
 * Tools that are EDIT or ANNOTATION operations, not element creation. They are
 * excluded from the both-views invariant by kind, and the spec checks that this
 * exclusion list and the creation table together cover the plan registry with
 * nothing left over — so a new key cannot fall between the two.
 */
export const NON_CREATION_PLAN_TOOLS: readonly string[] = [
    // Edit-in-place operations on already-created elements (Contracts 34/35).
    'move', 'rotate', 'align', 'copy-place',
    // Annotation + sheet graphics: these are DRAWING content. They are authored on
    // a 2D sheet/plan by definition — a "3D text note" is not a meaningful object
    // in this model, so their plan-only availability is `n/a`, not a gap.
    'linear-dim', 'text-note', 'element-tag', 'door-tag', 'window-tag',
    'angular-dimension', 'radius-dimension', 'diameter-dimension', 'slope-dimension',
    'spot-elevation', 'keynote', 'level-tag', 'grid-bubble', 'revision-cloud',
    'callout-detail', 'north-arrow', 'scale-bar', 'matchline',
    'section-mark', 'elevation-mark',
] as const;

/**
 * THE MATRIX. Every element-creation tool, both registries reconciled.
 *
 * Ordering: the slab family first (this agent's subject), then the rest.
 */
export const ELEMENT_CREATION_MATRIX: readonly ElementCreationCapability[] = [
    // ── The slab family ──────────────────────────────────────────────────────
    {
        tool: 'slab', label: 'Slab',
        views: ['plan', '3d'],
        // §FEAT-SLAB-DRAW-MODES — linear/ortho/curved added 2026-08-06; before that
        // the slab had NO ortho and NO curve, which is the founder's screenshot.
        modes: ['linear', 'ortho', 'curved', '2point', 'region', 'hollow', 'pickWalls'],
        // 'region' IS the slab's auto: click inside a closed wall loop.
        autoIn: ['plan', '3d'],
        modeSource: 'shared', // activeSlabDrawMode.ts
    },
    {
        tool: 'floor', label: 'Floor finish',
        views: ['plan', '3d'],
        modes: ['linear', 'ortho', 'curved', 'rectangle', 'auto'],
        // §FIX-FINISH-MODE-PLAN-UNREACHABLE — AUTO became reachable in PLAN on
        // 2026-08-06. Before that it was 3D-only despite the handler existing.
        autoIn: ['plan', '3d'],
        modeSource: 'shared', // floorModePicker + FloorToolConfigStore
    },
    {
        tool: 'ceiling', label: 'Ceiling',
        views: ['plan', '3d'],
        modes: ['linear', 'ortho', 'curved', 'rectangle', 'auto'],
        autoIn: ['plan', '3d'],
        modeSource: 'shared',
    },

    // ── Structure + envelope ─────────────────────────────────────────────────
    {
        tool: 'wall', label: 'Wall',
        views: ['plan', '3d'],
        modes: ['linear', 'ortho', 'curved', 'byslab'],
        autoIn: ['plan', '3d'], // 'byslab' derives the walls from a selected slab
        modeSource: 'shared',   // wallModePicker + activeWallSystemType
    },
    {
        tool: 'curtain-wall', label: 'Curtain wall',
        views: ['plan', '3d'], modes: ['SINGLE', 'POLYLINE_ORTHO', 'POLYLINE'],
        autoIn: [], modeSource: 'shared',
        gap: 'NOT IMPLEMENTED — no derive-from-context mode. A curtain wall has no ' +
             'unambiguous host to infer, unlike a floor finish inside a room.',
    },
    { tool: 'column',  label: 'Column',  views: ['plan', '3d'], modes: ['rect', 'round'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no grid-intersection auto-place mode.' },
    { tool: 'beam',    label: 'Beam',    views: ['plan', '3d'], modes: ['single', 'chain'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-span-between-columns mode.' },
    { tool: 'roof',    label: 'Roof',    views: ['plan', '3d'],
      modes: ['2point', 'polyline', 'region', 'single_slope', 'hip_roof'],
      autoIn: ['plan', '3d'], modeSource: 'tool-instance',
      gap: 'MODE DESYNC RISK — the roof mode is set on the 3D RoofTool instance ' +
           '(enterRegionMode etc). Same shape as the floor AUTO defect: adopt the ' +
           'activeSlabDrawMode pattern.' },
    { tool: 'opening', label: 'Opening', views: ['plan', '3d'], modes: ['2point', 'polyline'], autoIn: [], modeSource: 'shared',
      gap: 'NOT APPLICABLE — an opening is a deliberate void the architect positions ' +
           'in a specific host. There is no context to derive it from: an "auto opening" ' +
           'would be inventing holes in the building.' },

    // ── Hosted elements (C15) ────────────────────────────────────────────────
    { tool: 'door',   label: 'Door',   views: ['plan', '3d'], modes: ['single'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-place-per-room mode from the UI (the batch/AI path has one).' },
    { tool: 'window', label: 'Window', views: ['plan', '3d'], modes: ['single'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — as door.' },

    // ── Circulation ──────────────────────────────────────────────────────────
    // §FIX-STAIR-SHAPE-DESYNC — 'C' (curved) joined the shape set. The catalogue is
    // declared ONCE in `STAIR_SHAPES` (@pryzm/geometry-stair/stairPath/StairShapeRegistry);
    // the ARCHITECTURE palette, the stair-path param panel and this matrix are its faces.
    // NOTE: curved is authored by the stair-PATH arc gesture; the plan rectangle-drag
    // handler narrows 'C' → 'I' explicitly (StairPlanToolHandler), it does not silently
    // mislabel a straight run.
    { tool: 'stair',      label: 'Stair',      views: ['plan', '3d'], modes: ['I', 'L', 'U', 'C'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-place-in-circulation-core mode. The batch/house ' +
           'generators DO place stairs automatically (§CORRIDOR-STAIR-CONTIGUITY), so the ' +
           'capability exists; it is simply not offered as an interactive tool mode.' },
    // The dual-view reference implementation: ONE tool, a plan handler AND
    // StairPath3DToolHandler. Cited as the pattern, deliberately not edited here.
    { tool: 'stair-path', label: 'Stair path', views: ['plan', '3d'], modes: ['I', 'L', 'U', 'C'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — as stair. This tool is the DUAL-VIEW REFERENCE ' +
           'IMPLEMENTATION (one tool, StairPathPlanToolHandler + StairPath3DToolHandler ' +
           'over one StairToolConfigStore); it is the pattern the single-view gaps below ' +
           'should copy.' },
    { tool: 'railing',    label: 'Railing',    views: ['plan', '3d'], modes: ['polyline'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-from-stair-flight or auto-from-slab-edge mode.' },
    {
        tool: 'lift', label: 'Lift',
        views: ['3d'], modes: [], autoIn: [], modeSource: 'n/a',
        gap: 'NOT IMPLEMENTED — 3D-ONLY. `ToolManager.activateLift` publishes the ' +
             "'lift' tool key but `planToolHandlerRegistry` has no LiftPlanToolHandler, " +
             'so the plan overlays resolve no handler and the tool is inert in plan. ' +
             'A lift is a placed footprint like a column — plan is the NATURAL surface ' +
             'for it. This is the clearest violation of the founder\'s principle in the ' +
             'matrix and the highest-value next fix.',
    },

    // ── Spatial + services ───────────────────────────────────────────────────
    { tool: 'room',      label: 'Room',      views: ['plan', '3d'], modes: ['detect', 'manual-boundary', 'point-pick'], autoIn: ['plan', '3d'], modeSource: 'shared' },
    { tool: 'furniture', label: 'Furniture', views: ['plan', '3d'], modes: [], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED from the UI — auto-furnish exists as a batch/AI executor (D-FLE), not a tool mode.' },
    { tool: 'plumbing',  label: 'Plumbing fixture', views: ['plan', '3d'], modes: ['toilet', 'sink', 'shower', 'bath'], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — auto-fit-to-wet-room exists in the deterministic furnish ' +
           'engine (D-FLE) as a batch executor, not as a tool mode in either view.' },
    {
        tool: 'lighting', label: 'Lighting fixture',
        views: ['plan'], modes: [], autoIn: [], modeSource: 'n/a',
        gap: 'NOT IMPLEMENTED — PLAN-ONLY, the mirror image of `lift`. ' +
             '`LightingPlanToolHandler` is registered, but `ToolManager` publishes no ' +
             "'lighting' key and exposes no `activateLighting`, so the fixture cannot be " +
             'placed by clicking in the 3D view. Auto-layout exists only as a batch ' +
             'executor (LightingLayoutExecutor), not as a tool mode in either view.',
    },
    { tool: 'grid', label: 'Grid', views: ['plan', '3d'], modes: ['single', 'rectangular', 'radial'], autoIn: [], modeSource: 'shared',
      gap: 'NOT APPLICABLE — a structural grid IS the datum the architect declares; ' +
           'there is no prior context to derive it from. The `rectangular` and `radial` ' +
           'modes already generate a whole grid from parameters, which is the useful ' +
           'sense of "auto" here.' },
] as const;

/** Lookup by tool key. */
export function creationCapability(tool: string): ElementCreationCapability | undefined {
    return ELEMENT_CREATION_MATRIX.find(c => c.tool === tool);
}

/** Every declared capability that does not yet serve BOTH views — the open holes. */
export function dualViewGaps(): readonly ElementCreationCapability[] {
    return ELEMENT_CREATION_MATRIX.filter(c => c.views.length < 2);
}

/** Every capability whose mode lives on a 3D tool instance — latent AUTO-desync. */
export function modeDesyncRisks(): readonly ElementCreationCapability[] {
    return ELEMENT_CREATION_MATRIX.filter(c => c.modeSource === 'tool-instance');
}
