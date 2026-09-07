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
| **P3** | Single rAF | `requestAnimationFrame()` called **only** in `packages/frame-scheduler/src/RafAdapter.ts` (called by `FrameScheduler.ts`). Every other animation MUST subscribe to the frame bus. | `tools/ga-gate/check-raf-count.ts` (ratchet = 1) | ⛔ **CORRECTED 2026-08-29 — this cell read "Hard-fail, FAILING: 5 owner files, target 1". IT PASSES.** `npx tsx tools/ga-gate/check-raf-count.ts` → **RC=0**, `[raf-tripwire] OK: 1 owner`, **5,438 files scanned (2,841 excluded)**. The one owner is `RafAdapter.ts`. ⭐ **The "5" was 1 owner + 4 COMMENT-ONLY mentions** — the gate was counting sentences until the 2026-08-10 fix (`gate-debt.json` `§RAF-GATE-COMMENT-BLIND`). It now prints them separately: *"Comment-only mentions (not owners): 5 file(s)."* **Do not re-derive this with a naive `grep -c requestAnimationFrame` — that reproduces the original defect** |
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

### §2.1 — THE EXTENSION CONTRACT LIVES AT **L5**, NOT L7 (NORMATIVE — ADR-0367, L-9921)

⭐ **The type a plugin fulfils in order to be registered is `PluginRegistration`,
declared at `packages/plugin-sdk/src/registration.ts` — L5.** A plugin describing
itself is therefore a **downward import through the facade**, which the matrix
above already permits (`L6 → L5` is ✅) and which the shrink-only SDK-bypass
ratchet does not count.

⚠ **It used to be at L7** (`apps/editor/src/PluginRegistry.ts:133`), and that one
placement is the measured root cause of **nine element families shipping fully
built, fully tested and undispatchable** — furniture, plumbing, rooms, structural,
dimensions, lighting, pool (L-5200), lift (L-5700), balcony (L-5600). A contract
type at the top of a stack cannot be named by anything below it, so every
descriptor had to be hand-written centrally, so the census was hand-maintained, so
it drifted. **The generalisation worth keeping: which END of the stack a contract
type sits at decides whether the extension model is open or closed.** An extension
contract above the code that must satisfy it is not a contract — it is a table.

**NORMATIVE, from this point:**

- ⛔ **No new extension contract may be declared at L6 or L7.** If plugins must
  implement it, it belongs at L5 or below.
- ⛔ **L5 may not name an L6 type in order to host a contract.** Where a host type
  is genuinely needed (`PluginContribution`, the subscription runtime), it is a
  **type parameter** the composition root supplies — not an upward import. See
  ADR-0367 §2.2.
- ⚠ **Naming is part of the contract.** `PluginDescriptor` already meant two other
  things (the ADR-0038-locked `plugin.manifest.json` envelope in the SDK, and the
  catalogue row `PluginsSlot.list()` returns). Three types with one name is how a
  census drifts; a moved contract gets a name that says what it is.

**Read-back:** `tools/ga-gate/check-plugin-census-equivalence.ts` compares
`ls plugins/` · `ALL_PLUGINS` · `PLUGIN_CATALOG` · `ELEMENT_PLUGIN_IDS` as **SETS
in both directions** and resolves self-authored descriptors through the import
statement. **Read the gate, never this paragraph.**

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
| L6 | **51** plugins *(directories on disk, 2026-08-29 — but see the census note below: only **30** contribute at boot)* | 58,424 *(LOC dated 2026-05-01, NOT re-measured)* |
| L7 | **13** apps (`editor`, `marketplace`, workers, `docs-site`…) | — |

> ⚠ **Renumbered 2026-08-09** to match the corrected §2 table: SDK L6→L5, plugins
> L7→L6, apps added at L7. `file-format` and `view-state` were listed at BOTH L3 and
> L5 in the old table; they are L3. `frame-scheduler` is L1, not L3 — it imports
> nothing and is consumed by eleven L2 packages.

⛔ **CORRECTED 2026-08-29 (audit `element-creation/2026-08-29`, HEAD `064a838e`). This line read
*"54 packages, 12 apps, 46 plugins."* All three numbers were wrong; packages was wrong by roughly
a factor of two.**

| | Documented | Measured 2026-08-29 | Δ |
|---|---:|---:|---:|
| packages | 54 | **103** | **+49** |
| apps | 12 | **13** | +1 |
| plugins | 46 | **51** | +5 |

**The falsifying commands, in full:**

```bash
ls packages/*/package.json | wc -l          # -> 103   (manifests)
find packages -mindepth 1 -maxdepth 1 -type d | wc -l   # -> 103   (directories)
ls packages/ | wc -l                        # -> 105   (the 2 extra are FILES, not dirs:
                                            #           tsconfig.build.template.json,
                                            #           tsconfig.references.json)
ls apps/    | wc -l                         # -> 13
ls plugins/ | wc -l                         # -> 51
```

**Independent corroboration:** `tools/ga-gate/check-layer-boundaries.ts` reports **167 workspace
packages**, and `103 + 13 + 51 = 167`. **The disk is self-consistent; only this line was stale.**

⚠ **`CLAUDE.md`'s gloss on the packages count is right by accident and must not be copied.** It
says *"two entries under `packages/` carry no manifest, so count manifests, not directories."*
Measured: **every one of the 103 directories has a manifest** —
`for d in packages/*/; do [ -f "$d/package.json" ] || echo NO-MANIFEST: $d; done` prints **nothing**.
The 2-entry delta is two loose JSON *files*. The instruction yields the right answer today for the
wrong reason, and stops doing so the moment a genuinely manifest-less directory appears.

⛔ **A PLUGIN COUNT IS NOT ONE NUMBER, AND CONFLATING THE KINDS IS HOW THIS ROTS.** Five mutually
inconsistent figures are in simultaneous circulation, and they measure different things:

| Figure | What it actually counts | Source |
|---:|---|---|
| **51** | directories on disk | `ls plugins/` |
| 48 | a stale census | `CLAUDE.md`, `C07` |
| 46 | a staler census | *this line, before this correction* |
| **43** | rows the runtime **advertises** | `PLUGIN_CATALOG` / `plugins.list()` |
| **30** | ids that actually **contribute at boot** | `ALL_PLUGINS` |

Only the first is a census; the last two are capability. **`npx tsx tools/ga-gate/check-plugin-census-equivalence.ts`
exits RC=0 while certifying that 24 of the 51 plugin directories contribute NOTHING at boot** (arm A,
baseline 24) and 8 are absent from `plugins.list()` (arm B, baseline 8). **RC=0 is not 0 drift.**

**Do not re-transcribe any of these.** Re-run the commands; they have now been wrong at least twice.
The per-file inventory remains at `reference/architecture-detail/02-file-structure.md`.

---

## §4 — The 9 Convergence Booleans

PRYZM 3 exists at the git SHA when **all 9 are simultaneously true**.

```
#1  legacy_src_dirs_under_src == 0     (RESTATED 2026-08-29 - see the box below)
#2  window_any_in_apps_editor_src_ui == 0  (RESTATED 2026-08-29 - see the box below)
#3  raf_owners_outside_frame_scheduler == 0
#4  default_runtime == composeRuntime()
#5  EngineBootstrap_LOC == 0           ✅ achieved Wave 7 / S87-WIRE
#6  all_workflows_green == workflows_total
#7  plugin_sdk_published == true        (Phase F)
#8  headless_published == true          (Phase F)
#9  marketplace_live == true            (Phase F)
```

⛔ **CORRECTED 2026-08-29 (audit `element-creation/2026-08-29`, HEAD `064a838e`). This line read
*"**State today (post-Wave-12, 2026-05-01)**: 5/9 true (#2 ✅ #3 ✅ #4 ✅ #5 ✅ #6 ✅)."*
Measured: **2/9 strict — #3 and #5. 3/9 at its most generous**, counting #4 despite its one
tolerated rival. TWO of the five "achieved" booleans do not hold, and TWO MORE cannot hold as
they were worded.**

| # | Boolean | Documented | Measured 2026-08-29 | Falsifying command |
|---|---|---|---|---|
| 1 | `legacy_src_folders == 1` | — | ⛔ **MISCONFIGURED — REWORDED, not merely re-scored** | `find src -mindepth 1 -maxdepth 1 -type d \| wc -l` → **0** · `ls -d src/ui` → *No such file or directory* |
| 2 | `window_any_in_src_ui == 0` | ✅ achieved | ⛔ **MISCONFIGURED — REWORDED, not merely re-scored** | `grep -rn '(window as any)' src/` → **0**, but the scope **does not exist**. Successor scope `apps/editor/src/ui` → **1,120 files, 70 casts** |
| 3 | `raf_owners_outside_frame_scheduler == 0` | ✅ | ✅ **PASS — the strongest of the nine** | `npx tsx tools/ga-gate/check-raf-count.ts` → RC=0, `[raf-tripwire] OK: 1 owner`, **5,438 files scanned**, code lines distinguished from comments |
| 4 | `default_runtime == composeRuntime()` | ✅ | ⚠ **PARTIAL** — holds for the editor runtime, but the gate's own success line is false | `npx tsx tools/ga-gate/check-single-compose.ts` → RC=0, body prints `rival runtime factories: 1` and names `apps/component-editor/src/app/familyEditorRuntime.ts:85`; terminal line **hard-codes** `0 rivals` (`check-single-compose.ts:216`) |
| 5 | `EngineBootstrap_LOC == 0` | ✅ | ✅ **PASS** | `npx tsx tools/ga-gate/check-engine-bootstrap-loc.ts` → RC=0, cross-checked with a whole-tree `find`, which agrees |
| 6 | `all_workflows_green == workflows_total` | ✅ | ⛔ **FAIL** | `ls .github/workflows/ \| wc -l` → **8**, of which **6 are `workflow_dispatch`-only**; the merge-blocking `ga-gate` job runs `run-all.ts`, and **seven registered gates exit 3** at this SHA — `run-all.ts:1162` sets `anyFailed=true` on code 3 **unconditionally** |
| 7 | `plugin_sdk_published == true` | false (Phase F) | ⛔ **FAIL** | `npm view @pryzm/plugin-sdk version` **and** `npm view @pryzm/sdk version` (the `publishConfig` rename) → **E404** both. Control: `curl https://pryzm.app` → 302 from the same shell |
| 8 | `headless_published == true` | false (Phase F) | ⛔ **FAIL — and publish-READY** | `npm view @pryzm/headless version` → **E404**, while `packages/headless/package.json` has `private:false`, `publishConfig.access:public`, version `1.0.0-rc.2` |
| 9 | `marketplace_live == true` | false (Phase F) | ⛔ **FAIL — DNS, not downtime** | `curl https://marketplace.pryzm.app` → `code=000 err="Could not resolve host"`; control `curl https://pryzm.app` → **302**, same shell, same minute |

⛔ **#1 AND #2 ARE REWORDED ABOVE, NOT JUST RE-SCORED, AND THE REASON IS THE POINT.** Both were
satisfied by **the absence of a directory**, not by clean code. ~~`src/ui/`~~ no longer exists: `src/`
holds **7 loose files and 0 subdirectories**. So #1's target of `== 1` names a folder that is gone —
**it was never true and cannot become true as worded** — and #2's `0` is the count of casts in a
directory that is not there. **Absence of the folder and absence of the defect are the same value.**
That is `§CONTEXT-DATA-HONESTY` appearing as a convergence metric, and it is why re-scoring alone
would have been the wrong fix: a MISCONFIGURED predicate scored FALSE is still a predicate that
cannot be satisfied. The restated forms above name scopes that exist, so they can be **measured**
and can **become true**. The successor scope's current reading is **70 casts across 1,120 files**;
the repo-wide P4 arm is **101 / 100 — BREACHED** (`npx tsx tools/ga-gate/check-cast-count.ts` → RC=3).

⚠ **NO GATE COMPUTES #1, #2, #6, #7, #8 OR #9.** Six of the nine are hand-measured, which is how
this line stayed wrong for four months. **Read the commands in the table; do not re-transcribe the
score.**

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

### Status — RE-MEASURED 2026-08-29 (HEAD `064a838e`)

> ⛔ **CORRECTED 2026-08-29 (audit `element-creation/2026-08-29`). The counts in this section were
> 20 days stale and understated the suite by roughly a factor of three.**
>
> | | Documented (2026-08-09) | Measured 2026-08-29 | Falsifying command |
> |---|---:|---:|---|
> | gate scripts in `tools/ga-gate/` | 31 | **74** `check-*.ts` (75 `.ts` incl. `run-all.ts`) | `ls tools/ga-gate/*.ts \| wc -l` |
> | distinct scripts registered in `run-all.ts` | — | **98** | parse of `const GATES: Gate[]` |
> | gate files across BOTH homes | 31 | **120** | + `tools/rac-conformance/certification/gates/` (**46**) |
> | `gate-debt.json` entries | 15 | **2** | `jq '.failing \| length' tools/ga-gate/gate-debt.json` |
> | `gate-newly-measured.json` entries | *(category did not exist)* | **32** | created 2026-08-12 |
>
> ⭐ **THE 15 → 2 DROP IS NOT PROGRESS.** Thirty-two tolerated-failure entries **moved** to the
> sibling `gate-newly-measured.json`, a ledger that did not exist on 2026-08-09. Reading
> `gate-debt.json` alone now understates declared debt sixteen-fold. **Read both ledgers.**
>
> ⛔ **ONE COMMITTED GATE IS REGISTERED IN NO RUNNER — a gate policing nothing.**
> `tools/ga-gate/check-render-aggregate-seam.ts` (committed `377dd06b`, L-10530, `git ls-files`
> confirms it is TRACKED) appears in **no `run-all.ts` row and no `ci.yml` step**. Run by hand it
> **FAILS**: `npx tsx tools/ga-gate/check-render-aggregate-seam.ts` → **RC=1**, arm A 0/0, **arm B
> 50 / 49**, across a non-empty scope of **7,984 files**. `run-all.ts:1009-1041`
> (`GATE-AUTHORED-BUT-UNWIRED`) exists precisely to catch this and would set `inventoryFailed=true`
> — it cannot, because the gate is invisible to it. **Disposition: WIRE it (the arm is real and
> failing), not REMOVE it.**
>
> ⛔ **ONE LEDGER KEY CAN NEVER MATCH.** `gate-newly-measured.json` carries
> `check-dependent-adapts-on-host-move.ts` with `runner: ga-gate`, but `run-all.ts` registers it as
> `../rac-conformance/certification/gates/check-dependent-adapts-on-host-move.ts`. `run-all.ts:1181`
> does `newlyMeasured.get(gate.script)` against the **exact** registered string, so the lookup can
> never hit and the gate's exit 1 falls through to the REGRESSION branch at `run-all.ts:1212`.
> **`run-all.ts` has no orphan-ledger-key check** — the only key checks are `inBoth` (:915) and
> `malformed` (:941).
>
> ⛔ **THE MERGE-BLOCKING `ga-gate` JOB FAILS AT THIS SHA.** Seven registered gates exit **3**
> (SHRINK-ONLY RATCHET EXCEEDED), and `run-all.ts:1162` sets `anyFailed=true` on code 3
> **unconditionally** — §RATCHET-EXCEEDED-IS-NEVER-DEBT (R7 / L-836). **No ledger entry may absorb
> any of them, and raising any ceiling to clear one is the single forbidden fix.**
>
> ⚠ **THE STATUS COLUMN BELOW NOW CARRIES `RC` + THE COMMAND, NOT A TRANSCRIBED COUNT.** Every
> previous revision of this table rotted the same way: a number copied out of a gate and left to
> age. The gate is the authority (`run-all.ts:73` says so in its own header: *"the numbered
> inventory above is a HISTORY, not a census"*). **Read the gate, never this table.**

| Gate | Script | Principle | Status — real number, not an aspiration |
|---|---|---|---|
| Layer boundaries | `tools/ga-gate/check-layer-boundaries.ts` | L0–L7 matrix | ⛔ **RC=3 — ALL FOUR ARMS BREACHED** (2026-08-29): upward **105/102** · SDK-facade bypass **186/182** · banned third-party **123/113** · unclassified **15/13**. 167 workspace packages, 152 classified. SDK bypass is tracked **separately** by the gate itself — `plugin → renderer-three` is a *downward* edge, a facade breach not a layer violation; merging the two makes both unreadable. NOT `eslint-plugin-boundaries` — see the note above |
| Single composition root | `tools/ga-gate/check-single-compose.ts` | P1 | ⛔ **RC=0, AND THE SUCCESS LINE IS FALSE.** Body prints `composeRuntime definitions: 1 · rival runtime factories: 1 · production callers: 2` and names the rival `apps/component-editor/src/app/familyEditorRuntime.ts:85 createFamilyEditorRuntime`; the terminal line at `check-single-compose.ts:216` then prints the **hard-coded string** `0 rivals`. `MAX_RIVALS` defaults to 1 (:103), so the gate passes **at a ratcheted ceiling of one rival while reporting zero**. **Disposition: REPLACE the literal with the count.** A false green manufactured inside the instrument |
| THREE isolation | `tools/ga-gate/check-three-imports.ts` | P2 | ✅ **RC=0, hard-0 across 8,171 files** (2026-08-29). Zero headroom, widest scope in the suite — the strongest reading here. Was on the debt ledger only because of the `rg` crash; removed from it |
| rAF owners | `tools/ga-gate/check-raf-count.ts` | P3 | ⛔ **CORRECTED 2026-08-29 — this cell read "FAILING: 5 owner files, target 1. Declared debt." IT PASSES, hard-0 at one declared owner.** `npx tsx tools/ga-gate/check-raf-count.ts` → **RC=0**, `[raf-tripwire] OK: 1 owner` · 5,438 files scanned · 5 comment-only mentions correctly excluded. **Not declared debt — a genuine PASS**, and the strongest of the nine convergence booleans (§4 #3). See §1 P3 for why the "5" existed |
| `(window as any)` | `tools/ga-gate/check-cast-count.ts` | P4 | ⛔ **RC=3 — BOTH ARMS BREACHED** (2026-08-29): scoped strict **11 / 3** (headroom **−8**, `A regression added 8 new cast(s)`) · repo-wide **101 / 100** across 5,315 files, tests excluded. ⚠ **Two latent hazards in the gate itself:** (a) `:78-79` returns `Number.MAX_SAFE_INTEGER` when the baseline file is absent, so a MISSING PREREQUISITE and a CLEAN MEASUREMENT print the same result; (b) when `current < baseline` it calls `writeBaseline`, **mutating a git-tracked ledger** — a local run can silently move the ceiling. Neither is firing today. Carried and **not re-measured**: `gate-debt.json`'s own `$comment` records **409 `window as unknown as` casts across 151 files this regex cannot see** |
| Schemas purity | `tools/ga-gate/check-domain-purity.ts` | P5 | ✅ **RC=0, hard-0 across 192 files** (2026-08-29), scope independently confirmed non-empty |
| Direct store writes from UI | `tools/ga-gate/check-no-direct-store-writes.ts` | P6 | ⚠ **RC=0 at 37 / 37 — zero headroom at a NON-ZERO ceiling** (2026-08-29). ⛔ **`packages/` is not in scope**: a direct store write from a package is invisible to this gate **by design**. RC=0 here is not "P6 holds" |
| Visibility intent ≠ UI | `tools/ga-gate/check-visibility-intent-not-ui.ts` | P7 | ⚠ **RC=0, PROXY-ONLY** (2026-08-29). Arm A hard-0 over 20 files; arm B **40 / 43** (headroom 3) across 772 UI files. The gate prints its own NOT-CHECKED list on every run — persistence, per-view scoping, the AI intent path. See the honesty note below |
| OpenTelemetry spans | `tools/ga-gate/check-otel-spans.ts` | P8 | ⛔ **RC=3 — and it is THREE-ZONE, not the single `floor 213` count this row used to name** (2026-08-29): ZONE A (CommandBus handlers, zero tolerance) **275 / 275 instrumented, clean**; ZONE B **66 uninstrumented of 87 against a shrink-only baseline of 52 — 14 NEW files, this is the failure**; ZONE C (the literal C10 §2 "every exported function" clause) **UNGATED at 2,100 of 2,399**. Zone C prints a number and gates nothing, so the headline clause is measured for **zero** of the 2,399 |
| Everything else | `tools/ga-gate/*.ts` + `tools/rac-conformance/certification/gates/*.ts` | assorted | ⛔ **RE-MEASURED 2026-08-29.** This row said *"(22 gates) … Suite total on 2026-08-09: 16 passing / 15 declared debt / 0 regressions (**31 gates**)"*. Measured: **74 `check-*.ts` under `tools/ga-gate/` · 98 distinct scripts registered in `run-all.ts` · 120 gate files across both homes · 2 `gate-debt.json` entries + 32 `gate-newly-measured.json` entries · 1 committed-but-unregistered gate · 7 exit-3 ratchet breaches**. `ls tools/ga-gate/*.ts \| wc -l`. **Do not transcribe a suite total here again — `run-all.ts` is the census and says so at :73** |

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

These rules are merge-blocking non-negotiables (rules 1–5 from `01-VISION.md §8`; rule 6 added 2026-08-22):

1. **Edit canonical docs; do not write audit derivatives.** When a discrepancy surfaces, edit the relevant `C0N-*.md` or `02-ARCHITECTURE.md`. Writing a new `*-AUDIT-2026-MM-DD.md` is prohibited.
2. **A sub-phase is done when runtime behaviour matches the spec**, not when documentation says so.
3. **The live verifiers in `03-CURRENT-STATE.md §1` are re-run every sprint close.** Any positive delta on a tripwired metric is an incident.
4. **Phase F cannot start until ≥ 6/9 convergence booleans are true** (`§4` above).
5. **Every PR adding a new exported function adds ≥ 1 OpenTelemetry span** (P8). No span = no merge.
6. ⭐ **"X DOES NOT EXIST" IS A MEASUREMENT. GREP BEFORE YOU CLAIM IT.** *(§6.1)*

### §6.1 — Rule 6, in full: an absence claim is a measurement, not an observation

**Founder ruling, 2026-08-22.** No document, audit register, ISSUE-LOG row, ADR, commit message or
report may state that a capability, instrument, gate, test, field or code path is **MISSING, ABSENT,
NOT BUILT, or DOES NOT EXIST** unless the author ran a search for it and can cite the command. The
citation is part of the claim, exactly as a measured count is.

**Why this is merge-blocking and not advice.** This repository's governing method is re-running
commands, and its most expensive recurring defect is a confident sentence about the code that the
code contradicts. Both directions have now cost real work:

| direction | the claim | what was actually there |
|---|---|---|
| **claimed PRESENT, was absent** | *"CI enforces layer boundaries via `eslint-plugin-boundaries`"* (L-809) | no `import/resolver` — it checked essentially nothing |
| **claimed PRESENT, was absent** | *"the conflict-surfacing half has no gate"* | the gate exists, under `tools/rac-conformance/` |
| **claimed ABSENT, was present** | *"no per-family mesh census exists"* — ranked **#1** open item in `APPLICATION-PERFORMANCE-LEDGER.md §9.5` | `censusScene()` in `apps/editor/src/engine/pryzmPerfConsole.ts` computes exactly that, per family, and had since INSTR1 |

⛔ **The third row is the one this rule is named for, and it is the more dangerous shape.** A false
*"it exists"* gets caught the first time someone tries to use it. A false *"it does not exist"*
**silently authorises building a second one** — and a rival instrument that disagrees with the first
is strictly worse than the gap that was imagined. The census case cost a #1 ranking on a performance
ledger and nearly cost a duplicate tool.

**What the rule requires, minimally:**

1. **Search by capability, not by the name you would have given it.** The census was not called
   `meshCensus`. Grep the thing it would *compute* (`elementsByType`, `standaloneMeshes`), not the
   name you expect. A single-name grep returning nothing is not evidence of absence.
2. **Search the whole tree, and say what you excluded.** Tests, `tools/`, and non-obvious
   directories count as existing: two of the three rows above were missed because the search
   stopped at the directory the author expected.
3. **Distinguish ABSENT from UNREACHABLE, and prefer the second.** *"It does not exist"* and *"it
   exists and nothing calls it"* have **opposite fixes** — build it, versus wire it. The census was
   the second: complete, correct, and invoked only if a human typed `pryzmPerf.report()`. Ranking it
   as missing would have produced a rival; ranking it as unwired produced a three-line call site.
4. **State the command.** *"`grep -rn censusScene apps packages` → 1 definition, 0 production
   callers"* is a claim a reader can refute. *"There is no census"* is not.

**Anti-pattern this rule forbids by name:** promoting an unsearched absence to a ranked work item.
An absence that has not been searched for is a **hypothesis**, and it is recorded with the word
UNVERIFIED beside it or it is not recorded at all.
