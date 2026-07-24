# Belgium — MASTER DATA-SOURCE & RULE-MECHANISM STUDY for the buildable-envelope engine

**Companion to the France, Germany, and Portugal studies, same method: separate what is genuinely
national from what a sub-national authority does differently — and treat a different legal mechanism
as a different engineering problem, not a parameter change.**

**Status:** Research complete. No rule pack is implemented by this document.
**Last updated:** 2026-07-24. Live probes executed 2026-07-24.

---

## Headline findings (stated up front)

**First headline:** Belgium's fragmentation is not administrative, it is **constitutional**. Spatial
planning and urbanism were devolved to the three Regions as an exclusive competence by the special
laws of 8 August 1980 (Flanders/Wallonia) and 12 January 1989 (Brussels-Capital). This is not
Germany's "one federal BauNVO, sixteen Länder implement it differently" pattern, and not France's
"one national zoning portal, locally-scoped zone letters" pattern. **There is no Belgian BauNVO,
no Belgian GPU, no Belgian PDM-equivalent decree.** Flanders' VCRO, Wallonia's CoDT, and Brussels'
CoBAT are three separately-drafted, separately-amended, structurally different legal codes. **Treat
"Belgium" as three unrelated national studies bolted together, not one study with three regional annexes.**

**Second headline:** Unlike zoning, the **cadastre is federal** — AGDP/SPF Finances maintains one
national parcel dataset (CadGIS/CADMAP), VERIFIED LIVE 2026-07-24. **This is the mirror image of
Germany:** in Germany the zone taxonomy (BauNVO) is federal and the cadastre is per-Land; in
Belgium, the parcel layer is the one thing solved once nationally — and the zoning/height/setback/
heritage/LiDAR layers are each solved three times, independently.

**Third headline:** in all three regions, the operative test for whether a specific building
envelope is permittable is not primarily a numeric lookup — it is a **mandatory discretionary
compatibility judgment**, inherited from the same 1962 root text, that survives under a different
name in each region:
- **Flanders:** *goede ruimtelijke ordening* (VCRO Art. 4.3.1)
- **Wallonia:** *bon aménagement des lieux* (CoDT Art. D.IV.13)
- **Brussels:** *bon aménagement des lieux* (CoBAT/RRU practice)

Unlike Germany's §34 (which applies only where no B-Plan exists), **this test is layered on top of
every permit in all three regions**, including inside fully zoned, numerically-specified plans.
Belgium leans further toward "engineer must reason about context" than any of France, Germany, or
Portugal.

---

## PART A — WHAT IS (AND ISN'T) SHARED ACROSS THE THREE REGIONS

### A.1 Parcels and cadastre — the one federal layer

**National baseline:** cadastral parcels are documented and maintained by AGDP/AAPD, part of SPF
Finances/FOD Financiën, in a system called **CadGIS**, built on the **CADMAP** parcel dataset. A
"plan parcel" (Art. 2 of the Royal Decree of 30 July 2018) is a part of Belgian territory,
geographically delimited and identified by AGDP on the land register plan, corresponding to the
ground surface area of one or more patrimonial cadastral parcel(s) on which the cadastral income
is fixed. The dataset's constituent layers include cadastral units, divisions, sections, cadastral
blocks, property stones, addresses, cadastral plan parcels, and — importantly — **the buildings
managed by AGDP as well as buildings managed by the regions** — the cadastre already ships with a
building layer of its own.

**Access:** CadGIS lets anyone consult and print the Belgian cadastral parcel plan for free; the
full dataset is freely downloadable via WFS under an open-data licence published in both French and
Dutch. ✅ **VERIFIED LIVE 2026-07-24** — HTTP 200, application/xml.

**§A.1.D Deviations:** each region re-serves the same federal parcel data through its own geoportal
(redistribution relationship, not a competing dataset). One caveat: an official cadastral-plan extract
costs €11 and an official cadastral-matrix extract €5.50 — the free WFS layer is a visualization/
bulk-geometry product, not the certified legal extract. The CADMAP building sublayer may carry a
height or storey-count attribute — **not yet probed** — which, if confirmed, would be the one
nationally-consistent building-height source in the whole study.

---

### A.2 The three planning codes — a constitutional fork, not a config difference

**What used to be national:** the *loi du 29 mars 1962 organique de l'aménagement du territoire
et de l'urbanisme* was the single pre-devolution statute. After the special laws of 1980 and 1989,
each region inherited and then forked it independently.

| Region | Code | Current form | Regional zoning instrument | Regional building-envelope instrument |
|---|---|---|---|---|
| **Flanders** | VCRO (Vlaamse Codex Ruimtelijke Ordening) | Codified 2009; "Codextrein" 2017 + amendments | Gewestplannen (1970s–80s) increasingly superseded by RUPs | Each RUP's own *stedenbouwkundige voorschriften*, tested against *goede ruimtelijke ordening* |
| **Wallonia** | CoDT (Code du Développement Territorial), successor to CWATU | CWATU 1984 → CoDT 2016, reformed May 2025 | 23 plans de secteur, 1977–1987, 100% coverage, still binding | Guide régional d'urbanisme (GRU) — largely indicative, not binding; tested against *bon aménagement des lieux* |
| **Brussels-Capital** | CoBAT (Code Bruxellois de l'Aménagement du Territoire) | Arrêté 9 April 2004; reformed 30 November 2017 | PRAS (Plan Régional d'Affectation du Sol) | RRU (Règlement Régional d'Urbanisme) — 7 Titres, region-wide; overridable by PPAS, RRUZ, or PAD |

**Why this is worse than Germany's Länder split:** Germany's 16 Länder each write their own LBO,
but all implement one shared BauNVO zone taxonomy and one shared XPlanGML exchange schema. **Belgium's
three regions do not share a zone taxonomy, a numeric-envelope mechanism, or an exchange schema.**
The three codes were drafted independently after 1980/1989 and carry no cross-reference to one another.

---

### A.3 The pervasive discretionary layer — "goede ruimtelijke ordening" / "bon aménagement des lieux"

This is the structural finding that most distinguishes Belgium from France, Germany, and Portugal.

**Flanders (VCRO Art. 4.3.1):** every permit application must be tested both against the applicable
voorschriften and against *goede ruimtelijke ordening* — covering functional fit, mobility impact,
scale, land use and building density, visual-formal elements, cultural-historical value. Case law
confirms it is a live issue even inside a fully adopted RUP, where clear plan voorschriften are
supposed to settle the test. Some RUPs go further and **explicitly leave height "vrij"** (free),
delegating the numeric question entirely to the discretionary test — a case where the plan itself
chooses not to answer its own central question.

**VCRO Art. 7.4.2/2 "clichering":** percentage-based objectives and provisions set in RUPs adopted
after 1 September 2009 must be treated as non-existent by the permitting authority. This is a
**blanket statutory nullification** of an entire category of numeric plan provisions, decreed once
for the whole region rather than litigated parcel-by-parcel.

**Wallonia (CoDT Art. D.IV.13):** the same concept as *bon aménagement des lieux*, both as a
permitting standard and as the express legal basis for a derogation. Because Wallonia's plan de
secteur (dated 1977–1987) carries only broad affectation and the GRU is only indicative, *bon
aménagement des lieux* is not a rare-derogation safety valve — it is close to the **load-bearing
mechanism for most specific envelope questions**.

**Brussels:** the same concept (*bon aménagement des lieux*) appears in Conseil d'État case law on
RRU height derogations. Brussels is the one region with a genuinely numeric-leaning regional baseline
text (RRU Titre I) to derogate from — which is why its structural position sits closer to France/
Germany than Flanders/Wallonia's more thoroughly discretionary defaults.

**Practical implication for the engine:** in all three regions, a rule pack that stops at "read the
zone's numeric provision" will be wrong in a materially larger share of cases than the equivalent
France or Germany pack, because the numeric provision is legally subordinate to (Flanders, Wallonia)
or routinely derogated from under (all three) a contextual compatibility judgment. Any card must
carry an explicit, prominent caveat to that effect.

---

### A.4 Height and gabarit — Brussels' RRU as the closest thing to a numeric baseline

**Brussels:** the RRU (Règlement Régional d'Urbanisme), adopted by the arrêté of 3 June 1999
(Titres I–VII), re-adopted 21 November 2006, is region-wide — it applies identically to all 19
Brussels communes unless locally overridden. RRU Titre I ("Caractéristiques des constructions et de
leurs abords") explicitly targets volumétrie and gabarits. **Titre I's provisions are drafted with
explicit reference to the surrounding built context** — H = P + 3.00 + D (where P = rue width, D =
parcel depth) — closer to Porto's "moda da cércea" than to a fixed lookup table. The RRU applies
only where the plans d'aménagement in force do not provide otherwise (regional default, not override),
and a RRUZ can locally replace Titre I.

**§A.4.D Deviation within Brussels:** high-rise construction requires a per-project RRU derogation
with a bon-aménagement-des-lieux justification (Conseil d'État case law confirms). Demolition/
reconstruction resets which numeric regime applies.

**Flanders and Wallonia:** no Flanders-wide or Wallonia-wide numeric baseline text equivalent to
Brussels' RRU Titre I. Height/gabarit is supplied by whichever RUP/plan de secteur zone applies,
tested against (and sometimes entirely delegated to) the discretionary standard.

---

### A.5 Setbacks and building depth

No Belgium-wide setback formula exists. Per region:
- **Brussels (RRU Titre I):** "implantation" and "profondeur de bâti" explicitly — but as context-relative prose formulas (H = P + 3.00 + D), not queryable API fields.
- **Wallonia:** folded into the *bon aménagement des lieux* test.
- **Flanders:** set per-zone inside each RUP's voorschriften, where stated at all.

Treat this exactly as the France study treats its setback article-numbering convention: a recurring
**category**, not a recurring formula.

---

### A.6 Buildings, elevation, and LiDAR — three separate base-mapping systems

Unlike the cadastre (§A.1), building geometry/height data is NOT a federal product:

| Region | Base topographic/building layer | LiDAR programme | Coverage note |
|---|---|---|---|
| **Flanders** | GRB (Grootschalig Referentiebestand) — large-scale reference; `3D GRB — Gebouw LOD1 DHMV II` = block model with ridge height | DHMV I → DHMV II (Informatie Vlaanderen/AGIV); ~8 pts/m² per strip, ~16 pts/m² average | DHMV I did not achieve full LiDAR coverage of 13 centrumsteden (Dendermonde, Diest, Hasselt, Hoboken, Ieper, Kortrijk, Oudenaarde, Ronse, Sint-Truiden, Tienen, Waregem, Riemst, Tongeren); DHMV II is full-coverage |
| **Wallonia** | PICC (Projet Informatique de Cartographie Continue) — Wallonia's own continuous large-scale map, via Géoportail de Wallonie | Own LiDAR-derived terrain products via Géoportail | Not confirmed as a single unified LiDAR product comparable to DHMV in this pass |
| **Brussels** | UrbIS — Brussels' own base reference dataset, historically run by CIRB/paradigm.brussels, served as WMS (`geoservices-urbis.irisnet.be`) | Not confirmed as a standalone regional LiDAR programme in this pass | Brussels may rely more on point acquisitions per study than a standing programme |

**A genuine national-level building product may exist:** CADMAP's own layer stack includes "buildings
managed by the AGDP" — worth probing directly for a height attribute before assuming the three
regional systems are the only path to building geometry.

Belgium's three regional building/LiDAR systems are **not the same schema** — GRB/DHMV, PICC, and
UrbIS are independently specified. A cross-region building-geometry pipeline is three separate
ingestion problems.

---

### A.7 Heritage and protective overlays — three agencies, three registers

| | Flanders | Wallonia | Brussels |
|---|---|---|---|
| Agency | Onroerend Erfgoed (formed 2011; offices in Antwerp, Leuven, Hasselt, Ghent) | AWaP (Agence wallonne du Patrimoine); governed by CoPat | Direction du Patrimoine culturel / urban.brussels |
| GIS layer | `geo.onroerenderfgoed.be/geoserver/wfs` — `bes_monument`, `bes_sd_gezicht`, `bes_arch_site`, `bes_landschap`, `bes_overgangszone` — ✅ VERIFIED LIVE 2026-07-24 | SPW Géoportail "Patrimoine — biens classés et zones de protection," CC-BY 4.0 — `stated` | Register confirmed; queryable GIS layer not independently confirmed live |
| Classification procedure | Onroerenderfgoeddecreet | CoPat; classement by Walloon Government decree; AWaP drafts heritage file | CoBAT; safeguard list + classement distinction |

No cross-region register or shared geoportal exists. Three separate agencies, three separate ingestion
pipelines. **§A.7.D:** all three regimes trace to the same pre-1980 national monuments framework,
but were forked independently and now use different administrative procedures entirely.

---

### A.8 Massing/capacity metrics

No Belgium-wide floor-area or dwelling-module standard. Brussels contributes two genuinely novel
massing-adjacent metrics not seen in the other three countries' studies:

- **CBS+ (Coefficient de Biotope par Surface):** ecological-potential indicator; ratio of weighted
  surfaces to total site area; appears in the current RRU reform project. Structured GIS layer
  confirmed in Brussels. Not a height/FAR metric directly, but can gate whether a massing scenario
  is permittable.
- **TOTEM life-cycle comparison:** required for demolitions of buildings over 1,000 m² floor area
  (comparing life-cycle impact of preserving/renovating vs. demolishing/rebuilding). A gate on
  demolition/rebuild scenarios, not a massing metric in the Spain/France/Germany/Portugal sense.

Both must be tracked as adjacent constraint layers once a Brussels pack is built, not folded silently
into footprint/FAR fields.

---

## PART B — DEEP-DIVE RESOURCE STUDY PER REGION/CITY

Because Belgium's fracture line is regional, not municipal, each "city" study below is a
regional-mechanism study with one representative city.

### B.1 Brussels-Capital Region

**What's needed:**
- Sourcing the current PRAS (land-use affectation) for the target commune, plus whichever of RRU
  Titre I (regional default), a locally-adopted RRUZ, or a commune's own PPAS actually governs
  gabarit/implantation — a three-way precedence check (PPAS/RRUZ/PAD > RRU).
- A new rule KIND expressing Titre I's "harmony with existing built fabric" test — closer to Porto's
  moda-da-cércea mechanism than to a fixed lookup, and requiring the same "new kind, not config"
  treatment.
- The CBS+ and TOTEM life-cycle constraints as adjacent gating logic for any demolition/rebuild
  scenario over 1,000 m².
- Heritage overlay sourcing via urban.brussels' protected-heritage register.

**Estimate:** Brussels is the one region with a region-wide RRU Titre I numeric-ish baseline, but
the mandatory PRAS/RRU/RRUZ/PPAS precedence check and the harmony-based Titre I test both push
implementation cost well above a simple lookup — likely closer to the Paris case in the France study
(new reference-mechanism KIND required) than to a cheap structured-attribute case. **~20–25 dev-days.**

**Access blocker:** `gis.urban.brussels/geoserver/PERSPECTIVE_FR/ows` is bot-blocked from non-Belgian
IPs. Belgian-IP deployment is the prerequisite for all Brussels pack work.

### B.2 Antwerp (Flanders / VCRO)

**What's needed:**
- Determine, per target parcel, whether a gewestplan designation still governs, or whether a RUP
  (municipal, provincial, or Flemish) has superseded it — and if a RUP applies, whether its
  voorschriften states a numeric height/footprint value or leaves the parameter "vrij" (the latter
  is a legitimate, frequent outcome, not a gap).
- Check whether any applicable RUP provision is a post-2009 percentage-based target subject to the
  Art. 7.4.2/2 "clichering" nullification before shipping it as a live value.
- Sourcing Antwerp's own municipal RUPs and its *gemeentelijke stedenbouwkundige verordening*
  (municipal building ordinance) layered on top of whichever regional/provincial plan applies.
- Building/LiDAR sourcing via GRB/DHMV II — confirm Antwerp itself is not in the DHMV I centrumsteden
  gap list (not listed, but worth direct confirmation).

**Estimate:** the least tractable of the three regional cases for a clean numeric pack, precisely
because Flanders' own law treats a RUP's silence on height as a valid, deliberate legal state.
A card here may frequently need to ship "no plan-stated ceiling — subject to case-by-case
goede-ruimtelijke-ordening review" as a legitimate answer. **~25–30 dev-days.**

**Access blocker:** `geoservices.informatievlaanderen.be` is robots-disallowed. `mercator.vlaanderen.be`
is the priority alternative to probe.

### B.3 Liège (Wallonia / CoDT)

**What's needed:**
- Sourcing the relevant plan de secteur zone (one of the 23, adopted 1977–1987) — this gives land-use
  affectation but, per §A.2.D and §A.3, essentially no numeric height/footprint value on its own.
- Sourcing Liège's own GCU (Guide communal d'urbanisme) if adopted — confirming whether Liège has
  adopted one is itself a research task.
- Treating *bon aménagement des lieux* as the primary operative test for most specific envelope
  questions — the Wallonia analogue of Germany's §34 dominance in East Berlin, except here it is the
  default condition for the whole region's zoned land, not a fallback for unplanned parcels.
- Building/LiDAR sourcing via PICC and Wallonia's own LiDAR products — parity with Flanders' DHMV II
  not confirmed in this pass.

**Estimate:** cannot be responsibly given without first resolving how much of Liège's land is
governed by a GCU with real numeric content versus bon-aménagement-des-lieux discretion alone —
the prerequisite research task, not a parallel workstream. **~30–35 dev-days (with GCU confirmed);
unknown without it.**

### B.4 Cross-region comparison

| | Brussels-Capital | Flanders (Antwerp) | Wallonia (Liège) |
|---|---|---|---|
| Regional planning code | CoBAT | VCRO | CoDT (ex-CWATU) |
| Region-wide numeric-leaning gabarit baseline? | **Yes** — RRU Titre I | No | No |
| Base land-use plan vintage | PRAS (current, regularly updated) | Gewestplan (1970s–80s) increasingly RUP-superseded | Plan de secteur (1977–1987, still fully in force) |
| Discretionary test's role | Derogation justification from a real numeric baseline | Can be the *entire* answer where a RUP leaves a parameter "vrij" | Close to the load-bearing mechanism given plan de secteur's coarseness |
| Building/LiDAR system | UrbIS (LiDAR programme unconfirmed) | GRB/DHMV I→II (confirmed gaps in 13 cities under DHMV I) | PICC (LiDAR product parity with Flanders unconfirmed) |
| Heritage body | urban.brussels | Onroerend Erfgoed | AWaP |

**The finding that should drive sequencing:** Brussels is the only region where a shared, region-wide,
written gabarit baseline exists at all to build a first `GeometricRule` kind against. Flanders and
Wallonia both route most real envelope questions through a discretionary test that is, by design,
not reducible to a lookup table. **If the founder wants "one Belgian region, done well, fastest,"
Brussels is the candidate this research points to** — not because its rules are simple, but because
it is the only region where a numeric-ish regional text exists to anchor a first kind.

---

## PART C — WHAT THIS MEANS FOR SCALE, AND THE HONEST PROJECT SHAPE

**Belgium's small size (3 regions, ~581 municipalities) might suggest an easy scope** — far fewer
units than France's ~34,900 communes or Germany's ~11,000 municipalities. **This is the wrong lesson
to draw.** The real cost driver in Belgium is that **the Belgian project is three separate
legal-system integrations wearing one country's name**, each requiring its own:

1. **Its own zoning-instrument ingestion** (PRAS/RRU/PPAS/RRUZ for Brussels; gewestplan/RUP for
   Flanders; plan de secteur/GRU/GCU for Wallonia) — no shared schema, taxonomy, or portal.
2. **Its own discretionary-test encoding** (goede ruimtelijke ordening vs. bon aménagement des lieux)
   — conceptually similar, textually and procedurally independent, and load-bearing in at least two
   of three regions.
3. **Its own building/LiDAR base-map system** (GRB/DHMV vs. PICC vs. UrbIS) — three schemas.
4. **Its own heritage register and agency** (Onroerend Erfgoed vs. AWaP vs. urban.brussels).

**The only genuine cross-region efficiency is the cadastre (§A.1)** — build the CadGIS/CADMAP
ingestion once, and it serves all three regions' parcels identically.

**Recommended tiering:**
- **Tier 1 — Brussels-Capital:** one region-wide RRU Titre I baseline; highest structured-numeric-fill
  potential; recommended first region.
- **Tier 2 — Flanders:** numeric content exists per-RUP; frequently "vrij" by design; budget for
  "no numeric ceiling, discretionary review applies" as a common legitimate card output.
- **Tier 3 — Wallonia:** base zoning oldest (1977–1987); least numerically specific; most dependent
  on the discretionary test.

**The two-signature Barcelona structure recurs in tripled form:** Belgium needs an entirely separate
legal-mechanism sign-off per region before any card can claim `confidence: structured` — and,
uniquely, a standing acknowledgment (region-independent) that a sourced numeric value may be legally
subordinate to a discretionary compatibility test the engine cannot itself evaluate.

---

## PART D — DATA-READINESS RATE SUMMARY

See `../RATE.md` for the full field-by-field breakdown and live probe record. Summary:

| Metric | Value | Basis |
|---|---|---|
| National blended rate | ~10–14% | Weighted blend (Flanders 57%, Wallonia 32%, Brussels 11%) |
| Wallonia structured-numeric fill | ~0–2% | Plan de secteur boundary only; no height/FAR in API |
| Brussels structured-numeric fill | ~5–10% | RRU Titre I exists but formula-in-PDF; some structured adjacent layers |
| Flanders structured-numeric fill | ~0–5% | RUP-by-RUP; "vrij" frequent; clichering trap |
| Zone-boundary hit (all regions) | ~85–95% | Best in this benchmark; no "unplanned land" category in any region |
| Provision-code semantic catalogue | 0% | Does not exist in any Belgian region |

**The gap between Belgium and Sweden/Denmark is legal-design, not data-engineering.** Belgium's
zone-boundary layer is arguably *more* complete than Sweden's (no unplanned-land category at all),
but Belgium's legal design treats the exact number this benchmark measures as something to be decided
case-by-case rather than published in advance. Raising Belgium's rate durably requires a policy
change (a structured provision catalogue), not just better data engineering.

---

**Cross-refs:** France/Germany/Portugal master studies (parallel method); loi du 29 mars 1962
(shared pre-devolution root text); loi spéciale 8-08-1980 + loi spéciale 12-01-1989 (regional
devolution); VCRO (Flanders, codified 2009); CWATU→CoDT (Wallonia, reformed May 2025); CoBAT
(Brussels, reformed 30-11-2017); Royal Decree 30-07-2018 (cadastral-parcel definition);
CADMAP/CadGIS (SPF Finances/AGDP); GRB/DHMV (Informatie Vlaanderen/AGIV); PICC (SPW Géoportail
de Wallonie); UrbIS (paradigm.brussels); Onroerend Erfgoed / AWaP / urban.brussels.
