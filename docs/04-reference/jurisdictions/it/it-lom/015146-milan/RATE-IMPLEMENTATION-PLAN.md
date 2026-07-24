# Rate Implementation Plan — Milan (`015146`)

**Current rate: ~5%** · **Realistic ceiling: ~15–20% (without perequation ledger) / ~25–35% (with ledger)**
**Gap to Denmark (~96%): ~91 pp** · **Gap to ceiling: ~10–30 pp**

> This plan shows the ordered sequence of actions that would move Milan's structured dimensional
> fill rate from its current position to its realistic ceiling. Costs are in dev-days. Milan
> requires a **new engine kind** — the PGT territorial-index-plus-perequation mechanism is not a
> zone-letter config case. Do not begin any implementation work without reading the PGT Piano delle
> Regole NTA (Phase 1).

---

## Why the ceiling is where it is

Milan's ceiling is lower than Turin's and lower than Rome's (direct-intervention regime) because
of a unique data-access problem that does not exist in any other city studied:

1. **No zone-letter key.** The TUC (Tessuto Urbano Consolidato) mechanism is a single citywide
   index (0.35 mq/mq base) applied to every parcel via its *lotto funzionale*. "Which DM 1444
   zone applies" is the wrong question for most Milan parcels. There is no zone table to look up.
2. **The ceiling (0.70 mq/mq) requires the perequation ledger.** The TUC ceiling is only
   achievable through transferable rights, bonus mechanisms, and social-housing quotas — a
   cap-and-trade layer on top of the base index. Whether this ledger is publicly queryable
   determines whether Milan can ever return a ceiling answer without an administrative lookup.
3. **Lombardy PGT WFS is unconfirmed.** Previous probes of `geoportale.regione.lombardia.it`
   GeoServer paths returned 404 or page-not-found HTML. Without a queryable zone-polygon layer,
   the PGT Piano delle Regole zone identification step cannot be automated.

**If the perequation ledger is not publicly queryable, the correct ceiling answer for TUC parcels
is always a reasoned partial:** "base index confirmed at 0.35 mq/mq; ceiling (0.70 mq/mq) requires
perequation ledger lookup not available as public data." This is not a failure — it is the correct
answer given the data structure.

---

## Phase 0 — Probe the PGT zone layer (0.5 dev-days)

*Prerequisite for all design and implementation decisions. Must be run before any Phase 1+ work.*

### P0: Probe Lombardy Geoportale PGT WFS / Milan PGT portal

Previous probe: `geoportale.regione.lombardia.it/geoserver/...` paths return 404 or HTML. Try
workspace-specific and INSPIRE paths from a non-Replit IP or browser:

```bash
# Workspace-specific paths to try:
curl "https://www.geoportale.regione.lombardia.it/geoserver/ows?\
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'pgt\|piano\|zona\|urb' | head -20

curl "https://www.geoportale.regione.lombardia.it/geoserver/wfs?\
SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities" | grep -i 'pgt\|zona' | head -20

# Also check Milan's PGT portal for any WFS link:
# pgt.comune.milano.it → look for WFS/API links beyond the documented tavole map service
```

Also check whether the PGT tavole at `pgt.comune.milano.it` expose a WMS GetFeatureInfo endpoint
that could return Piano delle Regole zone type for a lat/lon coordinate.

**Outcomes:**
- **WFS confirmed public + zone polygon queryable → raise zone score; proceed to Phase 1**
- **WFS not found / blocked → document gap; zone identification remains PDF/tavole navigation (~10%)**
- **WMS GetFeatureInfo works → use as zone lookup; note it returns only visualization metadata, not full attribute schema**

---

## Phase 1 — Source the PGT Piano delle Regole NTA (2–3 dev-days)

*Dependent on Phase 0 completing (to scope carve-outs accurately). Can partially overlap with P0.*

### P1-A: Read PGT Piano delle Regole NTA

**Action:**
1. Navigate `pgt.comune.milano.it` → Piano delle Regole → Norme Tecniche di Attuazione.
   Download the current consolidated NTA PDF.
2. Read the TUC classification articles: confirm 0.35 mq/mq base index, 0.70 mq/mq ceiling
   via perequation, lotto funzionale construct, and which parcels are excluded from the TUC
   unified index (ERS, agricultural land — confirmed excluded in research).
3. Read the ERS (*Edilizia Residenziale Sociale*) zone articles: extract applicable rules.
4. Read the agricultural land articles.
5. Note the last NTA consolidation date — confirm it reflects the current 2019+ PGT variant.

**Gate:** Confirms primary-source figures (0.35/0.70 mq/mq TUC); scopes all non-TUC mechanism
carve-outs; establishes the setback regime (Lombardy RET — read alongside the NTA).

### P1-B: Perequation ledger sourcing check

*Run in parallel with P1-A.*

**Action:** Dedicated sourcing pass to determine whether the perequation ledger (which parcels
have transacted rights, and for how much volume) is publicly accessible:
1. Check Milan SIT (`sit.comune.milano.it`) for any ledger dataset or API.
2. Check `pgt.comune.milano.it` for a downloadable perequation register.
3. Check UrbisMap API (commercial — `urbismap.it`) for ledger access under their licensed tier.
4. Check if the Lombardy Geoportale has a perequation-related layer.

If none found: document the gap. The ceiling answer for TUC ceiling (0.70 mq/mq) is permanently
a reasoned partial until the ledger is located.

---

## Phase 2 — Build the TUC territorial-index engine kind (5–8 dev-days)

*Dependent on Phase 1 completing. This is a new engine kind — not a config change.*

| Sub-task | What | Dev-days |
|---|---|---|
| **2.1 — Catasto WFS integration** | Implement `CP:CadastralParcel` GetFeature for lat/lon. BBOX order: lat_min,lon_min,lat_max,lon_max (EPSG:6706). Field `ADMINISTRATIVEUNIT` = `F205` for Milan. CC BY 4.0, no auth. Already live-probed. | 1–2 |
| **2.2 — PGT zone identification** | Connect to confirmed zone-access path (Phase 0). Return Piano delle Regole zone type (TUC / ERS / agricultural / other) for parcel. If no public WFS: this step returns `coverage-gap` and the pack is limited to national-floor answers only. | 1–2 |
| **2.3 — TUC base-index answer** | For TUC-classified parcels: return `indice di edificabilità Territoriale = 0.35 mq/mq`. Source: PGT Piano delle Regole NTA (exact article from P1-A). | 0.5–1 |
| **2.4 — TUC ceiling answer** | If ledger confirmed (P1-B): return `ceiling = 0.70 mq/mq` with perequation note. If ledger not found: return `ceiling = 0.70 mq/mq (requires perequation rights lookup — not available as public structured data; administrative enquiry required)`. The latter is a correct reasoned partial, not an error. | 0.5–1 |
| **2.5 — ERS + agricultural answers** | For ERS-classified parcels: return rules from NTA ERS articles (P1-A). For agricultural: return applicable rules. | 1–2 |
| **2.6 — National floor rules** | Codice Civile Art. 873: 3 m boundary setback. DM 1444 Art. 9: 10 m between facing buildings. **Verify Lombardy's DPR 380/2001 Art. 2-bis derogation before shipping** — Lombardy may have reduced the 10 m floor. Read Lombardy RET for setback multipliers and operative distances. | 0.5–1 |

---

## Phase 3 — Heritage overlay and context height (1–2 dev-days)

*Independent of Phases 1–2. Can run in parallel once national infrastructure (Catasto + SITAP probe) is available.*

| Sub-task | What | Dev-days |
|---|---|---|
| **3.1 — SITAP/APAR heritage overlay** | If national plan (P0-C of national RATE-IMPLEMENTATION-PLAN) confirms SITAP WFS public access: integrate for Milan. Milan centro storico has very high heritage density. Flag all results as "informational only — NOT FOUND does not certify absence of constraint." | 0.5–1 |
| **3.2 — Vincoli in Rete** | Partial fallback if SITAP WFS blocked. Same incompleteness caveat. | 0.5 |
| **3.3 — Lombardy building-height context** | Check `geoportale.regione.lombardia.it` for any 3D/Edifici layer for Lombardy. If found: integrate; flag as "modeled or surveyed — check data provenance." If not found: OpenBuildingMap modeled estimate is the fallback (must be explicitly flagged as modeled). | 0.5 |

---

## Realistic ceilings by scenario

| Scenario | Ceiling |
|---|---|
| Phase 0 reveals no public PGT WFS | **~10%** — national floors + heritage overlay only; zone identification and TUC figures unreachable without institutional access |
| Phase 0 + 1 complete; perequation ledger unavailable | **~15–20%** — zone classification + base index (0.35 mq/mq); ceiling = reasoned partial; heritage overlay |
| Phase 0 + 1 + 2 complete; perequation ledger publicly queryable | **~25–35%** — full TUC envelope computable; ERS and agricultural carve-outs sourced |
| All phases complete | **~25–35%** — no further structured data sources identified; ceiling is structural |

Milan cannot exceed ~35% without either (a) a public perequation ledger, or (b) the TUC mechanism
being simplified by a future PGT revision. Both are external changes outside the engineering scope.

---

## Gap to Denmark (~96%)

| Gap component | Points lost | Bridgeable? |
|---|---|---|
| No zone-letter table (TUC territorial-index mechanism) | ~30 pp vs a DM 1444 zone-letter city | ❌ Structural; the mechanism is what it is |
| Perequation ledger not publicly queryable | ~15 pp | ⚠️ Administrative request or commercial platform may unblock |
| No Lombardy building-height GIS layer confirmed | ~10 pp | ⚠️ Investigate Lombardy Geoportale; OpenBuildingMap modeled fallback available |
| Heritage overlay informational only (not certifying) | ~5 pp | ❌ Structural SITAP caveat |
| NTA figures in PDF not GIS | ~10 pp | ✅ P1-A NTA read covers this |

Milan is the most structurally challenging of the three Italian cities studied. Even with all
phases complete and the perequation ledger resolved, Milan will not exceed ~35% — well below
Turin's ~45–55% ceiling if Tier 1 is confirmed.

---

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
