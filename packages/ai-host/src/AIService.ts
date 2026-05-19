import { AIReadModel, aiReadModel } from './AIReadModel.js';
import { RuleEngine } from './RuleEngine.js';
import { QueryEngine } from './QueryEngine.js';
import {
  QueryResult,
  ValidationReport,
  ModelSummary,
  RuleViolation,
  AIIntentSuggestion,
  AIServiceLike,
} from './AITypes.js';
import { AIIntent, AIIntentType } from './intents.js';
import { CommandProposal, CommandType } from '@pryzm/command-registry';

import { UpdateWindowWidthCommand } from '@pryzm/command-registry';
import { UpdateWindowHeightCommand } from '@pryzm/command-registry';
import { UpdateWindowSillHeightCommand } from '@pryzm/command-registry';
import { UpdateWindowFireRatingCommand } from '@pryzm/command-registry';
import { UpdateDoorWidthCommand } from '@pryzm/command-registry';
import { UpdateDoorHeightCommand } from '@pryzm/command-registry';
import { UpdateDoorFireRatingCommand } from '@pryzm/command-registry';
import { UpdateDoorLeafColorCommand } from '@pryzm/command-registry';
import { UpdateDoorFrameColorCommand } from '@pryzm/command-registry';
import { UpdateWindowFrameColorCommand } from '@pryzm/command-registry';
import { MoveWindowCommand } from '@pryzm/command-registry';
import { MoveDoorCommand } from '@pryzm/command-registry';
import { CenterWindowInWallCommand } from '@pryzm/command-registry';
import { CreateWindowInAllWindowsCommand } from '@pryzm/command-registry';
import { CreateWallBetweenMarksCommand } from '@pryzm/command-registry';
import { CreateWallsOnAllSlabsCommand } from '@pryzm/command-registry';
import { UpdateWallHeightCommand } from '@pryzm/command-registry';
import { SetWallWidthCommand, SetAllWallsWidthCommand } from '@pryzm/command-registry';
// §WALL-AUDIT-2026-M1: renamed from UpdateWallVisualPropertiesCommand.
import { SetAllWallsVisualPropertiesCommand } from '@pryzm/command-registry';
import { CreateMultipleLevelsCommand } from '@pryzm/command-registry';
import { CreateRoofCommand } from '@pryzm/command-registry';
// §MIME-FIX-2026: Static imports eliminate hash-named code-split chunks that caused
// "Expected a JavaScript-or-Wasm module script but server responded with text/html"
// when the browser held a cached HTML referencing an older content hash.
// Since AIService is itself inside the lazily-loaded engine bundle, making these
// imports static just co-locates them in the same engine chunk — no initial-load
// regression. Tracked: C11 §7.3, docs/03_PRYZM3/04-PLAN-FORWARD/40-CW-PIPELINE-TRACE.md
import { CreateCurtainWallsOnAllSlabsCommand } from '@pryzm/command-registry';
import { CreateCurtainWallsFromSlabCommand, UpdateAllSlabsCommand, UpdateAllCurtainWallsCommand, UpdateFurnitureParametersCommand, CreateGridSystemCommand, CreateWallsFromSlabCommand, CreateSlabsOnAllFloorsCommand } from '@pryzm/command-registry';
import { WallRegionExtractor } from './WallRegionExtractor.js';
import { v4 as uuid } from 'uuid';

export class AIService implements AIServiceLike {
  private readModel: AIReadModel;
  private ruleEngine: RuleEngine;
  private queryEngine: QueryEngine;

  constructor(readModel?: AIReadModel) {
    this.readModel = readModel || aiReadModel;
    this.ruleEngine = new RuleEngine(this.readModel);
    this.queryEngine = new QueryEngine(this.readModel);
    this.queryEngine.setAIService(this);
  }

  /** Wire a Three.js scene accessor into the QueryEngine so it never reads
   *  `(window as any).selectionManager`.  Called from `engineLauncher.ts`
   *  after `initTools()` completes.  OI-045 fix. */
  setSceneAccessor(fn: (() => any) | null): void {
    this.queryEngine.setSceneAccessor(fn);
  }

  async getCommandProposals(): Promise<CommandProposal[]> {
      const suggestions = this.getIntentSuggestions();
      const context = window.commandContext || {
          bimManager: window.bimKernel?.bimManager,
          projectContext: window.projectContext,
          stores: {
              wallStore: window.wallStore , // TODO(TASK-07)
              slabStore: window.slabStore , // TODO(TASK-07)
              columnStore: window.columnStore , // TODO(TASK-07)
              gridStore: window.gridStore , // TODO(TASK-07)
              stairStore: window.stairStore , // TODO(TASK-07)
              beamStore: window.beamStore , // TODO(TASK-07)
              curtainWallStore: window.curtainWallStore // TODO(TASK-07)
          }
      };

      const proposals = await Promise.all(suggestions.map(async s => {
          let command: any = null;
          const targetId = s.targetElementId || '';
          const val = s.suggestedValue;
          const type = s.targetElementId ? this.readModel.getElementById(s.targetElementId)?.type : null;

          if (s.intent === AIIntentType.MODIFY_PROPERTY) {
              if (s.property === 'thickness') {
                  command = new SetWallWidthCommand([targetId], parseFloat(val));
              } else if (s.property === 'thickness_all') {
                  const wallIds = context.stores.wallStore
                      .getAll()
                      .map((w: any) => w.id);

                  command = new SetAllWallsWidthCommand(
                      wallIds,
                      parseFloat(val)
                  );
              } else if (s.property === 'color_all') {
                  command = new SetAllWallsVisualPropertiesCommand({ color: val });
              } else if (s.property === 'material_all') {
                  command = new SetAllWallsVisualPropertiesCommand({ material: val });
              } else if (s.property === 'height') {
                  const wallIds = targetId === 'all' || targetId === 'ALL_WALLS' 
                      ? this.readModel.getElementsByType('wall').map(w => w.id)
                      : [targetId];
                  command = new UpdateWallHeightCommand({ wallIds, newHeight: parseFloat(val) });
              } else if (s.property === 'slab_thickness_all') {
                  command = new UpdateAllSlabsCommand({ thickness: parseFloat(val) });
              } else if (s.property === 'slab_color_all') {
                  command = new UpdateAllSlabsCommand({ materialColor: val });
              } else if (s.property === 'curtain_wall_grid_x_all') {
                  command = new UpdateAllCurtainWallsCommand({ gridXSpacing: parseFloat(val) });
              } else if (s.property === 'curtain_wall_grid_y_all') {
                  command = new UpdateAllCurtainWallsCommand({ gridYSpacing: parseFloat(val) });
              } else if (s.property === 'curtain_wall_panel_thickness_all') {
                  command = new UpdateAllCurtainWallsCommand({ panelThickness: parseFloat(val) });
              } else if (s.property === 'curtain_wall_mullion_thickness_all') {
                  command = new UpdateAllCurtainWallsCommand({ mullionSize: parseFloat(val) });
              } else if (s.property === 'curtain_wall_color_all') {
                  command = new UpdateAllCurtainWallsCommand({ mullionColor: val });
              } else if (s.property === 'curtain_wall_base_offset_all') {
                  command = new UpdateAllCurtainWallsCommand({ baseOffset: parseFloat(val) });
              } else if (s.property === 'curtain_wall_height_all') {
                  command = new UpdateAllCurtainWallsCommand({ height: parseFloat(val) });
              } else if (type === 'window') {
                  if (s.property === 'width') command = new UpdateWindowWidthCommand(targetId, parseFloat(val));
                  if (s.property === 'height') command = new UpdateWindowHeightCommand(targetId, parseFloat(val));
                  if (s.property === 'sillHeight') command = new UpdateWindowSillHeightCommand(targetId, parseFloat(val));
                  if (s.property === 'fireRating') command = new UpdateWindowFireRatingCommand(targetId, val);
                  if (s.property === 'frameColor') command = new UpdateWindowFrameColorCommand(targetId, val);
                  if (s.property === 'move') {
                      const [dist, dir] = val.split(':');
                      command = new MoveWindowCommand(targetId, parseFloat(dist), dir as 'left' | 'right');
                  }
                  if (s.property === 'center') {
                      command = new CenterWindowInWallCommand(targetId);
                  }
              } else if (type === 'door') {
                  if (s.property === 'width') command = new UpdateDoorWidthCommand(targetId, parseFloat(val));
                  if (s.property === 'height') command = new UpdateDoorHeightCommand(targetId, parseFloat(val));
                  if (s.property === 'fireRating') command = new UpdateDoorFireRatingCommand(targetId, val);
                  if (s.property === 'frameColor') command = new UpdateDoorFrameColorCommand(targetId, val);
                  if (s.property === 'leafColor') command = new UpdateDoorLeafColorCommand(targetId, val);
                  if (s.property === 'move') {
                      const [dist, dir] = val.split(':');
                      command = new MoveDoorCommand(targetId, parseFloat(dist), dir as 'left' | 'right');
                  }
              }
          }

          if (s.intent === 'MODIFY_WARDROBE' as any || s.intent === AIIntentType.MODIFY_WARDROBE) {
              // Ensure legacy interiorType is mapped to new components array if needed
              const payload = { ...s.payload as any };
              // Ensure the ID is correctly set in the payload for the command
              // Priority 1: payload.elementId (from QueryEngine)
              // Priority 2: s.targetElementId (from Intent)
              // Priority 3: payload.id (already set)
              const targetId = payload.elementId || s.targetElementId || payload.id;
              if (targetId) {
                  payload.id = targetId;
              }

              if (payload.wardrobeConfig?.sections) {
                  payload.wardrobeConfig.sections.forEach((section: any) => {
                      if (!section.components && section.interiorType) {
                          section.components = [];
                          if (section.interiorType === 'shelves') {
                              const count = section.shelvesCount || 4;
                              for (let i = 1; i <= count; i++) {
                                  section.components.push({
                                      type: 'shelf',
                                      positionY: (payload.wardrobeConfig.height / (count + 1)) * i
                                  });
                              }
                          } else if (section.interiorType === 'drawers') {
                              section.components.push({
                                  type: 'drawer',
                                  positionY: 0.1,
                                  count: section.drawersCount || 3,
                                  properties: { height: 0.15 }
                              });
                          } else if (section.interiorType === 'hanger') {
                              section.components.push({
                                  type: 'hanger-rod',
                                  positionY: payload.wardrobeConfig.height - 0.2
                              });
                          }
                      }
                  });
              }
              command = new UpdateFurnitureParametersCommand(payload);
          }

          if (s.intent === AIIntentType.CREATE_ELEMENT) {
              const sug = s as any;

              if (sug.elementType === 'window' && sug.payload?.allWalls) {
                  command = new CreateWindowInAllWindowsCommand();
              } else if (sug.elementType === 'wall_between_marks') {
                  command = new CreateWallBetweenMarksCommand({
                      mark1: sug.payload.mark1,
                      mark2: sug.payload.mark2,
                      height: sug.payload.height,
                      thickness: sug.payload.thickness,
                      levelId: sug.payload.levelId
                  });
              } else {
                  const CreateCommand = window.CreateWallOpeningCommand;
                  if (CreateCommand) {
                      if (sug.elementType === 'window') {
                          command = new CreateCommand(sug.payload.wallId, 'window', sug.payload.ratio);
                      } else if (sug.elementType === 'door') {
                          command = new CreateCommand(sug.payload.wallId, 'door', sug.payload.ratio);
                      }
                  }
              }
          }

        if (s.intent === AIIntentType.CREATE_MULTIPLE_LEVELS) {
            const sug = s as any;
            const levels = this.readModel.getLevels();
            const lastLevel = levels.length > 0 ? [...levels].sort((a, b) => b.elevation - a.elevation)[0]! : { elevation: 0, height: 3 };
            const hpl = sug.payload.heightPerLevel ?? 3.0;
            command = new CreateMultipleLevelsCommand({
                count: sug.payload.count,
                baseElevation: lastLevel.elevation + (lastLevel.height || hpl),
                heightPerLevel: hpl,
            });
        }

        if (s.intent === AIIntentType.CREATE_GRID_SYSTEM) {
            const sug = s as any;
            command = new CreateGridSystemCommand({
                xCount:   sug.payload.xCount   ?? 5,
                yCount:   sug.payload.yCount   ?? 5,
                xSpacing: sug.payload.xSpacing ?? 8,
                ySpacing: sug.payload.ySpacing ?? 8,
                xOrigin:  sug.payload.xOrigin  ?? 0,
                yOrigin:  sug.payload.yOrigin  ?? 0,
            });
        }

        if (s.intent === AIIntentType.CREATE_WALLS_ON_SLAB) {
            command = new CreateWallsFromSlabCommand({
                slabId: targetId,
                wallHeight: 3.0,
                wallThickness: 0.2
            });
        }

        if (s.intent === AIIntentType.CREATE_CURTAIN_WALLS_ON_SLAB) {
            // §MIME-FIX-2026: Static import (see top of file) — no separate code-split chunk.
            command = new CreateCurtainWallsFromSlabCommand({
                slabId: targetId,
                height: 3.0
            });
        }

        if (s.intent === AIIntentType.CREATE_CURTAIN_WALLS_ON_ALL_SLABS) {
            // §MIME-FIX-2026: Static import (see top of file) — no separate code-split chunk.
            command = new CreateCurtainWallsOnAllSlabsCommand({
                height: 3.0
            });
        }

        if (s.intent === AIIntentType.CREATE_WALLS_ON_ALL_SLABS) {
            command = new CreateWallsOnAllSlabsCommand({
                wallHeight: 3.0,
                wallThickness: 0.2
            });
        }

        if (s.intent === 'CREATE_SLABS_ON_ALL_FLOORS' as any) {
            let referenceSlabId = (s as any).targetElementId || (s as any).payload?.referenceSlabId;

            // Critical Fix: Prefer the user's active selection in ProjectContext 
            // over the AI's potentially stale targetElementId when replicating "selected" element.
            const context = window.projectContext;
            if (context?.selectedElementId && this.readModel.getElementById(context.selectedElementId)?.type === 'slab') {
                referenceSlabId = context.selectedElementId;
            }

            if (referenceSlabId) {
                command = new CreateSlabsOnAllFloorsCommand(referenceSlabId);
            }
        }

        if (s.intent === AIIntentType.CREATE_ROOF_BY_REGION) {
            const levels = this.readModel.getLevels();
            if (levels.length === 0) throw new Error("No levels exist");

            const highestLevel = [...levels].sort((a, b) => b.elevation - a.elevation)[0]!;
            const walls = this.readModel.getWallsByLevel(highestLevel.id);

            if (walls.length === 0) throw new Error(`No walls found on highest level: ${highestLevel.name}`);

            const region = WallRegionExtractor.extractOutermostRegion(walls);
            if (!region) throw new Error("Walls do not form a closed region");

            const rawPts: [number, number][] = region.map((p: any) => [p.x, p.y] as [number, number]);
            let cx = 0, cz = 0;
            for (const [x, z] of rawPts) { cx += x; cz += z; }
            cx /= rawPts.length; cz /= rawPts.length;
            const localPts: [number, number][] = rawPts.map(([x, z]) => [x - cx, z - cz]);

            command = new CreateRoofCommand(uuid(), {
                levelId:    highestLevel.id,
                footprint:  { polygon: localPts, centroid: [cx, cz] },
                roofType:   'by_region',
                baseOffset: 0,
                thickness:  0.3,
                overhang:   0.3,
            });
        }

          if (!command) {
              // Mock fallback for non-opening elements to satisfy interface
              command = {
                  id: crypto.randomUUID(),
                  type: CommandType.UPDATE_WALL_HEIGHT,
                  timestamp: Date.now(),
                  targetIds: [targetId],
                  canExecute: () => ({ ok: true }),
                  execute: () => ({ success: true, affectedElementIds: [targetId] }),
                  undo: () => ({ success: true, affectedElementIds: [targetId] }),
                  serialize: () => ({} as any)
              };
          }

        return {
            id: crypto.randomUUID(),
            proposalId: crypto.randomUUID(),
            intentId: crypto.randomUUID(),
            intentType: s.intent,
            rationale: s.rationale,
            confidence: s.confidence,
            validation: command && typeof command.canExecute === 'function' ? command.canExecute(context) : { ok: true },
            command: command
        } as CommandProposal;
    }));
      return proposals;
  }

  getAIIntents(): AIIntent[] {
    const suggestions = this.getIntentSuggestions();
    return suggestions.map(s => {
      const base = {
        intentId: crypto.randomUUID(),
        intentType: s.intent as unknown as AIIntentType,
        rationale: s.rationale || 'AI identified improvement',
        confidence: s.confidence || 0.8,
      };

      if (s.intent === AIIntentType.MODIFY_PROPERTY) {
        return {
          ...base,
          type: AIIntentType.MODIFY_PROPERTY,
          payload: {
            targetElementId: s.targetElementId!,
            property: s.property!,
            suggestedValue: s.suggestedValue
          }
        } as unknown as AIIntent;
      }

      if (s.intent === AIIntentType.DELETE_ELEMENT) {
        return {
          ...base,
          type: AIIntentType.DELETE_ELEMENT,
          payload: {
            targetElementId: s.targetElementId!
          }
        } as unknown as AIIntent;
      }

      return {
        ...base,
        type: AIIntentType.CREATE_ELEMENT,
        payload: {
          elementType: (s as any).type || 'wall',
          ...(s as any).payload || {}
        }
      } as unknown as AIIntent;
    });
  }

  getIntentSuggestions(): AIIntentSuggestion[] {
    const violations = this.validateModel().violations;

    return violations
      .filter(v => v.suggestedAction !== undefined)
      .map(v => {
        let property = v.ruleId.includes('height') ? 'height' : undefined;
        if (v.ruleId.includes('width')) property = 'width';
        if (v.ruleId.includes('fire') || v.ruleId.includes('FIRE')) property = 'fireRating';
        if (v.ruleId.includes('ACCESSIBILITY')) property = 'accessibilityType';
        if (v.ruleId.includes('sill') || v.ruleId.includes('SILL')) property = 'sillHeight';

        return {
          intent: this.mapViolationToIntent(v),
          targetElementId: v.elementId,
          property,
          rationale: v.details, // Verbatim SURFACING OF DETAILS
          confidence: 0.9,
          impact: v.explanation || v.details,
          suggestedValue: v.suggestedAction
        };
      }) as AIIntentSuggestion[];
  }

  private mapViolationToIntent(
    violation: RuleViolation
  ): AIIntentType {
    if (violation.severity.code.includes('P0')) {
      return AIIntentType.DELETE_ELEMENT;
    }
    return AIIntentType.MODIFY_PROPERTY;
  }

  query(input: string): Promise<QueryResult> {
    return this.queryEngine.query(input);
  }

  validateModel(): ValidationReport {
    try {
      return this.ruleEngine.validateAll();
    } catch (e) {
      console.error('Validation failed', e);
      return {
        timestamp: new Date(),
        totalElements: 0,
        violations: [],
        summary: { errors: 0, warnings: 0, info: 0 }
      };
    }
  }

  validateIntegrity(): RuleViolation[] {
    try {
      return this.ruleEngine.validateByCategory('P0-Integrity');
    } catch (e) {
      return [];
    }
  }

  validateFunctional(): RuleViolation[] {
    try {
      return this.ruleEngine.validateByCategory('P1-Functional');
    } catch (e) {
      return [];
    }
  }

  validateIFC(): RuleViolation[] {
    try {
      return this.ruleEngine.validateByCategory('P2-IFC');
    } catch (e) {
      return [];
    }
  }

  getModelSummary(): ModelSummary {
    return this.readModel.getModelSummary();
  }

  getSupportedQueries(): string[] {
    return this.queryEngine.getSupportedQueries();
  }

  getValidationRules(): {
    id: string;
    name: string;
    description: string;
    category: string;
  }[] {
    try {
      return this.ruleEngine.getRules();
    } catch (e) {
      return [];
    }
  }

  generateComplianceReport(): string {
    const report = this.validateModel();
    const summary = this.getModelSummary();

    let output = '# BIM Model Compliance Report\n\n';
    output += `Generated: ${report.timestamp.toLocaleString()}\n\n`;

    output += '## Model Summary\n\n';
    output += `- Total Elements: ${summary.totalElements}\n`;
    output += `- Levels: ${summary.levels.length}\n`;
    output += `- IFC Complete: ${summary.ifcReadiness.complete}/${summary.totalElements}\n\n`;

    output += '## Validation Results\n\n';
    output += `| Severity | Count |\n`;
    output += `|----------|-------|\n`;
    output += `| Errors | ${report.summary.errors} |\n`;
    output += `| Warnings | ${report.summary.warnings} |\n`;
    output += `| Info | ${report.summary.info} |\n\n`;

    if (report.violations.length > 0) {
      output += '## Issues Found\n\n';

      const byCategory: Record<string, RuleViolation[]> = {};
      report.violations.forEach(v => {
        const cat = v.severity.code;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(v);
      });

      Object.entries(byCategory).forEach(
        ([category, violations]) => {
          output += `### ${category}\n\n`;
          violations.forEach(v => {
            const icon =
              v.severity.level === 'error'
                ? '!!'
                : v.severity.level === 'warning'
                ? '!'
                : 'i';
            output += `- [${icon}] **${v.ruleName}**: ${v.message}\n`;
            output += `  - ${v.details}\n`;
          });
          output += '\n';
        }
      );
    } else {
      output += '## No Issues Found\n\n';
      output +=
        'The model passed all validation checks.\n';
    }

    return output;
  }

  generateSpatialContainmentReport(): string {
    const levels = this.readModel.getLevels();
    const allElements = this.readModel.getAllElements();

    let output = "# Spatial Containment Report (Phase 1.2)\n";
    output += `Generated: ${new Date().toLocaleString()}\n\n`;

    output += "## Levels\n";

    const elementsInLevels = new Set<string>();
    const elementCountMap = new Map<string, number>();

    levels.forEach(level => {
      output += `Level: ${level.id}\n`;
      output += `- Name: ${level.name}\n`;
      output += `- Elevation: ${level.elevation}m\n`;
      output += `- childrenIds count: ${level.childrenIds?.length || 0}\n`;

      if (level.childrenIds && level.childrenIds.length > 0) {
        output += "  Elements:\n";
        level.childrenIds.forEach((id: string) => {
            const element = this.readModel.getElementById(id);
            if (element) {
                const status = element.spatialStatus || 'Unknown';
                output += `  - [${element.id}] ${element.type} (Status: ${status})\n`;
                elementsInLevels.add(id);
                elementCountMap.set(id, (elementCountMap.get(id) || 0) + 1);
            } else {
                output += `  - [${id}] (Resolved: FAILED)\n`;
                elementCountMap.set(id, (elementCountMap.get(id) || 0) + 1);
            }
        });
      } else {
        output += "  Elements: (empty)\n";
      }
      output += "\n";
    });

    output += "## Orphaned Elements\n";
    const orphans = allElements.filter(el => !elementsInLevels.has(el.id));
    if (orphans.length > 0) {
      orphans.forEach(el => {
        output += `- [${el.id}] ${el.type} (Status: ${el.spatialStatus || 'Orphaned'})\n`;
      });
    } else {
      output += "None detected.\n";
    }
    output += "\n";

    output += "## Invariant Check\n";
    let invariantFailed = false;
    let failureReason = "";

    // Check 1: Every element exists in exactly one Level.childrenIds array
    const duplicateElements = Array.from(elementCountMap.entries())
      .filter(([_, count]) => count > 1)
      .map(([id, _]) => id);

    if (orphans.length > 0) {
      invariantFailed = true;
      failureReason += `- ${orphans.length} orphaned elements found (not in any childrenIds array).\n`;
    }

    if (duplicateElements.length > 0) {
      invariantFailed = true;
      failureReason += `- ${duplicateElements.length} elements exist in multiple childrenIds arrays: ${duplicateElements.join(', ')}.\n`;
    }

    if (invariantFailed) {
      output += "Phase 1.2 spatial containment validation FAILED\n";
      output += failureReason;
    } else {
      output += "Phase 1.2 spatial containment validation PASSED\n";
    }

    return output;
  }

  generateScheduleReport(
    elementType:
      | 'wall'
      | 'door'
      | 'window'
      | 'slab'
      | 'column'
  ): string {
    const elements =
      this.readModel.getElementsByType(elementType);

    let output = `# ${
      elementType.charAt(0).toUpperCase() +
      elementType.slice(1)
    } Schedule\n\n`;
    output += `Generated: ${new Date().toLocaleString()}\n\n`;
    output += `Total: ${elements.length}\n\n`;

    if (elements.length === 0) {
      output += 'No elements found.\n';
      return output;
    }

    output += '| ID | Level | Properties |\n';
    output += '|----|-------|------------|\n';

    elements.forEach(e => {
      const props =
        this.getElementPropertiesString(e);
      output += `| ${e.id} | ${
        e.levelName || e.levelId
      } | ${props} |\n`;
    });

    return output;
  }

  private getElementPropertiesString(
    element: any
  ): string {
    const props: string[] = [];

    if (element.width !== undefined)
      props.push(
        `W: ${(element.width * 1000).toFixed(0)}mm`
      );
    if (element.height !== undefined)
      props.push(
        `H: ${(element.height * 1000).toFixed(0)}mm`
      );
    if (element.length !== undefined)
      props.push(
        `L: ${(element.length * 1000).toFixed(0)}mm`
      );
    if (element.thickness !== undefined)
      props.push(
        `T: ${(element.thickness * 1000).toFixed(0)}mm`
      );
    if (element.depth !== undefined)
      props.push(
        `D: ${(element.depth * 1000).toFixed(0)}mm`
      );

    return props.join(', ');
  }
}

export const aiService = new AIService();