# ADR-0059 — Monorepo typecheck profile + `declarationDir`/emit (per-package hygiene)

**Status:** DRAFT
**Phase:** PER-PACKAGE-TYPECHECK-HYGIENE (master-execution-tracker)
**Authors:** PRYZM Architecture team
**Date:** 2026-06-04
**Cross-references:**
- Gate: `scripts/check/check-package-typechecks.mjs` (the `KNOWN_FAILING` allowlist this ADR retires).
- Sibling gate: `tools/ga-gate/check-per-package-compile.ts` (Phase H · C01 §5 · Task 7.2 — same root cause, its own `SKIP_PACKAGES` map + `isGlobalWindowIssue` auto-skip).
- Shared profile: `tsconfig.base.json`; masking profile: root `tsconfig.json`.
- Precedent: the `/// <reference path="./global-window.d.ts" />` window-global fix in `packages/ai-host/src/{AIReadModel,AIElementFactory}.ts` + `packages/ai-host/src/global-window.d.ts`.
- Precedent: the `@pryzm/stores` strict-null win (removed from `KNOWN_FAILING` 2026-06-04 by fixing own-code, not config).
- Dockerfile §1 comment: "until Phase H ships per-package tsc outputs" (the emit end-state this ADR formalises).

> **Numbering note:** 0057 (`ADR-057-realtime-geometry-and-view-interactivity.md`) and 0058 (`0058-unified-building-graph.md`) are taken; this is **0059**.

---

## Context / Problem

PRYZM is a ~150-package pnpm monorepo. Two CI gates assert that each workspace package typechecks
**in isolation** — exactly the way a contributor running `pnpm --filter <pkg> run typecheck`, or a
future consumer importing the package, would experience it:

- `scripts/check/check-package-typechecks.mjs` — runs `tsc -p tsconfig.json --noEmit` per package, carrying a **frozen `KNOWN_FAILING` allowlist of ~48 packages** (captured 2026-06-04). The gate fails if a non-listed package regresses *or* a listed package newly passes (so the baseline cannot rot).
- `tools/ga-gate/check-per-package-compile.ts` — the older Phase-H gate, with a hand-maintained `SKIP_PACKAGES` map plus a heuristic (`isGlobalWindowIssue`) that auto-skips any package whose every error is a `global-window.d.ts` / EOPT cross-reference miss.

Both allowlists exist for **one** structural reason.

### Root cause: dependency *source* is recompiled under each consumer's *own* profile

Every `@pryzm/*` package publishes its public surface as **TypeScript source**, not built `.d.ts`:

```jsonc
// packages/schemas/package.json (representative — true of ~all @pryzm/* packages)
"main":    "./src/index.ts",
"types":   "./src/index.ts",
"exports": { ".": "./src/index.ts", "./view": "./src/view/index.ts", … }
```

Consumers declare `"@pryzm/x": "workspace:*"`, and pnpm symlinks the workspace dir. So when
`tsc` typechecks package **A** in isolation, the `exports` map resolves every `@pryzm/*` import to
the dependency's `src/index.ts`, and tsc **re-parses and re-typechecks the full transitive source
closure of A's `@pryzm/*` deps under A's own `compilerOptions`** (there is no `.d.ts` boundary to
stop at). Where A's profile is *stricter* than a dependency's, the dependency's own source — which
was authored and is green under *its* looser profile — now errors.

The root / editor build masks all of this: root `tsconfig.json` compiles the whole app under **one
lenient profile** (`allowImportingTsExtensions: true`, the ambient `src/global-window.d.ts` in
scope, `noUncheckedIndexedAccess` off, `exactOptionalPropertyTypes` off) — so `pnpm run build`
stays green while the isolated per-package check is red.

### The option-divergence table

Three distinct config shapes coexist. Most packages **extend `tsconfig.base.json`** (70 in
`packages/*`, 7 in `apps/*`); a handful carry **standalone** configs (no `extends`); and the **root**
config is its own third profile. The load-bearing divergences:

| Option | `tsconfig.base.json` (the ~77 extenders) | Standalone strict (`ai-host`, `headless`, `runtime-composer`, `editor-ui*`) | Per-package opt-OUT (`command-registry`, `core-app-model`) | Root `tsconfig.json` (masking build) |
|---|---|---|---|---|
| `exactOptionalPropertyTypes` | **false** | **true** | **false** (explicit) | (unset → false) |
| `noUncheckedIndexedAccess` | **true** | true | **false** (explicit) | (unset → off) |
| `strictNullChecks` | true (via `strict`) | true | **false** (explicit) | true |
| `verbatimModuleSyntax` | **false** | (unset → false) | inherits false | (unset → false) |
| `allowImportingTsExtensions` | (unset) | (unset) | (unset) | **true** |
| `moduleResolution` | `Bundler` | `Bundler` | `Bundler` | `bundler` |
| `target` | `ESNext` | `ES2022` | `ESNext` | `ESNext` |
| global ambient (`global-window.d.ts`) | **not in scope** | not in scope (ai-host ships its OWN mirror) | not in scope | **in scope** (`src/global-window.d.ts`, 157 props) |
| `composite` | per-pkg (mostly false; `command-registry` true) | false | false | (unset) |

\* `editor-ui` extends base today, but several standalone strict packages (`ai-host`, `headless`,
`runtime-composer`, `engine` via base) raise EOPT.

The asymmetry produces a **bidirectional** failure surface:

1. **Stricter consumer → looser dep.** A package on the strict standalone profile (or any base
   extender, since base sets `noUncheckedIndexedAccess: true`) recompiles an opt-out dep's source
   → `TS2375/2379/2412` (EOPT), `TS18048/2532` (unchecked-index/possibly-undefined).
2. **Looser consumer → stricter dep.** `command-registry`/`core-app-model` (EOPT off, strictNull
   off) recompile a stricter standalone dep's source → that dep's own `field: undefined` /
   conditional-spread patterns may surface differently, and the **missing global ambient** turns
   every `window.wallStore` in transitively-pulled `ai-host`/`core-app-model` source into `TS2339`.
3. **`.ts`-extension imports** that only the root profile's `allowImportingTsExtensions: true`
   tolerates → `TS5097/2835` when recompiled under any package profile.
4. **Type-only import elision** (`TS1484`) where `verbatimModuleSyntax` or `isolatedModules`
   expectations differ between author and recompiling consumer.

### How packages expose types today (the mechanic to change)

`workspace:*` + `exports → ./src/*.ts` means **dependencies are consumed as source, never as
emitted `.d.ts`.** No `@pryzm/*` package currently sets `declarationDir`, ships a built `dist/*.d.ts`
on its `exports` map, or is wired as a TypeScript **project reference**. `composite` is set on a
single package (`command-registry`) but unused as a reference graph. This is the lever: the moment a
dependency is consumed as emitted `.d.ts`, the consumer's profile **stops** recompiling that
dependency's source, and the entire failure surface above collapses to "did the dependency build
green under *its own* profile?" — which it already does.

### `KNOWN_FAILING` categorization (~48 packages, by dominant failure class)

| Class | Dominant error(s) | Likely members (from gate header + `check-per-package-compile.ts` skip rationales) | Fix lever |
|---|---|---|---|
| **W — window-global ambient** | `TS2339` `Property 'x' does not exist on 'Window & typeof globalThis'` | consumers of `ai-host`/`core-app-model`: `command-registry`, `constraint-solver`, `family-instance`, `family-loader`, `core-app-model`, `engine`, `speculative-engine`, `input-host`, `physics-host`, plus most `apps/*` | Step 3 — `/// <reference>` precedent → shared `@pryzm/global-types` |
| **E — EOPT / unchecked-index divergence** | `TS2375/2379/2412`, `TS18048/2532` | strict standalone packages pulling looser deps & vice-versa: `ai-host`, `headless`, `runtime-composer`, `editor-ui`, `geometry-*` (beam/column/curtain-wall/door/furniture/kernel/lighting/plumbing/roof/slab/stair/wall/window), `room-topology`, `scene-committer`, `snapping`, `spatial-index`, `picking`, `view-state`, `views`, `render-runtime`, `renderer`, `persistence-client`, `file-format`, `protocol`, `plugin-sdk`, `ui-base`, `stores` (own-code subset already fixed) | Steps 1 + 4 — unify base profile + emit `.d.ts` so deps aren't recompiled |
| **X — `.ts`-extension imports** | `TS5097/2835` | packages with intra-package `import './x.ts'` that only root's `allowImportingTsExtensions` tolerates | Step 2 — strip `.ts` extensions |
| **T — type-only import elision** | `TS1484` | `isolatedModules`/`verbatimModuleSyntax`-sensitive packages | Step 1 — unify `verbatimModuleSyntax` in base |

The vast majority are class **W** (collapses the instant a shared global-types package exists) and
class **E** (collapses the instant deps are consumed as emitted `.d.ts`). Classes **X** and **T** are
small, mechanical, and independent — they can be cleared in any order.

---

## Options considered

### Option A — Shared `tsconfig.base` profile only (the founder's step 1)

Standardise the load-bearing options (`exactOptionalPropertyTypes`, `verbatimModuleSyntax`,
`noUncheckedIndexedAccess`, `strictNullChecks`) in `tsconfig.base.json`, delete the per-package
opt-outs and the standalone configs, so **every** package recompiles every dep under one identical
profile. The clash disappears because there is no longer a profile delta.

- **Pros:** no build-graph change; smallest diff for classes T (and removes the *delta* driving E); keeps the "source as types" simplicity.
- **Cons:** (1) does **not** fix class W (the ambient is still out of per-package scope) without also doing step 3; (2) tightening base (e.g. forcing `exactOptionalPropertyTypes: true` everywhere, or `noUncheckedIndexedAccess: true` on the opt-out packages) surfaces **real latent bugs** across ~150 packages — a large, risky own-code remediation; (3) still recompiles all transitive dep source on every isolated check → slow, and the masking root profile remains a separate fourth shape.

### Option B — `declarationDir` + per-package `.d.ts` emit (the Phase H / C51 direction)

Give each package a real build (`declaration: true`, `declarationDir: ./dist`, drop
`main/types → src`), flip the `exports`/`types` map to the emitted `dist/index.d.ts`, and make CI
build deps before checking dependents. Consumers then typecheck **against built `.d.ts`**, never
dep source.

- **Pros:** the **permanent architectural fix** — a profile delta in a dependency becomes invisible to its consumers, because the consumer never recompiles dep source; collapses classes W *and* E by construction; matches the Dockerfile's stated Phase-H end-state ("ship per-package tsc outputs") and the C51 apex/app split direction; faster repeat checks (deps built once).
- **Cons:** introduces a **build order** (a package must emit before its dependents check) → needs `composite` + project references or a topo-ordered build; adds CI build-time + `.tsbuildinfo`/`dist` artefacts; `workspace:*` source-import ergonomics (edit-and-go HMR via tsx) must be preserved for dev — so emit is a CI/consumer concern, dev can keep source imports.

### Option C — Both, staged (RECOMMENDED)

Do A's *safe* subset first (unify only the options that standardise **without** surfacing latent
bugs, keep per-package opt-out for the risky ones), clear the cheap mechanical classes (X, T) and the
window-ambient (W) via the existing `/// <reference>` → shared-types precedent, then land B in
**waves**, flipping consumers to built `.d.ts` and deleting `KNOWN_FAILING` entries as each wave goes
green. The clean end-state is a `composite` **project-reference** graph (`tsc --build`) so the build
order is declared, incremental, and the same graph serves CI typecheck, emit, and the Dockerfile's
per-package outputs.

- **Why C:** A alone leaves W unfixed and forces a risky org-wide strict tightening; B alone is a big-bang build-graph change. C sequences the low-risk wins first (W + X + T + the safe base unifications drain a large fraction of the ~48 immediately) and reserves the build-graph change (B) for the residual E class, wave by wave, with the gate as the ratchet.

---

## Decision (recommended): Option C — staged, low-risk rollout

### Phase 0 — Freeze + instrument (no behaviour change)

The `KNOWN_FAILING` baseline is already frozen (gate fails on regress *and* on unexpected pass).
Keep it as the **ratchet**: every wave below deletes entries; nothing may be added. Reconcile the two
gates — `check-per-package-compile.ts`'s `SKIP_PACKAGES` + `isGlobalWindowIssue` heuristic should be
driven toward the same single allowlist so there is one source of truth.

### Phase 1 — Safe base unification (founder step 1, *safe subset only*)

Standardise in `tsconfig.base.json` only the options that **cannot surface new own-code errors**:

- **Safe to standardise now:** `verbatimModuleSyntax`, `moduleResolution`, `target`/`lib` floor,
  `isolatedModules`, `esModuleInterop`, `skipLibCheck` — these change *emit/resolution semantics*,
  not strictness, so they unify the standalone configs into base without new errors. **Delete** the
  standalone `compilerOptions` blocks (`ai-host`, `headless`, `runtime-composer`, plus the
  app-level standalone configs) and have them `extends` base + override only `rootDir`/`outDir`/`noEmit`.
- **Keep per-package opt-out (do NOT force-tighten yet):** `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `strictNullChecks`. These **surface real bugs**; flipping them on the
  opt-out packages (`command-registry`, `core-app-model`) or forcing EOPT-on everywhere is a
  separate, scoped own-code remediation (per package, template = the `stores` strict-null win), not a
  config sweep. Track each as its own `KNOWN_FAILING` burn-down item.

Clears: most of class **T**, and removes the standalone-vs-base *delta* that aggravates **E**.

### Phase 2 — Strip `.ts`-extension imports (founder step 2)

Mechanically rewrite intra-package `import './x.ts'` → `import './x'`. Clears class **X**. This is a
pure codemod with no profile interaction; do it in one PR.

### Phase 3 — Promote the window ambient to shared types (founder step 3)

Generalise the existing precedent (`packages/ai-host/src/global-window.d.ts` + the two
`/// <reference path="./global-window.d.ts" />` files) into a single `@pryzm/global-types` package
that every `ai-host`/`core-app-model` consumer references (or `types`-includes via base). Clears
class **W** — the largest bucket. This is the fix path already named in
`check-per-package-compile.ts`'s skip rationales ("Phase F: @pryzm/global-types; OI-028").

### Phase 4 — `declarationDir` + emit, in waves (founder step 4 / Option B)

For the residual class **E**, convert packages **leaf-first** (lowest layer first: L0 `schemas` →
L1 → …):

1. Set `declaration: true`, `declarationDir: ./dist`, keep `noEmit:false` only in the build config; add `composite: true`.
2. Flip `exports`/`types`/`main` to `./dist/index.{js,d.ts}` (keep a source `exports` condition for dev/tsx).
3. Add `references` to the package's `@pryzm/*` deps and switch CI to `tsc --build` so deps emit before dependents check.
4. After the wave's dependents go green against the built `.d.ts`, **delete those entries from `KNOWN_FAILING`** (and the mirror `SKIP_PACKAGES`).

End-state: a `composite` project-reference graph — one declared build order serving isolated
typecheck, `.d.ts` emit, and the Dockerfile's "per-package tsc outputs"; the masking root profile is
retired (the editor app just becomes one more node in the graph).

### Per-wave verification + rollback

- **Verify:** after each wave, run `node scripts/check/check-package-typechecks.mjs <substr>` for the touched packages — the gate's "now PASSES" warning is the green signal to delete the entry; then run the full root `pnpm run build` + `tools/ga-gate/run-all.ts` to confirm no masking regression. Removing a still-red entry will hard-fail the gate, so the ratchet self-guards.
- **Rollback:** each wave is one PR touching a bounded package set; reverting restores the prior `exports`/config and re-adds the `KNOWN_FAILING` lines. Because the baseline is frozen, a bad wave cannot silently degrade neighbours.

---

## Risk + sequencing

- **Tightening strict flags is the real risk, not the config plumbing.** Forcing
  `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess`/`strictNullChecks` on the opt-out packages
  surfaces genuine latent null/optional bugs across ~150 packages. Sequence these **last and
  per-package** (own-code remediation, `stores` as the template), *after* Option B has removed the
  dep-recompilation pressure — so each package only has to fix **its own** code under the strict
  profile, not its deps'. Never flip a strict flag in `tsconfig.base.json` as a blanket sweep.
- **Order within C:** Phase 1 (safe unify) → Phase 2 (`.ts` ext) → Phase 3 (global-types) drains the
  cheap, low-risk majority (T + X + W) before any build-graph change. Phase 4 (emit) is leaf-first so
  a dependency is always built before its dependents check. The strict-flag own-code burn-down rides
  on top of Phase 4, per package.
- **CI cost:** Option B adds a build step; mitigate with `tsc --build` incrementality
  (`.tsbuildinfo`) + caching `dist/`. Net repeat-check time should *drop* (deps built once vs
  recompiled per dependent).
- **Gate interaction:** `check-package-typechecks.mjs` is the ratchet — it already fails on
  unexpected pass, so the allowlist provably shrinks to zero. Drive
  `check-per-package-compile.ts` toward the same single list to remove the second, drifting source of
  truth.

---

## Migration steps (mapped to the founder's 1-2-3-4 + existing precedents)

| Founder step | ADR phase | Action | Clears | Precedent / template |
|---|---|---|---|---|
| **1** shared base profile | Phase 1 | Fold standalone configs into `tsconfig.base.json`; unify only the *safe* (non-strictness) options; keep EOPT/unchecked-index opt-outs | class T; the E *delta* | `tsconfig.base.json` (already the shared extender) |
| **2** fix `.ts`-ext imports | Phase 2 | Codemod `import './x.ts'` → `import './x'` | class X (`TS5097/2835`) | — |
| **3** promote `global-window.d.ts` | Phase 3 | Extract `@pryzm/global-types`; `/// <reference>` or base `types`-include in ai-host/core-app-model consumers | class W (`TS2339`) | `packages/ai-host/src/{AIReadModel,AIElementFactory}.ts` `/// <reference>` + `global-window.d.ts` |
| **4** `declarationDir` + emit | Phase 4 | Per-package `.d.ts` emit + flip `exports` to `dist` + `composite` project refs + `tsc --build` | class E (`TS2375/2379/18048`), permanently | Dockerfile §1 "per-package tsc outputs"; C51 apex/app split |
| (own-code) | rides Phase 4 | Strict-flag tightening on opt-out packages, per package | residual EOPT/null bugs | the `@pryzm/stores` strict-null win (removed from `KNOWN_FAILING` 2026-06-04) |

**"Own-code" vs "dep-divergence" — the triage rule for every `KNOWN_FAILING` entry:** if a package's
isolated errors are in **its own** `src/` (e.g. the `stores` strict-null case), fix the code and
delete the entry now — that needs no ADR. If the errors are in **transitively-pulled dependency
source** (`../ai-host/…`, `../core-app-model/…`), it is config-divergence — leave it for the wave
that emits that dependency as `.d.ts` (Phase 4) or promotes the ambient (Phase 3). The
`isExternalError` heuristic in `check-per-package-compile.ts` already encodes exactly this
own-vs-dep boundary and can be reused to auto-classify the list.

---

## Consequences

- `KNOWN_FAILING` (and `SKIP_PACKAGES`) shrink monotonically to zero; the gate ratchet enforces it.
- Dependencies are consumed as emitted `.d.ts`, ending source-recompilation-under-divergent-profiles.
- A single declared build order (`tsc --build` project-reference graph) serves typecheck, emit, and the production container — retiring the lenient masking root profile.
- No tsconfig/emit change is made by **this ADR** (DRAFT, doc-only); it authorises the staged work above.
