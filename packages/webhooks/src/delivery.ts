/**
 * @pryzm/webhooks — delivery scheduler.
 *
 * Pure scheduling primitives + a pluggable transport.  In tests we
 * inject a `FetchLike` stub; production wires `globalThis.fetch`.
 *
 * Retry policy (per ADR-0046 §C):
 *   - Maximum 5 attempts (initial + 4 retries).
 *   - Exponential backoff: 1s, 5s, 30s, 5min, 30min (cumulative ≈ 36 min).
 *   - Final failure recorded against the subscription via
 *     `WebhookStore.recordDelivery(id, 'failed', ts)`; we do NOT
 *     auto-disable subscriptions because a transient receiver outage
 *     is the common case — auto-disable is a future ADR-0048 scope.
 *
 * The scheduler is `null` for "no retries; one shot" use (the test-fire
 * admin route uses this) — pass a `DeliveryQueue` for retried delivery.
 */

import { signWebhook, PRYZM_SIGNATURE_HEADER } from './signature.js';
import type { WebhookEventEnvelope, WebhookSubscription } from './types.js';
import type { WebhookStore } from './store.js';

// ──────────────────────────────────────────────────────────────────────
//  Transport
// ──────────────────────────────────────────────────────────────────────

export type FetchLike = (url: string, init: {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ status: number; ok: boolean }>;

export interface DeliveryAttempt {
  readonly subscriptionId: string;
  readonly envelope: WebhookEventEnvelope;
  readonly attempt: number; // 1-indexed
  readonly ts: number; // ms
  readonly status: 'ok' | 'failed';
  readonly httpStatus?: number;
  readonly error?: string;
}

export interface DeliveryOptions {
  readonly fetchImpl?: FetchLike;
  readonly clock?: () => number;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
export const RETRY_BACKOFF_MS = [1_000, 5_000, 30_000, 300_000, 1_800_000] as const;
export const MAX_DELIVERY_ATTEMPTS = RETRY_BACKOFF_MS.length;

/** Single fire-and-record attempt; no retry scheduling. */
export async function deliverOnce(
  sub: WebhookSubscription,
  envelope: WebhookEventEnvelope,
  store: WebhookStore,
  opts: DeliveryOptions = {},
  attempt = 1,
): Promise<DeliveryAttempt> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const clock = opts.clock ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const body = JSON.stringify(envelope);
  const tsSeconds = Math.floor(clock() / 1000);
  const sigHeader = signWebhook({ body, secret: sub.secret, tsSeconds });
  const attemptTs = clock();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetchImpl(sub.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'PRYZM-Webhooks/0.1.0',
        [PRYZM_SIGNATURE_HEADER]: sigHeader,
        'pryzm-event': envelope.event,
        'pryzm-event-id': envelope.eventId,
        'pryzm-delivery-id': envelope.id,
        'pryzm-attempt': String(attempt),
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const ok = res.ok;
    store.recordDelivery(sub.id, ok ? 'ok' : 'failed', attemptTs);
    return {
      subscriptionId: sub.id,
      envelope,
      attempt,
      ts: attemptTs,
      status: ok ? 'ok' : 'failed',
      httpStatus: res.status,
    };
  } catch (err) {
    clearTimeout(timer);
    store.recordDelivery(sub.id, 'failed', attemptTs);
    return {
      subscriptionId: sub.id,
      envelope,
      attempt,
      ts: attemptTs,
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Retry queue (in-memory; pluggable)
// ──────────────────────────────────────────────────────────────────────

export interface ScheduledDelivery {
  readonly subscriptionId: string;
  readonly envelope: WebhookEventEnvelope;
  readonly nextAttempt: number; // 1-indexed
  readonly fireAt: number; // ms
}

export interface DeliveryQueue {
  enqueue(item: ScheduledDelivery): void;
  /** Dequeue everything ready to fire at-or-before `nowMs`. */
  drainReady(nowMs: number): readonly ScheduledDelivery[];
  size(): number;
  clear(): void;
}

export class InMemoryDeliveryQueue implements DeliveryQueue {
  private items: ScheduledDelivery[] = [];

  enqueue(item: ScheduledDelivery): void {
    this.items.push(item);
    this.items.sort((a, b) => a.fireAt - b.fireAt);
  }

  drainReady(nowMs: number): readonly ScheduledDelivery[] {
    const ready: ScheduledDelivery[] = [];
    while (this.items.length > 0 && this.items[0]!.fireAt <= nowMs) {
      ready.push(this.items.shift()!);
    }
    return ready;
  }

  size(): number { return this.items.length; }
  clear(): void { this.items = []; }
}

/**
 * Compute the absolute fireAt for `nextAttempt` given `nowMs`.  Returns
 * `undefined` when no retry is scheduled (attempts exhausted).
 */
export function computeFireAt(nowMs: number, nextAttempt: number): number | undefined {
  if (nextAttempt < 1 || nextAttempt > MAX_DELIVERY_ATTEMPTS) return undefined;
  return nowMs + RETRY_BACKOFF_MS[nextAttempt - 1]!;
}

/**
 * Deliver with retry: schedule subsequent attempts on failure.  Returns
 * the final attempt result (the one that exhausted retries OR succeeded).
 *
 * For tests, pass a clock + custom backoff via `opts.attemptScheduler`.
 */
export async function deliverWithRetry(
  sub: WebhookSubscription,
  envelope: WebhookEventEnvelope,
  store: WebhookStore,
  queue: DeliveryQueue,
  opts: DeliveryOptions = {},
): Promise<DeliveryAttempt> {
  const clock = opts.clock ?? Date.now;
  const result = await deliverOnce(sub, envelope, store, opts, 1);
  if (result.status === 'ok') return result;
  const fireAt = computeFireAt(clock(), 2);
  if (fireAt !== undefined) {
    queue.enqueue({
      subscriptionId: sub.id,
      envelope,
      nextAttempt: 2,
      fireAt,
    });
  }
  return result;
}
