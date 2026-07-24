# Rate Implementation Plan — Germany (`de`) national

**Current rate:** ~28% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~35–40% (national, scan-corpus / PDF path)
→ ~55–65% (content-vectorised-corpus path, conditional on the per-Land vectorisation fraction) ·
**Human-review ceiling:** **~65–70%** (NOT ~95% — capped by the legally-mandated ~30% §34 floor) ·
**Gap to Denmark (~96%):** ~68 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED ·
**Status:** DiPlanung/structured-attribute gate RESOLVED via live spike 2026-07-24 (`findings/GERMANY-DATA-RECON-SPIKE.md`)

---

## 1 — The ceiling: what "maximum" means here

**The DiPlanung fork is RESOLVED (live spike 2026-07-24) — and the binary was the wrong axis.** The
gating question was *"does the structured German B-Plan delivery return machine-readable GRZ/GFZ/Höhe, or
only a boundary + a PDF link?"* The measured answer: **both delivery patterns exist, side by side, and
which one you get is a property of the individual plan's digitisation depth — not of the DiPlanung
platform:**

- **Content-vectorised (inhaltlich strukturiert) plans → structured attributes, LIVE-PROVEN.** The MV
  XPlanung WFS (`demo.bauleitplaene-mv.de/ows/xplanung`, `ms:bp_baugebietsteilflaeche_polygons`) returns
  **populated** `grz` (0.2–0.9), `z` (storeys), `allgArtDerBaulNutzung`, `dachform` — Denmark-style — for
  real adopted plans (Cramonshagen, Greifswald, Neubrandenburg). So the **~55–65% ceiling is achievable**;
  the numbers exist as fields, not fiction.
- **Georeferenced (scan + boundary) plans → PDF-link-only, CONFIRMED.** Hamburg (`planrecht=…/TB3.pdf`)
  and Berlin (`scan_www=…/0100002b.pdf`) both serve plan-outline geometry + a scanned Satzung PDF and
  **no** GRZ/GFZ/Höhe attribute — schema-absent, not merely null. This is the bulk-migrated big-city
  corpus, and it holds the ~28% baseline.

**DiPlanung is a plan-authoring + participation platform, not a structured-data API** (its
`/schnittstellen` page documents XÖV process interfaces, and its wiki a DiPlan REST *process* endpoint —
neither is a GRZ/GFZ tap). Plans authored/re-vectorised in it *are* stored as content-model XPlanGML, so
DiPlanung raises the ceiling **prospectively**; it does not retroactively structure the scanned corpus.

**So the single gating action is no longer "probe DiPlanung" — it is: measure the *content-vectorised
fraction* of the in-force B-Plan corpus, per Land / per city.** That fraction multiplies the achievable
ceiling: a Land whose corpus is largely content-vectorised (MV-style) approaches ~55–65%; a city serving a
scanned corpus (Hamburg, Berlin) stays at the ~35–40% PDF-transcription ceiling until its plans are either
re-vectorised (an authority action) or OCR-transcribed (Engine 2, behind the L-449 gate).

> **Metric-definition correction (carry into `RATE.md`):** the German density envelope is **GRZ + Z
> (Vollgeschosse / storeys)**, *not* GFZ + height in metres. In the MV sample GRZ populated on ~33% of
> features and storeys on ~30%, but GFZ on ~5% and metric height on **0/162**. A rate metric that
> demands "density + **height in metres**" under-counts Germany — count `Z` as a valid height determinant.

**The permanent §34 floor (~30%):** unlike France's PDF ceiling (which CNIG SRU could eventually
fix), Germany's §34 fraction is a legal design choice, not a data gap. BauGB §34 deliberately
provides no numeric envelope — the standard is the character of the surrounding area, assessed
case-by-case. A system that fills a number for §34 parcels is stating a rule that does not exist.
This floor is permanent absent a legislative change to BauGB.

**Denmark comparison (~96%):** Denmark's Plandata delivers GRZ/GFZ/height as structured fields per
plan polygon. Germany's XPlanGML schema contains those same field names — the infrastructure is
architecturally equivalent. The gap is that German municipalities were never required to populate
those fields. DiPlanung is the mechanism that could close this gap — it is Germany's Plandata
equivalent, if implemented with structured attributes rather than PDF links.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — Hamburg and Berlin XPlanung WFS confirmed live; GRZ/GFZ/Höhe confirmed absent from both schemas; BayBO Art. 6 setback confirmed; four-regime taxonomy characterised; RATE.md written | Honest baseline: ~28% confirmed; XPlanung structural gap characterised; DiPlanung as the pivotal unknown identified | — → ~28% | Complete | VERIFIED | UNASSIGNED |
| **1** | **DiPlanung / structured-attribute gate (RESOLVED):** probed `diplanung.de/schnittstellen` (process API, not a data tap); Hamburg + Berlin XPlanung WFS (GRZ/GFZ/Höhe schema-absent, PDF-link-only); MV XPlanung WFS (`grz`/`z` **populated** — structured path proven live) | The pivotal gate — resolved: the path is **per-plan digitisation-depth-dependent**, not platform-dependent. Structured ceiling (~55–65%) proven *achievable*; big-city scan corpus stays PDF-bound | ~28% → ~28% (evidence only) | Low — one spike | **VERIFIED** (`findings/GERMANY-DATA-RECON-SPIKE.md`, 2026-07-24) | — |
| **1b** | **NEW gate — content-vectorised-fraction measurement:** for each target Land/city, query the XPlanung WFS for whether it serves `bp_baugebietsteilflaeche` object layers with populated `grz`/`gfz`/`z` (MV-style) vs plan-outline + scan only (HH/BE-style); count the fraction | Replaces the old single DiPlanung probe — this fraction multiplies the achievable ceiling per Land; required before committing per-city dev-day budgets | ~28% → ~28% (measurement only) | Low — per-Land WFS probe | NOT STARTED | UNASSIGNED |
| **2** | **§34 fraction measurement:** grid-sample probe for Hamburg and Berlin bboxes — classify each sample point as §30 B-Plan / §34 / §35 using XPlanung WFS presence/absence (method in §3.5) | Converts the §34 floor from an assumption (~30% national) to a measurement per city; required before committing per-city dev-day budgets | ~28% → ~28% (measurement only) | Medium — grid query | NOT STARTED | UNASSIGNED |
| **3** | Hamburg: read LBO formula (HBauO §6) via headless browser or PDF; Berlin: read BauO Bln §6; wire per-Land setback config values alongside confirmed BayBO Art. 6 | Completes the Abstandsflächen formula set for all three studied cities — the one structured field that is a formula, not a PDF attribute | ~28% → ~30% | Medium | NOT STARTED | UNASSIGNED |
| **4 (structured path)** | *For a Land/city whose corpus is content-vectorised (Phase 1b positive, MV-style):* wire the XPlanung-WFS `grz`/`gfz`/`z` ingestion (the MV probe is the reference query); implement the four-regime classifier (§30 / §34 / §35) | Reference city for structured ingestion; regime classifier reused everywhere | ~30% → ~42–48% (city-weighted; blended national lower) | Medium — ~10–12 dev-days | NOT STARTED | UNASSIGNED |
| **4 (PDF / scan path)** | *For a scan-corpus city (Hamburg, Berlin — Phase 1b negative):* download and text-layer-check one Satzung PDF (HH `TB3.pdf`, BE `0100002b.pdf` confirmed reachable); confirm OCR viability; scope the Engine-2 Nutzungsschablone-transcription programme behind the L-449 gate | Determines whether the Barcelona-style OCR pipeline is viable for the German scan corpus | ~30% → ~30% (viability check only) | Low | NOT STARTED | UNASSIGNED |
| **5** | Munich: find WFS/DiPlanung endpoint; implement regime classifier; wire structured or scan path per Phase 1b result | Second German city; reuses Phase 4 classifier; resolves DiPlanung October 2026 migration risk | ~42–48% → ~47–53% (blended) | Medium — ~12–15 dev-days | NOT STARTED | UNASSIGNED |
| **6** | Berlin: implement four-regime classifier (modern B-Plan + 1958/60 Baunutzungsplan legacy layer + §34 + §35); source Baustufen-translation table; wire structured or scan path | Most complex German city — adds Baunutzungsplan layer and §34 East-Berlin carve-out to the classifier built in Phases 4–5. NB: Berlin's own corpus is scan-backed (confirmed `scan_www` PDFs) → Engine-2 path unless re-vectorised | ~47–53% → ~55–65% (content-vectorised-corpus ceiling) | High — ~30–35 dev-days | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) §34 is a permanent structural floor — ~30% of Germany.** Denmark has no equivalent
"discretionary character of neighbourhood" regime covering a third of its parcels. Every
German implementation plan must account for this: the correct output for §34 parcels is not a
fill but a legally-grounded, positively-worded refusal. The gap to Denmark is partially
irresolvable — not by data engineering, and not by DiPlanung — because §34 BauGB deliberately
provides no numeric standard.

**(b) XPlanGML populated ≠ XPlanung compliant — CONFIRMED, and now precisely characterised.** Germany's
legal mandate (IT-Planungsrat 2017, transition closed 2023) requires the geometry; it does not require
GRZ/GFZ/Höhe to be populated. The 2026-07-24 spike measured both faces: Hamburg's and Berlin's migrations
delivered geometry + a scanned-Satzung PDF link and **no** numeric attribute (schema-absent), while MV's
content-vectorised service delivers populated `grz`/`z`. So a municipality can be fully XPlanung-compliant
with either. DiPlanung does not *enforce* numeric-field population — plans authored in it are
content-model XPlanGML, but the legacy scanned corpus is untouched. **The gap is therefore real and
measurable per Land as the content-vectorised fraction (Phase 1b), not a binary platform switch.**

**(c) 16 Länder, 16 ALKIS licence regimes, 16 XPlanung delivery platforms.** Denmark has one
Plandata. Germany has 16 separate access points sharing one data model. Building a national
German pipeline requires 16 separate licence/access integrations — confirmed open for NRW and
Sachsen-Anhalt; partially confirmed for Berlin/Brandenburg; unknown for Bavaria; fee-based
suspected for others. This is not an insurmountable engineering problem, but it is a sustained
operations commitment, not a one-time build.

**(d) Berlin's Baunutzungsplan and voidance risk.** Berlin's 1958/60 legacy plan covers large
parts of West Berlin using pre-BauNVO "Baustufen" grading. OVG Berlin-Brandenburg 2020 established
that figures from this plan can be voided as *funktionslos* without warning. A Baunutzungsplan-
derived value can never ship above `corroborated, voidance-risk` confidence — permanently below the
`published` / `certified` tier achievable from a current B-Plan. This imposes a quality ceiling on
West Berlin parcels regardless of the DiPlanung outcome.

### 3.5 — Measurement recipes (Phase 1b content-vectorised fraction; Phase 2 §34 fraction)

Both are *measurements*, not builds — each converts an assumption into a number and neither moves the
rate until a pack ships. Both reuse the same XPlanung WFS endpoints already confirmed live in the spike.

**(i) Content-vectorised-fraction recipe (Phase 1b) — "how much of this Land's corpus carries the
numbers as fields?"** For the target Land's XPlanung WFS:
1. `GetCapabilities` → does the service expose per-object-class layers (`bp_baugebietsteilflaeche_*`,
   `bp_gebaeudeflaeche_*`, …, MV-style) or only a plan-outline + scan layer (`hh_hh_festgestellt` /
   `b_bp_fs`, HH/BE-style)? Object-class layers are the necessary condition for structured attributes.
2. If object-class layers exist, `DescribeFeatureType` on `bp_baugebietsteilflaeche` → confirm
   `grz`/`gfz`/`z`/`hoehenangabe` elements are in the schema.
3. `GetFeature` a sample (count≈300) → count the fraction of features with a **populated** `grz`/`z`.
   The MV baseline: **~33% GRZ, ~30% Z, ~5% GFZ, 0% metric height** across 162 features.
4. That populated fraction × the §30 fraction (from Phase 2) = the Land's structured-numeric ceiling.

**(ii) §34-fraction recipe (Phase 2) — "how much of this city has no number by law?"** Take a ~300 m
lattice grid over the municipal bbox. For each point, query the XPlanung `festgesetzt` B-Plan layer
(`GetFeature`, point-in-polygon):
- **B-Plan polygon covers the point** → §30 (a numeric envelope may exist — subject to (i)).
- **No B-Plan, point inside the built-up `Ortsteil` fabric** → §34 (no numeric envelope — the correct
  output is a cited refusal). *(Berlin: also test the FIS-Broker Baunutzungsplan legacy layer before
  concluding §34 — a covering Baustufe means regime (b), voidance-risk, not §34.)*
- **No B-Plan, outside the built-up fabric** → §35 (presumptively not buildable — refusal).

Report the three fractions per city. This is the same method as Barcelona's `probe-bcn-clau-distribution`
grid. The §34 fraction directly sets the *unfillable-by-law* share of each city's denominator — and thus
how far below the ~65–70% national ceiling that city sits.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (DiPlanung / structured-attribute gate) is RESOLVED** (spike 2026-07-24). The gating
  action for a *specific* city is now **Phase 1b** — measure whether that Land's WFS serves the
  content-vectorised object model (structured ingestion, ~10–12 d) or a scan corpus (Engine-2 OCR
  transcription, higher and throughput-bound). Do not schedule a city's implementation before its
  Phase 1b returns.
- **Phase 1b + Phase 2 are cheap, independent measurements** that can run in parallel on the already-
  confirmed-live XPlanung WFS endpoints (HH `geodienste.hamburg.de/HH_WFS_Bebauungsplaene`, BE
  `gdi.berlin.de/services/wfs/bplan`, MV `demo.bauleitplaene-mv.de/ows/xplanung`).
- **Phase 3 (setback formulas) is independent** of Phases 1–2 — BayBO Art. 6 is already confirmed;
  HBauO §6 and BauO Bln §6 are a headless-browser or PDF-fetch task.
- **Phase 4 (Hamburg) must precede Phase 5 (Munich) and Phase 6 (Berlin)** — Hamburg is the
  reference implementation. The regime classifier and DiPlanung ingestion pattern built for Hamburg
  are reused for Munich and Berlin, reducing their costs.
- **Phase 6 (Berlin) must follow Phase 4–5** — Berlin adds the Baunutzungsplan legacy layer and
  §34 East-Berlin carve-out on top of the classifier built for Hamburg/Munich. Berlin is not a
  starting point; it is the terminal city.

**Cross-jurisdiction reuse:**
- The BauNVO §17 table is a one-time national lookup, shared across all 16 Länder — built once, used
  everywhere. **Store it as *Orientierungswerte* (orientation values for upper limits), not binding
  ceilings** (spike §6), and use it only as a sanity check, never a parcel rule.
- **The four-regime classifier (§30 / §34 / §35 + Berlin §173(3)) is Germany's single most reusable
  asset — build it ONCE, reuse it in every German city.** It is the *prerequisite* step (README §1.2,
  master study §A.1): no numeric sourcing runs until a parcel's regime is fixed. Its core is the
  XPlanung-WFS point-in-polygon presence/absence check — **identical machinery in Hamburg, Berlin, Munich
  and every other Land** (only the endpoint URL and layer name differ). Hamburg builds it (Phase 4);
  Munich reuses it unchanged (Phase 5, adding only the §34-fraction measurement); Berlin extends it with
  one extra layer test (the FIS-Broker Baunutzungsplan legacy layer → regime (b)) (Phase 6). The
  classifier is what makes the §34 refusal *automatic and correct* rather than a fabricated `null`-as-gap.
- The **content-vectorised-vs-scan detector** (Phase 1b recipe, §3.5(i)) is likewise one probe reused per
  Land — it decides, before any dev-day is spent, whether that Land takes the structured-ingestion path
  or the Engine-2 OCR path.
- The `setback` (height-proportional) `GeometricRule` kind is shared across all 16 Länder;
  only the multiplier/minimum is a per-Land config value. Build the kind once; configure per Land.
- The L-449 human-verification gate (Satzung cross-check before shipping a DiPlanung-derived value
  above `corroborated`) is the same gate used for every sourced jurisdiction.
- LoD2-DE (where open) delivers building heights in CityGML LoD2 — the same format as Barcelona's
  context buildings and France's LiDAR-derived LOD2. The ingestion pipeline can share the CityGML
  reader.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · BauGB §§30/34/35 · BauNVO (§§2–11 zone taxonomy; §17 density
orientation values; §20 floor-area definition) · IT-Planungsrat resolution 5 Oct 2017 (XPlanung mandate) ·
XPlanGML v6.1 (exchange format schema) · Per-Land LBO (Abstandsflächen formula; read before each
city). Country-agnostic method + 5-engine framing: `COUNTRY-DATA-STRATEGY.md`.

---

## Appendix A — Live-probe evidence (2026-07-24)

All asserted on Content-Type + response body; no value below is inferred. Full transcript:
`findings/GERMANY-DATA-RECON-SPIKE.md`.

| Endpoint · query | Result (verbatim sample) | What it proves |
|---|---|---|
| `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` · `DescribeFeatureType` + `GetFeature` `app:hh_hh_festgestellt` | schema = `geltendes_planrecht, planrecht, begruendung, feststellungsdatum, geom`; feature `geltendes_planrecht='TB3'`, `planrecht='https://daten-hamburg.de/.../bplan/TB3.pdf'`, `feststellungsdatum='11.10.1949'` | Hamburg XPlanung WFS is **PDF-link-only** — `planrecht` is literally a PDF URL; **GRZ/GFZ/Höhe schema-absent, not null**. Confirms the ~28% baseline. Georeferenced (scan) corpus. |
| `gdi.berlin.de/services/wfs/bplan` · `GetFeature` `fis:b_bp_fs` (GeoJSON) | `planname='1-2b'`, `planartname='Qualifizierter B-Plan'`, `bp_rechtsstand='In Kraft getreten'`, `scan_www='https://mitte.gis-broker.de/bplaene/0100002b.pdf'`, `inhalt='Kerngebiet, Straßenverkehrsfläche'`; `AccessConstraints='keine Zugriffsbeschränkungen'`; `numberMatched=2839` | Berlin XPlanung WFS is **PDF-link-only + open**; use-type recoverable from `inhalt` prose (`Kerngebiet`→`MK`), **GRZ/GFZ/Höhe absent**. Confirms baseline. Georeferenced corpus. |
| `demo.bauleitplaene-mv.de/ows/xplanung` · `GetFeature` `ms:bp_baugebietsteilflaeche_polygons` | real plans (Cramonshagen, Greifswald, Neubrandenburg…): `grz='0.4'`, `z='1'`, `allgartderbaulnutzung_text='WohnBauflaeche'`, `dachform_text='Satteldach…'`. Across 162 features: **GRZ populated 54 (~33%, 0.2–0.9), Z 48 (~30%), GFZ 8 (~5%), metric height 0** | **The structured path is LIVE-PROVEN.** A German XPlanung WFS delivers populated GRZ + storeys + BauNVO use + roof-form as fields — Denmark-style — for content-vectorised plans. Resolves the ~55–65% ceiling as *achievable*. German density = GRZ+Z, not GFZ+metres. |
| `diplanung.de/schnittstellen/` + `wiki.diplanung.de` | process interfaces only (XPlanverfahren, XBeteiligung); a DiPlan REST *process* API; **no** GRZ/GFZ data endpoint; contact `diplanung@bsw.hamburg.de` | DiPlanung is a **plan-authoring + participation platform, not a structured-data tap.** The data tap is the per-Land XPlanung WFS. "Probe DiPlanung for GRZ" was the wrong probe. |
| `gesetze-im-internet.de/baunvo/__17.html` | heading `'§ 17 Orientierungswerte für die Bestimmung des Maßes der baulichen Nutzung'`; `MU` (Urbane Gebiete) GRZ **0,8** / GFZ 3,0; full table captured | §17 is national + structured but is **Orientierungswerte** (orientation values for upper limits), not binding ceilings. **Doc catch:** README §1.3 mislabels these as ceilings and gives `MU` GRZ 0.60 — should be **0.80**. |
| `opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | HTTP 200, `application/json` product index (open, free) | A per-Land **LoD2-DE building-height source is open and reachable** (NRW), independent of the INSPIRE-restricted ZSHH national feed. Confirms trip-wire 4.3. |

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **France** `../fr/` (two-denominator honesty
sibling) · **Hamburg** `de-hh/02000-hamburg/` (reference city — start here). Country-agnostic method +
5-engine framing: `COUNTRY-DATA-STRATEGY.md`. Evidence: `findings/GERMANY-DATA-RECON-SPIKE.md`.
Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
