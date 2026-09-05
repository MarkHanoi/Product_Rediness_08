/**
 * attachComponentRender — the component store's dirty channel becomes the placed
 * occurrence's 3-D solids, through the ONE bake.
 *
 * §82.6-COMPONENT-RENDER-MOUNT · STR-UCE-MASTER-SPEC §82.6 · ADR-0376 D10 · C113 §10 ·
 * C84 EI-9 · C03 §4.6 · audit R1 (`UCE-REACHABILITY-AUDIT.md`).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ THIS IS THE MOUNT THE AUDIT RANKED #1 — "a placed component draws NOTHING".
 * ═══════════════════════════════════════════════════════════════════════════════
 * `ComponentCommitter` was written, tested and never registered on the production
 * render path; the composed runtime's `CommitterHost` route (`bootstrap.render.
 * everything.ts`) has ZERO production callers, so registering there would have been
 * the [[committed-is-not-reachable]] shape one layer down. The path that DOES run
 * in production is `initTools` → store `subscribeDirty` → mesh builder, the house
 * pattern `attachSpaceEnvelopeRender.ts` documents (L-12900); this file is the same
 * shape with the committer as the builder.
 *
 * ⭐ ONE ROAD, NOT THREE — `Store.subscribeDirty()` fires on EXECUTE, UNDO and REDO
 * alike (`applyPatch` is the one method the bus, `composedStoreUndoAdapter(
 * 'component', …)` and `restoreCompoundFamilies` all call), so one subscription
 * draws a placement, erases it on Ctrl+Z, redraws it on Ctrl+Y and paints a
 * restored project — no bus-event mirror, no undo sink, no second channel to
 * disagree with the first (C84 EI-9).
 *
 * ⭐ THE BAKE PORT IS THE REAL BAKE ON THE REAL CATALOGUE ENTRY. `bakeFamilyInstance`
 * receives `catalog.entry(definitionId).family` — the loader's document, never a
 * projection — with the occurrence's `instanceParameters` passed STRAIGHT THROUGH,
 * so `resolveParameter()` inside the bake stays the one resolver (ADR-0376 D4).
 * The preview (`componentPreviewSubject.ts`) calls the same function on the same
 * document: what the author sees in the workspace is what the viewport draws.
 *
 * ⛔ WHAT IT REFUSES. A `definitionId` the catalogue does not hold renders as an
 * EMPTY marked group with a counted warning (`stats.unresolvedDefinitions`), never
 * a placeholder box (spec §75). ⭐ And it is NOT a dead end: the catalogue is
 * subscribed, so when that definition later loads — a project's definitions are
 * restored asynchronously (`restoreComponentDefinitions.ts`) while the records are
 * restored synchronously — every occurrence is re-baked and appears.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH. That a component appears in PLAN or SECTION:
 * there is no plan-symbol producer for this family (spec §21–22 — ABSENT, audit
 * §2.5), and registering the id with the view-dependency tracker makes the element
 * KNOWN to that pipeline, not drawn by it. Nor viewport PICKING — the meshes carry
 * `userData.elementId` and `primitiveType='component'` like every other family's,
 * but no pick strategy is registered for the kind (audit J11 stays PARTIAL).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { MaterialPool } from '@pryzm/scene-committer';
import { bakeFamilyInstance } from '@pryzm/family-instance';
import type { ComponentData } from '@pryzm/plugin-component';

import { ComponentCommitter } from './ComponentCommitter';
import type { BakeComponentInstance, BakeResultLike } from './ports';

/** The store shape `subscribeDirty` lives on. Structural, so no import edge is owed. */
export interface DirtyComponentStore {
    getState(): ReadonlyMap<string, unknown>;
    subscribeDirty(
        listener: (
            diff: {
                readonly added: ReadonlySet<string>;
                readonly updated: ReadonlySet<string>;
                readonly removed: ReadonlySet<string>;
            },
            state: ReadonlyMap<string, unknown>,
        ) => void,
    ): () => void;
}

/**
 * The THREE faces of the ONE catalogue this seam needs — `has()` for the
 * committer's port, `entry()` for the bake, `subscribe()` for late definitions.
 * Structural: `ComponentCatalog` satisfies it unchanged and a test can hand a
 * fresh instance. ⛔ No default — a wiring without a catalogue has no answer, and
 * an invented one is [[fake-more-capable-than-real]] at the render seam.
 */
export interface ComponentDefinitionCatalogLike {
    has(definitionId: string): boolean;
    entry(definitionId: string): {
        readonly family: {
            readonly manifest: Parameters<typeof bakeFamilyInstance>[0]['family']['manifest'];
            readonly document: Parameters<typeof bakeFamilyInstance>[0]['family']['document'];
            readonly schemaHash: string;
        };
    } | undefined;
    subscribe(listener: () => void): () => void;
}

export interface ComponentRenderDeps {
    readonly store: DirtyComponentStore;
    /** The scene root the occurrence groups are added to. */
    readonly scene: THREE.Object3D;
    readonly catalog: ComponentDefinitionCatalogLike;
    /** Shared pool when the wiring has one; a private pool otherwise. */
    readonly materialPool?: MaterialPool;
    /** Storey elevation in metres for a `levelId` — see `ComponentCommitterDeps.levelY`. */
    readonly levelY?: (levelId: string) => number;
    /** Fired after an occurrence's solids attached (or cleared). `solidCount` 0 = nothing drawn. */
    readonly onGeometryReady?: (id: string, solidCount: number) => void;
    /** Make the element and its storey known to the plan pipeline. Best effort. */
    readonly registerElement?: (id: string, levelId: string) => void;
}

export interface ComponentRenderHandle {
    /** The live committer — its `stats` are the numbers "did it draw?" is answered with. */
    readonly committer: ComponentCommitter;
    /** Ids currently holding a group in the scene. */
    drawnIds(): readonly string[];
    /** Remove the subscriptions and every drawn group. Call on project teardown. */
    dispose(): void;
}

/**
 * Wire the family's 3-D leg. Returns a handle whose `dispose()` removes the store
 * and catalogue subscriptions and every drawn group — call it on project teardown,
 * or the next runtime gets two subscribers and every component is drawn twice.
 */
export function attachComponentRender(deps: ComponentRenderDeps): ComponentRenderHandle {
    const materialPool = deps.materialPool ?? new MaterialPool();
    const ownsPool = deps.materialPool === undefined;

    // ⭐ THE BAKE PORT — the real bake on the catalogue's own entry. Refuses by
    // throwing when the entry is gone between `has()` and here (a remove raced the
    // bake); the committer counts that under `refusedBakes` and draws nothing.
    const bake: BakeComponentInstance = async (input): Promise<BakeResultLike> => {
        const entry = deps.catalog.entry(input.definitionId);
        if (entry === undefined) {
            throw new Error(
                `[attachComponentRender] definition ${input.definitionId} is not loaded in the ` +
                'catalogue at bake time — nothing drawn for it.',
            );
        }
        return bakeFamilyInstance({
            family: entry.family,
            typeId: input.typeId,
            instanceOverrides: input.instanceOverrides,
        });
    };

    const groups = new Map<string, THREE.Group>();
    const committer = new ComponentCommitter({
        materialPool,
        bake,
        definitions: deps.catalog,
        ...(deps.levelY !== undefined ? { levelY: deps.levelY } : {}),
        ...(deps.onGeometryReady !== undefined ? { onGeometryReady: deps.onGeometryReady } : {}),
    });

    const register = (dto: ComponentData): void => {
        // ⚠ Canonical level resolution, the §DIAG-WALL-LEVEL rule: an EMPTY levelId is
        // refused rather than defaulted, or the element bleeds onto the ground plan.
        const levelId = (dto.levelId ?? '').trim();
        if (levelId.length === 0) {
            console.warn(
                `[attachComponentRender] ⚠ '${dto.id}' has NO levelId — skipping spatial registration.`,
            );
            return;
        }
        try { deps.registerElement?.(dto.id, levelId); }
        catch (err) { console.warn('[attachComponentRender] registerElement failed (non-fatal):', err); }
    };

    const add = (id: string, state: ReadonlyMap<string, unknown>): void => {
        const dto = state.get(id) as ComponentData | undefined;
        if (!dto) return;
        const existing = groups.get(id);
        if (existing !== undefined) {
            committer.onUpdate(id, dto, existing);
            return;
        }
        const group = committer.onAdd(id, dto);
        groups.set(id, group);
        deps.scene.add(group);
        register(dto);
    };

    const update = (id: string, state: ReadonlyMap<string, unknown>): void => {
        const dto = state.get(id) as ComponentData | undefined;
        if (!dto) return;
        const group = groups.get(id);
        if (group === undefined) {
            add(id, state);
            return;
        }
        committer.onUpdate(id, dto, group);
        register(dto);
    };

    const remove = (id: string): void => {
        const group = groups.get(id);
        if (group === undefined) return;
        committer.onRemove(id, group);
        groups.delete(id);
    };

    // ── The initial draw. ⭐ NOT OPTIONAL. A subscriber alone draws only what changes
    // AFTER it is installed, so every occurrence restored by `restoreCompoundFamilies`
    // — which runs on project open, before this — would be in the model and invisible.
    for (const id of deps.store.getState().keys()) add(id, deps.store.getState());

    const unsubscribeStore = deps.store.subscribeDirty((diff, state) => {
        // ⚠ REMOVALS FIRST — `Store` has already reconciled its Map, so a removed id
        // is unreadable from `state`; reaping it is the only thing to do with it.
        for (const id of diff.removed) remove(id);
        for (const id of diff.added) add(id, state);
        for (const id of diff.updated) update(id, state);
    });

    // ── Late and changed definitions — §82.6-DEFINITION-INVALIDATION. Every
    // catalogue notification re-bakes every drawn occurrence: a definition that
    // arrived after its instances now draws them; a definition the author just
    // saved re-shapes its twenty placed instances (spec §66 F-2, at the render seam).
    // ⚠ Deliberately coarse — catalogue events are load/save/remove, which are rare
    // and per-definition; the cost is one bake per occurrence per event.
    const unsubscribeCatalog = deps.catalog.subscribe(() => {
        committer.invalidateDefinition();
    });

    return {
        committer,
        drawnIds: () => [...groups.keys()],
        dispose(): void {
            try { unsubscribeStore(); } catch { /* non-fatal */ }
            try { unsubscribeCatalog(); } catch { /* non-fatal */ }
            for (const id of [...groups.keys()]) remove(id);
            committer.onDispose();
            if (ownsPool) {
                try { materialPool.dispose(); } catch { /* non-fatal */ }
            }
        },
    };
}
