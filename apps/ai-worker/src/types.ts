// @pryzm/ai-worker — public type surface (S47).

import type {
  AiPendingAction,
  AiWorkflowKind,
  CommandPayloadRef,
} from '@pryzm/ai-host/types';

/** A queued workflow job. The worker dequeues these and dispatches to
 *  the handler matching `kind`. */
export interface WorkflowJob {
  readonly id: string;
  readonly kind: AiWorkflowKind;
  readonly projectId: string;
  readonly input: unknown;
  readonly enqueuedAt: number;
  readonly attempts: number;
}

/** Result returned by a handler after processing a job. The worker
 *  uses this to synthesise an `AiPendingAction` for the approval
 *  queue. */
export interface HandlerResult {
  readonly proposedCommands: ReadonlyArray<CommandPayloadRef>;
  readonly estimatedCostUsd: number;
  readonly preview?: AiPendingAction['preview'];
}

/** Workflow handler signature. Pure (no I/O outside the supplied
 *  context) so unit tests can drive it directly. */
export type WorkflowHandler = (job: WorkflowJob) => Promise<HandlerResult>;

/** Queue selection. The factory inspects env and returns a queue. */
export type QueueSelection = 'memory' | 'bullmq';

/** Common queue interface. Both `InMemoryQueue` and the BullMQ
 *  adapter implement this surface. */
export interface Queue {
  readonly selection: QueueSelection;
  enqueue(job: Omit<WorkflowJob, 'id' | 'enqueuedAt' | 'attempts'>): Promise<WorkflowJob>;
  /** Dequeue + execute up to `max` jobs. Returns the number drained.
   *  Used by tests + the in-process dev mode; the BullMQ adapter
   *  ignores `max` and runs continuously. */
  drain(max?: number): Promise<number>;
  size(): Promise<number>;
  close(): Promise<void>;
}

/** Env shape the factory inspects. */
export interface QueueEnv {
  readonly REDIS_URL?: string | undefined;
  readonly PRYZM_AI_QUEUE?: 'memory' | 'bullmq' | undefined;
}
