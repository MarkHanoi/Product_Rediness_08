# Portugal — MASTER DATA-SOURCE & RULE-MECHANISM STUDY

> **Companion to the France and Germany studies, same method.** Separate what is genuinely national
> from what a município does differently — and treat a different legal mechanism as a different
> engineering problem, not a parameter change.
>
> **Status:** RESEARCH COMPLETE — no rule pack is implemented by this document.
> **Session date:** 2026-07-23 · **Method:** archival/secondary research; no live endpoint probes.
> **Cross-refs:** `../NEXT.md` (what to do next) · `../sources/SOURCES.md` (per-field citations) ·
> `de/findings/GERMANY-MASTER-DATA-SOURCE-STUDY.md` · `fr/findings/FRANCE-MASTER-DATA-SOURCE-STUDY.md`

---

## HEADLINE FINDING — read before everything else

**Portugal's *zoning* layer is in reasonable shape** — one national portal (SNIT), all PDMs
georeferenced since 2008, a genuinely national criteria-decree for land classification (DR
15/2015), much like a lighter-weight version of Germany's BauNVO.

**But Portugal's *parcel geometry* — the thing France and Germany both treat as the easy,
already-solved layer — is the opposite here.** Portugal's formal geometric cadastre is operative
in only ~134 municípios (127 CGPR + 7 SiNErGIC) against 174 municípios with no cadastro predial
at all. Even where CGPR historically applied, it covered rural parcels first. **Portugal may not
have a queryable national parcel-geometry source for a majority of its urban land**, and this must
be measured per city before any dev-day estimate.

This is structurally worse than France (PCI Express, complete nationally) or Germany (ALKIS,
complete nationally, licence-gated but not geometry-gated). **The parcel geometry question is
Portugal's §34/GPU equivalent — the first thing to probe, not a parallel task.**

---

## PART A — THE NATIONAL COMMON BASELINE

### A.1 Parcels and cadastre — the inverted finding

**What exists nationally:** the **Sistema Nacional de Informação Cadastral (SNIC)**, run by the
**Direção-Geral do Território (DGT)** as the "Autoridade Nacional de Cadastro Predial," integrates
the characterisation and identification data of prédios inscribed in the Carta Cadastral and
manages the cadastre in coordination with the land registry (registo predial) and the tax register
(matriz predial). Since 21 November 2023, **Decreto-Lei n.º 72/2023** unified two prior parallel
typologies (CGPR and CPE/SiNErGIC) into one "cadastro predial" regime, and every prédio now
carries a single national identifier (NIP/NIC) instead of the old finança-article / conservatória-
description pair.

**Coverage split — the load-bearing fact for this whole country:**

| Regime | Municipalities | Character |
|---|---|---|
| **CGPR** (Cadastro Geométrico da Propriedade Rústica) | 127 (118 mainland + 9 autonomous regions) | Built for prédios rústicos, predominantly south of the Tagus; only some urban parcels lacking independent economic/legal standing |
| **SiNErGIC / CPE** pilot | 7: Loulé, Oliveira do Hospital, Paredes, Penafiel, São Brás de Alportel, Seia, Tavira | More modern pilots; best geometry confidence |
| **No cadastro predial / BUPi** | **174** — the majority | Citizen-submitted voluntary graphic representation (RGG) via BUPi; NOT authoritative geometry |

**The ~134-vs-174 split is roughly inverted from France or Germany's "geometry is solved, numbers
aren't" pattern** — for Portugal it can be the geometry itself that's missing.

**Three separate bodies, none a geometric substitute:**
- **Matriz predial** (Finanças/AT) — tax register; records gross area, footprint area, land area,
  use type — NOT a certified geometric boundary.
- **Registo predial** (conservatória) — land ownership record — NOT geometric.
- **Cadastro predial** (DGT/SNIC) — the only authoritative geometric record; partial coverage.

**Legal status of cadastral data:** data on a cadastred prédio "constitute a presumption of its
real location, geometric configuration, and area for all legal purposes, without prejudice to the
cadastral titleholder's right of rectification" (DL 72/2023). This is a **rebuttable presumption**
— softer than France's PCI-Express polygon or Germany's ALKIS Flurstück. Carry this as a standing
caveat on all Portuguese parcel geometry.

**BUPi is NOT a parcel source.** This must be stated explicitly in every implementation note.
BUPi (Balcão Único do Prédio) is a rural/mixed ownership registration initiative — citizen-
submitted, voluntary, not authoritative. Do not wire it for any parcel pipeline.

**Practical implication:** "Where do I get the parcel polygon for a Portuguese city" is not a
single API call the way it is for France (API Carto) or Germany (ALKIS, per-Land) — it is a per-
município, sometimes per-parcel research question. The honest first task for any target city is
confirming which regime (CGPR / SiNErGIC / no-cadastre) actually applies before any pipeline
is designed.

---

### A.2 Zoning classification — genuinely national, one level up from BauNVO

**National baseline:** the **Regime Jurídico dos Instrumentos de Gestão Territorial (RJIGT)**,
approved by **Decreto-Lei n.º 80/2015**, establishes the whole IGT hierarchy — national programmes,
regional programmes, and municipal/intermunicipal plans (PDM/PDI, PU/PUI, PP/PPI) — and critically,
**Article 74(4) RJIGT** requires that the dominant-use definitions and categories of solo
urbano/rústico obey **uniform criteria applicable to the whole national territory**, to be set by
decreto regulamentar.

That decree is **Decreto Regulamentar n.º 15/2015**, which establishes the criteria for
classification and reclassification of solo, and the criteria for qualification and the categories
of solo rústico and solo urbano by dominant use, applicable to the whole national territory.

**This is Portugal's closest analogue to Germany's BauNVO:** the top-level category taxonomy —
solo urbano vs. solo rústico, and the qualification criteria within each — is set once, nationally.

**Post-2015 hard-code (same status as France's ALUR abolishing COS):**
The 2015 reform eliminated the old operative category of **"solo urbanizável"** outright. Post-2015
Portuguese law recognises only **solo urbano** and **solo rústico**. An older PDM that still
references "solo urbanizável" needs amendment. **Write this as a constant in the PT jurisdiction
module.**

**Where Portugal snaps back to the France pattern:** unlike BauNVO's `WA`/`MI`/`GE` letters, which
carry §17-BauNVO numeric GRZ/GFZ ceilings at the federal level, **DR 15/2015 sets the category
taxonomy but no numeric envelope ceiling** — no national maximum índice de utilização, no national
maximum cércea. Each município's own PDM fills in its own "categorias de espaço" and attaches its
own numbers. Zone label `Espaços residenciais` in Braga means nothing in Porto. **No cross-PDM
numeric lookup table exists.**

**Access:** **SNIT** (Sistema Nacional de Informação Territorial), run by DGT, went live January
2008 with every mainland PDM already available, and now serves all PDMs as georeferenced
information through `snit-mais.dgterritorio.gov.pt`. This is the direct analogue of France's GPU:
- **What SNIT gives you:** which PDM/PU/PP governs a point, the category of space, a link to the
  regulation PDF.
- **What SNIT does NOT give you:** the numeric índice/cércea/afastamento values — those require
  reading the município's own regulamento PDF.

---

### A.3 The "no plan" fallback — Portugal's §34/RNU analogue

Like France (RNU) and Germany (§34 BauGB), Portugal has a fallback for land not covered by precise
numeric planning instruments. The mechanism sits inside the **RJUE** (Decreto-Lei n.º 555/99,
reformed most recently by **DL 10/2024** and a further 2026 revision in train):

- The full **licenciamento prévio** (prior-licensing) procedure is reserved for situations with
  greatest public-interest risk, including explicitly **areas without precise urbanistic instruments**.
- The lighter **comunicação prévia** procedure applies to "the generality of urbanistic operations
  to be carried out in **areas whose urbanistic parameters are effectively defined**."

**The law itself uses "does a numeric parameter exist for this land" as the switch between two
different administrative procedures** — not just a card-confidence caveat. Where no PDM/PU/PP
category with numeric parameters reaches a parcel, there is no numeric ceiling to read. The buildable
envelope becomes a case-by-case municipal licensing decision.

**Unlike Germany, there is no public estimate of what fraction of Portuguese urban land this covers**
— this is the highest-value probe to run before committing dev-days to any Portuguese city.

**Unlike France's RNU (a nationwide textual fallback ruleset):** the "no precise instrument"
condition in Portugal triggers a *procedure* (full licensing, case-by-case), not a substitute
rulebook.

**Engine implication:** the correct output for a RJUE "no-precise-parameters" parcel is a
**C58 §1.13 refusal** with `code: 'legal'`, not a gap to fill with estimates.

---

### A.4 Height, floor area, and the working vocabulary

**The terms are shared nationally; the numbers are per-PDM.**

**Cércea:**
The height concept, measured from the average ground level at the facade alignment up to the top
of the eave, parapet, or terrace guard line, including recessed upper floors but excluding
accessories (chimneys, lift machine rooms, water tanks). Some PDMs use **"altura da edificação"**
instead — the altimetric elevation reached by any built element, referenced to the intersection
with the ground. **Cércea and altura da edificação are not always the same measurement even within
one country's PDMs** — confirm per PDM which definition applies.

**Índice de utilização / Índice de edificação:**
Portugal's working FAR-equivalent — the ratio between the área de edificação and the area of the
parcel or plan area. **Unlike Germany's §20 BauNVO (a national formula for what counts toward
Geschossfläche), Portugal has no national decree defining what counts toward área de
edificação/construção.** That definition is set by each PDM's own glossary article. Even the
*formula*, not just the number, needs per-PDM sourcing. Porto uses "índice de edificação" (Art. 11,
PDMP 2021); other PDMs use "índice de utilização."

**Moda da cércea:**
The cércea value that has the greatest extension along a given urban front (Porto PDMP). A numeric
height rule that is itself **defined by surveying the existing built fabric of the street** — not a
fixed table value. This sits between Barcelona's fixed amplada-de-vial table and Germany's §34
"fits the character" discretion: numeric, but context-derived.

**Engine implication:** treat `moda da cércea` as its own `GeometricRule` kind
(`fabricDerivedHeight`) — NOT a config value on an existing kind. Requires a C58 §2.2 amendment
analogous to the `blockDerivedAlignment` amendment for Barcelona Art. 242.

**Colmatação:**
Infill construction on a parcel inside a "espaço de colmatação" (infill zone within otherwise-built
urban fabric), whether new build or replacement of an existing building. Found across multiple PDMs.
Worth treating as its own category, analogous to Barcelona's clau-12 fabric-derived fallback.

**No national numeric ceiling:** DR 15/2015 stops at category taxonomy. There is no Portuguese
equivalent to Germany's §17-BauNVO sanity bound. A first-mover city's PDM regulamento must be
read for every number — no national cross-check exists.

---

### A.5 Setbacks (afastamentos) and RGEU

**National baseline:** the **RGEU** (Regulamento Geral das Edificações Urbanas, 1951, still
partially in force) sets nationwide **habitability** minimums (natural light, room dimensions,
ventilation) — PDMs across the country define "condições mínimas de habitabilidade" by direct
reference to RGEU compliance.

**RGEU does NOT set a nationwide height-proportional setback-from-boundary formula.** Setbacks
(afastamentos e recuos) are defined per PDM under whatever article number that município uses
(e.g. Braga's Art. 14 — "Afastamentos e recuos").

**Position:** closer to France (shared national habitability floor, no shared geometric setback
formula) than to Germany (BayBO Art. 6: setback = 0.4H, minimum 3 m, nationally defined per Land).

---

### A.6 LiDAR and building elevation — Portugal's strongest layer

**National baseline:** Portugal gained a new PRR-funded national LiDAR campaign:

- **Campaign period:** Apr 2024 – Mar 2025, flown by DGT.
- **Density:** 10 pts/m² average.
- **Products:** classified LAZ point cloud + MDT 50 cm + MDS 2 m (GeoTIFF).
- **Coverage:** ~90% continental mainland as of mid-2025; NW gap in final processing.
- **Licence:** open, "sem qualquer tipo de restrição" — no restriction of any kind.
- **Portal:** `cdd.dgterritorio.gov.pt` (DGT Centro de Dados do Território).
- **Classification:** ground; low/medium/high vegetation; buildings/man-made structures; water;
  noise; bridges; RGB + NIR attributes per point.

**Comparison against France and Germany:**
- France's LiDAR HD: ~80% covered end-2025, full national coverage targeted end-2026.
- Germany's LoD2-DE: per-Land tiles, some free, INSPIRE national feed restricted.
- Portugal's: ~90%+ covered, single campaign, single free licence, no per-region gating.
  **This is Portugal's structural advantage.**

**Key difference vs Spain — lower confidence ceiling:**
Spain cross-checks LiDAR height against Catastro `ALTURAS` (floor count). Portugal has no
Catastro-ALTURAS equivalent. LiDAR height stands alone in Portugal, and DGT has not published
an RMSE-Z specification. Do NOT quote PNOA parity. Do NOT assign a confidence tier without DGT's
formal accuracy spec.

**nDSM module sharing:** the nDSM technique (`DSM − DTM`, 90th-percentile per footprint) is the
SAME shared module as Spain (L-511c) and France (L-512b). Build once; PT feeds different inputs.
Do NOT one-off it per country.

**Building footprints (BGE):** INE's Base Geográfica de Edifícios covers mainland + autonomous
regions at 1:10,000, CC-BY-4.0. Built for population counting — height/storey attribute NOT
confirmed. Heights from LiDAR nDSM, not BGE attributes.

---

### A.7 Heritage and protective overlays

**National baseline:** heritage classification governed by **Lei n.º 107/2001** and **DL n.º
309/2009**, administered by **DGPC** (Direção-Geral do Património Cultural). Two automatic
protective mechanisms:

- **ZGP** (Zona Geral de Proteção) — automatic 50 m radius from external limits of any
  pending-classification asset. Operative from the notification date of the classification
  procedure.
- **ZEP** (Zona Especial de Proteção) — required once an asset is classified; variable extent
  appropriate to the asset (NOT a fixed radius, unlike France's 500 m ABF circle); published
  as a portaria; may include **ZNA** (zona non aedificandi) where no construction is permitted.

**Structural advantage vs France:** ZGP radius is fixed (50 m, predictable); ZEP is variable but
the reasoning is explicit in the portaria. France's ABF is opaque — a flat 500 m around any
classified monument, not visible in the base GPU zone query, silently overstating buildability.
Portugal's ZGP/ZEP are in the DGPC Atlas do Património Classificado — **four distinct queryable
layers** — making them structurally queryable today.

**Access:** `patrimoniocultural.gov.pt` → Atlas do Património Classificado — NOT live-probed this
session.

---

### A.8 Massing/capacity metrics

**No national "dwelling module" m²/unit figure** — same position as France and Germany. Any
such figure must be a project-chosen assumption, clearly flagged.

**Critically:** Portugal has no national decree defining what counts toward área de edificação for
índice purposes (unlike Germany's §20 BauNVO). Even the *formula* is per-PDM. Flag this in every
Portuguese pack — the formula field must be sourced per municipality, not derived from any national
standard.

---

## PART B — DEEP-DIVE RESOURCE STUDY PER MUNICÍPIO

### B.1 Lisboa

**Cadastral regime:** UNCONFIRMED — the single highest-priority open item for this city. Lisbon
is in the Distrito de Lisboa, not traditionally south of the Tagus where CGPR coverage was
concentrated. Do NOT assume coverage; confirm via DGT/SNIC before any estimate.

**PDM:** in force since the revision published in the Diário da República, 2.ª série, n.º 168,
30 August 2012. Under ongoing revision. SNIT-listed.

**Unique mechanisms requiring new engine features or overlay handling:**

1. **Créditos de construção** (tradeable floor-area rights) — Arts. 84/88/89 of the Lisboa
   incentives regulation. Extra buildable floor area can be obtained through building rehabilitation,
   restoration of assets on the Municipal Heritage Charter, or transfer of green areas to municipal
   ownership, cumulative up to a stated limit. This is a tradeable-rights mechanism with **no
   analogue in France or Germany in this study**, and no analogue yet in the C58 schema. A card
   that ignores it will **understate** legally achievable floor area. Requires a C58 overlay type
   addition — `transferableRights` — before any Lisbon pack can be authored.

2. **Seismic-risk overlay** — a zone of higher seismic risk subject to special conditioning,
   delimited from studies by the Municipal Civil Protection Service with LNEC support. Found in the
   PDM environmental components. No France/Germany parallel in this study. Spatial extent not
   sourced.

3. **Carta Municipal de Património** — Lisbon's own heritage charter, overlaid on DGPC's ZGP/ZEP
   layers. Spatial extent not sourced.

4. **"Espaços centrais e residenciais consolidados"** — one named categoria de espaço. Numeric
   values (índice, altura da edificação — note: Lisbon uses this term, not cércea) NOT sourced.

**Estimate:** CANNOT be given until the cadastral-regime question is resolved. If Lisbon's urban
core sits outside formal cadastre coverage, the parcel-geometry sourcing problem alone could exceed
the zoning-sourcing problem, **inverting the France/Germany cost structure entirely**.

---

### B.2 Porto

**Cadastral regime:** UNCONFIRMED — same highest-priority gate as Lisboa.

**PDM:** Aviso n.º 12773/2021, 8 July 2021 (PDMP), with further updates since. SNIT-listed.

**Unique mechanisms requiring new engine features or overlay handling:**

1. **Moda da cércea** — the cércea value with the greatest extension along a given urban front
   (PDMP). A fabric-derived height rule that is numeric but context-derived — sits precisely
   between Barcelona's fixed amplada-de-vial table and Germany's §34 "fits the character"
   discretion. Requires a new C58 `fabricDerivedHeight` GeometricRule kind. Porto is the first
   city in this study where this kind is needed; the C58 amendment must precede the pack.

2. **Porto historic centre (UNESCO World Heritage Site)** — the Ribeira/Barredo area. DGPC's ZEP
   layer applies. This layers on top of whichever §A.3 categoria applies underneath — the Porto
   analogue of Berlin's Erhaltungsverordnung-on-top-of-regime pattern.

3. **Two operative urban space categories** — Art. 11 of PDMP: urban spaces delimited on the
   Planta de Ordenamento by degree of urbanization. Art. 12-family defines functional categories.
   Índice de edificação defined at Art. 11 or thereabouts — the definition of "área de edificação"
   (what counts) must be sourced before numeric values can be used.

**Estimate:** CANNOT be given until cadastral-regime confirmation. Dev-days estimate: ~15–20 if
cadastral confirmed AND the `fabricDerivedHeight` kind amendment is completed.

---

### B.3 Braga — the most tractable first target

**Cadastral regime:** UNCONFIRMED — but mid-size municipalities outside the two largest cities
may trend better for CGPR coverage. Must verify before treating Braga as Tier 1.

**PDM:** in force, SNIT-listed.

**Already sourced (CONVERGENT-SECONDARY — needs primary source confirmation):**
- Índice de utilização máximo: **1.20** (0.80 above the cota de soleira) for "espaços residenciais"
- Cércea máxima: **7.5 m** for "espaços residenciais"

These are the only citable numeric values found in this research pass for any Portuguese city.

**No unique mechanisms identified:** no créditos de construção, no fabric-derived height rule,
no UNESCO overlay. Braga is the most tractable first target precisely because of this absence.

**Estimate:** ~8–12 dev-days if cadastral confirmed AND SNIT WFS probe shows zone polygons for
Braga. This is the lowest estimate in the study. Start here.

---

### B.4 Cross-city comparison

| | Lisboa | Porto | Braga |
|---|---|---|---|
| Cadastral regime | **Unconfirmed** — highest-priority open item | **Unconfirmed** — highest-priority open item | Unconfirmed, but check first — mid-size munis trend better |
| PDM maturity | In force since 2012, SNIT-listed | In force (Aviso 12773/2021), SNIT-listed | In force, SNIT-listed |
| Unique structural risk | Créditos de construção (tradeable rights); seismic overlay | Moda da cércea (new rule kind); UNESCO ZEP overlay | None identified |
| Numeric values sourced | Not yet (categories named, values not pulled) | Not yet (categories named, values not pulled) | Yes — índice 1.20, cércea 7.5 m (one category; CONVERGENT-SECONDARY) |
| Recommended sequence | 3rd | 2nd | **1st** |

---

## PART C — WHAT THIS MEANS FOR SCALE AND PROJECT SHAPE

Portugal's ~308 municípios is the smallest count of the three countries studied, and its zoning
category taxonomy is genuinely national (DR 15/2015) one level above where France sits. Both are
real efficiencies. **But the parcel-geometry finding reverses the usual risk order.**

### The four-tier city classification for Portugal

Unlike France and Germany (where the open question is "how expensive is the numeric-rule sourcing"),
Portugal's open question is one layer further down: **"does a queryable parcel even exist for this
city's land."** This should be treated as a strict prerequisite gate.

| Tier | Definition | Current occupants | Gate |
|---|---|---|---|
| **Tier 0** | Cadastral regime unresolved | Lisboa, Porto (provisionally) | Resolve cadastral regime before any other work |
| **Tier 1** | Cadastral regime confirmed + PDM values partially sourced | Braga (conditional — cadastral TBC) | Confirm cadastral; then read governing articles for all categories |
| **Tier 2** | Cadastral regime confirmed + full PDM sourcing still to do | — (no city confirmed here yet) | Source all PDM categories; estimate ~10–15 dev-days |
| **Tier 3** | No cadastro predial / BUPi/RGG only; or dominated by RJUE full-licensing ("no precise instrument") land | Any of the 174 no-cadastre munis | Draw flow only; honest refusal for envelope; no parcel provider |

**Four sequencing principles:**

1. **Cadastral-regime confirmation is now the first research task**, not an assumed-solved
   precondition. Run the CGPR/SiNErGIC/no-cadastre check for any specific candidate city before
   estimating anything else. This is Portugal's analogue of the §34 grid-sample probe, except it
   gates the geometry layer itself, not just the numeric-rule layer.

2. **Numeric-rule sourcing, once a parcel exists, follows the France pattern** — no national ceiling
   to sanity-check against, category taxonomy shared nationally but values and even formulas set
   per PDM. Budget per-PDM PDF sourcing for every Portuguese city.

3. **LiDAR and building elevation are Portugal's strongest link in the chain** — a genuine advantage
   that does not require waiting on any 2026-style rollout. Build the nDSM module once (ES + FR + PT)
   and PT height is a new tile source, not a new pipeline.

4. **The RJUE licensing-track split is itself a signal worth mining** — because Portuguese law
   already distinguishes "áreas cujos parâmetros urbanísticos se encontrem efetivamente definidos"
   from areas needing full discretionary licensing, a per-município audit of which RJUE procedure
   applies doubles as a numeric-coverage probe at essentially no extra research cost.
