/**
 * @pryzm/webhooks — schemas + core types.
 *
 * Source authority:
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S66
 *     PROCESS-TRACKER row "Webhooks + 3C demo + legacy apps/editor deletion"
 *   - ADR-0046 (S66 — webhooks composition)
 *
 * Wire-format compatibility: signatures follow Stripe's scheme so
 * receivers built for that ecosystem (Make.com, Zapier, n8n, Pipedream,
 * etc.) can be pointed at PRYZM out-of-the-box.
 */

import { z } from 'zod';

// ──────────────────────────────────────────────────────────────────────
//  Event-name catalogue (closed set; additions need an ADR amendment)
// ──────────────────────────────────────────────────────────────────────

/**
 * The fixed set of webhook event names the gateway emits.  Subscription
 * `events` arrays are validated against this list — unknown names are
 * rejected with `invalid_event` so a typo never silently subscribes to
 * nothing.
 */
export const WEBHOOK_EVENT_NAMES = [
  'project.created',
  'project.updated',
  'project.deleted',
  'project.exported',
  'project.imported',
  'ai.workflow.completed',
  'ai.workflow.failed',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENT_NAMES)[number];

export const WebhookEventNameSchema = z.enum(WEBHOOK_EVENT_NAMES);

// ──────────────────────────────────────────────────────────────────────
//  Subscription record
// ──────────────────────────────────────────────────────────────────────

/**
 * A subscription is a (workspace, url, events, secret) tuple owned by
 * an admin.  `secret` is opaque to the receiver-side verifier; we sign
 * each delivery with HMAC-SHA256(secret, body) so the receiver can
 * verify authenticity without sharing tokens with us.
 */
export const WebhookSubscriptionSchema = z.object({
  id: z.string().min(1).max(64),
  workspaceId: z.string().min(1).max(64),
  url: z.string().url().max(2048),
  secret: z.string().min(16).max(256),
  events: z.array(WebhookEventNameSchema).min(1).max(WEBHOOK_EVENT_NAMES.length),
  active: z.boolean(),
  createdBy: z.string().min(1).max(128),
  createdAt: z.number().int().nonnegative(),
  description: z.string().max(500).optional(),
  lastDeliveryAt: z.number().int().nonnegative().optional(),
  lastDeliveryStatus: z.enum(['ok', 'failed', 'never']).optional(),
});

export type WebhookSubscription = z.infer<typeof WebhookSubscriptionSchema>;

/** Body shape accepted by `createSubscription` (server fills id/createdAt). */
export const CreateWebhookBodySchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(WebhookEventNameSchema).min(1),
  description: z.string().max(500).optional(),
});

export type CreateWebhookBody = z.infer<typeof CreateWebhookBodySchema>;

// ──────────────────────────────────────────────────────────────────────
//  Event envelope (the payload sent to the receiver)
// ──────────────────────────────────────────────────────────────────────

/**
 * Envelope shape sent in the POST body to the subscription URL.
 * `id` is delivery-stable (same id on retries), `eventId` is event-stable
 * (same id when the same event is fanned-out to N subscribers).
 */
export const WebhookEventEnvelopeSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  event: WebhookEventNameSchema,
  workspaceId: z.string().min(1),
  projectId: z.string().min(1).optional(),
  ts: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
});

export type WebhookEventEnvelope = z.infer<typeof WebhookEventEnvelopeSchema>;

// ──────────────────────────────────────────────────────────────────────
//  Errors
// ──────────────────────────────────────────────────────────────────────

export class InvalidSubscriptionError extends Error {
  public override readonly name = 'InvalidSubscriptionError';
  public readonly issues: readonly z.ZodIssue[];
  constructor(issues: readonly z.ZodIssue[]) {
    super(`InvalidSubscriptionError: ${issues.length} issue(s)`);
    this.issues = issues;
  }
}

export class SubscriptionNotFoundError extends Error {
  public override readonly name = 'SubscriptionNotFoundError';
  constructor(public readonly id: string) {
    super(`SubscriptionNotFoundError: ${id}`);
  }
}
