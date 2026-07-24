# Rate Implementation Plan — Hamburg (`02000`) city

**Current rate:** ~30% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~35% (PDF path) or
~60–70% (DiPlanung structured-attribute path) · **Gap to ceiling:** ~5–40 pts — determined by
the DiPlanung probe · **Gap to Denmark (~96%):** ~66 pts ·
**Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Hamburg's ceiling is **binary**, conditioned on the DiPlanung probe:

- **If DiPlanung returns structured GRZ/GFZ/Höhe:** ceiling **~60–70%** — approaching Madrid
  (~68%) and well above Barcelona (~48%). The remaining gap to Denmark is the §34 floor (assumed
  small for Hamburg but not measured) and the pre-1960-plan interpretation uncertainty.
- **If DiPlanung is PDF-link-only:** ceiling **~35%** — achievable via a PDF transcription
  programme once the ALKIS endpoint is fixed and one B-Plan PDF is confirmed to have a text layer
  (TB3.pdf is the probe candidate).

Hamburg is the **reference city and recommended first implementation target for Germany** for four
structural reasons: city-state scope (one jurisdiction, one LBO, one ALKIS licence regime), full
XPlanung migration completed 2018, the XLeitstelle (national DiPlanung coordination office) hosted
inside Hamburg's own LGV, and no identified historic-plan legacy layer comparable to Berlin's
1958/60 Baunutzungsplan. The pipeline built for Hamburg is the foundation for Munich and Berlin.

**Denmark comparison (~96%):** Denmark delivers GRZ/GFZ/height as structured fields per plan
polygon from Plandata. Hamburg's XPlanGML schema has those same field names — the architecture
is identical in concept. The gap is that Hamburg's migration populated geometry and PDF links, not
the numeric fields. DiPlanung is the mechanism that would close this gap. If it does, Hamburg's
§30 fill rate approaches Denmark's for the covered fraction. If it doesn't, the gap is one PDF-
extraction pipeline.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — Hamburg XPlanung WFS confirmed live; GRZ/GFZ/Höhe confirmed absent from schema; TB3.pdf confirmed accessible; ALKIS endpoint 404 confirmed; RATE.md written | Honest baseline: ~30% confirmed; XPlanung structural gap confirmed as a Hamburg-specific measurement (not just a national assumption) | — → ~30% | Complete | VERIFIED | UNASSIGNED |
| **1** | **DiPlanung probe:** fetch `diplanung.de/schnittstellen`; authenticate if required; request one Hamburg B-Plan (e.g. plan ID "TB3"); inspect XPlanGML response for GRZ/GFZ/Höhe attribute population | The single pivotal action — determines whether Phase 4 is structured ingestion (~10–12 dev-days) or PDF transcription (higher) | ~30% → ~30% (probe only) | Low — one API call | NOT STARTED | UNASSIGNED |
| **2** | Fix ALKIS parcel endpoint — check Transparenzportal Hamburg CKAN / `geodienste.hamburg.de` capabilities listing; confirm open access path for `Flurstück` geometry | Restores parcel geometry access; closes the 404 gap for the Hamburg cadastral layer | ~30% → ~32% | Low | NOT STARTED | UNASSIGNED |
| **3** | Fetch HBauO §6 via headless browser or PDF print; extract Hamburg Abstandsflächen multiplier and minimum; record in `sources/SOURCES.md`; obtain human `VERIFICATION.md` sign-off | Completes the Hamburg setback formula; converts the §6 field from "JS-blocked" to "formula confirmed" | ~32% → ~34% | Medium | NOT STARTED | UNASSIGNED |
| **4 (DiPlanung structured path)** | *IF Phase 1 returns structured GRZ/GFZ/Höhe:* build DiPlanung XPlanGML ingestion — attribute reader for `hoeheMN`/`hoeheBezugspunkt`, GRZ, GFZ fields; implement four-regime classifier (§30 check via XPlanung WFS presence/absence → §34/§35 refusal); cross-check one Hamburg B-Plan against its signed Satzung PDF (L-449 gate) | Hamburg produces cited GRZ/GFZ/Höhe fills for §30 parcels; regime classifier is the reusable foundation for Munich and Berlin | ~34% → ~55–62% | Medium — ~10–12 dev-days total | NOT STARTED | UNASSIGNED |
| **4 (PDF transcription path)** | *IF Phase 1 is PDF-link-only:* download TB3.pdf; confirm text layer vs raster; if text-layer: scope B-Plan PDF transcription programme (regex/LLM pipeline for GRZ/GFZ/Höhe extraction) | Determines viability and cost of the PDF path before committing; an OCR/LLM pipeline is the German equivalent of Barcelona's PDF-extraction work | ~34% → ~34% (viability probe only) | Low–Medium | NOT STARTED | UNASSIGNED |
| **5** | Confirm pre-1960 Hamburg-law plan citation preservation: fetch one pre-1960 XPlanGML file; check whether `rechtsstand` or `texte` attributes reference the original Hamburg-law citation | Required before shipping any pre-1960-derived figure above `corroborated`; closes the last Hamburg-specific interpretation gap | ~55–62% → ~60–65% (DiPlanung path) | Low | NOT STARTED | UNASSIGNED |
| **6** | Run §34 coverage fraction grid-sample for Hamburg bbox; confirm §34 floor | Converts the §34 assumption ("small") to a measurement; firms up the ceiling estimate | ~60–65% → ceiling confirmed | Medium | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) §34 floor — assumed small, not measured.** Hamburg's full XPlanung migration (2011–2018)
covers 2,800 B-Plans — the most complete German city. The §34 fraction is assumed small, but the
grid-sample proof has not been run. If the §34 fraction turns out to be 15–20% of Hamburg clicks,
the ceiling drops by 15–20 pp. Hamburg's denominator needs to be measured before the ceiling
is stated with confidence.

**(b) DiPlanung attribute population is not guaranteed.** XPlanGML mandate compliance requires
geometry; it does not require GRZ/GFZ/Höhe to be populated. Hamburg's migration (XLeitstelle-
hosted) is the most likely candidate for full attribute population — but the XPlanung WFS (which
Hamburg fully migrated) does not expose those attributes. DiPlanung may or may not enforce
population. The probe is the only way to know.

**(c) Pre-1960 Hamburg-law plan interpretation.** ~900 plans in the WFS predate BauNVO (1962).
These plans used Hamburg-specific zone designations not keyed to BauNVO zone letters. Whether the
XPlanGML record for these plans preserves the original Hamburg-law citation (required for the L-449
signature gate) or only the numeric transcription is not confirmed. Until confirmed, these plans
ship as `corroborated` rather than `published`.

**(d) Signature gate (all B-Plans).** The printed, signed B-Plan Satzung is the legally binding
version. XPlanGML/DiPlanung values are informational until cross-checked against the Satzung.
Hamburg B-Plan PDFs are confirmed accessible; the L-449 cross-check requires one PDF read per
plan before shipping above `corroborated`. At scale, this is the Hamburg-specific operational
commitment — not a one-time sourcing task.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (DiPlanung probe) gates Phases 4+.** The structured vs PDF path decision cannot be
  made before this probe. Do not assign dev-days to Phase 4 until Phase 1 completes.
- **Phase 2 (ALKIS fix) is independent** of Phase 1 and can run in parallel.
- **Phase 3 (HBauO §6) is independent** of Phases 1–2 and can run in parallel.
- **Phase 5 (pre-1960 citation check) depends on Phase 4** — the citation check is only needed if
  Hamburg pre-1960-derived values are being shipped; if Phase 4 is the PDF path and those plans
  are excluded, Phase 5 may not apply.

**Cross-jurisdiction reuse (Hamburg → Munich → Berlin):**
- The **DiPlanung XPlanGML ingestion** built in Phase 4 is the reference implementation for
  Munich (Phase 5 of the national plan) and Berlin (Phase 6). Munich and Berlin reuse the
  attribute reader; the regime classifier is extended per city.
- The **four-regime classifier** (§30 presence/absence check via XPlanung WFS) is built once for
  Hamburg and extended for Munich (+ §34 fraction measurement) and Berlin (+ Baunutzungsplan
  legacy layer + §34 East-Berlin carve-out).
- The **`setback` (height-proportional) `GeometricRule` kind** is built once (BayBO Art. 6
  confirmed); Hamburg's HBauO §6 multiplier is a per-Land config value on the same KIND.
- The **L-449 signature gate** (Satzung cross-check → `sources/SOURCES.md` → `VERIFICATION.md`)
  is identical for every sourced jurisdiction.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · BauGB §§30/34/35 · BauNVO §§2–11, §17, §20 · HBauO (Hamburgische
Bauordnung) §6 (Abstandsflächen) · IT-Planungsrat resolution 5 Oct 2017 · XPlanGML v6.1.

---

*Model references: **Denmark** `../../../dk/` (ceiling, ~96%) · **Munich**
`../../de-by/09162-munich/` · **Berlin** `../../de-be/11000-berlin/` (both depend on Hamburg as
reference implementation). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
