import { AIIntentType } from './intents/types.js';
import { SerializedCommand } from '@pryzm/command-registry';

/**
 * A permanent, verifiable record of a human-approved AI action.
 * This is the final Horizon-3 safety gate for accountability and auditability.
 */
export interface AIApprovalRecord {
    id: string;              // Unique record ID
    proposalId: string;      // ID of the AI proposal that generated the command
    intent: AIIntentType;    // The semantic intent identified by AI
    commandType: string;     // The type of command executed
    commandSnapshot: SerializedCommand; // Serialized state of the command for replay/audit

    approvedBy: string;      // Identifier of the person who approved it
    approvedAt: string;      // ISO 8601 timestamp

    rationale: string;       // Why the AI proposed this action
    confidence: number;      // AI's confidence score at the time
    validationSummary: string; // Result of the semantic validation check
}
