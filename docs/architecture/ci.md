# CI — pipeline and gates

> S01 Track B deliverable, owner Agent B. Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §2.S01 D8.

The CI pipeline lives at `.github/workflows/ci.yml`. It is the **single
gate** between any branch and `pryzm2/main`. PRs cannot merge unless every
step is green.

## Pipeline stages (in order)

| # | Stage | Command | Hard-fail at S01? | Wall-clock budget |
|---|---|---|---|---|
| 1 | Checkout | `actions/checkout@v4` | n/a | < 10 s |
| 2 | Set up Node 20 + npm cache | `actions/setup-node@v4` | n/a | < 30 s |
| 3 | Install workspaces | `npm ci` | yes | < 90 s |
| 4 | Typecheck `@pryzm/schemas` + `@pryzm/protocol` | `tsc --noEmit` | yes | < 30 s |
| 5 | Lint (boundaries L0→L7 + custom `pryzm/*` rules) | `npx eslint …` | yes | < 30 s |
| 6 | Test `@pryzm/schemas` + `eslint-plugin-pryzm` | `vitest run` | yes | < 60 s |
| 7 | Bench baseline | `npm run bench --workspace=@pryzm/bench` then `bench:check` | **warn-only at S01** (per S01 exit) | < 60 s |
| 8 | Bundle-size gate | `node apps/bench/scripts/check-bundle-size.mjs` | **warn-only at S01** (flips to hard-fail at S06) | < 15 s |
| 9 | OTel relay (placeholder) | `echo …` | n/a — replaced when CI moves to native GitHub | < 1 s |

**Total budget**: < 5 min wall-clock on a clean clone (S01 exit criterion #4).

## Lint matrix

The lint stage runs the **flat** `eslint.config.js` at the repo root. It
combines three rule sources:

1. `@eslint/js` — base recommended rules.
2. `typescript-eslint` — TypeScript recommended rules.
3. `eslint-plugin-boundaries` — the L0→L7 dependency matrix from
   `08-VISION.md §4` and `01-TARGET-ARCHITECTURE.md §1`.
4. `eslint-plugin-pryzm` (custom) — the four architectural rules:

   | Rule | First-fires | Hard-fails | Source |
   |---|---|---|---|
   | `pryzm/affected-stores-required` | S01 (scaffold) | S02 | `tools/eslint-plugin-pryzm/src/rules/affected-stores-required.js` |
   | `pryzm/no-three-in-kernel` | S01 (scaffold) | S08 | `tools/eslint-plugin-pryzm/src/rules/no-three-in-kernel.js` |
   | `pryzm/no-raf` | S03 | S03 | (added S03) |
   | `pryzm/no-three-outside-committer` | S05 | S07 | (added S05) |

5. `no-restricted-imports` — the **forbidden-dependencies** baseline that
   stops THREE / OBC / express creeping into L0–L4 packages by raw module
   name (catches both the `import` and `require` paths).

## What is intentionally OUT of scope at S01

- **Honeycomb / Tempo trace push.** Step 9 is a placeholder. The real wiring
  lands once CI moves from this Replit repository onto a native GitHub
  organisation that can rotate `HONEYCOMB_API_KEY` and `TEMPO_PUSH_URL`
  through GitHub Actions secrets.
- **Lint of legacy `src/`, `server/`, `editor/`.** PRYZM 1 is feature-frozen
  per `08-VISION.md §3`; running boundaries against it produces noise that
  obscures real PRYZM 2 violations. Globally `ignored` in `eslint.config.js`.
- **The bench-bundle hard-fail.** S01 records baselines; S06 promotes the
  bundle-size gate to hard-fail at `< 1.8 MB gzip`.

## How to add a new gate

1. Add the bench (or lint rule, or typecheck step).
2. Land it in `.github/workflows/ci.yml` with `continue-on-error: true`
   for at least one sprint (warn-only).
3. When the owning sprint's exit criterion fires, flip `continue-on-error`
   to false and update this doc's table.
4. Record the new perf number in `apps/bench/baseline.json` so the
   regression diff has something to compare against.

## S06 additions

### Hard-fail flips at S06

Per the S06 exit criteria, the following gates promote from
warn-only to hard-fail:

| Gate | Pre-S06 | At S06 | Where |
|---|---|---|---|
| Bundle-size — `?pryzm2=1` entry chunk | warn | **hard-fail > 1.8 MB gzip** | `apps/bench/scripts/check-bundle-size.mjs` |
| Bundle-size — per-package | warn | warn (unchanged) | same script, no flag flip |
| Visual-diff parity (WebGPU vs WebGL2) | n/a | **hard-fail > 2 px** | `apps/bench/scripts/visual-diff.mjs` |
| Orbit fps bench | n/a | warn → fail at < 50 fps p95 | `apps/bench/src/benches/` (S07) |

### Entry-chunk gate

`check-bundle-size.mjs --entry-only` runs just the entry-chunk
measurement.  It esbuild-bundles `apps/editor/src/index.ts` (ESM,
ES2022, browser, minify, tree-shake), gzip-measures the result, and
compares against `1.8 MB`.  At S06 commit, the entry-chunk size is
**~140 KB gzip** — comfortably under budget; the budget headroom
exists for 1B's `WebGPURenderer` swap and curtain-wall instancing.

### Visual-diff gate

The diff runs only when reference PNGs exist (per-mode, in
`apps/editor/__tests__/visual-fixtures/`).  Capture lives in
`apps/editor/scripts/snapshot-cube.mjs` (Playwright-based; requires a
GPU host).  In sandboxes without a GPU, the gate runs in
`--no-fixtures` shape-only mode — it asserts the harness is wired but
does not gate on a pixel diff.  The shape-only mode does NOT mark the
gate green — it is reported as `[visual-diff] shape-only OK` and the
real-diff CI matrix (Chrome stable headless with WebGPU enabled) is
the gate that hard-fails the PR.

### Cross-layer trace gate

`apps/bench/__tests__/cross-layer-trace.test.ts` is a regular Vitest
test, run as part of the bench workspace's `npm test` step.  It
guards the OTel coverage exit-criterion (line 668 of the phase doc):
all five `pryzm.*` gate spans must be reachable through the global
tracer provider.
