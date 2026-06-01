/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Data Platform — Template System
 * File:             src/core/templates/TemplateStore.ts
 * Contract:         docs/02-decisions/contracts/01-BIM-ENGINE-CORE-CONTRACT.md §3.8
 *                   docs/02-decisions/contracts/03-BIM-SEMANTIC-MODEL-CONTRACT.md
 *
 * Immutable-record store for TemplateDefinition objects.
 * Pattern mirrors HierarchyStore.ts — frozen records, structuredClone on all
 * reads, storeEventBus.emit() on every mutating operation.
 *
 * @see docs/00_PRZYM/PRYZM_DATA_PLATFORM_IMPLEMENTATION_ROADMAP.md § Phase 1-D
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { TemplateDefinition, TemplateScope } from './TemplateTypes';
import { BUILTIN_TEMPLATES } from './BuiltinTemplates';

export class TemplateStore {
    private readonly _templates = new Map<string, TemplateDefinition>();

    // ── Mutations ───────────────────────────────────────────────────────────────

    /**
     * add — inserts a new template.
     * Throws if a template with the same id already exists.
     * Emits StoreEventBus 'create' event with elementType 'template'. // TODO(TASK-08)
     */
    add(t: TemplateDefinition): void {
        if (this._templates.has(t.id)) {
            throw new Error(`[TemplateStore.add] Duplicate id: ${t.id}`);
        }
        this._templates.set(t.id, Object.freeze(structuredClone(t)));
        storeEventBus.emit({
            elementId:   t.id,
            elementType: 'template',
            operation:   'create',
            timestamp:   Date.now(),
        });
    }

    /**
     * update — applies a partial patch to an existing template.
     * Automatically increments version and sets metadata.modifiedAt.
     * Emits StoreEventBus 'update' event. // TODO(TASK-08)
     */
    update(id: string, patch: Partial<TemplateDefinition>): void {
        const existing = this._templates.get(id);
        if (!existing) {
            throw new Error(`[TemplateStore.update] Template not found: ${id}`);
        }
        const updated = Object.freeze(
            structuredClone({
                ...existing,
                ...patch,
                version:  existing.version + 1,
                metadata: {
                    ...existing.metadata,
                    ...(patch.metadata ?? {}),
                    modifiedAt: Date.now(),
                },
            })
        ) as TemplateDefinition;

        this._templates.set(id, updated);
        storeEventBus.emit({
            elementId:   id,
            elementType: 'template',
            operation:   'update',
            timestamp:   Date.now(),
        });
    }

    /**
     * remove — deletes a template by id.
     * Silent no-op if not found.
     * Emits StoreEventBus 'delete' event. // TODO(TASK-08)
     *
     * Note: DeleteTemplateCommand is responsible for unassigning all nodes
     * before calling remove(). This store does not cascade-unassign.
     */
    remove(id: string): void {
        if (!this._templates.has(id)) return;
        this._templates.delete(id);
        storeEventBus.emit({
            elementId:   id,
            elementType: 'template',
            operation:   'delete',
            timestamp:   Date.now(),
        });
    }

    // ── Queries ─────────────────────────────────────────────────────────────────

    getById(id: string): TemplateDefinition | undefined {
        const t = this._templates.get(id);
        return t ? (structuredClone(t) as TemplateDefinition) : undefined;
    }

    getAll(): TemplateDefinition[] {
        return Array.from(this._templates.values()).map(
            t => structuredClone(t) as TemplateDefinition
        );
    }

    /** getByScope — returns all templates scoped to a specific hierarchy level or element type. */
    getByScope(scope: TemplateScope): TemplateDefinition[] {
        return this.getAll().filter(t => t.scope === scope);
    }

    has(id: string): boolean {
        return this._templates.has(id);
    }

    count(): number {
        return this._templates.size;
    }

    // ── Serialisation ───────────────────────────────────────────────────────────

    serialize(): TemplateDefinition[] {
        return this.getAll();
    }

    /**
     * deserialize — replaces store contents from a snapshot array.
     * Called by ProjectLoader; does NOT emit StoreEventBus (bulk load). // TODO(TASK-08)
     */
    deserialize(templates: TemplateDefinition[]): void {
        this.clear();
        for (const t of templates) {
            this._templates.set(t.id, Object.freeze(structuredClone(t)) as TemplateDefinition);
        }
    }

    clear(): void {
        this._templates.clear();
    }

    // ── G-0.1 Built-in Library ──────────────────────────────────────────────

    /**
     * seedBuiltins — seeds the built-in template library when the store is empty.
     *
     * Called by initDataPlatform after project load. Templates with ids that are
     * already present (loaded from a saved snapshot) are skipped silently, so this
     * is safe to call unconditionally after every load.
     *
     * Built-in templates carry `metadata.createdBy === 'system'` and tags that
     * include 'builtin'. They are never serialized into the project snapshot
     * (ProjectSerializer filters them out via templateStore.serialize() which
     * returns all — but callers may add built-in filtering in a future phase).
     */
    seedBuiltins(): void {
        let seeded = 0;
        for (const t of BUILTIN_TEMPLATES) {
            if (!this._templates.has(t.id)) {
                this._templates.set(t.id, Object.freeze(structuredClone(t)));
                seeded++;
            }
        }
        if (seeded > 0) {
            console.log(`[TemplateStore] Seeded ${seeded} built-in templates`);
        }
    }

    /** Returns true if the given id belongs to a built-in template. */
    isBuiltin(id: string): boolean {
        return id.startsWith('builtin-');
    }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

export const templateStore = new TemplateStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'templateStore',
    clear: () => templateStore.clear(),
});
