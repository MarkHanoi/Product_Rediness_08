# House dimensional defect inventory (2026-06-20)

A quantitative, **exact-metric** sweep of `generateHouseLayout` over the realistic plate range
(70–320 m², 434 plates, the founder's 2-bed/1-bath/open-plan brief, 2 storeys). Metrics use the
**existing** pure validators only — `validateAreaMax` (G-1) for over-grow and the door-graph
permeability for seals — so this is observation, **no engine change**. Reproduce by re-running the
sweep harness pattern from `houseCentralStairSealed.test.ts` (the temp sweep was not committed).

## Headline: only **6 % of generated houses are dimensionally clean**

| metric | plates | % | by room type (worst observed m²) |
|---|---|---|---|
| **clean** (no seal, no over-grow) | 28 / 434 | **6 %** | — |
| **area over-grow** (G-1) | 402 / 434 | **93 %** | corridor 340 (21.6), hall 281 (32.7), bathroom 129 (32.0), bedroom 73 (52.9), utility 43 (13.8), dining 6 (34.3), study 5 (23.4) |
| **sealed room** (no door) | 39 / 434 | **9 %** | storage 32, bathroom 5, bedroom 4, utility 1 |

(over-grow and seal sets overlap; "clean" = neither.)

## The dominant defect is AREA OVER-GROW, not seals

The seal defect (the founder's hall report, already tracked in
`HOUSE-CIRCULATION-SEALED-ROOMS-2026-06-20.md`) affects 9 % of plates. The **over-grow** affects
**93 %** — it is the primary reason generated houses read as "blobby / not professional". The
plate-fill (`§FEASIBILITY` / residual-fill) dumps excess floor area into rooms whose programmatic
ceiling is small, producing architecturally absurd results:

- a **corridor at 21.6 m²** (G-1 ceiling 8 m² — above that it is, by definition, a different room).
- a **hall at 32.7 m²** (ceiling 10).
- a **bathroom at 32.0 m²** (ceiling 15) — this is the same over-grow that *levers the seals*:
  a ballooned wet room displaces neighbours into stair-locked pockets (see the seal doc).
- a **bedroom at 52.9 m²** (ceiling 25 / master 35).

The over-grow is the **upstream root** that both (a) makes the layout look unprofessional and
(b) aggravates the seal defect. Fixing the area distribution would address far more than the seals.

## It is strongly size-correlated — large plates are NEVER clean

| plate band | clean / total |
|---|---|
| 70–110 m² | 22 / 66 (**33 %**) |
| 110–170 m² | 6 / 180 (**3 %**) |
| 170–230 m² | 0 / 120 (**0 %**) |
| 230–320 m² | 0 / 68 (**0 %**) |

Small plates are over-constrained but proportionate; **every** plate ≥ 170 m² over-grows at least
one room. This is the signature of a fill pass that distributes residual area **without honouring
per-room G-1 maxima** — the room caps exist as a validator (`validators/dimensional/areaMax.ts`)
but are not consulted by the subdivision/fill that produces the geometry.

## Recommended priority (for when browser verification is available)

1. **Cap residual-fill at per-room G-1 maxima** (corridor 8, hall 10, bathroom 15, bedroom 25…),
   redistributing the surplus to habitable rooms with headroom (living 60, kitchen 40, dining 30)
   or leaving genuinely-unprogrammed area as a courtyard/second room. This is the **single
   highest-leverage** change — it targets 93 % of plates AND removes the seal lever.
   ⚠ This is the area-allocation subsystem (the documented "area-cap regression" class) — it MUST
   run the full `house*.test.ts` suite green + be browser-verified before deploy.
2. The seal post-selection rescue (already documented) becomes a smaller residual once (1) lands.

## Tracked tests
- `houseCentralStairSealed.test.ts` → `§HOUSE-AREA-OVERGROW` (skip) pins the bathroom 16.9 > 15
  case via `validateAreaMax`. A future fix flips it (and the seal cases) to `it()`.
