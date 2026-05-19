# SPEC-08 — Security, Multi-Tenancy & Collaboration

| Field | Value |
|---|---|
| Status | Active — normative |
| Version | 1.0 |
| Date | 2026-04-27 |
| Owner | Architecture lead |
| Closes | `CRITICAL-REVIEW-2026-04-27.md §B8` |
| Phases | 1A (RLS hardening), 1D (M12 alpha gate), 2D (M24 beta + permission matrix), 3D (M36 GA + SSO/SCIM/audit log streaming for C3) |
| Required ADRs | ADR-021 (enterprise security & data residency) |

> The Contract 07 supersession bisected security (kept) from collaboration (replaced by Yjs). This spec defines what survives, what's added for C3 (large enterprise), the role/permission matrix that today's permission model lacks, audit-log streaming, and the threat model.

---

## §1 Trust boundaries

```
Browser (untrusted)
   │  TLS 1.3
   ▼
Cloudflare WAF + rate limiter
   │
   ▼
Edge functions (auth, signed URL minting)
   │
   ▼
Origin (Express + Yjs server in EU/US regions)
   │   ↘ Postgres (RLS-enforced)
   │   ↘ R2 (per-project prefix isolation)
   │   ↘ AI worker (privileged; holds LLM keys)
   ▼
Plugin sandbox (Web Worker; capability-restricted)
```

Every entry is JWT-authenticated and per-tenant-scoped at every storage layer.

---

## §2 Authentication (survives from Contract 07 Part A §1)

### §2.1 Methods
- Email + password (PBKDF2 with 600k iterations).
- Magic link (15 min TTL).
- OAuth: Google, GitHub, Microsoft (default; covers solo/team).
- **SSO via SAML 2.0 + OIDC** for Enterprise (closes B8 gap "no SSO").

### §2.2 JWT
- HS512, server-side secret rotated quarterly.
- Carries `actor_id`, `tenant_id`, `roles[]`, `seat_kind`, `iat`, `exp`.
- TTL 15 min; refresh-token rotation; refresh TTL 14 days.
- Revocation list cached in edge for instant lockout.

### §2.3 MFA (closes B8 gap "no MFA")
- TOTP (RFC 6238) for all paid tiers; mandatory for Enterprise admin role.
- WebAuthn / passkeys (Phase 3D).
- SMS fallback NOT supported (phishing risk).

---

## §3 Role / permission matrix (closes B8 gap "no role / permission matrix")

### §3.1 Role hierarchy
- **Owner** — billing + member management + everything below.
- **Admin** — member management + everything below.
- **Editor** — read/write all elements + sheets + AI.
- **Limited Editor** — read all; write only non-structural elements.
- **Reviewer** — read + comment + create markups.
- **Viewer** — read only.

### §3.2 Per-element permission gates
| Action | Owner | Admin | Editor | Limited Editor | Reviewer | Viewer |
|---|---|---|---|---|---|---|
| Create non-structural element | ✓ | ✓ | ✓ | ✓ | — | — |
| Create structural element (`Wall.structural`, `Column.loadBearing`, `Beam.loadBearing`) | ✓ | ✓ | ✓ | — | — | — |
| Modify own element | ✓ | ✓ | ✓ | (non-structural only) | — | — |
| Modify others' element | ✓ | ✓ | ✓ | (non-structural only) | — | — |
| Delete element | ✓ | ✓ | ✓ | (non-structural only) | — | — |
| Place comment / markup | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Approve AI proposal | ✓ | ✓ | ✓ | (non-structural only) | — | — |
| Manage members | ✓ | ✓ | — | — | — | — |
| Manage billing | ✓ | — | — | — | — | — |
| Export `.pryzm` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Export PDF / DXF / IFC | ✓ | ✓ | ✓ | ✓ | ✓ | — |

### §3.3 Enforcement points
- L2 command handler: rejects with `PermissionError` before reaching L3.
- L3 soft-lock: rejects lock acquisition for forbidden elements.
- API endpoint: rejects requests at the edge.
- UI: disables / hides actions the actor cannot take.
- All four checks are required (defense in depth); a successful command requires all to pass.

### §3.4 Custom roles (Enterprise)
- Tenant admin can define custom roles by composing capabilities.
- Capabilities are the rows in §3.2 + per-discipline filters (e.g. "MEP-only editor").

---

## §4 Postgres RLS (survives from Contract 07 Part A §2; hardened)

### §4.1 Universal pattern
Every table that carries `project_id` or `tenant_id` has RLS:
```sql
CREATE POLICY project_member_read ON <table>
  FOR SELECT USING (project_id IN (
    SELECT project_id FROM project_members
    WHERE actor_id = auth.uid() AND role IN ('owner','admin','editor','limited_editor','reviewer','viewer')
  ));

CREATE POLICY project_editor_write ON <table>
  FOR INSERT/UPDATE/DELETE USING (project_id IN (
    SELECT project_id FROM project_members
    WHERE actor_id = auth.uid() AND role IN ('owner','admin','editor','limited_editor')
  ));
```

### §4.2 Service-role-key removal (closes B8 gap "RLS leaks via service-role-key")
- The service-role-key is **forbidden in client code**. (Contract 07 violation today; remediated by S08.)
- Any server-side code using service-role-key MUST be in `apps/sync-server/`, `apps/bake-worker/`, `apps/ai-worker/`, or edge functions — never bundled into the editor.
- CI gate (P9 add-on): repository-wide grep for `SUPABASE_SERVICE_ROLE_KEY` outside the allow-list folders fails the build.

### §4.3 Per-project R2 prefix isolation
- All chunks live under `chunks/<projectId>/...`.
- Signed URLs scope to a specific prefix and expire in 5 min.
- The signing function refuses to sign URLs across project boundaries.

---

## §5 SCIM provisioning (closes B8 gap "no SCIM")

### §5.1 SCIM 2.0 endpoints
- `POST /scim/v2/Users` — provision user.
- `PUT /scim/v2/Users/{id}` — update user.
- `DELETE /scim/v2/Users/{id}` — deprovision (sets `active: false`; 30-day soft delete).
- `POST /scim/v2/Groups` — group sync (mapped to roles).

### §5.2 Identity providers
- Okta, Azure AD, Google Workspace, OneLogin tested and documented.
- Just-in-time provisioning on first SAML/OIDC login.

---

## §6 Rate limiting & budgets

### §6.1 API rate limits (per JWT)
| Endpoint | Free | Solo | Team | Enterprise |
|---|---|---|---|---|
| `/api/projects/*` reads | 60/min | 600/min | 1200/min | configurable |
| `/api/projects/*` writes | 30/min | 300/min | 600/min | configurable |
| `/api/ai/invoke` | 10/day | 100/day | 1000/day | configurable |
| Sync WS messages | 1k/60s | 5k/60s | 5k/60s/seat | configurable |
| File downloads | 100/day | 1000/day | 1000/day/seat | configurable |

### §6.2 Burst & smoothing
- Token bucket per JWT; refill at the steady rate; burst = 10× steady rate up to 60 s window.
- Exceeded → 429 with `Retry-After`.

### §6.3 AI cost budgets
See SPEC-07 §6 for the dollar budgets and accounting.

---

## §7 Audit log streaming (closes B8 gap "no audit-log streaming")

### §7.1 What's logged
- Every authn event (login, logout, MFA challenge, password change).
- Every authz failure (permission denied with context).
- Every membership change.
- Every export (`.pryzm`, PDF, DXF, IFC).
- Every AI proposal approved/rejected with prompt SHA.
- Every billing event.
- Every admin action (role change, project deletion, tenant settings).

### §7.2 Storage
- `audit_log` table in Postgres; partitioned monthly; RLS = tenant-admin read-only.
- Retention: 1 year on free/solo, 7 years on team/enterprise (configurable).

### §7.3 Streaming
- Enterprise tenants can configure a webhook to receive `audit_log` events in near-real-time (seconds).
- Format: JSON Lines over HTTPS POST; HMAC-signed.
- Failure handling: retries with exponential backoff; if 24 h backlog, alert tenant admin.
- Receiver examples: Splunk HEC, Datadog Logs, custom SIEM.

---

## §8 Data residency (closes B8 gap "no data-residency story for C3")

### §8.1 Regions
- EU-West (Frankfurt) — for EU-based tenants and GDPR commitments.
- US-East (Virginia) — default.
- AP-Southeast (Singapore) — Phase 3D add-on.

### §8.2 Tenant pinning
- Tenant region is selected at signup; cannot be changed without a migration ticket.
- All Postgres + R2 + sync-server traffic for that tenant stays in-region.
- AI worker calls to Anthropic/OpenAI go through the in-region proxy (provider region selected to match: e.g. EU-West tenants use Anthropic EU).

### §8.3 Self-host (D7 enterprise variant)
- Customer-deployable bundle: Postgres + R2-compatible (MinIO) + sync-server + AI worker; runs in customer VPC.
- Customer holds the master keys for at-rest encryption.
- Customer-supplied LLM credentials.
- Software as a sealed artefact; signed manifest.

---

## §9 Threat model

### §9.1 Top threats addressed
- Credential theft → MFA + WebAuthn (Phase 3D).
- IDOR (project_id manipulation) → RLS + signed-URL prefix isolation (S08).
- Plugin escape → Web Worker sandbox + manifest-declared permissions + capability-restricted SDK.
- AI prompt injection from project content → AI plugins must sanitise; CI test asserts.
- Supply chain (npm) → `pnpm audit` + signed lockfile + Renovate; gate on M12.
- Insider threat → audit-log streaming (§7) + per-tenant data residency (§8).

### §9.2 Top threats out of scope (v1)
- DDoS beyond what Cloudflare handles.
- Side-channel attacks on cloud workers (in vendor's scope).
- Client device compromise.

---

## §10 OpenTelemetry instrumentation
- `auth.login` — input `(method)`; output `(success, mfaUsed)`.
- `auth.token.refresh` — output `(durationMs)`.
- `auth.token.revoke`.
- `permission.check` — input `(actorId, resource, action)`; output `(granted, role)`.
- `rls.policy.evaluated` — input `(table, action)`; output `(rowsReturned, durationMs)`.
- `audit.event.emit` — input `(category)`.
- `audit.streaming.send` — input `(tenantId)`; output `(durationMs, success)`.
- `rate-limit.bucket.exceeded` — input `(scope, key)`.

---

## §11 Phase rollout

| Sprint | Deliverable |
|---|---|
| S04 | Service-role-key audit & isolation (no client bundles). |
| S08 | RLS audit on every new table; CI gate active. |
| S22 (Phase 1D, M12 alpha gate) | Solo/Team auth, MFA TOTP, signed URLs, rate-limit baseline. |
| S43 | Role/permission matrix (§3) live. |
| S46 | Audit log table + per-tenant view. |
| S48 (Phase 2D, M24 beta gate) | Permission matrix complete; Yjs + soft locks live. |
| S55 | SSO (SAML/OIDC). |
| S58 | SCIM. |
| S64 | Audit log streaming. |
| S70 | Data residency (multi-region). |
| S72 (Phase 3D, M36 GA) | WebAuthn; threat-model review pass; pen test. |

---

## §12 Cross-references
- Conflict mapping: `CONFLICT-ANALYSIS.md §3.3` (collab supersession), §6.11 (data residency / SSO open question).
- Sync interaction: SPEC-03.
- AI cost guardrails: SPEC-07 §6.
- Phase deliverables: across all phases; key gates at M12, M24, M36.
- ADR: `adrs/ADR-021-enterprise-security-data-residency.md`.
