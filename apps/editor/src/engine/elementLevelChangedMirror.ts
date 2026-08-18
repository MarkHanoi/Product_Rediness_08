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
export interface LegacyLevelMovableStore {
    changeLevel(elementId: string, newLevelId: string): unknown;
    getById(elementId: string): { levelId?: string } | undefined;
}

export interface LevelChangeMirrorDeps {
    readonly wallStore?: LegacyLevelMovableStore | null;
    readonly roofStore?: LegacyLevelMovableStore | null;
    readonly viewDependencyTracker?: {
        registerElement(elementId: string, levelId: string): void;
        markLevelsDirty(levelIds: string[]): void;
    } | null;
    readonly bimManager?: {
        registerElement(elementId: string, levelId: string): void;
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
        previousLevelId = store.getById(elementId)?.levelId ?? null;
    } catch { /* non-fatal — a store that cannot answer just costs one extra dirty level */ }

    if (previousLevelId === newLevelId) {
        return { applied: false, reason: `already on level "${newLevelId}"` };
    }

    // ── 1. the legacy record — this is the one the renderer reads ────────────
    try {
        const moved = store.changeLevel(elementId, newLevelId);
        if (moved === undefined || moved === null) {
            return {
                applied: false,
                reason: `legacy ${kind} store has no record "${elementId}" — nothing to move`,
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
