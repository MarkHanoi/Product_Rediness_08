# Data Readiness Rate — France (`fr`) national

**Headline rate: ~22%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition is IDENTICAL
> across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so
> the scores are directly comparable. Derived from direct endpoint/schema checks, not assumed from
> France's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Lyon Métropole | ~42% |
| Paris | ~35% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| **France (national)** | **~22%** |
| Marseille / AMP T1 | ~18% |

France has **world-class geospatial API infrastructure** (GPU WFS, BD TOPO, apicarto) for locating
a parcel and identifying its zone. The bottleneck is architectural, not technical: zone-boundary hit
is near-universal (~95% of communes), but the numeric rules behind those zones — height, emprise au
sol, setbacks — are locked inside per-commune PDF règlements for ~95% of France's ~34,900 communes.

The three large metros studied (Paris ~35%, Lyon ~42%, Marseille ~18%) use **three structurally
different height mechanisms** — not different numbers in the same mechanism, but different software
problems. Do not assume any French city generalises to any other.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry | ✅ Full | IGN Parcellaire Express (PCI) — `apicarto.ign.fr/api/cadastre` or `data.geopf.fr/wfs` | ~100% |
| Zone code | ✅ Full | GPU WFS — `data.geopf.fr/wfs?TYPENAMES=wfs_du:zone_urba&apikey=gpu` or `apicarto.ign.fr/api/gpu/zone-urba` | ~95% (communes with GPU-published PLU/PLUi) |
| Zone description + PDF link | ✅ Full | GPU `libelong`, `urlfic` fields — direct PDF link with page anchor | ~95% |
| FAR / COS | ✅ N/A — definitively abolished | Abolished nationwide — loi ALUR 2014, Art. 157 Code de l'urbanisme. Answer is "n/a" for every French parcel | 100% (N/A answer is the correct answer) |
| Max height (`hauteur`) | ❌ Mostly PDF | In commune règlement écrit PDF — no national height GIS layer. Exceptions: Paris (3 GIS layers, coded), Lyon (`pluhauteur`, absolute metres), very few others | ~8% |
| Ground coverage (`emprise au sol`) | ❌ PDF | In commune règlement écrit PDF. Lyon `pluzone` layer has `ces` fields but confirmed null across all sampled zones. | ~3% |
| Setback rules | ❌ PDF | In commune règlement écrit — no national setback formula. Each commune's PLU sets its own UX.6/UX.7 articles. | ~3% |
| SUP overlays (ABF, flood, etc.) | ⚠️ Partial | GPU WFS `wfs_sup:assiette_sup_s` — layer confirmed in Capabilities; GetFeature endpoint quirk noted. ABF sub-type code not yet confirmed. | ~40% |
| Existing building heights | ✅ Full | BD TOPO® `BATIMENT.hauteur` — live probe 2026-07-23: 5/5 non-null in Paris 8th arr., values 9.5–21 m | ~85% (LiDAR HD ~80% national coverage end-2025; full end-2026) |

**Composite score** (equal-weighted across the three critical building-rule fields — height, coverage,
setbacks): `(8 + 3 + 3) / 3 = ~5%` for the parameter fields. Including zone identification and
parcel geometry raises the practical data readiness rate to **~22%** — a parcel can be located and
zoned via API, but its numeric rules almost always require a PDF.

---

## The structural gap

**There is no national height table for France.** The loi ALUR (2014) abolished the COS (FAR)
nationwide, but no structured replacement was created. Every one of ~34,900 communes writes its own
règlement with its own zone codes and its own numeric parameters for hauteur maximale, emprise au
sol, and retraits. Zone letter `UA` in one commune is an independent local mnemonic from `UA` in a
neighbouring commune — there is no cross-commune lookup table.

This is categorically different from Barcelona (one PGM, shared machinery across all zones), Norway
(national Plandata schema), or even Germany (shared BauNVO taxonomy across all Länder). The correct
unit of sourcing work is one commune's or one EPCI's règlement PDF — not one national document.

**Four specific barriers compound the fragmentation:**
1. **No national height table.** The COS abolition in 2014 removed the one nationwide numeric metric
   without replacing it. Every commune's height rule is its own.
2. **Commune-by-commune fragmentation.** ~34,900 communes, each with its own PLU or covered by a
   PLUi. Even if 500 published GIS height layers, 34,400 would still be PDF-only.
3. **Graphic-primacy rules.** Several cities (most notably Marseille / AMP) establish that the
   graphic plan overrides the written règlement — the authoritative height source is a drawing, not
   a table.
4. **Coded (non-numeric) GIS outputs.** Paris's primary height layer (`plub_filet`) stores a letter
   code (M, K, C, B, G…) requiring a separate règlement lookup to decode.

**Three different software problems in three cities:** Paris uses a reference-surface + gabarit
formula (H = P + 3.00 + D from a computed block-level leveling surface). Lyon uses a structured GIS
attribute (`pluhauteur`, absolute metres) for most of its territory. Marseille uses graphic-primacy
over the written règlement. None generalises to the others — this is not a parameter difference.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read the règlement PDF for each target commune; transcribe height/emprise articles | +10–25 pp per commune; covers that commune only | High — per-commune manual work |
| Lyon: probe `pluhauteur` full coverage (null rate across all zones + outer 56 communes) | Confirms whether Lyon is fully structured or partial — may raise Lyon from ~42% to ~55% | Low — one WFS count query |
| Paris: read PLU bioclimatique UG.10 to decode `haut` letter codes (M/K/C/B/G) | +20 pp for Paris (converts `plub_filet` from coded to numeric) | Low — one PDF section |
| Marseille: probe `sig.ampmetropole.fr` for graphic règlement vector layer machine-readability | +20 pp for Marseille if machine-readable; confirms whether the graphic-primacy path is an API call or a digitizing task | Medium — one API probe |
| Fix GPU WFS `wfs_sup:assiette_sup_s` GetFeature endpoint (correct request format) | Closes the ABF overlay gap nationally | Low |
| Scan ~22 French métropoles' open-data portals for `hauteur`/`HBCPRINC`/`gabarit` structured attributes | Identifies additional Lyon-style Tier 1 cities cheaply — converts the "which city next" question from a guess to a measurement | Low–Medium |
| National: CNIG SRU adoption — 2 pilot communes today; full rollout TBD | Could eventually provide national structured règlement data | Long-term (years; outside this project's control) |

### Ceiling analysis

| Path | Full-envelope ceiling |
|---|---|
| GPU + API infrastructure today (zone + parcel + BD TOPO) | ~22% |
| + PDF transcription for the three probe cities (Paris, Lyon, Marseille) | ~28% |
| + GIS height layers where they exist nationally (Lyon-style cities) | ~25–30% |
| + Full CNIG SRU national rollout (structured règlement) | ~85–90% theoretical maximum |

**The honest ceiling without CNIG SRU is ~30–35%** for a production system covering France
broadly — the infrastructure identifies zones and links to PDFs for every commune, but numeric rules
are locked in those PDFs for ~95% of them.

---

*Last updated: 2026-07-24. GPU WFS zone identification VERIFIED LIVE (2026-07-23). BD TOPO®
hauteur VERIFIED LIVE (2026-07-23, Paris 8th arr.). LiDAR HD ~80% national coverage end-2025;
full national end-2026. FAR/COS definitively abolished nationwide (loi ALUR 2014). No national
structured height layer exists. CNIG SRU at 2 pilot communes as of 2026. Maintainer: UNASSIGNED.*
