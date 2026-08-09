# C01 — Architecture & Governance

> **Stamp**: 2026-08-09 (§1 §2 §3 §5 corrected against measurement — L-809 / L-811 / L-812) · **Status**: CANONICAL  
> **Authority**: `01-VISION.md` and `02-ARCHITECTURE.md` supersede this contract on any conflict.  
> **Scope**: the 8-layer model, the 8 architectural principles, the cross-cutting CI gates, and the 9 convergence booleans that define when PRYZM 3 exists.

---

## §1 — The 8 Architectural Principles (P1–P8)

Each principle is a **merge-blocking contract**. Soft-fail counters become hard-fail at the stated phase exit.

| # | Principle | Binding rule | CI gate | Status |
|---|---|---|---|---|
| **P1** | Single composition root | ONE `composeRuntime()` in production. No second runtime wiring, no parallel composition. | `tools/ga-gate/check-single-compose.ts` | **Written 2026-08-09 (L-812) — the file did NOT exist before.** Passing: 1 definition, 1 rival (`createFamilyEditorRuntime`, ratcheted), 2 production callers |
| **P2** | Single THREE owner | `import * as THREE` allowed **only** in `packages/renderer-three/`. All other THREE uses are a CI failure. | `tools/ga-gate/check-three-imports.ts` (hard 0) | Hard-fail, **PASSING** — 0 violations across 6,261 files. Not `eslint-plugin-boundaries`; see §5 note |
| **P3** | Single rAF | `requestAnimationFrame()` called **only** in `packages/frame-scheduler/src/RafAdapter.ts` (called by `FrameScheduler.ts`). Every other animation MUST subscribe to the frame bus. | `tools/ga-gate/check-raf-count.ts` (ratchet = 1) | Hard-fail, **FAILING: 5 owner files, target 1** (L-811 — the gate crashed on missing `rg` for months, so this was never visible) |
| **P4** | No `(window as any)` | Forbidden everywhere except the allowlisted shim `apps/editor/src/engine/window-shim.ts`. The allowlist is one file; adding to it requires an ADR. | `tools/ga-gate/check-cast-count.ts` (strict ceiling 0 · repo-wide ratchet 215) | Hard-fail, **FAILING: 20 in the strict scope, 215 repo-wide.** The old "achieved Wave 5" claim was scope drift — the gate scanned `src/`, which is now empty (L-811b) |
| **P5** | Schemas are pure | `packages/schemas/` MUST have zero I/O imports, zero THREE, zero DOM. | `tools/ga-gate/check-domain-purity.ts` | **Written 2026-08-09 (L-812) — `scripts/ci-check-domain-purity.ts` never existed.** Hard-fail at 0, **PASSING**: 0 impurities across 165 files |
| **P6** | Commands are the only mutation path | UI MUST dispatch commands through `commandBus`. No direct store writes from UI code. | `tools/ga-gate/check-no-direct-store-writes.ts` | **Written 2026-08-09 (L-812) — `scripts/ci-check-no-direct-store-writes.ts` never existed; NOTHING checked P6.** Shrink-only ratchet at **41** direct writes |
| **P7** | Visibility intent ≠ UI state | `packages/visibility/` is a first-class domain concept. Plugins and AI express intent without owning UI. | `tools/ga-gate/check-visibility-intent-not-ui.ts` | **Written 2026-08-09 (L-812) — the named test never existed.** PARTIAL by construction: arm A (domain package contains no UI) hard-fails at 0 and passes; arm B (direct `.visible =` from UI) is a ratcheted **43**-site proxy. The semantic claim itself is NOT statically checkable — see §5 |
| **P8** | Sync conflicts explicit + spans required | CRDT merges that lose data surface as user-resolvable conflicts (never silent). Every new exported function MUST add ≥ 1 OpenTelemetry span. | `tools/ga-gate/check-otel-spans.ts` | Hard-fail, **PASSING** (245 ≥ floor 213). `scripts/ci-check-spans.ts` is a stale name — the gate was renamed, not lost |

---

## §2 — The 8-Layer Model

The dependency rule is absolute: **a layer MAY import from any lower layer; it MUST NOT import from a higher layer.**

> ⚠ **Corrected 2026-08-09 (L-809 / L-812).** The table below previously read
> `L9 plugins / L8 SDK / L7 apps`, placing **apps beneath the plugins they host**.
> That ordering was never measured; it was assumed. When the real layer gate was
> written and the edges counted, the result was unambiguous:
>
> | Direction | Real import statements |
> |---|---:|
> | `apps → plugins` | **142** |
> | `plugins → apps` | **0** |
>
> `apps/editor` imports twenty-odd plugins **in order to register them**. That is
> what a composition root does — it is structural, not debt. Encoding the old
> order minted **151 permanent false violations**, i.e. a gate that could never
> reach green and therefore would have been switched off.
>
> A second correction: **`frame-scheduler` moved L3 → L1.** It imports nothing at
> all and is consumed by eleven L2 `geometry-*` packages plus `core-app-model`. A
> zero-dependency primitive consumed by L2 cannot sit at L3; the old placement
> generated ~29 more false violations.
>
> This table now matches `CLAUDE.md` and `eslint.config.js`. **Do not re-derive a
> third version** — if it needs to change, change all three together, and measure
> the edges first.

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

### Import matrix

| From ↓ / To → | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| L0 | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L1 | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| L2 | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ | ❌ |
| L3 | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ | ❌ |
| L4 | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ | ❌ |
| L5 | ✅ | ✅ | ✅ | ✅ | ✅ | — | ❌ | ❌ |
| L6 (plugins) | subset | subset | subset | subset | subset | ✅ | — | ❌ |
| L7 (apps) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |

**"subset"** means the SDK re-exports a curated subset. In the intended end state a
plugin reaches the platform only through `@pryzm/plugin-sdk`.

### Three things in this section that are NOT YET TRUE

Recorded as goals rather than invariants, so nobody reads an aspiration as a
guarantee. All three are measured and ratcheted by
`tools/ga-gate/check-layer-boundaries.ts`.

- **"Plugins may import the SDK only" is a GOAL.** Measured **630** SDK imports
  against **171 direct bypasses** (`renderer-three` ×84, `command-registry` ×29,
  `core-app-model` ×27, `scene-committer` ×19). Tracked on its own shrink-only
  ratchet rather than folded into the violation count, because `plugin →
  renderer-three` goes *downward*: it is a facade-encapsulation breach, not a
  layer violation, and merging the two makes both numbers unreadable.
- **`runtime-composer` is not really L3.** It is the P1 composition root and
  necessarily imports `persistence-client`, `renderer`, four typology packs, five
  plugins and `apps/editor`. 16 violations are this one fact.
- **`core-app-model` / `command-registry` sit at L2 while importing L4.** The real
  debt is that a domain model depends on persistence.

**Backend packages have no layer** — `admin-overrides`, `ai-spend`, `api-rbac`,
`api-spec`, `rate-limit`, `webhooks`, `email-transport`, `beta-signup`. Consumed
only by `apps/api-gateway` / `marketplace-api`, zero client dependencies. Open
question: does this model extend to the backend, or does the backend need its own?

---

## §3 — Package Ownership

| Layer | Canonical packages | LOC (2026-05-01) |
|---|---|---:|
| L0 | `schemas` | 3,016 |
| L1 | `command-bus`, `frame-scheduler`, `picking`, `visibility`, `ai-cost`, `sync-client`, `runtime-undo-stack`, `ui`, `input-host`, `physics-host`, `renderer-three`, `snapping`, `spatial-index` | ~14,000 |
| L1½ | `protocol` → schemas; `drawing-primitives` → schemas | 1,110 |
| L2 | `geometry-kernel`, `ai-host`, `types-builtin`, `constraint-solver` | ~14,000 |
| L3 | `stores`, `runtime-composer`, `ui-base`, `view-state`, `file-format`, `sync-client` | ~10,000 |
| L4 | `scene-committer`, `persistence-client`, `renderer`, `render-runtime` | 9,878 |
| L5 | `plugin-sdk` v1.0.0-rc.1 — the curated facade | 2,067 |
| L6 | 46 plugins | 58,424 |
| L7 | 14 apps (`editor`, `marketplace`, workers, `docs-site`…) | — |

> ⚠ **Renumbered 2026-08-09** to match the corrected §2 table: SDK L6→L5, plugins
> L7→L6, apps added at L7. `file-format` and `view-state` were listed at BOTH L3 and
> L5 in the old table; they are L3. `frame-scheduler` is L1, not L3 — it imports
> nothing and is consumed by eleven L2 packages.

**54 packages, 12 apps, 46 plugins.** The per-file inventory is the canonical source of truth: `reference/architecture-detail/02-file-structure.md`.

---

## §4 — The 9 Convergence Booleans

PRYZM 3 exists at the git SHA when **all 9 are simultaneously true**.

```
#1  legacy_src_folders == 1            (only src/ui/ remains)
#2  window_any_in_src_ui == 0          (P4 hard-fail in src/ui/)
#3  raf_owners_outside_frame_scheduler == 0
#4  default_runtime == composeRuntime()
#5  EngineBootstrap_LOC == 0           ✅ achieved Wave 7 / S87-WIRE
#6  all_workflows_green == workflows_total
#7  plugin_sdk_published == true        (Phase F)
#8  headless_published == true          (Phase F)
#9  marketplace_live == true            (Phase F)
```

**State today (post-Wave-12, 2026-05-01)**: 5/9 true (#2 ✅ #3 ✅ #4 ✅ #5 ✅ #6 ✅). Live table: `03-CURRENT-STATE.md §8`.

**Phase F (booleans #7, #8, #9) MUST NOT start until ≥ 6/9 booleans are true** (Rule 4 of `01-VISION.md §8`).

---

## §5 — CI Gate Inventory

> ⚠ **Rewritten 2026-08-09 (L-811 / L-812) after measurement.** The previous
> version of this section was an inventory of intentions. Of the gates it listed
> as hard-fail and merge-blocking:
>
> - **FIVE named script files did not exist at all** — `check-single-compose.ts`
>   (P1), `ci-check-domain-purity.ts` (P5), `ci-check-no-direct-store-writes.ts`
>   (P6), `intent-not-ui.test.ts` (P7), `ci-check-spans.ts` (P8). P8 turned out to
>   be a rename (the gate is real, at `tools/ga-gate/check-otel-spans.ts`). The
>   other four were never written. **P1, P5, P6 and P7 had no enforcement of any
>   kind for fifteen months**, including P6, which the undo, CRDT and AI
>   batch-apply models all depend on.
> - **THREE gates crashed instead of reporting** — `check-three-imports` (P2),
>   `check-raf-count` (P3), `check-cast-count` (P4) shelled out to `ripgrep`,
>   which is not a declared dependency and which `ci.yml` never installed. They
>   died with `spawnSync rg ENOENT`. Because all three were also on
>   `gate-debt.json`, the crash was absorbed as "known failing" — a MISSING
>   PREREQUISITE and a REAL VIOLATION produced the same observable state.
> - **Row 1 claimed layer boundaries were "CI-enforced via `eslint-plugin-boundaries`".**
>   They were not. `eslint.config.js` configured **no `import/resolver`**, so
>   boundaries could not resolve `@pryzm/*` specifiers — which is how essentially
>   every cross-package import in this repo is written — and silently checked
>   nothing for them. The rule was set to `'error'` and matched almost none of the
>   imports it existed to police.
>
> **A gate inventory that lists gates which do not exist is worse than an empty
> one**, because it reads as coverage. `tools/ga-gate/run-all.ts` now refuses to
> start if any listed script file is missing, and treats exit code 2
> (MISCONFIGURED) as never excusable as declared debt.

**Authority**: `tools/ga-gate/run-all.ts`, invoked by `.github/workflows/ci.yml`
job `ga-gate` via `pnpm run ga-gate:all`. That job is merge-blocking (no
`continue-on-error`). Today's ratchet tolerates declared debt in
`tools/ga-gate/gate-debt.json` and blocks a regression, a stale baseline, a
missing gate file, or a misconfigured scan.

### Status as measured on 2026-08-09

| Gate | Script | Principle | Status — real number, not an aspiration |
|---|---|---|---|
| Layer boundaries | `tools/ga-gate/check-layer-boundaries.ts` | L0–L7 matrix | **PASSING at a non-zero ceiling.** violations 102/102 · unclassified 13/13 · SDK-bypass 171/171 · restricted-imports 113. Shrink-only. NOT `eslint-plugin-boundaries` — see the note above |
| Single composition root | `tools/ga-gate/check-single-compose.ts` | P1 | **NEW (L-812).** PASSING — 1 definition, 1 ratcheted rival (`createFamilyEditorRuntime`), 2 production callers |
| THREE isolation | `tools/ga-gate/check-three-imports.ts` | P2 | **PASSING, hard 0** — 0 violations across 6,261 files. Was on the debt ledger only because of the `rg` crash; removed from it |
| rAF owners | `tools/ga-gate/check-raf-count.ts` | P3 | **FAILING: 5 owner files, target 1.** Declared debt. Ceiling NOT raised |
| `(window as any)` | `tools/ga-gate/check-cast-count.ts` | P4 | **FAILING: 20 strict / 215 repo-wide.** Declared debt. The strict scope had drifted onto `src/`, which is now empty — the old "0 achieved" was a scope artefact |
| Schemas purity | `tools/ga-gate/check-domain-purity.ts` | P5 | **NEW (L-812).** PASSING, hard 0 — 0 impurities across 165 files, 7 rule families |
| Direct store writes from UI | `tools/ga-gate/check-no-direct-store-writes.ts` | P6 | **NEW (L-812).** PASSING at a ratcheted **41** direct writes. Shrink-only |
| Visibility intent ≠ UI | `tools/ga-gate/check-visibility-intent-not-ui.ts` | P7 | **NEW (L-812), PARTIAL BY CONSTRUCTION.** Arm A (domain package contains no UI) hard-fails at 0 and passes. Arm B (direct `.visible =` from UI) is a ratcheted **43**-site proxy. See the honesty note below |
| OpenTelemetry spans | `tools/ga-gate/check-otel-spans.ts` | P8 | **PASSING** — 245 ≥ floor 213. Formerly mis-cited as `scripts/ci-check-spans.ts` |
| Everything else (22 gates) | `tools/ga-gate/*.ts` | assorted | See `run-all.ts` and `gate-debt.json`. Suite total on 2026-08-09: **16 passing / 15 declared debt / 0 regressions** (31 gates) |

### P7 is only partly checkable, and the gate says so

"Visibility intent is a domain concept, not UI state" is a claim about what a
value **means** — whether a boolean is a durable, per-view, persisted, replicated
design decision or an ephemeral rendering flag. Statically they are the same
`boolean`. No regex and no type checker can separate them.

The gate therefore asserts only what is decidable (the domain package contains no
DOM, no UI imports, no THREE — hard 0) plus a growth tripwire on direct
`.visible =` assignments from UI, and it prints, on every run, the list of things
it does **not** check: persistence, per-view scoping, and whether the AI expresses
intent rather than mutating the scene. Those need behavioural tests in
`packages/visibility/__tests__/`.

**A weak gate is worse than no gate**, because a green tick manufactures
confidence that was never earned. Closing this properly is behavioural-test work,
not static-analysis work, and it remains open.

---

## §6 — Discipline Rules

These five rules are merge-blocking non-negotiables (from `01-VISION.md §8`):

1. **Edit canonical docs; do not write audit derivatives.** When a discrepancy surfaces, edit the relevant `C0N-*.md` or `02-ARCHITECTURE.md`. Writing a new `*-AUDIT-2026-MM-DD.md` is prohibited.
2. **A sub-phase is done when runtime behaviour matches the spec**, not when documentation says so.
3. **The live verifiers in `03-CURRENT-STATE.md §1` are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Phase F cannot start until ≥ 6/9 convergence booleans are true** (`§4` above).
5. **Every PR adding a new exported function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.
