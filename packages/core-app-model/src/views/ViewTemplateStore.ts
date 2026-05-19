/**
 * ViewTemplateStore — Phase VII
 *
 * @deprecated Master Implementation Plan Wave 1 / Stage P0 (2026-04-26).
 * View Templates have been absorbed into VisibilityIntent.viewSeed.
 *
 * Read-only legacy: existing snapshots still deserialise into this store and
 * `runViewTemplateToIntentMigration()` (src/migration/ViewTemplateToIntentMigration.ts)
 * folds every template into the corresponding Intent's `viewSeed` block on
 * project load. After Wave 2 (P1) the Properties panel no longer surfaces
 * templates; after Wave 3 (S4) the "Create View from Template" dialog is
 * replaced by `CreateViewFromIntentDialog`.
 *
 * NEW CODE MUST NOT WRITE TO THIS STORE. The remaining `create / update /
 * applyTo / set / delete` methods are kept solely so:
 *   1. ViewTemplateManagerPanel can finish its current edit session,
 *   2. legacy snapshot deserialisation still works,
 *   3. the migration tests can construct fixture data.
 * A lint sweep in Wave 11 will reject any new caller of these write methods.
 *
 * Manages the library of ViewTemplate entities. Follows the ElementStore pattern
 * (§01 §3.3): stable ids, StoreEventBus emission, DOM CustomEvent dispatch, // TODO(TASK-08)
 * serialize / deserialize, singleton export.
 *
 * Only Commands write to this store. UI and AI layers read via the public API.
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed (commands call store methods)
 *   §01 §3.3   — ElementStore pattern: getAll, get, set, delete, serialize
 *   §03 §1.1   — ViewTemplate is a schema-stable first-class entity
 *   §04        — Read-only access via AIReadModel; this store is not imported by AI
 *   §05        — Pure data module; no DOM beyond event dispatch, no Three.js
 *   §07        — No server routes; client-side only
 *   Master Plan Wave 1 §P0 — store is now @deprecated readable.
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { ViewTemplate, ViewTemplateStoreSnapshot } from './ViewTemplateTypes';
import type {
    ViewTemplateLock,
    ViewOutputSettings,
    ViewTemporalContext,
    AnnotationVisibilitySettings,
    VisibilityRuleStub,
} from './ViewDefinitionTypes';

class ViewTemplateStoreImpl {
    private _templates: Map<string, ViewTemplate> = new Map();

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getAll(): ViewTemplate[] {
        return [...this._templates.values()].map(t => JSON.parse(JSON.stringify(t)));
    }

    get(templateId: string): ViewTemplate | undefined {
        const t = this._templates.get(templateId);
        return t ? JSON.parse(JSON.stringify(t)) : undefined;
    }

    has(templateId: string): boolean {
        return this._templates.has(templateId);
    }

    getByDiscipline(discipline: ViewTemplate['discipline']): ViewTemplate[] {
        return this.getAll().filter(t => t.discipline === discipline);
    }

    // ── Write API (called only by Commands) ───────────────────────────────────

    /**
     * Creates a new ViewTemplate.
     * Called by CreateViewTemplateCommand.execute().
     * Returns null if a template with the given id already exists.
     */
    create(params: {
        id:           string;
        name:         string;
        description?: string;
        discipline?:  ViewTemplate['discipline'];
        vgTemplateId?: string;
        output?:      ViewOutputSettings;
        temporal?:    ViewTemporalContext;
        annotationOverrides?: AnnotationVisibilitySettings;
        rules?:       VisibilityRuleStub[];
        lockedFields?: (keyof ViewTemplateLock)[];
        intent?:      string;
        createdBy?:   string;
    }): ViewTemplate | null {
        if (this._templates.has(params.id)) return null;

        const now = Date.now();
        const template: ViewTemplate = {
            id:           params.id,
            name:         params.name,
            description:  params.description,
            discipline:   params.discipline,
            vgTemplateId: params.vgTemplateId,
            output:       params.output,
            temporal:     params.temporal,
            annotationOverrides: params.annotationOverrides,
            rules:        params.rules ?? [],
            lockedFields: params.lockedFields ?? [],
            intent:       params.intent,
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  params.createdBy ?? 'user',
                version:    1,
            },
        };

        this._templates.set(template.id, template);
        storeEventBus.emit({
            elementType: 'view-template',
            elementId:   template.id,
            operation:   'create',
            timestamp:   Date.now(),
        });
        this.dispatch('vt:template-created', { templateId: template.id });
        return JSON.parse(JSON.stringify(template));
    }

    /**
     * Updates mutable fields of an existing ViewTemplate.
     * Called by UpdateViewTemplateCommand.execute().
     * Returns false if the template does not exist.
     * Dispatches vt:template-updated so views using this template can react.
     */
    update(templateId: string, patch: {
        name?:         string;
        description?:  string | null;
        discipline?:   ViewTemplate['discipline'];
        vgTemplateId?: string | null;
        output?:       Partial<ViewOutputSettings> | null;
        temporal?:     Partial<ViewTemporalContext> | null;
        annotationOverrides?: Partial<AnnotationVisibilitySettings> | null;
        rules?:        VisibilityRuleStub[] | null;
        lockedFields?: (keyof ViewTemplateLock)[];
        intent?:       string | null;
    }): boolean {
        const template = this._templates.get(templateId);
        if (!template) return false;

        if (patch.name        !== undefined) template.name        = patch.name;
        if (patch.description !== undefined) template.description = patch.description ?? undefined;
        if (patch.discipline  !== undefined) template.discipline  = patch.discipline;
        if (patch.vgTemplateId !== undefined) template.vgTemplateId = patch.vgTemplateId ?? undefined;
        if (patch.intent      !== undefined) template.intent      = patch.intent ?? undefined;
        if (patch.lockedFields !== undefined) template.lockedFields = patch.lockedFields;

        if (patch.output !== undefined) {
            template.output = patch.output === null
                ? undefined
                : { ...(template.output ?? {}), ...patch.output };
        }
        if (patch.temporal !== undefined) {
            template.temporal = patch.temporal === null
                ? undefined
                : { ...(template.temporal ?? {}), ...patch.temporal };
        }
        if (patch.annotationOverrides !== undefined) {
            template.annotationOverrides = patch.annotationOverrides === null
                ? undefined
                : { ...(template.annotationOverrides ?? {}), ...patch.annotationOverrides };
        }
        if (patch.rules !== undefined) {
            template.rules = patch.rules ?? [];
        }

        template.metadata.modifiedAt = Date.now();
        template.metadata.version   += 1;

        storeEventBus.emit({
            elementType: 'view-template',
            elementId:   templateId,
            operation:   'update',
            timestamp:   Date.now(),
        });
        // vt:template-updated is the primary event consumed by:
        //   - ProjectBrowserPanel (re-render affected view entries)
        //   - ViewPropertiesPanel (refresh template lock UI)
        this.dispatch('vt:template-updated', { templateId });
        return true;
    }

    /**
     * Deletes a ViewTemplate.
     * Called by DeleteViewTemplateCommand.execute().
     * Returns false if the template does not exist.
     * NOTE: Does not cascade-clear viewTemplateId on views that reference this
     * template — that is the responsibility of the delete command if desired.
     */
    delete(templateId: string): boolean {
        if (!this._templates.has(templateId)) return false;
        this._templates.delete(templateId);
        storeEventBus.emit({
            elementType: 'view-template',
            elementId:   templateId,
            operation:   'delete',
            timestamp:   Date.now(),
        });
        this.dispatch('vt:template-deleted', { templateId });
        return true;
    }

    /**
     * Restores a deleted ViewTemplate (used by undo in DeleteViewTemplateCommand).
     * Fails silently if the id already exists.
     */
    restore(template: ViewTemplate): void {
        if (this._templates.has(template.id)) return;
        this._templates.set(template.id, JSON.parse(JSON.stringify(template)));
        storeEventBus.emit({
            elementType: 'view-template',
            elementId:   template.id,
            operation:   'create',
            timestamp:   Date.now(),
        });
        this.dispatch('vt:template-created', { templateId: template.id });
    }

    // ── Persistence API ───────────────────────────────────────────────────────

    serialize(): ViewTemplateStoreSnapshot {
        return {
            version:   1,
            templates: [...this._templates.values()].map(t => JSON.parse(JSON.stringify(t))),
        };
    }

    /**
     * Restores from a ProjectSnapshot.
     * Forward-compatible — Phase B projects without this store load with an
     * empty template library (engine uses project/model defaults).
     */
    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as ViewTemplateStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.templates)) return;

        this._templates.clear();
        for (const raw of snapshot.templates) {
            if (raw?.id && raw?.name) {
                const template: ViewTemplate = {
                    ...raw,
                    rules:        raw.rules        ?? [],
                    lockedFields: raw.lockedFields ?? [],
                };
                this._templates.set(raw.id, template);
            }
        }
        this.dispatch('vt:store-loaded', {});
    }

    /** Wipes all templates. Called by CLEAR_PROJECT / LOAD_PROJECT_SNAPSHOT. */
    reset(): void {
        this._templates.clear();
        this.dispatch('vt:store-reset', {});
    }
}

export const viewTemplateStore = new ViewTemplateStoreImpl();
export type { ViewTemplateStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'viewTemplateStore',
    clear: () => viewTemplateStore.reset(),
});

// VIEW-SYSTEM-AUDIT-2026 F5.5 — register with StoreRegistry.
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('view-template', viewTemplateStore as unknown as import('../StoreRegistry').BimStore);
