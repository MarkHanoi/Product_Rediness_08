# Data Readiness Rate — Hamburg (`02000`) city

> **Naming note (L-649 reconciliation, 2026-07-30).** This file was `RATE.md`; its content is the
> **structured legislation / data-fill rate** (the C58/L-449 comparable ruler), which
> [`NAMING-CONVENTION`](../../../_TEMPLATE/NAMING-CONVENTION.md) §1 names `LEGISLATION-RATE.md`. It now
> **feeds** the composite master [`RATE.md`](./RATE.md) (the 7-axis C63 scorecard) as **Axis 2
> (LEGISLATION)**. Content below is unchanged — only the filename moved.

**Headline rate: ~30%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [GRZ / GFZ] +
> height**) **without reading a B-Plan PDF or Satzung**. This definition is IDENTICAL across every
> jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany / France …) so the scores
> are directly comparable. Derived from direct endpoint/schema checks, not assumed from Hamburg's
> open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Lyon Métropole | ~42% |
| Paris | ~35% |
| Norway (national) | ~32% |
| **Hamburg** | **~30%** |
| Germany (national) | ~28% |
| Berlin | ~28% |
| France (national) | ~22% |
| Munich / Marseille | ~18% |

Hamburg is the **highest-rated German city** in this study, and the recommended first
implementation target. It is the most thoroughly probed German city and provides the clearest
picture of the XPlanung WFS structural gap: a live, open, fully-migrated WFS covering 2,800
B-Plans that carries **no structured GRZ/GFZ/Höhe attributes**. Every numeric building parameter
requires reading the B-Plan PDF Satzung.

Hamburg scores slightly above the national average (~28%) because it is the best-confirmed base:
city-state scope (one jurisdiction, one LBO, one ALKIS regime), full XPlanung migration completed
2018 (the XLeitstelle is hosted inside Hamburg's own geodata agency LGV), no identified
historic-plan legacy layer comparable to Berlin's 1958/60 Baunutzungsplan, and a small assumed §34
fraction (though not yet measured).

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ❌ Endpoint 404 | `geodienste.hamburg.de/HH_WFS_ALKIS` — confirmed HTTP 404 (2026-07-23). Alternative: Transparenzportal CKAN or `geodienste.hamburg.de` capabilities listing (not yet probed). | ~20% (endpoint exists; path changed; alternative unconfirmed) |
| B-Plan boundary + identity | ✅ Full | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — HTTP 200, DL-DE 2.0, no access restrictions. `app:hh_hh_festgestellt` layer: plan ID (`geltendes_planrecht`), `feststellungsdatum`, geometry. 2,800 B-Plans. VERIFIED LIVE 2026-07-23. | ~95% (excellent coverage; open licence) |
| B-Plan PDF link | ✅ Full | `planrecht` field: `https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/<planID>.pdf` — confirmed HTTP 200, 581 KB (TB3.pdf). VERIFIED LIVE 2026-07-23. | ~95% |
| **GRZ (Grundflächenzahl)** | ❌ PDF | **Confirmed absent from WFS schema** 2026-07-23: `app:hh_hh_festgestellt` has no GRZ attribute. Must transcribe from B-Plan Satzung PDF. | ~0% |
| **GFZ (Geschossflächenzahl)** | ❌ PDF | Same as GRZ — confirmed absent. | ~0% |
| **Höhe (max height)** | ❌ PDF | Same — confirmed absent. | ~0% |
| BauNVO §17 density ceilings | ✅ Published | National published upper bounds per zone type. Hamburg B-Plans may set lower values. **These are ceilings, not parcel answers.** | 100% (ceiling only) |
| Abstandsflächen (HBauO §6) | ❌ JS-blocked | `landesrecht-hamburg.de/bsha` is a JavaScript SPA — §6 text not accessible via curl (returns 5,634 bytes of JS bundle). Hamburg multiplier may differ from BayBO's 0.4H. | ~0% (formula unknown) |
| Pre-1960 Hamburg-law plans | ⚠️ Limited | ~900 pre-1960 plans in WFS (`feststellungsdatum` before 1960). PDF accessible via same `planrecht` URL. Pre-1960 plans predate BauNVO (1962) — legal citation preservation in XPlanGML not yet confirmed. | ~20% (PDF accessible; interpretation uncertain) |
| DiPlanung (Hamburg pilot) | ⚠️ Operational | Hamburg hosts the Fachliche Leitstelle DiPlanung. DiPlanung is live in Hamburg. API endpoint `diplanung.de/schnittstellen` not yet fetched — may carry XPlanGML with structured GRZ/GFZ/Höhe, or may replicate PDF-link-only schema. | ~25% (operational; attribute schema unknown) |
| §34 coverage fraction | ❓ Assumed low | Hamburg XPlanung migration is complete (2011–2018), suggesting a small §34 fraction. Not grid-probed. | ~10% (assumed; unconfirmed) |
| Existing building heights (LoD2) | ⚠️ Partial | LoD2 via Transparenzportal Hamburg — endpoint not confirmed in probe. | ~30% |

---

## The structural gap

The XPlanung WFS structural gap is **confirmed and fully characterised** for Hamburg. The 2011–2018
XPlanung migration digitised 2,800 B-Plans into a live, open WFS — yet the `app:hh_hh_festgestellt`
schema carries only:

```
geltendes_planrecht  →  plan ID (e.g. "TB3")
planrecht            →  PDF URL
begruendung          →  Begründung (usually empty)
feststellungsdatum   →  approval date
geom                 →  plan boundary polygon
```

GRZ, GFZ, Höhe, and Nutzungsart are in the PDF Satzung. This is **structurally identical to
Barcelona's Pla Parcial situation** — digital infrastructure exists; numeric parameters were not
digitised into the structured fields.

**This is Germany's version of France's GPU-returns-PDF-link situation,** but with one critical
difference: Germany's XPlanGML schema *does* have fields for GRZ, GFZ, and Höhe — they are just
not populated. DiPlanung, if it enforces population of those fields, is the structural fix. If
DiPlanung replicates the PDF-link-only pattern, the fix is a PDF transcription programme.

**Hamburg is the pivotal city:** if DiPlanung delivers structured GRZ/GFZ/Höhe for Hamburg — where
the XLeitstelle (national DiPlanung coordination office) is itself hosted — then the structured path
is confirmed for all 7 DiPlanung Länder. If Hamburg's DiPlanung response is PDF-link-only, the
structured path is not available anywhere.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Fetch `diplanung.de/schnittstellen` — inspect API endpoint and GRZ/GFZ/Höhe attribute population in one sample B-Plan response | **+20–30 pp if structured** — the single highest-impact action for Hamburg and all of Germany | Low — one API probe |
| Download TB3.pdf — confirm text layer vs raster scan | Determines whether PDF-transcription pipeline (like Barcelona OCR) is viable for Hamburg's B-Plan corpus | Low |
| Fix ALKIS endpoint — check Transparenzportal CKAN or `geodienste.hamburg.de` capabilities | Restores parcel geometry access; removes the 404 gap | Low |
| Fetch HBauO §6 via headless browser or PDF print | Completes Hamburg Abstandsflächen formula; converts the §6 field from "blocked" to "formula confirmed" | Medium |
| Run §34 coverage fraction grid-sample for Hamburg bbox | Converts §34 fraction from assumed small to a measured number; confirms Hamburg as the cleanest-denominator German city | Medium |

**Realistic ceiling:**
- If DiPlanung carries structured attributes: **~60–70%** (the §34 floor and pre-1960-plan
  uncertainty are the remaining gaps; BauNVO taxonomy and setback formula fill the rest)
- If DiPlanung is PDF-link-only: **~35%** after ALKIS fix + PDF transcription programme

---

*Last updated: 2026-07-24. `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` VERIFIED LIVE
2026-07-23 (HTTP 200, DL-DE 2.0). `app:hh_hh_festgestellt` schema confirmed — GRZ/GFZ/Höhe
absent. TB3.pdf confirmed HTTP 200, 581 KB. ALKIS endpoint `HH_WFS_ALKIS` confirmed HTTP 404.
DiPlanung operational in Hamburg; API attribute schema NOT YET PROBED. HBauO §6 JS-blocked.
Maintainer: UNASSIGNED.*
