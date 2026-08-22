# DEPLOY CONTRACT — MANUAL FLY PATH (Actions-outage fallback)

**Status:** ACTIVE · **Established:** 2026-08-06 · **First execution:** v1204 (`c13a11f1`)
**Scope:** deploying `pryzm` to Fly.io **without** GitHub Actions.
**Supersedes nothing.** `.github/workflows/deploy-fly.yml` remains the default path.

> Every claim in this document is traceable to the 2026-08-06 session that produced it.
> Numbers are measured, not estimated, unless explicitly marked. Where something was not
> verified, it says so.

---

> ## ⛔ IF A DEPLOY JUST FAILED, READ §6.8.1 FIRST
>
> Before you retry, before you read a build log, before you believe the last line flyctl printed:
>
> ```bash
> grep -n 'ERROR: process "/bin/sh' "$LOG" | head -3   # => a CODE defect. Do NOT retry.
> grep -c  'Pushing image done'      "$LOG"            # => 1 means the build is BANKED (§6.5.7)
> ```
>
> On 2026-08-20 a **deterministic source defect** ended its run printing §6.5.9's *flaky*
> `npipe:...` error, because flyctl retried after the build had already died. The document's own
> advice at that point — *"retrying is rational"* — would have cost ~5 × 20 min on a defect that
> never succeeds. **A trailing error can be a consequence of the real one.**

---

## 1. WHEN THIS PATH APPLIES

**CI is the default deploy path. This one is for GitHub Actions outages only.**

It was written during the Actions platform outage of 2026-08-06 (incident opened ~15:22 UTC).
The signature: `workflow_dispatch` **succeeded** (HTTP 204), the run appeared, and then sat
`queued` for **34+ minutes** with no runner assigned. GitHub's incident text read *"Workflow
runs are still failing, and jobs may remain queued for an extended period before starting or
may time out. Jobs using GitHub-hosted runners are particularly affected."*

⚠ **Distinguish this from the billing block** ([[github-actions-billing-blocks-deploy]]):
that one killed jobs in **3–4 seconds** having never started. This one leaves them queued
indefinitely. Repo visibility is irrelevant to both — the repo was already public.

### The trade-off, stated honestly

| | CI (`deploy-fly.yml`) | Manual (this contract) |
|---|---|---|
| Wall-clock | ~8 min | **~25 min** (measured: 16 min upload + 4 min build + rollout) |
| Context upload | ~2 s (datacenter) | **~16 min** at ~98 KB/s (domestic uplink) |
| `§L-540-CI-GATE` | enforced | **BYPASSED — must be covered manually** |
| `§L-570-BUNDLE-PROOF` | enforced | **DOES NOT RUN — must be run manually** |

Both bypassed gates are the whole risk of this path. §3 and §5 exist to replace them.

---

## 2. PRECONDITIONS

### 2.1 Builder must be ≥16 GB

The vite build peaks around 6 GB (`--max-old-space-size=6144` in `build:docker`). Fly's
**managed/Depot builder cannot be resized**, which is why it OOM-killed the build at exit 137
and why the 16 GB GitHub runner looked like "the only proven path" for months. It was not a
property of the build — it was an unresized machine.

`--depot=false` forces the **legacy** builder app, which *can* be resized:

```bash
flyctl apps list | grep builder          # → fly-builder-autumn-headland-88
flyctl machines list -a fly-builder-autumn-headland-88   # read the machine id + SIZE column
flyctl machine update <machine-id> -a fly-builder-autumn-headland-88 --vm-memory 16384 --yes
```

Verify — the `SIZE` column must read `…:16384MB`:

```bash
flyctl machines list -a fly-builder-autumn-headland-88
```

Observed 2026-08-06: `08053e9c33dd48` went `shared-cpu-8x:8192MB` → `shared-cpu-8x:16384MB`.
The build then completed **4,542 modules in 1m 41s with no OOM**.

> ⚠ Unverified: whether 16384 is the minimum that works. `6144` is a *ceiling* passed to V8,
> not a measured requirement. The real heap floor has **not** been tested — see §7.

### 2.2 Docker context must be ~130 MB

> ⚠ **STALE — re-measured 2026-08-20: flyctl reports `Build context is 215 MB across 6,169 files`.**
> §6.7 already flagged ~185 MB. The number in this heading has been wrong at every execution
> since it was written; **read flyctl's own warning line, which prints the current figure and
> the largest paths, and do not trust this heading.** (2026-08-20: `public/` 109 MB ·
> `packages/` 36 MB · `tools/` 26 MB · `apps/` 21 MB · `dist-server-deps/` 17 MB.)

It was **2.8 GB across ~6k files** at the start of the session, which is what made every
non-CI path unusable. The bulk was untracked probe artefacts, not source:

| Path | Size | Why excluded |
|---|---|---|
| `tools/cold-start-probe/.cache` | 1.57 GB | untracked cadastre/planning HTTP cache |
| `tools/cordoba-ar-georef/out` | 738 MB | AR georef probe output (3 tracked files) |
| `.vs` | 264 MB | Visual Studio cache for `revit-addin` |
| `tools/*/out` | ~24 MB | per-probe rule-pack research evidence |
| `scratchpad` | 34 MB | one-off probe scripts |

Excluded in commits `841e0862` and `c13a11f1`.

⚠ **`tools/` IS copied into the runtime image** (`Dockerfile` L60 builder, L178 runtime), so
these exclusions were verified safe before being made: a repo-wide grep for
`require|from|readFile|readFileSync|import` against any `tools/` path across `server.js`,
`server/`, `packages/*/src` and `apps/*/src` returned **zero hits**. Every mention is a
provenance comment citing where a measured constant came from.

A follow-up scan for all files >5 MB confirmed nothing further is worth excluding — the
remaining ~130 MB is genuine source. **The uplink is now the only lever**, and the durable
fix is §7.

### 2.3 Working tree committed — and mind the SHA capture

`GIT_SHA` is captured by `git rev-parse HEAD` **at script start**. Commits made while the
deploy runs are **not** in the image.

Observed 2026-08-06: the image stamped `c13a11f1`, while `main` finished the night two
commits ahead at `bb93a81d` (a deploy script and an audit entry — neither affects the
bundle). When verifying, compare against the SHA the script printed, **not** `HEAD`.

---

## 3. THE BUILD-ARG CONTRACT

**This is the core of this document. It is the thing that nearly shipped a regression.**

### 3.1 CI passes NINE build-args; a hand-typed command passes none

`deploy-fly.yml` L428–L436 passes: `LOWMEM`, `VITE_CESIUM_TOKEN`, `VITE_GOOGLE_MAPS_KEY`,
`VITE_GLB_URL`, `VITE_CONTEXT_TILES_URL`, `GIT_SHA`, `GIT_BRANCH`, `BUILT_AT`, `RUN_NUMBER`.

The command composed by hand during this session passed **one** (`LOWMEM=0`).

### 3.2 ⚠ Docker fails SILENTLY in both directions

**A missing `--build-arg` and a MISSPELLED `--build-arg` both build cleanly and ship broken.**
Docker accepts an unknown build-arg without error and bakes nothing. There is no warning, no
non-zero exit, and the image looks healthy.

This bit twice in one session:
1. The original command **omitted** eight args.
2. The proposed correction used **plausible but non-existent names** —
   `VITE_CESIUM_ION_TOKEN` and `VITE_GOOGLE_MAPS_API_KEY`. Those would have failed
   *identically* while looking like a fix.

### 3.3 The authoritative ARG names (from `Dockerfile`, verbatim)

| Correct (Dockerfile L96–L123) | ✗ The trap |
|---|---|
| `VITE_CESIUM_TOKEN` | ~~`VITE_CESIUM_ION_TOKEN`~~ |
| `VITE_GOOGLE_MAPS_KEY` | ~~`VITE_GOOGLE_MAPS_API_KEY`~~ |
| `VITE_GLB_URL` | — |
| `VITE_CONTEXT_TILES_URL` | — |

`LOWMEM` **is** a real ARG (`Dockerfile` L32); CI passes `LOWMEM=0` for full esbuild minify.
`GIT_SHA` / `GIT_BRANCH` / `BUILT_AT` / `RUN_NUMBER` are declared in the **runtime** stage
(L159–L166) — see §5.2, they behave differently from the `VITE_*` four.

**Always read the names from the Dockerfile. Never from memory, and never from this table if
the two disagree — the Dockerfile wins.**

### 3.4 Consequence of each being empty

`VITE_*` values are **inlined by vite AT BUILD TIME**. The damage is therefore baked into the
bundle — it is *not* a runtime setting you can repair with `fly secrets`. The only fix is a
rebuild.

- **`VITE_CESIUM_TOKEN` empty** → `CesiumViewport` ships tokenless; the 3D globe does not
  authenticate. On a browser-native BIM platform this is a visible product downgrade.
- **`VITE_CONTEXT_TILES_URL` empty** → falls back to **live Overpass** instead of pre-baked R2
  tiles (see [[context-3d-tiles-not-live-overpass]]).
- **`VITE_GLB_URL` empty → THE CLIFF, and the reason the check fails closed.**
  `public/items` (~185 MB of GLB catalog) is **deliberately `.dockerignore`d** and the catalog
  is hosted on **R2**. So an empty value does **not** degrade to a working local path — it
  ships a bundle requesting `/items/…` from an image that intentionally does not contain them,
  and **every furniture GLB 404s**. There is no soft fallback left.
  See [[furniture-glb-404-object-storage]] — that memory's "404s are expected" statement
  describes the **pre-R2** state and was corrected on 2026-08-06.

### 3.5 Secret recovery when repo secrets are unreachable

The four `VITE_*` values are inlined into the **deployed bundle** and served publicly to every
browser. **The live site is therefore the source of truth for what production runs.**

Fetch `assets/main-*.js` from `https://pryzm.fly.dev` and read them out of the plain
`{BASE_URL:"/",DEV:!1,MODE:"production",…,VITE_CESIUM_TOKEN:"…"}` object. Recovered lengths
were **257** (cesium) and **39** (google) — byte-matching CI's own audit line
(`build-arg lengths — cesium:257 google:39`).

This needs no access to the Cesium ion dashboard, the GCP console, or the repo secrets.
`tools/deploy/fly-manual-deploy.sh` does it automatically.

⚠ **Never print these values; report lengths only. Never commit them.** No file containing a
token was committed this session (verified by scanning the staged diff for `eyJ…` / `AIza…`
before each commit).

### 3.6 Fail closed

If any of the four is empty, **abort**. An empty value is indistinguishable at build time from
"not passed", and shipping it is worse than not deploying.

---

## 4. EXECUTION

```bash
tools/deploy/fly-manual-deploy.sh
```

It recovers the four `VITE_*` values from the live bundle, fails closed, derives
`GIT_SHA`/`GIT_BRANCH`/`BUILT_AT`, and runs:

```bash
flyctl deploy --depot=false --remote-only -a pryzm --yes \
  --build-arg LOWMEM=0 \
  --build-arg VITE_CESIUM_TOKEN="…"   --build-arg VITE_GOOGLE_MAPS_KEY="…" \
  --build-arg VITE_GLB_URL="…"        --build-arg VITE_CONTEXT_TILES_URL="…" \
  --build-arg GIT_SHA="…" --build-arg GIT_BRANCH=main \
  --build-arg BUILT_AT="…" --build-arg RUN_NUMBER=manual
```

### 4.1 ⚠ Relationship to `scripts/deploy/local-deploy.mjs` — RESOLVE THIS

**A pre-existing helper covers part of this and was not discovered until after
`fly-manual-deploy.sh` was written.** `scripts/deploy/local-deploy.mjs` (dated 2026-08-05)
stamps the **four provenance args** (`GIT_SHA`/`GIT_BRANCH`/`BUILT_AT`/`RUN_NUMBER=local`) and
forwards extra flyctl args, warning if the tree is dirty.

It does **not** handle the four `VITE_*` args — its usage example expects you to pass
`--build-arg VITE_CESIUM_TOKEN=…` yourself, which is exactly the step that failed this session.

**The two overlap and should be reconciled** (open item, §7): either fold the bundle-value
recovery into `local-deploy.mjs`, or have `fly-manual-deploy.sh` call it. Until then,
`fly-manual-deploy.sh` is the complete path and `local-deploy.mjs` is the partial one.

### 4.2 Expected timeline (measured, v1204)

| Stage | Observed |
|---|---|
| Context upload (~130 MB @ ~98 KB/s) | **~16 min** |
| `pnpm install` (839 packages) | ~1 min |
| vite build — **4,542 modules** | **1m 41s** |
| Runtime layers + image push | ~2 min |
| Blue-green rollout | ~1 min |
| **Total** | **~21 min** |

---

## 5. POST-DEPLOY VERIFICATION — MANDATORY

`§L-570-BUNDLE-PROOF` does not run here. **A manual deploy with no proof is an unverified
deploy, regardless of how green the build looked.**

```bash
tools/deploy/fly-bundle-proof.sh <the-sha-the-script-printed>
```

Checks: served `main-*.js` filename **changed**; all four `VITE_*` values present and correct;
`/version` `git_sha` matches; `/api/health/live` returns 200. Exit 1 = roll back.

### 5.1 v1204 result (2026-08-06)

```
served chunk: assets/main-Ct9TFFMo.js      (was main-EdLolWEx.js — changed ✓)
PASS  VITE_CESIUM_TOKEN — len=257
PASS  VITE_GOOGLE_MAPS_KEY — len=39
PASS  VITE_GLB_URL — https://pub-….r2.dev/items/
PASS  VITE_CONTEXT_TILES_URL — https://pub-….r2.dev/tiles/
PASS  GIT_SHA — /version git_sha == c13a11f1b7684e8fdfc30ca9528e25f36e34a544
PASS  /api/health/live — {"ok":true}
BUNDLE PROOF PASSED.
```

### 5.2 ⚠ `GIT_SHA` IS NOT IN THE CLIENT BUNDLE — a false-failure the proof itself caused

**The first version of `fly-bundle-proof.sh` grepped `main.js` for the SHA and reported
`FAIL … old bundle may still be served` on a completely healthy deploy.** Had that been
obeyed, it would have rolled back a good release.

`GIT_SHA`/`GIT_BRANCH`/`BUILT_AT`/`RUN_NUMBER` are declared in the Dockerfile's **runtime**
stage (L159–L166) as `ENV`, read by `process.env` **at request time**, and exposed at
`GET /version`. They carry no `VITE_` prefix, so **vite never inlines them**. The check was
looking in the wrong place for the right value.

**Ask the server, not the bundle.** Fixed in `fly-bundle-proof.sh`; the fix is verified by the
6/6 pass above.

> **Generalisable lesson** ([[probe-can-be-wrong-three-ways]]): the probe was wrong about the
> **property**, not the system. A verification tool that can fail a healthy deploy is more
> dangerous than no tool, because it converts a success into a destructive action. Confirm a
> failing check against an independent source **before** acting on it.

### 5.3 Rollback

Read the previous tag **before** deploying:

```bash
flyctl machines list -a pryzm     # IMAGE column of the CURRENT machines
flyctl deploy --image registry.fly.io/pryzm:<previous-deployment-tag> -a pryzm
```

The v1203 baseline of 2026-08-06 was `pryzm:deployment-01KZBSWJVAFNCFBG8SQHEGF0S6`.
v1204 is `pryzm:deployment-01KZC9V1JSCMNWM0DXJWY8KFS1`.

---

## 6. GATE-BYPASS COVER (`§L-540-CI-GATE`)

Actions could not run, so the CI gate could not run. **Record the local cover in the audit log
every time** (this deploy: `L-690`). What was run against `c13a11f1`:

| Check | Result |
|---|---|
| `NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.json --noEmit` | **clean** (exit 0) — ⚠ the heap flag is REQUIRED as of 2026-08-20, see §6.8.3 |
| `npm run check:isolation` | **clean** (Contract 48) |
| `npm run test:server` | **422/422 passing**, 28 files |

⚠ Not run: root `npx vitest run`, `test:pryzm1`, Playwright E2E. **This is a real gap** — the
cover is narrower than CI's and the audit entry must say so rather than implying parity.

⚠ `fly.toml` uses `strategy = "bluegreen"`. Green must boot ~100 tsx-transpiled workspace
packages on 512 MB inside a **60 s** grace (`§L-442`/`§L-444`). It passed first time on v1204,
but this was its **first** exercise — do not treat one success as proof. Watch for
`not listening` / `unhealthy` / `timeout reached`; blue keeps serving if green fails.

---

## 6.5 SECOND EXECUTION — v1246, 2026-08-10 (`4081ac3a`)

Read this section before running the script. It records what actually happened the second
time, including a production bug this contract's own §5 proof caught **after** a green deploy.

### 6.5.1 The trigger was NOT the 2026-08-06 outage signature

| Signature | Job lifetime | Steps run |
|---|---|---|
| Billing block ([[github-actions-billing-blocks-deploy]]) | 3–4 s | 0 |
| Actions outage (§1, first execution) | queued 34+ min | 0 |
| **This session** | **11–12 s** | **0** |

Two dispatches, both identical. It sits **between** the two documented signatures, so which
one it was is **not established** — the run-log blob 404'd on every retry, so there is no
step-level evidence either way. What was ruled out, with evidence:

* **Not the code.** `npm run check:isolation` + a full local `vite build` both passed on the
  same SHA that "failed" in CI.
* **Not the workflow files.** `.github/workflows/` was untouched since a run that deployed
  green (`bd423c4a`).
* **Not repo visibility.** §1 already says this, and it was re-confirmed: the repo is
  **private** here and was **public** during the 2026-08-06 outage. Visibility is irrelevant
  to both. ⚠ An earlier diagnosis in this session wrongly suggested "make the repo public" —
  that advice contradicts this document and is withdrawn.

**Rule for the next agent:** a job that dies in seconds with **zero steps** is never a build
failure. Do not read build logs, do not re-dispatch a third time. Go to the manual path.

### 6.5.2 ⚠ §MSYS-PATHCONV — the bug that shipped green

**This is the most important thing in this section.** On Windows/Git Bash, MSYS2 rewrites any
argument shaped like a Unix absolute path into a Windows path before the child process sees
it. The two root-relative URL args are exactly that shape:

```
passed:    --build-arg VITE_GLB_URL=/api/catalog/items/
flyctl saw: --build-arg VITE_GLB_URL=C:/Program Files/Git/api/catalog/items/
```

Vite inlined the mangled value. **Everything looked correct:** deploy exit 0, release
`complete`, `/api/health/ready` → `{"ok":true}`, `/version` stamping the right SHA, and both
recovered lengths were the expected 39. Only reading the *values* out of the bundle exposed
it — every furniture GLB and every context tile would have requested a path that exists on
nobody's machine.

§3.2 said an **empty** or **misspelled** build-arg ships broken. There is a third sibling:
**silently rewritten**. And the script's own guard did not catch it, because the guard only
asked *"is it non-empty?"* — 39 characters of garbage passes that test.

**Fixed in the script (both defences, because either alone is bypassable):**
1. `export MSYS_NO_PATHCONV=1` + `export MSYS2_ARG_CONV_EXCL='*'`.
2. A **fail-closed shape check**: each URL arg must be root-relative (`/…`) or an absolute
   `http(s)://` URL, or the script aborts naming §MSYS-PATHCONV and how to re-run.

**Generalisable lesson:** a length check is not a value check. When a build-arg's *content*
determines whether production works, assert its **shape**, not just its presence.

### 6.5.3 The §5 proof is not optional, and it must read VALUES

The bundle proof was the only thing between a green dashboard and a broken product. Run it
**every time**, and check all four values — not just the two lengths CI happens to echo:

```
VITE_CESIUM_TOKEN       len 257
VITE_GOOGLE_MAPS_KEY    len 39
VITE_GLB_URL            → must start with / or http(s)://
VITE_CONTEXT_TILES_URL  → must start with / or http(s)://
```

### 6.5.4 Measured timings (compare with §4.2)

| Stage | v1204 (2026-08-06) | **v1246 (2026-08-10)** |
|---|---|---|
| Upload + build + push | ~19 min | **~13 min** |
| Blue-green rollout | ~1 min | **~1.5 min** |
| **Total** | ~21 min | **~14.5 min** |

Faster, but **do not treat ~14 min as the new expectation** — uplink is the dominant term and
it varies. The §2.1 builder resize (`shared-cpu-8x:16384MB`) **persisted** from 2026-08-06;
verify it, don't re-apply blindly.

### 6.5.5 Operational notes for the next agent

* **`flyctl` was already installed and authenticated** (`v0.4.74`, `markhanoi@outlook.com`).
  Check with `flyctl auth whoami` before assuming a login step is needed.
* **Do not pipe the script through `tail`/`head`.** `bash …sh 2>&1 | tail -60` buffers the
  entire run, so you see nothing for ~13 minutes and cannot tell progress from a hang. Let it
  stream, or watch `flyctl releases -a pryzm` in parallel.
* **`/version` lags the release.** For ~90 s after `complete`, the endpoint still serves the
  OLD SHA while blue-green finishes swapping. Poll until the SHA matches; a stale read is not
  a failed deploy.
* **Watch for failure, not just success.** A watcher that only greps for a new release is
  silent through a crash. Include "flyctl exited with no new release" as an event.
* `GIT_SHA` is captured at script start (§2.3) — this run stamped `4081ac3a` while later
  commits landed during the ~13 min window. Compare against the printed SHA, not `HEAD`.

---

### 6.5.6 §DOCKER-HOST-LEAK — Docker Desktop breaks `--remote-only` (fix VERIFIED)

Observed on the third execution day: the deploy reached "Remote builder ready",
then died with

```
Error: failed to fetch an image or build from source: failed to parse daemon
host "npipe:////./pipe/docker_engine": missing hostname
```

Cause: Docker Desktop was running locally. flyctl initialises a Docker client
even under `--remote-only`, and resolves the daemon from **the Docker CLI
context file** (`~/.docker/config.json` → `currentContext` → the Windows named
pipe), which it cannot parse as a host.

⚠ **The obvious fix does NOT work — verified by failure.** The first attempt was
`env -u DOCKER_HOST -u DOCKER_CONTEXT …` — it failed with the *identical* error,
because the npipe comes from the CONTEXT FILE, not the environment. Unsetting
env vars changes nothing.

**The fix that shipped `ba9d4d66` (verified):** point flyctl at an empty Docker
config for the one invocation, so no context exists at all:

```bash
mkdir -p /tmp/empty-docker-config && echo '{}' > /tmp/empty-docker-config/config.json
DOCKER_CONFIG=/tmp/empty-docker-config bash tools/deploy/fly-manual-deploy.sh
```

Rule for the next agent: "worked earlier, fails now, error mentions npipe or
docker_engine" ⇒ Docker Desktop started in between. Not the script, not the
code, not the env vars — the **context file**. Use `DOCKER_CONFIG`.

> ⚠ **Amended 2026-08-15 (fourth/fifth executions, `499549a8` + `9e780581`).**
> The recipe above bit its own tail: `DOCKER_CONFIG=/tmp/empty-docker-config`
> uses an **MSYS path that native flyctl cannot resolve** — on a machine where
> `C:\tmp` does not exist, flyctl silently falls back to `~/.docker/config.json`
> and dies with the *identical* npipe error **with the guard set** (measured:
> first 2026-08-15 attempt, exit 1 before any build). This may also be the
> unexplained §6.5.7/§7-item-5 post-push failure. **Give the guard a
> Windows-shaped path** (forward slashes fine):
>
> ```bash
> DOCKER_CONFIG="C:/some/real/dir/empty-docker-config" bash tools/deploy/fly-manual-deploy.sh
> ```
>
> with `config.json` = `{}` inside it. Verified: the retry with a Windows path
> passed the builder handshake first try and both 2026-08-15 deploys completed
> (bundle proof 6/6 on `499549a8`). Same lesson class as §MSYS-PATHCONV: a
> Unix-shaped path handed to a native Windows binary fails silently.

Also measured this execution: builder 16 GB precondition still held from
2026-08-06 (no re-resize needed); local smoke gate inside the Docker build
booted `dist/index.cjs` in **720 ms** (the L-442 precompile paying off — the
Dockerfile's original "993 ms" claim is now independently corroborated).

### 6.5.7 §IMAGE-REF-RECOVERY — the standard resume after a post-push flyctl death (VERIFIED ×2)

Observed 2026-08-10 (deploy of `44146931`) and previously as the L-818 multi-image
recovery: the build **and the registry push both succeed** ("Pushing image done",
a `deployment-…` tag printed with its digest), and *then* flyctl dies — that day
with the §6.5.6 npipe error, **despite the DOCKER_CONFIG guard being set** (the
guard shielded the build phase but not the post-push heartbeat/deploy phase; why
is an open item below).

**Do not rebuild.** The image is already in the registry. Resume with a
reference-only deploy, which ships kilobytes and skips the entire upload/build:

```bash
MSYS_NO_PATHCONV=1 DOCKER_CONFIG=/tmp/empty-docker-config \
  flyctl deploy --image registry.fly.io/pryzm:<the-printed-deployment-tag> -a pryzm --yes
```

Read the tag from the failed run's own output (the `deployment-…: digest: sha256:…`
line). Then run the §5 bundle proof against the SHA the script printed at start,
exactly as for any deploy. Verified end-to-end 2026-08-10: rollout completed,
proof 6/6.

Rule for the next agent: "Pushing image done" in the log ⇒ the failure is
DELIVERY, not build. Reference-deploy the pushed tag; never re-run the full
script (it re-uploads ~130 MB and re-builds for nothing).

### 6.5.8 §MULTI-IMAGE-BLUEGREEN-BLOCK — a failed deploy leaves orphan machines that BLOCK every later deploy (VERIFIED 2026-08-20)

Observed after a deploy died mid-release on a **DNS outage** (`lookup api.fly.io: no such
host`). The build and push had succeeded, so flyctl had already created machines on the new
image; the release never completed. Result: **four machines on two images**, and every
subsequent deploy — including the §6.5.7 reference-only resume — refused before doing anything:

```
Found 2 different images in your app (for bluegreen to work, all machines need to run a single image)
  [x] pryzm:deployment-…D13M3D - 2 machine(s) (080e527bd54d48,784ed76df11d18)
  [x] pryzm:deployment-…BSRD1J - 2 machine(s) (e82d626c595008,2873247b5949d8)
Error: found multiple image versions
```

⚠ **flyctl's own advice is `fly machines destroy --force`. That is NOT the smallest fix, and it
destroys production machines to cure a bookkeeping state.** Read the error text closely: the
precondition belongs to **BLUE-GREEN**, not to deploying. A rolling deploy replaces machines one
at a time and therefore *reconciles* the image spread as it goes.

**The fix, verified end to end:** take the §6.5.7 reference-only resume and add `--strategy rolling`.

```bash
MSYS_NO_PATHCONV=1 DOCKER_CONFIG="C:/pryzm-deploy/empty-docker-config"   flyctl deploy --image registry.fly.io/pryzm:<the-printed-deployment-tag>   -a pryzm --strategy rolling --yes
```

Measured 2026-08-20 on `f233f442`: RC=0, all four machines converged to the single new image,
bundle proof 6/6 with a CHANGED chunk (`main-C4hMcvwM.js` → `main-CFghigBz.js`). **Nothing was
destroyed and nothing went down.**

**Rules for the next agent:**
1. *"found multiple image versions"* ⇒ a PREVIOUS deploy died after push. **Do not rebuild** —
   §6.5.7's tag is in that run's log; the image is already in the registry.
2. **Try `--strategy rolling` BEFORE destroying anything.** Destroying is irreversible and was
   not necessary here.
3. ⭐ **Always re-read the chunk hash in the proof.** A proof can pass 6/6 against the PREVIOUS
   bundle — all four build-args are inlined in the old chunk too. §5's *"MUST differ from the
   pre-deploy filename"* is the only line that distinguishes "shipped" from "still serving the
   old one", and it was nearly missed on 2026-08-19.

## 6.6 THIRD EXECUTION — v-next, 2026-08-12 (`52bfb2ba`), bundle proof 6/6

Two findings; the first supersedes part of §6.5.2.

### 6.6.1 ⚠ §6.5.2's global-export advice is STALE — the script now defends itself, and the export BREAKS it

§6.5.2 says to `export MSYS_NO_PATHCONV=1` + `MSYS2_ARG_CONV_EXCL='*'`. **Do not.** The script
has since evolved its own defence (the URL args are passed *slash-less* and re-assembled, see
the §MSYS-PATHCONV block in the script itself around L90–L120), and its header explicitly warns
that the global export is WORSE: it disables conversion for **every** command, including the
script's own `curl -o /tmp/...`, which then fails with exit 23 (`client returned ERROR on
write`) because curl is a native Windows binary that cannot write to an unconverted `/tmp`
path. That exact failure happened on this execution's first attempt.

**Rule: the script is the authority on its own MSYS defence. Run it with only the
`DOCKER_CONFIG` guard (§6.5.6); add no MSYS exports.** This is the founder's 2026-08-07 ruling
("read the file, don't deploy from memory") biting in a new way: the *contract* was the stale
memory this time. When §6.5.2 and the script's header disagree, the script wins — same
precedence rule as §3.3's "the Dockerfile wins".

### 6.6.2 The legacy builder app gets REAPED — expect to resize a NEW builder

`fly-builder-autumn-headland-88` (§2.1) no longer existed; a new app
(`fly-builder-twilight-songbird-4866`) had been minted at **8192MB** and needed the §2.1 resize
to 16384 before the build. The §6.5.4 note "the resize persisted — verify, don't re-apply"
is therefore conditional on the builder app itself surviving. **Always `flyctl apps list |
grep builder` first; never assume the §2.1 app name.** With the resize done, the build
completed clean (4,542-module class, no OOM), and blue-green rolled out first try.

Timings: recovery+upload+build+push ≈ 35 min wall-clock on this uplink (slower than §6.5.4's
~13 min — uplink variance dominates, as predicted there). Gate cover run for this SHA: root
`tsc` exit 0 · `check:isolation` clean · `test:server` 613/613. Not run: root vitest,
test:pryzm1, Playwright (same declared gap as §6).

### 6.5.9 ⚠ §4 IS INTERMITTENT ON THIS MACHINE — ~2 builds in 10 reach a push (2026-08-20)

> ⚠ **CORRECTED WITHIN THE HOUR, AND THE CORRECTION IS THE POINT.** This section first read
> *"§4 NO LONGER WORKS … 8 consecutive failures"*. **That was an over-claim from a run of bad
> luck.** The founder pointed at release **#1326**, shipped 3 h earlier from an image this very
> script had built and pushed. Re-counted across all ten attempts:
>
> | run | pushed? | run | pushed? |
> |---|---|---|---|
> | 5 | ✗ | 11 | ✗ |
> | **6** | **✅** | 12 | ✗ |
> | **8** | **✅** | 13 | ✗ |
> | 9 | ✗ | 14 | ✗ |
> | 10 | ✗ | bare §4 | ✗ |
>
> **2 of 10 built and pushed. It is FLAKY, not broken** — and "7 consecutive" is exactly what a
> ~20 % success rate looks like from inside. ⭐ **A streak is not a proof.** Counting the whole
> population, rather than the recent run, was the measurement that settled it.

**Practical consequence: RETRYING IS RATIONAL** — roughly one attempt in five reaches a push, at
~20 min each. ⭐ **And a push is all you need**: §6.5.7's reference-only deploy ships an image in
under a minute, so the moment `Pushing image done` appears the expensive part is banked even if
flyctl then dies. **Grep the log for that line before concluding anything.**


**Read this before spending an hour on the same wall.** Eight deploys, every one dying at the same
line, none reaching a push:

```
👀 checking remote builder compatibility with WIREGUARDLESS deploys ... ✓ compatible builder found
INFO Override builder host with: https://fly-builder-….fly.dev  (was tcp://[fdaa:…]:2375)
WARN Failed to start remote builder heartbeat: failed to parse daemon host "npipe:////./pipe/docker_engine"
Error: failed to fetch an image or build from source: failed to parse daemon host "npipe:…"
```

⭐ **flyctl HAS a working wireguard address and discards it**, then takes a path that resolves a local
docker daemon and hits the Windows default named pipe.

**MEASURED, so nobody re-derives it:**
- `docker` is **not on PATH**; `~/.docker/config.json` **does not exist**. ⇒ §6.5.6's stated mechanism
  (*"the npipe comes from the CONTEXT FILE"*) is **FALSE on this machine**, and the `DOCKER_CONFIG`
  guard it prescribes has nothing to override. It appeared to work twice by luck — on runs where
  flyctl happened to keep the wireguard path.
- **`DOCKER_HOST=` (empty) is counterproductive** — an empty value reads as UNSET and routes straight
  back to the same built-in default.
- **`DOCKER_HOST=tcp://127.0.0.1:2375` (parseable) does NOT help** — the variable never reaches that
  code path.
- **`--wg=true` does NOT help** — the flag documents itself as `default true`; flyctl overrides its
  own default on the compatibility check. (Tried, reverted; an ineffective flag with an explanatory
  comment is worse than none.)
- **§4 BARE — no guards, no flags, exactly as written — fails IDENTICALLY.** ⭐ This is the clean data
  point: the contract's own command, unmodified, no longer works here.
- §2.1 is **satisfied** (builder `shared-cpu-8x:16384MB`), so this is not the OOM path.
- `flyctl v0.4.74` (2026-07-22), app `fly-builder-shimmering-glow-9973`.

⭐ **THE DEPLOY PHASE IS FINE — ONLY THE BUILD PHASE IS BROKEN.** Proven the same day: after these
failures, a §6.5.7 reference-only deploy of an already-pushed image succeeded **first try**, because
it never constructs a docker client. So the fault is confined to *producing* an image locally.

**Therefore, until this is diagnosed, the working paths are:**
1. **GitHub Actions builds it** (this contract's own §7 item 1 — decouple build from deploy). The
   manual path is documented as an Actions-outage fallback; right now the inverse holds.
2. **Run Docker Desktop**, giving the named pipe a real daemon to resolve.
3. If any image reaches the registry by any route, **§6.5.7 + `--strategy rolling` (§6.5.8) ships it
   in under a minute.**

⚠ **Retry, but bank the wins.** ~20 min per attempt at ~20 % success. ⛔ Do not conclude
"broken" from a streak — count the whole population, and always check for `Pushing image done`
before starting over: a pushed image is a finished build, whatever flyctl printed afterwards.

---

### 6.5.10 ⚠ WARMING THE BUILDER HELPS BUT DOES NOT FIX §4 — tried and measured (2026-08-20)

**Do this before every manual deploy. It is one command and it is the first thing to try when §4
dies at the builder handshake.**

```bash
flyctl machines list -a <the-builder-app>        # note the machine id and STATE
flyctl machines start <machine-id> -a <the-builder-app>
# only then: tools/deploy/fly-manual-deploy.sh
```

**Why — measured, not reasoned.** Fly SUSPENDS an idle builder app and wakes it on demand. Every one
of eight consecutive failures printed the same three lines in the same order:

```
Waiting for remote builder fly-builder-… ✓ ready
INFO Override builder host with: https://fly-builder-….fly.dev  (was tcp://[fdaa:…]:2375)
Error: failed to parse daemon host "npipe:////./pipe/docker_engine"
```

⭐ **flyctl says "ready", then immediately DISCARDS the wireguard address.** The reading that fits
every observation: the app answers before its wireguard peer is actually usable, flyctl's
"compatible with wireguardless deploys" check therefore wins, and that path needs a local docker
daemon — which on Windows is the named pipe it cannot parse (see §6.5.9: there is no docker on PATH
and no `~/.docker/config.json` here, so the pipe is flyctl's built-in default, not a context file).

**The evidence for the fix:**
- 8 consecutive runs died **at the handshake, before any upload** — `Pushing image done` count 0.
- The builder app read **`suspended`** in `flyctl apps list`.
- After `flyctl machines start`, the very next run **cleared the handshake and reached the context
  upload** — the exact point the previous eight never got past.
- It also explains the pattern the founder spotted: the two runs that DID push were **early in the
  session, when the builder had been recently active**. Idle → suspended → fail.

> ⛔ **CORRECTED THE SAME HOUR — WARMING IS NOT THE FIX. Measured, so nobody repeats it.**
> The run that prompted this section **did** get further than the previous eight: it reached the
> buildkit context transfer and uploaded **122 MB over ~7 minutes**, where the others sent zero
> bytes. **And it still ended at the identical line**, with `Pushing image done` count **0**:
> ```
> Override builder host with: https://…  (was tcp://[fdaa:…]:2375)
> Error: failed to parse daemon host "npipe:////./pipe/docker_engine"
> ```
> ⇒ **Warming the builder buys progress, not success.** Do it — reaching the upload is strictly
> better than dying at the handshake — but **do not expect it to complete a deploy.**
> ⭐ **And note what this kills: the failure is NOT a cold-builder race.** flyctl discards the
> wireguard address even against a machine that is already `started`, so the override is
> unconditional, not a timing artefact. That removes the last hypothesis this session had.

⚠ **Scope, stated precisely and then corrected.** What warming proves is only that the builder
being cold was **not** the whole story. §4 remains unresolved on this machine: **0 pushes in 10
attempts since the last success**, 2 of 12 overall.
⛔ Do not upgrade this to "§4 is fixed" on a single success; that is the same streak-reasoning error
§6.5.9 had to correct in the other direction.

⭐ **And regardless of outcome: grep for `Pushing image done`.** A pushed image is a finished build no
matter what flyctl prints afterwards — §6.5.7 ships it in under a minute, and §6.5.8 adds
`--strategy rolling` if machines are split across image versions.

---

## 7. OPEN ITEMS

1. **Decouple build from deploy** — the real fix. Build on a datacenter box,
   `docker push registry.fly.io/pryzm:<sha>`, then `flyctl deploy --image <ref>`, which ships a
   manifest reference in kilobytes. Removes **both** GitHub's runner pool and the ~98 KB/s home
   uplink from the critical path, cutting ~21 min to ~5.
2. **Measure the real vite heap floor.** `--max-old-space-size=6144` is a ceiling nobody has
   tested. If 3072 suffices, a stock builder works and the resize stops mattering.
3. **Reconcile `fly-manual-deploy.sh` with `scripts/deploy/local-deploy.mjs`** (§4.1) — two
   overlapping manual paths is exactly the drift this contract exists to prevent.
4. **Re-enable the CI gate the moment Actions recovers.** This contract is a fallback, not a
   new normal. Normalising it re-opens every gap in §6.
5. **Why did `DOCKER_CONFIG=/tmp/empty-docker-config` not shield the post-push phase?**
   (2026-08-10, §6.5.7.) The build phase ran clean under the guard, then the remote-builder
   heartbeat re-resolved the npipe context. Either flyctl reads the context again through a
   different path in that phase, or the env var was lost across an internal re-exec. Until
   diagnosed, treat §6.5.7 as the expected occasional resume, not an anomaly.

---

**Cross-references:** `.github/workflows/deploy-fly.yml` (the authority on the arg block) ·
`Dockerfile` L32, L96–L123, L159–L166 (the authority on ARG names) · `fly.toml` ·
`docs/04-reference/ISSUE-LOG.md` L-690 · memory `fly-production-deploy.md`

## 6.7 FOURTH EXECUTION — v-next, 2026-08-17 (`c2e8ba00`), bundle proof 6/6 on the SECOND run

735 commits since `52bfb2ba`. Gates at the deployed SHA: root `tsc` **RC=0 / 0 errors** ·
`check:isolation` **RC=0** · `test:server` **613/613**. Builder `fly-builder-twilight-songbird-4866`
**survived** this time and was still at `shared-cpu-8x:16384MB` — §6.6.2's "always check, never
assume the app name" held, and the answer happened to be "unchanged". Context uploaded at ~330 KB/s
(vs §4.2's ~98 KB/s) — **~11 min for ~185 MB**, so §2.2's "~130 MB" figure has grown and should be
re-measured. Total wall-clock ≈ 25 min.

### 6.7.1 ⚠ §L-941 — THE BUNDLE PROOF FAILED A HEALTHY DEPLOY, AND FORBADE THE RETRY

**Second instance of the §5.2 class. Read §5.2 first, then this — the mechanism differs.**

Run immediately after `flyctl` reported machines started, the proof printed:

```
FAIL  GIT_SHA — /version git_sha='49befd93…' != expected 'c2e8ba00…'
BUNDLE PROOF FAILED — ROLL BACK NOW, DO NOT RETRY:
```

**The deploy was healthy.** The deploy script was still running (`Waiting before stopping all blue
machines`); the blue machines were **cordoned but still serving**. Five polls of `/version` moments
later all returned `c2e8ba00`, and a clean re-run passed **6/6**.

§5.2's probe was wrong about the **property**. This one is wrong about the **moment** — and it is
worse, because of one clause:

> ⛔ **`DO NOT RETRY` forbids the single cheapest action that distinguishes "the deploy is bad" from
> "the deploy is not finished".** An operator or agent obeying the contract literally destroys a good
> release and cannot afterwards tell that they did. **A verification tool that can fail a healthy
> deploy is more dangerous than no tool; one that also forbids re-verification converts a transient
> into an irreversible action.**

**Until `fly-bundle-proof.sh` is fixed (L-941), the operating rule is:**
1. **Do not run the proof until the deploy script has EXITED.** `flyctl` reporting "machines started"
   is not rollout completion; the blue set is still serving.
2. **On a GIT_SHA mismatch, re-run once after 60 s** and poll `/version` several times. A mismatch
   that persists across two clean post-rollout runs is real. **A single sample is not evidence.**
3. **Never read the proof's verdict through a pipe.** The first run was read via `| tail -25`, which
   reported `PROOF_RC=0` — `tail`'s code, not the proof's — while the text said FAILED.
   §EXIT-CODE-THROUGH-A-PIPE. Capture with `; echo "RC=$?" >> file` and read the file.

### 6.7.2 §6.5.6's `DOCKER_CONFIG` guard: still required, and the path must be WINDOWS-shaped

Docker Desktop was running; the guard was applied and the build never saw the npipe error. ⚠ The
MSYS form `/tmp/empty-docker-config` printed in §6.5.6 **fails silently here** — use a real Windows
path (`C:/…/empty-docker-config`) containing `config.json` = `{}`. §6.6.1 holds unchanged: **no MSYS
exports**, the script owns its own defence.

---

## 6.8 FIFTH EXECUTION — 2026-08-20 (`d160de04` → `b1b5dab6`, bundle proof 6/6): THE BUILD FAILED FOR A **CODE** REASON, AND THE LOG'S LAST LINE LIED ABOUT IT

**If a deploy just failed, read §6.8.1 before anything else in this document.** Every previous
section here diagnoses INFRASTRUCTURE. This is the first recorded case of the manual path failing
because **the repo could not produce a bootable server** — and the failure wore the costume of the
infrastructure bug §6.5.9 describes.

### 6.8.1 ⛔ §TRAILING-ERROR-IS-A-CONSEQUENCE — grep for the FIRST error, never the last

The run ended with exactly this, which is §6.5.9's signature verbatim:

```
WARN Failed to start remote builder heartbeat: failed to parse daemon host "npipe:////./pipe/docker_engine"
Error: failed to fetch an image or build from source: failed to parse daemon host "npipe:..."
DEPLOY_RC=1
```

§6.5.9 says that failure is **flaky (~20 % success) and that retrying is rational**. Obeying it here
would have burned roughly **five attempts × ~20 min** on a defect that fails **100 % of the time** —
because ~40 lines earlier the build had already died:

```
#21 [builder 15/15] RUN node scripts/build/smoke-prod-boot.mjs
#21 3.231 [prod-shim] failed to boot server.js: ReferenceError: document is not defined
#21 ERROR: process "/bin/sh -c node scripts/build/smoke-prod-boot.mjs" did not complete successfully
```

flyctl retried on the wireguardless path **after** the build had failed, so the npipe error is a
**consequence**, printed last. ⭐ **The most recent error in a log is not the same as the earliest
one, and only the earliest one is a cause.**

**Do this, in this order, before concluding anything:**

```bash
grep -n 'ERROR: process "/bin/sh' "$LOG" | head -3    # a Dockerfile RUN step died => CODE defect
grep -c  'Pushing image done'      "$LOG"             # 1 => build finished; failure is DELIVERY
grep -n  '^Error'                  "$LOG" | head -3    # flyctl's own errors, in order
```

| what you find | what it is | what to do |
|---|---|---|
| `ERROR: process "/bin/sh -c ..."` anywhere | **deterministic CODE failure** | **Do NOT retry.** Fix the code — §6.8.2 |
| `Pushing image done` present | build finished, delivery died | §6.5.7 reference-only resume; never rebuild |
| neither; dies at the handshake | the §6.5.9 flake | retry is rational (~1 in 5) |

### 6.8.2 What the code defect was, and the LOCAL repro that costs ~1 minute instead of ~20

`§L-442`'s `smoke-prod-boot.mjs` boots the real `dist/index.cjs` inside the image. It refused: two
commits from the preceding night imported the **`@pryzm/geometry-slab` barrel** to get *pure*
helpers, and that barrel value-exports `SlabTool` + `SlabPickWallsController`, which
`import * as BUI from '@thatopen/ui'` (Lit) at module scope. The server graph reaches them via
`file-format/server.js → pack → persistence-client → core-app-model → {command-registry, geometry-wall}`.
Full write-up: **ISSUE-LOG `L-1500`** (which also closed `L-1436`).

⭐ **You do not need Fly to find this class of defect.** The image build regenerates the server
bundles via `build:docker`, so the identical thing runs locally in seconds:

```bash
npm run build:server-deps      # prints, per bundle: module count + the EXTERNAL list
```

Read the externals for `@pryzm/file-format/server`. **A browser-only package in that list is the
bug.** Measured across this regression:

| bundle | modules | `@thatopen/ui` external | boots? |
|---|---|---|---|
| 2026-08-18 (last good) | 1684 | no | yes |
| `d160de04` (failed) | **1753** | **YES** | **no** |
| `b1b5dab6` (fixed) | 1721 | no | yes |

Then confirm the artefact actually evaluates — the cheap stand-in for the whole smoke gate:

```bash
node --input-type=module -e "await import('./dist-server-deps/@pryzm/file-format/server.mjs'); console.log('OK')"
```

To find *which* import did it, walk esbuild's metafile instead of guessing: reproduce
`build-server-deps.mjs`'s externalise rule (external iff a `node:` builtin or present in root
`package.json` dependencies), build with `metafile: true`, then reverse-BFS from the offending
specifier back to the entry. That printed the exact 11-hop chain in one run.

⚠ **Two independent routes existed.** Fixing the first left the bundle byte-identical at 1753
modules. **Re-run `build:server-deps` after every fix and believe the externals list, not the fix.**

⚠ **A false lead worth naming, because it cost time:** `dist-server-deps/` is **untracked**, 17 MB,
and IS uploaded in the build context — so it looks like a stale local artefact poisoning the image.
It is not. `COPY . .` lands first, then `RUN pnpm run build:docker` **regenerates** it inside the
image; `apply-server-deps-overlay.mjs` only *copies*. Do not chase it.

### 6.8.3 ⚠ The §6 gate cover's `tsc` command NO LONGER COMPLETES as written

`npx tsc -p tsconfig.json --noEmit` now dies at Node's default ~2 GB heap:

```
FATAL ERROR: Ineffective mark-compacts near heap limit - JavaScript heap out of memory
RC=134
```

⛔ **`RC=134` reads exactly like a broken build and is not one.** With the flag, the same tree is
**RC=0, zero errors**:

```bash
NODE_OPTIONS=--max-old-space-size=8192 npx tsc -p tsconfig.json --noEmit
```

The §6 table is corrected in place. Same lesson as §5.2 and §6.7.1: **a check that fails on a healthy
tree is worse than no check**, because its output is indistinguishable from a real failure.

### 6.8.4 `check:isolation` was RED, and was deliberately NOT made green

Arms 1–2 (C13 project-isolation, Contract 48 storage-isolation) passed. Arm 3 (ADR-0298 declared
project-scope) failed: baseline **41 → 44**, three new files holding module-level project-scoped
state with no declared owner (`lineworkProbe.ts`, `underlayViewScope.ts`, `stairByWalls.ts`).

The gate's own output says *"do not narrow the check until it passes"*, so the debt JSON was **not**
edited to buy a green line. **This deploy shipped with that arm red, and it is recorded here rather
than hidden.** Rule for the next agent: a ratchet you could silence in ten seconds is exactly the one
you must not silence during a deploy — you will not remember it afterwards, and the next reader will
believe the gate.

Gate cover at the deployed SHA: root `tsc` **RC=0** (with §6.8.3's flag) · `test:server` **613/613,
41 files** · `check:isolation` **RC=3, arm 3 only** · `@pryzm/geometry-slab` **316/316**. Not run:
root vitest, `test:pryzm1`, Playwright — the same declared gap as §6.

⚠ Also pre-existing and NOT caused by this deploy: **`@pryzm/command-registry` fails 13 tests across
7 files** (rake preflight, windows batch, move-reweld, wall-layer batch, canPlace refusal identity).
Verified as behavioural assertions with no module-resolution errors, i.e. inherited from the
preceding night's lanes, not from the import fix. **They shipped failing.**

### 6.8.5 Operational notes that held or changed

* **Builder app renamed AGAIN** — `fly-builder-shimmering-glow-9973` (was
  `fly-builder-twilight-songbird-4866` in §6.7, `fly-builder-autumn-headland-88` in §2.1). §6.6.2's
  rule — *always `flyctl apps list | grep builder`, never assume the name* — held for the third
  consecutive execution. It was already `shared-cpu-8x:16384MB`; no resize needed.
* **§6.5.10 warming worked, on both attempts.** The builder read `suspended`; `flyctl machines start`
  ran before each attempt, and **both** cleared the handshake and reached the build — against
  §6.5.9's "0 pushes in 10 attempts". ⛔ This is **not** evidence the flake is fixed (§6.5.10
  corrected itself on exactly this reasoning). Two data points, recorded as two data points.
* **A changed `package.json` invalidates the whole layer cache.** Attempt 1 ran with `pnpm install`
  and `build:docker` **CACHED**, so only the smoke step was live (~2 min to failure). Attempt 2
  changed `packages/geometry-slab/package.json`, so nothing cached and it was a full cold build.
  Budget for the cold path whenever a manifest moves. It did **not** break `--frozen-lockfile`: an
  `exports` subpath is not a lockfile input.
* **`fly.toml` is now `strategy = "rolling"`, not `bluegreen`.** §6's blue-green grace-period warning
  and §6.5.8's multi-image trap are correspondingly less likely — but §6.5.8's ⭐ rule survives
  regardless: **always re-read the served chunk hash.** Here `main-CFghigBz.js` → `main-D4sQvlnl.js`,
  CHANGED, which is the only line separating "shipped" from "still serving the old one".
* **The §5 proof was run only after `DEPLOY_RC=0`** (§6.7.1) and its verdict read from a file via
  `; echo "RC=$?" >> file`, never through a pipe (§EXIT-CODE-THROUGH-A-PIPE). It passed **6/6 first
  try**, no retry needed.

### 6.8.6 ⭐ The durable fix this execution earns — logged as `L-1501`, NOT built

`build-server-deps.mjs` already computes each bundle's external set, and already fails the build when
an external would not resolve at runtime (its own comment: *"the difference between a build failure
and a 3am ERR_MODULE_NOT_FOUND"*). **It does not ask whether an external is browser-only.** A named
deny-list arm there — `@thatopen/ui`, and anything else that touches `document` at module scope —
would have failed **locally, in seconds, naming the offending import**, instead of 20 minutes into a
remote build as a stack trace wearing an infrastructure error's clothes.

⚠ It must be a **named deny-list**, not "no `@thatopen/*`": `@thatopen/components` is Node-safe and
sits in the last-good bundle, so the coarse rule would have failed the three preceding green deploys.
Deliberately not built mid-deploy; stated with its evidence so it is a decision, not an omission.


---

## 6.9 FIFTH/SIXTH/SEVENTH EXECUTION — v1328 · v1329 · v1330, 2026-08-20, bundle proof 6/6 ×3

Three manual deploys in one evening, closing an eight-lane fleet. **All three passed the §5 proof
first try.** Recorded together because what they establish is one thing.

### 6.9.1 ⛔ THE TRIGGER WAS THE BILLING BLOCK, AND `git push` WAS SILENTLY DOING NOTHING

Not an Actions *outage* (§1) — the **billing block**, and it had been live since **2026-08-19**.
GitHub's annotation, fetched from the API rather than inferred:

> *"The job was not started because recent account payments have failed or your spending limit needs
> to be increased. Please check the 'Billing & plans' section in your settings"*

Signature confirmed against §1's table: **every job failed at 3.0 s with ZERO steps executed** — all
15 of them, including `Lint` and `Isolation`. That is the billing shape, not the queue-forever
outage shape.

⭐ **The compounding fact: `origin/main` was 150 commits behind.** `deploy-fly.yml` has had
`push: main` restored since §OPTION-B (2026-08-05), so the founder's push-to-main workflow *was* the
deploy path — and it had been failing closed, silently, for two days. **Check `git rev-list --count
origin/main..HEAD` BEFORE concluding anything about why prod is stale.** Production had been fed
entirely by manual local-tree builds, which is why nobody noticed the remote was stale.

### 6.9.2 ⭐ THE CONTEXT IS THE WORKING TREE, NOT THE COMMIT — DEPLOY FROM A CLEAN WORKTREE

**This is the durable lesson of the night and it is not in §2.3.**

`fly-manual-deploy.sh` derives `REPO_ROOT` from `BASH_SOURCE`, and the Dockerfile does `COPY . .`.
`GIT_SHA` is stamped from `git rev-parse HEAD` — **but the SHA only labels the image; the CONTENT is
whatever is on disk.** With six subagent lanes mid-flight holding **51 uncommitted files**, running
the script from the main repo would have shipped six half-finished features under a SHA containing
none of them, and the bundle proof would have PASSED — it checks the SHA and the four inlined
values, not whether the tree was clean.

**Procedure:** deploy from `C:/pryzm-deploy/tree` — `git checkout --detach <sha>`, assert
`git status --porcelain` is **EMPTY**, run **that** copy of the script. The `GIT_BRANCH=HEAD`
provenance blemish (see §6.7 note) is the price and it is worth paying.

### 6.9.3 §6 GATE COVER — and an honest gap in the first of the three

CI is dead, so the local cover is the **only** gate.

| | v1328 (`eb3da048`) | v1329 (`11a24609`) | v1330 (`2abdf669`) |
|---|---|---|---|
| root `tsc` | ⛔ **NOT RUN** — tree dirty | ✅ RC=0, 0 errors | ✅ (same tree + 4 files) |
| `test:server` | ⛔ NOT RUN | ✅ 41 files / 613 tests | ✅ |
| in-image §L-442 smoke | ✅ 2335 ms | ✅ 2237 ms | ✅ 2233 ms |
| §5 bundle proof | ✅ 6/6 | ✅ 6/6 | ✅ 6/6 |

⚠ **v1328 shipped without a type-check cover, and that is recorded rather than hidden.** Six lanes
held the tree dirty, so any `tsc` run would have measured a *different tree* than the one deploying.
Reporting a green number from the wrong tree is worse than reporting a gap. §6.8.3's flag was
required and worked: `NODE_OPTIONS=--max-old-space-size=8192`, RC=0 — **without it the same clean
tree exits 134**, which reads exactly like a broken build.

### 6.9.4 ⭐ A SECOND DEPLOY WAS NEEDED BECAUSE A LANE COMMITTED AFTER THE SNAPSHOT

v1329 was cut at `11a24609`. A lane then committed `2abdf669` — **the property-panel widget for the
feature v1329 had just shipped the command layer of.** So v1329 carried a founder request whose UI
did not exist.

**Caught by re-reading the lane's final report against the deployed SHA**
(`git merge-base --is-ancestor`), not by any gate. Nothing in §5 or §6 detects "the deploy is
internally consistent but incomplete against intent."

⛔ **The deploy was NOT killed** — §6.5.9's rule and the "a deploy you killed may still ship" incident
both apply, and the image was already pushed. v1329 was allowed to land and prove, then v1330
followed. **Rule for the next agent: when a fleet is still landing commits, snapshot the SHA LAST,
and re-check `merge-base --is-ancestor` for every lane report that arrives after you start.**

### 6.9.5 Operational notes

* **Builder `fly-builder-shimmering-glow-9973`** — unchanged from §6.8, already
  `shared-cpu-8x:16384MB`. §6.6.2's rule (always `flyctl apps list | grep builder`) still held.
* **§6.5.10 warming worked on all three attempts**, from `suspended`/`stopped` each time. That is now
  **five consecutive successes** against §6.5.9's "0 pushes in 10 attempts". ⛔ Still not evidence the
  flake is fixed — recorded as five data points, per §6.5.10's own self-correction.
* **Upload ran at ~250 KB/s**, not §1's 98 KB/s — ~8 min for ~130 MB. Do not treat §1's table as a
  floor; measure.
* **Docker is NOT installed on this machine and that is FINE** — `--remote-only` builds on the Fly
  builder, and §6.5.6 notes Docker Desktop actively *breaks* it. `env -u DOCKER_HOST` retained as
  cheap defence.
* **Chunk hashes, the §6.5.8 check that separates "shipped" from "still serving the old one":**
  `main-D4sQvlnl.js` → `main-CtRrRhiM.js` (v1328) → `main-ce_wYic8.js` (v1329) → `main-DzvcOfEm.js`
  (v1330). Changed every time.
* **Rollback tags, captured BEFORE each deploy per §5.3:** v1327 `deployment-01M0FMY45NE1CPVPDJQM0E3ZK2`
  · v1328 `deployment-01M0GATE03TYB1JWM6JY20T1AG` · v1329 `deployment-01M0GEBEFP4BS09YPFZK5M5NWF`.

### 6.9.6 What is still owed

**Nothing in the bundle was verified in a BROWSER.** Every lane said so unprompted: reachability was
established at the seam — the store, the resolver, the DOM under happy-dom — not by clicking. The §5
proof establishes that the right bytes are being served, never that the feature works. Those are
different claims and this contract only makes the first.

---

---

## 6.9.4 SIXTH EXECUTION — 2026-08-21 (`a547eff2`), bundle proof 6/6 — AND THE TRIGGER WAS THE **BILLING BLOCK**, NOT AN OUTAGE

**Result: PASSED.** Served chunk moved `main-DOtOKQKJ.js` → `main-5t7Bkd0r.js`; cesium 257 / google 39;
`GIT_SHA` == `a547eff2e5…`; `/api/health/live` `{"ok":true}`. Rollback tag captured **before** deploying:
`pryzm:deployment-01M0H7TR8ZKX19VYVWDQWWHXJY`.

### The trigger — a THIRD distinct signature, and §1 only names two

§1 distinguishes the **Actions outage** (queued 34+ min, no runner) from the **billing block** (jobs die
in 3–4 s, never started). This execution was the **billing block**, and the CI path was attempted first
and correctly:

```
POST .../deploy-fly.yml/dispatches  {"ref":"main","inputs":{"bypass_ci_gate":"true"}}  → 204
run 32455075622  status=completed  conclusion=failure
  JOB "build (16GB runner) + deploy"   started 06:36:25  completed 06:36:29  steps=0   ← 4s, ZERO steps
  JOB "CI must be green … (§L-540-CI-GATE)"  conclusion=skipped                        ← bypass WORKED
```

⭐ **The bypass is not what failed, and reading the run as "the deploy failed" would have sent the next
agent hunting a code defect.** The gate job *skipped* exactly as designed; the build job never started.
**4 seconds with `steps=0` is the billing signature** — the same reading as
[[github-actions-billing-blocks-deploy]]. Two runs on the same SHA failed identically, which is the
dispatch-retry behaviour §L-570 notes, not two different faults.

**How to tell them apart in one call** — the job list, not the run conclusion:

| | steps | duration | conclusion |
|---|---|---|---|
| Billing block | **0** | **3–4 s** | failure |
| Actions outage | 0 | **queued 30+ min** | (never completes) |
| Real code defect | **>0** | minutes | failure at a named step |

### §2.3 + the worktree rule held, and this time it MATTERED

Nine lanes had been running in the main tree. The deploy ran from the detached worktree
`/c/pryzm-deploy/tree` at `a547eff2` with `git status --porcelain` **empty**, per the 2026-08-20 rule
(the script's context is `COPY . .` — it ships the WORKING TREE, and `git rev-parse HEAD` only *stamps*
the SHA). `GIT_BRANCH=HEAD` again — the known provenance blemish, accepted.

⚠ **The docs commits (`133f41b2`, `7880b419`) landed on `main` AFTER the deploy SHA and are NOT in this
image.** That is correct and intended — docs do not enter the bundle — but it means
`/version`'s `git_sha` is deliberately behind `origin/main`. Do not read that as a stale deploy.

### Timing (compare §4.2 / §6.5.4)

Dispatch→proof ≈ **22 min** wall-clock, no retry, first attempt reached a push. Builder
`fly-builder-shimmering-glow-9973` machine `1850352c021ee8` verified at **16384 MB** before launch
(§2.1). Blue-green rolled 4 green machines; one showed `0/1 passing` mid-roll before all four reached
`now ready` — blue served throughout.

---

## 6.9.5 SEVENTH EXECUTION — 2026-08-21 evening (`04a57083`), bundle proof 6/6 — AND THE BLOCKER WAS A TYPECHECK READING WITH A SHELF LIFE

**Result: PASSED.** Served chunk moved `main-CrEFTXal.js` → `main-BLxHPiWI.js`; cesium 257 / google 39;
`/version` `git_sha == 04a57083d6f85b35c53f290d5f4ebb06737f58e0`; `/api/health/live` `{"ok":true}`.
Rollback tag captured **before** deploying (§5.3): `pryzm:deployment-01M0JP4T7J255ASN1Z4AXTSBCJ`.
**18 commits**, five lanes (DIM46, LINK2, RAC4, UBG1, ANLZ2). Dispatch→proof ≈ 24 min, first attempt.

### The blocker was not infrastructure — and the reading that named it EXPIRED

The deploy was held by **two `TS6133` errors** (`carbonCsv.ts:96`, `MedicionesTimeCarbon.ts:359`).
Neither lane's *targeted* `pnpm --filter` typecheck saw them; only the **root**
`NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck` did — which is
[[build-uses-stricter-root-tsc]] recurring, and is why §3 requires the root run and not a filtered one.

⭐ **The instructive part is what happened next.** *Two* lanes independently reported those errors as
live and deploy-blocking. By the time the second report was read, **lane DIM46 had already fixed them**
and root `tsc` was exit 0. Both readings were **true when taken and false when read**.

> **In a shared tree with N live lanes, a typecheck reading has a shelf life of minutes.** Treat a
> lane's "tsc is red" as a *timestamped observation*, never as current state — **re-run it at the
> deploy gate yourself**. The correct handling is what UBG1 did: strike the claim through in the
> ISSUE-LOG rather than delete it, because a reading that decays is the argument for re-running the
> command, not evidence the lane was careless.

### `/version` is deliberately behind `origin/main` AGAIN — for a NEW reason

§6.9.4 recorded docs commits landing after the deploy SHA. This time it is **source**: `f84516d5` +
`9afdc851` (the repo-wide NUL sweep) landed on `main` after `04a57083` and are **not in this image**.
That is safe **because the change is byte-identical at runtime** — ten raw `0x00` bytes inside string
literals rewritten as `\u0000` escapes, so the emitted JS is unchanged; the fix exists to make those
files visible to `grep`, which had been silently skipping them as *binary*. **Verify that
byte-identity claim before assuming any future post-SHA commit is equally harmless** — "it's only
hygiene" is not a property you can read off a commit message.

---

## 6.9.6 EIGHTH EXECUTION — 2026-08-22 (`fbea29f2`), bundle proof 6/6 — DEPLOYED WITH A LANE LIVE IN THE TREE

**Result: PASSED.** Served chunk `main-DrFBo7EY.js` → **`main-BrCcxFlJ.js`**; cesium 257 / google 39;
`/version` `git_sha == fbea29f2a5…`; `/api/health/live` `{"ok":true}`. Rollback tag captured **before**
deploying (§5.3): `pryzm:deployment-01M0M2JF4DJTF9G633JR2F8CRC`. Builder verified **16384 MB** (§2.1).
Two deploys in one morning — `04a57083` (6.9.5), then `f48d11d7`, then this.

### ⭐ The new condition this execution ran under: a SUBAGENT WAS EDITING THE TREE

Lane WIN5 was live in the working tree when the deploy was staged. That is the exact scenario §6.9.5
recorded as *"a typecheck reading has a shelf life of minutes"* — so the root `tsc` was **re-run at
the gate**, not reused from ten minutes earlier, and `git status --porcelain` was **read immediately
before** the worktree checkout to confirm the lane had not landed a partial edit.

**The check that matters is not "is tsc green" but "is tsc green ON THE SHA I AM ABOUT TO SHIP".**
The deploy worktree is detached at an explicit SHA, so a lane committing mid-deploy cannot reach the
image — but a lane's UNCOMMITTED edit in the MAIN tree can absolutely reach a `tsc` run in the main
tree and make a green reading meaningless in either direction. Both were checked; both clean.

⚠ **WIN5's work is NOT in this image**, by construction, and that is correct — a deploy names a SHA.

### Timing

Dispatch → proof ≈ **21 min**, first attempt, no retry. Blue-green rolled cleanly.
