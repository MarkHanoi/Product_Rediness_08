# Barcelona — COMPLETE COVERAGE PLAN for the buildable-envelope engine (L-538)

**Founder decision, 2026-07-21:** *"First is to have all Barcelona completed — then we move into the
other municipalities. I want complete Barcelona."*

**Founder amendment, same day — this is the ranking the whole plan obeys:** *"Ideally I would like to
standardise processes as much as possible — but the most important is to have a robust,
TRUSTED-AGAINST-REAL-LEGAL-DATA result."*

> **LEGAL FIDELITY FIRST, STANDARDISATION SECOND.** Machinery is shared ONLY where the ordinance
> genuinely says the same thing, and every sharing proposal below carries its legal justification,
> not a code-reuse justification. Where two claus differ substantively they get separate,
> separately-sourced packs even though that is more work. **A shared abstraction that flattens a real
> legal difference is worse than N specific packs** — it is the C58 §1.11 category error with a
> tidier diff.

**Status:** PLAN + RESEARCH. **No rule pack is implemented by this document.** It exists so that
implementing them is straightforward, correctly sequenced, and legally sourced.

**Scope note:** this plan is Barcelona (INE 08019) only. Madrid/Córdoba are explicitly out of scope
and blocked on a different problem — see §8.

---

## 0. THE PROBLEM, MEASURED

`packages/site-parcel-data/src/rulepacks/esBarcelonaEnsanche.ts` exports
`BCN_ENSANCHE_ZONE_CODES = ['13a', '13E']`. `apps/editor/src/ui/site/siteDispatch.ts` (~line 983)
gates the real-envelope path on exactly those two codes; every other clau falls through to
`applyEstimatedZoning` and the panel honestly reports *"7 of 7 values ESTIMATED"*. The founder hit
this in the **Barri Gòtic** (Carrer d'Avinyó / Ferran / Trinitat), which is **clau 12** *nucli antic*,
not 13a. The behaviour was correct. The COVERAGE is the defect.

**Measured coverage today: 24.0 % of Barcelona's private buildable land.** (§2.)

---

## 1. THE REAL BARCELONA ZONE TAXONOMY

The governing instrument is the **PGM-1976** (*Pla General Metropolità*, approved 14-07-1976), whose
*Normes Urbanístiques* (NNUU) Títol IV divides the soil into **sistemes** (public domain) and
**zones** (private buildable land). The municipal *clau* is what a rule pack keys on
(`CODI_QUAL_AJUNT` from the MUC WMS — `server/mucZoningProxy.js` is explicit that the harmonised
`CODI_QUAL_MUC` is too coarse to select a pack, because 13a and 13b are both `R2`).

### 1.1 SYSTEMS — excluded, with reasoning

| clau | Name | Why NO envelope |
|---|---|---|
| `1a`, `1c` | Sistema portuari (+ zona marítimo-terrestre) | Public port domain, governed by the *Pla Especial del Port*, not by a zone envelope. |
| `3` | Sistema ferroviari | Rail infrastructure; public domain. |
| `4` | Sistema de serveis tècnics | Technical-services infrastructure; public domain. |
| `5b` | Vies cíviques | Public realm. |
| `6a/6b/6c` | Parcs i jardins urbans | Public open space; buildability is nil-to-incidental and set by a *Pla Especial*, not by a zone rule. |
| `7a/7b/7c`, `7hd` | Equipaments comunitaris i dotacions | Buildability is fixed **per facility** by a *Pla Especial d'Equipaments*, NOT by a generic zone parameter. There is no per-parcel rule to encode. |
| `8a` | Verd privat protegit | PRIVATE land but *protected green* — the point of the clau is that it is NOT built on. Treated as an explicit **refusal-with-reason**, not as a system. |
| `9` | Protecció de sistemes generals | Protective easement around a general system. |
| `27`, `28`, `29` | Parc forestal (conservació / repoblació / reserva natural) | **Sòl no urbanitzable** — Collserola. Governed by the *PEPNat/PEPCo* special plan; no urban envelope exists. Dominant by AREA (17.9 % of all Barcelona ground) and irrelevant to development. |
| `SX1/SX2/SX3`, `SH` | Sistema viari (structuring axes / other urban / non-urbanisable), sistema hidrogràfic | Roads and watercourses. |

**These are excluded deliberately and permanently.** They are not "not done yet". A system parcel
should render *"public system — no private buildable envelope applies (clau NN)"*, which is a
POSITIVE answer, not a fallback to the estimated pack. **That distinction is itself a work item**
(Phase 1b below): today they silently fall into the generic estimated pack and get a fabricated
setback triple, which is the §CONTEXT-DATA-HONESTY failure — a refusal and an estimate rendered
identically.

### 1.2 PRIVATE BUILDABLE ZONES — the ones that need envelopes

| clau | Name | Ordination type | In force in BCN? |
|---|---|---|---|
| `12` | Nucli antic — substitució de l'edificació antiga | segons alineacions de vial | YES — Ciutat Vella + the annexed village cores (Gràcia, Sants, Sarrià, Horta…) |
| `12b` | Nucli antic — conservació del centre històric | segons alineacions de vial + conservation | YES |
| `13a` | Densificació urbana intensiva | segons alineacions de vial | YES — **shipped** |
| `13b` | Densificació urbana semiintensiva | segons alineacions de vial | YES |
| `13E` | Eixample subzona (2002 *Ordenança de rehabilitació i millora de l'Eixample*) | as 13 | **Registered but never observed live** — see §3.3 |
| `14a/14b` | Remodelació física (pública / privada) | per derived plan | Not observed in the sample |
| `15` | Conservació de l'estructura urbana i edificatòria | alineacions + conservation | YES, marginal (0.4 %) |
| `16` | Renovació urbana: rehabilitació | per derived plan | YES, marginal (0.4 %) |
| `17/6` | Renovació urbana: transformació d'ús | per derived plan | YES, marginal (0.7 %) |
| `18` | Ordenació en volumetria específica | **volumetria específica** | YES — **22.5 %, the second-largest** |
| `20a` (+ `/5 /8 /9 /9b /9u /10 /11 /12`) | Ordenació en edificació aïllada | **edificació aïllada** | YES — 13.1 % aggregate |
| `21` | Edificació aïllada — ciutat jardí (subzones) | edificació aïllada | Not observed in the 08019 sample (a metropolitan clau; Barcelona uses 20a) |
| `22a` | Zona industrial | aïllada / alineació, FAR-driven | YES — 17.5 % |
| `22@` | Zona d'activitats @ (22@ Poblenou, MPGM 2000) | per MPGM 22@ | YES, 0.7 % of area but strategically loud |

---

## 2. RANKED BY ACTUAL LAND COVERAGE — the probe

**Probe:** `scratchpad/probe-bcn-clau-distribution.mts` (run 2026-07-21).
**2 907 grid points** on a ~300 m lattice over the Barcelona municipal bbox, each resolved through
**`fetchQualificationAtPoint` imported from `server/mucZoningProxy.js`** — the production function
that `/api/muc/zoning` serves and that `applyBcnZoningThenFallback` consumes. Same GetFeatureInfo
URL, same §MUC-ONE-CONTAINER-OR-REFUSE point-in-polygon selection, same refusal semantics, so **the
probe cannot disagree with the code path it is characterising** (the precedent set by
`SPAIN-CADASTRAL-DISSOLVE-PROBE.md`).

**Yield:** 1 014 points resolved inside INE 08019 · 1 178 in neighbouring municipalities (bbox
overspill, discarded) · 715 unresolved (sea, or the MUC refused an ambiguous pixel — correctly).
**44 distinct claus. 275 points on private buildable land (27.1 %); 739 on systems/protected soil.**
Elapsed 67 s.

### 2.1 ⚠ WHAT THE NUMBER IS AND IS NOT

A regular grid is an unbiased estimator of **LAND AREA**. It is **NOT** an estimator of **parcel
count** and **NOT** of floor area. Barcelona's fabric makes that gap material in a known direction:
`13a` and `12` are dense small-parcel fabric (under-counted per parcel), while `18`, `22a` and `20a`
sit on large parcels (over-counted per parcel). **So the true PARCEL-count share of 13a + 12 + 13b is
higher than the area share below, and 18/22a lower.** Every ranking statement in this plan is
therefore stated as *area share*, and the phasing is deliberately robust to that skew (the top-6
families cover 97.8 % of area under EITHER weighting). Closing the gap properly needs a
parcel-weighted probe — see §6 item 8.

### 2.2 THE DISTRIBUTION (private buildable land only, n = 275)

Grouped into **rule families** — a family is a set of claus the ordinance treats with the SAME
article machinery, which is the only grouping that means anything for implementation:

| Rank | Family | claus | n | % buildable | cumulative |
|---|---|---|---|---|---|
| 1 | **Densificació urbana intensiva** | `13a` | 66 | **24.0 %** | 24.0 % |
| 2 | **Volumetria específica** | `18` | 62 | **22.5 %** | 46.5 % |
| 3 | **Industrial / activitats** | `22a`, `22@` | 50 | **18.2 %** | 64.7 % |
| 4 | **Edificació aïllada** | `20a`, `20a/5,8,9,9b,9u,10,11,12` | 36 | **13.1 %** | 77.8 % |
| 5 | **Nucli antic** | `12`, `12b` | 31 | **11.3 %** | 89.1 % |
| 6 | **Densificació urbana semiintensiva** | `13b` | 24 | **8.7 %** | 97.8 % |
| — | long tail | `17/6`, `8a`, `15`, `16` | 6 | 2.2 % | 100 % |

Per-clau detail (top rows):
`13a` 66 · `18` 62 · `22a` 48 · `12` 26 · `13b` 24 · `20a/10` 8 · `20a/8` 6 · `20a/11` 5 ·
`20a/9` 5 · `20a` 5 · `12b` 5 · `20a/12` 2 · `20a/9u` 2 · `20a/5` 2 · `22@` 2 · `17/6` 2 · `8a` 2 ·
`20a/9b` 1 · `15` 1 · `16` 1.

**TODAY'S ENGINE COVERS 66 / 275 = 24.0 % OF BARCELONA'S PRIVATE BUILDABLE LAND.**
`13E` was returned **zero times** in 1 014 resolutions, confirming the standing note in
`esBarcelonaEnsanche.ts` that live MUC reports `13a` across the whole Eixample.

### 2.3 WHY THIS RANKING IS NOT WHAT INTUITION SAYS

Intuition (and the whole prior investment) says Barcelona = the Eixample = 13a. The measurement says
**13a is only a quarter of the buildable ground, and the second-biggest family (`18`, volumetria
específica) is the one this architecture can least express** (§3.5). Priority driven by intuition
would have written `13b` and `12` next and left a fifth of the city on a rule kind nobody had costed.

---

## 3. PER-CLAU RULE-KIND ANALYSIS

Current model — `packages/schemas/src/site/GeometricRule.ts`, a Zod discriminated union solved
exhaustively in `packages/site-parcel-data/src/ZoningRulesEngine.ts`:

| kind | operation | ships |
|---|---|---|
| `setback` | erode inward from every edge by its classified distance | generic packs |
| `alignment` | inset, THEN half-plane clip at a **stated** `buildableDepth_m` | ADR-0270 |
| `block-derived-alignment` | inset, THEN clip at a depth **constructed from the block ring** (`solveBlockDerivedDepth`, PGM Art. 242) | ADR-0271, 13a |
| `explicit-area` | the pack supplies the buildable ring directly (`ringRef`) | schema only — **no engine branch, no resolver** |

⚠ **A GAP THAT DECIDES THREE OF THE SIX FAMILIES.** `plotRatioFAR` and `maxCoverage` exist as pack
slots and are **resolved and reported** (`ZoningRulesEngine.ts` L167–L217, L476) — but they are
**never applied to the geometry**. There is no coverage-shaped rule kind and no FAR branch in the
solver. FAR is honoured only downstream, in `storeyCap.ts`, and only by the generators. So a
FAR/occupancy-governed zone currently has **no way to shape an envelope at all**.

### 3.1 `13a` — SHIPPED. `block-derived-alignment`. No change.

### 3.2 `13b` Densificació urbana semiintensiva — **existing KIND, config only** *(highest confidence sharing in this plan)*

**Legal justification for sharing the machinery, not a code one:** 13a and 13b are *Subzona I* and
*Subzona II* of the SAME PGM zone (*densificació urbana*), sharing Arts. 322 (edificabilitat =
envolupant màxima de volum, not a per-parcel FAR), 326 (tipus d'ordenació = **segons alineacions de
vial**) and the general Art. 242 depth construction. They differ in the *condicions d'edificació*
article (327 for Subzona I, the next article for Subzona II) — i.e. **in parameters, within an
identical construction.** That is exactly what `block-derived-alignment` was built to express.

**What must be sourced before it can be written:** the Subzona II *condicions d'edificació* article —
its own height table by *amplada de vial*, and (critically) **whether Art. 242's 30 % interior-free
ratio applies unmodified to 13b or whether Subzona II states its own**. Do NOT assume 0.30 by
inheritance.

**Verdict: config only.** New pack, existing kind. **Cheapest large win in the plan.**

### 3.3 `13E` — leave as-is

Registered against the 13a rule set, never observed live. The 2002 *Ordenança de rehabilitació i
millora de l'Eixample* question (in force? two 2015 *Derogació* rows never reached) stays open and
costs nothing while the code never fires. **No work. Do not "clean it up"** — removing it would be a
claim that it does not exist.

### 3.4 `12` / `12b` Nucli antic — ⛔ **THE FOUNDER'S "CHEAP" HYPOTHESIS IS FALSIFIED**

The hypothesis to test: *clau 12 is just `interiorFreeRatio: 0.30 → 0.40` on
`block-derived-alignment`.* Per the amendment, this was attacked rather than confirmed.

**What was checked, and what it found:**

1. **The governing article is NOT Art. 242 — it is Art. 316** (*Edificabilitat*, Zona de nucli antic).
   Its operative sentence: *in Subzona I, **"la profunditat edificable resultarà d'una ocupació, a
   l'alçada reguladora, del seixanta per cent (60 %) de la superfície de l'illa"***. That is a
   **60 % occupation target on the block**, i.e. numerically a 40 % free ratio — so the founder's
   arithmetic instinct was right. **But it is a different sentence in a different article, and the
   rest of that article is where it breaks.**

2. **Art. 316 contains a SECOND depth rule that this architecture cannot express at all:**
   *in row-building groupings where the whole block is not uniformly zoned, the maximum buildable
   depth is **that of the majority of the existing old buildings between two consecutive streets***.
   That is a depth derived from a **survey of the existing built fabric** — not from the block ring,
   not from a parameter. It needs building-footprint data we do not hold, and in **Ciutat Vella,
   where blocks are irregular and rarely uniformly zoned, this clause is the COMMON case, not the
   exception.** No parameter change reaches it.

3. **Art. 316 also defers residually:** greater restrictions arising from the interior-free-space
   size, and the special case of wholly-buildable blocks, fall back to the general rules of
   *ordenació segons alineacions de vial* (i.e. Art. 242). So clau 12 is a **composite**: a 60 %
   block-occupation primary rule, a fabric-derived fallback, and a residual reference to the general
   article. Encoding only the first would be confidently wrong on the blocks where the second binds.

4. **The Pla Especial overlay problem is real and invisible to our data path.** Ciutat Vella is
   covered by protection/heritage special plans and a *Catàleg del Patrimoni*. **The MUC clau does not
   report them** — a parcel returns `12` whether or not a PE constrains it. So even a perfect Art. 316
   implementation would silently over-state buildability on catalogued parcels.

5. **`12b` (conservació) is a different rule again** — conservation of the historic centre, not
   substitution. Sharing a pack with `12` would flatten exactly the legal difference the amendment
   forbids flattening.

**Verdict: NEW KIND required, and an overlay-detection prerequisite.** Not a parameter change.
The new kind must express: *(a)* a **block-occupation-ratio** depth construction whose target is
stated as occupation rather than free space (semantically distinct from `interiorFreeRatio` even
where the arithmetic complements — the pack must say what the ordinance says); *(b)* a **declared
inability** to solve when the block is not uniformly zoned, so the engine REFUSES into the
fabric-derived branch instead of applying the 60 % rule where the ordinance does not; *(c)* an
**overlay flag** that forces refusal where a Pla Especial / catalogue entry may bind.

⚠ **This is precisely the shape of the L-525/L-529 failure** — an attractive cheap answer that three
documents agreed on and nobody had measured. It is being written down as falsified, with the article
that falsifies it, rather than adopted.

**⚠ EVIDENCE TIER OF THE ABOVE:** the Art. 316 text was reached through **web search summaries of
secondary transcriptions** (municipal republications of the PGM), NOT by reading the consolidated
RPUC/NUMAMB refós. The AMB NUMAMB article endpoints returned **HTTP 403** to automated fetch and the
AMB Geoportal *normativa* pages **404** for INE 08019. **This finding is strong enough to REFUTE the
cheap hypothesis — refutation needs only one contrary clause — but it is NOT strong enough to
IMPLEMENT from.** Primary sourcing of Art. 316 is a scheduled task (§4), not an assumption.

### 3.5 `18` Ordenació en volumetria específica — **the hard one, and it is 22.5 %**

PGM Art. 306 and the Título IV zone articles: this clau covers land *"in which the building
corresponds to the ordination type by specific volumetry, **according to Partial Plans or block
orderings definitively approved, or with a specification of specific volume**"*, and the buildable
floor area is *"that resulting from the established volumetric ordering."*

**Read that carefully: the PGM does not state the rule. It POINTS AT ANOTHER DOCUMENT** — a different
one per site (*Pla Parcial*, *ordenació de volums*, MPGM). There is **no generic parameterisation of
clau 18 to encode**, and any attempt to invent one (a typical FAR, a typical occupancy) manufactures
a number the ordinance does not contain, for a fifth of the city.

**Verdict: NOT a rule pack.** The honest architecture is:
- **near-term** — an explicit, cited **refusal**: *"clau 18: buildability is fixed by the approved
  volumetric ordering for this site (PGM Art. 306), which PRYZM does not hold. No envelope."* That is
  a POSITIVE, correct, legally-grounded answer and it is worth shipping on its own.
- **longer-term** — the `explicit-area` kind (already in the schema, **with no engine branch and no
  resolver**) plus an ingestion path for per-site approved volumetries from RPUC/NUMAMB. That is a
  data-acquisition programme, not a pack.

**This is the single most important finding for expectation-setting: "complete Barcelona" cannot mean
"every parcel gets a constructed envelope."** For ~22.5 % of the buildable ground the legally correct
output is a reasoned refusal.

### 3.6 `22a` / `22@` Zona industrial — **NEW KIND: coverage + FAR**

PGM Art. 350 (industrial): absent a Partial Plan, **intensity ≤ 2 m² sostre per m² sòl** and
**maximum parcel occupation 90 %**; in the *edificació aïllada* case, ≤ 2 m²st/m²s with **70 %
occupation**; and in the alignment case, building above ground floor must sit within a **strip
concentric to the block alignments covering 70 % of the block** — a genuinely block-derived
occupancy band, geometrically close to Art. 242 but with an occupancy target rather than a free-space
target, and applying only above the ground floor.

**Verdict: NEW KIND.** It must express a **maximum-coverage** constraint (which the solver has never
had — `maxCoverage` is resolved and displayed but never shapes anything) and a **FAR** that binds the
storey count, plus the per-floor distinction (ground floor may cover more than upper floors). `22@`
is governed by the **MPGM 22@ (2000)** and is a separate legal instrument — **separate sourcing,
separate pack**, not folded in.

### 3.7 `20a` family Ordenació en edificació aïllada — **`setback` KIND for the shape, NEW machinery for the caps**

*Edificació aïllada* is the ONE Barcelona family the original `setback` triple was designed for:
minimum separations to street and to boundaries are real front/side/rear distances. But each numeric
subzone (`/5 /8 /9 /9b /9u /10 /11 /12` — the suffix encodes the intensity variant, plurifamiliar for
`/5 /8 /9 /9b`, unifamiliar for `/9u /10 /11 /12`) additionally carries a **minimum parcel size**, an
**índex d'edificabilitat neta (m²st/m²s)** and a **maximum occupation %**, none of which the solver
applies.

**Verdict: `setback` for the geometry — genuinely, not as a coercion — PLUS the same
coverage/FAR machinery 22a needs.** So Phases for 22a and 20a share ONE new capability, and the
legal justification for sharing is that both zones state their intensity in the same two
quantities (*ocupació màxima* and *índex d'edificabilitat neta*), through the same *edificació
aïllada* ordination type. **Each subzone still gets its own separately-sourced parameter row** — they
are different numbers from different articles, and a single "20a pack" that averages them would be
the flattening the amendment forbids.

### 3.8 Long tail — `15`, `16`, `17/6`, `8a` (2.2 %)

`15` conservació and `16`/`17` renovació urbana are all **derived-plan-governed** (like 18). `8a`
verd privat protegit is protected private green. **Verdict: explicit reasoned refusal for all four.**
No packs.

### 3.9 SUMMARY — new KIND vs config

| Family | % buildable | Verdict | ADR needed? |
|---|---|---|---|
| `13a` | 24.0 % | shipped | — |
| `13b` | 8.7 % | **CONFIG ONLY** (`block-derived-alignment`) | no |
| `12`/`12b` | 11.3 % | **NEW KIND** — block-occupation + non-uniform-block refusal + overlay flag | **YES** |
| `22a` (+`22@`) | 18.2 % | **NEW KIND** — coverage + FAR | **YES** (shared with 20a) |
| `20a` family | 13.1 % | `setback` + the SAME new coverage/FAR capability | shares the above |
| `18` | 22.5 % | **NO PACK** — reasoned refusal; later `explicit-area` + ingestion | separate ADR if pursued |
| long tail | 2.2 % | reasoned refusal | no |

**Two new rule kinds. One of them (coverage+FAR) serves 31.3 % of buildable land across two
families.**

---

## 4. LEGAL SOURCING + PROVENANCE PER CLAU

**NO PACK SHIPS ON INFERENCE.** Each pack needs its own primary source, read, and its own
founder-signed **L-449-style source-acceptance gate**. The 13a precedent is the model *and the
cautionary tale*: the first acceptance (2026-07-20, "the AMB Dec 2010 PDF") was later found **stale,
anachronistic and mis-attributed**, and the founder had to **re-sign** on 2026-07-21 against the
consolidated RPUC/NUMAMB refós (`L-526-LEGAL-FINDINGS.md`). **The gate is per-source, and a wrong
source passes a gate just as easily as a right one** — so each row below names the source to read,
not merely "the PGM".

| clau | MUST be sourced (primary) | Founder signs | Blocking risk |
|---|---|---|---|
| `13b` | Art. 326 (tipus d'ordenació) + the Subzona II *condicions d'edificació* article: its height table by *amplada de vial*, and whether Art. 242's 30 % applies unmodified | *"I accept the consolidated PGM refós (RPUC/NUMAMB) for clau 13b"* | If Subzona II states its own free-space ratio, the pack is NOT a 13a clone |
| `12` | **Art. 316 verbatim** (the 60 % occupation clause AND the majority-of-existing-buildings clause AND the residual deferral) + Arts. 314/315/317/318 + the clau-12 height article | Separate signature — a different article family from 13a | The fabric-derived clause may be unimplementable ⇒ partial refusal is the correct outcome |
| `12b` | The Subzona II (conservació) articles — **separately**, never inherited from `12` | Separate signature | Conservation may forbid substitution entirely |
| `12`/`12b` overlay | The **Ciutat Vella Pla Especial** + *Catàleg del Patrimoni Arquitectònic* — is a machine-readable layer published? | Signature on the overlay source, or on the decision to REFUSE where one may exist | **If no queryable layer exists, clau 12 must refuse on catalogued parcels — and we cannot tell which those are.** Potentially a hard blocker |
| `22a` | **Art. 350** verbatim: the 2 m²st/m²s index, 90 % / 70 % occupations, the 70 %-of-block concentric strip, the separations | Separate signature | The strip rule may need block geometry ⇒ scope grows |
| `22@` | **MPGM 22@ (2000)** — a distinct instrument, plus its later modifications | Separate signature | Not PGM; own vintage problem |
| `20a/*` | The *edificació aïllada* articles + **the per-subzone parameter table** (min parcel, índex net, ocupació, separations, height) for EACH of `/5 /8 /9 /9b /9u /10 /11 /12` | One signature covering the table, provided the table is read as a whole | 8 subzones × 5 parameters = 40 numbers; transcription risk is the dominant one |
| `18` | **Art. 306** verbatim — to CITE THE REFUSAL. Plus: does RPUC/NUMAMB expose the per-site approved volumetry as data? | Signature on the refusal wording | If the answer is "no data", 18 stays a refusal indefinitely |
| `15`/`16`/`17`/`8a` | The respective zone articles — to cite the refusal | One signature | Low |

### 4.1 PROVENANCE + CONFIDENCE TIERS — what a user actually sees

`defaultConfidence: 'estimated-ruleset'` (**amber**) is the correct tier for every pack authored from
an ordinance text, and it **does not become green by finding a cleaner copy of the same document**
(C58 §1.2/§1.4, C23). Green requires **certification** against the per-parcel *fitxa urbanística* in
the MUC/RPUC interactive viewer — which is exactly what **L-528** is doing for 13a, and which is
**interactive GIS work, not web search.**

> **CERTIFICATION IS A SEPARATE, PER-CLAU TRACK FROM IMPLEMENTATION.** A phase completing means the
> clau produces a *constructed, cited, amber* answer. It does NOT mean green. The certification track
> runs behind implementation, one L-528-shaped task per clau, and can lag by phases without blocking
> anything.

**So "complete Barcelona" means: every buildable parcel gets an HONESTLY-TIERED answer — constructed
(amber), refused-with-reason, or certified (green). It does NOT mean every parcel gets a green
badge, and it does not mean every parcel gets a polygon.**

---

## 5. THE PHASED PLAN

Sequenced by **land coverage ÷ implementation cost**, with the constraint that a new KIND is an ADR
and an ADR precedes its packs.

### Phase 0 — Prerequisites *(6 dev-days)* — **no user-visible change**
- **P0.1 De-hardcode the dispatch gate (2 d).** `siteDispatch.ts` ~L983 tests
  `BCN_ENSANCHE_ZONE_CODES.includes(clau)`. Replace with a **clau → pack registry** lookup in
  `site-parcel-data`, so a new pack is a data addition, not an editor edit. ⚠ **Owned by the L-537
  agent right now — coordinate, do not edit concurrently.**
- **P0.2 ADR-0272 — the coverage/FAR rule kind (3 d).** Serves 22a + 20a (31.3 %). Must state:
  how `maxCoverage` shapes a polygon (proportional inset? occupancy-constrained band?), how FAR binds
  storeys via the existing `storeyCap`, and how the ground-floor/upper-floor distinction is carried.
- **P0.3 Refusal vocabulary (1 d).** One structured `status: 'not-applicable'` + reason, distinct
  from `degenerate` and from the estimated fallback, so systems and derived-plan zones report a
  POSITIVE answer. Prerequisite for Phases 1b, 5, 6.

### Phase 1 — `13b` *(+8.7 % → 32.7 % cumulative)* — **7 dev-days** *(4 impl + 3 sourcing)*
Config only, existing kind. Reuses **L-537 *amplada de vial*** and the **L-525a height table**
pattern (13b has its own table — same machinery, different numbers).
**Tier on completion: amber (constructed).**

### Phase 1b — System + derived-plan REFUSALS *(covers the 73 % of Barcelona's ground that is systems, plus 18 and the tail)* — **4 dev-days**
Ship P0.3's refusal for `SX*`, `6*`, `7*`, `27/28/29`, `1a`, `3`, `4`, `9`, `SH`, plus `18`, `15`,
`16`, `17`, `8a`. **Highest honesty-per-day in the plan** and it removes the fabricated setback
triple currently shown on parks and motorways.
**Tier: N/A — an explicit, cited "no envelope applies".**

### Phase 2 — `22a` + `20a` family *(+31.3 % → 64.0 %)* — **26 dev-days** *(18 impl + 8 sourcing)*
Implements ADR-0272. Two packs, sourced separately (Art. 350 vs the *aïllada* table). `22@` deferred
to Phase 4.
**Tier: amber.** ⚠ FAR/coverage answers are **not envelopes in the same sense** — the UI must say the
constraint is a floor-area cap, not a boundary.

### Phase 3 — `12` + `12b` *(+11.3 % → 75.3 %)* — **28 dev-days** *(8 sourcing + 4 ADR-0273 + 12 impl + 4 overlay)*
The most legally intricate phase. Delivers: the Art. 316 block-occupation construction; a
**refusal** on non-uniformly-zoned blocks (where the fabric-derived clause governs); and an
**overlay-uncertainty refusal** for catalogued Ciutat Vella parcels.
**Tier: amber where solved; explicit refusal where the ordinance defers to fabric or a PE. Expect a
material fraction of Ciutat Vella to REFUSE — that is the correct outcome, not a shortfall.**

### Phase 4 — `22@` + long-tail citations *(+0.7 % → 76.0 %; the remainder is refusals)* — **8 dev-days**
MPGM 22@ pack; cite the tail refusals properly.
**Tier: amber (22@); cited refusal (tail).**

### Phase 5 — `18` data acquisition *(up to +22.5 %)* — **12 dev-days investigation, implementation UNSCOPED**
Investigate whether RPUC/NUMAMB exposes per-site approved volumetries as data. **If yes**, build the
`explicit-area` engine branch + resolver (schema exists, engine does not). **If no**, 18 remains a
cited refusal permanently and this phase closes at the investigation.
**Tier: green-ish if the approved volumetry is ingested (it IS the authoritative geometry); otherwise
cited refusal.**

### Certification track — **parallel, ~15 dev-days** *(2–3 d per clau, L-528 pattern)*
Per-clau *fitxa urbanística* certification in the MUC/RPUC interactive viewer. Moves packs amber →
green. **Never blocks an implementation phase.**

### 5.1 TOTALS

| | dev-days |
|---|---|
| Phase 0 | 6 |
| Phase 1 + 1b | 11 |
| Phase 2 | 26 |
| Phase 3 | 28 |
| Phase 4 | 8 |
| Phase 5 (investigation) | 12 |
| Certification track | 15 |
| **TOTAL** | **~106 dev-days ≈ 21 weeks at 1 dev** |

**Coverage achieved:** constructed envelopes on **~76 %** of Barcelona's private buildable land
(97.8 % if Phase 5 lands `18`), and a **legally-grounded, honestly-tiered answer on 100 %** of it
from Phase 1b onward. **Phases 0 + 1 + 1b — 17 dev-days, ~3.5 weeks — take coverage from 24 % to
32.7 % constructed and 100 % honest.** That is the disproportionate slice.

### 5.2 Shared prerequisites already in flight

| Prereq | Status | Which claus reuse it |
|---|---|---|
| **L-537 *amplada de vial* (official street width)** | in flight, another agent | `13a` (now), `13b` (Phase 1), `12` (Phase 3) — every *alineacions de vial* zone keys its height on it. **NOT** 18/20a/22a. |
| **L-525a Art. 327.2 height table** (`bcnAlcadaReguladora.ts`) | shipped, PB+5 figure uncertified (L-528) | Pattern reused verbatim by `13b` and `12`; **the numbers are NOT** — each subzone has its own table. ⚠ The `BAND_EDGE_GUARD_M` refusal discipline must be reused too. |
| **`dissolveParcelsToBlockRing`** | Barcelona **2/2** per L-535 | `13a`, `13b`, `12` — every block-derived clau. |
| **L-528 certification** | in flight for 13a | The template for every other clau's certification. |

**On the founder's instinct to complete Barcelona before other municipalities — the evidence
supports it.** `SPAIN-CADASTRAL-DISSOLVE-PROBE.md` measured block-ring success at **Barcelona 2/2
(100 %) · Madrid 2/4 · Córdoba 0/3**: outside Barcelona the geometry stage fails *before any rule is
consulted*, so rule work elsewhere would land on a pipeline that cannot feed it. **Barcelona is the
one city where depth in the rules converts directly into working output.** Going deep here first is
the correct sequencing on measured grounds, not sentiment.

---

## 6. WHAT COULD NOT BE DETERMINED

Sourced legally, not inferred:

1. **Verbatim primary text of Art. 316** (clau 12). Reached only via secondary municipal
   transcriptions and search summaries; **AMB NUMAMB article endpoints return HTTP 403 to automated
   fetch and the AMB Geoportal *normativa* pages 404 for INE 08019.** Enough to falsify the cheap
   hypothesis; not enough to implement.
2. **Whether Art. 242's 30 % applies to `13b`** or Subzona II states its own ratio. Assuming
   inheritance is exactly the error L-526 caught in the 13a citation.
3. **The `13b` and `12` height tables** by *amplada de vial* — not located.
4. **The full `20a/*` subzone parameter table** — ~40 numbers, unread.
5. **Whether Ciutat Vella's Pla Especial / heritage catalogue is published as a queryable layer.**
   If not, clau 12 has an unresolvable silent over-statement risk. **Potentially the hardest blocker
   in the plan.**
6. **Whether RPUC/NUMAMB publishes per-site approved volumetries for `18` as data.** Decides whether
   22.5 % of the city is ever more than a refusal.
7. **The `13E` question** (2002 Eixample ordinance in force?) — unchanged from L-526.
8. **Parcel-count weighting.** The probe measures AREA. The parcel-weighted distribution needs a
   Catastro-driven probe; the direction of the skew is known (§2.1), the magnitude is not.
9. **`21` (ciutat jardí)** — absent from the 08019 sample; whether it truly does not occur in
   Barcelona or the grid missed it is unconfirmed.
10. **The `22a` "70 % concentric strip to the block alignments" rule** — whether it needs the block
    ring (making 22a partly block-derived) is unresolved from the text seen.

---

## 7. RISKS

**R1 — `18` is 22.5 % of the city and may never be more than a refusal.** The PGM points at another
document per site. If that data is not obtainable, "complete Barcelona" tops out at ~77 % constructed.
*Mitigation: Phase 5 is scoped as an investigation with an explicit "close as refusal" exit; Phase 1b
makes the refusal honest and cited immediately.*

**R2 — Ciutat Vella heritage overlays are invisible to our data path.** MUC returns `12` whether or
not a Pla Especial or catalogue entry binds. A correct Art. 316 implementation would still
over-state buildability on protected parcels — a wrong number that looks right, on the most
sensitive fabric in the city.
*Mitigation: Phase 3 carries the overlay investigation as a first-class task, and refuses under
uncertainty rather than solving.*

**R3 — the source-vintage trap, repeating.** 13a's first founder-signed source was stale,
anachronistic and mis-attributed, and passed the L-449 gate anyway. Six more packs mean six more
chances. The metropolitan PGM is republished by dozens of municipalities in versions that differ from
Barcelona's consolidation, and those republications are **the easiest documents to find** — which is
exactly how the failure recurs.
*Mitigation: every sourcing task names the **consolidated Barcelona refós in RPUC/NUMAMB** as the
required source and records what was read; the gate is per-source, not per-clau.*

---

## 8. OUT OF SCOPE

Madrid, Córdoba, and the rest of Spain (L-535 / `SPAIN-SCALABILITY-STUDY.md`, owned elsewhere). The
`dissolveParcelsToBlockRing` tolerant-mode work those cities need is **not** on Barcelona's critical
path — Barcelona is 2/2 today.

**Cross-refs:** L-538 (this), L-525/L-525a/L-526/L-528/L-529 (13a accuracy + legal + certification),
L-535 + `SPAIN-CADASTRAL-DISSOLVE-PROBE.md`, L-537 (*amplada de vial*), L-449 (founder source gate),
ADR-0270 / ADR-0271, C58 §1.2/§1.4/§1.6/§1.11, C23, C57 §1.5,
`scratchpad/probe-bcn-clau-distribution.mts`.

**Sources consulted (secondary — see the evidence-tier caveat in §3.4):**
[AMB — Qualificació urbanística del sòl PGM](https://www.amb.cat/web/area-metropolitana/dades-obertes/cataleg/detall/-/dataset/qualificacio-urbanistica-del-sol-prevista-pel-pgm/1053744/11692) ·
[AMB NUMAMB Art. 242 — Profunditat edificable](https://www.amb.cat/es/web/territori/gestio-i-organitzacio/numamb/detall/-/articlenumamb/article-242---profunditat-edificable/991409/11656) ·
[AMB NUMAMB Art. 314 — Qualificacions zonals](https://www.amb.cat/web/territori/gestio-i-organitzacio/numamb/detall/-/articlenumamb/article-314---qualificacions-zonals/992057/11656) ·
[AMB NUMAMB Art. 306 — Zona subjecta a ordenació volumètrica específica](https://www.amb.cat/web/territori/gestio-i-organitzacio/numamb/detall/-/articlenumamb/article-306---zona-subjecta-a-ordenacio-volumetrica-especifica/991985/11656) ·
[AMB Geoportal — Zona de nucli antic (clau 12)](https://geoportalplanejament.amb.cat/Informacio/Normativa/08200_12.htm) ·
[AMB Geoportal — Zona industrial (clau 22a)](https://geoportalplanejament.amb.cat/Informacio/Normativa/08056_22a.htm) ·
[AMB Geoportal — Zona d'ordenació en edificació aïllada (clau 20a)](https://geoportalplanejament.amb.cat/Informacio/Normativa/08056_20a.htm) ·
[PGM NNUU zones aïllades (Sant Cugat republication)](https://www.stcugat.net/assets/files/20080929_PGM_NNUU_zones-allades.pdf) ·
[Ordenances Metropolitanes d'Edificació — PGM (Gramenet republication)](https://www.gramenet.cat/fileadmin/Files/Ajuntament/informacio_urb/Normes_i_Ordenances/Ordenances_urbanistiques/PGM_Ordenances_edificacio.pdf)
