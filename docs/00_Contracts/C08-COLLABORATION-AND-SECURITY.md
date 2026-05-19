# C08 — Collaboration & Security

> **Stamp**: 2026-05-03 · **Status**: CANONICAL — **Wave A19 amendment applied**  
> **Scope**: CRDT real-time sync, explicit conflict resolution, JWT authentication, permission model, rate limiting, CORS, and ISO 19650 project roles.  
> **Key principles**: P8 (sync conflicts explicit).  
> **References**: [ADR-002] CRDT bridge, [SPEC-03] sync, [ADR-019] soft-locks, [ADR-037/038] sovereignty/BYOK, [SPEC-34/35] enterprise security.

---

## §1 — Authentication

### §1.1 — Auth model

PRYZM uses **custom JWT/bcrypt authentication** issued by the server. It does NOT use Supabase Auth's JWT-issuance or session service, Firebase Auth, NextAuth, or any external token-issuance provider.

- Tokens are issued by `server/authStore.js` using `SESSION_SECRET` (HMAC-SHA256).
- Token payload: `{ sub: userId, email, iat, exp }`.
- Token lifetime: 7 days (configurable via `SESSION_SECRET_TTL`).
- Tokens are sent as `Authorization: Bearer <token>` on every API request.

**Mixed-backend deployment note ([ADR-045]):** In the standard Replit deployment, user-identity records (`pryzm_users` rows, owner seeding) are stored in and read from **Supabase via the service-role REST API** (`server/supabaseClient.js`). Project data (projects, versions, members) is stored in **Replit PG** (`server/pgClient.js`). PRYZM does NOT use Supabase Auth's JWT issuance — it issues its own tokens regardless of which backend is active. Consequences:
- `projects.owner_id` MUST NOT have a FK constraint referencing `pryzm_users(id)` in Replit PG (Replit PG's `pryzm_users` is empty in this deployment — see C05 §1.3.1).
- All server-side user lookups MUST go through `getSupabaseClient()`, never through `pgClient.query()` against `pryzm_users`.
- See [ADR-045] for the full split and future migration path.

### §1.2 — Auth middleware contract

`authMiddleware` in `server.js` is applied to all `/api/*` routes. It MUST:
- Accept and verify a Bearer token.
- Populate `req.auth = { userId, email }` on success.
- Set `req.auth = { userId: 'anonymous' }` when no valid token is present (never reject anonymously — the route handler decides whether anonymous access is permitted).

### §1.3 — OAuth (Google, Microsoft)

Google and Microsoft OAuth flows MUST use the `oauthService.js` PKCE flow. OAuth users are upserted into `pryzm_users` via `upsertOAuthUser`. The OAuth flow MUST NOT bypass the `SESSION_SECRET` JWT — it ultimately issues the same custom JWT.

---

## §2 — Permission Model

### §2.1 — ISO 19650 project roles

| Role | Capabilities |
|---|---|
| `owner` | All operations including delete, transfer, invite |
| `editor` | Create / edit / delete elements, manage versions |
| `reviewer` | Read + add BCF comments; cannot edit elements |
| `viewer` | Read-only; no writes |

Roles are stored in `project_members` (Supabase) or `project_members` (pg fallback). Every server route that mutates project data MUST call `hasPermission(callerRole, operation, isOwner)` before executing.

### §2.2 — Server-side ownership check

`canUserAccessProject(userId, projectId, { supabase, pgPool, projectsMap })` MUST be called on every Socket.io `join-project` event and every HTTP route that reads project data. Anonymous users MUST always be denied.

---

## §3 — Real-Time Collaboration (CRDT)

### §3.1 — Sync model (Differentiator D3)

> **Wave A19 amendment (2026-05-03) — Phase 2D COMPLETE**: `YjsDocAdapter`, `CRDTConflictResolver`, and `YjsProjectCache` are implemented and wired. Server-side `Y.applyUpdate` merge replaces the previous LWW path. The LWW-disclosure caveat from Wave A14 is **removed** — the system now uses real CRDT convergence. `SyncSlot.status: SyncStatus` added to `packages/runtime-composer/src/types.ts` with values `'connected' | 'disconnected' | 'syncing' | 'CONFLICTED'`. See `packages/sync-client/src/YjsDocAdapter.ts`, `CRDTConflictResolver.ts`, `apps/sync-server/src/YjsProjectCache.ts`, `apps/sync-server/src/presence/PresenceService.ts`.

PRYZM uses **Yjs CRDT + server linearization**. The sync contract:

- The sync client (`packages/sync-client/`) maintains a Yjs document per project via `YjsDocAdapter`.
- All element-property mutations MUST go through `YjsDocAdapter.applyCommand()` → Yjs Y.Map operations.
- Concurrent edits are merged server-side via `Y.applyUpdate` in `YjsProjectCache` — NOT by LWW.
- When the merge would produce semantically invalid state (e.g. two walls occupying the same ID with different geometry), the system MUST enter `CONFLICTED` project state (`SyncSlot.status = 'CONFLICTED'`) and surface `ConflictResolutionDialog`.
- Silent last-write-wins overwrite is **FORBIDDEN** (P8). All conflicts MUST go through `CRDTConflictResolver.mergeElement()`.
- `ConflictDisclosureBanner` MUST be shown when a concurrent edit overrides a local change before the user resolves it.

### §3.2 — Explicit conflicts (P8)

**Conflicts MUST be explicit.** Silent last-write-wins is forbidden. The contract:
- A conflict is any state where the CRDT merge cannot produce valid BIM semantics.
- The conflict dialog MUST show both versions (theirs / mine) with a diff view.
- The user MUST choose one version or a manual merge; the system MUST NOT choose automatically.
- Conflict resolution MUST produce a `source: 'undo'` command that is logged and undoable.

### §3.3 — Command log (collaboration catch-up)

`project_command_log` stores commands for catch-up replay (a late-joining user re-applies the last N commands). Invariants:
- Rows MUST be purged after 24 hours (probabilistic server-side + nightly job).
- Inserts are non-blocking: the broadcast to Socket.io peers MUST NOT wait for the DB write.
- The log MUST NOT be the sole persistence mechanism; it supplements snapshots.

### §3.4 — Presence

Real-time cursors and user-joined/left events MUST be relayed via Socket.io with server-authoritative `displayName` enrichment. The client MUST NOT send its own `displayName` — the server resolves it from `pryzm_users` and injects it.

---

## §4 — Rate Limiting

Three tiered limiters, all applied server-side (Express middleware):

| Limiter | Applies to | Limit |
|---|---|---|
| `globalLimiter` | All `/api/*` routes | 200 req / 15 min per IP |
| `apiLimiter` | `/api/v1/*`, `/v1/ai/*` | 60 req / min per IP |
| `aiLimiter` | `/api/anthropic/*`, `/api/ai/*` | 10 req / min per user |

The server MUST set `app.set('trust proxy', 1)` so `express-rate-limit` reads the real client IP from `X-Forwarded-For` (Replit's reverse proxy injects this header).

---

## §5 — Security Headers

Every response MUST include:

| Header | Value |
|---|---|
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `credentialless` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `SAMEORIGIN` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

CSP is configured per environment. The production CSP MUST block `unsafe-eval` and `unsafe-inline` for scripts. The AI proxy relay (`CF_WORKER_URL`) is the only permitted external API endpoint for AI calls — `api.anthropic.com` MUST NOT be accessible directly from the browser.

---

## §6 — CORS

CORS is configured via `server/corsPolicy.js`:
- In production: the allowlist is `ALLOWED_ORIGIN` environment variable (defaults to the Replit domain).
- In development: `*` is permitted.
- The Socket.io server uses the same `socketCorsOptions()` — never a separate config.

---

## §7 — Stripe Billing

Stripe integration handles subscription management (C1–C4 pricing tiers, `01-VISION.md §6`). The Stripe webhook MUST:
- Be registered at `/api/stripe/webhook` with the raw Buffer body (not parsed JSON).
- Verify the `Stripe-Signature` header using `STRIPE_WEBHOOK_SECRET` before processing.
- MUST NOT trust the event payload without signature verification.

---

## §8 — Sovereignty & BYOK

For C4 enterprise customers (Differentiator D6):
- EU-region customers default to an EU Supabase project (`SUPABASE_URL` pointing to EU endpoint).
- Customer-managed keys (BYOK) are supported via `SUPABASE_SERVICE_ROLE_KEY` set by the customer.
- Self-host deployments (Differentiator D7) use `DATABASE_URL` pointing to the customer's PostgreSQL instance.
- References: [ADR-037] sovereignty, [ADR-038] BYOK, [SPEC-34] data residency, [SPEC-35] enterprise security.
