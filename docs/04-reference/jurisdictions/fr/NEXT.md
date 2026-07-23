# NEXT — France (`fr`)

> **What this file is.** The single place recording where we stopped on France, exactly why, and
> precisely what to do to go further the moment it becomes possible.
> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — pre-implementation

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The national data-source layer is fully characterised — parcel geometry (IGN PCI Express), zoning identification (GPU), context buildings + height (BD TOPO), LiDAR HD point cloud — and all national APIs are confirmed as open-licence with no purchase decision. The numeric-rule layer is the blocker: France has no national height table; every commune's rules live in a prose PDF that CNIG's SRU standard is only beginning to structure (2 pilot communes as of 2026). Three metros were studied in depth (Paris, Lyon, Marseille); each uses a structurally different height mechanism, none of which generalises to the others, and none of which has a direct analogue in the existing engine kinds. No pack is implemented. The next step is the live GPU probe for a single Paris commune, followed by a decision on which city to enter first (Lyon is cheapest if the GPU WFS exposes its structured height fields; Paris and Marseille each need a new engine kind).

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data resolution: 0% (endpoints confirmed in research, not live-probed).**

Denominator for envelope: any French parcel in any city for which the commune's règlement has been transcribed. Currently zero communes transcribed, therefore zero parcels resolved.

---

## 3 — BLOCKERS

### 3.1 — Numeric rule data not nationally structured

- **What it is.** Height, emprise au sol (footprint coverage), and setback distances for French zones live in per-commune prose PDFs. The CNIG SRU standard to structure them nationally covers only 2 pilot communes (Pechbonnieu 31, Preignan 32) as of 2026.
- **Why it blocks.** No API or WFS can answer "what is the max height for zone UB in commune X". A human must read the PDF for each commune you want to cover.
- **What would unblock it.** Either: (a) CNIG SRU standard rolls out nationally — outside this project's control, monitor; (b) manually transcribe the target commune's règlement PDF, following the L-449 source-acceptance gate.
- **THE EXACT RESUME STEP.** For Paris: read PLU bioclimatique zone UG articles UG.6/7/8/10 verbatim from the consolidated text on `api-sig.paris.fr` or `opendata.paris.fr`. For Lyon: confirm whether GPU WFS exposes `HBCPRINC`/`PLAFOND` fields by running a live WFS `GetFeature` request against a known Lyon parcel (see §8). For Marseille: obtain the PLUi Marseille-Provence (Territoire 1, 19/12/2019) règlement and confirm whether the graphique layer is GIS-accessible.

### 3.2 — Context endpoints not live-probed

- **What it is.** BD TOPO and LiDAR HD are confirmed as the correct sources in research, but no live WFS request has been made and no sample response has been validated.
- **Why it blocks.** Cannot certify the pipeline until endpoint behaviour is verified (field names, CRS, pagination, actual `HAUTEUR` value presence).
- **What would unblock it.** One live WFS `GetFeature` against `data.geopf.fr/wfs` for a known Paris parcel bbox, requesting feature type `BATIMENT`, and reading the `HAUTEUR` field value.
- **THE EXACT RESUME STEP.**
  ```
  curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
  &TYPENAMES=BDTOPO_V3:batiment&BBOX=2.3470,48.8530,2.3490,48.8545,EPSG:4326\
  &SRSNAME=EPSG:4326&COUNT=5&OUTPUTFORMAT=application/json"
  ```
  Record: field names present, `HAUTEUR` value (non-null?), CRS in response, pagination headers.

### 3.3 — New engine kinds required for Paris and Marseille (not yet ADR'd)

- **What it is.** Paris requires a "reference-surface + relative-formula gabarit" kind (the block-leveling surface plus H = P + 3.00 + D formula). Marseille requires a "graphic-primacy" precedence-resolution kind (graphic layer checked first, written article as fallback). Neither exists in the current `GeometricRule` discriminated union.
- **Why it blocks.** No pack can implement Paris or Marseille without the engine kind first. An ADR must precede the kind, and the kind must precede the pack.
- **What would unblock it.** Author ADR-0274 (Paris gabarit kind) and ADR-0275 (Marseille graphic-primacy kind), ratify with founder.
- **THE EXACT RESUME STEP.** Start ADR-0274 by reading UG.10.1–10.4 of the PLU bioclimatique to verify the formula verbatim before describing the kind.

### 3.4 — ABF overlay detection not built

- **What it is.** The 500 m ABF (Architecte des Bâtiments de France) perimeter around any classified monument is not returned by the GPU base-zone query. Any result produced without checking this overlay silently overstates buildability near historic monuments — a nationwide risk.
- **Why it blocks.** A pack that resolves a height figure inside an ABF perimeter is confidently wrong in a way that is invisible to the engine.
- **What would unblock it.** Query the GPU `servitude_utilite_publique_ac2` layer for the target parcel bbox during the site pipeline, and return a refusal-with-overlay-warning when the parcel intersects an ABF perimeter.
- **THE EXACT RESUME STEP.** Probe `apicarto.ign.fr/api/gpu/acces_au_sol` or the GPU WFS `servitude_*` layers for a known Paris parcel near a classified monument and confirm whether ABF perimeters are included in the response.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If CNIG SRU standard communes reach the scale of a target city** → check `cnig.fr/cnig/structuration-des-reglements` for current coverage. If a target commune's zones are in the SRU dataset, the transcription bottleneck collapses: structured machine-readable rules become available. Resume §3.1 immediately.
- **4.2 — If the GPU WFS `GetFeature` for a Lyon bbox returns `HBCPRINC` or `PLAFOND` as a field** → Lyon outer communes are Tier 1 (config only, existing kind). Add `fr-ara/69123-lyon/` pack scaffold and begin sourcing at §3.1 with Lyon PLU-H as the primary text, not a PDF — the number is already in the WFS response.
- **4.3 — If the nDSM / LiDAR HD pipeline is built for any other jurisdiction** (ES, PT) → it feeds France via the same IGN LiDAR HD tiles; update `topics/buildings-lod-height.md` and the topics spike tables. No new pipeline — new inputs.
- **4.4 — If an INSEE-keyed municipality register is created** (e.g., for city lookup/autocomplete) → the join key for the French layer is the 5-digit INSEE code; ensure the register includes the comma-separated INSEE codes for all communes in a PLUi (e.g., all 58 Lyon Métropole communes share the PLU-H).
- **4.5 — If any other French métropole's open-data portal is found to publish structured height attributes** (analogous to Lyon's `HBCPRINC`/`PLAFOND`) → it is a Tier 1 city. Add its entry to the municipality table in `README.md §5` and scaffold a pack folder immediately — these are the cheapest French wins.
- **4.6 — If Paris publishes its "plan des hauteurs" as a GIS WMS/WFS layer** (not just PDF plates) → the Paris LOD-curve drops by ~6–8 dev-days and the pack becomes feasible without digitizing. Check `api-sig.paris.fr` or `opendata.paris.fr` for a `plan_hauteurs` or `hauteurs_plafonds` layer.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National data-source characterisation — `findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md`
- Country-level README and municipality stubs — `fr/README.md`, `fr/fr-idf/75056-paris/`, `fr/fr-ara/69123-lyon/`, `fr/fr-pac/13055-marseille/`
- Topic files with spike evidence tables — `fr/topics/`
- National SOURCES.md with citations for all national APIs

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| `apicarto.ign.fr/api/cadastre` | Parcel geometry + cadastral reference (INSEE + section + number) for any French parcel by bbox or point | VERIFIED-LEAD (not live-probed) | `GET /api/cadastre/parcelle?lon=2.347&lat=48.853` |
| `data.geopf.fr/wfs?TYPENAMES=BDPCI_V2:PCI_PARCELLE` | Alternative parcel geometry via national WFS | VERIFIED-LEAD | Standard WFS bbox request |
| `apicarto.ign.fr/api/gpu` | Zone code, governing document name/date, PDF link, SUP acts — for any French point | VERIFIED-LEAD | `GET /api/gpu/zone?lon=2.347&lat=48.853` |
| `data.geopf.fr/annexes/ressources/wfs/gpu.xml` | Same as above, paginated WFS (5,000 obj/req cap) | VERIFIED-LEAD | WFS `GetCapabilities` confirms feature types |
| `data.geopf.fr/wfs?TYPENAMES=BDTOPO_V3:batiment` | Building footprint + `HAUTEUR` attribute (photogrammetry/LiDAR-derived) | VERIFIED-LEAD (not live-probed) | Bbox WFS — see §3.2 for exact probe command |
| `lidarhd.ign.fr` / `macarte.ign.fr` | LiDAR HD point cloud tile availability and download | VERIFIED-LEAD | Coverage check: `macarte.ign.fr/carte/mThSup/diffusionMNxLiDARHD` |
| `cadastre.data.gouv.fr` | Bulk commune-level cadastral GeoJSON/Shapefile | VERIFIED-LEAD | Direct download per commune INSEE code |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **CNIG SRU structured règlement data, national scope:** as of 2026, only 2 communes (Pechbonnieu 31, Preignan 32) are in the live demonstrator. Do not re-run a search for national SRU coverage expecting a different answer — monitor the CNIG roadmap instead (4.1 trip-wire).
- **RNU as a numeric-rule source for large cities:** Paris, Lyon, and Marseille all have their own PLU/PLUi; RNU does not apply. RNU is a qualitative fallback for communes WITHOUT a local plan — relevant only for rural/small-commune coverage, not for any city study.
- **"Zone letter UA means the same thing across communes":** definitively false. `UA` in one EPCI and `UA` in a neighbouring one are independent local mnemonics. Any attempt to build a cross-commune zone-letter lookup table is a category error.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the GPU live probe + BD TOPO live probe for a single Paris parcel bbox. Estimated: 0.5 dev-days.**

```bash
# GPU probe: zone code, document, PDF link
curl "https://apicarto.ign.fr/api/gpu/zone?lon=2.3470&lat=48.8530"

# BD TOPO probe: building footprint + HAUTEUR
curl "https://data.geopf.fr/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature\
&TYPENAMES=BDTOPO_V3:batiment&BBOX=2.3460,48.8520,2.3500,48.8560,EPSG:4326\
&SRSNAME=EPSG:4326&COUNT=10&OUTPUTFORMAT=application/json"

# GPU probe: Lyon parcel — check for HBCPRINC/PLAFOND fields
curl "https://apicarto.ign.fr/api/gpu/zone?lon=4.8357&lat=45.7640"
```

**What each outcome implies:**
- GPU returns zone code + document link → pipeline is wired; transcription bottleneck is confirmed as the only path to numeric rules.
- BD TOPO `HAUTEUR` is non-null → LOD1 context buildings are live today for Paris; fill `topics/buildings-lod-height.md §Spike evidence`.
- Lyon GPU response includes `HBCPRINC`/`PLAFOND` → Lyon outer communes are Tier 1 (config only); start Lyon pack immediately.
- Lyon GPU response does NOT include those fields → Lyon requires `data.grandlyon.com` as a second data source; add to §3 as a blocker and scope the integration separately.
