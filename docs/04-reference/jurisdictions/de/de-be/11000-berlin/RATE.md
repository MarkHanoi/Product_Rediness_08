# Data Readiness Rate — Berlin (11000)

**Headline rate: ~28%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that return a complete, machine-readable answer (zone + GRZ/GFZ/Höhe) without reading a B-Plan PDF or legacy plan.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Hamburg | ~30% |
| **Berlin** | **~28%** |
| Germany (national) | ~28% |

Berlin matches the German national average but faces **two structural challenges** that Hamburg does not: (1) the **Baunutzungsplan 1958/60** governs large parts of the city and is a legally precarious legacy instrument with a confirmed voidance precedent; (2) **§34 areas** are significantly more prevalent in former East Berlin than in any other German city studied, reducing the fraction of parcels that have any structured rule at all.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (ALKIS) | ⚠️ Partial | GDI-BE partly open; specific ALKIS WFS endpoint not confirmed. | **~40%** |
| B-Plan boundary + identity | ✅ Full | `gdi.berlin.de/services/wfs/bplan` — **confirmed HTTP 200** (2026-07-23). Licence: **DL-DE Zero 2.0** (completely free). `bplan:b_bp_fs` (festgesetzt), `bplan:a_bp_iv` (im Verfahren), `bplan:c_bp_ak` (außer Kraft). 89 plans in Mitte bbox alone. | **95%** (excellent coverage; open licence) |
| B-Plan plan type | ✅ Full | `planartname` field: "Qualifizierter B-Plan", "Einfacher B-Plan", "Vorhabenbezogener B-Plan" | **95%** |
| B-Plan PDF link | ✅ Full | `scan_www` field: `https://mitte.gis-broker.de/bplaene/<planid>.pdf` — confirmed per-district URL pattern. | **90%** (per-district hosting; pattern consistent) |
| B-Plan zone summary | ⚠️ Text-only | `inhalt` field: text description of zone types (e.g. "Kerngebiet, Straßenverkehrsfläche"). **Not a structured code** — not parseable as BauNVO zone type without NLP. | **~30%** (informative text; not machine-classified) |
| **GRZ (Grundflächenzahl)** | ❌ PDF | **Not in WFS schema** — confirmed 2026-07-23: `bplan:b_bp_fs` has no GRZ attribute. | **~0%** |
| **GFZ (Geschossflächenzahl)** | ❌ PDF | Same. | **~0%** |
| **Höhe (max height)** | ❌ PDF | Same. | **~0%** |
| BauNVO §17 ceilings | ✅ Published | National published upper bounds. Berlin B-Plans may set lower values. | **100% (ceiling only)** |
| Baunutzungsplan 1958/60 | ❌ Not found | The digitised legacy layer covering pre-XPlanung West Berlin is **not in the `gdi.berlin.de/services/wfs/bplan` service**. Separate layer — FIS-Broker path unknown (all `/fb/wfs/` paths stale). | **~0%** (layer confirmed to exist; endpoint not found) |
| Abstandsflächen (BauO Bln §6) | ❌ JS-blocked | `gesetze.berlin.de` portal is JavaScript SPA — §6 text not accessible via curl. Multiplier unknown. | **~0%** |
| §34 coverage (East Berlin) | ❌ Unquantified | Large parts of former East Berlin are §34 (no effective pre-1990 plan, no B-Plan since). No grid-sample run. | **~0% numeric** (§34 → discretionary, no table) |
| LoD2-DE Berlin | ⚠️ Stale | FIS-Broker LoD2 layer — all `/fb/wfs/` paths 404. GDI-BE LoD2 status unconfirmed after FIS-Broker migration. | **~15%** |

---

## Berlin-specific structural complications

### 1. The Baunutzungsplan 1958/60 gap

West Berlin's 1958/60 Baunutzungsplan uses "Baustufen" (construction stages) rather than BauNVO zone letters. It is binding under §173(3) BBauG but:
- The digitised layer is not in the `gdi.berlin.de/services/wfs/bplan` WFS (which covers only XPlanung-era plans)
- All historic FIS-Broker paths are 404
- **OVG Berlin-Brandenburg 2020 (Az. 2 B 10.17)** voided a GFZ 1.5 in Neukölln as *funktionslos* — any Baunutzungsplan-derived value carries judicial voidance risk

This makes Berlin's pre-XPlanung parcel regime both harder to source and less reliable than Hamburg's pre-1960 plans.

### 2. §34 prevalence in East Berlin

Former East Berlin districts (Mitte east, Lichtenberg, Marzahn-Hellersdorf, Hohenschönhausen) have large §34 zones where no effective B-Plan has been adopted since reunification. §34 parcels return no numeric GRZ/GFZ/Höhe — the rule is "fit the neighbourhood" which is a discretionary planning decision, not a table lookup. The fraction of Berlin clicks falling in §34 has not been grid-probed.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Find Baunutzungsplan 1958/60 WFS layer (`gdi.berlin.de` services listing or Stadtentwicklungsamt) | +5–8 pp (covers pre-XPlanung West Berlin) | Medium |
| Run §34 coverage fraction grid-sample over Berlin | Quantifies the §34 floor | Medium |
| Check DiPlanung Berlin pilot for structured GRZ/GFZ/Höhe | +20–30 pp if structured (DiPlanung live in Berlin) | Low |
| Download a Mitte B-Plan PDF — confirm text layer vs raster | Determines PDF transcription viability | Low |
| Fetch BauO Bln §6 via headless browser | Completes Abstandsflächen formula | Medium |
| Resolve LoD2 Berlin endpoint post-FIS-Broker migration | Restores context building height access | Medium |

**Realistic ceiling:**
- If DiPlanung returns structured attributes: **~60–65%** (§34 and Baunutzungsplan fractions impose a ceiling)
- If PDF-transcription required: **~35–40%** (B-Plan PDFs accessible via `scan_www`; Baunutzungsplan adds complexity)
- Baunutzungsplan voidance risk means some "structured" answers carry a legal caveat

---

*Last updated: 2026-07-23. `gdi.berlin.de/services/wfs/bplan` confirmed HTTP 200, DL-DE Zero 2.0. Schema confirmed: GRZ/GFZ/Höhe absent. 89 plans in Mitte bbox.*
