# NEXT — Madrid (28079, es-md, Spain)

> Where we stopped and how to resume. Convention: README = what is true now; this = where we
> stopped. Last updated 2026-07-23 · Maintainer: research agent (L-608) · Status: **SPEC, no pack shipped.**

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Madrid was converted from assessment to a **buildable pack SPEC**. The four target Normas Zonales
(3/4/1/8 ≈ 96 % of directly-governed residential land) each have a **decided, justified
geometricRule kind** (NZ 1 `explicit-area`, NZ 4 `alignment`, NZ 8/5/7 `setback`, NZ 3 refusal).
**NZ 1's numbers are live ArcGIS data** (`COEF_Z` + `Fondo de la Edificación`, verified this pass)
— it is the first real `explicit-area` case — **but it is engine-blocked** (no `explicit-area`
solver, C58 §2.2 KG-4). **NZ 4/8/5/7 are document-gated**: their grado-structured numbers sit in the
Compendio 2023 NNUU and were not sourced citeably this pass, and the Zod schema structurally forbids
a placeholder pack. Net: **SPEC complete, zero shippable envelopes.**

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
2. **NZ 1 is engine-blocked (KG-4).** *Why:* `explicit-area` is declared in the schema with **no
   solver branch**; the exhaustive switch makes registering it a compile error until the branch
   exists. *Unblock:* add the `explicit-area` engine case + the ringRef resolver (design in
   `findings/L-608` §4). *Resume step:* implement `solveExplicitArea(parcel, ringRef)` in the
   engine, and a provider-side `resolveMadridNZ1Ring(codManzana)` that closes the `Fondo de la
   Edificación` polyline against `Alineaciones` (or reads layer 6/10 polygon directly).
3. **The buildable RING geometry is ambiguous.** *Why:* `Fondo de la Edificación` is a **polyline**
   (rear line), not a closed ring; layer 6 `Condiciones de la Edificación` (polygon) and layer 10
   `Fondo` (polygon) are candidates for the closed area but were not confirmed. *Resume step:* query
   `PG_CONDICIONES_EDIFICACION/MapServer/6/query` and `/10/query` for one central manzana; compare
   the polygon to the parcel + alineación to see which is the buildable area.
4. **The calificación endpoint was not re-verified this pass.** *Why:* `pgoum97/PG_ORDENACION`
   returned HTTP 500 "Service not started" x3. *Resume step:* retry
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
- The `explicit-area` ringRef resolver design (`findings/L-608` §4).
- The declaration-grade `esMadridNZ1.ts` pack file (UNREGISTERED, engine-blocked).

## 6 — VERIFIED SOURCES (endpoint · answers · tier · query)

- `sigma.madrid.es/hosted/rest/services/PGOUM97/PG_CONDICIONES_EDIFICACION/MapServer` — NZ 1
  footprint + `COEF_Z`. **VERIFIED-LIVE** 2026-07-23. Query: `/6?f=json` (fields), `/2?f=json`
  (fondo polyline). Full rows in `sources/SOURCES.md`.
- `sigma.madrid.es/.../pgoum97/PG_ORDENACION_SIN_AMBITO/MapServer` — `Alineaciones` (layer 5),
  `Norma Zonal 1.5` (layer 4). VERIFIED-LIVE.

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- `pgoum97/PG_ORDENACION/MapServer?f=json` — HTTP 500 "Service not started" (x3, 2026-07-23). Retry
  later; not a permanent absence.
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
