# @pryzm/procedural-textures

Parquet and tile **patterns generated in code**. Zero downloaded assets, zero
dependencies, no THREE, no DOM, no I/O. **Layer L0.**

## Why this exists

C100 §10.1 measures five finish families at literally **zero rows**, and `parquet` —
the founder's *"parket"* — is one of them. §10.2.a states the reason a row cannot fix
it: **one hex cannot be a herringbone floor**; pattern is *geometry at texture scale*
and needs a map. §10.7 **S28 (texture maps) is BLOCKED** on §10.6's unsolved asset
hosting: no bucket, no loader, no licence.

⭐ **A generated map is not blocked on any of that.** There is nothing to host.

## The one idea the package is built on

> A parquet or tile floor is **TWO separable things**: a **LAYOUT** — herringbone,
> chevron, basket weave, hexagon — which is exact, parametric, buildable geometry;
> and a **CHARACTER** — wood grain, stone veining, colour variation — which is
> stochastic and which photography does better than any shader.

`layouts/` owns the first. `shading/` owns the second. Keeping them apart is why
**herringbone laid in ceramic cost nothing** (`procedural:tile-metro-herringbone` is the
herringbone layout with the porcelain profile) and it is the seam a photographic
character map plugs into later without touching a layout file.

## Architecture: (a) CPU generation. Decided, not drifted into.

| option | verdict |
|---|---|
| **(a) CPU generation into a buffer** | ⭐ **CHOSEN.** Asset-free, backend-agnostic, deterministic, generated once and cached, zero per-frame cost. Honest weakness: **resolution is baked**, so a close-up can look soft. That is a texel budget, not an architecture — `resolution` is a knob. |
| (b) shader / material-node | ⛔ **Does not survive two backends.** The editor runs **both WebGL and WebGPU**; a node-material graph is not one object across both. And **P2** confines `import * as THREE` to `packages/renderer-three/`, so a GPU-side generator could not live at L0 at all. |
| (c) build-time generation | ⛔ **Hands the blocker straight back.** It re-introduces exactly the asset-hosting dependency (C100 §10.6) that doing this procedurally exists to avoid. |

## What it produces

A **full PBR set — albedo + normal + roughness** — never colour alone. A parquet with
a colour map and no normal map reads as printed vinyl, because what tells the eye
"laid floor" is the chamfer highlight at every board edge. And **grout is not a
detail**: a tile floor without grout lines is a coloured plane.

Every generator **declares the real-world size of the tile it produced**
(`realWorldSizeM`), because a map without a real-world scale is wallpaper — and a
wrongly-scaled parquet looks *worse* than a flat colour.

## Real-world millimetres, and the refusals that follow

Everything is parameterised in **millimetres of real product** — 70 × 350 herringbone
blocks, 189 mm boards, 600 × 600 porcelain, 200 mm hex, 3 mm grout — never in pixels
or UV fractions. That has consequences the generators enforce:

- **Herringbone REFUSES a non-integer length:width ratio.** Herringbone by L × W
  blocks closes only when `L/W` is a whole number — which is *why* blocks are sold at
  70×280, 70×350, 90×360. A generator that accepted 70×300 would emit a texture that
  tiles and a floor with a fault line.
- **Basket weave REFUSES a bundle that is not square** — the bundle side is derived.
- Every refusal **quotes both numbers**, so the reader knows which one they meant to change.

## How seamlessness is proven

`__tests__/seamless.test.ts` — three arms plus measured negative controls.

- **ARM A — the tiling is exact.** `overlapPx === 0` and rasterised coverage matches
  the *analytic* polygon area. Catches a wrong repeat unit (hexagon needs two rows;
  herringbone needs 2L × 2L, derived in `layouts/herringbone.ts`).
- **ARM B — the edge is not a special transition.** The weak arm, kept because it is
  what the eye sees. ⚠ A test in this file **measures ARM B failing to notice a
  genuinely broken texture** — it is recorded, not assumed away.
- **ARM C — the pattern is continuous, not merely equal, across the seam.** Crossing
  the wrap must never jump from the middle of one board to the middle of a *different*
  board; a piece change is legitimate only at a joint. **Zero breaks on all 24
  generators**; a 0.63 crop of the same texture scores 98.
- ⚠ **A fourth arm was written, measured to be VACUOUS, and deleted** — origin-shift
  equivariance passes for every layout because the rasteriser writes through a modulo.
  It is documented in the test file so nobody re-adds it as proof.

⛔ **No test here establishes that a floor LOOKS GOOD.** Run
`npx tsx packages/procedural-textures/scripts/emit-samples.ts <outDir>` and look.

## Determinism

⛔ `Math.random()` must not decide what a saved project looks like. All variation is
an **integer hash** of `(seed, pieceIndex, channel)` — stateless, order-independent,
engine-stable. A test **scans the source** and fails on `Math.random`, `Date.now`,
`performance.now` or `crypto.getRandomValues` anywhere in `src/`.

## Provenance

⛔ Nothing here is copied or derived from `pascalorg/editor`. Per
`docs/04-reference/PASCAL-FINISHES-RESEARCH.md` §0.2 its 288 texture files carry
**zero statements of origin**; we take the taxonomy, never the bytes, and never a
numeric value from its catalogue.
