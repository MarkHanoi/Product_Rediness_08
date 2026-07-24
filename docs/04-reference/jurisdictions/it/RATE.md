# Data Readiness Rate — Italy (`it`) national

**Headline rate: ~9–11%**

> **Structured dimensional fill rate** — the fraction of parcel-level building-rule queries that
> return a complete, machine-readable answer (**zone/use code + a density metric [FAR / coverage /
> BYA / BRA / %-utilisation] + height**) **without reading an ordinance text/PDF**. This definition
> is IDENTICAL across every jurisdiction (Denmark / Madrid / Saudi / Barcelona / Norway / Germany /
> France …) so the scores are directly comparable. Derived from direct endpoint/schema checks, not
> assumed from the jurisdiction's open-data reputation.

| Jurisdiction | Rate |
|---|---|
| Denmark | ~96% |
| Madrid | ~68% |
| Saudi (national) | ~55% |
| Barcelona | ~48% |
| Norway (national) | ~32% |
| Germany (national) | ~28% |
| France (national) | ~22% |
| **Italy (national)** | **~9–11%** |

Italy's national score is the lowest of any country studied to date. The Catasto WFS provides
parcel geometry (open, CC BY 4.0, nationwide — **now VERIFIED-LIVE 2026-07-24**). SITAP/APAR and
Vincoli in Rete provide heritage overlay coverage (now confirmed as genuine WFS, not web-GIS only).
But **no national machine-readable zoning layer exists** — unlike France's GPU WFS or Germany's
XPlanung. Every zoning query routes through a regional geoportal of uneven quality, and every
numeric building rule lives in a municipal PDF. The regional-instrument split (21 separate legal
mechanisms, not one national code) means even the concept of "zone code" has no universally safe
query key.

The headline is revised upward from ~8% mainly because: (a) SITAP is now confirmed as a genuine
WFS (APAR/SITAP), not just a web-GIS; (b) the EU INSPIRE Geoportal and dati.gov.it+RNDT
discovery layer improve municipality-level PDF-link findability; and (c) the original
"~0% everywhere outside Piedmont" claim for existing building heights is no longer accurate
(OpenBuildingMap + OSM provide a modeled national estimate). None of these are structural breaks
— the diagnosis (no national zoning layer, 21 independent legal mechanisms, Milan/Rome
permanently off DM 1444) is unchanged.

---

## Field-by-field breakdown

| Field | Structured? | Source | Score |
|---|---|---|---|
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS — CC BY 4.0, nationwide. **✅ VERIFIED-LIVE 2026-07-24.** Correct URL: `https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php` (⚠️ NOT `ows01_CXF.php`). Feature types: `CP:CadastralParcel`, `CP:CadastralZoning`. Fields: `NATIONALCADASTRALREFERENCE`, `ADMINISTRATIVEUNIT`, `LABEL`. CRS: EPSG:6706. No auth. Confirmed for Turin, Milan, Rome. Exception: AP Trento and Bolzano separate systems. | **~90%** (excludes APs; precision caveat applies; URL and schema now live-confirmed) |
| Heritage overlay — landscape constraints (SITAP/APAR) | ⚠️ Partial | **UPDATED:** SITAP has been re-engineered as **APAR/SITAP** with genuine OGC WMS/WFS — confirmed vector data (polygon, line, point features) for D.Lgs. 42/2004 Artt. 136/157 landscape constraints and Art. 142 archaeological zones. Endpoint is behind `sitap.cultura.gov.it`; **unreachable from Replit 2026-07-24** — public vs. MiBACT-restricted access requires probe from non-cloud IP. Confidence ceiling still `corroborated` — structured access ≠ certified content; the layer remains self-described as informational/non-exhaustive. | **~50–55%** *(up from ~40%; WFS access confirmed in documentation; public access unverified from Replit)* |
| Heritage overlay — listed buildings (Vincoli in Rete) | ⚠️ Partial | Vincoli in Rete — same D.Lgs. 42/2004 regime; same incompleteness caveat as SITAP. | **~35%** |
| **Zone identification** | ❌ No national layer | No national zoning WFS equivalent to France's GPU or Germany's XPlanung. **UPDATED nuance:** Regional geoportals (Lombardy best; Piedmont mosaic with currency caveats). EU INSPIRE Geoportal is confirmed as a free federated discovery endpoint for per-comune plan data. Tuscany confirmed as a **negative** (PDF/raster scans, not vector). Palermo publishes a CC BY 4.0 zoning shapefile independently (dated to 2004 council resolution — currency risk); Naples publishes a PUC directly. Score should NOT be read as a flat regional floor — some cities in "weak" regions beat the average; most don't. | **~15%** *(floor still holds; lumpy distribution, not uniform — strong cities in weak regions exist; INSPIRE improves discovery, not data quality)* |
| DM 1444 zone letter (A/B/C/D/E/F) | ❌ Not reliably operative | Even where zone letters appear in regional WFS, they may not be the operative zoning mechanism — Milan and Rome have superseded them entirely. **UPDATED Turin caveat:** Turin's PRG is **actively being rewritten in 2026** — a "regime di salvaguardia" is in effect following adoption of preliminary revision (DCC 123, March 16, 2026). The incoming plan may keep or drop the zone-letter scheme; any dev-day estimate for Turin must be checked against the *incoming* plan, not just the outgoing one. | **~10%** *(small-city PRG-using regions only; not Milan, not Rome; Turin now a **moving target**)* |
| **Indice di fabbricabilità (FAR equivalent, mc/mq or mq/mq)** | ❌ PDF / one Lombardy exception | In municipal plan NTA or piano delle regole — no general GIS layer. DM 1444 Art. 7–8 ceilings are upper bounds only. **UPDATED:** Lombardy's "Indagine Offerta PGT" is a free, structured, region-wide dataset with actual SLP (Superficie Lorda di Pavimento) floor-area figures broken out by residential vs. other functions — not per-parcel FAR, but the closest to structured density data found outside PDFs. Schema not yet probed. | **~0% nationally; Lombardy a potential exception pending schema probe** |
| DM 1444 Art. 7–8 density ceilings | ✅ Published | DM 2 aprile 1968 n. 1444 — published and freely accessible. **Upper bounds only, not operative values.** | **100% (ceiling only; never the parcel answer)** |
| **Max height — permitted** | ❌ PDF | In municipal plan NTA — no national or regional permitted-height GIS layer identified. Still PDF-only for permitted height. | **~0% (permitted height; unchanged)** |
| **Max height — existing buildings (modeled)** | ⚠️ Partial — modeled only | **NEW ROW (updated):** **OpenBuildingMap** (published 2025) provides a free global dataset with per-building height estimated using EU JRC's Global Human Settlement built-up-characteristics layer, covering Italy. **OSM** building footprints are freely downloadable for all of Italy (~2.1 GB extract, ODbL). Neither is authoritative or survey-grade — these are modeled/crowd-sourced estimates. Must be flagged explicitly as modeled if used. | **~40–50% (modeled/estimated; NOT permitted height)** |
| **Setbacks** | ⚠️ Floor only | Codice Civile Art. 873 (3 m boundary setback) and DM 1444 Art. 9 (10 m between buildings with facing windows) are published national floors. Regional derogation regimes (DPR 380/2001 Art. 2-bis) may lower them. Operative setback = municipal plan article. | **~5%** (floor only; derogation status unknown per region) |
| Existing building heights — surveyed (LoD2 equivalent) | ⚠️ Partial (Piedmont only) | ARPA Piemonte Edifici 3D — per-building footprints + use type (USO field) from BDTRE + terrain; region-wide for Piedmont. **✅ PARTIALLY VERIFIED-LIVE 2026-07-24:** WMS live at `webgis.arpa.piemonte.it/…/Edifici_3D_2017/MapServer/WMSServer`; FeatureServer `/FeatureServer/0` live; height field name TBD (full schema timed out from Replit). "~0% elsewhere" is no longer accurate — OSM + OpenBuildingMap provide a national modeled fallback (see Max height row above). Surveyed Piedmont data (~10%) and modeled national data (~30–40%) are categorically different confidence tiers and must never be conflated. | **~10% Piedmont (surveyed) · ~30–40% nationally (modeled — distinct tier)** |
| Document / plan PDF link | ⚠️ Partial | **UPDATED:** Three improvements since original scoring: (1) **UrbisMap has shipped an actual API** — a documented urban-planning API with technical architecture and endpoints, licensed not free; (2) **Arcai** — new AI chat layer indexing NTA/PRG/PGT/PUC documents article-by-article for 6,252 comuni (~€39/month); (3) **dati.gov.it + RNDT** form a free public discovery layer for finding PDF/document links per comune — improves *findability*, not *structure*. | **~35–40%** *(up from ~30%; link findability improved via RNDT/dati.gov.it; link structure unchanged)* |

---

## The structural gap

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

**Structural Italian pattern:** every regional aggregator and overlay layer (SITAP, Piedmont
mosaic, Campania SIT, Roma Capitale mosaic project, Veneto IDT for PUC) carries some version of
"convenient but not certifying" — explicitly informational, not legally evidentiary. This is
structural to Italy's geodata ecosystem, not a one-off gap. The distinction between *structured
access* and *certified content* must be maintained on every Italian data row.

---

## City-level rate comparison

| City | Rate | Primary driver |
|---|---|---|
| **Turin** | **~12%** *(contingent, and currently a moving target)* | Best Italian candidate if PRG zone letters confirmed in the *incoming* (post-DCC 123) plan; ARPA Piemonte Edifici 3D available for height context. PRG under active revision in 2026 — zone-letter mechanism may change. |
| **Milan** | **~5%** | Catasto geometry + SITAP only; PGT territorial-index mechanism has no zone-letter key; numeric rules in PGT NTA PDF |
| **Rome** | **~5%** | Catasto geometry + SITAP only; tessuto typology not machine-queryable at parcel level; direct/indirect intervention split adds a second classification step |
| **AP Bolzano** *(new entrant)* | **TBD — potentially very high** | South Tyrol's NewPlan (unified planning + landscape GIS), CC0 geodata, open geodata program since 2007. WMS CONFIRMED LIVE 2026-07-24; WFS exists per INSPIRE metadata but timed out from Replit. May be closer to Denmark's ~96% than Italy's ~9–11%. Requires non-Replit WFS probe before any estimate can be given. |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| **Live-probe AP Bolzano ZoningPlan WFS from non-Replit IP** — confirm feature type names, zone-type attributes, and public access | Highest-value unverified lead; could overturn "Italy is structurally worst" for at least one jurisdiction | **Low (0.25 dev-days) — top priority** |
| **Live-probe APAR/SITAP WFS from non-Replit IP** (`sitap.cultura.gov.it`) — confirm auth requirements | Moves SITAP from "WFS confirmed in documentation" to "WFS confirmed publicly accessible" | **Low (0.25 dev-days)** |
| **Confirm ARPA Piemonte Edifici 3D height field name** — open FeatureServer endpoint in browser; read `fields` array | Directly enables Turin context-height layer | **Very low (0.1 dev-days)** |
| **Direct probe of Lombardy's Indagine Offerta PGT schema** | Single most promising concrete lead for raising indice di fabbricabilità above 0% for one region | **Low → Medium** |
| **Read Turin PRG NTA primary text AND DCC 123 revision text** | Confirms or denies the zone-letter mechanism in the *incoming* plan; gates all Turin pack work | **Medium (0.5 dev-days)** |
| **Script a dati.gov.it sweep** for `prg`/`zonizzazione`/`nta` tags across all comuni | Cheap way to enumerate which comuni publish plan data independently | **Low** |
| Live-probe Piedmont PRG mosaic WFS from non-Replit IP — confirm zone-letter field and Turin currency | Turin-specific: confirms Tier 1 zone-letter availability | Low |
| Live-probe Lombardy Geoportale PGT WFS — confirm zone polygon queryability per parcel (Milan) | Milan-specific: determines whether zone identification is an API call or a PDF search | Low |

**Realistic ceiling (without a new national standard):**
- With Catasto + PDF-transcription for the three probe cities: **~20–25%**
- Turin only, if PRG NTA confirmed (incoming plan) + ARPA Piemonte Edifici 3D confirmed: **~25–30%**
- AP Bolzano, if NewPlan WFS confirmed public + parcel-queryable: potentially **>50%** (requires direct probe)
- Milan or Rome: **~10–15%** each (new engine kinds required; no structured GIS path for numeric rules)

Italy is structurally unlikely to exceed ~25–30% for Turin/Milan/Rome without either a national
machine-readable zoning standard (no current equivalent to CNIG SRU) or a per-city PDF-transcription
programme. The AP Bolzano outlier is the one jurisdiction where this ceiling may not apply.

---

## Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-07-23 | Initial rate: ~8% | ITALY-MASTER-DATA-SOURCE-STUDY.md |
| 2026-07-23 | **Revised to ~9–11%.** SITAP upgraded to APAR/SITAP WFS (50–55%); existing-height national estimate added via OpenBuildingMap/OSM; PDF link improved to 35–40% via RNDT+dati.gov.it; zone identification scoring sharpened (Tuscany confirmed negative; Palermo/Naples confirmed municipal exceptions); Turin PRG now a moving target (DCC 123, 2026 revision); AP Bolzano identified as potential high-scoring outlier; Lombardy Indagine Offerta PGT identified as FAR lead; Veneto gated-access pattern documented | Research rounds 1–4 (see findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §Part D) |
| 2026-07-24 | **Live probe session run.** Catasto WFS **CONFIRMED LIVE** (URL corrected: `owfs01.php` not `ows01_CXF.php`; confirmed for Turin L219, Milan F205, Rome H501). AP Bolzano GeoServer WMS confirmed live at `geoservices1.civis.bz.it`; INSPIRE metadata confirms WFS 2.0.0 exists (CC0, daily); WFS timed out from Replit — must probe from non-Replit IP. ARPA Piemonte Edifici 3D WMS + FeatureServer confirmed live; height field name TBD. Turin PRG "Zone di Piano" WMS confirmed live (updated 2025-06-30); vector download is "accesso riservato". SITAP/APAR unreachable from Replit. Lombardy PGT WFS endpoint not found. Rate unchanged — confirmed sources already factored in prior estimates. | See NEXT.md §1 and SOURCES.md |

*Last updated: 2026-07-24. Catasto WFS VERIFIED LIVE (2026-07-24); AP Bolzano WMS PARTIALLY VERIFIED LIVE; all zoning and rule-value rows are research-level estimates — no operative planning parameter confirmed by live probe. Maintainer: UNASSIGNED.*
