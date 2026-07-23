# Italy — Master Data-Source & Rule-Mechanism Study

**Status:** research complete · **Date:** 2026-07-23 · **Method:** same as France and Germany studies

> This document is the primary research record for Italy's buildable-envelope engine scoping.
> It was authored as a companion to the France and Germany master studies, using the same method:
> separate what is genuinely national from what a region, and then a municipality, does differently —
> and treat a different legal mechanism as a different engineering problem, not a parameter change.

---

## Headline finding

Italy splits the France/Germany problem into **three** separate layers instead of two, and that
third layer is what makes it the most fragmented of the three countries studied:

1. **Cadastral geometry** — genuinely national (Catasto, Agenzia delle Entrate, one WFS, CC BY 4.0,
   nationwide except AP Trento and Bolzano).
2. **Zone taxonomy** — nominally national (DM 1444/1968, A–F letters), but in practice a 1968
   *minimum-standards* framework that fewer and fewer large cities use as their operative mechanism.
3. **Planning instrument** — **regional competence** (Title V of the Constitution): 19 regions and
   2 autonomous provinces each have their own planning law, each inventing or reforming away their
   own planning instrument — not just their own numbers.

**So Italy has France's "every commune drafts its own numbers" problem, Germany's "delivery is
state-by-state" problem, and a third problem neither of them has: the operative planning instrument
type itself can differ by region, and the zoning mechanism can differ again by city even within one
region.**

The one area where Italy is genuinely ahead of both France and Germany: heritage/landscape overlay
data (SITAP + Vincoli in Rete) is a single national system under one legal code (D.Lgs. 42/2004),
not a per-Land or per-PLU one — though SITAP is explicitly self-described as informational only.

---

## Part A — The National Common Baseline

### A.1 Parcels and cadastre

**National baseline:** the Catasto (cadastre), run by the Agenzia delle Entrate, is a genuinely
unified national system. The cadastral cartography WFS service is aligned with the national
cadastral database, continuously updated through technical filings submitted by licensed
professionals. Coverage: entire national territory, with the exception of AP Trento and Bolzano
(which manage their own cadastral systems by state delegation — hard exclusion from the national WFS).

- **WFS:** `wfs.cartografia.agenziaentrate.gov.it` · **WMS:** `wms.cartografia.agenziaentrate.gov.it`
- **Licence:** CC BY 4.0
- **Bulk download:** available since February 2025 for parcels and addresses nationwide
- **Scale:** >300,000 sheets · >85 million parcels · 18 million buildings
- **Precision caveat:** not survey-grade; predates high-precision aerial photography — same standing caveat as French PCI Express

**§A.1.D Deviations:**
- **Trento and Bolzano:** own cadastral systems by statutory delegation — hard exclusion from national WFS; separate integration required from day one.
- **Precision caveat (national):** cadastral geometry is not survey-grade.

### A.2 Zoning identification — a national taxonomy that fewer and fewer cities actually use

**National baseline:** DM 2 aprile 1968, n. 1444, Art. 2, divides Italian territory into homogeneous
zones: A (historic centres), B (already built-up), C (new residential expansion), D (industrial),
E (agricultural), F (public facilities). Art. 7–9 attach national floor rules:
- Art. 7–8: ceiling `densità edilizia` (mc/mq or mq/mq) by zone type
- Art. 9: 10 m minimum distance between buildings with facing windows (subject to regional derogation under DPR 380/2001 Art. 2-bis)

**What is NOT national:** DM 1444's zone letters are a 1968 minimum-standards framework, not the
plan document itself. The actual instrument that zones a given parcel — and the actual numbers — are
set by whichever regional planning law and municipal plan applies. Many modern municipal plans still
use A/B/C as a reporting overlay for standard calculations while running their own entirely different
operative zoning scheme underneath. Milan's post-2019 PGT does not zone by DM 1444 letter at all
for its built-up area; Rome's 2008 PRG classifies land by `tessuto` typology, not by letters.

**§A.2.D Deviations:** regions can modify DM 1444 categories by their own law (e.g. regional laws
establishing criteria for assimilating zones to type A or B).

### A.3 The regional-instrument split

This is Italy's deepest structural fact, sitting one layer above anything France or Germany has.
Unlike France (one national planning code, purely local numbers) or Germany (one federal zone
taxonomy, purely state-level building law), Italy's town-planning instrument itself — not just its
numbers, its legal architecture — is a regional competence. The 19 regions plus 2 autonomous
provinces have not converged on one design. See `regions/README.md` for the full instrument map.

**Why this splits harder than Germany's three-regime split or France's document-type variation:**
In Germany, the instrument type (B-Plan vs §34 vs §35) is one federal statute's own internal
categories, applied uniformly by every Land. In France, the instrument (PLU/PLUi/RNU) is one
national code's categories. In Italy, the instrument is drafted independently by each region —
a "PUC" in Campania and a "PGT" in Lombardy are not two labels for the same legal mechanism.

### A.4 Height, distance, and density — national floor, not operative numbers

- **Codice Civile Art. 873** — national civil-law minimum boundary setback: **3 m** absent stricter local rule.
- **DM 1444/1968 Art. 9** — nationally inderogable minimum distance between facing buildings: **10 m** where either facade has windows (subject to regional derogation under DPR 380/2001 Art. 2-bis).
- **DM 1444/1968 Art. 7–8** — national ceiling density (`mc/mq`) and minimum-height/light rules by zone type.

**What is NOT national:** specific height, footprint, and density figures for a given parcel come
from the regional instrument and municipal plan. Art. 9's 10 m floor is itself subject to regional
derogation — a `BAND_EDGE_GUARD_M`-style discipline is needed: a distance figure from DM 1444 Art. 9
alone is not the operative figure without checking whether the region's derogation law applies.

**Italy's FAR-equivalent:** SUL/SLP (`superficie utile lorda / superficie lorda di pavimento`) paired
with the `indice di fabbricabilità` (`mc/mq` or `mq/mq`). Unlike France (FAR abolished 2014), Italy
has NOT abolished its FAR-equivalent nationally. But individual cities are moving away from it on
their own initiative (Milan's PGT territorial-index perequation system) — a municipal choice, not a
national legal fact.

### A.5 Machine-readable zoning rules — no national equivalent to XPlanung or SRU

No national standard for structured machine-readable municipal zoning rules was found. Regional
geoportals mosaic their own municipalities' plans at uneven quality. No public national portal fills
the gap — private aggregators (UrbisMap, PgtOnLine) have, which is itself the clearest available
evidence that the gap is real and monetizable. PgtOnLine integrates Agenzia delle Entrate cadastral
cartography with municipal SIT vector layers for municipalities that have developed them, and charges
for premium access. Italy's position is if anything *behind* France's CNIG SRU pilot.

### A.6 Buildings, height, and LOD — no national LoD2 program

Italy has a national terrain elevation program (PST/SIM, MASE, CC BY 4.0) but **no equivalent
national building-footprint-plus-height product** (nothing playing the role of France's BD TOPO
`HAUTEUR` or Germany's LoD2-DE). PNRR-funded SIM expansion targets 100% terrain coverage by 2026
(25 cm resolution, ~8 cm vertical accuracy) but remains a terrain/surface product.

Building height data, where it exists as structured GIS, is produced region by region from each
region's own topographic database. Piedmont (ARPA Piemonte Edifici 3D) is the clearest example:
per-building volumetric footprints with mean elevation derived from the regional BDTRE topographic
database + terrain sources, including a per-building quality/derivation code. There is no reason to
assume this pattern exists for every region — it needs per-region confirmation exactly like
Germany's per-Land LoD2 licence check, but starting from a lower prior (no coordinating federal body).

### A.7 Heritage and protective overlays — Italy's structural advantage

Heritage and landscape protection is governed by a single national law (D.Lgs. 42/2004, Codice dei
Beni Culturali e del Paesaggio, MiC) and exposed as queryable national GIS data through two systems:
- **SITAP** — georeferenced perimeters of landscape constraints (Artt. 136/157, 142(1)(m) D.Lgs. 42/2004)
- **Vincoli in Rete** — cultural-heritage protections (Parts II and III of D.Lgs. 42/2004)

This is a genuinely national, single-system overlay layer — the direct structural win Italy has over
both France (per-ABF perimeter) and Germany (per-Land Denkmalschutz register).

**§A.7.D Caveat:** SITAP self-describes its own limits: acknowledged incompleteness, variable
positional accuracy, "purely informational and support character." A `NOT FOUND` from SITAP does not
certify absence — only absence of a *recorded* constraint. Ship no higher than `corroborated` without
a parallel check against the underlying decree.

### A.8 Massing/capacity metrics

Italy's working floor-area concept is SUL/SLP paired with the `indice di fabbricabilità` (fondiario
or territoriale, `mc/mq` or `mq/mq`). Unlike France (FAR abolished), this concept remains alive
nationally, closer to Germany's still-in-force GFZ — but as Milan's case shows, individual cities
can and do choose to stop using a per-parcel index in favour of an envelope/perequation-derived
system. There is no national standard dwelling-module m²/unit figure — this would need a
project-chosen assumption, flagged as such.

---

## Part B — Deep-Dive Per Municipality

### B.1 Milan (Lombardy — PGT)

Milan's planning instrument is Lombardy's own PGT (Piano di Governo del Territorio, L.R. 12/2005),
split into the Documento di Piano, Piano dei Servizi, and Piano delle Regole. The operative density
rule, since the current PGT variant, is **not a per-zone index at all**:

- Land inside the Tessuto Urbano Consolidato (TUC) is assigned a single unified territorial
  building-rights index (`Indice di edificabilità Territoriale`) of **0.35 mq/mq**, verified
  against the parcel's functional lot, generating perequated development rights.
- A ceiling of **0.70 mq/mq** is achievable within the TUC only through the use of
  transferable/perequated rights, bonus mechanisms, and social-housing quotas.
- This is a fundamentally different mechanism from DM 1444's zone-by-zone density table — one
  citywide number plus a rights-trading system layered on top, structurally closer to a
  cap-and-trade allocation than a lookup table.
- Milan still classifies some areas conventionally (agricultural land, ERS zones are explicitly
  excluded from the unified index) — a pack needs both mechanisms.
- Data access: Lombardy's Geoportale hosts the PGT archive; Milan's `pgt.comune.milano.it`
  publishes NTA text and tavole — but the perequation ledger itself is not evidently exposed as
  queryable GIS.

**Estimate:** a genuinely new engine kind is required (territorial-index-plus-perequation, not a
zone-table lookup). **~20–25 dev-days** for the kind plus NTA sourcing, dominant TUC mechanism
only. ERS and agricultural carve-outs are separate smaller sourcing tasks.

### B.2 Rome (Lazio — PRG 2008, Roma Capitale)

Rome's PRG (adopted 2008, still current) classifies land by **fabric type** (`tessuto`), inside four
broad *sistemi*:
- "Tessuti della Città Storica" — point-by-point transformation rules at 1:5,000
- "Città Consolidata" — governed by a "Carta per la Qualità" cataloguing archaeological, monumental,
  and fabric elements; further subdivided by fabric-density typology: T1 (early-20th-c. expansion,
  medium density), T2 (defined typology, high density), T3 (free building typology)
- "Città da Ristrutturare" and "Città della Trasformazione" — indirect intervention (requiring a
  further executive plan) is the ordinary regime

The direct/indirect intervention split means **whether a numeric envelope can be read directly off
the PRG, or whether a second not-yet-existing plan must first be approved, is itself a
parcel-by-parcel classification question** — a genuine parallel to Germany's B-Plan/§34 split.

The Carta per la Qualità overlay precedence is contested: recent amendments were criticized for
downgrading the Carta's force relative to tessuto rules, such that in case of conflict, tessuto rules
now prevail — a live precedence-rule risk analogous to Marseille's graphic-primacy rule.

**Estimate:** the tessuto-typology mechanism, plus the direct/indirect-intervention classification
step, plus the Carta per la Qualità precedence question — **~25–30 dev-days** before certification
for Città Storica + Città Consolidata T1–T3. Città da Ristrutturare and Città della Trasformazione
are separate tasks, likely warranting the same reasoned-refusal treatment as Barcelona's indirect-
intervention zones until a site-specific executive plan exists.

### B.3 Turin (Piedmont — PRG)

Piedmont is one of the regions that kept the classic PRG name and, on available evidence, the classic
DM 1444 zone-letter mechanism more directly than Milan or Rome — this needs direct primary-text
confirmation (Turin's current PRG NTA were not sourced in this pass) but is the working assumption
based on Piedmont retaining the PRG instrument.

Geometry/data access is comparatively strong:
- Piedmont publishes a regional PRG mosaic WMS covering destinazioni d'uso, vincoli, and piani
  esecutivi (explicitly of uneven currency; provincial capitals among more recently updated zones)
- ARPA Piemonte's Edifici 3D dataset: per-building volumetric footprints with mean elevation for the
  whole region — if the height field is reliable for Turin specifically, Turin is the closest Italian
  analogue to Lyon's "structured attribute already on the map" case

**Estimate:** contingent on confirming the PRG NTA still uses conventional DM 1444-style zone
letters with numeric tables. **~10–15 dev-days** if the zone-letter/numeric-table assumption holds.
Confirm by direct primary-source read of Turin's current PRG norme tecniche before committing.

### B.4 Cross-city comparison

| | Milan | Rome | Turin |
|---|---|---|---|
| Regional instrument | PGT (Lombardy-only name/law) | PRG (Roma Capitale, Lazio) | PRG (Piedmont) |
| Zoning mechanism | Unified territorial index + perequation (no zone-letter table) | Historic-fabric typology (`tessuto`) + direct/indirect intervention split | Classic DM 1444 zone letters + numeric table (assumption, unconfirmed) |
| DM 1444 letters still operative? | No — superseded by TUC territorial index | No — superseded by tessuto/sistema classification | Plausibly yes — needs confirmation |
| New engine kind required? | Yes (index + rights-ledger kind) | Yes (typology + intervention-mode precedence kind) | Probably not, if the zone-letter assumption holds |
| Building-height GIS available? | Not evidently exposed regionally beyond Milan's own SIT | Not evidently exposed regionally beyond Rome's own SIT | Yes — ARPA Piemonte Edifici 3D (region-wide) |
| Rough dev-days, dominant mechanism only | ~20–25 | ~25–30 | ~10–15 (contingent) |

**The finding that should drive sequencing:** exactly as in France, the three obvious first cities
are three different software problems, and none of them shares the underlying regional law with the
others. Milan and Rome have each moved away from the national DM 1444 zone-letter mechanism in
their own, mutually incompatible directions. If the founder wants the cheapest first Italian city,
**Turin is the candidate this research points to, pending direct confirmation of its current PRG
mechanism** — not Rome (capital-city intuition) and not Milan (largest-economy intuition), the same
lesson as Hamburg for Germany and Lyon for France.

---

## Part C — Project shape

Italy's ~7,900 municipalities is a smaller number than France's ~34,900 and closer to Germany's
~10,800, but the regional-instrument split means this is not simply "Germany with fewer, more
varied Länder":

1. A "national Italy integration" is really **up to 21 separate legal-mechanism integrations** — worse
   than Germany's "one BauNVO taxonomy, 16 licence regimes" case, because in Italy even the zoning
   *taxonomy* is not reliably shared once inside a specific region's instrument.
2. **Large cities are independently drifting away from the one nominally national taxonomy that exists**
   (DM 1444), in mutually incompatible directions — meaning even solving "read DM 1444 zone letters"
   as a baseline capability would not generalize to Italy's two largest cities.
3. **Building-height/LOD data has no coordinating national body at all** — Italy's national LiDAR
   program (PST/SIM) produces terrain models, not building models.

**Recommended tiering:**
- **Tier 1:** DM 1444 zone-letter mechanism still operative, decent regional geodata → Turin (pending confirmation); scan of other PRG-using regions is the natural next research task.
- **Tier 2:** Bespoke city-specific mechanism replacing the national taxonomy → Milan (territorial index + perequation) and Rome (fabric typology + intervention-mode split). Solving one does not reduce the cost of the other.
- **Tier 3:** Unconfirmed regional mechanism — every other Italian region. Assume Tier 3 by default until a dedicated research pass.

Italy needs a signature per region on which planning instrument applies, a signature per city on
whether that region's nominal mechanism is still operative or has been locally superseded, and a
standing acknowledgment that SITAP is explicitly self-described as informational, not exhaustive.

---

**Cross-refs:** `FRANCE-MASTER-DATA-SOURCE-STUDY.md` · `GERMANY-MASTER-DATA-SOURCE-STUDY.md` ·
DM 2 aprile 1968 n. 1444 · Codice Civile Art. 873 · DPR 380/2001 Art. 2-bis ·
D.Lgs. 42/2004 (Codice Beni Culturali) · L.R. Lombardia 12/2005 (PGT) · PRG Roma 2008 NTA.
