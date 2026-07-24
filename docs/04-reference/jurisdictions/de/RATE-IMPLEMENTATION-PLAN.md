# Rate Implementation Plan — Germany (`de`) national

**Current rate:** ~28% (see [`RATE.md`](./RATE.md)) · **Realistic ceiling:** ~35–40% (PDF
transcription path) or ~55–65% (DiPlanung structured-attribute path) ·
**Gap to ceiling:** ~7–37 pts — range determined by the DiPlanung probe ·
**Gap to Denmark (~96%):** ~68 pts · **Last updated:** 2026-07-24 · **Owner:** UNASSIGNED

---

## 1 — The ceiling: what "maximum" means here

Germany's realistic ceiling is **binary**, conditioned on one unprobed API call:

- **If DiPlanung returns structured GRZ/GFZ/Höhe:** ceiling **~55–65%** for the 7 Länder where
  DiPlanung is already live (Bayern, Berlin, Brandenburg, Bremen, Hamburg, Niedersachsen,
  Schleswig-Holstein). This would put Germany ahead of France (~22%), ahead of Norway (~32%),
  and approaching Barcelona (~48%). The §34 floor (~30% of Germany) is the permanent ceiling
  below Denmark; the correct output for §34 parcels is a reasoned refusal, not a fill.
- **If DiPlanung is PDF-link-only (replicating the Hamburg XPlanung WFS pattern):** ceiling
  **~35–40%** — achievable via a B-Plan PDF transcription programme similar to Barcelona's OCR
  pipeline, but requiring sustained per-plan manual or automated text extraction.

**The DiPlanung probe is the single gating action for Germany.** It resolves in one API call whether
the implementation path is a structured-attribute ingestion (cheap) or a PDF transcription programme
(expensive). Do not commit development resources to any German city implementation before this probe.

**The permanent §34 floor (~30%):** unlike France's PDF ceiling (which CNIG SRU could eventually
fix), Germany's §34 fraction is a legal design choice, not a data gap. BauGB §34 deliberately
provides no numeric envelope — the standard is the character of the surrounding area, assessed
case-by-case. A system that fills a number for §34 parcels is stating a rule that does not exist.
This floor is permanent absent a legislative change to BauGB.

**Denmark comparison (~96%):** Denmark's Plandata delivers GRZ/GFZ/height as structured fields per
plan polygon. Germany's XPlanGML schema contains those same field names — the infrastructure is
architecturally equivalent. The gap is that German municipalities were never required to populate
those fields. DiPlanung is the mechanism that could close this gap — it is Germany's Plandata
equivalent, if implemented with structured attributes rather than PDF links.

---

## 2 — Phase tracker

| Phase | Goal | Unlocks | Rate: from→to | Effort | Status | Owner |
|---|---|---|---|---|---|---|
| **0** | Assess — Hamburg and Berlin XPlanung WFS confirmed live; GRZ/GFZ/Höhe confirmed absent from both schemas; BayBO Art. 6 setback confirmed; four-regime taxonomy characterised; RATE.md written | Honest baseline: ~28% confirmed; XPlanung structural gap characterised; DiPlanung as the pivotal unknown identified | — → ~28% | Complete | VERIFIED | UNASSIGNED |
| **1** | **DiPlanung probe:** fetch `diplanung.de/schnittstellen`; determine API endpoint and authentication; request one sample B-Plan; inspect XPlanGML response for GRZ/GFZ/Höhe attribute population | The pivotal gate — determines the implementation path (structured ingestion vs PDF transcription) for all 7 covered Länder | ~28% → ~28% (probe only) | Low — one API probe | NOT STARTED | UNASSIGNED |
| **2** | **§34 fraction measurement:** grid-sample probe for Hamburg and Berlin bboxes — classify each sample point as §30 B-Plan / §34 / §35 using XPlanung WFS presence/absence | Converts the §34 floor from an assumption (~30% national) to a measurement per city; required before committing per-city dev-day budgets | ~28% → ~28% (measurement only) | Medium — grid query | NOT STARTED | UNASSIGNED |
| **3** | Hamburg: read LBO formula (HBauO §6) via headless browser or PDF; Berlin: read BauO Bln §6; wire per-Land setback config values alongside confirmed BayBO Art. 6 | Completes the Abstandsflächen formula set for all three studied cities — the one structured field that is a formula, not a PDF attribute | ~28% → ~30% | Medium | NOT STARTED | UNASSIGNED |
| **4 (structured path)** | *IF DiPlanung Phase 1 returns structured attributes:* wire DiPlanung GRZ/GFZ/Höhe ingestion for Hamburg (the cleanest city — city-state, full XPlanung migration); implement four-regime classifier (§30 / §34 / §35) | Hamburg becomes the reference city for DiPlanung ingestion; regime classifier is reused for Munich and Berlin | ~30% → ~42–48% (Hamburg-weighted; blended national lower) | Medium — ~10–12 dev-days (Hamburg) | NOT STARTED | UNASSIGNED |
| **4 (PDF path)** | *IF DiPlanung Phase 1 is PDF-link-only:* download and text-layer-check one Hamburg B-Plan PDF (TB3.pdf confirmed accessible); confirm OCR/text-extraction viability; scope a PDF-transcription programme | Determines whether a Barcelona-style OCR pipeline is viable for Germany's B-Plan corpus | ~30% → ~30% (viability check only) | Low | NOT STARTED | UNASSIGNED |
| **5** | Munich: find WFS/DiPlanung endpoint; implement regime classifier; wire structured or PDF path per Phase 1 result | Second German city; reuses Phase 4 classifier; resolves DiPlanung October 2026 migration risk | ~42–48% → ~47–53% (blended) | Medium — ~12–15 dev-days | NOT STARTED | UNASSIGNED |
| **6** | Berlin: implement four-regime classifier (modern B-Plan + 1958/60 Baunutzungsplan legacy layer + §34 + §35); source Baustufen-translation table; wire structured or PDF path | Most complex German city — adds Baunutzungsplan layer and §34 East-Berlin carve-out to the classifier built in Phases 4–5 | ~47–53% → ~55–65% (ceiling; DiPlanung path) | High — ~30–35 dev-days | NOT STARTED | UNASSIGNED |

---

## 3 — The gap to Denmark (~96%)

**(a) §34 is a permanent structural floor — ~30% of Germany.** Denmark has no equivalent
"discretionary character of neighbourhood" regime covering a third of its parcels. Every
German implementation plan must account for this: the correct output for §34 parcels is not a
fill but a legally-grounded, positively-worded refusal. The gap to Denmark is partially
irresolvable — not by data engineering, and not by DiPlanung — because §34 BauGB deliberately
provides no numeric standard.

**(b) XPlanGML populated ≠ XPlanung compliant.** Germany's legal mandate (IT-Planungsrat 2017,
transition closed 2023) requires the geometry; it does not require GRZ/GFZ/Höhe to be populated.
Hamburg's full migration delivered geometry and PDF links — not numeric attributes. This is the
gap DiPlanung was designed to address, but whether DiPlanung enforces population of the numeric
fields is the open question. If it does not, every German municipality is legally compliant while
every B-Plan is still PDF-gated.

**(c) 16 Länder, 16 ALKIS licence regimes, 16 XPlanung delivery platforms.** Denmark has one
Plandata. Germany has 16 separate access points sharing one data model. Building a national
German pipeline requires 16 separate licence/access integrations — confirmed open for NRW and
Sachsen-Anhalt; partially confirmed for Berlin/Brandenburg; unknown for Bavaria; fee-based
suspected for others. This is not an insurmountable engineering problem, but it is a sustained
operations commitment, not a one-time build.

**(d) Berlin's Baunutzungsplan and voidance risk.** Berlin's 1958/60 legacy plan covers large
parts of West Berlin using pre-BauNVO "Baustufen" grading. OVG Berlin-Brandenburg 2020 established
that figures from this plan can be voided as *funktionslos* without warning. A Baunutzungsplan-
derived value can never ship above `corroborated, voidance-risk` confidence — permanently below the
`published` / `certified` tier achievable from a current B-Plan. This imposes a quality ceiling on
West Berlin parcels regardless of the DiPlanung outcome.

---

## 4 — Dependencies, blockers, and cross-jurisdiction reuse

**Hard dependencies:**
- **Phase 1 (DiPlanung probe) is the gating action.** All city implementations in Phases 4–6
  depend on knowing whether the path is structured-attribute ingestion or PDF transcription. Do
  not schedule implementation resources before Phase 1 returns.
- **Phase 2 (§34 measurement) is independent** of Phase 1 and can run in parallel — it uses the
  existing Hamburg and Berlin XPlanung WFS endpoints already confirmed live.
- **Phase 3 (setback formulas) is independent** of Phases 1–2 — BayBO Art. 6 is already confirmed;
  HBauO §6 and BauO Bln §6 are a headless-browser or PDF-fetch task.
- **Phase 4 (Hamburg) must precede Phase 5 (Munich) and Phase 6 (Berlin)** — Hamburg is the
  reference implementation. The regime classifier and DiPlanung ingestion pattern built for Hamburg
  are reused for Munich and Berlin, reducing their costs.
- **Phase 6 (Berlin) must follow Phase 4–5** — Berlin adds the Baunutzungsplan legacy layer and
  §34 East-Berlin carve-out on top of the classifier built for Hamburg/Munich. Berlin is not a
  starting point; it is the terminal city.

**Cross-jurisdiction reuse:**
- The BauNVO §17 ceiling table is a one-time national lookup, shared across all 16 Länder — built
  once, used everywhere.
- The four-regime classifier (§30 / §34 / §35 + Berlin §173(3)) is built once for Hamburg and
  extended for Munich (+ §34 fraction measurement) and Berlin (+ Baunutzungsplan layer). The
  XPlanung WFS presence/absence check pattern is identical in all three cities.
- The `setback` (height-proportional) `GeometricRule` kind is shared across all 16 Länder;
  only the multiplier/minimum is a per-Land config value. Build the kind once; configure per Land.
- The L-449 human-verification gate (Satzung cross-check before shipping a DiPlanung-derived value
  above `corroborated`) is the same gate used for every sourced jurisdiction.
- LoD2-DE (where open) delivers building heights in CityGML LoD2 — the same format as Barcelona's
  context buildings and France's LiDAR-derived LOD2. The ingestion pipeline can share the CityGML
  reader.

**Governing documents:** C58 (fidelity/provenance) · ADR-0269 (curate-then-serve) · L-449
(human-verification gate) · BauGB §§30/34/35 · BauNVO (§§2–11 zone taxonomy; §17 density
ceilings; §20 floor-area definition) · IT-Planungsrat resolution 5 Oct 2017 (XPlanung mandate) ·
XPlanGML v6.1 (exchange format schema) · Per-Land LBO (Abstandsflächen formula; read before each
city).

---

*Model references: **Denmark** `../dk/` (ceiling, ~96%) · **Hamburg** `de-hh/02000-hamburg/`
(reference city — start here). Governing: **C58** · **ADR-0269** · **L-449**.*

*Last updated: 2026-07-24. Maintainer: UNASSIGNED.*
