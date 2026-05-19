/**
 * VGGovernanceStore — Visibility/Graphics Governance Data Layer
 *
 * Contract compliance:
 *   §01 §2     — All mutations are Command-routed (commands call store methods)
 *   §05 §4     — Pure data module; no DOM, no Three.js, no rendering
 *   §07        — No server routes; client-side only
 *
 * Architecture: Three-tier cascade (Phase 0+1) → Four-tier cascade (Phase 2+)
 *   Tier 1: Global VG Template Library
 *   Tier 2: Model Record (per model file, with property-level override tracking)
 *   Tier 3: View Record (per view within a model, with property-level override tracking)
 *   Tier 4: Resolved Style (merged at call time; no intermediate cache)
 *
 * Phase 2 additions (additive only — all existing APIs remain backward-compatible):
 *   - VGViewRecord interface
 *   - View API: ensureView, setViewCategoryOverride, resetViewCategoryOverride,
 *               getView, getAllViews, isViewPropOverridden
 *   - resolveStyle(modelId, category, viewId?) — viewId is optional (backward compat)
 *   - serialize/deserialize extended to include views
 */

/**
 * @deprecated Contract 25b — VG templates and per-category styles are
 * superseded by `VisibilityIntent` records in `visibilityIntentStore`. This
 * file remains as the read source for `VGToIntentMigration` and as the legacy
 * model-record registry consumed by `VGSceneApplicator`. New authoring code
 * MUST use the Visibility Intent system. Do not add new importers.
 */
export interface VGCategoryStyle {
    fillColor:    string;
    edgeColor:    string;
    lineWeight:   number;
    transparency: number;
    visible:      boolean;
    halftone:     boolean;
    cutLineWeight?:        number;
    projectionLineWeight?: number;
    beyondLineWeight?:     number;
    beyondEdgeColor?:      string;
    beyondVisible?:        boolean;
    fillPattern?: string;
}

export interface AnnotationStyleRecord {
    dimensionLineColor: string;
    dimensionTextColor: string;
    dimensionTextSize: number;
    tagTextColor: string;
    tagLeaderColor: string;
    tagTextSize: number;
    gridBubbleColor: string;
    sectionMarkColor: string;
}

export interface VGTemplate {
    id:          string;
    name:        string;
    description: string;
    isBuiltIn:   boolean;
    categories:  Record<string, VGCategoryStyle>;
    createdAt:   number;
    isViewPreset?: boolean;
    sourceViewId?: string;
    sourceViewName?: string;
    viewPresetTypes?: string[];
    annotationStyle?: AnnotationStyleRecord;
}

export interface VGModelRecord {
    modelId:           string;
    modelName:         string;
    templateId:        string | null;
    categoryOverrides: Record<string, Partial<VGCategoryStyle>>;
    overrideFlags:     Record<string, Record<string, boolean>>;
}

export interface VGViewRecord {
    viewId:            string;
    viewName:          string;
    modelId:           string;
    categoryOverrides: Record<string, Partial<VGCategoryStyle>>;
    overrideFlags:     Record<string, Record<string, boolean>>;
    lineEdgesVisible?: boolean;
}

export interface VGResolvedStyle {
    style:           VGCategoryStyle;
    source:          'view-override' | 'model-override' | 'template' | 'built-in-default';
    overriddenProps: string[];
}

const BUILT_IN_DEFAULT: VGCategoryStyle = {
    fillColor:    '#cccccc',
    edgeColor:    '#000000',
    lineWeight:   1,
    transparency: 0,
    visible:      true,
    halftone:     false,
};

const DEFAULT_ANNOTATION_STYLE_RECORD: Readonly<AnnotationStyleRecord> = Object.freeze({
    dimensionLineColor: '#000000',
    dimensionTextColor: '#000000',
    dimensionTextSize:  2.5,
    tagTextColor:       '#000000',
    tagLeaderColor:     '#000000',
    tagTextSize:        2.5,
    gridBubbleColor:    '#000000',
    sectionMarkColor:   '#FF0000',
});

const BUILT_IN_TEMPLATES: VGTemplate[] = [
    {
        id: 'pryzm-default',
        name: 'PRYZM Default',
        description: 'Standard architectural representation: poche walls, transparent glazing',
        isBuiltIn: true,
        createdAt: 0,
        categories: {
            wall:          { fillColor: '#1a1a1a', edgeColor: '#000000', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            slab:          { fillColor: '#e8e8e8', edgeColor: '#333333', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            column:        { fillColor: '#111111', edgeColor: '#000000', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            beam:          { fillColor: '#222222', edgeColor: '#000000', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            door:          { fillColor: '#8b6914', edgeColor: '#5a4010', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            window:        { fillColor: '#a8d8f0', edgeColor: '#336699', lineWeight: 1, transparency: 40, visible: true, halftone: false },
            'curtain-wall':  { fillColor: '#b8d8f0', edgeColor: '#336699', lineWeight: 1, transparency: 50, visible: true, halftone: false },
            'curtain-panel': { fillColor: '#c8e4f8', edgeColor: '#4477aa', lineWeight: 1, transparency: 50, visible: true, halftone: false },
            roof:          { fillColor: '#d0d0d0', edgeColor: '#444444', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            stair:         { fillColor: '#c8c8c8', edgeColor: '#444444', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            handrail:      { fillColor: '#888888', edgeColor: '#555555', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            furniture:     { fillColor: '#ececec', edgeColor: '#303030', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            plumbing:      { fillColor: '#4488cc', edgeColor: '#225599', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            grid:          { fillColor: '#aaaaaa', edgeColor: '#888888', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            level:         { fillColor: '#44aa44', edgeColor: '#228822', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            opening:       { fillColor: '#ffffff', edgeColor: '#cccccc', lineWeight: 1, transparency: 80, visible: true, halftone: false },
        },
    },
    {
        id: 'structural',
        name: 'Structural',
        description: 'Emphasises structure; suppresses furniture and MEP; fades openings',
        isBuiltIn: true,
        createdAt: 0,
        categories: {
            wall:          { fillColor: '#2a2a2a', edgeColor: '#000000', lineWeight: 3, transparency: 0,  visible: true,  halftone: false },
            slab:          { fillColor: '#888888', edgeColor: '#333333', lineWeight: 2, transparency: 0,  visible: true,  halftone: false },
            column:        { fillColor: '#111111', edgeColor: '#000000', lineWeight: 3, transparency: 0,  visible: true,  halftone: false },
            beam:          { fillColor: '#1a1a1a', edgeColor: '#000000', lineWeight: 3, transparency: 0,  visible: true,  halftone: false },
            door:          { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 0,  visible: true,  halftone: true  },
            window:        { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true,  halftone: true  },
            'curtain-wall':  { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true,  halftone: true  },
            'curtain-panel': { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true,  halftone: true  },
            roof:          { fillColor: '#bbbbbb', edgeColor: '#555555', lineWeight: 2, transparency: 0,  visible: true,  halftone: false },
            stair:         { fillColor: '#aaaaaa', edgeColor: '#555555', lineWeight: 1, transparency: 0,  visible: true,  halftone: false },
            handrail:      { fillColor: '#bbbbbb', edgeColor: '#888888', lineWeight: 1, transparency: 0,  visible: true,  halftone: false },
            furniture:     { fillColor: '#dddddd', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: false, halftone: false },
            plumbing:      { fillColor: '#dddddd', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: false, halftone: false },
            grid:          { fillColor: '#aaaaaa', edgeColor: '#888888', lineWeight: 1, transparency: 0,  visible: true,  halftone: false },
            level:         { fillColor: '#44aa44', edgeColor: '#228822', lineWeight: 1, transparency: 0,  visible: true,  halftone: false },
            opening:       { fillColor: '#ffffff', edgeColor: '#cccccc', lineWeight: 1, transparency: 90, visible: true,  halftone: false },
        },
    },
    {
        id: 'mep',
        name: 'MEP',
        description: 'Highlights plumbing in blue; halftones all structure/architecture',
        isBuiltIn: true,
        createdAt: 0,
        categories: {
            wall:          { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            slab:          { fillColor: '#dddddd', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            column:        { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            beam:          { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            door:          { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            window:        { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true, halftone: true  },
            'curtain-wall':  { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true, halftone: true  },
            'curtain-panel': { fillColor: '#cccccc', edgeColor: '#999999', lineWeight: 1, transparency: 60, visible: true, halftone: true  },
            roof:          { fillColor: '#cccccc', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            stair:         { fillColor: '#cccccc', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            handrail:      { fillColor: '#cccccc', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            furniture:     { fillColor: '#cccccc', edgeColor: '#aaaaaa', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            plumbing:      { fillColor: '#2255cc', edgeColor: '#112299', lineWeight: 3, transparency: 0,  visible: true, halftone: false },
            grid:          { fillColor: '#aaaaaa', edgeColor: '#888888', lineWeight: 1, transparency: 0,  visible: true, halftone: true  },
            level:         { fillColor: '#44aa44', edgeColor: '#228822', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            opening:       { fillColor: '#ffffff', edgeColor: '#cccccc', lineWeight: 1, transparency: 80, visible: true, halftone: false },
        },
    },
    {
        id: 'presentation',
        name: 'Presentation',
        description: 'High-contrast for client output: black poche walls, clean slabs',
        isBuiltIn: true,
        createdAt: 0,
        categories: {
            wall:          { fillColor: '#000000', edgeColor: '#000000', lineWeight: 4, transparency: 0,  visible: true, halftone: false },
            slab:          { fillColor: '#f5f5f5', edgeColor: '#222222', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            column:        { fillColor: '#000000', edgeColor: '#000000', lineWeight: 4, transparency: 0,  visible: true, halftone: false },
            beam:          { fillColor: '#111111', edgeColor: '#000000', lineWeight: 3, transparency: 0,  visible: true, halftone: false },
            door:          { fillColor: '#ffffff', edgeColor: '#000000', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            window:        { fillColor: '#d0e8f8', edgeColor: '#000000', lineWeight: 2, transparency: 30, visible: true, halftone: false },
            'curtain-wall':  { fillColor: '#d0e8f8', edgeColor: '#000000', lineWeight: 2, transparency: 30, visible: true, halftone: false },
            'curtain-panel': { fillColor: '#e0f0ff', edgeColor: '#000000', lineWeight: 1, transparency: 30, visible: true, halftone: false },
            roof:          { fillColor: '#eeeeee', edgeColor: '#000000', lineWeight: 2, transparency: 0,  visible: true, halftone: false },
            stair:         { fillColor: '#e0e0e0', edgeColor: '#222222', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            handrail:      { fillColor: '#666666', edgeColor: '#000000', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            furniture:     { fillColor: '#f0e8d8', edgeColor: '#666666', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            plumbing:      { fillColor: '#4488cc', edgeColor: '#225599', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            grid:          { fillColor: '#aaaaaa', edgeColor: '#888888', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            level:         { fillColor: '#44aa44', edgeColor: '#228822', lineWeight: 1, transparency: 0,  visible: true, halftone: false },
            opening:       { fillColor: '#ffffff', edgeColor: '#cccccc', lineWeight: 1, transparency: 80, visible: true, halftone: false },
        },
        annotationStyle: {
            dimensionLineColor: '#000000',
            dimensionTextColor: '#000000',
            dimensionTextSize:  2.5,
            tagTextColor:       '#000000',
            tagLeaderColor:     '#000000',
            tagTextSize:        2.5,
            gridBubbleColor:    '#000000',
            sectionMarkColor:   '#FF0000',
        },
    },
];

class VGGovernanceStoreImpl {
    private templates: Map<string, VGTemplate>   = new Map();
    private models:    Map<string, VGModelRecord> = new Map();
    private views:     Map<string, VGViewRecord>  = new Map();

    constructor() {
        this._loadBuiltIns();
    }

    private _loadBuiltIns(): void {
        for (const t of BUILT_IN_TEMPLATES) {
            this.templates.set(t.id, t);
        }
    }

    clear(): void {
        this.templates.clear();
        this.models.clear();
        this.views.clear();
    }

    reseed(): void {
        this._loadBuiltIns();
    }

    private dispatch(eventName: string, detail: object) {
        window.dispatchEvent(new CustomEvent(eventName, { detail })); // TODO(TASK-15)
    }

    // ── Template API ─────────────────────────────────────────────────────────

    getAllTemplates(): VGTemplate[] {
        return [...this.templates.values()];
    }

    getTemplate(id: string): VGTemplate | undefined {
        return this.templates.get(id);
    }

    createTemplate(id: string, name: string, description: string, basedOnId?: string): VGTemplate {
        const base = basedOnId ? this.templates.get(basedOnId) : undefined;
        const categories: Record<string, VGCategoryStyle> = base
            ? JSON.parse(JSON.stringify(base.categories))
            : {};
        const tpl: VGTemplate = { id, name, description, isBuiltIn: false, categories, createdAt: Date.now() };
        this.templates.set(id, tpl);
        this.dispatch('vg:template-created', { templateId: id });
        return tpl;
    }

    createTemplateFromStyles(
        id: string,
        name: string,
        description: string,
        categories: Record<string, VGCategoryStyle>,
        options?: {
            isViewPreset?: boolean;
            sourceViewId?: string;
            sourceViewName?: string;
            viewPresetTypes?: string[];
        },
    ): VGTemplate {
        const tpl: VGTemplate = {
            id,
            name,
            description,
            isBuiltIn: false,
            categories: JSON.parse(JSON.stringify(categories)),
            createdAt: Date.now(),
            isViewPreset: options?.isViewPreset,
            sourceViewId: options?.sourceViewId,
            sourceViewName: options?.sourceViewName,
            viewPresetTypes: options?.viewPresetTypes ? [...options.viewPresetTypes] : undefined,
        };
        this.templates.set(id, tpl);
        this.dispatch('vg:template-created', { templateId: id, isViewPreset: !!options?.isViewPreset });
        return tpl;
    }

    captureViewOverridesAsTemplate(templateId: string, viewId: string, name: string, description?: string): VGTemplate | null {
        const view = this.views.get(viewId);
        if (!view) return null;

        const categories: Record<string, VGCategoryStyle> = {};
        const categoryNames = new Set<string>([
            ...Object.keys(view.categoryOverrides),
            ...Object.keys(view.overrideFlags),
        ]);

        for (const category of categoryNames) {
            categories[category] = JSON.parse(JSON.stringify(
                this.resolveStyle(view.modelId, category, viewId).style,
            ));
        }

        return this.createTemplateFromStyles(
            templateId,
            name,
            description ?? `View V/G preset captured from ${view.viewName}`,
            categories,
            {
                isViewPreset: true,
                sourceViewId: view.viewId,
                sourceViewName: view.viewName,
                viewPresetTypes: ['section', 'elevation'],
            },
        );
    }

    applyTemplateToView(viewId: string, templateId: string): boolean {
        const view = this.views.get(viewId);
        const template = this.templates.get(templateId);
        if (!view || !template) return false;

        const categoryOverrides: Record<string, Partial<VGCategoryStyle>> = {};
        const overrideFlags: Record<string, Record<string, boolean>> = {};

        for (const [category, style] of Object.entries(template.categories)) {
            categoryOverrides[category] = JSON.parse(JSON.stringify(style));
            overrideFlags[category] = {};
            for (const prop of Object.keys(style)) {
                overrideFlags[category][prop] = true;
            }
        }

        return this.replaceViewCategoryOverrides(viewId, categoryOverrides, overrideFlags);
    }

    /** @deprecated Phase 8.3 */
    updateTemplateCategoryStyle(templateId: string, category: string, style: Partial<VGCategoryStyle>): boolean {
        const tpl = this.templates.get(templateId);
        if (!tpl || tpl.isBuiltIn) return false;
        if (!tpl.categories[category]) tpl.categories[category] = { ...BUILT_IN_DEFAULT };
        Object.assign(tpl.categories[category], style);
        this.dispatch('vg:template-updated', { templateId });
        return true;
    }

    deleteTemplate(templateId: string): boolean {
        const tpl = this.templates.get(templateId);
        if (!tpl || tpl.isBuiltIn) return false;
        this.templates.delete(templateId);
        for (const model of this.models.values()) {
            if (model.templateId === templateId) model.templateId = null;
        }
        this.dispatch('vg:template-deleted', { templateId });
        return true;
    }

    // ── Model API ────────────────────────────────────────────────────────────

    getAllModels(): VGModelRecord[] {
        return [...this.models.values()];
    }

    getModel(modelId: string): VGModelRecord | undefined {
        return this.models.get(modelId);
    }

    ensureModel(modelId: string, modelName: string): VGModelRecord {
        if (!this.models.has(modelId)) {
            this.models.set(modelId, {
                modelId,
                modelName,
                templateId: 'pryzm-default',
                categoryOverrides: {},
                overrideFlags: {},
            });
        }
        return this.models.get(modelId)!;
    }

    assignTemplateToModel(modelId: string, templateId: string | null): boolean {
        const model = this.models.get(modelId);
        if (!model) return false;
        if (templateId !== null && !this.templates.has(templateId)) return false;
        model.templateId = templateId;
        this.dispatch('vg:model-template-assigned', { modelId, templateId });
        return true;
    }

    setModelCategoryOverride(modelId: string, category: string, style: Partial<VGCategoryStyle>): boolean {
        const model = this.models.get(modelId);
        if (!model) return false;
        if (!model.categoryOverrides[category]) model.categoryOverrides[category] = {};
        if (!model.overrideFlags[category])     model.overrideFlags[category] = {};
        const changedProps: string[] = [];
        for (const [prop, val] of Object.entries(style)) {
            (model.categoryOverrides[category] as any)[prop] = val;
            model.overrideFlags[category][prop] = true;
            changedProps.push(prop);
        }
        this.dispatch('vg:category-style-set', { modelId, category, changedProps });
        return true;
    }

    resetModelCategoryOverride(modelId: string, category: string, prop?: keyof VGCategoryStyle): boolean {
        const model = this.models.get(modelId);
        if (!model) return false;
        if (prop) {
            if (model.categoryOverrides[category]) {
                delete (model.categoryOverrides[category] as any)[prop];
                if (Object.keys(model.categoryOverrides[category]).length === 0) {
                    delete model.categoryOverrides[category];
                }
            }
            if (model.overrideFlags[category]) {
                delete model.overrideFlags[category][prop];
                if (Object.keys(model.overrideFlags[category]).length === 0) {
                    delete model.overrideFlags[category];
                }
            }
        } else {
            delete model.categoryOverrides[category];
            delete model.overrideFlags[category];
        }
        this.dispatch('vg:category-style-reset', { modelId, category });
        return true;
    }

    // ── View API (Phase 2) ───────────────────────────────────────────────────

    getAllViews(): VGViewRecord[] {
        return [...this.views.values()];
    }

    getViewsByModel(modelId: string): VGViewRecord[] {
        return [...this.views.values()].filter(v => v.modelId === modelId);
    }

    getView(viewId: string): VGViewRecord | undefined {
        return this.views.get(viewId);
    }

    ensureView(viewId: string, viewName: string, modelId: string): VGViewRecord {
        if (!this.views.has(viewId)) {
            this.views.set(viewId, {
                viewId,
                viewName,
                modelId,
                categoryOverrides: {},
                overrideFlags: {},
            });
        }
        return this.views.get(viewId)!;
    }

    setViewCategoryOverride(viewId: string, category: string, style: Partial<VGCategoryStyle>): boolean {
        const view = this.views.get(viewId);
        if (!view) return false;
        if (!view.categoryOverrides[category]) view.categoryOverrides[category] = {};
        if (!view.overrideFlags[category])     view.overrideFlags[category] = {};
        const changedProps: string[] = [];
        for (const [prop, val] of Object.entries(style)) {
            (view.categoryOverrides[category] as any)[prop] = val;
            view.overrideFlags[category][prop] = true;
            changedProps.push(prop);
        }
        this.dispatch('vg:view-style-set', { viewId, modelId: view.modelId, category, changedProps });
        return true;
    }

    resetViewCategoryOverride(viewId: string, category: string, prop?: keyof VGCategoryStyle): boolean {
        const view = this.views.get(viewId);
        if (!view) return false;
        if (prop) {
            if (view.categoryOverrides[category]) {
                delete (view.categoryOverrides[category] as any)[prop];
                if (Object.keys(view.categoryOverrides[category]).length === 0) {
                    delete view.categoryOverrides[category];
                }
            }
            if (view.overrideFlags[category]) {
                delete view.overrideFlags[category][prop];
                if (Object.keys(view.overrideFlags[category]).length === 0) {
                    delete view.overrideFlags[category];
                }
            }
        } else {
            delete view.categoryOverrides[category];
            delete view.overrideFlags[category];
        }
        this.dispatch('vg:view-style-reset', { viewId, modelId: view.modelId, category });
        return true;
    }

    replaceViewCategoryOverrides(
        viewId: string,
        categoryOverrides: Record<string, Partial<VGCategoryStyle>>,
        overrideFlags: Record<string, Record<string, boolean>>,
    ): boolean {
        const view = this.views.get(viewId);
        if (!view) return false;
        view.categoryOverrides = JSON.parse(JSON.stringify(categoryOverrides));
        view.overrideFlags = JSON.parse(JSON.stringify(overrideFlags));
        this.dispatch('vg:view-style-set', { viewId, modelId: view.modelId, category: null });
        return true;
    }

    isViewPropOverridden(viewId: string, category: string, prop: string): boolean {
        const view = this.views.get(viewId);
        return !!(view?.overrideFlags[category]?.[prop]);
    }

    // ── Line Edges API ───────────────────────────────────────────────────────

    setViewLineEdges(viewId: string, visible: boolean): void {
        const view = this.views.get(viewId);
        if (!view) return;
        view.lineEdgesVisible = visible;
        this.dispatch('vg:view-line-edges-changed', { viewId, visible });
    }

    getViewLineEdges(viewId: string): boolean | undefined {
        return this.views.get(viewId)?.lineEdgesVisible;
    }

    // ── Resolution API ───────────────────────────────────────────────────────

    /** @deprecated Phase 8.3 */
    resolveStyle(modelId: string, category: string, viewId?: string): VGResolvedStyle {
        const model        = this.models.get(modelId);
        const template     = model?.templateId ? this.templates.get(model.templateId) : undefined;
        const templateStyle = template?.categories[category];
        const modelOverride = model?.categoryOverrides[category];
        const modelFlags    = model?.overrideFlags[category] ?? {};

        const view         = viewId ? this.views.get(viewId) : undefined;
        const viewOverride = view?.categoryOverrides[category];
        const viewFlags    = view?.overrideFlags[category] ?? {};

        const base: VGCategoryStyle = {
            ...(BUILT_IN_DEFAULT),
            ...(templateStyle ?? {}),
        };

        const style: VGCategoryStyle = { ...base };
        const overriddenProps: string[] = [];

        if (modelOverride) {
            for (const [prop, val] of Object.entries(modelOverride)) {
                (style as any)[prop] = val;
                if (modelFlags[prop]) overriddenProps.push(prop);
            }
        }

        const viewOverriddenProps: string[] = [];
        if (viewOverride) {
            for (const [prop, val] of Object.entries(viewOverride)) {
                (style as any)[prop] = val;
                if (viewFlags[prop]) viewOverriddenProps.push(prop);
            }
        }

        style.cutLineWeight        = style.cutLineWeight        ?? Math.max(style.lineWeight, style.lineWeight + 1);
        style.projectionLineWeight = style.projectionLineWeight ?? style.lineWeight;
        style.beyondLineWeight     = style.beyondLineWeight     ?? Math.max(1, style.lineWeight - 1);
        style.beyondEdgeColor      = style.beyondEdgeColor      ?? '#9ca3af';
        style.beyondVisible        = style.beyondVisible        ?? true;

        let source: VGResolvedStyle['source'] = 'built-in-default';
        if (viewOverriddenProps.length > 0)  source = 'view-override';
        else if (overriddenProps.length > 0) source = 'model-override';
        else if (templateStyle)              source = 'template';

        return { style, source, overriddenProps: [...overriddenProps, ...viewOverriddenProps] };
    }

    isPropOverridden(modelId: string, category: string, prop: string): boolean {
        const model = this.models.get(modelId);
        return !!(model?.overrideFlags[category]?.[prop]);
    }

    // ── DOC-2.5k — Annotation Style API ─────────────────────────────────────

    getAnnotationStyle(modelId: string, _viewId?: string): AnnotationStyleRecord {
        const model    = this.models.get(modelId);
        const template = model?.templateId ? this.templates.get(model.templateId) : undefined;
        return { ...DEFAULT_ANNOTATION_STYLE_RECORD, ...(template?.annotationStyle ?? {}) };
    }

    // ── Persistence API ──────────────────────────────────────────────────────

    serialize(): object {
        const userTemplates = [...this.templates.values()].filter(t => !t.isBuiltIn);
        return {
            version: 1,
            templates: userTemplates,
            models:    [...this.models.values()],
            views:     [...this.views.values()],
        };
    }

    deserialize(data: any): void {
        if (!data || data.version !== 1) return;
        if (Array.isArray(data.templates)) {
            for (const t of data.templates) {
                if (!t.isBuiltIn) this.templates.set(t.id, t);
            }
        }
        if (Array.isArray(data.models)) {
            for (const m of data.models) {
                this.models.set(m.modelId, m);
            }
        }
        if (Array.isArray(data.views)) {
            for (const v of data.views) {
                this.views.set(v.viewId, v);
            }
        }
    }
}

export const vgGovernanceStore = new VGGovernanceStoreImpl();
export type { VGGovernanceStoreImpl };

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry.js';
projectScopeRegistry.register({
    scopeName: 'vgGovernanceStore',
    clear: () => vgGovernanceStore.clear(),
    reseed: () => vgGovernanceStore.reseed(),
});

import { storeRegistry } from '../StoreRegistry.js';
storeRegistry.register('vg-governance', vgGovernanceStore as unknown as import('../StoreRegistry.js').BimStore);
