# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PRYZM is a BIM (Building Information Modeling) SaaS platform: a browser-based 3D editor with
real-time collaboration, AI-assisted design, and IFC/Revit/DXF/Rhino interoperability. It is a
**pnpm monorepo** (`pnpm@10.26.1`, Node ≥20) currently mid-migration to the "PRYZM 3"
architecture (see Governance below).

## Commands

```bash
npm run dev            # Express + Vite dev server on port 5000 (tsx server.js)
npm run build          # isolation check → tsc --skipLibCheck → vite build → prod shim
npm run lint           # eslint across the repo
npm run check:isolation        # project + storage isolation static checks
npm run check:commandmanager   # CI guard: no legacy commandManager.execute() sites

# Tests — there is no single root "test" script; suites are split by config:
npm run test:server    # vitest, server/__tests__/**  (Node env, Express/permissions)
npm run test:pryzm1    # node test runner, tests/*.test.ts (tsx --test)
npm run test:ci        # per-workspace: pnpm -r run test:ci, concurrency 1
npx vitest run         # root vitest.config.ts — src/ui panel + toolbar binding tests (happy-dom)
npx playwright test    # E2E, tests/e2e/** across chromium/firefox/webkit

# Single test
npx vitest run path/to/file.spec.ts          # one file
npx vitest run -t "test name substring"      # by name
pnpm --filter @pryzm/<pkg> test              # one workspace package's suite
npx playwright test tests/e2e/foo.spec.ts --project=chromium
```

Most `packages/*` and `apps/*` expose their own `test`, `test:watch`, and `typecheck` scripts;
run them with `pnpm --filter @pryzm/<name> <script>`. The build is memory-hungry — the `build`
script sets `NODE_OPTIONS=--max-old-space-size=6144`.

Required env vars to run the server: `DATABASE_URL`, `SESSION_SECRET`, `CF_WORKER_URL` (or
`ANTHROPIC_API_KEY`), `PRYZM_OWNER_EMAIL`, `PRYZM_OWNER_PASSWORD`. Optional: Supabase, Stripe,
Google/Microsoft OAuth credentials.

## Architecture

### Two halves of the codebase

- **`server.js`** (root, ~240 KB) — a single Express Backend-for-Frontend. It owns auth, data
  APIs, file storage, AI proxying (to a Cloudflare Worker via `CF_WORKER_URL`), Stripe billing,
  the plugin marketplace API, and Socket.io. DB schema is in `server/dbMigrate.js`, applied on
  startup. Backend modules live in `server/`. PostgreSQL is the database; Yjs powers CRDT
  collaboration.
- **The client** — a layered TypeScript SPA. `index.html` is the entry; `src/` is the
  transitional client root.

### The 8-layer model (PRYZM 3)

The client is governed by a strict layered dependency rule: **a layer may import from any lower
layer, never a higher one.**

> ⚠ **Corrected 2026-08-09 (L-809).** This paragraph used to end "CI enforces this via
> `eslint-plugin-boundaries`". **It did not.** `eslint.config.js` configured no `import/resolver`,
> so boundaries could not resolve `@pryzm/*` specifiers — which is how essentially every
> cross-package import here is written — and silently checked nothing for them. The rule was set
> to `'error'` and matched almost none of the imports it existed to police.
>
> **The authority is `tools/ga-gate/check-layer-boundaries.ts`**, which maps `@pryzm/X` → directory
> by reading each workspace `package.json`. That is exact and independent of pnpm symlink state —
> which is precisely what made resolver-based checking unreliable here (some `@pryzm/*` packages
> are linked into a given package and some are not, so a resolver caught a violation in one place
> and silently skipped the identical one next door). It imports the tables from `eslint.config.js`
> rather than copying them. `boundaries/element-types` is retained and still catches relative-path
> violations, but it is not the layer gate.

```
L7    apps/* (14)                — per-app surfaces (editor, marketplace, workers, docs-site…)
L6    plugins/* (46)             — features
L5    packages/plugin-sdk/       — curated public SDK facade (re-exports a subset)
L4    packages/renderer, render-runtime, persistence-client, scene-committer
L3    packages/runtime-composer, ui-base, stores, view-state, file-format, sync-client
L2    packages/geometry-kernel, ai-host, constraint-solver, drawing-primitives
L1    packages/command-bus, picking, visibility, snapping, renderer-three, spatial-index,
      frame-scheduler, …
L0    packages/schemas/          — pure Zod schemas; no I/O, no THREE, no DOM
```

**Two orderings above were corrected by measured edge direction, not by preference:**

- **apps moved BELOW → ABOVE plugins.** The old table put apps at L5, beneath the plugins they
  host. Measured `apps → plugins` **142**; `plugins → apps` **0** real import statements.
  `apps/editor` imports twenty-odd plugins in order to *register* them — that is what a
  composition root does, and it is structural, not debt. Encoding the old order minted **151
  permanent false violations**.
- **`frame-scheduler` L3 → L1.** It imports nothing at all, and is consumed by eleven L2
  `geometry-*` packages plus `core-app-model`. A zero-dependency primitive consumed by L2 cannot
  sit at L3; the old placement generated ~29 false violations.

**Stated honestly as NOT-YET-TRUE, so nobody mistakes them for settled invariants:**

- **"plugins may import L6 only" is a GOAL, not an invariant** — measured 630 SDK imports against
  **171 direct bypasses** (`renderer-three` ×84, `command-registry` ×29, `core-app-model` ×27,
  `scene-committer` ×19). Tracked on its own shrink-only ratchet rather than folded into the layer
  count, because `plugin → renderer-three` goes *downward*: it is a facade-encapsulation breach,
  not a layer violation, and merging the two would make both numbers unreadable.
- **`runtime-composer` is not really L3.** It is the P1 composition root and necessarily imports
  `persistence-client`, `renderer`, four typology packs, five plugins and `apps/editor`. Either it
  belongs at the top or those registration edges must invert. 16 violations are this.
- **`core-app-model` / `command-registry` sit at L2 while importing L4.** The real debt is that a
  domain model depends on persistence.
- **Backend packages have no layer** — `admin-overrides`, `ai-spend`, `api-rbac`, `api-spec`,
  `rate-limit`, `webhooks`, `email-transport`, `beta-signup`. Consumed only by
  `apps/api-gateway` / `marketplace-api`, zero client dependencies. **Open question: does this
  model extend to the backend, or does the backend need its own?**

The main editor application is `apps/editor` (`@pryzm/editor`). Each element type (wall, door,
roof, stair, curtain-wall, slab, etc.) is split across a `packages/geometry-*` package (geometry
math) and a `plugins/*` package (the user-facing tool, commands, UI).

### The 8 principles — these are CI-enforced and merge-blocking

1. **P1 — Single composition root.** Production code obtains a runtime only via
   `composeRuntime()` in `packages/runtime-composer`. No parallel runtime wiring.
2. **P2 — Single THREE owner.** `import * as THREE` is allowed **only** in
   `packages/renderer-three/`. Anywhere else fails CI.
3. **P3 — Single rAF.** `requestAnimationFrame()` is called only in the frame scheduler inside
   `runtime-composer`. All animation subscribes to the frame bus.
4. **P4 — No `(window as any)`.** Forbidden outside the one allowlisted shim file.
5. **P5 — Schemas are pure.** `packages/schemas/` has zero I/O, zero THREE, zero DOM imports.
6. **P6 — Commands are the only mutation path.** UI must dispatch through `commandBus`; no
   direct store writes from UI code.
7. **P7 — Visibility intent ≠ UI state.** `packages/visibility/` is a domain concept, not UI.
8. **P8 — Explicit sync conflicts + spans.** CRDT merges that lose data surface as
   user-resolvable conflicts; **every new exported function must add ≥1 OpenTelemetry span.**

GA-gate checks live in `tools/ga-gate/` (run via `run-all.ts`); CI checks also live in
`scripts/`. The `.github/workflows/ci.yml` gate is hard-fail — no PR merges without it green.

## Governance — read the contracts first

`docs/02-decisions/contracts/README.md` (the "C00" contract-suite index) indexes a canonical
contract suite (**C01–C15**) that governs
every implementation decision. Before non-trivial work, read the contract for the subsystem you
are touching — e.g. `C03` (schemas/commands/state), `C04` (rendering/scheduling), `C11`
(element creation pipeline), `C15` (hosted elements: doors/windows in walls).

Conflict resolution order (strongest first): `docs/01-strategy/STR-03-engineering-vision.md` →
`docs/01-strategy/STR-04-architecture.md` → the C01–C15 contracts → ADRs (`docs/02-decisions/adrs/`) →
SPECs (`reference/specs/`). **When code disagrees with a contract, the code is wrong** — fix
the code, or raise a superseding ADR; never write a new `*-AUDIT.md` derivative doc. Edit the
canonical `C0N-*.md` in place. Current migration status: `docs/03-execution/plans/master-execution-tracker.md`.
