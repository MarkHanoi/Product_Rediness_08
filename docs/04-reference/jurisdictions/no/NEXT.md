# NEXT — Norway (`no`)

> **What this file is.** The single place recording **where we stopped on Norway, exactly why, and
> precisely what to do to go further the moment it becomes possible** — so a source/technique found
> while working on any OTHER jurisdiction can be brought straight back here.
> **Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** RESEARCH COMPLETE — pre-implementation

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

The national legal structure is fully characterised — pbl. kap. 11/12 plan taxonomy, SOSI Plan schema and code lists (arealformål, hensynssone, planstatus), TEK17 grad av utnytting method menu, pbl. § 29-4 numeric default, and the two-regime classifier (plan-governed vs. § 29-4 default). Three cities were studied (Trondheim, Oslo, Bergen); the sequencing case is clear (Trondheim first — the only city with a confirmed open planregister WFS). The central unresolved question for every Norwegian city is not "which height mechanism" (the national method is uniform) but **"has this kommune published its planregister as a live, attribute-carrying WFS?"** — a coverage-measurement problem, not a legal-regime problem. The critical structural finding is that `BestemmelseUtnyttingsgrad` — the SOSI Plan object type designed to carry the numeric utilisation value — is itself an unfinished stub in the national object register (confirmed 2026-07-24), meaning the numeric values (%-BYA, height) remain in reguleringsbestemmelser prose text for virtually all plan-governed parcels. No pack is implemented; no live GetFeature probe has been run against a real parcel.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

**Context-data resolution: 0% (endpoints identified, not live-probed at parcel level).**

Denominator for envelope: any Norwegian parcel for which (a) the regime classifier places it under a reguleringsplan, and (b) that plan's %-BYA/BRA and height values are machine-readable from a structured source. Currently zero parcels classified, therefore zero resolved.

The § 29-4 default path (no governing plan) would yield ~90% structured for that regime — but the fraction of urban parcels not covered by a plan is unknown; the denominator cannot be named until the plan-coverage classifier runs.

---

## 3 — BLOCKERS

### 3.1 — Regime classifier not built (prerequisite for ALL Norwegian cities)

- **What it is.** Before numeric sourcing can happen for any parcel, the pipeline must determine whether a reguleringsplan or kommuneplan bestemmelse governs it. If no plan governs, pbl. § 29-4 applies directly.
- **Why it blocks.** Without the classifier, there is no way to know whether to attempt a plan lookup (plan-governed path) or to return the § 29-4 numeric default (no-plan path). Shipping a plan-derived value for a § 29-4 parcel, or vice versa, is an error.
- **What would unblock it.** Cross-query: probe the kommune's planregister WFS for a plan polygon that covers the parcel's geometry. If found, plan-governed regime; if absent, § 29-4 fallback.
- **THE EXACT RESUME STEP.** For Trondheim (the only city with a confirmed WFS): fetch the Trondheim planregister WFS GetCapabilities from the Geonorge kartkatalog page (`https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6`), pull the live WFS endpoint URL, then run a GetFeature with the geometry of one Trondheim parcel and record which layers/attributes are returned.

### 3.2 — BestemmelseUtnyttingsgrad confirmed unspecified at national level

- **What it is.** The SOSI Plan object type `BestemmelseUtnyttingsgrad` — designed to carry the parcel-level numeric utilisation value — has an incomplete stub entry in the Geonorge national object register (confirmed 2026-07-24). The entry reads "Here there should have been an explanation" in Norwegian.
- **Why it blocks.** This means even where a planregister WFS is live, the numeric utilisation value is not structured in any standardised attribute — it remains in reguleringsbestemmelser prose text. The WFS path yields plan boundary, arealformål code, and planstatus; the numeric rules require text/NLP parsing.
- **What would unblock it (ascending cost).** (1) Check whether the Geonorge object register entry has since been updated; (2) pull a real Trondheim GetFeature and inspect what attributes are actually returned — the national spec may be incomplete but some kommuner may still populate a field; (3) plan a reguleringsbestemmelser NLP pipeline using the HTML/text bestemmelser access confirmed for Trondheim.
- **THE EXACT RESUME STEP.** Run the Trondheim GetFeature probe (see 3.1), then for the returned plan feature: look for any numeric field (BYA, BRA, utnyttingsgrad, høyde, gesims, mønehøyde). Record: field names present, any non-null values, and the URL/format of the linked bestemmelser document.

### 3.3 — Oslo planregister WFS not confirmed

- **What it is.** Oslo's Planinnsyn (`od2.pbe.oslo.kommune.no/kart/`) is confirmed as an interactive click-viewer. Whether a machine-readable WFS serving the same reguleringsplan geometry + bestemmelser text exists for programmatic per-parcel query is not confirmed.
- **Why it blocks.** Cannot build an Oslo data pipeline without knowing whether a WFS exists or whether a scraping/automation layer against the click-viewer is required instead.
- **What would unblock it.** Check `data.oslo.kommune.no` open-data catalogue or Geonorge kartkatalog for an Oslo planregister WFS entry analogous to Trondheim's.
- **THE EXACT RESUME STEP.**
  ```
  Search Geonorge kartkatalog: https://kartkatalog.geonorge.no/?text=planregister+oslo+kommune
  Then: check data.oslo.kommune.no CKAN for a "planregister" dataset with a WFS distribution
  ```
  Record: WFS endpoint URL if found, or confirmed-absent if not.

### 3.4 — Bergen planregister WFS not confirmed

- **What it is.** Bergen's planregister delivery endpoint was not located in this pass. The national mechanism (SOSI Plan schema, same hensynssone codes) is confirmed applicable.
- **Why it blocks.** Without the endpoint, Bergen cannot be sequenced for integration even though its ingestion code should be near-identical to Trondheim's once confirmed.
- **What would unblock it.** Search Bergen kommune's own open-data portal and Geonorge kartkatalog.
- **THE EXACT RESUME STEP.**
  ```
  Search Geonorge kartkatalog: https://kartkatalog.geonorge.no/?text=planregister+bergen+kommune
  Then: check https://open.bergen.kommune.no for a planregister dataset with WFS distribution
  ```

### 3.5 — FKB-Bygning licence gate (building footprints for commercial use)

- **What it is.** FKB-Bygning (building footprint + roof height) is free only for Norge digitalt parties (public bodies/Geovekst agreement holders). A private or commercial engine must purchase access through a reseller (Geodata, Norkart) or via a direct Kartverket agreement.
- **Why it blocks.** Cannot use FKB-Bygning as a free data source for a commercial engine without a licence. The Matrikkelen — Bygningspunkt (point per building, no footprint) is fully open as a location-only alternative.
- **What would unblock it.** Initiate a Norge digitalt or reseller application process. Check `kartverket.no` for the Norge digitalt membership/agreement form.
- **THE EXACT RESUME STEP.** Confirm entity type (public/private/commercial) → if commercial: contact Geodata or Norkart for a quote on FKB-Bygning, or initiate a Kartverket direct agreement application.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If a SOSI Plan / reguleringsplan WFS reader is built for Trondheim** → it is reusable across every Norwegian kommune that publishes on the shared schema. The schema-reuse is Norway's key structural advantage. Do NOT build a city-specific reader — build a generic SOSI Plan reader and parameterise the endpoint.
- **4.2 — If a reguleringsbestemmelser NLP/text extractor is built for any Norwegian city** → the same tool applies to all Norwegian cities (the bestemmelser format is nationally standardised). Confirm with a second-city sample before declaring it general.
- **4.3 — If the nDSM/LoD2 height pipeline is built for any other jurisdiction** → Norway's NDH is fully open and complete. The NDH adapter may need only a new tile source URL (høydedata.no), not a new pipeline.
- **4.4 — If Geonorge updates the `BestemmelseUtnyttingsgrad` object-catalog entry** (currently a stub at 2026-07-24) → re-check whether the national schema now specifies a usable attribute format. This could materially raise the structured-data rate.
- **4.5 — If Oslo confirms a machine-readable planregister WFS** → Oslo becomes the richest Norwegian city to integrate (existing per-parcel grad-av-utnytting faktaark at `od2.pbe.oslo.kommune.no`). Update `no-03/0301-oslo/NEXT.md §3.1` and raise Oslo's estimated rate.
- **4.6 — If any Norwegian kommune is found to populate structured numeric BYA/height attributes in its WFS** (i.e. actually using the `BestemmelseUtnyttingsgrad` slot with values) → note it immediately as a positive outlier and use it to calibrate the NLP-pipeline scope.
- **4.7 — If Kartverket's SePlan viewer adds a programmatic per-parcel API for adopted plans** → this would be equivalent to a national plan aggregator emerging and could raise the "plan existence + boundary" field significantly. Check Kartverket product roadmap and Geonorge news periodically.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National legal structure characterisation — `findings/NORWAY-MASTER-DATA-SOURCE-STUDY.md`
- Country-level README + city stubs — `no/README.md`, `no-03/0301-oslo/`, `no-46/4601-bergen/`, `no-50/5001-trondheim/`
- National SOURCES.md with citations for all national standards (pbl., TEK17, SOSI Plan, Matrikkelen, NDH)
- National RATE.md with field-by-field breakdown (~32%)
- SOSI Plan arealformål, hensynssone, and planstatus code tables — `README.md §1.3` — static lookup, do not re-derive
- Confirmed live endpoints: Matrikkelen Eiendomskart Teig WFS, NDH terrain WFS/WCS, Kulturminnesøk.no
- Confirmed negative: `BestemmelseUtnyttingsgrad` national object-catalog entry is an unfinished stub (2026-07-24)
- Trondheim planregister: access terms confirmed (open, no restrictions); live WFS GetCapabilities URL not yet pulled from the kartkatalog page

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| pbl. (Plan- og bygningsloven, LOV-2008-06-27-71) | Planning regime taxonomy (kap. 11/12/§29-4), legal chain | `published` | `lovdata.no/dokument/NL/lov/2008-06-27-71` |
| TEK17 §§5-1–5-7 | Grad av utnytting method definitions (BYA/%-BYA/BRA/%-BRA/MUA) | `published` | `lovdata.no/dokument/SF/forskrift/2017-06-19-840` |
| H-2300 B veileder | Grad av utnytting calculation and measurement rules; historical-method appendix | `published` | `dibk.no` (Direktoratet for byggkvalitet) |
| Rundskriv H-8/15 | § 29-4 height and setback interpretation (gesimshøyde 8 m, mønehøyde 9 m, setback formula) | `published` | `regjeringen.no` — Rundskriv H-8/15 |
| Matrikkelen — Eiendomskart Teig WFS | Parcel boundary polygons, GML, daily update | `published` — **CONFIRMED LIVE** | `https://wfs.geonorge.no/skwms1/wfs.matrikkelen-eiendomskart-teig?Service=WFS&Request=GetCapabilities` |
| NDH / høydedata.no | National LiDAR DTM/DSM, ≥2 pts/m², complete nationwide | `published` — **CONFIRMED LIVE** | `https://hoydedata.no` |
| Geonorge object register — BestemmelseUtnyttingsgrad | National schema slot for numeric utilisation value | **CONFIRMED STUB** (2026-07-24) | `https://objektkatalog.geonorge.no/Objekttype/Index/EAID_C61C5D87_F899_44e5_8FEF_AD486BCD174F` |
| Trondheim planregister — Geonorge kartkatalog | Access terms, contact, update cadence | `published` | `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6` |
| Kulturminnesøk.no | ~220,000 heritage objects, map geometry + attributes | `published` — **CONFIRMED LIVE** | `https://kulturminnesok.no` |
| Askeladden | Full legal heritage register (300,000+ localities) | `published`; professional login required | `askeladden.ra.no` |
| SEFRAK | ~515,000 pre-1900/pre-1945 buildings (separate from Askeladden) | `published` | Via Riksantikvaren WMS/WFS |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **Single national planregister WFS serving all 357 kommuner in one call:** does not exist. Geonorge "Plan2" catalogue is an index, not a merged national feature layer. Do not search for "national Norway zoning API" — budget per-kommune endpoint integration on the shared SOSI Plan schema.
- **`BestemmelseUtnyttingsgrad` as a populated structured attribute in national deliveries:** the national object-catalog entry is confirmed as an unfinished stub (2026-07-24). Do not attempt to read a numeric utilisation value from this field in a generic WFS query — probe each commune's feed individually before assuming.
- **Askeladden as a direct engine data source:** professional login required (commune/museum/consultant arrangement). Use Kulturminnesøk.no as the practical integration point.
- **FKB-Bygning footprints as a free/open source for a commercial entity:** the schema is published and free for Norge digitalt parties; private/commercial actors must purchase. Do not assume FKB-Bygning is free simply because Matrikkelen parcel geometry and NDH terrain are free.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**Run the Trondheim planregister WFS live probe. Estimated: 0.5 dev-days.**

1. Open `https://kartkatalog.geonorge.no/metadata/planregister-trondheim-kommune/21c83653-b9c2-4931-bad0-a67e4c0f6be6`
2. Find the live WFS endpoint URL in the distribution/access section
3. Run GetCapabilities: `curl "<endpoint>?SERVICE=WFS&REQUEST=GetCapabilities"` — record layer names
4. Run GetFeature with a real Trondheim parcel geometry (gnr/bnr or BBOX):
   ```bash
   curl "<endpoint>?SERVICE=WFS&REQUEST=GetFeature&TYPENAMES=<layer>&BBOX=<trondheim-parcel-bbox>&COUNT=2"
   ```
5. Record: which attributes are present (arealformål code, hensynssone code, planstatus, any numeric BYA/height field, bestemmelser URL/text)

**What each outcome implies:**
- WFS returns arealformål + planstatus attributes (non-null) → raises confidence on zone-code fields to ~60–70%; start Trondheim pack planning
- WFS returns geometry + plan ID only (no attributes) → plan WFS is boundary-only, same as Hamburg; revert to bestemmelser-text ingestion pipeline
- WFS URL not found in kartkatalog → search Trondheim kommune's own APIs page (`trondheim.kommune.no/kart`)
