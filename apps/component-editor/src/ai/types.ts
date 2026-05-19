// AI bridge — shared types (S54).
//
// Per the rewrite plan §19.3: the AI host (`@pryzm/ai-host`) proposes
// command sequences; the family editor accepts whole, rejects whole,
// or accepts-with-edits.  The bridge between the two is small enough
// to keep the type vocabulary in one file.
//
// LAYER — L7 chrome-side. No THREE, no DOM, no `(window as any)`.

import type { ExecuteBatchSpec } from '../app/commandBus.js';

/**
 * Shape of an AI-proposed action as it sits in the approval queue.
 * Mirrors the relevant subset of `@pryzm/ai-host`'s
 * `AiPendingAction` so the bridge does not depend on the host's
 * exact runtime type (which lives behind a lazy `await import()`).
 */
export interface AiPendingActionLike {
  /** Stable id — must be unique within the queue. */
  readonly id: string;
  /** The original natural-language prompt. */
  readonly prompt: string;
  /** The command batch the AI wants to execute on accept. */
  readonly commands: ReadonlyArray<ExecuteBatchSpec>;
  /** Optional dollar estimate from the host's cost meter. */
  readonly estimatedCostUsd?: number;
  /** Optional one-liner the UI can render in the queue list. */
  readonly previewSummary?: string;
}

/** Result of validating a tool argument payload. */
export type ToolValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ReadonlyArray<string> };

export type ToolValidator = (args: unknown) => ToolValidationResult;

/**
 * A "tool" is a command verb the AI is allowed to call, paired with
 * a payload validator.  The bridge uses the validator to short-circuit
 * obviously bad proposals BEFORE opening a batch on the command bus.
 */
export interface AiTool {
  readonly verb: string;
  readonly category: string;
  readonly description: string;
  readonly validate: ToolValidator;
}

export interface AiToolRegistry {
  list(): ReadonlyArray<AiTool>;
  has(verb: string): boolean;
  get(verb: string): AiTool | undefined;
  validate(verb: string, args: unknown): ToolValidationResult;
}

/** Events the approval queue emits. */
export type AiApprovalQueueEvent =
  | { readonly kind: 'enqueued'; readonly action: AiPendingActionLike }
  | { readonly kind: 'accepted'; readonly id: string }
  | { readonly kind: 'rejected'; readonly id: string; readonly reason?: string }
  | { readonly kind: 'cleared' };

export type AiApprovalQueueListener = (event: AiApprovalQueueEvent) => void;
