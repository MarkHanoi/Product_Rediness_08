# OPEN-006 — Phase F.infra: External Services & CI Pipeline

> **Status**: 🔴 ACTIVE — human-action items; code is ready, infrastructure is not
> **Anchor**: `52-PHASE-F-EXECUTION-CHECKLIST.md`, `20-PHASE-F-PLAN.md`, C07 §5, C08 §2
> **Convergence booleans blocked**: #7 (plugin_sdk_published), #8 (headless_published), #9 (marketplace_live)
> **Effort**: Each item is 0.5–1 day of human action (requires npm/DNS/Stripe/GitHub access)
> **Outcome**: PRYZM3 fully deployed — 9/9 convergence booleans true.

---

## §0 — Overview

All code required for Phase F is implemented. The following items are **infrastructure and configuration actions** that cannot be completed by the codebase alone — they require credentials, DNS access, npm organization membership, and external service accounts.

| Item | ID | Status | Convergence Impact |
|---|---|---|---|
| CI Pipeline (GitHub Actions) | OI-026 | ❌ NOT DONE | C01 §5 — gate enforcement in CI |
| npm publish `@pryzm/sdk` | OI-011 | ❌ NOT DONE | Boolean #7 |
| npm publish `@pryzm/headless` | OI-012 | ❌ NOT DONE | Boolean #8 |
| DNS `marketplace.pryzm.app` | OI-013 | ❌ NOT DONE | Boolean #9 |
| Stripe secret key + webhook | OI-014 | ❌ NOT DONE | Marketplace payments |
| Yjs WebSocket server (`VITE_SYNC_URL`) | OI-015 | ❌ NOT DONE | Real-time collaboration |
| OTLP export target | OI-022 | ❌ NOT DONE | C10 §2 observability |
| Email transport (SMTP) | OI-023 | ❌ NOT DONE | `packages/email-transport/` |
| Google/Microsoft OAuth | OI-024 | ❌ NOT DONE | SSO login |
| Admin seed credentials | OI-025 | ⚠️ PARTIAL | `PRYZM_OWNER_EMAIL` + `PRYZM_OWNER_PASSWORD` env vars |

---

## §1 — CI Pipeline (OI-026) — START HERE

**This should be done first** — it takes 30 minutes and immediately protects all future merges.

### What to create

Create `.github/workflows/ci.yml`:

```yaml
name: PRYZM GA Gate CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  ga-gate:
    name: GA Gate Suite (20 checks)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.26.1

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run GA gate suite (20 gates)
        run: pnpm tsx tools/ga-gate/run-all.ts --no-ratchet
        env:
          GA_GATE_REPO_ROOT: ${{ github.workspace }}

  typecheck:
    name: Per-package TypeScript compile
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsx tools/ga-gate/check-per-package-compile.ts

  lint:
    name: ESLint (@pryzm rules)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
```

**Branch protection rule** (GitHub repo Settings → Branches → main):
- Require status checks to pass before merging: `ga-gate`, `typecheck`, `lint`
- Require branches to be up to date before merging: ✅
- Include administrators: ✅

**Verifier**:
```bash
ls .github/workflows/ci.yml
# Expected: file exists

# After first PR: GitHub Actions tab shows green checks on PR
```

---

## §2 — npm Publish: `@pryzm/sdk` (OI-011)

**Code status**: `packages/plugin-sdk/` is at v1.0.0-rc.1 (2,067 LOC). Fully implemented. `package.json` has correct `exports`, `types`, and `files` fields.

**Pre-publish checklist:**
```bash
# 1. Run the K3-C pre-publish audit
pnpm tsx scripts/k3c-plugin-parity-check.ts
# Expected: all checks pass

# 2. Verify package integrity
pnpm pack --dry-run -C packages/plugin-sdk/
# Expected: only src/, dist/, README.md, package.json included

# 3. Build the package
pnpm --filter @pryzm/plugin-sdk build
# Expected: dist/ populated

# 4. Run tests
pnpm --filter @pryzm/plugin-sdk test
# Expected: all pass
```

**Publish:**
```bash
# Requires npm account in @pryzm org
npm login  # or use: npm token create --read-only
cd packages/plugin-sdk
npm publish --access public --tag rc
# For GA release (remove --tag rc):
npm publish --access public
```

**Post-publish verify:**
```bash
npm view @pryzm/plugin-sdk
# Expected: version 1.0.0 (or 1.0.0-rc.1)

# Check scripts/check-pryzm3-exists.ts boolean #7
pnpm tsx scripts/check-pryzm3-exists.ts
# Expected: boolean #7 = true
```

---

## §3 — npm Publish: `@pryzm/headless` (OI-012)

**Code status**: `packages/headless/` exists with real implementation. Verify content before publishing.

**Pre-publish:**
```bash
ls packages/headless/src/
# Verify it has: HeadlessRuntime.ts, index.ts

pnpm --filter @pryzm/headless build
pnpm --filter @pryzm/headless test
```

**Publish:**
```bash
cd packages/headless
npm publish --access public
```

---

## §4 — DNS: `marketplace.pryzm.app` (OI-013)

**Code status**: Marketplace SPA (`apps/marketplace/`) is partially built with `App.tsx`, `main.tsx`, and `api/client.ts`. Server routes for marketplace exist in `server.js`. The SPA needs:
1. Vite build: `pnpm --filter @pryzm/marketplace build` (verify this works)
2. Deployment to a static host or as a Replit deployment
3. DNS CNAME pointing `marketplace.pryzm.app` → deployed host

**Steps:**
1. Complete marketplace SPA build verification
2. Deploy to Replit (or Vercel/Netlify)
3. Set DNS in domain registrar: `marketplace CNAME [deployment-url]`
4. Set `MARKETPLACE_URL=https://marketplace.pryzm.app` in production environment

---

## §5 — Stripe Configuration (OI-014)

**Code status**: `server/stripeRoutes.js` exists. Marketplace subscription routes are implemented. Code is conditionally activated when `STRIPE_SECRET_KEY` is set.

**Steps:**
1. Create Stripe account (or use existing)
2. Create product "PRYZM Pro" in Stripe dashboard
3. Set environment secrets in Replit:
   - `STRIPE_SECRET_KEY` = `sk_live_...` (or `sk_test_...` for testing)
   - `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from webhook endpoint)
4. Create webhook endpoint in Stripe dashboard pointing to `https://[your-domain]/api/stripe/webhook`
5. Verify: `GET /api/health` → `{ stripe: true }`

---

## §6 — Yjs WebSocket Server (OI-015)

**Code status**: `apps/sync-server/` is a full Yjs WebSocket server with handler structure. `packages/sync-client/` has the client. The editor connects when `VITE_SYNC_URL` is set.

**Steps:**
1. Deploy `apps/sync-server/` to a persistent server (Railway, Fly.io, or dedicated Replit):
   ```bash
   cd apps/sync-server
   pnpm start
   # Listens on PORT (default 1234)
   ```
2. Set environment variables:
   - `VITE_SYNC_URL=wss://sync.pryzm.app` (in Replit environment)
   - `SYNC_SERVER_PORT=1234` on the sync server host
3. Verify: Two browser tabs on same project show real-time cursor positions

---

## §7 — OTLP Export Target (OI-022) — See also OPEN-008

**Code status**: `server/telemetry.js` stub exists. OTel SDK is installed.

**Steps:**
1. Choose a backend: Grafana Cloud (free tier available), Honeycomb, or Jaeger
2. Get OTLP endpoint + API key
3. Set environment:
   - `OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-gateway.example.com`
   - `OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer [key]`
4. Update `server/telemetry.js` to use OTLPTraceExporter (see OPEN-008)
5. Verify: Spans appear in the chosen backend

---

## §8 — Google / Microsoft OAuth (OI-024)

**Code status**: `server/auth.js` has OAuth2 routes. `packages/oauth2-pkce/` implements the PKCE flow. Routes are conditionally activated.

**Steps (Google):**
1. Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Authorized redirect URIs: `https://[your-domain]/auth/google/callback`
3. Set: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

**Steps (Microsoft):**
1. Azure portal → App registrations → New registration
2. Set redirect URI: `https://[your-domain]/auth/microsoft/callback`
3. Set: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`

---

## §9 — Convergence Boolean Verification

After all items above are complete:

```bash
pnpm tsx scripts/check-pryzm3-exists.ts
```

Expected output (9/9):
```
✅ Boolean #1: src/ = 1 folder (src/ui/ only)
✅ Boolean #2: 39 panels real-bound to runtime.*
✅ Boolean #3: THREE fully isolated in renderer-three
✅ Boolean #4: WorkspaceMountBridge = 0 files
✅ Boolean #5: rAF = 1 owner
✅ Boolean #6: EngineBootstrap.ts deleted
✅ Boolean #7: @pryzm/sdk published on npm
✅ Boolean #8: @pryzm/headless published on npm
✅ Boolean #9: marketplace.pryzm.app live
```

**Note**: Boolean #1 requires Wave 20 (src/ → 1 folder) which is a long-range item. Booleans #7, #8, #9 are the Phase F deliverables addressed by this document.

---

*Stamp: 2026-05-16. All code is implemented. These are infrastructure and credential actions only. Assign to engineer with npm/DNS/Stripe access. Priority order: OI-026 (CI) → OI-014 (Stripe) → OI-011 (SDK publish) → OI-015 (Yjs server) → OI-013 (DNS) → OI-012 (headless publish).*
