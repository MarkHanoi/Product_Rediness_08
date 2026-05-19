import { CommandProposal } from '../types';

export type PlanStatus = 'draft' | 'approved' | 'rejected' | 'executed';

/**
 * CommandPlan abstraction for multi-step design changes.
 * This represents a design intent, not an execution unit.
 * Once approved, it becomes immutable and ready for execution by a human.
 */
export interface CommandPlan {
    readonly id: string;
    readonly intent: string;
    readonly steps: CommandProposal[];
    readonly impactSummary: {
        affectedElementsCount: number;
        addedCount: number;
        updatedCount: number;
        deletedCount: number;
        risks: string[];
    };
    readonly confidence: number;
    readonly createdAt: number;
    status: PlanStatus;
    metadata?: Record<string, any>;
}

export interface PlanValidationResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    blockingIssues: string[];
}
