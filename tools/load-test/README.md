# PRYZM load harness (L-800)

**The one artefact that turns every capacity claim in
`docs/03-execution/analysis/production-readiness-1000-users-2026-08-09.md` from a
derivation into a measurement.**

Until this runs, the "~50 concurrent live editors" figure in `fly.toml:105` is a
**comment**, and so is every number that argues with it — including mine. The
audit's verdict does not depend on the harness (the single-machine and
no-Socket.io-adapter findings are structural, not empirical), but the *ordering*
of everything after tranche 1 should.

## Why k6

- Scriptable in JS, so the scenario reads like the product's actual flow rather
  than a URL list.
- Native **WebSocket** support — mandatory here, because the interesting
  bottleneck is Socket.io fan-out, not HTTP throughput, and an HTTP-only tool
  would return a reassuring green while missing the thing that breaks.
- Thresholds are first-class, so a run either passes a stated budget or fails.
  A load test with no pass/fail is a benchmark, and benchmarks get argued with.
- Single static binary; no runtime added to the repo's dependency tree.

## Install

k6 is deliberately **not** a package.json dependency — it is a binary, and
adding a postinstall download would slow every `pnpm install` for a tool used
a handful of times per quarter.

```bash
# macOS
brew install k6
# Windows
winget install k6 --source winget
# Linux / CI
sudo apt-get install -y gnupg && \
  curl -s https://dl.k6.io/key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/k6.gpg && \
  echo "deb [signed-by=/usr/share/keyrings/k6.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list && \
  sudo apt-get update && sudo apt-get install -y k6
```

## Run

```bash
# Smoke — 5 VUs, ~1 min. Proves the scenario and the credentials work.
#   ALWAYS run this first. A 1,000-VU run that fails on a typo in a selector
#   wastes twenty minutes and produces a scary graph that means nothing.
k6 run -e STAGE=smoke  -e BASE_URL=https://pryzm.fly.dev \
       -e PRYZM_EMAIL=... -e PRYZM_PASSWORD=... tools/load-test/pryzm-load.js

# Ramp — 0 → 200 VUs. Finds the knee. Expected to pass after tranche 1.
k6 run -e STAGE=ramp   -e BASE_URL=... -e PRYZM_EMAIL=... -e PRYZM_PASSWORD=... tools/load-test/pryzm-load.js

# Target — 1,000 VUs. Expected to FAIL today; that is the point.
k6 run -e STAGE=target -e BASE_URL=... -e PRYZM_EMAIL=... -e PRYZM_PASSWORD=... tools/load-test/pryzm-load.js
```

## ⚠ Read before pointing this at production

1. **`STAGE=target` is a denial-of-service against your own single machine.**
   `fly.toml` runs ONE `shared-cpu-1x` with `min_machines_running = 1` and no
   autoscaling. 1,000 VUs will take the site down for real users for the
   duration, and quite possibly OOM the box (L-770). Run it against a staging
   app — except **there is no staging app**: `fly.toml:18-19` describes a
   `fly.staging.toml` that does not exist (also L-770). Creating one is a
   prerequisite for the `target` stage, not an optional nicety.
2. **The write path creates real rows.** `WRITE_RATIO` defaults to `0` for this
   reason. Every project it creates is named `k6-load-<runId>-<vu>` so a sweep is
   a single `DELETE ... WHERE name LIKE 'k6-load-%'`, but nothing here cleans up
   automatically — deleting rows from a database under load is not something a
   test tool should decide to do.
3. **Rate limits will fire and that is a finding, not noise.** All three limiters
   are per-IP (L-790), so a load generator on one IP hits `apiLimiter` (600/min)
   almost immediately. Set `PRYZM_LOAD_BYPASS` only if the server has been taught
   to honour it; otherwise read the 429s as the measurement they are.
4. **`autosave` is the expensive scenario.** It posts a synthetic snapshot sized
   by `SNAPSHOT_KB` (default 512 KB — a *small* project; the real measurement in
   the audit is ~16.6 MB for 793 elements, L-786). Raising it toward reality is
   how you reproduce the write-throughput wall; do that deliberately.

## What each scenario measures, and which finding it tests

| Scenario | Flow | Finding under test |
|---|---|---|
| `hub` | `GET /api/v1/projects` | L-788 (index), L-798 (LATERAL ×50) |
| `open` | `GET /api/v1/projects/:id/model` | L-788, L-786 (snapshot egress) |
| `socket` | Socket.io connect → `join-project` → `cursor-move` | L-770 (fan-out, no adapter), L-336 (owner-only join) |
| `autosave` | `POST /api/projects/:id/versions` | L-786, L-787 (pool), L-792 (lock scope) |

## Interpreting the result

The thresholds encode the audit's claims. A **failing** threshold is a confirmed
finding; a **passing** one falsifies my estimate and should be written back into
the ISSUE-LOG row, not quietly ignored. Both outcomes are useful — the whole
point of shipping the probe before the fix is that it is allowed to disagree
with the person who wrote the plan.

Record every run in `docs/03-execution/analysis/` with the stage, the commit SHA,
and the raw k6 summary. An unrecorded run is an anecdote.
