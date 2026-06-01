# 52 — Phase F Execution Checklist: Human-Action Items

> **Stamp**: 2026-05-14 · **Status**: 🟡 PENDING EXECUTION
> **Authority**: This document closes G8 from `50-PLAN-FORWARD-GAP-ANALYSIS.md`.
> **Context**: Sprint AU completed all code-level Phase F prerequisites.  These are the
> 5 human-action items that require external service access and cannot be automated
> by an AI agent.  Each item is independently executable.

---

## §1 — Item Index

The canonical 5 human-action items from gap-analysis doc 50 §8.1 (OI-011 through OI-015),
plus two bonus infrastructure items (H6/H7) that are separately tracked but unblock GA.

| # | Item | OI | Effort | Prerequisite |
|---|---|---|---|---|
| H1 | Publish `@pryzm/plugin-sdk` to npm | OI-011 | 30 min | npm account with org access |
| H2 | Configure DNS + TLS for `marketplace.pryzm.app` | OI-013 | 1–2 h | Domain registrar + CDN/TLS provider access |
| H3 | Publish `@pryzm/headless` to npm | OI-012 | 30 min | H1 + H2 (headless docs reference marketplace domain) |
| H4 | Configure Stripe live secret keys | OI-014 | 30 min | H2 (Stripe webhooks must target prod domain) |
| H5 | Configure Yjs WebSocket server URL for production | OI-015 | 1 h | H2 (Yjs provider URL must target prod domain) |
| H6 | Wire GitHub Actions CI workflow | OI-026 | 1 h | GitHub repository admin access |
| H7 | Configure OTel OTLP export target | OI-022 | 1 h | Grafana Cloud / Honeycomb / Jaeger account |

**Dependency order (canonical 5):**
```
H1 (SDK publish) → H2 (DNS) → H3 (headless publish) → H4 (Stripe) → H5 (Yjs URL)
```

**Why this order:**
- SDK first: `@pryzm/headless` has `@pryzm/plugin-sdk` as a peer dep — SDK must be public before headless is published
- DNS before headless: the headless API docs reference `marketplace.pryzm.app/api/v1` — DNS must resolve before docs go live
- Stripe after DNS: webhooks must target the production domain
- Yjs URL last: real-time collab in production is the final infrastructure step

---

## §2 — H1: Publish `@pryzm/plugin-sdk`

**Pre-check (code-side, automated):**
```bash
pnpm --filter @pryzm/plugin-sdk build        # must exit 0
pnpm --filter @pryzm/plugin-sdk pack         # inspect tarball
```

**Steps:**
1. Confirm `packages/plugin-sdk/package.json` has the correct `"version"` (currently `"1.0.0"`).
2. Log in: `npm login --scope=@pryzm`
3. Publish: `npm publish packages/plugin-sdk/ --access public`
4. Verify: `npm info @pryzm/plugin-sdk` shows the published version.
5. Update `07-OPEN-ITEMS.md`: close OI-011, OI-017; stamp with date.

**Closes:** OI-011, OI-017, convergence boolean #7.

---

## §3 — H2: Publish `@pryzm/headless`

**Pre-check:**
```bash
pnpm --filter @pryzm/headless build
pnpm --filter @pryzm/headless test           # 10/10 must pass
```

**Steps:**
1. Confirm `packages/headless/package.json` version.
2. `npm publish packages/headless/ --access public`
3. Verify: `npm info @pryzm/headless`
4. Update `07-OPEN-ITEMS.md`: close OI-012, OI-018.

**Closes:** OI-012, OI-018, convergence boolean #8.

---

## §3b — H2: DNS + TLS for `marketplace.pryzm.app`

**Context:** The marketplace API is live locally at `/marketplace/api/plugins`.
The full public deployment needs a subdomain with TLS.

**Steps:**
1. **DNS**: Add a CNAME record `marketplace.pryzm.app → <Replit deploy domain>` at your registrar.
2. **TLS**: Configure your CDN (Cloudflare / Vercel / Replit custom domain) to provision a certificate for `marketplace.pryzm.app`.
3. **Server**: Verify `server.js` serves the marketplace routes under the new domain (no hardcoded origins to update — the BFF handles all API routing).
4. **Smoke test**: `curl https://marketplace.pryzm.app/marketplace/api/plugins` → 200.
5. Update `07-OPEN-ITEMS.md`: close OI-013, OI-019.

**Closes:** OI-013, OI-019, convergence boolean #9.

---

## §4 — H4: Configure Stripe Live Secret Keys

**Context:** The Stripe integration (`server/stripe.js`) is fully coded and works in test mode.
Going live requires swapping the test keys for live keys and pointing the webhook to the prod domain.

**Pre-check:**
```bash
# Confirm Stripe test mode is active (should print 'sk_test_...')
node -e "require('dotenv').config(); console.log(process.env.STRIPE_SECRET_KEY?.slice(0,8))"
```

**Steps:**
1. Log in to [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers → API keys**.
2. Copy the **live** Publishable key and Secret key.
3. Set the environment variables in the Replit deployment secrets panel:
   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PUBLISHABLE_KEY=pk_live_...
   ```
4. In Stripe Dashboard → **Developers → Webhooks**, add endpoint:
   `https://marketplace.pryzm.app/stripe/webhook` (event: `checkout.session.completed`)
5. Copy the **Webhook signing secret** → set `STRIPE_WEBHOOK_SECRET=whsec_...` in deployment secrets.
6. Redeploy; smoke test: attempt a $1 plugin purchase and verify it appears in Stripe live dashboard.
7. Update `07-OPEN-ITEMS.md`: close OI-014.

**Closes:** OI-014, convergence boolean #10.

---

## §5 — H5: Configure Yjs WebSocket Server URL for Production

**Context:** `YjsDocAdapter` connects to a Yjs collaboration server via `YJS_WS_URL`.
In dev mode this is `ws://localhost:4001`. Production needs a publicly reachable WebSocket URL.

**Steps:**
1. Choose a Yjs WebSocket host. Options:
   - **Self-hosted**: `apps/sync-server/` (already scaffolded) deployed on a VPS or Fly.io
   - **Managed**: Liveblocks, PartyKit, or Ably for zero-ops setup
2. Deploy the Yjs server and note the `wss://` URL (e.g. `wss://sync.pryzm.app`).
3. Set the environment variable in the Replit deployment secrets panel:
   ```
   YJS_WS_URL=wss://sync.pryzm.app
   ```
4. Verify `server.js` passes `YJS_WS_URL` to `initCollaboration()` (already coded — search `YJS_WS_URL` in server.js).
5. Smoke test: open two browser tabs on `marketplace.pryzm.app`, load the same project, move an element in Tab A, verify it appears in Tab B within ~100 ms.
6. Update `07-OPEN-ITEMS.md`: close OI-015.

**Closes:** OI-015, convergence boolean #11 (real-time collab in production).

---

## §6 — H6: GitHub Actions CI Workflow

**Context:** All GA gates run locally via `pnpm run ga-gates` (exits 0 on the current
codebase).  The GitHub Actions workflow definition mirrors this.

**Steps:**
1. Create `.github/workflows/ci.yml` (example below).
2. Push to a feature branch; verify the workflow runs green in the Actions tab.
3. Set the workflow as a required status check on the `main` branch in repo Settings → Branches.
4. Update `07-OPEN-ITEMS.md`: close OI-026.

**Example `.github/workflows/ci.yml`:**
```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: '10.26.1' }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run ga-gates
      - run: pnpm tsc --noEmit
```

**Closes:** OI-026.

---

## §6 — H5: OTel OTLP Export Target

**Context:** `server/telemetry.js` has a full OpenTelemetry SDK setup with span
recording.  It currently writes to a console exporter (dev-mode only).  Pointing it
at a real collector is a one-line config change plus an environment variable.

**Steps (Grafana Cloud example):**
1. Create a free Grafana Cloud account and navigate to **Connections → OpenTelemetry**.
2. Copy the OTLP endpoint URL (e.g., `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`).
3. Copy the API key (Base64-encoded `instance:api-key`).
4. Set environment variables in your deployment:
   ```
   OTEL_EXPORTER_OTLP_ENDPOINT=<url>
   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64>
   ```
5. Restart the server; verify spans appear in Grafana Explore under **Traces**.
6. Update `07-OPEN-ITEMS.md`: close OI-022.

**Closes:** OI-022.

---

## §7 — Post-Checklist Verification

Once all 5 items are complete, run the convergence check:

```bash
npx tsx tools/ga-gate/check-pryzm3-exists.ts   # should print 9/9 TRUE
pnpm run ga-gates                               # all 15 gates must exit 0
```

Then update `02-ARCHITECTURE.md §8` state summary to `PRYZM 3 SHIPPED ✅`.
