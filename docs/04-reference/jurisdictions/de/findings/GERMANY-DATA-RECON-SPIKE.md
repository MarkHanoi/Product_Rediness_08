# Germany — DATA RECON SPIKE (live-probe transcript + binary-ceiling resolution)

**Kind:** live-probe evidence log · **Date:** 2026-07-24 · **Maintainer:** UNASSIGNED ·
**Status:** SPIKE COMPLETE — all findings asserted on Content-Type + response body; no value below is
inferred from a reputation.

> **What this file is.** The verbatim transcript of the German data-reconnaissance spike run on
> 2026-07-24, and the resolution of the single gating question that `RATE-IMPLEMENTATION-PLAN.md`
> Phase 1 was blocked on: **does the structured German B-Plan delivery return machine-readable
> GRZ/GFZ/Höhe, or only a boundary polygon + a PDF link?** It resolves the ~35% vs ~65% fork.
> It does **not** move the headline rate (`RATE.md` stays ~28% until a pack ships and is re-measured);
> it converts one assumption into a measurement and reframes what the next measurement must be.

---

## 1 — The gating question, and the honest answer

**The old binary (as framed in `RATE.md` / `RATE-IMPLEMENTATION-PLAN.md`):**
- DiPlanung returns structured GRZ/GFZ/Höhe → national ceiling ~55–65% for the 7 live Länder.
- DiPlanung is PDF-link-only → ceiling ~35–40% (a B-Plan transcription programme).

**The measured answer — the binary was the wrong axis.** The structured-attribute delivery path is
**real and live-proven today** (Mecklenburg-Vorpommern, §4 below), so the ~55–65% ceiling is
*architecturally achievable* — the numbers exist as fields, not only as prose. **But the variable that
gates it is not the DiPlanung brand or platform; it is the *digitisation depth* of each individual
plan:**

| Digitisation depth | XPlanGML delivers | Live-probed example | Numeric fill |
|---|---|---|---|
| **Inhaltlich / vollvektoriell strukturiert** (content-vectorised: each Baugebietsteilfläche is an attributed object) | `grz`, `gfz`, `z` (storeys), `dachform`, `allgArtDerBaulNutzung` as populated fields | **MV** `demo.bauleitplaene-mv.de` — `grz=0.4`, `z=1` (§4) | ✅ structured |
| **Georeferenziert** (boundary polygon + scanned Satzung PDF, bulk-migrated) | plan-outline geometry + a `.pdf` link, nothing numeric | **Hamburg** `TB3.pdf`; **Berlin** `0100002b.pdf` (§2, §3) | ❌ PDF-gated |

So DiPlanung — which is a **plan-authoring and participation platform, not a structured-data API**
(§5) — raises the ceiling *prospectively*: plans authored or re-vectorised natively in its editor are
stored as full-content-model XPlanGML and therefore *can* carry populated attributes. It does **not**
retroactively structure the bulk-migrated scanned corpus that the two biggest studied cities still
serve. **The verdict is therefore neither fork as originally stated: the structured path exists (so the
higher ceiling is not fictional), but today's national numeric fill stays at the ~28–40% band because
the content-vectorised fraction of the in-force corpus is low in the large cities.**

**The new gating measurement** that replaces the old DiPlanung probe: *the content-vectorised fraction
of the in-force B-Plan corpus, per Land / per city.* That fraction — not a platform's existence — is
what multiplies the achievable ceiling. It is measurable with the same WFS probes below (does the Land
publish `bp_baugebietsteilflaeche` object layers with populated `grz`/`gfz`/`z`, or only a plan-outline
+ scan layer?).

**A second honest nuance the probe surfaced (metric definition):** the German density envelope is
overwhelmingly expressed as **GRZ + Z (Zahl der Vollgeschosse / storey count)**, *not* GFZ + height in
metres. In the MV sample (§4) GRZ populated on 54/162 features and storeys on 48/162, but GFZ on only
8/162 and metric height (`hoehenangabe`) on **0/162**. A rate metric that requires "a density metric
[GRZ/GFZ] **+ height in metres**" will systematically *under-count* Germany, because storey-count **is**
the height rule for most of the corpus. Count `Z` (Vollgeschosse) as a valid height determinant, or the
German score is measuring the wrong field's absence.

---

## 2 — Probe: Hamburg XPlanung WFS (the "structured city" baseline)

**Endpoint:** `https://geodienste.hamburg.de/HH_WFS_Bebauungsplaene`
**Reachability:** `GetCapabilities` → **HTTP 200**, `Content-Type: text/xml;charset=UTF-8`, 29,905 bytes.
Feature types (from `<Title>`): *"Festgestellte Bebauungspläne"*, *"prosin_imverfahren"*.

**Schema (`DescribeFeatureType`) — feature type `app:hh_hh_festgestellt`, element names verbatim:**
```
geltendes_planrecht · planrecht · begruendung · feststellungsdatum · geom
```
**No `GRZ`, `GFZ`, `hoeheMN`, `hoeheBezugspunkt`, `Nutzungsschablone`, or `allgArtDerBaulNutzung`
element exists in the schema.**

**One real feature (`GetFeature`, `COUNT=1`, GML — the service rejects `application/json` with
`InvalidParameterValue` on `outputFormat`, itself a recorded negative):**
```xml
<app:geltendes_planrecht>TB3</app:geltendes_planrecht>
<app:planrecht>https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/TB3.pdf</app:planrecht>
<app:begruendung></app:begruendung>
<app:feststellungsdatum>11.10.1949</app:feststellungsdatum>
```
**Verdict:** the `planrecht` attribute is *literally a PDF URL*. The only numeric-rule path is opening
`TB3.pdf`. **GRZ/GFZ/Höhe are absent from the schema, not merely null.** Confirms the `RATE.md`
baseline exactly. This is a bulk-migrated *georeferenced* corpus (plan outline + scan).

---

## 3 — Probe: Berlin XPlanung WFS (second "structured city" baseline)

**Endpoint:** `https://gdi.berlin.de/services/wfs/bplan`
**Reachability:** `GetCapabilities` → **HTTP 200**, `Content-Type: application/xml`, 97,188 bytes.
Feature types: *"Bebauungspläne, festgesetzt"* / *"…außer Kraft gesetzt"* / *"…im Verfahren"*.
**Licence (`AccessConstraints`):** *"Es gelten keine Zugriffsbeschränkungen"* — open, no access
restriction (matches the DL-DE Zero 2.0 claim in `RATE.md`).

**Schema (`DescribeFeatureType`) — feature type `fis:b_bp_fs`, element names verbatim:**
```
gisid · planid · planname · planartname · verfahrensart · bereich · bezirk ·
bp_rechtsstand · afs_behoer · afs_beschl · afs_l_aend · bbg_anfang · bbg_ende ·
aul_anfang · aul_ende · festsg_von · festsg_am · fsg_gvbl_n/s/d · normkontr ·
scan_www · grund_www · url_www · inhalt · ersetzt* · geom
```
**No `GRZ`, `GFZ`, `hoehe`/`Höhe` element exists.**

**One real feature (`GetFeature`, GeoJSON — this service *does* support `application/json`):**
```json
"planname":     "1-2b",
"planartname":  "Qualifizierter B-Plan",
"bp_rechtsstand":"In Kraft getreten",
"festsg_am":    "2004-09-01",
"scan_www":     "https://mitte.gis-broker.de/bplaene/0100002b.pdf",
"inhalt":       "Kerngebiet, Straßenverkehrsfläche"
```
`totalFeatures / numberMatched: 2839`.

**Verdict:** `scan_www` is a PDF URL; the numeric rules are inside `0100002b.pdf`. The `inhalt` field
gives the *use type* in free prose (`"Kerngebiet"` → BauNVO `MK`), so the zone type is NLP-recoverable —
but **GRZ/GFZ/Höhe are absent.** Same georeferenced pattern as Hamburg. Confirms the `RATE.md` baseline.

---

## 4 — Probe: Mecklenburg-Vorpommern XPlanung WFS (the DECISIVE finding — the structured path IS live)

**Endpoint:** `https://demo.bauleitplaene-mv.de/ows/xplanung`
**Reachability:** `GetCapabilities` → **HTTP 200**, `Content-Type: text/xml;charset=UTF-8`, 59,719 bytes.
Unlike Hamburg/Berlin, this service publishes the **full XPlanGML content model as one object layer per
XPlanung class** — e.g. `ms:bp_baugebietsteilflaeche_polygons`, `ms:bp_baugrenze_lines`,
`ms:bp_firstrichtungslinie_lines`, `ms:bp_gebaeudeflaeche_polygons`, etc. (20+ object layers).

**Schema (`DescribeFeatureType`) — `ms:bp_baugebietsteilflaeche_polygons` — the density/height fields
all exist:**
```
grz · grz_ausn · grzmax · grzmin · gfz · gfz_ausn · gfzmax · gfzmin ·
z · z_ausn · z_dach · z_staffel · zzwingend · hoehenangabe ·
bmz · bm · bmax · bmin · gf · allgartderbaulnutzung(_text) · dachform(_text)
```

**Real features (`GetFeature`, real MV municipality — Cramonshagen Plan Nr. 4), verbatim:**
```xml
<ms:plan_name>Qualifizierter B-Plan Cramonshagen Plan Nr. 4</ms:plan_name>
<ms:allgartderbaulnutzung_text>WohnBauflaeche (1000)</ms:allgartderbaulnutzung_text>
<ms:dachform_text>Satteldach (3100), Walmdach (3200), Krueppelwalmdach (3300)</ms:dachform_text>
<ms:grz>0.4</ms:grz>
<ms:z>1</ms:z>
<ms:gfz></ms:gfz>          <!-- empty on this parcel; density set by GRZ+Z -->
<ms:hoehenangabe></ms:hoehenangabe>
```

**Population measurement across 162 `bp_baugebietsteilflaeche` features (count=300 request, real plans:
Dranske, Greifswald, Neubrandenburg, Sagard, Putgarten, Vier-Tore-Stadt Neubrandenburg…):**

| Field | Populated features | Rate | Values observed |
|---|---|---|---|
| `grz` | 54 / 162 | ~33% | 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.75, 0.8, 0.9 (real per-parcel spread) |
| `z` (Vollgeschosse) | 48 / 162 | ~30% | 1–several storeys |
| `gfz` | 8 / 162 | ~5% | — |
| `hoehenangabe` (metres) | 0 / 162 | 0% | — |

**Verdict — this is the finding that resolves the fork.** A German XPlanung WFS **does** deliver
populated, machine-readable GRZ + storey-count + BauNVO use-type + roof-form as structured fields,
Denmark-style, **today**. The higher ~55–65% ceiling is therefore *not fictional* — the data model and a
live service that serves it both exist. What it is *not* is universal: this is the content-vectorised
corpus, and metric height is essentially never populated (density is GRZ+Z). The two biggest studied
cities (Hamburg, Berlin) do not serve this — they serve boundary + scan. So the ceiling any given
city/Land can reach is multiplied by *its* content-vectorised fraction, which is the quantity Phase 1
should now measure instead of a single national DiPlanung probe.

> ⚠ Endpoint honesty: `demo.bauleitplaene-mv.de` carries a `demo.` host label but serves **real** MV
> plan data (Cramonshagen, Greifswald and Neubrandenburg are real municipalities with real adopted
> plans). The production portal is `bplan.geodaten-mv.de/Bauleitplaene`; `bplan.geodaten-mv.de/ows/…`
> returned 404 for the exact path tried — the production OWS path must be re-derived from its
> capabilities before any pack cites it. Treat the *mechanism* as proven and the *production URL* as
> still-to-pin. (Recorded so no one re-runs the 404 hoping.)

---

## 5 — Probe: DiPlanung itself (`diplanung.de` / schnittstellen / wiki)

- `https://diplanung.de/` → HTTP 200, `text/html`, 46,261 bytes.
- `https://diplanung.de/schnittstellen/` → HTTP 200, `text/html`, 16,207 bytes. The page describes
  **XÖV-family process interfaces** — *XPlanverfahren*, *XBeteiligung* — and links onward to
  `wiki.diplanung.de`. It lists **no** structured GRZ/GFZ data endpoint, no WFS/OGC-API URL, and does
  not mention GRZ/GFZ/Höhe. Contact is Hamburg (`diplanung@bsw.hamburg.de`).
- `wiki.diplanung.de` describes DiPlanung as a **plan-authoring + public-participation suite**
  (Verfahrenssteuerung, Beteiligung) with a **DiPlan REST-Schnittstelle** that is a *process* API
  (workflow/participation), not a public structured-attribute B-Plan delivery service.

**Verdict:** DiPlanung is the software that *makes and runs* plan procedures across the 7+ Länder that
have adopted it (an OZG/govdigital effort led from Hamburg). It stores plans internally as XPlanGML,
so plans **authored** in it are content-structured. But its public face is a process/participation API,
and the **delivery** of finished plans to consumers is still the per-Land XPlanung WFS — which, as §2–§4
show, is content-structured only where the plan itself was vectorised to the full content model. **So
"probe the DiPlanung API for GRZ/GFZ" was the wrong probe: DiPlanung is not the data tap. The data tap
is the per-Land XPlanung WFS, and the answer there is `Land-and-plan-dependent`, proven by §2–§4.**

---

## 6 — Probe: national structured law + spatial reality (the "always available" layers)

| Layer | Endpoint | Result | Meaning |
|---|---|---|---|
| **BauNVO §17** (national density table) | `gesetze-im-internet.de/baunvo/__17.html` | HTTP 200. Heading verbatim: *"§ 17 **Orientierungswerte** für die Bestimmung des Maßes der baulichen Nutzung"*; opening *"…folgende **Orientierungswerte für Obergrenzen**"*. Full GRZ/GFZ/BMZ table captured (§7). | National, structured, 100% — but see the ⚠ below: since the 2013/2017 reform these are **Orientierungswerte** (orientation values for upper limits), **not** the hard "Obergrenzen" the older docs imply. A B-Plan may exceed them with justification; they are a *sanity ceiling*, not a rule. |
| **LoD2-DE building height** (spatial reality) | `opengeodata.nrw.de/produkte/geobasis/3dg/lod2_gml/` | HTTP 200, `application/json` — an **open, free** per-Land LoD2 CityGML product index (NRW). | Confirms trip-wire 4.3: a per-Land INSPIRE/LoD2 building-height source is open and reachable (NRW), independent of the restricted ZSHH national feed. |

**⚠ §17 legal correction to carry back.** `de/README.md §1.3` and `GERMANY-MASTER-DATA-SOURCE-STUDY.md`
label the §17 table as "**Obergrenzen** / ceilings" and both give **`MU` Urbanes Gebiet GRZ = 0.60**.
The live statute says the heading is **Orientierungswerte** and **`MU` (Urbane Gebiete) GRZ = 0.8**
(GFZ 3.0). Two carry-backs: (1) call them *orientation values for upper limits*, not binding ceilings;
(2) fix the `MU` GRZ from 0.60 → **0.80** in the README and the master study. This is a documentation
data-quality catch, not a rate change.

---

## 7 — BauNVO §17 table, captured verbatim (national, structured)

| Baugebiet | GRZ | GFZ | BMZ |
|---|---|---|---|
| Kleinsiedlungsgebiete (WS) | 0,2 | 0,4 | – |
| Reine / Allgemeine Wohngebiete (WR / WA), Ferienhausgebiete | 0,4 | 1,2 | – |
| Besondere Wohngebiete (WB) | 0,6 | 1,6 | – |
| Dorf- / Misch- / Dörfliche Wohngebiete (MD / MI / MDW) | 0,6 | 1,2 | – |
| Urbane Gebiete (MU) | **0,8** | 3,0 | – |
| Kerngebiete (MK) | 1,0 | 3,0 | – |
| Gewerbe- / Industriegebiete + sonstige SO (GE / GI) | 0,8 | 2,4 | 10,0 |
| Wochenendhausgebiete | 0,2 | 0,2 | – |

Source: `gesetze-im-internet.de/baunvo/__17.html` (current consolidated BauNVO 1990), fetched 2026-07-24.

---

## 8 — What this spike did and did NOT change

**Changed (assumption → measurement):**
- Hamburg + Berlin XPlanung WFS: "GRZ/GFZ/Höhe absent" upgraded from VERIFIED-LEAD to **VERIFIED with
  schema + a real feature** (§2, §3).
- The structured-attribute delivery path: upgraded from "pivotal unknown" to **LIVE-PROVEN** (MV, §4).
- The DiPlanung fork: **resolved** — the gating variable is per-plan digitisation depth, not the
  platform; the new measurement is the content-vectorised corpus fraction per Land (§1).
- §17: corrected to *Orientierungswerte*; `MU` GRZ corrected to 0.8 (§6).
- LoD2 open per-Land access: confirmed reachable (NRW, §6).

**NOT changed (and correctly so):**
- **`RATE.md` headline stays ~28%.** No pack shipped; no city corpus measured for its content-vectorised
  fraction. A proven mechanism in MV does not raise Hamburg's or Berlin's measured fill — theirs is 0%
  structured, live-confirmed.
- **The ~30% §34 floor stays a legal floor, not a data gap.** Nothing here touches it; §34 parcels still
  correctly resolve to a reasoned refusal.
- **No 55–65% claim is asserted as achieved.** It is confirmed *achievable* for content-vectorised
  plans, and gated on a fraction that is low in the big cities today. Conditional, labelled conditional.

---

*Cross-refs: `../RATE.md` · `../RATE-IMPLEMENTATION-PLAN.md` (Appendix A mirrors this transcript) ·
`../COUNTRY-DATA-STRATEGY.md` (the 5-engine framing this evidence feeds) ·
`GERMANY-MASTER-DATA-SOURCE-STUDY.md` (carry back the §17 correction). Probe discipline:
`../../../PROBE-DISCIPLINE.md`. Governing: C58 §1.2/§1.4 · L-449.*
