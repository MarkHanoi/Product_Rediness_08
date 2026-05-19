/**
 * @pryzm/webhooks — subscription store.
 *
 * In-memory implementation today; the api-gateway injects this via
 * dependency injection so a Postgres adapter can land in S67 without
 * touching the routes (per ADR-0046 §B).
 */

import { ulid } from 'ulid';
import { randomBytes } from 'node:crypto';
import {
  CreateWebhookBodySchema,
  InvalidSubscriptionError,
  SubscriptionNotFoundError,
  WebhookSubscriptionSchema,
  type CreateWebhookBody,
  type WebhookEventName,
  type WebhookSubscription,
} from './types.js';

export interface CreateSubscriptionInput {
  readonly workspaceId: string;
  readonly createdBy: string;
  readonly body: unknown;
}

export interface WebhookStore {
  create(input: CreateSubscriptionInput): WebhookSubscription;
  get(id: string): WebhookSubscription | undefined;
  list(opts?: { workspaceId?: string }): readonly WebhookSubscription[];
  delete(id: string): boolean;
  setActive(id: string, active: boolean): WebhookSubscription;
  /** Snapshot of all subscriptions matching `event` for a workspace. */
  matching(workspaceId: string, event: WebhookEventName): readonly WebhookSubscription[];
  /** Record the outcome of a delivery attempt (last-attempt only). */
  recordDelivery(id: string, status: 'ok' | 'failed', ts: number): void;
  size(): number;
  clear(): void;
}

export interface InMemoryWebhookStoreOptions {
  /** Optional clock override for tests. */
  readonly clock?: () => number;
  /** Optional id generator override (defaults to ulid). */
  readonly idFactory?: () => string;
  /** Optional secret factory (defaults to 32 random bytes hex). */
  readonly secretFactory?: () => string;
}

export class InMemoryWebhookStore implements WebhookStore {
  private readonly subs = new Map<string, WebhookSubscription>();
  private readonly clock: () => number;
  private readonly idFactory: () => string;
  private readonly secretFactory: () => string;

  constructor(opts: InMemoryWebhookStoreOptions = {}) {
    this.clock = opts.clock ?? Date.now;
    this.idFactory = opts.idFactory ?? (() => `wh_${ulid()}`);
    this.secretFactory = opts.secretFactory ?? (() => randomBytes(32).toString('hex'));
  }

  create(input: CreateSubscriptionInput): WebhookSubscription {
    const parsed = CreateWebhookBodySchema.safeParse(input.body);
    if (!parsed.success) {
      throw new InvalidSubscriptionError(parsed.error.issues);
    }
    const body: CreateWebhookBody = parsed.data;

    const candidate: WebhookSubscription = {
      id: this.idFactory(),
      workspaceId: input.workspaceId,
      url: body.url,
      secret: this.secretFactory(),
      events: body.events,
      active: true,
      createdBy: input.createdBy,
      createdAt: this.clock(),
      ...(body.description !== undefined ? { description: body.description } : {}),
      lastDeliveryStatus: 'never',
    };

    // Defensive: re-validate the assembled record so any drift between
    // CreateWebhookBody and WebhookSubscription is caught at write-time.
    const sanity = WebhookSubscriptionSchema.safeParse(candidate);
    if (!sanity.success) {
      throw new InvalidSubscriptionError(sanity.error.issues);
    }

    this.subs.set(candidate.id, candidate);
    return candidate;
  }

  get(id: string): WebhookSubscription | undefined {
    return this.subs.get(id);
  }

  list(opts: { workspaceId?: string } = {}): readonly WebhookSubscription[] {
    const all = [...this.subs.values()].sort((a, b) => a.createdAt - b.createdAt);
    if (opts.workspaceId) return all.filter((s) => s.workspaceId === opts.workspaceId);
    return all;
  }

  delete(id: string): boolean {
    return this.subs.delete(id);
  }

  setActive(id: string, active: boolean): WebhookSubscription {
    const existing = this.subs.get(id);
    if (!existing) throw new SubscriptionNotFoundError(id);
    const updated: WebhookSubscription = { ...existing, active };
    this.subs.set(id, updated);
    return updated;
  }

  matching(workspaceId: string, event: WebhookEventName): readonly WebhookSubscription[] {
    return this.list({ workspaceId }).filter(
      (s) => s.active && s.events.includes(event),
    );
  }

  recordDelivery(id: string, status: 'ok' | 'failed', ts: number): void {
    const existing = this.subs.get(id);
    if (!existing) return; // delivery for a deleted subscription is a no-op
    this.subs.set(id, { ...existing, lastDeliveryAt: ts, lastDeliveryStatus: status });
  }

  size(): number {
    return this.subs.size;
  }

  clear(): void {
    this.subs.clear();
  }
}
