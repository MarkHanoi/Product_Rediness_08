# How PRYZM Ships — Git, GitHub Actions, Fly, Cloudflare, Secrets, Domains, and the Target Architecture

> **Stamp**: 2026-07-30 · **Status**: INVESTIGATION + TARGET ARCHITECTURE (report, not a change) · **Owner**: @MarkHanoi
> **What this is**: a verified map of how PRYZM currently reaches production, WHY each moving part exists, and a no-shortcuts target architecture for the SOON-to-launch product. Modelled on the sister-project pipeline doc's rigor: every claim is tagged, and anything that lives only in an external dashboard is marked **⚠️ VERIFY IN DASHBOARD** and is NOT presented as confirmed.
> **Do not edit alongside**: `V1-LAUNCH-READINESS-AUDIT.md`, `V1-LAUNCH-IMPLEMENTATION-PLAN.md`, `master-execution-tracker.md`, `docs/04-reference/jurisdictions/**` (owned by a concurrent editor). New defects below are logged as **candidate L-650+** for the orchestrator to append there.

---

## 0. Verification header — what is repo-verified vs dashboard-only

Every load-bearing claim carries one tag:

- **[VERIFIED-FROM-CODE]** — read out of this repo today (file + line quoted).
- **[INFERRED]** — a hypothesis the repo supports but cannot fully confirm; called out as such.
- **⚠️ VERIFY IN DASHBOARD** — lives only in an external system (Cloudflare dashboard, Fly dashboard, the DNS registrar, GitHub repo Settings/Secrets/Actions-billing). **Cannot be read from this repo. Never quoted as fact.**

### The single most important honesty note in this document

The **deploy trigger changed on 2026-07-23** and the two authoritative sources disagree about which mechanism is live, because they were written the same day:

- `.github/workflows/deploy-fly.yml` lines 19–36 **[VERIFIED-FROM-CODE]**: the `on:` block is **`workflow_dispatch` ONLY**. The header (§OPTION-A) states: *"PUSH-DEPLOY DISABLED. Deploys now go DIRECT from the dev machine via `flyctl deploy --remote-only -a pryzm` … `git push` is now a PURE BACKUP and must NOT trigger a deploy. This workflow is retained as a manual emergency fallback only."*
- `docs/04-reference/runbooks/DEPLOYMENT-PLATFORM-AUDIT.md` §1.1 (same date) quotes the **older** `on: push: [main]` trigger as VERIFIED-FROM-CODE and *recommends* Option A as a future step.

**Reconciliation** [VERIFIED-FROM-CODE for the file state; INFERRED for what the founder actually runs]: the workflow file as it stands today is dispatch-only, so **a `git push` no longer deploys anything**. The intended live mechanism is a **manual `flyctl deploy` from the founder's machine/agent**. The exact command + flags the founder runs day-to-day are NOT in the repo (`deploy.ps1` is a *sketch only* in the audit §7.1, not a committed script), so the precise live flags are **INFERRED**. This is the PRYZM analogue of the sister project's "there are no GitHub Actions in the loop" finding: **the CI/CD pipeline on disk is largely a standby, not the everyday path.**

---

## 1. Short version — the production target(s) and how each publishes

| Surface | What it is | Host (Phase A) | How it publishes today | Canonical URL (contract) | Tag |
|---|---|---|---|---|---|
| **App / editor** | Express BFF + Vite SPA + Socket.io + Yjs, the whole product | **Fly.io** app `pryzm`, region `fra` | **Manual `flyctl deploy`** from dev box (workflow is `workflow_dispatch`-only fallback) | `app.pryzm.so` → `pryzm.fly.dev` | [VERIFIED-FROM-CODE] `fly.toml:20,36`; `deploy-fly.yml:19-26` |
| **Apex / marketing** | Static prerendered HTML from the *same* editor source (`build:apex`) | **Cloudflare Pages** | Auto-deploy on push to `main` (Cloudflare's Git integration) | `pryzm.so` (+ `www` 301) | [VERIFIED-FROM-CODE] `C51 §4`; `cloudflare-pages-apex-setup.md §11` · repoint status ⚠️ VERIFY IN DASHBOARD |
| **AI upstream** | Anthropic proxy holding the real API key as a CF secret | **Cloudflare Worker** (external) | Out-of-repo; server just forwards to `CF_WORKER_URL` | `CF_WORKER_URL` (opaque) | [VERIFIED-FROM-CODE] `server.js:140,160`; **Worker source NOT in repo** |
| **Static assets** | 3D-context PMTiles + 186 MB furniture GLB catalogue | **Cloudflare R2** bucket `pryzm-assets` | Manual `workflow_dispatch` bake/sync jobs → R2 | `pub-1ad4…r2.dev` (custom `assets.pryzm.app` planned) | [VERIFIED-FROM-CODE] `OBJECT-STORAGE-R2-DECISION.md`; `context-bake.yml`, `r2-sync-items.yml` |
| **Data tier** | Postgres + object storage + PITR | **Supabase** `eu-central-1` (managed) | External; travels via `DATABASE_URL` | — | [VERIFIED-FROM-CODE] `fly.toml:5-6,191-198` |
| **Developer docs** | Astro Starlight | Cloudflare Pages (separate project) | Push to `main` | `docs.pryzm.so` | [VERIFIED-FROM-CODE] `C51 §4.1.4` · live status ⚠️ VERIFY IN DASHBOARD |

**One-line mental model:** *One Fly machine runs the product; Cloudflare Pages serves the marketing shell; a Cloudflare Worker hides the Anthropic key; R2 holds the heavy static bytes; Supabase is the database. Git is version control + a backup; it is no longer the deploy button.*

---

## 2. Current end-to-end pipeline diagram

```
                    ┌─────────────────────────────────────────────────────────┐
   DEV MACHINE      │  git push origin main  ─────────►  GitHub (backup/VC)    │
   (founder /       │        │                                    │            │
    agent)          │        │ (NO LONGER triggers a deploy —     │            │
                    │        │  §OPTION-A, deploy-fly.yml:19-26)   │            │
                    │        ▼                                    ▼            │
                    │  flyctl deploy --remote-only        ci.yml (push:main)   │
                    │  (MANUAL, the real deploy path)     lint·isolation·cmd-  │
                    │        │                            mgr·test-server·      │
                    │        │                            test-unit·test-root· │
                    │        │                            build·apex-gates     │
                    │        ▼                                                 │
                    │  Fly remote/Depot builder ──► image ──► Fly registry     │
                    │        │                                                 │
                    └────────┼─────────────────────────────────────────────────┘
                             ▼
                    ┌──────────────────────────────┐
                    │  Fly.io app "pryzm" (fra)     │   ◄── Supabase Postgres (eu-central-1)
                    │  1× shared-cpu-1x / 512 MB    │        via DATABASE_URL
                    │  Express + Socket.io + Yjs    │
                    │  tsx transpiles ~100 pkgs on  │──►  Cloudflare Worker (CF_WORKER_URL)
                    │  every cold boot              │        └─► Anthropic API  (key = CF secret)
                    │  /api/health/live (deploy gate)│
                    └──────────────────────────────┘
                             ▲                    ▲
      app.pryzm.so ─────────┘                    │ /api/context-tiles/*, /api/catalog/items/*
      (Fly cert / DNS)                           │ (same-origin proxies — interim, CORS blocked)
                                                 ▼
   ── SIDE CHANNEL (Cloudflare) ──────────────────────────────────────────────
   git push main ──► Cloudflare Pages ──► pryzm.so  (static apex from apps/editor/dist-apex)
   manual dispatch ─► context-bake.yml / terrain-bake.yml / r2-sync-items.yml ─► R2 pryzm-assets
```

The **deploy-fly.yml `deploy` job** (if dispatched) still does: `ci-gate` (poll ci.yml conclusion for the SHA) → install flyctl from GitHub release CDN → `flyctl deploy --local-only --strategy=rolling`, retried 3× for the boot health race [VERIFIED-FROM-CODE `deploy-fly.yml:100-395`].

---

## 3. Cloudflare, secrets, git, GitHub Actions, Fly — what each does and WHY

### 3.1 Fly.io — the application host

**What it does** [VERIFIED-FROM-CODE `fly.toml`, `Dockerfile`]: runs the single production container — a two-stage Docker image (`node:20-bookworm-slim`) whose runtime **re-spawns `server.js` under `--import tsx`**, transpiling ~100 workspace TS packages on every cold boot (`Dockerfile:14-19`, `fly.toml:168-179`). One always-on machine (`min_machines_running=1`, `auto_stop_machines="stop"`), `shared-cpu-1x` / 512 MB, region `fra` (Frankfurt), health-gated on `/api/health/live`.

**Why Fly, not Cloudflare Pages/Workers or Cloud Run** — the runtime SHAPE forces it [VERIFIED-FROM-CODE + the DEPLOYMENT-PLATFORM-AUDIT §2 analysis]:

1. **Persistent, long-lived process with websockets.** The product is a monolithic Express + Socket.io server with Yjs CRDT collaboration (`fly.toml:41-42,98-100,196`). Any platform that sleeps idle containers or caps request/websocket duration (Cloud Run's 60-min cap, Render/Koyeb scale-to-zero) drops live-collaboration sessions. Cloudflare Workers/Pages Functions are a request/response edge runtime — the wrong shape for a stateful long-lived Node server.
2. **Migrations run on boot**, gated by a readiness probe (`server/dbMigrate.js`, per CLAUDE.md); needs a real persistent process, not a function invocation.
3. **Postgres is already external (Supabase).** So the host only needs to run *compute* — Fly's always-on machine + managed TLS + one-command `fly releases` rollback + blue-green config fit exactly, with the smallest ops burden.
4. **The build is heavy** (~5.5 GB heap, ~3624 modules — `Dockerfile:38`, `deploy-fly.yml:6-9`); Fly's remote/Depot 16 GB builder (or the 16 GB GitHub runner) has the RAM; small free tiers do not.

Fly gives managed TLS, health checks, `fly releases` rollback, and blue-green — the properties that would otherwise be self-managed ops.

### 3.2 GitHub + Git — version control, backup, CI trigger

**What a push does today** [VERIFIED-FROM-CODE]:
- **To `main`** it (a) stores history on GitHub (`origin = https://github.com/MarkHanoi/Product_Rediness_08.git`, HTTPS, `credential.helper=manager`), (b) triggers **`ci.yml`** (`push:[main]`, `paths-ignore: docs/**, **/*.md, .claude/**` — so doc-only pushes cost nothing), and (c) triggers **Cloudflare Pages** to rebuild the apex. It does **NOT** trigger a Fly deploy anymore (§OPTION-A).
- **Branch model** [VERIFIED-FROM-CODE + memory]: the founder's real workflow is **push-straight-to-`main`**; there is no enforced PR flow. `ci.yml`'s header lists required status checks "should be enabled in Settings → Branches → main" but notes they are **inert for a push-to-main workflow** (`ci.yml:24-31`).

**Why GitHub Actions at all, vs a Git-integration auto-deploy** [VERIFIED-FROM-CODE]:
- Actions was chosen for Fly because **the build is too heavy for Fly's legacy managed builder** (claimed OOM/exit-137 at 8 GB — `Dockerfile:30-31`), so the pipeline built on GitHub's **16 GB `ubuntu-latest` runner** via `flyctl deploy --local-only` and pushed the finished image to Fly's registry (`deploy-fly.yml:5-9,304-311`). A pure Git-integration auto-deploy (like Cloudflare Pages uses for the apex) cannot supply that RAM or the CI-gate logic.
- **But Actions has since been de-prioritised for the app deploy** because of recurring **Actions-billing zero-step failures** (jobs dying in ~3s with no steps — see memory `github-actions-billing-blocks-deploy`) and the cost of the ~25-min build. Hence §OPTION-A moved the app deploy off Actions to a direct `flyctl deploy`. **Actions is still the mechanism for the apex CI gate and the manual R2/terrain bake jobs.**

### 3.3 Cloudflare — three distinct roles (NOT the app host)

Cloudflare does **three separate things** for PRYZM, and conflating them is a known trap:

| Cloudflare service | What it serves for PRYZM | Why | Tag |
|---|---|---|---|
| **Pages** | The **apex marketing** (`pryzm.so`) — static prerendered HTML from `apps/editor/dist-apex/` (`build:apex`) | Global edge, sub-100 ms first paint, SEO-crawlable, survives app maintenance windows (C51 §1) | [VERIFIED-FROM-CODE] `C51 §2/§4/§6.1`; `cloudflare-pages-apex-setup.md` |
| **Worker** (external) | The **AI proxy** — holds the Anthropic key as a CF secret; `server.js` forwards `/api/anthropic/*` to `CF_WORKER_URL` | Keeps the Anthropic key off the app server and off the client; a thin relay, NOT the app host | [VERIFIED-FROM-CODE] `server.js:136-200`; **source not in repo** |
| **R2** | **Static asset CDN** — bucket `pryzm-assets` (`tiles/` PMTiles + `items/` GLB catalogue) | No egress fees through Cloudflare, native HTTP Range (required by PMTiles), keeps 186 MB out of the Fly image | [VERIFIED-FROM-CODE] `OBJECT-STORAGE-R2-DECISION.md`; `context-bake.yml`, `r2-sync-items.yml` |

**The Worker is an AI proxy, not the app host** [VERIFIED-FROM-CODE]. `server.js` has 40+ `CF_WORKER_URL` call sites, all of the form "if `CF_WORKER_URL` set, `fetch(CF_WORKER_URL, …)` else fall back to `ANTHROPIC_API_KEY`" (`server.js:160-200,1053-1055,2311-2312`). The `apps/ai-worker` package is **NOT** this Worker — it is an unrelated BullMQ-style in-process queue skeleton (`@pryzm/ai-worker`, `package.json` description). **There is no `wrangler.toml` anywhere in the repo** [VERIFIED-FROM-CODE — glob returned nothing], so the Worker's code, route, and Anthropic key are **⚠️ VERIFY IN DASHBOARD**.

### 3.4 Secrets — three-plus stores, WHY each

See the full topology table in §7. In short: **build-time `VITE_*`** must be baked by Vite at build (Fly runtime secrets do nothing — silent failure), **Fly runtime secrets** feed the server, **GitHub Actions secrets** feed the CI/deploy/bake jobs, and **Cloudflare** holds the Worker's Anthropic key and the Pages build env.

---

## 4. Domains — how many "solutions" do we have, and their status

This is the founder's central question, and it surfaces a **real split-brain in the repo**. Three different top-level domains appear in the tree, plus the Fly handle:

| Domain / subdomain | Intended surface | Points at (contract) | Repo evidence | **Live status** |
|---|---|---|---|---|
| **`pryzm.so`** | Apex marketing (Cloudflare Pages) | Cloudflare Pages `*.pages.dev` | [VERIFIED-FROM-CODE] `C51 §4` (normative DNS table); `cloudflare-pages-apex-setup.md` whole doc | ⚠️ VERIFY IN DASHBOARD (registered? repointed off Astro?) |
| **`www.pryzm.so`** | 301 → apex | Redirect | [VERIFIED-FROM-CODE] `C51 §4` | ⚠️ VERIFY IN DASHBOARD |
| **`app.pryzm.so`** | The editor (Fly) | `pryzm.fly.dev` (fra) | [VERIFIED-FROM-CODE] `C51 §4`; `cloudflare-pages-apex-setup.md §7.2` | ⚠️ VERIFY IN DASHBOARD (Fly cert `flyctl certs add`?) |
| **`api.pryzm.so`** | API alias of app | `pryzm.fly.dev` | [VERIFIED-FROM-CODE] `C51 §4` | ⚠️ VERIFY IN DASHBOARD |
| **`docs.pryzm.so`** | Developer docs (Astro) | Cloudflare Pages (separate) | [VERIFIED-FROM-CODE] `C51 §4.1.4` | ⚠️ VERIFY IN DASHBOARD |
| **`marketplace.pryzm.so`** | Plugin marketplace SPA | reserved/unconfigured | [VERIFIED-FROM-CODE] `C51 §4` | Not configured (contract says "reserved") |
| **`staging.pryzm.so`** | Ephemeral PR previews | Cloudflare Pages branch previews | [VERIFIED-FROM-CODE] `C51 §4` (aspirational) | ⚠️ VERIFY IN DASHBOARD (likely not live) |
| **`pryzm.fly.dev`** | The actual live app handle | Fly app `pryzm` | [VERIFIED-FROM-CODE] `fly.toml:20`; `deploy-fly.yml:267` `environment.url` | **Live host** (the deploy target) — status of the machine ⚠️ VERIFY IN DASHBOARD |
| **`pryzm.app`** | *App-code references* (marketplace links, Revit add-in, R2 custom-domain plan, sunset banner, CSP comments) | `assets.pryzm.app`, `marketplace.pryzm.app`, `api.pryzm.app`, `docs.pryzm.app`, `pryzm.app/sunset` | [VERIFIED-FROM-CODE] `apps/marketplace/src/App.tsx:930,965`; `revit-addin/**`; `server/contextTilesProxy.js:41`; `server/securityHeaders.js:188`; `apps/editor/src/sunset/Pryzm1SunsetBanner.ts:81`; `OBJECT-STORAGE-R2-DECISION.md:125,136` | ⚠️ VERIFY IN DASHBOARD |
| **`pryzm.io`** | *One stray reference* in the env template | `app.pryzm.io` example for `PUBLIC_BASE_URL` | [VERIFIED-FROM-CODE] `.env.example:30` | Almost certainly a placeholder, not owned |

### 4.1 The honest answer to "how many solutions, and why is pryzm.so not used?"

**There is a domain-canonicalization drift that no ADR has resolved** [VERIFIED-FROM-CODE]:

- **The contract (C51 §4, CANONICAL) mandates `pryzm.so`** as the apex, with `app.` / `api.` / `docs.` / `marketplace.` subdomains. This is the single normative source.
- **Much of the shipping app code, however, hard-codes `pryzm.app`** — the marketplace footer literally links to `https://pryzm.app`, the Revit add-in ships `pryzm.app` as its vendor URL and `api.pryzm.app` as its import endpoint, the R2 decision doc plans an `assets.pryzm.app` CDN domain, and the PRYZM-1 sunset banner points at `pryzm.app/sunset`.
- **`.env.example` even shows `app.pryzm.io`** for `PUBLIC_BASE_URL`.

So "how many solutions" = **at least two live candidate brands in the code (`.so` and `.app`) plus a stray `.io`**, and the app actually runs on a **third** address (`pryzm.fly.dev`).

**Why `pryzm.so` appears "not used"** [INFERRED, from the evidence above]: the product today is reached at `pryzm.fly.dev` (Fly), not `app.pryzm.so`. The `pryzm.so` apex is a Cloudflare Pages surface that **must be repointed off the old Astro docs-site to `apps/editor/dist-apex` before the Astro pages are deleted** — the "LANDMINE" in `cloudflare-pages-apex-setup.md §1` and memory `c51-apex-app-split-shipped`. Whether that repoint has happened, and whether `pryzm.so` / `app.pryzm.so` DNS + TLS are wired, is **⚠️ VERIFY IN DASHBOARD**. The `pryzm.app` references suggest a **later, un-contracted brand decision** drifting away from `pryzm.so` — this needs a **FOUNDER DECISION** (§9) to canonicalize one and sweep the other out of the code, or C51 will be violated the moment DNS is wired.

### 4.2 The C51 "apex/app split" — why it is central

`C51-APEX-APP-DEPLOYMENT-SPLIT.md` is the ADR-0255-ratified contract that says PRYZM is **one codebase, two deploy artifacts**: `pnpm build:apex` → static apex (Cloudflare Pages); `pnpm build:app` → SPA + server (Fly) [VERIFIED-FROM-CODE `C51 §1,§6`]. The apex MUST NOT carry auth cookies, DB queries, PII, or app-subdomain scripts (§2.2); the app MUST NOT serve marketing routes (§3.2.1) or be reachable from apex DNS (§3.2.2). Five CI gates enforce the boundary (`apex-gates` job — `check:apex`, `check:docs-site`, `check:route-surface`, `check:app-shell-csp`) [VERIFIED-FROM-CODE `ci.yml:309-336`, `C51 §7`]. This split is why the domain question matters: apex and app are **deliberately different hosts on different subdomains**, and mixing them is a contract violation.

---

## 5. The git relationship — precise

| Action | Effect today | Tag |
|---|---|---|
| `git push origin main` | Stores history on GitHub; triggers `ci.yml`; triggers Cloudflare Pages apex rebuild. **Does NOT deploy the app to Fly.** | [VERIFIED-FROM-CODE] `deploy-fly.yml:19-26`, `ci.yml:54-56` |
| App deploy | **Manual `flyctl deploy` from the dev box** (dispatch-only workflow as emergency fallback) | [VERIFIED-FROM-CODE] §OPTION-A header; INFERRED for exact flags |
| CI gate | `deploy-fly.yml` `ci-gate` job polls `ci.yml`'s conclusion for the exact SHA and refuses to deploy unless `lint isolation command-manager test-server test-unit test-root apex-gates` are green; doc-only commits are re-derived from the diff and passed; `bypass_ci_gate` is the only (audited) override | [VERIFIED-FROM-CODE] `deploy-fly.yml:100-252` |
| Branch model | Push-straight-to-`main`; no enforced PR; required-status-checks are inert for push-to-main (the real gate is the deploy's `ci-gate` job) | [VERIFIED-FROM-CODE] `ci.yml:24-31,40-53` |
| Deploy strategy | `fly.toml` declares **blue-green** (`:67-68`); the workflow overrides with `--strategy=rolling` (`:381`) — so if dispatched, deploys are **rolling**. A plain `flyctl deploy` (no `--strategy`) would honour blue-green | [VERIFIED-FROM-CODE] `fly.toml:67-68`, `deploy-fly.yml:381`; audit §1.4(a) |
| Auth to deploy | `FLY_API_TOKEN` GitHub secret (workflow path) or a stored Fly deploy token (direct path); the push itself uses Git Credential Manager (`credential.helper=manager`) | [VERIFIED-FROM-CODE] `deploy-fly.yml:399`; audit §1.7 |

---

## 6. What Cloudflare builds/serves for PRYZM — detail

- **Cloudflare Pages (apex)**: builds `pnpm install --no-frozen-lockfile && pnpm build:apex` (`prerender-apex.mjs`, a **light ~1.5 s** prerender — NOT the 6 GB editor build), output `apps/editor/dist-apex/` (~85 KB raw / ~21 KB gzipped, under the C51 §6.1.3 200 KB budget). Needs `SKIP_DEPENDENCY_INSTALL=true` to dodge Cloudflare's frozen-lockfile auto-install. Auto-deploys on push to `main`. [VERIFIED-FROM-CODE `cloudflare-pages-apex-setup.md §3,§5,§11`]
- **Cloudflare Worker (AI proxy)**: receives forwarded Anthropic requests from `server.js` at `CF_WORKER_URL`, appends the real key (a CF secret), returns the completion. Source, route, and key are **⚠️ VERIFY IN DASHBOARD** (no `wrangler.toml` in repo). [VERIFIED-FROM-CODE for the client side `server.js:160-200`]
- **Cloudflare R2 (assets)**: bucket `pryzm-assets`, prefixes `tiles/` (PMTiles, baked by `context-bake.yml` + `terrain-bake.yml`) and `items/` (GLB catalogue, `r2-sync-items.yml`). Public via `pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev`; 1-year immutable cache; HTTP Range (206) required for PMTiles. **CORS is currently blocked**: the R2 token is object-scoped so `PutBucketCors` returns AccessDenied (`r2-cors.yml`, `OBJECT-STORAGE-R2-DECISION.md §CORS`), so the app currently reaches R2 through **same-origin proxies** (`server/contextTilesProxy.js`, `server/catalogAssetProxy.js`) — an explicit interim that puts Fly back on the asset hot path. [VERIFIED-FROM-CODE]

---

## 7. Secrets topology — every store, what lives where, sync hazards

| Store | Holds | Examples | Sync hazard | Tag |
|---|---|---|---|---|
| **Fly runtime secrets** (`flyctl secrets set`) | Server runtime config | `SESSION_SECRET`, `DATABASE_URL`/`SUPABASE_DB_URL`, `CF_WORKER_URL` (or `ANTHROPIC_API_KEY`), `PRYZM_OWNER_EMAIL/PASSWORD`, `SUPABASE_*`, `STRIPE_*`, OAuth, `OTEL_*`, `ALLOWED_ORIGIN`, `PUBLIC_BASE_URL` | Not in any file — encrypted at rest; a missing required var **hard-fails boot in prod** (`server.js:305`, `.env.example`) | [VERIFIED-FROM-CODE] `fly.toml:8-14`, `.env.example` |
| **GitHub Actions secrets** | CI/deploy/bake credentials | `FLY_API_TOKEN`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `DATAFORDELER_API_KEY`, `VITE_CESIUM_TOKEN`, `VITE_GOOGLE_MAPS_KEY`, `GITHUB_TOKEN` | Distinct copies from Fly's — the same value (e.g. an R2 key) must be maintained in **two** stores | [VERIFIED-FROM-CODE] `deploy-fly.yml`, `context-bake.yml:174`, `r2-cors.yml:45-51` |
| **GitHub Actions *variables*** (`vars.*`, not secrets) | **Public** build-time base URLs | `VITE_GLB_URL`, `VITE_CONTEXT_TILES_URL` | Deliberately `vars` not `secrets` so the value is visible in logs (a redacted URL hides the one diagnostic that matters) | [VERIFIED-FROM-CODE] `deploy-fly.yml:324-332`, `OBJECT-STORAGE-R2-DECISION.md:15` |
| **Cloudflare Worker secret** | The Anthropic API key | `ANTHROPIC_API_KEY` (as a Worker secret) | Never in repo; **⚠️ VERIFY IN DASHBOARD** | [VERIFIED-FROM-CODE] `.env.example:33-34` (states the intent) |
| **Cloudflare Pages build env** | Apex build vars | `NODE_VERSION`, `SKIP_DEPENDENCY_INSTALL`, `NPM_FLAGS`; (future) `VITE_*` for a Pages-hosted app | Separate from GitHub/Fly; **⚠️ VERIFY IN DASHBOARD** | [VERIFIED-FROM-CODE] `cloudflare-pages-apex-setup.md §5` |
| **R2 bucket keys** | S3-API access to `pryzm-assets` | `R2_ACCESS_KEY_ID/SECRET` (object-scoped today) | The object-scoped token **cannot set CORS** — needs Admin R/W; a second, wider token or a dashboard action | [VERIFIED-FROM-CODE] `OBJECT-STORAGE-R2-DECISION.md §CORS` |

**The signature hazard — `VITE_*` is build-time** [VERIFIED-FROM-CODE `Dockerfile:107-123`, `deploy-fly.yml:328-331`]: Vite **inlines** `VITE_*` at build. Setting any of them as a **Fly runtime secret does nothing, silently** — the build goes green, the app comes up, and it keeps requesting the old 404ing paths. They must be passed as `--build-arg` on the deploy build, and the deploy asserts against the shipped bundle bytes (`§L-570-BUNDLE-PROOF`).

**Sync-sprawl summary:** the same conceptual secret can need to exist in up to three places (R2 keys → GitHub + any local deploy env; Anthropic key → CF Worker; Supabase URL → Fly runtime + Cloudflare Pages build). There is **no single source of truth** for secrets across environments — this is a target-architecture gap (§8, §9).

---

## 8. Known pipeline defects / gaps

Each is a **candidate L-650+** for the orchestrator to log in `V1-LAUNCH-READINESS-AUDIT.md` (this doc does NOT edit that file).

| # | Defect / gap | Severity | Evidence | Tag |
|---|---|---|---|---|
| L-650? | **No staging environment.** Only `fly.toml` exists; the header itself says staging *would* live in a sibling `fly.staging.toml` that does not exist. All testing is on production (`pryzm.fly.dev`) | **HIGH** | `fly.toml:17-19`; no `fly.staging.toml` (glob) | [VERIFIED-FROM-CODE] |
| L-651? | **No preview environments for the app.** Cloudflare Pages gives apex PR previews; the Fly app has none. C51 §4's `staging.pryzm.so` PR previews are aspirational | **MEDIUM** | `C51 §4`; no preview wiring | [VERIFIED-FROM-CODE] |
| L-652? | **Domain split-brain (`pryzm.so` vs `pryzm.app` vs `pryzm.io`).** Contract mandates `.so`; app code hard-codes `.app`; env template shows `.io`. Wiring DNS today would violate C51 for every `.app` reference | **HIGH** | §4.1 evidence rows | [VERIFIED-FROM-CODE] |
| L-653? | **CI-billing fragility.** GitHub Actions jobs can zero-step-fail in ~3s on billing; this repeatedly killed deploys and drove §OPTION-A off Actions | **HIGH** | memory `github-actions-billing-blocks-deploy`; §OPTION-A | INFERRED (billing ⚠️ VERIFY IN DASHBOARD) |
| L-654? | **The live deploy path is a manual, undocumented command.** `deploy.ps1` is a sketch, not committed; the exact flags/strategy the founder runs are not in the repo → bus-factor + drift risk | **HIGH** | audit §7.1 (sketch only) | INFERRED |
| L-655? | **Rolling vs blue-green ambiguity.** `fly.toml` declares blue-green; the workflow forces `--strategy=rolling`; the manual path's strategy is unknown → deploys may not be the zero-downtime path the config claims | **MEDIUM** | `fly.toml:67-68`, `deploy-fly.yml:381` | [VERIFIED-FROM-CODE] + INFERRED |
| L-656? | **R2 CORS blocked → interim same-origin proxies.** App reaches R2 through Fly proxies, re-coupling Fly to the asset hot path; exit criteria documented but not met (token is object-scoped) | **MEDIUM** | `OBJECT-STORAGE-R2-DECISION.md §CORS`; `r2-cors.yml` | [VERIFIED-FROM-CODE] |
| L-657? | **Frozen-lockfile trap.** Any `package.json` change without a synced `pnpm-lock.yaml` fails `--frozen-lockfile` in the Docker build / CI / Cloudflare — often silently | **MEDIUM** | `Dockerfile:71-72`; memory `agent-packagejson-breaks-frozen-lockfile` | [VERIFIED-FROM-CODE] |
| L-658? | **Boot-time transpile tax.** Runtime re-transpiles ~100 TS packages via tsx on every cold boot → slow, fragile health races; the real fix (precompile) is tracked but unshipped (L-442) | **MEDIUM** | `fly.toml:168-179`; `Dockerfile:14-19` | [VERIFIED-FROM-CODE] |
| L-659? | **Secrets sprawl / no single source.** Same secret duplicated across Fly + GitHub + Cloudflare; no rotation story | **MEDIUM** | §7 | [VERIFIED-FROM-CODE] |
| L-660? | **Advisory CI gates carry real red.** `test-pryzm1` (RED, L-544) and `ga-gate` are `continue-on-error` → cannot block a deploy; the estate is broader than the gate covers (`--if-present` skips ~130 workspaces) | **MEDIUM** | `ci.yml:198-291` | [VERIFIED-FROM-CODE] |
| L-661? | **SW stale-cache.** Prod can serve old code from the service worker after deploy; fixed to network-first but still needs a hard-refresh | **LOW** | memory `sw-stale-cache-fixed-network-first` | INFERRED |
| L-662? | **CF Worker source is out-of-repo.** The AI proxy the whole product depends on has no code, no `wrangler.toml`, no CI in this repo → unversioned, unauditable here | **MEDIUM** | no `wrangler.toml` (glob); `server.js:140` | [VERIFIED-FROM-CODE] |
| L-663? | **Single machine, single region, no autoscale.** `min_machines_running=1`, `shared-cpu-1x`/512 MB, `fra` only → a machine or region incident is a full outage | **MEDIUM** | `fly.toml:36,185-189` | [VERIFIED-FROM-CODE] |
| L-664? | **Deploy gate is liveness-only (no DB).** `/api/health/live` gates deploy so a dead DB can't lock out deploys — deliberate, but a DB-down instance stays in rotation serving errors | **LOW** (accepted trade-off) | `fly.toml:135-155` | [VERIFIED-FROM-CODE] |

---

## 9. The TARGET architecture (no shortcuts)

The goal: **proper prod / staging / preview separation, one deploy path, one canonical domain topology, one secrets source per environment, and managed rollback + observability** — recommendations, not just enumeration. Items needing a **FOUNDER DECISION** are flagged.

### 9.1 Environments — add staging + previews

- **Production**: keep Fly `pryzm` (fra), but move to **≥1 permanent + blue-green** (already configured; adopt it, §9.3). Precompile the server (close L-442) so boots are plain `node` — removes the health-race and the transpile tax.
- **Staging**: create `fly.staging.toml` → Fly app `pryzm-staging` (fra), its own Supabase project (or a `staging` schema/branch), its own secrets. Deploy `main` here first; promote to prod on green. **This is the single highest-value addition** — today all testing is on prod. → **FOUNDER DECISION: add staging? (recommended: yes.)**
- **Previews**: apex already gets Cloudflare Pages PR previews; add **ephemeral Fly preview apps per PR** (or accept "staging only" for the app to save cost). → **FOUNDER DECISION: per-PR app previews vs staging-only.**

### 9.2 Branch + PR + CI-gate + deploy model

- Adopt a **short-lived-branch → PR → CI-gate → merge to `main`** model, and make the CI-required-status-checks actually required in Settings → Branches (they are inert today). Keep push-to-`main` allowed for the solo founder, but wire the `ci-gate` as the merge/deploy gate either way.
- **Pick ONE deploy path and commit it to the repo.** Recommendation (matching the DEPLOYMENT-PLATFORM-AUDIT's Option A): **direct `flyctl deploy --remote-only` via a committed, documented `deploy.ps1`** driven by a scoped Fly deploy token, with the Actions workflow kept only as a `workflow_dispatch` emergency lever. This kills the Actions-billing failure mode and removes the bus-factor of an undocumented command. → **FOUNDER DECISION: ratify Option A (remote-builder) after the 1-hr spike in the audit §8.1.**

### 9.3 Deploy strategy + rollback

- **Honour `fly.toml` blue-green** (drop `--strategy=rolling`) for true zero-downtime. → **FOUNDER DECISION: blue-green vs rolling.**
- Rollback stays `fly releases` + `flyctl deploy --image <prior>` — one command, managed. Document it in the runbook and test it once.

### 9.4 Domain topology — resolve the `.so`/`.app` split

**Recommended canonical layout** (aligns with C51 and the SaaS norm), pending the naming decision:

```
pryzm.<TLD>            → Cloudflare Pages   (apex marketing, static)
www.pryzm.<TLD>        → 301 → apex
app.pryzm.<TLD>        → Fly  pryzm (fra)   (the editor + BFF)
api.pryzm.<TLD>        → Fly  (alias of app)
docs.pryzm.<TLD>       → Cloudflare Pages   (developer docs)
assets.pryzm.<TLD>     → Cloudflare R2      (PMTiles + GLB CDN)
marketplace.pryzm.<TLD>→ Cloudflare Pages   (plugin marketplace, later)
staging.pryzm.<TLD>    → Fly  pryzm-staging (+ Pages previews)
```

→ **FOUNDER DECISION (blocking): canonicalize ONE TLD.** C51 says `pryzm.so`; the app code says `pryzm.app`. Whichever wins, the other must be swept out of the code (marketplace footer, Revit add-in, R2 custom domain, sunset banner, CSP comments, `.env.example`) and C51 §4 amended, **before** DNS is wired — otherwise C51 is violated on day one. If both are owned, keep one as a 301 redirect.

### 9.5 Cloudflare's proper role — keep it three-lane

- **Pages** = apex (repoint off Astro — the LANDMINE — verify green first).
- **Worker** = AI proxy: **bring its source into this repo** (`apps/ai-proxy/` + `wrangler.toml`, deployed by a `workflow_dispatch` job) so it is versioned, auditable, and CI-tested. Closes L-662. → **FOUNDER DECISION: in-repo Worker.**
- **R2** = assets: **apply the bucket CORS policy** (needs an Admin R/W token — 2 min in dashboard), then delete the interim same-origin proxies per the documented exit criterion, restoring direct browser→R2 with zero code change. Consider `assets.pryzm.<TLD>` custom domain (env-var-only switch).

### 9.6 Fly app/region/scaling

- Keep `fra` primary (GDPR/C22/C49). For launch resilience: bump to **≥2 machines** (removes the single-machine outage) and set `memory_mb=1024` once precompiled boots free the headroom; add a peer region (`lhr`) only as a deliberate, contracted billing event. → **FOUNDER DECISION: 2-machine HA at launch?**
- **Confirm the Fly billing/grandfathered status** (audit Open Question #2) — the "$0 free tier" comments are only true if grandfathered. ⚠️ VERIFY IN DASHBOARD.

### 9.7 Secrets management + rotation

- **One source of truth per environment.** Recommendation: manage Fly + GitHub + Cloudflare secrets from a single `.env.<env>` (gitignored) applied by a script (`flyctl secrets import`, `gh secret set`, Cloudflare API), so the three stores can never silently drift. Document which secret lives where (the §7 table becomes the canonical map). Establish a **rotation runbook** (session secret, R2 keys, Anthropic key, Stripe). → **FOUNDER DECISION: adopt a secrets-sync script vs manual.**

### 9.8 Observability + rollback

- Wire `OTEL_EXPORTER_OTLP_ENDPOINT` to a real backend (Tempo/Grafana — a dashboard config already exists at `docs/04-reference/observability/dashboards/tempo-beta.yaml`). Add uptime + `/api/health/ready` alerting. → **FOUNDER DECISION: observability backend.**

---

## 10. Pre-push / pre-deploy checklist (until the target lands)

1. If any `package.json` changed, run `pnpm install` and **commit `pnpm-lock.yaml` in the same commit** (frozen-lockfile trap, L-657).
2. Run `pnpm run build` locally (root, with `tsc`) — Fly's build omits `tsc`, but CI runs it and a deploy hard-fails on a type error the local `build:docker` would miss (memory `build-uses-stricter-root-tsc`).
3. Confirm any `VITE_*` change is a **`--build-arg`**, never a Fly runtime secret (silent-404 trap, §7).
4. Deploy (manual `flyctl deploy`), then verify `https://pryzm.fly.dev/api/health/ready` → `{ ok: true }`.
5. Hard-refresh the browser after deploy (SW stale-cache, L-661).
6. If touching apex marketing, edit **editor source** (`apps/editor/src/ui/platform/`), never `dist-apex/` (C51 §2.1.5), and confirm the Pages build is green before deleting any Astro page.

---

## 11. FOUNDER DECISIONS surfaced (consolidated)

1. **Domain canonicalization (BLOCKING)** — `pryzm.so` (contract) vs `pryzm.app` (app code) vs `pryzm.io` (stray). Pick one, sweep the rest, amend C51 §4 before wiring DNS.
2. **Add a staging environment?** (Recommended: yes — all testing is on prod today.)
3. **Per-PR app preview envs vs staging-only?**
4. **Ratify the single deploy path** — adopt Option A (direct `flyctl deploy --remote-only`, committed `deploy.ps1`, Actions as emergency-only) after the 1-hr remote-builder spike?
5. **Blue-green vs rolling** deploy strategy?
6. **2-machine HA at launch** (and `memory_mb` bump after precompile)?
7. **Bring the CF AI Worker source into the repo?**
8. **Adopt a secrets-sync script** (one source of truth per env) + rotation runbook?
9. **Observability backend** for OTEL + uptime alerting?
10. **Verify Fly billing status** (grandfathered $0 vs ~$4–8/mo) — sets how hard "minimise cost" pushes.

---

## 12. Cross-references

- `fly.toml` · `Dockerfile` · `.github/workflows/{deploy-fly,ci,context-bake,terrain-bake,r2-sync-items,r2-cors}.yml`
- `docs/02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md` (apex/app split, DNS, routing, CI gates)
- `docs/04-reference/runbooks/DEPLOYMENT-PLATFORM-AUDIT.md` (five-options ranking; Option A recommendation)
- `docs/04-reference/runbooks/FLY-DEPLOY-WITHOUT-GIT-OPEN.md` (credential-coupling study)
- `docs/05-guides/deployments/cloudflare-pages-apex-setup.md` (apex Pages runbook + repoint LANDMINE)
- `docs/04-reference/OBJECT-STORAGE-R2-DECISION.md` (R2 bucket, CORS, interim proxies)
- `server.js` (BFF, `CF_WORKER_URL` relay, health routes) · `.env.example` (env var contract)

*End — PRYZM Path to Production, 2026-07-30 — investigation + target architecture. Repo claims [VERIFIED-FROM-CODE] against the files named; external state marked ⚠️ VERIFY IN DASHBOARD; hypotheses [INFERRED]. Awaiting founder decisions (§11).*
