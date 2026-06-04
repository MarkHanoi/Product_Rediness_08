# Cloudflare Pages setup — `pryzm.so` apex (the C51 editor-prerendered marketing)

> **Stamp**: 2026-06-04 · **Status**: CANONICAL · **Owner**: @MarkHanoi
> **What this is**: the step-by-step runbook to deploy PRYZM's **apex marketing surface** (`pryzm.so`) to Cloudflare Pages — serving the **editor's prerendered marketing** (`pnpm build:apex` → `apps/editor/dist-apex/`) per **[C51 §4 + §6.1](../../02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md)**.
> **Use it when**: repointing the existing `pryzm.so` Pages project off the old Astro docs-site, configuring a new apex Pages project, or migrating to a different Cloudflare zone.
> **Supersedes the apex half of**: [CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md) — that runbook configures the **OLD Astro docs-site** (`apps/docs-site/dist`); per C51 §6.3 + ADR-055 Phase A the apex `pryzm.so` MUST serve `apps/editor/dist-apex/` instead. This doc is the C51-correct replacement. The old doc's hard-won monorepo lessons (§5 / §9.3 — `SKIP_DEPENDENCY_INSTALL`, `--no-frozen-lockfile`) carry over verbatim and are reproduced here.

---

## §0 — TL;DR (the five inputs)

| Field | Value |
|---|---|
| **Production branch** | `main` |
| **Framework preset** | **None** (Static HTML — the apex is pure prerendered HTML, no framework) |
| **Build command** | `pnpm install --no-frozen-lockfile && pnpm build:apex` |
| **Build output directory** | `apps/editor/dist-apex` |
| **Root directory (advanced)** | *leave blank* (monorepo root — `build:apex` resolves workspace paths itself) |
| **Env vars** | `NODE_VERSION=20` · `SKIP_DEPENDENCY_INSTALL=true` · `NPM_FLAGS=--version` |
| **Custom domains** | `pryzm.so` (apex) + `www.pryzm.so` (301 → apex) |

`app.pryzm.so` + `api.pryzm.so` are a **separate** surface (Fly, region `fra`) — NOT this project. See §7.2.

---

## §1 — Why this is different from the docs-site runbook

[CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md) was authored at IP-A5 closure (2026-06-02) to deploy the Astro Starlight docs-site (`apps/docs-site/`) as the `pryzm.so` marketing surface. **ADR-055 + C51 retired that pattern** — there must be exactly ONE codebase (`apps/editor/src/`) emitting the marketing, not a parallel Astro mirror that drifts (the ADR-052 drift trap: the Astro mirror hardcoded `#5a4282` while the editor shipped `#6600FF`).

The C51-correct apex therefore serves the **editor's prerendered marketing**:

| | Old (docs-site runbook) | New (this runbook — C51) |
|---|---|---|
| Source | `apps/docs-site/src/pages/*.astro` (Astro) | `apps/editor/src/ui/platform/` (editor TS, single-source) |
| Build command | `pnpm --filter @pryzm/docs-site exec astro build` | `pnpm build:apex` (a light prerender — see §3) |
| Output dir | `apps/docs-site/dist` | **`apps/editor/dist-apex`** |
| Framework preset | Astro | **None / Static** |
| Routes | index · pricing · manifesto · trust (Astro) | `/` · `/pricing` · `/manifesto` · `/trust` (prerendered HTML) |
| Governing contract | ADR-052 (superseded) | **C51 §4 + §6.1** |

> **THE LANDMINE (carried from the C51-split memory + the migration runbook):** the existing `pryzm.so` Cloudflare Pages project is **currently wired to the Astro build**. It MUST be repointed to `apps/editor/dist-apex` (§5) **before** the Astro marketing pages are deleted (tracker A.17.x.14 / C51 §6.3). Deleting the Astro source first while Pages still builds it = the apex goes dark. **Repoint first, verify green, then retire Astro.**

---

## §2 — Pre-requisites checklist

Confirm all of these before opening the Cloudflare dashboard.

| # | Check | How to verify |
|---|---|---|
| 1 | The apex prerender runs locally and emits real HTML | `pnpm build:apex` → check `apps/editor/dist-apex/index.html` has inlined content (see §4.2) |
| 2 | Root `package.json` declares `"build:apex": "node scripts/build/prerender-apex.mjs"` | ✅ confirmed 2026-06-04 |
| 3 | Root `package.json` declares `"packageManager": "pnpm@10.26.1"` (Cloudflare corepack auto-provisions pnpm) | ✅ |
| 4 | Root `package.json` declares `"engines": { "node": ">=20.0.0" }` | ✅ |
| 5 | No broken submodule pointers (`git ls-tree HEAD` shows no `160000` modes without a `.gitmodules` entry) | ✅ (the `MasterMiawW` pointer was removed — see docs-site runbook §9.1 if it recurs) |
| 6 | The branch you want to deploy from is pushed to GitHub | — |
| 7 | The `pryzm.so` zone is on your Cloudflare account | ✅ |
| 8 | Cloudflare has access to the GitHub repo `MarkHanoi/Product_Rediness_08` | ✅ |

---

## §3 — Build profile — the apex prerender is LIGHT (not the 6 GB editor build)

`pnpm build:apex` runs **`scripts/build/prerender-apex.mjs`** — a static-site generator, NOT the memory-hungry editor Vite build. Critically:

- **It does NOT** call `composeRuntime()`, touch THREE, open a DB connection, init Yjs, or bundle the editor SPA. (`build:app` / `npm run build` is the heavy one — `NODE_OPTIONS=--max-old-space-size=6144`. The apex does not need it.)
- It uses **happy-dom + tsx** (both already in the workspace — zero new deps) to dynamic-import three *import-pure* CSS-string modules (`tokens.ts`, `marketingPages.ts`, `pricingPage.ts`) and the import-pure `landingMarkup.ts` (the C51 §2.1.5 single-source landing builder), then serialises four routes to static HTML.
- **Cold runtime ~1.5 s. No network. No subprocess.** Memory profile is ordinary Node — it fits comfortably in Cloudflare Pages' default build container; **no `NODE_OPTIONS` memory bump is needed.**

**Output** (`apps/editor/dist-apex/`):

```
apps/editor/dist-apex/
├─ index.html              (landing  — / )
├─ pricing/index.html      ( /pricing )
├─ manifesto/index.html    ( /manifesto )
├─ trust/index.html        ( /trust )
├─ _headers                (Cloudflare Pages edge CSP / security headers)
└─ _redirects             (www→apex, trailing-slash, fallback)
```

Each `index.html` is **pure HTML with inlined critical CSS** in a `<style>` block — **zero `<script>` tags**, zero `<div id="root">` placeholder (C51 §2.1.3 forbids an empty-root placeholder; the prerender fails the build if one is present). The apex CSP can therefore forbid `script-src` entirely (`default-src 'none'`).

### §3.1 — Verified local run (2026-06-04, this repo)

```
[prerender-apex] → apps/editor/dist-apex
[prerender-apex]   landing     apps/editor/dist-apex/index.html             37,371 bytes
[prerender-apex]   pricing     apps/editor/dist-apex/pricing/index.html     23,601 bytes
[prerender-apex]   manifesto   apps/editor/dist-apex/manifesto/index.html   11,748 bytes
[prerender-apex]   trust       apps/editor/dist-apex/trust/index.html       10,703 bytes
[prerender-apex]   _headers                                                    842 bytes
[prerender-apex]   _redirects                                                  658 bytes
[prerender-apex] total:                                                     84,923 bytes
[prerender-apex] done.
```

**~85 KB total — 58% headroom under the C51 §6.1.3 200 KB budget.** (The `check-apex-size.mjs` gate measures the gzipped subset and reports ~21 KB; either way, well inside budget.)

### §3.2 — Optional env override for pre-DNS testing

`prerender-apex.mjs` reads **`APP_ORIGIN`** (default `https://app.pryzm.so`) for the app-surface CTA targets (`/signup`, `/sign-in`, `/contact`). To test the full landing → signup journey BEFORE `app.pryzm.so` DNS/TLS lands, build with the Fly origin directly:

```bash
APP_ORIGIN=https://pryzm.fly.dev pnpm build:apex
```

For the production Cloudflare deploy, leave `APP_ORIGIN` **unset** (defaults to the canonical `https://app.pryzm.so`).

---

## §4 — Initial project creation (one-time) — only if creating a NEW apex Pages project

> If the `pryzm.so` Pages project **already exists** (wired to Astro today), do NOT create a new one by default — **repoint the existing project** per §5. This section is for a from-scratch setup or the "new clean project" repoint variant (§5, option B).

1. Cloudflare dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Authorize Cloudflare on GitHub; grant access to `MarkHanoi/Product_Rediness_08`.
3. Pick the repo: `MarkHanoi/Product_Rediness_08`.
4. **Production branch**: `main`.
5. Build settings → paste the five inputs from §0 (detailed in §4.1).
6. Env vars → add the three from §5.
7. **Save and Deploy.**

### §4.1 — Build settings (detail)

| Field | Value | Why |
|---|---|---|
| **Framework preset** | **None** | The apex is pure static HTML emitted by our own prerender script. There is no framework for Cloudflare to detect; "None" prevents it injecting an Astro/Vite-flavoured default build command. |
| **Build command** | `pnpm install --no-frozen-lockfile && pnpm build:apex` | `pnpm install` brings up the workspace (`build:apex` dynamic-imports `@pryzm/editor` source + happy-dom/tsx). `--no-frozen-lockfile` tolerates the inevitable lockfile drift on Cloudflare's Node (see §9.1). `&& pnpm build:apex` runs the prerender only if install succeeded. |
| **Build output directory** | `apps/editor/dist-apex` | The exact directory `prerender-apex.mjs` writes to (C51 §6.1.2). |
| **Root directory (advanced)** | *leave blank* (repo root) | `build:apex` is a root script that resolves workspace paths internally; no `--filter` navigation needed. |

### §4.2 — Verify the output is real (not an empty root)

After the build, the deploy must serve **prerendered content**, not a JS-mount placeholder. Locally:

```bash
pnpm build:apex
grep -c 'lp-hero-heading' apps/editor/dist-apex/index.html   # → 4 (real landing markup present)
grep -c 'div id="root"'   apps/editor/dist-apex/index.html   # → 0 (NO empty-root placeholder — C51 §2.1.3)
grep -c '<script'         apps/editor/dist-apex/index.html   # → 0 (apex ships no JS — C51 §2.1.1 / §2.2.4)
```

`index.html`'s `<head>` must contain a `<title>`, `<meta name="description">`, `<meta name="theme-color" content="#6600FF">`, a `<link rel="canonical">`, and an inline `<style>` block (the C51 §2.1.1 inlined critical CSS).

---

## §5 — Environment variables

Add these three (Production + Preview). These are the **same hard-won monorepo lessons** as the docs-site runbook §5 — they are not docs-site-specific; they govern any pnpm-monorepo Cloudflare Pages build.

| Variable | Value | Why |
|---|---|---|
| `NODE_VERSION` | `20` | We require Node ≥20 per `engines`. Without it Cloudflare picks an older Node and fails the `engines` check. |
| `SKIP_DEPENDENCY_INSTALL` | `true` | **Critical for monorepos.** Cloudflare auto-detects pnpm and runs `pnpm install --frozen-lockfile` BEFORE your build command — and `--frozen-lockfile` is the CI default, so ANY lockfile/`package.json` drift blows up with `ERR_PNPM_OUTDATED_LOCKFILE`. This flag skips Cloudflare's auto-install entirely, making our build-command-level `pnpm install --no-frozen-lockfile` the single source of truth. **Without this you WILL hit `ERR_PNPM_OUTDATED_LOCKFILE` whenever the lockfile is not byte-perfect.** |
| `NPM_FLAGS` | `--version` | Tells Cloudflare's auto-installer to run `npm --version` (a no-op) instead of its own install. Avoids a wasted double-install. (Belt-and-braces alongside `SKIP_DEPENDENCY_INSTALL`.) |

---

## §6 — Click "Save and Deploy" — what Cloudflare does next

1. Clones the repo at `main`.
2. Runs `corepack enable` (reads `packageManager: pnpm@10.26.1` → provisions pnpm at that version).
3. Runs the build command: `pnpm install --no-frozen-lockfile` (~60–90 s) then `pnpm build:apex` (~1.5 s — the prerender is light).
4. Uploads `apps/editor/dist-apex/**` to the edge.
5. Gives you `https://<project-name>.pages.dev` — live before the custom domain is wired.

Expected first build: **2–4 minutes** (dominated by `pnpm install`, not the prerender). Subsequent builds ~60–90 s (pnpm cache hits).

---

## §7 — Custom domain wiring

Once the first deploy is green and the `.pages.dev` URL serves the prerendered landing:

1. Project view → **Custom domains** → **Set up a custom domain**.
2. Enter **`pryzm.so`**. Cloudflare detects the zone is on your account.
3. Cloudflare auto-creates the apex DNS record pointing at `<project-name>.pages.dev` (C51 §4.1.1 — apex MUST resolve to Cloudflare Pages, never to Fly).
4. Add **`www.pryzm.so`** as a second custom domain → configure it to **301 → `pryzm.so`** (C51 §4 DNS table: `www.pryzm.so` is a permanent redirect preserving the canonical apex URL). The build's `_redirects` file also encodes this as belt-and-braces (`https://www.pryzm.so/* → https://pryzm.so/:splat 301`).
5. **TLS auto-provisioned** by Cloudflare (Let's Encrypt, ~30–60 s) — C51 §4.1.3 (no manual cert work).
6. Verify: `curl -I https://pryzm.so/pricing` → `200 OK` + a Cloudflare cache header.

### §7.1 — DNS table (the apex rows — C51 §4 is normative)

| FQDN | Surface | Resolves to | Notes |
|---|---|---|---|
| `pryzm.so` | **apex** | Cloudflare Pages (`<project>.pages.dev`) | This project. Static, no auth, no DB, no PII. Global edge. |
| `www.pryzm.so` | redirect | 301 → `pryzm.so` | Permanent; canonical apex URL. |

### §7.2 — Cross-reference: `app.pryzm.so` / `api.pryzm.so` are NOT this project

`app.pryzm.so` (the editor SPA + server) and `api.pryzm.so` (the API alias) resolve to **Fly.io** (`pryzm.fly.dev`, region `fra`) in Phase A — a **separate** deploy target with its own Fly certs + (pending) DNS, handled outside this runbook (C51 §4.1.2). **Do NOT point `pryzm.so` at Fly** — C51 §4.2.1 / §3.2.2: apex on Fly violates the "marketing survives app maintenance" reliability invariant. Likewise `docs.pryzm.so` (developer docs) stays its own Pages project (C51 §4.1.4) and is unaffected by this apex repoint.

---

## §8 — THE REPOINT — moving the existing `pryzm.so` project off Astro

The existing `pryzm.so` Pages project builds the **Astro docs-site** today. Two ways to make it serve the C51 apex; **recommendation: option A (edit in place)** — it preserves the custom-domain + TLS + DNS already wired to `pryzm.so`, so there is no domain-detach/re-attach window.

### §8.A — RECOMMENDED: edit the existing project's build config in place

1. Cloudflare dashboard → **Workers & Pages** → the existing `pryzm.so` project → **Settings** → **Builds & deployments**.
2. Change the three build fields:
   | Field | From (Astro) | **To (C51 apex)** |
   |---|---|---|
   | Framework preset | Astro | **None** |
   | Build command | `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build` | **`pnpm install --no-frozen-lockfile && pnpm build:apex`** |
   | Build output directory | `apps/docs-site/dist` | **`apps/editor/dist-apex`** |
3. Confirm the env vars (§5) are present (`NODE_VERSION=20`, `SKIP_DEPENDENCY_INSTALL=true`, `NPM_FLAGS=--version`) — they carry over unchanged.
4. **Save.**
5. **Deployments** → **Retry deployment** (or push a commit to `main`) to trigger a build with the new config.
6. **Verify green + run the §10 checklist** against the `.pages.dev` URL and `https://pryzm.so`.
7. **Only after the apex deploy is confirmed green**, proceed to retire the Astro marketing source (tracker A.17.x.14 / C51 §6.3) — see the LANDMINE in §1.

### §8.B — ALTERNATIVE: create a fresh apex Pages project, then move the domain

Use this only if you want to keep the Astro project deployable on a `.pages.dev` URL during cutover.

1. Create a NEW Pages project per §4 (e.g. named `pryzm-apex`), build it green on its `.pages.dev` URL.
2. On the **old** Astro project → **Custom domains** → remove `pryzm.so` + `www.pryzm.so`.
3. On the **new** apex project → **Custom domains** → add `pryzm.so` + `www.pryzm.so` (§7). TLS re-provisions (~30–60 s).
4. **Downside:** a brief window where `pryzm.so` is mid-detach (DNS/TLS re-point). Option A has no such window — prefer A unless you have a specific reason.

> Either way: **do NOT delete `apps/docs-site/src/pages/{index,pricing,manifesto,trust}.astro` until the apex Pages build is green.** That is the LANDMINE (§1). The `check-no-product-routes-in-docs-site.mjs` gate (C51 §7, LIVE) already blocks re-introducing those Astro pages, so once retired they stay retired.

---

## §9 — Troubleshooting

### §9.1 — Build fails on `pnpm install` with `ERR_PNPM_OUTDATED_LOCKFILE`

Identical to the docs-site runbook §9.3. **Cause:** Cloudflare auto-runs `pnpm install --frozen-lockfile` before your build command, ignoring `NPM_FLAGS`. **Permanent fix:** ensure `SKIP_DEPENDENCY_INSTALL=true` is set (§5) so Cloudflare's auto-install is a no-op and our `--no-frozen-lockfile` install is the only one. **Quick fix for an active deploy:** regenerate the lockfile locally (`pnpm install`), commit `pnpm-lock.yaml`, push, retry.

### §9.2 — Build is green but `index.html` shows an empty page / no styles

**Cause:** the wrong output directory (e.g. still `apps/docs-site/dist`, or `dist/` — the heavy editor SPA bundle). **Fix:** confirm **Build output directory = `apps/editor/dist-apex`** exactly. The prerender writes ONLY there.

### §9.3 — `prerender-apex.mjs` FATAL — "at least one CSS source string is empty"

**Cause:** one of the import-pure CSS modules (`tokens.ts` / `marketingPages.ts` / `pricingPage.ts`) lost its expected export, or `landingMarkup.ts` no longer exports `landingMarkup`. The prerender hard-fails (exit 1) rather than ship an unstyled apex. **Fix:** run `pnpm build:apex` locally, read the FATAL line (it prints each source's byte length), and restore the missing export. Do NOT work around it by editing the apex output — the editor source is the single source of truth (C51 §2.1.5).

### §9.4 — Deploy green but `pryzm.so` shows a DNS error

DNS propagation after adding the custom domain takes 1–5 min. Wait + retry; verify the apex record exists in the Cloudflare DNS tab and points at `<project>.pages.dev` (NOT at Fly — that would be a C51 §4.2.1 violation).

### §9.5 — Deploy green but `pryzm.so` serves a stale (Astro) version

Edge cache. **Deployments** → latest → **Retry deployment**, or Cloudflare zone → **Caching** → **Purge Everything**. After a repoint (§8) confirm the latest deployment in the Deployments tab is the apex build, not a cached Astro one.

---

## §10 — Verification checklist after deploy / repoint

| # | Check | How / expected |
|---|---|---|
| 1 | The four apex routes return 200 | `curl -I https://pryzm.so/` · `/pricing` · `/manifesto` · `/trust` → all `200 OK` |
| 2 | No empty-root placeholder | `curl -s https://pryzm.so/ \| grep -c 'div id="root"'` → `0` (C51 §2.1.3) |
| 3 | Real landing content present | page source contains `lp-hero-heading` + inline `<style>` (the prerendered editor landing) |
| 4 | No `<script>` tags on apex | `curl -s https://pryzm.so/ \| grep -c '<script'` → `0` (C51 §2.1.1 / §2.2.4 — self-contained, no JS) |
| 5 | CSP header present + permissive-but-locked | response `Content-Security-Policy` has `default-src 'none'` + `style-src 'unsafe-inline'`, NO `script-src` allowance (from `_headers`) |
| 6 | **No auth cookies** | response has NO `Set-Cookie`; no `document.cookie` in source (C51 §2.2.1 — apex is anonymous by contract; the `check-apex-no-auth-cookies.mjs` gate also enforces this) |
| 7 | Brand colour is the unified purple | `meta[name=theme-color]` = `#6600FF` on the landing/pricing routes (C51 §2.1.4 — no `#5a4282` drift) |
| 8 | App CTAs point at the app origin | landing "Get started" / "Start here" anchors → `https://app.pryzm.so/signup`; "Log in" → `/sign-in` (C51 §3.1.8.1). Apex-owned routes (`/pricing`) stay root-relative. |
| 9 | `www.pryzm.so` 301s to apex | `curl -I https://www.pryzm.so/` → `301` → `https://pryzm.so/` |
| 10 | TLS valid on the custom domain | `curl -I https://pryzm.so/` succeeds with a valid cert (Cloudflare-provisioned) |
| 11 | Apex size within budget | `pnpm check:apex` locally → `check-apex-size` passes (< 200 KB; currently ~21 KB gzipped) |

> `npm run check:apex` runs the prerender + the three LIVE apex gates (`check-apex-self-contained` · `check-apex-size` · `check-apex-no-auth-cookies`) in one shot — run it locally before any repoint to confirm the build is C51-clean.

---

## §11 — Redeploy after a code change

The repo is wired for auto-deploy. Future marketing-copy or landing changes ship automatically:

1. Edit the **editor source** — `apps/editor/src/ui/platform/landingMarkup.ts` (landing), `apps/editor/src/ui/styles/panels/marketingPages.ts` / `pricingPage.ts` (CSS), or `scripts/build/prerender-apex.mjs` (pricing plans / manifesto / trust content). **Never hand-edit `dist-apex/`** — it is generated (C51 §2.1.5 / §3.2.4 forbid hand-mirrored marketing copy).
2. Push to `main`.
3. Cloudflare auto-deploys within ~60–90 s.
4. Once green, live at `pryzm.so` + the `.pages.dev` URL.

PR previews: any push to a non-production branch creates a preview deploy at a unique `*.<project>.pages.dev` URL.

---

## §12 — Cross-references

- **Governing contract**: [C51 — Apex/App Deployment Split](../../02-decisions/contracts/C51-APEX-APP-DEPLOYMENT-SPLIT.md) — §2 (apex MUST/MUST NOT), §4 (DNS), §5 (routing), §6.1 (`build:apex` contract), §7 (CI gates).
- **Parent ADR**: [ADR-055 — One PRYZM / Cloudflare / Supabase](../../02-decisions/adrs/ADR-055-one-pryzm-cloudflare-supabase.md) §0 + §3 (Phase A).
- **The prerender script**: [scripts/build/prerender-apex.mjs](../../../scripts/build/prerender-apex.mjs).
- **Single-source landing markup**: [apps/editor/src/ui/platform/landingMarkup.ts](../../../apps/editor/src/ui/platform/landingMarkup.ts) (C51 §2.1.5 / §3.1.8.1).
- **The OLD (Astro) docs-site runbook this replaces for the apex**: [CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md) — keep it ONLY for `docs.pryzm.so` developer-docs context once the marketing pages retire.
- **Apex CI gates** (all LIVE, run by `npm run check:apex` + the `apex-gates` CI job): `check-apex-self-contained.mjs` · `check-apex-size.mjs` · `check-apex-no-auth-cookies.mjs`.

---

## §13 — When this doc must be updated

Append a dated line to §13.1 whenever any of these change: the `build:apex` command or its output dir; the apex route set (`/` · `/pricing` · `/manifesto` · `/trust`); the required Node version; the production branch; the custom-domain wiring; or when `ManifestoPage.ts` / `TrustPage.ts` land in the editor (the prerender's inline `CONTENT_PAGE_STYLES` should then move into `apps/editor/src/ui/styles/panels/contentPages.ts` per the prerender's own LANDMINE note).

### §13.1 — Change log

- **2026-06-04** — Doc authored. The C51-correct apex (`pryzm.so` → editor-prerendered `apps/editor/dist-apex/`) Cloudflare Pages runbook + the repoint procedure off the old Astro docs-site (§8). Light-prerender build profile (§3) verified locally (~85 KB, ~1.5 s, no editor Vite build). Sibling to — and the apex-half replacement of — [CLOUDFLARE-PAGES-SETUP.md](./CLOUDFLARE-PAGES-SETUP.md).
