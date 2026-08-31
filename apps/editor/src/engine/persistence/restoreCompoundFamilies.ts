// restoreCompoundFamilies — the LOAD half of §PERSIST103 (L-11520), and since
// §FIX-BOUNDARY-LINE-RESTORE-STRANDED (L-11528) the load half of C106's boundary
// line as well.
//
// C13 (*"projects must never silently disappear"*) · C104 (lift) · ADR-0124 (pool) ·
// C103 (balcony) · C106 + ADR-0348 (boundary line) · C47 (a missing key means "none
// authored", never an error) · C84 EI-6 (persistence is not optional; absence must
// be loud) · C84 EI-9 (one authority per concept).
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ A SAVE WITHOUT A RESTORE IS A FILE THAT HOLDS THE DATA AND AN EDITOR THAT
//    CANNOT SHOW IT. That sentence was written by the boundary-line fix, in
//    `ProjectLoader.ts`, above a restore that sat on the load path production does
//    not take — so the family it was written for was one of the families it
//    described. This module is the other half for all SEVEN: the five §PERSIST103
//    gave a snapshot key, the boundary line whose key was already there, and the
//    C109 bathroom pod (§PERSIST-BATHROOM-POD, L-11527).
// ═══════════════════════════════════════════════════════════════════════════════
//
// ─── WHY IT DOES NOT RE-DISPATCH `lift.create` / `pool.create` / `balcony.create` ──
// This is THE design decision in the file, and getting it wrong would turn a
// data-LOSS bug into a data-DUPLICATION bug, which is worse: the user can see what
// is missing, and cannot see what is doubled until the schedule is wrong.
//
// Those three verbs each write SIX / FOUR / FOUR stores:
//
//     lift.create    -> ['lift','liftPart','wall','curtainwall','door','slab']
//     pool.create    -> ['pool','wall','slab','water']
//     balcony.create -> ['balcony','slab','floor','handrail']
//
// and `CommandEventBridge` MIRRORS every one of those members into the LEGACY store
// that `ProjectSerializer` reads (`wall.created`, `curtain-wall.created`,
// `wall.opening.created`, …). So the members ALREADY round-trip under `walls`,
// `curtainWalls`, `doors`, `slabs`, `floors` and `handrails`, and they are ALREADY
// restored, before this runs, by those families' own loops.
//
// ⛔ Re-dispatching the create verb here would mint a SECOND copy of every member:
// a lift would come back with eight shaft walls instead of four. C104 §13 forbids
// drawing a compound's members twice; this is the same rule one layer up.
//
// ⭐ SO WHAT IS RESTORED IS EXACTLY WHAT WAS LOST — no more:
//   · the PARENT record (`childrenIds`, `hostWallId` / `hostSlabId`, profile, mark),
//     without which the members survive as anonymous walls and slabs and the element
//     stops being a lift/pool/balcony at all — not selectable, schedulable or
//     deletable as one;
//   · `liftPart` and `water`, the two slices with NO family to fall back on. Both
//     were destroyed outright: the cabin vanished while the shaft remained, and a
//     reloaded pool was a dry hole.
//
// ─── WHY IT GOES THROUGH THE UNDO ADAPTERS ────────────────────────────────────
// ⭐ BECAUSE REDO ALREADY SOLVES EXACTLY THIS PROBLEM, AND IT IS ALREADY PROVEN.
// "Put these records back into their plugin DTO store and make the result appear on
// screen" is character-for-character what `liftCompoundUndoAdapter` /
// `liftPartUndoAdapter` / `poolUndoAdapter` / `waterUndoAdapter` do on the redo of a
// delete (§LIFT94 L-11340, §POOL95 L-11350). They own the render seam — a REGISTERED
// SINK over the same `LiftCompoundMeshBuilder` / water builder instance the
// `lift.created` subscriber drives — and they own the microtask deferral that stops a
// compound being drawn from zero parts.
//
// Writing a second road to the same store would mint a rival render channel (C84
// EI-9) and would rediscover the ordering bug `liftUndoAdapter`'s header already
// documents. `Store.applyPatch()` is the very method the bus calls on execute, so an
// `add` patch here is the same operation a create is — no bridge, no cast.
//
// ⛔ AND IT IS WHY THIS FILE IS NOT IN `ImportProjectCommand`. That command is L2
// (`packages/command-registry`); these adapters are L7. The layer rule is not the
// only reason though, and the other one is the load-bearing one: `boundaryLine` was
// given a restore step in `ProjectLoader.ts` by L-9948 and **`grep -c boundaryLine
// ImportProjectCommand.ts` → 0**, while `_useImportCommandPath()` defaults to TRUE —
// so that restore did not run in production at all (L-11528). ⭐ CLOSED 2026-08-30
// by MOVING it in here rather than by writing a third copy: Step 10c is deleted and
// the block at the foot of this file is the one authority. Duplicating a restore into
// two load paths is how that happened in the first place. This
// module is instead called ONCE from `ProjectLoader`, in the COMMON TAIL after the
// `if (useImportCommandPath) … else …` join, so both paths get it by construction and
// neither can drift from the other.
//
// ─── C47 — OLD SNAPSHOTS ───────────────────────────────────────────────────────
// Every key is optional. A snapshot that lacks `lifts` is a project saved before
// 2026-08-26, and "no lifts were authored" IS its correct reading — never an error,
// never a warning. `undefined` and `[]` take the same silent path.

import type { Patch } from '@pryzm/command-bus';
import {
    liftCompoundUndoAdapter,
    liftPartUndoAdapter,
    flushLiftRender,
    resolveLiftStoresFromWindow,
} from '../undo/liftUndoAdapter';
import {
    poolUndoAdapter,
    waterUndoAdapter,
    resolvePoolStoresFromWindow,
} from '../undo/poolUndoAdapter';
import {
    boundaryLineUndoAdapter,
    resolveBoundaryLineStoreFromWindow,
} from '../undo/pluginStoreUndoAdapter';
import {
    bathroomPodUndoAdapter,
    resolveBathroomPodStoreFromWindow,
} from '../undo/bathroomPodUndoAdapter';

/** What the caller gets back, so the loader can roll these into its own tally. */
export interface CompoundRestoreResult {
    /** Records written into a plugin DTO store, by storeKey. */
    readonly restored: Readonly<Record<string, number>>;
    /** Human-readable failures — never thrown, always reported (C03 §4.6 U-4). */
    readonly errors: readonly string[];
    readonly total: number;
}

/** A record as it comes off the snapshot: opaque, but it must carry an `id`. */
type SnapRecord = Readonly<Record<string, unknown>> & { id?: unknown };

function readSlice(snapshot: unknown, key: string): SnapRecord[] {
    const v = (snapshot as Record<string, unknown> | null)?.[key];
    // C47: absent key ⇒ nothing was authored. Not an error, not a warning.
    return Array.isArray(v) ? (v as SnapRecord[]) : [];
}

/**
 * `[{op:'add', path:[id], value:rec}]` — the ROOT-LEVEL add convention
 * `Store.applyPatch` documents and `produceCommand` mints. A record with no usable
 * id is DROPPED AND NAMED: applying it would either throw inside Immer or land
 * under `undefined`, and a record silently filed under `undefined` is the same
 * corruption this whole lane exists to close.
 */
function addPatches(records: readonly SnapRecord[], storeKey: string, errors: string[]): {
    patches: Patch[];
    ids: string[];
} {
    const patches: Patch[] = [];
    const ids: string[] = [];
    for (const rec of records) {
        const id = rec?.id;
        if (typeof id !== 'string' || id.length === 0) {
            errors.push(
                `[restoreCompoundFamilies] §PERSIST103 — a '${storeKey}' record in the snapshot has no ` +
                `usable id and was NOT restored. It is in the file and will not be in the model.`,
            );
            continue;
        }
        patches.push({ op: 'add', path: [id], value: rec } as unknown as Patch);
        ids.push(id);
    }
    return { patches, ids };
}

/**
 * Restore the compound slices §PERSIST103 added to the snapshot, plus the C106
 * boundary line (L-11528) and the C109 bathroom pod (L-11527).
 *
 * ⚠ NEVER THROWS. A load that dies on one malformed lift would lose the whole
 * project, which is a strictly worse outcome than the defect being fixed (C13). Every
 * failure is collected and returned so the loader can surface it — a correctly
 * diagnosed failure that reaches nobody is still a silent failure.
 */
export function restoreCompoundFamilies(snapshot: unknown): CompoundRestoreResult {
    const errors: string[] = [];
    const restored: Record<string, number> = {};

    const lifts     = readSlice(snapshot, 'lifts');
    const liftParts = readSlice(snapshot, 'liftParts');
    const pools     = readSlice(snapshot, 'pools');
    const waters    = readSlice(snapshot, 'waters');
    const balconies = readSlice(snapshot, 'balconies');
    // §PERSIST-BATHROOM-POD (L-11527 / L-11405) · C109 §8 — the pod PARENT. Its members
    // round-tripped all along under `plumbing`; the identity that owns them did not.
    const bathroomPods = readSlice(snapshot, 'bathroomPods');
    // §FIX-BOUNDARY-LINE-RESTORE-STRANDED (L-11528) — see the block at the foot of
    // this function for why the C106 setting-out line moved in here.
    const boundaryLines = readSlice(snapshot, 'boundaryLines');

    if (lifts.length + liftParts.length + pools.length + waters.length
        + balconies.length + boundaryLines.length + bathroomPods.length === 0) {
        return { restored, errors, total: 0 };
    }

    // ── LIFT (C104) ──────────────────────────────────────────────────────────
    //
    // ⛔ PARTS FIRST, THEN THE COMPOUND — the inverse of the order the ring buffer
    // uses, and deliberately so. `liftUndoAdapter` defers its render to a microtask
    // precisely because `applyRingBufferSide` walks `affectedStores` in declaration
    // order and would otherwise rebuild a compound from zero parts. Here there is no
    // such walk, so the honest thing is to make the parts PRESENT before the compound
    // schedules its draw, and then flush ONCE at the end. Both mechanisms hold; this
    // does not depend on the microtask, and the microtask does not depend on this.
    if (lifts.length > 0 || liftParts.length > 0) {
        // A part with no compound is not a lift, it is half a snapshot. Say so —
        // `flushLiftRender` refuses to draw an empty shaft, and this names WHY.
        if (lifts.length === 0 && liftParts.length > 0) {
            errors.push(
                `[restoreCompoundFamilies] §PERSIST103 — the snapshot carries ${liftParts.length} liftPart ` +
                `record(s) and ZERO lift compounds. C104 §2: a part is never created alone, so this file ` +
                `is inconsistent and the cabin will not be drawn.`,
            );
        }
        try {
            const partSide = addPatches(liftParts, 'liftPart', errors);
            if (partSide.patches.length > 0) {
                liftPartUndoAdapter(resolveLiftStoresFromWindow).applyPatch(partSide.patches);
                restored['liftPart'] = partSide.ids.length;
            }
        } catch (e) {
            errors.push(`[restoreCompoundFamilies] liftPart restore FAILED — the cabins are lost: ${String(e)}`);
        }
        try {
            const liftSide = addPatches(lifts, 'lift', errors);
            if (liftSide.patches.length > 0) {
                liftCompoundUndoAdapter(resolveLiftStoresFromWindow).applyPatch(liftSide.patches);
                restored['lift'] = liftSide.ids.length;
                // Draw NOW as well as on the adapter's microtask. `flushLiftRender` is
                // idempotent (it rebuilds the group from the store's current contents),
                // and calling it here means a synchronous caller — a test, or a load
                // that resolves before the microtask drains — sees the finished lift
                // rather than an empty scene it cannot distinguish from a failure.
                flushLiftRender(liftSide.ids, resolveLiftStoresFromWindow);
            }
        } catch (e) {
            errors.push(`[restoreCompoundFamilies] lift restore FAILED — the lifts are lost: ${String(e)}`);
        }
    }

    // ── POOL (ADR-0124) ──────────────────────────────────────────────────────
    // The pool parent renders nothing (ADR-0124 §3 — identity and ownership, no
    // geometry); `water` is the one member with a mesh of its own, and its adapter
    // flushes synchronously off the record it just applied.
    if (pools.length > 0 || waters.length > 0) {
        try {
            const poolSide = addPatches(pools, 'pool', errors);
            if (poolSide.patches.length > 0) {
                poolUndoAdapter(resolvePoolStoresFromWindow).applyPatch(poolSide.patches);
                restored['pool'] = poolSide.ids.length;
            }
        } catch (e) {
            errors.push(`[restoreCompoundFamilies] pool restore FAILED — the pools are lost: ${String(e)}`);
        }
        try {
            const waterSide = addPatches(waters, 'water', errors);
            if (waterSide.patches.length > 0) {
                waterUndoAdapter(resolvePoolStoresFromWindow).applyPatch(waterSide.patches);
                restored['water'] = waterSide.ids.length;
            }
        } catch (e) {
            errors.push(`[restoreCompoundFamilies] water restore FAILED — the pools reload DRY: ${String(e)}`);
        }
    }

    // ── BALCONY (C103) ───────────────────────────────────────────────────────
    //
    // ⚠ NO ADAPTER, AND THAT IS MEASURED RATHER THAN ASSUMED. `balcony` is still an
    // `owner: 'nothing'` row in `UNMAPPED_BUS_STORE_KEYS` — L-7310, "REACHABLE AND
    // STRANDED": Ctrl+Z after drawing a balcony is a total no-op and no
    // `balconyUndoAdapter` exists to borrow. Writing one is a lane of its own
    // (L-11529, OPEN), not a side effect of a persistence fix.
    //
    // ⭐ AND THE BALCONY DOES NOT NEED ONE HERE, for a reason that is a fact about
    // the family rather than a convenience: there is no balcony mesh builder at all
    // (`packages/geometry-balcony/src` holds Assembly / Dimensions / Geometry and no
    // builder; nothing in `initTools.ts` subscribes a balcony render). Its visible
    // geometry IS its members — the slab, the floor finish and the railings — every
    // one of which is a first-class record restored and drawn by its OWN family
    // before this runs. So the restore is a pure store write, and calling it "the
    // render half is missing" would be wrong: there is no render half to miss.
    //
    // `applyPatch` is the same method the bus calls on execute, reached through the
    // same lazy `window.runtime.stores` resolution the adapters use — so a recomposed
    // runtime cannot leave this writing into a stale store.
    if (balconies.length > 0) {
        try {
            const store = (window as unknown as {
                runtime?: { stores?: Record<string, { applyPatch?: (p: readonly Patch[]) => unknown } | undefined> };
            }).runtime?.stores?.['balcony'];
            if (!store || typeof store.applyPatch !== 'function') {
                // ⛔ LOUD, NEVER SILENT (C84 EI-6). The records are in the file; if the
                // store is unreachable they are not in the model, and the user must not
                // discover that by finding a balcony missing.
                errors.push(
                    `[restoreCompoundFamilies] §PERSIST103 — runtime.stores.balcony is not reachable, so ` +
                    `${balconies.length} balcony record(s) are in the file and NOT in the model.`,
                );
            } else {
                const side = addPatches(balconies, 'balcony', errors);
                if (side.patches.length > 0) {
                    store.applyPatch(side.patches);
                    restored['balcony'] = side.ids.length;
                }
            }
        } catch (e) {
            errors.push(`[restoreCompoundFamilies] balcony restore FAILED — the balconies are lost: ${String(e)}`);
        }
    }

    // ── BATHROOM POD (C109) — §PERSIST-BATHROOM-POD, L-11527 / L-11405 ───────
    //
    // ⭐ THE FAMILY WAS DECLARED UNPERSISTED, WHICH IS HONEST, AND STILL DESTROYED
    //    WORK SILENTLY. `snapshotFamilyCoverage.ts` carried the row and the gate
    //    printed it on every run — but nothing said it at AUTHORING time, and the
    //    reload did not look like a loss: the WC, the basin and the shower all came
    //    back (they are `plumbing` fixtures the mirror projected and the serializer
    //    saved), so what the architect saw was a bathroom that had quietly stopped
    //    being a POD. That is the balcony defect with a note attached.
    //
    // ⛔ IT DOES NOT RE-DISPATCH `bathroomPod.create`, for the reason the header
    //    gives for the five families above AND one more that is specific here: the
    //    create verb runs the C109 SOLVER, so a re-dispatch would re-fit the pod to
    //    today's rules rather than restore the pod the architect approved. An `add`
    //    patch of the serialized record is the only route that returns the SAME pod.
    //
    // ⭐ WHY THE UNDO ADAPTER. `bathroomPodUndoAdapter` already owns exactly this
    //    operation — `Store.applyPatch()`, the very method the bus calls on execute —
    //    and `bathroomPodMemberMirror` is subscribed to that store's `subscribeDirty`,
    //    so the members are re-projected into the legacy fixture store by the SAME one
    //    road CREATE, UNDO and REDO already take. No rival render channel (C84 EI-9).
    //
    // ⚠ THE RE-PROJECTION IS WHAT MAKES THE ROUND TRIP LOSSLESS, NOT A SIDE EFFECT.
    //    `serializePlumbing` emits neither `parentId` nor `showerVariant` /
    //    `accessoryVariant`, and `CreatePlumbingFixtureCommand` re-seats every restored
    //    fixture on the FINISHED floor (`resolveFloorSeatingDatum`) while the mirror
    //    writes `baseOffset: 0` off the solver datum. So the fixtures Step 10 restores
    //    are missing their ownership link, may be missing their variant, and may sit at
    //    a different Y. Re-deriving them from the pod record — the C109 §2 authority —
    //    corrects all three, and is stable across repeated reloads because the pod
    //    record, not the projection, is the thing being saved.
    //
    // ⛔ L-11485 COMES DUE HERE, AND IS NAMED RATHER THAN DISCOVERED. A member an
    //    architect moved with `plumbing.moveFixture` writes the LEGACY store only; the
    //    pod record does not learn about it, so that move does NOT survive this
    //    restore. Per C109 §2 the projection is not independent state and the pod
    //    record is the authority, so this is the contract's answer rather than a
    //    regression — but it is a user-visible consequence and the honest fix is to
    //    give the pod record the move (a `bathroomPod.update` verb, C109 R-1), not to
    //    merge two producers of one number here.
    if (bathroomPods.length > 0) {
        try {
            const live = resolveBathroomPodStoreFromWindow();
            if (live === null) {
                // ⛔ LOUD, NEVER SILENT (C84 EI-6). UNREACHABLE and EMPTY are different
                // facts and must not arrive as the same value.
                errors.push(
                    `[restoreCompoundFamilies] §PERSIST-BATHROOM-POD — runtime.stores.bathroomPod is not ` +
                    `reachable, so ${bathroomPods.length} bathroom pod(s) are in the file and NOT in the ` +
                    `model: their members will come back as ordinary hand-placed fixtures (L-11405).`,
                );
            } else {
                const side = addPatches(bathroomPods, 'bathroomPod', errors);
                if (side.patches.length > 0) {
                    bathroomPodUndoAdapter(resolveBathroomPodStoreFromWindow).applyPatch(side.patches);
                    restored['bathroomPod'] = side.ids.length;
                }
            }
        } catch (e) {
            errors.push(
                `[restoreCompoundFamilies] §PERSIST-BATHROOM-POD restore FAILED — the pods are lost ` +
                `and their fixtures are orphaned: ${String(e)}`,
            );
        }
    }

    // ── BOUNDARY LINE (C106 · ADR-0348) — §FIX-BOUNDARY-LINE-RESTORE-STRANDED, L-11528 ──
    //
    // ⭐ THIS FAMILY WAS SAVED AND NEVER READ BACK, AND THE REASON WAS PLACEMENT, NOT
    //    ABSENCE. L-9948 wrote a correct restore — `ProjectLoader.ts` Step 10c, which
    //    dispatched `boundaryLine.create` per record — and put it in the LEGACY branch
    //    of `if (useImportCommandPath) … else …`. Measured 2026-08-29:
    //
    //        grep -c 'boundaryLine' packages/command-registry/src/project/ImportProjectCommand.ts  ->  0
    //        ProjectLoader._useImportCommandPath()                                                 ->  true (default)
    //
    //    so the restore sat on the branch production does not take. The file held the
    //    data and the editor could not show it — the sentence this module's own header
    //    opens with, and the failure the header cited as *"reported not fixed here"*.
    //    It is fixed HERE, past the branch join, which is the placement that makes
    //    "which load path am I on?" stop being a question anyone can get wrong again.
    //    Step 10c is deleted in the same commit: two roads to one store would be C84
    //    EI-9, and the async `create` racing this synchronous write would non-
    //    deterministically reset `attachments[]` to `[]`.
    //
    // ─── WHY THE UNDO ADAPTER AND NOT `boundaryLine.create` ───────────────────
    // ⭐ IT IS THE SAME ARGUMENT THE FIVE FAMILIES ABOVE MAKE, PLUS ONE MORE.
    //    `boundaryLineUndoAdapter` (§FIX-BOUNDARY-LINE-UNDO-STRANDED, L-11160) already
    //    owns exactly this operation: `Store.applyPatch()` — the very method the bus
    //    calls on execute — followed by the family's OWN bus events
    //    (`boundaryLine.created`), so `initTools.ts` §FT-BOUNDARY-LINE builds the 3-D
    //    linework and `installBoundaryLinePlanSymbolBuilder` picks up the plan symbol.
    //    One render authority, reached by the road that already exists. Writing a
    //    second one here is the rival-channel defect this module was created to avoid.
    //
    // ⭐ AND IT CLOSES L-9950 AS A SIDE EFFECT, WHICH THE BUS ROUTE COULD NOT.
    //    `CreateBoundaryLineHandler` writes `attachments: []` by construction, so the
    //    Step 10c route destroyed the attachment edges on every load even when it ran.
    //    An `add` patch of the SERIALIZED RECORD carries `attachments[]` back verbatim.
    //
    // ⚠ NOT A COMPOUND, and the module name is now one word too narrow. It is here
    //    because "restored once, in the common tail, through the family's existing
    //    store+render seam" is the property that matters, and splitting it into a
    //    second module would recreate the two-places problem in a new place.
    if (boundaryLines.length > 0) {
        try {
            const live = resolveBoundaryLineStoreFromWindow();
            if (live === null) {
                // ⛔ LOUD, NEVER SILENT (C84 EI-6). UNREADABLE and EMPTY are different
                // facts and must not arrive as the same value.
                errors.push(
                    `[restoreCompoundFamilies] §L-11528 — runtime.stores.boundaryLine is not reachable, ` +
                    `so ${boundaryLines.length} boundary line(s) are in the file and NOT in the model.`,
                );
            } else {
                const side = addPatches(boundaryLines, 'boundaryLine', errors);
                if (side.patches.length > 0) {
                    boundaryLineUndoAdapter(resolveBoundaryLineStoreFromWindow).applyPatch(side.patches);
                    restored['boundaryLine'] = side.ids.length;
                }
            }
        } catch (e) {
            errors.push(
                `[restoreCompoundFamilies] §L-11528 boundaryLine restore FAILED — the setting-out ` +
                `lines are lost: ${String(e)}`,
            );
        }
    }

    const total = Object.values(restored).reduce((a, b) => a + b, 0);
    return { restored, errors, total };
}
