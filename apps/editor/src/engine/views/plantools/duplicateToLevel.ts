/**
 * §L-1032 DUPLICATE-TO-LEVEL — *"Duplicate slab from Level 1 to Level 2"*, and
 * the ONE place the answer to *"may this family be duplicated onto another
 * storey, and by which verb?"* is written down.
 *
 * ═══ WHAT THIS IS ═══════════════════════════════════════════════════════════
 * **The existing plan COPY, with a zero delta and a level override.** Not a
 * paraphrase of it — literally `copyPayloads.ts`'s builders called with
 * `dx = dz = 0` and `opts.levelId` set. Everything below is routing, minting and
 * refusing; the legacy-record → bus-payload MAPPING is not re-expressed here at
 * all, and must never be.
 *
 * ─── WHY IT IS THE COPY AND NOT A NEW MAPPING ───────────────────────────────
 * C84 **EI-9** — one authority per question. The question *"what does a legacy
 * `SlabData` look like as a `slab.create` payload?"* already has an answer, and
 * it is a hard-won one: **L-978** is what a SECOND answer costs. Four field
 * names on one of two curtain-wall dispatches (`start`, `end`, `gridXSpacing`,
 * `gridYSpacing`) that `CreateCurtainWallPayload` does not accept minted every
 * copied curtain wall at the schema's default baseLine `(0,0,0)→(4,0,0)` with
 * default bays — for months, with no error at all, because a key the receiver
 * does not accept is not "extra", it is a value silently replaced by a default.
 * The same sweep found a dropped wall `baseLine.y` (ZodError into a `.catch()`,
 * so NO wall was created), a zero-area slab boundary (every copied slab
 * REFUSED), and an object-shaped furniture rotation. Four defects, one cause: a
 * mapping typed out twice.
 *
 * So this module owns THREE things and no fourth:
 *   1. `DUPLICATE_TO_LEVEL`          — which families may, and their verb;
 *   2. `DUPLICATE_TO_LEVEL_REFUSALS` — which may NOT, and the clause that says so;
 *   3. `duplicateToLevel()`          — resolve → mint → build → dispatch.
 *
 * ─── WHY IT READS THE *LEGACY* STORE, AND WHY THAT IS AN ADVANTAGE ──────────
 * §**L-1085** (`docs/04-reference/ISSUE-LOG.md`): after any project LOAD, every
 * plugin DTO store is EMPTY while the legacy stores hold N records, because
 * `ProjectLoader` replays legacy commands and dispatches no bus create. Every
 * `<family>.changeLevel` verb validates existence against that empty DTO store
 * (`ChangeWallLevelHandler` tests `hasOwnProperty(ctx.stores.wall, cmd.id)`), so
 * **the level-change half of L-1032 refuses for every element in a reloaded
 * project.**
 *
 * Duplicate-to-level is **immune**, and not by luck: it resolves its source from
 * `window.<kind>Store` — the LEGACY store, the one `ProjectLoader` fills and the
 * renderer reads — and then dispatches `<kind>.create`, whose `canExecute`
 * validates the PAYLOAD, never the existence of a prior record. A create has
 * nothing to look up. So duplicating a slab works on a project reloaded from
 * disk on the very first gesture, which is precisely the case the change-level
 * dropdown cannot serve yet. This is a real, structural difference between the
 * two halves and is worth knowing before anyone "unifies" them.
 *
 * ─── WHY THE REFUSALS ARE DATA ──────────────────────────────────────────────
 * C84 **EI-1b** — *a blank reads as "fine" and is indistinguishable from
 * "nobody looked"*. Every family named in the L-1032 brief has a row in exactly
 * one of the two tables below, with a reason, a governing clause and `file:line`
 * evidence. Its sibling register `packages/command-bus/src/levelChangeVerbs.ts`
 * answers the CHANGE-level question; the two are deliberately separate files
 * because **the answers differ**: a hosted door may not change level AND may not
 * be duplicated (both C15 §2), but a `roof` MAY change level and may NOT yet be
 * duplicated — for a reason that has nothing to do with roofs and everything to
 * do with there being no roof entry in `copyPayloads.ts`.
 */

import { createId } from '@pryzm/schemas';
import {
    curtainWallCopyPayload,
    wallCopyPayload,
    slabCopyPayload,
    columnCopyPayload,
    beamCopyPayload,
    furnitureCopyPayload,
    type LegacyCurtainWallLike,
    type LegacyWallLike,
    type LegacySlabLike,
    type LegacyColumnLike,
    type LegacyBeamLike,
    type LegacyFurnitureLike,
} from './copyPayloads';

// ═══ 1. THE REGISTER ════════════════════════════════════════════════════════

/** The families `copyPayloads.ts` can express, and therefore the only ones this
 *  route may serve without minting a second mapping. */
export type DuplicableKind =
    | 'wall' | 'curtainWall' | 'slab' | 'column' | 'beam' | 'furniture';

export interface DuplicateToLevelSpec {
    readonly kind: DuplicableKind;
    /** `normalizeType()` outputs that resolve to this family. Lower-case. */
    readonly panelTypes: readonly string[];
    /** The bus verb ONE duplicate dispatches. One command ⇒ one undo entry. */
    readonly verb: string;
    /** `window.<this>` — the LEGACY store the source record is read from. */
    readonly legacyStoreGlobal: string;
    /** `createId()` prefix for the duplicate's id. */
    readonly idKind: 'wall' | 'curtainwall' | 'slab' | 'column' | 'beam' | 'furniture';
    /**
     * `true` ⇒ the create path also mints a fresh `ifcGuid`. Only the slab does:
     * `initTools.ts:1783-1786` writes `ifcData.guid` from the event and
     * `SlabStore.add()`'s `validateSlabData()` REQUIRES it, so two records
     * sharing one guid is an IFC identity collision, not a cosmetic duplicate.
     */
    readonly mintsIfcGuid: boolean;
    /**
     * `true` ⇒ the duplicate's world Y must be rebased to the DESTINATION
     * level's elevation, and the route REFUSES if that elevation is unknown.
     *
     * Measured 2026-08-19 — of the six `Change<Family>Level` handlers, exactly
     * one rewrites geometry: `ChangeWallLevel.ts:70-74` rebases both `baseLine`
     * endpoints' `y` to `newElevationY`. The other five write `levelId` and
     * nothing else (`ChangeSlabLevel.ts:102-106`, `ChangeColumnLevel.ts:112-116`,
     * `ChangeBeamLevel.ts:106-110`, `ChangeFurnitureLevel.ts:123-127`,
     * `ChangeCurtainWallLevel.ts:136-140`), because every other renderer derives
     * world Y from `level.elevation` at build time. `levelChangeVerbs.ts:78-87`
     * says the same thing from the other side and warns against adding an
     * elevation field "for symmetry" — §L-1010/L-1012 is what a duplicated Y
     * costs.
     */
    readonly rebasesElevation: boolean;
    /**
     * The family's registered batch verb, or `null`.
     *
     * ⚠ **This is NOT "duplicating N elements here yields one undo entry".** It
     * records only that a batch verb EXISTS. `duplicateToLevel()` dispatches one
     * `verb` per element and therefore produces **N undo entries for N
     * elements** — see `DUPLICATE_TO_LEVEL_UNDO`. The honest reason it does not
     * use these is in that constant.
     */
    readonly batchVerb: string | null;
}

/**
 * THE REGISTER. Keyed by family. A row here is a claim in four parts, and all
 * four were checked before it was added:
 *
 *   a. `copyPayloads.ts` exports a builder for the family (no second mapping);
 *   b. the builder accepts the `levelId` override and defaults it to the
 *      source's, so the plan copy tool's payload is byte-identical;
 *   c. `<verb>` is registered in `plugins/<family>/src/handlers/index.ts`;
 *   d. `window.<legacyStoreGlobal>` exists and is what `CopyPlanToolHandler`
 *      already reads for this family.
 */
export const DUPLICATE_TO_LEVEL: Readonly<Record<DuplicableKind, DuplicateToLevelSpec>> = {
    wall: {
        kind: 'wall',
        panelTypes: ['wall'],
        verb: 'wall.create',
        legacyStoreGlobal: 'wallStore',
        idKind: 'wall',
        mintsIfcGuid: false,
        rebasesElevation: true,
        batchVerb: 'wall.batch.create',
    },
    curtainWall: {
        kind: 'curtainWall',
        // `normalizeType()` folds to 'curtainwall', but `CopyPlanToolHandler`'s
        // own switch (`:258-259`) accepts BOTH spellings, so both are listed —
        // a lookup that missed the hyphenated form would refuse a family the
        // copy tool serves, which is C84 EI-3's converse.
        panelTypes: ['curtainwall', 'curtain-wall'],
        verb: 'curtain-wall.create',
        legacyStoreGlobal: 'curtainWallStore',
        idKind: 'curtainwall',
        mintsIfcGuid: false,
        rebasesElevation: false,
        batchVerb: 'curtain-wall.batch.create',
    },
    // §L-1032 — the founder's named case.
    slab: {
        kind: 'slab',
        panelTypes: ['slab'],
        verb: 'slab.create',
        legacyStoreGlobal: 'slabStore',
        idKind: 'slab',
        mintsIfcGuid: true,
        rebasesElevation: false,
        batchVerb: 'slab.batch.create',
    },
    column: {
        kind: 'column',
        panelTypes: ['column'],
        verb: 'column.create',
        legacyStoreGlobal: 'columnStore',
        idKind: 'column',
        mintsIfcGuid: false,
        rebasesElevation: false,
        batchVerb: 'column.batch.create',
    },
    beam: {
        kind: 'beam',
        panelTypes: ['beam'],
        verb: 'beam.create',
        legacyStoreGlobal: 'beamStore',
        idKind: 'beam',
        mintsIfcGuid: false,
        rebasesElevation: false,
        batchVerb: 'beam.batch.create',
    },
    furniture: {
        kind: 'furniture',
        panelTypes: ['furniture'],
        verb: 'furniture.create',
        legacyStoreGlobal: 'furnitureStore',
        idKind: 'furniture',
        mintsIfcGuid: false,
        rebasesElevation: false,
        batchVerb: 'furniture.batch.create',
    },
} as const;

// ═══ 2. THE DECLARED ABSENCES ═══════════════════════════════════════════════

export interface DuplicateToLevelRefusal {
    readonly kind: string;
    readonly panelTypes: readonly string[];
    /** Shown to the user in place of the control. One sentence, no jargon. */
    readonly reason: string;
    /** The governing contract clause. */
    readonly clause: string;
    /** `file:line` establishing the refusal in code, measured 2026-08-19. */
    readonly evidence: string;
    /**
     * `'structural'` — duplicating the record onto another storey is
     * MEANINGLESS, not merely unimplemented. `'deferred'` — it is meaningful
     * and unbuilt; each such row names exactly what would settle it, and these
     * are the rows that must shrink.
     */
    readonly disposition: 'structural' | 'deferred';
}

/**
 * ⚠ **The commonest `deferred` reason, stated once so eleven rows need not
 * repeat it.** Six families (roof, ceiling, floor, handrail, lighting, plumbing)
 * have a live `<kind>.create` verb, a populated `window.<kind>Store`, AND a row
 * in `LEVEL_CHANGE_VERBS` — they can already change storey. What they lack is a
 * builder in `copyPayloads.ts`: `CopyPlanToolHandler._commitCopy` (`:250-269`)
 * has no `case` for any of them and falls through to
 * `console.warn('No copy implementation for element type')` at `:267`.
 *
 * Writing one here to unblock duplicate-to-level is exactly the move C84 EI-9
 * forbids and L-978 priced: it would make this module the SECOND authority on a
 * mapping, for a family whose FIRST authority does not exist to be checked
 * against. The right order is the plan copy first, this route second — one
 * mapping, two callers.
 */
const NO_COPY_MAPPING_CLAUSE =
    'C84 EI-9 (one authority per question) · L-978 (a second payload mapping mints silent schema defaults)';
const noCopyMappingEvidence = (family: string): string =>
    `apps/editor/src/engine/views/plantools/copyPayloads.ts — no \`${family}CopyPayload\` export · ` +
    `apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts:250-269 — \`_commitCopy\` has no ` +
    `\`case '${family}'\`, so the plan copy tool warns "No copy implementation" at :267`;

/**
 * THE DECLARED ABSENCES. C84 EI-1b: a family that is conformant-by-refusal is
 * RECORDED, never left blank.
 */
export const DUPLICATE_TO_LEVEL_REFUSALS: Readonly<Record<string, DuplicateToLevelRefusal>> = {
    // ── STRUCTURAL — the duplicate would be meaningless ─────────────────────
    door: {
        kind: 'door',
        panelTypes: ['door'],
        reason: 'A door is a hole in a wall, not a free object. Duplicate the wall and its doors come with it.',
        clause: 'C15 §2 (a hosted element "has no independent world-space coordinate in the store") · C86 §12 R-8',
        evidence:
            'packages/geometry-door/src/DoorTypes.ts:46 — `wallId` is required and there is no `levelId` · ' +
            'apps/editor/src/engine/views/plantools/CopyPlanToolHandler.ts:325-328 — even the PLAN copy of a door ' +
            'is "copied along the same host wall": `_copyHosted` projects the delta onto the host and dispatches ' +
            '`wall.opening.create` on THAT wall. There is no host on the destination storey to name.',
        disposition: 'structural',
    },
    window: {
        kind: 'window',
        panelTypes: ['window'],
        reason: 'A window is a hole in a wall, not a free object. Duplicate the wall and its windows come with it.',
        clause: 'C15 §2 · C86 §12 R-8',
        evidence:
            'packages/geometry-window/src/WindowTypes.ts:29 — `wallId` required, no `levelId` · ' +
            'CopyPlanToolHandler.ts:325-328 — the plan copy is host-relative for the same reason',
        disposition: 'structural',
    },
    room: {
        kind: 'room',
        panelTypes: ['room'],
        reason: 'Rooms are detected from the walls around them. Duplicate the walls onto the new storey and the room appears there by itself.',
        clause: 'C84 EI-1 (one authority per family — for `room` the authority is wall topology, not an authored record)',
        evidence:
            'packages/room-topology/src/RoomStore.ts:302-304 — `update()` THROWS on any `levelId` change, ' +
            'deliberately ("Immutable field mutation attempted: levelId"); a room is produced per level by ' +
            're-detection, so a room minted directly on L2 with no L2 walls would be overwritten by the next ' +
            'detection pass and is a lie in the meantime',
        disposition: 'structural',
    },
    grid: {
        kind: 'grid',
        panelTypes: ['grid'],
        reason: 'Grids are project-wide — they already appear on every storey, so there is nothing to duplicate onto one.',
        clause: 'C84 EI-1b',
        evidence: 'packages/core-app-model/src/BimKernel.ts:50-85 — the `Grid` interface declares no `levelId`',
        disposition: 'structural',
    },
    annotation: {
        kind: 'annotation',
        panelTypes: ['annotation'],
        reason: 'An annotation belongs to the view it was drawn on, not to a storey.',
        clause: 'C84 EI-1b',
        evidence: 'plugins/annotations/src/subsystem/AnnotationTypes.ts:158 — the scoping field is `ownerViewId`',
        disposition: 'structural',
    },
    dimension: {
        kind: 'dimension',
        panelTypes: ['dimension'],
        reason: 'A dimension measures specific elements. Duplicating it onto a storey whose elements it does not measure would show a number about nothing.',
        clause: 'C84 EI-1b',
        evidence: 'packages/schemas/src/annotation/dimension.ts:165 (`viewId`, required) vs :166 (`levelId`, OPTIONAL)',
        disposition: 'structural',
    },

    // ── DEFERRED — meaningful, unbuilt, and each names what would settle it ──
    stair: {
        kind: 'stair',
        panelTypes: ['stairs', 'stair'],
        reason: 'A stair already spans two storeys. Which pair of storeys a duplicate should connect is not decided yet, so the control is withheld rather than guessing.',
        clause: 'C16 CA-18 (a verb that cannot commit must REFUSE and name why) · C98 §12',
        evidence:
            'packages/geometry-stair/src/StairTypes.ts:148-150 — `levelId` AND `baseLevelId` AND `topLevelId`; ' +
            'a single-target duplicate is ambiguous by construction. Additionally `stair.create` is NOT a plugin ' +
            'verb — plugins/stair/src/handlers/index.ts:18-30 records that the plugin arm was DELETED as the ' +
            'loser of §FIX-STAIR-CREATE-SHADOW (MT-03); the live path is the §E.5.4 bridge in initBusHandlers.ts, ' +
            'so a duplicate could not simply dispatch `stair.create` even once the semantics were decided',
        disposition: 'deferred',
    },
    lift: {
        kind: 'lift',
        panelTypes: ['lift'],
        reason: 'A lift shaft spans a range of storeys. Which range a duplicate should span is not decided yet, so the control is withheld rather than guessing.',
        clause: 'C16 CA-18',
        evidence:
            'packages/geometry-lift/src/LiftTypes.ts:54-57 — `levelId`, `baseLevelId`, `topLevelId` (base..top ' +
            '"must differ") · `ls plugins/` (2026-08-19) has NO `lift` package at all, so there is no ' +
            '`lift.create` bus verb to dispatch and no `LEVEL_CHANGE_VERBS` row either',
        disposition: 'deferred',
    },
    roof: {
        kind: 'roof',
        panelTypes: ['roof'],
        reason: 'Roofs cannot be duplicated to another storey yet — the plan copy tool cannot copy a roof either, and duplicating one would mean writing a second, unchecked description of what a roof is.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence:
            noCopyMappingEvidence('roof') +
            ' · NOTE: `roof.changeLevel` IS live (levelChangeVerbs.ts:111-117), so this is a COPY gap, not a level gap',
        disposition: 'deferred',
    },
    ceiling: {
        kind: 'ceiling',
        panelTypes: ['ceiling'],
        reason: 'Ceilings cannot be duplicated to another storey yet — the plan copy tool cannot copy a ceiling either.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence: noCopyMappingEvidence('ceiling') + ' · `ceiling.changeLevel` IS live (levelChangeVerbs.ts:142-148)',
        disposition: 'deferred',
    },
    floor: {
        kind: 'floor',
        panelTypes: ['floor'],
        reason: 'Floors cannot be duplicated to another storey yet — the plan copy tool cannot copy a floor either.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence: noCopyMappingEvidence('floor') + ' · `floor.changeLevel` IS live (levelChangeVerbs.ts:149-155)',
        disposition: 'deferred',
    },
    handrail: {
        kind: 'handrail',
        panelTypes: ['handrail'],
        reason: 'Handrails cannot be duplicated to another storey yet — the plan copy tool cannot copy a handrail either.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence: noCopyMappingEvidence('handrail') + ' · `handrail.changeLevel` IS live (levelChangeVerbs.ts:177-183)',
        disposition: 'deferred',
    },
    lighting: {
        kind: 'lighting',
        panelTypes: ['lighting'],
        reason: 'Light fixtures cannot be duplicated to another storey yet — the plan copy tool cannot copy one either.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence: noCopyMappingEvidence('lighting') + ' · `lighting.changeLevel` IS live (levelChangeVerbs.ts:163-169)',
        disposition: 'deferred',
    },
    plumbing: {
        kind: 'plumbing',
        panelTypes: ['plumbing'],
        reason: 'Plumbing fixtures cannot be duplicated to another storey yet — the plan copy tool cannot copy one either.',
        clause: NO_COPY_MAPPING_CLAUSE,
        evidence: noCopyMappingEvidence('plumbing') + ' · `plumbing.changeLevel` IS live (levelChangeVerbs.ts:170-176)',
        disposition: 'deferred',
    },
    pool: {
        kind: 'pool',
        panelTypes: ['pool'],
        reason: 'Pools have no persistent record of their own yet, so there is nothing to duplicate.',
        clause: 'C84 EI-6 (persistence is not optional, and absence must be loud)',
        evidence:
            'packages/geometry-pool/src/ — PoolAssembly.ts, PoolDimensions.ts, index.ts and NO store; there is ' +
            'no `window.poolStore` anywhere (L-980 removed the four dead undo keys that pretended otherwise)',
        disposition: 'deferred',
    },
} as const;

// ═══ 3. THE UNDO ANSWER, MEASURED AND UNFLATTERING ══════════════════════════

/**
 * **One duplicate = ONE undo entry. N duplicates = N undo entries.** Both halves
 * are true and the second is the uncomfortable one, so it is stated rather than
 * omitted.
 *
 * `duplicateToLevel()` dispatches exactly ONE `<family>.create` per call, and a
 * single dispatched command is a single `produceCommand` and therefore a single
 * ring-buffer entry. For the founder's case — one slab, Level 1 → Level 2 — one
 * Ctrl+Z removes it. That claim is measured by the route's own return value
 * (`undoEntries: 1`) and nothing about it is inferred.
 *
 * **What this module does NOT do is duplicate a SET in one entry.**
 * `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:22-29` records that
 * `batchCoordinator.runBatch` is undo-NEUTRAL: N commands inside it are N undo
 * entries, and ONE entry is bought only by dispatching ONE batch verb. Six of
 * the six duplicable families HAVE a batch verb (`DUPLICATE_TO_LEVEL[k].batchVerb`),
 * so the one-entry multi-duplicate is reachable — but it is **not** a free swap,
 * and the slab is the proof:
 *
 *   `CommandEventBridge`'s `slab.batch.create` fan-out (`:449-487`) emits
 *   `position: { x: 0, y: 0, z: 0 }` HARD-CODED and forwards neither `width` nor
 *   `depth`, where the single `slab.create` case (`:414-447`) forwards all three
 *   from the payload. `SlabFragmentBuilder` places a vertex at
 *   `position + vertex`, so routing a slab duplicate through the batch verb to
 *   buy one undo entry would displace every duplicate by `-position` and blank
 *   its stored `width`/`depth`. **That is a lossy copy, i.e. the defect this
 *   lane exists to avoid, traded for a nicer undo stack.**
 *
 * So: the batch route is NOT taken, the multi-element duplicate is NOT claimed,
 * and the fix is upstream — make the batch fan-out carry what the single one
 * carries — not a per-family workaround here. A truthful "N entries for N
 * elements" beats a false "one".
 */
export const DUPLICATE_TO_LEVEL_UNDO = {
    /** Undo entries produced by ONE `duplicateToLevel()` call. */
    perDuplicate: 1,
    /** `true` only when a batch verb could be used WITHOUT losing a field. */
    oneEntryForManySupported: false,
    reason:
        'One dispatched command is one undo entry, so a single duplicate is already atomic. ' +
        'A multi-element duplicate in ONE entry needs a batch verb, and the slab batch fan-out ' +
        '(CommandEventBridge.ts:449-487) hard-codes position {0,0,0} and drops width/depth, which ' +
        'the single-create case (:414-447) carries. Buying one undo entry with a lossy copy is the ' +
        'wrong trade; fix the fan-out first.',
} as const;

// ═══ 4. LOOKUPS ═════════════════════════════════════════════════════════════

function _norm(rawType: string): string {
    return (rawType ?? '').toLowerCase().trim();
}

/**
 * The duplicate spec for a panel element type, or `null`.
 *
 * `null` is NOT "this family may not be duplicated" — call
 * `duplicateToLevelRefusalFor()` to distinguish a DECLARED refusal from a family
 * nobody has looked at. A surface must render three outcomes, never two: the
 * control, the refusal's sentence, or nothing at all. An absent control and a
 * withheld control look identical to a user, which is the §context-data-honesty
 * failure.
 */
export function duplicateToLevelSpecFor(panelElementType: string): DuplicateToLevelSpec | null {
    const t = _norm(panelElementType);
    if (t.length === 0) return null;
    for (const spec of Object.values(DUPLICATE_TO_LEVEL)) {
        if (spec.panelTypes.includes(t)) return spec;
    }
    return null;
}

/** The declared refusal for a panel element type, or `null` if none is declared. */
export function duplicateToLevelRefusalFor(panelElementType: string): DuplicateToLevelRefusal | null {
    const t = _norm(panelElementType);
    if (t.length === 0) return null;
    for (const r of Object.values(DUPLICATE_TO_LEVEL_REFUSALS)) {
        if (r.panelTypes.includes(t)) return r;
    }
    return null;
}

// ═══ 5. THE PAYLOAD — a pure value a test can execute ═══════════════════════

/**
 * A source record, discriminated by family.
 *
 * A union rather than one `Record<string, unknown>` parameter so that
 * `buildDuplicateToLevelPayload` needs no cast to pick a builder, and so that
 * handing a `LegacySlabLike` to the wall arm is a compile error. §L-994b/L-980:
 * an `any` seam here would be a defect factory in the one place the whole
 * module exists to keep honest.
 */
export type DuplicateSource =
    | { readonly kind: 'wall';        readonly record: LegacyWallLike }
    | { readonly kind: 'curtainWall'; readonly record: LegacyCurtainWallLike }
    | { readonly kind: 'slab';        readonly record: LegacySlabLike }
    | { readonly kind: 'column';      readonly record: LegacyColumnLike }
    | { readonly kind: 'beam';        readonly record: LegacyBeamLike }
    | { readonly kind: 'furniture';   readonly record: LegacyFurnitureLike };

export interface DuplicateToLevelIds {
    /** The duplicate's id. MUST differ from the source's. */
    readonly newId: string;
    /** Fresh IFC guid — required iff `spec.mintsIfcGuid`. */
    readonly ifcGuid?: string;
    /** DESTINATION level's elevation in metres — required iff `spec.rebasesElevation`. */
    readonly elevationY?: number;
}

/**
 * `source + destination → the bus payload`, and nothing else. No dispatch, no
 * globals, no id minting: a pure function a test can execute, which is the
 * whole reason `copyPayloads.ts` was extracted in the first place — *"a payload
 * no test can build is a payload no test can measure"*, which is how L-978
 * survived.
 *
 * **`dx = dz = 0` is the definition of the feature.** A duplicate must land at
 * the SAME plan position one storey up; a slab moved sideways as well as up is
 * not what "duplicate to Level 2" means, and the zero delta is asserted in the
 * suite rather than assumed here.
 */
export function buildDuplicateToLevelPayload(
    source: DuplicateSource,
    targetLevelId: string,
    ids: DuplicateToLevelIds,
): Readonly<Record<string, unknown>> {
    const DX = 0;
    const DZ = 0;
    const opts = { levelId: targetLevelId } as const;

    switch (source.kind) {
        case 'wall':
            // The ONLY family whose geometry is rebased — see `WallCopyOverrides`.
            return wallCopyPayload(source.record, DX, DZ, ids.newId, {
                levelId: targetLevelId,
                elevationY: ids.elevationY,
            });
        case 'curtainWall':
            return curtainWallCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'slab':
            // `ifcGuid` is REQUIRED by `SlabStore.add()`'s validateSlabData; the
            // caller mints it, this function never invents one.
            return slabCopyPayload(source.record, DX, DZ, ids.newId, ids.ifcGuid ?? '', opts);
        case 'column':
            return columnCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'beam':
            return beamCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'furniture':
            return furnitureCopyPayload(source.record, DX, DZ, ids.newId, opts);
    }
}

// ═══ 6. THE ROUTE ═══════════════════════════════════════════════════════════

/** A storey, as `bimManager.getLevels()` returns them. */
export interface LevelLike {
    readonly id: string;
    readonly name?: string;
    readonly elevation?: number;
}

/** The legacy stores' two reader spellings — `CopyPlanToolHandler` uses both. */
export interface LegacyStoreLike {
    getById?: (id: string) => unknown;
    get?: (id: string) => unknown;
}

/**
 * Everything the route touches that is not a pure function, injected so the
 * suite can drive it without a `window`. §committed-is-not-reachable: the point
 * of the seam is that the SAME function the app calls is the one under test.
 */
export interface DuplicateToLevelDeps {
    /** `legacyStoreGlobal` → store. Missing/undefined ⇒ a named refusal. */
    readonly stores: Readonly<Record<string, LegacyStoreLike | undefined>>;
    /** The storeys, for `id` validation and the wall elevation rebase. */
    readonly levels: readonly LevelLike[];
    /** One bus dispatch. Returns whatever the bus returns; errors are caught here. */
    readonly dispatch: (verb: string, payload: Readonly<Record<string, unknown>>) => unknown;
    /** Overridable for deterministic fixtures. */
    readonly mintId?: (kind: DuplicateToLevelSpec['idKind']) => string;
    readonly mintGuid?: () => string;
}

export interface DuplicateToLevelRequest {
    /** The panel/mesh element type, e.g. `'slab'`. */
    readonly elementType: string;
    readonly sourceId: string;
    readonly targetLevelId: string;
}

export type DuplicateToLevelOutcome =
    | {
        readonly ok: true;
        readonly kind: DuplicableKind;
        readonly sourceId: string;
        readonly newId: string;
        readonly verb: string;
        readonly payload: Readonly<Record<string, unknown>>;
        /** Always 1 — see `DUPLICATE_TO_LEVEL_UNDO`. */
        readonly undoEntries: 1;
    }
    | {
        readonly ok: false;
        readonly sourceId: string;
        /** One sentence naming WHY. Never empty — a silent `false` is the defect. */
        readonly reason: string;
        /** Present iff the family is a DECLARED refusal rather than an error. */
        readonly refusal?: DuplicateToLevelRefusal;
        readonly undoEntries: 0;
    };

function _readLegacyRecord(store: LegacyStoreLike | undefined, id: string): unknown {
    if (!store) return undefined;
    // Both spellings, in the order `CopyPlanToolHandler` already uses per family.
    return store.getById?.(id) ?? store.get?.(id);
}

/**
 * Narrow an opaque legacy record to the family's structural shape.
 *
 * The `as unknown as T` is the SAME hop `CopyPlanToolHandler` performs at every
 * one of its six dispatch sites (`:281`, `:307`, `:403`, `:426`, `:481`), and it
 * is confined to this one function rather than repeated. It is not `as any`:
 * `T` is a declared structural interface, so every field read downstream is
 * still checked against it. What it cannot check is that the store really holds
 * that shape — which is why `duplicateToLevel` guards the two fields the
 * builders dereference unconditionally (`baseLine`, `position`/`startPoint`)
 * BEFORE calling one, instead of letting a `TypeError` die in a `.catch()`.
 */
function _asFamilyRecord<T>(record: unknown): T {
    return record as unknown as T;
}

/** Does `v` look like a `{x,y,z}`? */
function _isPt(v: unknown): boolean {
    if (typeof v !== 'object' || v === null) return false;
    const p = v as { x?: unknown; y?: unknown; z?: unknown };
    return typeof p.x === 'number' && typeof p.z === 'number';
}

/**
 * The geometry field each builder dereferences WITHOUT a guard, and therefore
 * the one this route must prove present before calling it. Returning a reason
 * instead of throwing keeps the failure attributable: a `TypeError` swallowed by
 * a dispatch `.catch()` is exactly how L-978's slab and wall defects stayed
 * invisible for months.
 */
function _geometryMissingReason(kind: DuplicableKind, record: unknown): string | null {
    const r = record as Record<string, unknown>;
    switch (kind) {
        case 'wall':
        case 'curtainWall': {
            const bl = r['baseLine'];
            if (!Array.isArray(bl) || bl.length < 2 || !_isPt(bl[0]) || !_isPt(bl[1])) {
                return `the source ${kind} record has no usable two-point \`baseLine\`, so there is nothing to duplicate`;
            }
            return null;
        }
        case 'slab': {
            if (!_isPt(r['position'])) {
                return 'the source slab record has no `position`, so the duplicate would have no anchor';
            }
            const poly = r['polygon'];
            if (!Array.isArray(poly) || poly.length < 3) {
                return 'the source slab record has fewer than three boundary points, and `CreateSlabHandler` refuses a zero-area boundary';
            }
            return null;
        }
        case 'column':
        case 'furniture':
            return _isPt(r['position'])
                ? null
                : `the source ${kind} record has no \`position\`, so the duplicate would have no anchor`;
        case 'beam':
            return _isPt(r['startPoint']) && _isPt(r['endPoint'])
                ? null
                : 'the source beam record has no `startPoint`/`endPoint`, so the duplicate would have no span';
    }
}

/**
 * Resolve → mint → build → dispatch. **One command, one undo entry.**
 *
 * Every `ok: false` carries a sentence. C16 CA-DOCTRINE-A: *a refusal that names
 * its reason is strictly better than a silent lie* — and a duplicate that
 * quietly does nothing is the worst outcome available, because the user's next
 * move is to press the button again.
 */
export function duplicateToLevel(
    req: DuplicateToLevelRequest,
    deps: DuplicateToLevelDeps,
): DuplicateToLevelOutcome {
    const fail = (reason: string, refusal?: DuplicateToLevelRefusal): DuplicateToLevelOutcome =>
        ({ ok: false, sourceId: req.sourceId, reason, undoEntries: 0, ...(refusal ? { refusal } : {}) });

    const spec = duplicateToLevelSpecFor(req.elementType);
    if (spec === null) {
        const refusal = duplicateToLevelRefusalFor(req.elementType);
        if (refusal !== null) return fail(refusal.reason, refusal);
        // (c) — nobody has decided. Say THAT, not "cannot": the two are
        // different facts and C84 EI-1b is about not conflating them.
        return fail(
            `"${req.elementType}" is in neither DUPLICATE_TO_LEVEL nor DUPLICATE_TO_LEVEL_REFUSALS — ` +
            `nobody has decided whether this family may be duplicated to another storey. That is a ` +
            `missing row, not a refusal.`,
        );
    }

    if (typeof req.sourceId !== 'string' || req.sourceId.length === 0) {
        return fail('no source element was named');
    }
    if (typeof req.targetLevelId !== 'string' || req.targetLevelId.length === 0) {
        return fail('no destination storey was named');
    }

    const store = deps.stores[spec.legacyStoreGlobal];
    const raw = _readLegacyRecord(store, req.sourceId);
    if (raw === undefined || raw === null) {
        return fail(
            `no ${spec.kind} with id "${req.sourceId}" in window.${spec.legacyStoreGlobal}`,
        );
    }

    const sourceLevelId = (raw as { levelId?: unknown }).levelId;
    if (typeof sourceLevelId === 'string' && sourceLevelId === req.targetLevelId) {
        // Refused BY NAME. `dx = dz = 0` means a same-storey duplicate is an
        // element coincident with its source: invisible, un-pickable and
        // indistinguishable from the tool having done nothing.
        return fail(
            `the ${spec.kind} is already on that storey, and a duplicate with no offset would sit ` +
            `exactly inside it — use the copy tool to place a duplicate on the same storey`,
        );
    }

    const target = deps.levels.find(l => l.id === req.targetLevelId);
    if (target === undefined) {
        return fail(`no storey with id "${req.targetLevelId}" — the destination must be an existing level`);
    }

    const geometryProblem = _geometryMissingReason(spec.kind, raw);
    if (geometryProblem !== null) return fail(geometryProblem);

    // ── The elevation, for the one family that needs it ──────────────────────
    let elevationY: number | undefined;
    if (spec.rebasesElevation) {
        if (typeof target.elevation !== 'number' || !Number.isFinite(target.elevation)) {
            // REFUSE rather than carry the source's y. A wall duplicated with the
            // destination's `levelId` and the SOURCE's `baseLine.y` renders at the
            // wrong height while every panel reports the right storey — a defect
            // nobody could attribute. §context-data-honesty.
            return fail(
                `storey "${target.name ?? req.targetLevelId}" has no numeric elevation, and a wall's ` +
                `baseLine \`y\` IS its storey height (ChangeWallLevel.ts:70-74). Duplicating without it ` +
                `would put the wall at the OLD height under the NEW storey's name.`,
            );
        }
        elevationY = target.elevation;
    }

    // ── Mint ─────────────────────────────────────────────────────────────────
    const mintId = deps.mintId ?? ((k: DuplicateToLevelSpec['idKind']) => String(createId(k)));
    const newId = mintId(spec.idKind);
    if (newId === req.sourceId) {
        return fail('the minted id collided with the source id — refusing to overwrite the original');
    }
    const mintGuid = deps.mintGuid ?? (() => crypto.randomUUID());
    // A fresh IFC guid, not the source's: `initTools.ts:1783-1786` writes
    // `ifcData.guid` straight from the event and `SlabStore.add()` validates it,
    // so two slabs sharing one guid is an IFC identity collision.
    const ifcGuid = spec.mintsIfcGuid ? mintGuid() : undefined;

    // ── Build (the copy's OWN mapping, zero delta) ───────────────────────────
    let payload: Readonly<Record<string, unknown>>;
    switch (spec.kind) {
        case 'wall':
            payload = buildDuplicateToLevelPayload(
                { kind: 'wall', record: _asFamilyRecord<LegacyWallLike>(raw) },
                req.targetLevelId, { newId, elevationY },
            );
            break;
        case 'curtainWall':
            payload = buildDuplicateToLevelPayload(
                { kind: 'curtainWall', record: _asFamilyRecord<LegacyCurtainWallLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'slab':
            payload = buildDuplicateToLevelPayload(
                { kind: 'slab', record: _asFamilyRecord<LegacySlabLike>(raw) },
                req.targetLevelId, { newId, ifcGuid },
            );
            break;
        case 'column':
            payload = buildDuplicateToLevelPayload(
                { kind: 'column', record: _asFamilyRecord<LegacyColumnLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'beam':
            payload = buildDuplicateToLevelPayload(
                { kind: 'beam', record: _asFamilyRecord<LegacyBeamLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'furniture':
            payload = buildDuplicateToLevelPayload(
                { kind: 'furniture', record: _asFamilyRecord<LegacyFurnitureLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
    }

    // ── Dispatch. ONE command ⇒ ONE undo entry. ──────────────────────────────
    try {
        const result = deps.dispatch(spec.verb, payload);
        if (result && typeof (result as { catch?: unknown }).catch === 'function') {
            (result as Promise<unknown>).catch((e: unknown) =>
                console.error(`[DuplicateToLevel] ${spec.verb} failed:`, e));
        }
    } catch (e) {
        return fail(`${spec.verb} threw before the duplicate could be created: ${String(e)}`);
    }

    return {
        ok: true,
        kind: spec.kind,
        sourceId: req.sourceId,
        newId,
        verb: spec.verb,
        payload,
        undoEntries: 1,
    };
}

// ═══ 7. THE PRODUCTION WIRING ═══════════════════════════════════════════════

/**
 * The `window`-reading deps. The ONLY function in this module that touches a
 * global, kept apart so everything above is executable from a suite.
 *
 * The stores read here are the LEGACY ones — see the module header: that is what
 * makes this route work on a project restored from disk, where §L-1085 leaves
 * every plugin DTO store empty and every `changeLevel` verb refusing.
 */
export function browserDuplicateToLevelDeps(): DuplicateToLevelDeps {
    const w = globalThis as unknown as Record<string, unknown>;
    const stores: Record<string, LegacyStoreLike | undefined> = {};
    for (const spec of Object.values(DUPLICATE_TO_LEVEL)) {
        const s = w[spec.legacyStoreGlobal];
        stores[spec.legacyStoreGlobal] =
            typeof s === 'object' && s !== null ? (s as LegacyStoreLike) : undefined;
    }

    let levels: readonly LevelLike[] = [];
    const bim = w['bimManager'];
    if (typeof bim === 'object' && bim !== null) {
        const getLevels = (bim as { getLevels?: unknown }).getLevels;
        if (typeof getLevels === 'function') {
            const got: unknown = (getLevels as () => unknown).call(bim);
            if (Array.isArray(got)) levels = got as readonly LevelLike[];
        }
    }

    const runtime = w['runtime'];
    const bus =
        typeof runtime === 'object' && runtime !== null
            ? (runtime as { bus?: { executeCommand?: (v: string, p?: unknown) => unknown } }).bus
            : undefined;

    return {
        stores,
        levels,
        dispatch: (verb, payload) => bus?.executeCommand?.(verb, payload),
    };
}
