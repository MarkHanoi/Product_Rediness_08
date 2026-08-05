# Deployment Pipeline, Explained — 2026-08-05

**What this is:** a plain-language, step-by-step walkthrough of how a code change in this repo
actually becomes a running change at `https://pryzm.fly.dev`. Written for the founder, not for an
engineer joining the team. Every claim below is grounded in a specific file and line in this repo
(quoted or cited) — nothing here is a generic description of "how CI/CD usually works."

**Files this doc is based on** (read in full to write this):
- `.github/workflows/deploy-fly.yml` (783 lines — the deploy workflow itself)
- `.github/workflows/ci.yml` (the separate CI workflow the deploy gate checks)
- `Dockerfile` (what actually gets built and run)
- `fly.toml` (how Fly.io runs the built image)
- `server.js` (the `/version`, `/api/health/live`, `/api/health/ready` routes)
- `docs/04-reference/runbooks/DEPLOYMENT-RUNBOOK.md` and
  `docs/04-reference/runbooks/FLY-DEPLOY-WITHOUT-GIT-OPEN.md` (prior investigations, cross-checked
  against the live YAML rather than trusted blindly)

---

## The walkthrough, start to finish

### 1. You push code to `main` (or click "Run workflow")

`deploy-fly.yml` has two triggers, both currently active (`.github/workflows/deploy-fly.yml:19-45`):

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch:
    inputs:
      bypass_ci_gate:
        type: boolean
        default: false
```

- **`push: branches: [main]`** — the normal path. Any commit pushed straight to `main` starts a
  deploy run automatically. This is labelled `§OPTION-B (2026-08-05)` in the file's own comments
  and explicitly says it **restores** push-to-deploy after a period (`§OPTION-A`, 2026-07-23) where
  it had been disabled because of GitHub Actions billing failures, not because push-deploy itself
  was unsafe (lines 20-31).
- **`workflow_dispatch`** — the manual "Run workflow" button in the GitHub Actions UI, or the
  equivalent REST API call (see §6 below). It has exactly one input, `bypass_ci_gate` (a checkbox,
  default off). This is the *only* way to skip the CI gate described in step 2.

**Only one deploy runs at a time.** `concurrency: group: deploy-fly, cancel-in-progress: true`
(lines 49-61) means a newer push cancels an older, still-running deploy. This is deliberate: every
commit on `main` is cumulative, so the newest one already contains everything the cancelled one
had — you always end up testing HEAD, never a stale, "several commits behind" build. A run that
shows **"cancelled"** in the Actions UI is not a failure to chase down; it just means a newer push
overtook it.

### 2. The `ci-gate` job asks "did CI already pass for this exact commit?"

This is the first of exactly **two jobs** in this workflow (`deploy-fly.yml:109-419`) — there is no
hidden third job.

`ci-gate` (`deploy-fly.yml:109-261`) does **not** run lint/tests/build itself. It calls the GitHub
API and asks what the *separate* `ci.yml` workflow concluded for this same commit SHA, then either
lets the deploy proceed or blocks it. Concretely, it polls
`repos/<repo>/actions/workflows/ci.yml/runs?head_sha=<SHA>` every 30 seconds, up to 60 times (30
minutes), and checks the **conclusion of these specific `ci.yml` jobs** (matched by name prefix,
`deploy-fly.yml:159, 203-212`):

| Required job (as named in `ci.yml`) | What it checks |
|---|---|
| `Lint` | `eslint` across the repo |
| `Isolation gates` | project/storage isolation static checks (`npm run check:isolation`) |
| `Command-manager gate` | CI guard for no legacy `commandManager.execute()` call sites |
| `Server tests` | `vitest` — `server/__tests__/**` (Express/permissions, Node env) |
| `Unit tests — editor` | the editor app's unit test suite |
| `Unit tests — root` | root-level unit tests |
| `Apex/app contract gates` | the apex/app split contract checks (C51) |

"Green" means each of these jobs is `status=completed` **and** `conclusion=success` (or
`skipped`, which also counts as passing). If any one of them is `completed` with a conclusion other
than `success`/`skipped`, the gate fails immediately with an explicit error naming which job is red
(`deploy-fly.yml:222-227`). If the gate is still waiting on jobs after the full 30-minute poll, it
**fails** rather than giving up quietly — the comments call this out explicitly: *"we got bored
waiting" would reintroduce exactly the fail-open this item exists to close* (lines 256-261).

**Deliberately excluded from the gate** (`deploy-fly.yml:161-168`), and why:
- `build` — `ci.yml`'s own build job is skipped because the deploy job is about to build the exact
  same tree with the exact same command anyway; waiting for it first would roughly triple the
  push-to-production time (≈15 min → ≈45 min) for no extra safety, since a broken build fails the
  deploy job on its own, loudly.
- `docker-image` — only runs on pull requests in `ci.yml`, never on a push to `main`.
- `a11y` and `ga-gate` — both are marked `continue-on-error: true` in `ci.yml`, so they can never
  turn the overall CI run red even if they fail. This gate does not silently upgrade that — it's
  described as a known, documented gap (tagged `L-542` in the comments), not something this gate
  quietly fixes.
- `test-pryzm1` — also `continue-on-error`, and the comment notes it is "landed RED" currently
  (`L-544`), i.e. it's known-broken and advisory only.

**The doc-only-commit case.** If `ci.yml` never ran at all for this SHA (its own trigger
path-ignores `docs/**`, `**/*.md`, `.claude/**`), the gate does not assume that's fine — it
re-derives it independently by running `git diff --name-only HEAD^ HEAD` and checking whether every
changed file matches those same ignore patterns (`deploy-fly.yml:238-253`). Only if that
re-derivation confirms "genuinely doc-only" does it pass. If a commit that touched real code has no
CI run at all, that is treated as **a broken trigger, not a green light**, and the gate fails
closed.

#### What `bypass_ci_gate` does and does not skip

Reading `deploy-fly.yml:131-139` directly:

```bash
if [ "${BYPASS:-false}" = "true" ]; then
  echo "::warning::§L-540-CI-GATE BYPASSED by explicit workflow_dispatch input."
  echo "Deploying ${SHA} WITHOUT a green CI. This is recorded in the run inputs."
  exit 0
fi
```

- It is read from `github.event.inputs.bypass_ci_gate`, which **only exists on a manual
  `workflow_dispatch` run** — a plain `git push` has no way to set it, so a push can never silently
  bypass the gate.
- When `true`, the `ci-gate` job exits 0 immediately (green) without ever polling CI at all. It
  prints a `::warning::` annotation that shows up on the run's summary page, and the flag itself is
  permanently visible in that run's recorded inputs — the comments describe this as a deliberate
  design choice: *"an explicit, audited human action... If you find yourself using it routinely,
  the gate is telling you something true"* (lines 37-41).
- **What it does NOT skip:** the actual `deploy` job (the build + `flyctl deploy` + the R2
  bundle-proof check) still runs in full regardless of the bypass. The bypass only ever affects
  whether `ci-gate` demands a green `ci.yml` run first — it changes nothing about the build itself,
  the Fly deploy, its 3 retry attempts, or the post-deploy verification step. In other words: the
  bypass skips *asking permission*, not *doing the work*.

### 3. The `deploy` job builds the image and ships it to Fly

This only starts once `ci-gate` succeeds (`needs: ci-gate`, line 266). It runs on a GitHub-hosted
`ubuntu-latest` runner (16 GB RAM), with a 30-minute cap (line 271), and does, in order:

1. **Check out the code** (shallow, `fetch-depth: 1` — history isn't needed because the build ships
   the working tree as a tarball, not via git).
2. **Install `flyctl`** directly from the GitHub releases CDN rather than through Fly's own
   installer script — the comment explains this was changed because Fly's install endpoint was
   returning sustained 503s and blocking every deploy before the build even started
   (`deploy-fly.yml:293-311`).
3. **Run `flyctl deploy --local-only`** (`deploy-fly.yml:313-418`). This is the actual build+ship
   step. Key facts, straight from the file:
   - `--local-only` means the Docker image is built **on this GitHub runner** (16 GB RAM), not on
     Fly's own managed builder. The header comment (lines 5-9) and the flow's own comments say this
     is because Fly's managed builder **OOM-kills this build at exit 137** (the client is ~3624
     modules, peaks ~5.5–6 GB heap) and that builder's memory can't be resized from the CLI.
   - Several `--build-arg`s are passed: `LOWMEM=0` (full minify, since the runner has the RAM),
     `VITE_CESIUM_TOKEN` / `VITE_GOOGLE_MAPS_KEY` (optional map-tile credentials, from repo
     secrets), `VITE_GLB_URL` / `VITE_CONTEXT_TILES_URL` (public CDN base URLs for furniture models
     and context tiles, from repo *variables*, not secrets — deliberately, so a wrong value is
     visible in the log rather than redacted), and — load-bearing for step 5 below —
     `GIT_SHA`, `GIT_BRANCH`, `BUILT_AT`, `RUN_NUMBER`.
   - It retries **up to 3 times** on failure (`deploy-fly.yml:389-417`), because the health-check
     step of a Fly rolling deploy intermittently times out on a cold boot for reasons unrelated to
     whether the build itself is broken (see `fly.toml` notes on boot time in step 4).
   - Secrets are passed via `env:`, never interpolated directly into the shell command line, and are
     stripped of stray whitespace/newlines before use — the comment cites a real incident
     (`§DEPLOY-SECRET-WHITESPACE`, lines 359-368) where a copy-pasted secret's trailing newline
     silently corrupted the command.
4. **Verify the R2 asset URL actually shipped** (`deploy-fly.yml:454-516`, `§L-570-BUNDLE-PROOF`).
   This is a real, failing check (not just an echo): it fetches the live `index.html` from
   `https://pryzm.fly.dev`, follows it to the JS chunk(s), and greps the actual downloaded bytes for
   the expected asset host. The comment explains why this exists: `VITE_*` variables are inlined by
   Vite at build time, so if the build-arg silently failed to reach the build, **nothing else would
   ever fail** — the deploy would stay green while the live app kept 404ing on old asset paths. This
   step is the only thing standing between "green build" and "actually shipped correctly."

### 4. Fly.io runs the finished container

What actually gets built (`Dockerfile`, two stages):

- **Builder stage** (`Dockerfile:22-129`): installs full dependencies (`pnpm install
  --frozen-lockfile`), runs `pnpm run build:docker` (Vite build + the isolation/lint gates, but
  deliberately **not** the whole-repo `tsc` typecheck — that's a CI-only gate, not something the
  image needs, per lines 79-86), then prunes dev dependencies with `pnpm install --prod`.
- **Runtime stage** (`Dockerfile:132-209`): `node:20-bookworm-slim` + `tini` (for clean signal
  handling on shutdown). Copies over the pruned `node_modules`, the full `packages/`, `apps/`,
  `plugins/`, `tools/` source trees, `server.js` + `server/`, the built `dist/` and `public/`
  assets, and config files (`tsconfig*.json`, `vite.config.ts`).
  - **The container does not run pre-compiled JavaScript.** The entrypoint is
    `CMD ["node", "./dist/index.cjs"]`, and that file (built by
    `scripts/build/write-prod-shim.mjs`) re-spawns `server.js` under `node --import tsx` — i.e.
    `server.js` and all ~100 workspace TypeScript packages it imports are transpiled **live, on
    every cold boot**, via `tsx`. This is explicitly called out as a real cost: `fly.toml` (lines
    168-179) documents that this is why boot can be slow enough to blow past a health-check window
    on a small VM, and flags it as a known, not-yet-fixed architectural debt (tracked as `L-442`).
  - Runs as the non-root `node` user, exposes port `5000`.
  - Docker's own `HEALTHCHECK` hits `/api/health/live` (liveness only, no DB) every 30s.

**Fly.io's config** (`fly.toml`):
- App name `pryzm`, region `fra` (Frankfurt — mandated by data-residency contracts C22/C49, per
  the file's own comments, lines 22-35).
- **Blue-green deploy strategy** (`[deploy] strategy = "bluegreen"`, lines 50-68): boots a *new*
  machine, waits for it to pass its health check, and only then switches traffic and stops the old
  one — chosen specifically to avoid a ~30-90s window of zero healthy instances that caused a real
  incident on 2026-07-06.
- **HTTP-level health check** (`[[http_service.checks]]`, lines 112-155) polls
  `/api/health/live` — **deliberately not** `/api/health/ready` (which does a DB `SELECT 1`).
  The comment (`§L-444`, lines 135-152) explains this was changed on purpose: gating deploys on
  database reachability meant that when Supabase was unreachable, **every deploy failed, including
  a rollback** — exactly when you most need to be able to ship a fix.
- **VM size**: 1 shared CPU, 512 MB RAM (`[[vm]]`, lines 185-189) — sized deliberately to stay
  inside the Fly free tier, with commentary noting a prior "fix" that bumped this to 1024 MB/2 CPU
  was reverted after determining the real problem was unrelated to VM size.
- **No persistent volumes** — the app is stateless at the filesystem layer (DB is Supabase
  Postgres, object storage is Supabase/S3-signed URLs, sessions are JWTs, CRDT docs persist to
  Postgres).
- **Required boot env vars**, per this file's own header comment (lines 8-14) and the project's
  `CLAUDE.md`: `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
  `CF_WORKER_URL`, `PRYZM_OWNER_EMAIL`, `PRYZM_OWNER_PASSWORD` — set once via `flyctl secrets set`,
  not stored in `fly.toml` itself. Optional: Stripe keys, Google/Microsoft OAuth client IDs,
  `PUBLIC_BASE_URL`, `ALLOWED_ORIGIN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `ANTHROPIC_API_KEY` (fallback
  if `CF_WORKER_URL` is unset).

### 5. How to manually trigger a deploy via the API (the pattern used in this session)

This is not a hypothetical — it's the documented, working pattern recorded in this project's own
memory (`fly-production-deploy` memory note) and cross-checked against the workflow's actual
`workflow_dispatch` input shape above. Steps:

1. **Get a token without any extra setup.** Since `gh` (the GitHub CLI) is not installed on this
   machine, the same Personal Access Token that `git push` already uses is pulled straight out of
   the Git credential store:
   ```powershell
   $tok = ("protocol=https`nhost=github.com`n" | git credential fill | ? {$_ -match '^password='}).Substring(9)
   ```
   This works because `git credential fill` is the exact mechanism Git itself calls before an HTTPS
   push — no separate credential needs to be created.
2. **POST a `workflow_dispatch` request**, matching the workflow's actual input schema
   (`deploy-fly.yml:35-45`):
   ```
   POST https://api.github.com/repos/MarkHanoi/Product_Rediness_08/actions/workflows/deploy-fly.yml/dispatches
   Authorization: token <PAT>
   Body: {"ref":"main","inputs":{"bypass_ci_gate":"true"}}
   ```
   (Omit `"inputs"` entirely, or set `bypass_ci_gate` to `"false"`, for a normal gated dispatch —
   the field is a string `"true"`/`"false"` because GitHub's REST API encodes workflow boolean
   inputs as strings.) A successful call returns HTTP 204 with no body. The memory note flags a
   real gotcha here: this endpoint **intermittently returns a 500** ("Failed to run workflow
   dispatch") even though it sometimes still queues a run anyway — the working pattern is to retry
   until a clean 204 comes back, then treat the *last* run created for that SHA as the live one.
3. **Poll for completion.** GitHub does not return a run ID from the dispatch call itself, so the
   next step is to look up the most recent run for this workflow and poll it:
   ```
   GET https://api.github.com/repos/MarkHanoi/Product_Rediness_08/actions/runs/<run_id>
   ```
   repeated until the JSON body shows `"status": "completed"`, then reading `"conclusion"`
   (`"success"`, `"failure"`, or `"cancelled"`). Build + push + rolling-deploy takes roughly 4
   minutes end to end, per the memory note; the workflow's own hard cap on the `deploy` job is 30
   minutes.

### 6. How to verify a deploy actually shipped: `GET /version`

Implemented directly in `server.js` (`server.js:2413-2432`):

```js
app.get('/version', (_req, res) => {
    res.status(200).json({
        git_sha: process.env.GIT_SHA || 'unknown',
        branch: process.env.GIT_BRANCH || 'unknown',
        built_at: process.env.BUILT_AT || 'unknown',
        run_number: process.env.RUN_NUMBER || 'unknown',
        fly_release: process.env.FLY_IMAGE_REF || null,
        environment: process.env.NODE_ENV || 'development',
    });
});
```

No authentication required — it's meant to be safe for monitoring and for the pipeline's own
post-deploy verification. Exactly how each field gets set, traced through the actual mechanism (not
guessed):

| Field | Mechanism | Traced to |
|---|---|---|
| `git_sha` | Baked in at **Docker build time** as a build-arg → `ENV` in the runtime stage. GitHub Actions passes the real value with `--build-arg GIT_SHA="$GITHUB_SHA"`. | `Dockerfile:159-166` (`ARG GIT_SHA=unknown` / `ENV GIT_SHA=${GIT_SHA}`), set by `deploy-fly.yml:398` |
| `branch` | Same mechanism, from `$GITHUB_REF_NAME`. | `Dockerfile:159-166`, `deploy-fly.yml:399` |
| `built_at` | Same mechanism. Computed **inside the deploy job itself** (`BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"`, `deploy-fly.yml:386`) at the moment of the build, not the commit/push timestamp — the workflow comment is explicit that this distinction is intentional. | `Dockerfile:159-166`, `deploy-fly.yml:386,400` |
| `run_number` | Same mechanism, from `$GITHUB_RUN_NUMBER` (GitHub Actions' own incrementing counter for this workflow). | `Dockerfile:159-166`, `deploy-fly.yml:401` |
| `fly_release` | **Not** a build-arg at all — read live from `process.env.FLY_IMAGE_REF`, which Fly.io injects automatically into every running machine's environment at runtime. `null` when running outside Fly (e.g. local dev), since nothing sets it there. | `server.js:2419-2422` (comment), Fly's documented runtime-environment injection |
| `environment` | Plain `process.env.NODE_ENV`, set to `"production"` by `fly.toml`'s `[env]` block. | `fly.toml:73` |

Because `server.js` runs as **live source under `tsx`** rather than a bundled/inlined build
artefact (per the Dockerfile's own comment, `Dockerfile:147-151`), these four provenance values can
be plain runtime `ENV` vars read fresh from `process.env` at request time — unlike the `VITE_*`
client values, they do **not** need to be baked into a compiled bundle. A bare `docker build` (no
`--build-arg`s passed) would report the literal string `"unknown"` for each of `git_sha`/`branch`/
`built_at`/`run_number` — the code is written to never fabricate a value, per the comment at
`Dockerfile:154-158`.

**Practical use:** after triggering a deploy and it reports success, `curl
https://pryzm.fly.dev/version` and confirm `git_sha` matches the commit you expect. This is a
stronger check than "the Actions run went green," because it confirms the *specific bytes running
in production* — a run can go green while deploying a stale or cancelled build in edge cases
(concurrency, rolling-deploy races), and `/version` closes that gap directly against the live
machine rather than trusting the CI log.

### 7. What actually needs a fresh deploy to be visible

Not every change requires (or benefits from) a deploy-and-test cycle. Based on how the build and
runtime actually work:

- **`server.js` / anything under `server/`** — always needs a deploy. The container runs this file
  live via `tsx`; there is no way to see a change without a new image running on Fly (or a local
  `npm run dev`, which per project memory is unreliable — the event loop starves under normal
  local dev load, so prod is the only trustworthy test surface).
- **`apps/editor` and any client-side TypeScript/React code (`packages/*`, `plugins/*`)** — always
  needs a deploy. These are compiled into the `dist/` Vite bundle at Docker build time
  (`Dockerfile:124`, `pnpm run build:docker`); the running container serves whatever was in `dist/`
  at build time, so a source change with no rebuild is invisible in the browser. Also remember: the
  service worker is network-first, so a **hard-refresh** is required after the new bundle ships, or
  the browser keeps serving the old cached one.
- **Docs-only changes (`docs/**`, `**/*.md`, `.claude/**`)** — these don't need a deploy at all to
  be "visible" (there's nothing to see in the running app), and the CI gate itself recognizes this:
  `ci.yml` path-ignores these paths so no CI run is generated, and the deploy's own `ci-gate` job
  re-derives "doc-only" status from the diff and passes automatically (`deploy-fly.yml:238-253`).
  A deploy will still technically run (because `push: branches: [main]` fires unconditionally), but
  it produces no observable change on `pryzm.fly.dev` — there's no reason to tell the founder to
  "go test this" for a docs commit.
- **Fly/Dockerfile config changes (`fly.toml`, `Dockerfile`, `deploy-fly.yml` itself)** — always
  need a deploy, and are the riskiest category: a mistake here can break the *next* deploy or the
  running machine's health checks, not just the feature under test.

---

## Things worth flagging to the founder

1. **The CI gate has a real, working escape hatch that is easy to over-use.** `bypass_ci_gate` is
   audited (visible in run inputs, produces a `::warning::`) but nothing technical stops repeated
   use. The workflow's own comments are unusually blunt about this: *"If you find yourself using it
   routinely, the gate is telling you something true and the answer is to fix the red, not to
   normalise the bypass"* (`deploy-fly.yml:37-41`).

2. **Every deploy rebuilds the client from scratch on a rented 16 GB runner, with no build cache
   across runs beyond Docker layer caching.** The build is described in multiple places as sitting
   right at a memory ceiling (~5.5–6 GB heap on a 16 GB runner) — this is why the pipeline avoids
   Fly's own managed builder entirely (documented OOM at exit 137, unresizable). This is a single
   point of failure in the sense that the *entire* deploy path depends on GitHub-hosted
   `ubuntu-latest` continuing to offer 16 GB / (per `DEPLOYMENT-RUNBOOK.md`) that the repo staying
   **public** is what unlocks the bigger, free runner — a **private** repo gets a smaller (~7 GB),
   metered runner that is documented as being too small for this exact build. That's a nontrivial,
   somewhat fragile coupling between "repo visibility" and "can we deploy at all."

3. **GitHub Actions billing failures look exactly like a red CI gate, but are not.** Per
   `DEPLOYMENT-RUNBOOK.md` §3 and the `github-actions-billing-blocks-deploy` memory note, a stale
   card or exhausted quota makes `ci.yml`'s jobs die in ~3 seconds with zero steps run — which then
   surfaces at the deploy gate as "CI must be green for this SHA," which reads exactly like a real
   test failure unless you know to check Settings → Billing first. This is a real trap for anyone
   not already primed to look there.

4. **The Fly deploy step retries up to 3 times on failure, silently, before the workflow reports
   red** (`deploy-fly.yml:389-417`). This is a known, working mitigation for an intermittent
   health-check race on cold boot (documented at `fly.toml:120-132` and `168-180`) — but it means a
   "green" deploy run may have actually failed twice first. The retry logs are printed in full (not
   collapsed), so the information is there, but it's easy to miss that a run took 2-3x longer than
   expected because of this.

5. **`git_sha`/`branch`/`built_at`/`run_number` on `/version` are honest by construction** — they
   default to the literal string `"unknown"` rather than a guess if the Docker build-args aren't
   passed — but this also means anyone building the image by hand (`docker build` without
   `--build-arg`s) will get an app reporting `"unknown"` everywhere on `/version` even though it's
   otherwise fully functional. That's correct behavior, just worth knowing it's not a bug if it's
   ever seen.

6. **The workflow file itself is very large (783 lines) mostly because of a long trailing history
   of `# deploy-marker: vNN — ...` comment lines** (from line ~518 onward) used as a changelog /
   "what to test" note attached to each deploy. This is a working convention (documented in
   `DEPLOYMENT-RUNBOOK.md` §1: "Add a marker line... Bump vNNN every deploy"), not dead weight to
   clean up — but it does mean the file will keep growing indefinitely unless that convention is
   revisited (e.g. moving markers to a separate changelog file).

7. **One ambiguity I could not fully resolve from the repo alone:** whether the manual REST-dispatch
   pattern in §5 above is the founder's actual current practice, or whether deploys in this session
   were driven by a plain `git push` (which is now also a valid trigger per `§OPTION-B`). Both are
   real, working paths in the current YAML; I documented the REST-dispatch flow because the task
   asked for it and it's fully corroborated by both the workflow's `workflow_dispatch` input schema
   and the project's own memory note, but I did not find a session artifact (e.g. a raw `curl` log)
   proving it was actually invoked during this specific conversation — the memory note describing
   it is dated 2026-07-31, five days before today.
