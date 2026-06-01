# ADR-028 — Authority Unification (one permission model)

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `GAP-REVIEW-2026-04-27.md §29 #21,#22` (three permission models in flight: Stripe entitlements + Supabase RLS + custom JWT roles) |
| Required by | Sprint S31 (security keys removal — Phase 2B start; Phase 2A holds no gap-closure work per 2026-04-27 directive) and S43 (Supabase production cutover) |
| Owner | Architecture lead + Security |
| Implementation | `apps/api-gateway/src/auth/`; `apps/api-gateway/src/authz/`; per-table RLS in Supabase |
| Spec dependency | `SPEC-08-SECURITY.md` (extended); `SPEC-15-DEPLOYMENT-TOPOLOGY.md` §5; `[strategic ADR-021]` |

---

## Context

PRYZM today has three overlapping authority systems:

1. **Stripe entitlements** — `pryzm_users.plan` cached from Stripe; gates which features the user can pay for.
2. **Supabase RLS** — per-row policies on tables; gates direct DB access for client SDK calls.
3. **Custom JWT roles** — `role: 'owner'|'editor'|'viewer'` etc. in the JWT; gates server-side API behaviour.

These three answer overlapping questions ("can this user do X?") with different mechanisms, and the corpus regularly conflates them. They are all real, all needed in some form, but their **coordination is undocumented** — and `service_role` keys leak across at least three route handlers (per `SPEC-08 §6`).

This ADR ratifies the **single coordination model** — one decision graph, three enforcement points.

---

## Decision

### Part A — three layers, one decision graph

The three systems become three **enforcement layers** of one **authorisation decision**.

```
                   ┌────────────────────────────────┐
                   │   AuthZ Decision (the answer)   │
                   └──────────────┬─────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
       ┌───────▼──────┐  ┌────────▼─────────┐  ┌─────▼──────┐
       │ Plan / Entitl│  │ Workspace Role  │  │ Resource    │
       │ (Stripe)     │  │ (custom JWT)    │  │ Access RLS  │
       │              │  │                 │  │ (Postgres)  │
       └──────────────┘  └─────────────────┘  └─────────────┘
       can-the-plan-do-X    has-the-role-X       can-this-row-be-read
```

Every authorisation check is a triple lookup. The **gateway** evaluates the triple in one function and returns one decision. Routes never check "directly" — they call `authz.can(action, resource, ctx)`.

### Part B — `Action × Resource` taxonomy

```ts
type Action =
  | 'project:create' | 'project:read' | 'project:write' | 'project:delete'
  | 'project:share' | 'project:export' | 'project:archive'
  | 'view:create' | 'view:read' | 'view:write' | 'view:delete'
  | 'sheet:create' | 'sheet:read' | 'sheet:write' | 'sheet:delete' | 'sheet:publish'
  | 'plugin:install' | 'plugin:invoke' | 'plugin:uninstall'
  | 'ai:invoke' | 'ai:approve' | 'ai:reject'
  | 'workspace:invite' | 'workspace:configure' | 'workspace:billing'
  | 'admin:audit' | 'admin:residency' | 'admin:dlp';

type Resource = ProjectRef | ViewRef | SheetRef | PluginRef | WorkspaceRef | UserRef;
```

The full table lives in `packages/authz/policy.ts` (Phase 2C ship).

### Part C — `Plan` matrix (Stripe entitlements)

Plan rows control **which actions are even permissible at all** for the workspace.

| Plan | `project:create` cap | `ai:invoke` | `plugin:install` 3rd-party | `admin:dlp` |
|---|---|---|---|---|
| Free | 3 / user | Haiku, $0.50/mo | n/a | n/a |
| Personal | 25 / user | Sonnet, $5/mo | n/a | n/a |
| Team | unlimited | Sonnet, per-project budget | yes | n/a |
| Enterprise | unlimited | configurable | yes | yes |

A plan check returns `'allowed' | 'denied' | 'denied-budget' | 'denied-not-on-plan'` with the upsell affordance per SPEC-28.

### Part D — `Role` matrix (workspace + project roles)

Roles are project-, view-, or element-class-scoped per `[strategic ADR-011]`. v1 = three roles: `owner`, `editor`, `viewer`. Per-element instance is post-GA.

| Role | project:read | project:write | project:share | sheet:publish | workspace:invite |
|---|:---:|:---:|:---:|:---:|:---:|
| Owner | ✓ | ✓ | ✓ | ✓ | ✓ |
| Editor | ✓ | ✓ | ✗ | ✓ | ✗ |
| Viewer | ✓ | ✗ | ✗ | ✗ | ✗ |
| Workspace admin | inherits all + `admin:*` | | | | |

### Part E — `RLS` (the row-level fence)

Postgres RLS is the **last line of defence**, not the primary gate. Every table that holds project / user data has a policy of the shape:

```sql
CREATE POLICY project_member_select ON projects
  FOR SELECT
  USING (id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()));
```

RLS is sized so that **even if** the gateway has a bug and lets a wrong action through, no cross-tenant data leaks.

### Part F — the service-role-key removal

Today, three route handlers use Supabase **service-role** keys to bypass RLS for server-internal work. This is forbidden post-S31.

Replacement pattern: `apps/api-gateway` issues short-lived (5-min) **service tokens** signed by `SESSION_SECRET`, scoped to one action × resource. Workers (`bake-worker`, `ai-worker`, `sync-server`) accept those tokens; they never hold a Supabase service-role key.

CI gate `pnpm spec:audit-secrets` greps for `service_role` references; failures block PRs from S31 onward.

### Part G — audit trail (per ADR-021)

Every `authz.can(...)` call emits a structured log:
```json
{ "ts": "...", "actor": "...", "action": "...", "resource": "...", "decision": "allowed|denied", "reason": "plan-budget-exhausted | role-insufficient | rls-mismatch | ok" }
```

These rows become the SOC2 audit trail (per `[strategic ADR-021]` §7), retained for the customer-visible audit window.

---

## Consequences

**Positive:**
- One function (`authz.can`) is the decision; auditing + testing concentrate there.
- Service-role-key footprint goes to zero.
- Three systems still exist (because their underlying questions are different) but their interaction is canonical.
- Plan / role / RLS each have their own correctness; no overlap = no contradictions.

**Negative:**
- Three checks per request adds ~3–5 ms p95 to gated reads. Mitigated by per-request cache.
- The `Action × Resource` taxonomy is large; takes time to populate fully. Phase 2C ships the necessary subset; Phase 3D fills the long tail.
- RLS policies per table is operational overhead; mitigated by a generator that emits the standard policy from a per-table declaration.

---

## Alternatives considered

### A1 — Drop Supabase RLS; rely on gateway alone
Rejected: defence-in-depth principle. RLS protects against gateway bugs.

### A2 — Drop the custom JWT roles; encode roles in Stripe metadata
Rejected: Stripe is for billing; mixing roles into Stripe metadata creates a one-API-call-per-authz round trip and tight coupling.

### A3 — Use Casbin / OSO / OPA
Rejected for v1: each is a powerful policy engine but adds operational complexity. Hand-rolled `authz.can` is sufficient and inspectable. Reconsidered post-GA if scope grows.

---

## Phase rollout

- S31 — ADR-028 land (Phase 2B start; Phase 2A holds no gap-closure); `Action × Resource` taxonomy v0 in `packages/authz/`; service-role-key removal; CI gate `pnpm spec:audit-secrets` lit; service-token issuer in gateway.
- S32 — RLS policies generator; per-table declarative policy → SQL migration.
- S38 — `authz.can` performance test (must p95 < 5 ms cached); per-request cache lit.
- S43 — production cutover; `authz.can` in every gateway route.
- S55 — audit-log schema lit per ADR-021.
- S65 — Enterprise admin UI for plan / role overrides.
- S72 (M36 GA) — full taxonomy populated; SOC2 evidence audit-trail captured.
