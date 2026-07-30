# Runbook — deploy to Fly.io WITHOUT needing "Git" open

**Study, not a change.** Written 2026-07-22. Nothing in the pipeline was modified to produce this
document. Every claim below is tagged **[VERIFIED-FROM-CODE]** (read out of the repo today) or
**[INFERRED]** (a hypothesis the repo cannot fully confirm — see Open Questions).

**The ask:** the founder currently reports that "Git" must be *open* for a deploy to reach Fly
("git was closed — now you can deploy to fly as it is opened"). This runbook explains why, and
gives a ranked set of ways to remove that dependency, with the exact setup commands for the
recommended one.

Sibling doc: `docs/04-reference/runbooks/DEPLOYMENT-RUNBOOK.md` (the normal happy-path). This runbook is
narrower — it is only about the *credential / trigger* coupling that makes "Git open" matter.

---

## 1. How a deploy actually works today  [VERIFIED-FROM-CODE]

Source of truth: `.github/workflows/deploy-fly.yml`, `fly.toml`, `Dockerfile`, `package.json`.

1. **Trigger — it is push-to-deploy.** `deploy-fly.yml` fires on:
   ```yaml
   on:
     push:
       branches: [main]
     workflow_dispatch:
       inputs:
         bypass_ci_gate: { type: boolean, default: false }
   ```
   So **the normal deploy action is `git push origin main`.** No REST dispatch is *required* — a
   push is enough. `workflow_dispatch` exists only as a manual/emergency lever (and is the only way
   to set `bypass_ci_gate`).

2. **Gate.** A cheap `ci-gate` job asks the GitHub API what `ci.yml` concluded for *this exact SHA*
   and refuses to proceed unless the required jobs are green
   (`lint isolation command-manager test-server test-unit test-root apex-gates`). Doc-only pushes
   are re-derived from the diff and allowed through. (L-540.)

3. **Build + deploy.** The `deploy` job runs on GitHub's `ubuntu-latest` (16 GB RAM + Docker) and
   builds the image *on the runner* with:
   ```bash
   flyctl deploy --local-only --build-arg LOWMEM=0 --strategy=rolling --wait-timeout=5m
   ```
   authorised by the repo Actions secret **`FLY_API_TOKEN`** (`env: FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}`).
   The runner builds the ~3624-module client (`node --max-old-space-size=6144`, peaks ~5.5–6 GB
   heap — `package.json#build`, `Dockerfile ARG LOWMEM`) and pushes the finished image to Fly's
   registry. Retries up to 3× for the health-check race.

4. **`--local-only`, not the managed builder — on purpose.** The header comment and the memory
   record both state Fly's **managed builder OOM-kills this build at exit 137** and can't be resized
   from the CLI, so both `--remote-only` and `--depot` were tried and failed. That is *why* the
   build is pinned to the 16 GB GitHub runner.

**Net:** `git push origin main` → `deploy-fly.yml` → `ci-gate` → `flyctl deploy --local-only` on a
GitHub runner using `secrets.FLY_API_TOKEN` → image to Fly. **No developer machine builds or
uploads anything.** The only thing the founder's box must do is *push the commit to GitHub*.

---

## 2. Why "Git open" is required  [VERIFIED-FROM-CODE for the mechanism; INFERRED for which app]

**Verified facts about this checkout:**
- Remote is **HTTPS**, not SSH:
  `origin  https://github.com/MarkHanoi/Product_Rediness_08.git`
- The configured credential helper is **`manager`** (Git Credential Manager / GCM), set globally in
  `C:/Program Files/Git/etc/gitconfig` → `credential.helper manager`.

**The mechanism [VERIFIED-FROM-CODE]:** an HTTPS push to `github.com` must present a credential.
Git obtains it by shelling out to the credential helper (`git credential fill` → GCM). The 36-day
memory note `fly-production-deploy.md` records the same coupling from the agent side: when the agent
dispatches via REST instead of pushing, it reads the PAT with
`... | git credential fill | ...` — i.e. **through the very same GCM path**. Either way, a deploy
cannot start until GCM hands over a valid GitHub token.

**Therefore "Git open" == "the credential helper can serve the GitHub PAT."** When that credential
is unavailable, `git push` (and the REST-dispatch fallback) fails auth, no workflow run is created,
and nothing deploys. Opening "Git" makes the token available again.

**What could NOT be verified from the repo — needs founder confirmation:**
- **Which app the founder calls "Git."** The repo says the helper is `manager` (GCM). GCM normally
  reads tokens from the **Windows Credential Manager** and does *not* need any app running. So the
  observed "must be open" behaviour is **[INFERRED]** to be one of:
  - (a) The founder pushes through **GitHub Desktop** (calling it "Git"); Desktop must be open to
    perform the push, or Desktop is what actually holds/refreshes the OAuth token that GCM returns.
  - (b) The stored credential is a **short-lived OAuth token** (GCM's GitHub OAuth mode) that only
    stays fresh while the GitHub app/helper is running; closed → stale → auth fails.
  - (c) A per-session token that never got written to the persistent Windows store.
  In all three, the fix is the same shape: **make a long-lived token available headlessly** so no
  app has to be running. See §3.

---

## 3. Options to remove the "Git open" dependency

Effort/risk are for a **solo founder on Windows 11**. "Removes Git-dep?" = does it stop requiring an
app/live helper. "Removes Actions-billing dep?" = does it also stop the deploy from depending on
GitHub Actions minutes (the recurring ~3-second, zero-step, billing-caused failures noted in memory
`github-actions-billing-blocks-deploy.md`).

| # | Option | Effort | Removes Git-dep? | Removes Actions-billing dep? | Risk |
|---|--------|--------|------------------|------------------------------|------|
| **1** | **Persist a classic PAT in the OS credential store** so `git push origin main` (already the deploy trigger) authenticates headlessly, no app open. Keeps the entire proven Actions/16 GB build. | **Tiny** | **Yes** | No | **Low** — token-at-rest on the box |
| 2 | **REST-dispatch driven by a `GH_TOKEN` env var** (same PAT, stored as a user env var), agent POSTs `workflow_dispatch`. Alternative wiring of the same token; only needed if push itself is undesirable. | Small | Yes | No | Low |
| 3 | **`flyctl deploy --local-only` from the founder's machine** with a stored **Fly deploy token**. Bypasses GitHub entirely. | High | Yes | **Yes** | **High** — needs Docker Desktop + a local 6 GB build + a ~1.2 GB image push over a slow uplink (memory: local upload already aborted once) |
| 4 | **`flyctl deploy --remote-only` (or `--depot`)** with a stored Fly deploy token. No local build, no Actions. | Medium | Yes | **Yes** | **High** — memory records the managed builder **OOM-kills this build (exit 137)** and can't be CLI-resized; likely fails as-is |
| 5 | **Fly native GitHub integration / GitHub App** | Medium | Yes | Partly | **High** — its build runs on Fly's managed builder → same OOM as #4; not viable for this build |

**Reading of the table.** The build is the constraint. The only options that also kill the
Actions-billing dependency (#3, #4, #5) all reintroduce the **exact build problem the current
pipeline was designed around** — either a heavy local build + slow upload, or the managed-builder
OOM. So *removing Git-open* and *removing Actions-billing* are **two different problems** and should
not be solved together: option 1 cleanly solves the first at near-zero risk; the second is a
separate, harder decision. **[INFERRED]** — the OOM/upload claims come from the memory notes and the
workflow header, not from a re-run today.

---

## 4. RECOMMENDATION — Option 1: persist the PAT, keep push-to-deploy

Rationale: the workflow is *already* `on: push`, so nothing about the pipeline needs to change. The
whole problem is that the GitHub credential isn't available headlessly. Store a long-lived classic
PAT in the OS credential store once, and `git push origin main` deploys forever with no app open.
Zero pipeline change, keeps the proven 16 GB Actions build, lowest risk.

### 4.1 Create the token (GitHub, in a browser)
1. github.com → Settings → Developer settings → **Personal access tokens → Tokens (classic)** →
   Generate new (classic).
2. Scopes: **`repo`** and **`workflow`** (workflow is needed so the token may also drive
   `workflow_dispatch` if ever required).
3. Set a long expiry (or no expiry) and copy the 40-char token.

### 4.2 Store it headlessly so no app is needed (pick ONE)

**A — via Git Credential Manager (matches the existing `manager` helper; recommended):**
```powershell
# PowerShell. Writes the PAT into Windows Credential Manager under github.com,
# where GCM will serve it to `git push` with NO app running.
"protocol=https`nhost=github.com`nusername=MarkHanoi`npassword=<PASTE_PAT>`n" | git credential approve
```
Verify it is served headlessly (close GitHub Desktop first, then):
```powershell
"protocol=https`nhost=github.com`n" | git credential fill   # should echo back username + password
```

**B — via the plaintext store helper (simplest, token sits in a file):**
```powershell
git config --global credential.helper store
git push origin main    # enter username = MarkHanoi, password = <PAT> once; it is saved to ~/.git-credentials
```
Trade-off: the token is stored in cleartext at `%USERPROFILE%\.git-credentials`. Fine for a
single-owner dev box; do not use on a shared machine.

### 4.3 Deploy from then on
```powershell
git add -A
git commit -m "…"
git push origin main        # <-- this is the deploy. No app open.
```
Then follow the normal verification in `DEPLOYMENT-RUNBOOK.md`:
```powershell
# wait ~4–6 min, then:
Invoke-RestMethod https://pryzm.fly.dev/api/health/ready   # expect { ok = True }
```
Hard-refresh the browser after deploy (service worker is network-first).

**What this does NOT fix:** the Actions-billing failure mode (deploys dying in ~3 s with zero
steps). That is orthogonal — see §5.

---

## 5. The Actions-billing failure mode (the possibly bigger win)

Memory `github-actions-billing-blocks-deploy.md` records deploys repeatedly dying in ~3 seconds with
**zero steps executed** — a billing/quota cap on GitHub Actions, not a code failure. Option 1 does
**not** touch this: it still runs on Actions.

The only clean escape is to **move the build off Actions** — i.e. Option 3 (`--local-only` locally)
or Option 4 (`--remote-only`). Both run into the build constraint:
- **Option 4 (`--remote-only`)** would be the ideal "two birds" fix (no Git, no Actions) *if* Fly's
  managed builder had the RAM. Memory says it OOMs at exit 137 and can't be resized from the CLI.
  **This deserves a fresh check** — Fly's remote-builder sizing and the `--depot` path have changed
  over time; a one-off experiment (`fly deploy --remote-only` with a bigger builder, or `--depot`)
  might now succeed and would be the single best outcome. **[INFERRED — verify by experiment, do not
  assume it still OOMs.]**
- **Option 3 (`--local-only` locally)** definitely works memory-wise (same command the runner uses)
  but needs Docker Desktop on Windows, a ~6 GB local build, and a ~1.2 GB image upload over the
  founder's uplink (which aborted once before).

**Recommendation on billing:** treat it as a separate task. Ship Option 1 now for the Git-open pain;
then run a **timeboxed spike** on Option 4 (`--remote-only` / `--depot` with a resized builder) as
the candidate that kills *both* the Git-open and the Actions-billing dependency in one move.

---

## 6. Open questions (need founder confirmation)

1. **Which app is "Git"?** GitHub Desktop, GitKraken, the GCM tray, or something else? This decides
   whether §4.2-A alone is sufficient. *Exact question:* "When you say 'Git is open', which program's
   window/icon is that — GitHub Desktop, or something else?"
2. **How do deploys get triggered today — you pushing, or the agent?** If the agent pushes/dispatches
   on your behalf, the token must be readable by the agent's shell (Option 2's env-var wiring may be
   cleaner than the credential store). *Exact question:* "When a deploy happens, are you clicking
   Push in an app, or is Claude running `git push` / a REST dispatch for you?"
3. **Is the stored GitHub credential an OAuth token or a PAT?** If OAuth (expiring), that alone
   explains the "must be open" behaviour and §4's PAT swap fixes it outright. *Exact question:* can
   you open Windows Credential Manager → Windows Credentials and tell me if there's a `github.com`
   entry, and whether it looks like a token or an OAuth blob?
4. **Actions billing status.** Is the account on a plan/quota that has been hitting the cap? That
   decides how urgent the §5 spike is.

---

## 7. Do this next (fastest safe path)

Create a **classic PAT** (`repo` + `workflow`, long expiry) and store it headlessly with
`"protocol=https`nhost=github.com`nusername=MarkHanoi`npassword=<PAT>`n" | git credential approve`
(§4.2-A). Close "Git" entirely, then confirm `git credential fill` still returns the token and that a
plain `git push origin main` kicks off the `Deploy to Fly.io` run. That removes the Git-open
dependency today with **zero change to the deploy pipeline** and near-zero risk, because push-to-main
is *already* the deploy trigger — the only thing missing was a credential the machine can serve
without an app running. Leave the Actions-billing problem for a separate, timeboxed `--remote-only`/
`--depot` spike (§5), which is the only path that can retire the Actions dependency too.
