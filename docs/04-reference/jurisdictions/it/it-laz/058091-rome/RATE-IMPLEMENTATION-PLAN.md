# Rate Implementation Plan — Rome (`058091`)

**Current rate: ~5%** · **Realistic ceiling: ~30–35% (Consolidata + Storica, direct intervention)**
**Gap to Denmark (~96%): ~91 pp** · **Gap to ceiling: ~25–30 pp**

> This plan shows the ordered sequence of actions that would move Rome's structured dimensional
> fill rate from its current position to its realistic ceiling. Costs are in dev-days. Rome requires
> a **new engine kind** — the PRG tessuto-typology mechanism is not a zone-letter config case.
> The direct/indirect intervention classifier must be built before any numeric sourcing begins.
> Do not start implementation without reading the PRG NTA consolidated text (Phase 0).

---

## Why the ceiling is where it is

Rome's ceiling of ~30–35% is set by three structural constraints:

1. **Tessuto typology, not zone letters.** Rome's PRG classifies land by historic-fabric type
   (`tessuto`) — a survey-based classification, not a density-indexed zone letter. There is no
   DM 1444 A/B/C key to look up. The engine kind required is new; it cannot reuse any
   zone-letter-keyed infrastructure.

2. **The direct/indirect intervention split is a structural gate.** Before any numeric rule can
   be returned, each parcel must be classified as direct intervention (numeric envelope readable
   from the PRG) or indirect intervention (no envelope until a further executive plan is adopted
   — the correct answer is a reasoned refusal, not a gap). The fraction of Rome parcels in
   indirect-intervention sistemi (Città da Ristrutturare, Città della Trasformazione) is unknown;
   these parcels are correctly answered with a refusal, not a data lookup.

3. **The Carta per la Qualità precedence question is legally contested.** Contested amendments
   have been criticized for establishing that tessuto rules prevail over the Carta per la Qualità
   overlay in cases of conflict. The NTA must be read to confirm the current precedence direction
   before any heritage-overlay logic is implemented — getting this wrong would produce legally
   incorrect answers.

**Città da Ristrutturare / Trasformazione parcels are counted as "correct answers" (reasoned
refusals), not as data gaps.** The ceiling excludes them from the denominator of improvable
parcels. The ~30–35% ceiling applies only to Città Storica + Città Consolidata under direct
intervention.

---

## Phase 0 — Probe the tessuto WFS and read the PRG NTA (3–4 dev-days)

*Prerequisite for all engine-kind design. Must complete before Phase 1.*

### P0-A: Probe Roma Capitale SIT for tessuto WFS (0.5 dev-days)

**Action:** Probe Roma Capitale's SIT and geoportal for a machine-readable tessuto/sistema layer:
1. `sit.comune.roma.it` — look for WMS/WFS services exposing PRG sistema/tessuto classification.
2. `map.uniapp.it` — Roma Capitale's mapping platform; check for WFS capabilities.
3. Try INSPIRE Geoportal search for `Roma Capitale` + `PRG` + `tessuto` or `Lazio` land-use
   vector datasets.

```bash
# If a GeoServer endpoint is found:
curl "https://[server]/geoserver/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" \
  | grep -i 'tessuto\|sistema\|PRG\|urbanistica' | head -20
# Run a GetFeature for a Rome coordinate in each sistema area
```

**Gate:**
- WFS confirmed + tessuto attribute queryable → tessuto identification is automated; raise score.
- WMS GetFeatureInfo works → use as lookup; note it returns only rendered attributes.
- No WFS or GetFeatureInfo available → tessuto identification requires web-viewer navigation;
  zone-classification step cannot be automated at scale.

### P0-B: Read PRG NTA consolidated text (2–3 dev-days)

**Action:**
1. Navigate Roma Capitale official urbanistica portal → PRG 2008 → NTA consolidated text. Confirm
   it includes all amendments since 2008.
2. Read the sistema/tessuto classification articles:
   - Città Storica: per-tessuto transformation rules; which tessuto types are under direct vs.
     indirect intervention?
   - Città Consolidata T1/T2/T3: confirm typology definitions, applicable NTA articles, and
     numeric parameters (height, coverage, density) per typology.
   - Città da Ristrutturare: confirm indirect-intervention scope; what triggers direct vs.
     indirect for ambiti di valorizzazione?
   - Città della Trasformazione: confirm indirect-intervention default.
3. **Carta per la Qualità precedence:** read the contested amendment articles. Confirm: does
   tessuto rule prevail over Carta indication in case of conflict (as criticized), or does Carta
   prevail? Record the exact NTA article confirming the current precedence direction.
4. Note the last NTA consolidation date and any judicially challenged amendments — flag these
   as legal-currency risks in the pack.

**Gate:** Provides the full set of: (a) numeric parameters per tessuto/typology; (b) direct/
indirect intervention classification rules; (c) Carta per la Qualità precedence direction;
(d) refusal vocabulary for indirect-intervention parcels.

---

## Phase 1 — Build the direct/indirect intervention classifier (3–5 dev-days)

*Dependent on Phase 0 completing. This is the prerequisite for all numeric sourcing.*

### P1: Implement the intervention classifier

The classifier is Rome's structural analogue of Germany's §30/§34/§35 regime classifier. It
must run before any numeric lookup:

| Input | Output |
|---|---|
| Parcel coordinate → sistema/tessuto type (from Phase 0 probe) | Direct intervention (numeric answer feasible) |
| Città da Ristrutturare | Indirect intervention → refusal: "no numeric building envelope; executive urban-planning programme required" |
| Città della Trasformazione | Indirect intervention → refusal: "no numeric building envelope; urban-planning instrument required" |
| Città Consolidata "ambiti di valorizzazione" | Conditional: direct or indirect depending on whether a valorizzazione plan exists — may require secondary check |

**Implementation notes:**
- The classifier reads the PRG sistema/tessuto GIS layer (Phase 0-A) to determine which sistema
  a parcel falls in.
- Within the Città Consolidata, a sub-classification step determines whether the ordinary direct-
  intervention regime applies or whether an ambito di valorizzazione triggers indirect intervention.
- Correct refusal answers for indirect-intervention parcels count as correct system responses
  and should be tracked separately from data-gap responses.

---

## Phase 2 — Build the tessuto typology engine kind (8–12 dev-days)

*Dependent on Phase 1 (classifier) completing and Phase 0-B (NTA read) completing.*

| Sub-task | What | Dev-days |
|---|---|---|
| **2.1 — Catasto WFS integration** | Implement `CP:CadastralParcel` GetFeature for lat/lon. BBOX order: lat_min,lon_min,lat_max,lon_max (EPSG:6706). Field `ADMINISTRATIVEUNIT` = `H501` for Rome. CC BY 4.0, no auth. Already live-probed. | 1–2 |
| **2.2 — Città Storica: per-tessuto rules** | Source numeric parameters from PRG NTA for each Città Storica tessuto type (point-by-point transformation rules at 1:5,000). Return: max height, volume limits, applicable NTA article. Note: some tessuto types have conservation-only rules (no net-new volume) — these are correct answers, not gaps. | 3–5 |
| **2.3 — Città Consolidata T1/T2/T3 rules** | Source numeric parameters from PRG NTA for T1 (medium density, early-20th-c. expansion), T2 (high density, defined typology), T3 (free typology). Return: height, coverage, density per typology. Apply Carta per la Qualità precedence direction confirmed in Phase 0-B. | 2–3 |
| **2.4 — Carta per la Qualità overlay** | If Phase 0-A confirms Carta is machine-readable as a GIS layer: integrate as overlay flag (not a numeric source; a heritage-typology classifier). Flag: "Carta indication present — check precedence direction against tessuto rule per NTA [article]." If not machine-readable: document as gap; flag for manual check. | 0.5–1 |
| **2.5 — National floor rules** | Codice Civile Art. 873: 3 m boundary setback. DM 1444 Art. 9: 10 m between facing buildings. **Verify Lazio's DPR 380/2001 Art. 2-bis derogation** before shipping — Lazio may have modified the 10 m floor. Read PRG NTA setback articles per tessuto. | 0.5–1 |

---

## Phase 3 — Heritage overlay and context height (1–2 dev-days)

*Independent of Phases 1–2 for SITAP. Can run in parallel.*

| Sub-task | What | Dev-days |
|---|---|---|
| **3.1 — SITAP/APAR heritage overlay** | If national plan confirms SITAP WFS public: integrate. Rome has extremely high heritage density — archaeological areas, listed buildings. Flag all results as "informational only — NOT FOUND does not certify absence; overlay is self-described as incomplete." | 0.5–1 |
| **3.2 — Vincoli in Rete fallback** | If SITAP WFS blocked: Vincoli in Rete as partial fallback. Same incompleteness caveat. | 0.5 |
| **3.3 — Lazio building-height context** | Check `dati.lazio.it` and `geoportale.regione.lazio.it` for any building-height GIS layer for Lazio or specifically Rome. If not found: OpenBuildingMap modeled estimate is the fallback (must be explicitly flagged as modeled, not surveyed). Rome has no ARPA Piemonte equivalent confirmed in research. | 0.5 |

---

## Realistic ceilings by scenario

| Scenario | Ceiling |
|---|---|
| Phase 0-A shows no public tessuto WFS | **~10%** — national floors + heritage overlay only; tessuto classification and numeric rules unreachable without institutional access |
| Phase 0 + 1 complete; Consolidata T1/T2/T3 only | **~20–25%** — Consolidata under direct intervention (majority of Rome's built fabric) |
| Phases 0–2 complete; Città Storica per-tessuto + Consolidata | **~30–35%** — adds the dense central fabric; refusals correctly in place for indirect-intervention zones |
| All phases complete | **~30–35%** — no further structured data identified; Città da Ristrutturare / Trasformazione remain correct refusals |

Rome's ceiling (~30–35%) is higher than Milan's (~25–35%) for one reason: Rome's PRG, despite
its complexity, provides a per-tessuto numeric table that can be transcribed once the NTA is read.
Milan's perequation layer creates a data-access problem that tessuto transcription does not.

---

## Gap to Denmark (~96%)

| Gap component | Points lost | Bridgeable? |
|---|---|---|
| Tessuto typology = new engine kind (not zone-letter config) | ~30 pp vs a DM 1444 zone-letter city | ❌ Structural; the mechanism is what it is |
| Direct/indirect intervention split (no envelope for indirect-intervention parcels) | ~10–20 pp | ✅ Correct refusal is the right answer; improves with measuring actual indirect fraction |
| Carta per la Qualità precedence legally contested | ~5 pp | ⚠️ Legal risk; NTA read confirms current direction |
| No Lazio building-height GIS layer confirmed | ~15 pp | ⚠️ Investigate Lazio geoportal; modeled fallback available |
| Heritage overlay informational only | ~5 pp | ❌ Structural SITAP caveat |
| NTA figures in PDF not GIS | ~15 pp | ✅ Phase 2 NTA transcription covers this |

Rome will not reach Denmark (~96%) without a national Italian zoning WFS. The tessuto mechanism
adds complexity beyond zone-letter cities but does provide computable answers for direct-
intervention parcels — the ceiling is real and reachable within this plan.

---

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
