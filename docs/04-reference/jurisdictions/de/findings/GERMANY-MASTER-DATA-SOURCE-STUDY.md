# Germany — MASTER DATA-SOURCE & RULE-MECHANISM STUDY

**Companion to and supersedes in detail the initial context-data spike in `README.md`.** This
document goes one level deeper: for every requirement the PRYZM envelope card exposes, it
separates **what is genuinely federal** (one mechanism, works identically across all 16 Länder)
from **what is Land- or city-specific** (a different legal regime — not just different numbers,
but a different structural problem).

Three cities were studied in depth: **Hamburg**, **Munich (Bavaria)**, and **Berlin**. Each
presents a different cost profile, primarily because the fraction of parcels governed by the
§34 "fit the neighbourhood" regime — where no numeric envelope exists by design — differs
substantially, and in Berlin an additional historic-plan stratum (1958/60 Baunutzungsplan) adds
a fourth legal category absent in the other two.

**Germany's central complication, unlike France's, is not "which height mechanism"** (BauNVO's
zone taxonomy and §17 ceilings are genuinely federal) **but which of up to four legal regimes
governs a given parcel at all** — a classification step that must run *before* any numeric
sourcing.

**Status:** research + scoping. No rule pack is implemented by this document.

---

## PART A — THE FEDERAL COMMON BASELINE

### A.1 Regime classification — the mandatory first step everywhere

Before any numeric rule can be sourced for a German parcel, the pipeline must determine which
of four mutually exclusive regimes governs it:

| Regime | Legal basis | Numeric rules available? | Engine response |
|---|---|---|---|
| **(a) Modern B-Plan** | BauGB §30 | YES — GRZ, GFZ, Höhe in the B-Plan (XPlanGML) | Source and apply |
| **(b) Historic plan** (Berlin only: 1958/60 Baunutzungsplan) | §173(3) BBauG | PARTIAL — Baustufen grading; voidance risk | Source + flag voidance risk |
| **(c) §34 unplanned interior** | BauGB §34 | NO — discretionary "Einfügen"; legal standard, not a number | Reasoned refusal |
| **(d) §35 outlying area** | BauGB §35 | NO — presumptively not buildable | Reasoned refusal |

This four-way classifier is **Germany's prerequisite step**, analogous to Barcelona's
regime-detection before applying any clau rule. The difference: in Barcelona, the clau itself
signals the rule kind. In Germany, the B-Plan/§34/§35 split must be computed from the
*presence or absence* of a covering B-Plan polygon in the XPlanung layer, not from a zone-code
lookup.

**⚠ §34 is not a data gap.** The correct output for a §34 parcel is a legally-grounded refusal:
*"This parcel lies in an unplanned interior area (§34 BauGB). Buildability is assessed case-by-case
against the character of the surrounding area — PRYZM does not produce a numeric envelope here."*
A `null` treated as a gap is the L-526 error committed in Germany.

### A.2 BauNVO zone taxonomy — one national lookup table

The BauNVO (Baunutzungsverordnung) defines a **fixed, closed national list** of zone type codes
(§§2–11), each with a §17 density ceiling. This list is identical across all 16 Länder; a `WA`
zone in Hamburg means the same thing as `WA` in Munich or Berlin.

**Key practical point:** the §17 ceilings are **upper bounds**, never targets. A specific B-Plan
may set a lower GRZ/GFZ. The pipeline must read the B-Plan figure; use §17 only as a
sanity-check ceiling. A B-Plan value that *exceeds* §17 without a §17(2) derogation is illegal
and should be flagged, not used.

**Do not confuse BauNVO zone type codes with the B-Plan designation string.** A B-Plan may
designate an area as `WA-3` or `Allgemeines Wohngebiet mit besonderen Festsetzungen` — the
code for lookup against the §17 table is always the BauNVO type abbreviation (`WA`), stripped
of local suffixes.

### A.3 XPlanung / XPlanGML — the structured B-Plan exchange format

XPlanung (schema v6.1, exchange format XPlanGML) is the federal standard for B-Plan
digitisation, mandated since the IT-Planungsrat resolution of 5 October 2017. Transition was
formally closed in February 2023.

**What XPlanGML carries (when populated):**
- B-Plan polygon geometry
- Zone type (`BP_BaugebietsTeilFlaeche.allgArtDerBaulNutzung` → BauNVO type)
- GRZ, GFZ, and height (`hoeheMN` / `hoeheBezugspunkt`) as structured attributes
- A reference to the signed Satzung PDF (the legally binding document)

**The critical caveat: structured ≠ populated.** A municipality can deliver a valid XPlanGML
file containing only the B-Plan polygon and a PDF link, with GRZ/GFZ/height left null. Legal
compliance with the XPlanung mandate requires the geometry; it does not require the numeric
attributes to be populated. **Always probe for attribute null-rate before building an ingestion
pipeline.** Hamburg is the strongest case for full digitisation (fully migrated 2018, XLeitstelle
hosted there); other Länder are less certain.

**Signature gate (binding everywhere):** the printed, signed B-Plan Satzung (decree) is the
legally binding version. XPlanGML is informational. A numeric value sourced from XPlanGML
may ship as `corroborated` once cross-checked against the Satzung or an official municipal
viewer. It may not ship as `certified` without a parcel-level official certificate.

### A.4 Parcel geometry — ALKIS (per-Land)

ALKIS (Amtliches Liegenschaftskatasterinformationssystem) is the national standard for
cadastral geometry, part of the AAA-Modell (AFIS-ALKIS-ATKIS). The schema is identical across
all Länder; the access model is not.

| Land | Access status | Confirmed |
|---|---|---|
| NRW | Open / free | Confirmed |
| Sachsen-Anhalt | Open / free | Confirmed (LoD2 also open) |
| Berlin/Brandenburg (GDI-BE) | Partly open | Confirmed |
| Hamburg | Likely open (Transparenzportal HH) | Not yet probed live |
| Bavaria | Fee-based or registration (Bayerische Vermessungsverwaltung) | Not yet confirmed |

The join key for pipeline routing is the AGS (Amtlicher Gemeindeschlüssel), the 8-digit
municipality code. Every ALKIS parcel feature carries the commune's AGS; every XPlanung
B-Plan feature should also carry the commune AGS. Use this as the routing key, not a spatial
lookup (faster, more robust).

### A.5 Building footprints + height — LoD2-DE

LoD2-DE is the national building model: ~58 million buildings in CityGML LoD2 format, with
ALKIS footprints and LiDAR-derived heights (~1 m accuracy).

**Access pattern:** the ZSHH (coordinating office, hosted at Bavaria) runs a national gateway
under INSPIRE Art. 13(1)(e) (restricted). Several Länder publish their own LoD2 tiles as
free direct downloads — confirmed: Sachsen-Anhalt, Baden-Württemberg; Berlin (via FIS-Broker).
Bavaria is a plausible best case (ZSHH host) but terms not confirmed. Hamburg: not confirmed
separately from national feed.

**Germany vs France for context buildings:** LoD2-DE predates France's full LiDAR HD national
coverage (France is ~80% covered end-2025, full national by end-2026). Germany's ~58M LoD2
buildings already exist in CityGML. The licence picture is more fragmented than France's
national open-licence approach, but the data quality is comparable or better.

### A.6 Abstandsflächen — setbacks (Land-level concept, Land-specific values)

Height-proportional setback from the boundary is a concept universal across all 16 Länder
(derived from the LBO — Landesbauordnung). The standard formula is approximately 0.4H to 0.5H
from the boundary, with an absolute minimum of ~3 m. But:
- Hamburg LBO: specific multiplier and minimum
- Bavarian LBO (BayBO): specific multiplier and minimum
- Berlin LBO (BauO Bln): specific multiplier and minimum

One `GeometricRule` kind (`setback`, height-proportional) covers the concept; the
multiplier and minimum are per-Land config values. Read each Land's LBO before authoring a
pack. **Never assume 0.4H or 3 m as a universal number.**

---

## PART B — DEEP-DIVE PER CITY

### B.1 Hamburg — city-state, fully migrated, cheapest first German city

**Status:** PARTIAL — most complete digitisation of the three; one translation-table question
still open (pre-1960 citation preservation in XPlanGML).

**Hamburg's structural advantage over the other two cities:**
1. **City-state:** one jurisdiction, one Landesbauordnung, one ALKIS licence regime. No
   Land/municipality split.
2. **Full XPlanung migration:** 1,900 B-Pläne under BauGB + 900 plans under Hamburg's own
   older (pre-1960) building law — digitised between 2011 and 2018. The XLeitstelle (national
   XPlanung coordination office) is itself hosted inside Hamburg's state geodata agency (LGV).
3. **No Baunutzungsplan-equivalent legacy layer:** no identified West-Berlin-style historic
   plan stratum using pre-BauNVO zone codes.
4. **§34 fraction:** assumed small (continuously West German urban fabric, no documented
   large §34 gap), but **not yet measured** — see §B.1.B.

**A — VERIFIED (mechanism-level)**

| Field | Value | Governing basis | Source | Confidence |
|---|---|---|---|---|
| `xplanung.completeness` | 1,900 BauGB B-Pläne + 900 pre-1960 Hamburg-law plans fully digitised | Hamburg XPlanung migration project | Hamburg LGV / XLeitstelle | `published` |
| `xleitstelle.location` | National XPlanung coordination office hosted inside Hamburg LGV | — | Hamburg LGV | `published` |
| `jurisdiction.scope` | City-state: one jurisdiction, one building code, one cadastre licence regime | — | Constitutional/administrative fact | `published` |
| `regime.primary` | §30 BauGB (modern B-Plan) covers the dominant fraction — XPlanung fully migrated | BauGB §30 | Hamburg LGV | `published` |

**B — UNVERIFIED / open**

| Field | Why not verified | What would verify it |
|---|---|---|
| Pre-1960 Hamburg-law plans: XPlanGML citation preservation | The 900 pre-1960 plans appear to have been migrated into XPlanGML rather than kept as a separate legacy layer — but whether the XPlanGML record preserves the original Hamburg-law citation (needed for the signature gate) or only the numeric value is **not yet confirmed directly** | Fetch one pre-1960 Hamburg plan's XPlanGML file; check whether `rechtsstand` or `texte` attributes reference the original legal instrument |
| GRZ/GFZ/Höhe null-rate in Hamburg XPlanGML | Not probed — a valid XPlanGML file may carry only geometry | Run the probe in `NEXT.md §8`; count non-null attribute rate |
| §34 coverage fraction | Assumed negligible (full XPlanung) but not measured | Grid-sample probe over Hamburg bbox, classify each point B-Plan vs §34 |
| ALKIS parcel WFS access terms | Not confirmed for Hamburg LGV specifically | `curl "https://geodienste.hamburg.de/HH_WFS_ALKIS?SERVICE=WFS&REQUEST=GetCapabilities"` |
| Hamburg Abstandsflächen multiplier (Hamburg LBO) | LBO text not read | Hamburg Bürgerschaft, "Hamburgische Bauordnung (HBauO)" current version |

**Implementation estimate:** ~10–12 dev-days for the standard B-Plan/XPlanGML ingestion path.
Confirm the pre-1960 citation question before shipping any pre-1960-derived figure at `published`
confidence. Hamburg is the **cleanest German city** — analogous to Barcelona's `13a` as "one
city, done well, first." Start here.

---

### B.2 Munich (Bavaria) — medium cost, contingent on §34 measurement

**Status:** OPEN — regime classification assumptions not yet validated; major scheduling risk
from DiPlanung platform transition October 2026.

**Munich's complications vs Hamburg:**
1. **Not a city-state:** Bavaria's Landesbauordnung (BayBO), Bavaria's ALKIS terms, and
   Bavaria's XPlanung delivery (DiPlanung from October 2026) all differ from Hamburg's.
2. **DiPlanung timing:** Bavaria's mandatory statewide XPlanung delivery platform becomes
   mandatory 31 October 2026. A Munich integration built before that date targets the interim
   system (existing Bavarian XPlanung services + Munich's own geoportal). If a dev build lands
   close to October 2026, the platform it targets may be replaced weeks later.
3. **§34 coverage fraction:** Munich's fabric is continuously West German (unlike Berlin's
   East-West split), suggesting a smaller §34 fraction than Berlin. But this is an assumption,
   not a measurement.

**A — VERIFIED (mechanism-level)**

| Field | Value | Governing basis | Source | Confidence |
|---|---|---|---|---|
| `platform.transition` | Bavaria's DiPlanung becomes mandatory statewide XPlanung delivery from 31 October 2026 | Bavarian state mandate | DiPlanung programme | `published` |
| `platform.interim` | Until October 2026: existing Bavarian XPlanung services + Munich's own geoportal | — | — | `published` |
| `regime.baunutzungsplan_equivalent` | No equivalent West-Berlin-style legacy layer identified for Munich in this pass | — | — | `unconfirmed, not asserted absent` |
| `lod2.source` | Bavaria hosts the ZSHH (national LoD2-DE coordination office) — plausible best-case for in-Land licence terms | ZSHH / AdV | Bavarian state survey office | `published` (existence); licence terms not separately confirmed |

**B — UNVERIFIED / open**

| Field | Why not verified | What would verify it |
|---|---|---|
| §34 coverage fraction | Assumed smaller than Berlin, not measured | Grid-sample probe over Munich bbox, classify B-Plan vs §34 vs §35 coverage — see `de/NEXT.md §3.4` |
| Bavarian LoD2 licence terms | ZSHH hosting ≠ confirmed free/open terms for direct Bavarian access | Check `geodaten.bayern.de` LoD2 product page and licence text |
| GRZ/GFZ/height values for any specific Munich B-Plan zone | Not sourced in this pass | Munich/Bavarian XPlanung feed, per target parcel (interim platform or DiPlanung) |
| Munich ALKIS WFS terms | Bayerische Vermessungsverwaltung terms not read | `geodaten.bayern.de` — look for parcel/Flurstück WFS endpoint and licence |
| Bavarian Abstandsflächen multiplier (BayBO) | BayBO text not read | BayBO current text; search for "Abstandsflächen" article |

**Implementation estimate:** ~12–15 dev-days for standard B-Plan/XPlanGML ingestion, contingent
on the §34-coverage check. **Treat the dev-day estimate as an assumption until the §34 fraction
is measured.** Flag the Oct-2026 DiPlanung migration as a scheduling risk: commit to one
platform or coordinate with the Bavaria migration timeline.

---

### B.3 Berlin — most complex, 4 regimes, ~30–35 dev-days

**Status:** OPEN. Regime classifier is the prerequisite step — this is the actual first
engineering task for Berlin, not a byproduct of an API call.

**Berlin's three structural complications (all absent in Hamburg, partly absent in Munich):**
1. **Four regimes on neighbouring parcels.** Modern B-Plan, 1958/60 Baunutzungsplan (West
   districts only), §34 (documented in large former-East districts), §35 (outlying).
2. **1958/60 Baunutzungsplan:** a pre-BauNVO legacy plan using "Baustufen" grading (not modern
   BauNVO zone letters), binding per §173(3) BBauG, with judicially-established voidance risk.
3. **§34 prevalence in former-East Berlin:** Berlin parliamentary record explicitly documents
   that large parts of former East Berlin districts have no legally-effective plan (pre-1990
   plans were not carried over; no post-unification B-Plan adopted). §34 governs them — no
   numeric envelope possible.

**A — VERIFIED (mechanism-level)**

| Field | Value | Governing basis | Source | Confidence |
|---|---|---|---|---|
| `regime.classifier` | 4 possible regimes per parcel: (a) modern B-Plan, (b) 1958/60 Baunutzungsplan (West only), (c) §34 unplanned interior, (d) §35 outlying area | §§30/34/35 BauGB | BauGB | `published` |
| `regime.a_source` | Modern B-Plans in XPlanung; FIS-Broker hosts B-Plan geometry + scanned Begründungen | XPlanGML | Berlin FIS-Broker (`fbinter.stadt-berlin.de`) | `published` |
| `regime.b_source` | 1958/60 Baunutzungsplan: preparatory land-use plan for pre-1990 West Berlin, binding per §173(3) BBauG, Baustufen grading, predates XPlanung | Baunutzungsplan 1958/60; §173(3) BBauG | Berlin FIS-Broker (legacy digitised layer) | `published` |
| `regime.b_voidance_risk` | Baunutzungsplan figures can be judicially struck down as *funktionslos*; OVG Berlin-Brandenburg 2020: GFZ 1.5 in Neukölln voided as no longer realizable | OVG Berlin-Brandenburg, Az. 2 B 10.17, 15 Sep 2020 | Court ruling | `published` — treat as `corroborated, voidance-risk` not `published` |
| `regime.c_basis` | §34: buildability judged by "Eigenart der näheren Umgebung" — character of surrounding area — case-by-case, discretionary, no numeric table | §34 BauGB Abs. 1 | BauGB | `published` (as a *legal fact of no numeric rule*, not a data gap) |
| `regime.c_prevalence_berlin` | §34 documented as covering large parts of former East Berlin districts | Berlin parliamentary record | Berlin Abgeordnetenhaus documentation | `published` |
| `regime.d_basis` | §35: outlying area, presumptively not buildable except privileged uses | §35 BauGB | BauGB | `published` |
| `overlay.erhaltungsverordnung` | Berlin's conservation-area statute layers on top of whichever regime applies underneath | Erhaltungsverordnung per district | Berlin district authority | `published` (existence) |

**B — UNVERIFIED / open**

| Field | Why not verified | What would verify it |
|---|---|---|
| Regime assignment for any specific Berlin parcel | No classifier built — this is the actual first engineering task | Cross-query: FIS-Broker for (a); Baunutzungsplan legacy layer for (b); absence-of-plan + built-fabric survey for (c)/(d) |
| Baustufen → modern GRZ/GFZ-equivalent translation table | Does not exist in XPlanGML; needs historical plan legend | Berlin Senate archive, Stadtentwicklungsamt — original Baunutzungsplan legend/key from 1958/60 documentation |
| Current voidance status of any specific Baunutzungsplan figure | Case-law check required per parcel/area; no database of "already voided" figures | Manual case-law search per target area, analogous to a title search |
| §34 "fit" assessment for a specific parcel | Structurally has no numeric answer — only a built-fabric survey approximates it | Survey of neighbouring building heights/footprints — same method as Barcelona's clau-12b fallback |
| §35 boundary (where §34 ends and §35 begins) | Frequently a source of legal dispute | Case-by-case administrative/court determination; no clean data source |
| Berlin ALKIS WFS open access status | GDI-BE confirmed as partly open, specific ALKIS parcel endpoint not confirmed | `curl "https://gdi.berlin.de/..." ` — check portal for ALKIS WFS endpoint |

**Implementation estimate:** ~30–35 dev-days for the four-way regime classifier + Baustufen-table
sourcing, before certification. The Baunutzungsplan layer and the §34-prevalence problem are
**Berlin-specific** and do not transfer to Munich or Hamburg.

---

## PART C — CROSS-CITY COMPARISON AND SEQUENCING

| | Hamburg | Munich | Berlin |
|---|---|---|---|
| Regime complexity | LOW — §30 B-Plan dominates; no historic plan | MEDIUM — §34 fraction unknown | VERY HIGH — 4 regimes |
| XPlanung completeness | HIGHEST — fully migrated 2018 | HIGH (expected) — DiPlanung Oct 2026 risk | HIGH (modern B-Plans) + separate legacy layer |
| LoD2-DE access | Unknown (ZSHH restricted; own tiles TBD) | Best-case (ZSHH host) | Open via FIS-Broker |
| Historic plan risk | NONE identified | NONE identified | HIGH — Baunutzungsplan voidance |
| §34 prevalence | Assumed small (unmeasured) | Assumed small (unmeasured) | DOCUMENTED LARGE (East districts) |
| Dev-day estimate | ~10–12 | ~12–15 (§34 measurement contingent) | ~30–35 |

**Sequencing finding:** Hamburg → Munich → Berlin. Start with the most defensible case (one
city-state, full XPlanung, no historic-plan trap, no documented §34 gap), then the medium-cost
one (contingent on one measurement), then the expensive one (dedicated regime classifier + legacy
sourcing). The Hamburg XPlanGML ingestion path reuses as the foundation for Munich's B-Plan path;
the regime classifier built for Munich then extends to Berlin (adding the Baunutzungsplan layer and
the §34 East-Berlin carve-out).

---

## PART D — WHAT NOT TO ATTEMPT (structurally absent, not just unsourced)

- **A numeric envelope for any §34 parcel.** No numeric table exists by design. The correct
  output is a legally-grounded, positively-worded refusal. `null` treated as a gap is wrong.
- **A single federal XPlanung API.** The standard is federal; the services are per-Land. Budget
  16 integrations sharing one reader, not one endpoint.
- **Treating a Baunutzungsplan or pre-1960 Hamburg figure as `certified`/`published`** without a
  voidance check (Berlin) or citation-preservation check (Hamburg).
- **Using §17 BauNVO ceilings as a parcel rule.** They are ceilings — the parcel rule is in the
  B-Plan. A parcel rule that matches the §17 ceiling may exist by coincidence, not by design.

---

## PART E — RECOMMENDED NEXT CONCRETE TASK

Run the Hamburg XPlanGML live probe described in `NEXT.md §8`. This single check resolves:
1. Whether Hamburg B-Plan GRZ/GFZ/Höhe attributes are populated (determines if ingestion
   yields numeric rules or only geometry + PDF links)
2. The ALKIS WFS authentication situation for Hamburg
3. The §34 fraction for Hamburg (grid-sample probe over the bbox)

This converts "is Hamburg the cheapest German city" from an assumption into a measurement —
exactly mirroring the France recommendation (Lyon GPU WFS probe as the cheapest next step).
If Hamburg attributes are populated: Hamburg pack can begin immediately at ~10–12 dev-days.
If not: all three cities require PDF-transcription paths and Munich may be cheaper first.

---

**Cross-refs:** `../README.md` (country umbrella) · `../NEXT.md` (blockers + resume steps) ·
`de-hh/02000-hamburg/README.md` · `de-by/09162-munich/README.md` · `de-be/11000-berlin/README.md`
