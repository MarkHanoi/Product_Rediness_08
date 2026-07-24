# Antwerp (`ant-antwerp`) — Jurisdiction Pack (Flanders / VCRO)

**Country:** `be` · **Region:** Flanders · **ISO 3166-2:** `BE-VLG` · **NIS code:** `11002` ·
**Pack id:** `be-vlg-antwerp` ·
**Governing instruments:** Gewestplan (still-effective designations) superseded by RUPs
(gemeentelijke / provinciale / gewestelijke ruimtelijke uitvoeringsplannen) ·
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — research complete; no pack implemented

---

## 1 — What governs here

- **Governing-instrument chain:** `parcel → gewestplan designation (if no superseding RUP) | RUP stedenbouwkundige voorschriften → goede ruimtelijke ordening (VCRO Art. 4.3.1) → gemeentelijke stedenbouwkundige verordening`.
- **Rule KIND (ADR-0270 / C58 §2.2):** DEPENDS ON RUP — where a RUP states a numeric height ceiling: `coverage-and-far` or a height-specific kind. Where a RUP leaves height "vrij" (free): the correct output is an explicit **refusal** ("no numeric ceiling — subject to case-by-case goede-ruimtelijke-ordening review"), NOT an empty field. This "vrij" case is a legitimate, frequent answer in Flanders, not an edge case.
- **Setback-governed vs alignment-governed:** depends on the specific RUP's voorschriften. Some RUPs set explicit setback distances; others fold siting into the goede-ruimtelijke-ordening test. Confirm per RUP before assuming either.
- **Legal-structure trap watch (P1):**
  1. **Gewestplan vs RUP determination:** the pipeline must first establish whether a more recent RUP supersedes the 1970s–80s gewestplan for this parcel. This is a spatial classification step (which RUP polygons cover this parcel?), not a lookup.
  2. **"Clichering" (VCRO Art. 7.4.2/2):** any percentage-based provision in a RUP adopted after 1 September 2009 is statutorily void. A card sourcing such a provision must check Art. 7.4.2/2 applicability **before** shipping the value.
  3. **"Vrij" height:** some RUPs explicitly state the maximum height of buildings is "vrij" (free), delegating the numeric question entirely to the goede-ruimtelijke-ordening discretionary test. Do not treat "vrij" as a data gap; treat it as a definitive "no numeric ceiling applies" result.

### The four-step Flanders instrument cascade (must resolve per parcel before numeric sourcing)

| Step | Question | Answer path |
|---|---|---|
| 1 | Is the parcel inside a gewestelijk, provinciaal, or gemeentelijk **RUP** boundary? | Query DSI `lu:lu_si_gv` (plan-element footprints) for the parcel's centroid |
| 2 | If yes: does the RUP's voorschriften text state any numeric height/GVR (grondvlakratio) provision? | Read the voorschriften document linked from the `lu:lu_si_gv` feature; look for "maximale bouwhoogte," "aantal bouwlagen," "GVR" |
| 3 | If a numeric provision exists: is it a post-2009 percentage-based provision subject to Art. 7.4.2/2 nullification? | Check the adoption date of the RUP; if post-1 September 2009 and the provision is percentage-based, treat as void |
| 4 | If no RUP or RUP leaves height "vrij": apply the gewestplan affectation category as the land-use context; the operative test is goede ruimtelijke ordening alone — output a reasoned refusal | VCRO Art. 4.3.1 |

Plus: **gemeentelijke stedenbouwkundige verordening** may add a municipal building ordinance on top
of whichever regional/provincial instrument applies. Check whether Antwerp has adopted one and whether
it contains numeric provisions not in the overlying RUP.

---

## 2 — Pack status

| Dimension | Status | Gate condition |
|---|---|---|
| **Gewestplan vs RUP determination** | NOT STARTED — DSI WFS robots-blocked | DSI `lu:lu_si_gv` WFS accessible live; gewestplan vs RUP coverage probed for a test Antwerp parcel |
| **RUP voorschriften text read** | NOT STARTED | DSI GetFeature returns a voorschriften PDF URL; PDF opened and numeric provisions extracted |
| **Art. 7.4.2/2 nullification check** | NOT STARTED | RUP adoption date confirmed + provision type classified |
| **"Vrij" height refusal output** | NOT STARTED | Refusal kind ratified; output schema confirmed |
| **GRB LOD1 building heights** | NOT STARTED — robots-blocked | `mercator.vlaanderen.be` or alternative Flanders building WFS accessible live |
| **Heritage overlay** | ENDPOINT LIVE — ✅ | `geo.onroerenderfgoed.be/geoserver/wfs` confirmed HTTP 200; GetFeature for Antwerp parcel not yet run |
| **Gemeentelijke verordening** | NOT STARTED | Check whether Antwerp has adopted a gemeentelijke stedenbouwkundige verordening with numeric provisions |

Refusal vocabulary: `regime-undetermined` (gewestplan vs RUP not yet classified) ·
`legal` (RUP explicitly "vrij" — no numeric ceiling by design) ·
`legal-nullification` (post-2009 percentage-based provision void under Art. 7.4.2/2) ·
`coverage-gap` (RUP exists but voorschriften PDF not yet sourced)

---

## 3 — Granularity (C58 §1.11)

RUP provisions apply at the **deelgebied** (sub-zone) or **grondvlak** (plan-element footprint)
level within the RUP boundary — not at the parcel level directly. A single RUP may contain multiple
deelgebieden with different voorschriften. The parcel must be intersected with the correct
deelgebied polygon to identify the applicable provisions.

Gewestplan designations apply at the gewestplan-zone polygon level — much coarser than a RUP.

**Granularity: RUP deelgebied level (or gewestplan zone level as fallback).** Never assume the
whole RUP boundary applies the same numeric provisions — read the deelgebied intersection first.

---

## 4 — The number

**0% of clicks return a full, cited envelope (not started).** Denominator: any Antwerp parcel for
which (a) the gewestplan/RUP determination places it under a RUP with a stated numeric height
provision, AND (b) that provision survives the Art. 7.4.2/2 nullification check. This denominator
is itself unknown until the DSI WFS is accessed live.

**Research estimate for Flanders: ~0–5%** structured-numeric-fill rate (see `RATE.md §2`). The
low ceiling reflects that many RUPs leave height "vrij" and the goede-ruimtelijke-ordening test is
the load-bearing mechanism for most envelope questions.

---

## 5 — Height mechanism

Flanders has no region-wide numeric gabarit baseline equivalent to Brussels' RRU Titre I. Height
is stated (or not stated) in each RUP's own **stedenbouwkundige voorschriften** text. Common forms:

| Form | Example | Notes |
|---|---|---|
| Absolute maximum height in metres | "maximale bouwhoogte: 12 m boven het maaiveld" | Cleanest case — straight lookup from voorschriften |
| Maximum number of bouwlagen (floors) | "maximaal 3 bouwlagen" | Requires a floors-to-metres conversion convention (typically 3.0–3.5 m/floor) |
| "Vrij" with goede ruimtelijke ordening | "de maximale hoogte is vrij te bepalen, mits goede ruimtelijke ordening" | Output: explicit refusal — no numeric ceiling |
| Percentage-based GVR (grondvlakratio) | "GVR: maximaal 60%" | Check Art. 7.4.2/2: if post-2009 adoption, treat as void |

**Antwerp DHMV II note:** Antwerp is NOT named in the 13 DHMV I centrumsteden gap list — full
DHMV-II-based GRB coverage is expected for Antwerp. Confirm before assuming.

---

## 6 — Open questions / unverified

> Research notes that cannot yet be cited go HERE — never in `sources/SOURCES.md`.

- **DSI WFS live access for Antwerp:** `geoservices.informatievlaanderen.be` is robots-blocked.
  The `mercator.vlaanderen.be` alternative is the priority probe.
- **Fraction of Antwerp parcels with a superseding RUP vs. still-active gewestplan:** unknown.
  A grid-sample probe (same method as Barcelona clau-distribution or Germany §34-fraction probe)
  would convert this assumption into a measurement — required before committing a dev-day budget.
- **Fraction of Antwerp RUPs with explicit numeric height provisions vs. "vrij":** unknown.
  This is the Flanders analogue of Germany's XPlanGML structured-field completeness question.
- **Antwerp gemeentelijke stedenbouwkundige verordening:** whether Antwerp has adopted a municipal
  building ordinance with numeric provisions layered on top of regional/provincial RUPs is not
  confirmed in this pass.
- **Antwerp DHMV II coverage:** expected to be full (Antwerp not in DHMV I gap list), but a direct
  confirmation before any Antwerp LOD context-data development is prudent.

---

**Related files:** `../../README.md` (country umbrella) · `../../NEXT.md` (blockers + resume) ·
`../../findings/BELGIUM-MASTER-DATA-SOURCE-STUDY.md §B.2` (full Antwerp analysis) ·
`sources/SOURCES.md` · `NEXT.md`
