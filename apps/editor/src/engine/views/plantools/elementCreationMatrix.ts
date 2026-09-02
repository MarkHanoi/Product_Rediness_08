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

/**
 * §FEAT-PERSISTENT-MODE-BAR (founder, 2026-08-07) — a mode as the UI must render it.
 *
 * "I would like EXACTLY THE SAME PANEL as the WALL. I want the user, DURING
 *  creation, to be able to change from LINEAR to CURVED to ORTHO etc."
 *
 * The persistent `DrawingModeBar` is DATA-DRIVEN from these declarations, so the
 * bar never hard-codes a tool's mode list and a tool cannot offer a mode in its
 * launcher that its in-draw bar forgets (or vice versa) — the two used to be
 * separate hand-maintained arrays in `SlabModePicker` and `FloorDrawingHUD`.
 */
export interface CreationMode {
    /** Stable id — the string the tool handlers switch on. */
    readonly id: string;
    /** Keyboard accelerator + the chip shown in the bar. Unique within a tool. */
    readonly key: string;
    /** Short name shown on the bar pill. */
    readonly label: string;
    /**
     * The one-liner from the old launcher menu ("Auto-detect enclosed walls",
     * "Associative from walls"…). The compact bar has no room for it, so it is
     * the pill's `title` tooltip — genuinely useful copy, deliberately not dropped.
     */
    readonly description: string;
    /**
     * True when picking this is a one-shot ACTION rather than a persistent mode
     * (wall's "By Slab"). Actions never take the active-pill highlight.
     */
    readonly isAction?: boolean;
}

export interface ElementCreationCapability {
    /** Registry key — the same string in the plan registry and in ToolManager. */
    readonly tool: string;
    /** Human name, for the matrix report. */
    readonly label: string;
    /** Views this tool can be driven from TODAY. */
    readonly views: readonly CreationView[];
    /**
     * Drawing modes offered, in bar order — the axis of HOW THE ARCHITECT SKETCHES.
     * `[]` means a single implicit mode (click to place) and therefore no mode bar.
     */
    readonly modes: readonly CreationMode[];
    /**
     * §STAIR-TWO-AXES (founder, 2026-08-19) — the SECOND, SEPARATE axis: the
     * geometry that RESULTS. Rendered as its OWN picker, never merged into the mode
     * bar.
     *
     * ⭐ WHY THIS FIELD HAD TO EXIST. The `stair` and `stair-path` rows used to
     * declare `modes: STAIR_SHAPE_MODES` — the four SHAPES I / L / U / C sitting in
     * the slot this file defines as MODE. So the shared authority asserted that a
     * stair offered four "modes" that were in fact four RESULTS, and the axis the
     * founder actually asked for ("use the UI/UX as the walls: MODE + STAIR TYPE")
     * was absent from the declaration entirely. Anyone building the bar from this
     * table would have shipped a picker whose buttons meant two different things.
     *
     * The two axes are ORTHOGONAL and must stay so: an L-shaped stair drawn in
     * Orthogonal mode is still an L-shaped stair, exactly as a wall drawn in
     * Orthogonal mode is still one wall.
     *
     * ⛔ DO NOT re-merge these. If a family has only one axis, omit this field —
     * `undefined` means "this family's mode set is its whole story", which is true
     * of every family except stair today.
     */
    readonly shapes?: readonly CreationMode[];
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
 * THE THREE WALL MODES — declared ONCE and spread into every slab-family tool, so
 * "the same options as during WALL creation" is true by construction rather than by
 * four matching literals. Keys L / O / C match the wall bar's accelerators.
 */
const LINEAR: CreationMode = { id: 'linear', key: 'L', label: 'Linear',     description: 'Freeform straight segments' };
const ORTHO:  CreationMode = { id: 'ortho',  key: 'O', label: 'Orthogonal', description: '90°-constrained segments' };
const CURVED: CreationMode = { id: 'curved', key: 'C', label: 'Curved',     description: 'Arc through a clicked midpoint' };

/** The three every boundary-drawing tool must offer (asserted in the spec). */
export const WALL_DRAW_MODES: readonly CreationMode[] = [LINEAR, ORTHO, CURVED] as const;

/**
 * §FIX-STAIR-SHAPE-DESYNC — the stair SHAPE set, shared by `stair` and `stair-path`.
 * Ids mirror `STAIR_SHAPES` (@pryzm/geometry-stair), which remains the catalogue of
 * record; this is only its UI face.
 *
 * ⭐ RENAMED from `STAIR_SHAPE_MODES` and moved out of the `modes` slot into
 * `shapes` (§STAIR-TWO-AXES). The old name was itself the bug in miniature: it
 * spelled both axes into one identifier, and the rows below then spent it as if it
 * were a mode list.
 */
/**
 * §FEAT-STAIR-BY-WALLS (founder, 2026-08-19) — L-1455 / L-1456.
 *
 *   *"…or SELECT 2 WALLS [and] create the stair in L SHAPE AGAINST THE WALLS."*
 *
 * ⭐ AN ACTION, NOT A MODE — wall's `byslab` semantics exactly, and the distinction is
 * the same one L-956 turned on. It CONSUMES a pick flow the instant it is picked, so
 * it never takes the active-pill highlight and sits after the bar's separator.
 * Recording it as the active MODE would leave every later click retrying by-walls
 * while the bar still said 'Linear' — the UI reporting the axis that did not change.
 *
 * ⚠ NOT the `byslab` id: the source geometry is a pair of WALLS, and one vocabulary
 * per concept (C84 EI-8) means the id has to say which. Same lowercase, no-hyphen form.
 *
 * Key `W` — free within this tool's set (linear `L`, ortho `O`), and it is the letter
 * `SlabPlanToolHandler` already uses for its own Pick Walls mode, so the accelerator
 * means the same thing in both places.
 *
 * ⭐ IT LANDED WITH ITS ARM, IN ONE COMMIT — the rule this file states for the slab and
 * wall closed-loop modes. The planner shipped one commit EARLIER with this member
 * deliberately absent, precisely so the strip never offered a stair the pipeline could
 * not produce (C84 EI-3). See C98 §16.6.
 */
const BY_WALLS: CreationMode = {
    id: 'bywall', key: 'W', label: 'By Walls',
    description: 'L-shaped stair in the corner of two picked walls',
    isAction: true,
};

const STAIR_SHAPES: readonly CreationMode[] = [
    { id: 'I', key: 'I', label: 'Straight', description: 'Single straight flight' },
    { id: 'L', key: 'L', label: 'L-shape',  description: 'Two flights with a quarter landing' },
    { id: 'U', key: 'U', label: 'U-shape',  description: 'Two flights with a half landing' },
    { id: 'C', key: 'C', label: 'Curved',   description: 'Curved flight (authored by the stair-path arc gesture)' },
] as const;

/**
 * THE MATRIX. Every element-creation tool, both registries reconciled.
 *
 * Ordering: the slab family first (this agent's subject), then the rest.
 */
export const ELEMENT_CREATION_MATRIX: readonly ElementCreationCapability[] = [
    // ── Landscape ────────────────────────────────────────────────────────────
    {
        tool: 'pool', label: 'Swimming pool',
        // §FIX-POOL-UNREACHABLE (founder, 2026-08-22) — L-5210..L-5216.
        //
        //   "there is an element called swimming pool that at least is not able to
        //    access via UI ... on creation it should have, like the wall: linear,
        //    ortho — but also circular, ellipse, rectangular shape creation
        //    options."
        //
        // ⚠ PLAN ONLY, AND THIS ROW SAYS SO RATHER THAN CLAIMING BOTH.
        // The plan arm is real: `PoolPlanToolHandler` is in the shared plan registry,
        // so BOTH plan surfaces have it. There is no `pool` key in
        // `TOOL_MANAGER_TOOL_KEYS` and this row does not pretend otherwise — the spec
        // below asserts the negative as hard as the positive, so a declared-but-absent
        // 3-D arm fails by name. Declaring `'3d'` here to look complete is precisely
        // the C84 EI-3 defect (a capability offered that the pipeline cannot serve),
        // and it is the shape of the founder's "Create Stair" report: a control that
        // reported activation and activated nothing.
        views: ['plan'],
        modes: [
            // The founder's "like the wall: linear, ortho" — the SAME three constants
            // every boundary-drawing tool spreads, so parity is by construction.
            ...WALL_DRAW_MODES,
            // ...and "circular, ellipse, rectangular". ⭐ Ids match `BoundaryLoopMode`
            // in @pryzm/geometry-slab — the module that turns each mode into real
            // vertices — so the strip cannot offer a shape the generator does not
            // implement. Same ids, same generator, same keys as the slab/floor/ceiling
            // rows above; no sixth private shape picker is minted for the pool.
            //
            // ⭐ SPELLED `rectangular`, NOT `rectangle`. The slab family carries both
            // spellings for historic reasons and pays for it in a mapping ladder
            // (L-1322). The pool starts on the canonical side and so has nothing to
            // reconcile later (C84 EI-8 — one vocabulary per concept).
            { id: 'rectangular', key: 'Q', label: 'Rectangular', description: 'Closed pool outline from two opposite corners' },
            { id: 'circular',    key: 'I', label: 'Circular',    description: 'Closed pool outline from centre and rim' },
            { id: 'elliptical',  key: 'E', label: 'Elliptical',  description: 'Closed pool outline from centre and bounding corner' },
        ],
        // No AUTO. A pool is not derivable from a room or a wall loop — the architect
        // decides where it goes. "Not applicable" and "not implemented" are different
        // answers (this file's own rule), and this is the former.
        autoIn: [],
        modeSource: 'shared', // activePoolDrawMode.ts
        gap: 'TWO gaps, and the SECOND is the one that matters — corrected 2026-08-23 '
           + '(§FIX-PLAN-TOOL-FINISH-GESTURE, L-9306). '
           + '(1) NO RENDER PATH. CommandEventBridge has no case for pool.create; it '
           + 'falls straight to its default arm, so no wall.created / slab.created '
           + 'reaches the initTools legacy mirrors and no mesh is ever built. A '
           + 'repo-wide search for PoolMeshBuilder / WaterBuilder returns ZERO — there '
           + 'is no render path AND no render asset. A pool therefore commits four '
           + 'stores, takes one undo entry, and draws nothing anywhere. Owner: the '
           + 'lane holding CommandEventBridge (its lift.create case is the idiom to '
           + 'copy). '
           + '(2) No 3-D arm: TOOL_MANAGER_TOOL_KEYS has no pool key. '
           + '⚠ THIS ROW USED TO SAY ONLY (2), AND ADDED “NOT a missing handler — '
           + 'pool.create is fully dispatchable (L-5200) and the plan arm drives it”. '
           + 'Both halves are true and together they read as “it works in plan”, which '
           + 'is what the founder tested three times and it does not: DISPATCHABLE is '
           + 'not VISIBLE. (2) is ordered BELOW (1) deliberately — a 3-D arm built '
           + 'first would add a second surface that creates the same invisible '
           + 'element. '
           + '⚠ AND THE SENTENCE THIS ROW USED TO END ON IS FALSE. It read “The '
           + 'activator id pool is already registered in PluginRegistry so '
           + 'check-tool-activator-coverage ARM A stays at 0”. MEASURED 2026-08-23: '
           + 'npx tsx tools/ga-gate/check-tool-activator-coverage.ts -> RC=1, '
           + '“ARM A FAIL — 3 declared tool id(s) have NO registered activator '
           + '(baseline 0): balcony, boundary-line, pool”. The gate is NOT blind to '
           + 'this class of gap and is NOT green — it is RED and names all three. What '
           + 'was wrong was the CLAIM ABOUT the gate, which is the defect shape '
           + 'CLAUDE.md corrects five times over: read the gate, never the line that '
           + 'quotes it. Logged as L-9308.',
    },

    // ── Architecture ─────────────────────────────────────────────────────────
    {
        tool: 'balcony', label: 'Balcony',
        // §FEAT-BALCONY-COMPOUND (founder, 2026-08-22) — L-5600..L-5608 · C103 · ADR-0333.
        //
        //   "Please create a 'balcony compound system'. Like swimming pool. Should be
        //    under architectural tab. It should be a 'host' compound composed by an
        //    slab, floor finish and railing. The user can hosted as you host a door on
        //    a wall with a preview of the space."
        //
        // ⚠ PLAN ONLY, AND THIS ROW SAYS SO RATHER THAN CLAIMING BOTH.
        // The plan arm is real: `BalconyPlanToolHandler` is in the shared plan
        // registry, so BOTH plan surfaces have it. There is no `balcony` key in
        // `TOOL_MANAGER_TOOL_KEYS` and this row does not pretend otherwise — the spec
        // asserts the negative as hard as the positive, so a declared-but-absent 3-D
        // arm fails BY NAME. Declaring `'3d'` here to look complete is precisely the
        // C84 EI-3 defect, and it is the shape of the founder's "Create Stair" report:
        // a control that reported activation and activated nothing.
        views: ['plan'],
        // ⭐ TWO MODES, AND BOTH ARE REAL. The ids are `BalconyDrawMode` in
        // `activeBalconyPlacement.ts` — the union the handler has an arm for — so this
        // strip cannot offer a gesture the tool does not implement
        // (§FIX-STAIR-SHAPE-DESYNC's lesson, applied before it could bite again).
        //
        // ⛔ The wall's linear/ortho/curved are DELIBERATELY NOT spread here. A balcony
        // is not drawn as a path; it is either snapped to a facade at a parametric
        // size or drawn as a closed ring. Spreading WALL_DRAW_MODES to look consistent
        // would offer three gestures with no arm behind them.
        modes: [
            {
                id: 'hosted', key: 'H', label: 'Hosted',
                description: 'Snap the balcony to a wall at its parametric size — one click',
            },
            {
                id: 'outline', key: 'O', label: 'Outline',
                description: 'Draw an arbitrary balcony ring; the host wall is measured from it',
            },
        ],
        // No AUTO. A balcony is not derivable from a room or a wall loop — the
        // architect decides which facade gets one and where. "Not applicable" and "not
        // implemented" are different answers (this file's own rule), and this is the
        // former. ⚠ `ResidentialBuildingExecutor._createBalconies` DOES place balconies
        // automatically, but it is a batch typology pass, not a creation MODE of this
        // tool, and it does not go through `balcony.create` at all (L-5612).
        autoIn: [],
        modeSource: 'shared', // activeBalconyPlacement.ts — mode AND parametric size
        gap: 'Three gaps, named rather than implied. (1) No 3-D arm: `TOOL_MANAGER_TOOL_KEYS` '
           + 'has no `balcony` key, so the tool cannot be armed from the 3-D viewport. NOT a '
           + 'missing handler — `balcony.create` is dispatchable through the composed runtime '
           + 'and the plan arm drives it; adding the 3-D arm means a `ToolManager` activator. '
           + '(2) `ResidentialBuildingExecutor._createBalconies` still builds balconies as loose '
           + 'slabs + handrails with no `balcony` parent, so a generated balcony is NOT a '
           + 'compound and cannot be reshaped as one (L-5612). (3) The AI chat classifies '
           + '`balcony.create` class B, so that route refuses it (L-5609).',
    },

    // ── The slab family ──────────────────────────────────────────────────────
    {
        tool: 'slab', label: 'Slab',
        views: ['plan', '3d'],
        // §FEAT-SLAB-DRAW-MODES — linear/ortho/curved added 2026-08-06; before that
        // the slab had NO ortho and NO curve, which is the founder's screenshot.
        // The four slab-specific modes keep the launcher menu's descriptions, which
        // now live in the bar pills' tooltips (§FEAT-PERSISTENT-MODE-BAR).
        modes: [
            ...WALL_DRAW_MODES,
            { id: '2point',    key: '2', label: '2-Point',    description: 'Rectangle by two corners' },
            // §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19). ⭐ "eclipse" IS READ AS
            // ELLIPSE and the label says `Elliptical`, so the reading is visible.
            // Ids match `BoundaryLoopMode` in @pryzm/geometry-slab.
            //
            // ✅ BOTH SURFACES since L-1324. It shipped PLAN-ONLY and said so, because a
            // tool-mode the pipeline has no arm for is C84 EI-3 live; the 3-D arm
            // (`SlabTool.enterCircularMode` / `enterEllipticalMode`) then retired that
            // declaration rather than leaving it standing. Closing SL-Voc-2 on the way:
            // `SlabToolMode` had THREE hand-copies and now has one.
            { id: 'circular',   key: 'I', label: 'Circular',   description: 'Closed circle from centre and rim' },
            { id: 'elliptical', key: 'E', label: 'Elliptical', description: 'Closed ellipse from centre and bounding corner' },
            { id: 'region',    key: 'R', label: 'By Region',  description: 'Auto-detect from enclosed walls' },
            { id: 'hollow',    key: 'H', label: 'Hollow',     description: 'Rectangle with a rectangular opening' },
            { id: 'pickWalls', key: 'W', label: 'Pick Walls', description: 'Associative boundary from walls' },
        ],
        // 'region' IS the slab's auto: click inside a closed wall loop.
        autoIn: ['plan', '3d'],
        modeSource: 'shared', // activeSlabDrawMode.ts
    },
    {
        tool: 'floor', label: 'Floor finish',
        views: ['plan', '3d'],
        modes: [
            ...WALL_DRAW_MODES,
            { id: 'rectangle', key: 'R', label: 'Rectangle', description: '2-point axis-aligned box' },
            // §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19) — "add mode 'eclipse',
            // 'circular' and 'rectangular'". ⭐ "eclipse" IS READ AS ELLIPSE and the
            // label says `Elliptical` so the reading is VISIBLE and costs one word to
            // correct. Ids match `BoundaryLoopMode` in @pryzm/geometry-slab, the module
            // that turns each mode into real vertices, so the bar cannot offer a shape
            // the generator does not implement (§FIX-STAIR-SHAPE-DESYNC's lesson).
            { id: 'circular',   key: 'I', label: 'Circular',   description: 'Closed circle from centre and rim' },
            { id: 'elliptical', key: 'E', label: 'Elliptical', description: 'Closed ellipse from centre and bounding corner' },
            { id: 'auto',      key: 'A', label: 'Auto',      description: 'Click inside a room to use its boundary' },
        ],
        // §FIX-FINISH-MODE-PLAN-UNREACHABLE — AUTO became reachable in PLAN on
        // 2026-08-06. Before that it was 3D-only despite the handler existing.
        autoIn: ['plan', '3d'],
        modeSource: 'shared', // floorModePicker + FloorToolConfigStore
    },
    {
        tool: 'ceiling', label: 'Ceiling',
        views: ['plan', '3d'],
        modes: [
            ...WALL_DRAW_MODES,
            { id: 'rectangle', key: 'R', label: 'Rectangle', description: '2-point axis-aligned box' },
            // §FEAT-PLATE-SHAPE-MODES (founder, 2026-08-19) — "add mode 'eclipse',
            // 'circular' and 'rectangular'". ⭐ "eclipse" IS READ AS ELLIPSE and the
            // label says `Elliptical` so the reading is VISIBLE and costs one word to
            // correct. Ids match `BoundaryLoopMode` in @pryzm/geometry-slab, the module
            // that turns each mode into real vertices, so the bar cannot offer a shape
            // the generator does not implement (§FIX-STAIR-SHAPE-DESYNC's lesson).
            { id: 'circular',   key: 'I', label: 'Circular',   description: 'Closed circle from centre and rim' },
            { id: 'elliptical', key: 'E', label: 'Elliptical', description: 'Closed ellipse from centre and bounding corner' },
            { id: 'auto',      key: 'A', label: 'Auto',      description: 'Click inside a room to use its boundary' },
        ],
        autoIn: ['plan', '3d'],
        modeSource: 'shared',
    },

    // ── Structure + envelope ─────────────────────────────────────────────────
    {
        tool: 'wall', label: 'Wall',
        views: ['plan', '3d'],
        modes: [
            ...WALL_DRAW_MODES,
            // An ACTION, not a mode: it consumes the current selection and never
            // takes the active-pill highlight (the wall bar has always behaved so).
            { id: 'byslab', key: 'S', label: 'By Slab', description: 'Create walls from the selected slab', isAction: true },
            // §FEAT-WALL-SHAPE-MODES (founder, 2026-08-19) — CLOSED-LOOP RUNS.
            //
            // ⭐ THE DISAMBIGUATION, BECAUSE "circular wall" MEANS THREE THINGS.
            // (a) an ARC IN PLAN — that is `wall.curve`, and it already exists;
            // (b) a wall whose FACE is a circle — that is `wallProfile`, which also
            //     already exists and is authorable via `WallTool.enterProfileEditMode`;
            // (c) a closed RUN of walls forming a circular room — THIS.
            // The founder listed rectangular/circular/elliptical as PEERS, and only
            // (c) makes them peers: under (a) "rectangular" is incoherent, and under
            // (b) it is the ABSENT profile, i.e. asking for nothing. (a) and (b) are
            // untouched and still reachable.
            //
            // MODES, not actions: each is a two-click gesture, so the user must SEE
            // which is armed while aiming (the railing bar's ruling, and L-956's shape).
            //
            // ✅ BOTH SURFACES since L-1325. Each surface builds the run by calling its
            // OWN per-edge wall creator — `_commitWall` in plan, `createWall` in 3-D — so
            // the spatial gate, system-type resolution and dispatch are inherited on both
            // and nothing is re-implemented.
            // ⭐ It shipped PLAN-ONLY first and SAID SO rather than minting a
            // `WallDrawingMode` member with no arm behind it, which would have been C84
            // EI-3 live. The enum members landed WITH the arm, in one commit.
            { id: 'rectangular', key: 'Q', label: 'Rectangular', description: 'Closed wall run from two opposite corners' },
            { id: 'circular',    key: 'I', label: 'Circular',    description: 'Closed wall run from centre and rim' },
            { id: 'elliptical',  key: 'E', label: 'Elliptical',  description: 'Closed wall run from centre and bounding corner' },
        ],
        autoIn: ['plan', '3d'], // 'byslab' derives the walls from a selected slab
        modeSource: 'shared',   // wallModePicker + activeWallSystemType
    },
    {
        // §FEAT-CONSTRUCTION-BOUNDARY-LINE (founder, 2026-08-23) — L-7932 · C106.
        //
        //   "The UI should be like the wall, with the same modes for creation --
        //    line, ortho, rectangle, ellipse, curve, circle etc."
        //
        // Declared IMMEDIATELY after the wall because that is the parity claim: the
        // boundary line spreads the SAME `WALL_DRAW_MODES` constant the wall spreads,
        // so "like the wall" is true by construction rather than by hand-copying three
        // rows. `DrawingModeBar` reads `creationModes('boundary-line')` from here, so
        // the in-draw strip cannot drift from the palette.
        //
        // ⛔ THIS IS NOT THE PARCEL BOUNDARY. `Parcel.boundary` (C19 §1.4) is the legal
        // lot outline -- surveyed, recorded, and ONE-SHOT IMMUTABLE; C19 §1.4 says in as
        // many words that there is no `site.editParcelBoundary` command. This is an
        // AUTHORED construction line, and it is a HOST: what is attached to it moves
        // when it moves (C106 §3).
        tool: 'boundary-line', label: 'Boundary Line',
        views: ['plan'],
        modes: [
            // The founder's "line, ortho ... curve" -- the SAME three constants every
            // boundary-drawing tool spreads, so parity is by construction.
            ...WALL_DRAW_MODES,
            // ...and "rectangle, ellipse, circle". Ids match `BOUNDARY_LINE_LOOP_MODES`
            // in @pryzm/geometry-boundary-line, which is itself `BoundaryLoopMode` from
            // @pryzm/geometry-slab -- the module that turns each mode into real
            // vertices. Same ids, same generator, same keys as the slab / floor /
            // ceiling / pool rows; no seventh private shape picker is minted.
            //
            // ⭐ SPELLED `rectangular`, NOT `rectangle` -- the canonical side of the
            // L-1322 split, chosen once so there is nothing to reconcile later.
            { id: 'rectangular', key: 'Q', label: 'Rectangular', description: 'Closed setting-out loop from two opposite corners' },
            { id: 'circular',    key: 'I', label: 'Circular',    description: 'Closed setting-out loop from centre and rim' },
            { id: 'elliptical',  key: 'E', label: 'Elliptical',  description: 'Closed setting-out loop from centre and bounding corner' },
        ],
        // No AUTO. A construction line is the architect's DECISION about where the
        // scheme sits; deriving it from existing geometry would be answering the
        // question the tool exists to ask. "Not applicable" and "not implemented" are
        // different answers (this file's own rule) and this is the former.
        autoIn: [],
        modeSource: 'shared',   // activeBoundaryLineDrawMode.ts
        gap: 'TWO gaps, and the SECOND is the one that matters — corrected 2026-08-23 '
           + '(§FIX-PLAN-TOOL-FINISH-GESTURE, L-9307). '
           + '(1) NO RENDER PATH. CommandEventBridge has no case for '
           + 'boundaryLine.create; it falls to its default arm, and because the family '
           + 'is SINGLE-STORE (produceCommand, patch paths of length 1) the L-7825 '
           + 'compound detector — which requires a path length of 2 and more than one '
           + 'store — cannot see it either, so the drop is COMPLETELY SILENT. There '
           + 'is no mesh builder, no plan-view draw path and no persistence: '
           + 'boundaryLineSolid() exists with ZERO production callers, and '
           + 'ProjectSerializer has no boundaryLines field, so the record dies on save. '
           + 'Owner: the lane holding CommandEventBridge. '
           + '(2) No 3-D arm: TOOL_MANAGER_TOOL_KEYS has no boundary-line key, and '
           + 'check-tool-activator-coverage ARM A names it (RC=1, 3/0, measured '
           + '2026-08-23). '
           + '⚠ THIS ROW USED TO SAY ONLY (2), AND ADDED “NOT a missing handler — '
           + 'boundaryLine.create is fully dispatchable (proven at the composed '
           + 'runtime) and the plan arm drives it”. Both halves are true and '
           + 'together they read as “it works in plan”; the founder measured '
           + 'otherwise the day after it shipped. DISPATCHABLE is not VISIBLE. '
           + 'A setting-out line is also a PLAN gesture by nature: it is drawn against '
           + 'a floor plate, which is where an architect sets a building out. '
           + '⭐ A THIRD gap CLOSED 2026-08-23: the six declared modes had NO '
           + 'production writer — PLAN_ONLY_MODE_STORES carried only pool and balcony, '
           + 'so no mode strip was ever mounted and every line shipped linear. The '
           + 'four existing calls to setActiveBoundaryLineDrawMode were ALL inside '
           + 'boundaryLinePointerReach.spec.ts, which is why its rectangular arm was '
           + 'green while the mode was unreachable on screen.',
    },
    {
        tool: 'curtain-wall', label: 'Curtain wall',
        views: ['plan', '3d'],
        modes: [
            { id: 'SINGLE',         key: 'S', label: 'Single',     description: 'One panel between two points' },
            { id: 'POLYLINE_ORTHO', key: 'O', label: 'Orthogonal', description: '90°-constrained run' },
            { id: 'POLYLINE',       key: 'L', label: 'Linear',     description: 'Freeform run' },
        ],
        autoIn: [], modeSource: 'shared',
        gap: 'NOT IMPLEMENTED — no derive-from-context mode. A curtain wall has no ' +
             'unambiguous host to infer, unlike a floor finish inside a room.',
    },
    { tool: 'column',  label: 'Column',  views: ['plan', '3d'],
      modes: [
        { id: 'rect',  key: 'R', label: 'Rectangular', description: 'Rectangular section' },
        { id: 'round', key: 'O', label: 'Round',       description: 'Circular section' },
      ],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no grid-intersection auto-place mode.' },
    { tool: 'beam',    label: 'Beam',    views: ['plan', '3d'],
      modes: [
        { id: 'single', key: 'S', label: 'Single', description: 'One beam between two points' },
        { id: 'chain',  key: 'C', label: 'Chain',  description: 'Continuous run of beams' },
      ],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-span-between-columns mode.' },
    { tool: 'roof',    label: 'Roof',    views: ['plan', '3d'],
      modes: [
        { id: '2point',       key: '2', label: '2-Point',  description: 'Rectangle by two corners' },
        { id: 'polyline',     key: 'L', label: 'Polyline', description: 'Freeform outline' },
        { id: 'region',       key: 'R', label: 'By Region', description: 'Auto-detect from enclosed walls' },
        { id: 'single_slope', key: 'S', label: 'Mono-pitch', description: 'Single sloping plane' },
        { id: 'hip_roof',     key: 'H', label: 'Hip',      description: 'Four-sided hipped roof' },
      ],
      // §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699) — CLOSED. This row declared
      // `modeSource: 'tool-instance'` with a gap naming exactly this cure, and the
      // defect then reproduced the founder's report on 2026-08-07: the plan
      // handler read `window.roofTool.activeTool` through a two-branch ternary, so
      // region / single_slope / hip_roof all collapsed to RECTANGLE and BY REGION
      // was unreachable in plan view while this row claimed all five modes in both
      // views. The mode is now an activation argument recorded once in
      // `activeRoofDrawMode` and read identically by both surfaces.
      autoIn: ['plan', '3d'], modeSource: 'shared',
      gap: 'PARTIAL — mode and footprint reach both surfaces, but the roof TYPE, ' +
           'slope, overhang and thickness are still chosen in the 3D tool\'s ' +
           'confirming panel only; the plan surface derives them from the mode. ' +
           'Closing this needs a RoofToolConfigStore (the StairToolConfigStore / ' +
           'DoorToolConfigStore pattern) — staged engine plan, Stage 3.' },
    { tool: 'opening', label: 'Opening', views: ['plan', '3d'],
      modes: [
        { id: '2point',   key: '2', label: '2-Point',  description: 'Rectangular void by two corners' },
        { id: 'polyline', key: 'L', label: 'Polyline', description: 'Freeform void outline' },
      ],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT APPLICABLE — an opening is a deliberate void the architect positions ' +
           'in a specific host. There is no context to derive it from: an "auto opening" ' +
           'would be inventing holes in the building.' },

    // ── Hosted elements (C15) ────────────────────────────────────────────────
    { tool: 'door',   label: 'Door',   views: ['plan', '3d'],
      modes: [{ id: 'single', key: 'D', label: 'Single', description: 'Place one door in a wall' }],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-place-per-room mode from the UI (the batch/AI path has one).' },
    { tool: 'window', label: 'Window', views: ['plan', '3d'],
      modes: [{ id: 'single', key: 'W', label: 'Single', description: 'Place one window in a wall' }],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — as door.' },

    // ── Circulation ──────────────────────────────────────────────────────────
    // §FIX-STAIR-SHAPE-DESYNC — 'C' (curved) joined the shape set. The catalogue is
    // declared ONCE in `STAIR_SHAPES` (@pryzm/geometry-stair/stairPath/StairShapeRegistry);
    // the ARCHITECTURE palette, the stair-path param panel and this matrix are its faces.
    // NOTE: curved is authored by the stair-PATH arc gesture; the plan rectangle-drag
    // handler narrows 'C' → 'I' explicitly (StairPlanToolHandler), it does not silently
    // mislabel a straight run.
    // §FEAT-STAIR-CREATION-MODES (founder, 2026-08-19) — "I want the stairs to have
    // the possibility to decide if the creation is ORTHOGONAL or LINE … use the UI/UX
    // as the walls: MODE + STAIR TYPE."
    //
    // The two ids below are `WALL_DRAW_MODES`' own LINEAR and ORTHO declarations,
    // spread rather than retyped, so the stair bar and the wall bar cannot drift in
    // label or accelerator — the rule the slab and railing rows already follow.
    //
    // ⭐ THIS WAS A REACHABILITY DEFECT, NOT A MISSING FEATURE, AND SAYING SO MATTERS
    // MORE THAN THE FIX. Both modes were already BUILT on both surfaces:
    // `StairCreationController._drawingMode` (3D) snapped to 90° BY DEFAULT, and
    // `StairPathToolController._snapTo90` (plan) did the identical thing while SHIFT
    // was held. `StairToolConfigStore` already carried a `mode?: 'linear' | 'ortho'`
    // field. What was missing was any PICKER, any plan-side READ of that field, and
    // any declaration here — so the capability was committed, shipped, and reachable
    // by nobody. The row meanwhile claimed `modeSource: 'shared'`, which was
    // aspirational: the sole writer was the 3D setup panel's confirm.
    //
    // ⛔ CURVED IS NOT HERE, DELIBERATELY. 'C' is a SHAPE (see `shapes` below),
    // authored by the stair-path arc gesture. Adding a `curved` MODE would put one
    // letter on the bar meaning two different things — precisely the conflation this
    // split exists to remove. Whether a curved stair should ALSO be sketchable by an
    // arc-constrained mode is an OPEN QUESTION, stated as open in C98 §16 rather than
    // guessed at here.
    { tool: 'stair',      label: 'Stair',      views: ['plan', '3d'],
      modes: [LINEAR, ORTHO, BY_WALLS], shapes: STAIR_SHAPES, autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — no auto-place-in-circulation-core mode. The batch/house ' +
           'generators DO place stairs automatically (§CORRIDOR-STAIR-CONTIGUITY), so the ' +
           'capability exists; it is simply not offered as an interactive tool mode.' },
    // The dual-view reference implementation: ONE tool, a plan handler AND
    // StairPath3DToolHandler. Cited as the pattern, deliberately not edited here.
    { tool: 'stair-path', label: 'Stair path', views: ['plan', '3d'],
      modes: [LINEAR, ORTHO, BY_WALLS], shapes: STAIR_SHAPES, autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — as stair. This tool is the DUAL-VIEW REFERENCE ' +
           'IMPLEMENTATION (one tool, StairPathPlanToolHandler + StairPath3DToolHandler ' +
           'over one StairToolConfigStore); it is the pattern the single-view gaps below ' +
           'should copy.' },
    {
        // §FEAT-HANDRAIL-CREATION-PARITY (founder, 2026-08-18) — "I want it created
        // in the same way [as the wall] … BY LINE, ORTHO, CURVED, BY SLAB and add
        // SQUARE, CIRCULAR, ELLIPSE."
        //
        // The first three are WALL_DRAW_MODES spread verbatim, not retyped, so the
        // railing bar and the wall bar cannot drift apart in label or accelerator.
        // 'By Slab' is wall's ACTION, with wall's semantics: it consumes the current
        // SELECTION the instant it is picked, so it never takes the active-pill
        // highlight and sits after the bar's separator.
        //
        // The three closed-loop generators are MODES, not actions, and the
        // distinction is load-bearing: each is a two-click GESTURE on the canvas
        // (centre/corner, then rim/opposite corner), so the user must be able to
        // SEE which one is armed while they aim. Declaring them actions would strip
        // the highlight and leave the bar saying 'Linear' while the next click
        // starts a circle — the UI reporting the axis that did not change, which is
        // L-956's exact shape.
        //
        // Ids match `HandrailRunMode` in @pryzm/geometry-stair, which is the module
        // that turns each mode into real geometry — so the bar cannot offer a mode
        // the generator does not implement (§FIX-STAIR-SHAPE-DESYNC's lesson).
        tool: 'railing', label: 'Railing',
        views: ['plan', '3d'],
        modes: [
            ...WALL_DRAW_MODES,
            { id: 'byslab',   key: 'S', label: 'By Slab',  description: 'Guard the selected slab\u2019s perimeter', isAction: true },
            { id: 'square',   key: 'Q', label: 'Square',   description: 'Closed rectangular loop from two opposite corners' },
            { id: 'circular', key: 'R', label: 'Circular', description: 'Closed circular loop from centre and radius' },
            { id: 'ellipse',  key: 'E', label: 'Ellipse',  description: 'Closed elliptical loop from centre and bounding corner' },
        ],
        // 'byslab' IS the railing's derive-from-context mode: it takes its whole run
        // from an already-placed slab, exactly as wall's By Slab does.
        autoIn: ['plan', '3d'],
        modeSource: 'shared', // @pryzm/geometry-handrail/handrailAuthoring.ts (moved, L-1106)
    },
    {
        tool: 'lift', label: 'Lift',
        // §FIX-LIFT-UNREACHABLE (founder, 2026-08-22) — L-7020..L-7024 · C104 · ADR-0325.
        //
        //   "Lift — it should be under Architecture, but could not see it!"
        //
        // ⚠ THIS ROW USED TO READ `views: ['3d']` AND CALL THE PLAN ARM "the highest-
        // value next fix". It is now built, so the row moves — and the row and the
        // capability move TOGETHER, which is the rule this repo has broken five times
        // in a different file and is not breaking again here.
        //
        // `LiftPlanToolHandler` is in the shared plan registry, so BOTH plan surfaces
        // have it (L-73), and it dispatches `lift.create` — the C104 COMPOUND.
        views: ['plan', '3d'],
        // ⛔ NO MODE STRIP, DELIBERATELY. A lift is placed with ONE click, and the only
        // axis that varies — wall-hosted vs standalone-glass enclosure — is resolved
        // from the CURSOR (a wall within 1.5 m ⇒ hosted against it) because
        // `LiftCompoundSchema` refuses `wall-hosted` without a `hostWallId`. Offering a
        // "wall-hosted" pill with no wall under the cursor would be a control that
        // reports a capability the payload cannot carry — C84 EI-3, and the exact
        // §FIX-STAIR-SHAPE-DESYNC defect. The preview hint names which enclosure the
        // next click will place, so the choice is VISIBLE without being a fake control.
        modes: [],
        // No AUTO. Where a lift core goes is the architect's decision — the residential
        // and office generators place cores in BATCH, which is not a creation MODE of
        // this tool. "Not applicable" and "not implemented" are different answers (this
        // file's own rule), and this is the former.
        autoIn: [],
        modeSource: 'n/a',
        gap: '⭐ GAP (1) IS CLOSED — §FIX-LIFT-TWO-COMMANDS-ONE-NAME, L-7840, 2026-08-23. '
           + 'This string used to read: "THE 3-D ARM AND THE PLAN ARM CREATE DIFFERENT '
           + 'THINGS. `ToolManager.activateLift` drives the LEGACY MASSING command '
           + '`CreateVerticalCirculationCommand`, NOT `lift.create` … Collapsing the '
           + '3-D activator onto `lift.create` is L-7040." That collapse is DONE: '
           + '`ToolsAreaLayout.ts` now registers `runtime.tools`\' `lift` activator to '
           + '`activatePlanOnlyToolOrExplain(\'lift\', …)` — the SAME entry point both '
           + 'live create surfaces use — so the id `lift` names exactly ONE element (the '
           + 'C104 LOD-300 compound) in BOTH registries. C84 EI-9 satisfied. ⛔ The two '
           + 'ELEMENTS are still deliberately separate and must not be merged (C104 §1); '
           + 'only the NAME collision is closed, and the massing command keeps its real '
           + 'callers in the residential/office batch executors, which reach it directly '
           + 'rather than through a tool key. ⚠ `ToolManager.activateLift` now has zero '
           + 'production callers and is left in place (input-host is not this lane\'s), '
           + 'recorded as L-7841. (2) STILL OPEN: `ChatCommandClassification` classifies '
           + '`lift.create` class B, so the AI chat route still refuses it (L-5710) — '
           + 'though a chat route that DID reach `runtime.tools.activate(\'lift\')` would '
           + 'now get the compound rather than a massing box. (3) NEW, L-7822/L-7823: a '
           + 'STANDALONE-GLASS lift renders only its landing side. Three of its four '
           + 'enclosure sides are curtain walls and `curtainwall.created` is not a '
           + 'declared event anywhere; `CommandEventBridge` says so out loud per lift '
           + 'rather than dropping them silently.',
    },

    // ── Spatial + services ───────────────────────────────────────────────────
    { tool: 'room',      label: 'Room',      views: ['plan', '3d'],
      modes: [
        { id: 'detect',          key: 'D', label: 'Detect',   description: 'Auto-detect enclosed rooms on this level' },
        { id: 'manual-boundary', key: 'B', label: 'Boundary', description: 'Draw the room boundary by hand' },
        { id: 'point-pick',      key: 'P', label: 'Pick',     description: 'Click inside an enclosure to make it a room' },
      ],
      autoIn: ['plan', '3d'], modeSource: 'shared' },
    { tool: 'furniture', label: 'Furniture', views: ['plan', '3d'], modes: [], autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED from the UI — auto-furnish exists as a batch/AI executor (D-FLE), not a tool mode.' },
    {
        // §COMPONENT-PLACE-TOOL (lane U1, UIUX-PLAN §U1) · ADR-0376 D9/D10 — the
        // click-to-place tool for `.pryzm-family` COMPONENT occurrences, arming the
        // `component.place` verb that had been LIVE-but-unarmed since Phase 4C.
        // The definition/type pair comes from the Components browser via
        // `activeComponentPlacement.ts` (shared store — the L-239-family lesson).
        //
        // PLAN ONLY, DELIBERATELY, while lane 4E's production viewport leg is
        // descoped (ADR-0376 D10): a placed component has no 3-D mesh in the main
        // viewport yet (`ComponentCommitter` is not mounted at this reading), so a
        // 3-D placement arm would place elements the view cannot show — the
        // founder's "reports activation, activates nothing" defect with extra
        // steps. When 4E's mount lands, the 3-D arm needs a `ToolManager`
        // activator + key, declared here as the gap.
        tool: 'component', label: 'Component', views: ['plan'],
        // No mode strip: a component is a single-click insertion; HOW it sketches
        // is not a variable of this tool (the definition owns its geometry). The
        // one live modifier — SPACE to rotate — is named on the overlay hint
        // (the §LIFT94 rule).
        modes: [],
        // No AUTO: where a component goes is the architect's decision; nothing
        // derives placements from context. "Not applicable", not "not implemented".
        autoIn: [],
        modeSource: 'n/a',
        gap: 'OPEN (UIUX-PLAN §U1/D10): 3-D placement waits for lane 4E\'s viewport '
           + 'mount — `ComponentCommitter` is committed but not registered on the '
           + 'production render path, so a 3-D arm would place invisible elements. '
           + 'When it mounts, add the ToolManager key + 3-D tool and move this row '
           + 'to both views. Hosted placement (`hostId`) stays OFF separately: the '
           + 'payload field is INERT while ADR-0376 D11 is open (refusal register R-d).',
    },
    { tool: 'plumbing',  label: 'Plumbing fixture', views: ['plan', '3d'],
      modes: [
        { id: 'toilet', key: 'T', label: 'WC',     description: 'Place a WC' },
        { id: 'sink',   key: 'S', label: 'Basin',  description: 'Place a wash basin' },
        { id: 'shower', key: 'H', label: 'Shower', description: 'Place a shower tray' },
        { id: 'bath',   key: 'B', label: 'Bath',   description: 'Place a bath' },
      ],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT IMPLEMENTED — auto-fit-to-wet-room exists in the deterministic furnish ' +
           'engine (D-FLE) as a batch executor, not as a tool mode in either view.' },
    {
        tool: 'bathroom-pod', label: 'Bathroom Pod',
        // §BATH102 (L-11480) · C109 — the LOD-300 PARAMETRIC bathroom module the
        // founder asked for: "CREATE LOD 300 TOILET COMPOUNDS - MODULES - PARAMETRIC
        // ... ADD THIS NEW CATEGORY IN SERVICES."
        //
        // ⛔ C109 R-11 — THIS ROW NAMES ONE OBJECT AND DOES NOT SHADOW THE FOUR ABOVE.
        // The SERVICES palette already offers Bath / Toilet / Sink / Shower as
        // individual fixtures (the `plumbing` row above). The pod is a FIFTH,
        // differently-named row that produces a COMPOUND; the four single-fixture
        // rows remain the way an architect places one basin.
        //
        // PLAN ONLY, and that is "not applicable" rather than "not implemented":
        // the gesture is a room RECTANGLE (C109 §5.1 — the envelope is the question
        // the solver is asked, and it is STORED), which is a plan gesture. A 3-D arm
        // would have to invent the envelope from the walls near the cursor, which is
        // a number the architect did not state.
        views: ['plan'],
        // ⛔ NO MODE STRIP, DELIBERATELY. The arrangement (`single-wall` / `l-shaped`)
        // is DERIVED by the solver from the room (C109 §4) — never chosen. An
        // "L-shaped" pill would be a control reporting a capability the payload cannot
        // carry (C84 EI-3, the §FIX-STAIR-SHAPE-DESYNC defect), and it would let an
        // architect pick the more-expensive-to-build arrangement when the cheap one
        // fits, which C109 §5.3 forbids the solver itself from doing. The two axes
        // that DO vary — which edge is the wet wall, and which end the shower takes —
        // are SPACE and H, and both are named on the overlay (the §LIFT94 rule: a
        // modifier nobody is told about is indistinguishable from one that does not
        // exist).
        modes: [],
        // No AUTO. Where a bathroom goes is the architect's decision; the apartment
        // and house generators place wet rooms in BATCH, which is not a creation MODE
        // of this tool. "Not applicable" and "not implemented" are different answers.
        autoIn: [],
        modeSource: 'n/a',
        gap: 'OPEN (C109 §11): (1) axis 7 — the pod\'s MEMBERS do not yet reach the '
           + 'legacy fixture store, so they have no 3-D mesh, no plan symbol, no '
           + 'elevation symbol and no IFC row (L-11484). (2) axis 8 — '
           + '`ChatCommandClassification.ts` classifies unknown verbs class B, so the '
           + 'AI chat route refuses `bathroomPod.create`, the identical state C104 §10 '
           + 'axis 4 records for the lift (L-11407). (3) a saved-and-reloaded project '
           + 'keeps every MEMBER and loses the PARENT — `ProjectSerializer` serialises '
           + 'the legacy plumbing store and knows nothing about pods (L-11405).',
    },
    {
        // §LIGHT121 (L-11900, founder: "Lighting creation in plan view has no
        // preview available, neither preview in 3D") — CLOSED for BOTH views.
        //
        // ⚠ THIS ROW USED TO READ `views: ['plan']`, THE OPPOSITE OF WHAT WAS
        // ACTUALLY BROKEN. It reasoned correctly that `ToolManager` published no
        // 'lighting' key, but concluded from that alone that 3D placement could
        // not work — without tracing that the create-rail panel drove
        // `window.lightingTool.activate()` DIRECTLY, attaching pointer listeners
        // straight to the 3D canvas, entirely independent of ToolManager. 3D
        // placement therefore DID work (which is why the founder saw a ghost
        // fixture in 3D at all — just badly coloured, a separate fix); PLAN was
        // the view with NO route at all, because `PlanViewToolOverlay` /
        // `SvpPlanToolOverlay` arm a `PlanToolHandler` by subscribing to
        // `ToolManager.getActiveTool()`, and that string could never become
        // 'lighting' with no activator to set it. A registry-only reading of this
        // gap got the AFFECTED VIEW backwards; tracing the actual call site is
        // what found it.
        //
        // Fixed: `ToolManager.activateLighting(type)` (mirrors `activateFurniture`
        // exactly) now publishes the 'lighting' key AND drives the 3D tool in one
        // call; `CreateRailPanelLighting.ts`'s card click routes through it instead
        // of touching `window.lightingTool` by hand.
        tool: 'lighting', label: 'Lighting fixture',
        views: ['plan', '3d'], modes: [], autoIn: [], modeSource: 'n/a',
        gap: 'AUTO NOT IMPLEMENTED from either interactive view — auto-layout exists ' +
             'only as a batch/AI executor (LightingLayoutExecutor), not as a tool mode ' +
             'a click can reach in plan or 3D.',
    },
    { tool: 'grid', label: 'Grid', views: ['plan', '3d'],
      modes: [
        { id: 'single',      key: 'S', label: 'Single',      description: 'One grid line between two points' },
        { id: 'rectangular', key: 'R', label: 'Rectangular', description: 'Generate an orthogonal grid from spacings' },
        { id: 'radial',      key: 'A', label: 'Radial',      description: 'Generate a radial grid from a centre' },
      ],
      autoIn: [], modeSource: 'shared',
      gap: 'NOT APPLICABLE — a structural grid IS the datum the architect declares; ' +
           'there is no prior context to derive it from. The `rectangular` and `radial` ' +
           'modes already generate a whole grid from parameters, which is the useful ' +
           'sense of "auto" here.' },
] as const;

/** Lookup by tool key. */
export function creationCapability(tool: string): ElementCreationCapability | undefined {
    return ELEMENT_CREATION_MATRIX.find(c => c.tool === tool);
}

/**
 * The mode ids a tool offers — the list `DrawingModeBar` renders and the specs
 * assert against. Empty for a tool with a single implicit mode (no bar).
 */
export function creationModeIds(tool: string): readonly string[] {
    return creationCapability(tool)?.modes.map(m => m.id) ?? [];
}

/** The modes a tool offers, ready for the bar. */
export function creationModes(tool: string): readonly CreationMode[] {
    return creationCapability(tool)?.modes ?? [];
}

/**
 * §STAIR-TWO-AXES — the SHAPES a tool offers, for the shape picker. Empty for every
 * family whose only axis is the mode.
 *
 * ⛔ Never concatenate this with `creationModes(tool)`. Two axes on one strip is the
 * defect the `shapes` field was introduced to prevent.
 */
export function creationShapes(tool: string): readonly CreationMode[] {
    return creationCapability(tool)?.shapes ?? [];
}

/**
 * Families declaring BOTH axes. A row here must render TWO controls, never one
 * merged strip — this is the list a UI reviewer should check against the screen.
 */
export function twoAxisCapabilities(): readonly ElementCreationCapability[] {
    return ELEMENT_CREATION_MATRIX.filter(c => (c.shapes?.length ?? 0) > 0);
}

/** Every declared capability that does not yet serve BOTH views — the open holes. */
export function dualViewGaps(): readonly ElementCreationCapability[] {
    return ELEMENT_CREATION_MATRIX.filter(c => c.views.length < 2);
}

/** Every capability whose mode lives on a 3D tool instance — latent AUTO-desync. */
export function modeDesyncRisks(): readonly ElementCreationCapability[] {
    return ELEMENT_CREATION_MATRIX.filter(c => c.modeSource === 'tool-instance');
}
