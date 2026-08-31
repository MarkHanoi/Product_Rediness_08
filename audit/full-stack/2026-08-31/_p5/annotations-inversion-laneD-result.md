# LANE D RESULT — input-host ToolManager inversion (F-P5-04, scout §3.1d / §5 LANE D)

**Date**: 2026-08-31 · **HEAD**: `79ca9756` (uncommitted shared tree; sibling lanes' edits present).
**Files**: `packages/input-host/src/ToolManager.ts`, `packages/input-host/src/types.ts`,
plus one manifest edit: `packages/input-host/package.json` (see "Manifest" below).

## 1. The scout's ".activate() only" claim was TOO NARROW — verified and corrected

The plan (§3.1d) claimed the ONLY member ever called on the 14 injected annotation tools is
`.activate()`. Measured in this tree (all 42 accesses inside the 14 `set*Tool` registration
closures + the 14 direct field call sites):

- `tool.isActive` — property READ, 14 sites (the `isActive: () => tool.isActive` closure per setter)
- `tool.activate()` — zero-arg call, 14 closure sites + 14 direct field sites
- `tool.deactivate()` — call, 14 sites (the `deactivate: () => tool.deactivate()` closure per setter)

Nothing else. The scout counted only the direct field call sites and missed the registration
closures. Per the lane contingency ("if more members are called, widen the interface to exactly
the measured set"), the interface is the measured 3-member set:

```ts
export interface InjectedAnnotationTool {
    readonly isActive: boolean;
    activate(options?: Record<string, unknown>): void | Promise<void>;
    deactivate(): void;
}
```

`isActive` is a boolean PROPERTY on the concrete classes (verified e.g.
`plugins/annotations/src/tools/TextNoteTool.ts:23 public isActive = false`) — it had to be, or the
pre-existing `isActive: () => tool.isActive` closure (typed `() => boolean` by `ToolRegistration`)
would never have compiled against the concrete types.

## 2. What changed

- `types.ts`: `InjectedAnnotationTool` added (+19 lines, doc comment records the measured set).
- `ToolManager.ts`: the 16-line `import { …14 classes… } from '@pryzm/plugin-annotations'`
  DELETED; 14 nullable fields + 14 `set*Tool` parameters retyped to `InjectedAnnotationTool`.
  Zero runtime change — instances are still constructed at L7
  (`apps/editor/src/engine/initTools.ts:3778–3796`) and injected through the EXISTING `set*Tool`
  seam; no new bridge. The 14 tool classes did NOT move.
- NOTE: the two src-file edits were already present in the shared tree when this lane ran
  (prior partial run). This lane re-measured every claim line-by-line rather than re-authoring,
  then completed the manifest drop and ALL verification below in foreground.

## 3. Manifest (orchestrator: pnpm-lock sync REQUIRED)

`packages/input-host/package.json`: **REMOVED `@pryzm/plugin-annotations`** (this lane — the
"DROP post-verify" §4 names; verified zero remaining references in the whole package first).
The same file already carried lane S2's edits in-tree: +`@pryzm/geometry-kernel`,
−`@pryzm/plugin-structural`. Whoever commits must sync `pnpm-lock.yaml` in the same commit
(frozen-lockfile hard-fails Fly otherwise).

## 4. Proof (all foreground, RC captured directly, never through a pipe)

- **Root tsc**: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json`
  → **RC=0** (output file: only the npm `package-manager-strict` warning).
- **Layer gate**: `npx tsx tools/ga-gate/check-layer-boundaries.ts` → **RC=0**,
  `✓ within baselines (violations 54/102, unclassified 13/13, sdk-bypass 164/182)`; the gate's
  violation output contains **ZERO `input-host` rows** (`grep -in input-host` on the captured
  output → RC=1). 54 is the shared tree's aggregate across all lanes, not this lane's alone.
- **Input-host suite**: `npx vitest run` in `packages/input-host` → **14 collectible test files
  passed, 87/87 tests green**. The 2 uncollectible suites (`bootstrap.test.ts`,
  `InputHost.test.ts`) die at COLLECTION on `DOMMatrix is not defined` from `pdfjs-dist` via
  `packages/file-format/src/import/PDFToImageConverter.ts:17` — pre-existing environment gap,
  no relation to this lane (the brief itself scoped proof to "the 14 collectible files").
- **Grep proof**: `grep -rn "plugin-annotations\|plugin-structural" packages/input-host
  --include=*.ts --include=*.tsx --include=*.js --include=*.json` → **0 hits (RC=1)**.
- **Falsification control** (the green is not vacuous): temporarily commented
  `deactivate(): void;` out of the interface → package-scoped
  `npx tsc -p packages/input-host/tsconfig.json --noEmit` → **RC=2 with EXACTLY 14 new TS2551
  errors, all at the 14 `() => tool.deactivate()` closure lines** in ToolManager.ts
  (177 vs 163 in-package error lines; the non-package error sets of control vs restored runs are
  byte-identical per `diff`). Restored; zero residue (`git diff --stat` back to +19 on types.ts).
  The 163 pre-existing package-scoped errors are all `window.*` augmentation gaps
  (TS2339 on `Window & typeof globalThis`) at lines this lane never touched — the package-local
  tsconfig lacks the root config's global augmentations; root tsc is the authoritative gate and
  is RC=0.

## 5. Hard rules

No ceiling raised · no gate disabled · no gate-debt entry · no rival mechanism · nothing
committed · all greps <5s · all verification foreground.
