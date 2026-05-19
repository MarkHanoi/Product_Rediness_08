/**
 * PhaseFilterStore — Phase VII
 *
 * Manages the library of PhaseFilter entities. Follows the ElementStore pattern
 * (§01 §3.3). Seeds four built-in filters on initialise; built-ins are always
 * re-seeded and are excluded from the serialised snapshot.
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed
 *   §01 §3.3   — ElementStore pattern
 *   §03 §1.1   — PhaseFilter is schema-stable
 *   §04        — Read-only via AIReadModel gateway
 *   §05        — Pure data module; no DOM beyond event dispatch, no Three.js
 *   §07        — No server routes; client-side only
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { PhaseFilter, PhaseFilterRule, PhaseFilterStoreSnapshot } from '@pryzm/core-app-model';
import { BUILT_IN_PHASE_FILTER_IDS } from '@pryzm/core-app-model';

// ── Built-in seed data ────────────────────────────────────────────────────────

const BUILT_IN_FILTERS: PhaseFilter[] = [
    {
        id:          BUILT_IN_PHASE_FILTER_IDS.SHOW_ALL,
        name:        'Show All',
        description: 'All phases are fully visible with standard graphics.',
        rules:       [],   // no phase rules = everything shown
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 1 },
    },
    {
        id:          BUILT_IN_PHASE_FILTER_IDS.NEW_CONSTRUCTION_ONLY,
        name:        'New Construction Only',
        description: 'Only new-construction elements are shown. Existing elements are hidden.',
        rules: [
            { phase: 'Existing',         status: 'hide' },
            { phase: 'Demolition',       status: 'hide' },
            { phase: 'New Construction', status: 'show' },
            { phase: 'Future',           status: 'hide' },
        ],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 1 },
    },
    {
        id:          BUILT_IN_PHASE_FILTER_IDS.DEMOLITION_PLAN,
        name:        'Demolition Plan',
        description: 'Existing elements halftoned; demolished elements shown. New construction hidden.',
        rules: [
            { phase: 'Existing',         status: 'halftone' },
            { phase: 'Demolition',       status: 'demolished-override' },
            { phase: 'New Construction', status: 'hide' },
            { phase: 'Future',           status: 'hide' },
        ],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 1 },
    },
    {
        id:          BUILT_IN_PHASE_FILTER_IDS.EXISTING_ONLY,
        name:        'Existing Only',
        description: 'Only existing elements are shown. All other phases hidden.',
        rules: [
            { phase: 'Existing',         status: 'show' },
            { phase: 'Demolition',       status: 'hide' },
            { phase: 'New Construction', status: 'hide' },
            { phase: 'Future',           status: 'hide' },
        ],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'system', version: 1 },
    },
];

const BUILT_IN_IDS = new Set<string>(Object.values(BUILT_IN_PHASE_FILTER_IDS));

function normalizePhaseName(phase: string): string {
    const token = phase.trim().toLowerCase().replace(/^phase[:=\s-]*/, '').replace(/[_\s]+/g, '-');
    if (token === 'existing' || token === 'exist') return 'existing';
    if (token === 'demolition' || token === 'demolished' || token === 'demo') return 'demolition';
    if (token === 'new' || token === 'new-work' || token === 'new-construction' || token === 'newconstruction') return 'new-construction';
    if (token === 'future') return 'future';
    return token;
}

class PhaseFilterStoreImpl {
    private _filters: Map<string, PhaseFilter> = new Map();

    constructor() {
        this._seedBuiltIns();
    }

    private _seedBuiltIns(): void {
        for (const f of BUILT_IN_FILTERS) {
            this._filters.set(f.id, JSON.parse(JSON.stringify(f)));
        }
    }

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getAll(): PhaseFilter[] {
        return [...this._filters.values()].map(f => JSON.parse(JSON.stringify(f)));
    }

    get(filterId: string): PhaseFilter | undefined {
        const f = this._filters.get(filterId);
        return f ? JSON.parse(JSON.stringify(f)) : undefined;
    }

    has(filterId: string): boolean {
        return this._filters.has(filterId);
    }

    isBuiltIn(filterId: string): boolean {
        return BUILT_IN_IDS.has(filterId);
    }

    /**
     * Resolves the display status for a given phase using the specified filter.
     * Returns 'show' as the default when the filter has no rule for the phase.
     */
    resolvePhaseStatus(filterId: string, phase: string): PhaseFilter['rules'][0]['status'] {
        const filter = this._filters.get(filterId);
        if (!filter) return 'show';
        const target = normalizePhaseName(phase);
        const rule = filter.rules.find(r => normalizePhaseName(r.phase) === target);
        return rule?.status ?? 'show';
    }

    // ── Write API (called only by Commands) ───────────────────────────────────

    /**
     * Creates a new user-defined PhaseFilter.
     * Built-in filter IDs are rejected.
     * Returns null if the id already exists.
     */
    create(params: {
        id:           string;
        name:         string;
        description?: string;
        rules?:       PhaseFilterRule[];
        intent?:      string;
        createdBy?:   string;
    }): PhaseFilter | null {
        if (this._filters.has(params.id)) return null;
        if (BUILT_IN_IDS.has(params.id)) return null;

        const now = Date.now();
        const filter: PhaseFilter = {
            id:          params.id,
            name:        params.name,
            description: params.description,
            rules:       params.rules ?? [],
            intent:      params.intent,
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  params.createdBy ?? 'user',
                version:    1,
            },
        };

        this._filters.set(filter.id, filter);
        storeEventBus.emit({
            elementType: 'phase-filter',
            elementId:   filter.id,
            operation:   'create',
            timestamp:   Date.now(),
        });
        this.dispatch('pf:filter-created', { filterId: filter.id });
        return JSON.parse(JSON.stringify(filter));
    }

    /**
     * Updates a user-defined PhaseFilter.
     * Built-in filters are read-only and cannot be updated.
     * Returns false if the filter does not exist or is built-in.
     */
    update(filterId: string, patch: {
        name?:        string;
        description?: string | null;
        rules?:       PhaseFilterRule[];
        intent?:      string | null;
    }): boolean {
        if (BUILT_IN_IDS.has(filterId)) return false;
        const filter = this._filters.get(filterId);
        if (!filter) return false;

        if (patch.name        !== undefined) filter.name        = patch.name;
        if (patch.description !== undefined) filter.description = patch.description ?? undefined;
        if (patch.rules       !== undefined) filter.rules       = patch.rules;
        if (patch.intent      !== undefined) filter.intent      = patch.intent ?? undefined;

        filter.metadata.modifiedAt = Date.now();
        filter.metadata.version   += 1;

        storeEventBus.emit({
            elementType: 'phase-filter',
            elementId:   filterId,
            operation:   'update',
            timestamp:   Date.now(),
        });
        this.dispatch('pf:filter-updated', { filterId });
        return true;
    }

    /**
     * Deletes a user-defined PhaseFilter.
     * Built-in filters cannot be deleted.
     * Returns false if not found or is built-in.
     */
    delete(filterId: string): boolean {
        if (BUILT_IN_IDS.has(filterId)) return false;
        if (!this._filters.has(filterId)) return false;
        this._filters.delete(filterId);
        storeEventBus.emit({
            elementType: 'phase-filter',
            elementId:   filterId,
            operation:   'delete',
            timestamp:   Date.now(),
        });
        this.dispatch('pf:filter-deleted', { filterId });
        return true;
    }

    /**
     * Restores a deleted PhaseFilter (used by undo in CreatePhaseFilterCommand).
     * Fails silently if the id already exists.
     */
    restore(filter: PhaseFilter): void {
        if (this._filters.has(filter.id)) return;
        this._filters.set(filter.id, JSON.parse(JSON.stringify(filter)));
        storeEventBus.emit({
            elementType: 'phase-filter',
            elementId:   filter.id,
            operation:   'create',
            timestamp:   Date.now(),
        });
        this.dispatch('pf:filter-created', { filterId: filter.id });
    }

    // ── Persistence API ───────────────────────────────────────────────────────

    /** Serialises only user-defined filters; built-ins are always re-seeded. */
    serialize(): PhaseFilterStoreSnapshot {
        const userFilters = [...this._filters.values()].filter(f => !BUILT_IN_IDS.has(f.id));
        return {
            version: 1,
            filters: userFilters.map(f => JSON.parse(JSON.stringify(f))),
        };
    }

    /**
     * Restores from a ProjectSnapshot.
     * Built-ins are always re-seeded first so they survive a reset/reload.
     */
    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as PhaseFilterStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.filters)) return;

        // Re-seed built-ins
        this._filters.clear();
        this._seedBuiltIns();

        // Restore user filters
        for (const raw of snapshot.filters) {
            if (raw?.id && raw?.name && !BUILT_IN_IDS.has(raw.id)) {
                const filter: PhaseFilter = {
                    ...raw,
                    rules: raw.rules ?? [],
                };
                this._filters.set(raw.id, filter);
            }
        }
        this.dispatch('pf:store-loaded', {});
    }

    /** Resets to built-ins only. Called by CLEAR_PROJECT / LOAD_PROJECT_SNAPSHOT. */
    reset(): void {
        this._filters.clear();
        this._seedBuiltIns();
        this.dispatch('pf:store-reset', {});
    }
}

export const phaseFilterStore = new PhaseFilterStoreImpl();
export type { PhaseFilterStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'phaseFilterStore',
    clear: () => phaseFilterStore.reset(),
});

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry.
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('phase-filter', phaseFilterStore as unknown as import('../StoreRegistry').BimStore);
