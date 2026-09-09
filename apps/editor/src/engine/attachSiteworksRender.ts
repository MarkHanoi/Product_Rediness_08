// attachSiteworksRender — the family's 3-D leg. C116 §3 / §7 · ADR-0384.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ ONE ROAD, NOT THREE: `Store.subscribeDirty()`
// ═══════════════════════════════════════════════════════════════════════════════
//
// `Store.applyPatch()` notifies `subscribeDirty` on EXECUTE, UNDO and REDO alike, and
// that single fact is why C116 §7's GENERIC undo adapter is correct for this family.
// The contract says so explicitly and warns what changes with it:
//
//   ⚠ "The generic adapter is only correct because the render seam subscribes the
//      store's dirty channel … ⛔ A renderer driven by bus EVENTS instead would need a
//      bespoke adapter (`boundaryLine`'s shape), because `performUndoRedo` emits no bus
//      events."
//
// ⛔ SO DO NOT ADD A BUS SUBSCRIBER HERE. Three roads into the scene — a bus listener,
// a dirty listener and a manual redraw — is how a surface ends up drawn twice on
// create and not at all on undo, and each path passes its own test.

import type { Siteworks } from '@pryzm/schemas';
import { SiteworksMeshBuilder } from './SiteworksMeshBuilder';
import type * as THREE from '@pryzm/renderer-three/three';

/** The store shape `subscribeDirty` lives on. Structural, so no import edge is owed. */
export interface DirtySiteworksStore {
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

export interface SiteworksRenderDeps {
    readonly store: DirtySiteworksStore;
    /** The scene root the plates are added to. */
    readonly scene: THREE.Object3D;
    /**
     * Resolve a storey's elevation in metres, or `null` when it cannot be resolved.
     *
     * ⛔ `null` IS A REAL ANSWER AND IT IS NOT `0`. §DIAG-WALL-LEVEL and
     * §CONTEXT-DATA-HONESTY: "I do not know which storey this is on" and "it is on the
     * ground storey" are different facts, and defaulting the first to the second draws
     * a road through whatever happens to be at zero. When this returns `null` the
     * surface is REFUSED and the refusal is logged by name.
     */
    readonly levelElevation: (levelId: string) => number | null;
    /** Make the element and its storey known to the plan pipeline. Best effort. */
    readonly registerElement?: (id: string, levelId: string) => void;
}

/**
 * Wire the family's 3-D leg. Returns a disposer that removes the subscription and
 * every drawn group — call it on project teardown, or the next runtime gets two
 * subscribers and every surface is drawn twice.
 */
export function attachSiteworksRender(deps: SiteworksRenderDeps): () => void {
    const builder = new SiteworksMeshBuilder(deps.scene);

    /** Draw one record, reporting a refusal to draw BY NAME rather than skipping it. */
    const draw = (id: string, state: ReadonlyMap<string, unknown>): void => {
        const record = state.get(id) as Siteworks | undefined;
        if (!record) return;

        // ⚠ Canonical level resolution, the §DIAG-WALL-LEVEL rule: `'' ?? 'L0'` is `''`,
        // so an EMPTY levelId is refused rather than defaulted — otherwise the surface
        // bleeds onto the ground plan.
        const levelId = (record.levelId ?? '').trim();
        if (levelId.length === 0) {
            console.warn(
                `[siteworks] ⚠ '${id}' has NO levelId — not drawn. A surface with no storey has `
                + 'no datum to be measured from, and seating it at 0 would be a guess the user '
                + 'could not see.',
            );
            return;
        }
        const elevation = deps.levelElevation(levelId);
        if (elevation === null) {
            console.warn(
                `[siteworks] ⚠ '${id}' names storey '${levelId}', whose elevation could not be `
                + 'resolved — not drawn. ⛔ NOT defaulted to 0: an unresolved elevation and a '
                + 'ground-storey elevation must never share a value (§CONTEXT-DATA-HONESTY).',
            );
            return;
        }

        const outcome = builder.updateSiteworks(record, elevation);
        if (outcome.drew === 'nothing') {
            // The geometry authority's own sentence, verbatim. A surface that is in the
            // store and not on screen now says WHY, at the layer that knows.
            console.warn(`[siteworks] '${id}' drew NOTHING — ${outcome.reason}`);
            return;
        }
        try { deps.registerElement?.(id, levelId); }
        catch (err) { console.warn('[siteworks] registerElement failed (non-fatal):', err); }
    };

    // ── The initial draw. ⭐ NOT OPTIONAL, AND NOT A CONVENIENCE. A subscriber alone
    // draws only what changes AFTER it is installed, so every surface restored by
    // `restoreCompoundFamilies` — which runs on project open, BEFORE this — would be in
    // the model and invisible. That is the same half-wired shape as a save with no
    // restore, one layer out.
    for (const id of deps.store.getState().keys()) draw(id, deps.store.getState());

    const unsubscribe = deps.store.subscribeDirty((diff, state) => {
        // ⚠ REMOVALS FIRST. By the time this listener runs `Store` has already reconciled
        // its Map, so a removed id is unreadable from `state` — reaping it is the only
        // thing that can be done with it, and doing it first keeps the scene from
        // briefly holding a group whose record is gone.
        for (const id of diff.removed) builder.removeSiteworks(id);
        for (const id of diff.added) draw(id, state);
        for (const id of diff.updated) draw(id, state);
    });

    return () => {
        unsubscribe();
        builder.dispose();
    };
}
