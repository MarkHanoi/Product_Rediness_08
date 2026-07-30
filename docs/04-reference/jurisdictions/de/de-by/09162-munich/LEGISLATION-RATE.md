# LEGISLATION-RATE — Munich / München (09162)

<!-- Renamed from RATE.md → LEGISLATION-RATE.md by the C63 Phase-1 audit (L-649 naming: the composite
     7-axis master is now RATE.md; this structured legislation/data-fill number is the LEGISLATION
     sub-rate that FEEDS C63 §3 Axis 2). Content UNCHANGED — only the filename + this note. -->

> **Structured legislation/data-fill rate** (C58 comparable ruler; feeds [C63](../../../../../02-decisions/contracts/C63-CITY-COMPLETION-AND-DOSSIER.md) §3 Axis 2). This is the coarse PRIOR, not the composite; the 7-axis master lives in [`RATE.md`](./RATE.md). The ~18 % below is a hand-authored research figure (NOT scorecard-emitted) with NO signed `sources/VERIFICATION.md`, so C63 Axis 2 reads it as an **unverified prior** and the composite keeps LEGISLATION `not-assessed` until the L-449 sign-off (C63 §1.1/§1.6).

**Headline rate: ~18%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone + GRZ/GFZ/Höhe) without reading a B-Plan PDF.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Hamburg | ~30% |
| Germany (national) | ~28% |
| Berlin | ~28% |
| **Munich** | **~18%** |
| Marseille | ~18% |

Munich shares the lowest rating with Marseille. The gap is **not architectural** — Munich's data infrastructure almost certainly mirrors Hamburg's (XPlanung WFS with PDF-link-only schema). The low rate reflects that **no WFS endpoint has been discovered** yet: all probed Munich and Bavaria endpoints returned 404 or connection refused. Until the endpoint is found, the structured rate is effectively the BauNVO national floor only.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ⚠️ Unconfirmed | Bayerische Vermessungsverwaltung ALKIS — standard schema; access terms and endpoint TBD. `geodaten.bayern.de` confirmed as OpenData portal. | **~30%** (ALKIS standard confirmed; Munich-specific endpoint TBD) |
| B-Plan boundary + identity | ❌ Endpoint not found | All probed Munich/Bavaria WFS paths returned 404 or connection refused (2026-07-23): `geoportal.muenchen.de/geoserver/wfs`, `/geoserver/opendata/wfs`, `stadtplan.muenchen.de/stadtplan/ows` (000), `geoservices.bayern.de/wfs/bplan`, Munich CKAN. BayernAtlas HTTP 200 but no WFS URL extracted. | **~0%** (endpoint not yet discovered) |
| DiPlanung (Bavaria pilot) | ⚠️ Operational | DiPlanung mandatory statewide from 31 Oct 2026; **already live in Bayern as of 2026-07-23** (Fachliche Leitstelle: Hamburg BSW). API endpoint at `diplanung.de/schnittstellen` not yet fetched. If DiPlanung delivers structured XPlanGML attributes, this is the highest-impact path for Munich. | **~20%** (operational; endpoint and attribute schema unknown) |
| **GRZ (Grundflächenzahl)** | ❌ Inaccessible | No WFS endpoint found; even if found, Hamburg's XPlanung WFS confirmed GRZ absent from schema — Munich likely same. | **~0%** |
| **GFZ (Geschossflächenzahl)** | ❌ Inaccessible | Same. | **~0%** |
| **Höhe (max height)** | ❌ Inaccessible | Same. | **~0%** |
| BauNVO §17 ceilings | ✅ Published | National published upper bounds per zone type. | **100% (ceiling only; never the parcel answer)** |
| **Abstandsflächen (BayBO Art. 6)** | ✅ **Confirmed formula** | **Live-extracted 2026-07-23**: BayBO Art. 6(5) — setback = **0.4H** (general), **0.2H** in GE/GI zones, minimum **3 m**. H = wall height + 1/3 roof height (roof ≤70° pitch). Source: `gesetze-bayern.de/Content/Document/BayBO-6`, text valid from 01.05.2026. | **100% (formula; Bavaria only — applies nationally to Bavaria)** |
| §34 coverage fraction | ❓ Unknown | Munich is a large city with comprehensive B-Plan coverage assumed (like Hamburg) but not grid-sampled. | **~10%** (assumed low; unconfirmed) |
| Existing building heights (LoD2-DE) | ⚠️ TBD | ZSHH (Zentrale Stelle für Hauskoordinaten und Hausumringe) hosted at Bayerische Vermessungsverwaltung. `geodaten.bayern.de` OpenData portal confirmed; LoD2 licence terms and download endpoint TBD. | **~35%** (portal confirmed open; terms TBD) |

---

## Why Munich scores lower than Hamburg and Berlin

Munich's low score is primarily an **endpoint discovery gap**, not a data quality gap:

1. **No WFS found** — Hamburg has a live WFS at `geodienste.hamburg.de`. Berlin has one at `gdi.berlin.de`. Munich's equivalent endpoint location is unknown after exhausting the obvious paths.
2. **DiPlanung is the most likely path** — Bavaria mandated DiPlanung and it is already operational. If the DiPlanung API (`diplanung.de/schnittstellen`) returns structured XPlanGML with GRZ/GFZ/Höhe, Munich jumps from ~18% to ~50–65% in one probe.
3. **BayBO Art. 6 is a bright spot** — Bavaria's Abstandsflächen formula is confirmed and published, giving Munich the clearest setback rule of any city studied.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Fetch `diplanung.de/schnittstellen` — check API endpoint and attribute schema | +30–40 pp if structured GRZ/GFZ/Höhe returned | **Low — one API probe** |
| Try `mapserver.gis.muenchen.de` and `geoportal.bayern.de/bayernatlas` WFS | Discovers the Munich B-Plan WFS endpoint | Low |
| Confirm Bavarian LoD2 open terms and download path | +10 pp on context buildings | Low |
| Confirm ALKIS endpoint and terms for Munich | +15 pp on parcel access | Medium |

**Realistic ceiling:**
- If DiPlanung structured: **~60–70%** (the Bavaria mandate means this is the most likely scenario post-Oct 2026)
- If DiPlanung PDF-link-only (like Hamburg WFS): **~30–35%** after endpoint discovery
- BayBO Art. 6 confirmed means setbacks are the **best-sourced field** for Munich of any city studied

Munich is the **highest-potential** German city: if DiPlanung delivers structured attributes — and Bavaria's Oct 2026 mandate strongly incentivises this — Munich could leapfrog Hamburg and Berlin.

---

*Last updated: 2026-07-23. No WFS endpoint discovered. BayBO Art. 6 setback formula confirmed via live text extraction. DiPlanung operational in Bavaria; API attributes unknown.*
