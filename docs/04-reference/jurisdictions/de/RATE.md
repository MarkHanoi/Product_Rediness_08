# Data Readiness Rate — Germany (`de`) national

**Headline rate: ~28%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone code + GRZ/GFZ + Höhe) without reading a B-Plan PDF or Satzung. Methodology mirrors the cross-jurisdiction benchmark.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| France (national) | ~22% |
| **Germany (national)** | **~28%** |

Germany's national score benefits from the BauNVO §17 published ceiling table (freely queryable) and a functioning XPlanung WFS infrastructure in Hamburg and Berlin. It is held below 30% because those WFS endpoints return plan boundaries and PDF links only — no structured GRZ/GFZ/Höhe attributes — mirroring the Barcelona Pla Parcial situation. §34 areas (discretionary "fit the neighbourhood" standard) yield no numeric answer by design.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ⚠️ Partial | Per-Land WFS; schema standardised (AdV AAA-Modell). Hamburg endpoint 404 (confirmed). Berlin GDI-BE partly open. Bayern TBD. NRW free. Varies by Land. | **~55%** (most Länder have ALKIS WFS; access terms and endpoints vary) |
| Regime classifier (§30/§34/§35) | ⚠️ Partial | Requires checking whether a B-Plan exists (WFS query) + §34 interior / §35 outlying test. B-Plan WFS confirmed in Hamburg and Berlin. Munich WFS not yet found. | **~50%** |
| BauNVO zone type (WA/GE/MK/etc.) | ✅ Published ceiling | BauNVO §§2–11 published federal taxonomy. Readable from B-Plan GRZ/GFZ if WFS carried attributes. Hamburg and Berlin WFS carry `inhalt` text field only — no zone-type code. | **~40%** (BauNVO taxonomy known; attribution to a specific parcel requires the B-Plan PDF) |
| BauNVO §17 density ceilings | ✅ Published | `gesetze-im-internet.de/baunutzungsv/__17.html` — GRZ/GFZ upper bounds per zone type, freely published. **These are national ceilings, NOT parcel-level values.** | **100% (ceiling only; never the parcel answer)** |
| **Actual GRZ** (parcel-level) | ❌ PDF | Hamburg and Berlin B-Plan WFS confirmed: **no GRZ attribute** in `app:hh_hh_festgestellt` or `bplan:b_bp_fs` schema. Must read the B-Plan Satzung PDF. | **~0%** |
| **Actual GFZ** (parcel-level) | ❌ PDF | Same as GRZ. | **~0%** |
| **Actual Höhe** (parcel-level) | ❌ PDF | Same. WFS carries plan boundary polygon and PDF link only. | **~0%** |
| Abstandsflächen (setbacks) | ✅ Formula (BayBO confirmed) | **BayBO Art. 6 confirmed 2026-07-23**: 0.4H general, 0.2H in GE/GI, min 3 m; H = wall height + 1/3 roof height (≤70°). HBauO §6 (Hamburg) and BauO Bln §6 (Berlin) not yet extracted (JS-rendered portals). BauO formula is per-Land — structured formula at the state level, not a GIS attribute. | **~35%** (formula known for Bavaria; Hamburg/Berlin blocked) |
| B-Plan PDF access | ✅ Full | Hamburg: `daten-hamburg.de/.../bplan/<planID>.pdf` — confirmed HTTP 200, 581 KB. Berlin: `mitte.gis-broker.de/bplaene/<planid>.pdf` — confirmed. | **~90%** (PDF link, not structured attribute) |
| Existing building heights (LoD2-DE) | ⚠️ Partial | LoD2-DE national: INSPIRE Art. 13(1)(e) restricted. Per-Land: Hamburg via Transparenzportal (endpoint unconfirmed), Berlin via FIS-Broker (stale). Bavaria (ZSHH) access terms TBD. | **~30%** (some Länder open; national access restricted) |
| XPlanung / DiPlanung | ⚠️ Operational | DiPlanung live in 7 Länder (Bayern, Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen, Schleswig-Holstein). API endpoint at `diplanung.de/schnittstellen` not yet fetched. May carry structured XPlanGML — or may be same PDF-link-only situation as Hamburg WFS. | **~20%** (operational; endpoint TBD) |

---

## The XPlanung structural gap

XPlanung (the national digital B-Plan standard) **allows** structured attributes for GRZ, GFZ, and Höhe, but **does not require** municipalities to populate them. Hamburg's WFS migration (2011–2018, 2,800 plans) proves this: the `app:hh_hh_festgestellt` schema only exposes plan ID, PDF URL, and geometry — the numeric B-Plan parameters remained in the PDF.

This is Germany's equivalent of Barcelona's height-on-plànol wall: the exchange format exists (XPlanGML), the infrastructure is live, but the actual numeric values were never digitised into the structured fields.

---

## Four-way regime classifier (required before any numeric lookup)

Before attempting any numeric query, a German parcel requires regime classification:

| Regime | Fraction | Structured data path | Rate |
|---|---|---|---|
| §30 B-Plan (modern XPlanung) | ~60% of Germany | B-Plan WFS → PDF → transcription | ~0% structured |
| §30 Baunutzungsplan (Berlin 1958/60) | ~30% of Berlin | Separate digitised layer — Berlin FIS-Broker stale; GDI-BE `bplan` WFS covers only XPlanung-era | ~5% |
| §34 unplanned interior | ~30% of Germany | "Einfügen" — no numeric table; purely discretionary | 0% (no structured answer exists) |
| §35 outlying area | ~10% of Germany | Presumptively not buildable | 100% (the answer is "not buildable") |

This classifier is a prerequisite; the 28% national rate factors in the ~30% §34 fraction (which cannot be answered) as a systematic floor.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Fetch `diplanung.de/schnittstellen` — check if DiPlanung API returns structured GRZ/GFZ/Höhe | High potential: if DiPlanung populates structured fields, raises rate to ~45–55% for covered Länder | Low — one API probe |
| Read Hamburg §6 HBauO (headless browser or PDF print) | Completes BayBO/HBauO/BauO Bln Abstandsflächen formula set | Medium |
| Download and check one Hamburg and one Berlin B-Plan PDF for text-layer status | Confirms whether PDF-transcription pipeline (like Barcelona OCR) is viable | Low |
| Discover Munich XPlanung WFS endpoint | Adds third German city to probed set | Medium |
| Run §34 coverage fraction grid-sample for Hamburg and Berlin | Quantifies the §34 floor for those cities | Medium |

---

*Last updated: 2026-07-23. Hamburg and Berlin B-Plan WFS confirmed live; GRZ/GFZ/Höhe absent from both schemas. BayBO Art. 6 confirmed. DiPlanung operational in 7 Länder.*
