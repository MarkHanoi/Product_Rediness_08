// bathroomPodUndoAdapter — undo/redo coverage for the C109 BATHROOM POD compound.
//
// §BATH102 (L-11480..L-11486) · C109 §8 / §9 axis 5 · C03 §4.7-4.8 · C16 §8.6.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS IS THE **FOURTH** FAMILY TO NEED THIS EXACT SHAPE IN THREE DAYS
//    (boundaryLine L-11160 → lift L-11340 → pool L-11350 → bathroomPod), AND IT IS
//    DELIBERATELY THE SAME SHAPE RATHER THAN A FOURTH SPELLING OF IT.
// ═══════════════════════════════════════════════════════════════════════════════
// The defect all four share: `_covered()` in `performUndoRedo` is ALL-OR-NOTHING, so
// a PatchPair naming a store with no adapter is DECLINED ENTIRELY and `performUndo`
// falls through to the legacy `commandManager`, which has never heard of the verb.
// Ctrl+Z is then a TOTAL NO-OP that the user is told succeeded — silent data
// retention, not a failed undo.
//
// ⛔ FOR THIS FAMILY THERE IS NO LEGACY STORE TO POINT AT, AND THAT IS BY DESIGN.
// `plugins/plumbing/src/bathroomPodStore.ts` opens by declaring that the pod family
// has EXACTLY ONE store on purpose (C84 EI-1 holding by construction, the `boundaryLine`
// / C106 §1 shape). ⚠ Do NOT alias `window.plumbingStore`: that is the LEGACY FIXTURE
// store, a different store holding different records, and applying a pod inverse to it
// would be C03 §4.6 U-2b's corrupting case — the same aliasing `liftUndoAdapter.ts`
// forbids by name for `window.liftStore`. This resolves `runtime.stores.bathroomPod`,
// the store `PluginRegistry` actually builds and the bus actually writes.
//
// ── ⭐ AND IT RENDERS NOTHING, WHICH IS NOT AN OMISSION ─────────────────────────
// The pool's parent adapter says the same thing for the same reason. A pod record
// "carries no geometry of its own beyond its placement and its room envelope"
// (C109 §1). Its MEMBERS are what appear on screen, and they are materialised by
// `bathroomPodMemberMirror`, which subscribes to this store's OWN `subscribeDirty()`
// — the diff `applyPatch` emits.
//
// ⭐ THAT IS WHY THERE IS NO REGISTERED RENDER SINK HERE. `Store.applyPatch()` is
// called by the bus on EXECUTE and by this adapter on UNDO and REDO, and it notifies
// its subscribers every time. So create, undo, redo and delete all reach the mirror
// through ONE subscription — there is no second road that could drift from the first,
// which is the property the lift's sink had to be hand-built to get.

import type { Patch } from '@pryzm/command-bus';
import type { PatchApplicableAdapter } from './elementUndoStoreAdapter.js';
import type { PatchableRecordStore } from './pluginStoreUndoAdapter.js';

/** What the adapter needs at apply time. One store — the family has exactly one. */
export interface BathroomPodUndoStores {
    readonly bathroomPod: PatchableRecordStore;
}

/**
 * Adapter for storeKey `bathroomPod` — the C109 compound record.
 *
 * ⚠ LAZY STORE RESOLUTION, same rule as L-11160/L-11340/L-11350. The store lives on
 * the composed runtime, which does not exist when `buildUndoStoreMap()` is first
 * called. Resolving at APPLY time keeps the map key present and HONEST: `_covered()`
 * sees a working `applyPatch`, and a genuinely absent runtime THROWS a named error
 * that `applyRingBufferSide` reports as a per-store failure — never a silent no-op.
 * L-980's rule ("a permanently-undefined adapter is a lie") is kept, not bent.
 */
export function bathroomPodUndoAdapter(
    resolve: () => BathroomPodUndoStores | null,
): PatchApplicableAdapter {
    return {
        applyPatch(patches: readonly Patch[]): void {
            const live = resolve();
            if (live === null) {
                // ⛔ NEVER a silent no-op. `_covered()` saw a working `applyPatch` and
                // promised this side would land; if the runtime is genuinely absent the
                // promise is broken and it must be REPORTED. Returning quietly would
                // make a broken undo indistinguishable from a successful one.
                throw new Error(
                    '[undo] bathroomPod: runtime.stores.bathroomPod is not reachable — the ' +
                    'composed runtime is absent, so the inverse was NOT applied ' +
                    '(L-11480, C03 §4.7 B1).',
                );
            }
            // The member projection happens inside `subscribeDirty`, which this call
            // fires. See the header for why that is one road rather than two.
            live.bathroomPod.applyPatch(patches);
        },
    };
}

/** The production resolver: the ONE store, off the composed runtime. */
export function resolveBathroomPodStoreFromWindow(): BathroomPodUndoStores | null {
    if (typeof window === 'undefined') return null;
    const rt = (window as unknown as { runtime?: { stores?: { bathroomPod?: unknown } } }).runtime;
    const bathroomPod = rt?.stores?.bathroomPod as PatchableRecordStore | undefined;
    if (!bathroomPod || typeof bathroomPod.applyPatch !== 'function') return null;
    return { bathroomPod };
}
