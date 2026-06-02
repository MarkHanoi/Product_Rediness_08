# Cloudflare Pages setup — `pryzm.so` docs-site

> **Stamp**: 2026-06-02 · **Status**: CANONICAL · **Owner**: @MarkHanoi
> **What this is**: the step-by-step runbook to deploy the PRYZM Astro docs-site (`apps/docs-site/`) to Cloudflare Pages at `pryzm.so`. Lives alongside the runbooks the team consults during any redeploy / disaster-recovery flow.
> **Use it when**: setting up the project for the first time, configuring a new environment (preview / staging / prod-rebuild), or migrating to a different Cloudflare zone.
> **First applied**: IP-A5 closure on 2026-06-02. First production deploy at commit `047e63e` (feature branch) / `d18db09` (main).

---

## §1 — Why Cloudflare Pages

The PRYZM customer-facing surface (landing, pricing, manifesto, trust) lives in `apps/docs-site/` as an Astro Starlight project. Astro pages are statically pre-rendered at build time; the output is plain HTML + CSS + a tiny amount of JS for the search box. That makes Cloudflare Pages the obvious host:

- **Free tier covers it.** No bandwidth bill for the marketing pages.
- **Native Astro support.** Cloudflare detects the framework + sets sane defaults.
- **Auto-deploy from GitHub.** Every push to the configured branch deploys; preview deploys for PRs.
- **Edge cache + CDN.** The static HTML is served from the closest POP to the visitor.
- **Cloudflare DNS + Pages live in the same dashboard.** One place to manage everything.
- **TLS auto-provisioned.** Pages handles the Let's Encrypt cert for the custom domain.

Alternatives considered: Replit (used today for the editor app — different deploy target); Vercel + Netlify (overkill + extra bill); Cloudflare Workers Sites (older, less Astro-native). Pages wins.

---

## §2 — Pre-requisites checklist

Before opening the Cloudflare dashboard, confirm all of these. Each line should already be true on this repo today.

| # | Check | Status this repo |
|---|---|---|
| 1 | The Astro project builds locally with `pnpm --filter @pryzm/docs-site exec astro build` | ✅ verified before first deploy |
| 2 | `apps/docs-site/package.json` exists with an `"astro": "^5.0.0"` dependency | ✅ |
| 3 | Root `package.json` declares `"packageManager": "pnpm@10.26.1"` so Cloudflare's corepack can auto-provision pnpm | ✅ |
| 4 | Root `package.json` declares `"engines": { "node": ">=20.0.0" }` | ✅ |
| 5 | No broken submodule pointers in the tree (cf. `git ls-tree HEAD` should not show any `160000` modes without a `.gitmodules` entry) | ✅ as of commit `d18db09` |
| 6 | The branch you want to deploy from is pushed to GitHub | ✅ |
| 7 | You have the **`pryzm.so`** zone added to your Cloudflare account | ✅ — Antoniocanerosan@gmai…'s account |
| 8 | You have access to the GitHub repo `MarkHanoi/Product_Rediness_08` from the same Cloudflare account | ✅ |

If any of these are red, fix that first. The Pages dashboard cannot do these for you.

---

## §3 — Initial project creation (one-time)

1. Open the Cloudflare dashboard → **Workers & Pages** (left sidebar).
2. Click **Create application** → **Pages** tab → **Connect to Git**.
3. Authorize Cloudflare on GitHub when prompted. Grant access to the `Product_Rediness_08` repo (or the whole `MarkHanoi` org if you want auto-discovery of future repos).
4. Pick the repo: `MarkHanoi/Product_Rediness_08`.
5. **Production branch**: choose the branch Cloudflare should auto-deploy. Today this is one of:
   - `main` — the canonical default. Commit `d18db09` is the first commit on `main` to deploy cleanly (it has the MasterMiawW submodule pointer removed).
   - `feat/daily-use-and-production-readiness-2026-05-20` — the active feature branch where IP-A5's pages were authored. Commit `047e63e` is the first deployable HEAD.

   **Recommendation**: deploy `main` as Production and let Cloudflare auto-build PR preview deploys for any other branch.

---

## §4 — Build settings (the five inputs)

Paste these into the "Configuring builds" form Cloudflare presents:

| Field | Value |
|---|---|
| **Framework preset** | **Astro** (use the dropdown to change from "React (Vite)" — Cloudflare's auto-detect can be wrong for monorepos) |
| **Build command** | `pnpm install --no-frozen-lockfile && pnpm --filter @pryzm/docs-site exec astro build` |
| **Build output directory** | `apps/docs-site/dist` |
| **Root directory (advanced)** | *leave blank* (the monorepo root is correct — the `--filter` flag handles workspace navigation) |
| **Environment variables** | see §5 |

### §4.1 — Why the build command is what it is

Token-by-token:

| Token | Purpose |
|---|---|
| `pnpm install` | Install all workspace dependencies (~1,500 packages). Required because `apps/docs-site` declares `@pryzm/entitlements` as a `workspace:*` dep — without `pnpm install` the build can't import the pricing-page data generator. |
| `--no-frozen-lockfile` | Tolerate small drift between `pnpm-lock.yaml` and `package.json`. Cloudflare's Node version + a regenerated lockfile won't byte-match yours; this flag prevents a hard fail on a non-issue. |
| `&&` | Run the next step ONLY if install succeeded. Avoids confusing astro-build errors when install actually failed. |
| `pnpm --filter @pryzm/docs-site` | Scope the next command to the `apps/docs-site/` workspace. Without `--filter`, pnpm would run astro at the repo root where there's no Astro project. |
| `exec astro build` | Invoke Astro's local-binary build using the package's own `astro` dependency (no global install needed). |

Output lands in `apps/docs-site/dist/` — matching the "Build output directory" field exactly.

---

## §5 — Environment variables

Click **Add variable** three times and add these three. Both apply to Production and Preview environments unless you say otherwise.

| Variable name | Value | Why |
|---|---|---|
| `NODE_VERSION` | `20` | We require Node ≥20 per `engines` in `package.json`. Without this, Cloudflare defaults to an older Node that fails the `engines` check. |
| `NPM_FLAGS` | `--version` | Tells Cloudflare's auto-installer to skip its own `npm install` step (it just runs `npm --version` instead). Our build command already runs `pnpm install` itself — without this flag you get a double-install that wastes ~2 min per deploy. |
| `SKIP_DEPENDENCY_INSTALL` | `true` | **Critical** for monorepos. Cloudflare auto-detects pnpm + runs `pnpm install` BEFORE our build command, ignoring `NPM_FLAGS`. That auto-install runs with `--frozen-lockfile` (the CI default) so any drift between `pnpm-lock.yaml` and a `package.json` in the workspace blows up the build. This flag tells Cloudflare to skip the auto-install entirely — our `pnpm install --no-frozen-lockfile` in the build command is then the single source of truth for dep resolution. **Without this flag, you will hit `ERR_PNPM_OUTDATED_LOCKFILE` any time the lockfile is not byte-perfect.** |

Optional (add later if needed):
- `PRYZM_BUNDLE_REPORT_REQUIRED=1` — fail the deploy when the Vite manifest is missing (only matters for the editor app, not the docs-site).

---

## §6 — Click "Save and Deploy"

That's all five inputs. Click the button at the bottom of the page (the label depends on Cloudflare's UI iteration — "Begin setup", "Save and Deploy", etc).

### §6.1 — What Cloudflare does next

1. **Clones the repo at the configured production branch.**
2. **Runs `corepack enable` automatically** — it reads `packageManager: pnpm@10.26.1` from `package.json` and provisions pnpm at that exact version.
3. **Runs your build command** — `pnpm install` (~60-90s on Cloudflare's network) then `astro build` (~10-30s for 4 pages).
4. **Uploads `apps/docs-site/dist/**` to their edge network.**
5. **Gives you a `https://<project-name>.pages.dev` URL** — your deploy is live before you've wired the custom domain.

Expected total build time: **3-5 minutes for the first deploy**, ~ 60-90 seconds for subsequent deploys (pnpm cache hits).

---

## §7 — Custom domain wiring (`pryzm.so`)

Once the first deploy is green AND a deploy URL like `893b1206.pryzmapp.pages.dev` is reachable:

1. In the project view (`pryzmapp` or whatever name the project was created under), click **Custom domains** in the left sidebar.
2. Click **Set up a custom domain**.
3. Enter `pryzm.so`. Cloudflare detects the zone is already on your account.
4. Cloudflare auto-creates the necessary DNS records. Check the **DNS** tab in the parent zone view:
   - For the apex (`pryzm.so`): a CNAME-flattened record (or apex A/AAAA records) pointing at `<project-name>.pages.dev` — visible in **DNS → Records**. Cloudflare proxies the apex via "CNAME flattening" so the user-facing answer is an A record but the configured value is the Pages hostname.
   - The `www.pryzm.so` subdomain is auto-configured to redirect to the apex.
5. TLS certificate is provisioned automatically via Let's Encrypt (~ 30-60 seconds). The Custom Domains row will show **Active** with a green padlock once issued.
6. Verify with two curls (the first should be a redirect chain, the second a 200):
   ```
   curl -I https://www.pryzm.so          → 301 → https://pryzm.so/
   curl -I https://pryzm.so/             → 200 OK; cf-cache-status: HIT / DYNAMIC
   curl -I https://pryzm.so/pricing      → 200 OK
   curl -I https://pryzm.so/manifesto    → 200 OK
   curl -I https://pryzm.so/trust        → 200 OK
   ```

### §7.0 — Mapping multiple `pages.dev` URLs to the same project

Each deploy gets its own randomised hash subdomain (`893b1206.pryzmapp.pages.dev`). These are STABLE artefacts — useful for sharing a preview that won't change. Two stable URLs that DO change with each deploy:

| URL | Resolves to |
|---|---|
| `<hash>.<project>.pages.dev` | this specific deploy (preview URL) |
| `<branch>.<project>.pages.dev` | most-recent deploy of that branch |
| `<project>.pages.dev` | most-recent deploy of the production branch (`main`) |
| `pryzm.so` (custom domain) | same as `<project>.pages.dev` once attached |

If you saw the `<hash>` URL render Starlight's "Developer Docs" landing instead of the marketing surface, that means the build succeeded BUT `src/pages/index.astro` didn't exist yet — Starlight's content-collection landing wins by default. Adding `src/pages/index.astro` makes the marketing landing claim `/`. Fixed in commit `7e2e604`.

### §7.1 — Subdomains to reserve

Even if not wired today, add these as placeholders in the Cloudflare DNS dashboard so they're claimed:

| Subdomain | Eventual destination | Status today |
|---|---|---|
| `pryzm.so` | this docs-site (landing + pricing + manifesto + trust) | LIVE |
| `marketplace.pryzm.so` | the marketplace app (IP-A1 — currently blocked on npm token + plugins) | reserve only |
| `app.pryzm.so` | the editor SPA (`apps/editor`) | reserve only |
| `docs.pryzm.so` | optional alias for the docs-site (if Starlight content grows) | optional |
| `api.pryzm.so` | the BFF / OpenAPI surface (the Express server in `server.js`) | reserve only |

---

## §8 — Verification checklist after first deploy

| # | Check | How |
|---|---|---|
| 1 | The `.pages.dev` URL loads the landing page | Click the URL in the Cloudflare deployments tab |
| 2 | `<.pages.dev>/pricing` shows 5 tiers × 30 features | Generated from `@pryzm/entitlements` — no hand-edits |
| 3 | `<.pages.dev>/manifesto` shows the brand-voice page | 8 sections, no Coming Soon copy |
| 4 | `<.pages.dev>/trust` shows the trust pillars + retention windows | 4 pillars + tier-keyed retention table |
| 5 | `https://pryzm.so/pricing` loads (post DNS step) | TLS valid, content identical to .pages.dev URL |
| 6 | Cloudflare Pages dashboard shows green "Success" for the deployment | Deployments tab |
| 7 | DNS records exist for `pryzm.so` apex | DNS tab in parent zone view |
| 8 | The pre-existing 404-page `_zod` Astro issue (if it surfaces in build log) does not block the 4 user-facing pages | Build log shows the 4 routes built; 404 may emit a warning that's ignorable |

---

## §9 — Troubleshooting

### §9.1 — Build fails: "fatal: No url found for submodule path 'MasterMiawW' in .gitmodules"

**Cause**: a directory at repo root was committed as a gitlink (mode 160000) without a corresponding `.gitmodules` entry.

**Fix** (already applied on commit `d18db09`):
```bash
git rm --cached MasterMiawW
echo "MasterMiawW/" >> .gitignore
git commit -m "fix: remove broken MasterMiawW submodule pointer"
git push
```

If you ever see this pattern again with a different directory, the same recipe applies. The directory stays on local disk (it's just gitignored now); only the broken repo-level pointer is removed.

### §9.2 — Build fails during `astro build` with `Cannot read properties of undefined (reading '_zod')`

**Cause**: pre-existing Astro content-collection schema misalignment on the 404 page. Surfaces during static-route generation for `/404`.

**Status as of 2026-06-02**: known issue, not yet patched. Tracked under the docs-site issues. Workaround if it blocks your deploy: temporarily edit the 404 page content-collection entry to remove the offending field, or set `"output": "server"` in `astro.config.mjs` to skip the 404 pre-render.

The 4 main pages (pricing, manifesto, trust, index) do NOT depend on this issue and build fine.

### §9.3 — Build fails on `pnpm install` with `ERR_PNPM_OUTDATED_LOCKFILE`

**Symptom** (verbatim, copy-paste from Cloudflare build log):
```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with "frozen-lockfile" because
pnpm-lock.yaml is not up to date with <ROOT>/<some>/package.json

specifiers in the lockfile don't match specifiers in package.json:
* 1 dependencies were added: @pryzm/schemas@workspace:*

Note that in CI environments this setting is true by default.
```

**Cause #1 (most common)**: a workspace `package.json` was edited and committed but the root `pnpm-lock.yaml` was not regenerated. Lockfile drift.

**Cause #2 (deceptive)**: even if you set `NPM_FLAGS=--version`, Cloudflare still auto-runs `pnpm install` BEFORE your build command — and that auto-install uses `--frozen-lockfile` by default. So your `pnpm install --no-frozen-lockfile` in the build command never gets a chance to run if Cloudflare's pre-step fails.

**Permanent fix**: add the env var `SKIP_DEPENDENCY_INSTALL=true` (see §5). This makes Cloudflare's auto-install a no-op, and your build-command-level `pnpm install --no-frozen-lockfile` becomes the only install step. Tolerant of lockfile drift.

**Quick fix for an active deploy** (if you can't update env vars right now):
```bash
git checkout main      # or whichever branch Cloudflare deploys from
pnpm install           # regenerates the lockfile to byte-match the workspaces
git add pnpm-lock.yaml
git commit -m "fix: sync pnpm-lock.yaml"
git push
```
Then retry the Cloudflare deploy.

**First-applied-fix**: commit `1898243` on `main` synced the lockfile from the feature branch when the initial deploy hit this on `d18db09`.

### §9.4 — Deploy is green but `pryzm.so` shows DNS error

**Cause**: DNS propagation can take 1-5 minutes after the custom domain is added.

**Fix**: wait + retry. Verify the records exist in Cloudflare DNS tab. If after 10 minutes still failing, check the **Custom domains** tab — Cloudflare shows the verification state per domain.

### §9.5 — Deploy is green but the production URL serves a stale version

**Cause**: Cloudflare edge cache holds the prior version.

**Fix**: in the project view, **Deployments** → click the latest → **Retry deployment**. Or purge the cache: Cloudflare zone → Caching → Purge Everything.

### §9.6 — "Retry deployment" re-uses the SAME commit (does NOT pick up a fix you just pushed)

**Symptom**: you pushed a fix to `main`; the next Cloudflare build STILL clones the previous commit and fails the same way.

**Cause**: clicking **"Retry deployment"** on a failed deploy re-runs the SAME commit hash. It doesn't fetch the latest of the production branch.

**Fix**: use the **"Create deployment"** button (top-right of the project view) instead. That button fetches the current HEAD of the configured production branch.

The distinction:

| Button | What it does | Use when |
|---|---|---|
| **Retry deployment** (on a failed build row) | Re-runs the **same commit** that failed | The failure was transient (network blip mid-install, sporadic timeout). |
| **Create deployment** (top-right of project view) | Fetches the **latest HEAD** of the production branch | You pushed a fix that should be deployed. **This is what you want 90% of the time.** |

Look at the build log's first line — `HEAD is now at <hash>` — to confirm which commit was actually built. If it's not your latest push, you used Retry instead of Create.

This trap costs ~ 5 minutes per occurrence (one wasted Cloudflare build cycle). The IP-A5 closure deploy hit it twice on 2026-06-02; this troubleshooting entry is the result.

---

## §10 — Redeploy after a code change

The repo is already wired. Future updates are automatic:

1. Push a commit to the configured production branch.
2. Cloudflare auto-deploys within ~ 60-90 seconds.
3. Watch the deploy at: Workers & Pages → your project → Deployments.
4. Once green, the change is live at `pryzm.so` + the `.pages.dev` URL.

For PR previews: any push to a non-production branch creates a preview deploy at a unique `*.<project>.pages.dev` URL. Useful for reviewing copy changes before merging.

---

## §11 — Cost expectations

Cloudflare Pages **free tier** covers:

- 500 builds per month (we'll consume ~ 30-50 with normal commit cadence)
- Unlimited bandwidth on the static output
- Unlimited preview deploys
- 1 concurrent build at a time (sequential — fine for our cadence)

Paid tier ($20/mo) adds:

- 5,000 builds/mo
- 5 concurrent builds
- Build minutes ramp

**Decision**: stay on free until the marketplace launches and we want preview deploys per PR for plugin authors. The editor app (when it eventually deploys) is a separate Pages project with its own quota.

---

## §12 — Cross-references

- **Astro project**: [apps/docs-site/](../../../apps/docs-site/) · [astro.config.mjs](../../../apps/docs-site/astro.config.mjs)
- **Pricing page generator**: [packages/entitlements/](../../../packages/entitlements/) — auto-generates the pricing table
- **Pages source**:
  - [apps/docs-site/src/pages/pricing.astro](../../../apps/docs-site/src/pages/pricing.astro)
  - [apps/docs-site/src/pages/manifesto.astro](../../../apps/docs-site/src/pages/manifesto.astro)
  - [apps/docs-site/src/pages/trust.astro](../../../apps/docs-site/src/pages/trust.astro)
- **Brand voice source**: [docs/01-strategy/manifesto.md](../../01-strategy/manifesto.md) (CANONICAL)
- **Trust contracts**: [C22](../../02-decisions/contracts/C22-PRIVACY-AND-PII-TIER.md) · [C23](../../02-decisions/contracts/C23-PROVENANCE-AND-AI-AUDIT.md) · [C43](../../02-decisions/contracts/C43-ACCESSIBILITY.md) · [C48](../../02-decisions/contracts/C48-BACKUP-AND-DR.md)
- **IP-A5 closure record**: [master-execution-tracker.md §3.0](../../03-execution/plans/master-execution-tracker.md) — the first IP closed under the Agile re-rank

---

## §13 — When this doc must be updated

Update §3 / §4 / §5 / §7 whenever any of these change:

- The build command (e.g. switch to `bun` or `turbo`)
- The output directory (e.g. add `astro` SSR adapter that writes to a different path)
- The required Node version
- The production branch
- The custom domain wiring (e.g. when `pryzm.app` is acquired and made canonical)

Append a one-line entry to §13.x with the date + change reason so the runbook history is preserved.

### §13.1 — Change log

- **2026-06-02** — Doc authored at IP-A5 closure. Initial deploy of `pryzm.so` with pricing + manifesto + trust pages.
- **2026-06-02** — Added `SKIP_DEPENDENCY_INSTALL=true` to §5 env vars + expanded §9.3 troubleshooting after the first deploy hit `ERR_PNPM_OUTDATED_LOCKFILE` despite `NPM_FLAGS=--version`. Discovered that Cloudflare's auto-install ignores `NPM_FLAGS` for pnpm projects and runs `--frozen-lockfile` regardless. The `SKIP_DEPENDENCY_INSTALL` flag is the only way to make our build-command-level `--no-frozen-lockfile` the single source of truth.
