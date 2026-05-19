import { AIReadModel } from './AIReadModel.js';
import { QueryResult, AIServiceLike } from './AITypes.js';
import { AIIntentType } from './intents.js';
import { commandProposalStore, RemoveGridCommand } from '@pryzm/command-registry';
import { decisionRecordStore } from '@pryzm/core-app-model';

/** Wave 5 Day 2 — single-cast typed window accessor (Pattern B/A shim). */
function ws<T>(k: string): T | null { return ((window as unknown as Record<string, unknown>)[k] as T) ?? null; }

type QueryPattern = {
    patterns: RegExp[];
    handler: (match: RegExpMatchArray, readModel: AIReadModel) => Promise<QueryResult>;
};

const COMMAND_FAMILY_HELP: Record<string, string> = {
    'views and templates': 'Views and templates: create/update/delete view definitions, detail views, templates, view range, crop, underlay, projection, lighting, semantics, design options, and template locks. Use the View Browser and View Properties panels.',
    'sheets and schedules': 'Sheets and schedules: create/update/delete sheets and schedules, place/move/remove viewports, manage revisions, data panels, layout rules, composition intent, and exports. Use the Sheets/Schedules areas in the View Browser.',
    'vg and visibility rules': 'VG and visibility rules: create/apply/capture VG templates, category styles, instance overrides, graphic overrides, visibility intents, and visibility rules. Use the VG and Visibility Intent panels. Typed AI visibility commands are also available under Visibility.',
    'rooms and layouts': 'Rooms and layouts: create/update/delete rooms, rename rooms, set occupancy, update finishes/boundaries, detect rooms, room bounding lines, and apply generative layouts. Use the room tools, generative layout panels, and import conversion workflows.',
    'stairs and railings': 'Stairs and railings: create/update/delete stairs, validate stair geometry, change stair shape, update flights, and manage stair railings. Use the stair/railing modeling tools.',
    'beams columns and structure': 'Beams, columns, and structure: create/update beams and columns, assign beam supports, validate beams, and create native structural elements from IFC conversion. Use the beam/column tools and IFC native conversion.',
    'doors and windows': 'Doors and windows: update width, height, sill height, fire rating, accessibility, frame/leaf colors, move hosted elements, center windows, and create windows in matching openings. Use property panels and hosted-element controls.',
    'selection operations': 'Selection operations: join walls, cut walls, mirror, copy, scale, and offset selected elements. Use the selection toolbar operation tools.',
    'data workbench': 'Data Workbench: create/update/delete hierarchy nodes, sites, buildings, units, templates, template assignments, derived properties, element codes, planned data, requirements, and data sheet edits. Use the Data Workbench panels.',
    'ifc conversion': 'IFC conversion: import IFC as reference or native conversion, convert walls/slabs/floors/ceilings/rooms/stairs/railings/beams/columns/openings/furniture into native commands, and show conversion reports. Use the IFC import workflow.',
    'auditor and asset catalog': 'Auditor and asset catalog: set/update/delete requirements, run auto-remediation, and add/update/delete asset catalog entries. Use the Auditor and Strategize panels.',
    'furniture plumbing and handrails': 'Furniture, plumbing, and handrails: create/update furniture, plumbing fixtures, handrails, and related parameters. Use the furniture drag/drop, property panels, plumbing tools, handrail tools, and AI wardrobe commands.',
    'floors ceilings and roofs': 'Floors, ceilings, and roofs: create/update/remove floors and ceilings, update boundaries/layers, remove by level, create/update/delete roofs, and update slab sketches/layers/polygons. Use property panels, modeling tools, IFC conversion, and the typed AI slab commands.',
    'ai element creator': 'AI Element Creator: upload a reference image, describe the target element, and generate an AI element proposal from the AI Element Creator panel workflow.',
};

export class QueryEngine {
    private readModel: AIReadModel;
    private queryPatterns: QueryPattern[];
    /**
     * Wave 5 Day 1 — typed reference replacing all window-cast aiService reads.
     * Set by AIService after instantiation via `setAIService(this)`.
     * Anchored to: 09-WAVE-5-CAST-DELETION.md §3 Pattern A/C.
     */
    private aiService: AIServiceLike | null = null;

    /** Injected scene accessor — replaces `(window as any).selectionManager?.world?.scene?.three`.
     *  Wired from `AIService.setSceneAccessor()` which is called from `engineLauncher.ts`
     *  after `initTools()` completes.  Falls back to the window chain when null. OI-045 fix. */
    private _sceneAccessor: (() => any) | null = null;

    constructor(readModel: AIReadModel) {
        this.readModel = readModel;
        this.queryPatterns = this.initializePatterns();
    }

    /** Called by AIService immediately after `new QueryEngine(readModel)`. */
    setAIService(service: AIServiceLike): void {
        this.aiService = service;
    }

    /** Wire a scene accessor so this package never reads `(window as any).selectionManager`.
     *  Called transitively from `AIService.setSceneAccessor()`.  OI-045 fix. */
    setSceneAccessor(fn: (() => any) | null): void {
        this._sceneAccessor = fn;
    }

    async query(input: string): Promise<QueryResult> {
        for (const pattern of this.queryPatterns) {
            for (const re of pattern.patterns) {
                const match = input.match(re);
                if (match) {
                    return await pattern.handler(match, this.readModel);
                }
            }
        }
        return { query: input, answer: "I'm not sure how to help with that yet." };
    }

    private async handleWardrobeModification(selectedId: string, input: string, el: any): Promise<QueryResult> {
        const isCorner = el.furnitureType === 'corner_wardrobe' || !!el.wardrobeConfig?.isCorner;
        
        const config = structuredClone(el.wardrobeConfig || {
            width: 1.2, height: 2.4, depth: 0.6, sections: []
        });

        // 1. Dims - Support both mm (default) and m (if "m" suffix present)
        const parseDim = (match: RegExpMatchArray | null) => {
            if (!match) return null;
            const val = parseFloat(match[1]!);
            // If the input explicitly says "m" or the value is very small (< 10), assume meters
            if (match[0].toLowerCase().includes('m') && !match[0].toLowerCase().includes('mm')) return val;
            if (val > 20) return val / 1000;
            return val;
        };

        const widthMatch = input.match(/(?:width to|total width to|increase width to|change width to|width)\s+([\d.]+)/i);
        const heightMatch = input.match(/(?:height to|total height to|increase height to|change height to|height|general height)\s+([\d.]+)/i);
        const depthMatch = input.match(/(?:depth to|total depth to|increase depth to|change depth to|depth)\s+([\d.]+)/i);
        
        const newWidth = parseDim(widthMatch);
        const newHeight = parseDim(heightMatch);
        const newDepth = parseDim(depthMatch);

        if (newWidth !== null) config.width = newWidth;
        if (newHeight !== null) config.height = newHeight;
        if (newDepth !== null) config.depth = newDepth;

        // --- BRANCH SPECIFIC PARSING ---
        const branch1Input = input.match(/branch 1:?\s*\(([^)]+)\)/i)?.[1] || "";
        const branch2Input = input.match(/branch 2:?\s*\(([^)]+)\)/i)?.[1] || "";

        if (isCorner) {
            config.mainBranch = {
                width: config.width,
                depth: config.depth,
                sections: config.sections || []
            };
            config.sideBranch = {
                width: config.lengthBranchTwo || config.widthBranchTwo || config.depth,
                depth: config.widthBranchTwo || config.depth,
                sections: config.sideSections || []
            };

            if (branch1Input) {
                const b1Width = parseDim(branch1Input.match(/(?:width|length)\s+([\d.]+)/i));
                const b1Depth = parseDim(branch1Input.match(/depth\s+([\d.]+)/i));
                if (b1Width !== null) {
                    config.width = b1Width;
                    config.mainBranch.width = b1Width;
                }
                if (b1Depth !== null) {
                    config.depth = b1Depth;
                    config.mainBranch.depth = b1Depth;
                }
                
                const b1SectionsMatch = branch1Input.match(/reconfigure to (\d+) sections/i);
                if (b1SectionsMatch) {
                    config.sections = this.createDefaultSections(parseInt(b1SectionsMatch[1]!), config.width);
                    config.mainBranch.sections = config.sections;
                }
                this.parseComponents(branch1Input, config, 'sections');
                this.parseDoorsAndFeatures(branch1Input, config, 'sections');
                config.mainBranch.sections = config.sections;
            }

            if (branch2Input) {
                const b2Length = parseDim(branch2Input.match(/(?:length|width)\s+([\d.]+)/i));
                const b2Width = parseDim(branch2Input.match(/(?:depth|width)\s+([\d.]+)/i));
                
                if (b2Length !== null) {
                    config.lengthBranchTwo = b2Length;
                    config.sideBranch.width = b2Length;
                }
                if (b2Width !== null) {
                    config.widthBranchTwo = b2Width;
                    config.sideBranch.depth = b2Width;
                }
                
                const b2SectionsMatch = branch2Input.match(/reconfigure to (\d+) sections/i);
                if (b2SectionsMatch) {
                    config.sideSections = this.createDefaultSections(parseInt(b2SectionsMatch[1]!), config.sideBranch.width);
                    config.sideBranch.sections = config.sideSections;
                }
                this.parseComponents(branch2Input, config, 'sideSections');
                this.parseDoorsAndFeatures(branch2Input, config, 'sideSections');
                config.sideBranch.sections = config.sideSections;
            }
        }

        // Fallback to global parsing if not branch-specific or for non-corner
        if (!branch1Input && !branch2Input) {
            const sectionsMatch = input.match(/(?:reconfigure to|update wardrobe to|set to|modify wardrobe\.)?\s*(\d+)\s+sections/i);
            if (sectionsMatch) {
                config.sections = this.createDefaultSections(parseInt(sectionsMatch[1]!), config.width);
            }
            this.parseComponents(input, config, 'sections');
            this.parseDoorsAndFeatures(input, config, 'sections');
        }

        const aiService = this.aiService;
        if (!aiService) return { query: input, answer: 'AI service not available.' };
        const suggestion = {
            intent: AIIntentType.MODIFY_WARDROBE,
            targetElementId: selectedId,
            payload: {
                elementId: selectedId,
                wardrobeConfig: config,
                width: config.width,
                height: config.height,
                length: config.depth
            },
            rationale: `Modify wardrobe dimensions and interior configuration as requested.`,
            confidence: 1.0
        };

        const originalGetSuggestions = aiService.getIntentSuggestions;
        aiService.getIntentSuggestions = () => [suggestion];
        const proposals = await aiService.getCommandProposals();
        aiService.getIntentSuggestions = originalGetSuggestions;

        proposals.forEach((p: any) => {
            const uniqueProposal = { ...p, id: crypto.randomUUID() };
            commandProposalStore.add(uniqueProposal);
            window.dispatchEvent(new CustomEvent('ai-proposal-added', {  // TODO(TASK-11)
                detail: { proposal: uniqueProposal } 
            }));
        });

        this.triggerActionsTab();

        return {
            query: input,
            answer: `I've prepared a proposal to modify your wardrobe with the requested dimensions and internal layout.`
        };
    }

    private createDefaultSections(count: number, totalWidth: number): any[] {
        const sections = [];
        const sectionWidth = totalWidth / Math.max(count, 1);
        for (let i = 0; i < count; i++) {
            sections.push({
                width: sectionWidth,
                doorType: 'double-hinged',
                components: []
            });
        }
        return sections;
    }

    private parseComponents(input: string, config: any, sectionKey: 'sections' | 'sideSections') {
        const sections = config[sectionKey];
        if (!sections || sections.length === 0) return;

        // Position-based matching
        const leftMatch = input.match(/(?:left (?:module|section|unit)):?\s*(?:(\d+)\s+)?(shelves|drawers|hanging|section|shelf)/i);
        if (leftMatch) this.applyComponentToSection(config, sections, 0, leftMatch[2]!, parseInt(leftMatch[1]!) || 3);
        
        const rightMatch = input.match(/(?:right (?:module|section|unit)):?\s*(?:(\d+)\s+)?(shelves|drawers|hanging|section|shelf)/i);
        if (rightMatch) this.applyComponentToSection(config, sections, sections.length - 1, rightMatch[2]!, parseInt(rightMatch[1]!) || 3);

        const centerMatch = input.match(/(?:center (?:module|section|unit)):?\s*(?:(\d+)\s+)?(shelves|drawers|hanging|section|shelf)/i);
        if (centerMatch) this.applyComponentToSection(config, sections, Math.floor(sections.length / 2), centerMatch[2]!, parseInt(centerMatch[2]!) || 3);

        // Explicit index matching: "module 1: 5 shelves"
        const componentRegex = /(?:module|section|unit) (\d+):?\s*(?:(\d+)\s+)?(shelves|drawers|hanging|section|shelf)/gi;
        let compMatch;
        while ((compMatch = componentRegex.exec(input)) !== null) {
            const idx = parseInt(compMatch[1]!) - 1;
            this.applyComponentToSection(config, sections, idx, compMatch[3]!, parseInt(compMatch[2]!) || 3);
        }
    }

    private parseDoorsAndFeatures(input: string, config: any, sectionKey: 'sections' | 'sideSections') {
        const sections = config[sectionKey];
        if (!sections) return;

        const doorTypeMatch = input.match(/(?:set door type to|door type|doors to|glass finish)\s*(sliding|hinged-left|hinged-right|double-hinged|translucent glass|translucent|glass|mirror)?/i);
        if (doorTypeMatch || input.match(/glass door/i)) {
            let doorType = doorTypeMatch?.[1]?.toLowerCase();
            if (input.match(/translucent/i)) doorType = 'translucent-glass';
            else if (input.match(/glass door/i) || doorType === 'glass') doorType = 'glass';
            
            if (doorType) {
                sections.forEach((s: any) => s.doorType = doorType);
            }
        }

        if (input.match(/add mirror/i)) {
            sections.forEach((s: any) => {
                if (!s.components) s.components = [];
                if (!s.components.find((c: any) => c.type === 'mirror-panel')) {
                    s.components.push({ type: 'mirror-panel', positionY: config.height / 2 });
                }
            });
        }

        if (input.match(/add lighting/i)) {
            sections.forEach((s: any) => {
                if (!s.components) s.components = [];
                if (!s.components.find((c: any) => c.type === 'lighting-strip')) {
                    s.components.push({ type: 'lighting-strip', positionY: config.height - 0.05 });
                }
            });
        }
    }

    private applyComponentToSection(config: any, sections: any[], idx: number, typeStr: string, count: number) {
        if (idx < 0 || idx >= sections.length) return;
        const type = typeStr.toLowerCase();
        sections[idx].components = (sections[idx].components || []).filter((c: any) => 
            c.type === 'lighting-strip' || c.type === 'mirror-panel'
        );

        if (type === 'shelves' || type === 'shelf') {
            for (let j = 1; j <= count; j++) {
                sections[idx].components.push({ 
                    type: 'shelf', 
                    positionY: (config.height / (count + 1)) * j 
                });
            }
        } else if (type === 'drawers') {
            sections[idx].components.push({ 
                type: 'drawer', 
                positionY: 0.1, 
                count: count, 
                properties: { height: 0.15 } 
            });
        } else if (type === 'hanging' || type === 'hanger' || type === 'section' || type === 'hanging section') {
            sections[idx].components.push({ 
                type: 'hanger-rod', 
                positionY: config.height - 0.2 
            });
        }
    }

    private initializePatterns(): QueryPattern[] {
        return [
            {
                patterns: [
                    /^(?:show\s+)?all command families$/i,
                    /^command center$/i,
                    /^command hub$/i,
                    /^what commands are available$/i,
                ],
                handler: async (match) => ({
                    query: match.input || '',
                    answer: `All command families are now surfaced in the AI Helper under All commands. Available families:\n- ${Object.keys(COMMAND_FAMILY_HELP).join('\n- ')}`
                })
            },
            {
                patterns: [
                    /^command help:\s*(.+)$/i,
                    /^show command family:\s*(.+)$/i,
                ],
                handler: async (match) => {
                    const raw = match[1]!.trim().toLowerCase();
                    const key = Object.keys(COMMAND_FAMILY_HELP).find((candidate) =>
                        candidate === raw || candidate.includes(raw) || raw.includes(candidate)
                    );
                    return {
                        query: match.input || '',
                        answer: key
                            ? COMMAND_FAMILY_HELP[key]!
                            : `I could not find that command family. Open All commands in the AI Helper to browse every available family.`
                    };
                }
            },
            {
                patterns: [
                    /summari[sz]e (?:the )?(?:building )?model/i,
                    /model summary/i,
                ],
                handler: async (match, rm) => {
                    const summary = rm.getModelSummary();
                    const populatedTypes = Object.entries(summary.byType)
                        .filter(([, count]) => count > 0)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ') || 'none';
                    const levelSummary = summary.levels
                        .map((level) => `${level.name ?? level.id} (${level.elevation}m)`)
                        .join(', ') || 'none';

                    return {
                        query: match.input || '',
                        answer: [
                            `Model summary: ${summary.totalElements} element${summary.totalElements === 1 ? '' : 's'} across ${summary.levels.length} level${summary.levels.length === 1 ? '' : 's'}.`,
                            `By type: ${populatedTypes}.`,
                            `Levels: ${levelSummary}.`,
                            `IFC readiness: ${summary.ifcReadiness.complete} complete, ${summary.ifcReadiness.incomplete} incomplete.`
                        ].join('\n')
                    };
                }
            },
            {
                patterns: [
                    /what design decisions have been made/i,
                    /(?:show|list) (?:the )?design decisions/i,
                    /decisions log/i,
                ],
                handler: async (match) => {
                    const store = decisionRecordStore;
                    const records = store?.getAll?.() ?? [];
                    if (!Array.isArray(records) || records.length === 0) {
                        return {
                            query: match.input || '',
                            answer: 'No design decisions have been recorded yet.'
                        };
                    }

                    const visibleRecords = records.slice(-10).reverse();
                    const lines = visibleRecords.map((record: any, index: number) => {
                        const type = record.decisionType ?? 'decision';
                        const target = record.elementId ? ` for ${record.elementId}` : '';
                        const text = record.decision || record.reason || record.rationale || 'No rationale text recorded.';
                        return `${index + 1}. ${type}${target}: ${text}`;
                    });

                    return {
                        query: match.input || '',
                        answer: `Recorded design decisions (${records.length} total):\n${lines.join('\n')}`
                    };
                }
            },
            {
                patterns: [
                    /how many elements are in (?:the )?model/i,
                    /count elements/i,
                    /element count/i,
                ],
                handler: async (match, rm) => {
                    const summary = rm.getModelSummary();
                    const counts = Object.entries(summary.byType)
                        .filter(([, count]) => count > 0)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ') || 'none';

                    return {
                        query: match.input || '',
                        answer: `The model contains ${summary.totalElements} element${summary.totalElements === 1 ? '' : 's'}. Breakdown: ${counts}.`
                    };
                }
            },
            {
                patterns: [
                    /what levels exist in (?:the )?model/i,
                    /(?:show|list) levels/i,
                    /level list/i,
                ],
                handler: async (match, rm) => {
                    const levels = rm.getLevels();
                    if (levels.length === 0) {
                        return {
                            query: match.input || '',
                            answer: 'No levels are currently defined in the model.'
                        };
                    }

                    const lines = levels.map((level) => {
                        const height = level.height !== undefined ? `, height ${level.height}m` : '';
                        return `- ${level.name ?? level.id} (${level.id}) at ${level.elevation}m${height}`;
                    });

                    return {
                        query: match.input || '',
                        answer: `Levels in the model:\n${lines.join('\n')}`
                    };
                }
            },
            {
                patterns: [
                    /add (\d+) sections? wardrobe with (shelves|drawers|hanger)/i,
                    /create wardrobe with (shelves|drawers|hanger)/i
                ],
                handler: async (match) => {
                    const sectionCount = parseInt(match[1]!) || 1;
                    const type = match[2]!.toLowerCase();
                    const selectedId = ws<{selectedElementId?: string}>('projectContext')?.selectedElementId;
                    
                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const config: any = {
                        width: sectionCount * 0.6,
                        height: 2.4,
                        depth: 0.6,
                        sections: []
                    };

                    for (let i = 0; i < sectionCount; i++) {
                        const section: any = {
                            width: 0.6,
                            doorType: 'hinged-left',
                            components: []
                        };

                        if (type === 'shelves') {
                            for (let j = 1; j <= 4; j++) {
                                section.components.push({ type: 'shelf', positionY: 0.48 * j });
                            }
                        } else if (type === 'drawers') {
                            section.components.push({ type: 'drawer', positionY: 0.1, count: 3, properties: { height: 0.15 } });
                        } else if (type === 'hanger') {
                            section.components.push({ type: 'hanger-rod', positionY: 2.2 });
                        }
                        config.sections.push(section);
                    }

                    const suggestion = {
                        intent: AIIntentType.MODIFY_WARDROBE,
                        targetElementId: selectedId,
                        payload: {
                            elementId: selectedId,
                            wardrobeConfig: config
                        },
                        rationale: `Update wardrobe with ${sectionCount} sections of ${type}.`,
                        confidence: 1.0
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', {  // TODO(TASK-11)
                            detail: { proposal: uniqueProposal } 
                        }));
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to configure the wardrobe with ${sectionCount} sections of ${type}.`
                    };
                }
            },
            {
                patterns: [
                    /modify (?:the )?(?:existing )?wardrobe/i,
                    /update wardrobe/i,
                    /reconfigure wardrobe/i
                ],
                handler: async (match, rm) => {
                    const input = match.input || '';
                    const selectedId = ws<{selectedElementId?: string}>('projectContext')?.selectedElementId;
                    
                    // Audit: Use the most direct access to furnitureStore to ensure up-to-date data
                    const furnitureStore = ws<any>('furnitureStore');
                    const el = furnitureStore?.get(selectedId);
                    
                    if (!selectedId || !el) {
                        const allFurniture = rm.getElementsByType('furniture');
                        const nearestWardrobe = allFurniture.find((f: any) => f.furnitureType === 'wardrobe');
                        
                        if (nearestWardrobe) {
                            console.log("QueryEngine: Falling back to nearest wardrobe", nearestWardrobe.id);
                            return await this.handleWardrobeModification(nearestWardrobe.id, input, nearestWardrobe);
                        }

                        console.log("QueryEngine Debug:", { selectedId, el: !!el, furnitureStore: !!furnitureStore });
                        return { query: input, answer: "Please select a wardrobe first." };
                    }
                    
                    if (el.furnitureType !== 'wardrobe' && el.furnitureType !== 'corner_wardrobe') {
                        return { query: input, answer: "Selected element is not a wardrobe." };
                    }

                    return await this.handleWardrobeModification(selectedId, input, el);
                }
            },
            {
                patterns: [
                    /add (lighting|mirror) to wardrobe/i
                ],
                handler: async (match) => {
                    const selectedId = ws<{selectedElementId?: string}>('projectContext')?.selectedElementId;
                    if (!selectedId) return { query: match.input || '', answer: "Please select a wardrobe first." };

                    const el = this.readModel.getElementById(selectedId);
                    if (!el || el.type !== 'furniture') return { query: match.input || '', answer: "Selected element is not a wardrobe." };

                    const featureMatch = match.input?.match(/add (lighting|mirror) to wardrobe/i);
                    const feature = featureMatch ? featureMatch[1]!.toLowerCase() : 'lighting';

                    const config = structuredClone(el.wardrobeConfig || {});
                    if (!config.sections) return { query: match.input || '', answer: "Wardrobe configuration not found." };

                    config.sections.forEach((section: any) => {
                        if (!section.components) section.components = [];
                        if (feature === 'lighting') {
                            section.components.push({ type: 'lighting-strip', positionY: config.height - 0.05 });
                        } else if (feature === 'mirror') {
                            section.components.push({ type: 'mirror-panel', positionY: config.height / 2 });
                        }
                    });

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: 'AI service not available.' };
                    const suggestion = {
                        intent: AIIntentType.MODIFY_WARDROBE,
                        targetElementId: selectedId,
                        payload: {
                            elementId: selectedId,
                            wardrobeConfig: config
                        },
                        rationale: `Add ${feature} to the selected wardrobe.`,
                        confidence: 1.0
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', {  // TODO(TASK-11)
                            detail: { proposal: uniqueProposal } 
                        }));
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to add ${feature} to your wardrobe.`
                    };
                }
            },
            {
                patterns: [
                    /make all slabs (#(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}))/i,
                    /make all slabs (white|black|red|green|blue|yellow|gray|grey|cyan|magenta)/i,
                    /set all slabs color to (#(?:[A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}))/i,
                    /set all slabs color to (white|black|red|green|blue|yellow|gray|grey|cyan|magenta)/i
                ],
                handler: async (match) => {
                    let color = match[1]!;
                    const colorMap: Record<string, string> = {
                        white: '#ffffff', black: '#000000', red: '#ff0000',
                        green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
                        gray: '#808080', grey: '#808080', cyan: '#00ffff', magenta: '#ff00ff'
                    };
                    if (colorMap[color.toLowerCase()]) color = colorMap[color.toLowerCase()]!;

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: AIIntentType.MODIFY_PROPERTY,
                        property: 'slab_color_all',
                        suggestedValue: color,
                        rationale: `Update all slabs to color ${color} as requested.`,
                        confidence: 1.0,
                        impact: `Changes the material color of all slabs to ${color}.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', { detail: { proposal: uniqueProposal } })); // TODO(TASK-11)
                    });
                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to make all slabs ${match[1]}. Review it in AI Actions.`
                    };
                }
            },
            {
                patterns: [
                    /make all slabs ([\d.]+) thickness/i,
                    /set all slabs thickness to ([\d.]+)m?/i
                ],
                handler: async (match) => {
                    const thickness = match[1];
                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: AIIntentType.MODIFY_PROPERTY,
                        property: 'slab_thickness_all',
                        suggestedValue: thickness,
                        rationale: `Update all slabs thickness to ${thickness}m.`,
                        confidence: 1.0,
                        impact: `Changes thickness of all slabs to ${thickness}m.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', { detail: { proposal: uniqueProposal } })); // TODO(TASK-11)
                    });
                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to set all slabs thickness to ${thickness}m.`
                    };
                }
            },
            {
                patterns: [
                    /add (\d+) levels?(?:\s+(?:at|with|@|height|floor.?height|floor.?to.?floor)?\s*([\d.]+)\s*m(?:eters?)?)?/i,
                    /create (\d+) levels?(?:\s+(?:at|with|@|height|floor.?height|floor.?to.?floor)?\s*([\d.]+)\s*m(?:eters?)?)?/i,
                    /generate (\d+) levels?(?:\s+(?:at|with|@|height|floor.?height|floor.?to.?floor)?\s*([\d.]+)\s*m(?:eters?)?)?/i,
                ],
                handler: async (match) => {
                    const count           = parseInt(match[1]!);
                    const heightPerLevel  = match[2] ? parseFloat(match[2]!) : 3.0;
                    const aiService       = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: 'AI Service not available.' };

                    const suggestion = {
                        intent: 'CREATE_MULTIPLE_LEVELS',
                        payload: { count, heightPerLevel },
                        rationale: `User requested to add ${count} levels at ${heightPerLevel}m floor-to-floor height.`,
                        confidence: 1.0,
                        impact: `Creates ${count} new levels above the current highest level (${heightPerLevel}m each).`,
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];

                    try {
                        const proposals = await aiService.getCommandProposals();
                        proposals.forEach((p: any) => {
                            commandProposalStore.add({ ...p, id: crypto.randomUUID() });
                        });
                        this.triggerActionsTab();
                        return {
                            query: match.input || '',
                            answer: `I've prepared a proposal to add ${count} levels at ${heightPerLevel}m floor-to-floor height. Please review it in the AI Actions panel.`,
                        };
                    } finally {
                        aiService.getIntentSuggestions = originalGetSuggestions;
                    }
                },
            },
            // ── Create grid system ──────────────────────────────────────────────────
            {
                patterns: [
                    /create\s+(?:a\s+)?grid\s+system[:\s]+(?:x\s+(?:spacing\s+)?([\d.]+)\s*m[^,]*)?,?\s*(?:y\s+(?:spacing\s+)?([\d.]+)\s*m)?[^,]*,?\s*(?:(\d+)\s*x)?[^,]*,?\s*(?:(\d+)\s*y)?/i,
                    /grid\s+system\s*:?\s*x\s*([\d.]+)\s*m\s*\/?\s*y\s*([\d.]+)\s*m/i,
                    /create\s+(\d+)\s*x[- ]grids?\s+(?:at\s+|spacing\s+)?([\d.]+)\s*m/i,
                    /create\s+(\d+)\s*y[- ]grids?\s+(?:at\s+|spacing\s+)?([\d.]+)\s*m/i,
                ],
                handler: async (match, _rm) => {
                    const input       = match.input || '';
                    const aiService   = this.aiService;
                    if (!aiService) return { query: input, answer: 'AI Service not available.' };

                    // Parse counts and spacings from the raw input string
                    const xCountM  = input.match(/(\d+)\s*x(?:\s*grids?)?/i);
                    const yCountM  = input.match(/(\d+)\s*y(?:\s*grids?)?/i);
                    const xSpacM   = input.match(/x\s+(?:spacing\s+|distance\s+|@\s+)?([\d.]+)\s*m/i)
                                  ?? input.match(/x[- ]grids?\s+(?:at\s+|spacing\s+)?([\d.]+)\s*m/i);
                    const ySpacM   = input.match(/y\s+(?:spacing\s+|distance\s+|@\s+)?([\d.]+)\s*m/i)
                                  ?? input.match(/y[- ]grids?\s+(?:at\s+|spacing\s+)?([\d.]+)\s*m/i);

                    const xCount   = xCountM  ? parseInt(xCountM[1]!)   : 5;
                    const yCount   = yCountM  ? parseInt(yCountM[1]!)   : 5;
                    const xSpacing = xSpacM   ? parseFloat(xSpacM[1]!)  : 8;
                    const ySpacing = ySpacM   ? parseFloat(ySpacM[1]!)  : 8;

                    const suggestion = {
                        intent: 'CREATE_GRID_SYSTEM',
                        payload: { xCount, yCount, xSpacing, ySpacing, xOrigin: 0, yOrigin: 0 },
                        rationale: `User requested a grid system: ${xCount} X-grids @ ${xSpacing}m, ${yCount} Y-grids @ ${ySpacing}m.`,
                        confidence: 1.0,
                        impact: `Creates ${xCount + yCount} structural grid lines.`,
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];

                    try {
                        const proposals = await aiService.getCommandProposals();
                        proposals.forEach((p: any) => {
                            commandProposalStore.add({ ...p, id: crypto.randomUUID() });
                        });
                        this.triggerActionsTab();
                        return {
                            query: input,
                            answer: `I've prepared a proposal to create a grid system with ${xCount} X-grids @ ${xSpacing}m spacing and ${yCount} Y-grids @ ${ySpacing}m spacing. Please review it in the AI Actions panel.`,
                        };
                    } finally {
                        aiService.getIntentSuggestions = originalGetSuggestions;
                    }
                },
            },
            // ── Delete all grids ────────────────────────────────────────────────────
            {
                patterns: [
                    /delete\s+all\s+grids?/i,
                    /remove\s+all\s+grids?/i,
                    /clear\s+all\s+grids?/i,
                    /delete\s+(?:structural\s+)?grids?/i,
                ],
                handler: async (match, _rm) => {
                    const input = match.input || '';
                    const cm = ws<any>('commandManager');
                    if (!cm) return { query: input, answer: 'Command Manager not available.' };

                    const gridStore = window.gridStore; // TODO(TASK-08)
                    if (!gridStore) return { query: input, answer: 'Grid store not available.' };

                    const grids = gridStore.getAll();
                    if (!grids || grids.length === 0) {
                        return { query: input, answer: 'There are no structural grids to delete.' };
                    }

                    let deleted = 0;
                    for (const g of grids) {
                        try { cm.execute(new RemoveGridCommand({ gridId: g.id })); deleted++; } catch { /* skip */ }
                    }

                    return { query: input, answer: `Deleted ${deleted} structural grid${deleted !== 1 ? 's' : ''}.` };
                },
            },
            {
                patterns: [
                    /create slabs? in all floors/i,
                    /generate slabs on all floors/i,
                    /create slabs? in all levels/i,
                    /create floors? in all levels/i,
                    /create floors? on all levels/i,
                    /add floors? (?:to|on|in) all levels/i,
                    /add slabs? (?:to|on|in) all levels/i,
                    /add slabs? (?:to|on|in) all floors/i,
                    /create floors? on all floors/i,
                    /create floor slabs on all levels/i,
                    /create floor slabs on all floors/i,
                    /generate floors? on all levels/i,
                ],
                handler: async (match, rm) => {
                    // Check for active selection first to ensure context-awareness
                    const selectedId = ws<{selectedElementId?: string}>('projectContext')?.selectedElementId;
                    let referenceSlab = null;

                    if (selectedId) {
                        const el = rm.getElementById(selectedId);
                        if (el && el.type === 'slab') {
                            referenceSlab = el;
                        }
                    }

                    // Fallback to Ground Floor slab if no selection
                    if (!referenceSlab) {
                        const slabs = rm.getElementsByType('slab');
                        referenceSlab = slabs.find((s: any) => s.levelId === 'L0' || s.levelId.toLowerCase().includes('ground'));
                    }

                    if (!referenceSlab) {
                        return { 
                            query: match.input || '', 
                            answer: "I couldn't find a reference slab. Please select one or create a slab on the ground level first." 
                        };
                    }

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: 'CREATE_SLABS_ON_ALL_FLOORS',
                        targetElementId: referenceSlab.id,
                        elementType: 'slab',
                        payload: { referenceSlabId: referenceSlab.id },
                        rationale: `Generating identical slabs on all floors based on the ${referenceSlab.id === selectedId ? 'selected' : 'L0'} reference slab.`,
                        confidence: 1.0,
                        impact: "Creates slabs on all existing floor levels matching the reference slab."
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    
                    try {
                        const proposals = await aiService.getCommandProposals();
                        
                        if (proposals.length === 0) {
                            return { query: match.input || '', answer: "I generated a suggestion but couldn't create a command proposal. Please check if the reference slab is valid." };
                        }

                        proposals.forEach((p: any) => {
                            const uniqueProposal = { ...p, id: crypto.randomUUID() };
                            commandProposalStore.add(uniqueProposal);
                            window.dispatchEvent(new CustomEvent('ai-proposal-added', { detail: { proposal: uniqueProposal } })); // TODO(TASK-11)
                        });

                        this.triggerActionsTab();

                        return {
                            query: match.input || '',
                            answer: `I've prepared a proposal to create slabs on all floors based on ${referenceSlab.id === selectedId ? 'your selection' : 'the ground floor slab'}. Check the AI Actions panel.`
                        };
                    } finally {
                        aiService.getIntentSuggestions = originalGetSuggestions;
                    }
                }
            },
            {
                patterns: [
                    /create wall between (?:wall )?Mark \((.+)\) and Mark \((.+)\)/i,
                    /add wall between mark \((.+)\) and mark \((.+)\)/i
                ],
                handler: async (match) => {
                    const mark1 = match[1]!.trim();
                    const mark2 = match[2]!.trim();
                    
                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: AIIntentType.CREATE_ELEMENT,
                        elementType: 'wall_between_marks',
                        payload: { mark1, mark2, height: 3.0, thickness: 0.2 },
                        rationale: `Create connecting wall between Mark ${mark1} and Mark ${mark2}`,
                        confidence: 1.0,
                        impact: `Creates a new wall segment from center of ${mark1} to center of ${mark2}`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to create a wall between Mark ${mark1} and Mark ${mark2}. Please review it in the AI Actions panel.`,
                    };
                }
            },
            {
                patterns: [
                    /create walls on all slabs/i,
                    /generate walls on all slabs/i,
                    /add walls to all slabs/i
                ],
                handler: async (match, rm) => {
                    const slabs = rm.getElementsByType('slab');
                    if (slabs.length === 0) return { query: match.input || '', answer: "No slabs found to create walls on." };

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: 'CREATE_WALLS_ON_ALL_SLABS',
                        rationale: "Bulk wall creation requested for all slabs in the model.",
                        confidence: 1.0,
                        impact: `Creates perimeter walls on all ${slabs.length} slabs in the model.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to create walls on all ${slabs.length} slabs. Please review it in the AI Actions panel.`
                    };
                }
            },
            {
                patterns: [
                    /create curtain walls? on all slabs/i,
                    /generate curtain walls? on all slabs/i,
                    /add curtain walls? to all slabs/i
                ],
                handler: async (match, rm) => {
                    const slabs = rm.getElementsByType('slab');
                    if (slabs.length === 0) return { query: match.input || '', answer: "No slabs found to create curtain walls on." };

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: AIIntentType.CREATE_CURTAIN_WALLS_ON_ALL_SLABS,
                        rationale: "Bulk curtain wall creation requested for all slabs in the model.",
                        confidence: 1.0,
                        impact: `Creates perimeter curtain walls on all ${slabs.length} slabs in the model.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: "I've prepared a proposal to create curtain walls on all slabs. Please review it in the AI Actions panel."
                    };
                }
            },
            {
                patterns: [
                    /set all curtain wall grid x to ([\d.]+)m?/i,
                    /set all curtain wall grid y to ([\d.]+)m?/i,
                    /set all curtain wall panel thickness to ([\d.]+)m?/i,
                    /set all curtain wall mullion thickness to ([\d.]+)m?/i,
                    /set all curtain wall base offset to ([\d.]+)m?/i,
                    /set all curtain wall height to ([\d.]+)m?/i,
                    /set all curtain wall colo[u]?r to (.+)/i,
                    /set all curtain wall material to (.+)/i
                ],
                handler: async (match) => {
                    const input = match[0].toLowerCase();
                    let property = '';
                    let val = match[1];

                    if (input.includes('grid x')) property = 'curtain_wall_grid_x_all';
                    else if (input.includes('grid y')) property = 'curtain_wall_grid_y_all';
                    else if (input.includes('panel thickness')) property = 'curtain_wall_panel_thickness_all';
                    else if (input.includes('mullion thickness')) property = 'curtain_wall_mullion_thickness_all';
                    else if (input.includes('base offset')) property = 'curtain_wall_base_offset_all';
                    else if (input.includes('height')) property = 'curtain_wall_height_all';
                    else if (input.includes('color') || input.includes('colour')) {
                        property = 'curtain_wall_color_all';
                        const colorMap: Record<string, string> = {
                            white: '#ffffff', black: '#333333', red: '#ff0000',
                            green: '#00ff00', blue: '#0000ff', yellow: '#ffff00',
                            gray: '#808080', grey: '#808080'
                        };
                        if (val!.toLowerCase() === 'white') val = '#ffffff';
                        else if (colorMap[val!.toLowerCase()]) val = colorMap[val!.toLowerCase()]!;
                    }
                    else if (input.includes('material')) property = 'curtain_wall_color_all'; // Simplified as color for now

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: AIIntentType.MODIFY_PROPERTY,
                        property: property,
                        suggestedValue: val,
                        rationale: `Update curtain wall ${property.replace('curtain_wall_', '').replace('_all', '').replace(/_/g, ' ')} globally.`,
                        confidence: 1.0,
                        impact: `Changes ${property.replace('curtain_wall_', '').replace('_all', '').replace(/_/g, ' ')} for all curtain walls.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', { detail: { proposal: uniqueProposal } })); // TODO(TASK-11)
                    });
                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to update curtain wall ${property.replace('curtain_wall_', '').replace('_all', '').replace(/_/g, ' ')} to ${val}.`
                    };
                }
            },
            {
                patterns: [
                    /create walls on (?:the )?perimeter of slab/i,
                    /add walls around slab/i,
                    /create wall by slab/i,
                    /create walls by ground floor slab/i
                ],
                handler: async (match, rm) => {
                    const slabs = rm.getElementsByType('slab');
                    if (slabs.length === 0) return { query: match.input || '', answer: "No slabs found to create walls around." };

                    const groundSlab = slabs.find((s: any) => s.levelId === 'L0' || s.levelId?.toLowerCase().includes('ground'));
                    const targetSlabs = match[0].toLowerCase().includes('ground floor') && groundSlab ? [groundSlab] : slabs;

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestions = targetSlabs.map((s: any) => ({
                        intent: AIIntentType.CREATE_WALLS_ON_SLAB,
                        targetElementId: s.id,
                        elementType: 'wall',
                        rationale: `Automatic perimeter wall creation requested for slab [${s.id}]`,
                        confidence: 1.0,
                        impact: `Creates walls on the perimeter of slab [${s.id}]`
                    }));

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => suggestions;
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared ${proposals.length} proposal(s) to create perimeter walls around the detected slab(s). Please review them in the AI Actions panel.`,
                    };
                }
            },
            {
                patterns: [
                    /create curtain walls? on slab/i,
                    /add curtain walls? by slab/i,
                    /generate curtain walls? for slab/i,
                    /create curtain walls? by ground floor slab/i
                ],
                handler: async (match, rm) => {
                    const slabs = rm.getElementsByType('slab');
                    if (slabs.length === 0) return { query: match.input || '', answer: "No slabs found to create curtain walls around." };

                    const groundSlab = slabs.find((s: any) => s.levelId === 'L0' || s.levelId?.toLowerCase().includes('ground'));
                    const targetSlabs = match[0].toLowerCase().includes('ground floor') && groundSlab ? [groundSlab] : slabs;

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestions = targetSlabs.map((s: any) => ({
                        intent: AIIntentType.CREATE_CURTAIN_WALLS_ON_SLAB,
                        targetElementId: s.id,
                        elementType: 'curtain_wall',
                        rationale: `Automatic perimeter curtain wall creation requested for slab [${s.id}]`,
                        confidence: 1.0,
                        impact: `Creates curtain walls on the perimeter of slab [${s.id}]`
                    }));

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => suggestions;
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared ${proposals.length} proposal(s) to create perimeter curtain walls around the detected slab(s). Please review them in the AI Actions panel.`,
                    };
                }
            },
            {
                patterns: [
                    /(?:Modify|Update) the existing wardrobe/i,
                    /Reconfigure internal layout/i
                ],
                handler: async (match, rm) => {
                    const selectedId = ws<{selectedElementId?: string}>('projectContext')?.selectedElementId;
                    let targetWardrobe = null;

                    if (selectedId) {
                        const el = rm.getElementById(selectedId);
                        if (el && (el.type === 'furniture' || (el as any).furnitureType === 'wardrobe')) {
                            targetWardrobe = el;
                        }
                    }

                    if (!targetWardrobe) {
                        const wardrobes = rm.getElementsByType('furniture').filter((f: any) => f.furnitureType === 'wardrobe');
                        targetWardrobe = wardrobes.find((w: any) => w.levelId === 'L0') || wardrobes[0];
                    }

                    if (!targetWardrobe) {
                        return { query: match.input || '', answer: "I couldn't find an existing wardrobe to modify. Please select one or create one first." };
                    }

                    const input = match.input || '';
                    const widthMatch = input.match(/width to (\d+)(?:mm|m)?/i);
                    const heightMatch = input.match(/height to (\d+)(?:mm|m)?/i);
                    const depthMatch = input.match(/depth to (\d+)(?:mm|m)?/i);

                    const sectionsMatch = input.match(/(\d+) sections/i);
                    const sectionCount = sectionsMatch ? parseInt(sectionsMatch[1]!) : (targetWardrobe.wardrobeConfig?.sections?.length || 1);

                    const newWidth = (widthMatch ? parseInt(widthMatch[1]!) / 1000 : targetWardrobe.width) || targetWardrobe.width || 1;
                    const newHeight = (heightMatch ? parseInt(heightMatch[1]!) / 1000 : targetWardrobe.height) || targetWardrobe.height || 2;
                    const newDepth = (depthMatch ? parseInt(depthMatch[1]!) / 1000 : targetWardrobe.length) || targetWardrobe.length || 0.6;

                    const sectionWidth = newWidth / sectionCount;
                    const sections: any[] = [];

                    // Improved module extraction
                    const moduleDescRegex = /(left|center|right|module \d+):?\s*([^.:\n,]+)/gi;
                    const foundModules: Record<string, string> = {};
                    let m;
                    while ((m = moduleDescRegex.exec(input)) !== null) {
                        foundModules[m[1]!.toLowerCase()] = m[2]!.toLowerCase();
                    }

                    for (let i = 0; i < sectionCount; i++) {
                        let interiorType = 'shelves';
                        let shelvesCount = 4;
                        let drawersCount = 0;
                        let doorType = 'double-hinged';

                        let moduleKey = '';
                        if (i === 0) moduleKey = 'left';
                        else if (i === sectionCount - 1 && sectionCount > 1) moduleKey = 'right';
                        else if (sectionCount > 2) moduleKey = 'center';

                        const desc = foundModules[moduleKey] || foundModules[`module ${i+1}`] || '';
                        
                        if (desc) {
                            if (desc.includes('shelf') || desc.includes('shelves')) {
                                interiorType = 'shelves';
                                const sMatch = desc.match(/(\d+) shelves/);
                                if (sMatch) shelvesCount = parseInt(sMatch[1]!);
                            } else if (desc.includes('drawer')) {
                                interiorType = 'drawers';
                                const dMatch = desc.match(/(\d+) drawers/);
                                if (dMatch) drawersCount = parseInt(dMatch[1]!);
                            } else if (desc.includes('hanging') || desc.includes('hanger')) {
                                interiorType = 'hanger';
                            } else if (desc.includes('mixed')) {
                                interiorType = 'mixed';
                            }

                            if (desc.includes('double')) doorType = 'double-hinged';
                            if (desc.includes('glass')) doorType = 'glass';
                            if (desc.includes('mirror')) doorType = 'mirror';
                            if (desc.includes('sliding')) doorType = 'sliding';
                        }

                        // Global overrides
                        if (input.toLowerCase().includes('glass') && !desc.includes('solid')) doorType = 'glass';
                        if (input.toLowerCase().includes('mirror') && !desc.includes('solid')) doorType = 'mirror';

                        sections.push({
                            id: `section-${i}`,
                            width: sectionWidth,
                            interiorType,
                            shelvesCount,
                            drawersCount,
                            doorType
                        });
                    }

                    const aiService = this.aiService;
                    if (!aiService) return { query: input, answer: 'AI service not available.' };
                    const suggestion = {
                        intent: 'MODIFY_WARDROBE',
                        targetElementId: targetWardrobe.id,
                        payload: {
                            id: targetWardrobe.id,
                            furnitureId: targetWardrobe.id,
                            width: newWidth,
                            height: newHeight,
                            length: newDepth,
                            wardrobeConfig: {
                                width: newWidth,
                                height: newHeight,
                                depth: newDepth,
                                sections
                            }
                        },
                        rationale: `Updating wardrobe based on prompt: ${input}`,
                        confidence: 1.0,
                        impact: "Modifies wardrobe dimensions and internal layout."
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                        window.dispatchEvent(new CustomEvent('ai-proposal-added', { detail: { proposal: uniqueProposal } })); // TODO(TASK-11)
                    });

                    this.triggerActionsTab();

                    return {
                        query: input,
                        answer: `I've prepared a proposal to reconfigure the wardrobe with ${sectionCount} sections. Check the AI Actions panel.`
                    };
                }
            },
            {
                patterns: [
                    /create walls on all slabs/i,
                    /generate walls on all slabs/i,
                    /add walls to all slabs/i
                ],
                handler: async (match, rm) => {
                    const slabs = rm.getElementsByType('slab');
                    if (slabs.length === 0) return { query: match.input || '', answer: "No slabs found to create walls on." };

                    const aiService = this.aiService;
                    if (!aiService) return { query: match.input || '', answer: "AI Service not available." };

                    const suggestion = {
                        intent: 'CREATE_WALLS_ON_ALL_SLABS',
                        rationale: "Bulk wall creation requested for all slabs in the model.",
                        confidence: 1.0,
                        impact: `Creates perimeter walls on all ${slabs.length} slabs in the model.`
                    };

                    const originalGetSuggestions = aiService.getIntentSuggestions;
                    aiService.getIntentSuggestions = () => [suggestion];
                    const proposals = await aiService.getCommandProposals();
                    aiService.getIntentSuggestions = originalGetSuggestions;

                    proposals.forEach((p: any) => {
                        const uniqueProposal = { ...p, id: crypto.randomUUID() };
                        commandProposalStore.add(uniqueProposal);
                    });

                    this.triggerActionsTab();

                    return {
                        query: match.input || '',
                        answer: `I've prepared a proposal to create walls on all ${slabs.length} slabs. Please review it in the AI Actions panel.`
                    };
                }
            },

            // ── VISIBILITY: HIDE / ISOLATE / HIGHLIGHT  ───────────────────────

            // Hide all elements in a level  → "hide all elements in level 1"
            {
                patterns: [
                    /(?:hide|turn off) (?:all )?elements? (?:in|on|at|of) level[s]? (.+)/i,
                    /(?:hide|turn off) level[s]? (.+)/i,
                ],
                handler: async (match) => {
                    const levelName = match[1]!.trim();
                    const levels: any[] = window.bimManager?.getLevels?.()
                        ?? window.wallStore?.getLevels?.() // TODO(TASK-08)
                        ?? window.projectContext?.levels ?? [];
                    const level = levels.find((l: any) =>
                        l.name?.toLowerCase() === levelName.toLowerCase() ||
                        l.id?.toLowerCase()   === levelName.toLowerCase() ||
                        l.id?.toLowerCase().replace('l', '') === levelName.toLowerCase(),
                    );
                    if (!level) return { query: match.input || '', answer: `Level "${levelName}" not found.` };
                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action: 'hide', target: 'level', value: String(level.id) }
                    }));
                    return { query: match.input || '', answer: `Hiding all elements in ${level.name ?? levelName}.` };
                }
            },

            // Isolate all elements in a level  → "isolate level 2"
            {
                patterns: [
                    /isolate (?:all )?elements? (?:in|on|at|of) level[s]? (.+)/i,
                    /isolate level[s]? (.+)/i,
                ],
                handler: async (match) => {
                    const levelName = match[1]!.trim();
                    const levels: any[] = window.bimManager?.getLevels?.()
                        ?? window.wallStore?.getLevels?.() // TODO(TASK-08)
                        ?? window.projectContext?.levels ?? [];
                    const level = levels.find((l: any) =>
                        l.name?.toLowerCase() === levelName.toLowerCase() ||
                        l.id?.toLowerCase()   === levelName.toLowerCase() ||
                        l.id?.toLowerCase().replace('l', '') === levelName.toLowerCase(),
                    );
                    if (!level) return { query: match.input || '', answer: `Level "${levelName}" not found.` };
                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action: 'isolate', target: 'level', value: String(level.id) }
                    }));
                    return { query: match.input || '', answer: `Isolating all elements in ${level.name ?? levelName}.` };
                }
            },

            // Highlight all elements in a level  → "highlight elements in level 3"
            {
                patterns: [
                    /highlight (?:all )?elements? (?:in|on|at|of) level[s]? (.+)/i,
                    /select (?:all )?elements? (?:in|on|at|of) level[s]? (.+)/i,
                ],
                handler: async (match) => {
                    const levelName = match[1]!.trim();
                    const levels: any[] = window.bimManager?.getLevels?.()
                        ?? window.wallStore?.getLevels?.() // TODO(TASK-08)
                        ?? window.projectContext?.levels ?? [];
                    const level = levels.find((l: any) =>
                        l.name?.toLowerCase() === levelName.toLowerCase() ||
                        l.id?.toLowerCase()   === levelName.toLowerCase() ||
                        l.id?.toLowerCase().replace('l', '') === levelName.toLowerCase(),
                    );
                    if (!level) return { query: match.input || '', answer: `Level "${levelName}" not found.` };
                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action: 'highlight', target: 'level', value: String(level.id) }
                    }));
                    return { query: match.input || '', answer: `Highlighting all elements in ${level.name ?? levelName}.` };
                }
            },

            // Hide/Isolate/Highlight a category  → "hide all walls", "isolate all doors", "highlight slabs"
            {
                patterns: [
                    /(?:hide|turn off) (?:all )?(?:the )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?)/i,
                    /isolate (?:all )?(?:the )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?)/i,
                    /highlight (?:all )?(?:the )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?)/i,
                    /select (?:all )?(?:the )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?)/i,
                ],
                handler: async (match) => {
                    const raw    = match[1]!.toLowerCase().replace(/\s+/g, ' ').trim();
                    const action = match[0].toLowerCase().startsWith('hide') || match[0].toLowerCase().startsWith('turn off')
                        ? 'hide'
                        : match[0].toLowerCase().startsWith('isolate') ? 'isolate' : 'highlight';

                    // Normalise to singular title case used in the panel
                    const catMap: Record<string, string> = {
                        wall: 'Walls', walls: 'Walls',
                        'curtain wall': 'Curtain Walls', 'curtain walls': 'Curtain Walls',
                        slab: 'Slabs', slabs: 'Slabs',
                        floor: 'Floors', floors: 'Floors',
                        ceiling: 'Ceilings', ceilings: 'Ceilings',
                        roof: 'Roofs', roofs: 'Roofs',
                        door: 'Doors', doors: 'Doors',
                        window: 'Windows', windows: 'Windows',
                        opening: 'Openings', openings: 'Openings',
                        furniture: 'Furniture',
                        lighting: 'Lighting Fixtures', 'lighting fixture': 'Lighting Fixtures', 'lighting fixtures': 'Lighting Fixtures',
                        stair: 'Stairs', stairs: 'Stairs',
                        handrail: 'Handrails', handrails: 'Handrails',
                        column: 'Columns', columns: 'Columns',
                        beam: 'Beams', beams: 'Beams',
                        plumbing: 'Plumbing',
                        room: 'Rooms', rooms: 'Rooms',
                    };
                    const catLabel = catMap[raw] ?? 'Walls';

                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action, target: 'category', value: catLabel }
                    }));

                    const verb = action === 'hide' ? 'Hiding' : action === 'isolate' ? 'Isolating' : 'Highlighting';
                    return { query: match.input || '', answer: `${verb} all ${catLabel.toLowerCase()}.` };
                }
            },

            // Isolate a category type  → "isolate doors type single", "isolate walls type exterior"
            {
                patterns: [
                    /isolate (?:all )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?) (?:of )?type (.+)/i,
                    /hide (?:all )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?) (?:of )?type (.+)/i,
                    /highlight (?:all )?(walls?|curtain\s*walls?|slabs?|floors?|ceilings?|roofs?|doors?|windows?|openings?|furniture|lighting(?:\s*fixtures?)?|stairs?|handrails?|columns?|beams?|plumbing|rooms?) (?:of )?type (.+)/i,
                ],
                handler: async (match) => {
                    const raw     = match[1]!.toLowerCase().replace(/\s+/g, ' ').trim();
                    const subType = match[2]!.trim();
                    const action  = match[0].toLowerCase().startsWith('hide') ? 'hide'
                        : match[0].toLowerCase().startsWith('isolate') ? 'isolate' : 'highlight';

                    const catMap: Record<string, string> = {
                        wall: 'Walls', walls: 'Walls',
                        'curtain wall': 'Curtain Walls', 'curtain walls': 'Curtain Walls',
                        slab: 'Slabs', slabs: 'Slabs',
                        floor: 'Floors', floors: 'Floors',
                        ceiling: 'Ceilings', ceilings: 'Ceilings',
                        roof: 'Roofs', roofs: 'Roofs',
                        door: 'Doors', doors: 'Doors',
                        window: 'Windows', windows: 'Windows',
                        opening: 'Openings', openings: 'Openings',
                        furniture: 'Furniture',
                        lighting: 'Lighting Fixtures', 'lighting fixture': 'Lighting Fixtures', 'lighting fixtures': 'Lighting Fixtures',
                        stair: 'Stairs', stairs: 'Stairs',
                        handrail: 'Handrails', handrails: 'Handrails',
                        column: 'Columns', columns: 'Columns',
                        beam: 'Beams', beams: 'Beams',
                        plumbing: 'Plumbing',
                        room: 'Rooms', rooms: 'Rooms',
                    };
                    const catLabel = catMap[raw] ?? 'Walls';

                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action, target: 'type-in-category', value: catLabel, subType }
                    }));

                    const verb = action === 'hide' ? 'Hiding' : action === 'isolate' ? 'Isolating' : 'Highlighting';
                    return { query: match.input || '', answer: `${verb} all ${catLabel.toLowerCase()} of type "${subType}".` };
                }
            },

            // Height filter  → "isolate doors higher than 2 meters", "isolate walls taller than 3m"
            {
                patterns: [
                    /isolate (?:all )?(walls?|doors?|windows?|columns?|beams?|stairs?) (?:higher|taller|more|over|above) than ([\d.]+)\s*m(?:eters?)?/i,
                    /hide (?:all )?(walls?|doors?|windows?|columns?|beams?|stairs?) (?:higher|taller|more|over|above) than ([\d.]+)\s*m(?:eters?)?/i,
                    /highlight (?:all )?(walls?|doors?|windows?|columns?|beams?|stairs?) (?:higher|taller|more|over|above) than ([\d.]+)\s*m(?:eters?)?/i,
                ],
                handler: async (match) => {
                    const raw       = match[1]!.toLowerCase();
                    const minHeight = parseFloat(match[2]!);
                    const action    = match[0].toLowerCase().startsWith('hide') ? 'hide'
                        : match[0].toLowerCase().startsWith('isolate') ? 'isolate' : 'highlight';

                    const catMap: Record<string, string> = {
                        wall: 'Walls', walls: 'Walls',
                        door: 'Doors', doors: 'Doors',
                        window: 'Windows', windows: 'Windows',
                        column: 'Columns', columns: 'Columns',
                        beam: 'Beams', beams: 'Beams',
                        stair: 'Stairs', stairs: 'Stairs',
                    };
                    const catLabel = catMap[raw] ?? 'Doors';

                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action, target: 'category', value: catLabel, minHeight }
                    }));

                    const verb = action === 'hide' ? 'Hiding' : action === 'isolate' ? 'Isolating' : 'Highlighting';
                    return { query: match.input || '', answer: `${verb} all ${catLabel.toLowerCase()} taller than ${minHeight}m.` };
                }
            },

            // Restore all (cancel isolation)
            {
                patterns: [
                    /(?:restore|show|unhide) all/i,
                    /cancel isolat(?:e|ion)/i,
                    /reset (?:visibility|view)/i,
                    /show everything/i,
                ],
                handler: async (match) => {
                    const scene = this._sceneAccessor?.() ?? (window as any).selectionManager?.world?.scene?.three;
                    if (scene) {
                        scene.traverse((obj: any) => {
                            if (obj.userData?.id && obj.userData?.role !== 'edges') obj.visible = true;
                        });
                    }
                    window.dispatchEvent(new CustomEvent('pryzm-visibility-command', { // TODO(TASK-11)
                        detail: { action: 'restore', target: 'all', value: '' }
                    }));
                    return { query: match.input || '', answer: 'All elements restored to visible.' };
                }
            },
        ];
    }

    private triggerActionsTab() {
        // 1. Ensure the AI panel itself is visible
        const aiPanel = document.getElementById('ai-panel-container');
        if (aiPanel && aiPanel.style.display === 'none') {
            // Find the robot toggle button in the toolbar
            const aiToggleBtn = document.querySelector('bim-button[icon="material-symbols:robot-2"]') as HTMLElement;
            if (aiToggleBtn) {
                aiToggleBtn.click();
            } else {
                aiPanel.style.display = 'flex';
            }
        }

        // 2. Switch to the actions tab inside the panel
        const ribbon = document.querySelector('ribbon-component');
        if (ribbon) {
            ribbon.dispatchEvent(new CustomEvent('switch-tab', { detail: { tab: 'actions' } })); // TODO(TASK-11)
        }
        
        // Fallback: Click the tab button directly if ribbon event doesn't work
        const aiActionsBtn = document.querySelector('.ai-tab-btn:nth-child(4)') as HTMLElement;
        if (aiActionsBtn) {
            aiActionsBtn.click();
        }
    }

    getSupportedQueries(): string[] {
        return [
            // Visibility — Levels
            "hide all elements in level 1",
            "isolate level 2",
            "highlight elements in level 3",
            // Visibility — Categories
            "hide all walls",
            "isolate all doors",
            "highlight all slabs",
            "hide all floors",
            "isolate all windows",
            // Visibility — Types
            "isolate doors type single",
            "isolate walls type exterior",
            "hide furniture type wardrobe",
            // Visibility — Height filter
            "isolate doors higher than 2 meters",
            "highlight walls taller than 3m",
            // Visibility — Restore
            "restore all",
            "show everything",
            "cancel isolation",
            // Read-only model queries
            "Summarise the building model",
            "What design decisions have been made?",
            "How many elements are in the model?",
            "What levels exist in the model?",
            "command center",
            "show all command families",
            "command help: views and templates",
            "command help: sheets and schedules",
            "command help: vg and visibility rules",
            "command help: rooms and layouts",
            // Model creation
            "make all slabs white",
            "set all slabs thickness to 0.2m",
            "add 3 levels",
            "create grid system",
            "delete all grids",
            "create slabs in all floors",
            "create walls on all slabs",
            "create curtain walls on all slabs",
            "Modify the existing wardrobe...",
            "Reconfigure internal layout..."
        ];
    }
}
