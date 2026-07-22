# Deployment-platform audit — five options, one recommendation

**Report, not a change.** Written 2026-07-23. Nothing in the pipeline, Dockerfile, workflows, or
`fly.toml` was modified to produce this document. It re-verifies the current mechanism against the
actual files, then audits five deployment options against **this** app's realities and the founder's
stated objective, ranks them, and recommends one. **No implementation follows this doc** — migration,
rollback, and any `deploy.ps1` come only after founder sign-off, in a later pass.

**Legend for every load-bearing claim:**
- **[VERIFIED-FROM-CODE]** — read out of this repo today (file + line quoted).
- **[VERIFIED-FROM-WEB]** — external fact confirmed against a cited source on 2026-07-23. Costs and
  free-tier limits are *moving targets*: treat every figure as "as documented, verify at signup."
- **[INFERRED]** — a hypothesis the repo/web cannot fully confirm; called out as such.

Sibling docs: `FLY-DEPLOY-WITHOUT-GIT-OPEN.md` (the credential-coupling study this builds on) and
`../DEPLOYMENT-RUNBOOK.md` (the normal happy path).

---

## 0. The founder's objective (the yardstick every option is measured against)

> Unlimited production deployments with the **least operational overhead**. Keep Git for version
> control. Do **not** require GitHub Desktop / any Git GUI to be open. **Prefer** not to depend on
> GitHub Actions. Minimise/eliminate recurring hosting cost **if realistically possible**. Preserve
> existing app behaviour.

Note the priority ordering as written: *least ops overhead* is first and hard; *no Git GUI* is hard;
*no Actions* is a preference; *minimise cost* is conditional ("if realistically possible"). The
recommendation weights them in that order.

---

## 1. Re-verified: how a deploy actually works today

Source files read today: `.github/workflows/deploy-fly.yml`, `fly.toml`, `Dockerfile`,
`.dockerignore`, `package.json`, `git config`.

### 1.1 Trigger — push-to-deploy + manual dispatch  [VERIFIED-FROM-CODE]
`.github/workflows/deploy-fly.yml` lines 19–35:
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      bypass_ci_gate: { type: boolean, default: false }
```
So the everyday deploy action is **`git push origin main`**. `workflow_dispatch` is the emergency
lever and the only way to set `bypass_ci_gate`. Confirms the prior runbook.

### 1.2 Gate — `ci-gate` waits on ci.yml's conclusion for the exact SHA  [VERIFIED-FROM-CODE]
Lines 99–251. A cheap job polls the GitHub API for `ci.yml`'s result on `${{ github.sha }}` and
requires `lint isolation command-manager test-server test-unit test-root apex-gates` to be green
(line 149). Doc-only commits (`docs/`, `.claude/`, `*.md`) are re-derived from the diff and passed
(lines 227–244). It deliberately does **not** wait on CI's own `build` because the deploy re-runs an
identical build (lines 133–148).

### 1.3 Build + deploy — on GitHub's 16 GB runner, `--local-only`  [VERIFIED-FROM-CODE]
Lines 253–399. The `deploy` job runs on `ubuntu-latest`, installs flyctl from the GitHub release CDN
(lines 283–301, done this way because Fly's install endpoint 503'd), then (lines 373–382):
```bash
flyctl deploy --local-only \
  --build-arg LOWMEM=0 \
  --build-arg VITE_CESIUM_TOKEN="$CESIUM_TOKEN_CLEAN" \
  --build-arg VITE_GOOGLE_MAPS_KEY="$GOOGLE_KEY_CLEAN" \
  --build-arg VITE_GLB_URL="$GLB_URL_CLEAN" \
  --build-arg VITE_CONTEXT_TILES_URL="$TILES_URL_CLEAN" \
  --strategy=rolling \
  --wait-timeout=5m
```
Retried up to 3× (lines 373–395) for the health-check race. Authorised by
`env: FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}` (line 399). `--local-only` means the image is
built by **the runner's** Docker daemon (16 GB) and pushed to Fly's registry — no developer machine
builds anything.

### 1.4 Two corrections to the prior runbook / memory notes

**(a) The deploy strategy the workflow uses is `rolling`, NOT the `bluegreen` in `fly.toml`.**
[VERIFIED-FROM-CODE] `fly.toml` lines 67–68 declare `[deploy] strategy = "bluegreen"` with a long
justification (zero-downtime, avoids the `migrations_in_progress` 503). But the workflow passes
`--strategy=rolling` on the CLI (line 381), and **the CLI flag overrides `fly.toml`.** So production
deploys today are *rolling*, and the elaborate blue-green block is effectively dead config. This
matters for the recommendation: a plain `flyctl deploy` **without** `--strategy` would start honouring
the `fly.toml` blue-green strategy — arguably an *upgrade* (true zero-downtime), not a regression.
Flag for founder confirmation.

**(b) The "managed builder OOM-kills this build (exit 137)" claim is a CODE COMMENT, not a
reproduction — and it is internally contradicted.** [VERIFIED-FROM-CODE that the claim exists;
INFERRED that it still holds] The claim appears in `Dockerfile` lines 30–31 and `deploy-fly.yml`
lines 6–9. But `Dockerfile` line 86 says the opposite about the mechanism actually chosen: *"which is
why this deploy uses a **Depot builder (16GB)** rather than Fly's 8GB legacy remote builder."* The OOM
was against Fly's **legacy 8 GB** remote builder; a **16 GB Depot / larger remote builder** is exactly
the size the 16 GB runner provides and has never been shown to OOM. **This is load-bearing for Options
A/B** and deserves a one-off spike, not restatement as settled fact.

### 1.5 The build is the constraint  [VERIFIED-FROM-CODE]
- `package.json#scripts.build:docker`: `node scripts/check/check-project-isolation.mjs && node
  --max-old-space-size=6144 node_modules/vite/bin/vite.js build && node
  scripts/build/write-prod-shim.mjs` — the image uses `build:docker` (Dockerfile line 124), which
  omits the whole-repo `tsc` that the CI `build` runs.
- `Dockerfile` line 39: `NODE_OPTIONS="--max-old-space-size=6144"`; line 38 comment: "peaks ~5.5 GB
  heap on Vite chunking". Header: ~3624 modules. **A builder with < ~8 GB RAM is at risk.**
- Base image `node:20-bookworm-slim` (Dockerfile lines 23, 132) — multi-arch, so it runs on ARM as
  well as x86 (relevant to Option D / Oracle ARM).
- Runtime does **not** run precompiled JS: `dist/index.cjs` re-spawns `server.js` under `--import tsx`,
  transpiling ~100 workspace packages **on every cold boot** (`fly.toml` lines 168–179). This is why
  the machine is 512 MB and why cold-boot health races exist — it follows the app wherever it runs.

### 1.6 The runtime shape  [VERIFIED-FROM-CODE]
- **Persistent Express + Socket.io monolith**, single process group (`fly.toml` lines 98–100). Not a
  request/response function.
- **Long-lived websockets**: Socket.io rooms + Yjs CRDT collaboration (`fly.toml` lines 41–42, 196).
- **External managed Postgres = Supabase** in `eu-central-1`; **no Fly Postgres, no Fly volume**
  (`fly.toml` lines 5–6, 191–198). The DB dependency travels with `DATABASE_URL`; it is *not* coupled
  to the hosting platform, which widens the options.
- **Always-on**: `auto_stop_machines = "stop"` + `min_machines_running = 1` (`fly.toml` lines 95–97)
  — production posture is "never cold-start on a user request".
- **Migrations run on boot** (`server/dbMigrate.js`, per CLAUDE.md), gated by `/api/health/ready`.
- **Secrets required**: `SESSION_SECRET`, `DATABASE_URL`, `CF_WORKER_URL` (or `ANTHROPIC_API_KEY`),
  `PRYZM_OWNER_EMAIL/PASSWORD`, plus Supabase keys; **build-time** `VITE_*` args are *inlined by Vite*
  and must be present **on the build**, not as runtime secrets (`Dockerfile` lines 96–123).

### 1.7 The Git-open coupling  [VERIFIED-FROM-CODE]
`origin = https://github.com/MarkHanoi/Product_Rediness_08.git` (HTTPS); `credential.helper = manager`
(Git Credential Manager). A deploy needs GCM to serve the GitHub PAT for the push. This is the subject
of the sibling runbook and is orthogonal to the platform choice below — every option must state how it
authenticates a deploy **without an app open**.

---

## 2. The lens: what this app's realities do to each option

Four realities decide almost everything:

1. **Persistent server + long-lived websockets (Socket.io + Yjs).** Any platform that **sleeps idle
   containers** or **caps websocket/request duration** will drop live-collaboration sessions. This is
   a hard filter, not a nuance.
2. **~6 GB-heap, 3624-module build.** Any build environment under ~8 GB RAM risks exit-137. This kills
   "build on the box" for small free tiers and makes "build where the RAM is" the central design
   question.
3. **Postgres is already external (Supabase).** The hosting platform does **not** need to provide a
   database, so a bare VM or a container host is sufficient; we are only moving the *compute*.
4. **Solo founder on Windows, wants unlimited deploys + minimal ops.** Ops burden (TLS, process
   supervision, OS patching, rollback machinery, capacity firefighting) is a real, recurring cost that
   competes directly with a few dollars a month of managed hosting.

---

## 3. The five options

### Option A — Keep Fly + Git; drop GitHub Actions; deploy directly via `flyctl` from the box/agent
Store a **Fly deploy token** on the founder's machine (or in the agent's env) and run `flyctl deploy`
directly. Three build sub-variants:
- **A-remote/Depot** (`flyctl deploy --remote-only` or `--depot`): build on Fly's/Depot's remote
  builder — **no local Docker, no 6 GB local build, no image upload**. Viability hinges on §1.4(b): a
  16 GB remote/Depot builder should have the RAM the *legacy 8 GB* one lacked. **Spike-gated.**
- **A-local** (`flyctl deploy --local-only`): the exact command the runner uses, so it *definitely*
  builds memory-wise, but needs **Docker Desktop on Windows + a ~6 GB local build + a ~1 GB image push
  over the founder's uplink** (memory records one aborted upload).
- Either way: **no GitHub Actions** (kills the Actions-billing failure mode), **no Git GUI** (deploy is
  `flyctl deploy`, not `git push`), keeps every proven Fly property — blue-green/rolling, health
  checks, Supabase wiring, always-on machine, one-command rollback via `fly releases`.
- **Persistent-server/WS/Postgres:** ✅ fully preserved — this *is* the current runtime, unchanged.

### Option B — Keep Fly; build the image locally; push to a registry; `flyctl deploy --image`
Build with local Docker, push the finished image to a registry (Fly's, GHCR, etc.), then
`flyctl deploy --image <ref>` so Fly does **not** rebuild. Removes remote-build risk, but **keeps the
whole local-build cost of A-local** (Docker Desktop + 6 GB build + push a ~1 GB image), and adds
registry lifecycle to manage. Its only edge over A-local is decoupling "build" from "deploy" — of
marginal value for a solo founder deploying one app. **Persistent-server/WS/Postgres:** ✅ preserved.

### Option C — Keep Git; replace Fly with Google Cloud Run; deploy with `gcloud`; no Actions
Cloud Run is a **request/response, scale-to-zero** platform, and that fights all four realities:
- **Websockets are billed and capped.** [VERIFIED-FROM-WEB] An instance with **any** open websocket is
  "active" and billed for CPU the whole time, *and* Cloud Run's **request timeout maxes at 60 minutes**
  — every Socket.io/Yjs connection is force-closed at ≤60 min and must reconnect. Live collaboration
  becomes a reconnect treadmill.
- **Always-on costs money anyway.** To avoid cold-starting the persistent server you must set
  `min-instances ≥ 1`, which is billed continuously — you pay for an always-on box *and* inherit the
  60-min websocket cap. Scale-to-zero (the "free" mode) cold-starts the tsx boot on every request.
- Postgres stays Supabase (fine), build moves to Cloud Build / local. **Net: you take on Cloud Run's
  websocket pathology to end up paying for always-on anyway.** Poor structural fit.

### Option D — Keep Git; Oracle Cloud **Always Free** ARM VM; Docker Compose/systemd; deploy over SSH
A genuinely-free, **always-on** ARM VM you own end to end.
- **Cost: $0** on the Always-Free A1 tier. [VERIFIED-FROM-WEB] **As of June 2026 the free A1 allowance
  was reduced to 2 OCPU / 12 GB** for free accounts (was 4 OCPU / 24 GB; PAYG-upgraded accounts may
  still get 4/24 at $0). Even 2 OCPU / **12 GB** comfortably **builds the 6 GB-heap image AND runs the
  512 MB server on the same box** — the build constraint dissolves.
- **Persistent-server/WS/Postgres:** ✅ no sleep, no websocket cap, always-on; Supabase stays as the DB.
- **Deploy shape:** `ssh box 'cd repo && git pull && docker compose up -d --build'` (or push a
  prebuilt image). No Actions, no Git GUI, unlimited deploys.
- **The cost is operational, and it is real.** You become the platform: TLS termination + auto-renew
  (Caddy/nginx + Let's Encrypt), a reverse proxy, process supervision (systemd/Compose restart),
  OS patching, log rotation, **and there is no managed rollback or zero-downtime** — a bad
  `docker compose up` is a self-inflicted outage until you roll the image back by hand.
- **Two documented risks.** [VERIFIED-FROM-WEB] (i) Oracle **reclaims Always-Free instances idle
  <10 % CPU over a rolling 7-day window** — mitigated with a trivial keep-alive cron, but it is a
  footgun. (ii) A1 capacity is frequently "Out of Capacity" at create time, and Oracle Free accounts
  have a reputation for abrupt suspension — a business-continuity risk for a live product.

### Option E — Another free container platform (Railway / Render / Koyeb / …)
[VERIFIED-FROM-WEB, 2026-07-23]
- **Render (free web service): DISQUALIFIED for this app.** Free services **spin down after 15 min of
  inactivity** and cold-start ~1 min on the next request → kills the persistent server, drops every
  websocket, breaks collaboration. Also 750 instance-hours/mo then suspended. Paid tier ~$7/mo removes
  the sleep but is then just a pricier Fly.
- **Koyeb (free): DISQUALIFIED.** One free service at 0.1 vCPU / 512 MB **scales to zero on idle** →
  same cold-start break; 0.1 vCPU is also too weak for the tsx-boot + Vite runtime.
- **Railway: viable but paid.** No free tier — one-time trial credit, then **~$5/mo Hobby (usage
  included)**; services **stay up 24/7, no cold starts**, websockets fine, git-push deploys, no Actions,
  no Git GUI. It is essentially "Fly-equivalent at a similar small monthly," with less battle-testing
  *for this specific app* than the Fly setup that already works. Build must fit its builder's
  memory/minute limits (unverified for a 6 GB-heap build — **risk**).

---

## 4. Comparison matrix

Costs/limits are **as documented on 2026-07-23, verify at signup** (moving targets). "Breaks
persistent-server/WS/Postgres?" is the hard filter from §2.

| Criterion | **A — Fly + flyctl (no Actions)** | **B — Fly, prebuilt image** | **C — Cloud Run** | **D — Oracle Always-Free VM** | **E — Railway** *(best of E)* |
|---|---|---|---|---|---|
| **Est. monthly cost** | ~$4–8 Fly compute (no longer $0 — see note) | ~$4–8 Fly + registry egress | Pay for `min-instances≥1` always-on (variable) | **$0** (Always-Free A1) | **~$5/mo** min (no free tier) |
| **Free-tier reality** | Fly free tier **dead** for new signups; only grandfathered Legacy Hobby orgs still $0 | same as A | 2M req/mo free but scale-to-zero cold-starts the persistent server | 2 OCPU/12 GB **always free** (was 4/24, cut Jun 2026); idle-reclaim <10 % CPU/7d | trial credit only, then paid |
| **Manual setup steps** | **Low** (store Fly token; optional spike on remote builder) | Medium (local Docker + registry + token) | **High** (GCP project, Cloud Build, IAM, domain, min-instances) | **Highest** (provision VM, TLS/proxy, systemd/Compose, hardening, keep-alive) | Low–Med (connect repo, set env) |
| **Ease of future deploys** | **One command** `flyctl deploy` | Two steps (build→push, deploy) | `gcloud run deploy` (+ build) | `ssh … git pull && compose up` | git push / `railway up` |
| **Reliability** | **High** (proven, managed, health checks) | High | High infra, **wrong model for WS** | **Single self-managed VM** — you own uptime | High infra, unproven for this build |
| **Rollback support** | **Built-in** `fly releases` / redeploy prior image | Built-in (redeploy prior image tag) | Revisions + traffic split (good) | **None managed** — manual image roll-back | Built-in redeploy of prior deploy |
| **CI/CD complexity** | **Minimal** (no pipeline) | Low | Medium | Low–Med (a shell script) | Low (platform-native) |
| **GitHub Actions required?** | **No** | **No** | **No** | **No** | **No** |
| **Git GUI required?** | **No** (flyctl token) | **No** | **No** | **No** (SSH key) | **No** (PAT/connect once) |
| **`git push` required to deploy?** | **No** (decoupled from deploy) | No | No | No (push optional; deploy is SSH) | Yes (push-to-deploy) or `railway up` |
| **Build memory need met?** | A-remote/Depot 16 GB ✅ (spike); A-local ✅ but needs Docker Desktop | ✅ local (Docker Desktop) | ✅ Cloud Build (configurable) | ✅ **12 GB VM builds it in place** | ⚠ unverified vs 6 GB heap |
| **Breaks persistent-server / WS / Postgres?** | **No** ✅ | **No** ✅ | **YES** — WS billed + 60-min cap; scale-to-zero cold-starts | **No** ✅ | **No** ✅ |
| **Long-term maintainability** | **High** — smallest delta from proven system | Medium (registry lifecycle) | Medium — fights the app model forever | **Low–Med** — perpetual self-managed ops | Medium — platform lock-in, small cost |
| **Risks** | remote-builder OOM *if* spike fails → fall back to A-local upload | slow ~1 GB uploads; registry drift | WS reconnect treadmill; pay for always-on anyway | Oracle capacity/suspension; no managed rollback; ARM edge-cases | build-memory unknown; recurring cost with no Fly-parity benefit |

**Fly-cost note** [VERIFIED-FROM-WEB]: Fly's legacy free allowance is **discontinued for new signups**;
only orgs grandfathered on the deprecated **Legacy Hobby** plan keep the 3 free shared-cpu-1x machines
+ 3 GB storage. `fly.toml`'s "$0 on free tier" comments (lines 91–94, 166–167) are therefore true
**only if this org is grandfathered** — otherwise this app already costs ~$4–8/mo (1× shared-cpu-1x
512 MB always-on + the transient 2nd machine during a bounce + egress). **This is Open Question #2.**

---

## 5. Ranking, best → worst (for THIS app + THIS founder)

**1st — Option A (Fly + direct `flyctl`, no Actions).** Smallest possible delta from a system that
already works. Preserves every persistent-server/WS/Postgres/rollback property *for free* because it
*is* the current runtime. Removes both pain points at once — the Git-GUI coupling (deploy becomes
`flyctl deploy`, not a credentialed push) **and** GitHub Actions (killing the recurring Actions-billing
outages). Lowest setup, lowest CI/CD complexity, highest maintainability. Its one open risk
(remote-builder OOM) is spike-testable in an hour and has a known fallback (A-local).

**2nd — Option D (Oracle Always-Free VM).** The only truly-$0, always-on option, and the 12 GB VM
erases the build constraint by building in place. It genuinely delivers "unlimited free deploys." It
ranks below A purely on the founder's #1 stated priority — *least operational overhead* — which it
inverts: you inherit TLS, supervision, patching, keep-alive, **no managed rollback, no zero-downtime**,
and Oracle's capacity/suspension risk against a live product. Excellent *escape hatch* if Fly's cost
ever becomes the deciding factor.

**3rd — Option E / Railway.** Structurally sound (always-on, websockets fine, no GUI, no Actions) but
it is "another Fly at ~$5/mo" — it neither saves money over Fly nor is proven against this exact 6 GB
build, so it earns a migration cost with no compensating win. A reasonable *plan B to A*, not a reason
to move.

**4th — Option B (Fly, prebuilt image).** Same Fly benefits as A but strictly more work per deploy
(build→push→deploy) and it keeps the heavy local build + slow image upload that A-remote avoids
entirely. Only pulls ahead of A **if** the remote-builder spike fails *and* local uploads prove more
reliable than a local `--local-only` build — a narrow, contingent niche.

**5th — Option C (Cloud Run).** Last on the merits, not by prejudice: a scale-to-zero request/response
platform is the wrong shape for a persistent Socket.io + Yjs server. The **60-min websocket cap** and
**billed-while-connected** behaviour mean you both degrade collaboration *and* pay for `min-instances`
always-on. It solves a problem this app doesn't have and creates ones it can't tolerate.

---

## 6. Recommendation — **Option A: direct `flyctl deploy` with a stored Fly token; prefer a remote/Depot builder**

**Why A, specifically for this project:**
- **It changes the least.** The runtime, health checks, blue-green config, Supabase wiring, secrets,
  and rollback are all already correct and proven on Fly. A only swaps the *trigger* (a credentialed
  `git push` → `flyctl deploy` from the box/agent) and *deletes the Actions layer*. Nothing about the
  persistent server, websockets, or Postgres is touched — so there is near-zero regression surface.
- **It removes both founder pain points in one move.** No Git GUI (deploy is a CLI call authed by a
  Fly deploy token in the OS/agent env, not a GitHub credential) **and** no GitHub Actions (so the
  ~3-second zero-step Actions-billing failures simply cannot happen).
- **Unlimited deploys, one command.** `flyctl deploy` as often as you like; Fly bills compute, not
  deploys.
- **Rollback and zero-downtime come for free.** Fly keeps prior release images (`fly releases`), so
  rollback is one command. And dropping the workflow's `--strategy=rolling` lets deploys honour
  `fly.toml`'s **blue-green** strategy — an *upgrade* to true zero-downtime (pending Open Question #4).
- **The build constraint is answered without a heavy local build** *if* the remote/Depot builder has
  16 GB (the size the Dockerfile itself says it uses). This must be **spike-verified**, not assumed —
  and it has a clean fallback (A-local with Docker Desktop) that is exactly today's command.

**Why not D despite its $0:** the founder's first-stated objective is *least operational overhead*;
D maximises it (self-managed TLS/supervision/patching, no managed rollback, Oracle suspension risk).
Trading proven managed hosting for ~$5/mo of savings inverts the founder's own priority order. Keep D
documented as the cost-driven escape hatch.

**The recommendation is therefore two-phase and spike-gated:**
1. **Spike (timeboxed, ~1 hr):** from the founder's box, `flyctl deploy --remote-only` (and, if it
   OOMs, `--depot`) with a Fly deploy token. If either produces a healthy release → adopt
   **A-remote**. If both OOM → adopt **A-local** (Docker Desktop + the current `--local-only` command).
2. **Adopt** the winning variant as the single deploy path; retire `deploy-fly.yml` (or reduce it to a
   `workflow_dispatch`-only emergency lever) **only after** the local path is proven.

---

## 7. Sketched shapes (NOT built — for founder judgement only)

### 7.1 The eventual `deploy.ps1` (Option A)
```powershell
# deploy.ps1 — SKETCH ONLY, do not run. One command, no Actions, no Git GUI.
#requires -Version 7
$ErrorActionPreference = 'Stop'

# Fly deploy token lives in the OS/user env (or a DPAPI-protected file), NOT in the repo.
if (-not $env:FLY_API_TOKEN) { throw "FLY_API_TOKEN not set — see runbook §7.3" }

# Optional: commit + push for version history (deploy does NOT depend on the push succeeding).
git add -A
git commit -m $args[0]        # push is for provenance; the deploy is the flyctl call below

# Build args are the SAME public VITE_* values the workflow passes (§1.3). Inlined by Vite.
flyctl deploy `
  --remote-only `                        # ← A-remote; swap to --local-only if the spike failed
  --build-arg LOWMEM=0 `
  --build-arg VITE_GLB_URL=$env:VITE_GLB_URL `
  --build-arg VITE_CONTEXT_TILES_URL=$env:VITE_CONTEXT_TILES_URL `
  --wait-timeout=5m                      # no --strategy → honours fly.toml bluegreen (§1.4a)

# Verify (matches DEPLOYMENT-RUNBOOK.md):
Invoke-RestMethod https://pryzm.fly.dev/api/health/ready   # expect { ok = True }
```

### 7.2 Migration shape (what "adopt A" actually entails)
- **Create a Fly deploy token:** `flyctl tokens create deploy` → store as a user env var (or DPAPI file
  the agent can read). *Scoped to deploy — not the account token.*
- **Confirm the VITE_* build args** currently sourced from GitHub repo variables are captured somewhere
  the local deploy can read (env vars / a `.env.deploy` that is `.gitignore`d). Getting these wrong
  fails **silently** (Dockerfile lines 327–331) — the build goes green and the app requests old paths.
- **Neutralise the Actions trigger last:** change `deploy-fly.yml` `on:` to `workflow_dispatch`-only
  (keep it as an emergency remote lever) — do **not** delete it until the local path has shipped a real
  release. Nothing else in `fly.toml`/`Dockerfile` changes.
- **DB migrations are unaffected:** they run on server boot via `server/dbMigrate.js`, gated by the
  health check — independent of which machine triggers the deploy.

### 7.3 Rollback shape
- **Managed, one command:** `flyctl releases` to list, then `flyctl deploy --image <prior-release-ref>`
  (or `fly releases` rollback) to redeploy the previous known-good image — no rebuild, ~seconds.
- **Blue-green safety net:** with `fly.toml`'s bluegreen strategy honoured, a bad boot never takes
  traffic — Fly keeps the old machine serving until the green one is health-passing, so a failed
  rollout is self-healing rather than an outage.

*(For contrast, Option D's rollback would be manual: `docker compose down && docker run <prior-tag>`,
with a self-managed outage window — one of the reasons it ranks 2nd, not 1st.)*

---

## 8. Open questions — need founder confirmation before implementing

1. **Does the remote/Depot builder actually build this today?** The whole A-remote vs A-local fork
   depends on it. *Exact ask:* "May I run a one-off `flyctl deploy --remote-only` (then `--depot`) from
   your machine to see if the 16 GB remote builder succeeds, before we commit to a path?" (Spike only —
   it deploys the current HEAD; harmless.)
2. **Is the Fly org grandfathered on Legacy Hobby (still $0), or already billing?** This sets the real
   cost of staying on Fly and how hard the "minimise cost" lever should push toward Option D. *Ask:*
   "What does `flyctl orgs list` / the Fly billing dashboard show — a plan name and a current monthly
   charge?"
3. **Which app is 'Git', and who triggers deploys — you or the agent?** (Carried from the sibling
   runbook.) Decides whether the Fly token lives in your user env or the agent's shell.
4. **Do you want to adopt `fly.toml`'s blue-green (true zero-downtime), or keep rolling?** Dropping
   `--strategy=rolling` switches to blue-green automatically. Zero-downtime matters most if you deploy
   during active user sessions.
5. **Actions-billing status.** Are you currently hitting the Actions cap (the ~3-second zero-step
   failures)? If yes, that raises the urgency of moving off Actions and strengthens A over "just fix
   the credential and keep push-to-deploy."
6. **Budget tolerance & ops appetite.** Is ~$5/mo of managed hosting acceptable to keep zero ops, or is
   $0 important enough to take on Option D's self-managed VM (TLS, supervision, no managed rollback,
   Oracle capacity risk)? This is the single question that could flip the recommendation from A to D.

---

## 9. Sources for the moving-target figures (verify at signup)
- Fly free-tier discontinued / current pricing: fly.io/docs/about/pricing, community.fly.io "Free tier
  is dead?", expresstech.io "7 Fly.io Alternatives 2026", withorb.com Fly.io pricing 2025.
- Oracle Always-Free A1 (2 OCPU/12 GB as of Jun 2026; idle-reclaim <10 % CPU/7d): Oracle docs
  "Always Free Resources", servethehome.com, medium.com Always-Free VPS guide.
- Cloud Run websockets billed + 60-min request cap: cloud.google.com/run/docs/triggering/websockets,
  /run/docs/configuring/request-timeout, github.com/ahmetb/cloud-run-faq.
- Render 15-min spin-down + 750 hrs; Railway no free tier ~$5/mo no cold start; Koyeb free scale-to-zero
  0.1 vCPU/512 MB: render.com "real free tier 2026", encore.dev Render-vs-Railway, agentdeals.dev.

*(All external figures [VERIFIED-FROM-WEB] on 2026-07-23; all repo claims [VERIFIED-FROM-CODE] against
the files named in §1. The remote-builder-OOM outcome is [INFERRED] until the §8.1 spike runs.)*

---

Awaiting founder approval before any implementation.
