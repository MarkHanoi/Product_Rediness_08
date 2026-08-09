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

---

**Cross-references:** `.github/workflows/deploy-fly.yml` (the authority on the arg block) ·
`Dockerfile` L32, L96–L123, L159–L166 (the authority on ARG names) · `fly.toml` ·
`docs/04-reference/ISSUE-LOG.md` L-690 · memory `fly-production-deploy.md`
