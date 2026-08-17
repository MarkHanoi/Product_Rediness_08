/**
 * §L934-ONE-WALL-ONE-COLOUR — the ONE declared default colour of a wall body.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────
 * Zero imports, deliberately. The four consumers are `WallFragmentBuilder` (three
 * arms) and `LayeredWallOpeningBuilder`, and `WallFragmentBuilder` already imports
 * `LayeredWallOpeningBuilder` — so declaring the constant in either of them and
 * importing it from the other closes an import cycle. This repo has a scar for
 * exactly that (`§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD`: a circular barrel resolved
 * to `undefined` at module load and produced a white screen). A zero-dependency
 * leaf cannot participate in a cycle.
 *
 * ── WHAT IT FIXES ────────────────────────────────────────────────────────────
 * The value mirrors `WALL_SCHEMATIC_MATERIAL.color` (0xe8e8e8) — what
 * `createWallMaterial` gives a plain wall. Before L-934 the same number was
 * written out four times as four independent literals, and the two that mattered
 * DISAGREED:
 *
 *   instanced arm  (no join)  →  '#e8e8e8'   white
 *   layered arms   (joined)   →  '#d4c5b0'   beige
 *
 * `WallFragmentBuilder.isSimpleWall` selects between those arms on JOIN DATA, so a
 * wall changed colour when it touched a corner. That is the founder's L-934 report:
 * a full-height tan band with a crisp vertical edge beside an L-junction, on a wall
 * whose neighbours are white. The edge is crisp because it is the seam between two
 * walls that took different arms, not a shading artefact.
 *
 * §BEIGE-WALL-FIX (2026-06-08) had already ruled which colour is correct — "must
 * default to the SAME white as the standard mesh path" — and fixed the instanced
 * arm and `WallInstanceBridge` only. The layered arms kept the beige for fourteen
 * months. Naming the value once is what stops the fifth copy drifting.
 *
 * ⚠ NOT THE ONLY REMAINING COPY. The KERNEL/SDK wall path carries its own beige
 * default — `packages/geometry-kernel/src/producers/_internal/composeMaterialKey.ts`
 * (`DEFAULT_WALL_COLOR`) and `plugins/wall/src/committer/material-bridge.ts`
 * (`FALLBACK_COLOR`). They are NOT changed here: `apps/editor` renders through the
 * legacy `WallFragmentBuilder` path (which is the path the founder's screenshot came
 * from, and the path this constant serves), and moving the kernel default would
 * rewrite ~20 pinned parity snapshots (`tests/parity/wall/snapshots/*.snap.json`
 * carry `wall|_|_|#d4c5b0|wall`) for a path the defect was not reported on.
 * Recorded for the successor rather than silently half-migrated — which is the
 * exact mistake that produced L-934.
 */
export const WALL_DEFAULT_BODY_COLOUR = '#e8e8e8';
