/**
 * legacy-command-protocol.ts — Sprint C / S5.1-P2
 *
 * Minimal inline copy of the legacy Command protocol types that annotation
 * commands need.  The canonical definitions live in
 * `src/engine/subsystems/commands/types.ts`; this file lets the annotation
 * command classes live inside the plugin without importing from src/.
 *
 * IMPORTANT: Only annotation-related CommandType values are defined here.
 * The string literals are intentionally identical to the originals so that
 * CommandManager (still in src/) can dispatch them transparently.
 *
 * F-P5-04 inversion (LANE B, 2026-08-31) — COMPAT COPY ONLY. The 9 annotation
 * command classes moved DOWN to `packages/command-registry/src/annotations/`
 * and now implement command-registry's canonical `types.ts` protocol (whose
 * enum literals are string-identical to these by this file's own design).
 * This copy stays behind ONLY for the plugin-side code that still types
 * against it (UpdateAnnotationPresentationCommand, panels, tools, the barrel's
 * public `CommandType` re-export). Do NOT make new code implement THIS
 * interface — implement `@pryzm/command-registry`'s `types.ts` instead.
 */

export enum CommandType {
    CREATE_ANNOTATION     = 'CREATE_ANNOTATION',
    DELETE_ANNOTATION     = 'DELETE_ANNOTATION',
    UPDATE_ANNOTATION     = 'UPDATE_ANNOTATION',
    LOCK_ANNOTATION       = 'LOCK_ANNOTATION',
    UPDATE_CONSTRAINT     = 'UPDATE_CONSTRAINT',
    CREATE_SECTION_MARK   = 'CREATE_SECTION_MARK',
    CREATE_ELEVATION_MARK = 'CREATE_ELEVATION_MARK',
    CREATE_CALLOUT_DETAIL = 'CREATE_CALLOUT_DETAIL',
}

export interface CommandValidationResult {
    ok: boolean;
    reason?: string;
    blockingIssues?: string[];
    warnings?: string[];
}

export interface CommandResult {
    success: boolean;
    affectedElementIds: string[];
    info?: string[];
    error?: string;
}

export interface SerializedCommand {
    type: string;
    payload: Record<string, any>;
    targetIds: string[];
    timestamp: number;
    version: number;
}

/**
 * Minimal CommandContext — annotation commands only access the annotation-
 * family stores.  Typed as `any` for other stores so the legacy
 * CommandManager's full context still satisfies this interface.
 */
export interface CommandContext {
    bimManager?: any;
    projectContext?: any;
    stores?: {
        annotationStore?: any;
        viewDefinitionStore?: any;
        viewIntentInstanceStore?: any;
        vgGovernanceStore?: any;
        constraintStore?: any;
        [key: string]: any;
    };
    [key: string]: any;
}

export interface Command {
    id: string;
    type: string;
    timestamp: number;
    targetIds: string[];
    affectedStores: ReadonlyArray<string>;
    nonUndoable?: boolean;
    canExecute(context: CommandContext): CommandValidationResult;
    execute(context: CommandContext): CommandResult;
    undo(context: CommandContext): CommandResult;
    serialize(): SerializedCommand;
}
