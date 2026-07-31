# Köln B-Plan evidence bundles (`plans/`)

**Status:** SCAFFOLD — structure only. **No plan captured; no content invented.** Every field is
`unknown` / `PENDING` until a real Köln Bebauungsplan is sourced and human-verified.

Each captured B-Plan is an **immutable legal evidence object** at `plans/<PLAN-ID>/`, per
`../EXTRACTION-PIPELINE.md §3`. `<PLAN-ID>` is the official Stadt Köln plan number (slugified).

## Bundle contents (per plan)

| File | Contents | Authority |
|---|---|---|
| `metadata.json` | planId · officialTitle · rechtskraeftig · effectiveDate · authority (Stadt Köln) · confidence | index |
| `geometry.geojson` | plan boundary polygon (EPSG:25832) | point-in-polygon |
| `xplan.gml` | XPlanGML machine record | **evidence** (not legal authority) |
| `ordinance.pdf` | Satzung / textual Festsetzungen | **BINDING legal authority** |
| `planzeichnung.pdf` | plan drawing — Baugrenzen/Baulinien, zone areas | binding drawing |
| `extraction.json` | extracted field values, **per-field** confidence + source chain | derived |
| `citations.json` | value → document → section/page → Festsetzung number → confidence | audit trail |

## Registry

`index.json` — one entry per captured plan. Currently **empty** (`plans: []`).

## Rules (do not violate)

- XPlanGML is evidence, not authority — the Satzung PDF is binding.
- Per-**field** confidence (one plan can hold verified GRZ + unknown height).
- A row is production only if it passes ALL quality gates (`../EXTRACTION-PIPELINE.md §6`).
- Never invent plan content. Empty stays `unknown`.

## Template bundle

`_TEMPLATE/` holds the empty JSON shapes to copy when a real plan is captured. The binary evidence
(`xplan.gml`, `ordinance.pdf`, `planzeichnung.pdf`) is added at capture time — it is not scaffolded.
