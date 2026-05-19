import { AIIntent, AIIntentType } from './ai-vg/AIIntentTypes';
import { Command, CommandContext, CommandValidationResult } from './types';
import { mapVGIntent, isVGIntentType } from './ai-vg/VGIntentMapper';
import { mapViewAuthoringIntent, isViewAuthoringIntentType } from './ai-vg/ViewAuthoringIntentMapper';

export interface CommandProposal {
    proposalId: string;
    intentId: string;
    intentType: AIIntentType;
    command: Command;
    validation: CommandValidationResult;
    rationale: string;
    confidence: number;
}

export class CommandProposalFactory {
    static createFromIntent(
        intent: AIIntent,
        context: CommandContext,
        mapIntentToCommand: (intent: AIIntent, context: CommandContext) => Command | null
    ): CommandProposal | null {
        let command: Command | null = null;

        if (isVGIntentType(intent.intentType)) {
            command = mapVGIntent(intent, context);
        } else if (isViewAuthoringIntentType(intent.intentType)) {
            // Phase D — LLM View Authoring Protocol
            command = mapViewAuthoringIntent(intent, context);
        } else {
            command = mapIntentToCommand(intent, context);
        }

        if (!command) return null;

        const validation = command.canExecute(context);

        return {
            proposalId: crypto.randomUUID(),
            intentId: intent.intentId,
            intentType: intent.intentType,
            command,
            validation,
            rationale: intent.rationale,
            confidence: intent.confidence
        };
    }
}
