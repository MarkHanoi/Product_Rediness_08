/**
 * @pryzm/speculative-engine — public API barrel
 *
 * Sprint S (2026-05-11): extracted from src/engine/subsystems/core/SpeculativeEngine.ts (Great Purge)
 *
 * Read-only speculative state engine — previews consequences of destructive
 * actions without modifying any live store or SemanticGraph.
 */

export { speculativeEngine } from './SpeculativeEngine';
export type {
    SpeculativeAction,
    SpeculativeActionType,
    ConsequencePreview,
    SemanticRelationshipSnapshot,
} from './SpeculativeEngine';
