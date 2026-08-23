import { StairRailingConfig } from './StairRailingTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';
// §C13-RAILING-STORE-OWNER (L-8102) — see the constructor.
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §P0-A40: Suppress storeEventBus emissions during a stair batch.
 * StairRailingStore events fire synchronously on each railing add().
 * Without this guard a future stair batch creation would accumulate
 * per-railing storeEventBus events into the outer batch buffer, adding
 * unnecessary drain chunks identical to the CurtainPanelStore problem
 * fixed in A39-P1.  Normal (non-batch) editing paths emit fully.
 * batchCoordinator.isBatching stays true through the full yielded drain;
 * StairBuilder reads stairRailingStore.getByStairId() directly so it does
 * not need a separate storeEventBus event per railing.
 */
export class StairRailingStore {
    private railings: Map<string, StairRailingConfig> = new Map();

    /**
     * §C13-RAILING-STORE-OWNER (L-8102) — THIS STORE HAD NO PROJECT-SWITCH OWNER AT ALL.
     *
     * Measured 2026-08-23:
     *   grep -rn "projectScopeRegistry.register" packages/geometry-stair/src/*.ts  -> 0
     *   grep -ic 'railing' packages/command-registry/src/project/ClearProjectCommand.ts -> 0
     *
     * So project A's `StairRailingConfig` records survived every switch, in memory,
     * indefinitely: `clearAll()` could not reach them (unregistered) and the command's
     * own hand-written teardown never mentioned railings. They were also invisible to
     * the data-side arm of `ProjectIsolationAudit`, whose `AUDITED_STORE_GLOBALS` list
     * does not include `stairRailingStore` — which is exactly why the founder's report
     * showed `scene.foreignElement×37` with NO accompanying `store.foreignElement`: the
     * surface most able to hold the residue was the one surface nobody asked.
     *
     * Registered from the CONSTRUCTOR because this store is instantiated with `new` in
     * `initBuilders.ts`, not exported as a module singleton — the same disposition
     * `CesiumViewport` uses, and the reason `ProjectScopeRegistry.register` is
     * documented as replace-by-key: a second instance (HMR, or a test) replaces the
     * entry rather than duplicating it, so `clearAll()` always drives the live one.
     *
     * ⚠ Clearing here is unconditionally correct, and that is worth stating because
     * teardown that deletes restorable state is the opposite failure. Stair railings
     * have NO snapshot array (`ProjectSnapshot` in ProjectSerializer.ts declares
     * `stairs`/`handrails` but no railings key) and `ProjectLoader` has no restore
     * loop for them, so nothing a load would repopulate is being discarded.
     */
    constructor() {
        projectScopeRegistry.register({
            scopeName: 'stair.railings',
            clear: () => this.railings.clear(),
        });
    }

    add(railing: StairRailingConfig): void {
        if (!railing.ifcData) {
            railing.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcRailing',
                predefinedType: 'GUARDRAIL'
            };
        }
        // §3.4: Clone to prevent external callers from mutating internal store state.
        this.railings.set(railing.id, structuredClone(railing));
        _bus.emit('bim-stair-railing-added', { id: railing.id }); // F.events.18 // TODO(TASK-10)
        // §P0-A40: gate storeEventBus emission during stair batch creation.
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({ elementId: railing.id, elementType: 'stairRailing', operation: 'create', timestamp: Date.now() });
        }
        console.log(`[StairRailingStore] Added railing ${railing.id} (${railing.side}) for stair ${railing.stairId}`);
    }

    get(id: string): StairRailingConfig | undefined {
        return this.railings.get(id);
    }

    getAll(): StairRailingConfig[] {
        return Array.from(this.railings.values());
    }

    getByStairId(stairId: string): StairRailingConfig[] {
        return Array.from(this.railings.values()).filter(r => r.stairId === stairId);
    }

    update(id: string, updates: Partial<StairRailingConfig>): void {
        const railing = this.railings.get(id);
        if (railing) {
            // §3.4: structuredClone produces a fully immutable next-state object.
            const updated: StairRailingConfig = structuredClone(railing);
            Object.assign(updated, updates);
            this.railings.set(id, updated);
            _bus.emit('bim-stair-railing-updated', { id: updated.id }); // F.events.18 // TODO(TASK-10)
            // §P0-A40: gate update emissions during batch.
            if (!batchCoordinator.isBatching) {
                storeEventBus.emit({ elementId: id, elementType: 'stairRailing', operation: 'update', timestamp: Date.now() });
            }
        }
    }

    /**
     * §FIX-STAIR-RAILING-TYPE-PICKER — restore an EXACT pre-image (C03 §4.5).
     *
     * `update()` is a MERGE, and a merge cannot UNSET a field. Undoing a type swap
     * onto a railing that had never been individually typed must remove `typeId`
     * again (otherwise the railing keeps claiming a type it no longer has, and stops
     * following its stair's default forever). Mirrors `handrailStore.restoreSnapshot`,
     * which exists for exactly this reason.
     */
    restoreSnapshot(id: string, railing: StairRailingConfig): void {
        this.railings.set(id, structuredClone(railing));
        _bus.emit('bim-stair-railing-updated', { id });
        if (!batchCoordinator.isBatching) {
            storeEventBus.emit({ elementId: id, elementType: 'stairRailing', operation: 'update', timestamp: Date.now() });
        }
    }

    remove(id: string): void {
        const railing = this.railings.get(id);
        if (railing) {
            this.railings.delete(id);
            _bus.emit('bim-stair-railing-removed', { id }); // F.events.18 // TODO(TASK-10)
            // §P0-A40: gate delete emissions during batch.
            if (!batchCoordinator.isBatching) {
                storeEventBus.emit({ elementId: id, elementType: 'stairRailing', operation: 'delete', timestamp: Date.now() });
            }
            console.log(`[StairRailingStore] Removed railing ${id}`);
        }
    }

    removeByStairId(stairId: string): void {
        this.getByStairId(stairId).forEach(r => this.remove(r.id));
    }

    clear(): void {
        this.railings.clear();
    }
}
