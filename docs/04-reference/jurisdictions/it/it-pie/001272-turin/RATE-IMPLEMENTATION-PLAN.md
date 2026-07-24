# Rate Implementation Plan — Turin (`001272`)

**Current rate: ~12% (contingent)** · **Realistic ceiling: ~45–55% (Tier 1) / ~20–25% (Tier 2)**
**Gap to Denmark (~96%): ~84 pp** · **Gap to ceiling: ~33–43 pp (Tier 1)**

> This plan shows the ordered sequence of actions that would move Turin's structured dimensional
> fill rate from its current position to its realistic ceiling. Costs are in dev-days. Phases are
> cumulative. The entire plan is gated on a single binary question (§Phase 0): does Turin's PRG NTA
> use DM 1444 zone letters in the *incoming* (post-DCC 123) plan, or has it switched to a bespoke
> mechanism? Do not begin any Phase 1+ work until this question is answered.

---

## Why the ceiling is where it is

**Tier 1 ceiling (~45–55%):** If the PRG NTA zone-letter mechanism is confirmed in the incoming
plan, Turin has three structured assets that no other Italian city can match:
- **Catasto WFS** — parcel geometry, VERIFIED-LIVE (CC BY 4.0, nationwide)
- **Piedmont PRG mosaic** — zone identification via WMS (confirmed live 2025-06-30); WFS
  access from non-Replit IP still needed to confirm zone-attribute field names
- **ARPA Piemonte Edifici 3D** — per-building existing heights, PARTIALLY VERIFIED-LIVE; height
  field name TBD

The ceiling is ~45–55% (approaching Barcelona) because every numeric building parameter (height,
coverage, indice di fabbricabilità) is in the NTA PDF, not in a GIS layer. The zone letter is
queriable; the numbers behind it require PDF transcription.

**Tier 2 ceiling (~20–25%):** If the NTA has reformed to a bespoke mechanism (as Milan and Rome
have), Turin loses the zone-letter key and a new engine kind must be scoped. The ARPA Piemonte
height advantage remains, but the numeric rule pipeline starts from scratch and the ceiling drops.

**The 2026 revision risk (DCC 123):** Turin's PRG is being actively rewritten. A "regime di
salvaguardia" is in effect — operative rules from the outgoing plan may apply while the new plan
is adopted, OR a gap may exist. Confirming the scope of the salvaguardia is part of the Phase 0
NTA read and cannot be deferred.

---

## Phase 0 — Confirm or deny the zone-letter mechanism (0.6 dev-days) ← DO FIRST

*All other phases are blocked until this completes. Cost is low; benefit is maximum information.*

### P0-A: Read Turin PRG NTA primary text + DCC 123 revision (0.5 dev-days)

**Action:**
1. Navigate `comune.torino.it/urbanistica` → Piano Regolatore Generale → Norme Tecniche di
   Attuazione. Download the consolidated NTA PDF.
2. Read Art. 1–15 (zone-classification articles). Record: (a) zone letters used (DM 1444 A/B/C
   or local mnemonics like B1, B2, C3); (b) whether per-zone numeric tables follow directly;
   (c) whether the mechanism has been reformed to a non-letter-keyed system.
3. Search `comune.torino.it` for "DCC 123 2026" and "variante PRG". Read the preliminary revision
   text for its zone-classification structure.
4. Confirm "regime di salvaguardia" scope: (a) does it freeze the outgoing plan's operative rules
   (safe to implement against outgoing plan), or (b) does it create an operative gap?

**Outcomes:**
- **Zone letters confirmed in incoming plan + salvaguardia scope clear → Tier 1 → proceed to Phase 1**
- **Bespoke mechanism revealed → Tier 2 → halt, re-estimate, redesign before Phase 1**
- **Salvaguardia creates operative gap → add a "regime-undetermined" refusal kind before Phase 1**

### P0-B: Confirm ARPA Piemonte Edifici 3D height field name (0.1 dev-days)

**Action:** Open in browser:
`https://webgis.arpa.piemonte.it/ags/rest/services/topografia_dati_di_base/Edifici_3D_2017/FeatureServer/0?f=json`
Read the `fields` array to find the height field (expect `QUOTA_MEDIA` or `ALTEZZA`). Run one
sample query for Turin bbox (EPSG:32632: xmin=390000, ymin=4990000, xmax=395000, ymax=4995000)
and inspect returned values against known building heights for the area.

**Gate:** Confirmed field name → enables Phase 2.4. Also note whether the 2017 vintage has been
superseded by a later dataset on the ARPA Piemonte geoportal.

---

## Phase 1 — Confirm zone layer access (0.25 dev-days)

*Dependent on P0-A (Tier 1 outcome). Run in parallel with Phase 0 research if possible.*

### P1: Probe Piedmont PRG mosaic WFS from non-Replit IP

**What:** The Turin PRG "Zone di Piano" WMS is confirmed live (updated 2025-06-30). The vector
download (`zone_di_piano.zip`) is "accesso riservato". The Piedmont regional WFS timed out from
Replit. Two probe paths:

1. **WFS probe from non-Replit IP:**
   `https://www.geoportale.piemonte.it/geoserver/Urbanistica/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`
   → confirm feature type name for current PRG zoning layer.

2. **WMS GetFeatureInfo on the live layer** (does not require vector download):
   Use `REQUEST=GetFeatureInfo` on the confirmed WMS at
   `geomap.reteunitaria.piemonte.it/ws/siccms/coto-01/wmsg01/wms_sicc23_prg_azzonamento`
   with `QUERY_LAYERS=ZonediPiano` for a Turin parcel coordinate.
   This may return zone attributes from the public WMS without institutional login.

**Gate:** If zone-letter attribute is confirmed returnable (either path) → automated zone lookup
is feasible. If WFS is blocked and GetFeatureInfo returns only raster values → zone lookup
requires institutional access or WMS tile parsing (significant complexity increase).

---

## Phase 2 — Build the Turin pack (10–15 dev-days, Tier 1 path)

*Dependent on Phase 0 (Tier 1 confirmed) and Phase 1 (zone layer access confirmed).*

| Sub-task | What | Dev-days |
|---|---|---|
| **2.1 — Catasto WFS integration** | Implement `CP:CadastralParcel` GetFeature for lat/lon query. BBOX axis order: lat_min,lon_min,lat_max,lon_max (EPSG:6706). Fields: `NATIONALCADASTRALREFERENCE`, `ADMINISTRATIVEUNIT` (`L219` for Turin), `LABEL`. CC BY 4.0. No auth. Already live-probed; implementation only. | 1–2 |
| **2.2 — Piedmont PRG zone lookup** | Connect to confirmed zone-access path (WFS or WMS GetFeatureInfo per Phase 1). Return zone letter for parcel centroid. Include data-currency check: "Zone di Piano" layer updated 2025-06-30 — note that the PRG is under revision and currency must be re-verified periodically. | 2–3 |
| **2.3 — NTA transcription: per-zone numeric table** | Read and source zone-by-zone numeric parameters from the NTA PDF confirmed in P0-A: (a) `indice di fabbricabilità` (fondiario, mc/mq); (b) max height per zone; (c) coverage ratio per zone. Record exact NTA article reference for each value. Flag DM 1444 Art. 7–8 ceilings as "upper-bound-only — not the operative value." Include sub-zone suffixes (B1, B2, C3, etc.) if the NTA uses local mnemonics beyond A–F. | 3–5 |
| **2.4 — ARPA Piemonte Edifici 3D height context** | Integrate FeatureServer using height field confirmed in P0-B. Return existing building height for parcel. Flag: (a) "surveyed existing height — NOT permitted height"; (b) "2017 dataset — may be outdated for post-2017 new construction"; (c) check per-building quality/derivation code before serving urban-core values. | 1–2 |
| **2.5 — National setback floors** | Codice Civile Art. 873: 3 m boundary setback. DM 1444 Art. 9: 10 m between buildings with facing windows. **Check Piedmont's DPR 380/2001 Art. 2-bis derogation regime before shipping** — the 10 m floor may be modified by Piedmont's own derogation law. | 0.5–1 |
| **2.6 — Heritage overlay** | SITAP/APAR (if P0-C confirmed public from national plan) or Vincoli in Rete fallback. Turin centro storico (Savoy royal buildings, UNESCO listed) has high heritage density — flag null results explicitly as "constraint not recorded, not confirmed absent." | 1–2 |

---

## Phase 3 — Full NTA transcription: raise ceiling to ~45–55% (5–10 dev-days)

*Dependent on Phase 2 shipping and validating. Extends zone coverage from a subset of zone types
to all zone types; adds Regolamento Edilizio setback multipliers.*

| Sub-task | What | Dev-days |
|---|---|---|
| **3.1 — Full per-zone NTA transcription** | Extend the Phase 2.3 sourcing from a representative sample of zone types to ALL zone types in Turin's PRG (typical Piedmont PRG has 15–30 zone designations). Source height, coverage, and FAR for every zone letter and sub-zone. | 3–5 |
| **3.2 — Regolamento Edilizio (RE) setback multipliers** | Read Turin's Regolamento Edilizio. Record setback multipliers and minimum absolute distances per zone type. Replace DM 1444 Art. 9 national floor with operative per-zone RE values where stricter. | 1–2 |
| **3.3 — Piani esecutivi (executive plans) detection** | Flag parcels where a piano esecutivo exists and may override the PRG NTA rules. The Piedmont regional mosaic includes "piani esecutivi" as a separate layer — integrate as an overlay flag, not a value override. | 0.5–1 |
| **3.4 — Incoming plan monitoring hook** | Since the PRG revision (DCC 123) is active, add a monitoring check: when the new plan is adopted, this pack must be re-sourced. Document the salvaguardia scope and the expected adoption timeline as part of the pack metadata. | 0.5–1 |

---

## Tier 2 contingency path (if Phase 0 reveals bespoke mechanism)

If P0-A shows the incoming Turin PRG has abandoned DM 1444 zone letters:

1. **Halt** all Phase 1+ work immediately. Do not build against the outgoing zone-letter system
   if the incoming plan has superseded it — a pack built on the outgoing mechanism will be wrong
   from day one.
2. **Characterise the new mechanism** from the DCC 123 revision text: what is the replacement
   classification scheme? (Possible outcomes: a fabric-typology system like Rome; a density-area
   system; a rights-trading system like Milan.)
3. **Re-estimate dev-days** based on the new mechanism type:
   - Fabric typology (Rome-style): ~20–25 dev-days (new engine kind, no zone-letter key)
   - Rights-trading/index system (Milan-style): ~20–25 dev-days (new engine kind)
   - Hybrid or incremental reform: ~15–20 dev-days (partial reuse of zone-letter infrastructure)
4. **ARPA Piemonte Edifici 3D advantage is preserved** regardless of mechanism change — the height
   context layer is independent of the zoning mechanism.

---

## Gap to Denmark (~96%)

| Gap component | Points lost | Bridgeable? |
|---|---|---|
| PRG NTA numbers in PDF, not GIS | ~40–50 pp | ✅ Bridgeable via NTA transcription (Phases 2.3 + 3.1) |
| Zone-layer access restricted (vector download "accesso riservato") | ~10–15 pp | ⚠️ WMS GetFeatureInfo path may work; institutional access may be needed |
| No permitted-height GIS layer | ~20 pp | ✅ NTA transcription covers this |
| PRG revision risk (DCC 123 — mechanism may change mid-project) | ~5–10 pp | ⚠️ Monitor; re-source when new plan adopted |
| Heritage overlay (SITAP informational only) | ~5 pp | ⚠️ Structural; cannot certify absence of constraints |

Even with full Phase 3 completion, Turin reaches ~45–55% — substantially below Denmark's ~96%,
because Italy has no national parcel-zoning dataset (Plandata.dk equivalent) and every numeric
parameter requires per-zone NTA sourcing from a PDF.

---

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
