# ADR-021 — Enterprise Security & Data Residency

| Field | Value |
|---|---|
| Status | **Accepted** — 2026-04-27 |
| Closes | `CONFLICT-ANALYSIS.md §6.11`; `CRITICAL-REVIEW-2026-04-27.md §B8` |
| Required by | Sprint S40 (latest before any C3 — large enterprise — sales conversation) |
| Owner | Architecture lead + Security lead |
| Implementation | `packages/permissions/`, `apps/sync-server/`, edge functions, deployment topology. |
| Spec dependency | `SPEC-08-SECURITY-COLLAB.md` |

---

## Context

C3 (large enterprise) is one of three customer profiles in `08-VISION`. Selling into regulated industries — defense, healthcare, finance, government, EU-GDPR-strict tenants — requires concrete answers to: SSO, SCIM, MFA, audit-log retention, audit-log streaming to SIEM, data residency, and self-host. Without these answers the sales conversation ends in week 2.

`CRITICAL-REVIEW-2026-04-27.md §B8` and `CONFLICT-ANALYSIS.md §6.11` flag the gap. SPEC-08 proposes the full model. This ADR ratifies it as the **gate on C3 sales conversations** — no sales pitch to a regulated customer until this ADR's deliverables are in motion.

---

## Decision

**v1 ships SAML 2.0 + OIDC SSO, TOTP MFA (mandatory for Enterprise admin), SCIM 2.0 provisioning, audit-log streaming to webhook (Splunk/Datadog/SIEM), per-tenant region pinning across EU-W and US-E (AP-SE Phase 4), and the D7 self-host bundle (per ADR-012). All deferred items are listed explicitly.**

### What's in v1 for Enterprise (M36 GA target)

#### Authentication (per SPEC-08 §2)
- Email + password (PBKDF2 600k iterations).
- OAuth: Google, GitHub, Microsoft.
- **SAML 2.0 + OIDC SSO** — mandatory for Enterprise tier.
- JWT HS512; 15 min access TTL; 14 d refresh; revocation list cached in edge.
- TOTP MFA (RFC 6238) — mandatory for Enterprise admin role.
- WebAuthn / passkeys — *deferred to v2* (acknowledged in §B8; Tier-1 cut per ADR-018).
- SMS MFA — explicitly **not** offered (phishing risk).

#### Authorization (per SPEC-08 §3 + ADR-011)
- Role hierarchy: Owner / Admin / Editor / Limited Editor / Reviewer / Viewer.
- Custom roles for Enterprise (capability composition + per-discipline filters).
- Defense in depth: L2 + L3 + edge + UI all enforce.

#### Postgres RLS (per SPEC-08 §4)
- Universal RLS pattern; service-role-key forbidden in client code; CI gate (P9 add-on) blocks any commit referencing the key outside the allow-list folders (`apps/sync-server/`, `apps/bake-worker/`, `apps/ai-worker/`, edge functions).
- Per-project R2 prefix isolation; signed URLs scoped to project prefix; 5 min TTL.

#### SCIM 2.0 (per SPEC-08 §5)
- `POST/PUT/DELETE /scim/v2/Users`.
- `POST /scim/v2/Groups` mapped to roles.
- Tested against Okta, Azure AD, Google Workspace, OneLogin.
- Just-in-time provisioning on first SAML/OIDC login.

#### Rate limiting (per SPEC-08 §6)
- Per-JWT token-bucket; per-tier limits documented; burst 10× steady up to 60 s; 429 with `Retry-After` on exceed.

#### Audit log (per SPEC-08 §7)
- What's logged: authn events, authz failures, membership changes, exports, AI proposals (with prompt SHA), billing events, admin actions.
- Storage: `audit_log` table; partitioned monthly; RLS = tenant-admin read-only.
- Retention: 1 yr free/solo, 7 yr team/enterprise (configurable).
- **Streaming** to customer webhook (Splunk HEC, Datadog Logs, generic SIEM): JSON Lines over HTTPS POST; HMAC-signed; exponential backoff; alert on 24 h backlog.

#### Data residency (per SPEC-08 §8)
- v1 regions: **EU-West (Frankfurt)** and **US-East (Virginia)**.
- AP-Southeast (Singapore) — *deferred to Phase 4* (Tier-1 cut per ADR-018 if velocity slips).
- Tenant region selected at signup; cannot be changed without a migration ticket.
- All Postgres + R2 + sync-server traffic in-region.
- AI worker calls to LLM providers go through the in-region proxy (provider region matched: EU tenants → Anthropic EU / Azure OpenAI EU; US tenants → US providers).

#### Self-host (per ADR-012)
- Customer runs the docker-compose stack in their VPC.
- Customer holds master keys for at-rest encryption.
- Customer-supplied LLM credentials.
- Software ships as a sealed artefact; signed manifest.
- Air-gap install supported (Tier-2 cut candidate per ADR-018).

#### Threat model (per SPEC-08 §9)
- Top threats addressed in v1: credential theft (MFA + planned WebAuthn), IDOR (RLS + signed URL prefix isolation), plugin escape (Web Worker sandbox per ADR-009), AI prompt injection from project content (sanitisation in AI plugins; CI test asserts), supply chain (`pnpm audit` + signed lockfile + Renovate; gate on M12), insider threat (audit-log streaming + per-tenant data residency).
- Out of v1 scope: DDoS beyond Cloudflare; side-channel attacks on cloud workers; client device compromise.
- External pen test in S68 (per `10-MASTER-IMPLEMENTATION-PLAN-36M.md` R-07).

### Compliance posture at GA
- **SOC 2 Type 1** target by M36 (audit kicked off in M30); Type 2 in v1.5 (M42).
- **GDPR**: data subject rights, data export, right-to-be-forgotten, DPA template — v1.
- **HIPAA**: BAA available for Enterprise tier on US-East — v1.5.
- **FedRAMP**: out of v1 scope; explicit no-go until customer demand and revenue justify the program cost.
- **ISO 27001**: v1.5 target.

### Comms posture
- Public security page lists implemented controls + the deferred list (so prospects can self-qualify before sales engages).
- Customer-facing docs at `docs.pryzm.com/security/` includes: architecture diagram (SPEC-08 §1), threat model (SPEC-08 §9), data flow per region, sub-processor list, vulnerability disclosure policy, pen-test summary.

---

## Consequences

**Positive:**
- C3 sales conversations have concrete answers, not promises.
- The deferred list is explicit; no surprises 6 months into a procurement cycle.
- Self-host (ADR-012) plus residency pinning covers the *strict* end of the regulated market.
- Audit-log streaming opens the SIEM-integration market without bespoke connectors.

**Negative:**
- Compliance certifications cost real money and time (SOC 2 audit ~$30k + 3 months).
- The deferred list (WebAuthn, AP-SE, FedRAMP) excludes some prospects until v2.
- Multi-region operations adds ops complexity (per-region runbooks, region-fail playbooks).
- SAML/OIDC integration is per-IdP painful; mitigated by testing the four named IdPs before GA.

---

## Alternatives considered

### Defer Enterprise to v2 (SaaS-only at GA, pure Solo/Team focus)
- Rejected: leaves 30%+ of the addressable revenue unaddressable; many of these customers won't wait.

### "We'll do it custom for Enterprise A and Enterprise B"
- Rejected: bespoke deals fork the codebase; impossible to maintain.

### SSO via Auth0 / Okta only (no native SAML)
- Rejected: customers want PRYZM's IdP-agnostic SAML, not "our SSO via your Auth0 license."

### SOC 2 Type 2 by M36
- Rejected: requires 12 months of operational evidence; achievable only post-GA. Type 1 by GA is the realistic ask.

### Hosting in customer's cloud subscription (BYOC)
- Rejected for v1: deeply bespoke per cloud; D7 self-host covers the air-gap need without the per-cloud surface area. Reconsider for v2.

---

## Phase rollout
- S08 — RLS audit + service-role-key isolation + CI gate (per SPEC-08 §11).
- S22 (M12 alpha) — Solo/Team auth + TOTP MFA + signed URLs + rate-limit baseline live.
- S43 — Role/permission matrix live (per SPEC-08 §3 + ADR-011).
- S46 — `audit_log` table + per-tenant view live.
- S48 (M24 beta) — Permission matrix complete; soft locks + Yjs live.
- S55 — SAML/OIDC SSO live.
- S58 — SCIM live.
- S60 — SOC 2 Type 1 audit kicks off.
- S64 — Audit-log streaming live.
- S68 — External pen test.
- S70 — Multi-region pinning (EU-W + US-E) live.
- S72 (M36 GA) — Threat model review pass; published security page.
