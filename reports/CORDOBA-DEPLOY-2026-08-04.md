# Córdoba deploy to production — 2026-08-04

> **Point-in-time evidence snapshot.** Documents exactly how today's Córdoba envelope work
> (commit `db91ae55`) reached `https://pryzm.fly.dev/`, including a real mid-deploy failure and
> its recovery. Not a living document — the deploy METHOD it documents (direct `flyctl deploy`,
> not GitHub Actions) is current as of this date per `.github/workflows/deploy-fly.yml`'s own
> header (§OPTION-A, 2026-07-23); check that file if this ever seems stale.

---

## What was deployed

Commit `db91ae55` — "feat(cordoba): close MC height + PT-CV, ship full CUS/AR/PEPCH corpus,
prove citywide digitization path". Full content: `git show db91ae55 --stat`. Summarized in
`docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/SESSION-SUMMARY-2026-08-04.md`.

Pre-deploy gate: `packages/site-parcel-data` full suite, 2766/2766 passing, run directly
(not taken on any agent's word) immediately before commit.

## The deploy method — and why it's NOT in GitHub Actions history

`deploy-fly.yml`'s own header states push-deploy was disabled 2026-07-23: production deploys now
run **directly from the dev machine** via

```
flyctl deploy --remote-only -a pryzm
```

The Actions workflow (`workflow_dispatch`, with a `bypass_ci_gate` emergency input) is retained
only as a manual fallback. **A direct `flyctl deploy` run never appears in the Actions run
history** — that's expected, not a sign anything failed silently. Verification of a direct
deploy has to happen against Fly itself (`flyctl status`, a live fetch of the URL), not GitHub.

## Timeline

| Time (local) | Event |
|---|---|
| — | Committed `db91ae55` after independently re-running the full test suite |
| — | `flyctl deploy --remote-only -a pryzm` — attempt 1 |
| mid-deploy | New image built and pushed (`deployment-01KZ7AGPN9FDEY9C8JDG466FBV`); 2 new "green" machines created, one started healthy |
| mid-deploy | **Local internet connectivity dropped.** `dial tcp: lookup api.machines.dev: no such host` / `api.fly.io: no such host` — Fly's control-plane became unreachable from this machine, not a Fly-side outage |
| — | Attempt 1 failed (`wait timeout — could not get all blue machines into stopped state`), leaving mixed state: 4 machines total, 2 on the old image (stopped), 2 on the new image (1 started+healthy, 1 stopped+warning) |
| — | **Verified before touching anything further**: `flyctl status` (real machine states) + a live fetch of `https://pryzm.fly.dev/` — confirmed the site was still up and serving real content on the one healthy new machine, i.e. degraded but not down |
| — | Connectivity restored. `flyctl deploy` — attempt 2 |
| — | Attempt 2 failed FAST and CLEANLY: Fly's own blue-green strategy detected 2 different images across the app's machines and refused to proceed, printing the exact remediation — destroy the stale-image machines by ID |
| — | Destroyed exactly the 2 stopped, already-superseded old-image machines by explicit ID (`08053e6b095e68`, `6835e29c60e228`) — never touched the machine that was actively serving traffic |
| — | `flyctl deploy` — attempt 3 |
| — | **Clean success.** 2 new green machines created, both passed health checks (`1/1 passing`), old ones cordoned → stopped → destroyed in order by Fly's own blue-green orchestration |
| — | Confirmed: `flyctl status` shows both machines on the new image; live fetch of `https://pryzm.fly.dev/` returns real HTML (nav, hero copy, working links) |

## What actually went wrong, precisely

**Not** a code problem, **not** a Fly-side outage, **not** a CI/build failure — the image built
and pushed successfully on every attempt. The single root cause was a local network/DNS drop
during attempt 1, at the exact moment the deploy needed to poll Fly's Machines API to complete
the blue→green cutover. That left a real, verifiable-but-recoverable inconsistency (old and new
images coexisting) that Fly's own tooling detected and gave a named fix for on the next attempt.

## Why this is documented as a report and not just a chat message

So a future reader — human or agent — hitting "found multiple image versions" or a Fly deploy
that seems to vanish from GitHub Actions has a real precedent: check `flyctl status` directly,
verify the site is actually still serving before assuming an outage, and use Fly's own printed
remediation rather than guessing.

## Verification commands, for reproduction

```
flyctl status -a pryzm
flyctl deploy --remote-only -a pryzm
```

Live check: fetch `https://pryzm.fly.dev/` and confirm real page content, not a proxy/placeholder
response.
