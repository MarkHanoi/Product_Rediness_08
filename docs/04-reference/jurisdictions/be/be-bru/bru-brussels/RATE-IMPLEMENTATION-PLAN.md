# Rate Implementation Plan — Brussels-Capital Region (`be-bru-brussels`) city

**Current rate:** ~5–10% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~30–35% ·
**Gap to ceiling:** ~20–30 pts · **Gap to Denmark (~96%):** ~86–91 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Brussels' realistic ceiling is **~30–35%** — the highest of the three Belgian regions, but still
far below Denmark (~96%) and below Madrid (~68%). The ceiling is set by three structural facts:

**What makes the Brussels ceiling higher than Flanders/Wallonia:** Brussels is the only Belgian
region with a region-wide gabarit text (RRU Titre I: H = P + 3.00 + D) that is computable from
geometric inputs without reading a PDF provision-by-provision. For parcels governed by the RRU
Titre I default (i.e., not overridden by a PPAS/RRUZ/PAD), the envelope can in principle be
computed automatically once P (rue width) and D (parcel depth) are queryable. This is analogous to
Barcelona's block-derived construction — a computed path, not a structured-field lookup — and it is
the one place in Belgium where approaching ~30% fill is architecturally plausible.

**What caps the ceiling at ~30–35% rather than Denmark's ~96%:**
1. **Instrument-priority check.** The RRU Titre I applies only where a PPAS, RRUZ, or PAD does not
   provide otherwise. The fraction of Brussels parcels under a PPAS/RRUZ override vs. the RRU
   default is unknown — but given Brussels' history of detailed local planning, a non-trivial
   fraction of central-Brussels parcels are likely under a PPAS. For those parcels, the fill path
   requires sourcing each PPAS individually, which is not automatable at scale.
2. **High-rise derogation.** Towers require a per-project *bon-aménagement-des-lieux* derogation
   (Conseil d'État case law) — no formula applies; no structured ceiling is available. These parcels
   cannot be filled regardless of the formula path.
3. **Formula-in-PDF, not a structured field.** Even the formula that drives the ceiling is not in
   a queryable API attribute. It requires a computation pipeline (get P from UrbIS road layer or
   geometric derivation; get D from CADMAP parcel depth; evaluate H = P + 3.00 + D). If the UrbIS
   road layer does not carry a `largeur_rue` attribute, P must be derived geometrically — raising
   implementation cost and measurement uncertainty.
4. **CBS+ and TOTEM gates.** The current RRU reform project introduces an ecological-potential gate
   (CBS+) and a life-cycle comparison gate (TOTEM, for demolitions > 1,000 m²). These are confirmed
   structured GIS layers, but they gate whether a massing scenario is permittable — they do not
   supply height or FAR values. Filling them increases correctness, not the fill rate.

**Denmark comparison:** Denmark hit ~96% by putting height, density metric, and zone type as
structured fields in every Plandata plan polygon. Brussels would need to encode RRU Titre I — and
every PPAS/RRUZ override — as structured per-parcel database fields to approach that ceiling. No
such encoding is underway or planned in Brussels' regulatory system.

**Barcelona comparison (pilot model):** Barcelona's climb used block-derived geometry computation
to produce envelope numbers where no per-parcel structured field existed. Brussels' RRU Titre I path
mirrors this exactly: compute H from geometric inputs rather than read it from a field. The phase
shape (access → computation pipeline → instrument coverage) follows the Barcelona pattern.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — endpoint/schema checks; write RATE.md | Honest baseline: ~5–10% confirmed; RRU Titre I formula identified | — → ~5–10% | Complete | VERIFIED | UNASSIGNED |
| **1** | Resolve bot-detection block on `gis.urban.brussels` (Belgian-IP deployment or alternative access path); independently verify PRAS layer schema, licence terms, and PPAS/RRUZ layer availability live | Live PRAS zone query operational; PPAS/RRUZ coverage probed; instrument-priority check can run | ~5–10% → ~5–10% (access unblocked; rate unchanged until computation pipeline built) | Low–Medium | NOT STARTED | UNASSIGNED |
| **2** | Run prerequisite probes: (a) UrbIS road layer for `largeur_rue`/`width` attribute; (b) PPAS/RRUZ coverage fraction via grid-sample against live layer; (c) federal CADMAP building sublayer for height/storey attribute; (d) Brussels heritage GIS layer live reachability | Confirms whether the formula-computation path is viable (P queryable vs. geometric derivation); establishes the PPAS/RRUZ override fraction (determines the RRU Titre I denominator) | ~5–10% → ~8–12% (zone-boundary hit firms up; no formula fills yet) | Low (given Phase 1 complete) | NOT STARTED | UNASSIGNED |
| **3** | Read RRU Titre I primary text (Arts. 4–6) from the canonical arrêté; record clause citations in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off | Fills the provenance gate — enables citing the formula as `published`; prerequisite for any `estimated-ruleset` or higher pack tier | ~8–12% → ~8–12% (provenance gate closed; rate unchanged) | Low | NOT STARTED | UNASSIGNED |
| **4** | Build the instrument-priority classifier (PPAS/RRUZ/PAD > RRU Titre I) and PRAS zone query | Correctly routes each Brussels parcel to the governing instrument before any numeric sourcing; enables a `regime-undetermined` refusal to be replaced by a known instrument | ~8–12% → ~10–15% (parcels get a correct instrument label; some PPAS-governed parcels get correct refusals) | Medium | NOT STARTED | UNASSIGNED |
| **5** | Build the RRU Titre I formula encoder as a new rule KIND (context-relative H = P + 3.00 + D); wire P (from UrbIS or geometric derivation) and D (from CADMAP parcel depth); compute for all parcels under the RRU Titre I default | For every RRU Titre I parcel with queryable P and D: a computable cited envelope — the first structured fill path in any Belgian region | ~10–15% → ~25–35% (ceiling, Brussels; blended national impact smaller) | High — new rule KIND; requires Phases 1–4 | NOT STARTED | UNASSIGNED |
| **6** | Source individual PPAS/RRUZ texts for highest-coverage districts; extract numeric provisions where present; obtain VERIFICATION.md sign-off per instrument | Extends fill to PPAS/RRUZ-governed parcels where numeric provisions exist; incremental improvement beyond the RRU Titre I ceiling | ~25–35% → ~30–35% (ceiling) | High — per-instrument sourcing; ongoing | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Denmark's ~96% comes from a national Plandata database that exposes height, density metric, and zone
type as machine-readable structured fields per plan polygon — no PDF reading required. Brussels'
gap has these structural components:

**(a) Formula-in-PDF, not a structured field.** The RRU Titre I formula (H = P + 3.00 + D) is real
and computable, but it is written in a PDF regulation. A computation pipeline (not a field lookup)
is needed — architecturally comparable to Barcelona's block-derived construction, but with the added
complexity that the formula inputs (P, D) must themselves be queried or derived from geometry rather
than read from the ordinance.

**(b) Instrument-priority fragmentation.** Brussels has four stacked planning instruments at the
envelope level (PAD > RRUZ > PPAS > RRU Titre I). Reducing this to a reliable per-parcel classifier
requires live access to all four layer types — a multi-step query chain with no equivalent in
Denmark's single-instrument Plandata. Each step that cannot be automated produces a `regime-
undetermined` refusal.

**(c) Discretionary high-rise exception.** Tall buildings require a per-project *bon-aménagement-
des-lieux* justification — not reducible to any formula or lookup. These parcels are structurally
outside the fill denominator until a structured tall-building permit layer exists (none confirmed).

**(d) No provision-code catalogue.** Even with Phases 1–6 complete, Brussels has no equivalent of
Sweden's Planbestämmelsekatalog — filling PPAS-governed parcels requires sourcing each PPAS
individually, which does not scale to the full 19-commune territory.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Blockers:**
- **Phase 1 is the prerequisite for all subsequent phases.** No Brussels pack work can proceed
  until `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` is reachable live from the deployment
  environment. This is a deployment-infrastructure decision, not a code decision.
- **Phase 2 (UrbIS road attribute):** if the UrbIS road layer does NOT carry a `largeur_rue`
  attribute, P must be derived from road polygon width via geometry — a different and more complex
  implementation path. Confirm before designing the Phase 5 formula encoder.
- **Phase 3 (primary text):** the canonical RRU Titre I arrêté text (Arts. 4–6) must be read and
  clause-cited before any pack can claim `estimated-ruleset` tier or higher. The formula
  H = P + 3.00 + D is research-confirmed from secondary sources only.
- **CBS+ regulatory status:** CBS+ appears in the current RRU reform project documentation.
  Confirm whether it is enacted law at the time of any Brussels pack implementation — if not yet
  enacted, do not ship CBS+ as a live gate.

**Cross-jurisdiction reuse:**
- The federal CADMAP ingestion (parcel geometry + D measurement) built for Brussels also serves
  Flanders and Wallonia pack work — the one genuine cross-region efficiency.
- The resolver pattern (pure function of geometric inputs → numeric output) from Saudi's
  `resolveSaudiSetbacks` applies directly to the H = P + 3.00 + D encoder: same architecture
  (null-in-pack + resolver module), different inputs. The new rule KIND is still required because
  the Brussels formula is two-input, not one.
- The `regime-undetermined` refusal vocabulary is shared across all three Belgian regions — define
  it once, reuse it in the Flanders and Wallonia packs.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · CoBAT (arrêté 9 April 2004, reformed 30 November 2017) · RRU Titre I
(arrêté 3 June 1999, re-adopted 21 November 2006) · PRAS (current, regularly updated) · loi
spéciale 12-01-1989 (Brussels devolution).

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Barcelona**
`../../../es/es-ct/08019-barcelona/` (pilot climb — block-derived computation path mirrors RRU
Titre I formula path). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
