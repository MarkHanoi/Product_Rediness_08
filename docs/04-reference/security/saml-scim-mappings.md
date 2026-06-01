# SAML / SCIM Attribute Mappings — Enterprise SSO

**Sprint introduced**: PRYZM 2 Phase 3D · S68 D7
**Spec ref**: `docs/03_PRYZM3/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 exit-criteria table row 8 — "SAML / SCIM mappings table per `[strategic ADR-021]` + SPEC-24 §1.1".
**Strategic anchor**: `[strategic ADR-021]` — Enterprise SSO model.
**Operational target**: "operational for at least 1 enterprise tenant" (S68 exit §3 row 5).

---

## §1 Purpose

This document is the **canonical mapping table** between identity-provider (IdP) assertions / SCIM resource attributes and PRYZM's internal user / group / project model. It governs:

- SAML 2.0 SSO login (Okta, Azure AD, OneLogin, Google Workspace, generic SAML).
- SCIM 2.0 user + group provisioning (RFC 7643 / RFC 7644).

**Status**: this is the **specification + mappings table**. The runtime adapter (`apps/api-gateway/src/sso/saml-adapter.ts` + `apps/api-gateway/src/scim/`) lands at S70 D8 self-host publish gate alongside the production OAuth2 resource-server wiring (per `docs/security/oauth2-review-2026-Q4.md` §3.1). This doc is the contract those modules will be built against.

---

## §2 SAML — assertion → PRYZM user mapping

### 2.1 Required claims

| SAML attribute (URI)                                                            | PRYZM field            | Required? | Notes                                                                                      |
| ------------------------------------------------------------------------------- | ---------------------- | --------- | ------------------------------------------------------------------------------------------ |
| `urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress` (NameID)               | `pryzm_users.email`    | Yes       | Used as login key; case-insensitive; must be unique per tenant.                            |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress`            | `pryzm_users.email`    | Yes (alternate) | Microsoft / Azure AD canonical claim name. Either NameID or this attribute MUST be present. |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name` (or `givenname` + `surname`) | `pryzm_users.name`     | Yes       | If only `givenname` + `surname` are present, concatenate with single space.                |
| `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role` (multi-valued)     | `project_members.role` | No        | If present, role values map per §2.3. Absent → user gets per-project default role at access time. |

### 2.2 Optional claims

| SAML attribute                              | PRYZM field                       | Notes                                                            |
| ------------------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `groups` / `memberOf`                       | (mapped via §3 SCIM groups)       | If SCIM is also configured, SCIM is authoritative; SAML claim used only as fallback. |
| `department`                                | `pryzm_users.metadata.department` | Free-text; surfaced in admin console.                            |
| `employeeId`                                | `pryzm_users.metadata.employee_id` | Indexed for SOC2 access-review reporting.                       |
| `tenantId` (Azure AD `tid`)                 | `tenant_bindings.idp_tenant_id`   | Used to multi-tenant the SSO config so one PRYZM org maps to exactly one IdP tenant. |

### 2.3 Role mapping (SAML → PRYZM project role)

PRYZM defines four project-scoped roles (per `apps/sync-server/src/authz/project-members.sql`):

| PRYZM role | Capability summary                                                  |
| ---------- | ------------------------------------------------------------------- |
| `owner`    | Full project rw + delete + member management.                       |
| `editor`   | Project rw on geometry + parameters; cannot delete project.         |
| `reviewer` | Project ro + comment + state-machine transitions on submitted versions only. |
| `viewer`   | Project ro only.                                                    |

Default mapping (applied if no IdP role is asserted, or `enterprise_default_role` config is set):

| Asserted role string (case-insensitive) | PRYZM role |
| --------------------------------------- | ---------- |
| `pryzm-admin`, `pryzm-owner`            | `owner`    |
| `pryzm-editor`, `editor`, `bim-author`  | `editor`   |
| `pryzm-reviewer`, `reviewer`, `qa`      | `reviewer` |
| `pryzm-viewer`, `viewer`, `read-only`   | `viewer`   |
| (anything else)                         | (rejected — login allowed but no project access until admin grants) |

Mapping table is overridable per tenant via the admin console (lands at S70 D8 alongside the runtime adapter).

### 2.4 Assertion validation rules

- Assertion `Issuer` MUST match the tenant's configured IdP entity ID.
- Assertion signature MUST validate against the tenant's configured X.509 certificate; certificate rotation handled via SCIM `Schemas/Tenant` PATCH per §3.4.
- Assertion `NotBefore` ≤ now ≤ `NotOnOrAfter`; clock skew tolerance ±5 minutes.
- Assertion `Audience` MUST equal `https://api.pryzm.com/sso/saml/<tenant-slug>`.
- `InResponseTo` MUST match the AuthnRequest ID issued by PRYZM (replay protection); IDs cached for 24 hours.

### 2.5 Just-in-time provisioning

If SCIM is **not** configured for a tenant, a successful SAML assertion auto-creates the `pryzm_users` row (JIT). If SCIM **is** configured, JIT is disabled — only SCIM `POST /Users` creates new users. This avoids the "user logs in via SAML but admin hasn't provisioned them in SCIM" race.

---

## §3 SCIM 2.0 — resource → PRYZM mapping

### 3.1 `User` resource (RFC 7643 §4.1)

| SCIM attribute                                  | PRYZM field                            | Notes                                                  |
| ----------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| `userName`                                      | `pryzm_users.email`                    | Authoritative login key; case-insensitive.             |
| `name.formatted` (or `givenName` + `familyName`) | `pryzm_users.name`                    | Same concatenation rule as §2.1.                       |
| `emails[primary=true].value`                    | `pryzm_users.email`                    | Must equal `userName`.                                 |
| `active`                                        | `pryzm_users.plan_status`              | `true` → `active`; `false` → `disabled`. Disabled users cannot log in. |
| `externalId`                                    | `pryzm_users.metadata.scim_external_id` | IdP-side stable identifier; used for matching on subsequent updates. |
| `meta.created`                                  | (read-only)                            | Echoes `pryzm_users.created_at`.                       |
| `meta.lastModified`                             | (read-only)                            | Echoes the last `UPDATE` timestamp on the row.         |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:department` | `pryzm_users.metadata.department` | Enterprise extension. |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:employeeNumber` | `pryzm_users.metadata.employee_id` | Enterprise extension. |
| `urn:ietf:params:scim:schemas:extension:enterprise:2.0:User:manager.value` | (not stored; ignored) | PRYZM has no manager-of relationship in v1. |

### 3.2 `Group` resource (RFC 7643 §4.2)

| SCIM attribute        | PRYZM mapping                                                 | Notes                                                                  |
| --------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `displayName`         | `pryzm_groups.name` (NEW table at S70 D8)                     | Group entity is new at S70 D8; today's `project_members` is per-project only. |
| `members[].value`     | `pryzm_group_members.user_id`                                 | Many-to-many.                                                          |
| `externalId`          | `pryzm_groups.metadata.scim_external_id`                      | Stable IdP identifier.                                                 |

Group → project access is configured **on the PRYZM side**: an admin maps a SCIM group to a set of `(project_id, role)` pairs in the admin console. This is intentional — IdP groups are organisational, PRYZM projects are work units; the join is PRYZM-side metadata, not IdP-side.

### 3.3 `Schemas/Tenant` (PRYZM extension)

PRYZM exposes a custom SCIM schema for tenant-level config (IdP cert rotation, role-mapping overrides, default project role). Schema URN: `urn:com:pryzm:scim:schemas:Tenant:1.0`.

```json
{
  "schemas": ["urn:com:pryzm:scim:schemas:Tenant:1.0"],
  "id": "<tenant-uuid>",
  "name": "Acme Corp",
  "idpEntityId": "https://acme.okta.com",
  "idpCertificate": "-----BEGIN CERTIFICATE-----...",
  "idpCertificateRotationGraceDays": 7,
  "defaultRole": "viewer",
  "roleMappings": { "engineering": "editor", "qa": "reviewer" }
}
```

PATCH operations on this resource take effect immediately; rotation grace period accepts both old + new cert for `idpCertificateRotationGraceDays`.

### 3.4 SCIM verbs supported

| Endpoint                  | Verbs                | Notes                                                              |
| ------------------------- | -------------------- | ------------------------------------------------------------------ |
| `/scim/v2/Users`          | GET, POST            | List + create.                                                     |
| `/scim/v2/Users/{id}`     | GET, PUT, PATCH, DELETE | DELETE soft-deletes (sets `active=false`); 30-day undelete window. |
| `/scim/v2/Groups`         | GET, POST            | List + create.                                                     |
| `/scim/v2/Groups/{id}`    | GET, PUT, PATCH, DELETE | Hard-delete; group memberships removed atomically.                |
| `/scim/v2/Schemas/Tenant` | GET, PATCH           | Tenant-config self-service.                                        |
| `/scim/v2/ServiceProviderConfig` | GET           | Standard SCIM discovery.                                           |
| `/scim/v2/ResourceTypes`  | GET                  | Standard SCIM discovery.                                           |

PUT is full-replace; PATCH per RFC 7644 §3.5.2 (op=add/replace/remove with path).

---

## §4 Audit + SOC2 evidence

Every SSO login + every SCIM mutation writes a row to `audit_log` (the sync-server's S57 D1 audit middleware). The row carries:

- `actor_id` — the IdP-asserted user (or `scim:<tenant-slug>` for SCIM operations).
- `event_type` — one of `sso.login.success`, `sso.login.failure`, `sso.assertion.invalid`, `scim.user.create`, `scim.user.update`, `scim.user.delete`, `scim.group.*`, `tenant.cert.rotate`.
- `resource_id` — affected user / group / tenant ID.
- `metadata.idp_assertion_id` — for SAML, the assertion ID (for IdP-side correlation).
- `metadata.scim_request_id` — for SCIM, the inbound request ID.

The S57 D7 `querySoc2Evidence` adapter already supports these event types; the SOC2 quarterly access-review automation (S68 D7, see `docs/security/scans-2026-Q4-baseline.md` §6 for the broader S68 D7 scope) consumes these rows.

---

## §5 What this mapping does NOT define

- **Provisioning of admin roles** (cross-project, tenant-wide). Admin role is set PRYZM-side per user, not via SCIM, by design — IdP role assertions cannot grant admin without a PRYZM-side confirmation step.
- **OAuth2 client credentials grant for service accounts**. That uses the publisher API-key model (`apps/marketplace-api/`), not SAML/SCIM.
- **Per-element ACLs** — PRYZM v1 authorisation is project-scoped, not element-scoped.
- **Federation between PRYZM tenants** — out of scope for v1.

---

**Authored by**: sprint-S68 (2026-04-28)
**Implementation milestone**: S70 D8 self-host publish gate (runtime adapter).
**Operational gate**: at least 1 enterprise tenant live on SAML+SCIM by S72 GA per S68 exit §3.
