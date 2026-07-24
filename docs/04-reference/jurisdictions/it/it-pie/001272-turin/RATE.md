# Data Readiness Rate — Turin (`001272`)

**Headline rate: ~12% (contingent)**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

> ⚠ **The ~12% figure is contingent on the unconfirmed assumption that Turin's current PRG NTA
> uses DM 1444-style zone letters with per-zone numeric tables.** If the NTA has been reformed
> toward a bespoke mechanism (as Milan and Rome have), the rate drops to ~5% and the dev-day
> estimate rises from ~10–15 to ~20–25+. Additionally, **Turin's PRG is actively being rewritten
> in 2026** — "regime di salvaguardia" is in effect (DCC 123, March 16, 2026). The incoming plan
> may keep or drop the zone-letter scheme; the ~12% estimate applies to whichever version is
> current at implementation time.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Turin** | **~12% (contingent)** |
| Italy (national) | ~9–11% |
| Milan | ~5% |
| Rome | ~5% |

Turin rates higher than Milan or Rome because: (1) Catasto WFS provides parcel geometry
(**VERIFIED-LIVE 2026-07-24**); (2) the Piedmont PRG mosaic WMS *plausibly* covers Turin's zone
letters at current-date currency — **WMS confirmed live (updated 2025-06-30); vector download
"accesso riservato"**; (3) ARPA Piemonte Edifici 3D provides building-height context data
(**WMS + FeatureServer confirmed live 2026-07-24; height field name TBD**); (4) if the PRG NTA
confirms zone letters in the *incoming* plan, the numeric rules follow directly from the NTA PDF
with no new engine kind required. Every one of these factors is contingent on live probes and a
primary-text NTA read that have not yet been completed.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php` — CC BY 4.0. **✅ VERIFIED-LIVE 2026-07-24** for Turin (ISTAT code L219). Not survey-grade. | **~90%** (precision caveat; URL and schema confirmed) |
| Heritage overlay (SITAP/APAR) | ⚠️ Informational | APAR/SITAP — re-engineered with genuine OGC WMS/WFS (confirmed in documentation). **Unreachable from Replit 2026-07-24.** Informational only; acknowledged incomplete. Turin's centro storico (Savoy royal buildings — UNESCO listed) is high-heritage density. | **~35%** (public WFS access unconfirmed) |
| Heritage overlay (Vincoli in Rete) | ⚠️ Informational | Same caveat. | **~35%** |
| **Zone identification (Piedmont PRG mosaic WMS)** | ⚠️ Partially confirmed | **✅ PARTIALLY VERIFIED-LIVE 2026-07-24:** Turin PRG "Zone di Piano" WMS live at `geomap.reteunitaria.piemonte.it/…/wms_sicc23_prg_azzonamento`. Layers confirmed: `ZonediPiano`, `LimitiZoneDiPiano`, `AreeDiPiano`. Dataset updated **2025-06-30**. Vector download (`zone_di_piano.zip`) is **"accesso riservato"** (institutional login required). Piedmont regional WFS timed out from Replit — must probe from non-Replit IP. Zone-letter field name TBD. | **~25%** (WMS confirmed; vector layer and field schema unconfirmed; mechanism contingent on NTA) |
| **DM 1444 zone letter (A/B/C/D/E/F)** | ⚠️ Contingent | If PRG NTA confirms DM 1444 zone letters as operative mechanism in the *incoming* plan: zone letter queryable from Piedmont mosaic. If NTA uses bespoke mechanism or if the 2026 revision drops zone letters: zone letter is wrong key. | **~20%** (contingent on NTA confirmation of incoming plan) |
| **Indice di fabbricabilità** (`mc/mq`) | ❌ PDF (NTA) | In PRG NTA per-zone article — no regional GIS layer for this attribute. DM 1444 Art. 7–8 ceilings are published upper bounds only. | **~0%** (NTA PDF required) |
| **Max height** | ❌ PDF (NTA) | In PRG NTA per-zone article. | **~0%** |
| **Coverage / footprint** | ❌ PDF (NTA) | In PRG NTA per-zone article. | **~0%** |
| DM 1444 Art. 7–8 density ceilings | ✅ Published ceiling | National published upper bounds. **Ceilings only, not operative values.** | **100% (ceiling only)** |
| Existing building heights | ✅ **Partially confirmed live** | **ARPA Piemonte Edifici 3D — ✅ PARTIALLY VERIFIED-LIVE 2026-07-24.** WMS live: `webgis.arpa.piemonte.it/…/Edifici_3D_2017/MapServer/WMSServer`. ArcGIS FeatureServer live: `…/FeatureServer/0`. Field `USO` confirmed (P/R/S). Height field name TBD — full schema timed out from Replit; expected `QUOTA_MEDIA` or `ALTEZZA`. 2017 dataset — may be outdated for new construction. | **~60%** (dataset confirmed live; height field name and urban-core reliability TBD) |
| Regolamento Edilizio setbacks | ❌ Not read | Turin RE governs setbacks; field names and multipliers not read. National floors (CC Art. 873: 3 m; DM 1444 Art. 9: 10 m) are the only confirmed values. | **~5%** (national floor only) |

---

## The contingency that matters most

**If NTA confirms DM 1444 zone letters in the incoming plan:** Turin is a zone-letter config case.
The Piedmont PRG mosaic WMS (if the WFS is confirmed current for Turin) provides zone
identification; the NTA PDF provides the per-zone numeric table. No new engine kind is needed.
Realistic ceiling after NTA read + mosaic probe: **~25–35%** (zone + national distance floors +
ARPA Piemonte building height context).

**If NTA reveals a bespoke mechanism:** Turin becomes Tier 2. The dev-day estimate rises to
~20–25+ and a new engine kind must be scoped. The ARPA Piemonte building-height advantage remains,
but the numeric rule pipeline starts from scratch.

**If the 2026 PRG revision (DCC 123) drops zone letters entirely:** same consequence as above —
the mechanism changes mid-project. The "regime di salvaguardia" currently in effect means the
outgoing plan's operative rules may be frozen while the new plan is adopted; this scope must be
confirmed.

This single binary question — confirmed by reading ~20 pages of NTA — is the cheapest possible
research step and should be the first action before any Turin build decision.

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Read Turin PRG NTA — confirm zone-letter mechanism in the *incoming* plan AND scope of "regime di salvaguardia" | Binary: either confirms Tier 1 (+15 pp potential) or reveals Tier 2 need (rate stays ~5%) | Medium — one PDF read (~20–40 pages) + DCC 123 check |
| Confirm ARPA Piemonte Edifici 3D height field name — open FeatureServer `?f=json` in browser | Confirms or adjusts building-height score; low-hanging fruit | Very low (0.1 dev-days) |
| Live-probe Piedmont PRG mosaic WFS from non-Replit IP — confirm zone-letter field and Turin layer currency | Confirms zone identification is API vs WMS-only; prerequisite for automated zone lookup | Low |
| Read NTA per-zone articles — extract height, coverage, density for each zone type | +10–20 pp (NTA transcription, zone by zone) | High — full NTA read |

**Realistic ceiling after full NTA read + mosaic + ARPA probes (if Tier 1 confirmed):**
- Zone + one numeric field per zone: **~30–40%**
- Full NTA transcription for all zone types: **~45–55%** — approaching Barcelona levels
- ARPA Piemonte building-height context: adds context data, not envelope data; does not raise the
  fill rate but substantially improves the 3D context product quality

Turin is Italy's best near-term opportunity: if the NTA assumption holds, it could reach
Barcelona-comparable structured fill rates with moderate transcription investment.

---

*Last updated: 2026-07-24. Catasto WFS VERIFIED LIVE for Turin (ISTAT L219) 2026-07-24; PRG "Zone di Piano" WMS confirmed live (updated 2025-06-30); ARPA Piemonte Edifici 3D WMS + FeatureServer confirmed live; height field name TBD; PRG NTA zone-letter mechanism unconfirmed. Maintainer: UNASSIGNED.*
