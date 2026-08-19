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
     * the same y" refine stays satisfied. Every renderer derives `worldY` from
     * `level.elevation` at build time, so a family without this field is not
     * missing anything. Do not add one "for symmetry" — an elevation carried in
     * a payload is a second copy of a number the level store already owns, and
     * §L-1010/L-1012 is what happens when a view-space Y gets latched as a model
     * Y.
     */
    readonly elevationField?: string;
    /**
     * The `normalizeType()` outputs (see
     * `apps/editor/src/ui/property-panel/PropertyDescriptorGenerator.ts`) that
     * resolve to this family. The panel matches on these, so a family whose mesh
     * `userData` spells its type two ways lists both. Lower-case.
     */
    readonly panelTypes: readonly string[];
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
    },
    'roof.changeLevel': {
        kind: 'roof',
        verb: 'roof.changeLevel',
        idField: 'roofId',
        levelField: 'levelId',
        panelTypes: ['roof'],
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
    },
    'column.changeLevel': {
        kind: 'column',
        verb: 'column.changeLevel',
        idField: 'columnId',
        levelField: 'levelId',
        panelTypes: ['column'],
    },
    'beam.changeLevel': {
        kind: 'beam',
        verb: 'beam.changeLevel',
        idField: 'beamId',
        levelField: 'levelId',
        panelTypes: ['beam'],
    },
    'ceiling.changeLevel': {
        kind: 'ceiling',
        verb: 'ceiling.changeLevel',
        idField: 'ceilingId',
        levelField: 'levelId',
        panelTypes: ['ceiling'],
    },
    'floor.changeLevel': {
        kind: 'floor',
        verb: 'floor.changeLevel',
        idField: 'floorId',
        levelField: 'levelId',
        panelTypes: ['floor'],
    },
    'furniture.changeLevel': {
        kind: 'furniture',
        verb: 'furniture.changeLevel',
        idField: 'furnitureId',
        levelField: 'levelId',
        panelTypes: ['furniture'],
    },
    'lighting.changeLevel': {
        kind: 'lighting',
        verb: 'lighting.changeLevel',
        idField: 'lightingId',
        levelField: 'levelId',
        panelTypes: ['lighting'],
    },
    'plumbing.changeLevel': {
        kind: 'plumbing',
        verb: 'plumbing.changeLevel',
        idField: 'plumbingId',
        levelField: 'levelId',
        panelTypes: ['plumbing'],
    },
    'handrail.changeLevel': {
        kind: 'handrail',
        verb: 'handrail.changeLevel',
        idField: 'handrailId',
        levelField: 'levelId',
        panelTypes: ['handrail'],
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
