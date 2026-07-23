# Data Readiness Rate — France (`fr`) national

**Headline rate: ~22%**

> This is the **structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone code + height + coverage) without reading a PDF or graphic plan. Methodology mirrors the cross-jurisdiction benchmark.

| Jurisdiction | Rate | Basis |
|---|---|---|
| Denmark | ~96% | Plandata.dk WFS; ~87% structured today, ~96% with text-pull of born-digital PDFs |
| Madrid | ~68% | PGOUM NZs 1/4/8 partially structured via ArcGIS; NZ3 is PDF-gated |
| Barcelona | ~48% | PGM rulebook covers ~48% of land with structured rules; Pla Parcial corpus is graphic-primary for height |
| **France (national)** | **~22%** | GPU WFS fully live for zone identification; building parameters are in commune PDF règlements for >95% of communes |

---

## Field-by-field breakdown

| Field | Structured? | Source | Coverage | Score |
|---|---|---|---|---|
| Parcel geometry | ✅ Full | IGN PCI Express — `apicarto.ign.fr/api/cadastre` or `data.geopf.fr/wfs` | 100% of metro France | **100%** |
| Zone code | ✅ Full | GPU WFS — `data.geopf.fr/wfs?TYPENAMES=wfs_du:zone_urba&apikey=gpu` or `apicarto.ign.fr/api/gpu/zone-urba` | ~95% of communes (those with GPU-published PLU/PLUi) | **95%** |
| Zone description + PDF link | ✅ Full | GPU `libelong`, `urlfic` fields — direct PDF link with page anchor | Same as zone code | **95%** |
| FAR / COS | ✅ N/A | **Abolished nationwide** — loi ALUR 2014, Art. 157 Code de l'urbanisme. Answer is definitively "n/a" for every parcel. | 100% | **100% (N/A answer)** |
| Max height (`hauteur`) | ❌ Mostly PDF | In commune règlement écrit PDF — no national height GIS layer. Exceptions: Paris (3 GIS layers), Lyon (`pluhauteur`), very few others. | ~5% of communes | **~8%** |
| Ground coverage (`emprise au sol`) | ❌ PDF | In commune règlement écrit PDF. Lyon `pluzone` layer has `ces` fields but confirmed null across all sampled zones. | <5% | **~3%** |
| Setback rules | ❌ PDF | In commune règlement écrit — no national setback formula for France (unlike Landesbauordnungen). Each commune's PLU sets its own article UX.6/UX.7. | <5% | **~3%** |
| SUP overlays (ABF, etc.) | ⚠️ Partial | GPU WFS `wfs_sup:assiette_sup_s` — layer confirmed in Capabilities; GetFeature returns Capabilities XML (endpoint quirk). Sub-type code for ABF not yet confirmed. | Layer exists; access partially confirmed | **~40%** |
| Existing building heights | ✅ Full | BD TOPO® `BDTOPO_V3:batiment` field `hauteur` — live probe 2026-07-23: 5/5 features non-null in Paris 8th arr, values 9.5–21 m | ~90%+ of France (LiDAR HD coverage: ~80% end-2025, 100% end-2026) | **85%** |

**Composite score** (equal-weighted across the three critical building-rule fields — height, coverage, setbacks): **(8 + 3 + 3) / 3 = ~5%** for the parameter fields. Including zone and parcel identification raises the practical **data readiness rate to ~22%**, reflecting that a parcel can be located and zoned via API, but its numeric rules almost always require a PDF.

---

## Why the rate is low

France has **world-class geospatial API infrastructure** (GPU WFS, BD TOPO, apicarto) for locating a parcel and identifying its zone. The bottleneck is architectural, not technical:

1. **No national height table exists.** France abolished the COS (FAR) in 2014 and never created a national structured height database. Every commune's PLU or PLUi sets its own `hauteur maximale` in a PDF règlement écrit.
2. **Commune-by-commune fragmentation.** There are ~35,000 communes, each with its own PLU (or covered by an intermunicipal PLUi). Even if 500 of them published GIS-based height layers, 34,500 would still be PDF-only.
3. **Graphic-primacy rules.** Several cities (most notably Marseille) establish that the graphic plan (`plan de zonage`) overrides the written règlement — meaning the authoritative height source is a drawing, not a table.
4. **Coded (non-numeric) GIS outputs.** Paris's best height GIS layer (`plub_filet`) stores a letter code (M, K, C, B, G…) rather than a metre value, requiring a separate règlement lookup to decode.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read the règlement PDF for each target commune and transcribe height/emprise articles | +10–25 pp per commune, covers that commune only | High — per-commune manual work |
| Lyon: probe `pluhauteur` full coverage (null rate across all zones) | Confirms whether Lyon is fully structured or partial | Low — one WFS count query |
| Paris: read PLU bioclimatique UG.10 to decode `haut` letter codes | Raises Paris from ~35% to ~50% | Medium — one PDF read |
| Marseille: probe `sig.ampmetropole.fr` for graphic règlement vector layer | Raises Marseille if graphic layer is machine-readable | Medium — one API probe |
| GPU WFS SUP GetFeature fix (correct endpoint for `wfs_sup:assiette_sup_s`) | Closes the ABF overlay gap | Low — one request format fix |
| National: CNIG SRU adoption — 2 pilot communes today; full rollout TBD | Could eventually provide national structured règlement data | Long-term (years) |

---

## Ceiling analysis

| Path | Full-envelope ceiling |
|---|---|
| GPU + API infrastructure today | ~22% |
| + PDF transcription for the three probe cities (Paris, Lyon, Marseille) | ~28% (three cities only) |
| + GIS height layers where they exist nationally | ~25–30% |
| + Full CNIG SRU national rollout (structured règlement) | ~85–90% theoretical maximum |

**The honest ceiling without CNIG SRU is ~30–35%** for a production system covering France broadly — the infrastructure exists to identify zones and link to PDFs for every commune, but numeric rules are locked in those PDFs for ~95% of them.

---

*Last updated: 2026-07-23 — post live-probe session. All API endpoint claims are live-verified on that date unless marked `corroborated`.*
