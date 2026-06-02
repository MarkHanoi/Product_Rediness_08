# ADR-053 — Lockfile-drift policy + CI gate

| Field | Value |
|---|---|
| Status | **ACCEPTED 2026-06-02** (CI gate IMPLEMENTATION pending) |
| Closes | recurring `ERR_PNPM_OUTDATED_LOCKFILE` failures on Cloudflare Pages deploys |
| Owner | Build & deployment infrastructure |
| Constraint reference | C05 (persistence + file format — extended here to "deployable workspace"); C00 (CI gates inventory) |
| Touches | `pnpm-lock.yaml` (the artefact); `.github/workflows/ci.yml` (the gate); `scripts/check/check-lockfile-drift.mjs` (the script) |

---

## Context

Cloudflare Pages' auto-installer ignores our `NPM_FLAGS=--version` directive for pnpm projects and runs `pnpm install --frozen-lockfile` regardless. Any drift between `pnpm-lock.yaml` and a workspace `package.json` fails the deploy with `ERR_PNPM_OUTDATED_LOCKFILE`.

This bit us today: a workspace `package.json` change (`@pryzm/schemas` added to `plugins/ifc-export`) was committed without regenerating the root `pnpm-lock.yaml`. Local dev didn't catch it because `pnpm install` defaults to `--no-frozen-lockfile` outside CI. The drift propagated to `main` and broke the first marketing-site deploy.

The mitigation we shipped today — `SKIP_DEPENDENCY_INSTALL=true` + `pnpm install --no-frozen-lockfile` in the build command — **hides the drift from the deploy** but doesn't prevent it. A drifted lockfile can still ship with a stale dep tree; nobody notices until a runtime crash exposes the wrong version.

An enterprise app cannot tolerate "build green, ship stale" silently. We need a **hard CI gate** that fails any PR whose lockfile is out of sync with its workspace `package.json`s.

---

## Decision

### §1 — Drift is a CI failure, not a deploy failure

The deploy MUST be tolerant of drift (so a small drift doesn't take down `pryzm.so`). The PR check MUST be intolerant of drift (so the drift never reaches `main`).

Two layers:

| Layer | Behaviour | Lives in |
|---|---|---|
| **CI gate (this ADR)** | Runs `pnpm install --frozen-lockfile` on every PR; fails if drift exists. The PR cannot merge to `main` until the lockfile is regenerated locally + committed. | `.github/workflows/ci.yml` + `scripts/check/check-lockfile-drift.mjs` |
| **Cloudflare deploy** | Tolerant: `SKIP_DEPENDENCY_INSTALL=true` + `pnpm install --no-frozen-lockfile`. Belt-and-braces only; the gate above should never let drift reach the deploy in the first place. | `apps/docs-site` Cloudflare Pages settings per CLOUDFLARE-PAGES-SETUP.md |

### §2 — The CI gate script

`scripts/check/check-lockfile-drift.mjs` runs:

```bash
pnpm install --frozen-lockfile --recursive
```

If the install succeeds, the lockfile is in sync. If it fails with `ERR_PNPM_OUTDATED_LOCKFILE`, the script:

1. Prints the failing package.json + the missing/extra specifier
2. Exits 1 (PR fails the check)
3. Prints the one-line recovery command for the contributor:
   ```
   pnpm install   # regenerates pnpm-lock.yaml
   git add pnpm-lock.yaml
   git commit -m "chore: sync pnpm-lock.yaml after dep change"
   ```

The script is added to root `package.json` as `pnpm run check:lockfile-drift` so contributors can run it locally before pushing.

### §3 — Wiring into the merge protocol

The `.github/workflows/ci.yml` workflow MUST include this check as a **required status check** on PRs targeting `main`. The branch-protection rule on `main` MUST require it green.

Sequence on a PR:

```
PR opened
  → ci.yml runs
    → check:lockfile-drift  (this gate)
    → check:isolation       (C45)
    → check:commandmanager  (C16)
    → check:a11y-contrast   (C43)
    → ... other gates
  → all green → PR mergeable
  → merge to main → Cloudflare deploy can NEVER hit lockfile drift
```

### §4 — Why we don't just remove `SKIP_DEPENDENCY_INSTALL=true` from Cloudflare

The flag stays. It's belt-and-braces: a Cloudflare incident could in theory queue a build from a commit BEFORE the lockfile fix landed (we saw this happen today — Cloudflare cached a stale snapshot of the branch). The flag means even in that edge case the deploy proceeds with `--no-frozen-lockfile`, the actual install is correct (since the lockfile we DO have is consistent enough to resolve), and the deploy ships.

Without the flag, a stale Cloudflare clone gates the deploy on a problem the CI already fixed. The flag eliminates that race.

---

## Consequences

### Positive

1. **No more `ERR_PNPM_OUTDATED_LOCKFILE` deploys**: drift cannot reach `main` because the PR check fails first.
2. **Self-service error messages**: the script tells the contributor the exact command to fix.
3. **Cloudflare tolerance is now opt-in defence-in-depth**, not the only line of defence.
4. **One source of truth**: lockfile sync is required at PR time; nobody can argue "but my local install passed".

### Negative

1. **CI time bump**: `pnpm install --frozen-lockfile --recursive` adds ~ 60-90s to every PR. Acceptable; we already run several minute-scale gates.
2. **Contributors who forget will see a red check**: that's the point. Expected behaviour.

### Implementation status

The CI gate script + workflow wiring is PLANNED for the next iteration of build-infrastructure work. Until it ships:

- The `SKIP_DEPENDENCY_INSTALL=true` Cloudflare flag (already in place) keeps deploys passing.
- Contributors should manually `pnpm install` after any workspace `package.json` change and commit the lockfile diff.
- A team review of the recent `main` commits (cf. `pnpm-lock.yaml` history) should confirm no other drift is in flight.

---

## Related

- **CLOUDFLARE-PAGES-SETUP.md §9.3** — operator-facing troubleshooting for when this ADR's gate misses + a Cloudflare deploy hits the error.
- **ADR-052** — the marketing-surface deployment that surfaced this issue.
- **C00** — CI gates inventory (this gate gets added).

---

## Change log

- **2026-06-02** — Authored after the first Cloudflare deploy hit `ERR_PNPM_OUTDATED_LOCKFILE` on `main`. Today's hotfix (`1898243`) synced the lockfile but the CI gate that prevents recurrence is queued for implementation.
