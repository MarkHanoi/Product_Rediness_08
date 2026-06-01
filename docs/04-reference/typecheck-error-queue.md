# Pre-existing TypeScript Error Queue

> **Status**: Backlog / tracking snapshot. **Created**: 2026-05-24.
> **Why this exists**: the architect asked to "queue all the pre-existing errors you
> are finding" while working through the daily-use fixes. These are **pre-existing**
> type errors surfaced by the per-package `typecheck` scripts — none were introduced
> by the 2026-05-24 session (every edit this session was verified clean in its own
> region; see `DAILY-USE-FIX-LOG-2026-05-20.md`).
> **Full deduped list**: `typecheck-errors-2026-05-24.txt` (5,676 lines, one per error).

## How this was generated

```bash
pnpm -r --no-bail run typecheck      # 123 packages with a typecheck script
```

Raw output is ~91,905 error lines, but each error repeats ~10× because TypeScript
project references re-compile a package's dependencies for every dependent. After
merging cross-reference duplicates (keying on the path from the last `src/` + line +
col + code) there are **5,676 unique errors**.

## Important: these do NOT block builds today

- The **dev server** uses Vite/esbuild, which transpiles without type-checking — so
  these never stop `npm run dev`.
- The **production build** (`npm run build`) runs `tsc --skipLibCheck` and the GA-gate;
  this backlog is type *hygiene*, not a release blocker. It is worth burning down because
  it hides real type regressions (a new genuine error is lost in the noise).

## Breakdown by error code (unique, merged)

| Count | Code | Meaning | Fix pattern | Effort |
|------:|------|---------|-------------|--------|
| 2036 | **TS1484** | Type-only symbol imported without `import type` (`verbatimModuleSyntax`) | Change `import { Foo }` → `import type { Foo }` | Mechanical / autofixable |
| 984 | **TS2835** | Relative import missing explicit `.js` extension (NodeNext) | Append `.js` to the relative specifier | Mechanical / autofixable |
| 645 | **TS18048** | "X is possibly undefined" (array/Map index under `noUncheckedIndexedAccess`) | Guard, `?.`, non-null `!`, or destructure-with-default | Per-site review |
| 517 | **TS2532** | "Object is possibly undefined" (same strict-index family) | Same as TS18048 | Per-site review |
| 428 | **TS2339** | Property does not exist on `Window` (legacy `window.*` globals) | Add the field to the `Window` augmentation `.d.ts` | Mostly mechanical (one d.ts) |
| 198 | **TS2345** | Argument type not assignable | Case-by-case (often a real bug or a too-loose tuple) | Real review |
| 140 | **TS7006** | Parameter implicitly `any` | Add a param type / typed handler signature | Mechanical |
| 131 | **TS2305** | Module has no exported member (stale barrel export) | Fix the import or re-export | Real review |
| 122 | **TS2379** / 121 **TS2375** | `exactOptionalPropertyTypes` optional-vs-undefined mismatch | `?: T \| undefined` or omit the key | Per-site |
| 110 | **TS2322** | Type not assignable (assignment) | Case-by-case | Real review |
| 65 | TS2412 · 59 TS7018 · 29 TS5097 · … | long tail | mixed | mixed |

**The big lever:** `TS1484` + `TS2835` = **3,020 of 5,676 (53%)** are *mechanical,
near-autofixable* import-hygiene errors (type-only imports + `.js` extensions). A
codemod / `eslint --fix` pass with the right rules (`@typescript-eslint/consistent-type-imports`,
`import/extensions`) clears half the backlog with low risk. The strict-null family
(`TS18048`+`TS2532` = 1,162) and the `window.*` globals (`TS2339` = 428) are the next
two workstreams.

## Breakdown by package (top offenders, cross-ref form)

| Count | Package |
|------:|---------|
| 1944 | `command-registry` |
| 902 | `core-app-model` |
| 359 | `file-format` |
| 344 | `geometry-wall` |
| 245 | `plugin-annotations` |
| 226 | `input-host` |
| 219 | `geometry-slab` |
| 212 | `geometry-furniture` |
| 207 | `room-topology` |
| 166 | `geometry-stair` |
| 159 | `ai-host` |
| 146 | `geometry-curtain-wall` |
| 125 | `geometry-roof` |

(Full per-file/per-line detail in `typecheck-errors-2026-05-24.txt`.)

## Suggested workstreams (in priority order)

1. **WS1 — Import hygiene (TS1484 + TS2835, ~3,020).** One automated pass:
   enable + autofix `@typescript-eslint/consistent-type-imports` and the explicit-extension
   rule. Verify the dev build still boots. ~53% of the backlog, lowest risk.
2. **WS2 — `Window` globals (TS2339, ~428).** Most are `window.<store>` / `window.__flag`
   legacy globals. Extend the single `Window` augmentation `.d.ts` with the real
   (already-existing) members. Largely one file; unblocks `input-host`, `ai-host`,
   `spatial-index` selection/room code.
3. **WS3 — Strict-null guards (TS18048 + TS2532, ~1,162).** Per-site; concentrate on
   `command-registry` + `core-app-model` first (they dominate and are depended on widely).
   These occasionally hide real "can be undefined" bugs.
4. **WS4 — The real-type tail (TS2345/TS2322/TS2305/TS2375/TS2379, ~1,000).** Review
   individually; some are genuine bugs (stale exports, wrong tuples).

## Representative examples (one per top code)

```
[TS1484]  src/AIApprovalRecord.ts(2,10): 'SerializedCommand' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.
[TS2835]  src/index.ts(136,15): Relative import paths need explicit file extensions … Did you mean './foo.js'?
[TS18048] src/curtainwall/CreateCurtainWallsFromSlabCommand.ts(126,27): 'next' is possibly 'undefined'.
[TS2532]  src/apiFetch.ts(43,19): Object is possibly 'undefined'.
[TS2339]  src/AIElementFactory.ts(255,39): Property 'commandContext' does not exist on type 'Window & typeof globalThis'.
[TS2345]  src/producers/lighting.ts(60,26): Argument of type '[number?, number?, number?, …]' is not assignable to '[number, number, number]'.
[TS7006]  src/handlers/index.ts(47,55): Parameter 'cmd' implicitly has an 'any' type.
[TS2305]  src/PlanViewCanvasHost.ts(53,15): Module '"@pryzm/plugin-sdk"' has no exported member 'Disposer'.
```

## Refresh

Re-run the generator to update counts as the backlog burns down:

```bash
pnpm -r --no-bail run typecheck > /tmp/tc.txt 2>&1
# then re-aggregate (see "How this was generated")
```
