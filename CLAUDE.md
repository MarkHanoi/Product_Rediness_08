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
L7    apps/* (13)                — per-app surfaces (editor, marketplace, workers, docs-site…)
L6    plugins/* (48)             — features
L5    packages/plugin-sdk/       — curated public SDK facade (re-exports a subset)
L4    packages/renderer, render-runtime, persistence-client, scene-committer
L3    packages/runtime-composer, ui-base, stores, view-state, file-format, sync-client
L2    packages/geometry-kernel, ai-host, constraint-solver, drawing-primitives
L1    packages/command-bus, picking, visibility, snapping, renderer-three, spatial-index,
      frame-scheduler, …
L0    packages/schemas/          — pure Zod schemas; no I/O, no THREE, no DOM
```

> **Counts measured 2026-08-11** — `ls apps/ | wc -l` → **13**; `ls plugins/ | wc -l` → **48**;
> `ls packages/*/package.json | wc -l` → **97** real workspaces (`ls packages/ | wc -l` is 99 —
> two entries under `packages/` carry no manifest, so count manifests, not directories; this
> matches [STR-03 §1](docs/01-strategy/STR-03-engineering-vision.md)). These rot. Prefer re-running the command over trusting the
> number: the table's purpose is the *ordering*, not the census.

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

- **"plugins may import L6 only" is a GOAL, not an invariant** — ~630 SDK imports against
  **171 direct bypasses at a baseline of 182**, alongside **102 layer violations** and
  **13 unclassified packages** (measured **2026-08-16**: `npx tsx tools/ga-gate/check-layer-boundaries.ts`
  → **exit 0**, *"within baselines (violations 102/102, unclassified 13/13, sdk-bypass 171/182)"*).
  This bullet previously said **181/181**; both halves were wrong — the count is **171**, and the
  ceiling is **182**. **Read the gate, not this line** — it is the artefact that computes these, and
  all three are shrink-only ratchets that move most weeks. Do not treat the bypass figure as
  monotonic: it has gone both up and down, which is precisely why a hand-copied number here rots.
  The bypass count is tracked separately from the layer count rather than folded into it, because
  `plugin → renderer-three` goes *downward*: it is a facade-encapsulation breach, not a layer
  violation, and merging the two would make both numbers unreadable.
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

### The 8 principles — binding commitments; FOUR are enforced at the invariant

> ⚠ **Corrected 2026-08-11.** This heading used to read "these are CI-enforced and merge-blocking",
> flat, for all eight. **That was false for half of them** and it is the same class of defect as
> L-809/L-812: a document describing enforcement that either did not exist or did not enforce the
> stated invariant. The authoritative, per-principle state is
> [STR-03 §2](docs/01-strategy/STR-03-engineering-vision.md#2--the-8-architectural-principles-p1p8),
> which carries the gate path and the current reading for each. Do not re-flatten this heading.

1. **P1 — Single composition root.** Production code obtains a runtime only via
   `composeRuntime()` in `packages/runtime-composer`. No parallel runtime wiring.
   → **hard-fail at the invariant** (`tools/ga-gate/check-single-compose.ts`, 1 definition / 0 rivals).
2. **P2 — Single THREE owner.** `import * as THREE` is allowed **only** in
   `packages/renderer-three/`. Anywhere else fails CI.
   → **hard-fail at the invariant** (`tools/ga-gate/check-three-imports.ts`, 0 importers outside).
3. **P3 — Single rAF.** `requestAnimationFrame()` is called only in
   `packages/frame-scheduler/src/RafAdapter.ts` — the frame scheduler is its OWN L1 package, it is
   not "inside `runtime-composer`". All animation subscribes to the frame bus.
   → **hard-fail at the invariant** (`tools/ga-gate/check-raf-count.ts`, exactly 1 owner).
4. **P4 — No `(window as any)`.** Forbidden outside the one allowlisted shim file — *as a rule*.
   **NOT-YET-TRUE as enforcement:** `check-cast-count.ts` is a shrink-only ratchet and is on
   `tools/ga-gate/gate-debt.json`. It is **RED — exit 3** (measured 2026-08-16), but **not for the
   reason this bullet used to give.** It said *"217 casts against a baseline of 215"*; the gate has
   **two arms** and that conflated them:
   - **repo-wide**: **209 / 215** — *within* its ceiling, i.e. this arm is not what fails.
   - **scoped** (`src`, `apps/editor/src/engine` · 201 files): **6 / 4** — **this is the breach.**
     `§RATCHET-EXCEEDED-IS-NEVER-DEBT (R7)` makes it exit **3**, not 1: being on `gate-debt.json`
     declares that a gate *fails*, never that it may get *worse*. **Fix the casts; never raise the
     threshold.**

   ⚠ One of the six is `apps/editor/src/engine/views/PlanViewToolOverlay.ts:786`, and it is worth
   knowing about: `(window as any)['commandManager']` aliased to `_lvl`, then `_lvl.execute(...)`.
   Its own comment states the rationale — *"bracket notation avoids `window.commandManager` GA gate
   pattern"*. `check:commandmanager` greps the literal string `commandManager.execute`, so it counts
   this site as **zero**. That is roadmap §7B.5 — *a gate that classifies by NAME can be satisfied
   by RENAMING* — and it means **`check:commandmanager`'s 51/52 PASS is not a denominator you may
   quote.** `check-cast-count` caught what `check:commandmanager` was built to catch and missed.
   *Exit condition:* the repo-wide count reaches 0 and the gate leaves `gate-debt.json`.
5. **P5 — Schemas are pure.** `packages/schemas/` has zero I/O, zero THREE, zero DOM imports.
   → **hard-fail at the invariant** (`tools/ga-gate/check-domain-purity.ts`, 0 impurities / 165 files).
6. **P6 — Commands are the only mutation path.** UI must dispatch through `commandBus`; no
   direct store writes from UI code. **NOT-YET-TRUE as enforcement:**
   `check-no-direct-store-writes.ts` passes *at a baseline of 37 tolerated direct writes*, not at 0.
   *Exit condition:* baseline reaches 0, then flip the gate to hard-0.
7. **P7 — Visibility intent ≠ UI state.** `packages/visibility/` is a domain concept, not UI.
   **PARTIALLY ENFORCED:** `check-visibility-intent-not-ui.ts` **exits 0** (measured 2026-08-16).
   ARM A is hard-0 inside `packages/visibility/src` — **20 files, 0 UI leaks**. ARM B is a ratchet
   and reads **40 / 43** across **772 UI files** — *within* baseline, **not RED**. This bullet said
   *"RED today (45 … against a baseline of 43)"*; that was wrong, and wrong **pessimistically** —
   the gate passes and the count had come down, not up. The largest single holder is
   `ProjectVisibilitySection.ts` at 13 of the 40.
   The gate's own output still says persistence, per-view scoping and the AI intent path are
   **NOT CHECKED**, so *"P7 holds"* remains something this gate cannot tell you.
   *Exit condition:* ARM B reaches 0 and the three unchecked axes get arms of their own.
8. **P8 — Explicit sync conflicts + spans.** CRDT merges that lose data surface as
   user-resolvable conflicts; **every new exported function must add ≥1 OpenTelemetry span.**
   **NOT-YET-TRUE as enforcement:** `check-otel-spans.ts` counts *handler files* (255 of 256
   instrumented) against a `HARD_FLOOR` of **213** — 42 below the current reading, so 42 files
   could lose their spans without the gate noticing, and the "every exported function" half is not
   measured at all. The conflict-surfacing half has no gate.
   *Exit condition:* the floor tracks the measured count, and the gate scopes to exported
   functions rather than files.

GA-gate checks live in `tools/ga-gate/` (run via `run-all.ts`); a handful of older, non-gate
scripts live in `scripts/` (11 files — none of them are P-gates; the four `scripts/ci-check-*.ts`
paths cited in older docs never existed, see L-812).

**The `.github/workflows/ci.yml` gate is merge-blocking for the jobs listed as required in that
file's header — but not uniformly.** Two jobs are deliberately `continue-on-error` (`test-pryzm1`,
pending L-544; and the legacy release gate inside the `ga-gate` job). More importantly, the
founder's real workflow is push-straight-to-`main`, so **required status checks are not the gate
here** — the actual gate is the `ci-gate` job in `deploy-fly.yml`, which refuses to deploy a SHA
whose CI run did not succeed (§L-540-CI-GATE). Read `ci.yml`'s header before assuming a job blocks.

## Governance — read the contracts first

`docs/02-decisions/contracts/README.md` (the "C00" contract-suite index) is **the authoritative
enumeration of the suite — always defer to it over any range written here.** It indexes
**C01–C68 + C24.1** (C61 is a RESERVED, unminted slot), which governs every implementation
decision.

> ⚠ **Corrected 2026-08-11.** This paragraph and the conflict-resolution order below both said
> **"C01–C15"**. The suite has been **C01–C68** for months. Fifty-three contracts were silently
> outside the stated ordering — including **C67 (RAC capability control plane)** and **C68 (element
> & attribute chat onboarding)**, both CANONICAL, both binding on *every* capability PR. An agent
> reading the old sentence literally would have ranked C68 **below an ADR**. Measured with
> `ls docs/02-decisions/contracts/ | grep -c '^C[0-9]'` → **68**.

Before non-trivial work, read the contract for the subsystem you are touching — e.g. `C03`
(schemas/commands/state), `C04` (rendering/scheduling), `C11` (element creation pipeline), `C15`
(hosted elements: doors/windows in walls), `C16` (command authoring), `C66` (concurrency &
scale — **no capacity tier may be described as supported while C66 §1 marks it CLAIMED**), `C67`
+ `C68` (**mandatory** if your PR registers a bus command, adds an element kind, or adds a
user-visible attribute).

Conflict resolution order (strongest first): `docs/01-strategy/STR-03-engineering-vision.md` →
`docs/01-strategy/STR-04-architecture.md` → **the C01–C68 contract suite** (as enumerated by
`docs/02-decisions/contracts/README.md`) → ADRs (`docs/02-decisions/adrs/`, 251 files) →
SPECs (`docs/03-execution/specs/`, 92 files). **When code disagrees with a contract, the code is
wrong** — fix the code, or raise a superseding ADR; never write a new `*-AUDIT.md` derivative doc.
Edit the canonical `C0N-*.md` in place. Current migration status:
`docs/03-execution/plans/master-execution-tracker.md`.

> Counts measured 2026-08-11 · `ls docs/02-decisions/adrs/ADR-*.md | wc -l` → 251 ·
> `find docs -name 'SPEC-*.md' | wc -l` → 92. **The SPEC path was also wrong**: this file said
> `reference/specs/`, which does not exist; specs live at `docs/03-execution/specs/`.
