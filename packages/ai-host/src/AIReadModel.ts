/**
 * @file AIReadModel.ts
 * @description The EXCLUSIVE read-only gateway for the AI system.
 * 
 * 🛑 CRITICAL ENFORCEMENT RULES:
 * 1. AI code MUST ONLY access the model through this class.
 * 2. NO DIRECT IMPORTS of Stores, Fragments, or Three.js Scene are allowed in AI logic.
 * 3. This model returns CLONED or TRANSFORMED data to prevent accidental mutation.
 */

import { WallStore } from '@pryzm/geometry-wall';
import { SlabStore } from '@pryzm/geometry-slab';
import { ColumnStore } from '@pryzm/geometry-column';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { 
    AIElement, AIWall, AIDoor, AIWindow, AISlab, AIColumn, AIBeam, AILevel,
    AICurtainWall, AICurtainPanel,
    ElementType, ModelSummary 
} from './AITypes.js';
import { migrateToGridSystem } from '@pryzm/geometry-curtain-wall';
import { computeCurtainCells, cellArea } from '@pryzm/geometry-curtain-wall';

export class AIReadModel {
    private getWallStore(): WallStore | null {
        return window.wallStore // TODO(TASK-07) || null;
    }

    private getSlabStore(): SlabStore | null {
        return window.slabStore // TODO(TASK-07) || null;
    }

    private getColumnStore(): ColumnStore | null {
        return window.columnStore // TODO(TASK-07) || null;
    }

    private getBeamStore(): BeamStore | null {
        return window.beamStore // TODO(TASK-07) || null;
    }

    getLevels(): AILevel[] {
        const wallStore = this.getWallStore();
        if (!wallStore) return [];
        
        return wallStore.getLevels().map(l => ({
            id: l.id,
            name: l.name,
            elevation: l.elevation,
            height: l.height,
            childrenIds: l.childrenIds || []
        }));
    }

    getLevelById(id: string): AILevel | undefined {
        return this.getLevels().find(l => l.id === id);
    }

    getLevelName(levelId: string): string {
        const level = this.getLevelById(levelId);
        return level?.name || levelId;
    }

    getAllWalls(): AIWall[] {
        const store = this.getWallStore();
        if (!store) return [];

        return store.getAll().map(w => {
            const _bl0 = w.baseLine[0], _bl1 = w.baseLine[1];
            const length = Math.sqrt((_bl1.x-_bl0.x)**2 + (_bl1.y-_bl0.y)**2 + (_bl1.z-_bl0.z)**2);
            return {
                id: w.id,
                type: 'wall' as const,
                levelId: w.levelId,
                levelName: this.getLevelName(w.levelId),
                parentId: w.parentId,
                childrenIds: w.childrenIds,
                properties: this.mapProperties(w.properties),
                ifcData: w.ifcData ? {
                    guid: w.ifcData.guid,
                    ifcClass: w.ifcData.ifcClass,
                    psetCommon: (w.ifcData as any).psetCommon
                } : undefined,
                length,
                height: w.height,
                thickness: w.thickness,
                baseOffset: w.baseOffset,
                openingCount: w.openings?.length || 0,
                spatialStatus: (w as any).spatialStatus
            };
        }) as AIWall[];
    }

    private mapProperties(props: any): any {
        return {
            core: {
                material: props?.material,
                function: props?.function,
                isExternal: props?.isExternal,
                loadBearing: props?.loadBearing,
                fireRating: props?.fireRating,
                acousticRating: props?.acousticRating
            },
            extensions: {
                cost: props?.cost,
                maintenance: props?.maintenance,
                custom: props?.custom
            },
            unclassified: props || {}
        };
    }

    getWallsByLevel(levelId: string): AIWall[] {
        return this.getAllWalls().filter(w => w.levelId === levelId);
    }

    getAllDoors(): AIDoor[] {
        const store = this.getWallStore();
        if (!store) return [];

        return store.getAllDoors().map(d => ({
            id: d.id,
            type: 'door' as const,
            levelId: d.levelId,
            levelName: this.getLevelName(d.levelId),
            parentId: d.parentId,
            properties: this.mapProperties(d.properties),
            ifcData: d.ifcData ? {
                guid: d.ifcData.guid,
                ifcClass: d.ifcData.ifcClass,
                psetCommon: d.ifcData.psetCommon
            } : undefined,
            width: d.width,
            height: d.height,
            sillHeight: d.sillHeight,
            doorType: d.doorType,
            wallId: d.wallId,
            spatialStatus: (d as any).spatialStatus
        })) as AIDoor[];
    }

    getDoorsByLevel(levelId: string): AIDoor[] {
        return this.getAllDoors().filter(d => d.levelId === levelId);
    }

    getAllWindows(): AIWindow[] {
        const store = this.getWallStore();
        if (!store) return [];

        return store.getAllWindows().map(w => ({
            id: w.id,
            type: 'window' as const,
            levelId: w.levelId,
            levelName: this.getLevelName(w.levelId),
            parentId: w.parentId,
            properties: this.mapProperties(w.properties),
            ifcData: w.ifcData ? {
                guid: w.ifcData.guid,
                ifcClass: w.ifcData.ifcClass,
                psetCommon: w.ifcData.psetCommon
            } : undefined,
            width: w.width,
            height: w.height,
            sillHeight: w.sillHeight,
            windowType: w.windowType,
            wallId: w.wallId,
            spatialStatus: (w as any).spatialStatus
        })) as AIWindow[];
    }

    getWindowsByLevel(levelId: string): AIWindow[] {
        return this.getAllWindows().filter(w => w.levelId === levelId);
    }

    getAllSlabs(): AISlab[] {
        const store = this.getSlabStore();
        if (!store) return [];

        return store.getAll().map(s => ({
            id: s.id,
            type: 'slab' as const,
            levelId: s.levelId,
            levelName: this.getLevelName(s.levelId),
            parentId: s.parentId,
            properties: this.mapProperties(s.properties),
            ifcData: s.ifcData ? {
                guid: s.ifcData.guid,
                ifcClass: s.ifcData.ifcClass,
                psetCommon: s.ifcData.psetCommon
            } : undefined,
            width: s.width,
            depth: s.depth,
            thickness: s.thickness,
            spatialStatus: (s as any).spatialStatus
        })) as AISlab[];
    }

    getAllColumns(): AIColumn[] {
        const store = this.getColumnStore();
        if (!store) return [];

        return store.getAll().map(c => ({
            id: c.id,
            type: 'column' as const,
            levelId: c.levelId,
            levelName: this.getLevelName(c.levelId),
            parentId: c.parentId,
            properties: this.mapProperties(c.properties),
            ifcData: c.ifcData ? {
                guid: c.ifcData.guid,
                ifcClass: c.ifcData.ifcClass,
                psetCommon: c.ifcData.psetCommon
            } : undefined,
            width: c.width,
            depth: c.depth,
            height: c.height,
            profile: (c.profile === 'UC' || c.profile === 'UB') ? 'rectangular' : c.profile as 'circular' | 'rectangular',
            spatialStatus: (c as any).spatialStatus
        })) as AIColumn[];
    }

    getAllBeams(): AIBeam[] {
        const store = this.getBeamStore();
        if (!store) return [];

        return store.getAll().map(b => {
            const span = store.calculateSpan(b);
            const spanToDepthRatio = store.calculateSpanToDepthRatio(b);
            const supportCount = store.getSupportCount(b);

            return {
                id: b.id,
                type: 'beam' as const,
                levelId: b.levelId,
                levelName: this.getLevelName(b.levelId),
                parentId: b.parentId,
                properties: this.mapProperties({
                    material: b.material,
                    loadBearing: b.loadBearing,
                    fireRating: b.fireRating
                }),
                ifcData: b.ifcData ? {
                    guid: b.ifcData.guid,
                    ifcClass: b.ifcData.ifcClass
                } : undefined,
                startPoint: b.startPoint,
                endPoint: b.endPoint,
                width: b.width,
                depth: b.depth,
                span,
                spanToDepthRatio,
                startSupportId: b.startSupportId,
                endSupportId: b.endSupportId,
                startSupportType: b.startSupportType,
                endSupportType: b.endSupportType,
                supportCount,
                spatialStatus: (b as any).spatialStatus
            };
        }) as AIBeam[];
    }

    private getStairStore(): any | null {
        return window.stairStore // TODO(TASK-07) || null;
    }

    private getCurtainWallStore(): any | null {
        return window.curtainWallStore // TODO(TASK-07) || null;
    }

    private getComponentInstanceStore(): any | null {
        return window.componentInstanceStore // TODO(TASK-07) || null;
    }

    getAllFurniture(): any[] {
        const store = window.furnitureStore // TODO(TASK-07);
        if (!store) return [];
        return store.getAll().map((f: any) => ({
            id: f.id,
            type: 'furniture' as const,
            furnitureType: f.furnitureType,
            levelId: f.levelId,
            levelName: this.getLevelName(f.levelId),
            width: f.width,
            height: f.height,
            length: f.length,
            wardrobeConfig: f.wardrobeConfig,
            properties: this.mapProperties(f.properties || {})
        }));
    }

    getAllStairs(): AIElement[] {
        const store = this.getStairStore();
        if (!store) return [];

        return store.getAll().map((s: any) => ({
            id: s.id,
            type: 'stair' as const,
            levelId: s.levelId,
            levelName: this.getLevelName(s.levelId),
            parentId: s.parentId,
            properties: this.mapProperties(s.properties),
            spatialStatus: s.spatialStatus || 'Unknown',
            stairDescriptor: {
                riserCount: s.riserCount,
                treadCount: s.treadCount,
                baseLevelId: s.baseLevelId,
                topLevelId: s.topLevelId
            }
        }));
    }

    /**
     * Returns enriched curtain wall data including grid topology and panel summary.
     * §04 AI Read-Only Contract — no mutation of source data.
     */
    getAllCurtainWalls(): AICurtainWall[] {
        const store = this.getCurtainWallStore();
        if (!store) return [];

        const panelStore = window.curtainPanelStore // TODO(TASK-07);

        return store.getAll().map((cw: any) => {
            // P0.3 DTO Migration: curtain wall baseLine is now [Point3D, Point3D] — no .distanceTo().
            const length = cw.baseLine && cw.baseLine.length === 2
                ? (() => {
                    const [p0, p1] = cw.baseLine;
                    const dx = p1.x - p0.x, dy = (p1.y ?? 0) - (p0.y ?? 0), dz = p1.z - p0.z;
                    return Math.sqrt(dx * dx + dy * dy + dz * dz);
                })()
                : 0;

            // Resolve grid topology for AI façade reasoning
            const grid = cw.gridSystem
                ?? (length > 0.001
                    ? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing)
                    : null);

            const uLineCount = grid ? grid.uLines.length : 0;
            const vLineCount = grid ? grid.vLines.length : 0;
            const panelCount = Math.max(0, (uLineCount - 1)) * Math.max(0, (vLineCount - 1));

            // Panel type summary from panel store
            const panelTypeSummary = { glass: 0, opaque: 0, empty: 0 };
            if (panelStore) {
                const panels = panelStore.getByCurtainWallId(cw.id);
                for (const p of panels) {
                    if (p.panelType === 'SystemPanel_Glass') panelTypeSummary.glass++;
                    else if (p.panelType === 'SystemPanel_Opaque') panelTypeSummary.opaque++;
                    else if (p.panelType === 'SystemPanel_Empty') panelTypeSummary.empty++;
                }
            }

            return {
                id: cw.id,
                type: 'curtain-wall' as const,
                levelId: cw.levelId,
                levelName: this.getLevelName(cw.levelId),
                parentId: cw.parentId || cw.levelId,
                properties: this.mapProperties(cw.properties),
                ifcData: cw.ifcData ? { guid: cw.ifcData.guid, ifcClass: cw.ifcData.ifcClass } : undefined,
                spatialStatus: (cw as any).spatialStatus || 'Verified',
                length,
                height: cw.height,
                baseOffset: cw.baseOffset,
                gridXSpacing: cw.gridXSpacing,
                gridYSpacing: cw.gridYSpacing,
                uLineCount,
                vLineCount,
                panelCount,
                panelTypeSummary
            } as AICurtainWall;
        });
    }

    /**
     * Returns all individually addressable panels for a curtain wall.
     * §04 AI Read-Only Contract — returns cloned data.
     *
     * @param cwId — the CurtainWallData.id to query
     */
    getCurtainWallPanels(cwId: string): AICurtainPanel[] {
        const panelStore = window.curtainPanelStore // TODO(TASK-07);
        if (!panelStore) return [];

        const cwStore = this.getCurtainWallStore();
        if (!cwStore) return [];

        const cw = cwStore.get(cwId);
        if (!cw) return [];

        // P0.3 DTO Migration: curtain wall baseLine is now [Point3D, Point3D] — no .distanceTo().
        const length = cw.baseLine && cw.baseLine.length === 2
            ? (() => {
                const [p0, p1] = cw.baseLine;
                const dx = p1.x - p0.x, dy = (p1.y ?? 0) - (p0.y ?? 0), dz = p1.z - p0.z;
                return Math.sqrt(dx * dx + dy * dy + dz * dz);
            })()
            : 0;

        // Compute cell areas for AI area reporting
        const grid = cw.gridSystem
            ?? (length > 0.001
                ? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing)
                : null);

        const cells = grid ? computeCurtainCells(grid, length, cw.height) : [];
        const cellAreaMap = new Map<string, number>(
            cells.map(c => [`${c.i}:${c.j}`, cellArea(c)])
        );

        return panelStore.getByCurtainWallId(cwId).map((p: any) => ({
            id: p.id,
            curtainWallId: p.curtainWallId,
            levelId: p.levelId,
            cellIndex: [p.cellIndex[0], p.cellIndex[1]] as [number, number],
            panelType: p.panelType,
            materialOverride: p.materialOverride,
            area: cellAreaMap.get(`${p.cellIndex[0]}:${p.cellIndex[1]}`) ?? 0
        } as AICurtainPanel));
    }

    getAllGenericComponents(): AIElement[] {
        const store = this.getComponentInstanceStore();
        if (!store) return [];

        return store.getAll().map((c: any) => ({
            id: c.id,
            type: 'genericComponent' as const,
            levelId: c.levelId,
            levelName: this.getLevelName(c.levelId),
            parentId: c.parentId,
            properties: this.mapProperties(c.properties),
            spatialStatus: c.spatialStatus || 'Unknown',
            componentDescriptor: {
                componentName: c.displayName || 'Generic Component',
                familyId: c.componentDefinitionId,
                parameters: c.parameters
            }
        }));
    }

    getBeamsByLevel(levelId: string): AIBeam[] {
        return this.getAllBeams().filter(b => b.levelId === levelId);
    }

    findElementsWithInvalidDimensions(): AIElement[] {
        return this.getAllElements().filter(e => {
            if (e.type === 'slab') {
                const s = e as AISlab;
                return s.width <= 0 || s.depth <= 0 || s.thickness <= 0;
            }
            if (e.type === 'wall') {
                const w = e as AIWall;
                return w.length <= 0 || w.height <= 0 || w.thickness <= 0;
            }
            return false;
        });
    }

    getAllHandrails(): any[] {
        const store = window.handrailStore // TODO(TASK-07);
        if (!store) return [];
        return store.getAll().map((h: any) => ({
            id: h.id,
            type: 'handrail' as const,
            levelId: h.levelId,
            levelName: this.getLevelName(h.levelId),
            height: h.height,
            thickness: h.thickness,
            baseOffset: h.baseOffset,
            spatialStatus: 'Verified' as const,
            properties: this.mapProperties(h.properties || {})
        }));
    }

    getAllElements(): AIElement[] {
        return [
            ...this.getAllWalls(),
            ...this.getAllDoors(),
            ...this.getAllWindows(),
            ...this.getAllSlabs(),
            ...this.getAllColumns(),
            ...this.getAllBeams(),
            ...this.getAllStairs(),
            ...this.getAllCurtainWalls(),
            ...this.getAllGenericComponents(),
            ...this.getAllFurniture(),
            ...this.getAllHandrails()
        ];
    }

    getElementsByType(type: ElementType): AIElement[] {
        const normalizedType = type.toLowerCase().replace(/s$/, '');
        switch (normalizedType) {
            case 'wall': return this.getAllWalls();
            case 'door': return this.getAllDoors();
            case 'window': return this.getAllWindows();
            case 'slab': return this.getAllSlabs();
            case 'column': return this.getAllColumns();
            case 'beam': return this.getAllBeams();
            case 'stair': return this.getAllStairs();
            case 'curtain-wall': return this.getAllCurtainWalls();
            case 'genericcomponent': return this.getAllGenericComponents();
            case 'furniture': return this.getAllFurniture();
            case 'handrail': return this.getAllHandrails();
            default: return [];
        }
    }

    getElementsByLevel(levelId: string): AIElement[] {
        return this.getAllElements().filter(e => e.levelId === levelId);
    }

    getElementById(id: string): AIElement | undefined {
        return this.getAllElements().find(e => e.id === id);
    }

    getModelSummary(): ModelSummary {
        const elements = this.getAllElements();
        const levels = this.getLevels();

        const byType: Record<ElementType, number> = {
            'wall': 0,
            'door': 0,
            'window': 0,
            'slab': 0,
            'column': 0,
            'curtain-wall': 0,
            'beam': 0,
            'stair': 0,
            'genericComponent': 0,
            'furniture': 0,
            'handrail': 0
        };

        const byLevel: Record<string, number> = {};
        const missingIfc: string[] = [];
        let ifcComplete = 0;
        let ifcIncomplete = 0;

        elements.forEach(e => {
            byType[e.type] = (byType[e.type] || 0) + 1;
            byLevel[e.levelId] = (byLevel[e.levelId] || 0) + 1;

            if (e.ifcData?.guid && e.ifcData?.ifcClass) {
                if (e.ifcData.psetCommon && Object.keys(e.ifcData.psetCommon).length > 0) {
                    ifcComplete++;
                } else {
                    ifcIncomplete++;
                    missingIfc.push(e.id);
                }
            } else {
                ifcIncomplete++;
                missingIfc.push(e.id);
            }
        });

        return {
            totalElements: elements.length,
            byType,
            byLevel,
            levels,
            ifcReadiness: {
                complete: ifcComplete,
                incomplete: ifcIncomplete,
                missing: missingIfc
            }
        };
    }

    /**
     * P4.1 — VG State in AI Context.
     *
     * Returns a read-only summary of the current VG governance state for inclusion
     * in AI context windows. The summary is lightweight by design — only template
     * names/ids and per-model override counts are exposed (not raw style values).
     *
     * §04 AI Contract: read-only; returns a deep-cloned plain object, never a live store reference.
     */
    getVGGovernanceSummary(): {
        templates: Array<{ id: string; name: string; isBuiltIn: boolean }>;
        models: Array<{
            modelId: string;
            modelName: string;
            assignedTemplate: string | null;
            overrideCount: number;
            overriddenCategories: string[];
        }>;
    } {
        const store = window.vgGovernanceStore // TODO(TASK-07);
        if (!store) return { templates: [], models: [] };

        try {
            const templates = (store.getAllTemplates() as any[]).map((t: any) => ({
                id: t.id,
                name: t.name,
                isBuiltIn: t.isBuiltIn,
            }));

            const models = (store.getAllModels() as any[]).map((m: any) => {
                const overrideCategories = Object.keys(m.categoryOverrides || {});
                return {
                    modelId: m.modelId,
                    modelName: m.modelName,
                    assignedTemplate: m.templateId,
                    overrideCount: overrideCategories.length,
                    overriddenCategories: overrideCategories,
                };
            });

            return { templates, models };
        } catch {
            return { templates: [], models: [] };
        }
    }

    /**
     * P4.1 — Full AI payload combining BIM model summary and VG governance state.
     * This is the single entry-point for building the combined context passed to
     * Claude when the AI needs awareness of both geometry and graphic state.
     */
    getFullAIPayload(): {
        bimModel: ReturnType<AIReadModel['getModelSummary']>;
        vgGovernance: ReturnType<AIReadModel['getVGGovernanceSummary']>;
    } {
        return {
            bimModel: this.getModelSummary(),
            vgGovernance: this.getVGGovernanceSummary(),
        };
    }

    /**
     * Phase D — LLM View Authoring Protocol.
     *
     * Returns a compact, LLM-readable snapshot of all ViewDefinitions with their
     * associated VisibilityRules and VG governance summary. This is the primary
     * read-side of the Phase D "Views are Queries" principle.
     *
     * §04 AI Contract: read-only; returns cloned plain objects. Never exposes
     * live store references or Three.js scene objects.
     *
     * Structure (kept compact to stay within LLM context window budgets):
     *   - id, name, viewType, discipline, intent — basic identity
     *   - levelId, phaseFilter — spatial/temporal context
     *   - rules — serialisable VisibilityRule[] for this view (all scopes)
     *   - vgSnapshot — template assignment and model-level override count
     */
    getViewsForLLM(): Array<{
        id:           string;
        name:         string;
        viewType:     string;
        discipline?:  string;
        levelId?:     string;
        phaseFilter?: string;
        intent?:      string;
        semantics?: {
            audience?: string;
            purpose?:  string;
            tags?:     string[];
            filters?:  string[];
        };
        ruleCount:    number;
        rules: Array<{
            id:       string;
            label?:   string;
            scope:    string;
            scopeId:  string;
            priority: number;
            enabled:  boolean;
            condition: object;
            effect:    object;
        }>;
        vgSnapshot: {
            templateId:    string | null;
            overrideCount: number;
        };
    }> {
        try {
            const viewStore = window.viewDefinitionStore // TODO(TASK-07);
            const ruleEngine = window.visibilityRuleEngine;
            const vgStore    = window.vgGovernanceStore // TODO(TASK-07);

            if (!viewStore) return [];

            const views: ReturnType<AIReadModel['getViewsForLLM']> = [];

            for (const view of viewStore.getAll()) {
                // Collect all rules scoped to this view from the rule engine.
                const viewScopedRules = ruleEngine
                    ? (ruleEngine.getRulesForScope('view', view.id) as any[]).map((r: any) => ({
                        id:        r.id,
                        label:     r.label,
                        scope:     r.scope,
                        scopeId:   r.scopeId,
                        priority:  r.priority,
                        enabled:   r.enabled,
                        condition: r.condition,
                        effect:    r.effect,
                    }))
                    : [];

                // VG snapshot: template assignment and override count for this view's model.
                // Views created by Phase D default to 'model-default'; use that as fallback.
                const modelId = 'model-default';
                let templateId: string | null = null;
                let overrideCount = 0;

                if (vgStore) {
                    try {
                        const modelRecord = vgStore.getModel(modelId);
                        if (modelRecord) {
                            templateId    = modelRecord.templateId ?? null;
                            overrideCount = Object.keys(modelRecord.categoryOverrides ?? {}).length;
                        }
                    } catch {
                        // VG store not yet initialised — non-fatal.
                    }
                }

                views.push({
                    id:          view.id,
                    name:        view.name,
                    viewType:    view.viewType,
                    discipline:  view.discipline,
                    levelId:     view.spatial?.levelId,
                    phaseFilter: view.temporal?.phaseFilter,
                    intent:      view.intent,
                    ...(view.semantics ? {
                        semantics: {
                            audience: view.semantics.audience,
                            purpose:  view.semantics.purpose,
                            ...(view.semantics.tags    ? { tags:    [...view.semantics.tags]    } : {}),
                            ...(view.semantics.filters ? { filters: [...view.semantics.filters] } : {}),
                        }
                    } : {}),
                    ruleCount:   viewScopedRules.length,
                    rules:       viewScopedRules,
                    vgSnapshot: {
                        templateId,
                        overrideCount,
                    },
                });
            }

            return views;
        } catch (err) {
            console.warn('[AIReadModel] getViewsForLLM failed:', err);
            return [];
        }
    }

    countElements(filter?: { type?: ElementType; levelId?: string }): number {
        let elements = this.getAllElements();
        
        if (filter?.type) {
            elements = elements.filter(e => e.type === filter.type);
        }
        if (filter?.levelId) {
            elements = elements.filter(e => e.levelId === filter.levelId);
        }
        
        return elements.length;
    }

    findOrphanedOpenings(): AIElement[] {
        const doors = this.getAllDoors();
        const windows = this.getAllWindows();
        const walls = this.getAllWalls();
        const wallIds = new Set(walls.map(w => w.id));

        const orphaned: AIElement[] = [];

        doors.forEach(d => {
            if (!wallIds.has(d.wallId)) {
                orphaned.push(d);
            }
        });

        windows.forEach(w => {
            if (!wallIds.has(w.wallId)) {
                orphaned.push(w);
            }
        });

        return orphaned;
    }

    findElementsWithoutLevel(): AIElement[] {
        const levels = this.getLevels();
        const levelIds = new Set(levels.map(l => l.id));
        
        return this.getAllElements().filter(e => !levelIds.has(e.levelId));
    }

    findElementsWithInvalidParent(): AIElement[] {
        const allIds = new Set(this.getAllElements().map(e => e.id));
        const levelIds = new Set(this.getLevels().map(l => l.id));

        return this.getAllElements().filter(e => {
            if (!e.parentId) return false;
            return !allIds.has(e.parentId) && !levelIds.has(e.parentId);
        });
    }

    // ── Phase A: Semantic Tag Queries ─────────────────────────────────────────

    /**
     * Returns the semantic tags attached to an element.
     * Delegates to SemanticIndex via window global (never imports the index directly —
     * this keeps AIReadModel free of engine-layer circular dependencies).
     *
     * §04: read-only; returns a cloned array, never a live Set reference.
     */
    getSemanticTags(elementId: string): string[] {
        const idx = window.semanticIndex;
        if (!idx) return [];
        return [...idx.getTags(elementId)];
    }

    /**
     * Returns all elements that carry a given semantic tag.
     * O(1) index lookup via SemanticIndex, filtered to elements known by AIReadModel.
     *
     * §04: read-only; returns cloned AIElement[] via getAllElements() chain.
     */
    getTaggedElements(tag: string): AIElement[] {
        const idx = window.semanticIndex;
        if (!idx) return [];
        const taggedIds = new Set<string>(idx.getElementsByTag(tag));
        return this.getAllElements().filter(e => taggedIds.has(e.id));
    }

    /**
     * Returns a compact tag summary for inclusion in LLM context windows.
     * Format: { tag → count, elementIds (first 20) }
     */
    getSemanticTagSummary(): Array<{
        tag: string;
        count: number;
        sampleElementIds: string[];
    }> {
        const idx = window.semanticIndex;
        if (!idx) return [];
        const summary = idx.getTagSummary() as Record<string, number>;
        return Object.entries(summary).map(([tag, count]) => ({
            tag,
            count: count as number,
            sampleElementIds: (idx.getElementsByTag(tag) as string[]).slice(0, 20),
        }));
    }

    // ── Phase IV — Sheet & Schedule LLM Read Model ────────────────────────────

    /**
     * Phase IV — LLM Sheet Read Model.
     *
     * Returns a compact, LLM-readable snapshot of all SheetDefinitions.
     * Used to populate the AI context window with sheet data so Claude can
     * propose CREATE_SHEET / UPDATE_SHEET intents, query sheet composition,
     * and reason about drawing sheet organisation.
     *
     * §04 AI Contract: read-only; returns cloned plain objects. Never exposes
     * live SheetStore references.
     */
    getSheetsForLLM(): Array<{
        id:          string;
        sheetNumber: string;
        name:        string;
        revision:    string;
        viewCount:   number;
        viewIds:     string[];
        titleBlock?: string;
        metadata:    { createdAt: number; modifiedAt: number };
    }> {
        try {
            const store = window.sheetStore // TODO(TASK-07);
            if (!store) return [];

            return (store.getAll() as any[]).map((s: any) => ({
                id:          s.id,
                sheetNumber: s.sheetNumber,
                name:        s.name,
                revision:    s.revision ?? '',
                viewCount:   (s.viewports ?? []).length,
                viewIds:     (s.viewports ?? []).map((vp: any) => vp.viewId),
                titleBlock:  s.titleBlock,
                metadata: {
                    createdAt:  s.metadata?.createdAt  ?? 0,
                    modifiedAt: s.metadata?.modifiedAt ?? 0,
                },
            }));
        } catch (err) {
            console.warn('[AIReadModel] getSheetsForLLM failed:', err);
            return [];
        }
    }

    /**
     * Phase IV — LLM Schedule Read Model.
     *
     * Returns a compact, LLM-readable snapshot of all ScheduleDefinitions.
     * Used to populate the AI context window with schedule data so Claude can
     * propose CREATE_SCHEDULE / UPDATE_SCHEDULE intents, enumerate existing
     * schedules, and suggest schedule-based quantity take-off queries.
     *
     * §04 AI Contract: read-only; returns cloned plain objects. Never exposes
     * live ScheduleStore references.
     */
    getSchedulesForLLM(): Array<{
        id:           string;
        name:         string;
        scheduleType: string;
        fields:       string[];
        metadata:     { createdAt: number; modifiedAt: number };
    }> {
        try {
            const store = window.scheduleStore // TODO(TASK-07);
            if (!store) return [];

            return (store.getAll() as any[]).map((s: any) => ({
                id:           s.id,
                name:         s.name,
                scheduleType: s.scheduleType,
                fields:       [...(s.fields ?? [])],
                metadata: {
                    createdAt:  s.metadata?.createdAt  ?? 0,
                    modifiedAt: s.metadata?.modifiedAt ?? 0,
                },
            }));
        } catch (err) {
            console.warn('[AIReadModel] getSchedulesForLLM failed:', err);
            return [];
        }
    }
}

export const aiReadModel = new AIReadModel();
