# DEPLOY CONTRACT — MANUAL FLY PATH (Actions-outage fallback)

**Status:** ACTIVE · **Established:** 2026-08-06 · **First execution:** v1204 (`c13a11f1`)
**Scope:** deploying `pryzm` to Fly.io **without** GitHub Actions.
**Supersedes nothing.** `.github/workflows/deploy-fly.yml` remains the default path.

> Every claim in this document is traceable to the 2026-08-06 session that produced it.
> Numbers are measured, not estimated, unless explicitly marked. Where something was not
> verified, it says so.

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
| `npx tsc -p tsconfig.json --noEmit` | **clean** (exit 0) |
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
