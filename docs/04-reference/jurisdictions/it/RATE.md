# Data Readiness Rate — Italy (`it`) national

**Headline rate: ~9–11%** *(revised from ~8% — see §Amendment log below)*

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
| **Italy (national)** | **~9–11%** |

Italy's national score is the lowest of any country studied to date. The Catasto WFS provides
parcel geometry (open, CC BY 4.0, nationwide). SITAP/APAR and Vincoli in Rete provide heritage
overlay coverage (now confirmed as genuine WFS, not web-GIS only). But **no national
machine-readable zoning layer exists** — unlike France's GPU WFS or Germany's XPlanung. Every
zoning query routes through a regional geoportal of uneven quality, and every numeric building rule
lives in a municipal PDF. The regional-instrument split (21 separate legal mechanisms, not one
national code) means even the concept of "zone code" has no universally safe query key.

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
| Parcel geometry (Catasto) | ✅ Full (with caveat) | Agenzia delle Entrate WFS `wfs.cartografia.agenziaentrate.gov.it` — CC BY 4.0, nationwide. Exception: AP Trento and Bolzano have separate systems excluded from national WFS. Not survey-grade (same precision caveat as French PCI Express). | **~90%** (excludes APs; precision caveat applies) |
| Heritage overlay — landscape constraints (SITAP/APAR) | ⚠️ Partial | **UPDATED:** SITAP has been re-engineered as **APAR/SITAP** with genuine OGC WMS/WFS — confirmed vector data (polygon, line, point features) for D.Lgs. 42/2004 Artt. 136/157 landscape constraints and Art. 142 archaeological zones. Endpoint is behind `sitap.cultura.gov.it`; public vs. MiBACT-restricted access requires live probe. Confidence ceiling still `corroborated` — structured access ≠ certified content; the layer remains self-described as informational/non-exhaustive. | **~50–55%** *(up from ~40%; WFS access confirmed; informational confidence ceiling unchanged)* |
| Heritage overlay — listed buildings (Vincoli in Rete) | ⚠️ Partial | Vincoli in Rete — same D.Lgs. 42/2004 regime; same incompleteness caveat as SITAP. | **~35%** |
| **Zone identification** | ❌ No national layer | No national zoning WFS equivalent to France's GPU or Germany's XPlanung. **UPDATED nuance:** Regional geoportals (Lombardy best; Piedmont mosaic with currency caveats). EU INSPIRE Geoportal is now confirmed as a free federated discovery endpoint for per-comune plan data. Tuscany confirmed as a **negative** (PDF/raster scans, not vector). Palermo publishes a CC BY 4.0 zoning shapefile independently (dated to 2004 council resolution — currency risk); Naples publishes a PUC directly. Score should NOT be read as a flat regional floor — some cities in "weak" regions beat the average; most don't. | **~15%** *(floor still holds; lumpy distribution, not uniform — strong cities in weak regions exist; INSPIRE improves discovery, not data quality)* |
| DM 1444 zone letter (A/B/C/D/E/F) | ❌ Not reliably operative | Even where zone letters appear in regional WFS, they may not be the operative zoning mechanism — Milan and Rome have superseded them entirely. **UPDATED Turin caveat:** Turin's PRG is **actively being rewritten in 2026** — a "regime di salvaguardia" is in effect following adoption of preliminary revision (DCC 123, March 16, 2026). The incoming plan may keep or drop the zone-letter scheme; any dev-day estimate for Turin must be checked against the *incoming* plan, not just the outgoing one. | **~10%** *(small-city PRG-using regions only; not Milan, not Rome; Turin now a **moving target**)* |
| **Indice di fabbricabilità (FAR equivalent, mc/mq or mq/mq)** | ❌ PDF / one Lombardy exception | In municipal plan NTA or piano delle regole — no general GIS layer. DM 1444 Art. 7–8 ceilings are upper bounds only. **UPDATED:** Lombardy's "Indagine Offerta PGT" is a free, structured, region-wide dataset with actual SLP (Superficie Lorda di Pavimento) floor-area figures broken out by residential vs. other functions — not per-parcel FAR, but the closest to structured density data found outside PDFs. Needs direct probe of schema before assuming it raises Lombardy above 0%. | **~0% nationally; Lombardy a potential exception pending schema probe** |
| DM 1444 Art. 7–8 density ceilings | ✅ Published | DM 2 aprile 1968 n. 1444 — published and freely accessible. **Upper bounds only, not operative values.** | **100% (ceiling only; never the parcel answer)** |
| **Max height — permitted** | ❌ PDF | In municipal plan NTA — no national or regional permitted-height GIS layer identified. Still PDF-only for permitted height. | **~0% (permitted height; unchanged)** |
| **Max height — existing buildings (modeled)** | ⚠️ Partial — modeled only | **NEW ROW (updated):** **OpenBuildingMap** (published 2025) provides a free global dataset with per-building height estimated using EU JRC's Global Human Settlement built-up-characteristics layer, covering Italy. **OSM** building footprints are freely downloadable for all of Italy (~2.1 GB extract, ODbL). Neither is authoritative or survey-grade — these are modeled/crowd-sourced estimates. Confidence is materially lower than ARPA Piemonte's surveyed Edifici 3D. Must be flagged explicitly as modeled if used. | **~40–50% (modeled/estimated; NOT permitted height)** |
| **Setbacks** | ⚠️ Floor only | Codice Civile Art. 873 (3 m boundary setback) and DM 1444 Art. 9 (10 m between buildings with facing windows) are published national floors. Regional derogation regimes (DPR 380/2001 Art. 2-bis) may lower them. Operative setback = municipal plan article. | **~5%** (floor only; derogation status unknown per region) |
| Existing building heights — surveyed (LoD2 equivalent) | ⚠️ Partial (Piedmont only) | ARPA Piemonte Edifici 3D — per-building height from BDTRE + terrain; region-wide for Piedmont. **UPDATED:** "~0% elsewhere" is no longer accurate — OSM + OpenBuildingMap provide a national modeled fallback (see Max height row above). Surveyed Piedmont data (~10%) and modeled national data (~30–40%) are categorically different confidence tiers and must never be conflated. | **~10% Piedmont (surveyed) · ~30–40% nationally (modeled — distinct tier)** |
| Document / plan PDF link | ⚠️ Partial | **UPDATED:** Three improvements since original scoring: (1) **UrbisMap has shipped an actual API** (not just a web-GIS) — a documented urban-planning API with technical architecture and endpoints, licensed not free; (2) **Arcai** — new AI chat layer indexing NTA/PRG/PGT/PUC documents article-by-article for 6,252 comuni (~€39/month; acknowledged failure mode on corrupted OCR documents); (3) **dati.gov.it + RNDT** form a free public discovery layer for finding PDF/document links per comune — improves *findability*, not *structure*. | **~35–40%** *(up from ~30%; link findability improved via RNDT/dati.gov.it; link structure unchanged)* |

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
| **AP Bolzano** *(new entrant)* | **TBD — potentially very high** | South Tyrol's NewPlan (unified planning + landscape GIS), CC0 geodata, open geodata program since 2007. May be closer to Denmark's ~96% than Italy's ~8%. Requires direct live probe before any estimate can be given. |

---

## What would raise the rate

| Action | Rate impact | Effort |
|---|---|---|
| Live-probe Catasto WFS `wfs.cartografia.agenziaentrate.gov.it` — confirm field schema, auth requirements, and GetFeature response format | Confirms parcel geometry baseline; prerequisite for everything else | Low |
| **Live-probe APAR/SITAP WFS endpoint** (`sitap.cultura.gov.it`) — confirm auth requirements and whether OGC upgrade is public or MiBACT-restricted | Moves SITAP from "WFS confirmed in documentation" to "WFS confirmed live"; determines whether heritage overlay can be automated | **Low (new priority)** |
| **Script a dati.gov.it sweep** for `prg`/`zonizzazione`/`nta` tags across all comuni | Cheap way to enumerate which comuni publish plan data independently, beyond regional-tier assumptions (finds Palermo/Naples-style exceptions) | **Low (new)** |
| **Confirm Palermo's 2004-dated zoning shapefile currency** against subsequent varianti | Same discipline as Piedmont mosaic currency caveat; Palermo is now a confirmed structured source | **Low (new)** |
| **Direct probe of Lombardy's Indagine Offerta PGT schema** | Single most promising concrete lead for raising indice di fabbricabilità above 0% for one region | **Low → Medium (new)** |
| **Live probe AP Bolzano NewPlan** (WFS availability, licence, parcel-level zoning query) | Highest-value unverified lead in the entire Italy research thread; could overturn "Italy is structurally worst" conclusion for one jurisdiction | **Medium (new — top priority)** |
| Live-probe Piedmont PRG mosaic WMS/WFS for Turin — confirm currency and field schema | Turin-specific: confirms Tier 1 zone-letter availability; must also check whether the 2026 revision changes the zone mechanism | Low |
| Read Turin PRG *revision* text (DCC 123, March 2026) — not just the outgoing PRG | The Tier 1 candidate's mechanism may change mid-project | Medium |
| **Test OpenBuildingMap height field against a known-surveyed reference** (e.g., Piedmont ARPA data) for one city | Establishes how far modeled height diverges from surveyed height before using as a fallback | Medium |
| Live-probe Lombardy Geoportale PGT WFS — confirm zone polygon queryability per parcel (Milan) | Milan-specific: determines whether zone identification is an API call or a PDF search | Low |
| ARPA Piemonte Edifici 3D: live-probe endpoint, field schema, and confirm height field reliability for Turin parcels | Enables Turin context-height layer — Italy's only confirmed regional LoD product | Low |

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
| 2026-07-23 | **Revised to ~9–11%.** SITAP upgraded to APAR/SITAP WFS (50-55%); existing-height national estimate added via OpenBuildingMap/OSM; PDF link improved to 35-40% via RNDT+dati.gov.it; zone identification scoring sharpened (Tuscany confirmed negative; Palermo/Naples confirmed municipal exceptions); Turin PRG now a moving target (DCC 123, 2026 revision); AP Bolzano identified as potential high-scoring outlier; Lombardy Indagine Offerta PGT identified as FAR lead; Veneto gated-access pattern documented | Research rounds 1–4 (see findings/ITALY-MASTER-DATA-SOURCE-STUDY.md §Part D) |

*Last updated: 2026-07-23. Research-level only — no live probes run for Italy. All rates are
estimates from the Italy master study and subsequent research rounds; no field values are confirmed
by direct API query.*
