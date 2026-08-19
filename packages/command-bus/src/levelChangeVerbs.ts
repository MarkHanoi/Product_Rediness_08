/**
 * §L-1032 — THE LEVEL-CHANGE VERB REGISTER. One row per element family, and it
 * is the ONLY place the answer to *"can this family change storey, and by which
 * verb?"* is written down.
 *
 * ─── WHY THIS EXISTS, AND WHY IT IS AT L1 ────────────────────────────────────
 * Before this file the same answer was spelled in three places that could not
 * see each other:
 *
 *   1. `LEVEL_CHANGE_VERBS` inside `packages/runtime-composer/src/CommandEventBridge.ts`
 *      — verb → `element.level-changed` event fields.
 *   2. `LEGACY_LEVEL_MOVERS` inside `apps/editor/src/engine/elementLevelChangedMirror.ts`
 *      — element kind → the legacy store that owns the move.
 *   3. `elType === 'wall'`, a HARD-CODED STRING, in
 *      `apps/editor/src/ui/property-panel/PropertyPanelSections.ts` — which
 *      family the panel offers the control for.
 *
 * (3) is the founder's L-1032 report in its entirety. `roof.changeLevel` had
 * been a live, undoable, correctly-cascading verb since S11 and **no control
 * anywhere dispatched it**, because the panel's eligibility test was a literal
 * rather than a lookup. §committed-is-not-reachable, in the property panel.
 *
 * C84 **EI-9** (one authority per question) is what forbids re-deriving this in
 * a fourth place, and C84 **EI-3** — *what the UI offers, the pipeline must
 * accept*, and its converse — is what makes the panel's copy a defect rather
 * than a duplication smell. So the register moves DOWN to L1, where the L3
 * bridge, the L7 panel and the L7 chat registration can all read the same rows.
 *
 * L1 is the lowest layer that all three consumers can reach:
 *   • `@pryzm/runtime-composer` (L3) already depends on `@pryzm/command-bus`.
 *   • `apps/editor` (L7) already depends on `@pryzm/command-bus`.
 *   • This module imports NOTHING — no Zod, no THREE, no DOM — so adding it
 *     cannot pull a barrel into either consumer. That constraint is load-bearing
 *     and is the same one `elementLevelChangedMirror.ts` documents for itself.
 *
 * ─── WHAT A ROW MEANS ────────────────────────────────────────────────────────
 * A row in `LEVEL_CHANGE_VERBS` is a CLAIM, in four parts, and all four must
 * hold before the row is added:
 *
 *   a. a bus verb exists and is registered (`plugins/<f>/src/handlers/index.ts`);
 *   b. the LEGACY store the renderer reads exposes `changeLevel(id, levelId)` —
 *      **not** merely an `update()` that tolerates a `levelId` key. See the
 *      REFUSALS note below for why that distinction is a safety property and
 *      not a style preference;
 *   c. `CommandEventBridge` can build an `element.level-changed` event from the
 *      verb's payload using `idField`/`levelField`;
 *   d. `elementLevelChangedMirror` has a `LEGACY_LEVEL_MOVERS` entry for `kind`.
 *
 * A row present without (b) is worse than no row: `elementUndoStoreAdapter`'s
 * §L-946 arm tests `typeof store.changeLevel === 'function'` before routing a
 * `levelId` inverse patch, and a family that fails that test falls through to
 * the GENERIC `update(id, {levelId})` write — which for a REPLACE store is the
 * L-977 annihilation shape. **Ctrl+Z after a level change would destroy the
 * element.** Never add a row before the store method.
 *
 * ─── AND WHY THE REFUSALS ARE DATA, NOT ABSENCE ──────────────────────────────
 * The honest end state L-1032 asks for is *"every family either offers the
 * control or declares why it must not"* — not *"every family has a dropdown"*.
 * A hosted element has **no independent level** ([C15 §2]) and a dropdown on a
 * door would be a DEFECT. So the families that must NOT gain the control are
 * enumerated in `LEVEL_CHANGE_REFUSALS` **with the clause that decides each**,
 * because a family that is simply missing from both tables is indistinguishable
 * from one nobody looked at — the blank-reads-as-fine failure C84 EI-1b names.
 */

/** How one family's level-change verb spells its payload. */
export interface LevelChangeVerbSpec {
    /** The element family, as `elementLevelChangedMirror`'s store table keys it. */
    readonly kind: string;
    /** The registered bus verb. */
    readonly verb: string;
    /** Payload field naming the element. */
    readonly idField: string;
    /** Payload field naming the destination level. */
    readonly levelField: string;
    /**
     * Optional payload field carrying the destination level's elevation.
     *
     * Only `wall.changeLevel` has one, and it is NOT a datum the mirror uses:
     * the wall handler rebases `baseLine.y` so the L0 schema's "endpoints share
     * the same y" refine stays satisfied.
     *
     * ⚠ **CORRECTED 2026-08-19, BEFORE SHIPPING.** This comment previously read
     * *"Every renderer derives `worldY` from `level.elevation` at build time, so
     * a family without this field is not missing anything."* **That is FALSE for
     * four of the twelve families**, and it was written from the wall/slab/roof
     * builders rather than measured across all of them — the §fake-more-capable
     * -than-real shape, inverted: a claim generalised from the three cases that
     * happen to satisfy it. See `heightFollowsLevel` below for the measurement
     * and for what the four cost.
     *
     * Do not add an `elevationField` "for symmetry" — an elevation carried in a
     * payload is a second copy of a number the level store already owns, and
     * §L-1010/L-1012 is what happens when a view-space Y gets latched as a model
     * Y. The fix for the four is to resolve `level.elevation` **from the level
     * authority at both ends** (forward mirror and undo adapter both already
     * hold a `bimManager` handle), never to ship the number through a payload.
     */
    readonly elevationField?: string;
    /**
     * The `normalizeType()` outputs (see
     * `apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts`) that
     * resolve to this family. The panel matches on these, so a family whose mesh
     * `userData` spells its type two ways lists both. Lower-case.
     */
    readonly panelTypes: readonly string[];
    /**
     * MEASURED 2026-08-19: does the element's **3-D height** follow the storey
     * change, or only its storey ASSIGNMENT?
     *
     * A family whose fragment builder re-derives `worldY` from
     * `bimManager.getLevelById(levelId).elevation` moves in 3-D for free — the
     * storey change IS the height change. A family whose builder seats the mesh
     * at an **absolute Y stamped into the record at create time** does not: the
     * element is re-filed on the new storey, appears on the new plan, exports
     * under the new storey in IFC — and goes on hovering at the OLD floor's
     * height in the 3-D view.
     *
     * **Every row in this table has `true`.** The four families measured `false`
     * are in `LEVEL_CHANGE_REFUSALS` with `disposition: 'deferred'` instead,
     * because a control that silently produces a wrong height is worse than no
     * control: *"A refusal is a correct answer; a silently-wrong wall is not"*
     * (`WallRake.ts:50-62`, the sentence C84 is built on). The field is kept on
     * the interface anyway so the next family added must ANSWER the question
     * rather than inherit an assumption.
     */
    readonly heightFollowsLevel: true;
    /** `file:line` of the builder line that settles `heightFollowsLevel`. */
    readonly heightEvidence: string;
}

/**
 * THE REGISTER. Keyed by bus verb, because that is the key
 * `CommandEventBridge.emitLevelChange` looks up on every dispatched command.
 */
export const LEVEL_CHANGE_VERBS: Readonly<Record<string, LevelChangeVerbSpec>> = {
    'wall.changeLevel': {
        kind: 'wall',
        verb: 'wall.changeLevel',
        idField: 'id',
        levelField: 'newLevelId',
        elevationField: 'newElevationY',
        panelTypes: ['wall'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-wall/src/WallFragmentBuilder.ts:728 - worldY derived from level.elevation',
    },
    'roof.changeLevel': {
        kind: 'roof',
        verb: 'roof.changeLevel',
        idField: 'roofId',
        levelField: 'levelId',
        panelTypes: ['roof'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-roof/src/RoofStore.ts:145-147 - RoofFragmentBuilder._updateRoofSync re-derives worldY = getLevelById(levelId).elevation + baseOffset on EVERY update',
    },
    // §L-1032 — the founder's named case. `slabStore.changeLevel` is the
    // dedicated move (`packages/geometry-slab/src/SlabStore.ts`); `SlabStore.update`
    // is a WHOLE-RECORD REPLACE and must never be handed a `{levelId}` partial.
    'slab.changeLevel': {
        kind: 'slab',
        verb: 'slab.changeLevel',
        idField: 'slabId',
        levelField: 'levelId',
        panelTypes: ['slab'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-slab/src/SlabFragmentBuilder.ts:726 - topY = level.elevation + baseOffset',
    },
    'column.changeLevel': {
        kind: 'column',
        verb: 'column.changeLevel',
        idField: 'columnId',
        levelField: 'levelId',
        panelTypes: ['column'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-column/src/ColumnFragmentBuilder.ts:208 - this.bimManager.getLevelById(column.levelId)',
    },
    'ceiling.changeLevel': {
        kind: 'ceiling',
        verb: 'ceiling.changeLevel',
        idField: 'ceilingId',
        levelField: 'levelId',
        panelTypes: ['ceiling'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-slab/src/ceiling/CeilingPanelBuilder.ts:192 - this._bimManager?.getLevelById(ceiling.levelId)',
    },
    'floor.changeLevel': {
        kind: 'floor',
        verb: 'floor.changeLevel',
        idField: 'floorId',
        levelField: 'levelId',
        panelTypes: ['floor'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-slab/src/floor/FloorPanelBuilder.ts:93,126 - top face at FFL = level.elevation + boundary.baseOffset',
    },
    'handrail.changeLevel': {
        kind: 'handrail',
        verb: 'handrail.changeLevel',
        idField: 'handrailId',
        levelField: 'levelId',
        panelTypes: ['handrail'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-stair/src/HandrailFragmentBuilder.ts:237-238 - const level = bimManager.getLevelById(levelId); elevation = level.elevation',
    },
    'curtainWall.changeLevel': {
        kind: 'curtainWall',
        verb: 'curtainWall.changeLevel',
        idField: 'curtainWallId',
        levelField: 'levelId',
        // `normalizeType()` folds 'curtain-wall' and 'curtainwall' to
        // 'curtainwall'; the mesh also stamps the parts separately, and a part is
        // NOT independently movable — only the assembly is listed.
        panelTypes: ['curtainwall'],
        heightFollowsLevel: true,
        heightEvidence: 'packages/geometry-curtain-wall/src/CurtainWallBuilder.ts:1092 - worldY = level.elevation + cw.baseOffset',
    },
} as const;

/** Why a family does NOT get the control, and the clause that decides it. */
export interface LevelChangeRefusal {
    /** The element family. */
    readonly kind: string;
    /** `normalizeType()` outputs that resolve to this family. */
    readonly panelTypes: readonly string[];
    /** Shown to the user in place of the control. One sentence, no jargon. */
    readonly reason: string;
    /** The governing contract clause. */
    readonly clause: string;
    /** `file:line` establishing the refusal in code, measured 2026-08-19. */
    readonly evidence: string;
    /**
     * `'structural'` — the record cannot express an independent storey, so the
     * verb is not merely absent but MEANINGLESS. `'deferred'` — the record CAN
     * express it but the semantics are undecided; these are the rows that must
     * shrink, and each names what would settle it.
     */
    readonly disposition: 'structural' | 'deferred';
}

/**
 * THE DECLARED ABSENCES. C84 EI-1b: a family that is conformant-by-refusal is
 * RECORDED, never left blank — *"a blank reads as 'fine' and is
 * indistinguishable from 'nobody looked'."*
 */
export const LEVEL_CHANGE_REFUSALS: Readonly<Record<string, LevelChangeRefusal>> = {
    // ── STRUCTURAL — the record has no independent storey to change ──────────
    door: {
        kind: 'door',
        panelTypes: ['door'],
        reason: 'A door belongs to its host wall. Move the wall and the door goes with it.',
        clause: 'C15 §2 (a hosted element "has no independent world-space coordinate in the store") · C86 §12 R-8 records "no level-change verb" as CORRECT',
        evidence: 'packages/schemas/src/elements/Door.ts (no `levelId` field at all) · packages/geometry-door/src/DoorTypes.ts:46 (`wallId` is the host field)',
        disposition: 'structural',
    },
    window: {
        kind: 'window',
        panelTypes: ['window'],
        reason: 'A window belongs to its host wall. Move the wall and the window goes with it.',
        clause: 'C15 §2 · C86 §12 R-8',
        evidence: 'packages/schemas/src/elements/Window.ts (no `levelId` field at all) · packages/geometry-window/src/WindowTypes.ts:29 (`wallId`)',
        disposition: 'structural',
    },
    grid: {
        kind: 'grid',
        panelTypes: ['grid'],
        reason: 'Grids are project-wide — they appear on every storey and belong to none.',
        clause: 'C84 EI-1b (a clean family is RECORDED clean)',
        evidence: 'packages/core-app-model/src/BimKernel.ts:50-85 — the `Grid` interface declares no `levelId`, `baseLevelId` or `parentId`',
        disposition: 'structural',
    },
    annotation: {
        kind: 'annotation',
        panelTypes: ['annotation'],
        reason: 'An annotation belongs to the view it was drawn on, not to a storey.',
        clause: 'C84 EI-1b',
        evidence: 'plugins/annotations/src/subsystem/AnnotationTypes.ts:158 — the scoping field is `ownerViewId`; there is no `levelId`',
        disposition: 'structural',
    },
    dimension: {
        kind: 'dimension',
        panelTypes: ['dimension'],
        reason: 'A dimension belongs to the view it was drawn on; its level follows the elements it measures.',
        clause: 'C84 EI-1b',
        evidence: 'packages/schemas/src/annotation/dimension.ts:165 (`viewId`, required) vs :166 (`levelId`, OPTIONAL)',
        disposition: 'structural',
    },
    room: {
        kind: 'room',
        panelTypes: ['room'],
        reason: 'Rooms are detected from the walls around them. Move the walls and the room is re-detected on the new storey.',
        clause: 'C84 EI-1 (one authority per family — for `room` the authority is wall topology, not a user-authored `levelId`)',
        evidence: 'packages/room-topology/src/RoomStore.ts:302-304 — `update()` THROWS when `levelId` differs, deliberately; rooms are produced by `REDETECT_ROOMS` per level',
        disposition: 'structural',
    },

    // ── DEFERRED — expressible, but the semantics are not decided ────────────
    stair: {
        kind: 'stair',
        panelTypes: ['stairs'],
        reason: 'A stair spans two storeys. Which end a "change level" should move is not decided yet, so the control is withheld rather than guessing.',
        clause: 'C16 CA-18 (a verb that cannot commit must REFUSE and name why) · C98 §12',
        evidence: 'packages/geometry-stair/src/StairTypes.ts:148-150 — `levelId` AND `baseLevelId` AND `topLevelId`; a single-target move is ambiguous by construction',
        disposition: 'deferred',
    },
    lift: {
        kind: 'lift',
        panelTypes: ['lift'],
        reason: 'A lift spans a range of storeys. Which end a "change level" should move is not decided yet, so the control is withheld rather than guessing.',
        clause: 'C16 CA-18',
        evidence: 'packages/geometry-lift/src/LiftTypes.ts:54-57 — `levelId`, `baseLevelId`, `topLevelId`',
        disposition: 'deferred',
    },
    // ── DEFERRED — THE VERB AND THE STORE MOVE ARE BUILT AND CORRECT; THE 3-D ──
    //    HEIGHT DOES NOT FOLLOW, SO THE CONTROL IS WITHHELD (L-1087).
    //
    // These four have a registered bus verb, a legacy `changeLevel`, and a
    // passing undo route. They are NOT offered anyway, and the reason is the
    // whole point of this table.
    //
    // MEASURED 2026-08-19: their fragment builders seat the mesh at an ABSOLUTE
    // Y stamped into the record at create time, not at a Y re-derived from
    // `level.elevation`. So a storey change re-files the element, moves it onto
    // the new plan and exports it under the new IFC storey — while the 3-D mesh
    // goes on hovering at the OLD floor's height. Nothing reports a failure.
    //
    // That is a SILENTLY-WRONG element, and it is the one outcome this repo's
    // governing sentence forbids: *"A refusal is a correct answer; a
    // silently-wrong wall is not"* (`WallRake.ts:50-62`). Offering the dropdown
    // would have satisfied the letter of the founder's request and produced a
    // chair floating under its own floor.
    //
    // ⚠ DO NOT "FIX" THIS BY ADDING AN `elevationField` TO THE PAYLOAD. The
    // destination elevation is a number the LEVEL STORE already owns; shipping a
    // copy of it through a command payload is the second-copy defect, and
    // §L-1010/L-1012 is what happens when a Y from the wrong space gets latched
    // as the model Y. THE EXIT: resolve `level.elevation` from `bimManager` at
    // BOTH ends — `elementLevelChangedMirror` on the forward path and
    // `elementUndoStoreAdapter`'s §L-946 arm on the inverse, both of which
    // already hold a `bimManager` handle — and re-seat `position.y` there. Then
    // move these four rows back into `LEVEL_CHANGE_VERBS` with
    // `heightFollowsLevel: true` and the new evidence.
    beam: {
        kind: 'beam',
        panelTypes: ['beam'],
        reason: 'Moving a beam between storeys is not connected yet — it would be re-filed on the new level but stay at its current height.',
        clause: 'C16 CA-18 · C84 EI-3 (an affordance without an implementation behind it is the defect, not the feature)',
        evidence: 'packages/geometry-beam/src/BeamFragmentBuilder.ts:405 — `root.position.set(centre.x, centre.y, centre.z)` from the baseLine’s absolute Y; the file contains NO `getLevelById` call at all',
        disposition: 'deferred',
    },
    furniture: {
        kind: 'furniture',
        panelTypes: ['furniture'],
        reason: 'Moving furniture between storeys is not connected yet — it would be re-filed on the new level but stay at its current height.',
        clause: 'C16 CA-18 · C84 EI-3',
        evidence: 'packages/geometry-furniture/src/furnitureElevation.ts:33-35 — `furnitureWorldY(floorY, mountOffset) = floorY + mountOffset`, where `floorY` is `data.position.y`, an absolute stored value (`FurnitureFragmentBuilder.ts:150,279`)',
        disposition: 'deferred',
    },
    lighting: {
        kind: 'lighting',
        panelTypes: ['lighting'],
        reason: 'Moving a light between storeys is not connected yet — it would be re-filed on the new level but stay at its current height.',
        clause: 'C16 CA-18 · C84 EI-3',
        evidence: 'packages/geometry-lighting/src/LightingFragmentBuilder.ts — seats the group at the record’s absolute position; no `getLevelById` in the file. Lighting has a SECOND blocker too: `LightingStore.update` emits only the legacy `_bus`, never `storeEventBus`, so no semantic subscriber sees a lighting mutation at all',
        disposition: 'deferred',
    },
    plumbing: {
        kind: 'plumbing',
        panelTypes: ['plumbing'],
        reason: 'Moving a plumbing fixture between storeys is not connected yet — it would be re-filed on the new level but stay at its current height.',
        clause: 'C16 CA-18 · C84 EI-3',
        evidence: 'packages/geometry-plumbing/src/PlumbingFragmentBuilder.ts:88 — `root.position.copy(data.position)`, the record’s absolute position; no `getLevelById` in the file',
        disposition: 'deferred',
    },
    pool: {
        kind: 'pool',
        panelTypes: ['pool'],
        reason: 'Pools have no persistent record of their own yet, so there is nothing to move.',
        clause: 'C84 EI-6 (persistence is not optional, and absence must be loud)',
        evidence: 'packages/geometry-pool/src/ — contains PoolAssembly.ts, PoolDimensions.ts, index.ts and NO store; there is no `window.poolStore` anywhere (L-980 removed the four dead undo keys that pretended otherwise)',
        disposition: 'deferred',
    },
} as const;

/** Normalise a panel/mesh element-type spelling for table lookup. */
function _norm(rawType: string): string {
    return (rawType ?? '').toLowerCase().trim();
}

/**
 * The level-change spec for a panel element type, or `null`.
 *
 * `null` is NOT "this family may not change level" — call
 * `levelChangeRefusalFor()` to distinguish a declared refusal from a family
 * nobody has looked at. The panel MUST show the refusal's `reason` rather than
 * silently omitting the row: an absent control and a withheld control look
 * identical to a user, which is the §context-data-honesty failure.
 */
export function levelChangeSpecFor(panelElementType: string): LevelChangeVerbSpec | null {
    const t = _norm(panelElementType);
    if (t.length === 0) return null;
    for (const spec of Object.values(LEVEL_CHANGE_VERBS)) {
        if (spec.panelTypes.includes(t)) return spec;
    }
    return null;
}

/** The declared refusal for a panel element type, or `null` if none is declared. */
export function levelChangeRefusalFor(panelElementType: string): LevelChangeRefusal | null {
    const t = _norm(panelElementType);
    if (t.length === 0) return null;
    for (const refusal of Object.values(LEVEL_CHANGE_REFUSALS)) {
        if (refusal.panelTypes.includes(t)) return refusal;
    }
    return null;
}

/**
 * Build the dispatch payload for a level change, using the family's own field
 * spelling. Returns the payload only — the caller owns the dispatch, so this
 * stays a pure value a test can execute.
 *
 * §FIX-COPY-PAYLOAD-FIELD-NAMES (L-978) is why this is a function and not four
 * object literals at four call sites: a key the receiving payload interface does
 * not accept is not "extra", it is a value silently replaced by a schema default,
 * and no test could reach the literals inside the dispatching closure.
 */
export function buildLevelChangePayload(
    spec: LevelChangeVerbSpec,
    elementId: string,
    newLevelId: string,
    newElevationY?: number,
): Readonly<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
        [spec.idField]: elementId,
        [spec.levelField]: newLevelId,
    };
    if (spec.elevationField !== undefined && typeof newElevationY === 'number' && Number.isFinite(newElevationY)) {
        payload[spec.elevationField] = newElevationY;
    }
    return payload;
}

/** Every bus verb in the register. Used by the chat-coverage and verb-register gates. */
export function levelChangeVerbs(): readonly string[] {
    return Object.keys(LEVEL_CHANGE_VERBS);
}
