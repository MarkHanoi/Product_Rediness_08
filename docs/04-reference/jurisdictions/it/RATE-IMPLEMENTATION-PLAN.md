# Rate Implementation Plan — Italy (`it`) national

**Current rate: ~9–11%** · **Realistic mainland ceiling: ~25–30%** · **AP Bolzano ceiling: >50% (unverified)**
**Gap to Denmark (~96%): ~85–87 pp** · **Gap to mainland ceiling: ~14–19 pp**

> This plan shows the ordered sequence of actions that would move Italy's structured dimensional
> fill rate from its current position to its realistic ceiling. Actions are sequenced by dependency
> and cost, not alphabetically. Costs are in dev-days (1 dev-day = ~8 hours of focused engineering
> including research, implementation, and test). Phases are cumulative — each builds on the last.

---

## Why the ceiling is where it is

Italy's mainland ceiling of ~25–30% is set by three structural facts that no amount of engineering
can overcome without external data changes:

1. **No national machine-readable zoning layer.** Unlike France (GPU WFS covers ~95% of communes)
   or Germany (XPlanung/GeoServer per Land), Italy has no public national zoning endpoint. Every
   zoning query must go through a per-region geoportal of uneven quality. Private platforms
   (UrbisMap, PgtOnLine) fill this commercially; the gap is real and monetizable.
2. **The nominally national zone taxonomy (DM 1444) is not operative in Italy's two largest
   cities.** Milan uses a PGT territorial-index-plus-perequation mechanism; Rome uses a
   tessuto-typology mechanism. Neither shares a schema with the other or with any DM 1444 zone
   table. Every city with >500k population studied has independently abandoned the national taxonomy.
3. **No building-height national product (only terrain).** PST/SIM produces DTM/DSM, not semantic
   building layers. Germany has LoD2-DE (ZSHH-coordinated); France has BD TOPO `HAUTEUR`
   (continuous national). Italy has Piedmont (ARPA, surveyed) plus modeled fallbacks
   (OpenBuildingMap/OSM), with no coordinating federal body and no committed national LoD2 product.

**AP Bolzano is the one jurisdiction where this ceiling may not apply.** South Tyrol's NewPlan
system, CC0 geodata since 2007, and INSPIRE-confirmed ZoningElement WFS may put Bolzano closer to
Denmark than to Italy's national average. This is unverified and must be confirmed by a non-Replit
probe before any planning decision relies on it.

---

## Phase 0 — Unblock the three highest-value unverified leads (0.6 dev-days)

*These are the cheapest possible actions and must complete before any pack work begins. All three
can be run in parallel from a non-Replit IP or a browser.*

### P0-A: AP Bolzano ZoningPlan WFS from non-Replit IP (0.25 dev-days)

**What:** The Bolzano GeoServer WMS is confirmed live (`geoservices1.civis.bz.it`). INSPIRE
metadata confirms WFS 2.0.0 exists for `p_bz:Inspire:LandUse.ZoningElement` (CC0, biannual
update, 1:5000). WFS timed out from Replit — almost certainly an IP-range block, not a service
outage.

**Action:**
```bash
# From a browser or non-Replit curl:
curl "https://geoservices1.civis.bz.it/geoserver/p_bz-TerritorialPlans/ows?\
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  | grep -iE '<Name>|FeatureType' | head -40
# If successful:
curl "https://geoservices1.civis.bz.it/geoserver/p_bz-Inspire/ows?\
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'Name' | head -30
```
Then run a GetFeature for Bolzano city centre (lat 46.4983, lon 11.3548 / ETRS-TM32 ~E686000, N5151000).

**Gate:** If WFS is confirmed public + parcel-queryable with zone-type attributes → AP Bolzano becomes
a Tier 0 jurisdiction and must be sequenced before Turin. If WFS is login-gated or zone attributes
absent → Bolzano stays TBD and Turin is the first pack city.

### P0-B: ARPA Piemonte Edifici 3D height field name (0.1 dev-days)

**What:** FeatureServer endpoint confirmed live. `USO` field confirmed. Height field name timed
out from Replit before full schema returned.

**Action:** Open in browser:
`https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0?f=json`
Read the `fields` array. Expect `QUOTA_MEDIA` or `ALTEZZA`. Run one sample query for Turin bbox
(EPSG:32632: xmin=390000, ymin=4990000, xmax=395000, ymax=4995000).

**Gate:** Confirms height field name → enables Turin context-height layer in P2.

### P0-C: APAR/SITAP WFS public access from non-Replit IP (0.25 dev-days)

**What:** Both `sitap.cultura.gov.it` and `sitap.beniculturali.it` returned empty from Replit
2026-07-24. The guida v2.0.0 confirms WFS 2.0.0 alignment behind `sitap.cultura.gov.it`.

**Action:**
```bash
curl "https://sitap.cultura.gov.it/geoserver/wfs?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  | grep -i 'Name\|Title\|vincolo\|paesaggio' | head -20
# Or try ArcGIS REST:
curl "https://sitap.cultura.gov.it/arcgis/rest/services?f=json" | head -40
```
If blocked: email `cartografia@cultura.gov.it` to request the public OGC endpoint.

**Gate:** If public → heritage overlay is automatable for all Italian cities simultaneously.
If MiBACT-restricted → heritage overlay stays at ~35–40% (Vincoli in Rete partial fallback).

---

## Phase 1 — Establish the Turin gate (0.5–0.75 dev-days)

*Dependent on P0-B completing. Independent of P0-A and P0-C.*

### P1-A: Read Turin PRG NTA primary text + DCC 123 revision (0.5 dev-days)

**What:** The entire Tier 1 classification for Turin rests on the unconfirmed assumption that
Turin's PRG NTA uses DM 1444-style zone letters with per-zone numeric tables. Additionally,
Turin's PRG is under active revision (DCC 123, March 2026) — the incoming plan may keep or drop
the zone-letter scheme.

**Action:**
1. Navigate `comune.torino.it/urbanistica` → Piano Regolatore Generale → Norme Tecniche di
   Attuazione. Download the consolidated NTA PDF.
2. Read Art. 1–15 (zone classification) + the first numeric table. Record zone letters and whether
   they map directly to DM 1444 A/B/C/D/E/F or use local mnemonics.
3. Search `comune.torino.it` for "DCC 123 2026" + "variante PRG". Read the preliminary revision
   text to assess the *incoming* plan's zone-classification structure.
4. Confirm "regime di salvaguardia" scope: does it freeze the outgoing plan's operative rules
   (safe), or does it create a gap (risky)?

**Gate:** Binary outcome:
- Zone letters confirmed in incoming plan → Turin is Tier 1; proceed to Phase 2.
- Bespoke mechanism revealed → Turin is Tier 2; re-estimate dev-days before committing Phase 2.

### P1-B: Probe Piedmont PRG mosaic WFS from non-Replit IP (0.25 dev-days)

**What:** The Piedmont regional WFS at `geoportale.piemonte.it/geoserver/ows` timed out / returned
empty from Replit. Try workspace-specific path:
`https://www.geoportale.piemonte.it/geoserver/Urbanistica/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`

Also attempt WMS GetFeatureInfo on the live `ZonediPiano` WMS layer — this may return zone
attributes from the public WMS without needing the restricted vector download.

**Gate:** Confirms zone identification is an API call (enables automated zone lookup for Turin)
vs. requires institutional login for vector data (WMS-visualization-only).

---

## Phase 2 — Turin pack: first Italian city (10–15 dev-days if Tier 1 confirmed)

*Dependent on P1-A and P1-B completing with Tier 1 confirmed.*

| Sub-task | What | Dev-days |
|---|---|---|
| **2.1 — National parcel baseline** | Catasto WFS integration (already live-confirmed; implement `CP:CadastralParcel` GetFeature for lat/lon bbox). BBOX axis order: lat_min,lon_min,lat_max,lon_max (EPSG:6706). | 1–2 |
| **2.2 — Piedmont PRG mosaic zone lookup** | Connect to Piedmont WFS (or WMS GetFeatureInfo if vector restricted); return zone letter for parcel. Confirm currency of "Zone di Piano" layer (currently updated 2025-06-30). | 2–3 |
| **2.3 — NTA transcription (per-zone numeric table)** | Read and source zone-by-zone numeric parameters: `indice di fabbricabilità` (mc/mq), max height, coverage %. Record source article for each value. Flag DM 1444 Art. 7–8 ceilings as upper-bound-only (not operative). | 3–5 |
| **2.4 — ARPA Piemonte building-height context** | Integrate Edifici 3D FeatureServer; height field (name from P0-B). Flag as "surveyed existing height — not permitted height." Handle 2017 vintage: note possible staleness for new construction post-2017. | 1–2 |
| **2.5 — SITAP/Vincoli in Rete heritage overlay** | If P0-C confirmed public: WFS integration. If not: Vincoli in Rete web-scrape / partial fallback. Flag as "informational only — NOT FOUND does not certify absence." | 1–2 |
| **2.6 — National floor rules** | Codice Civile Art. 873 (3 m boundary setback), DM 1444 Art. 9 (10 m between facing buildings — check Piedmont's DPR 380/2001 Art. 2-bis derogation before shipping). | 0.5–1 |

**Phase 2 ceiling (Tier 1 confirmed): ~25–35%** (zone + one numeric field per zone + ARPA height context)
**Phase 2 ceiling (Tier 2 forced): re-estimate from scratch — approximately 20–25 dev-days for new engine kind**

---

## Phase 3 — Milan pack: new engine kind (20–25 dev-days)

*Parallel to Turin; dependent on P0-C for heritage overlay. Independent of Phase 2.*

| Sub-task | What | Dev-days |
|---|---|---|
| **3.1 — Lombardy PGT WFS** | Probe Lombardy Geoportale WFS for PGT Piano delle Regole zone polygon. Previous probe returned 404/page-not-found — try workspace-specific paths. If no public WFS: document as gap. | 0.5–1 |
| **3.2 — PGT Piano delle Regole NTA read** | Read NTA to confirm 0.35 mq/mq TUC base index, 0.70 mq/mq ceiling via perequation, ERS zone rules, agricultural carve-outs. | 2–3 |
| **3.3 — Perequation ledger access investigation** | Dedicate a sourcing pass to determine whether the perequation ledger (transacted rights per parcel) is publicly queryable — via Milan SIT, PGT portal, UrbisMap API (licensed), or administrative request. | 1–2 |
| **3.4 — Build TUC territorial-index engine kind** | New engine kind: single citywide index (0.35 mq/mq) applied to each parcel via lotto funzionale. Base-index answer = computable; ceiling answer = "requires perequation ledger lookup" if ledger unavailable. | 5–8 |
| **3.5 — ERS + agricultural carve-outs** | Separate rule sets from PGT NTA; secondary sourcing after TUC dominant mechanism. | 2–3 |
| **3.6 — Heritage overlay + national floor rules** | SITAP (if P0-C confirmed) + Vincoli in Rete + CC Art. 873 + DM 1444 Art. 9 (check Lombardy RET derogations). | 1–2 |

**Phase 3 ceiling (perequation ledger unavailable): ~15–20%** (zone + base index only; ceiling = reasoned partial)
**Phase 3 ceiling (perequation ledger publicly queryable): ~25–35%**

---

## Phase 4 — Rome pack: new engine kind (25–30 dev-days)

*Parallel to Milan; independent of Phases 2 and 3.*

| Sub-task | What | Dev-days |
|---|---|---|
| **4.1 — Roma Capitale SIT tessuto WFS probe** | Probe `sit.comune.roma.it` for PRG sistema/tessuto WFS queryability. If confirmed: tessuto type is an API call. If not: document gap. | 0.5–1 |
| **4.2 — PRG NTA consolidated text** | Read current PRG NTA to confirm: (a) Carta per la Qualità precedence direction; (b) direct/indirect intervention regime scope for each sistema. | 2–3 |
| **4.3 — Build direct/indirect intervention classifier** | Prerequisite engine component: classifies each parcel as direct (numeric envelope readable) vs. indirect (refusal until executive plan). Analogous to Germany's §30/§34/§35 classifier. | 3–5 |
| **4.4 — Build tessuto typology engine kind** | New engine kind: Città Storica (per-tessuto NTA articles at 1:5,000) + Città Consolidata T1/T2/T3 typology rules. Not a zone-letter config. | 8–12 |
| **4.5 — Città da Ristrutturare / Trasformazione refusal vocabulary** | Implement reasoned-refusal posture for indirect-intervention zones: "no numeric building envelope until executive plan adopted." | 0.5–1 |
| **4.6 — Heritage overlay + national floor rules** | SITAP + Vincoli in Rete + Carta per la Qualità (if machine-readable) + CC Art. 873 + DM 1444 Art. 9 (check Lazio derogation). | 1–2 |

**Phase 4 ceiling (Consolidata T1/T2/T3 + Storica under direct intervention): ~30–35%**

---

## Phase 5 — AP Bolzano fast-track (if P0-A confirms WFS public) (5–10 dev-days)

*Triggered by P0-A gate. Independent of Phases 2–4. Potentially higher ceiling than any mainland city.*

If the Bolzano ZoningPlan WFS is confirmed public, parcel-queryable, and carries zone-type
attributes (CC0, daily update, 1:5000 per INSPIRE metadata), Bolzano may approach Denmark's ~96%
level. The fast-track would:

1. Integrate `geoservices1.civis.bz.it` WFS for parcel-level zoning
2. Map zone attributes to PCTP (Autonomous Province planning instrument) building parameters
3. Confirm heritage overlay integration (NewPlan reportedly merges planning + landscape constraints into one system — the "SITAP separate from PRG" split may not apply here)
4. Confirm Bolzano's own cadastral system (separate from national Catasto — AP has its own by
   statutory delegation; do NOT use `wfs.cartografia.agenziaentrate.gov.it` for Bolzano)

**Phase 5 ceiling: TBD pending P0-A probe; potentially >50%.**

---

## Gap to Denmark (~96%)

| Gap component | Points lost | Bridgeable? |
|---|---|---|
| No national zoning WFS (GPU/XPlanung equivalent) | ~50 pp | ❌ Not without a national standard (no current Italian initiative found) |
| Large cities have abandoned DM 1444 zone letters (Milan + Rome = new engine kinds) | ~15 pp | ⚠️ Bridgeable per city (new kinds required) |
| No national building-height product (surveyed) | ~20 pp | ⚠️ Piedmont partially bridges; modeled fallback nationwide |
| Municipal NTA fragmentation (numbers in PDFs, not GIS) | ~15 pp | ⚠️ PDF transcription per city |
| AP Bolzano may not have this gap at all | — | ✅ Probe required |

**Summary:** Italy will not reach Denmark levels on the mainland without either a national zoning
standard (no current equivalent to Plandata.dk) or a per-city PDF-transcription programme covering
all ~7,900 comuni. The pragmatic ceiling — building only on confirmed structured sources — is
~25–30% for Turin, ~15–20% for Milan (without perequation ledger), and ~30–35% for Rome. AP
Bolzano is the one outlier that may break this ceiling.

---

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
