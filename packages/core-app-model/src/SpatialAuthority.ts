import * as THREE from '@pryzm/renderer-three/three';
import { BimManager, Level } from './BimKernel';

export interface WorldTransform {
    position: THREE.Vector3;
    rotation: THREE.Euler;
    scale: THREE.Vector3;
}

/**
 * §13 CONTRACT: Thrown when resolveWorldTransform() cannot determine the correct
 * elevation for an element. The forbidden L0 fallback has been removed; callers
 * must ensure every element is registered in a BIM level before requesting its
 * world transform.
 */
export class SpatialAuthorityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SpatialAuthorityError';
    }
}

/**
 * Phase 1 — Spatial & Identity Hardening
 * Single Spatial Authority Resolver
 *
 * This resolver is the ONLY authoritative way to compute an element's world transform.
 * It eliminates decentralized elevation logic and direct scene traversal dependencies.
 */
export class SpatialAuthority {
    private static instance: SpatialAuthority;
    private bimManager: BimManager | null = null;

    // FIX 1: Track registered reconciliation listener to avoid stacking multiple
    // window event listeners when resolveWorldTransform is called repeatedly.
    private _reconciliationListenerRegistered = false;

    // ✅ FIX §2.1 §4: Callback registered by the owner layer (EngineBootstrap) so
    // the reconciliation listener never touches scene objects directly.
    // The callback receives (levelId, elementIds[], elevationDeltaM?) and is
    // responsible for triggering the correct store → event bus → builder rebuild
    // pipeline. `elevationDeltaM` (PR-10, 2026-08-14) is the level's elevation
    // change (new − old) carried by the 'spatial-authority-reconcile' detail —
    // the BimKernel dispatch has always sent it and this listener used to drop
    // it. The roof→walls-beneath clash subscriber needs it: a STRANDED roof's
    // real origin is (newElevation − delta) + baseOffset, and without the delta
    // every strand would read as clean.
    private _levelRebuildCallback:
        ((levelId: string, elementIds: string[], elevationDeltaM?: number) => void) | null = null;

    // Injected store reference — eliminates window global read in getSemanticData
    private _roofStore: any = null;

    setRoofStore(store: { getAll?(): any[]; get?(id: string): any; getById?(id: string): any }): void {
        this._roofStore = store;
    }

    private constructor() {}

    static getInstance(): SpatialAuthority {
        if (!SpatialAuthority.instance) {
            SpatialAuthority.instance = new SpatialAuthority();
        }
        return SpatialAuthority.instance;
    }

    setBimManager(manager: BimManager) {
        this.bimManager = manager;
    }

    /**
     * ✅ FIX §2.1 §4: Register the callback that EngineBootstrap provides so the
     * reconciliation listener can trigger rebuilds through the proper pipeline
     * (store → event bus → builder) instead of mutating scene objects directly.
     *
     * Only one callback is supported; a second call replaces the previous one.
     */
    registerLevelRebuildCallback(
        fn: (levelId: string, elementIds: string[], elevationDeltaM?: number) => void,
    ): void {
        this._levelRebuildCallback = fn;

        // ── §LEVEL-CASCADE-ARMING (L-7200, lane LEVEL36, 2026-08-23) ─────────
        //
        // ⛔ THE CASCADE USED TO BE UNREACHABLE IN A NORMAL SESSION, and this
        // one line is why. `ensureReconciliationListener()` was called from
        // exactly ONE place: the tail of `resolveWorldTransform()` (:172).
        //
        // MEASURED (both `rg` and `grep -rn`, cross-checked because a single
        // grep is not proof): `resolveWorldTransform` has exactly ONE
        // production call site in the whole repo —
        // `geometry-wall/src/WallFragmentBuilder.ts:1256` — and it sits in the
        // `else` arm of `if (worldY !== undefined)`. The authoritative path,
        // `updateWall()`, COMPUTES `worldY` itself
        // (`WallFragmentBuilder.ts:861`: `level.elevation + slabBaseOffset +
        // wall.baseOffset`) and passes it in, precisely so the builder does not
        // reach back into SpatialAuthority — that was the §13/§4 layering fix.
        //
        // So on the normal path the resolver is never called, the listener is
        // never added, and `BimKernel.updateLevel()`'s
        // `spatial-authority-reconcile` dispatch fired INTO A VOID. Arming was
        // incidental: it happened only if some other code path called
        // `buildWall()` without a `worldY` (a miter-adjust rebuild), i.e. only
        // if the user happened to have drawn intersecting walls first.
        //
        // This is the ABSENT-vs-UNREACHABLE distinction (C01 §6 rule 6): the
        // reconcile machinery was fully AUTHORED and correct — it was simply
        // never switched on. Registering the callback is definitionally the
        // moment the listener must exist, so arm it here. Idempotent: the
        // `_reconciliationListenerRegistered` guard makes repeat registration
        // free, and the resolver still arms it for direct-resolver callers.
        this.ensureReconciliationListener();
    }

    /**
     * Authority: Semantic state is source of truth.
     * Resolves the world transform of an element based on its level and semantic properties.
     */
    resolveWorldTransform(elementId: string): WorldTransform {
        if (!this.bimManager) {
            throw new SpatialAuthorityError("SpatialAuthority: BimManager not initialized.");
        }

        const semanticData = this.getSemanticData(elementId);

        // Handle hosted elements (Windows/Doors)
        if (semanticData && (semanticData.type === 'window' || semanticData.type === 'door') && semanticData.wallId) {
            const wall = this.getSemanticData(semanticData.wallId);
            if (wall && wall.baseLine) {
                const [start, end] = wall.baseLine;
                const baselineVec = new THREE.Vector3().subVectors(end, start);
                const dir = baselineVec.clone().normalize();

                // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): semanticData.offset is the
                // LEFT EDGE of the opening span [offset, offset+width]; the element CENTRE
                // (its world transform position) = offset + width/2.
                const halfWidth = (Number(semanticData.width) || 0) / 2;
                const pos = start.clone().add(dir.multiplyScalar(semanticData.offset + halfWidth));

                const wallTransform = this.resolveWorldTransform(semanticData.wallId);
                const sillHeight = semanticData.sillHeight ?? 0;
                const worldY = wallTransform.position.y + sillHeight + (semanticData.height / 2);

                return {
                    position: new THREE.Vector3(pos.x, worldY, pos.z),
                    rotation: new THREE.Euler(0, -Math.atan2(dir.z, dir.x), 0),
                    scale: new THREE.Vector3(1, 1, 1)
                };
            }
        }

        // 1. Locate element in spatial structure
        const levels = this.bimManager.getLevels();
        let targetLevel: Level | null = null;
        let lookupSucceeded = false;
        let semanticFallbackUsed = false;

        for (const level of levels) {
            if (level.childrenIds.includes(elementId)) {
                targetLevel = level;
                lookupSucceeded = true;
                break;
            }
        }

        // Authority Fallback: If element is not registered in any level, check its levelId property
        if (!targetLevel && semanticData?.levelId) {
            targetLevel = this.bimManager.getLevelById(semanticData.levelId) || null;
            if (targetLevel) semanticFallbackUsed = true;
        }

        // ✅ FIX §13: The forbidden L0 fallback has been removed.
        // Per §13, when an element cannot be located in any BIM level, we MUST throw
        // rather than silently misplace it at the fallback level's elevation.
        // The calling command is responsible for calling bimManager.registerElement()
        // before invoking resolveWorldTransform().
        if (!targetLevel) {
            throw new SpatialAuthorityError(
                `[SpatialAuthority] §13 CONTRACT VIOLATION: Element "${elementId}" is not ` +
                `registered in any BIM level and carries no valid levelId semantic data. ` +
                `A forbidden elevation fallback to L0 is prohibited per §13. ` +
                `Ensure bimManager.registerElement() is called in the responsible Command ` +
                `before resolveWorldTransform() is invoked.`
            );
        }

        const elevation = targetLevel.elevation;
        const baseOffset = semanticData?.baseOffset || 0;
        const verticalPosition = semanticData?.verticalPosition || 0;

        const worldY = elevation + baseOffset + verticalPosition;

        console.debug(`[SpatialAuthority] Resolved transform for ${elementId}:`, {
            levelId: semanticData?.levelId,
            elevation,
            lookupSucceeded,
            semanticFallbackUsed,
            worldY,
            timestamp: Date.now()
        });

        // FIX 1: Register the reconciliation listener only once.
        this.ensureReconciliationListener();

        return {
            position: new THREE.Vector3(semanticData?.x || 0, worldY, semanticData?.z || 0),
            rotation: new THREE.Euler(0, semanticData?.rotationY || 0, 0),
            scale: new THREE.Vector3(1, 1, 1)
        };
    }

    /**
     * FIX 1: Extracted to a dedicated method that guards against multiple registrations.
     *
     * ✅ FIX §2.1 §4: The reconciliation listener no longer directly mutates scene
     * objects (obj.position, obj.rotation). Instead it delegates to the registered
     * level rebuild callback, which triggers the proper store → event bus → builder
     * rebuild pipeline. If no callback is registered, a warning is logged and the
     * listener exits without touching the scene.
     */
    private ensureReconciliationListener() {
        if (this._reconciliationListenerRegistered) return;
        this._reconciliationListenerRegistered = true;

        window.addEventListener('spatial-authority-reconcile', (e: any) => {
            const { levelId, delta } = e.detail;
            // PR-10 — pass the elevation delta through instead of dropping it.
            // Absence is preserved as `undefined`, never coerced to 0: "no delta
            // recorded" and "the level did not move" are different facts, and the
            // stranded-roof consumer refuses to classify on the former.
            const elevationDeltaM = typeof delta === 'number' && Number.isFinite(delta) ? delta : undefined;

            const level = this.bimManager?.getLevelById(levelId);
            if (!level) return;

            const affectedIds = Array.from(level.childrenIds as string[]);
            if (affectedIds.length === 0) return;

            if (!this._levelRebuildCallback) {
                // No callback registered — warn and exit without touching the scene.
                console.warn(
                    `[SpatialAuthority] §2.1 §4: No level rebuild callback registered. ` +
                    `Skipping reconciliation for level "${levelId}". ` +
                    `Call spatialAuthority.registerLevelRebuildCallback() during engine bootstrap.`
                );
                return;
            }

            // ── C72 §5.1: classify every affected element against RECONCILABLE_TYPES ──
            // Delivered: DETERMINED-RECONCILED (the reconcile handles the kind) and
            // UNDETERMINED (fail-open — C78 §1.4 forbids inferring "unaffected" from
            // missing data; this also preserves the pre-narrowing behaviour for ids no
            // store answers for). Excluded: DETERMINED-HOSTED (re-rendered by the host
            // wall's own rebuild) and DETERMINED-STRANDED (determined kind with NO
            // reconcile consumer — announced below by name, never dropped silently).
            const delivered: string[] = [];
            const strandedByKind = new Map<string, string[]>();
            let hostedCount = 0;
            let undeterminedCount = 0;
            for (const id of affectedIds) {
                const c = this.classifyForReconcile(id);
                switch (c.outcome) {
                    case 'DETERMINED-RECONCILED':
                        delivered.push(id);
                        break;
                    case 'UNDETERMINED':
                        delivered.push(id);
                        undeterminedCount++;
                        break;
                    case 'DETERMINED-HOSTED':
                        hostedCount++;
                        break;
                    case 'DETERMINED-STRANDED': {
                        const ids = strandedByKind.get(c.kind) ?? [];
                        ids.push(id);
                        strandedByKind.set(c.kind, ids);
                        break;
                    }
                }
            }

            if (strandedByKind.size > 0) {
                // C72 §5.1 — the shortfall, recorded BY NAME at the moment it bites:
                // these elements stay at the old elevation until a per-kind rebuild
                // entry point exists (gap register PR-07; 'Roof' also PR-10).
                const detail = [...strandedByKind.entries()]
                    .map(([kind, ids]) => `${kind}×${ids.length} [${ids.join(', ')}]`)
                    .join('; ');
                console.warn(
                    `[SpatialAuthority] C72 §5.1 SHORTFALL — level "${levelId}" reconcile: ` +
                    `${detail} have a DETERMINED type with no reconcile consumer and remain ` +
                    `at the old elevation (gap register PR-07${strandedByKind.has('Roof') ? '/PR-10' : ''}).`
                );
            }

            console.debug(
                `[SpatialAuthority] reconcile level "${levelId}": delivered ${delivered.length}/${affectedIds.length} ` +
                `(undetermined fail-open: ${undeterminedCount}, hosted-follow-wall: ${hostedCount}, ` +
                `stranded: ${[...strandedByKind.values()].reduce((n, ids) => n + ids.length, 0)}).`
            );

            // ✅ §2.1 §4 COMPLIANT: delegate to the owner layer for rebuilds.
            // Invoked whenever the level has children — the slab half of the
            // callback queries by levelId, independent of the delivered ids.
            this._levelRebuildCallback(levelId, delivered, elevationDeltaM);
        });
    }

    /**
     * C72 §5.1 / C78 §1.1 — the ONE production consumer of RECONCILABLE_TYPES.
     *
     * Determines, per element, what the level-elevation reconcile can honestly
     * claim about it. Kind determination is by STORE OF RECORD (the store the id
     * resolves in), mirroring getSemanticData()'s probe order — never by a
     * free-text `type` field, which this file has no authority over.
     *
     * The four outcomes are documented on ReconcileClassification. The
     * fail-open rule (C78 §1.4): an id no reachable store answers for is
     * UNDETERMINED and is DELIVERED to the rebuild callback — never silently
     * treated as unaffected.
     */
    classifyForReconcile(elementId: string): ReconcileClassification {
        const w = window as any;
        const kindStores: Array<[ReconcilableType | StrandedKind, any]> = [
            ['Wall', w.wallStore],
            ['Slab', w.slabStore],
            ['Column', w.columnStore],
            ['Beam', w.beamStore],
            ['Stair', w.stairStore],
            ['CurtainWall', w.curtainWallStore],
            ['Roof', this._roofStore],
            ['Furniture', w.furnitureStore],
        ];

        for (const [kind, store] of kindStores) {
            if (!store) continue;
            const el = store.get ? store.get(elementId) : store.getById ? store.getById(elementId) : null;
            if (el) {
                if (isReconcilable(kind)) {
                    return { outcome: 'DETERMINED-RECONCILED', kind };
                }
                return {
                    outcome: 'DETERMINED-STRANDED',
                    kind: kind as StrandedKind,
                    reason:
                        `"${kind}" has no reconcile consumer — the level-rebuild callback rebuilds ` +
                        `Wall and Column (per delivered id) and Slab and Roof (per level query) only. ` +
                        `A "${kind}" on a re-elevated level keeps its old elevation until a per-kind ` +
                        `rebuild entry point exists (C72 §5.1, gap register PR-07; per-kind reasons ` +
                        `are recorded on ReconcilableType in this file, and the user-facing refusal ` +
                        `is raised by SetLevelHeightCommand — ADR-0345).`,
                };
            }
            // Legacy embedded openings live INSIDE their host wall's store record.
            if (store.getWindow && store.getWindow(elementId)) {
                return {
                    outcome: 'DETERMINED-HOSTED',
                    kind: 'Window',
                    reason: 'hosted opening (C15): re-rendered by the host wall\'s rebuild via its opening render map; no independent reconcile consumer.',
                };
            }
            if (store.getDoor && store.getDoor(elementId)) {
                return {
                    outcome: 'DETERMINED-HOSTED',
                    kind: 'Door',
                    reason: 'hosted opening (C15): re-rendered by the host wall\'s rebuild via its opening render map; no independent reconcile consumer.',
                };
            }
        }

        return {
            outcome: 'UNDETERMINED',
            reason:
                'no reachable semantic store answers for this id — C78 §1.4: "unaffected" is never ' +
                'inferred from missing data, so the id is DELIVERED to the rebuild callback (fail-open).',
        };
    }

    private getSemanticData(elementId: string): any {
        const w = window as any;
        const stores = [
            w.wallStore,
            w.slabStore,
            w.columnStore,
            w.beamStore,
            w.stairStore,
            w.curtainWallStore,
            // FIX 3: Also search roofStore and furnitureStore for completeness
            this._roofStore,
            w.furnitureStore,
        ];

        for (const store of stores) {
            if (!store) continue;
            const el = store.get ? store.get(elementId) : store.getById ? store.getById(elementId) : null;
            if (el) return el;

            // Handle sub-elements if stored in parents
            if (store.getWindow) {
                const win = store.getWindow(elementId);
                if (win) return win;
            }
            if (store.getDoor) {
                const door = store.getDoor(elementId);
                if (door) return door;
            }
        }
        return null;
    }
}

// ─── RECONCILABLE_TYPES — narrowed to the truth and WIRED (C72 §5.1/§5.2/§7) ──
//
// HISTORY (gap register PR-07). This set used to name THIRTEEN entries —
//   'Wall', 'window', 'door', 'Window', 'Door', 'Slab', 'Column', 'Beam',
//   'Roof', 'Furniture', 'CurtainWall', 'Stair', 'Handrail'
// — was exported, and had ZERO consumers anywhere in the repository. It was the
// C72 §5.2 hazard in its purest form: a whitelist that reads as coverage and is
// an opinion. Two proofs it was never consulted: it carried BOTH casings of
// window/door ('window' + 'Window'), which no consumer could have tolerated,
// and it named 'Handrail' although getSemanticData() has never searched any
// handrail store — the entry could not match an element even in principle.
//
// THE TRUTH (measured 2026-08-13, re-verifying the C72 §5.1 measurement): the
// only production reconcile consumer is the level-rebuild callback registered
// by `apps/editor/src/engine/initWallLevelSubscribers.ts` — it rebuilds
//   · Wall  — per delivered element id, via `builder.updateWall(...)`;
//   · Slab  — per level, via `slabStore.triggerRebuild(...)` on a
//             `levelId` query (independent of the delivered ids).
// Nothing else. Per C72 §7, NARROWING A CLAIM TO THE TRUTH IS A FIX, so the
// set now names exactly those two types, and it is CONSUMED: the
// reconciliation listener classifies every affected element against it
// (see classifyForReconcile) before delivery. Dropping a type from this set
// observably stops that type being delivered for rebuild — the set is no
// longer decorative.
//
// THE ELEVEN NARROWED ENTRIES, BY NAME (C72 §5.1 — the shortfall recorded):
//   · 'window'/'door'/'Window'/'Door' — hosted openings (C15). Legacy embedded
//     openings are re-rendered by the HOST WALL's rebuild (`updateWall` walks
//     `wall.openings` via `resolveOpeningRenderMap`), and their world transform
//     derives from the wall (see the hosted branch of resolveWorldTransform).
//     The reconcile has no direct per-opening consumer, so naming them here
//     claimed coverage the reconcile itself does not provide. Standalone-store
//     openings classify UNDETERMINED and are delivered fail-open (C78 §1.4).
//   · 'Column', 'Beam', 'Stair', 'CurtainWall', 'Roof', 'Furniture' — STRANDED:
//     no rebuild entry point is reachable from this package's reconcile path.
//     An element of these kinds on a re-elevated level KEEPS ITS OLD ELEVATION
//     (gap register PR-07; for 'Roof' also PR-10 — roof propagation is
//     MEASURED-ABSENT in both directions). Wiring them requires per-kind
//     rebuild entry points registered by the composition layer (the
//     initWallLevelSubscribers shape) — a follow-up outside core-app-model.
//     Until then the classification names them DETERMINED-STRANDED at runtime,
//     so the shortfall is announced, never silent.
//   · 'Handrail' — additionally unclassifiable: no handrail store has ever been
//     reachable from getSemanticData(). A handrail id classifies UNDETERMINED
//     and is delivered fail-open (C78 §1.4 — "unaffected" is never inferred
//     from missing data).
//
// Re-widening this set requires a consumer that HANDLES the added type
// (C72 §5.1) — never a name alone.
//
// ── WIDENED 2026-08-23 (lane LEVEL36, L-7202) — WITH ITS CONSUMER ───────────
//
// 'Column' and 'Roof' join 'Wall'/'Slab' because the level-rebuild callback in
// `apps/editor/src/engine/initWallLevelSubscribers.ts` NOW REBUILDS THEM. This
// is the C72 §5.1 condition satisfied in the only way it may be: the consumer
// landed first, in the same commit, and a test asserts the delivery.
//
// Why exactly these two and not the other four — MEASURED, per builder, by
// asking one question: does the build path RE-DERIVE the element's world Y
// from `level.elevation`, or was Y baked in absolutely at create time? Only a
// re-deriving builder can follow a level move by being re-invoked.
//
//   · Column      — `ColumnFragmentBuilder.ts:225,234`: `const elevation =
//                   level.elevation ?? 0; … resolvedY = elevation + slabOff`.
//                   RE-DERIVES → wired via `columnBuilder.updateColumn()`.
//   · Roof        — `RoofFragmentBuilder.ts:305`: `worldY = level
//                   ? (level.elevation + data.baseOffset) : data.baseOffset`.
//                   RE-DERIVES → wired via `roofBuilder.updateRoof()`.
//   · CurtainWall — `CurtainWallBuilder.ts:1094,1801` DOES re-derive
//                   (`level.elevation + cw.baseOffset`), so it is wirable in
//                   principle. It stays STRANDED only because its builder is
//                   constructed in `initUI.ts:2302` — AFTER this wiring seam
//                   runs — so no handle exists here to call. Adding it is one
//                   registry entry once that ordering is resolved; it is NOT a
//                   geometry limitation. Recorded so the reason is not lost.
//   · Beam        — MEASURED ABSENT: `grep -rn elevation packages/geometry-beam/src/`
//                   returns ZERO hits (cross-checked with ripgrep). Nothing in
//                   the beam build path consults level elevation at all, so
//                   re-invoking it would rebuild the beam in the SAME place.
//                   Wiring it would be a lie, not a fix.
//   · Stair       — bakes absolute geometry at create time, and additionally
//                   SPANS two levels: a stair from Ground to Level 1 cannot
//                   translate when the gap between them changes, it must
//                   RE-SOLVE its riser count and going. That is a real design
//                   task (ADR-0345 §6), not a missing call.
//   · Furniture   — moves, but NOT here: `position.y` is persisted absolute
//                   state, so re-seating it is a STORE WRITE and P6 makes that
//                   the command path's job. `SetLevelHeightCommand` composes
//                   `ReseatLevelElementsCommand` (furniture + plumbing +
//                   lighting) into its own undo unit. A store write from this
//                   render-time callback would be both un-undoable and a P6
//                   breach, which is why it is deliberately NOT wired here.
export type ReconcilableType = 'Wall' | 'Slab' | 'Column' | 'Roof';

/** Determined kinds the reconcile does NOT cover — the named C72 §5.1 shortfall. */
export type StrandedKind = 'Beam' | 'Stair' | 'CurtainWall' | 'Furniture';

/**
 * C78 §1.1/§1.4-typed determination for one element on a reconciling level.
 * Never a boolean: "not reconciled" splits into three different facts —
 * hosted (follows its host wall's rebuild), stranded (determined type with no
 * reconcile consumer — announced, kept at old elevation), and undetermined
 * (no store answers for the id — DELIVERED fail-open, because inferring
 * "unaffected" from missing data is forbidden).
 */
export type ReconcileClassification =
    | { outcome: 'DETERMINED-RECONCILED'; kind: ReconcilableType }
    | { outcome: 'DETERMINED-HOSTED'; kind: 'Window' | 'Door'; reason: string }
    | { outcome: 'DETERMINED-STRANDED'; kind: StrandedKind; reason: string }
    | { outcome: 'UNDETERMINED'; reason: string };

const RECONCILABLE_TYPES: ReadonlySet<ReconcilableType> =
    new Set<ReconcilableType>(['Wall', 'Slab', 'Column', 'Roof']);

function isReconcilable(kind: ReconcilableType | StrandedKind): kind is ReconcilableType {
    return (RECONCILABLE_TYPES as ReadonlySet<string>).has(kind);
}

export { RECONCILABLE_TYPES };

export const spatialAuthority = SpatialAuthority.getInstance();
