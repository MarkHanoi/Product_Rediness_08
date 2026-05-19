/**
 * ScheduleStore — Phase III (13-PROJECT-BROWSER-REFACTOR §5.2)
 *
 * Authoritative Map<scheduleId, ScheduleDefinition> store.
 * Follows the exact ViewDefinitionStore pattern.
 *
 * This is the semantic entity store used by the Project Browser.
 * It does NOT replace ScheduleRegistry.ts, which is the rendering-layer
 * schedule definition registry used by SchedulePanel.
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed (commands call store methods)
 *   §01 §3.3   — Implements the ElementStore pattern: getAll, get, set, delete, serialize
 *   §03 §1.1   — ScheduleDefinition is a schema-stable first-class entity
 *   §04        — Read-only access via AIReadModel only; not imported by AI layer directly
 *   §05        — Pure data module; no DOM, no Three.js, no rendering
 *   §07        — No server routes; client-side only
 *
 * Responsibility:
 *   - Maintains the authoritative Map<scheduleId, ScheduleDefinition>
 *   - Emits DOM CustomEvents (sched:*) for UI reactivity
 *   - serialize/deserialize for ProjectSnapshot persistence
 *   - seedDefaultSchedules() seeds 3 built-in schedules on first load
 *   - Exposed on window as 'scheduleStore' by EngineBootstrap (Phase III)
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { ScheduleDefinition, ScheduleDefinitionStoreSnapshot, ScheduleType } from './ScheduleDefinitionTypes';

class ScheduleStoreImpl {
    private _schedules: Map<string, ScheduleDefinition> = new Map();

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getAll(): ScheduleDefinition[] {
        return [...this._schedules.values()].map(s => JSON.parse(JSON.stringify(s)));
    }

    get(scheduleId: string): ScheduleDefinition | undefined {
        const s = this._schedules.get(scheduleId);
        return s ? JSON.parse(JSON.stringify(s)) : undefined;
    }

    has(scheduleId: string): boolean {
        return this._schedules.has(scheduleId);
    }

    getByType(scheduleType: ScheduleType): ScheduleDefinition[] {
        return this.getAll().filter(s => s.scheduleType === scheduleType);
    }

    // ── Write API (called only by Commands) ───────────────────────────────────

    create(params: {
        id:           string;
        name:         string;
        scheduleType: ScheduleType;
        fields?:      string[];
    }): ScheduleDefinition | null {
        if (this._schedules.has(params.id)) return null;

        const now = Date.now();
        const schedule: ScheduleDefinition = {
            id:           params.id,
            name:         params.name,
            scheduleType: params.scheduleType,
            fields:       params.fields ?? [],
            metadata: {
                createdAt:  now,
                modifiedAt: now,
            },
        };

        this._schedules.set(schedule.id, schedule);
        storeEventBus.emit({ elementType: 'schedule-definition', elementId: schedule.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('sched:schedule-created', { scheduleId: schedule.id });
        return JSON.parse(JSON.stringify(schedule));
    }

    update(scheduleId: string, patch: {
        name?:   string;
        fields?: string[];
    }): boolean {
        const schedule = this._schedules.get(scheduleId);
        if (!schedule) return false;

        if (patch.name   !== undefined) schedule.name   = patch.name;
        if (patch.fields !== undefined) schedule.fields = patch.fields;

        schedule.metadata.modifiedAt = Date.now();

        storeEventBus.emit({ elementType: 'schedule-definition', elementId: scheduleId, operation: 'update', timestamp: Date.now() });
        this.dispatch('sched:schedule-updated', { scheduleId });
        return true;
    }

    delete(scheduleId: string): boolean {
        if (!this._schedules.has(scheduleId)) return false;
        this._schedules.delete(scheduleId);
        storeEventBus.emit({ elementType: 'schedule-definition', elementId: scheduleId, operation: 'delete', timestamp: Date.now() });
        this.dispatch('sched:schedule-deleted', { scheduleId });
        return true;
    }

    restore(schedule: ScheduleDefinition): void {
        if (this._schedules.has(schedule.id)) return;
        this._schedules.set(schedule.id, JSON.parse(JSON.stringify(schedule)));
        storeEventBus.emit({ elementType: 'schedule-definition', elementId: schedule.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('sched:schedule-created', { scheduleId: schedule.id });
    }

    // ── Seeding ───────────────────────────────────────────────────────────────

    /**
     * Seeds the 3 built-in schedules (Doors, Windows, Walls) on first bootstrap.
     * Idempotent — does nothing if the store is already populated.
     * Called by EngineBootstrap after ScheduleStore is available.
     *
     * The IDs match the existing SchedulePanel.show() call-site IDs so the
     * existing behaviour (click → open SchedulePanel) is preserved.
     */
    seedDefaultSchedules(): void {
        // Per-schedule idempotent check so newly added disciplines appear in existing projects.
        const defaults: Array<{ id: string; name: string; scheduleType: ScheduleType; fields: string[] }> = [

            // ── ARCHITECTURE ──────────────────────────────────────────────────────
            {
                id:           'Walls Schedule',
                name:         'Walls Schedule',
                scheduleType: 'walls',
                fields:       ['id', 'type', 'length', 'height', 'thickness', 'level', 'roomSideA', 'roomSideB'],
            },
            {
                id:           'Floors Schedule',
                name:         'Floors Schedule',
                scheduleType: 'floors',
                fields:       ['mark', 'label', 'level', 'area', 'thickness', 'finish', 'department', 'rooms', 'slope'],
            },
            {
                id:           'Roofs Schedule',
                name:         'Roofs Schedule',
                scheduleType: 'roofs',
                fields:       ['mark', 'level', 'roofType', 'slope', 'area', 'thickness', 'overhang', 'material'],
            },
            {
                id:           'Ceilings Schedule',
                name:         'Ceilings Schedule',
                scheduleType: 'ceilings',
                fields:       ['mark', 'label', 'level', 'area', 'height', 'finish', 'department', 'rooms'],
            },
            {
                id:           'Rooms Schedule',
                name:         'Room Schedule',
                scheduleType: 'rooms',
                fields:       ['number', 'name', 'level', 'department', 'occupancy', 'grossArea', 'perimeter', 'volume', 'height', 'floor', 'wall', 'ceiling'],
            },
            {
                id:           'Stairs Schedule',
                name:         'Stairs Schedule',
                scheduleType: 'stairs',
                fields:       ['mark', 'shape', 'baseLevelName', 'topLevelName', 'width', 'riserCount', 'riserHeight', 'treadDepth', 'fireRating', 'accessibility'],
            },

            // ── OPENINGS ──────────────────────────────────────────────────────────
            {
                id:           'Doors Schedule',
                name:         'Doors Schedule',
                scheduleType: 'doors',
                fields:       ['mark', 'type', 'width', 'height', 'sillHeight', 'level', 'hostWall', 'roomFrom', 'roomTo'],
            },
            {
                id:           'Windows Schedule',
                name:         'Windows Schedule',
                scheduleType: 'windows',
                fields:       ['mark', 'id', 'name', 'width', 'height', 'sillHeight', 'level', 'room', 'adjacentRoom'],
            },
            {
                id:           'CurtainWalls Schedule',
                name:         'Curtain Walls Schedule',
                scheduleType: 'curtainwalls',
                fields:       ['mark', 'level', 'length', 'height', 'gridXSpacing', 'gridYSpacing', 'mullionSize', 'panelThickness'],
            },

            // ── STRUCTURE ─────────────────────────────────────────────────────────
            {
                id:           'Columns Schedule',
                name:         'Columns Schedule',
                scheduleType: 'columns',
                fields:       ['mark', 'level', 'profile', 'width', 'depth', 'height', 'material', 'baseOffset'],
            },
            {
                id:           'Beams Schedule',
                name:         'Beams Schedule',
                scheduleType: 'beams',
                fields:       ['mark', 'level', 'span', 'width', 'depth', 'material', 'loadBearing', 'fireRating'],
            },
            {
                id:           'Slabs Schedule',
                name:         'Slabs Schedule',
                scheduleType: 'slabs',
                fields:       ['mark', 'level', 'thickness', 'area', 'material', 'phase', 'baseOffset'],
            },

            // ── INTERIOR / FINISHES ───────────────────────────────────────────────
            {
                id:           'Furniture Schedule',
                name:         'Furniture Schedule',
                scheduleType: 'furniture',
                fields:       ['mark', 'furnitureType', 'level', 'room', 'width', 'length', 'height'],
            },
            {
                id:           'Handrails Schedule',
                name:         'Handrails Schedule',
                scheduleType: 'handrails',
                fields:       ['mark', 'level', 'length', 'height', 'fillType', 'railProfile', 'postSpacing', 'material'],
            },

            // ── MEP ───────────────────────────────────────────────────────────────
            {
                id:           'Plumbing Schedule',
                name:         'Plumbing Fixtures Schedule',
                scheduleType: 'plumbing',
                fields:       ['mark', 'fixtureType', 'level', 'room', 'width', 'height', 'length'],
            },

            // ── MATERIALS LIBRARY ─────────────────────────────────────────────────
            {
                id:           'Materials Schedule',
                name:         'Materials Library',
                scheduleType: 'materials',
                fields:       ['id', 'label', 'category', 'color', 'metalness', 'roughness', 'opacity', 'transparency'],
            },
        ];

        for (const d of defaults) {
            if (!this._schedules.has(d.id)) {
                this.create(d);
            }
        }
    }

    // ── Persistence API ───────────────────────────────────────────────────────

    serialize(): ScheduleDefinitionStoreSnapshot {
        return {
            version:   1,
            schedules: [...this._schedules.values()].map(s => JSON.parse(JSON.stringify(s))),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as ScheduleDefinitionStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.schedules)) return;

        this._schedules.clear();
        for (const raw of snapshot.schedules) {
            if (raw?.id && raw?.name && raw?.scheduleType) {
                this._schedules.set(raw.id, raw);
            }
        }
        this.dispatch('sched:store-loaded', {});
    }

    reset(): void {
        this._schedules.clear();
        this.dispatch('sched:store-reset', {});
    }
}

export const scheduleStore = new ScheduleStoreImpl();
export type { ScheduleStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'scheduleStore',
    clear: () => scheduleStore.reset(),
    reseed: () => scheduleStore.seedDefaultSchedules(),
});

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry.
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('schedule', scheduleStore as unknown as import('../StoreRegistry').BimStore);
