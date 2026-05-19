# Phase H — Per-Package Extraction Ledger

**Companion to**: `docs/03_PRYZM3/03_PRYZM3/reference/phases/audits/PHASE-H-PER-PACKAGE-COMPILE.md`
**Started**: 2026-04-29 (S72)
**Owner**: PRYZM 3 Architecture
**Scope**: Track every workspace package as it converts from `main: ./src/index.ts` (Path A `--import tsx` shim) to dual-exports against pre-built `./dist/index.js`.

---

## Why this ledger exists

The Phase H audit (`PHASE-H-PER-PACKAGE-COMPILE.md`) defines the *template* for per-package emit configuration.  This ledger is the *running record* of which packages have actually been converted, what each one cost in code changes, and which dependents were affected.

Each row shows:
- the package being converted,
- which sub-phase it belongs to (H.1 leaves → H.2 mid-tier → H.3 stores → H.4 server-facing roots → H.5 cross-references),
- the PR / commit that landed the conversion,
- any pre-existing latent type bugs that fell out (very common — `tsc --noEmit` was almost never run on individual packages because vitest uses ESBuild, which doesn't enforce strict mode at all).

---

## Cross-cutting decisions adopted (S72)

These are the resolved questions from the audit, restated here for quick reference.

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Template mirrors `tsconfig.base.json`** (does *not* tighten strictness during extraction). | Adding emit must not also impose `exactOptionalPropertyTypes:true` / `verbatimModuleSyntax:true` — those are separate opt-in passes. Otherwise no package would extract without a code rewrite first. |
| 2 | **`outDir` and `rootDir` are NOT in the template.** | TypeScript resolves path-options relative to the file that *defines* them. Putting `rootDir: ./src` in the template resolves to `packages/src` (wrong). Each extending package sets these locally. |
| 3 | **Dev mode runs against `dist/`, not `src/`.** | Audit §4.3. Contributors run `pnpm -r build --watch` alongside `npm run dev`. Trade-off: small DX loss (one extra terminal) for a much simpler resolution model and matching prod semantics. |
| 4 | **`composite:true` is on in the template, but each package may override to `false` until its own deps are also composite.** | `tsc -b` requires every node in the graph to be composite. Forcing composite immediately would force a big-bang extraction. The template default makes composite the *target* state. |
| 5 | **Test files are excluded from emit (`**/__tests__/**`, `*.test.ts`, `*.spec.ts`, `*.bench.ts`).** | Tests stay driven by vitest's ESBuild path; their type-check still runs via the package's `tsconfig.json --noEmit`. |
| 6 | **Pre-existing latent type bugs surfaced during extraction are fixed in-place, not deferred.** | These are real bugs hidden by ESBuild. Documented per-package in the ledger below. |

---

## Sub-phase ledger

### H.1 — First leaves (no inter-package composite refs needed)

Goal: prove the template against one real package end-to-end.

| Package | Status | Sub-phase | Commit | Notes |
|---------|--------|-----------|--------|-------|
| `@pryzm/file-format` | **DONE** | H.1 | (S72 — this turn) | First per-package extraction. See §H.1.1 below. |

#### H.1.1 — `@pryzm/file-format`

**Tier classification (re-evaluated 2026-04-29)**: file-format is *not* directly imported by `server.js` or `apps/headless/src` — only by Vite-bundled browser code (`packages/family-loader`, `packages/family-instance`, `apps/component-editor`, `apps/marketplace-web`, `apps/cli`, `apps/bench`) and tests. Treat it as a low-risk **Tier-2 leaf** for purposes of *risk*, but it stays in the H.1 batch as the **template exemplar** because:

- it has zero internal `@pryzm/*` runtime deps (only `@pryzm/persistence-client` *types*);
- it has the most heterogeneous test workflow (msgpack + zod + jszip + WebCrypto), so it stresses the lib/types resolution;
- it is invoked from both Node (tests, headless adapter) and browser (Vite bundle) — verifies the dual-exports flag works on both sides.

**Files added / changed**:
- `packages/file-format/tsconfig.build.json` — extends template; sets `outDir: ./dist`, `rootDir: ./src`, `composite: false` (deferred until persistence-client also has a build config), `tsBuildInfoFile: ./dist/.tsbuildinfo`.
- `packages/file-format/package.json` — flipped `main` and `exports` from `./src/index.ts` to `./dist/index.js` (with `types: ./dist/index.d.ts`); added `build`, `clean`, `typecheck` scripts; kept `test` pointing at vitest.
- `packages/tsconfig.references.json` — added `{ "path": "file-format" }` as the first entry.
- `packages/tsconfig.build.template.json` — relaxed to mirror `tsconfig.base.json` (strictness opt-ins removed); `outDir`/`rootDir` deliberately omitted; `composite: true` retained as the eventual target.

**Pre-existing latent type bugs fixed during extraction** (4 reports — none caught by `vitest` because ESBuild skips strict checking):
1. `src/family-migrations/migrate-family.ts:51` — `tracer.startActiveSpan` callback inferred `ok: boolean` instead of the discriminated `ok: false as const`. Fixed by annotating the callback return type as `MigrateFamilyResult`.
2. `src/family-migrations/ops/change-parameter-type.ts:84` — `valueConverter` is typed wider (`number | string | boolean | null`) than the `defaultValue` schema accepts (`number | string | null`). Fixed by adding a `coerceDefaultValue()` helper that maps `boolean → 0|1` so the migration output stays schema-conformant.
3. `src/family-pack.ts:216` — `view[i]` widened to `number | undefined` under `noUncheckedIndexedAccess`. Provably defined inside the `i < view.length` guard; non-null asserted with a clarifying comment.
4. `src/family-unpack.ts:297` — same pattern as #3, same fix.

**Verification performed**:
- `npx tsc -p tsconfig.build.json` emits `dist/` cleanly (no errors).
- `npx vitest run` — all 45 tests pass (6 files: roundtrip, family-round-trip, family-signature, migrations, signature, family-migrations).
- `Start application` workflow restarts cleanly; Vite resolves `@pryzm/file-format` via the new `dist/index.js` exports field.
- `cd packages/family-instance && npx vitest run` — all 5 tests pass (verifies a downstream consumer still works through the new resolution path).
- Browser preview renders at 61fps (would 500 immediately if the import resolution had broken).

**Deferred to H.4 (or whenever persistence-client is extracted)**:
- Flip `composite: false` → `composite: true` in `tsconfig.build.json`.
- Add a `references: [{ "path": "../persistence-client" }]` block.
- This unblocks `tsc -b packages/tsconfig.references.json` for the file-format → persistence-client edge.

---

### H.2 — Mid-tier (browser-only, no server boot exposure)

| Package | Status | Notes |
|---------|--------|-------|
| `@pryzm/family-loader` | TODO | Imports `@pryzm/file-format` (now compiled) + `@pryzm/persistence-client` (still src). |
| `@pryzm/family-instance` | TODO | Imports `@pryzm/file-format` + `three`. |
| `@pryzm/visibility` | TODO | Has its own vitest workflow (`pryzm-vi-parity`). |
| `@pryzm/bcf` | TODO | Has its own vitest workflow (`bcf-round-trip`). |
| `@pryzm/ifc-*` (4 plugins) | TODO | Each has its own vitest workflow. |

### H.3 — Stores layer

| Package | Status | Notes |
|---------|--------|-------|
| `@pryzm/stores` | TODO | Has the `SelectionStore` pre-existing override warning (TS4114) — needs an `override` modifier as part of extraction. |

### H.4 — Server-facing roots

| Package | Status | Notes |
|---------|--------|-------|
| `@pryzm/persistence-client` | TODO | Has its own vitest workflow (`pryzm-persistence`). Has multiple pre-existing strict-mode warnings (`exactOptionalPropertyTypes` errors in `MembersClient`, `ProjectListClient`, `TierStreamedLoader`, `IndexedDbBackend` lacks `IDBKeyRange` / `window` typings — needs DOM lib carry-through). When this lands, file-format's `composite` flag flips to `true` and a `references` block is added (see H.1.1 deferred). |
| `@pryzm/runtime-core` | TODO | The runtime bus host — see also `28-commandManager-execute-migration.md`. |

### H.5 — Cross-references on

Once H.1–H.4 are done, every package can carry `composite: true` plus a real `references` block. At that point `tsc -b packages/tsconfig.references.json` becomes the canonical workspace build, and per-package `pnpm --filter ... build` falls back to a thin wrapper.

---

## Open follow-ups

- **Pre-build hook for `npm run dev`** — once more than ~3 packages run on dist, contributors will hit "module not found" if dist is stale. Add a `pnpm -r build` (or `--watch`) step to the dev workflow command. Defer until H.2 lands at least one package that *server.js* actually transitively imports.
- **CI gate** — extend `validation` skill registrations so each per-package build runs in CI. Right now only the vitest workflows fire; the build step is invisible to PR checks.
- **`pnpm -r build --watch` ergonomics** — investigate `tsc -b --watch` against `tsconfig.references.json` once H.5 lands. Single watcher instead of N parallel.
