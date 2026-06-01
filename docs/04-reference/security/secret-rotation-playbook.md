# Secret-Rotation Playbook

**Sprint introduced**: PRYZM 2 Phase 3D · S68 D9
**Spec ref**: `docs/archive/pryzm3-internal/reference/phases/PHASE-3/3D-Q4-M34-M36-HARDENING-GA.md` §S68 D9 — "demo + secret-rotation playbook."
**Strategic anchor**: SPEC-24 §1.10 (SOC2 access-review automation); `[strategic ADR-018]` (deployment topology).

---

## §1 Scope

This playbook is the **operator-facing runbook** for rotating every secret PRYZM uses, on three deployment topologies:

- **Replit-hosted** (PRYZM 1 + PRYZM 2 dev preview): Replit Secrets manager.
- **Self-host Docker Compose** (S67 → operator-run): `pryzm-selfhost/.secrets/` Docker secrets.
- **Cloud-managed** (post-GA, Hetzner): operator's secret manager (Vault, AWS Secrets Manager, etc.).

Every entry below specifies: rotation cadence, blast radius if leaked, rotation procedure, and verification step.

---

## §2 Secret inventory

| #  | Secret                             | Surface                               | Cadence (max age) | Blast radius if leaked                                         |
| -- | ---------------------------------- | ------------------------------------- | ----------------- | -------------------------------------------------------------- |
| 1  | `JWT_SIGNING_SECRET`               | `apps/api-gateway`, `server/auth`     | 90 days           | All issued JWTs forgeable until expiry.                        |
| 2  | `SUPABASE_SERVICE_ROLE_KEY`        | `server.js` Supabase paths            | 180 days (or on suspected leak) | Full DB read+write bypassing RLS.                  |
| 3  | `SUPABASE_ANON_KEY`                | Editor SPA (public)                   | (rotates with Supabase project) | RLS still applies; bounded to anon-allowed reads.    |
| 4  | `POSTGRES_PASSWORD` (self-host)    | `pryzm-selfhost/.secrets/`            | 90 days           | Full self-host DB access.                                      |
| 5  | `MINIO_ROOT_USER` + `MINIO_ROOT_PASSWORD` | `pryzm-selfhost/.secrets/`     | 90 days           | Full blob-storage access.                                      |
| 6  | `OAUTH2_CLIENT_SECRET` (per IdP)   | `apps/api-gateway` SSO adapter (S70)  | 365 days or per IdP policy | IdP-side login impersonation.                          |
| 7  | `STRIPE_SECRET_KEY`                | Pricing surface (S71)                 | On suspected leak only (Stripe handles rotation UX) | Charge / refund customer cards. |
| 8  | `STRIPE_WEBHOOK_SIGNING_SECRET`    | Webhook handler (S71)                 | Per Stripe policy | Webhook event spoofing.                                        |
| 9  | `SMTP_PASSWORD`                    | `apps/email-transport`                | 90 days           | Send mail as PRYZM domain.                                     |
| 10 | `PLUGIN_SIGNING_PRIVATE_KEY` (Ed25519) | Marketplace publish pipeline       | 365 days; **revocation list takes effect immediately** | All marketplace plugins re-need signing on next publish. |
| 11 | `PRYZM_INSTANCE_SECRET` (self-host)| Self-host instance ID hashing         | Never (one-shot, set at install) | Self-host instance ID forgery; minor (telemetry-only). |
| 12 | `OBSERVABILITY_BACKEND_API_KEY` (OTLP exporter) | api-gateway + sync-server     | 180 days          | Telemetry-stream write only.                                   |
| 13 | Per-tenant SAML `idpCertificate`   | SCIM `Schemas/Tenant` (S70)           | Per IdP policy (typ. 365 days) | Forge SAML assertions for that tenant.                |

---

## §3 Rotation procedures

### 3.1 `JWT_SIGNING_SECRET` (item 1)

**Replit-hosted**:

1. Generate new secret: `openssl rand -hex 48`.
2. Set Replit Secret `JWT_SIGNING_SECRET_NEXT` to the new value.
3. Restart `Start application` workflow. The auth shim accepts BOTH `JWT_SIGNING_SECRET` and `JWT_SIGNING_SECRET_NEXT` for verification, but signs new tokens with `_NEXT`.
4. Wait 24 hours (max access-token TTL + buffer).
5. Promote: copy `_NEXT` value into `JWT_SIGNING_SECRET`, delete `_NEXT`. Restart workflow.
6. Verify: `curl -sI $REPLIT_DEV_DOMAIN/v1/health` — expect 200; check `audit_log` for any `auth.token.verify.failure` entries in the past hour.

**Self-host**:

1. `cd pryzm-selfhost && openssl rand -hex 48 > .secrets/jwt_signing_secret_next`.
2. Set `JWT_SECRET_NEXT_FILE=/run/secrets/jwt_signing_secret_next` in `.env`.
3. `docker compose up -d --no-deps api-gateway` (rolling restart).
4. Wait 24 h. Promote: `mv .secrets/jwt_signing_secret_next .secrets/jwt_signing_secret`; unset `JWT_SECRET_NEXT_FILE`; restart api-gateway.

**Cloud-managed**: same logic, via the operator's secret manager (Vault rotate / AWS SM scheduled rotation).

### 3.2 `SUPABASE_SERVICE_ROLE_KEY` (item 2)

1. Supabase Dashboard → Project Settings → API → Reset `service_role` key.
2. Update Replit Secret `SUPABASE_SERVICE_ROLE_KEY` with new value.
3. Restart `Start application` workflow.
4. Verify: any successful project-list endpoint call (e.g. `GET /api/projects` after login) — Supabase paths use the new key on next request.
5. Audit-log check: no `db.connect.failure` events in the past 5 minutes.

### 3.3 `POSTGRES_PASSWORD` (item 4, self-host)

1. `docker compose exec postgres psql -U pryzm -c "ALTER USER pryzm WITH PASSWORD 'NEW_PASSWORD';"` (NEW_PASSWORD generated via `openssl rand -hex 24`).
2. `echo NEW_PASSWORD > .secrets/postgres_password`.
3. `docker compose restart sync-server bake-worker api-gateway` (services that hold a connection pool).
4. Verify: each service's healthcheck returns green within `start_period`.

### 3.4 `MINIO_ROOT_USER` + `MINIO_ROOT_PASSWORD` (item 5, self-host)

1. Generate new credentials.
2. Update `.secrets/minio_root_user` and `.secrets/minio_root_password`.
3. `docker compose down minio && docker compose up -d minio` (MinIO requires restart on root-credential change).
4. Re-create the per-service IAM user via `docker compose exec minio mc admin user add ...` (per the install script's bucket-bootstrap step).
5. Restart bake-worker (the only service that talks to MinIO).
6. Verify: a smoke upload via the `/v1/projects/:id/thumbnail` round-trip.

### 3.5 `STRIPE_*` (items 7, 8) — defer to S71

Stripe key rotation is best-handled via Stripe's own dashboard rotation UX. Playbook entry will land alongside the S71 D3 Stripe integration day.

### 3.6 `PLUGIN_SIGNING_PRIVATE_KEY` (item 10)

This is the marketplace's plugin-signing key, NOT a per-tenant secret. Rotation is **annual + on-suspected-leak**.

1. Generate new Ed25519 keypair offline: `openssl genpkey -algorithm ed25519 -out new.key`; `openssl pkey -in new.key -pubout -out new.pub`.
2. Stage new public key in `apps/marketplace-api`'s trusted-keys list (additive — both old and new accepted).
3. Sign all subsequent plugin-version publishes with the new private key.
4. After 90 days (covers normal plugin update cadence), remove the old public key from the trusted list. Plugins still signed with the old key will need re-publish to remain installable.
5. **On suspected leak**: revocation list takes effect immediately — add the leaked key to `apps/marketplace-api/src/signing/revoked-keys.json`; the host runtime refuses to load any plugin whose signature chain includes a revoked key.

### 3.7 Per-tenant SAML certificate (item 13)

Per `docs/04-reference/security/saml-scim-mappings.md` §3.3:

1. Tenant admin uploads new IdP certificate via SCIM `PATCH /Schemas/Tenant` setting `idpCertificate` to the new PEM.
2. PRYZM accepts BOTH old and new certs for `idpCertificateRotationGraceDays` (default 7).
3. After grace, old cert is purged.
4. Verify: tenant admin performs an SSO login — successful login confirms new cert is in force.

---

## §4 Emergency rotation (suspected breach)

If any secret in §2 is suspected leaked:

1. **Within 1 hour**: rotate per §3 procedure for that secret. For JWT, accept the 24-hour rolling window — tokens older than the rotation are invalid.
2. **Within 4 hours**: walk `audit_log` for the past 30 days filtered by `actor_id = '<unknown>'` or anomalous IP — the S57 audit middleware records every authenticated request.
3. **Within 24 hours**: notify any potentially-affected customers per the privacy-incident protocol in `docs/04-reference/security/incident-response.md` (lands at S69 D6 alongside DR drill).
4. **Within 7 days**: post-mortem document in `docs/03-execution/status/post-mortems/`.

---

## §5 Verification — quarterly drill

This playbook is **drilled once per quarter** (SOC2 §1.10 requirement). The drill:

1. Pick one secret from §2 at random.
2. Walk the §3 procedure end-to-end on a staging instance.
3. Time the rotation (target: < 30 minutes for items 1, 2, 4, 5; < 2 hours for items 6, 13).
4. Record outcome in `docs/04-reference/security/rotation-drills/YYYY-Qn.md`.

First drill: scheduled S68 D10 (buffer day) on the dev environment for items 1 + 11 (the two with the lowest blast radius).

---

## §6 What this playbook does NOT cover

- Rotation of **operator-side OS-level secrets** (SSH keys, sudo passwords) — operator's responsibility.
- Rotation of **TLS certificates for `app.pryzm.com` / `api.pryzm.com`** — handled by the cert provider (Let's Encrypt / cert-manager); separate runbook lands at S70 D8.
- Rotation of **per-user passwords** — enforced via IdP password policy when SAML/SCIM is configured; for password-auth tenants, the existing `/auth/change-password` endpoint is the channel.
- **One-time codes / MFA seeds** — handled by the IdP, not stored PRYZM-side.

---

**Authored by**: sprint-S68 (2026-04-28)
**Companion docs**: `docs/04-reference/security/oauth2-review-2026-Q4.md`, `docs/04-reference/security/saml-scim-mappings.md`, `docs/04-reference/security/scans-2026-Q4-baseline.md`.
