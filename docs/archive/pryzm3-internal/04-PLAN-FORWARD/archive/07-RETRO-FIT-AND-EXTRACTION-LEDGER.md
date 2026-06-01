# 07 — Retro-Fit and Extraction Ledger

> **Position**: After `06-PER-FAMILY-AND-TOOLBAR-LEDGER.md`. Distilled from `reference/wireup-2026/chunks/24-pryzm1-src-coverage-audit.md` (per-`src/`-folder coverage audit), `chunks/26-plan-self-corrections.md` (eleven plan-internal amendments + the Z.* retro-fit phase), and `chunks/27-phase-H-extraction-ledger.md` (per-package `src` → `dist` extraction ledger).
>
> **Why this is plan-forward, not reference**: this file holds the **two ledgers** that close the loop on Wave 7 → Wave 8 transition. The Z.* retro-fit phase (§2) lands the verification harness that the original chunk-23 plan promised but did not author. The H.* extraction ledger (§3) is the running tally of which workspace packages have flipped from `main: ./src/index.ts` to compiled `./dist/index.js`. Both are live: every PR that lands a row updates this file.
> **⚠ TRACKER RULE**: Editing this file → update `../00-PROCESS-TRACKER.md` same commit (§3 wave ledger row, §4 next-actions, §2 booleans as applicable).

---

## §1 — Per-`src/`-folder coverage status

Source-of-truth audit: `chunks/24 §24.1`. The 35 top-level directories under `src/` split into 4 tiers. This table is the **plan-forward enforcement view** — every Tier-A and Tier-B+C directory has a sub-phase ID that lands its deletion (Phase G), and every Tier-D directory is in the **allowlist** that Phase H's GA-cut-blocker check enforces (`chunks/24 §24.7`).

### §1.1 Tier A — covered by the original §5 list (6 folders, ~150K LOC)

| `src/<dir>` | New target | Wave | Sub-phase landing deletion |
|---|---|---|---|
| `engine/` | `composeRuntime()` + `runtime.scene` | Wave 4 | covered-S72 |
| `elements/` | `plugins/<family>/` (12+) | Wave 6 | E.1–E.14 + E.15–E.17 |
| `commands/` | `plugins/<family>/handlers` + `packages/command-bus` | Wave 4 + Wave 6 | covered-S72 |
| `core/` | per-package leg of `runtime.*` | Wave 4 + Wave 5 | covered-S72 |
| `ai/` | `runtime.ai.*` (`packages/ai-host` + `apps/ai-worker`) + 5 AI plugins | Wave 7 F.7 | covered-S72 |
| `services/` | per-package equivalents on `runtime` | Wave 5 | covered-S72 |

### §1.2 Tier B — UI-cited but original-plan GAP (12 folders, ~22K LOC)

These were unaddressed by the original §5 list. `chunks/24 §24.5` adds 31 new sub-phase IDs (B.6–B.10, C.14, E.6.0, E.15–E.17, G.10–G.31) to close them.

| `src/<dir>` | New target | New sub-phase (B/C/E series) | Deletion sub-phase | Sprint |
|---|---|---|---|---|
| `tools/` | `runtime.tools` + `packages/drawing-primitives` | **B.6** | **G.10** | B.6 → S74-WIRE; G.10 → S82-WIRE |
| `monetization/` | `runtime.entitlements` | **B.7** | **G.11** | B.7 → S74-WIRE; G.11 → S82-WIRE |
| `import/` (dxf+ifc+rhino legacy) | `runtime.{ifc,dxf,rhino}.import` proxies | **B.8** | **G.12** | B.8 → S75-WIRE; G.12 → S83-WIRE |
| `generative/` | `runtime.ai.generative` proxy to `plugins/ai-generative` | (covered by F.7.07) | **G.13** | S83-WIRE |
| `rendering/` | `runtime.scene.renderer.presets` + `plugins/lighting` | **B.9** | **G.14** | B.9 → S75-WIRE; G.14 → S83-WIRE |
| `cde/` | `runtime.cde.structuredName` (`packages/api-spec`) | (covered by F.11.3) | **G.15** | S83-WIRE |
| `export/` (glb+ifc+sheets+rationale) | `runtime.export.*` | **B.10** | **G.16** | B.10 → S75-WIRE; G.16 → S83-WIRE |
| `portfolio/` | `packages/stores.portfolio` (per ADR-041) | (none — direct deletion) | **G.17** | S84-WIRE |
| `physics/` (dev-only per ADR-042) | dev-only `apps/bench/physics-overlay/` | (covered by F.12.2 dev) | **G.18** | S84-WIRE |
| `geospatial/` | new `packages/geospatial` (Cesium bridge) | (covered by F.11.4) | **G.19** | S84-WIRE |
| `api/` (`apiFetch.ts`) | `runtime.persistence.client.fetch` | (covered by F.6.5) | **G.20** | S84-WIRE |
| `persistence/` (`UnderlayPersistence.ts`) | `runtime.persistence.underlay` | **C.14** | **G.33** | C.14 → S76-WIRE; G.33 → S82-WIRE D9 |

### §1.3 Tier C — not UI-imported, still legacy (12 folders)

`snapping/`, `spatial/`, `topology/`, `structural/`, `migration/`, `collaboration/`, `constraints/`, `history/`, `render/`, `visibility/`, `furniture/`, `features/`. All deleted by G.21–G.31; absorbed by their corresponding packages (see `chunks/24 §24.1`).

### §1.4 Tier D — stays as-is (5 folders + 4 root files)

| Item | Why it stays | GA-cut allowlist? |
|---|---|---|
| `src/styles/` (44 CSS) | white UI's CSS (Vision §6, Discipline Rule 7) | ✅ |
| `src/utils/` (7 helpers; per ADR-043 stays inline) | low-risk, no UI breakage | ✅ |
| `src/types/` (`three-addons.d.ts`) | TypeScript ambient declarations | ✅ |
| `src/dev/` (`WallPerfBench.ts`) | dev-only | ✅ |
| `src/ui/` (220 files) | the white UI — the entire wireup target | ✅ |
| `src/main.ts`, `src/browser-entry.tsx`, `src/browser.css`, `src/familyCreatorPlaceholder.ts` | App-Shell entry | ✅ |

### §1.5 Phase G exit gate

After all Tier B + Tier C sub-phases land, the GA-cut-blocker check (`chunks/24 §24.7`) asserts only the Tier-D allowlist remains under `src/`. The check is parametric: `find src -name '*.ts' -o -name '*.tsx' | wc -l ≤ 230` (per `wireup-floor.json.src_ts_files`, per `chunks/26 §26.8`).

---

## §2 — Z.* retro-fit phase ledger (verification-harness back-fill)

Source: `chunks/26 §26.1, §26.5, §26.6, §26.7, §26.8, §26.9, §26.10, §26.11`. The chunk-23 plan promised 9 verification artefacts that were never authored. Z.* lands them as remedial work in the back half of Phase C (S77-WIRE D1–D9), without slipping the Phase D opening.

| Sub-phase | Deliverable | Lands by | Status |
|---|---|---|---|
| **Z.0** | Fix shell bugs in `chunks/23` (`--type=tsx` → `-g '*.tsx'`; `git log --extended-regexp` for §23.7) — single doc-PR, ~30 line diff | S77-WIRE D1 | TODO |
| **Z.1** | Author `packages/eslint-plugin-pryzm/` workspace; scaffold rule loader | S77-WIRE D1 | TODO |
| **Z.2** | Implement `no-window-as-any` rule + tests; ship as **warn** | S77-WIRE D1 | TODO |
| **Z.3** | Implement `single-raf` + `no-second-canvas` rules + tests; warn | S77-WIRE D2 | TODO |
| **Z.4** | Implement `no-runtime-package-import` + `no-legacy-src-import` rules + tests; warn | S77-WIRE D2 | TODO |
| **Z.5** | Author `apps/bench/scripts/list-gestures.mjs` + `check-gesture-coverage.mjs` | S77-WIRE D3 | TODO |
| **Z.6** | Scaffold `packages/release/` workspace; implement `pnpm ga-gate` orchestrator (calls §23.1–§23.9 + §23.13 in order); exit non-zero on any failure; **includes runtime smoke test (§26.10)** | S77-WIRE D3 | TODO |
| **Z.7** | Scaffold `packages/bench-visual-diff/` workspace; implement `capture` + `diff` subcommands (Playwright + pixelmatch); capture **pre-S72 baseline retroactively** from current `apps/editor/` build for the per-chunk visual-diff (Discipline Rule 7) | S77-WIRE D4 | TODO |
| **Z.8** | Wire all five lint rules into `pnpm lint` as **warn**; CI integration; per-folder warning counts emitted as JSON artefact | S77-WIRE D4 | TODO |
| **Z.9** | Author `scripts/wireup-baseline.sh` (emits `.local/state/replit/agent/wireup-floor.json`); add as a CI step; replaces hard-coded literals in `chunks/23/24/25` | S77-WIRE D5 | TODO |
| **Z.10** | Append §23.11.1 (rAF per-folder table) + §23.11.2 (canvas per-folder table) drilldowns to `chunks/23` (single doc-PR + bash drilldown function added to `wireup-baseline.sh`) | S77-WIRE D5 | TODO |
| **Z.11–Z.15** | Five workflow greens — one per currently-red workflow: `ifc-export-tier1`, `ifc-import-tier2`, `ifc-inspector-pset-editor`, `pryzm-vi-parity`, `rhino-import-3dm`. Either fix or quarantine with explicit `expected_failure: true` flag + linked tracking issue | S77-WIRE D6–D8 | TODO (note: the 5 reds are documented npx-cold-start false-positives per `03-CURRENT-STATE.md §10`; Z.11–Z.15 either resolves the cold-start flake or quarantines per workflow) |
| **Z.16** | Banner PR — prepend the `chunks/24 §24.5` + `chunks/25 §25.8` + `chunks/26 §26.6` "Additions since this chunk was sliced" banner to chunks 14, 15, 19 (per `chunks/26 §26.4` Option (b)) | S77-WIRE D6 | TODO |
| **Z.17** | Retire the re-slice script (`chunks/23 §23.12`); declare chunks 01–22 canonical; banner the monolith as DEPRECATED (per `chunks/26 §26.7` Option (b)) | S77-WIRE D8 | TODO |
| **Z.18** | Update `chunks/24 §24.4` — drop "default if no ADR" rows; replace with the as-ratified decision of ADR-041, ADR-042, ADR-043, ADR-044 (all four now on disk) | S77-WIRE D9 | TODO |
| **Z.19** | One-shot historical migration — rewrite the chunk 14–19 banner (from Z.16) to add a parenthetical `(=S<NN>-WIRE)` next to every bare `S73…S87` reference (per `chunks/26 §26.9`) | S77-WIRE D8 | TODO |
| **Z.20** | Status updates from on-disk reality (per `chunks/26 §26.11`): refresh chunks 24/25 ADR-041/042/043/044 rows; bump "44 ratified ADRs"; fix "36 → 35" `src/` top-dir count; bump "44/38/12" → "≥ 46/≥ 38/≥ 12" with `≥` semantics | S77-WIRE D9 | TODO |

### §2.1 — C exit gate (extended by Z.*)

Per `chunks/26 §26.6`, Phase D entry is gated on:

| Gate | Lands via | Sprint |
|---|---|---|
| C.exit.1 — verification harness (Z.1–Z.10) all green | Z.1–Z.10 | S77-WIRE D5 |
| C.exit.2 — five red workflows green or quarantined | Z.11–Z.15 | S77-WIRE D6–D8 |
| C.exit.3 — first floor file committed | Z.9 | S77-WIRE D5 |
| C.exit.4 — chunks 14–19 banner PR merged (per `chunks/26 §26.4` Option (b)) | Z.16 | S77-WIRE D6 |

Phase D opens only when all four are green.

### §2.2 — Wave-16 follow-on (sprint-ID lint)

Per `chunks/26 §26.9`, **`H.5.1`** (commit-msg hook + PR-title lint that bans bare `S73…S87` without a `-WIRE` / `-PG4` suffix) lands in the existing Phase H window (S85-WIRE) — not in Z.*. Z.19 above lands the historical doc-rewrite that makes the lint clean against existing commits/banners.

---

## §3 — Phase H per-package extraction ledger

Source: `chunks/27`. The Phase H audit (`reference/phases/audits/PHASE-H-PER-PACKAGE-COMPILE.md`) defines the **template** for per-package emit configuration. This section is the **running record** of which packages have actually been converted from `main: ./src/index.ts` (Path A `--import tsx` shim) to dual-exports against pre-built `./dist/index.js`.

### §3.1 — Cross-cutting decisions adopted (S72-WIRE)

These are the resolved questions from the Phase H audit. They are not negotiable per-package:

1. **Template mirrors `tsconfig.base.json`** — does not tighten strictness during extraction.
2. **`outDir` and `rootDir` are NOT in the template** — each extending package sets these locally (TypeScript path-options resolve relative to the file that defines them).
3. **Dev mode runs against `dist/`, not `src/`** — contributors run `pnpm -r build --watch` alongside `npm run dev`. Trade-off: small DX loss for matching prod semantics.
4. **`composite: true` is in the template, but each package may override to `false`** until its own deps are also composite.
5. **Test files are excluded from emit** (`**/__tests__/**`, `*.test.ts`, `*.spec.ts`, `*.bench.ts`). Tests stay on vitest's ESBuild path.
6. **Pre-existing latent type bugs surfaced during extraction are fixed in-place, not deferred.** Documented per-package below.

### §3.2 — H.1 — First leaves (no inter-package composite refs needed)

Goal: prove the template against one real package end-to-end.

| Package | Status | Commit | Notes |
|---|---|---|---|
| `@pryzm/file-format` | **DONE** (S72-WIRE) | (S72 turn) | Template exemplar (zero internal `@pryzm/*` runtime deps; heterogeneous test workflow stresses lib/types resolution; invoked from both Node + browser). 4 latent type bugs fixed in-place — see §3.2.1. |

#### §3.2.1 — `@pryzm/file-format` extraction details

**Files added/changed**:
- `packages/file-format/tsconfig.build.json` — extends template; `outDir: ./dist`, `rootDir: ./src`, `composite: false` (deferred until `@pryzm/persistence-client` also has a build config).
- `packages/file-format/package.json` — flipped `main` and `exports` from `./src/index.ts` to `./dist/index.js`; added `build`, `clean`, `typecheck` scripts.
- `packages/tsconfig.references.json` — added `{ "path": "file-format" }` as the first entry.
- `packages/tsconfig.build.template.json` — relaxed to mirror `tsconfig.base.json`.

**Pre-existing latent type bugs fixed during extraction** (4 reports — none caught by vitest because ESBuild skips strict checking):

1. `src/family-migrations/migrate-family.ts:51` — `tracer.startActiveSpan` callback inferred `ok: boolean` instead of the discriminated `ok: false as const`. Fixed by annotating callback return type as `MigrateFamilyResult`.
2. `src/family-migrations/ops/change-parameter-type.ts:84` — `valueConverter` typed wider than `defaultValue` schema accepts. Fixed by adding a `coerceDefaultValue()` helper that maps `boolean → 0|1`.
3. `src/family-pack.ts:216` — `view[i]` widened to `number | undefined` under `noUncheckedIndexedAccess`. Provably defined inside the `i < view.length` guard; non-null asserted with clarifying comment.
4. `src/family-unpack.ts:297` — same pattern as #3, same fix.

**Verification performed**:
- `npx tsc -p tsconfig.build.json` — emits `dist/` cleanly, zero errors.
- `npx vitest run` — 45 tests pass (6 files).
- `Start application` workflow restarts cleanly; Vite resolves `@pryzm/file-format` via the new `dist/index.js` exports field.
- `cd packages/family-instance && npx vitest run` — downstream consumer still works through new resolution path.

**Deferred to H.4** (when `@pryzm/persistence-client` is extracted):
- Flip `composite: false` → `composite: true` in `tsconfig.build.json`.
- Add `references: [{ "path": "../persistence-client" }]` block.

### §3.3 — H.2 — Mid-tier (browser-only, no server boot exposure)

| Package | Status | Notes |
|---|---|---|
| `@pryzm/family-loader` | TODO | Imports `@pryzm/file-format` (now compiled) + `@pryzm/persistence-client` (still src). |
| `@pryzm/family-instance` | TODO | Imports `@pryzm/file-format` + `three`. |
| `@pryzm/visibility` | TODO | Has its own vitest workflow (`pryzm-vi-parity`). |
| `@pryzm/bcf` | TODO | Has its own vitest workflow (`bcf-round-trip`). |
| `@pryzm/ifc-import` / `@pryzm/ifc-export` / `@pryzm/ifc-inspector` / `@pryzm/rhino-import` | TODO (4 plugins) | Each has its own vitest workflow. |

### §3.4 — H.3 — Stores layer

| Package | Status | Notes |
|---|---|---|
| `@pryzm/stores` | TODO | Pre-existing `SelectionStore` `override`-modifier warning (TS4114) needs `override` modifier as part of extraction. |

### §3.5 — H.4 — Server-facing roots

| Package | Status | Notes |
|---|---|---|
| `@pryzm/persistence-client` | TODO | Has its own vitest workflow (`pryzm-persistence`). Has multiple pre-existing strict-mode warnings: `MembersClient`, `ProjectListClient`, `TierStreamedLoader`, `IndexedDbBackend` lacks `IDBKeyRange` / `window` typings (needs DOM lib carry-through). When this lands, file-format's `composite` flag flips to `true` and a `references` block is added. |
| `@pryzm/runtime-core` | TODO | The runtime bus host — see also `chunks/28-commandManager-execute-migration.md`. |

### §3.6 — H.5 — Cross-references on

Once H.1–H.4 are done, every package can carry `composite: true` plus a real `references` block. At that point `tsc -b packages/tsconfig.references.json` becomes the canonical workspace build, and per-package `pnpm --filter ... build` falls back to a thin wrapper.

### §3.7 — Open follow-ups

- **Pre-build hook for `npm run dev`** — once more than ~3 packages run on dist, contributors will hit "module not found" if dist is stale. Add a `pnpm -r build` (or `--watch`) step to the dev workflow command. Defer until H.2 lands at least one package that `server.js` actually transitively imports.
- **CI gate** — extend the `validation` skill registrations so each per-package build runs in CI. Right now only the vitest workflows fire; the build step is invisible to PR checks.
- **`pnpm -r build --watch` ergonomics** — investigate `tsc -b --watch` against `tsconfig.references.json` once H.5 lands. Single watcher instead of N parallel.

---

## §4 — How this file is maintained

When a Z.* sub-phase lands, its PR updates the §2 row's Status to ✅ with the landing date and commit SHA.

When an H.* package extraction lands, its PR appends an §3.N.M sub-section under the appropriate H.N tier (§3.2/§3.3/etc.) with the same shape as §3.2.1 — files changed, latent bugs fixed, verification performed, deferrals named.

When a Tier-B+C sub-phase from §1 lands its deletion (Phase G), its row's Sprint column is replaced with a strikethrough and a "✅ landed (commit, date)" annotation; the GA-cut-blocker check arithmetic shifts by the file count of that directory.
