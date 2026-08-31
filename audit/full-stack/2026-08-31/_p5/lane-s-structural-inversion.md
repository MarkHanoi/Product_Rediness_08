# LANE S — structural inversion (S1+S2) — verification evidence

Date: 2026-08-31 · tree at HEAD `79ca9756` + uncommitted fleet edits · NOT committed (per brief).
Plan authority: `_p5/annotations-inversion-scout.md` §3.2, §4, §5 (LANE S1/S2).

## State found / completed
The tree already carried the S1/S2 edits (staged `git mv` renames + repoints — a prior lane pass).
This session VERIFIED every edit against the scout plan, fixed ONE gap, and ran the full proof set.

- S1 moves: `plugins/structural/src/SteelProfileLibrary.ts` → `packages/geometry-kernel/src/structural/SteelProfileLibrary.ts`
  (git mv, ZERO content change, zero imports); `plugins/structural/src/ISectionGenerator.ts` →
  `packages/geometry-column/src/ISectionGenerator.ts` (only its `./SteelProfileLibrary` import
  repointed to `@pryzm/geometry-kernel`). Barrels export both (kernel `index.ts:240-246`,
  column `index.ts:26-34`). plugin-sdk re-exports both blocks (`index.ts` ~:375 kernel,
  ~:451-466 column). Plugin barrel = pure specifier swap to `@pryzm/plugin-sdk`; symbol list identical.
- S2 repoints, all 6 files verified: BeamFragmentBuilder (kernel + geometry-column `createBeamLOD`),
  ColumnFragmentBuilder / ColumnTool (kernel + RELATIVE `./ISectionGenerator`),
  ColumnPlanSymbolBuilder, ColumnValidator, input-host BeamTool (kernel).
- Gap fixed THIS session: `packages/geometry-column/package.json` + `@pryzm/renderer-three` —
  the moved generator is THREE-bearing and 3 pre-existing files already imported renderer-three
  with no manifest entry (the L-809 pnpm-partial-linking shape); my lane added a 4th importer, so
  the manifest now states the dep.

## Proofs (all foreground, this session)
- Root tsc: `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit -p tsconfig.json` → **RC=0** (direct capture).
- Kernel purity: `grep -rn "from 'three'|from \"three\"|require('three')|@pryzm/renderer-three|import \* as THREE" packages/geometry-kernel/src` → **0 hits**; moved library itself has **0 import statements**.
- Upward imports: `grep -rn plugin-structural packages/` (ts/tsx/json, minus node_modules/tsbuildinfo) → **0 hits** — all 9 scouted statements gone.
- Falsification controls (greps proven non-blind): purity grep vs `geometry-column/src` → **4 hits**; plugin-structural grep vs `apps/` → **9 hits** (legit L7 consumers via the shimmed barrel).
- Layer gate `check-layer-boundaries.ts` → **RC=0 direct**, `violations 48/102, unclassified 13/13, sdk-bypass 156/182` (48 = the scout §6 predicted end-state; both arms strictly down, nothing raised).
- Suites: `@pryzm/geometry-column` **5/5**, `@pryzm/geometry-beam` **33/33**, `@pryzm/plugin-structural` **16/16** — runtime resolution of the new edges proven, not just types.

## Orchestrator obligations
- **pnpm-lock sync REQUIRED** for dependency edits in: geometry-beam (+geometry-column, +geometry-kernel, −plugin-structural), geometry-column (−plugin-structural, +renderer-three), input-host (+geometry-kernel, −plugin-structural; −plugin-annotations is LANE D's edit in the same file), plugin-sdk (+geometry-column).
- Post-landing: ratchet the layer-gate baseline 102 → measured (shrink-only direction; NOT done by this lane).
- Sibling lanes were editing the shared tree live during verification (gate read 56→48 between runs); re-run the gate at commit time.
