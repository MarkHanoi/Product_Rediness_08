import { CommandPlan, PlanValidationResult } from './CommandPlan';
import { CommandProposal, CommandValidationResult, CommandContext } from '../types';
import { CreateBeamCommand, CreateBeamInput } from '../beam/CreateBeamCommand';
import { AssignBeamSupportsCommand } from '../beam/AssignBeamSupportsCommand';
import { BEAM_CONSTRAINTS, RiskLevel } from '@pryzm/core-app-model';
import { Level } from '@pryzm/geometry-wall';

export interface BeamCommandPlanInput {
    startPoint: { x: number; y: number; z: number };
    endPoint: { x: number; y: number; z: number };
    width: number;
    depth: number;
    levelId: string;
    startSupportId?: string;
    endSupportId?: string;
    startSupportType?: 'column' | 'wall' | 'beam';
    endSupportType?: 'column' | 'wall' | 'beam';
    material?: string;
    fireRating?: string;
}

export interface BeamPrecondition {
    id: string;
    name: string;
    description: string;
    check: (input: BeamCommandPlanInput, context: CommandContext) => { passed: boolean; reason?: string };
}

export interface BeamPostcondition {
    id: string;
    name: string;
    description: string;
}

export interface PlannedBeamStep {
    order: number;
    commandId: string;
    commandType: string;
    explanation: string;
    validation: CommandValidationResult;
}

export interface BeamCommandPlan extends CommandPlan {
    beamInput: CreateBeamInput;
    calculatedValues: {
        span: number;
        spanToDepthRatio: number;
        minimumRecommendedDepth: number;
    };
    planSteps: PlannedBeamStep[];
    preconditions: BeamPrecondition[];
    postconditions: BeamPostcondition[];
    riskLevel: RiskLevel;
}

export class BeamCommandPlanFactory {
    private static readonly PRECONDITIONS: BeamPrecondition[] = [
        {
            id: 'LEVEL_EXISTS',
            name: 'Level Exists',
            description: 'Target level must exist in the model',
            check: (input, context) => {
                const levels = context.stores.wallStore.getLevels();
                const exists = levels.some((l: Level) => l.id === input.levelId);
                return {
                    passed: exists,
                    reason: exists ? undefined : `Level "${input.levelId}" does not exist`
                };
            }
        },
        {
            id: 'SPAN_WITHIN_LIMITS',
            name: 'Span Within Limits',
            description: 'Beam span must be within constructible limits',
            check: (input) => {
                const span = BeamCommandPlanFactory.calculateSpan(input.startPoint, input.endPoint);
                if (span < BEAM_CONSTRAINTS.MIN_SPAN) {
                    return { passed: false, reason: `Span ${span.toFixed(2)}m is below minimum ${BEAM_CONSTRAINTS.MIN_SPAN}m` };
                }
                if (span > BEAM_CONSTRAINTS.MAX_SPAN) {
                    return { passed: false, reason: `Span ${span.toFixed(2)}m exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN}m` };
                }
                return { passed: true };
            }
        },
        {
            id: 'DIMENSIONS_VALID',
            name: 'Dimensions Valid',
            description: 'Beam width and depth must be within limits',
            check: (input) => {
                if (input.width < BEAM_CONSTRAINTS.MIN_WIDTH) {
                    return { passed: false, reason: `Width ${input.width.toFixed(2)}m is below minimum` };
                }
                if (input.depth < BEAM_CONSTRAINTS.MIN_DEPTH) {
                    return { passed: false, reason: `Depth ${input.depth.toFixed(2)}m is below minimum` };
                }
                return { passed: true };
            }
        },
        {
            id: 'SPAN_TO_DEPTH_RATIO',
            name: 'Span-to-Depth Ratio Check',
            description: 'Span-to-depth ratio must not exceed maximum',
            check: (input) => {
                const span = BeamCommandPlanFactory.calculateSpan(input.startPoint, input.endPoint);
                const ratio = span / input.depth;
                if (ratio > BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO) {
                    return { 
                        passed: false, 
                        reason: `Span-to-depth ratio ${ratio.toFixed(1)} exceeds maximum ${BEAM_CONSTRAINTS.MAX_SPAN_TO_DEPTH_RATIO}` 
                    };
                }
                return { passed: true };
            }
        }
    ];

    private static readonly POSTCONDITIONS: BeamPostcondition[] = [
        {
            id: 'BEAM_HAS_VALID_SPAN',
            name: 'Beam Has Valid Span',
            description: 'Created beam has a structurally valid span'
        },
        {
            id: 'BEAM_CONNECTED_TO_SUPPORTS',
            name: 'Beam Connected To Supports',
            description: 'Beam is properly connected to supporting elements'
        },
        {
            id: 'BEAM_ON_CORRECT_LEVEL',
            name: 'Beam On Correct Level',
            description: 'Beam is assigned to the specified level'
        }
    ];

    static calculateSpan(
        start: { x: number; y: number; z: number },
        end: { x: number; y: number; z: number }
    ): number {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const dz = end.z - start.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    static calculateOptimalDepth(span: number): number {
        return Math.max(
            BEAM_CONSTRAINTS.MIN_DEPTH,
            span / BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO
        );
    }

    static determineRiskLevel(input: BeamCommandPlanInput): RiskLevel {
        const span = this.calculateSpan(input.startPoint, input.endPoint);
        const ratio = span / input.depth;

        if (!input.startSupportId || !input.endSupportId) {
            return 'high';
        }

        if (ratio > BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO) {
            return 'medium';
        }

        if (span > 10) {
            return 'medium';
        }

        return 'low';
    }

    static createPlan(
        input: BeamCommandPlanInput,
        context: CommandContext
    ): BeamCommandPlan | { error: string; preconditionFailures: string[] } {
        const preconditionFailures: string[] = [];

        for (const precondition of this.PRECONDITIONS) {
            const result = precondition.check(input, context);
            if (!result.passed) {
                preconditionFailures.push(`${precondition.name}: ${result.reason}`);
            }
        }

        if (preconditionFailures.length > 0) {
            return { error: 'Precondition check failed', preconditionFailures };
        }

        const span = this.calculateSpan(input.startPoint, input.endPoint);
        const spanToDepthRatio = span / input.depth;
        const minimumRecommendedDepth = this.calculateOptimalDepth(span);

        const beamInput: CreateBeamInput = {
            startPoint: input.startPoint,
            endPoint: input.endPoint,
            width: input.width,
            depth: input.depth,
            levelId: input.levelId,
            startSupportId: input.startSupportId,
            endSupportId: input.endSupportId,
            startSupportType: input.startSupportType,
            endSupportType: input.endSupportType,
            material: input.material,
            loadBearing: true,
            fireRating: input.fireRating
        };

        const createCommand = new CreateBeamCommand(beamInput);
        const createValidation = createCommand.canExecute(context);

        const planSteps: PlannedBeamStep[] = [
            {
                order: 1,
                commandId: createCommand.id,
                commandType: 'CREATE_BEAM',
                explanation: `Create structural beam with span ${span.toFixed(2)}m, depth ${input.depth.toFixed(2)}m`,
                validation: createValidation
            }
        ];

        const steps: CommandProposal[] = [
            {
                id: createCommand.id,
                intentType: 'CREATE_BEAM',
                command: createCommand,
                rationale: `Create beam spanning ${span.toFixed(2)}m between supports`,
                validation: createValidation,
                confidence: createValidation.ok ? 0.90 : 0.3
            }
        ];

        if (input.startSupportId && input.endSupportId) {
            const assignCommand = new AssignBeamSupportsCommand({
                beamId: createCommand.id,
                startSupportId: input.startSupportId,
                startSupportType: input.startSupportType,
                endSupportId: input.endSupportId,
                endSupportType: input.endSupportType
            });
            
            planSteps.push({
                order: 2,
                commandId: assignCommand.id,
                commandType: 'ASSIGN_BEAM_SUPPORTS',
                explanation: 'Connect beam to vertical supports for load path continuity',
                validation: { ok: true }
            });

            steps.push({
                id: assignCommand.id,
                intentType: 'ASSIGN_BEAM_SUPPORTS',
                command: assignCommand,
                rationale: 'Establish load path connections',
                validation: { ok: true },
                confidence: 0.95
            });
        }

        planSteps.push({
            order: planSteps.length + 1,
            commandId: crypto.randomUUID(),
            commandType: 'VALIDATE_BEAM',
            explanation: 'Validate beam against structural plausibility rules',
            validation: { ok: true }
        });

        const riskLevel = this.determineRiskLevel(input);
        const risks: string[] = [];
        
        if (!input.startSupportId || !input.endSupportId) {
            risks.push('Beam does not have both supports defined - load path incomplete');
        }
        if (spanToDepthRatio > BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO) {
            risks.push(`Span-to-depth ratio ${spanToDepthRatio.toFixed(1)} exceeds recommended limit`);
        }

        const plan: BeamCommandPlan = {
            id: crypto.randomUUID(),
            intent: `Create structural beam from (${input.startPoint.x.toFixed(1)}, ${input.startPoint.y.toFixed(1)}) to (${input.endPoint.x.toFixed(1)}, ${input.endPoint.y.toFixed(1)})`,
            steps,
            impactSummary: {
                affectedElementsCount: 1,
                addedCount: 1,
                updatedCount: 0,
                deletedCount: 0,
                risks
            },
            confidence: createValidation.ok ? 0.90 : 0.3,
            createdAt: Date.now(),
            status: 'draft',
            beamInput,
            calculatedValues: {
                span,
                spanToDepthRatio,
                minimumRecommendedDepth
            },
            planSteps,
            preconditions: this.PRECONDITIONS,
            postconditions: this.POSTCONDITIONS,
            riskLevel
        };

        return plan;
    }

    static validatePlan(plan: BeamCommandPlan, context: CommandContext): PlanValidationResult {
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

        const { spanToDepthRatio } = plan.calculatedValues;
        if (spanToDepthRatio > BEAM_CONSTRAINTS.RECOMMENDED_SPAN_TO_DEPTH_RATIO) {
            warnings.push(`Span-to-depth ratio ${spanToDepthRatio.toFixed(1)} may result in excessive deflection`);
        }

        if (plan.riskLevel === 'high') {
            warnings.push('This plan has high structural risk - requires careful review');
        }

        return {
            ok: errors.length === 0,
            errors,
            warnings,
            blockingIssues
        };
    }

    static executeApprovedPlan(
        plan: BeamCommandPlan,
        _context: CommandContext,
        commandManager: any
    ): { success: boolean; beamId?: string; errors: string[] } {
        if (plan.status !== 'approved') {
            return { success: false, errors: ['Plan must be approved before execution'] };
        }

        const errors: string[] = [];
        let beamId: string | undefined;

        for (const step of plan.steps) {
            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
            if (window.runtime?.bus) { window.runtime.bus.executeCommand('beam.executeApprovedPlan', {}).catch(() => {}); }
            const result = commandManager.execute(step.command, {
                source: 'AI_PROPOSAL',
                proposalId: plan.id
            });

            if (!result.success) {
                errors.push(`Step ${step.id} failed: ${result.info?.join(', ')}`);
                break;
            }

            if (step.command.type === 'CREATE_BEAM') {
                beamId = result.affectedElementIds[0];
            }
        }

        if (errors.length === 0) {
            plan.status = 'executed';
        }

        return { success: errors.length === 0, beamId, errors };
    }

    static explainPlan(plan: BeamCommandPlan): string {
        const lines: string[] = [
            `## Beam Creation Plan`,
            ``,
            `**Intent:** ${plan.intent}`,
            `**Risk Level:** ${plan.riskLevel.toUpperCase()}`,
            `**Confidence:** ${(plan.confidence * 100).toFixed(0)}%`,
            ``,
            `### Calculated Values`,
            `- Span: ${plan.calculatedValues.span.toFixed(2)}m`,
            `- Span-to-Depth Ratio: ${plan.calculatedValues.spanToDepthRatio.toFixed(1)}`,
            `- Minimum Recommended Depth: ${plan.calculatedValues.minimumRecommendedDepth.toFixed(2)}m`,
            ``,
            `### Steps`
        ];

        for (const step of plan.planSteps) {
            const status = step.validation.ok ? '✓' : '✗';
            lines.push(`${step.order}. [${status}] ${step.commandType}: ${step.explanation}`);
        }

        if (plan.impactSummary.risks.length > 0) {
            lines.push(``, `### Risks`);
            for (const risk of plan.impactSummary.risks) {
                lines.push(`- ⚠️ ${risk}`);
            }
        }

        return lines.join('\n');
    }
}
