import { CommandPlan, PlanValidationResult } from './CommandPlan';
import { CommandContext } from '../types';

export class PlanValidator {
    /**
     * Performs a static/dry-run validation of a CommandPlan.
     * This method MUST NOT mutate the BIM state.
     */
    static validate(plan: CommandPlan, context: CommandContext): PlanValidationResult {
        const result: PlanValidationResult = {
            ok: true,
            errors: [],
            warnings: [],
            blockingIssues: []
        };

        if (plan.steps.length === 0) {
            result.ok = false;
            result.errors.push("Plan contains no steps.");
            return result;
        }

        const modifiedElementIds = new Set<string>();

        for (const proposal of plan.steps) {
            // 1. Basic Proposal Validation
            if (!proposal.validation.ok) {
                result.ok = false;
                result.errors.push(`Step ${proposal.id} is invalid: ${proposal.validation.reason}`);
            }

            // 2. Dry-run Kernel Validation (canExecute)
            const kernelCheck = proposal.command.canExecute(context);
            if (!kernelCheck.ok) {
                result.ok = false;
                result.blockingIssues.push(`Kernel validation failed for ${proposal.command.type}: ${kernelCheck.reason}`);
            }

            // 3. Conflict Detection (Duplicate mutations in same plan)
            for (const id of proposal.command.targetIds) {
                if (modifiedElementIds.has(id)) {
                    result.warnings.push(`Element ${id} is modified multiple times in this plan.`);
                }
                modifiedElementIds.add(id);
            }

            // 4. Illegal Command Types Check
            const illegalTypes = ['CAMERA_MOVE', 'VIEW_CHANGE', 'TOOL_SELECT']; // Examples
            if (illegalTypes.includes(proposal.command.type as any)) {
                result.ok = false;
                result.errors.push(`Illegal command type in plan: ${proposal.command.type}`);
            }
        }

        if (result.errors.length > 0 || result.blockingIssues.length > 0) {
            result.ok = false;
        }

        return result;
    }
}
