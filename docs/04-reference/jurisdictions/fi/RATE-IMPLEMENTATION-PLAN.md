# Rate Implementation Plan — Finland (`fi`) national

**Current rate:** `~55–65% (Ryhti live) / ~30–35% (non-Ryhti)` (see [`RATE.md`](./RATE.md)) ·
**Realistic ceiling:** `~80–85%` · **Gap to ceiling (from Ryhti live rate):** ~15–20 pts ·
**Gap to Denmark (~96%):** ~31–41 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Finland's ceiling is **Denmark-adjacent (~80–85%)** once the Ryhti national rollout completes — and this is
the first jurisdiction in the research programme where that ceiling is set by a **government-mandated, legally
backstopped, ISO-standards-based national system already in partial production**, not by a private aggregator
or a per-Land patchwork.

**What sets the ceiling at ~80–85% rather than Denmark's ~96%:**
1. **Setbacks are graphical, not formula-based.** Finnish asemakaava setbacks are expressed as plan-drawing
   markings (no national formula equivalent to Germany's Abstandsflächen). These cannot be queried from the
   kaavatietomalli as a numeric attribute — they require plan-image interpretation or a local planner. This
   floor is probably 5–10% of queries where setbacks are the operative governing parameter.
2. **Heritage overlay is non-exhaustive by design.** Museovirasto's own WFS explicitly does not include
   buildings protected via statute (LVV channel) or via zoning plan (municipality channel). A parcel sitting
   in a heritage zone not registered in Museovirasto requires a multi-channel check — not automatable from
   structured data alone.
3. **Kaavayksikkö (plan-unit) gap.** Not every municipality uses plan-unit objects in the kaavatietomalli
   even within Ryhti-live regions. Plans without kaavayksikkö objects may not deliver parcel-level numeric
   attributes, reducing the structured fill rate below the theoretical maximum.
4. **Retroactive obligation is absent.** Municipalities are not required to submit historical plan data to
   Ryhti — only plans initiated from 1.1.2025 onward are legally mandated (building permits from 1.1.2026;
   all building data by 1.1.2029). Older plans remain in PDF/municipal WebGIS indefinitely unless a
   municipality chooses to migrate them voluntarily.

The VOOKA project is actively migrating existing plans, but voluntary retroactive migration is not guaranteed
for all municipalities. The ceiling is therefore not 96% but is a credible ~80–85% once the legal deadlines
pass and VOOKA completes.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — live probe the Ryhti OGC API (South/North Savo), Maanmittauslaitos cadastre, KMTK 3D buildings, Museovirasto WFS; write confirmed RATE.md numbers | The honest measured baseline replacing the documentation estimate | — → **measured Tier-1 number** | Low — APIs appear open/public | NOT STARTED | UNASSIGNED |
| **1** | Wire Tier-1 path: Maanmittauslaitos parcel geometry + Ryhti kaavatietomalli for South/North Savo + KMTK buildings + Museovirasto heritage guard | First confirmed deployable structured-data path for two Finnish regions; heritage multi-channel caveat surfaced in UI | measured → **~55–65%** (Ryhti live regions) | Low-medium — one national schema, no per-region legal variation | NOT STARTED | UNASSIGNED |
| **2** | Confirm Helsinki/Uusimaa VOOKA date + integrate SeutuRAMAVA floor-area data as a supplementary layer for the capital metro | Adds the capital-city market; SeutuRAMAVA gives block-level FAR for Espoo/Helsinki/Kauniainen/Vantaa ahead of full Ryhti rollout | **~55–65%** → **~60–70%** (capital region added, SeutuRAMAVA supplement) | Low — SeutuRAMAVA is already structured open data | NOT STARTED | UNASSIGNED |
| **3** | Track VOOKA rollout progress; auto-ingest each newly-migrated region as it enters Ryhti | Progressively extends Tier-1 coverage from 2 confirmed regions toward national | **~60–70%** → grows as VOOKA migrates regions | Low per region (same schema, no new legal research) — medium overall (monitoring pipeline) | NOT STARTED | UNASSIGNED |
| **4** | PDF extraction pipeline for non-Ryhti asemakaava plans — article parser tuned to Finnish kaavamerkinnät symbol structure | Raises pre-migration regions from ~30–35% toward ~45–55% | **non-Ryhti ~30–35%** → **~45–55%** | Medium — needs Finnish-language OCR + kaavamerkinnät article-structure adapter | NOT STARTED | UNASSIGNED |
| **5** | Full national coverage post-VOOKA + heritage multi-channel integration (LVV + municipal plan-overlay query) | Ceiling: ~80–85% nationally | → **~80–85%** (ceiling) | Medium — VOOKA timeline (1.1.2029 legal backstop); LVV API confirmation needed | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

Finland differs from Denmark in three structural ways:

**(a) Retroactive plan migration is voluntary, not mandated.**
Denmark's Plandata covers its full active plan stock because Denmark's system was built when the plan stock
was smaller and newer. Finland's 1.1.2025–2029 mandate applies forward only. Older plans stay in
PDF/municipal WebGIS unless voluntarily migrated. This alone explains ~10–15 pts of the gap.

**(b) Setbacks are graphical in both countries.**
Denmark's *byggelinje* (building line) is also expressed graphically on plan drawings, not as a formula
attribute. Neither country delivers structured setback attributes from the national API — this is a shared
~5% ceiling cap.

**(c) Heritage overlay has named gaps (two other channels).**
Denmark's GeoDanmark heritage layer is more comprehensive than Museovirasto's self-disclosed non-exhaustive
list. Finland's two-channel caveat (LVV + municipality) is a structural cap that requires a multi-source
query discipline not currently standardised in any pipeline.

**The gap is legal and temporal, not structural.** A retroactive digitisation mandate (hypothetical — not
current Finnish law) or 20 years of natural plan turnover under the new Rakentamislaki would close the gap.
The kaavatietomalli schema is already Denmark-class in quality; the plan stock conversion is the remaining work.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Must exist first:**
- Live Ryhti OGC API probe (NEXT.md Blocker 3.1) — gates Phase 1.
- Maanmittauslaitos API key (NEXT.md Blocker 3.2) — gates Phase 1 parcel geometry.
- KMTK WFS endpoint confirmation (NEXT.md Blocker 3.3) — gates Phase 1 building height.

**Blocked items:**
- Helsinki/Uusimaa deployment: blocked on VOOKA migration date (NEXT.md Blocker 3.5).
- Åland: blocked on separate system confirmation (NEXT.md Blocker 3.6).
- PDF extraction (Phase 4): blocked on Phase 1 completion (need to understand kaavatietomalli schema before building the fallback parser).

**Cross-jurisdiction reuse:**
- The Ryhti kaavatietomalli OGC API reader (Phase 1) is reusable for every Finnish region as VOOKA migrates
  them — one schema, ~309 municipalities, no new legal research per region. This is the inverse of Italy's
  21-mechanism problem.
- The Finnish-language kaavamerkinnät article-structure adapter (Phase 4 PDF extraction) reuses the shared
  ordinance-extraction pipeline core; the thin adapter is Finnish-specific.
- The KMTK 3D building pipeline can reuse the same LOD1-extrusion approach validated for Spain and
  Switzerland (terrain point cloud → footprint extrusion) if finished LOD2 vectors are not reliably
  populated per-building.

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Barcelona** `../es/es-ct/08019-barcelona/`
(pilot climb model). Governing: **C58** (fidelity/provenance) · **ADR-0269** (curate-then-serve) ·
**L-449** (human-verification gate).*
