# scripts/

> **Stamp**: 2026-06-02
> **Layout**: 7-folder taxonomy. New scripts go into the matching folder; the root stays empty except for this README.

The repo's CI gates, codemods, scans, build helpers, and one-off operational utilities live here. Reorganised from a 33-file flat layout into a typed taxonomy in [tracker A.U.20](../docs/03-execution/plans/master-execution-tracker.md).

## Layout

| Folder | Contains | Examples |
|---|---|---|
| `check/` | CI gate scripts run on every PR or as merge gates | `check-isolation`, `check-a11y-token-contrast`, `check-ai-host-bundle`, `ci-check-no-commandmanager` |
| `migrate/` | Codemods + one-time migrations (idempotent on re-run) | `migrate`, `codemod-restructure-2026-04-30`, `wave10-migrate-core` |
| `scan/` | Read-only audits + log scanners | `scan-logs`, `track-window-cast-count` |
| `build/` | Build-time generators + post-build shims | `gen-openapi`, `write-prod-shim`, `verify-bundle-size` |
| `cutover/` | Release / cutover checklist runners | `cutover-checklist`, `spec-cutover-checklist` |
| `legacy-pryzm3/` | PRYZM 3-era diagnostic + parity-check scripts | `k3c-api-surface-diff`, `pryzm-3-functional-day-1`, `check-pryzm3-exists` |
| `one-offs/` | Genuine one-shot helpers (run once, kept for audit) | `seed-stripe-products`, `wireup-baseline.sh`, `retarget-todo-b` |

## How to add a new script

1. Pick the folder that matches the script's intent (see the table above).
2. Name the file `<category>-<short-purpose>.{mjs,ts,sh,js}` — keep the verb up front.
3. Add a header comment naming the contract / spec / tracker row that motivates it.
4. If the script needs an npm alias, add it to the root `package.json` `scripts` block using the full new path (`node scripts/check/<name>.mjs`).
5. If the script is invoked by another file in the repo (e.g. `tools/ga-gate/`), grep for its old path before adding to avoid breaking external callers.

## Conventions

- **No inter-script imports**. Each script is self-contained or imports from `@pryzm/*` packages. This makes moving a script across folders safe.
- **Exit codes**: 0 = pass, 1 = assertion failed, 2 = environment broken.
- **Stdout for humans, stderr for failure context**. CI captures both.
- **Idempotent on re-run** for migrations + codemods. Run-twice-without-effect is the bar.
- **Header comment** names the contract section being enforced (e.g. `C43 §1.5` for the a11y contrast gate).

## Run inventory (root package.json)

These are the npm aliases the project + CI invoke; every path now points into a subfolder:

| Command | Script |
|---|---|
| `pnpm run migrate` | `scripts/migrate/migrate.mjs` |
| `pnpm run check:isolation` | `scripts/check/check-project-isolation.mjs` + `scripts/check/check-storage-isolation.mjs` |
| `pnpm run check:commandmanager` | `scripts/check/ci-check-no-commandmanager.mjs` |
| `pnpm run check:a11y-contrast` | `scripts/check/check-a11y-token-contrast.mjs` |
| `pnpm run scan` | `scripts/scan/scan-logs.js` |
| `pnpm run build` | `scripts/check/check-project-isolation.mjs` + `scripts/build/write-prod-shim.mjs` |
| `pnpm run gen:openapi` | `scripts/build/gen-openapi.mjs` |
| `pnpm run wireup:baseline` | `scripts/one-offs/wireup-baseline.sh` |
| `pnpm run pryzm-3-functional-day-1` | `scripts/legacy-pryzm3/pryzm-3-functional-day-1.ts` |

External path consumers (update if a script is moved):
- `tools/ga-gate/run-all.ts` references `scripts/check/check-pryzm3-exists.ts`.
