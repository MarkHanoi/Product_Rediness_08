# Rate Implementation Plan — France (`fr`) national

<!-- Sibling of RATE.md. The phased climb from the CURRENT rate to the MAXIMUM achievable in scope.
Standard: docs/04-reference/jurisdictions/README.md §"RATE-IMPLEMENTATION-PLAN.md".
Reusable cross-country method this instantiates: ../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md. -->

**Current rate:** ~22% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling (no national SRU):** ~30–35% ·
**Theoretical ceiling (full CNIG SRU):** ~85–90% · **Gap to Denmark (~96%):** ~74 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED · **Status:** RESEARCH COMPLETE + live-probed — pre-implementation

> ⚠ **TWO DENOMINATORS, kept distinct all the way down (the France honesty crux).**
> France answers two different questions at two very different rates:
> - **Zone identification: ~95%** of parcels — GPU returns the zone code, the governing document, and
>   the règlement PDF filename for every commune with a GPU-published PLU/PLUi (live-probed below).
> - **Numeric dimensional fill: ~22%** (the headline, the **proven minimum**) — height / emprise /
>   setback return a machine-readable value for a parcel. For ~95% of communes these live only in the
>   PDF the first denominator just handed us a *link* to.
>
> The headline rate is always the **numeric** one (the ruler is the same in every jurisdiction:
> zone + density + height, no PDF). Never quote the 95% zone-ID number as if it were the buildable-rule
> rate — that conflation is the §CONTEXT-DATA-HONESTY failure C58 §1.2/§1.4 forbids.

---

## 1 — The ceiling: what "maximum" means here

France is **PDF-bound, not Denmark-like.** The single structural fact that sets the ceiling: **there is
no national height/emprise/setback table.** Since loi ALUR (2014) abolished the COS (FAR), density is
governed only by height + emprise au sol + retraits — and every one of ~34,900 communes (or ~1,200
intercommunal EPCI) writes those three numbers in its own prose `règlement écrit` PDF, with its own
zone codes. Zone letter `UA` in one EPCI and `UA` in the next are independent local mnemonics; there is
no cross-commune lookup (README §1.2). So the numeric rate is capped at the fraction of communes whose
numbers have been lifted OUT of the PDF into structured fields.

Three ceilings, honestly separated:

| Path | Numeric ceiling | Why |
|---|---|---|
| Reachable structured data **today** (GPU + Lyon-style local portals + the handful of GIS-height cities) | **~22%** (proven min) → **~25–30%** as more local portals are wired | A few métropoles expose a structured `hauteur` attribute on their own portal; the rest do not. |
| **+ per-EPCI règlement transcription** (article-parser + L-449 human gate) on target metros/EPCIs | **~30–35%** for a France-broad product | Bounded by human-review throughput, not by data existence. Each EPCI transcribed lifts *all* its communes at once. |
| **+ full CNIG SRU national rollout** (structured règlement, national) | **~85–90%** theoretical | Outside PRYZM's control — a national standardisation programme (2 pilot communes as of 2026). Monitor; do not plan around a date. |

**Never 100%.** Even under full SRU, discretionary layers remain: the ABF (Architecte des Bâtiments de
France) sign-off inside a monument's 500 m *périmètre des abords* is a case-by-case human judgement, not
a number, and Marseille/AMP's *règlement graphique* legally overrides the written table. Those parcels
resolve to a cited *refusal-with-overlay-warning*, never a fabricated figure (C58 §1.4).

---

## 2 — Phase tracker

<!-- Rate delta = the honest estimated jump in the RATE.md NUMBER when the phase lands (not a claim it
has). Status ∈ {NOT STARTED · IN PROGRESS · BLOCKED · SHIPPED · VERIFIED · N/A}. "from→to" cumulative. -->

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live-probe every national endpoint; write RATE.md; confirm the PDF-bound ceiling | the honest 22% baseline + the two-denominator split | — → ~22% | done | **VERIFIED** (§Appendix A, 2026-07-24) | — |
| **1** | **Multi-layer harvesting pipeline** — wire the *already-structured* national layers (GPU zone + PDF link, PCI parcel, SUP/ABF overlay, BD TOPO height) into one reader, with the ABF/PSMV overlay **refusal** guard | zone-ID + context massing + overlay-safety for ~95% of communes; makes the 22% *safe* (no silent over-statement near monuments) | ~22 → ~22% (numeric flat by design; SAFETY not fill) | M | NOT STARTED | UNASSIGNED |
| **2** | **Lyon Métropole pack** via `data.grandlyon.com` `pluhauteur` (Tier-1 **structured** height, live-probed `hauteur='16'` m) — one PLUi règlement covers **58 communes** | the cheapest French numeric win; the per-EPCI efficiency proof | ~22 → ~24% | S–M | NOT STARTED | UNASSIGNED |
| **3** | **Per-EPCI règlement transcription** — the one-parser-per-PLU-article pipeline (Art. 6/7 retrait, Art. 9 emprise, Art. 10 hauteur…) on target metros, behind the L-449 human gate | numeric fill for each transcribed EPCI (all its communes at once) | ~24 → ~30–35% | H (per EPCI) | NOT STARTED | UNASSIGNED |
| **4** | **CNIG SRU monitor** — track national structured-règlement rollout; ingest when a target EPCI enters the SRU dataset | the structural ceiling-lift to ~85–90% | ~35 → ~85–90% *(conditional)* | national programme | **BLOCKED** (outside PRYZM control) | UNASSIGNED |

⚠ Status tracks WORK; the rate only moves when RATE.md is re-derived from real checks and marked VERIFIED.

---

## 3 — The refined approach (the founder-relayed method)

### 3.1 — Multi-layer harvesting checklist (Phase 1)

France's strength is that **many authoritative layers are already structured and free** — the weakness
is only the numeric règlement. Harvest every structured layer, per parcel, and let the honest gaps be
gaps. Each row is a separate query (the base zone query does **not** carry the others):

| Layer | Source (live-probed §Appendix A) | Answers | Structured today? |
|---|---|---|---|
| **GPU zoning** | `apicarto.ign.fr/api/gpu/zone-urba` | zone code (`libelle`), governing doc (`idurba`), règlement PDF (`nomfic`) | ✅ zone + PDF link · ❌ numbers |
| **SUP / servitudes** | `apicarto.ign.fr/api/gpu/assiette-sup-s` | flood, aviation, **ABF *périmètre des abords*** (heritage) | ✅ queryable — **build the overlay refusal here** |
| **PPR risk** | GPU SUP acts (PPRi/PPRn categories) | flood/landslide/seismic constraint that can cap or forbid build | ✅ as SUP acts |
| **Heritage / ABF / PSMV** | SUP `AC1`/`AC4` + secteur sauvegardé | 500 m monument perimeter; historic-centre plan | ✅ perimeter geometry · ❌ the discretionary rule → **refuse, warn** |
| **Natura 2000 / environment** | INPN / GPU environmental SUP | protected-habitat constraint | ⚠ partial |
| **BD TOPO buildings** | `data.geopf.fr/wfs BDTOPO_V3:batiment` | footprint + **real `hauteur`** + `nombre_d_etages` (context massing) | ✅ live (`hauteur` 9.5–22.4 m sampled) |
| **RGE ALTI / LiDAR HD** | `data.geopf.fr` MNT/MNS + LiDAR HD tiles | terrain (the datum height is measured *from*) + LOD2-capable point cloud | ✅ ~80% coverage end-2025 |
| **PCI parcels** | `data.geopf.fr/wfs CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle` | parcel geometry + cadastral ref | ✅ live |

**The overlay guard is not optional.** A height resolved inside an ABF perimeter without checking the
SUP layer is confidently-wrong in a way invisible to the engine (README §4). Phase 1 wires the SUP query
*before* any numeric answer and returns a refusal-with-overlay-warning on intersection.

### 3.2 — One-parser-per-PLU-article pattern (Phase 3)

A French PLU règlement is **structured by article number** (the 2015+ modernised PLU keeps a stable
article grammar per zone). That structure is the extraction unit: **one parser per article**, reused
across every commune, rather than one bespoke reader per PLU.

| PLU article | Governs | Extractor output (C58 field) |
|---|---|---|
| **Art. 6** | implantation par rapport aux **voies** (street setback) | `setback.front_m` |
| **Art. 7** | implantation par rapport aux **limites séparatives** (side/rear setback) | `setback.side_m` / `setback.rear_m` |
| **Art. 8** | implantation des constructions les unes par rapport aux autres | (inter-building spacing) |
| **Art. 9** | **emprise au sol** (ground coverage) | `maxCoverage` |
| **Art. 10** | **hauteur maximale** (max height) | `maxHeight_m` |
| **Art. 14** | (pre-ALUR COS) | `n/a — abolished loi ALUR 2014` |

This maps onto the **shared** `@pryzm/ordinance-extraction` core
(`docs/04-reference/standards/ORDINANCE-EXTRACTION-PIPELINE.md`): the per-city *enumerator* differs (which GPU doc,
which EPCI), but Stages 1–6 (profile → OCR/text-pull → dual-pass → cross-checks → **L-449 human gate** →
emit pack at `pipeline-extracted-unverified`) are identical. France adds only a *French article grammar*
adapter — Art. 6/7/9/10 → C58 fields — not a new pipeline. The algorithm-detector (§2 Stage 4 of that
doc) is essential here: French règlements frequently say *"hauteur résultant de l'application du
gabarit"* — emit `null`/`derived`, never a number.

### 3.3 — Per-EPCI efficiency (the leverage multiplier)

**One PLUi règlement governs many communes.** Live-probed: the Lyon zone carries
`partition = DU_200046977` (Métropole de Lyon) — a **single** `200046977_reglement_20260326.pdf` for all
**58** communes of the Métropole. Transcribe that one document and every parcel in 58 communes gains its
numbers at once. The right unit of work is therefore the **EPCI/PLUi**, not the commune: prioritise the
~1,200 EPCI, not the ~34,900 communes. The INSEE join key must carry the full comma-separated commune
list per PLUi (NEXT.md §4.4).

### 3.4 — CNIG SRU monitor (the structural ceiling-lift)

The *Structuration du Règlement d'Urbanisme* national standard would deliver structured numeric règlement
data per zone — the one path to the ~85–90% ceiling. As of 2026 it covers **2 pilot communes**
(Pechbonnieu 31, Preignan 32). This is **BLOCKED on a national programme, not on PRYZM effort** — do not
plan a date around it. Monitor `cnig.fr/cnig/structuration-des-reglements`; the trip-wire (NEXT.md §4.1)
fires the moment a *target* EPCI enters the SRU dataset, at which point Phase 3's transcription cost for
that EPCI collapses to an ingestion.

---

## 4 — The gap to Denmark (~96%)

Denmark hits ~96% because Plandata delivers zone + numeric density + height as **structured national
fields** — almost no query reads a PDF. France's gap is squarely reason **(a) numbers are in PDFs, not
structured fields**, compounded by **(b) fragmentation across ~1,200 EPCI** (the reader is one; the
règlements are ~1,200). It is *not* reason (c) licence/geo-fence: every national layer is open (Etalab
2.0 / ODbL), unlike the geo-fenced feeds elsewhere. France thus has **world-class geospatial
infrastructure with the numbers deliberately left in prose** — the inverse of a licensing problem, and
the reason the ceiling is transcription-throughput-bound, not access-bound.

---

## 5 — Dependencies, blockers, cross-jurisdiction reuse

- **Shared extraction core** — Phase 3 depends on `@pryzm/ordinance-extraction`
  (`ORDINANCE-EXTRACTION-PIPELINE.md`, DESIGN SPEC, not built) + the `pipeline-extracted-unverified`
  confidence tier (that doc §3.1, WIRING TODO). France is a **new enumerator + a French-article grammar
  adapter** on that core, nothing more — the same reuse argument that makes Córdoba cheap after Barcelona.
- **L-449 human-verification gate** — no French pack ships above `pipeline-extracted-unverified` without a
  recorded human sign-off (`VERIFICATION.md`). Non-negotiable (README §"authoring contract").
- **New engine kinds (Paris, Marseille)** — Paris needs a reference-surface + relative-formula *gabarit*
  kind; Marseille needs a graphic-primacy precedence kind. Both need an ADR before a pack (NEXT.md §3.3).
  These are **envelope-shape** work, orthogonal to the rate: they raise per-city depth, not national fill.
- **Reuse OUT** — the French article-grammar adapter and the per-EPCI multi-commune join generalise to any
  EPCI-fragmented, PDF-bound jurisdiction; the multi-layer harvesting checklist (§3.1) is the concrete
  France instance of the country-agnostic method in `../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md`.

---

## Appendix A — Live-probe evidence (2026-07-24)

All asserted on Content-Type + body; endpoints returned JSON/GeoJSON with the fields shown. No value below
is inferred.

| Endpoint · query | Result (verbatim sample) | What it proves |
|---|---|---|
| `apicarto.ign.fr/api/gpu/zone-urba` · Paris `2.3470,48.8530` | `libelle='UG'`, `libelong='Zone urbaine générale'`, `typezone='U'`, `nomfic='75056_reglement_20260616.pdf'`, `urlfic=''`, `idurba='75056_PLU_20260616'` | Zone code + règlement PDF filename present; **NO numeric height/emprise/setback field**; `urlfic` empty (PDF located via `nomfic`, not a ready URL). The core PDF-bound finding, confirmed. |
| `apicarto.ign.fr/api/gpu/zone-urba` · Lyon `4.8357,45.7640` | `libelle='UCe1b'`, `partition='DU_200046977'`, `nomfic='200046977_reglement_20260326.pdf'`, identical CNIG schema | Lyon uses the **same national schema with no structured height**; one PLUi doc for the whole Métropole (per-EPCI efficiency). |
| `data.grandlyon.com/geoserver/metropole-de-lyon/ows` · `plu_h_opposable.pluhauteur` | layer **exists**; feature `hauteur='16'` (m), `last_update='2019-02-18'` | The **one Tier-1 structured-height** French case — but on Lyon's **local** portal, **not** national GPU. Confirms Lyon = cheapest win **and** needs a second data source. |
| `data.geopf.fr/wfs` · `BDTOPO_V3:batiment`, Paris bbox | 5/5 features non-null: `hauteur` ∈ {9.5, 21, 9.6, 22.4, 21.7} m, `nombre_d_etages` ∈ {3,6,1,7,5}, `usage_1` | LOD1 context massing (real building heights) is **live today**. |
| `apicarto.ign.fr/api/gpu/assiette-sup-s` · Paris `2.3470,48.8530` | **66** servitude assiettes incl. multiple `typeass='Périmètre des abords'` (ABF heritage) | The ABF/heritage overlay **IS queryable** via a *separate* SUP call — resolves NEXT.md §3.4. Build the overlay refusal on this. |
| `data.geopf.fr/wfs` · `CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle`, Paris bbox | 1 parcel: `section='BQ'`, `numero='0046'`, `code_dep='75'`, `nom_com='Paris'`, `code_com='056'` | Parcel geometry + cadastral ref **live**. |
| `apicarto.ign.fr/api/cadastre/parcelle` · Point geom | 0 features | A Point-geom quirk of the apicarto cadastre route; the national WFS (row above) is the working parcel path. Recorded as a measured negative, not a gap. |

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb). Governing: **C58** (fidelity/provenance) · **ADR-0269** (curate-then-serve) · **L-449**
(human-verification gate). Extraction engine: `../../ORDINANCE-EXTRACTION-PIPELINE.md`. Cross-country
method: `../_TEMPLATE/COUNTRY-DATA-STRATEGY-TEMPLATE.md`.*
