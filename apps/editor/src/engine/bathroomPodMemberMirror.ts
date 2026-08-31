// bathroomPodMemberMirror — the pod's MEMBERS become real `plumbing` fixture records.
//
// §BATH102 (L-11480..L-11486) · C109 §2 / §6 / §7 / §8 / §9 axes 6-7 · C84 EI-9.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS EXISTS AT ALL: `affectedStores` IS `['bathroomPod']`, AND THE MEMBERS
//    STILL HAVE TO REACH THE FAMILY THAT DRAWS THEM.
// ═══════════════════════════════════════════════════════════════════════════════
// C109 §2 reason 2 names the five consumers a pod member must reach:
// `PlumbingFragmentBuilder` (3-D), `PlumbingPlanSymbolBuilder`,
// `PlumbingElevationSymbolBuilder`, `ProjectSerializer` and `PlumbingReader` (IFC).
// **All five read the LEGACY fixture store** — `@pryzm/geometry-plumbing`'s
// `PlumbingStore`, published as `window.plumbingStore` by `initBuilders.ts`.
//
// ⛔ AND `ctx.stores.plumbing` IS NOT THAT STORE. It is the plugin DTO store
// (`Store<Plumbing>` — a PIPE: kind / diameter / bendRadius), which is why
// `CreateBathroomPod.ts` declares ONE affected store and this module exists. See that
// file's header for the two measurements, and C109 §8's 2026-08-26 amendment.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ ONE ROAD, NOT TWO: `Store.subscribeDirty()`.
// ═══════════════════════════════════════════════════════════════════════════════
// `Store.applyPatch()` is called by the bus on EXECUTE and by `bathroomPodUndoAdapter`
// on UNDO and REDO, and it notifies its subscribers every time with a `DirtyDiff`
// computed by COMPARING STATE BEFORE AND AFTER — not by trusting the patch op. So
// CREATE, UNDO, REDO and DELETE all arrive here through ONE subscription.
//
// That is the property the lift had to hand-build a render sink to get (there is no
// `'lift.deleted'` key in `RuntimeEvents`, so an undo could not be relayed as a bus
// event). Here it falls out of the store, and there is no second channel that could
// drift from the first — the defect class `[[committed-is-not-reachable]]` and C84 EI-1
// are both about exactly that drift.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ THE LEGACY FIXTURE RECORDS ARE A **PROJECTION**, NOT INDEPENDENT STATE.
// ═══════════════════════════════════════════════════════════════════════════════
// They are re-derived from the pod record on every diff and reaped when it leaves.
// Consequences, stated rather than discovered later:
//
//  · They are NOT on the ring buffer for `bathroomPod.*`. They do not need to be:
//    undo removes the pod, the diff says `removed`, and this module reaps them; redo
//    adds it back and this module re-projects. **C109 §7 / R-4 — no orphan carries a
//    `parentId` to a record that is gone** — is satisfied by construction rather than
//    by a second cascade that could be forgotten, which is the `DeleteStairCommand`
//    defect (zero references to openings, void left punched through the plate forever).
//  · A member an architect MOVES with `plumbing.move` writes the legacy store directly.
//    Today nothing re-projects an existing pod (there is no `bathroomPod.update` verb —
//    C109 R-1), so that move survives. ⛔ WHEN AN UPDATE VERB IS MINTED, this is the
//    clause to revisit: a blind re-projection would silently discard the architect's
//    move. **L-11485, OPEN.**
//  · ⛔ THE POD ITSELF IS NOT DRAWN. It "carries no geometry of its own beyond its
//    placement and its room envelope" (C109 §1), and drawing a box around the module
//    would be a second representation of the room the architect already owns.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT THIS DOES **NOT** CLOSE, NAMED SO A GREEN RUN IS NOT OVER-READ.
// ═══════════════════════════════════════════════════════════════════════════════
// A saved-and-reloaded project keeps every MEMBER (they are in the legacy store the
// serializer writes) and LOSES THE PARENT — `ProjectSerializer` knows nothing about
// pods. So `childrenIds`, the drill-in and the delete-reap do not survive a reload,
// and the members come back as ordinary hand-placed fixtures. That is **L-11405**,
// C109 §12's own open row, and this module does not pretend to close it.

// §G3-STALE-FIX (lane L3b, per the 2026-08-31 L2b measurement) — the ONE import this
// module carries. The same seam `initTools.ts:176` and `CreateCurtainWallCommand.ts`
// §CW90 use: the `@pryzm/core-app-model` singleton, directly. Members are registered
// against `pod.levelId` BEFORE `store.add()` (whose `'plumbing'` create event the VDT
// can then TARGET to the level instead of the §G3-STALE coarse all-non-3D-views
// fallback), and unregistered in the reap loop. Because this module sees execute /
// undo / redo alike via `subscribeDirty`, registration survives undo by construction.
// ⛔ The POD's own id is NOT registered — nothing draws it (§PLAN-MEMBERSHIP-RULE
// precondition (1) fails; see the file header).
import { viewDependencyTracker } from '@pryzm/core-app-model';

/**
 * The narrowest shape of the LEGACY fixture store this module needs.
 *
 * ⭐ DECLARED STRUCTURALLY, NEVER IMPORTED. `@pryzm/geometry-plumbing` is L2 and this
 * file is L7 engine glue; the import would be legal but pointless, and a structural
 * shape states exactly which two methods the mirror depends on. `add()` emits
 * `bim-plumbing-added` and `remove()` emits `bim-plumbing-removed`
 * (`PlumbingStore.ts`), which is what makes the 3-D mesh appear and disappear — this
 * module mints no render capability of its own.
 */
export interface LegacyPlumbingFixtureStore {
    add(data: Record<string, unknown>): void;
    remove(id: string): void;
    get(id: string): unknown;
}

/** A pod member as this module reads it back — structural, no L2 import for a type. */
interface PodMemberView {
    readonly id: string;
    readonly kind: string;
    readonly fixtureType: string;
    readonly variant?: string;
    readonly position: { readonly x: number; readonly y: number; readonly z: number };
    readonly rotationY: number;
    readonly footprint: { readonly width: number; readonly length: number; readonly height: number };
}

/** A pod record as this module reads it back. */
interface PodView {
    readonly id: string;
    readonly levelId: string;
    readonly members: readonly PodMemberView[];
    readonly materialId?: string;
}

/** The store shape `subscribeDirty` lives on. Structural, for the same reason. */
export interface DirtyPodStore {
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
 * The variant field a `PlumbingFixtureData` carries, per fixture family.
 *
 * ⛔ THE POD DOES NOT INVENT A VARIANT VOCABULARY (C109 R-6 / §2.1). The slug on the
 * member came out of `BathroomPodRules`' documented defaults or the author's override,
 * and the legacy record spells it in a per-family key — `toiletVariant`,
 * `showerVariant`, `accessoryVariant` — because that is what `PlumbingFragmentBuilder`
 * and `resolveFixtureFootprint` read. This is a TRANSLATION between two existing
 * vocabularies, not a third one.
 *
 * ⭐ AND THE SHOWER'S GLASS PANEL RIDES ITS VARIANT SLUG, WHICH IS THE WHOLE OF R-8.
 * `shower_walkin_left` decodes through `walkInGlassSide()` inside the shower's own
 * builder, which emits the tray, the gutter, the frameless glass panel AND its return
 * as ONE fixture. Minting a separate `panel` member would draw the glass twice —
 * z-fighting, doubled transmission cost, one id meaning two objects (C84 EI-9).
 */
function variantKeyFor(fixtureType: string): string | null {
    if (fixtureType === 'toilet') return 'toiletVariant';
    if (fixtureType === 'shower') return 'showerVariant';
    if (fixtureType === 'accessory') return 'accessoryVariant';
    // `sink` and `bath` have no variant table in this family today. The basin is
    // deliberately LOD 200 (C109 §6) and its upgrade path is L-11408.
    return null;
}

/**
 * One member, as a `PlumbingFixtureData` the legacy store accepts.
 *
 * ⚠ `position.y` IS TAKEN FROM THE SOLVER AND `baseOffset` IS 0. The solver already
 * places every member at the room's own datum, and `CreatePlumbingFixtureCommand`'s
 * finished-floor seating (`resolveFloorSeatingDatum`, §FIX-INTERIOR-FFL-SEATING) is a
 * property of THAT command's path, not of this projection. ⛔ Applying a second datum
 * shift here would move every pod member by the floor finish thickness a second time —
 * two producers of one number, which is the drift class C109 §4 exists to forbid.
 * **L-11486, OPEN:** a pod placed in a room with a thick tile bed is seated on the SLAB
 * rather than the finished floor, which is the defect §FIX-INTERIOR-FFL-SEATING closed
 * for hand-placed fixtures. The honest fix is to give the SOLVER the datum, not to add
 * a shift here.
 */
function fixtureRecordFor(pod: PodView, m: PodMemberView): Record<string, unknown> {
    const key = variantKeyFor(m.fixtureType);
    return {
        id: m.id,
        type: 'plumbing_fixture',
        fixtureType: m.fixtureType,
        ...(key !== null && m.variant !== undefined ? { [key]: m.variant } : {}),
        position: { x: m.position.x, y: m.position.y, z: m.position.z },
        rotation: { x: 0, y: m.rotationY, z: 0 },
        levelId: pod.levelId,
        baseOffset: 0,
        width: m.footprint.width,
        length: m.footprint.length,
        height: m.footprint.height,
        // ⭐ C109 §2.3 — the OWNERSHIP LINK, on every member. `parentId` is what makes
        // the drill-in, the inspector and the delete-reap answerable from the record
        // rather than from a spatial query (C109 §7 / R-4).
        parentId: pod.id,
        ...(pod.materialId !== undefined ? { materialId: pod.materialId } : {}),
        properties: {},
    };
}

/** The legacy fixture store, or `null` when there is no browser (headless, tests). */
function legacyStore(): LegacyPlumbingFixtureStore | null {
    if (typeof window === 'undefined') return null;
    const s = (window as unknown as { plumbingStore?: LegacyPlumbingFixtureStore }).plumbingStore;
    if (!s || typeof s.add !== 'function' || typeof s.remove !== 'function') return null;
    return s;
}

/**
 * Project one diff of the pod store onto the legacy fixture store.
 *
 * Exported so a test drives the REAL function the subscription calls, rather than a
 * re-implementation of it — a fake built from the header cannot falsify the header.
 *
 * @param reaped the members of every pod that LEFT the store, captured BEFORE the
 *        removal (the store no longer holds them, so they cannot be read back).
 */
export function projectBathroomPodMembers(
    diff: { readonly added: ReadonlySet<string>; readonly updated: ReadonlySet<string>; readonly removed: ReadonlySet<string> },
    state: ReadonlyMap<string, unknown>,
    reaped: ReadonlyMap<string, readonly string[]>,
    store: LegacyPlumbingFixtureStore | null = legacyStore(),
): void {
    if (store === null) return;

    // ── Reap first ────────────────────────────────────────────────────────────
    // ⛔ BY `childrenIds`, NEVER SPATIALLY (C109 §7 / R-4). *"Delete the fixtures
    // inside this rectangle"* is wrong the moment an architect hand-places a bidet in
    // the same room. The list came from the RECORD before it was removed.
    for (const podId of diff.removed) {
        for (const memberId of reaped.get(podId) ?? []) {
            try {
                store.remove(memberId);
            } catch (err) {
                console.error(
                    '[bathroomPodMemberMirror] failed to reap member ' + memberId +
                    ' of pod ' + podId + ':', err,
                );
            }
            // §G3-STALE-FIX (lane L3b) — AFTER remove(), so the store's `'plumbing'`
            // delete event still resolves this id to its level (targeted), THEN the
            // map entry goes. Outside the try: the pod record is gone either way, and
            // a stale entry is exactly the phantom association §A.2 exists to prune.
            viewDependencyTracker.unregisterElement(memberId);
        }
    }

    // ── Then project ──────────────────────────────────────────────────────────
    for (const podId of [...diff.added, ...diff.updated]) {
        const pod = state.get(podId) as PodView | undefined;
        if (pod === undefined || !Array.isArray(pod.members)) continue;
        for (const m of pod.members) {
            // §G3-STALE-FIX (lane L3b) — BEFORE add(): `PlumbingStore.add()` emits the
            // `'plumbing'` create event synchronously, and the VDT can attribute it to
            // the pod's level only if the member id is already registered. Idempotent
            // (`Map.set`) for the `updated` re-projection path.
            viewDependencyTracker.registerElement(m.id, pod.levelId);
            try {
                store.add(fixtureRecordFor(pod, m));
            } catch (err) {
                console.error(
                    '[bathroomPodMemberMirror] failed to project member ' + m.id +
                    ' of pod ' + podId + ':', err,
                );
            }
        }
    }
}

/**
 * Subscribe the mirror to the pod store. Idempotent per store instance; returns the
 * disposer.
 *
 * Called once from `initTools.ts`, where the composed runtime is in scope.
 */
export function attachBathroomPodMemberMirror(store: DirtyPodStore): () => void {
    return store.subscribeDirty((diff, state) => {
        // ⚠ THE REAPED LISTS MUST BE READ BEFORE THE STATE IS CONSULTED FOR THEM, and
        // by the time this listener runs the removals have ALREADY landed — `Store`
        // reconciles its Map and then notifies. So the member ids of a removed pod are
        // unreadable from `state`. They are captured in the pre-notify snapshot below.
        projectBathroomPodMembers(diff, state, _lastKnownMembers);
        // Refresh the snapshot for the NEXT diff, from the state as it now stands.
        _lastKnownMembers = _snapshotMembers(state);
    });
}

/**
 * The member ids of every pod, as of the last notification.
 *
 * ⭐ THIS EXISTS BECAUSE A REMOVED POD CANNOT BE READ BACK. `Store.applyPatch` deletes
 * the entry from its Map and THEN notifies, so `state.get(removedId)` is `undefined`
 * by the time the listener runs — and C109 §7 forbids falling back to a spatial query
 * to find what to reap. A one-map snapshot, refreshed on every notification, is the
 * cheapest honest answer: it is derived from the RECORD (R-5) and never from the scene.
 */
let _lastKnownMembers: ReadonlyMap<string, readonly string[]> = new Map();

function _snapshotMembers(state: ReadonlyMap<string, unknown>): ReadonlyMap<string, readonly string[]> {
    const out = new Map<string, readonly string[]>();
    for (const [id, rec] of state) {
        const members = (rec as PodView | undefined)?.members;
        if (Array.isArray(members)) out.set(id, members.map((m) => m.id));
    }
    return out;
}

/** Test-only reset so one spec's snapshot cannot leak into the next. */
export function __resetBathroomPodMemberMirrorForTests(): void {
    _lastKnownMembers = new Map();
}
