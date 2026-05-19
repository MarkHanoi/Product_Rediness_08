import { CommandPlan, PlanValidationResult } from './CommandPlan';
import { CommandProposal, CommandValidationResult, CommandContext } from '../types';
import { CreateStairCommand, CreateStairInput } from '../stair/CreateStairCommand';
import { STAIR_CONSTRAINTS } from '@pryzm/geometry-stair';
import { Level } from '@pryzm/geometry-wall';
import { StairShapeAdvisor } from './StairShapeAdvisor';
import { StairConstraintEngine } from '@pryzm/constraint-solver';

export interface StairCommandPlanInput {
    baseLevelId: string;
    topLevelId: string;
    width: number;
    direction: { x: number; y: number; z: number };
    startPosition: { x: number; y: number; z: number };
    fireRating?: string;
    accessibilityType?: 'standard' | 'accessible';
    // §7.1 — optional shape override; when omitted the StairShapeAdvisor
    // selects the optimal shape from available space constraints
    shape?: 'I' | 'L' | 'U';
    // available footprint dimensions for shape auto-detection
    availableLength?: number;
    availableWidth?: number;
}

export interface PlannedCommandStep {
    order: number;
    commandId: string;
    commandType: string;
    explanation: string;
    validation: CommandValidationResult;
}

export interface StairCommandPlan extends CommandPlan {
    stairInput: CreateStairInput;
    calculatedValues: {
        levelHeight: number;
        riserCount: number;
        riserHeight: number;
        treadDepth: number;
        totalRunLength: number;
    };
    planSteps: PlannedCommandStep[];
}

export class StairCommandPlanFactory {
    static calculateOptimalStairParameters(
        baseLevelElevation: number,
        topLevelElevation: number,
        _targetRiserHeight: number = 0.170
    ): { riserCount: number; riserHeight: number; treadDepth: number } {
        // §07-AI-PLANNING: Delegate to StairConstraintEngine for Blondel-optimal parameters.
        const levelHeight = topLevelElevation - baseLevelElevation;
        const computed = StairConstraintEngine.computeOptimalParameters(levelHeight);
        return {
            riserCount:  computed.riserCount,
            riserHeight: computed.riserHeight,
            treadDepth:  computed.treadDepth
        };
    }

    static createPlan(
        input: StairCommandPlanInput,
        levels: Level[],
        context: CommandContext
    ): StairCommandPlan | { error: string; preconditionFailures: string[] } {
        const preconditionFailures: string[] = [];

        const baseLevel = levels.find(l => l.id === input.baseLevelId);
        const topLevel = levels.find(l => l.id === input.topLevelId);

        if (!baseLevel) {
            preconditionFailures.push(`Base level "${input.baseLevelId}" does not exist`);
        }
        if (!topLevel) {
            preconditionFailures.push(`Top level "${input.topLevelId}" does not exist`);
        }
        if (input.baseLevelId === input.topLevelId) {
            preconditionFailures.push('Base level and top level cannot be the same');
        }

        if (baseLevel && topLevel) {
            const sortedLevels = [...levels].sort((a, b) => a.elevation - b.elevation);
            const baseIdx = sortedLevels.findIndex(l => l.id === input.baseLevelId);
            const topIdx = sortedLevels.findIndex(l => l.id === input.topLevelId);
            
            if (Math.abs(topIdx - baseIdx) > 1) {
                preconditionFailures.push('Stairs can only connect adjacent levels');
            }

            const existingStair = context.stores.stairStore.getStairConnectingLevels(
                input.baseLevelId, 
                input.topLevelId
            );
            if (existingStair) {
                preconditionFailures.push(`A stair already connects ${baseLevel.name} to ${topLevel.name}`);
            }
        }

        if (preconditionFailures.length > 0) {
            return { error: 'Precondition check failed', preconditionFailures };
        }

        const levelHeight = topLevel!.elevation - baseLevel!.elevation;
        const { riserCount, riserHeight, treadDepth } = this.calculateOptimalStairParameters(
            baseLevel!.elevation,
            topLevel!.elevation
        );
        const totalRunLength = (riserCount - 1) * treadDepth;

        // §7.1 — Shape auto-detection via StairShapeAdvisor when caller
        // does not explicitly provide a shape. availableLength/Width default
        // to the computed run so the advisor can still reason about space.
        const availableLength = input.availableLength ?? totalRunLength;
        const availableWidth  = input.availableWidth  ?? input.width;
        const advisedShape = input.shape
            ?? new StairShapeAdvisor().recommendShape(
                levelHeight,
                riserHeight,
                availableLength,
                availableWidth
            ).shape;

        // §7.1 — Build flights array based on resolved shape.
        // I-shape: single straight flight.
        // L-shape: two flights with a 90° turn; second direction is dir.perp.
        // U-shape: two flights parallel, opposite directions, with a landing.
        const dir = input.direction;
        const flights: CreateStairInput['flights'] = [];
        const landings: CreateStairInput['landings'] = [];

        if (advisedShape === 'I') {
            flights.push({ direction: dir, riserCount });
        } else if (advisedShape === 'L') {
            const half = Math.floor(riserCount / 2);
            // 90° turn: perpendicular to the original direction (XZ plane)
            const perpDir = { x: -dir.z, y: 0, z: dir.x };
            flights.push({ direction: dir,     riserCount: half });
            flights.push({ direction: perpDir, riserCount: riserCount - half });
            landings.push({ depth: input.width });
        } else {
            // U-shape: second flight is the reverse of the first, offset laterally.
            // landing.depth = input.width (a square landing bridging the two runs).
            const half = Math.floor(riserCount / 2);
            const reverseDir = { x: -dir.x, y: 0, z: -dir.z };
            const halfRun = half * treadDepth;
            // landing.depth = 2*width: the slab spans BOTH runs (Run1 + Run2 side-by-side).
            const landingDepth = 2 * input.width;
            const perpDir = { x: -dir.z, y: 0, z: dir.x };
            // Run 2 is directly adjacent to Run 1 (perpDir offset = stair.width only).
            // startOverride.forward = halfRun + treadDepth so flight 2's first tread centre
            // aligns with flight 1's last tread centre (same Z line after the step loop).
            const secondStart = {
                x: input.startPosition.x + dir.x * (halfRun + treadDepth) + perpDir.x * input.width,
                y: input.startPosition.y + half * riserHeight,
                z: input.startPosition.z + dir.z * (halfRun + treadDepth) + perpDir.z * input.width,
            };
            flights.push({ direction: dir,        riserCount: half });
            flights.push({ direction: reverseDir, riserCount: riserCount - half, startOverride: secondStart });
            landings.push({ depth: landingDepth });
        }

        const stairInput: CreateStairInput = {
            baseLevelId: input.baseLevelId,
            topLevelId: input.topLevelId,
            shape: advisedShape,
            riserHeight,
            treadDepth,
            width: input.width,
            startPosition: input.startPosition,
            flights,
            landings: landings.length > 0 ? landings : undefined,
            fireRating: input.fireRating,
            accessibilityType: input.accessibilityType
        };

        const createCommand = new CreateStairCommand(stairInput);
        const createValidation = createCommand.canExecute(context);

        const shapeLabel = advisedShape === 'I' ? 'straight' : advisedShape === 'L' ? 'L-shaped' : 'U-shaped';

        const planSteps: PlannedCommandStep[] = [
            {
                order: 1,
                commandId: createCommand.id,
                commandType: 'CREATE_STAIR',
                explanation: `Create ${shapeLabel} stair connecting ${baseLevel!.name} to ${topLevel!.name} with ${riserCount} risers.`,
                validation: createValidation
            },
            {
                order: 2,
                commandId: crypto.randomUUID(),
                commandType: 'VALIDATE_STAIR',
                explanation: 'Validate stair parameters against building code requirements before geometry projection.',
                validation: { ok: true }
            },
            {
                order: 3,
                commandId: crypto.randomUUID(),
                commandType: 'GENERATE_STAIR_GEOMETRY',
                explanation: 'Project 3D geometry from validated semantic stair data.',
                validation: { ok: true }
            }
        ];

        const steps: CommandProposal[] = [
            {
                id: createCommand.id,
                intentType: 'CREATE_STAIR',
                command: createCommand,
                rationale: `Create code-compliant ${shapeLabel} stair from ${baseLevel!.name} to ${topLevel!.name}`,
                validation: createValidation,
                confidence: createValidation.ok ? 0.95 : 0.3
            }
        ];

        const plan: StairCommandPlan = {
            id: crypto.randomUUID(),
            intent: `Create code-compliant ${shapeLabel} stair from ${baseLevel!.name} to ${topLevel!.name}`,
            steps,
            impactSummary: {
                affectedElementsCount: 1,
                addedCount: 1,
                updatedCount: 0,
                deletedCount: 0,
                risks: createValidation.warnings || []
            },
            confidence: createValidation.ok ? 0.95 : 0.3,
            createdAt: Date.now(),
            status: 'draft',
            stairInput,
            calculatedValues: {
                levelHeight,
                riserCount,
                riserHeight,
                treadDepth,
                totalRunLength
            },
            planSteps
        };

        return plan;
    }

    static validatePlan(plan: StairCommandPlan, context: CommandContext): PlanValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        const blockingIssues: string[] = [];

        for (const step of plan.steps) {
            const validation = step.command.canExecute(context);
            if (!validation.ok) {
                errors.push(`Step ${step.id}: ${validation.reason}`);
                if (validation.blockingIssues) {
                    blockingIssues.push(...validation.blockingIssues);
                }
            }
            if (validation.warnings) {
                warnings.push(...validation.warnings);
            }
        }

        const { riserHeight, riserCount } = plan.calculatedValues;
        const levelHeight = plan.calculatedValues.levelHeight;
        const calculatedHeight = riserHeight * riserCount;
        const heightDiff = Math.abs(calculatedHeight - levelHeight);

        if (heightDiff > STAIR_CONSTRAINTS.HEIGHT_TOLERANCE) {
            errors.push(
                `Height mismatch: ${(calculatedHeight * 1000).toFixed(0)}mm vs level height ${(levelHeight * 1000).toFixed(0)}mm`
            );
        }

        const seenIds = new Set<string>();
        for (const step of plan.steps) {
            if (seenIds.has(step.command.id)) {
                errors.push(`Duplicate command ID: ${step.command.id}`);
            }
            seenIds.add(step.command.id);
        }

        return {
            ok: errors.length === 0,
            errors,
            warnings,
            blockingIssues
        };
    }

    static executeApprovedPlan(
        plan: StairCommandPlan, 
        _context: CommandContext,
        commandManager: any
    ): { success: boolean; stairId?: string; errors: string[] } {
        if (plan.status !== 'approved') {
            return { success: false, errors: ['Plan must be approved before execution'] };
        }

        const errors: string[] = [];
        let stairId: string | undefined;

        for (const step of plan.steps) {
            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('stair.executeApprovedPlan', {}).catch(() => {}); }
            const result = commandManager.execute(step.command, { 
                source: 'AI_PROPOSAL', 
                proposalId: plan.id 
            });

            if (!result.success) {
                errors.push(`Step ${step.id} failed: ${result.info?.join(', ')}`);
                break;
            }

            if (step.command.type === 'CREATE_STAIR') {
                stairId = result.affectedElementIds[0];
            }
        }

        if (errors.length === 0) {
            plan.status = 'executed';
        }

        return { success: errors.length === 0, stairId, errors };
    }
}
