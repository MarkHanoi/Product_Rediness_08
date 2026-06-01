# Phase H — Per-package TypeScript compile (production boot without `tsx`)

> **Owner**: eng-1
> **Sprint window**: opens immediately after S81-WIRE F.7 lands; expected duration **1–2 working days** of focused work.
> **Status**: SCOPED (this document) — no code yet.
> **Blocks**: production cold-boot target in §6 (current Path A shim adds ~150–300 ms transpile + ~9 MB image bloat from `tsx`).
> **Unblocks**: deletion of `tsx` from runtime deps; `node ./dist/index.cjs` boots a pure-JS image; brings cold-boot in line with the §6 cold-load budgets.

---

## 1. The problem (single sentence)

`server.js` imports from `@pryzm/*` workspace packages whose `package.json` `main`
field points at `./src/index.ts`, so production crashes with
`ERR_UNKNOWN_FILE_EXTENSION ".ts"` unless we either:

- **Path A (in place since S78-WIRE D2)** — boot through `tsx` at runtime
  via the `dist/index.cjs` shim written by `scripts/write-prod-shim.mjs`.
- **Path B (this Phase H)** — emit per-package `dist/*.js` at build time,
  point each `package.json`'s `main`/`exports` at the compiled output, and
  let production run bare `node ./dist/index.cjs`.

This document scopes Path B.

---

## 2. Scope (the 49 workspace packages)

| Bucket | Count | Examples | Strategy |
|---|---|---|---|
| **Server-imported** (must compile for prod) | ~14 | `@pryzm/file-format`, `@pryzm/runtime-composer`, `@pryzm/persistence-client`, `@pryzm/stores`, `@pryzm/schemas`, `@pryzm/protocol`, `@pryzm/api-spec`, `@pryzm/api-rbac`, `@pryzm/rate-limit`, `@pryzm/feature-flags`, `@pryzm/ai-host`, `@pryzm/ai-cost`, `@pryzm/email-transport`, `@pryzm/runtime-undo-stack` | **Tier 1** — `tsc -b` emit, dual `exports` |
| **Browser-only / Vite-bundled** (no runtime resolution from Node) | ~30 | `@pryzm/ui-base`, `@pryzm/ui`, `@pryzm/renderer`, `@pryzm/render-runtime`, `@pryzm/picking`, `@pryzm/visibility`, `@pryzm/view-state`, `@pryzm/family-runtime`, `@pryzm/family-instance`, `@pryzm/family-loader`, `@pryzm/scene-committer`, `@pryzm/geometry-kernel`, `@pryzm/drawing-primitives`, `@pryzm/constraint-solver`, `@pryzm/expr-eval`, `@pryzm/formula-library`, `@pryzm/frame-scheduler`, `@pryzm/perf-budgets`, `@pryzm/wcag-audit`, `@pryzm/types-builtin`, `@pryzm/admin-overrides`, `@pryzm/sync-client`, `@pryzm/storage-driver`, `@pryzm/command-bus`, `@pryzm/plugin-sdk`, `@pryzm/oauth2-pkce`, `@pryzm/webhooks`, `@pryzm/beta-signup`, `@pryzm/crash-reporter`, `@pryzm/pdf-to-bim` | **Tier 2** — same `tsc -b` treatment for consistency, but their cost gate is bundle-size, not boot |
| **Already pure JS** | 3 | `@pryzm/release` (`.mjs`), `@pryzm/bench-visual-diff` (`.mjs`), `@pryzm/legacy-shim` (no main) | **Tier 3** — no work; covered by H.0 audit |
| **`apps/*` and `plugins/*`** | 12 + 38 | `apps/headless`, `apps/api-gateway`, `plugins/ifc-import`, … | **Out of scope** — they have their own build chains; only `apps/headless` is server-imported at runtime, and it is already JS-emitting |

Total Tier-1 + Tier-2 packages requiring a `tsc` build step: **~44**.
The work is mechanical and identical per package.

---

## 3. Per-package change template

For every Tier-1 / Tier-2 package, three files change:

### 3.1 `tsconfig.json` (split into authoring vs build configs)

Today every package's `tsconfig.json` has `"noEmit": true` and includes both
`src/**` and `__tests__/**`. We keep it as the **authoring** config (drives
editor type-checks and `pnpm typecheck`), and add a sibling **build** config:

```jsonc
// packages/<name>/tsconfig.build.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": true,            // enables tsc -b project references
    "tsBuildInfoFile": "./dist/.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],     // tests are NOT emitted
  "exclude": ["__tests__/**", "**/*.test.ts", "**/*.bench.ts"]
}
```

### 3.2 `package.json` (dual exports, `build` script, `files` whitelist)

```jsonc
{
  "name": "@pryzm/<name>",
  "private": true,
  "type": "module",
  "main":  "./dist/index.js",       // production resolution
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types":   "./dist/index.d.ts",
      "import":  "./dist/index.js",
      "default": "./dist/index.js"
    }
    // (drop the "./types" sub-export only if no consumer uses it; ripgrep first)
  },
  "files": ["dist", "src"],          // ship both so source-maps resolve
  "scripts": {
    "build":     "tsc -p tsconfig.build.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test":      "vitest run",
    "clean":     "rm -rf dist"
  }
}
```

> **Why keep `src` in `files`?** so source-maps resolve in stack traces and
> so any contributor cloning a tarball still has the readable source. The
> shipped `dist/*` is what Node and Vite resolve; `src/*` is documentation.

### 3.3 Workspace project references (`packages/tsconfig.references.json`)

A single file at the workspace root drives `tsc -b`:

```jsonc
{
  "files": [],
  "references": [
    { "path": "packages/types-builtin" },
    { "path": "packages/protocol" },
    { "path": "packages/schemas" },
    // … one entry per Tier-1/Tier-2 package (topologically ordered) …
    { "path": "packages/runtime-composer" }
  ]
}
```

`tsc -b packages/tsconfig.references.json` walks the DAG and emits everything
incrementally. Cold full build target: **< 25 s** on a clean Replit container.

---

## 4. Root-level wiring

### 4.1 `package.json` build script

```jsonc
"build": "node scripts/check-project-isolation.mjs && pnpm -r --workspace-concurrency=4 build && tsc --skipLibCheck && NODE_OPTIONS=--max-old-space-size=3072 vite build && node scripts/write-prod-shim.mjs"
```

The first `pnpm -r build` traverses the workspace in topological order and
emits every `dist/`. The order matters: `tsc --skipLibCheck` (root project
type-check) runs **after** the per-package emit so root-level `import` paths
resolve against the new `./dist/*.js` files.

### 4.2 `scripts/write-prod-shim.mjs` (already exists from Path A)

Once Phase H lands, the shim collapses back to the original 1-line form:

```js
const { spawn } = require("child_process");
spawn(process.execPath, [require("path").join(__dirname, "..", "server.js")],
      { stdio: "inherit", env: process.env })
  .on("exit", c => process.exit(c ?? 0));
```

The `--import tsx` arg is **deleted** in the same PR that flips the last
package to compiled output. `tsx` then moves from `dependencies` to
`devDependencies` (still needed for `npm run dev`).

### 4.3 Root `tsconfig.json`

The root `tsconfig.json` must add a `paths` entry that points dev-mode lookups
back at `./src/*` for every workspace package, **only when emitting is off**.
This keeps the dev workflow (`node --import tsx server.js`) honest while
production resolves to `./dist/*.js`. The `exports` field in each
`package.json` does this naturally (Node + Vite both honour it), so no
explicit `paths` is required if every package's `exports` block lists both
`./src/index.ts` (under a `"development"` condition) and `./dist/index.js`.
Decision: **don't bother** — emit `dist/` even in dev (the per-package `tsc
-b` is incremental and watch-friendly), and let dev mode resolve to the
compiled output. Pros: dev = prod parity. Cons: contributors must run
`pnpm -r build --watch` alongside `npm run dev`. Adopted; documented in §6.

---

## 5. Sub-phase ledger (16 tickets)

| ID | Title | Owner | Notes |
|---|---|---|---|
| **H.0** | Audit: re-confirm the 14 Tier-1 packages by `rg "@pryzm/" server.js apps/headless/src` and freeze the list | eng-1 | 30 min |
| **H.1** | Add `tsconfig.build.json` template + `packages/tsconfig.references.json` skeleton | eng-1 | 1 h |
| **H.2** | Convert Tier-1 leaf packages (no internal deps): `types-builtin`, `protocol`, `schemas`, `feature-flags`, `rate-limit`, `api-spec` | eng-1 | 2 h |
| **H.3** | Convert Tier-1 mid-tier: `api-rbac`, `email-transport`, `ai-cost`, `runtime-undo-stack` | eng-1 | 1.5 h |
| **H.4** | Convert Tier-1 server-facing roots: `file-format`, `persistence-client`, `stores`, `ai-host`, `runtime-composer` | eng-1 | 2 h (highest churn — also need `__tests__/` exclusion verified) |
| **H.5** | Convert Tier-2 batch 1 (UI / rendering): `ui-base`, `ui`, `renderer`, `render-runtime`, `picking`, `visibility`, `view-state`, `frame-scheduler` | eng-2 | 3 h |
| **H.6** | Convert Tier-2 batch 2 (geometry / families): `geometry-kernel`, `drawing-primitives`, `constraint-solver`, `expr-eval`, `formula-library`, `family-runtime`, `family-instance`, `family-loader`, `scene-committer` | eng-2 | 3 h |
| **H.7** | Convert Tier-2 batch 3 (infra / integrations): `command-bus`, `sync-client`, `storage-driver`, `plugin-sdk`, `oauth2-pkce`, `webhooks`, `beta-signup`, `crash-reporter`, `pdf-to-bim`, `admin-overrides`, `wcag-audit`, `perf-budgets`, `types-builtin` (verify) | eng-1 | 2.5 h |
| **H.8** | Wire `pnpm -r build` into root `npm run build`; verify `pnpm ga-gate` still green | eng-1 | 1 h |
| **H.9** | Replace prod shim contents (drop `--import tsx`); move `tsx` from `dependencies` to `devDependencies` | eng-1 | 15 min |
| **H.10** | Add `pnpm -r build` to CI before vitest workflows so tests run against `dist/` (matches prod resolution) | eng-1 | 30 min |
| **H.11** | Add `clean` aggregate: `pnpm -r clean && rm -rf dist` to the root `package.json` | eng-1 | 10 min |
| **H.12** | Add `pryzm/no-src-import` ESLint rule (warns when `from '@pryzm/<x>/src/...'` is used outside `__tests__/`) | eng-2 | 1 h + 4 tests |
| **H.13** | Update CONTRIBUTING.md with the new dev loop (`pnpm -r build --watch` + `npm run dev`) | eng-1 | 30 min |
| **H.14** | Production smoke test: `npm run build && node ./dist/index.cjs`, hit `/healthz`, hit `/api/v1/projects/list`, confirm boot under 800 ms | eng-1 | 30 min |
| **H.15** | Update `docs/03_PRYZM3/00_NEW_ARCHITECTURE/PROCESS-TRACKER.md`: tick Phase H, capture cold-boot delta, update floor (`packages_count` if any consolidation happened) | eng-1 | 15 min |

**Total**: ~18 engineer-hours, comfortably 2 working days for one engineer
or 1 working day with two engineers running H.5/H.6/H.7 in parallel after
H.4 lands.

---

## 6. Risks & decisions

| Risk | Mitigation |
|---|---|
| Per-package `dist/` doubles repo working-tree size | `dist/` already in `.gitignore`; not committed |
| Test files accidentally included in `dist/` | `tsconfig.build.json` excludes `__tests__/`, `*.test.ts`, `*.bench.ts`. CI verifies with `find packages/*/dist -name '*.test.js' -or -name '*.bench.js' \| grep .` returning 1 |
| Tier-1 package depends on Tier-2 package transitively | `tsc -b` walks references; topological order in `packages/tsconfig.references.json` enforces it |
| `pnpm -r build` breaks the `Start application` workflow because `dist/` is stale on first dev boot | Add `prebuild` step: `pnpm -r build` runs once before the dev workflow; document `pnpm -r build --watch` for live editing |
| `@pryzm/release` and `@pryzm/bench-visual-diff` ship `.mjs` directly | Excluded from H.5–H.7; H.0 confirms they have no `.ts` source |
| Vite was previously resolving `@pryzm/*` from `src/index.ts`; switching to `dist/index.js` may surface latent type-only imports | Run `npm run build` after each H.* and grep dist for `import type` leftovers; `verbatimModuleSyntax` already enabled in most package tsconfigs |

**Decision adopted**: Dev mode runs against `dist/` (not `src/`). See §4.3.
**Decision adopted**: `src/` still ships in the published tarball for
source-maps. See §3.2.

---

## 7. Exit criteria

1. `tsx` is in `devDependencies` only.
2. `dist/index.cjs` no longer passes `--import tsx`.
3. `npm run build && node ./dist/index.cjs` boots, `/healthz` returns 200,
   cold-boot p95 under 800 ms (matches §6 budget for "small project load").
4. `pnpm ga-gate` passes wireup-floor + visual-diff-smoke.
5. `pryzm/no-src-import` ESLint rule armed at WARN with empty baseline.
6. `PROCESS-TRACKER.md` shows Phase H complete with the cold-boot delta
   captured.

---

## 8. Hand-off note

H.0 begins as soon as a developer is free. Until then, **Path A** remains
in production via `scripts/write-prod-shim.mjs` (already shipping). The
shim's docstring explicitly references this file so the next maintainer
knows where to look.
