# ADR-0046 — S66 Webhooks composition

- **Status**: Accepted (sprint-scoped, S66)
- **Date**: 2026-04-28
- **Supersedes**: none
- **Related**: ADR-0041 (S65 public REST/WS surface), ADR-0042 (S65 AI public API), ADR-018 (rate-limiting registries), ADR-014 (loud-fail-soft)

## Context

S66 introduces the public **Webhooks** subsystem listed in
`phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md` §S66.  The
goal is to let admin callers register HTTPS receivers for project- and
AI-workflow lifecycle events, with cryptographically verifiable
delivery and bounded retry.  Several composition decisions affect both
the new `@pryzm/webhooks` package and the api-gateway adapter and
deserve to be pinned here so future sprints can rely on the contract.

## Decisions

### A. Standalone package `@pryzm/webhooks`

Webhook subscription, signing and delivery primitives live in a
dedicated workspace package, NOT inside `apps/api-gateway`.  This keeps
the gateway thin (its job is HTTP transport + auth) and makes the
primitives reusable from the upcoming sync-server fan-out adapter and
from any background worker that drains the retry queue.

The package exposes:

- `InMemoryWebhookStore` (subscription CRUD + workspace scoping + last-delivery memo).
- `signWebhook` / `verifyWebhook` (Stripe-style HMAC-SHA256).
- `deliverOnce`, `deliverWithRetry`, `InMemoryDeliveryQueue`,
  `computeFireAt` (delivery scheduling primitives).
- Closed event-name catalogue (`WEBHOOK_EVENT_NAMES`).

### B. In-memory store today, Postgres adapter in S67

The S66 deliverable ships `InMemoryWebhookStore` only.  Persistence is
deliberately deferred to S67 D2 (`packages/persistence-server`
adapter), exactly the same way the formula catalogue, ai-spend store
and admin-overrides store landed in S65 — proven adapter pattern, no
new ground broken, no migration risk to the public API contract.

### C. Stripe-style HMAC-SHA256 signing scheme

Header format:

```
Pryzm-Signature: t=<unix-ts-seconds>,v1=<hex-hmac-sha256>
```

Signed payload:

```
<unix-ts-seconds>.<raw-body>
```

Default replay tolerance: 300 s.  Multi-`v1=` support is the
secret-rotation primitive (24-hour overlap window).  Choosing Stripe's
wire format means receivers built for that ecosystem (Make.com,
Zapier, n8n, Pipedream, Sentry, …) can be pointed at PRYZM with a
trivial header-name swap, which de-risks the public launch
significantly.

### D. 5-attempt exponential backoff

Per `MAX_DELIVERY_ATTEMPTS = 5`, with backoffs of 1 s / 5 s / 30 s /
5 min / 30 min (`RETRY_BACKOFF_MS`).  Cumulative wall-clock budget
≈ 36 minutes.  This is the same envelope the marketplace-api retry
loop uses (S64 D1) and matches Stripe's published retry table closely
enough that operator intuition transfers.

### E. Admin-role + `project:write` scope gating

Webhook routes are gated on the **admin** or **owner** role in
addition to the `project:read` (reads) and `project:write` (writes)
OAuth2 scopes.  No new `webhook:manage` scope is introduced in S66 —
deferring that to ADR-0048 once we have evidence that some receivers
need write access without full project mutation.  Workspace isolation
is enforced at every route via `workspaceFor(req)` so subscriptions
never leak across tenants.

### F. Real-time fan-out is OUT OF SCOPE for S66 D1

The gateway ships subscription management + the `POST .../test` route
that fires a synthetic envelope.  The "every committed
`project.event` is dispatched to every matching subscription" loop is
documented as the S67 D2 deliverable (sync-server-side
`WebhookEventBroker` that observes the event log and calls
`deliverWithRetry`).  Gating fan-out behind a Postgres-backed store +
a worker process keeps S66 surgical and avoids shipping an in-memory
fan-out we'd have to rip out a sprint later.

### G. Secret returned exactly once on create

`POST /v1/admin/webhooks` returns the generated secret in the response
body once.  Every subsequent read replaces it with `__redacted__` so
the secret cannot be exfiltrated by re-reading the resource.  Rotation
is delete-and-recreate.  This matches the AWS-style "one-time secret
disclosure" pattern operators expect from comparable services.

## Consequences

- The api-gateway gains **6 new HTTP routes** (`/v1/admin/webhooks/*`)
  and one new injection (`webhookStore`).  When no store is injected
  the routes are not mounted, preserving the existing test surface.
- The OpenAPI spec adds the corresponding paths under
  `/v1/admin/webhooks*`; the SHA-256 pin in
  `packages/api-spec/__tests__/openapi-spec.test.ts` is updated
  accordingly.
- Real-time fan-out (S67 D2) will inject a `WebhookEventBroker` into
  the sync-server adapter; this ADR does NOT pin its API and S67 may
  refine it.
- Subscription persistence (S67 D2) will introduce
  `PostgresWebhookStore` implementing the same `WebhookStore`
  interface; no route change required.
