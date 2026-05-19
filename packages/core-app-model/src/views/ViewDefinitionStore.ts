/**
 * ViewDefinitionStore — Phase B (base) + Phase VI (extended)
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed (commands call store methods)
 *   §01 §3.3   — Implements the ElementStore pattern: getAll, get, set, delete, serialize
 *   §03 §1.1   — ViewDefinition is a schema-stable first-class entity
 *   §04        — Read-only access via AIReadModel only; this store is NOT imported by AI layer
 *   §05        — Pure data module; no DOM, no Three.js, no rendering
 *   §07        — No server routes; client-side only
 *
 * Phase VI additions (all additive — no existing method signatures changed):
 *   - create() accepts new optional Phase VI fields
 *   - update() accepts new optional Phase VI fields in patch
 *   - New targeted write methods: setOutput, setViewRange, setCrop, setUnderlay, setSemantics
 *   - deserialize() is forward-compatible — Phase B snapshots load without new fields
 */

import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)
import type { SyncState } from '../hierarchy/HierarchyTypes';
import type {
    ViewDefinition,
    ViewDefinitionStoreSnapshot,
    ViewSpatialContext,
    ViewTemporalContext,
    VisibilityRuleStub,
    ViewOutputSettings,
    ViewRangeSettings,
    ViewCropSettings,
    ViewUnderlaySettings,
    ViewSemanticContext,
    AnnotationVisibilitySettings,
    ViewProjectionSettings,
    ViewLightingSettings,
    ViewSectionBox,
    ViewTemplateLock,
} from './ViewDefinitionTypes';

class ViewDefinitionStoreImpl {
    private _views: Map<string, ViewDefinition> = new Map();

    private dispatch(eventName: string, detail: object): void {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    private _drawingScaleOf(output?: ViewOutputSettings): number | undefined {
        return output?.customScale ?? output?.scale;
    }

    // ── Read API ──────────────────────────────────────────────────────────────

    getAll(): ViewDefinition[] {
        return [...this._views.values()];
    }

    get(viewId: string): ViewDefinition | undefined {
        const v = this._views.get(viewId);
        // VIEW-SYSTEM-AUDIT-2026 F5.1-B — structuredClone is faster and safer
        // than JSON.parse(JSON.stringify) for plain serialisable BIM data.
        return v ? structuredClone(v) : undefined;
    }

    has(viewId: string): boolean {
        return this._views.has(viewId);
    }

    getByType(viewType: ViewDefinition['viewType']): ViewDefinition[] {
        return this.getAll().filter(v => v.viewType === viewType);
    }

    getByDiscipline(discipline: ViewDefinition['discipline']): ViewDefinition[] {
        return this.getAll().filter(v => v.discipline === discipline);
    }

    getByLevel(levelId: string): ViewDefinition[] {
        return this.getAll().filter(v => v.spatial.levelId === levelId);
    }

    /**
     * Phase D Fix D — OBC-name-based view lookup.
     *
     * Returns the first ViewDefinition whose display name (`def.name`) or store
     * key (`def.id`) matches the supplied string, or undefined if none is found.
     *
     * This is used as an inference fallback in ViewController._activateFloorPlanView()
     * when `_activeDefinitionId` was not set before activation (e.g. the user clicked
     * the ViewCube or BottomActionMenu directly without going through ViewsRailPanel).
     * In that case, the OBC view's own `.name` may match the ViewDefinition's
     * display name — this method performs the linear scan to find it.
     *
     * Complexity: O(n) where n = number of stored ViewDefinitions. Acceptable
     * because this is called at most once per view switch and n is typically < 200.
     *
     * @param name — OBC view name or any candidate string to match against.
     * @returns The first matching ViewDefinition, or undefined.
     */
    getByViewName(name: string): ViewDefinition | undefined {
        if (!name) return undefined;
        for (const def of this._views.values()) {
            if (def.name === name || def.id === name) return def;
        }
        return undefined;
    }

    // ── Write API (called only by Commands) ───────────────────────────────────

    /**
     * Creates a new ViewDefinition. Called by CreateViewDefinitionCommand.execute().
     * Returns null if a view with the given id already exists (idempotent guard).
     * Phase VI: accepts new optional fields (output, viewRange, crop, underlay, semantics).
     */
    create(params: {
        id:           string;
        name:         string;
        viewType:     ViewDefinition['viewType'];
        discipline?:  ViewDefinition['discipline'];
        spatial?:     ViewSpatialContext;
        temporal?:    ViewTemporalContext;
        vgTemplateId?: string;
        intent?:      string;
        createdBy?:   string;
        // Phase VI
        output?:      ViewOutputSettings;
        viewRange?:   ViewRangeSettings;
        crop?:        ViewCropSettings;
        underlay?:    ViewUnderlaySettings;
        semantics?:   ViewSemanticContext;
        annotationOverrides?: AnnotationVisibilitySettings;
        titleOnSheet?: string;
        parentViewId?: string;
        subDiscipline?: string;
    }): ViewDefinition | null {
        if (this._views.has(params.id)) return null;

        const now = Date.now();
        const view: ViewDefinition = {
            id:           params.id,
            name:         params.name,
            viewType:     params.viewType,
            discipline:   params.discipline,
            spatial:      params.spatial ?? {},
            temporal:     params.temporal ?? {},
            vgTemplateId: params.vgTemplateId,
            intent:       params.intent,
            rules:        [],
            // Phase VI optional fields
            output:       params.output,
            viewRange:    params.viewRange,
            crop:         params.crop,
            underlay:     params.underlay,
            semantics:    params.semantics,
            annotationOverrides: params.annotationOverrides,
            titleOnSheet: params.titleOnSheet,
            parentViewId: params.parentViewId,
            subDiscipline: params.subDiscipline,
            dependencies: { elements: [] },
            metadata: {
                createdAt:  now,
                modifiedAt: now,
                createdBy:  params.createdBy ?? 'user',
                version:    1,
            },
        };

        this._views.set(view.id, view);
        storeEventBus.emit({ elementType: 'view-definition', elementId: view.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('vd:view-created', { viewId: view.id, viewType: view.viewType });
        // F5.1-B
        return structuredClone(view);
    }

    /**
     * Updates mutable fields of an existing ViewDefinition.
     * Called by UpdateViewDefinitionCommand.execute().
     * Phase VI: patch extended with new optional fields.
     * Returns false if the view does not exist.
     */
    update(viewId: string, patch: {
        name?:         string;
        discipline?:   ViewDefinition['discipline'];
        spatial?:      Partial<ViewSpatialContext>;
        temporal?:     Partial<ViewTemporalContext>;
        vgTemplateId?: string | null;
        intent?:       string;
        tags?:         string[];
        // Phase VI
        output?:       Partial<ViewOutputSettings> | null;
        viewRange?:    ViewRangeSettings | null;
        crop?:         ViewCropSettings | null;
        underlay?:     ViewUnderlaySettings | null;
        semantics?:    Partial<ViewSemanticContext> | null;
        annotationOverrides?: Partial<AnnotationVisibilitySettings> | null;
        titleOnSheet?:  string | null;
        subDiscipline?: string | null;
    }): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;

        // Phase B fields
        if (patch.name         !== undefined) view.name         = patch.name;
        if (patch.discipline   !== undefined) view.discipline   = patch.discipline;
        if (patch.vgTemplateId !== undefined) view.vgTemplateId = patch.vgTemplateId ?? undefined;
        if (patch.intent       !== undefined) view.intent       = patch.intent;

        if (patch.spatial) {
            view.spatial = { ...view.spatial, ...patch.spatial };
        }
        if (patch.temporal) {
            view.temporal = { ...view.temporal, ...patch.temporal };
        }
        if (patch.tags !== undefined) {
            view.metadata.tags = patch.tags;
        }

        // Phase VI fields
        const oldDrawingScale = this._drawingScaleOf(view.output);

        if (patch.output !== undefined) {
            view.output = patch.output === null
                ? undefined
                : { ...(view.output ?? {}), ...patch.output };
        }
        if (patch.viewRange !== undefined) {
            view.viewRange = patch.viewRange === null ? undefined : patch.viewRange;
        }
        if (patch.crop !== undefined) {
            view.crop = patch.crop === null ? undefined : patch.crop;
        }
        if (patch.underlay !== undefined) {
            view.underlay = patch.underlay === null ? undefined : patch.underlay;
        }
        if (patch.semantics !== undefined) {
            view.semantics = patch.semantics === null
                ? undefined
                : { ...(view.semantics ?? {}), ...patch.semantics };
        }
        if (patch.annotationOverrides !== undefined) {
            view.annotationOverrides = patch.annotationOverrides === null
                ? undefined
                : { ...(view.annotationOverrides ?? {}), ...patch.annotationOverrides };
        }
        if (patch.titleOnSheet !== undefined) {
            view.titleOnSheet = patch.titleOnSheet === null ? undefined : patch.titleOnSheet;
        }
        if (patch.subDiscipline !== undefined) {
            view.subDiscipline = patch.subDiscipline === null ? undefined : patch.subDiscipline;
        }
        if ((patch as any).purpose !== undefined) {
            (view as any).purpose = (patch as any).purpose === null ? undefined : (patch as any).purpose;
        }

        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;

        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        if (patch.output !== undefined && oldDrawingScale !== this._drawingScaleOf(view.output)) {
            this.dispatch('vd:drawing-scale-changed', { viewId });
        }
        return true;
    }

    // ── Phase VI Targeted Write Methods ────────────────────────────────────────
    // Each method targets one Phase VI property group.
    // Called by the corresponding Set*Command.

    /**
     * Sets or clears the output settings for a view.
     * Pass null to remove output settings (revert to view template defaults).
     */
    setOutput(viewId: string, output: ViewOutputSettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        const oldDrawingScale = this._drawingScaleOf(view.output);
        view.output          = output ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        if (oldDrawingScale !== this._drawingScaleOf(view.output)) {
            this.dispatch('vd:drawing-scale-changed', { viewId });
        }
        return true;
    }

    /**
     * Sets or clears the view range for a plan view.
     * Pass null to remove view range (plan engine uses project-level defaults).
     */
    setViewRange(viewId: string, viewRange: ViewRangeSettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.viewRange           = viewRange ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-range-changed', { viewId });
        return true;
    }

    /**
     * Sets or clears the crop region for a view.
     * Pass null to remove crop (view shows full spatial extent).
     */
    setCrop(viewId: string, crop: ViewCropSettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.crop                = crop ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    /**
     * Sets or clears the underlay for a plan view.
     * Pass null to remove underlay.
     */
    setUnderlay(viewId: string, underlay: ViewUnderlaySettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.underlay            = underlay ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    /**
     * Sets or clears the semantic context for a view (LLM/World Model layer).
     * Pass null to clear all semantic context.
     */
    setSemantics(viewId: string, semantics: ViewSemanticContext | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.semantics           = semantics ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    // ── Phase VII — Camera / Projection ─────────────────────────────────────

    /**
     * Sets or clears the camera projection settings for a view.
     * Called by SetViewProjectionCommand.execute().
     * Pass null to clear (remove saved camera state).
     */
    setProjection(viewId: string, projection: ViewProjectionSettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.projection          = projection ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        this.dispatch('vd:projection-changed', { viewId, projection });
        return true;
    }

    /**
     * Sets or clears the lighting settings for a 3D view.
     * Called by SetViewLightingCommand.execute() (Phase VII).
     * Pass null to clear (inherit scene-level lighting).
     */
    setLighting(viewId: string, lighting: ViewLightingSettings | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.lighting            = lighting ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    /**
     * Sets or clears the section box clipping settings for a 3D view.
     * Called by SetViewSectionBoxCommand.execute() (Phase VII).
     * Pass null to clear.
     */
    setSectionBox(viewId: string, sectionBox: ViewSectionBox | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.sectionBox          = sectionBox ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    // ── Phase VIII — Design Option ───────────────────────────────────────────

    /**
     * Sets or clears the Design Option reference for a view.
     * Called by SetViewDesignOptionCommand.execute() (Phase VIII).
     * Pass null to detach the view from any design option.
     */
    setDesignOption(viewId: string, designOptionId: string | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.designOptionId      = designOptionId ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        this.dispatch('vd:design-option-changed', { viewId, designOptionId });
        return true;
    }

    // ── Phase VII — View Template ────────────────────────────────────────────

    /**
     * Sets or clears the ViewTemplate reference for a view.
     * Called by SetViewTemplateCommand.execute().
     * Pass null to detach the view from its template (clears viewTemplateId).
     *
     * NOTE: This does NOT apply the template's property values to the view.
     *       The engine / applicator reads viewTemplateId at render time and
     *       cascades through the 4-tier VG system.
     */
    setViewTemplate(viewId: string, templateId: string | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        view.viewTemplateId      = templateId ?? undefined;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        this.dispatch('vd:template-changed', { viewId, templateId });
        return true;
    }

    /**
     * Updates the templateLock object for a view.
     * Called by SetViewTemplateLockCommand.execute().
     *
     * Each key in the lock object corresponds to a ViewDefinition field that
     * the view declares as "locally overridden" — i.e., NOT inherited from
     * the applied ViewTemplate even if the template lists that field in its
     * lockedFields array.
     *
     * Pass null to clear all locks (view inherits everything from its template).
     */
    setTemplateLock(viewId: string, lock: Partial<ViewTemplateLock> | null): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        if (lock === null) {
            view.templateLock = undefined;
        } else {
            view.templateLock = { ...(view.templateLock ?? {}), ...lock };
        }
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:view-updated', { viewId });
        return true;
    }

    // ── Phase 12 — View Template Sync State + Overrides ──────────────────────

    /**
     * updateSyncState — writes the computed sync state for a view.
     * Called ONLY by SyncStateEngine._computeNode().
     *
     * CRITICAL: Dispatches a DOM CustomEvent ONLY — never StoreEventBus. // TODO(TASK-08)
     * This mirrors hierarchyStore.setSyncState() anti-loop design.
     * Reason: SyncStateEngine subscribes to StoreEventBus. If this emitted // TODO(TASK-08)
     * the bus it would trigger infinite: SyncStateEngine → updateSyncState →
     * StoreEventBus → SyncStateEngine → … // TODO(TASK-08)
     */
    updateSyncState(viewId: string, state: SyncState): void {
        const view = this._views.get(viewId);
        if (!view) return;
        if ((view as any).viewSyncState === state) return;
        (view as any).viewSyncState = state;
        this.dispatch('vd:sync-state-changed', { viewId, state });
    }

    /**
     * setTemplateOverride — records a user-declared reason for a view property
     * deviating from its ViewTemplate value.
     * Called by OverrideViewTemplatePropertyCommand.execute().
     */
    setTemplateOverride(viewId: string, key: string, reason: string): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        if (!view.templateOverrides) view.templateOverrides = {};
        view.templateOverrides[key] = reason;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:template-override-changed', { viewId, key, reason });
        return true;
    }

    /**
     * clearTemplateOverride — removes a previously set override key.
     * Called by ResetViewTemplatePropertyCommand.execute().
     */
    clearTemplateOverride(viewId: string, key: string): boolean {
        const view = this._views.get(viewId);
        if (!view || !view.templateOverrides) return false;
        if (!(key in view.templateOverrides)) return false;
        delete view.templateOverrides[key];
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'update', timestamp: Date.now() });
        this.dispatch('vd:template-override-changed', { viewId, key, reason: null });
        return true;
    }

    // ── Phase B Rule Methods (unchanged) ────────────────────────────────────

    /**
     * Deletes a ViewDefinition. Called by DeleteViewDefinitionCommand.execute().
     * Returns false if the view does not exist.
     */
    delete(viewId: string): boolean {
        if (!this._views.has(viewId)) return false;
        this._views.delete(viewId);
        storeEventBus.emit({ elementType: 'view-definition', elementId: viewId, operation: 'delete', timestamp: Date.now() });
        this.dispatch('vd:view-deleted', { viewId });
        return true;
    }

    /**
     * Restores a deleted ViewDefinition from a snapshot (used by undo).
     * Fails silently if the id already exists.
     */
    restore(view: ViewDefinition): void {
        if (this._views.has(view.id)) return;
        this._views.set(view.id, structuredClone(view)); // F5.1-B
        storeEventBus.emit({ elementType: 'view-definition', elementId: view.id, operation: 'create', timestamp: Date.now() });
        this.dispatch('vd:view-created', { viewId: view.id, viewType: view.viewType });
    }

    /**
     * Adds a VisibilityRule to a view's rule array.
     * Called by CreateVisibilityRuleCommand (Phase C).
     */
    addRule(viewId: string, rule: VisibilityRuleStub): boolean {
        const view = this._views.get(viewId);
        if (!view) return false;
        if (!view.rules) view.rules = [];
        if (view.rules.some(r => r.id === rule.id)) return false;
        view.rules.push(rule);
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        this.dispatch('vd:rules-changed', { viewId });
        return true;
    }

    /**
     * Removes a VisibilityRule from a view's rule array.
     * Called by DeleteVisibilityRuleCommand (Phase C).
     */
    removeRule(viewId: string, ruleId: string): boolean {
        const view = this._views.get(viewId);
        if (!view || !view.rules) return false;
        const before = view.rules.length;
        view.rules = view.rules.filter(r => r.id !== ruleId);
        if (view.rules.length === before) return false;
        view.metadata.modifiedAt = Date.now();
        view.metadata.version   += 1;
        this.dispatch('vd:rules-changed', { viewId });
        return true;
    }

    // ── Persistence API ───────────────────────────────────────────────────────

    serialize(): ViewDefinitionStoreSnapshot {
        return {
            version: 1,
            views:   [...this._views.values()].map(v => structuredClone(v)), // F5.1-B
        };
    }

    /**
     * Deserialises a snapshot. Forward-compatible with Phase B data:
     * Phase B views missing Phase VI fields load with those fields as undefined.
     */
    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as ViewDefinitionStoreSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.views)) return;

        this._views.clear();
        for (const raw of snapshot.views) {
            if (raw?.id && raw?.name && raw?.viewType) {
                // Ensure Phase B required fields have defaults (backward compat)
                const view: ViewDefinition = {
                    ...raw,
                    dependencies: raw.dependencies ?? { elements: [] },
                    rules:        raw.rules        ?? [],
                    spatial:      raw.spatial       ?? {},
                    temporal:     raw.temporal      ?? {},
                };
                this._views.set(raw.id, view);
            }
        }
        this.dispatch('vd:store-loaded', {});
    }

    /** Wipes all view definitions. Called by CLEAR_PROJECT / LOAD_PROJECT_SNAPSHOT. */
    reset(): void {
        this._views.clear();
        this.dispatch('vd:store-reset', {});
    }
}

export const viewDefinitionStore = new ViewDefinitionStoreImpl();
export type { ViewDefinitionStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'viewDefinitionStore',
    clear: () => viewDefinitionStore.reset(),
});

// VIEW-SYSTEM-AUDIT-2026 F5.1 — register with StoreRegistry so command-driven
// snapshot/rollback and dynamic ownership probes can locate this store.
import { storeRegistry } from '../StoreRegistry';
storeRegistry.register('view', viewDefinitionStore as unknown as import('../StoreRegistry').BimStore);
