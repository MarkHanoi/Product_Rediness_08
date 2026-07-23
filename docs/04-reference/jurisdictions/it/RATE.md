# Data Readiness Rate — Italy (`it`) national

**Headline rate: ~8%**

> **Structured dimensional fill rate**: the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (parcel geometry + zone identification + at least one
> numeric building parameter) without reading a municipal PDF plan. Methodology mirrors the
> cross-jurisdiction benchmark.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Barcelona | ~48% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Italy (national)** | **~8%** |

Italy's national score is the lowest of any country studied to date. The Catasto WFS provides
parcel geometry (open, CC BY 4.0, nationwide). SITAP and Vincoli in Rete provide heritage overlay
coverage. But **no national machine-readable zoning layer exists** — unlike France's GPU WFS or
Germany's XPlanung. Every zoning query routes through a regional geoportal of uneven quality, and
every numeric building rule lives in a municipal PDF. The regional-instrument split (21 separate
legal mechanisms, not one national code) means even the concept of "zone code" has no universally
safe query key.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS `wfs.cartografia.agenziaentrate.gov.it` — CC BY 4.0, nationwide. Exception: AP Trento and Bolzano have separate systems excluded from national WFS. Not survey-grade (same precision caveat as French PCI Express). | **~90%** (excludes APs; precision caveat applies) |
| Heritage overlay — landscape constraints (SITAP) | ⚠️ Partial | SITAP web-GIS — queryable but self-described as "informational and support character only"; acknowledged incomplete; variable positional accuracy. NOT certifiable. | **~40%** (structurally queryable; informational confidence only) |
| Heritage overlay — listed buildings (Vincoli in Rete) | ⚠️ Partial | Vincoli in Rete — same D.Lgs. 42/2004 regime; same incompleteness caveat as SITAP. | **~35%** |
| **Zone identification** | ❌ No national layer | No national zoning WFS equivalent to France's GPU or Germany's XPlanung. Regional geoportals exist (Lombardy best; Piedmont mosaic with currency caveats; others uneven). Private platforms (UrbisMap, PgtOnLine) are commercial. | **~15%** (Lombardy and Piedmont only; unverified for other regions) |
| DM 1444 zone letter (A/B/C/D/E/F) | ❌ Not reliably operative | Even where zone letters appear in regional WFS, they may not be the operative zoning mechanism — Milan and Rome have superseded them entirely. Cannot be used as a universal key. | **~10%** (small-city PRG-using regions only; not Milan, not Rome) |
| **Indice di fabbricabilità (FAR equivalent, mc/mq or mq/mq)** | ❌ PDF | In municipal plan NTA or piano delle regole — no national GIS layer. DM 1444 Art. 7–8 ceilings are published but are upper bounds only, not operative parcel values. | **~0%** (ceiling only; operative value always in PDF) |
| DM 1444 Art. 7–8 density ceilings | ✅ Published | DM 2 aprile 1968 n. 1444 — published and freely accessible. **Upper bounds only, not operative values.** | **100% (ceiling only; never the parcel answer)** |
| **Max height** | ❌ PDF | In municipal plan NTA — no national or regional height GIS layer identified except Piedmont's ARPA Edifici 3D (existing buildings, not permitted height). | **~0%** |
| **Setbacks** | ⚠️ Floor only | Codice Civile Art. 873 (3 m boundary setback) and DM 1444 Art. 9 (10 m between buildings with facing windows) are published national floors. Regional derogation regimes (DPR 380/2001 Art. 2-bis) may lower them. Operative setback = municipal plan article. | **~5%** (floor only; derogation status unknown per region) |
| Existing building heights (LoD2 equivalent) | ⚠️ Partial (Piedmont only) | ARPA Piemonte Edifici 3D — per-building height from BDTRE + terrain; region-wide for Piedmont. No equivalent confirmed for other regions. National PST/SIM is terrain only (DTM/DSM), not building model. | **~10%** (Piedmont cities only; ~0% everywhere else) |
| Document / plan PDF link | ⚠️ Partial | Regional geoportals (Lombardy best; Piedmont mosaic; others variable). PgtOnLine aggregates across regions commercially. No national GPU-equivalent PDF link service. | **~30%** (well-served regions only) |

---

## Why the rate is critically low

Italy's rate is below France's (22%) because France at least has a **national zoning WFS** (GPU)
that returns zone identification and a PDF link for ~95% of communes. Italy has no equivalent:

1. **No national machine-readable zoning layer.** The GPU/XPlanung-equivalent gap is the defining
   structural fact. Private platforms fill it commercially; no public free alternative was found.
2. **The nominally national zone taxonomy (DM 1444) is not the operative mechanism in Italy's two
   largest cities.** Milan and Rome have each superseded it with mutually incompatible bespoke
   mechanisms. "Read DM 1444 zone letters" would not generalize to either city.
3. **Regional-instrument fragmentation goes deeper than Germany's per-Land split.** In Germany,
   the zone taxonomy (BauNVO) and the query key (zone type letter) are federal and uniform — only
   the licence and the platform vary per Land. In Italy, the taxonomy, instrument type, and
   mechanism each vary independently per region.
4. **No building-height national product** (only terrain/surface from PST/SIM). Germany has
   LoD2-DE coordinated by ZSHH; France has BD TOPO `HAUTEUR` as a continuous national layer.
   Italy has per-region products of unknown existence and variable quality outside Piedmont.

---

## City-level rate comparison

| City | Rate | Primary driver |
|---|---|---|
| **Turin** | **~12%** (contingent) | Best Italian candidate if PRG zone letters confirmed; ARPA Piemonte Edifici 3D available for height context |
| **Milan** | **~5%** | Catasto geometry + SITAP only; PGT territorial-index mechanism has no zone-letter key; numeric rules in PGT NTA PDF |
| **Rome** | **~5%** | Catasto geometry + SITAP only; tessuto typology not machine-queryable at parcel level; direct/indirect intervention split adds a second classification step |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Live-probe Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` — confirm field schema, auth requirements, and GetFeature response format | Confirms parcel geometry baseline; prerequisite for everything else | Low |
| Live-probe Lombardy Geoportale PGT WFS — confirm zone polygon queryability per parcel (Milan) | Milan-specific: determines whether zone identification is an API call or a PDF search | Low |
| Live-probe Piedmont PRG mosaic WMS/WFS for Turin — confirm currency and field schema | Turin-specific: confirms Tier 1 zone-letter availability | Low |
| Read Turin PRG NTA primary text — confirm zone-letter mechanism and numeric table structure | Turin: removes the single biggest assumption blocking any dev-day estimate | Medium |
| Probe SITAP for machine-readable WFS/WCS endpoint (parcel-intersect query) | Raises heritage overlay structured score from web-GIS to programmatic | Low |
| ARPA Piemonte Edifici 3D: live-probe endpoint, field schema, and confirm height field reliability for Turin parcels | Enables Turin context-height layer — Italy's only confirmed regional LoD product | Low |

**Realistic ceiling (without a new national standard):**
- With Catasto + PDF-transcription for the three probe cities: **~20–25%**
- Turin only, if PRG NTA confirmed + ARPA Piemonte Edifici 3D confirmed: **~25–30%**
- Milan or Rome: **~10–15%** each (new engine kinds required; no structured GIS path for numeric rules)

Italy is structurally unlikely to exceed ~25–30% without either a national machine-readable zoning
standard (no current equivalent to CNIG SRU) or a per-city PDF-transcription programme for each
target municipality's NTA.

---

*Last updated: 2026-07-23. Research-level only — no live probes run for Italy. All rates are
estimates from the Italy master study; no field values are confirmed by direct API query.*
