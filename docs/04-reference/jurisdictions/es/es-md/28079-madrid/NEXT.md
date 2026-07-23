# NEXT — Madrid (28079, es-md, Spain)

> Where we stopped and how to resume. Convention: README = what is true now; this = where we
> stopped. Last updated 2026-07-23 · Maintainer: research agent (L-608) · Status: **SPEC, no pack shipped.**

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Madrid was converted from assessment to a **buildable pack SPEC**, and NZ 1 is now **provider-ready**.
The four target Normas Zonales (3/4/1/8 ≈ 96 % of directly-governed residential land) each have a
**decided, justified geometricRule kind** (NZ 1 `explicit-area`, NZ 4 `alignment`, NZ 8/5/7
`setback`, NZ 3 refusal). **NZ 1 is fully engineered**: live ArcGIS data (`COEF_Z` + layer-6
footprint), the merged `explicit-area` solver, AND — this pass — the Madrid adapter that feeds it
(`esMadridNZ1Provider.ts`, fixture-tested). What remains for NZ 1 is **wiring + sign-off, no research**
(a server proxy, the `explicitAreaFootprint` interface-field fix, the NZ-code re-verify, L-449).
**NZ 4/8/5/7 stay document-gated**: grado-structured numbers in the Compendio 2023 NNUU, not sourced
citeably (the Zod schema forbids a placeholder pack). Net: **NZ 1 provider-ready, zero shippable
envelopes TODAY (wiring-gated), NZ 4/8/5/7 human-read-gated.**

## 2 — THE NUMBER

Denominator: **Madrid residential parcel clicks.** Shippable envelope resolution **today ≈ 0 %**.
Ceiling for the four NZs once sourced + NZ 1 solver ships **≈ 60–62 %** (0.65 directly-governed ×
0.96 in NZ 3/4/1/8). Per-NZ split within the 96 % is **UNSOURCED** and not asserted.

## 3 — BLOCKERS (each: what · why · unblock · EXACT resume step)

1. **NZ 4/8/5/7 rule values are document-gated.** *Why it blocks:* `AlignmentRuleSchema` requires a
   `.positive()` `buildableDepth_m`; `SetbackRuleSchema` requires the front/side/rear triple — no
   pack parses without them. *Unblock:* a human reads the primary NNUU. *Resume step:* open
   `madrid.es/.../CompendioNNUU/Compendio 2023/1 Compendio 2023.pdf`, Cap. 8.4 (NZ 4) and Cap. 8.8
   (NZ 8), and extract **per grado**: fondo edificable / retranqueos, altura de cornisa + nº plantas,
   ocupación máxima, usos. Each value → a `sources/SOURCES.md` row, or stays `null`.
2. **NZ 1 engine + provider — RESOLVED (KG-4 solver + the Madrid adapter both shipped).** The
   `explicit-area` solver branch merged a prior pass; the Madrid provider/adapter shipped THIS pass
   (`packages/site-parcel-data/src/rulepacks/esMadridNZ1Provider.ts` + fixture test, suite 571).
   ⚠ **What now blocks NZ 1 is WIRING + SIGN-OFF, not research:** (a) a server same-origin proxy
   `/api/madrid/pgoum97/{condiciones,ficha}`; (b) the `ComputeBuildableEnvelopeInput` field defect
   (blocker 2a below); (c) the NZ-code re-verify (blocker 4); (d) L-449. See
   `findings/L-608-NZ1-PROVIDER-SHIPPED.md` §6.
2a. **🔴 PRE-EXISTING DEFECT — `ComputeBuildableEnvelopeInput` lacks `explicitAreaFootprint`.** The
   engine branch reads `input.explicitAreaFootprint` (`ZoningRulesEngine.ts:651`) but the interface
   never declares it, so `tsc` fails at the base (3 errors) though `vitest` is green — this would
   hard-fail the Fly build. *Unblock:* add `readonly explicitAreaFootprint?: ReadonlyArray<Pt> |
   null;` to the interface (like `blockRing`). **Engine/schema owner** — was out of scope this round.
3. **The buildable RING geometry — RESOLVED — it is LAYER 6.** Live re-probe 2026-07-23:
   `PG_CONDICIONES_EDIFICACION/6` is a single-ring `esriGeometryPolygon` in EPSG:25830 carrying
   `COEF_Z`; it IS the closed footprint, read directly (no polyline-closing needed). The adapter
   reads layer 6. `COEF_Z` is a CODED string (`"-"`, `"4"`, `"5"`, `"0 / 5"`) — `parseCoefZ` gates it.
4. **The calificación endpoint is STILL down (measured across two passes).**
   `pgoum97/PG_ORDENACION` returns `Service not started` again 2026-07-23. *Resume step:* retry
   `pgoum97/PG_ORDENACION/MapServer/layers?f=json`, find the NZ-code field, run a `GetFeatureInfo` at
   a known residential coordinate, and **run `returnCountOnly` unfiltered before trusting any zero.**

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE)

- **If you build the `explicit-area` engine branch for ANY jurisdiction** — Madrid NZ 1 is its first
  consumer; wire `esMadridNZ1.ts` and the ringRef resolver at the same time (they are one unit).
- **If you find a jurisdiction that publishes a buildable FOOTPRINT as geometry** (not parameters) —
  reuse the §4 ringRef resolver pattern; that is the playbook-flagged reusable asset.
- **If you are tempted to encode a single scalar for an NZ** — STOP. Every Madrid NZ is
  **grado-structured**; a scalar is the bare-`20a` category error. Key the pack on `NZ<n>-<grado>`.
- **If you see a Madrid fondo/altura figure in a blog, slide, or a specific APR plan** — it is
  SECONDARY (and APR plans carry site overrides that contradict the general norm). Do not promote it.

## 5 — WHAT IS ALREADY BUILT (do not redo)

- The eleven-Norma-Zonal typology map + the rule-kind decision per NZ (`findings/L-608` §1, §3).
- The LIVE ArcGIS probe of the NZ 1 data plane (`findings/L-608` §2; `sources/SOURCES.md` §A).
- The `explicit-area` solver primitive (`resolveExplicitAreaRing` + `solveExplicitArea`) + engine
  branch — MERGED (prior pass).
- **The Madrid NZ 1 PROVIDER/ADAPTER — SHIPPED this pass:**
  `packages/site-parcel-data/src/rulepacks/esMadridNZ1Provider.ts` (`parseCoefZ`,
  `mapMadridConditionsToExplicitAreaSource`, `MadridNZ1RingProvider`, `isInMadrid`) + fixture test
  (`__tests__/esMadridNZ1Provider.test.ts`, +20, suite 571 green). See
  `findings/L-608-NZ1-PROVIDER-SHIPPED.md`.
- The declaration-grade `esMadridNZ1.ts` pack file (UNREGISTERED — awaits the wiring unit in §6/§3.4).

## 6 — VERIFIED SOURCES (endpoint · answers · tier · query)

- `sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer` — NZ 1
  footprint + `COEF_Z`. **VERIFIED-LIVE** 2026-07-23. Query: `/6?f=json` (fields), `/2?f=json`
  (fondo polyline). Full rows in `sources/SOURCES.md`.
- `sigma.madrid.es/.../pgoum97/PG_ORDENACION_SIN_AMBITO/MapServer` — `Alineaciones` (layer 5),
  `Norma Zonal 1.5` (layer 4). VERIFIED-LIVE.

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- `pgoum97/PG_ORDENACION/MapServer?f=json` — `Service not started` across TWO passes (2026-07-23).
  Retry later; not a permanent absence. (Note: sigma itself is REACHABLE — the other services
  answered live this pass — so this is the service being down, not a network block.)
- `madridlicencias.com/.../PGOUM-97.pdf` via WebFetch — returns compressed/encoded streams, no text
  layer extractable by the fetch model. Use the official `madrid.es` Compendio 2023 with a real PDF
  reader / OCR instead.
- Web search for NZ 4 numbers — returns APR-plan-specific values mixed with the general norm;
  SECONDARY, not usable.

## 8 — THE SMALLEST NEXT STEP that moves the number

**Human-read Compendio 2023 Cap. 8.4 (NZ 4, manzana cerrada) and fill the NZ 4 fondo edificable +
altura table per grado into `sources/SOURCES.md`.** NZ 4 is central Madrid's dominant residential
typology and is `alignment`-shaped (schema-ready today) — so it is the single source-and-ship that
turns the largest share of the ~62 % ceiling from SPEC into a real envelope, with **no engine work
required** (unlike NZ 1). Cost: one human sourcing session + the L-449 verification sign-off.
