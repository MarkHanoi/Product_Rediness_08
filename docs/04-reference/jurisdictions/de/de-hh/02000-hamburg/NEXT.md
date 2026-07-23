# NEXT — Hamburg (02000, DE-HH)

> **What this file is.** Where we stopped on Hamburg, exactly why, and precisely what to do
> to go further the moment it becomes possible.
> **Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD

---

## 1 — WHERE WE STOPPED (the one-paragraph truth)

Research is complete at the mechanism level. Hamburg is the strongest German city structurally — city-state, full XPlanung migration (2018), no historic-plan legacy layer (unlike Berlin), assumed-small §34 fraction. The entire cost and quality of the Hamburg pack depends on one open question: whether GRZ/GFZ/Höhe attributes are **populated** in the Hamburg XPlanGML delivery, or whether the XPlanGML files carry only geometry with the numeric rules remaining in the signed Satzung PDFs. No live probe has been run. No rule pack has started. The pre-1960 plan citation-preservation question is a secondary gate that applies to about a third of Hamburg's plan stock.

---

## 2 — THE NUMBER (what % of clicks, which denominator, and why)

**Zoning full-envelope resolution: 0% (not started).**

Denominator: Hamburg parcels inside a modern BauGB B-Plan boundary with non-null GRZ/GFZ/Höhe attributes in XPlanGML. **This denominator is itself unknown until the live probe below runs.** If XPlanGML attributes are null, the denominator is zero regardless of B-Plan coverage.

---

## 3 — BLOCKERS

### ~~B1 — XPlanGML structured-field completeness unknown~~ **RESOLVED 2026-07-23 — NEGATIVE**

**Outcome: The Hamburg XPlanung WFS does NOT expose GRZ, GFZ, or height attributes. Hamburg packs require PDF transcription. Estimate: ~18–20 dev-days (upper estimate confirmed).**

Live probe results 2026-07-23:
- WFS endpoint `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — HTTP 200, open (Datenlizenz Deutschland 2.0, no access restrictions).
- Two feature types: `app:hh_hh_festgestellt` (finalized plans), `app:prosin_imverfahren` (in-progress plans).
- `app:hh_hh_festgestellt` schema (DescribeFeatureType): `geltendes_planrecht` (plan ID), `planrecht` (PDF URL), `begruendung`, `feststellungsdatum`, `geom`. **No GRZ, no GFZ, no Höhe, no XPlanGML zone attributes.**
- Sample feature: plan "TB3", festgestellt 11.10.1949, PDF at `daten-hamburg.de/.../bplan/TB3.pdf` (200 OK, 581 KB PDF).
- Conclusion: the public WFS is a boundary-polygon + PDF-link service. XPlanGML attributes (if they exist) are not exposed through this endpoint. Structured zoning parameters are in the PDFs only.

**Impact on Hamburg pack estimate:** raised from ~10–12 dev-days to ~18–20 dev-days (PDF transcription path).

**Remaining path for Hamburg:**
1. Download sample B-Plan PDFs via `planrecht` URL
2. Assess whether PDFs are machine-readable (structured) or scanned raster images
3. If structured PDF: build a PDF → GRZ/GFZ/Höhe extractor (~5 additional dev-days)
4. If scanned raster: OCR pipeline required (~10 additional dev-days)

### B2 — Pre-1960 Hamburg-law plan citation preservation unconfirmed

- **What it is.** ~900 Hamburg-law plans (pre-1960, under Hamburg's own older building law, not BauGB) were migrated into XPlanGML. Whether the XPlanGML record preserves the original Hamburg-law citation (needed for the signature gate) or only the derived numeric value is not confirmed.
- **Why it blocks.** Without the original citation, any value derived from a pre-1960 plan can only be shipped as `corroborated`, not `published` — and potentially with a voidance-risk caveat analogous to Berlin's Baunutzungsplan.
- **What would unblock it.** Inspect a fetched XPlanGML file for a pre-1960 plan: check the `rechtsstand`, `texte`, or equivalent attribute for a legal citation back to the Hamburg ordinance.
- **THE EXACT RESUME STEP.** After B1 probe runs: identify a returned B-Plan that has `planArt` = pre-1960 Hamburg law (look for plan designations predating 1960 or non-BauGB `planungszeichenID`), then fetch its full GML representation and read the `rechtsstand`/`texte` fields.

### B3 — HBauO Abstandsflächen multiplier not read

- **What it is.** Hamburg's Hamburgische Bauordnung (HBauO) §6 sets the height-proportional setback multiplier and minimum distance. These values are needed before authoring the setback component of any Hamburg pack.
- **Why it blocks.** Cannot author a `setback`-kind rule without the Hamburg-specific multiplier.
- **What would unblock it.** Read HBauO §6 primary text.
- **THE EXACT RESUME STEP.** `curl "https://www.landesrecht-hamburg.de/bsha/document/jlr-BauOHA2018rahmen"` — navigate to §6 (Abstandsflächen). Record: multiplier (expected ~0.4H), minimum absolute distance (expected ~3 m), any special rules for Hamburg Altstadt.

### B4 — §34 coverage fraction not measured

- **What it is.** The fraction of Hamburg parcels under §34 (no numeric envelope) is assumed small but not measured.
- **Why it blocks.** Unmeasured assumption means the "% of clicks with a full envelope" denominator is inaccurate.
- **What would unblock it.** Grid-sample probe over Hamburg bbox, classifying each point as B-Plan / §34 / §35 / water.
- **THE EXACT RESUME STEP.** After B1 probe confirms the Hamburg XPlanung WFS endpoint and layer name: take a ~300 m lattice grid over the Hamburg municipal bbox, run `GetFeature` for each grid point against the B-Plan polygon layer, count the fraction of points with B-Plan coverage vs not. Expected result: >90% B-Plan coverage, but confirm the number.

---

## 4 — TRIP-WIRES (if you see X elsewhere, come back HERE and do Y)

- **4.1 — If an XPlanGML GRZ/GFZ/height reader is built for any German city** → the same reader serves Hamburg with different input tiles. Reuse before rebuilding.
- **4.2 — If Hamburg LGV publishes new open geodata (LoD2, ALKIS WFS)** → update `sources/SOURCES.md §A`; confirm licence terms before integrating.
- **4.3 — If any Hamburg B-Plan is found to carry a conflicting value between the XPlanGML record and the signed Satzung PDF** → treat the Satzung as the binding source (signature gate); add a note to §7 DEAD ENDS with the specific plan number.
- **4.4 — If the pre-1960 citation-preservation probe (B2) finds that XPlanGML drops the original legal citation** → all 900 pre-1960 plan-derived values must carry the `corroborated, voidance-risk` caveat (same as Berlin Baunutzungsplan). Update README §1 Legal-structure trap and this file §3.

---

## 5 — WHAT IS ALREADY BUILT (do not redo)

- National XPlanung standard characterisation — `../../findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md`
- BauNVO §17 ceiling table — `../../README.md §1.3` — static lookup, do not re-derive
- Country-level SOURCES.md with all federal legal citations — `../../sources/SOURCES.md`

---

## 6 — VERIFIED SOURCES (endpoint · what it answers · confidence tier · the exact query)

| Source | Answers | Tier | Exact query / note |
|---|---|---|---|
| Hamburg LGV XPlanung WFS | B-Plan polygon coverage + XPlanGML attributes (GRZ, GFZ, height) | VERIFIED-LEAD (not live-probed) | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — see B1 probe command |
| Hamburg Transparenzportal | Open datasets incl. potential ALKIS parcel WFS, LoD2 tiles | VERIFIED-LEAD | `transparenzportal.hamburg.de` |
| HBauO (Hamburgische Bauordnung) | §6 Abstandsflächen multiplier and minimum | VERIFIED-LEAD (not read) | `landesrecht-hamburg.de/bsha` → search HBauO §6 |
| BauGB §§30/34/35 | Regime taxonomy | `published` | `gesetze-im-internet.de/bbaug/` |
| BauNVO §17 | Zone-type density ceilings | `published` | `gesetze-im-internet.de/baunutzungsv/__17.html` |

---

## 7 — DEAD ENDS (measured negatives — do NOT re-run hoping)

- **ZSHH national LoD2 gateway as a free API for Hamburg:** INSPIRE Art. 13(1)(e) restricted — do not attempt. Go to Hamburg LGV / Transparenzportal directly for LoD2 tiles.
- **Hamburg WFS as a source of GRZ/GFZ/Höhe attributes:** `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` is a boundary-polygon + PDF-link service. Do NOT attempt to read GRZ/GFZ/Höhe from WFS GetFeature responses — they are not there. Source from PDFs only.
- **`app:hh_bp_bereiche` layer name:** returned "Feature type with name 'hh_bp_bereiche' is not served by this WFS" — this layer does not exist. Correct layer names are `app:hh_hh_festgestellt` and `app:prosin_imverfahren`.
- **Hamburg ALKIS WFS at `geodienste.hamburg.de/HH_WFS_ALKIS`:** HTTP 404 (2026-07-23). Path has changed or endpoint requires authentication. Use Transparenzportal for current ALKIS endpoint.

---

## 8 — THE SMALLEST NEXT STEP that moves the number, and its cost

**~~Run the Hamburg XPlanGML probe (B1)~~ — DONE 2026-07-23. B1 resolved as NEGATIVE.**

**New smallest next step: assess Hamburg B-Plan PDF structure. Estimated: 1 dev-day.**

1. Download 3–5 sample B-Plan PDFs via `planrecht` field URLs (e.g. `daten-hamburg.de/.../bplan/TB3.pdf`)
2. Open each PDF: check whether it is a structured/searchable PDF or a raster scan
3. If structured (text-selectable): assess whether GRZ/GFZ/Höhe appear as labelled text → build PDF text extractor
4. If raster: assess OCR feasibility and cost; compare with manual transcription for initial pack

Record result in `sources/SOURCES.md §A` and update estimate accordingly. This single assessment determines whether the Hamburg pack costs ~18 or ~25 dev-days.

**Layer names now confirmed (do not re-guess):**
- Finalized plans: `app:hh_hh_festgestellt`
- In-progress plans: `app:prosin_imverfahren`
- PDF URL pattern: `https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/<planID>.pdf`
