# NEXT — Rome (058091, IT-62 Lazio)

> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no live probes run; no pack started

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. Rome's PRG (adopted 2008, Roma Capitale) classifies
land by historic-fabric typology (`tessuto`) inside four broad sistemi — Città Storica, Città
Consolidata, Città da Ristrutturare, Città della Trasformazione — rather than by DM 1444 zone
letters. A direct/indirect intervention classifier must be built before any numeric rule can be
applied. The Carta per la Qualità precedence question (whether tessuto rules subordinate the Carta,
or vice versa) is legally contested and unresolved, requiring a primary-text read of the current
consolidated NTA before any rule is cited. No live probe has been run against any Rome endpoint —
not the Catasto WFS, not Roma Capitale's SIT, not the PRG WFS (if one exists). The PRG NTA text
has not been read as a primary source. Estimate: ~25–30 dev-days before certification for Città
Storica + Città Consolidata T1–T3 dominant mechanisms.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Full-envelope resolution: 0% (not started).** Denominator: Rome parcels in the Città Storica or
Città Consolidata under direct intervention, with tessuto type confirmed and applicable NTA article
cited. Both numerator and denominator are unknown — the direct/indirect classifier must be built
and the tessuto engine kind implemented before either can be measured. The Città da Ristrutturare
and Città della Trasformazione are correct refusals (indirect intervention) — they are counted in
the denominator but contribute to the refusal rate, not the fill rate.

---

## 3 — BLOCKERS (ordered by dependency)

### B1 — Roma Capitale SIT/PRG WFS not probed (gate for all zone classification work)

- **What it is.** Rome's PRG sistema/tessuto classification may be exposed as a WFS queryable per
  parcel coordinate (through Roma Capitale's SIT at `sit.comune.roma.it` or the regional geoportal),
  or only as map-viewer PDFs. This is unconfirmed.
- **Why it blocks.** Without a confirmed WFS, tessuto classification for a given parcel requires
  navigating the PRG tavole as scanned map plates — a PDF digitisation problem, not an API
  integration. The answer to this probe determines whether the engine kind is immediately buildable
  or requires a preliminary digitisation step.
- **What would unblock it.** Run a probe of Roma Capitale's SIT portal for WFS capabilities.
- **THE EXACT RESUME STEP.**
  ```bash
  # Step 1: Roma Capitale SIT — check for PRG WFS
  curl "https://sit.comune.roma.it/arcgis/rest/services?f=json" 2>/dev/null | head -40
  # or:
  curl "https://sit.comune.roma.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" 2>/dev/null | grep -i 'prg\|tessuto\|zona\|urb' | head -20

  # Step 2: Lazio geoportal
  curl "https://geoportale.regione.lazio.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" 2>/dev/null | grep -i 'prg\|tessuto\|zona' | head -20

  # Step 3: GetFeature — central Rome parcel (~41.8967, 12.4822 — near Pantheon, Città Storica)
  # (if WFS found in steps 1-2)
  ```

### B2 — PRG NTA consolidated text not read (gate for all numeric rule citations)

- **What it is.** Rome's PRG 2008 NTA (Norme Tecniche di Attuazione) is the primary legal text.
  It has been amended since 2008 (amendments are contested). Neither the current consolidated text
  nor the specific articles governing Città Storica tessuto rules, Città Consolidata T1/T2/T3
  typology rules, nor the Carta per la Qualità precedence have been read.
- **Why it blocks.** No rule value can be shipped at `published` confidence without reading the
  primary text. Additionally, the Carta per la Qualità precedence direction is a live legal-currency
  risk — shipping a tessuto-rule answer without confirming precedence is the Italian analogue of
  shipping a Marseille answer without confirming the graphic-primacy direction.
- **What would unblock it.** Locate and read the current consolidated PRG NTA from Roma Capitale's
  official urbanistica portal.
- **THE EXACT RESUME STEP.** Navigate to `www.comune.roma.it` → Urbanistica → Piano Regolatore
  Generale → Norme Tecniche di Attuazione. Find the consolidated text (with amendments). Read:
  - Art. governing sistema classification (Storica/Consolidata/Ristrutturare/Trasformazione)
  - Art. governing Città Storica tessuto rules (identify each tessuto type and its numeric parameters)
  - Art. governing Città Consolidata T1/T2/T3 typology rules (height, coverage, setback)
  - Art. governing Carta per la Qualità precedence (which wins in case of conflict)
  - Art. governing direct vs indirect intervention classification

### B3 — Direct/indirect intervention classifier not built

- **What it is.** Whether a parcel falls under direct or indirect intervention is the first
  classification step — equivalent to Germany's regime classifier. Without it, no numeric
  sourcing can begin.
- **Why it blocks.** The Città da Ristrutturare and Città della Trasformazione are correct refusals
  under indirect intervention. The fraction of Rome parcels in those sistemi determines the
  denominator.
- **What would unblock it.** Build a per-parcel PRG sistema lookup (from WFS or digitised tavole)
  and apply the direct/indirect rule from the NTA.
- **THE EXACT RESUME STEP.** After B1 (WFS confirmed) and B2 (NTA articles read): implement the
  classifier as a spatial lookup returning: Storica / Consolidata-direct / Consolidata-indirect /
  Ristrutturare / Trasformazione.

### B4 — Carta per la Qualità machine-readability unconfirmed

- **What it is.** The Carta catalogues every archaeological, monumental, and fabric element in the
  Città Consolidata/Ristrutturare/Trasformazione. Whether it is exposed as a GIS layer (with
  machine-readable element identifiers and applicable rules) or only as a web viewer / scanned
  catalogue is unconfirmed.
- **Why it blocks.** If machine-readable: the Carta can be integrated into the parcel probe
  pipeline as a secondary overlay. If not: the Carta check requires a human lookup per parcel.
- **THE EXACT RESUME STEP.** Probe Roma Capitale SIT for a "Carta per la Qualità" WFS/WMS layer.
  Check `sit.comune.roma.it` and `geoportale.regione.lazio.it`.

### B5 — Lazio building-height GIS layer unconfirmed

- **What it is.** No Lazio-wide building-height layer equivalent to ARPA Piemonte's Edifici 3D
  has been identified.
- **THE EXACT RESUME STEP.**
  ```bash
  curl "https://geoportale.regione.lazio.it/geoserver/wfs\
  ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'edifici\|altez\|3d\|lod\|quota'
  # also check dati.lazio.it CKAN for "edifici 3d" or "modello 3d"
  ```

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If Roma Capitale SIT exposes a PRG WFS with tessuto classification per parcel** → Rome
  zone identification becomes an API call. Update B1 as resolved; the engine kind is immediately
  buildable once the NTA is read.
- **4.2 — If the PRG NTA is found to have been significantly amended post-2008** → update the
  legal-currency risk assessment in `sources/SOURCES.md §A` and flag affected zones as
  `corroborated, subject to amendment risk`. Do not cite a pre-amendment NTA version as `published`.
- **4.3 — If the Carta per la Qualità precedence question is resolved definitively** → update
  `sources/SOURCES.md §A` with the NTA article and confidence level. If tessuto rules prevail:
  simplifies the engine (Carta is a secondary advisory overlay). If Carta prevails: adds a new
  precedence-resolution step (analogous to Marseille graphic-primacy).
- **4.4 — If Barcelona's volumetria-específica refusal vocabulary is finalized** → port to Rome's
  Città da Ristrutturare / Città della Trasformazione refusal language. The structural analogy is
  exact: indirect intervention = no numeric envelope until executive plan exists.
- **4.5 — If Germany's §34 refusal vocabulary is finalized** → same port, same structural analogy.
- **4.6 — If a Lazio-wide building-height GIS layer is found** → Rome gains context-height data.
  Update `../../../topics/buildings-lod-height.md` with the source and endpoint.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- Mechanism characterisation — `../../findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §B.2`
- Tessuto/sistema taxonomy documented — `README.md §1`
- Direct/indirect intervention split documented — `README.md §1`
- Carta per la Qualità precedence risk documented — `README.md §1`
- National Catasto WFS confirmed as parcel geometry source — `../../sources/SOURCES.md §A`

---

## 6 — VERIFIED SOURCES

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` | Parcel geometry | VERIFIED-LEAD (research; not live-probed) | `cp:CadastralParcel` — see `../../sources/SOURCES.md` |
| Roma Capitale PRG portal (`comune.roma.it/urbanistica`) | PRG NTA text + tavole | VERIFIED-LEAD (portal confirmed; NTA not read) | Navigate → PRG → NTA consolidated |
| Roma Capitale SIT (`sit.comune.roma.it`) | PRG sistema/tessuto zone polygon per parcel (WFS queryability TBD) | VERIFIED-LEAD (portal confirmed; WFS queryability TBD) | See B1 probe |
| SITAP `sitap.beniculturali.it` | Landscape constraints (informational) | VERIFIED-LEAD (web-GIS confirmed; WFS TBD) | High heritage density in Rome's centro storico and archaeological areas |
| Vincoli in Rete `vincoliinrete.beniculturali.it` | Listed buildings + archaeology | VERIFIED-LEAD | Rome: very high density of listed assets |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **DM 1444 zone letters as operative key for Rome:** confirmed in research that Rome's PRG 2008
  classifies by tessuto typology, not by A/B/C zone letters. Querying "which DM 1444 zone applies"
  will not return an operative rule for any Rome parcel. Do not attempt a DM 1444-keyed lookup.
- **National Italian zoning WFS for Rome:** confirmed absent at national level (see country-level
  NEXT.md). Lazio-level WFS status is unprobed; check `geoportale.regione.lazio.it` first.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Roma Capitale SIT WFS probe (B1). Estimated: 0.5 dev-days.**

This single probe:
1. Confirms whether tessuto classification is an API call (raises Rome from unimplemented to ~10–15% immediately) or a digitisation problem.
2. Sets the realistic dev-day estimate with much lower uncertainty than the current ~25–30 range.
3. Confirms whether the Carta per la Qualità is machine-readable as a layer (B4).

If the SIT WFS probe succeeds, the next step is reading the PRG NTA (B2) — the NTA read is the
gate for all numeric-rule citations and for resolving the Carta precedence question.
