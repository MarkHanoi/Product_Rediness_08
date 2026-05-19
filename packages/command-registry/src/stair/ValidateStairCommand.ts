import { 
    Command, 
    CommandType, 
    CommandValidationResult, 
    CommandResult, 
    SerializedCommand, 
    CommandContext 
} from '../types';
import { StairValidationResult } from '@pryzm/geometry-stair';
import { StairValidationAuthority } from '@pryzm/geometry-stair';

export interface ValidateStairInput {
    stairId: string;
}

export class ValidateStairCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.VALIDATE_STAIR;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private validationResult?: StairValidationResult;

    constructor(input: ValidateStairInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return {
                ok: false,
                reason: `Stair "${this.stairId}" not found`
            };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore, wallStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return {
                success: false,
                affectedElementIds: [],
                info: [`Stair "${this.stairId}" not found`]
            };
        }

        const levels = wallStore.getLevels();
        // §STAIR-AUDIT-2026 F14 + F15 fix (FIXED 2026-04-25): the formerly
        // dead `StairStore.validateStairParameters` is gone.  Validation now
        // routes through the single `StairValidationAuthority` so this
        // command, `CreateStairCommand.canExecute` and the constraint engine
        // share the same ruleset (and the same per-type overrides).
        this.validationResult = StairValidationAuthority.validate(stair, {
            levels,
            typeStore: ctx.stores.stairTypeStore,
        });

        const info: string[] = [];

        if (this.validationResult.isValid) {
            info.push('Stair validation passed');
        } else {
            info.push(`Stair validation failed with ${this.validationResult.errors.length} error(s)`);
            this.validationResult.errors.forEach(err => {
                info.push(`  - ${err.code}: ${err.message}`);
            });
        }

        if (this.validationResult.warnings.length > 0) {
            info.push(`${this.validationResult.warnings.length} warning(s):`);
            this.validationResult.warnings.forEach(warn => {
                info.push(`  - ${warn.code}: ${warn.message}`);
            });
        }

        console.log(`[ValidateStairCommand] Validated stair ${this.stairId}`, this.validationResult);

        return {
            success: this.validationResult.isValid,
            affectedElementIds: [this.stairId],
            info
        };
    }

    undo(_ctx: CommandContext): CommandResult {
        return {
            success: true,
            affectedElementIds: [this.stairId],
            info: ['Validation command has no state to undo']
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: {
                stairId: this.stairId,
                validationResult: this.validationResult
            },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }

    getValidationResult(): StairValidationResult | undefined {
        return this.validationResult;
    }
}
