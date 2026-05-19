// @pryzm/ai-worker — queue factory (S47).
//
// Mirrors the `createEventLog({env})` selection pattern from
// `apps/sync-server/src/eventLog/`. Default is `InMemoryQueue`; if
// `REDIS_URL` is set AND `PRYZM_AI_QUEUE !== 'memory'`, dynamically
// import the BullMQ adapter. The dynamic import keeps `bullmq` /
// `ioredis` out of the editor's dep tree when those packages are not
// installed (which they currently are not — Redis is not provisioned
// in dev).

import type {
  HandlerResult,
  Queue,
  QueueEnv,
  WorkflowJob,
} from './types.js';
import type { HandlerRegistry } from './handlers.js';

let _seq = 0;
function nextId(): string {
  return `job-${Date.now().toString(36)}-${(++_seq).toString(36)}`;
}

/** In-memory FIFO queue. Used for dev, tests, and the S47 smoke
 *  end-to-end. Production landing at S49+ swaps to BullMQ via the
 *  factory. */
export class InMemoryQueue implements Queue {
  readonly selection = 'memory' as const;
  private readonly buf: WorkflowJob[] = [];
  private readonly registry: HandlerRegistry;
  private readonly onComplete?: (
    job: WorkflowJob,
    result: HandlerResult,
  ) => void | Promise<void>;
  private readonly onError?: (job: WorkflowJob, err: unknown) => void | Promise<void>;
  private closed = false;

  constructor(opts: {
    readonly registry: HandlerRegistry;
    readonly onComplete?: (job: WorkflowJob, result: HandlerResult) => void | Promise<void>;
    readonly onError?: (job: WorkflowJob, err: unknown) => void | Promise<void>;
  }) {
    this.registry = opts.registry;
    if (opts.onComplete) this.onComplete = opts.onComplete;
    if (opts.onError) this.onError = opts.onError;
  }

  async enqueue(
    spec: Omit<WorkflowJob, 'id' | 'enqueuedAt' | 'attempts'>,
  ): Promise<WorkflowJob> {
    if (this.closed) throw new Error('[ai-worker] Queue is closed.');
    const job: WorkflowJob = {
      id: nextId(),
      kind: spec.kind,
      projectId: spec.projectId,
      input: spec.input,
      enqueuedAt: Date.now(),
      attempts: 0,
    };
    this.buf.push(job);
    return job;
  }

  async drain(max = Infinity): Promise<number> {
    let n = 0;
    while (this.buf.length > 0 && n < max) {
      const job = this.buf.shift()!;
      try {
        const result = await this.registry.dispatch(job);
        await this.onComplete?.(job, result);
      } catch (err) {
        await this.onError?.(job, err);
      }
      n++;
    }
    return n;
  }

  async size(): Promise<number> { return this.buf.length; }

  async close(): Promise<void> { this.closed = true; this.buf.length = 0; }
}

/** Factory matching `createEventLog({env})` selection pattern. */
export async function createQueue(opts: {
  readonly env: QueueEnv;
  readonly registry: HandlerRegistry;
  readonly onComplete?: (job: WorkflowJob, result: HandlerResult) => void | Promise<void>;
  readonly onError?: (job: WorkflowJob, err: unknown) => void | Promise<void>;
}): Promise<Queue> {
  const env = opts.env;
  const explicit = env.PRYZM_AI_QUEUE;

  // Explicit override wins.
  if (explicit === 'memory') {
    return new InMemoryQueue({
      registry: opts.registry,
      ...(opts.onComplete ? { onComplete: opts.onComplete } : {}),
      ...(opts.onError ? { onError: opts.onError } : {}),
    });
  }

  if (explicit === 'bullmq' || (env.REDIS_URL && explicit !== 'memory')) {
    // Dynamic import — keeps `bullmq` out of the dep graph until the
    // operator opts in. The adapter module is intentionally absent
    // in S47 (BullMQ not yet a dep); a missing module raises a clear
    // error so misconfiguration is loud.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any = await import(/* @vite-ignore */ './bullmq-queue.js' as string).catch(() => null);
      if (mod?.createBullMqQueue && env.REDIS_URL) {
        return mod.createBullMqQueue({
          redisUrl: env.REDIS_URL,
          registry: opts.registry,
          onComplete: opts.onComplete,
          onError: opts.onError,
        }) as Queue;
      }
    } catch {
      // Fall through to error below.
    }
    throw new Error(
      '[ai-worker] BullMQ queue requested (REDIS_URL set) but adapter '
      + 'is not installed in this build. BullMQ live worker lands at '
      + 'S49+ per ADR-0037. Set PRYZM_AI_QUEUE=memory to force the '
      + 'in-memory fallback.',
    );
  }

  return new InMemoryQueue({
    registry: opts.registry,
    ...(opts.onComplete ? { onComplete: opts.onComplete } : {}),
    ...(opts.onError ? { onError: opts.onError } : {}),
  });
}
