# Deployment runbook — how PRYZM reaches production

**Written 2026-07-21, the day the CI gate (L-540) and the R2 bucket (L-570/571) landed and the repo
went private.** Facts here were verified against the workflows and the live account, not recalled.

Production: **https://pryzm.fly.dev** · Repo: `MarkHanoi/Product_Rediness_08` (**PRIVATE** since
2026-07-21) · Host: Fly.io.

---

## 1. The normal path

**Deploy = push to `main`.** Two workflows fire on the same push, in parallel:

| Workflow | Role |
|---|---|
| `ci.yml` | lint · isolation · command-manager · test-server · test-unit · test-root · apex-gates |
| `deploy-fly.yml` | `ci-gate` job → then `deploy` (`flyctl deploy --local-only`) |

Add a marker line to `.github/workflows/deploy-fly.yml` describing what to test:

```
# deploy-marker: vNNN — <what changed, what to click, what to watch in console>
```

The marker is the change log AND the test script. Bump `vNNN` every deploy.

⚠ **Rapid pushes CANCEL in-flight deploys.** The content still lands in the newest successful
deploy — but a "cancelled" run is not a failure, so don't debug one.

⚠ **The service worker is network-first** → **hard-refresh** after every deploy or you test the old
bundle.

---

## 2. The CI gate (L-540) — read this before you "fix" a blocked deploy

Before 2026-07-21, `deploy-fly.yml` had **no dependency on `ci.yml`**. A red CI deployed to
production anyway; v256–v267 all shipped ungated with a red suite. The gate closed that.

`deploy` now `needs: ci-gate`, which queries the Actions API for the CI run **on that exact SHA**:

| Situation | Result |
|---|---|
| All required jobs green | ✅ deploy |
| Any required job red | ❌ blocked |
| **No CI run at all on a code commit** | ❌ **blocked** (fails CLOSED — deliberate) |
| Doc-only commit | ✅ but only after the gate **re-derives** doc-only-ness from the diff |
| API timeout | ❌ blocked |
| `bypass_ci_gate` dispatch input (default `false`) | ✅ recorded in the run inputs |

**It deliberately does NOT wait for CI's `build` job** — `flyctl deploy --local-only` rebuilds the
same tree with the same command, so waiting would triple the push→prod loop (~15 → ~45 min) for zero
extra safety.

**A blocked deploy is usually the gate working.** Check whether CI is red or absent *before*
touching the deploy config.

---

## 3. ⚠ THE BILLING TRAP — the #1 cause of a mystery deploy failure

**Signature:**

```
The job was not started because recent account payments have failed
or your spending limit needs to be increased.
CI must be green for this SHA (§L-540-CI-GATE)
```

**This is BILLING, not code.** Read it in the right order: the payment problem meant **CI never ran**
→ the gate found no run on that SHA → the gate failed closed. The second line is a *consequence*, not
an independent fault. Do not go looking for a test failure.

**Why it happens:** public repos get unlimited free GitHub-hosted Actions minutes. **Private repos
are metered** (2,000 min/month free, no payment method required). Going private on 2026-07-21 is what
surfaced this. PRYZM builds run ~10–20 min each, so a heavy testing day can consume the free tier.

**Diagnose — Settings → Billing & plans:**
1. **Stale/failed card on file?** It can block everything, *including the free tier*. Remove or fix
   it — this costs nothing and is the most common cause.
2. **Spending limit at $0?** That is the default and is fine; it only blocks *overage*.
3. **Free minutes actually exhausted?** Then choose from §4.

---

## 4. Free + private options (chosen when you do not want to pay)

### ⚠ FIRST — going private ALSO HALVES THE RUNNER, and this build is at the edge
GitHub-hosted `ubuntu-latest` is **4-core / 16 GB on PUBLIC repos** but **2-core / ~7 GB on PRIVATE
repos**. This build peaks at ~5.5 GB heap + native ≈ **~7 GB** (`NODE_OPTIONS=--max-old-space-size=
6144`). **So private is not just metered, it is a smaller machine — fixing billing may still leave
you OOM-ing.** Public is free *and* bigger.

### ⚠ TWO "obvious" free options that DO NOT WORK on this repo — verified, do not retry
- **`flyctl deploy --remote-only`** — Fly's remote/Depot builder **OOMs at exit 137** on this build
  and cannot be resized. *(Recommended in error on 2026-07-21 before the project history was
  re-read; corrected same day.)*
- **`flyctl deploy --local-only`** — needs Docker (**NOT installed**) and more RAM than the founder's
  machine has (11.7 GB total vs a ~7 GB build). A self-hosted runner inherits that same ceiling:
  plausible, unproven, not a safe default.

### ✅ A. The PUBLIC-REPO WINDOW — the confirmed free recipe (verified 2026-06-05, run #99 → Fly v30)
GitHub bills Actions by visibility **at run time**, so public = free unlimited **and** the 16 GB
runner. (1) make the repo public; (2) trigger the deploy while public; (3) wait for green; (4)
optionally revert `deploy-fly.yml` to `workflow_dispatch`-only; (5) make private again — a reverting
push whose commit has no `push:` trigger does not start a run.
**Risk:** source is briefly world-visible (scrapers watch the new-public-repo firehose).
**Actions SECRETS are NOT exposed by going public** — they are stored separately.

### B. Pay for private minutes
Fix the card / raise the Actions spending limit (§3). ⚠ Still subject to the 7 GB private runner
above — confirm the build fits before relying on it.

### C. Self-hosted runner — the proper end state, but unproven here
Minutes are metered only on GitHub-*hosted* runners, so this is free on a private repo AND keeps the
CI gate. Needs Docker and enough RAM; see the ceiling above. Worth a quiet hour, not a deadline.

**Recommendation on 2026-07-21: use A.** Days from launch, testing constantly — a proven free path
that keeps the gate beats an unproven private one.

---

## 5. Secrets (GitHub → Settings → Secrets and variables → Actions)

| Secret | Used for |
|---|---|
| `FLY_API_TOKEN` | `flyctl deploy` auth |
| `VITE_CESIUM_TOKEN` | Cesium ion / photoreal globe |
| `VITE_GOOGLE_MAPS_KEY` | Google Photorealistic 3D Tiles |
| `R2_ACCOUNT_ID` | R2 S3 endpoint `https://<ID>.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` | R2 asset sync |

**R2 bucket:** `pryzm-assets`, prefixes `items/` (furniture GLB) and `tiles/` (context PMTiles).
**Public base URL (not secret):** `https://pub-1ad4f6c5dec849b5b25a45586898fd4d.r2.dev`
Account: the Cloudflare account owning `flat-morning-358d.antoniocanerosan.workers.dev` and the
`pryzm*.pages.dev` sites — R2 must live in **that** account or the no-egress benefit and the cache
rules do not apply. See `OBJECT-STORAGE-R2-DECISION.md`.

### ⚠ `VITE_*` are BUILD-TIME
Vite **inlines** them into the bundle. They must be in the **build step's env in
`deploy-fly.yml`**, not only as Fly runtime secrets. Getting this wrong **fails silently** — the
build succeeds and the app keeps requesting the old paths. **Verify by grepping the built bundle for
the expected host, never by assuming.**

---

## 6. Before you push

- Root `npx tsc --skipLibCheck --noEmit` **clean** — the Fly build is strict (`noUnusedLocals`); an
  unused import hard-fails it.
- A new dependency **must** commit `pnpm-lock.yaml` in the **same** commit or the build breaks on
  `--frozen-lockfile`.
- Commit with **explicit pathspecs**. Never `git stash` / `git reset --hard` / `git add -A` — this
  tree often has several agents' uncommitted work in it, and `deploy-fly.yml` in particular has held
  three agents' markers at once.
- **Check `git status -sb` for `[ahead N]`.** On 2026-07-21 a deploy "failed to run" simply because
  the commit had never been pushed.

---

## 7. Failure triage

| Symptom | Meaning |
|---|---|
| "job was not started … payments failed" | **§3 billing.** CI never ran. Not a code fault. |
| "CI must be green for this SHA" *alone* | CI ran and is **red** — read `ci.yml`, fix the tests. |
| Run says **cancelled** | A newer push superseded it. Content lands in the newest run. |
| Deploy green, prod looks old | **Hard-refresh** (SW is network-first). |
| Build fails on `tsc` | Usually an unused import; strict mode. |
| `/items/*.glb` 404 | R2 wiring (`VITE_GLB_URL`) — see §5. |
| Nothing running at all | `git status -sb` — is the commit actually pushed? |

**Cross-refs:** `OBJECT-STORAGE-R2-DECISION.md` · audit rows **L-540** (gate), **L-543**
(`--if-present` skips 130/166 workspaces), **L-544** (`test:pryzm1` red), **L-570/571** (R2) ·
`STATUS-REPORT-2026-07-21.md` §4.
