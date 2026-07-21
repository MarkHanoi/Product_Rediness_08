# Next-session prompt — Barcelona production hardening (hand-off 2026-07-21)

Paste this to start the next session.

---

You are continuing PRYZM's Barcelona real end-to-end. **Read first:** `docs/04-reference/V1-LAUNCH-READINESS-AUDIT.md`
(rows **L-508b → L-525**), `docs/04-reference/V1-LAUNCH-IMPLEMENTATION-PLAN.md` (the "Session 2026-07-21"
section), `docs/04-reference/spain/barcelona-catalonia/{RISK-REGISTER.md, L-525-ENVELOPE-ACCURACY-INVESTIGATION.md}`,
`docs/04-reference/CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md` (§8–§9), and memories
`barcelona-end-to-end-production-state`, `context-3d-tiles-not-live-overpass`, `barcelona-edificabilitat-is-a-construction`.

## Where it stands (founder-CONFIRMED "sound/perfect")
Barcelona real end-to-end works on **draw + select**: green **"Real · constructed"** badge, cited
profunditat edificable (PGM Art. 242.2), depth/alignment summary, context renders. Shipped v247–v253:
L-515 (street-frontage depth), L-516/516b (envelope latency), L-518/518c (real badge + summary),
L-520 (3D-Site paints on startup), L-521/521b (draw-flow real data + area centroid), L-524a (context
prefetch at the parcel). L-489 persistence captures site. All root-tsc-clean.

## Conventions (non-negotiable)
Root `npx tsc --skipLibCheck --noEmit` MUST be clean before any commit (Fly build is strict). Shared
checkout — commit with explicit pathspecs, never `git stash`/`reset --hard`. Deploy = push to main +
a `# deploy-marker: vNNN — …` line in `.github/workflows/deploy-fly.yml` (last was **v253**; rapid
pushes cancel in-flight deploys). Trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
**Ship the probe before the fix; never blind-fix geometry/render** (the L-508 lesson). Log every item
per the template into audit + impl-plan (+ MISSING-CONTRACTS if a contract gap).

## Priority queue (highest first)

**1. L-525 — envelope accuracy (P1, the founder's flagged "mistake"). Deep, probe-first.**
Full analysis: `L-525-ENVELOPE-ACCURACY-INVESTIGATION.md`. Do in this order:
- **L-525b FIRST (cheapest, highest-impact):** verify the block dissolve. Block 02309 came out
  ~6,686 m² ≈ HALF a Cerdà manzana → the all-perimeter inset floored the depth to 11 m (`min-floor`).
  Probe: in `applyBcnZoningThenFallback` (`apps/editor/src/ui/site/siteDispatch.ts`) log the dissolved
  `blockRing` bbox/area/bearings; overlay on satellite for a KNOWN parcel — is it the whole block? If
  partial, fix `fetchBlockForParcel`/`dissolveParcelsToBlockRing` (a silent shrink on every affected
  envelope).
- **L-525a — the HEIGHT (fabricated 9 m).** A 13a alignment zone has null max-height, so the massing
  invents ~9 m; real alçada reguladora ≈ 20.75 m (street-width→PGM table). No direct alçada layer
  (probe inconclusive) → CONSTRUCT it: encode the PGM height table in `esBarcelonaEnsanche.ts` +
  compute amplada de vial (start with the measured frontage-to-frontage gap — reuses block geometry);
  drive the massing height; badge as constructed (RISK-REGISTER R1).
- **L-525c** — only if the block is whole: evolve `blockDerivedDepth.ts` from all-perimeter inset to a
  street-frontage BAND (courtyard interior) for small/irregular blocks.

**2. L-513a/b — context latency (the last "feels-production" gap). Needs a Docker machine.**
Bake tool BUILT (`tools/context-bake/`). Run: `docker build -t pryzm-context-bake tools/context-bake`
then `node tools/context-bake/bake.mjs` → upload `out/*.pmtiles` to object storage. Then wire the
client reader per `CONTEXT-3D-PERFORMANCE-ARCHITECTURE.md §9` (**L-513b**: add `pmtiles` +
`@mapbox/vector-tile` + `pbf` and COMMIT the lockfile in the same commit — else the Fly build breaks).

**3. Cesium visuals — need a LIVE browser (iterate-and-look, not blind).**
- **L-510** white party-wall caps on the parcel void (founder-requested ×4; void reads black).
- **L-517** clip facade-sliver (under-sized vs offset — tune the outward buffer).
- **L-520 confirm** the ResizeObserver fixed blank-on-startup.

**4. Lower priority:** L-519 (interactive envelope↔data linking — foundation is a C58
`constraint→geometry` map), L-524 Part B (context-ready loading gate), the country study
(L-511/512/514/522 — docs done, adapters unbuilt; ⚠ FABDEM non-commercial + Lisbon CML licences).

## Also open (not Barcelona-blocking)
L-489 Gate-2 (persistence looks fixed — confirm on a save-with-walls), the WebGPU device-loss on
backend toggle, furniture-GLB 404 (object-storage).
