// @pryzm/geometry-lift — LiftStore (mirror of `@pryzm/geometry-stair` StairStore).
//
// Residential-building (multi-family) — Slice A / P2. The data store for the
// vertical-circulation (lift) element. Mirrors StairStore EXACTLY:
//   - clone-first on add/update/restore (stair §F4/§F24 discipline)
//   - assigns ifcData.ifcClass = 'IfcTransportElement' on add (plan §4.1 IFC row)
//   - emits the `bim-lift-added/-updated/-removed` window events (F.events.18)
//   - publishes to the centralized `storeEventBus` (§3.8) for DependencyResolver,
//     Topology + World Model, with elementType 'verticalCirculation'.
//
// Contract: C11 (element-creation); C15 §12 (lift body free, landing doors hosted).
// The store is DATA ONLY (§3.5) — the mesh builder is driven by the window events,
// never called by the store directly.

import { ProjectContext } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
import {
    LiftData,
    LiftEventType,
    LiftEventListener,
} from './LiftTypes';

const _bus = new DOMEventBus();

export class LiftStore {
    private lifts: Map<string, LiftData> = new Map();
    private projectContext: ProjectContext;
    private listeners: LiftEventListener[] = [];

    constructor(projectContext: ProjectContext) {
        this.projectContext = projectContext;
    }

    get activeLevelId(): string {
        return this.projectContext.activeLevelId;
    }

    add(lift: LiftData): void {
        if (!lift.baseLevelId) {
            throw new Error('Spatial Authority Violation: No base level selected for lift creation.');
        }

        // §F4 + §F24 (mirror of StairStore): clone FIRST; mutations + dispatches use the clone.
        const cloned = structuredClone(lift);

        if (!cloned.properties.mark) {
            const count = this.lifts.size + 1;
            cloned.properties.mark = `LF${count.toString().padStart(3, '0')}`;
        }

        if (!cloned.ifcData) {
            cloned.ifcData = {
                guid: crypto.randomUUID(),
                ifcClass: 'IfcTransportElement',
            };
        }

        this.lifts.set(cloned.id, cloned);

        _bus.emit('bim-lift-added', { id: cloned.id }); // F.events.18
        this.emit('add', cloned);

        console.log(`[LiftStore] Added lift ${cloned.id} (${cloned.kind}) from ${cloned.baseLevelId} to ${cloned.topLevelId}`);
    }

    update(liftId: string, updates: Partial<LiftData>): LiftData | undefined {
        const lift = this.lifts.get(liftId);
        if (!lift) return undefined;

        const updated: LiftData = { ...lift, ...updates };
        if (updates.properties && lift.properties) {
            updated.properties = { ...lift.properties, ...updates.properties };
        }
        // §F3 (mirror): version bumped on EVERY update.
        const baseMeta = lift.metadata;
        const patch = updates.metadata ?? {};
        updated.metadata = {
            ...baseMeta,
            ...patch,
            modifiedAt: new Date().toISOString(),
            version: baseMeta.version + 1,
        };

        const cloned = structuredClone(updated);
        this.lifts.set(liftId, cloned);
        _bus.emit('bim-lift-updated', { id: liftId }); // F.events.18
        // §STEP7: `lift` is the pre-mutation record, captured before the merge.
        this.emit('update', cloned, lift);

        console.log(`[LiftStore] Updated lift ${liftId} (v${cloned.metadata.version})`);
        return cloned;
    }

    /** §F5 (mirror): clone before storing — used by the undo/redo path. */
    restoreSnapshot(lift: LiftData): void {
        const cloned = structuredClone(lift);
        // §STEP7: capture the stored prior BEFORE the write — a post-write read
        // would diff the snapshot against itself (C72 §3.5). Undefined when no
        // prior exists (restore into an empty slot behaves like an add).
        const prev = this.lifts.get(cloned.id);
        this.lifts.set(cloned.id, cloned);
        _bus.emit('bim-lift-updated', { id: cloned.id }); // F.events.18
        this.emit('update', cloned, prev);
    }

    remove(liftId: string): LiftData | undefined {
        const lift = this.lifts.get(liftId);
        if (lift) {
            this.lifts.delete(liftId);
            this.emit('remove', lift);
            _bus.emit('bim-lift-removed', { id: liftId }); // F.events.18
            console.log(`[LiftStore] Removed lift ${liftId}`);
        }
        return lift;
    }

    get(liftId: string): LiftData | undefined {
        return this.lifts.get(liftId);
    }

    getById(liftId: string): Readonly<LiftData> | undefined {
        return this.lifts.get(liftId);
    }

    getAll(): LiftData[] {
        return Array.from(this.lifts.values());
    }

    getAllMap(): ReadonlyMap<string, LiftData> {
        return this.lifts;
    }

    getByLevel(levelId: string): LiftData[] {
        return this.getAll().filter(l =>
            l.baseLevelId === levelId || l.topLevelId === levelId
        );
    }

    getByBaseLevelId(levelId: string): LiftData[] {
        return this.getAll().filter(l => l.baseLevelId === levelId);
    }

    getByTopLevelId(levelId: string): LiftData[] {
        return this.getAll().filter(l => l.topLevelId === levelId);
    }

    getLiftConnectingLevels(baseLevelId: string, topLevelId: string): LiftData | undefined {
        return this.getAll().find(l =>
            l.baseLevelId === baseLevelId && l.topLevelId === topLevelId
        );
    }

    subscribe(listener: LiftEventListener): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private emit(event: LiftEventType, lift: LiftData, prevState?: LiftData): void {
        this.listeners.forEach(l => l(event, lift, prevState));
        // §3.8 — publish to centralized StoreEventBus for DependencyResolver,
        // Topology, World Model (same channel StairStore uses).
        storeEventBus.emit({
            elementId: lift.id,
            elementType: 'verticalCirculation',
            operation: event === 'add' ? 'create' : event === 'remove' ? 'delete' : 'update',
            timestamp: Date.now(),
        });
    }

    clear(): void {
        this.lifts.clear();
    }
}
