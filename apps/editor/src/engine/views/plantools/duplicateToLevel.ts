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
 * be duplicated (both C15 §2), while a `stair` MAY be told to change level as a
 * pair of storeys and may NOT be duplicated at all — a single-target duplicate
 * of a two-storey element is ambiguous by construction.
 *
 * ─── §L-1032 D3 — THE SIX THAT WERE DEFERRED ARE NOW BUILT ──────────────────
 * `roof`, `ceiling`, `floor`, `handrail`, `lighting` and `plumbing` used to sit
 * in the refusal table saying *"the plan copy tool cannot copy one either"*,
 * citing C84 EI-9. **That reading was wrong**, and the DIRECTION of the two maps
 * is what settles it: the `*CreatedMirror` modules map bus event → legacy
 * record; `copyPayloads.ts` maps legacy record → bus payload — the INVERSE. Two
 * modules answering OPPOSITE questions are not rival authorities; a family needs
 * both to round-trip. What EI-9 really demands of a pair like that is that they
 * AGREE, which is a testable claim and is now tested.
 *
 * ⚠ ONE OF THE SIX CHANGED THE QUESTION ON THE WAY IN. `plumbing` dispatches
 * **`plumbing.createFixture`**, not `plumbing.create`: those two verbs describe
 * DIFFERENT ELEMENTS (a fixture vs a pipe), and the pipe verb reaches no
 * renderer at all. See `DUPLICATE_TO_LEVEL['plumbing']`.
 */

import { createId } from '@pryzm/schemas';
import {
    curtainWallCopyPayload,
    wallCopyPayload,
    slabCopyPayload,
    columnCopyPayload,
    beamCopyPayload,
    furnitureCopyPayload,
    // §L-1032 D3 — the six families that were DEFERRED here for want of a
    // builder. They have one now; see the `copyPayloads.ts` banner for why an
    // INVERSE map is not the second authority C84 EI-9 forbids.
    roofCopyPayload,
    ceilingCopyPayload,
    floorCopyPayload,
    handrailCopyPayload,
    lightingCopyPayload,
    plumbingFixtureCopyPayload,
    type LegacyCurtainWallLike,
    type LegacyWallLike,
    type LegacySlabLike,
    type LegacyColumnLike,
    type LegacyBeamLike,
    type LegacyFurnitureLike,
    type LegacyRoofLike,
    type LegacyCeilingLike,
    type LegacyFloorLike,
    type LegacyHandrailLike,
    type LegacyLightingLike,
    type LegacyPlumbingFixtureLike,
    type FloorCopyOverrides,
} from './copyPayloads';

// ═══ 1. THE REGISTER ════════════════════════════════════════════════════════

/** The families `copyPayloads.ts` can express, and therefore the only ones this
 *  route may serve without minting a second mapping. */
export type DuplicableKind =
    | 'wall' | 'curtainWall' | 'slab' | 'column' | 'beam' | 'furniture'
    // §L-1032 D3 — the six that were deferred for want of a `copyPayloads.ts`
    // builder. Every one of them now has one, checked field-by-field against the
    // real receiving payload interface.
    | 'roof' | 'ceiling' | 'floor' | 'handrail' | 'lighting' | 'plumbing';

export interface DuplicateToLevelSpec {
    readonly kind: DuplicableKind;
    /** `normalizeType()` outputs that resolve to this family. Lower-case. */
    readonly panelTypes: readonly string[];
    /** The bus verb ONE duplicate dispatches. One command ⇒ one undo entry. */
    readonly verb: string;
    /** `window.<this>` — the LEGACY store the source record is read from. */
    readonly legacyStoreGlobal: string;
    /** `createId()` prefix for the duplicate's id. Every value is a member of
     *  `ElementType` (`packages/schemas/src/types/Id.ts:79-109`) — `createId` is
     *  generic over it, so a typo is a compile error rather than a malformed id. */
    readonly idKind:
        | 'wall' | 'curtainwall' | 'slab' | 'column' | 'beam' | 'furniture'
        | 'roof' | 'ceiling' | 'floor' | 'handrail' | 'lighting' | 'plumbing';
    /**
     * WHICH undo stack the duplicate's inverse lands on.
     *
     * ⚠ This is not decoration. `DUPLICATE_TO_LEVEL_UNDO.perDuplicate` says ONE
     * entry per duplicate, and for eleven of the twelve families that entry is a
     * `produceCommand` patch pair in the bus ring buffer. **`plumbing` is the
     * exception**: `CreatePlumbingFixtureHandler.execute` returns
     * `{ forward: [], inverse: [] }` and does its work through
     * `window.commandManager.execute(...)`
     * (`plugins/plumbing/src/handlers/CreatePlumbingFixture.ts:46-56`), so the
     * bus records an EMPTY entry and the real inverse is the legacy command
     * manager's. One Ctrl+Z still removes one duplicated fixture — but saying
     * "one undo entry" without saying WHOSE would be the kind of flattened claim
     * C84 §9 exists to stop.
     */
    readonly undoStack: 'bus' | 'legacy-commandManager';
    /**
     * `true` ⇒ the create path also mints a fresh `ifcGuid`. TWO families do —
     * slab and floor (§L-1032 D3) — and both for the same reason:
     * `initTools.ts:1783-1786` (slab) and `:1953` (floor) write `ifcData.guid`
     * straight from the event, so two records sharing one guid is an IFC
     * identity collision, not a cosmetic duplicate. Every other family's mirror
     * mints its own guid and no payload field carries one, so asking this route
     * for one would be an affordance with no receiver.
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
        undoStack: 'bus',
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
        undoStack: 'bus',
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
        undoStack: 'bus',
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
        undoStack: 'bus',
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
        undoStack: 'bus',
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
        undoStack: 'bus',
    },
    // ── §L-1032 D3 — the six that were DEFERRED, now built ──────────────────
    //
    // Each of these six satisfies the same four-part claim (a)–(d) as the rows
    // above, and one addition the founder asked for by name: the builder is the
    // INVERSE of the family's `.created` mirror, cited line-by-line in
    // `copyPayloads.ts`, so the pair can be — and is — round-tripped in
    // `CopiedElementKeepsPlaceAndProperties.test.ts`. Two maps that disagree is
    // the real EI-9 risk here, not the existence of a second map.
    roof: {
        kind: 'roof',
        panelTypes: ['roof'],
        verb: 'roof.create',
        legacyStoreGlobal: 'roofStore',
        idKind: 'roof',
        mintsIfcGuid: false,
        // `ChangeRoofLevel.ts:45-47` writes `levelId` and nothing else, and the
        // roof's seating is MEASURED at the destination by
        // `resolveMirroredRoofBaseOffset` (roofCreatedMirror.ts:76-82) rather
        // than carried — so there is no elevation for this route to rebase.
        rebasesElevation: false,
        batchVerb: null,
        undoStack: 'bus',
    },
    ceiling: {
        kind: 'ceiling',
        panelTypes: ['ceiling'],
        verb: 'ceiling.create',
        legacyStoreGlobal: 'ceilingStore',
        idKind: 'ceiling',
        // The `ceiling.created` mirror mints its own guid
        // (`ceilingCreatedMirror.ts:169`) and no payload field carries one, so
        // asking this route for one would be an affordance with no receiver.
        mintsIfcGuid: false,
        // `ChangeCeilingLevel.ts:107-109` — `levelId` only.
        rebasesElevation: false,
        batchVerb: 'ceiling.batch.create',
        undoStack: 'bus',
    },
    floor: {
        kind: 'floor',
        panelTypes: ['floor'],
        verb: 'floor.create',
        legacyStoreGlobal: 'floorStore',
        idKind: 'floor',
        // TRUE, and for the slab's reason: the §P3.2-FL mirror writes
        // `ifcData.guid = ev.ifcGuid ?? crypto.randomUUID()`
        // (`initTools.ts:1953`), so two floors sharing one guid is an IFC
        // identity collision rather than a cosmetic duplicate.
        mintsIfcGuid: true,
        // `ChangeFloorLevel.ts:115-117` — `levelId` only. The finish's height is
        // `boundary.baseOffset`, relative to the level datum, and it is carried.
        rebasesElevation: false,
        batchVerb: null,
        undoStack: 'bus',
    },
    handrail: {
        kind: 'handrail',
        panelTypes: ['handrail'],
        verb: 'handrail.create',
        legacyStoreGlobal: 'handrailStore',
        idKind: 'handrail',
        mintsIfcGuid: false,
        // `ChangeHandrailLevel.ts:110-113` — `levelId` only. And the rail needs
        // no rebase for a second, stronger reason: `HandrailFragmentBuilder.ts:238-240`
        // derives world Y from `level.elevation + baseOffset` and reads only the
        // RISE between the path endpoints (`:226`), never their absolute `y`.
        rebasesElevation: false,
        batchVerb: null,
        undoStack: 'bus',
    },
    lighting: {
        kind: 'lighting',
        panelTypes: ['lighting'],
        verb: 'lighting.create',
        legacyStoreGlobal: 'lightingStore',
        idKind: 'lighting',
        mintsIfcGuid: false,
        // `ChangeLightingLevel.ts:135-137` — `levelId` only. The §FT-LIGHTING
        // mirror RE-SEATS `origin.y` per fixture kind at the destination storey
        // (`initTools.ts:2172-2186`), so a rebase here would be a second
        // authority on seating — the §FIX-SEATING-ONE-AUTHORITY defect inverted.
        rebasesElevation: false,
        batchVerb: null,
        undoStack: 'bus',
    },
    plumbing: {
        kind: 'plumbing',
        panelTypes: ['plumbing'],
        // ⚠ NOT `plumbing.create`. That verb describes a PIPE
        // (`CreatePlumbingPayload` — kind/diameter/length/bendRadius/systemTag)
        // while `window.plumbingStore` holds FIXTURES (`PlumbingFixtureData` —
        // toilets, sinks, baths, showers). Routing a duplicated toilet through
        // it would mint a 50 mm cold-water pipe, and mint it nowhere visible:
        // `CommandEventBridge`'s `plumbing.create` case emits `levelId` alone
        // (`:1015-1023`) and NOTHING in the tree subscribes to `plumbing.created`.
        // `plumbing.createFixture` is the leg that reaches `PlumbingStore.add()`.
        verb: 'plumbing.createFixture',
        legacyStoreGlobal: 'plumbingStore',
        idKind: 'plumbing',
        mintsIfcGuid: false,
        // `ChangePlumbingLevel.ts:118-121` — `levelId` only. `CreatePlumbingFixtureCommand`
        // re-seats `position.y` on the destination storey's FINISHED floor
        // (`:67-79`, §FIX-INTERIOR-FFL-SEATING).
        rebasesElevation: false,
        batchVerb: null,
        // ⚠ THE ONE EXCEPTION IN THIS TABLE — see `DuplicateToLevelSpec.undoStack`.
        undoStack: 'legacy-commandManager',
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
    // ── §L-1032 D3 — SIX ROWS REMOVED FROM THIS TABLE, ON PURPOSE ───────────
    //
    // `roof`, `ceiling`, `floor`, `handrail`, `lighting` and `plumbing` stood
    // here as `deferred`, each saying *"the plan copy tool cannot copy one
    // either"* and citing C84 EI-9 — the fear being that a builder in
    // `copyPayloads.ts` would be a SECOND authority on a mapping whose first did
    // not exist.
    //
    // That reading was wrong, and measuring the DIRECTION of the two maps is
    // what settles it: the `*CreatedMirror` modules map **bus event → legacy
    // record**, and `copyPayloads.ts` maps **legacy record → bus payload** — the
    // INVERSE. A second authority is two modules answering the SAME question;
    // these answer opposite ones, and a family needs both to round-trip. The six
    // builders now exist, each checked field-by-field against its real receiving
    // payload interface, and each round-tripped against its forward mirror in
    // `CopiedElementKeepsPlaceAndProperties.test.ts` — because the ACTUAL EI-9
    // risk is the two maps DISAGREEING, and that is a testable claim.
    //
    // They are rows in `DUPLICATE_TO_LEVEL` above. Do not re-add them here.
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
 * entries, and ONE entry is bought only by dispatching ONE batch verb. **SEVEN
 * of the twelve** duplicable families have one (`DUPLICATE_TO_LEVEL[k].batchVerb`
 * — the original six plus `ceiling.batch.create`; roof, floor, handrail,
 * lighting and plumbing have `null`), so the one-entry multi-duplicate is not
 * even reachable for five of them — and where it IS reachable it is **not** a
 * free swap. The slab is the proof:
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
    /**
     * Undo entries produced by ONE `duplicateToLevel()` call.
     *
     * ⚠ ON WHICH STACK is a separate fact and is per-family:
     * `DUPLICATE_TO_LEVEL[k].undoStack`. Eleven of twelve are the bus ring
     * buffer; `plumbing` is the legacy command manager's, because its handler
     * returns an empty patch pair and delegates. One entry either way — but
     * "one undo entry" without naming whose is the flattened claim C84 §9 is
     * about.
     */
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
    | { readonly kind: 'furniture';   readonly record: LegacyFurnitureLike }
    // §L-1032 D3.
    | { readonly kind: 'roof';        readonly record: LegacyRoofLike }
    | { readonly kind: 'ceiling';     readonly record: LegacyCeilingLike }
    | { readonly kind: 'floor';       readonly record: LegacyFloorLike }
    | { readonly kind: 'handrail';    readonly record: LegacyHandrailLike }
    | { readonly kind: 'lighting';    readonly record: LegacyLightingLike }
    | { readonly kind: 'plumbing';    readonly record: LegacyPlumbingFixtureLike };

export interface DuplicateToLevelIds {
    /** The duplicate's id. MUST differ from the source's. */
    readonly newId: string;
    /** Fresh IFC guid — required iff `spec.mintsIfcGuid`. */
    readonly ifcGuid?: string;
    /** DESTINATION level's elevation in metres — required iff `spec.rebasesElevation`. */
    readonly elevationY?: number;
    /**
     * §L-1032 D3 · FLOOR ONLY — the DESTINATION storey's host bindings, when the
     * caller has resolved them.
     *
     * ⛔ These are NEVER derived from the source record. A copied floor finish
     * carrying the source's `hostSlabId` would be re-seated by
     * `FloorSlabBindingHandler` every time the SOURCE storey's slab moved
     * (`packages/geometry-slab/src/floor/FloorSlabBindingHandler.ts:64-89`) — a
     * cross-storey action at a distance with no visible cause. Omitted ⇒
     * `floorCopyPayload` creates the copy UNBOUND **and says so** at the drop
     * site, which is the L-1032 brief's second permitted outcome.
     *
     * `duplicateToLevel()` passes NEITHER: resolving a host slab at the
     * destination is a containment question about slab geometry (whose legacy
     * polygon is stored `{x, y = worldZ}` and placed relative to `position` —
     * see `slabCopyPayload`), and that belongs in `@pryzm/geometry-slab`, not in
     * a routing module. **FOUND, NOT FIXED**, and reported as unbound rather
     * than guessed.
     */
    readonly hostSlabId?: string;
    readonly hostRoomId?: string;
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
        // ── §L-1032 D3 ──────────────────────────────────────────────────────
        case 'roof':
            return roofCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'ceiling':
            return ceilingCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'floor': {
            // `ifcGuid` is REQUIRED for the same reason the slab's is: the
            // §P3.2-FL mirror writes `ifcData.guid` straight from the event
            // (`initTools.ts:1953`), so a shared guid is an IFC identity
            // collision. The host bindings are the DESTINATION's or absent —
            // never the source's. See `DuplicateToLevelIds`.
            const floorOpts: FloorCopyOverrides = {
                levelId: targetLevelId,
                ...(ids.hostSlabId !== undefined ? { hostSlabId: ids.hostSlabId } : {}),
                ...(ids.hostRoomId !== undefined ? { hostRoomId: ids.hostRoomId } : {}),
            };
            return floorCopyPayload(source.record, DX, DZ, ids.newId, ids.ifcGuid ?? '', floorOpts);
        }
        case 'handrail':
            return handrailCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'lighting':
            return lightingCopyPayload(source.record, DX, DZ, ids.newId, opts);
        case 'plumbing':
            return plumbingFixtureCopyPayload(source.record, DX, DZ, ids.newId, opts);
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
        // §L-1032 D3 — `HandrailData.baseLine` is the same two-point shape
        // (`HandrailTypes.ts:23`), and `handrailCopyPayload` destructures it
        // unguarded exactly as the wall builder does, so `handrail` shares this arm.
        case 'wall':
        case 'curtainWall':
        case 'handrail': {
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

        // ── §L-1032 D3 ──────────────────────────────────────────────────────
        case 'roof': {
            // `roofCopyPayload` destructures `footprint.centroid` and maps
            // `footprint.polygon`; `CreateRoofHandler.canExecute` (`:36-38`)
            // then refuses a boundary under 3 points.
            const fp = r['footprint'] as { polygon?: unknown; centroid?: unknown } | undefined;
            if (typeof fp !== 'object' || fp === null) {
                return 'the source roof record has no `footprint`, so the duplicate would have no outline';
            }
            if (!Array.isArray(fp.centroid) || fp.centroid.length < 2) {
                return 'the source roof record has no two-number `footprint.centroid`, and the copy resolves its world outline from it';
            }
            if (!Array.isArray(fp.polygon) || fp.polygon.length < 3) {
                return 'the source roof record has fewer than three footprint points, and `CreateRoofHandler` refuses a boundary under 3 points';
            }
            return null;
        }
        case 'ceiling':
        case 'floor': {
            // Both builders map `boundary.polygon`, and both receivers refuse a
            // polygon under 3 points (`validateCeilingBoundary`;
            // `CreateFloorHandler.canExecute:75-77`).
            const b = r['boundary'] as { polygon?: unknown } | undefined;
            if (typeof b !== 'object' || b === null || !Array.isArray(b.polygon) || b.polygon.length < 3) {
                return `the source ${kind} record has fewer than three boundary points, and its create handler refuses a polygon under 3 points`;
            }
            return null;
        }
        case 'lighting':
        case 'plumbing':
            return _isPt(r['position'])
                ? null
                : `the source ${kind} record has no \`position\`, so the duplicate would have no anchor`;
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
        // ── §L-1032 D3 — the six that were deferred ─────────────────────────
        case 'roof':
            payload = buildDuplicateToLevelPayload(
                { kind: 'roof', record: _asFamilyRecord<LegacyRoofLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'ceiling':
            payload = buildDuplicateToLevelPayload(
                { kind: 'ceiling', record: _asFamilyRecord<LegacyCeilingLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'floor':
            // `ifcGuid` only — NOT `hostSlabId`/`hostRoomId`. Those are the
            // DESTINATION storey's or absent; see `DuplicateToLevelIds`. The
            // builder reports the unbinding at the drop site.
            payload = buildDuplicateToLevelPayload(
                { kind: 'floor', record: _asFamilyRecord<LegacyFloorLike>(raw) },
                req.targetLevelId, { newId, ifcGuid },
            );
            break;
        case 'handrail':
            payload = buildDuplicateToLevelPayload(
                { kind: 'handrail', record: _asFamilyRecord<LegacyHandrailLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'lighting':
            payload = buildDuplicateToLevelPayload(
                { kind: 'lighting', record: _asFamilyRecord<LegacyLightingLike>(raw) },
                req.targetLevelId, { newId },
            );
            break;
        case 'plumbing':
            payload = buildDuplicateToLevelPayload(
                { kind: 'plumbing', record: _asFamilyRecord<LegacyPlumbingFixtureLike>(raw) },
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
