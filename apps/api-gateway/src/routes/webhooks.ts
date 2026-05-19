/**
 * @pryzm/api-gateway — /v1/admin/webhooks/* routes (S66, ADR-0046).
 *
 * Subscriber-management surface for the public Webhooks feature.
 *
 * All routes:
 *   • require an admin role (`admin` or `owner`) via `requireAdmin`
 *   • require scope `project:read` for reads and `project:write` for writes
 *   • are rate-limited per ADR-018
 *
 * Real-time event fan-out (the "deliver every committed project.event
 * to every matching subscription" loop) is OUT OF SCOPE for S66 D1
 * per ADR-0046 §F — that wiring lives in the sync-server adapter and
 * lands in S67 D2.  S66 D1 ships the subscription store + signing +
 * delivery primitives + admin REST surface + a `POST .../test` route
 * that fires a synthetic envelope so admins can verify their receiver
 * end-to-end before live events arrive.
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter, json } from 'express';
import { z } from 'zod';
import { ulid } from 'ulid';
import { requireScopes } from '@pryzm/api-rbac';
import { rateLimit, type RateLimitRegistry } from '@pryzm/rate-limit';
import {
  CreateWebhookBodySchema,
  InvalidSubscriptionError,
  WEBHOOK_EVENT_NAMES,
  WebhookEventNameSchema,
  deliverOnce,
  type FetchLike,
  type WebhookEventEnvelope,
  type WebhookStore,
} from '@pryzm/webhooks';
import { requireAdmin, type GatewayAuthedRequest } from '../auth-shim.js';

export interface WebhooksRouterOptions {
  readonly store: WebhookStore;
  readonly reads: RateLimitRegistry;
  readonly writes: RateLimitRegistry;
  /** Injectable fetch for the test-fire route; defaults to globalThis.fetch. */
  readonly fetchImpl?: FetchLike;
  /** Injectable clock for deterministic test fires. */
  readonly clock?: () => number;
}

const SubIdSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/);
const SetActiveBodySchema = z.object({ active: z.boolean() });
const TestFireBodySchema = z
  .object({
    event: WebhookEventNameSchema.optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .optional();

const WORKSPACE_FROM_AUTH_HEADER = 'x-test-workspace';

function workspaceFor(req: Request): string {
  // Production: derive from the auth context (claim + scope).  Tests
  // pass `X-Test-Workspace` to avoid coupling to the not-yet-real
  // OAuth2 introspection.
  return (
    (req.header(WORKSPACE_FROM_AUTH_HEADER) ?? '').trim() ||
    ((req as Request & GatewayAuthedRequest).auth?.subject ?? 'anonymous')
  );
}

export function buildWebhooksRouter(opts: WebhooksRouterOptions): Router {
  const r = makeRouter();
  const readLimited = rateLimit({ kind: 'read', registry: opts.reads });
  const writeLimited = rateLimit({ kind: 'write', registry: opts.writes });
  const clock = opts.clock ?? Date.now;

  // ── Catalog ─────────────────────────────────────────────────────────

  r.get(
    '/v1/admin/webhooks/events',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (_req: Request, res: Response) => {
      res.json({ events: WEBHOOK_EVENT_NAMES });
    },
  );

  // ── List ────────────────────────────────────────────────────────────

  r.get(
    '/v1/admin/webhooks',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (req: Request, res: Response) => {
      const ws = workspaceFor(req);
      const list = opts.store.list({ workspaceId: ws });
      res.json({
        total: list.length,
        webhooks: list.map(redactSecret),
      });
    },
  );

  // ── Create ──────────────────────────────────────────────────────────

  r.post(
    '/v1/admin/webhooks',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    json({ limit: '16kb' }),
    (req: Request, res: Response) => {
      const parsed = CreateWebhookBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'invalid_body', issues: parsed.error.issues });
        return;
      }
      try {
        const subject = (req as Request & GatewayAuthedRequest).auth?.subject ?? 'anonymous';
        const sub = opts.store.create({
          workspaceId: workspaceFor(req),
          createdBy: subject,
          body: parsed.data,
        });
        // Return the secret EXACTLY ONCE on create (Stripe pattern) so
        // the admin can configure their receiver.  Subsequent reads
        // never expose it; rotation requires a delete-and-recreate.
        res.status(201).json(sub);
      } catch (err) {
        if (err instanceof InvalidSubscriptionError) {
          res.status(400).json({ error: 'invalid_subscription', issues: err.issues });
          return;
        }
        throw err;
      }
    },
  );

  // ── Get ─────────────────────────────────────────────────────────────

  r.get(
    '/v1/admin/webhooks/:id',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (req: Request, res: Response) => {
      const id = SubIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const sub = opts.store.get(id.data);
      if (!sub || sub.workspaceId !== workspaceFor(req)) {
        res.status(404).json({ error: 'webhook_not_found' });
        return;
      }
      res.json(redactSecret(sub));
    },
  );

  // ── Set active ──────────────────────────────────────────────────────

  r.put(
    '/v1/admin/webhooks/:id/active',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    json({ limit: '1kb' }),
    (req: Request, res: Response) => {
      const id = SubIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const body = SetActiveBodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'invalid_body', issues: body.error.issues });
        return;
      }
      const existing = opts.store.get(id.data);
      if (!existing || existing.workspaceId !== workspaceFor(req)) {
        res.status(404).json({ error: 'webhook_not_found' });
        return;
      }
      const updated = opts.store.setActive(id.data, body.data.active);
      res.json(redactSecret(updated));
    },
  );

  // ── Delete ──────────────────────────────────────────────────────────

  r.delete(
    '/v1/admin/webhooks/:id',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    (req: Request, res: Response) => {
      const id = SubIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const existing = opts.store.get(id.data);
      if (!existing || existing.workspaceId !== workspaceFor(req)) {
        res.status(404).json({ error: 'webhook_not_found' });
        return;
      }
      opts.store.delete(id.data);
      res.status(204).end();
    },
  );

  // ── Test fire ───────────────────────────────────────────────────────

  r.post(
    '/v1/admin/webhooks/:id/test',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    json({ limit: '4kb' }),
    async (req: Request, res: Response) => {
      const id = SubIdSchema.safeParse(req.params.id);
      if (!id.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const sub = opts.store.get(id.data);
      if (!sub || sub.workspaceId !== workspaceFor(req)) {
        res.status(404).json({ error: 'webhook_not_found' });
        return;
      }
      const body = TestFireBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({ error: 'invalid_body', issues: body.error.issues });
        return;
      }
      const event = body.data?.event ?? sub.events[0]!;
      const envelope: WebhookEventEnvelope = {
        id: `d_test_${ulid()}`,
        eventId: `e_test_${ulid()}`,
        event,
        workspaceId: sub.workspaceId,
        ts: clock(),
        data: body.data?.data ?? { test: true },
      };
      const fetchOpt = opts.fetchImpl !== undefined ? { fetchImpl: opts.fetchImpl } : {};
      const result = await deliverOnce(sub, envelope, opts.store, {
        ...fetchOpt,
        clock,
      });
      res.status(result.status === 'ok' ? 200 : 502).json({
        delivery: result,
        envelope,
      });
    },
  );

  return r;
}

/** Strip the secret + return a public-safe view of the subscription. */
function redactSecret<T extends { readonly secret: string }>(sub: T): Omit<T, 'secret'> & { secret: '__redacted__' } {
  return { ...sub, secret: '__redacted__' as const };
}
