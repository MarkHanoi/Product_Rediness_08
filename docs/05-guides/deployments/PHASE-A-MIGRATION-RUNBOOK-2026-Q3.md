# Phase A migration runbook — one PRYZM goes live (ADR-055 Phase A)

> **Stamp** · 2026-06-02 · **Status**: AUTHORITATIVE — companion to [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md)
> **Owner**: @MarkHanoi
> **Estimated wall-clock**: 4–6 hours active work + up to 24h DNS propagation observation window
> **When to use it**: the day we flip `pryzm.so` (apex → Cloudflare Pages) and provision `app.pryzm.so` + `api.pryzm.so` (→ Fly.io `fra`). Re-read every section before clicking anything.
> **Companion documents**:
> - [ADR-055](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) — the contract this runbook executes (§0 apex/app split, §3 Phase A row, §5 DNS map).
> - [PRODUCTION-HARDENING-CHECKLIST.md](./PRODUCTION-HARDENING-CHECKLIST.md) — the 15-section pre-flight audit; §15 is the gate that MUST be green before §1 of this runbook starts.
> - [ASTRO-RETIREMENT-PLAN-2026-Q3.md](./ASTRO-RETIREMENT-PLAN-2026-Q3.md) — what gets deleted after this runbook is green; executed in §9 below.

---

## §0 — Pre-flight (DO ALL OF THESE FIRST)

This section is the gate. Do not start §1 until every checkbox is ticked. Estimated time: 30–60 min on top of the listed dependencies.

- [ ] **`PRODUCTION-HARDENING-CHECKLIST` §15 final gate is green.** Walk the whole §15 list end to end. Every box ticked. No deferrals.
- [ ] **3 pre-flip security gates closed** (the three explicitly called out in ADR-055 §3 Phase A row's risk gate (b)):
  - [ ] `app.set('trust proxy', 2)` in `server.js` — confirmed for the Cloudflare → Fly two-hop chain (per PRODUCTION-HARDENING §6 "Trust-proxy hop count"). Verified with `curl -I https://app.pryzm.so/api/health/live` — `X-Forwarded-For` reveals the chain.
  - [ ] `STRIPE_WEBHOOK_SECRET` rotated for the new `https://app.pryzm.so/api/stripe/webhook` endpoint (see §7 of this runbook for the rotation procedure; do NOT skip ahead until §0 is complete — this checkbox just confirms the new secret value has been minted and is ready to set).
  - [ ] 6 `err.message` leak sites closed (PRODUCTION-HARDENING §11 "Per-route 500s leak `err.message`" — `server.js:2253, 2312, 2332, 2355, 2379, 340`). Each switched to the `{ error, errorId }` pattern. CI green.
- [ ] **Supabase project provisioned in `eu-central-1` (Frankfurt)**. Project name, region, DB password recorded in 1Password (or your team secret store). Captured:
  - [ ] `SUPABASE_URL` (form: `https://<project-ref>.supabase.co`)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (JWT, NEVER the anon key — this one bypasses RLS, server-only)
  - [ ] `DATABASE_URL` (direct PG connection string from Supabase → Settings → Database → Connection string → URI, `?sslmode=require` appended)
- [ ] **Supabase Pro upgrade decision logged**. Two paths:
  - **Path A (recommended for any paying-tenant launch)**: upgrade to Pro ($25/mo) BEFORE Phase A close so PITR is on from day one. Required to meet **C48 §1.1** RPO ≤ 5 min. Click Settings → Billing → Upgrade.
  - **Path B (alpha-only deferral)**: stay on Free until first paying tenant. Add an explicit note in the launch ticket: *"Phase A on free tier; Supabase Pro to be enabled before first paying tenant per ADR-055 §2."* Free tier means daily backup only — fails C48 audit, so this path is incompatible with selling subscriptions.
  - Decision recorded: `_______________________________` (Path A / Path B + date)
- [ ] **Fly CLI installed**:
  ```bash
  curl -L https://fly.io/install.sh | sh
  ```
  Verify: `flyctl version` returns `≥ 0.3.x`. On Windows use the PowerShell installer: `iwr https://fly.io/install.ps1 -useb | iex`.
- [ ] **Fly account created + payment method on file**. Free tier still covers Phase A (1× shared-cpu-1x / 512 MB always-on machine), but Fly requires a card on file for identity verification regardless of bill amount. Add at https://fly.io/dashboard/personal/billing.
- [ ] **Cloudflare account access verified**. `pryzm.so` zone is loaded in the dashboard. You have at minimum DNS-edit + Pages-edit + custom-domain permissions on the org.
- [ ] **GitHub Actions secret `FLY_API_TOKEN` is set** in the repo's Settings → Secrets and variables → Actions. The token comes from `flyctl auth token` (run locally after `flyctl auth login`). Without this, `.github/workflows/deploy-fly.yml` (the auto-deploy on push to `main`) cannot ship.
- [ ] **OAuth callback URI plan reviewed**. You have edit access to both:
  - Google Cloud Console → APIs & Services → Credentials → the PRYZM OAuth 2.0 Client ID
  - Microsoft Azure AD → App registrations → the PRYZM app
  - The exact URIs to add live in §6 of this runbook; do not edit yet.
- [ ] **Astro retirement plan reviewed**. You have read [ASTRO-RETIREMENT-PLAN-2026-Q3.md](./ASTRO-RETIREMENT-PLAN-2026-Q3.md) end to end, understand its §7 sequencing depends on this runbook completing through §8, and you know the rollback path (its §9).
- [ ] **Rollback plan reviewed**. You have read §10 of this runbook. You know the apex-CNAME revert is the fastest unwind. The pre-flip DNS state is captured as a Cloudflare CSV export (DNS tab → Export).

---

## §1 — Step-by-step: provision Supabase in EU

Provisioning Supabase is irreversible at the region pin — you pick `eu-central-1` once. If you misclick to a US region, you create a new project and migrate, you don't move the existing one.

### §1.1 — Click sequence

1. Go to <https://supabase.com> → Sign in (GitHub SSO recommended for audit trail).
2. Top-right → **New project**.
3. Form:
   - **Name**: `pryzm-production` (or `pryzm-prod-eu`).
   - **Database password**: generate with `openssl rand -base64 32`, copy to 1Password BEFORE clicking create — Supabase shows it once.
   - **Region**: **`Central EU (Frankfurt) — eu-central-1`**. This is mandated by **C22 §1.3** + **C49 §1.2** + ADR-055 §5. Do not pick anything else.
   - **Pricing plan**: Pro if Path A in §0; Free if Path B.
4. Click **Create new project**. Provisioning takes 1–3 minutes.

### §1.2 — Capture credentials

After provisioning, three values go into your secret store:

1. **`SUPABASE_URL`** — Project Settings → API → Project URL. Form: `https://<project-ref>.supabase.co`.
2. **`SUPABASE_SERVICE_ROLE_KEY`** — Project Settings → API → Project API keys → `service_role` (NOT `anon`). Click the eye icon to reveal, then copy. **This key bypasses RLS — server-only, never client-side.**
3. **`DATABASE_URL`** — Project Settings → Database → Connection string → tab **URI** → ensure `Use connection pooling` is OFF (we want the direct connection for boot migrations; the server's own pool handles concurrency). Append `?sslmode=require` if it isn't already. Form:
   ```
   postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require
   ```

### §1.3 — Verify

```bash
# Reachability + TLS
psql "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require" -c "SELECT version();"
```

Expected: PostgreSQL 15 (or current Supabase default) version banner. If you get `FATAL: password authentication failed`, the password you captured is wrong — re-reset via Settings → Database → Reset database password.

### §1.4 — Confirm PITR (Path A only)

Project Settings → Database → Backups → confirm "Point-in-Time Recovery: enabled". Granularity should read 2 min, retention 7 days. If it reads "daily backups only", the Pro upgrade hasn't applied yet — retry the page in 5 minutes; if still daily, contact Supabase support.

---

## §2 — Step-by-step: provision Fly app

The Fly app name `pryzm` is taken in this repo's `fly.toml` (line 20). If the global Fly namespace already has a `pryzm` from another org, you'll need to coordinate — the name is global within Fly.

### §2.1 — Authenticate

```bash
flyctl auth signup   # first time; opens browser
# OR
flyctl auth login    # if you already have an account
flyctl auth whoami   # verify: prints your email
```

### §2.2 — Create the app

```bash
flyctl apps create pryzm --org personal
# OR --org <your-org-slug> if you're on a team plan
```

Expected: `New app created: pryzm`. If it errors with `name already taken`, the global name is in use — pick `pryzm-eu` and update `fly.toml` line 20 in a pre-deploy commit.

### §2.3 — Pin the region

The repo's `fly.toml` already has `primary_region = "fra"` (line 36). Confirm and persist:

```bash
flyctl regions set fra --app pryzm
flyctl regions list --app pryzm   # expect: Region Pool: fra · Backup: (none)
```

Do NOT add a `--region iad` (US East) or any non-EU region — that violates **C22 §1.3** PII residency.

### §2.4 — Set every required secret

These are pulled directly from `server.js:88–240` env declarations + PRODUCTION-HARDENING §1–§3. **Run them in one block so you don't half-configure the app**:

```bash
# Required — boot blocks without these (server.js:223-235)
flyctl secrets set \
  SESSION_SECRET="$(openssl rand -hex 48)" \
  DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require" \
  --app pryzm

# Strongly recommended — soft-warn at boot, features break without these (server.js:237-246)
flyctl secrets set \
  SUPABASE_URL="https://<project-ref>.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-jwt-from-§1.2>" \
  ALLOWED_ORIGIN="https://pryzm.so,https://www.pryzm.so,https://app.pryzm.so" \
  PUBLIC_BASE_URL="https://app.pryzm.so" \
  CF_WORKER_URL="https://flat-morning-358d.<account>.workers.dev" \
  PRYZM_OWNER_EMAIL="<real-admin-email>" \
  PRYZM_OWNER_PASSWORD="<temporary-strong-password-rotate-after-first-login>" \
  --app pryzm

# Stripe (set if billing flips with this deploy; see §7 for webhook secret rotation)
flyctl secrets set \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..." \
  STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  --app pryzm

# OAuth (set if Google/Microsoft sign-in flips with this deploy; see §6 for callback URIs)
flyctl secrets set \
  GOOGLE_CLIENT_ID="..." GOOGLE_CLIENT_SECRET="..." \
  MICROSOFT_CLIENT_ID="..." MICROSOFT_CLIENT_SECRET="..." \
  --app pryzm
```

Notes:
- `SESSION_SECRET`: `openssl rand -hex 48` produces a 96-char hex string. Don't reuse the dev value.
- `DATABASE_URL`: paste the exact string from §1.2 above. URL-encode any `@` or `#` in the password.
- `PUBLIC_BASE_URL` is `https://app.pryzm.so` (NOT the apex `https://pryzm.so`). The apex never receives auth traffic per ADR-055 §5; OAuth `redirect_uri` is built relative to `PUBLIC_BASE_URL` (`server/oauthService.js:137-151`).
- `ALLOWED_ORIGIN` includes `pryzm.so` + `www.pryzm.so` so the marketing surface can call public endpoints (e.g. waitlist signup) if needed, plus `app.pryzm.so` for the editor itself. The two CORS scopes are merged via comma-separation per `server/corsPolicy.js:32-45`.
- `NODE_ENV=production` and `PORT=5000` are already set non-secretly via `fly.toml [env]` (lines 52–60). Do not duplicate them as secrets.

Verify:

```bash
flyctl secrets list --app pryzm
# Expect rows for: SESSION_SECRET, DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
# ALLOWED_ORIGIN, PUBLIC_BASE_URL, CF_WORKER_URL, PRYZM_OWNER_EMAIL, PRYZM_OWNER_PASSWORD,
# STRIPE_*, GOOGLE_*, MICROSOFT_*.
```

Each row shows a digest, not the value. If a row is missing, re-run that `flyctl secrets set ...` line.

### §2.5 — First deploy

```bash
flyctl deploy --remote-only --app pryzm
```

What happens:
1. `flyctl` tarballs the working tree (honouring `.dockerignore`) and uploads it to Fly's remote builder.
2. Remote builder runs the multi-stage `Dockerfile` — Stage 1 builder (≈3–5 min), Stage 2 runtime (≈30 s).
3. Image pushed to `registry.fly.io/pryzm:deployment-XYZ`.
4. Fly bounces the machine using `--strategy=rolling` (default for single-machine apps).
5. New machine boots → `tini` → `node ./dist/index.cjs` → tsx loader → `server.js` → `assertRequiredEnv()` passes → Express listens on `0.0.0.0:5000`.

Expected total: 5–8 minutes for the first deploy (remote-build cache cold). Subsequent deploys with cache warm: ~2–3 minutes.

If the build fails:
- **`pnpm install --frozen-lockfile` errors** — your local `pnpm-lock.yaml` is out of sync with `package.json`. Run `pnpm install` locally, commit, re-deploy.
- **`pnpm run build` OOMs** — Dockerfile already sets `NODE_OPTIONS=--max-old-space-size=6144`. If still OOMing, Fly's free builder is under-provisioned today; retry in 10 min or `flyctl deploy --remote-only --build-target builder --build-arg ...` with a smaller config.
- **Image push hangs** — Fly registry hiccup; retry once.

### §2.6 — Verify boot

```bash
flyctl status --app pryzm
# Expect: 1 machine, status "started", region "fra", health "passing"

flyctl logs --app pryzm
# Expect (top of log, last 30s):
#   [server] AI upstream: Cloudflare Worker relay → https://flat-morning-358d...
#   [server] Anthropic model id: claude-haiku-4-5
#   [server] Auth: custom JWT/bcrypt (SESSION_SECRET)
#   [server] SUPABASE_URL: FOUND
#   [server] listening on 0.0.0.0:5000
# Should NOT see:
#   [server] FATAL — missing required production env vars  (→ §2.4 incomplete)
#   ECONNREFUSED                                            (→ §1.2 wrong DATABASE_URL)

curl -fsS https://pryzm.fly.dev/api/health/live
# Expect: {"ok":true}  (server.js:1988)

curl -fsS https://pryzm.fly.dev/api/health/ready
# Expect: 200 with {"ok":true}  (server.js:1989-1998 — SELECT 1 against Supabase succeeded)
# If 503: DB unreachable. Most likely DATABASE_URL is wrong or Supabase rejected the IP.
# Check Supabase → Settings → Database → Network Restrictions (must be unrestricted or
# include Fly's egress range; Fly publishes egress IPs at https://fly.io/docs/networking/).
```

If `pryzm.fly.dev` resolves but returns 5xx, `flyctl logs` is the first stop. If logs are clean but the curl times out, the machine is up but Fly's edge isn't routing — `flyctl checks list --app pryzm` should show the `/api/health/ready` check; if it's failing the LB drains traffic.

---

## §3 — Step-by-step: build the apex pre-render

ADR-055 §0 promises `pnpm build:apex` produces `apps/editor/dist-apex/` containing pre-rendered `/`, `/pricing`, `/manifesto`, `/trust`. **At the time of this runbook (Sprint 3), that script does not exist yet.** This section authors the contract for it AND documents the Sprint-3 deferral.

### §3.1 — The target state (Sprint 4+)

```jsonc
// package.json (root) — to be added in Sprint 4
{
  "scripts": {
    "build:apex": "vite-ssg build --config apps/editor/vite.config.ts --out apps/editor/dist-apex"
  }
}
```

Output: `apps/editor/dist-apex/` containing:
- `index.html` (the landing page, pre-rendered)
- `pricing/index.html`
- `manifesto/index.html`
- `trust/index.html`
- `404.html`
- Hashed CSS + minimal JS bundles for hydration (if any).

Build characteristics:
- Pure static HTML — no `<script>` tags that hit `/api/*`.
- CSP can be permissive (no `unsafe-eval` needed since no Three.js, no editor SPA).
- Bundle size < 200 KB total (the editor SPA bundle is excluded).

### §3.2 — The Sprint-3 deferral (THIS phase)

**`vite-ssg` is NOT wired yet.** ADR-055 §3 Phase A row's deliverable (1) describes the target shape; it does not promise the SSG mechanism lands in Sprint 3.

**Sprint-3 decision (this runbook executes)**: ship Phase A with the apex serving the **existing Astro pre-built pages** until `vite-ssg` lands in Sprint 4.

Concretely:
1. Build the Astro project once: `pnpm --filter @pryzm/docs-site exec astro build`.
2. The output is `apps/docs-site/dist/` containing `/index.html`, `/pricing/index.html`, `/manifesto/index.html`, `/trust/index.html`, plus the Starlight developer-docs tree.
3. The Cloudflare Pages project (§4 below) serves `apps/docs-site/dist/` directly.
4. After Sprint 4 lands `vite-ssg`, the same Pages project flips its build output dir from `apps/docs-site/dist/` to `apps/editor/dist-apex/` — no DNS change, no downtime.

This deferral is **explicitly authorised by ADR-055 §3 Phase A** ("Build pre-render step: `pnpm build:apex` emits static HTML for /, /pricing, /manifesto, /trust → push to Cloudflare Pages"). The current Astro build is the same artefact shape; we are honouring the contract while deferring the mechanism switch by one sprint.

### §3.3 — One-sprint-deferral exit criteria

Sprint 4 closes the deferral when:
- [ ] `pnpm build:apex` script exists in root `package.json`.
- [ ] It produces `apps/editor/dist-apex/` with the four canonical routes.
- [ ] The 4 routes render identically (visual diff) to today's Astro pages.
- [ ] Cloudflare Pages project's build command updates from the Astro recipe to `pnpm install --no-frozen-lockfile && pnpm build:apex` and output dir to `apps/editor/dist-apex`.
- [ ] `apps/docs-site/src/pages/{index,pricing,manifesto,trust,start}.astro` deleted per [ASTRO-RETIREMENT-PLAN-2026-Q3.md](./ASTRO-RETIREMENT-PLAN-2026-Q3.md) §7 step 6.

Until Sprint 4 closes that, ASTRO-RETIREMENT-PLAN steps 5–8 are blocked — leave the Astro pages on disk.

### §3.4 — What to build for THIS deploy

```bash
# From the repo root
pnpm install
pnpm --filter @pryzm/docs-site exec astro build

# Confirm
ls apps/docs-site/dist/
# Expect: index.html  pricing/  manifesto/  trust/  start/  404.html
#         plus the Starlight /plugin-sdk/, /api/, /headless/, /selfhost/ trees
```

The Cloudflare Pages project (§4 next) deploys this `dist/` directory. After Sprint 4 closes the deferral, the same project's settings flip to the editor's SSG output.

---

## §4 — Step-by-step: deploy apex to Cloudflare Pages

The Cloudflare Pages project `pryzmapp` already exists per [CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md) (it serves the Astro pages today at `pryzm.so`). This section keeps that project and verifies it; we are NOT creating a new one.

If you are setting this up from scratch (no existing `pryzmapp` project), do the inline alternative below.

### §4.1 — Verify existing `pryzmapp` project (most common case)

1. Cloudflare Dashboard → **Workers & Pages** → click `pryzmapp`.
2. **Custom domains** tab:
   - `pryzm.so` (apex) — present.
   - `www.pryzm.so` — present, 301 → apex.
3. **Settings** → **Builds & deployments**:
   - Production branch: `main`.
   - Build command: `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build`.
   - Build output dir: `apps/docs-site/dist`.
   - Env: `NODE_VERSION=20`, `SKIP_DEPENDENCY_INSTALL=true`.
4. **Deployments** tab: latest production deploy is green.

No clicks needed if all of the above is true. Skip to §5.

### §4.2 — Inline alternative: provisioning the Pages project from scratch

(Only if `pryzmapp` doesn't exist — e.g. a brand-new Cloudflare account.)

1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → tab **Pages** → **Connect to Git** (recommended for branch previews) OR **Upload assets** (for a one-shot deploy).
2. **Connect to Git** path:
   - Authorize GitHub → select this repo → branch `main`.
   - Project name: `pryzm-apex` (or `pryzmapp` for continuity with retirement plan §3.3).
   - Build settings:
     - Framework preset: **None**.
     - Build command: `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build`
     - Build output directory: `apps/docs-site/dist`
     - Root directory (advanced): `/` (default)
   - Environment variables: `NODE_VERSION=20`.
   - Click **Save and Deploy**. First build: 4–8 min.
3. **Upload assets** path (one-shot, no Git integration):
   - Build locally first per §3.4.
   - Upload the `apps/docs-site/dist/` folder.
   - Project name + production branch as above (production branch is informational in upload mode).
4. **Custom domains**:
   - Add `pryzm.so` (apex). Cloudflare auto-creates a CNAME-flat record on the zone (only works if the zone is also on Cloudflare — confirmed yes).
   - Add `www.pryzm.so`. Set up a redirect rule (Rules → Redirect Rules) `www.pryzm.so/*` → `https://pryzm.so/$1` 301.
   - TLS auto-provisions in 30–60 seconds. Verify the lock icon at https://pryzm.so.

### §4.3 — Verify the Pages deploy serves the four canonical surfaces

```bash
curl -I https://pryzm.so/                 # 200 — landing
curl -I https://pryzm.so/pricing          # 200 — pricing
curl -I https://pryzm.so/manifesto        # 200 — manifesto
curl -I https://pryzm.so/trust            # 200 — trust

# Cache header check — Cloudflare should be serving from edge cache after first hit
curl -I https://pryzm.so/ | grep -i cf-cache-status
# First hit:  CF-Cache-Status: DYNAMIC or MISS
# Repeat:     CF-Cache-Status: HIT
```

If any of the four routes returns 404, the Astro build didn't emit them — re-run `pnpm --filter @pryzm/docs-site exec astro build` locally and `apps/docs-site/dist/` should contain `pricing/index.html` etc. If it doesn't, the corresponding `apps/docs-site/src/pages/<route>.astro` is missing or broken.

### §4.4 — Confirm apex never reaches the API

The apex must NEVER make authenticated calls. Belt-and-braces:

```bash
# These should NOT be reachable from pryzm.so (they live on app.pryzm.so / api.pryzm.so)
curl -I https://pryzm.so/api/health/live   # Expect: 404 (no API routes on Pages)
```

If `pryzm.so/api/*` returns 200, you have a Pages Functions or proxy rule that shouldn't be there — remove it. The split is: apex = static only.

---

## §5 — Step-by-step: wire `app.pryzm.so` to Fly

Two DNS records, two Fly cert provisions, three verifications.

### §5.1 — Cloudflare DNS

1. Cloudflare Dashboard → `pryzm.so` zone → **DNS** → **Records**.
2. **Add record** for `app`:
   - Type: `CNAME`
   - Name: `app`
   - Target: `pryzm.fly.dev`
   - Proxy status: **Proxied** (orange cloud ON) — so Cloudflare WAF + cache + TLS termination apply.
   - TTL: Auto.
   - Save.
3. **Add record** for `api`:
   - Same shape — `CNAME api → pryzm.fly.dev`, **Proxied ON**.
   - Save.
4. Verify in the records list: both rows show "Proxied" + the orange cloud icon.

### §5.2 — Fly TLS certificates

Cloudflare proxies the connection, but Fly also needs to know `app.pryzm.so` and `api.pryzm.so` map to this app so it can issue the Let's Encrypt certificate that Cloudflare's "Full (strict)" SSL mode validates against.

```bash
flyctl certs add app.pryzm.so --app pryzm
flyctl certs add api.pryzm.so --app pryzm

# Verify
flyctl certs list --app pryzm
# Expect both hostnames listed with "Type: managed", "Status: Ready" (or "Awaiting Configuration"
# briefly while ACME challenge completes).

flyctl certs check app.pryzm.so --app pryzm
flyctl certs check api.pryzm.so --app pryzm
# Expect: Hostname matches DNS / ACME challenge succeeded / Certificate issued.
```

If `flyctl certs check` says **Awaiting Configuration**, the most common cause is that Cloudflare's proxy is masking the ACME HTTP-01 challenge. Fly's docs (<https://fly.io/docs/networking/custom-domain/>) walk through the workaround: either temporarily disable the proxy (grey cloud), wait for ACME, re-enable; or set SSL/TLS mode in Cloudflare to **Full (strict)** which makes Cloudflare hand off the challenge correctly.

### §5.3 — Cloudflare SSL/TLS mode

Cloudflare Dashboard → `pryzm.so` zone → **SSL/TLS** → **Overview**.

- Encryption mode: **Full (strict)**. (NOT "Flexible" — that decrypts at Cloudflare and re-encrypts to Fly with self-signed-acceptance, which weakens MITM protection.)
- Edge certificates → **Always Use HTTPS**: ON.
- **Minimum TLS Version**: 1.2 (or 1.3 if you don't need IE11 support — PRYZM doesn't).

### §5.4 — Verify

```bash
curl -fsSI https://app.pryzm.so/                          # Expect: 200 (the editor SPA)
curl -fsSI https://app.pryzm.so/api/health/live           # Expect: 200 + {"ok":true}
curl -fsSI https://api.pryzm.so/api/health/live           # Expect: 200 + {"ok":true}
curl -fsSI https://api.pryzm.so/api/health/ready          # Expect: 200 (DB reachable)

# TLS chain inspection
openssl s_client -connect app.pryzm.so:443 -servername app.pryzm.so </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates
# Expect: subject= CN=app.pryzm.so · issuer= C=US, O=Let's Encrypt, CN=R3 (or E1)
# notBefore/notAfter in the next 90 days.

# Cloudflare proxy confirmation
curl -I https://app.pryzm.so/ | grep -i cf-ray
# Expect: cf-ray: <some-hex>-FRA (or your nearest CF POP)
# If no cf-ray header, the request is going direct to Fly, not through Cloudflare —
# fix the DNS proxy toggle in §5.1.
```

---

## §6 — OAuth callback URI updates

Before this step, sign-in via Google or Microsoft will fail with `redirect_uri_mismatch` on the new host. Update both provider dashboards.

The code-side builder is `getBaseUrl()` in `server/oauthService.js:137-151`, which reads `PUBLIC_BASE_URL` (set in §2.4 to `https://app.pryzm.so`). The generated `redirect_uri` values are therefore:

- `https://app.pryzm.so/api/auth/google/callback`
- `https://app.pryzm.so/api/auth/microsoft/callback`

### §6.1 — Google Cloud Console

1. <https://console.cloud.google.com> → APIs & Services → **Credentials** → open the PRYZM OAuth 2.0 Client ID.
2. **Authorized redirect URIs** — Add:
   ```
   https://app.pryzm.so/api/auth/google/callback
   https://pryzm.fly.dev/api/auth/google/callback
   ```
   The `pryzm.fly.dev` entry is the Fly direct URL — kept as a fallback in case Cloudflare's proxy needs to be bypassed for debugging.
3. **Branch previews** — Google does NOT support wildcard redirect URIs. For Cloudflare Pages branch previews under `<branch>.pryzm-staging.pages.dev`, either:
   - Enumerate the specific staging URLs explicitly (one entry per long-lived staging branch — fine for ≤ 5 branches), OR
   - Use the Fly staging app's URL (`pryzm-staging.fly.dev/api/auth/google/callback`) as a single entry shared by all branch previews that hit the staging API.
4. **Do NOT remove** the existing `http://localhost:5000/api/auth/google/callback` URI — dev still needs it. Also keep any old Replit URI for ≥ 1 sprint as rollback safety (PRODUCTION-HARDENING §9 instructs the same).
5. Save.

### §6.2 — Microsoft Azure AD

1. <https://portal.azure.com> → Azure Active Directory → **App registrations** → open the PRYZM app.
2. **Authentication** → **Redirect URIs** (type: Web) → Add:
   ```
   https://app.pryzm.so/api/auth/microsoft/callback
   https://pryzm.fly.dev/api/auth/microsoft/callback
   ```
3. Branch previews: same caveat — Azure supports wildcard `*` only for "Supported account types: Personal Microsoft accounts only", not for organization tenants. Enumerate the staging URLs you actually use.
4. Keep `http://localhost:5000/api/auth/microsoft/callback` (dev) and the old Replit URI (rollback).
5. **Save** at the top of the Authentication panel — Azure has a separate save button per blade.

### §6.3 — Verify

```bash
# Google redirect endpoint
curl -I "https://app.pryzm.so/api/auth/google"
# Expect: 302 Location: https://accounts.google.com/o/oauth2/v2/auth?...&redirect_uri=https%3A%2F%2Fapp.pryzm.so%2Fapi%2Fauth%2Fgoogle%2Fcallback&...
# Confirm the redirect_uri parameter matches what you added above.

# Microsoft redirect endpoint
curl -I "https://app.pryzm.so/api/auth/microsoft"
# Expect: 302 Location: https://login.microsoftonline.com/.../oauth2/v2.0/authorize?...&redirect_uri=https%3A%2F%2Fapp.pryzm.so%2Fapi%2Fauth%2Fmicrosoft%2Fcallback&...
```

End-to-end test: open https://app.pryzm.so in a private window → click Sign in with Google → complete the consent screen → expect to land on `https://app.pryzm.so/projects` (the post-sign-in destination). If the consent screen shows `Error 400: redirect_uri_mismatch`, the URI in §6.1 step 2 has a typo (most commonly `http` vs `https`, trailing slash, or `www.`).

---

## §7 — Stripe webhook endpoint update

Webhooks are stateful — Stripe stores the endpoint URL and the signing secret on the dashboard side. After §2 deploy the editor is reachable at the new URL but Stripe is still posting to the old Replit URL (which now 502s).

### §7.1 — Update the endpoint

1. Stripe Dashboard → **Developers** → **Webhooks** → click the existing PRYZM endpoint.
2. Click **Update details** (or "..." → **Edit endpoint**).
3. **URL**: change to `https://app.pryzm.so/api/stripe/webhook` (was the Replit/dev URL).
4. **Events to send**: confirm unchanged — the editor's handler dispatches on `customer.subscription.*`, `invoice.*`, `checkout.session.completed`, etc. (`server.js:1856` onward).
5. Save.

### §7.2 — Rotate the signing secret

Stripe's signing secret is bound to the endpoint — when the URL changes, rotate the secret in lockstep so the new URL has a fresh secret and the old URL's compromised-if-leaked secret is invalidated.

1. Same endpoint detail page → **Signing secret** → **Roll secret** (or **Reveal**, then copy if you don't want to rotate).
2. Copy the new `whsec_...` value.
3. Update the Fly secret:
   ```bash
   flyctl secrets set STRIPE_WEBHOOK_SECRET=whsec_... --app pryzm
   ```
   This triggers a Fly redeploy automatically (~2 min).
4. Verify the new value is active:
   ```bash
   flyctl logs --app pryzm | grep -i 'stripe.*webhook'
   ```
   On boot you'll see the existing log lines re-emit; no plaintext of the secret (verified safe per PRODUCTION-HARDENING §7).

### §7.3 — Trigger a test event

1. Stripe Dashboard → Developers → Webhooks → the endpoint → **Send test webhook**.
2. Pick event type: `checkout.session.completed` (or any subscribed event).
3. Click **Send test webhook**.
4. In Fly logs:
   ```bash
   flyctl logs --app pryzm | tail -50
   ```
   Expect: `[stripe] Event received: checkout.session.completed` (`server.js:1856`) followed by handler-specific log lines, then the Stripe Dashboard shows the test event as **Delivered (200)**.
5. If the dashboard shows **Failed (400)** with `No signatures found matching the expected signature`, the `STRIPE_WEBHOOK_SECRET` doesn't match — re-copy from §7.2 step 2 and `flyctl secrets set` again.

---

## §8 — Verification matrix (after the flip)

Run this entire matrix after §1–§7 complete. Every row green before declaring Phase A live.

| # | Check | Command | Expected | If it fails |
|---|---|---|---|---|
| 1 | Apex live (Cloudflare Pages) | `curl -I https://pryzm.so/` | 200 · `cf-ray` header present · `cf-cache-status: HIT` after first hit | Re-check §4.1 build status; confirm Pages deploy is green. |
| 2 | Apex marketing routes | `curl -I https://pryzm.so/pricing https://pryzm.so/manifesto https://pryzm.so/trust` | 200 each | Astro build missing the route — see §4.3 fix. |
| 3 | Apex never hits API | `curl -I https://pryzm.so/api/health/live` | 404 (no API on apex) | If 200, you have a stray Pages Function or proxy — delete it. |
| 4 | App live (Fly) | `curl -I https://app.pryzm.so/` | 200 · `cf-ray` header (Cloudflare proxy ON) | Most likely cause: §5.1 DNS not propagated yet, or §5.2 cert pending. |
| 5 | App health/live | `curl -fsS https://app.pryzm.so/api/health/live` | `{"ok":true}` | `flyctl logs` — check boot output. |
| 6 | API alias works | `curl -fsS https://api.pryzm.so/api/health/live` | `{"ok":true}` | Same as #4 — DNS for `api` record. |
| 7 | DB reachable | `curl -fsS https://api.pryzm.so/api/health/ready` | 200 (SELECT 1 succeeded) | `DATABASE_URL` wrong OR Supabase network restrictions blocking Fly egress. |
| 8 | Deep health (heavy) | `curl -fsS https://api.pryzm.so/api/health \| jq` | `schemaOk: true`, `backend: 'supabase'`, all 3 tables present | If `schemaOk: false`, run `pgMigrate.js` boot migration manually. |
| 9 | TLS apex | `openssl s_client -connect pryzm.so:443 -servername pryzm.so </dev/null 2>/dev/null \| openssl x509 -noout -dates` | `notBefore` recent · `notAfter` 90+ days out | Cloudflare auto-renew should handle this; if cert is missing, re-add the custom domain in §4.1. |
| 10 | TLS app | `openssl s_client -connect app.pryzm.so:443 -servername app.pryzm.so </dev/null 2>/dev/null \| openssl x509 -noout -issuer -subject -dates` | Subject `CN=app.pryzm.so`, issuer `Let's Encrypt`, dates valid | `flyctl certs check app.pryzm.so` to debug. |
| 11 | HSTS header | `curl -I https://app.pryzm.so/ \| grep -i strict-transport-security` | `max-age=63072000; includeSubDomains; preload` | `server/securityHeaders.js:190-192` not active — most likely `NODE_ENV !== 'production'` or `dist/` missing in image (see PRODUCTION-HARDENING §4). |
| 12 | CSP enforced (not Report-Only) | `curl -I https://app.pryzm.so/ \| grep -i 'content-security-policy'` | `Content-Security-Policy: ...` (NOT `…-Report-Only:`) | Same as #11 — dev-mode headers. |
| 13 | CORS allow + reject | `curl -I -H 'Origin: https://app.pryzm.so' https://api.pryzm.so/api/v1/projects` then `-H 'Origin: https://evil.example'` | First returns CORS headers; second does NOT echo `Access-Control-Allow-Origin` | `ALLOWED_ORIGIN` env var wrong — see §2.4. |
| 14 | Sign-in flow | Open `https://app.pryzm.so` in private window → Sign in with Google | Roundtrip lands on `/projects` (the project hub) | `redirect_uri_mismatch` → §6.1 step 2 typo. |
| 15 | Create project | Post-auth, create a new project from the project hub | Project row appears in Supabase Dashboard → Table Editor → `projects` | If not in Supabase, `SUPABASE_SERVICE_ROLE_KEY` likely missing — falls back to PG (or in-memory) per PRODUCTION-HARDENING §2. |
| 16 | Stripe webhook | Stripe Dashboard → Send test event | Dashboard shows 200, Fly logs show `[stripe] Event received: ...` | §7.3 procedure. |
| 17 | OTel spans (if `OTEL_EXPORTER_OTLP_ENDPOINT` set) | Check your OTel sink (Honeycomb / Grafana Cloud / Jaeger) | New traces appearing with service.name=pryzm-editor | Endpoint env var unset is OK — spans no-op silently. |
| 18 | Rate-limit sanity | Loop 60 `curl https://api.pryzm.so/api/health/live` requests in a tight burst | All return 200 (well under the global 200/15min) | Rate limit applies per-IP — if you hit 429 something's wrong with `trust proxy` (PRODUCTION-HARDENING §6). |

Time budget: 15–20 min to walk this whole matrix end to end.

---

## §9 — Astro retirement (after §8 all green)

This section is the entry point to [ASTRO-RETIREMENT-PLAN-2026-Q3.md](./ASTRO-RETIREMENT-PLAN-2026-Q3.md). Do NOT start until §8 has been green for **at least 24 hours** — let DNS propagate, let real traffic flow, let any silent regression surface in monitoring.

### §9.1 — Trigger condition

- [ ] §8 matrix all green.
- [ ] At least 24 hours elapsed since §5.4 verification.
- [ ] No Fly-log error spikes, no Cloudflare 5xx rate increases, no Stripe webhook delivery failures since the flip.
- [ ] No user reports of "site is broken" via the support channel.

### §9.2 — Execute

Follow ASTRO-RETIREMENT-PLAN-2026-Q3.md **§7 step sequence** start to finish. Specifically:

- **Step 1** — Pre-flight (re-verify the app surfaces are live; you've already done §8 here so this is a fast revisit).
- **Step 2** — Editor adds the four surfaces (whether this is a no-op for Sprint 3 depends on the deferral in §3.2 above — if the editor hasn't shipped `/pricing`, `/manifesto`, `/trust` routes yet, **STOP here and leave Astro in place** until Sprint 4 closes the deferral; you can flip the apex and run §10–§12 below without executing §9 yet).
- **Step 3** — Provision `docs.pryzm.so` BEFORE editing anything else.
- **Step 4** — Flip the apex DNS (this runbook's §4 already did this if you went the "new Pages project" path; if Astro stays as the apex source until Sprint 4 it's a no-op).
- **Steps 5–8** — Remove Cloudflare custom-domain mapping for `pryzm.so` from the docs-site project, delete the customer-facing Astro pages, remove the build glue, sweep documentation references.
- **Step 9** — Final verification per ASTRO-RETIREMENT-PLAN §8.

Each step is reversible until ASTRO-RETIREMENT-PLAN §7 Step 6 (the source-file deletions land). After that, rollback = `git revert`.

### §9.3 — Commit + ship

The deletions land as a single PR titled `chore: ADR-055 Phase A close — Astro retirement`. CI must be green; the new `check-no-duplicate-surfaces.mjs` gate (ADR-055 §1 promised, may not yet exist — see ASTRO-RETIREMENT-PLAN §5.3) will reject any reintroduction.

---

## §10 — Rollback playbook

Indexed by what fails. Each entry is the fastest possible unwind.

### §10.1 — `app.pryzm.so` 500s after deploy

**Symptom**: `curl https://app.pryzm.so/` returns 502 / 503 / 504.

**Fastest unwind** (1–5 min DNS propagation):
1. Cloudflare DNS → `app` CNAME → temporarily change target back to `pryzmapp.pages.dev` (or just delete the record to take the app offline cleanly).
2. Users see Cloudflare's default landing (or the docs-site if `app.pryzm.so` was previously a docs subdomain).
3. Diagnose Fly side: `flyctl logs --app pryzm` to see the actual error.
4. Most common: a missing secret you forgot to set in §2.4 → `flyctl secrets set X=Y` triggers redeploy.
5. Re-point the CNAME to `pryzm.fly.dev` once `flyctl status` is healthy.

### §10.2 — `pryzm.so` apex serves wrong content (broken landing)

**Symptom**: `curl https://pryzm.so/` returns the previous deploy's content, or 500, or a blank page.

**Fastest unwind**:
1. Cloudflare → Workers & Pages → `pryzmapp` → **Deployments** → click the previous green deployment → **Rollback to this deployment**. Takes < 60s to propagate.
2. Diagnose the broken deploy: build logs in the same Deployments tab.
3. Fix locally, push to `main`, Pages auto-deploys; do not click rollback again until the new green deploy is verified.

### §10.3 — OAuth sign-in returns `redirect_uri_mismatch`

**Symptom**: User clicks "Sign in with Google" → Google consent screen shows Error 400 `redirect_uri_mismatch`.

**Fastest unwind**:
1. Google Cloud Console → Credentials → OAuth Client → **Authorized redirect URIs** → add the exact URI from the error message (copy-paste). The error message tells you what URI the server actually sent; the dashboard tells you what's whitelisted; the diff is the typo.
2. Save. Google honours the change in < 30s.
3. If the URI uses `pryzm.fly.dev` instead of `app.pryzm.so`, the server's `PUBLIC_BASE_URL` env var is wrong → `flyctl secrets set PUBLIC_BASE_URL=https://app.pryzm.so --app pryzm` (triggers redeploy).

### §10.4 — Stripe webhooks failing (revenue events not landing)

**Symptom**: Stripe Dashboard → Webhooks → endpoint shows **Failed** for recent events.

**Fastest unwind**:
1. Click the failed event → see the response body. Three common cases:
   - `404` — URL is wrong. Update endpoint URL per §7.1.
   - `400 No signatures found matching ...` — `STRIPE_WEBHOOK_SECRET` doesn't match the dashboard secret. Re-do §7.2.
   - `500` — handler crashed. `flyctl logs` to see the stack.
2. While debugging, Stripe automatically retries failed events for up to 3 days (exponential backoff). No data is lost; the user-visible effect is the customer's subscription state lags until the webhook lands.

### §10.5 — DB unreachable post-flip

**Symptom**: `curl https://api.pryzm.so/api/health/ready` returns 503.

**Fastest unwind**:
1. `flyctl logs --app pryzm | grep -i postgres` — look for the actual connect error.
2. Common causes:
   - Wrong `DATABASE_URL` — re-verify §1.2 exact value; set with `flyctl secrets set DATABASE_URL=... --app pryzm`.
   - Supabase IP restriction — Settings → Database → Network Restrictions; either set to unrestricted or whitelist Fly's egress IP range.
   - Supabase project paused — happens on Free tier after 7 days of inactivity. Unpause from dashboard.
3. The server has an in-memory fallback (`§SERVER-PG-DEGRADE` in `projectStore.js`) — users won't see hard errors during the diagnosis window, but writes won't persist. Resolve quickly.

### §10.6 — Full Phase A unwind

**Symptom**: Phase A is fundamentally broken, executive decision to roll back.

**Sequence** (target time: 15 min):
1. **DNS** — Cloudflare DNS → revert `pryzm.so` apex CNAME to its pre-flip target (recorded in §0 last bullet); delete the `app` and `api` CNAME records.
2. **OAuth** — leave the new redirect URIs in place (additive — won't break anything); they're harmless until removed.
3. **Stripe** — Stripe Dashboard → revert the webhook endpoint URL to the old Replit URL (you took a screenshot in §0 of the pre-change state, right?). Re-rotate the secret on the old endpoint if needed.
4. **Fly app** — `flyctl scale count 0 --app pryzm` to stop the machine (you keep the app + secrets for next attempt, but no machine = no traffic = no charge).
5. **Cloudflare Pages** — leave the project running; it still serves the Astro pages at `pryzm.so` after the DNS revert.
6. **Post-mortem** — file an incident report. Diagnose. Re-plan the retry.

---

## §11 — Cost confirmation post-flip

Snapshot the actual cost surface 24 hours after the flip. If anything is off-projection, document + amend ADR-055 §2.

| Resource | Free-tier headroom | Snapshot value (fill in) | ADR-055 §2 projection | Verdict |
|---|---|---|---|---|
| **Fly machine** | 1× shared-cpu-1x · 512 MB · always-on covered by free tier (Phase A only). | `flyctl status --app pryzm` → CPU% + memory% peak in last 24h | `$0` Phase A | _____ |
| **Cloudflare Pages** | 500 builds/mo · unlimited requests · 100 custom domains. | Pages dashboard → Analytics → 24h request count | `$0` always | _____ |
| **Cloudflare DNS + WAF + Analytics** | Free on free plan. | DNS dashboard → analytics | `$0` | _____ |
| **Supabase Pro** (Path A) | 8 GB DB · 100 GB egress · PITR · daily backups · 7-day retention. | Supabase dashboard → Reports → Usage | `$25/mo` | _____ |
| **Supabase Free** (Path B) | 500 MB DB · 5 GB egress · daily snapshots only · pauses after 7d inactivity. | Same | `$0` (alpha only — incompatible with C48 audit) | _____ |
| **Anthropic via CF Worker** | Cloudflare Worker free tier (100k req/day) + your existing Anthropic spend. | Anthropic dashboard → Usage | passes through; not new on this flip | _____ |
| **GitHub Actions** | 2000 min/mo on private repos. | Settings → Billing → Actions usage | `$0` (deploy job ~5 min × ~5 deploys/wk = 100 min/mo) | _____ |
| **Stripe** | No platform fee from Stripe; per-transaction 2.9% + 30¢. | N/A | passes through | _____ |
| **OTel sink (if any)** | Depends on vendor — Honeycomb free 20M events/mo, Grafana Cloud free 50 GB. | Vendor dashboard | within free tier expected | _____ |

If a resource is at >70% of free-tier capacity, schedule the upgrade decision into the next sprint planning. If Fly memory is consistently > 80% (per `flyctl status` peaks), bump `memory_mb = 1024` in `fly.toml` (crosses the free-tier line — deliberate billing event of ~$5/mo).

---

## §12 — Post-flip 7-day observation

Monitor these every day for the first week. Document anomalies; major regressions trigger an ADR-055 amendment.

| Metric | Source | Healthy range (baseline) | Alert threshold |
|---|---|---|---|
| **Fly machine memory** | `flyctl status --app pryzm` (or `flyctl metrics` if wired) | < 70% of 512 MB | > 85% sustained 5 min |
| **Fly machine CPU** | Same | < 50% steady-state | > 80% sustained 5 min |
| **Fly machine restarts** | `flyctl logs --app pryzm | grep -i restart` | 0 unexpected restarts/day | ≥ 2 unexpected restarts/day |
| **Cloudflare cache hit ratio** (apex) | Pages → Analytics → Cache | > 90% after first 6h | < 70% — cache rules misconfigured |
| **Cloudflare 5xx rate** (app subdomain) | Cloudflare → Analytics → HTTP status | < 0.1% | > 1% sustained 10 min |
| **Supabase connection count** | Supabase → Reports → Database | < 30 (out of 60 free-tier limit; 200 Pro) | > 80% of limit |
| **Supabase DB size** | Same | < 50% of plan limit | > 80% — plan upgrade or data archival needed |
| **Stripe webhook delivery rate** | Stripe Dashboard → Webhooks → endpoint → Recent attempts | 100% delivered | < 99% — check `STRIPE_WEBHOOK_SECRET` |
| **Google OAuth success rate** | Google Cloud Console → APIs & Services → Credentials → OAuth → Metrics | > 98% | < 95% — check redirect URIs |
| **Microsoft OAuth success rate** | Azure AD → Sign-in logs filtered to the app | > 98% | < 95% — same |
| **`/api/health/ready` failure rate** | Fly checks dashboard or external uptime monitor (Better Uptime / UptimeRobot) | < 0.5% | > 2% — DB intermittently unreachable |
| **OTel error spans** (if wired) | OTel sink dashboard | < 1% error rate | > 5% — check the dominant error type |
| **Stripe revenue events** | Stripe Dashboard → Payments | matches projection | unexpected drop = webhook drop |

At day 7, write a one-page status update — file at `docs/05-guides/deployments/PHASE-A-WEEK-1-OBSERVATIONS-<date>.md`. Three sections: (1) what we expected, (2) what we measured, (3) what to fix in the next sprint. If any row in this table was in alert range for > 10 min, that's a paragraph in section (3).

---

## §13 — Change log

- **2026-06-02** — Authored at ADR-055 acceptance. To be executed at Phase A close (Sprint 3 / 2026-Q3). Companion to PRODUCTION-HARDENING-CHECKLIST + ASTRO-RETIREMENT-PLAN.
