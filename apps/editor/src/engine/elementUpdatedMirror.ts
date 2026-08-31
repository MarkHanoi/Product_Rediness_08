/**
 * §MIRROR-UPDATE (L-9942/L-9943) — the bus→legacy-store MUTATION channel for
 * FIELD CHANGES. The second one this codebase has, and the first that is not
 * about `levelId`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⛔ THE DEFECT THIS CLOSES IS A SINGLE ZERO.
 * ═══════════════════════════════════════════════════════════════════════════════
 *     grep -c "\.created'"  apps/editor/src/engine/initTools.ts   -> 17
 *     grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->  0
 *
 * Seventeen create-mirrors and not one update-mirror. Every element family could
 * be CREATED and reach the render layer; **none could be UPDATED and reach it.**
 * `tools/ga-gate/check-mirror-completeness.ts` is the detector for that zero, and
 * it reads the consequences off the tree: 123 verbs that write a plugin DTO store
 * and relay to nothing, 13 `*.setMaterial` verbs sitting at REFUSES because a
 * refusal was the only honest thing left, the lift's shaft that penetrates the
 * floor plate in the model and not on screen (L-9403), and the pool's void in its
 * host slab.
 *
 * ─── WHY THIS IS A MODULE AND NOT A CLOSURE INSIDE initTools.ts ───────────────
 * Same reason as its neighbours `elementLevelChangedMirror.ts` and
 * `roofCreatedMirror.ts`: `initTools` is a ~3000-line function that needs a THREE
 * world, a components registry, a command manager and twenty stores before its
 * first line runs, so nothing can execute a closure defined inside it. A proof
 * written against a transcribed copy proves the transcription.
 * `ElementUpdateReachesLegacyStore.test.ts` runs THE FUNCTIONS BELOW, driven from
 * a real `CommandBus` dispatch of the real verbs.
 *
 * ─── ⭐ WHY IT READS VALUES FROM THE **PLUGIN** STORE ─────────────────────────
 * The event carries field NAMES, not field VALUES. L-927 is the standing receipt
 * for the alternative: the `.created` events carry values through a whitelist, and
 * `materialColor`, `layers` and `curve` were each a separate founder-visible
 * defect — a field the emitter did not know to copy could never arrive. Names on
 * the wire and values from the writer means one value with one owner (C84 EI-9).
 *
 * ⚠ THAT MAKES SUBSCRIBER ORDER LOAD-BEARING, AND IT IS MEASURED RATHER THAN
 * ASSUMED. `PatchEmitter.listeners` is an insertion-ordered `Set`; `bootstrap()`
 * calls `attachStores(emitter, stores)` (`apps/editor/src/bootstrap.ts:103`)
 * BEFORE `composeRuntime()` calls `wireCommandEventBridge(inner.bus.patches,
 * events)` (`composeRuntime.ts:956`), so the plugin store has already applied the
 * forward patches by the time the event is emitted. This module does NOT rely on
 * that silently: a record it cannot find is a NAMED refusal, never a quiet no-op.
 *
 * ─── ⛔ WHY IT IS NOT A GENERIC "COPY THE FIELD ACROSS" RELAY ─────────────────
 * A moved wall is not a repainted wall.
 *   · `WallStore.update()` clears `_sourceBaseLine` and re-runs join resolution, so
 *     a relayed baseline would silently un-weld every corner it touched.
 *   · `SlabStore.update()` is a WHOLE-RECORD replace — handed a one-key partial it
 *     leaves the slab as that one key, frozen, with no diagnostics (L-977, recorded
 *     in `SlabStore.changeLevel`'s own header). `RoofStore.update()` is a Partial
 *     merge. `ColumnStore.update()` takes `Omit<ColumnData,'id'|'type'>`. **Three
 *     stores, three different contracts for one verb name.**
 *   · `SlabData.holes` is `{x,y}[][]` where `y` carries world Z; the plugin record's
 *     `holes` is `{x,y,z}[][]`. A verbatim copy would put every pool and lift void
 *     in the wrong place, silently.
 *
 * So each family declares its store, its per-field TRANSLATION and its write
 * contract, and a field with no declared translation is REFUSED BY NAME rather
 * than copied hopefully.
 */

import { legacyRoofSlopeFromPitch, legacyRoofTypeFromShape } from './roofCreatedMirror.js';

/** The `element.updated` fields this mirror consumes. Structurally a subset of
 *  `RuntimeEvents['element.updated']`, declared locally so this module stays free
 *  of a `@pryzm/runtime-composer` import (and of the pdfjs-bearing barrel behind
 *  it — the constraint `roofCreatedMirror.ts` documents). */
export interface ElementUpdatedEventLike {
    readonly elementKind?: string;
    readonly elementId?: string;
    readonly changedFields?: readonly string[];
    readonly commandType?: string;
}

/**
 * A legacy geometry store that can rewrite one of its records.
 *
 * ⚠ BOTH ACCESSOR SPELLINGS, BOTH OPTIONAL — the §L-1032-ACCESSOR-WIDENING lesson,
 * reused: `SlabStore`/`RoofStore` spell the lookup `getById`, `ColumnStore` has
 * both. Unlike the level-change mirror, the lookup here IS load-bearing (two of the
 * three write contracts need the current record to merge onto), so a store with
 * neither accessor is a NAMED refusal rather than a degraded success.
 */
export interface LegacyUpdatableStore {
    update(id: string, next: never): unknown;
    getById?(id: string): unknown;
    get?(id: string): unknown;
}

export interface ElementUpdateMirrorDeps {
    readonly slabStore?: LegacyUpdatableStore | null;
    readonly roofStore?: LegacyUpdatableStore | null;
    readonly columnStore?: LegacyUpdatableStore | null;
    /**
     * Reads the PLUGIN DTO record the handler wrote — the source of the values.
     * `(storeKey, id) => record | undefined`.
     *
     * ⚠ It is a FUNCTION rather than the store registry itself because
     * `PryzmRuntime.stores` is typed `StoresSlot` while at runtime
     * `bootstrap.everything.ts` also hangs every plugin store on it under its
     * `storeKey` — the disagreement `initTools.ts` already documents at the balcony
     * profile bridge. Keeping the cast at the ONE call site in `initTools` means
     * this module (and its suite) needs no cast at all.
     */
    readonly pluginRecord: (storeKey: string, id: string) => Readonly<Record<string, unknown>> | undefined;
    readonly viewDependencyTracker?: {
        markLevelsDirty(levelIds: string[]): void;
    } | null;
}

export type ElementUpdateOutcome =
    | {
        readonly applied: true;
        readonly elementKind: string;
        readonly elementId: string;
        /** LEGACY field names actually written. */
        readonly fields: readonly string[];
    }
    | { readonly applied: false; readonly reason: string };

/** How one plugin field crosses into one legacy field. */
interface FieldBridge {
    /** The legacy record's name for it. Often — not always — the same string. */
    readonly to: string;
    /** Value translation. Absent ⇒ the two representations are IDENTICAL, which is
     *  a claim, so every absent `map` below carries a comment saying why. */
    readonly map?: (value: unknown) => unknown;
}

interface LegacyFamilyAdapter {
    readonly store: (deps: ElementUpdateMirrorDeps) => LegacyUpdatableStore | null | undefined;
    /** The plugin storeKey to read values FROM. Usually equal to the family key;
     *  spelled separately because `curtain-wall`'s key is `curtainwall` and one
     *  character of that kind has already cost this repo a day (L-9401). */
    readonly pluginStoreKey: string;
    readonly fields: Readonly<Record<string, FieldBridge>>;
    /**
     * `'whole'`  — `update()` REPLACES the record; merge the changes onto the
     *              current legacy record first, or the store keeps only the keys
     *              handed to it (L-977).
     * `'partial'`— `update()` merges; hand it only what changed.
     */
    readonly write: 'whole' | 'partial';
}

/**
 * `{x,y,z}[][]` (plugin, world) → `{x,y}[][]` (legacy, plan XZ with `y` = world Z).
 *
 * ⭐ THE ONE TRANSLATION THAT MAKES THE LIFT SHAFT AND THE POOL VOID LAND IN THE
 * RIGHT PLACE. `SlabFragmentBuilder` punches `data.holes` through the capped
 * geometry (`SlabFragmentBuilder.ts:1526`) reading `{x, y}` as plan coordinates.
 * Copying the 3-D ring verbatim would produce a hole at `(x, y)` — i.e. at world
 * `(x, levelElevation)` — which for a level at y=0 is a degenerate sliver and for
 * any other level is a hole somewhere else entirely. Silent, and geometrically
 * plausible enough to survive a screenshot.
 */
function vec3RingsToPlanRings(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    return value.map((ring) =>
        Array.isArray(ring)
            ? ring.map((p) => {
                const v = p as { x?: number; y?: number; z?: number };
                return { x: v.x ?? 0, y: v.z ?? 0 };
            })
            : ring,
    );
}

/**
 * THE EXTENSION POINT. One row per family whose fields can be mirrored.
 *
 * Keyed by the `elementKind` the bridge stamps on the event, which is in turn
 * declared in `ELEMENT_UPDATE_VERBS` (`CommandEventBridge.ts`). Adding a family is
 * a row here and a row there — not a new event type, not a new subscriber, and
 * emphatically not an eighteenth hand-rolled mirror.
 *
 * ⛔ ADDING A ROW IS A CLAIM THAT SOMEBODY CHECKED THE LEGACY FIELD EXISTS. It is
 * checkable: `roof.setPitch` is deliberately ABSENT because
 * `grep -n "pitch" packages/geometry-roof/src/RoofTypes.ts` returns **0** — the
 * legacy roof record has no such field, so a row would write a key no builder reads
 * and report a fix. That verb keeps its row on `tools/ga-gate/mirror-debt.json`
 * with that as its reason.
 */
const LEGACY_UPDATABLE_STORES: Readonly<Record<string, LegacyFamilyAdapter>> = {
    slab: {
        store: (deps) => deps.slabStore,
        pluginStoreKey: 'slab',
        // ⚠ WHOLE-RECORD: `SlabStore.update(id, nextState: SlabData)` structuredClones
        // and REPLACES. Its own header calls a one-key partial "no id, no boundary, no
        // thickness — frozen, still under its own key, with zero diagnostics".
        write: 'whole',
        fields: {
            holes: { to: 'holes', map: vec3RingsToPlanRings },
            // No `map`: both records spell it `thickness`, both in metres, and
            // `SlabFragmentBuilder` re-extrudes from it directly.
            thickness: { to: 'thickness' },
            // No `map`: both spell it `baseOffset`, both relative to the level datum
            // (C92 §10 — the builder re-derives worldY from it on every update).
            baseOffset: { to: 'baseOffset' },
            // No `map`: `SlabData.systemTypeId` (SlabTypes.ts:145) is the same string.
            systemTypeId: { to: 'systemTypeId' },
            // No `map`: C100 §2.1 — `materialId` is the MASTER id on both sides and
            // `materialColor` is the resolved hex cache on both sides.
            materialId: { to: 'materialId' },
            materialColor: { to: 'materialColor' },
        },
    },
    roof: {
        store: (deps) => deps.roofStore,
        pluginStoreKey: 'roof',
        // `RoofStore.update(id, updates: Partial<RoofData>)` merges onto a clone and
        // emits `bim-roof-updated`. A partial is the CORRECT shape here, and handing
        // it a whole record would also re-send `levelId`, which that method THROWS on
        // when it differs ("levelId is immutable after creation").
        write: 'partial',
        fields: {
            overhang: { to: 'overhang' },   // RoofTypes.ts:84/98, same units.
            thickness: { to: 'thickness' }, // RoofTypes.ts:61/85/101, same units.
            // §FIX-ROOF-UPDATE-MIRROR — BOTH maps are IMPORTED from
            // `roofCreatedMirror.ts`, never restated. That module is where L-699
            // paid for `mono ↦ shed` (a `mono` roof rendered FLAT because the two
            // vocabularies spell one roof form differently) and for `tan(pitch)`.
            // A hand-copied second table here is precisely how a create path and an
            // update path come to disagree about the same roof.
            shape: { to: 'roofType', map: legacyRoofTypeFromShape },
            // ⚠ NAME ≠ CONCEPT. The legacy record has no `pitch`; it has `slope`,
            // in rise/run rather than radians. The standing note that this could
            // not be mirrored rested on a grep for the WORD.
            pitch: { to: 'slope', map: legacyRoofSlopeFromPitch },
        },
    },
    column: {
        store: (deps) => deps.columnStore,
        pluginStoreKey: 'column',
        // ⚠ `ColumnStore.update(id, nextState: Omit<ColumnData,'id'|'type'>)` re-attaches
        // id/type and then VALIDATES the merged record — so it must receive a complete
        // one. A one-key partial fails `validateColumnData` or, worse, passes it with
        // defaults. Same class as the slab's, different mechanism.
        write: 'whole',
        fields: {
            height: { to: 'height' }, // ColumnTypes height, metres, both sides.
        },
    },
};

/** The families this mirror can serve, for a probe that wants to assert the census
 *  rather than trust this file's prose. */
export const MIRRORED_UPDATE_KINDS: readonly string[] = Object.freeze(
    Object.keys(LEGACY_UPDATABLE_STORES),
);

function readLegacy(store: LegacyUpdatableStore, id: string): Record<string, unknown> | undefined {
    const raw = store.getById?.(id) ?? store.get?.(id);
    return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
}

/**
 * Mirror ONE `element.updated` into the legacy geometry store its family renders
 * from.
 *
 * Three-valued by construction: it either APPLIED (and says which legacy fields it
 * wrote), or it REFUSED (and says why). It never reports success over a no-op —
 * failure and emptiness are never the same value.
 */
export function applyElementUpdate(
    ev: ElementUpdatedEventLike,
    deps: ElementUpdateMirrorDeps,
): ElementUpdateOutcome {
    const kind = ev.elementKind ?? '';
    const id = ev.elementId ?? '';
    const changed = ev.changedFields ?? [];
    if (kind.length === 0 || id.length === 0) {
        return { applied: false, reason: `element.updated with no kind/id (kind='${kind}', id='${id}')` };
    }
    if (changed.length === 0) {
        return { applied: false, reason: `${kind} '${id}': changedFields is empty — nothing to mirror` };
    }

    const adapter = LEGACY_UPDATABLE_STORES[kind];
    if (!adapter) {
        // ⛔ A NAMED gap, not a silent one. This fires when the bridge's
        // `ELEMENT_UPDATE_VERBS` has a row for a family this table does not — the
        // exact half-wiring that made `wall.changeLevel` succeed and change nothing.
        return {
            applied: false,
            reason:
                `no legacy update adapter for kind '${kind}' — the bridge declares an ` +
                `ELEMENT_UPDATE_VERBS row for it and LEGACY_UPDATABLE_STORES does not. ` +
                `The command succeeded and the render store still holds its own copy.`,
        };
    }

    const store = adapter.store(deps);
    if (!store || typeof store.update !== 'function') {
        return { applied: false, reason: `legacy store for kind '${kind}' is not wired into this mirror` };
    }

    const source = deps.pluginRecord(adapter.pluginStoreKey, id);
    if (!source) {
        // The values live in the plugin record. Without it there is nothing to copy,
        // and inventing one would write defaults over a real element.
        return {
            applied: false,
            reason:
                `${kind} '${id}': the plugin store '${adapter.pluginStoreKey}' has no such ` +
                `record, so the changed values could not be read. (Subscriber ordering: ` +
                `attachStores must apply the patch before CommandEventBridge emits.)`,
        };
    }

    const current = readLegacy(store, id);
    if (!current) {
        // Not an error in itself — an element the legacy store never received (its
        // create-mirror is missing, or it is filtered by level) cannot be updated.
        // Saying WHICH is what makes this actionable.
        return {
            applied: false,
            reason:
                `${kind} '${id}': absent from the legacy render store, so there is nothing ` +
                `to update. Its CREATE mirror is the thing that is missing, not this one.`,
        };
    }

    const patch: Record<string, unknown> = {};
    const wrote: string[] = [];
    const refused: string[] = [];
    for (const field of changed) {
        const bridge = adapter.fields[field];
        if (!bridge) { refused.push(field); continue; }
        // ⛔ Only fields the plugin record actually HOLDS. A verb may declare three
        // fields and commit one (`slab.setType` writes `materialId` only when it was
        // sent); copying an absent one would write `undefined` over a real value.
        if (!Object.prototype.hasOwnProperty.call(source, field)) continue;
        patch[bridge.to] = bridge.map ? bridge.map(source[field]) : source[field];
        wrote.push(bridge.to);
    }

    if (wrote.length === 0) {
        return {
            applied: false,
            reason:
                `${kind} '${id}': none of [${changed.join(', ')}] has a declared field bridge ` +
                `(unbridged: [${refused.join(', ')}]) or the plugin record carries none of them.`,
        };
    }

    const next = adapter.write === 'whole' ? { ...current, ...patch } : patch;
    store.update(id, next as never);

    // The plan pipeline projects per level and does not watch the legacy store's
    // field writes, so the storey is dirtied explicitly — the same third step
    // `applyElementLevelChange` takes, and for the same reason.
    const levelId = current['levelId'];
    if (typeof levelId === 'string' && levelId.length > 0) {
        try { deps.viewDependencyTracker?.markLevelsDirty([levelId]); }
        catch { /* non-fatal — a dirty-marking failure must not lose the write */ }
    }

    if (refused.length > 0) {
        console.warn(
            `[elementUpdatedMirror] §MIRROR-UPDATE (L-9942): ${kind} '${id}' — wrote ` +
            `[${wrote.join(', ')}] and REFUSED [${refused.join(', ')}]: those fields have no ` +
            `declared bridge into the legacy record, so they changed in the model and not on ` +
            `screen. Add a row to LEGACY_UPDATABLE_STORES, or remove them from the verb's ` +
            `ELEMENT_UPDATE_VERBS row — a field declared in one table and not the other is ` +
            `exactly the half-wiring this channel exists to stop.`,
        );
    }
    return { applied: true, elementKind: kind, elementId: id, fields: wrote };
}

/**
 * Subscribe the mirror to `element.updated`. Returns nothing: the runtime event bus
 * owns the lifetime, exactly as `registerElementLevelChangeBridge` does.
 *
 * ⭐ EVERY REFUSAL IS LOGGED. A mirror that returns `{applied:false}` into a
 * discarded value is the `ApplyRingBufferOutcome` defect (`performUndoRedo.ts:471`:
 * *"every caller but the AI chat bridge threw the value away"*), and it would leave
 * this channel exactly as silent as the absence it replaces.
 */
export function registerElementUpdateBridge(
    events: { on(event: 'element.updated', handler: (ev: ElementUpdatedEventLike) => void): unknown },
    deps: ElementUpdateMirrorDeps,
): void {
    events.on('element.updated', (ev) => {
        let outcome: ElementUpdateOutcome;
        try {
            outcome = applyElementUpdate(ev, deps);
        } catch (err) {
            console.error(
                `[elementUpdatedMirror] §MIRROR-UPDATE (L-9942): mirroring ` +
                `${ev.elementKind ?? '?'} '${ev.elementId ?? '?'}' threw — the element changed ` +
                `in the model and not on screen:`, err,
            );
            return;
        }
        if (outcome.applied) {
            console.log(
                `[elementUpdatedMirror] §MIRROR-UPDATE: ${outcome.elementKind} ` +
                `'${outcome.elementId}' → legacy store [${outcome.fields.join(', ')}]` +
                (ev.commandType ? ` (via ${ev.commandType})` : ''),
            );
        } else {
            console.warn(
                `[elementUpdatedMirror] §MIRROR-UPDATE (L-9942): NOT MIRRORED — ${outcome.reason}` +
                (ev.commandType ? ` (via ${ev.commandType})` : ''),
            );
        }
    });
}
