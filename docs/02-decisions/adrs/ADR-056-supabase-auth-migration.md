# ADR-056 — Supabase Auth migration (Phase A.5 of ADR-055)

| Field | Value |
|---|---|
| Status | **ACCEPTED 2026-06-02** — sequenced AFTER ADR-055 Phase A close; implementation begins Sprint 4 |
| Owner | Platform / server-infrastructure · `@MarkHanoi` |
| Supersedes (in part) | **C08 §1.1** (auth identity issuance — the "custom JWT only" clause) · **ADR-045 §3** (the JWT mechanism row in the split-backend table) |
| Preserves (load-bearing) | **C08 §1.3** (Google + Microsoft OAuth flow shape) · **C39 §1.12** (`EntitlementBundle` HMAC signature) · **C22 §1.1 / §1.3 / §1.7** (PII tier-tag-at-write, EU residency, PII audit spans) · **§AUTH-SESSION-LEAK-2** identity-change contract (cross-user project leak fix; see `packages/persistence-client/src/AuthClient.ts:382-414` + `apps/editor/src/ui/platform/AuthModal.ts:225-262`) |
| Defers to | **ADR-055** (parent — one PRYZM hosting architecture) · **C48 §1.1** RTO/RPO targets (Supabase Pro PITR remains the floor) |
| Touches | `server/authStore.js` · `server/oauthService.js` · `server/supabaseClient.js` · `server.js` (`authMiddleware`, `/api/auth/*`, `/api/entitlements/me`) · `packages/persistence-client/src/AuthClient.ts` · `apps/editor/src/ui/platform/AuthModal.ts` · `server/dbMigrate.js` (RLS policies) · OAuth dashboards (Google Cloud Console + Azure App Registration) |
| Contracts amended (follow-up PR, not this one) | C08 §1.1, §1.3 · ADR-045 §3 superseded text block |

---

## Context

PRYZM today runs a hand-rolled auth stack: bcrypt password hashing (`server/authStore.js:28` — `BCRYPT_ROUNDS = 12`), HMAC-SHA256 JWT issuance against `SESSION_SECRET` (`server/authStore.js:99, 135, 183, 219`), a 30-day token TTL (`server/authStore.js:29` — note: **C08 §1.1 declares 7 days; the implementation is at 30 days**; this divergence is closed by §3 of this ADR), and a manual PKCE OAuth2 flow for Google + Microsoft (`server/oauthService.js:155-231`). User-identity rows live in Supabase (`pryzm_users` table) via the service-role REST client (`server/supabaseClient.js:68-119`) per **ADR-045**.

This stack works, but it is an enterprise-blocker:

1. **No MFA.** Custom code cannot trivially add TOTP/WebAuthn without owning the entire enrolment + recovery + lockout surface.
2. **No SSO (SAML, OIDC).** Customer IT departments at the C4 enterprise tier (`docs/01-strategy/personas.md`) gate purchase on SSO integration; building this against our own JWT issuer is months of work.
3. **No JWKS / key rotation.** `SESSION_SECRET` is a single symmetric key; rotation requires server-wide downtime or dual-verify code. There is no public JWKS endpoint, so third-party services that want to verify a PRYZM token (the future plugin runtime in **F-tier P0**) cannot do so without our service-role key.
4. **No refresh-token rotation.** `jsonwebtoken.sign({...}, secret, { expiresIn: '30d' })` issues a long-lived bearer with no rotation; theft = 30 days of access. The industry standard (Supabase Auth, Auth0, AWS Cognito) is short-lived access tokens + rotating refresh tokens.
5. **No audit trail.** Successful sign-ins are `console.log`-only (`server/authStore.js:131, 137, 215, 221`). There is no `auth.audit_log_entries` equivalent that surfaces "who signed in from which IP at which time"; this fails SOC 2 CC6.1 and ISO 27001 A.9.4.2.
6. **Hand-rolled crypto.** The crypto choices (bcrypt rounds, HMAC-SHA256 vs RS256, JWT claim set) are correct today but every change is hand-audited. A managed IdP that ships SOC 2 + ISO 27001 audit reports removes this risk surface entirely.
7. **No password-reset flow.** Search the codebase: there is no `requestPasswordReset` route — only sign-up + sign-in + OAuth. Adding it (token issuance, email transport, link expiry, throttling) is non-trivial; Supabase Auth ships it.

Supabase Auth is the natural target because:
- We already run Supabase (`server/supabaseClient.js`) for the `pryzm_users` row store per ADR-045.
- Supabase Auth is a SOC 2 Type II + ISO 27001 audited IdP with a public JWKS endpoint, configurable refresh-token rotation, MFA (TOTP + WebAuthn passkeys), SAML SSO (Enterprise tier), and `auth.audit_log_entries` baked in.
- It writes to the same Postgres database under `auth.*` schemas; we can join `auth.users` to `public.projects` via RLS without crossing a network boundary.
- The OAuth providers (Google, Microsoft) are configurable directly on the Supabase dashboard — no more hand-rolled PKCE in `server/oauthService.js`.

This ADR sequences the migration as **Phase A.5 of ADR-055**, deliberately AFTER Phase A close so the cutover does not block the apex/app split production deploy. Phase A ships with the custom JWT path unchanged; ADR-056 implementation begins Sprint 4 once production is stable.

---

## The current auth surface (what we are replacing)

| Surface | File : line | What it does | Replacement |
|---|---|---|---|
| bcrypt password hash | `server/authStore.js:28, 70, 116, 160, 199` | `BCRYPT_ROUNDS = 12`; hashes at signup, compares at sign-in | Supabase Auth `auth.users.encrypted_password` (Argon2, managed). **REMOVE bcrypt** at Sprint 4.7. |
| HMAC-SHA256 JWT issuance | `server/authStore.js:99, 135, 183, 219` and `server/oauthService.js:50-52` | `jwt.sign({ sub, email }, SESSION_SECRET, { expiresIn: '30d' })` | Supabase Auth session JWT (RS256 from Supabase's per-project signing key, JWKS-exposed). **REMOVE `mintToken` + `getSessionSecret`** at Sprint 4.6. |
| Token TTL | `server/authStore.js:29` (`'30d'`) | Single long-lived token, no rotation | Supabase Auth: 1h access token + 30d rotating refresh token (configurable per project). |
| JWT verification middleware | `server.js:586-720` (`authMiddleware`, Path 1) | `jwt.verify(token, SESSION_SECRET)`; populates `req.auth = { userId, email }` | Supabase Auth JWT verify via JWKS (`@supabase/supabase-js` `auth.getUser(token)` server-side, or `jose` JWKS verify). Dual-stack during 30-day overlap window. |
| Manual PKCE OAuth (Google) | `server/oauthService.js:155-189` | Hand-rolled `googleAuthUrl` → `exchangeGoogleCode` → `fetchGoogleProfile` → `upsertOAuthUser` → `mintToken` | `supabase.auth.signInWithOAuth({ provider: 'google' })` client-side. **REMOVE `googleAuthUrl`, `exchangeGoogleCode`, `fetchGoogleProfile`, `/api/auth/google`, `/api/auth/google/callback`** at Sprint 4.6. |
| Manual PKCE OAuth (Microsoft) | `server/oauthService.js:193-231` | Same shape as Google, against `login.microsoftonline.com` | `supabase.auth.signInWithOAuth({ provider: 'azure' })`. **REMOVE `microsoftAuthUrl`, `exchangeMicrosoftCode`, `fetchMicrosoftProfile`, `/api/auth/microsoft`, `/api/auth/microsoft/callback`** at Sprint 4.6. |
| `pryzm_users` row (auth-related columns) | Supabase REST via `getSupabaseClient()` per ADR-045 | `id, email, password_hash, oauth_provider, plan, plan_status, name` | Split: `auth.users` (id, email, encrypted_password, raw_user_meta_data, providers) **+** `public.profiles` (id FK→auth.users.id, name, plan, plan_status, stripe_customer_id, regionPreference, byok_enabled). |
| `SESSION_SECRET` signing key | `server.js:121, 220-226, 5515` + `server/authStore.js:32-39` + `server/oauthService.js:35-37` | Single env-var symmetric secret, no rotation surface | Supabase JWT secret (per-project, rotatable from dashboard, never leaves Supabase). **KEEP `SESSION_SECRET` for `EntitlementBundle` only** — see §3. |
| OAuth callback HTML | `server/oauthService.js:234-258` (`callbackHtml`) | Hand-written popup-postMessage handshake | Supabase Auth handles the callback at `<project>.supabase.co/auth/v1/callback`; client receives session via `onAuthStateChange`. **REMOVE `callbackHtml`** at Sprint 4.6. |
| `_resolveEmailForUserId` cache | `server.js:621-634` | Reads `pryzm_users.email` for tokens issued without an `email` claim | Read from `auth.users.email` (or the Supabase Auth JWT `email` claim, which is always present). |
| `_displayNameCache` resolver | `server.js:599-619` | Reads `pryzm_users.name` for cursor relays per C08 §3.4 | Read from `public.profiles.name`. RLS lets the server's service-role key always see it. |
| `installAccountSwitchGuard` + identity-change event | `apps/editor/src/ui/platform/AuthModal.ts:225-262` + `packages/persistence-client/src/AuthClient.ts:382-414` | Detects identity change on `persistSession`; fires `pryzm:auth:identity-changed`; purges client cache + reloads | **KEEP** — see §8. New AuthClient wraps `supabase.auth.onAuthStateChange` and emits the same DOM event. The event contract MUST survive the migration unchanged. |

---

## Decision

### §1 — The cutover model: 30-day dual-stack window

Both JWT issuers run concurrently for **30 days** following the Sprint 4.3 cutover.

- **Sessions issued by the legacy issuer** (`SESSION_SECRET`-signed HS256 JWTs in `localStorage['bim-platform-token']`) continue to validate via the existing `authMiddleware` Path 1 (`server.js:668`) for the full 30-day window. No user is force-logged-out.
- **New sessions** (every new signup, sign-in, OAuth round-trip, and every refresh of an existing session after Sprint 4.3) go through Supabase Auth and produce a Supabase-signed RS256 JWT.
- `authMiddleware` gains a **Path 0** that tries Supabase Auth verification first (JWKS-cached); on failure falls through to legacy Path 1 (`SESSION_SECRET` HS256). After the 30-day window closes, Path 1 is deleted (Sprint 4.6).

Why 30 days, not shorter: the existing token TTL is `'30d'` (`server/authStore.js:29`). A user who signed in the day before Sprint 4.3 holds a legacy token valid until day 30. Force-rotating before day 30 would invalidate that token and require re-sign-in, breaking the "zero users locked out" acceptance criterion. The window length matches the existing TTL exactly.

Why not longer: every additional day is another day of legacy-JWT verification code, legacy bcrypt code, and `pryzm_users.password_hash` data sitting on disk. 30 days is the minimum sufficient and the maximum acceptable.

### §2 — Identity reconciliation

**Strategy: UUID preservation via direct `auth.users` insert.** This is the safest path because:

1. `pryzm_users.id` is referenced by `projects.owner_id`, `project_members.user_id`, `user_plans.user_id`, `audit_log.subject_user_id`, `derived_artefacts.source_user_id`, and the in-flight `EntitlementBundle.userId` claim (C39 §1.12). Re-keying users to fresh UUIDs would require a cascading rewrite of every FK and every signed bundle in flight.
2. Supabase Auth permits inserting into `auth.users` with a pre-supplied UUID via the admin API (`supabase.auth.admin.createUser({ id: '<uuid>', ... })`).

**Migration shape** (executed once, in Sprint 4.2, against staging Supabase project first):

```sql
-- Step 1 — backfill auth.users from public.pryzm_users
-- NOTE: pryzm_users.id is a TEXT 'user-<ts>-<rand>' (server/authStore.js:42). It is NOT a UUID.
-- We mint a deterministic UUID-v5 from the legacy id and store the legacy id in raw_user_meta_data
-- so existing FKs (projects.owner_id etc.) continue to work after we add a TEXT mirror.
INSERT INTO auth.users (
  id,                          -- UUID-v5 from legacy id
  email,
  encrypted_password,          -- COPY existing bcrypt hash; Supabase Auth verifies bcrypt natively
  email_confirmed_at,          -- NOW() (existing users are trusted)
  raw_user_meta_data,          -- { legacy_id, name, oauth_provider, plan, plan_status }
  raw_app_meta_data,           -- { providers: ['email'] | ['google'] | ['microsoft'] }
  created_at,
  updated_at
)
SELECT
  uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, pu.id),
  pu.email,
  pu.password_hash,
  NOW(),
  jsonb_build_object('legacy_id', pu.id, 'name', pu.name, 'plan', pu.plan, 'plan_status', pu.plan_status, 'oauth_provider', pu.oauth_provider),
  jsonb_build_object('providers', ARRAY[COALESCE(pu.oauth_provider, 'email')]),
  COALESCE(pu.created_at, NOW()),
  NOW()
FROM public.pryzm_users pu
ON CONFLICT (email) DO NOTHING;

-- Step 2 — create public.profiles, mirroring the non-auth columns of pryzm_users
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  legacy_id    TEXT UNIQUE NOT NULL,      -- the original 'user-<ts>-<rand>' so FKs from projects.owner_id keep resolving
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free',
  plan_status  TEXT NOT NULL DEFAULT 'active',
  stripe_customer_id TEXT,
  region_preference  TEXT NOT NULL DEFAULT 'eu',   -- C22 §1.3
  byok_enabled       BOOLEAN NOT NULL DEFAULT false, -- C22 §1.5
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.profiles (id, legacy_id, name, plan, plan_status, stripe_customer_id)
SELECT
  uuid_generate_v5('00000000-0000-0000-0000-000000000000'::uuid, pu.id),
  pu.id,
  pu.name,
  pu.plan,
  pu.plan_status,
  pu.stripe_customer_id
FROM public.pryzm_users pu;

-- Step 3 — server code path: when the legacy JWT (sub = 'user-<ts>-<rand>') is verified, resolve to
-- the auth.users.id via public.profiles.legacy_id. New Supabase Auth JWTs carry auth.users.id directly.
-- Both paths converge on the SAME effective userId for all downstream queries.
```

**Why bcrypt rehash is NOT required**: Supabase Auth's `encrypted_password` column stores `crypt`-format hashes; bcrypt hashes prefixed with `$2a$` / `$2b$` / `$2y$` are recognised by the GoTrue verify path. Existing users sign in with their existing passwords; on first sign-in through Supabase Auth, the hash is silently rehashed to GoTrue's preferred Argon2id format (this is a GoTrue feature, not custom code).

**Email-uniqueness collisions**: `pryzm_users.email` is enforced unique by the existing app code (`signUpViaSupabase` at `server/authStore.js:62-68` rejects duplicates). Migration assumes the constraint holds; a pre-flight CI gate at Sprint 4.2 verifies `SELECT email, COUNT(*) FROM pryzm_users GROUP BY email HAVING COUNT(*) > 1` returns zero rows.

### §3 — JWT shape (and what is NOT a Supabase JWT)

**Supabase Auth JWT claims** (issued by Supabase, verified by us via JWKS):

```jsonc
{
  "aud":   "authenticated",
  "exp":   1717400000,                                   // 1 hour from iat
  "iat":   1717396400,
  "iss":   "https://<project>.supabase.co/auth/v1",
  "sub":   "<auth.users.id UUID>",
  "email": "user@example.com",
  "phone": "",
  "app_metadata":  { "providers": ["email"], "provider": "email" },
  "user_metadata": { "legacy_id": "user-1234-abc", "name": "Alice" },
  "role":  "authenticated"
}
```

**PRYZM-specific claims** (`plan`, `quota`, `entitlementHash`) do NOT live in the Supabase Auth JWT. They live in the `EntitlementBundle` per **C39 §1.12** — a separate, server-issued, HMAC-SHA256 bundle signed with `SESSION_SECRET`.

**This is the most important shape constraint in the migration**: `SESSION_SECRET` is NOT retired by ADR-056. It survives indefinitely for `EntitlementBundle` signing because:

1. C39 §1.12 explicitly requires "the same JWT secret as C08 session tokens" — that contract clause is amended in the follow-up PR to read "a server-side HMAC secret distinct from the Supabase Auth signing key, conventionally `SESSION_SECRET`".
2. The bundle is signed server-side and verified server-side (`/api/entitlements/me` writes, the client never verifies — it trusts the server). There is no JWKS-rotation requirement; symmetric HMAC is appropriate.
3. Decoupling bundle-signing from auth-token-signing is a security improvement: rotating the Supabase Auth signing key no longer invalidates in-flight `EntitlementBundle`s, and vice versa.

`authMiddleware` resolves `req.auth.userId` from the Supabase JWT's `sub` (post-cutover) OR the legacy JWT's `sub` (during the 30-day window). The `EntitlementBundle` is fetched fresh on session start regardless of which auth path was taken.

### §4 — OAuth flow rewrite

Today (`server/oauthService.js:137-258`) the server drives the OAuth round-trip:

1. Client opens popup at `/api/auth/google?state=<nonce>`.
2. Server redirects to `accounts.google.com/o/oauth2/v2/auth?...` (`oauthService.js:155-165`).
3. Google calls back to `/api/auth/google/callback?code=...`.
4. Server exchanges code for an access token (`oauthService.js:167-181`), fetches the profile (`oauthService.js:183-189`), upserts into `pryzm_users` (`oauthService.js:59-125`), mints a PRYZM JWT (`oauthService.js:50-52`), returns `callbackHtml` which `postMessage`s the token to `window.opener`.

After the migration:

1. Client calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://app.pryzm.so/auth/callback' } })`.
2. Supabase Auth handles the entire round-trip; the client's popup ends up at `https://app.pryzm.so/auth/callback#access_token=...&refresh_token=...&expires_in=3600&token_type=bearer`.
3. The Supabase client SDK parses the URL fragment, stores tokens in its configured storage (see §6), and emits `onAuthStateChange('SIGNED_IN', session)`.
4. PRYZM's `AuthClient` subscribes to `onAuthStateChange` and emits `pryzm:auth:identity-changed` per §8.

**OAuth dashboard updates required** (tracked in the runbook, not by code):

| Provider | Old redirect URI | New redirect URI |
|---|---|---|
| Google Cloud Console | `https://<replit-host>/api/auth/google/callback` | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Azure App Registration | `https://<replit-host>/api/auth/microsoft/callback` | `https://<project-ref>.supabase.co/auth/v1/callback` |

The new redirect URI is **per-Supabase-project**, not per-app-environment. Supabase Auth then forwards to whichever `redirectTo` we pass in `signInWithOAuth`, which honours `app.pryzm.so` for production and `<branch>.pryzm-staging.pages.dev` for branch previews per ADR-055 §4.

### §5 — RLS wiring

Every PII-bearing table (per C22 §1.1 tier classification) gets Row-Level Security with `auth.uid()` as the gating predicate. The migration does NOT enable RLS on all tables at once — that flip would deny every active session for the time it takes to reload the JWT. RLS is enabled per table in a controlled Sprint 4.4 rollout, behind the dual-stack window so the legacy JWT path bypasses RLS via the service-role key (which is correct: RLS is a defence-in-depth layer, not the primary authz).

The three most critical migrations (the rest follow the same pattern):

```sql
-- public.projects — PROJECT tier per C22 §1.1
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner-can-read-own" ON public.projects FOR SELECT
  USING (
    -- During the 30-day overlap window, owner_id is TEXT 'user-<ts>-<rand>' (legacy);
    -- the RLS predicate looks both legacy_id AND the direct UUID match up.
    owner_id IN (
      SELECT legacy_id FROM public.profiles WHERE id = auth.uid()
    )
    OR owner_id::text = auth.uid()::text
  );
CREATE POLICY "owner-can-write-own" ON public.projects FOR ALL
  USING (
    owner_id IN (SELECT legacy_id FROM public.profiles WHERE id = auth.uid())
    OR owner_id::text = auth.uid()::text
  )
  WITH CHECK (
    owner_id IN (SELECT legacy_id FROM public.profiles WHERE id = auth.uid())
    OR owner_id::text = auth.uid()::text
  );
CREATE POLICY "members-can-read" ON public.projects FOR SELECT
  USING (
    id IN (SELECT project_id FROM public.project_members WHERE user_id IN (
      SELECT legacy_id FROM public.profiles WHERE id = auth.uid()
    ))
  );

-- public.project_versions — PROJECT tier
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "version-read-via-project" ON public.project_versions FOR SELECT
  USING (project_id IN (SELECT id FROM public.projects));   -- relies on projects RLS cascade
CREATE POLICY "version-write-via-project" ON public.project_versions FOR ALL
  USING (project_id IN (SELECT id FROM public.projects))
  WITH CHECK (project_id IN (SELECT id FROM public.projects));

-- public.profiles — PII tier per C22 §1.11
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self-can-read"  ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "self-can-update" ON public.profiles FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());
-- The PRYZM service-role key bypasses RLS for cross-user lookups (e.g. _resolveDisplayName).
-- C22 §1.7 PII spans MUST be emitted on every service-role read of profiles.
```

**Discovery-time enumeration**: the full PII + PROJECT table list per C22 §1.1 + §1.11 (`pryzm_users` → `profiles` + `auth.users` · `projects` · `project_versions` · `project_members` · `project_command_log` · `audit_log` · `derived_artefacts` · `consent_records` · `ai_usage`) gets the same RLS shape; the migration script enumerates them in `server/dbMigrate.js` in Sprint 4.4.

**ai_usage RLS specifically**: required for C39 quota correctness — a customer must not be able to read another customer's AI usage tick row. RLS predicate is `user_id = auth.uid()` (or `legacy_id` resolution during overlap).

### §6 — Session-cookie strategy

Supabase Auth defaults to **localStorage** for client session persistence. For PRYZM at `app.pryzm.so` (per ADR-055 §0 apex/app split), localStorage is acceptable on Phase A but **httpOnly cookies are required** for the long-term Pages-Functions deploy in Phase C per ADR-055 §3.

**Phase A.5 (Sprint 4) — localStorage**:
- `supabase.auth.setSession({ access_token, refresh_token })` writes to `localStorage` under the Supabase SDK's default key (`sb-<project-ref>-auth-token`).
- The legacy `bim-platform-token` key (per `AUTH_TOKEN_KEY` in `AuthClient.types.ts`) remains for the 30-day overlap window; `AuthClient` reads BOTH and prefers the Supabase token when present.

**Phase C (Sprint 5-6, post-Pages-Functions cutover) — httpOnly cookies**:
- Move to Supabase Auth's `@supabase/ssr` cookie helper. Cookie `Domain=app.pryzm.so`, `HttpOnly`, `Secure`, `SameSite=Lax`.
- This is the canonical Supabase pattern for apps with a subdomain split (apex marketing + app at `app.pryzm.so`); the apex never sees the cookie.
- Reference: Supabase docs — "Setting up Server-Side Auth for Next.js" → the cookie-set pattern is framework-agnostic and works for our Pages Functions + Vite SPA.

The cookie cutover is a separate operation from the JWT cutover; it ships in Sprint 5 (ADR-055 Phase C boundary) and reuses the dual-stack pattern (read Supabase cookie OR Supabase localStorage token, accept either).

### §7 — MFA + SSO readiness

Supabase Auth ships:

- **TOTP MFA** (RFC 6238) — `supabase.auth.mfa.enroll`, `challenge`, `verify`. Available on every Supabase project (free + Pro tiers).
- **WebAuthn / passkeys** — Supabase Auth roadmap, gated behind feature flag; expected GA mid-2026 per Supabase changelog.
- **SAML 2.0 SSO** — Supabase Pro tier (`Enterprise` add-on). Customer-IdP federation via SP-initiated flow.
- **OIDC SSO** — Supabase Pro tier. Same shape as SAML for the IdPs that prefer OIDC.

**PRYZM customer-tier mapping** (per C39 plan-tier matrix):

| Tier | MFA | SSO |
|---|---|---|
| C1 Free | TOTP optional, user-opt-in | – |
| C2 Pro | TOTP optional | – |
| C3 Studio | TOTP REQUIRED for org-owner | – |
| C4 Enterprise | TOTP REQUIRED for all org members | SAML / OIDC required |

Wiring: `EntitlementBundle.entitlements.mfa = { required: boolean, methods: ['totp', 'webauthn'] }` is read by `AuthClient` on session start; if `required && !user.mfaEnrolled` the client routes the user to an MFA enrolment page after the next sign-in.

### §8 — The AuthClient identity-change event MUST survive

This is the non-negotiable preservation surface. The cross-user project-leak fix (`§AUTH-SESSION-LEAK-2`, recorded in MEMORY.md, implemented at `packages/persistence-client/src/AuthClient.ts:382-414` + `apps/editor/src/ui/platform/AuthModal.ts:225-262`) is a **load-bearing security invariant**: without it, account-switch on a shared browser leaves the previous user's project list cached client-side and produces 404 storms (visible) PLUS theoretical project-id enumeration leak (security).

**New shape** (Sprint 4.3 wiring, fully unchanged DOM-event contract):

```ts
// packages/persistence-client/src/AuthClient.ts (post-migration shape)
constructor(supabaseClient: SupabaseClient, opts: AuthClientOptions) {
  this.supabase = supabaseClient;
  this.supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      const previousUserId = this.readPreviousUserId();   // legacy bim-platform-* + new sb-* both checked
      const userId = session?.user?.id ?? null;
      this.persistSession(session?.user, session?.access_token);     // writes both legacy + new storage keys during the overlap window
      if (previousUserId !== null && userId !== null && previousUserId !== userId) {
        _bus.emit('pryzm:auth:identity-changed', { previousUserId, userId });  // F.events.18 — unchanged contract
      }
    }
    if (event === 'SIGNED_OUT') {
      this.clearSession();
      _bus.emit(AUTH_SIGNED_OUT_EVENT);
    }
  });
}
```

The DOM event name (`pryzm:auth:identity-changed`), payload shape (`{ previousUserId, userId }`), and the `installAccountSwitchGuard` consumer in `AuthModal.ts:239-258` are **frozen**. Renaming the event is a breaking change to F.events.18 and would require a separate ADR.

A regression test (`apps/editor/src/ui/platform/__tests__/account-switch-guard.test.ts`, not yet authored — TODO in Sprint 4.3) verifies: sign in as user A → sign in as user B → `pryzm:auth:identity-changed` fires with `{ previousUserId: A, userId: B }` → `purgeUserScopedClientState` is called → `window.location.reload` is scheduled.

### §9 — Migration sequence (the actual steps)

| Sprint | Step | Deliverable | Reversibility |
|---|---|---|---|
| **4.1** | Provision Supabase Auth | Verify Supabase project has `auth` schema enabled (it does, by default). Configure Google + Microsoft OAuth providers in Supabase dashboard with the new redirect URIs (§4). No code change. | Trivial: disable providers in dashboard. |
| **4.2** | Mirror `pryzm_users` → `auth.users` + `public.profiles` | Run the §2 migration SQL against staging Supabase project first. Verify row count parity (`SELECT COUNT(*) FROM pryzm_users` == `SELECT COUNT(*) FROM auth.users` + `SELECT COUNT(*) FROM profiles`). Run against production Supabase project in a maintenance window. **Both tables coexist; nothing reads `auth.users` yet.** | Drop `auth.users` rows + drop `public.profiles`; no application code references them yet. |
| **4.3** | Dual-stack auth middleware live | `authMiddleware` gains Path 0 (Supabase JWT verify via JWKS) before existing Path 1 (legacy HS256). NEW signups + sign-ins go through `supabase.auth.signUp` / `supabase.auth.signInWithPassword`. Existing legacy tokens continue to validate via Path 1. New `AuthClient` (§8) wired. | Revert Path 0 + revert client to legacy `/api/auth/signin` route. Legacy path was never disabled. |
| **4.4** | RLS rollout | Enable RLS per §5 on `profiles`, `projects`, `project_versions`, `project_members`, `ai_usage`, `audit_log`, `consent_records`. Service-role server reads continue to bypass. Validate against branch-preview staging per ADR-055 §4: sign in as user A, attempt to read user B's project_id via the anon-key client → MUST 403. | `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` per table. |
| **4.5** | Force-migrate active legacy sessions on next sign-in | When `authMiddleware` Path 1 validates a legacy JWT AND the user has no `auth.users` row recorded as having signed in since Sprint 4.3, the response includes a `X-PRYZM-Auth-Migrate: required` header. The client's next call detects this header, calls `supabase.auth.signInWithPassword({ email, password })` if the user has a cached password (it does not — passwordless flow only), OR shows a "Please sign in again" modal that routes to `/sign-in`. Transparent for OAuth users (they round-trip silently). | Drop the header; users continue on legacy until natural 30-day expiry. |
| **4.6** | Drop the old HMAC JWT verification path | Day 30 after Sprint 4.3: delete `authMiddleware` Path 1 (`server.js:668`-end-of-jwt-block), delete `verifyToken` from `server/authStore.js:268-274`, delete `mintToken` from `server/oauthService.js:50-52`, delete the `/api/auth/google/callback` + `/api/auth/microsoft/callback` routes from `server.js`, delete `callbackHtml` from `server/oauthService.js:234-258`. `SESSION_SECRET` survives (per §3 for `EntitlementBundle`). | Restore from `git revert`; the dual-stack window is the safety net. |
| **4.7** | Retire bcrypt + drop `pryzm_users` | Delete `BCRYPT_ROUNDS`, `signUpViaSupabase`, `signInViaSupabase`, `signUpViaPg`, `signInViaPg`, `getUserByIdViaSupabase`, `getUserByIdViaPg` from `server/authStore.js`. Delete `bcryptjs` + `jsonwebtoken` from `package.json` (server-side). Drop `public.pryzm_users` table after 30 days of zero reads (verified via OTel `pryzm.pii.read` span filter for `table=pryzm_users`). | Restore `pryzm_users` from Supabase PITR (per ADR-055 §2 — Supabase Pro PITR for C48 §1.1 RPO ≤ 5 min). |

### §10 — Rollback playbook (per-step)

| Step | Failure mode | Rollback |
|---|---|---|
| 4.1 | Supabase Auth provider config wrong | Disable provider in dashboard; legacy OAuth still works. No code rollback. |
| 4.2 | Migration SQL fails / row-count mismatch | The SQL is idempotent (`ON CONFLICT (email) DO NOTHING`). Drop the inserted `auth.users` rows + `profiles` rows. No app behaviour changed. |
| 4.3 | Path 0 verification breaks legitimate Supabase tokens (JWKS cache stale, clock skew, etc.) | Path 1 (legacy HS256) is still live; users transparently fall through. Fix Path 0 + redeploy. |
| 4.4 | RLS denies a legitimate read (RLS predicate bug) | `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` per table. Server-side service-role reads were never affected. |
| 4.5 | Force-migrate header causes client crash | Strip the header from responses; clients silently continue on legacy. |
| 4.6 | Path 1 deletion breaks a forgotten code path | `git revert` the deletion commit. Re-deploy. Legacy users keep working; investigate the missed dep. |
| 4.7 | Bcrypt deletion breaks a forgotten code path | Same as 4.6. `pryzm_users` is not yet dropped at this step. |
| Post-4.7 `pryzm_users` drop | Discovered FK or read | Restore from Supabase PITR. **This is the only one-way step.** Schedule it 30 days after 4.7 confirmation. |

### §11 — Acceptance criteria (the gate)

A Sprint 4 cannot close until ALL of these are signed off, captured as PR checkboxes on the merge-gate PR:

- [ ] **Zero users locked out during cutover** — verified in staging branch preview (ADR-055 §4) by signing in as 5 test users immediately before Sprint 4.3 flip, then verifying they can still issue API calls 1 hour, 7 days, and 29 days later without re-sign-in.
- [ ] **RLS denies cross-user reads on all PII + PROJECT tier tables** — sign in as user A with anon-key client; attempt `SELECT * FROM projects WHERE owner_id = '<user-B-id>'`; MUST return zero rows (NOT 403; PostgreSQL RLS returns empty result-set, not an error — both client + server-test expect this).
- [ ] **OAuth flow round-trips Google + MS via Supabase Auth** — signup-with-Google + signup-with-MS verified end-to-end on staging; new `auth.users` row created with correct `app_metadata.providers`; `public.profiles` row created via the post-signup trigger (Sprint 4.2 ships this trigger); `pryzm:auth:identity-changed` fires correctly.
- [ ] **MFA enrolment surface live** — feature flag gated at C3 Studio + C4 Enterprise per C39; UI surfaces the enrolment QR code on first sign-in of an org-owner.
- [ ] **AuthClient identity-change event regression test passes** — `account-switch-guard.test.ts` (Sprint 4.3) is green; the test signs in as A → signs in as B → asserts `pryzm:auth:identity-changed` fires with `{ previousUserId, userId }` AND `purgeUserScopedClientState` was called AND `window.location.reload` was scheduled within 100ms.
- [ ] **`EntitlementBundle` JWT continues to sign + verify correctly** — `/api/entitlements/me` returns a bundle signed with `SESSION_SECRET` (HMAC-SHA256), and the client's entitlement store verifies the signature successfully. The check-bundle-signature CI gate (C39 §1.12 row in the gate table) passes.
- [ ] **Custom HS256 JWT verification path is permanently disabled** after the 30-day window — Sprint 4.6 PR includes a verification test that `authMiddleware` rejects a freshly-minted legacy-shape HS256 token.
- [ ] **`pryzm.pii.write` OTel spans emitted for every `auth.users` mutation** — C22 §1.7 audit-trail invariant; Sprint 4.3 wires the spans before deletion of the legacy code path.
- [ ] **Discrepancy resolved: token TTL** — C08 §1.1 says "7 days, configurable via `SESSION_SECRET_TTL`"; `authStore.js:29` says `'30d'`. ADR-056 §1 fixes this on the new path: 1h access token + 30d rotating refresh token, matching Supabase Auth defaults. C08 amendment in the follow-up PR adopts these values.

---

## Consequences

### Positive

1. **Enterprise readiness.** SOC 2 + ISO 27001 audited IdP unblocks C4 customer purchases. MFA + SAML/OIDC SSO directly addressable. Hand-rolled crypto risk surface eliminated.
2. **Code reduction.** ~470 lines deleted: most of `server/authStore.js`, most of `server/oauthService.js`, the `callbackHtml` HTML+JS string, `authMiddleware` Path 1, the bcrypt + jsonwebtoken dependencies.
3. **Refresh-token rotation** raises the bar on stolen-token impact from 30 days → 1 hour.
4. **Audit trail.** `auth.audit_log_entries` provides "who-signed-in-when-from-where" without app code.
5. **Public JWKS** unlocks the F-tier P0 plugin runtime (3rd-party verifiers can validate PRYZM tokens without seeing service-role secrets).
6. **RLS as defence-in-depth.** Even a server bug that forgets `canUserAccessProject` (C08 §2.2) cannot leak cross-user data when RLS is on.

### Negative

1. **The 30-day dual-stack window is the highest-risk surface** — see Risk section.
2. **Migration is one-way for `pryzm_users` drop.** Post-Sprint 4.7 + 30 days, the legacy table is gone; PITR restore is the only recovery for a discovered missed read.
3. **Operational dependency** on Supabase Auth uptime. Supabase publishes 99.9% SLA on Pro; outage = no new sign-ins for the duration. Mitigated by: existing sessions (1h access token + 30d refresh) continue to validate locally via JWKS-cached key; only new sign-ins are blocked.
4. **OAuth dashboards (Google, Microsoft) require coordinated change** — old redirect URIs must remain configured during the 30-day overlap, then removed after Sprint 4.6.
5. **Cookie cutover (Phase C, Sprint 5)** is a second, separable migration with its own risk surface.

### Neutral / forward-tracked

- **`SESSION_SECRET` survives** for `EntitlementBundle` signing (§3). C39 §1.12 is amended in the follow-up PR to reflect this decoupling.
- **`pryzm_users` legacy_id column** survives indefinitely on `public.profiles` as the bridge for any `projects.owner_id` row created before Sprint 4.2. Migration to UUID-keyed `owner_id` is a separate, much larger ADR (data migration on a hot table).
- **C08 §2.2 `canUserAccessProject`** continues to operate — it now reads against `public.profiles.legacy_id` in addition to `auth.users.id` for the bridge period. Long-term it simplifies to `auth.uid()` matching.

---

## Risk

**The biggest risk in the 30-day window is RLS-vs-legacy-JWT divergence.**

During Sprint 4.4 → Sprint 4.6 (~28 days of overlap), two authentication paths coexist:
- **Path 0 (Supabase JWT)** — sets the PostgreSQL session GUC `request.jwt.claims` → `auth.uid()` resolves to the Supabase user UUID → RLS predicates match against `public.profiles.id`.
- **Path 1 (legacy HS256)** — runs through `authMiddleware`; sets `req.auth.userId = '<user-...-...>' ` (legacy text id); does NOT set the PostgreSQL session GUC. RLS predicates would FAIL for Path 1 callers because `auth.uid()` returns NULL.

This is fine for the application because **all server reads go through the service-role Supabase client**, which bypasses RLS entirely. RLS exists as defence-in-depth, not as the primary authz. C08 §2.2 `canUserAccessProject` remains the primary gate.

But: if any developer during the 30-day window writes a route that switches from service-role to anon-key (e.g. forwarding the user's JWT for a read), the legacy-JWT users will see empty result sets while the Supabase-JWT users see correct data. The bug would manifest as "old users see no projects, new users see everything."

**Mitigation**:
- Sprint 4.4 ships a CI gate `check-no-anon-key-server-routes` that fails any new server route that imports an anon-key Supabase client.
- Branch-preview testing (ADR-055 §4) tests against BOTH JWT paths on every PR.
- The 30-day window is held to **exactly 30 days**, not extended — every day of overlap is another day this risk window stays open.

Secondary risks (lower-impact):
- **OAuth provider config drift** — old + new redirect URIs must both be live for the full overlap window; missing the old removal at Sprint 4.6 leaves a stale callback that attackers could probe.
- **bcrypt hash format edge cases** — pryzm uses `bcryptjs` (`$2a$`); Supabase GoTrue prefers `$2b$`. Both are accepted by GoTrue's verify path per the GoTrue source, but the rehash on first Supabase sign-in is the silent migration — if it fails, the user gets a verify error on their *next* sign-in. A pre-flight CI gate at Sprint 4.2 samples 5% of hashes and verifies them through a GoTrue test container.

---

## Related

- **ADR-055** — Parent. One PRYZM hosting architecture. This ADR is Phase A.5.
- **ADR-045** — Mixed-Auth Architecture. ADR-056 §3 supersedes the "JWT issuance" row of the ADR-045 split table. The "user identity in Supabase" row survives (now via `auth.users` + `public.profiles` instead of `public.pryzm_users`).
- **C08 §1.1** — Auth model. Superseded in part: the "no Supabase Auth" clause is overturned. Custom JWT is retained ONLY for `EntitlementBundle`.
- **C08 §1.3** — OAuth flow shape. Preserved (Google + Microsoft providers, popup pattern), but the mechanism moves to Supabase Auth's `signInWithOAuth`.
- **C22 §1.1 / §1.3 / §1.7 / §1.11** — Tier tagging, EU residency, PII audit spans, PII registry. PRESERVED. `auth.users.email` + `public.profiles.name` inherit the PII tier; the registry adds entries for both.
- **C39 §1.12** — `EntitlementBundle` HMAC signature. Amended in the follow-up PR to note `SESSION_SECRET` is the bundle-signing key, distinct from the Supabase Auth signing key.
- **C48 §1.1** — RTO/RPO. Unchanged: Supabase Pro PITR is the floor; `auth.users` is included in PITR scope automatically.
- **MEMORY note — "Auth session leak (account switch)"** — `§AUTH-SESSION-LEAK-2` invariant. PRESERVED unchanged (§8 of this ADR).

---

## Change log

- **2026-06-02** — Authored. Sequenced AFTER ADR-055 Phase A close. Implementation begins Sprint 4.
