# Data Readiness Rate — Hamburg (02000)

**Headline rate: ~30%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone + GRZ/GFZ/Höhe) without reading a B-Plan PDF.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| **Hamburg** | **~30%** |
| Germany (national) | ~28% |
| Berlin | ~28% |

Hamburg is the **most thoroughly probed** German city and provides the clearest picture of the XPlanung WFS structural gap: a live, open, well-maintained WFS that covers 2,800 B-Plans but carries **no structured GRZ/GFZ/Höhe attributes**. Every numeric building parameter requires reading the B-Plan PDF.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ❌ Endpoint 404 | `geodienste.hamburg.de/HH_WFS_ALKIS` — **confirmed HTTP 404** (2026-07-23). Alternative: Transparenzportal CKAN or `geodienste.hamburg.de` capabilities listing. | **~20%** (endpoint exists but path changed; alternative unconfirmed) |
| B-Plan boundary + identity | ✅ Full | `geodienste.hamburg.de/HH_WFS_Bebauungsplaene` — HTTP 200, DL-DE 2.0, no access restrictions. `app:hh_hh_festgestellt` layer: plan ID (`geltendes_planrecht`), feststellungsdatum, geometry. | **95%** (excellent coverage; 2,800 B-Plans) |
| B-Plan PDF link | ✅ Full | `planrecht` field: `https://daten-hamburg.de/infrastruktur_bauen_wohnen/bebauungsplaene/pdfs/bplan/<planID>.pdf` — confirmed HTTP 200, 581 KB (TB3.pdf). | **95%** |
| **GRZ (Grundflächenzahl)** | ❌ PDF | **Not in WFS schema** — confirmed 2026-07-23: `app:hh_hh_festgestellt` has no GRZ attribute. Must transcribe from B-Plan Satzung PDF. | **~0%** |
| **GFZ (Geschossflächenzahl)** | ❌ PDF | Same as GRZ. | **~0%** |
| **Höhe (max height)** | ❌ PDF | Same. | **~0%** |
| BauNVO §17 ceilings | ✅ Published | National published ceiling per zone type. Hamburg B-Plans may set lower values. **These are ceilings, not parcel answers.** | **100% (ceiling only)** |
| Abstandsflächen (HBauO §6) | ❌ JS-blocked | `landesrecht-hamburg.de/bsha` is a JavaScript SPA — §6 text not accessible via curl (returns 5,634 bytes of JS bundle). Multiplier unknown; Hamburg may differ from BayBO's 0.4H. | **~0%** (formula unknown) |
| Pre-1960 Hamburg-law plans | ⚠️ Limited | ~900 pre-1960 plans in WFS (`feststellungsdatum` before 1960). PDF accessible via same `planrecht` URL. But pre-1960 plans predate BauNVO (1962) — legal citation preservation and interpretation require specialist knowledge. | **~20%** (PDF accessible; interpretation uncertain) |
| DiPlanung (Hamburg pilot) | ⚠️ Operational | Hamburg hosts the Fachliche Leitstelle DiPlanung. DiPlanung is live in Hamburg. API endpoint at `diplanung.de/schnittstellen` not yet fetched — may carry XPlanGML with structured attributes OR may replicate the PDF-only WFS situation. | **~25%** (operational; attributes unknown) |
| §34 coverage fraction | ❓ Unknown | Hamburg XPlanung migration (2011–2018) is complete, suggesting low §34 fraction. Not grid-probed. | **~10%** (assumed low; unconfirmed) |
| Existing building heights (LoD2) | ⚠️ Partial | LoD2 via Transparenzportal Hamburg — endpoint not confirmed in probe. | **~30%** |

---

## The XPlanung structural gap — confirmed

Hamburg's 2011–2018 XPlanung migration digitised 2,800 B-Plans into WFS. But the migration captured **plan geometry and administrative metadata only** — not the numeric development parameters. The `app:hh_hh_festgestellt` schema is:

```
geltendes_planrecht  →  plan ID (e.g. "TB3")
planrecht            →  PDF URL
begruendung          →  Begründung (usually empty)
feststellungsdatum   →  approval date
geom                 →  plan boundary polygon
```

GRZ, GFZ, Höhe, Nutzungsart are in the PDF Satzung. This is **structurally identical to Barcelona's Pla Parcial situation** — the digital infrastructure exists, the numeric parameters were not digitised.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Fetch `diplanung.de/schnittstellen` — check if DiPlanung returns GRZ/GFZ/Höhe | +20–30 pp if structured; defines the practical ceiling | Low |
| Download TB3.pdf — confirm text layer vs raster | Determines whether PDF transcription pipeline is viable | Low |
| Run §34 coverage fraction grid-sample | Quantifies floor for Hamburg | Medium |
| Fix ALKIS endpoint — check Transparenzportal CKAN | Restores parcel geometry access | Low |
| Fetch HBauO §6 via headless browser or PDF | Completes Abstandsflächen formula | Medium |

**Realistic ceiling:**
- If DiPlanung carries structured attributes: **~60–70%** (matching Madrid)
- If DiPlanung is PDF-link-only (like the Hamburg WFS): **~35%** (requires PDF transcription programme similar to Barcelona OCR)

Hamburg is the **pivotal city** for Germany: if DiPlanung delivers structured GRZ/GFZ/Höhe, Germany's rate approaches Denmark. If it doesn't, Germany sits at Barcelona-level for §30 parcels.

---

*Last updated: 2026-07-23. WFS live-confirmed; GRZ/GFZ/Höhe confirmed absent from schema. ALKIS 404 confirmed. DiPlanung operational but API attributes unknown.*
