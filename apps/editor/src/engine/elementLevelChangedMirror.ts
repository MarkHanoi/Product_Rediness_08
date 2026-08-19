/**
 * §L-946 — the bus→legacy-store MUTATION channel for level changes.
 *
 * ─── THE DEFECT THIS CLOSES ──────────────────────────────────────────────────
 * Founder: *"the user selects an element (e.g. a wall) and in the properties
 * panel changes the element's level — it doesn't work."*
 *
 * Nothing in the dispatch was wrong. `PropertyPanelSections.ts:155` sends
 * `wall.changeLevel {id, newLevelId, newElevationY}`, which byte-matches
 * `ChangeWallLevelPayload`, and `ChangeWallLevelHandler` correctly rewrites
 * `levelId` — in the PLUGIN store (`plugins/wall/src/store.ts`). The renderer
 * reads the LEGACY store (`packages/geometry-wall/src/WallStore.ts`): it is what
 * `window.wallStore` points at, what `WallRebuildCoordinator` subscribes to, and
 * what `WallFragmentBuilder` derives `worldY = level.elevation + …` from.
 *
 * `initTools.ts` bridges the two — twelve times, and every one of the twelve is
 * a `.created` event. There was no mutation channel at all, so the command
 * succeeded, the plugin store was right, and the layer the user experiences kept
 * its own unchanged copy. §committed-is-not-reachable.
 *
 * ─── WHY THIS IS A MODULE AND NOT A CLOSURE INSIDE initTools.ts ──────────────
 * Same reason as its neighbour `roofCreatedMirror.ts`: `initTools` is a
 * ~2600-line function that needs a THREE world, a components registry, a command
 * manager and twenty stores before its first line runs, so nothing can execute a
 * closure defined inside it. A proof written against a transcribed copy proves
 * the transcription. `ElementLevelChangeReachesLegacyStore.test.ts` runs THE
 * FUNCTIONS BELOW, driven from a real `CommandBus` dispatch of the real verb.
 *
 * ─── SCOPE: WHAT THIS CHANNEL DOES AND DOES NOT DO ───────────────────────────
 * It moves an element between storeys, in all three places a storey is recorded:
 * the legacy store, `bimManager` level membership, and the view-dependency
 * element→level map. It is deliberately NOT a general mutation relay — the
 * question *"either the bridge gains a mutation channel, or the rendered model
 * stops being a second copy"* is architectural and is not answered here. What is
 * built here is shaped so the NEXT level-change family is one row in two tables
 * (`LEVEL_CHANGE_VERBS` in `CommandEventBridge.ts`, `LEGACY_LEVEL_MOVERS` below)
 * rather than a thirteenth copy-pasted subscriber.
 *
 * NOT MIRRORED, deliberately: the handler also rebases `baseLine.y` to the new
 * elevation, to satisfy the L0 schema's "endpoints share the same y" refine. The
 * legacy renderer never reads `baseLine.y` for elevation — `WallFragmentBuilder`
 * line 728 computes `worldY` from `level.elevation` — and writing a baseLine
 * through `WallStore.update()` would clear `_sourceBaseLine` and re-run join
 * resolution, which a storey change must not do. Mirroring the LEVEL is the
 * whole of what the renderer needs; mirroring the y would be extra machinery
 * with no visible effect and a real chance of moving a welded corner.
 */

/** The `element.level-changed` fields this mirror consumes. Structurally a
 *  subset of `RuntimeEvents['element.level-changed']`, declared locally so this
 *  module stays free of a `@pryzm/runtime-composer` import (and of the
 *  pdfjs-bearing barrel behind it — the same constraint `roofCreatedMirror.ts`
 *  documents). */
export interface ElementLevelChangedEventLike {
    readonly elementKind?: string;
    readonly elementId?: string;
    readonly newLevelId?: string;
    readonly newElevationY?: number;
    readonly commandType?: string;
}

/** A legacy store that can re-storey one of its records. Both
 *  `@pryzm/geometry-wall`'s `WallStore` and `@pryzm/geometry-roof`'s `RoofStore`
 *  expose exactly this; neither updates spatial registration (both say so in
 *  their own doc comments), which is why the caller below does. */
/**
 * §L-1087 — the destination and source storey ELEVATIONS, resolved by the caller
 * and handed DOWN as plain numbers.
 *
 * Eight of the twelve movable families need neither: their fragment builders
 * re-derive `worldY` from `bimManager.getLevelById(levelId).elevation` on every
 * rebuild, so for them the storey change IS the height change and these fields
 * are ignored. Four (beam, furniture, lighting, plumbing) seat the mesh at an
 * ABSOLUTE Y stamped into the record at create time and cannot move without a
 * delta.
 *
 * ─── WHY THE NUMBERS COME FROM HERE AND NOT FROM THE STORE ──────────────────
 * Those four stores hold no level table, and giving them one to solve this would
 * be `§DIAG-WALL-LEVEL` in a new place — a store that can reach for an elevation
 * can reach for the WRONG one, and a silent default files elements on the ground
 * floor. Data flows down: this module already holds the level authority
 * (`deps.bimManager`), so it resolves both numbers and the store receives values
 * it cannot misresolve.
 *
 * ─── AND WHY THEY ARE NOT IN THE COMMAND PAYLOAD ────────────────────────────
 * An elevation carried through a bus payload is a second copy of a number the
 * level store already owns, and §L-1010/L-1012 is what happens when a Y from the
 * wrong space gets latched as the model Y. Resolving at BOTH ends from the one
 * authority — here on the forward path, and in `elementUndoStoreAdapter`'s
 * §L-946 arm on the inverse — keeps one answer to one question (C84 EI-9).
 */
export interface LevelChangeElevations {
    readonly newElevation?: number;
    readonly previousElevation?: number;
}

/** A legacy store that can re-storey one of its records. */
export interface LegacyLevelMovableStore {
    /**
     * Move the record to `newLevelId`.
     *
     * `opts` is OPTIONAL so the eight height-derived families keep the
     * two-argument form unchanged. A store that NEEDS the elevations and does
     * not receive them MUST return `undefined` rather than moving the storey and
     * silently leaving the height behind — a half-move is the
     * failure-and-emptiness aliasing this whole issue is about, and the caller
     * below turns an `undefined` into a NAMED refusal in the log.
     */
    changeLevel(elementId: string, newLevelId: string, opts?: LevelChangeElevations): unknown;
    // §L-1032-ACCESSOR-WIDENING (2026-08-19) — BOTH spellings, both optional.
    //
    // `WallStore`/`RoofStore` spell the lookup `getById`; `FurnitureStore`,
    // `PlumbingStore` and `LightingStore` spell it `get`. Requiring only
    // `getById` made each of those three a TYPE ERROR the moment it was added
    // to `LEGACY_LEVEL_MOVERS`, and the obvious workaround — minting a second
    // accessor on three stores so they satisfy one interface — would put two
    // names on one question in three more places (C84 EI-9). The interface is
    // the single thing that has to widen, so it is the thing that widens.
    //
    // Both are OPTIONAL because this lookup is NOT load-bearing: its only
    // consumer captures the vacated storey so one extra plan view is marked
    // dirty, and the call site already tolerates a store that cannot answer.
    // A store with neither accessor still MOVES — it just costs that one extra
    // dirty level, which is the behaviour that was already there.
    getById?(elementId: string): { levelId?: string } | undefined;
    get?(elementId: string): { levelId?: string } | undefined;
}

export interface LevelChangeMirrorDeps {
    readonly wallStore?: LegacyLevelMovableStore | null;
    readonly roofStore?: LegacyLevelMovableStore | null;
    /**
     * §L-1032 — the founder's named case. Typed as `LegacyLevelMovableStore`, NOT
     * cast: `tsc` is what proves `initTools` passes the LEGACY `slabStore` (the
     * one with `changeLevel`) and not the plugin DTO store, which has no such
     * method. A cast here would make the wiring un-checkable in exactly the place
     * the bug lived.
     */
    readonly slabStore?: LegacyLevelMovableStore | null;
    /**
     * §L-1032 — the remaining families that carry ONE independent storey.
     *
     * Every one of these is optional and `applyElementLevelChange` refuses — by
     * NAME, into the log — when a store is absent or lacks `changeLevel`
     * (*"legacy store for kind X is not wired"*). That refusal is deliberate and
     * is the C16 CA-18 shape: a row here whose store is not yet passed by
     * `initTools` produces a NAMED no-op, never a silent one. It is still a gap,
     * and it is visible as one.
     *
     * Absent from this list ON PURPOSE, each with the deciding clause recorded in
     * `LEVEL_CHANGE_REFUSALS` (`@pryzm/command-bus/levelChangeVerbs.ts`):
     * door/window (hosted — C15 §2), room (derived from wall topology), grid
     * (project-wide), annotation + dimension (view-scoped), stair + lift (they
     * span TWO storeys — `baseLevelId`/`topLevelId` — so a single-target move is
     * ambiguous by construction), pool (no legacy store exists).
     */
    readonly columnStore?: LegacyLevelMovableStore | null;
    readonly beamStore?: LegacyLevelMovableStore | null;
    readonly ceilingStore?: LegacyLevelMovableStore | null;
    readonly floorStore?: LegacyLevelMovableStore | null;
    readonly furnitureStore?: LegacyLevelMovableStore | null;
    readonly lightingStore?: LegacyLevelMovableStore | null;
    readonly plumbingStore?: LegacyLevelMovableStore | null;
    readonly handrailStore?: LegacyLevelMovableStore | null;
    readonly curtainWallStore?: LegacyLevelMovableStore | null;
    readonly viewDependencyTracker?: {
        registerElement(elementId: string, levelId: string): void;
        markLevelsDirty(levelIds: string[]): void;
    } | null;
    readonly bimManager?: {
        registerElement(elementId: string, levelId: string): void;
        /** §L-1087 — THE level authority. Optional so existing callers and the
         *  suite's stand-ins keep compiling; a `bimManager` that cannot answer
         *  simply means the four height-dependent families refuse, loudly. */
        getLevelById?(levelId: string): { elevation?: number } | undefined;
    } | null;
}

export type LevelChangeOutcome =
    | {
        readonly applied: true;
        readonly elementKind: string;
        readonly elementId: string;
        readonly previousLevelId: string | null;
        readonly newLevelId: string;
    }
    | { readonly applied: false; readonly reason: string };

/**
 * THE EXTENSION POINT. One row per family whose level can change.
 *
 * Keyed by the `elementKind` the bridge stamps on the event, which is in turn
 * declared in `LEVEL_CHANGE_VERBS` (`CommandEventBridge.ts`). Adding `slab` is a
 * row here and a row there — not a new event type, not a new subscriber, and
 * emphatically not a thirteenth hand-rolled mirror.
 */
const LEGACY_LEVEL_MOVERS: Readonly<
    Record<string, (deps: LevelChangeMirrorDeps) => LegacyLevelMovableStore | null | undefined>
> = {
    wall: (deps) => deps.wallStore,
    roof: (deps) => deps.roofStore,
    // §L-1032. The `kind` keys here MUST equal the `kind` field of the matching
    // row in `LEVEL_CHANGE_VERBS` (`@pryzm/command-bus/levelChangeVerbs.ts`) —
    // that is the string the bridge stamps on the event. A row in one table and
    // not the other is the silent half of this defect: the command succeeds, the
    // plugin store is right, and the renderer keeps its own unchanged copy.
    slab: (deps) => deps.slabStore,
    column: (deps) => deps.columnStore,
    ceiling: (deps) => deps.ceilingStore,
    floor: (deps) => deps.floorStore,
    handrail: (deps) => deps.handrailStore,
    curtainWall: (deps) => deps.curtainWallStore,
    // §L-1087 — the four HEIGHT-DEPENDENT families, readmitted 2026-08-19 after
    // their stores learned to move the height. Unlike the eight above, these do
    // NOT re-derive `worldY` from `level.elevation`; their `changeLevel` REFUSES
    // unless `applyElementLevelChange` hands it both storey elevations, which is
    // exactly what the `_elevationOf` resolver below exists to supply. A row here
    // without that resolver would be a half-move.
    beam: (deps) => deps.beamStore,
    furniture: (deps) => deps.furnitureStore,
    lighting: (deps) => deps.lightingStore,
    plumbing: (deps) => deps.plumbingStore,
};

/**
 * Mirror ONE level change into the legacy store the renderer reads, and move the
 * element's spatial registration with it.
 *
 * ─── THE ORDER IS LOAD-BEARING, and it is the REVERSE of the create bridges ──
 * The `.created` bridges register VDT + bimManager BEFORE mirroring, because a
 * create whose element is not yet in `_elementLevelMap` falls into VDT's
 * §G3-STALE-EVENT all-views-dirty fallback (see `initTools.ts` §G3-STALE-FIX).
 *
 * A MOVE inverts that. `ViewDependencyTracker._onStoreEvent` resolves the level
 * SYNCHRONOUSLY from `_elementLevelMap` as each store event arrives. So:
 *   1. move the legacy record FIRST — its 'remove'/'add' (wall) or 'update'
 *      (roof) emissions land while the map still says OLD, dirtying the plan
 *      views of the storey the element is LEAVING. Register first and the old
 *      storey's plan view would keep drawing an element that has gone.
 *   2. THEN re-register VDT + bimManager to the new storey.
 *   3. THEN `markLevelsDirty([old, new])` — step 2 changed no store, so nothing
 *      would otherwise dirty the DESTINATION storey's views and the element
 *      would not appear on its new plan until an unrelated edit happened by.
 *
 * Every step is individually try/caught: a level change that reaches the mesh
 * but not the plan view is a worse outcome than one that reaches both, but far
 * better than one that reaches neither because a plan-view concern threw.
 */
export function applyElementLevelChange(
    ev: ElementLevelChangedEventLike,
    deps: LevelChangeMirrorDeps,
): LevelChangeOutcome {
    const kind = (ev.elementKind ?? '').trim();
    const elementId = (ev.elementId ?? '').trim();
    const newLevelId = (ev.newLevelId ?? '').trim();

    if (kind.length === 0) return { applied: false, reason: 'event carries no elementKind' };
    if (elementId.length === 0) return { applied: false, reason: 'event carries no elementId' };
    // An empty destination is refused rather than defaulted. `'' ?? 'L0'` is the
    // exact §DIAG-WALL-LEVEL trap: a silent default files the element on the
    // GROUND floor, and the founder's report for that one was "sometimes
    // first-floor rooms overlap on the ground plan".
    if (newLevelId.length === 0) return { applied: false, reason: 'event carries no newLevelId' };

    const resolve = LEGACY_LEVEL_MOVERS[kind];
    if (resolve === undefined) {
        return { applied: false, reason: `no legacy level-mover registered for kind "${kind}"` };
    }
    const store = resolve(deps);
    if (!store || typeof store.changeLevel !== 'function') {
        return { applied: false, reason: `legacy store for kind "${kind}" is not wired` };
    }

    // Captured BEFORE the move: the storey being vacated, whose plan views must
    // be re-projected too. Read from the LEGACY record, not the event — the
    // event says where the element is going, never where it was.
    let previousLevelId: string | null = null;
    try {
        // §L-1032-ACCESSOR-WIDENING — ask whichever accessor this store has.
        // `getById` first, so wall/roof behaviour is byte-identical to before.
        const record = store.getById?.(elementId) ?? store.get?.(elementId);
        previousLevelId = record?.levelId ?? null;
    } catch { /* non-fatal — a store that cannot answer just costs one extra dirty level */ }

    if (previousLevelId === newLevelId) {
        return { applied: false, reason: `already on level "${newLevelId}"` };
    }

    // ── §L-1087: resolve BOTH storey elevations from the level authority ─────
    // Read here, not in the store, and never from the command payload — see
    // `LevelChangeElevations`. `undefined` is passed through as `undefined`; it is
    // NOT defaulted to 0, because 0 is a real elevation (the ground floor) and a
    // fabricated one would move an element to the wrong height rather than refuse.
    const _elevationOf = (levelId: string | null): number | undefined => {
        if (levelId === null || levelId.length === 0) return undefined;
        try {
            const e = deps.bimManager?.getLevelById?.(levelId)?.elevation;
            return typeof e === 'number' && Number.isFinite(e) ? e : undefined;
        } catch { return undefined; }
    };
    const elevations: LevelChangeElevations = {
        newElevation: _elevationOf(newLevelId),
        previousElevation: _elevationOf(previousLevelId),
    };

    // ── 1. the legacy record — this is the one the renderer reads ────────────
    try {
        const moved = store.changeLevel(elementId, newLevelId, elevations);
        if (moved === undefined || moved === null) {
            // Two different causes, deliberately reported as one NAMED refusal
            // rather than as silence: either there is no such record, or this
            // family needs the storey elevations and they could not be resolved
            // (no level authority, or the level has no elevation). Both leave the
            // record untouched, which is the correct outcome — a storey move that
            // could not carry the height must not happen at all.
            return {
                applied: false,
                reason:
                    `legacy ${kind} store refused the move of "${elementId}" — either no such record, ` +
                    `or this family needs the storey elevations and they could not be resolved ` +
                    `(previous=${String(elevations.previousElevation)}, new=${String(elevations.newElevation)})`,
            };
        }
    } catch (err) {
        console.error(
            `[elementLevelChangedMirror] §L-946: legacy ${kind} store refused the move for ` +
            `${elementId} → ${newLevelId}; the 3D mesh will stay on its old storey:`,
            err,
        );
        return { applied: false, reason: `legacy store threw: ${String(err)}` };
    }

    // ── 2. spatial registration follows the record ───────────────────────────
    // `BimKernel.registerElement` is exclusive-containment (it filters the id out
    // of every other level first), so this MOVES membership rather than
    // duplicating it — no unregister call is needed or wanted.
    try {
        deps.bimManager?.registerElement(elementId, newLevelId);
    } catch (err) {
        console.warn(
            '[elementLevelChangedMirror] §L-946: bimManager.registerElement failed (non-fatal) — ' +
            'the plan projection reads level.childrenIds, so this element may draw on its OLD plan:',
            err,
        );
    }
    try {
        deps.viewDependencyTracker?.registerElement(elementId, newLevelId);
    } catch (err) {
        console.warn('[elementLevelChangedMirror] §L-946: VDT.registerElement failed (non-fatal):', err);
    }

    // ── 3. both storeys re-project ───────────────────────────────────────────
    try {
        const levelsToDirty = previousLevelId !== null && previousLevelId.length > 0
            ? [previousLevelId, newLevelId]
            : [newLevelId];
        deps.viewDependencyTracker?.markLevelsDirty(levelsToDirty);
    } catch (err) {
        console.warn('[elementLevelChangedMirror] §L-946: VDT.markLevelsDirty failed (non-fatal):', err);
    }

    return { applied: true, elementKind: kind, elementId, previousLevelId, newLevelId };
}

/** The minimum of `runtime.events` this bridge needs. Declared structurally for
 *  the same barrel-avoidance reason as `ElementLevelChangedEventLike`. */
export interface LevelChangeEventSource {
    on(
        event: 'element.level-changed',
        handler: (ev: ElementLevelChangedEventLike) => void,
    ): unknown;
}

/**
 * Subscribe the mirror to `runtime.events`. Called once from `initTools.ts`,
 * beside the twelve `.created` bridges it completes.
 *
 * The subscription lives HERE rather than as one `.on(...)` line in `initTools`
 * so that the suite exercises the wiring and not a transcription of it — the one
 * residue left to the structural arm is whether `initTools` still calls this,
 * which is a single grep-able fact rather than a behaviour.
 */
export function registerElementLevelChangeBridge(
    events: LevelChangeEventSource,
    deps: LevelChangeMirrorDeps,
): void {
    events.on('element.level-changed', (ev) => {
        const outcome = applyElementLevelChange(ev, deps);
        if (outcome.applied) {
            console.log(
                `[elementLevelChangedMirror] §L-946: ${outcome.elementKind} ${outcome.elementId} ` +
                `moved ${outcome.previousLevelId ?? '(unknown)'} → ${outcome.newLevelId} in the legacy store.`,
            );
        } else {
            // Not an error: most refusals are "this kind has no legacy mirror" or
            // "already there". Logged because a SILENT no-op here is precisely the
            // failure mode L-946 was — the command reporting success into a void.
            console.log(
                `[elementLevelChangedMirror] §L-946: level change not mirrored — ${outcome.reason}.`,
            );
        }
    });
}
