# Córdoba — CLOSURE REGISTER (the complete blocker list)

> **Stamp 2026-08-01.** The single place that answers *"what is left before Córdoba is CLOSED?"*
> Companion to [`RATE.md`](./RATE.md) §CLOSURE (which scores axes) — **this file tracks BLOCKERS.**
> Every row must end in a **yes/no**, never an open question.
> Shape follows [`../../es-ct/08019-barcelona/CLOSURE-REGISTER.md`](../../es-ct/08019-barcelona/CLOSURE-REGISTER.md).
>
> ### ⬆ 2026-08-01 SECOND PASS — C63 SCORED, AND THREE CLAIMS IN THIS FILE WERE REFUTED BY MEASUREMENT
>
> | This file said | Measured live 2026-08-01 |
> |---|---|
> | "7 of the 13 registered subzones bind ZERO pilot land" | **4** (PAS-1 · PAS-3 · OA-2 · UAD-2). UAD-3, MC-1 and MC-3 all bind — and this file's own 94.33 % routing fraction requires them to. |
> | blocker 4: D1 is "latent" because "UAD-3 binds 0.00 %" | **FALSE PREMISE.** UAD-3 binds 31 505.01 m² = 1.934 %. D1 is latent only because the gate is shut. |
> | "2 of ~10 districts" | The `~10` has **no source**, and could not be obtained this pass. See §Scoping the pilot honestly. |
>
> ### ⬆ 2026-08-02 THIRD PASS — THE MANUAL-VECTORISATION PLAN IS REFUTED BEFORE IT WAS STARTED
>
> A six-probe exhaustive search for a machine-readable calificación source
> ([`findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`](./findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md))
> returned **two** negatives, and the second is the one that matters:
>
> 1. **No machine-readable source exists.** The `GMU_Services (FeatureServer)` lead is an acronym
>    collision — George Mason University, **6 148 km** from Córdoba. Every Spanish AGOL query: `0`.
> 2. ⭐ **AND blocker 22's rasters are not published either — 41 of 49 urban CUS sheets are dead.**
>    The "vectorise the remaining 69 sheets" plan was extrapolated from **one** sheet returning 200.
>    The real marginal gain is **2 sheets**. Blocker 22 is a **data request to GMU**, not engineering.
>
> ⭐ It also found what nobody had: the **Ayuntamiento's own GeoServer** (`ide.cordoba.es`), carrying
> **no zoning** but carrying a **street-width layer set** — the input blocker 8 (worth 0.88 pp) has
> been waiting on. New row **25**.
>
> **All four expensive C63 axes are now MEASURED** —
> [`tools/city-completion/measurements/cordoba.measurements.json`](../../../../../../tools/city-completion/measurements/cordoba.measurements.json).
> PARCEL **95 %** · LEGISLATION **40 %** · ENVELOPE **0.0 %** · HEIGHTS **0.271 %**; overall
> **71.5 % → 45.8 %** as the assessed weight went 30 % → 100 %. The drop is the measurement, not a
> regression.

---

## The definition of CLOSED — ratified 2026-08-01 (founder)

> **A city is CLOSED when every parcel reaches a TERMINAL, EVIDENCE-BACKED state — either a
> constructed envelope, a cited delegation, or an explicit refusal with a documented reason.**

**It does NOT mean every parcel returns a numeric envelope.** Closure is about **exhausting the legal
search space and making every outcome explicit** — not forcing a number where the law, or the
publisher, provides none.

⚠ **For Córdoba this definition changes the whole picture, and it is the single most important
sentence in this file.** Córdoba's coverage is a **2-district pilot** (Sur + Noroeste) of ~10
districts, and the dossier has been reporting the rest of the city as **"~0 %"**. Under the ratified
definition the ~8 districts outside the pilot are **not un-closed** — they are **CLOSED the moment
they carry an explicit, documented refusal stating that no calificación is published for that land**.
That refusal now exists and ships (**blocker 1**, closed in this pass). Córdoba's closure problem was
never mostly a *coverage* problem; it was that **the honest "no" was not being said** — a fabricated
estimate was being said instead.

---

## Córdoba's ARITHMETIC MAXIMUM — measured, with every denominator NAMED

⚠⚠ **THE PILOT BOUNDARY IS A *VECTORISATION* LIMIT, NOT A PUBLICATION LIMIT AND NOT A LAW LIMIT —
AND THAT DISTINCTION IS THE MOST IMPORTANT THING ON THIS PAGE.**

An earlier draft of this section said the calificación *"has not been vectorised by anyone who
publishes it"* and filed the whole gap as data-availability. **That is wrong, and the recon spike had
already disproved it.** The **Gerencia Municipal de Urbanismo (GMU)** — the *authority*, of which
COACo is only a downstream vectoriser — publishes the PGOU-2001 **Calificación, Usos y Sistemas**
series **municipality-wide** as **77 georeferenceable raster sheets** (49 urban `CUS01W…CUS49W` + 28
peripheral). **Re-verified live 2026-08-01:**
`https://visor.pgou.coacordoba.org/doc/planos/cus/CUS41W.jpg` → **HTTP 200, `image/jpeg`, 461 957 B**
(byte-identical to the recon's record). COACo vectorised **8** of those sheets; that is the 2-district
pilot.

⇒ **The calificación KNOWLEDGE and its official MAPPING both exist city-wide. What is missing is a
raster→vector acquisition (blocker 22) — an in-house engineering task on already-published public
data, not a wait on COACo and not a hole in the law.** Every ceiling below is therefore bounded by
**EFFORT + geometry acquisition**, not by legal delegation — the opposite of Barcelona, whose missing
points are ~19/22 law. ⚠ Getting this backwards would file the single largest lever in Córdoba as
"impossible" and never staff it.

### The municipal denominator — previously `not-composable`, now MEASURED

`RATE.md` §CLOSURE recorded the LEGISLATION ceiling as **`not-composable`** — *"no municipal
buildable-land denominator has been computed for Córdoba"*. **It is composable, it was composed on
2026-08-01, and here it is**, from the national SIU *clases de suelo* service (the one national
source that DOES cover the whole municipality):

```
https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer/15/query
  ?where=ProvINE='14021'&outFields=ClaseSuelo,AreaLambert,FechaBaja&returnGeometry=false&f=json
```

| Clase de suelo (INE 14021, all `FechaBaja=99999999` ⇒ in force) | Area |
|---|---:|
| SUELO URBANO | **33 341 928 m² = 33.342 km²** |
| SUELO URBANO NO CONSOLIDADO | 5 685 090 m² |
| SUELO URBANIZABLE DELIMITADO O SECTORIZADO | 25 747 192 m² |
| SUELO URBANIZABLE NO DELIMITADO | 7 621 868 m² |
| SISTEMAS GENERALES Y OTROS | 2 847 407 m² |
| SUELO NO URBANIZABLE | 1 179 072 015 m² |
| **Municipal term** | **1 254 315 501 m² = 1 254.3 km²** (independently corroborates the published ~1 255 km²) |

### The three honest ceilings, each with its denominator

| Denominator (NAMED) | Full numeric envelope | Any envelope | Terminal + evidence-backed |
|---|---:|---:|---:|
| **COACo published pilot buildable land — 1 850 780 m²** (ordenanzas 1 628 301 + `usos_globales` lucrative 222 479) | **≈ 16 %** | **≈ 31 %** | 100 % |
| **Córdoba SUELO URBANO — 33 341 928 m²** | **≈ 0.9 %** | **≈ 1.7 %** | **100 %** ⭐ |
| **Córdoba developable land (urbano + urbanizable) — 72 396 079 m²** | ≈ 0.41 % | ≈ 0.80 % | 100 % |

*Derivation of the municipal rows: the pilot's measured 16.23 % / 31.20 % applied to the pilot's
1 850 780 m² gives 300 382 m² / 577 443 m², over 33 341 928 m² of SUELO URBANO.*

**COACo publishes an ordenanza polygon over 1 628 616 m² — 4.88 % of Córdoba's SUELO URBANO.** The
other **95.1 %** carries no *vector* calificación today — but it **does** carry an official raster one
(the 69 un-vectorised GMU CUS sheets). So the honest split of the missing points is:

| Why a point is missing | Share of the whole-city gap | Bucket |
|---|---|---|
| **Geometry not yet vectorised** (69 of 77 GMU CUS sheets) | **the dominant share** — it is what holds the city ceiling at ≈ 1.7 % instead of something near the pilot's ≈ 31 % | **A→B, effort + acquisition** |
| **Legal delegation** to a Plan Parcial / PERI / ED / Plan Especial | ≈ 50 % *of whatever land is vectorised* | **STRUCTURAL-LAW — permanent** |
| **The MC street-width height table** | 16.86 pp of pilot buildable land | B (needs a width source) |
| **Publisher-gated absences** (Tomo VI, dead `O_UAS1`, the bare-`O_MC` key) | ≈ 2.6 % of ordenanzas land | **A — permanently closed as cited refusals** |

⚠ **So Córdoba is NOT a "law says no" city the way Barcelona is.** Its ceiling is held down by a
one-time geometry acquisition and by delegation *within* whatever is acquired.

> ### ⛔ CORRECTION 2026-08-02 — "A→B, effort + acquisition" IS WRONG. IT IS ACQUISITION ONLY.
> The table above files the dominant gap as *effort + acquisition*, i.e. staffable in-house. **It is
> not.** All 49 urban CUS sheets were fetched on 2026-08-02: **8 serve a JPG and 41 return a 69-byte
> "Server under construction" page**, and the 8 live ones are the 6 COACo already vectorised plus
> two. **The rasters the in-house plan would consume are not published**, none is georeferenced, and
> a six-probe search found **no machine-readable calificación anywhere** (blocker 22 / the findings
> file). ⚠ **This is now bucket A — publisher-gated — and no amount of PRYZM staffing moves it.**
> ⚠ ⚠ **AND NOTE WHAT JUST HAPPENED TWICE ON THIS PAGE.** The register's §2 lesson below congratulates
> itself for catching a draft that wrongly filed this gap as *"nobody publishes it"*, and corrected it
> to *"nobody has vectorised it"* — **on the strength of ONE sheet returning HTTP 200.** The
> correction was right about the distinction and **wrong about which side Córdoba is on**. Measuring
> all 49 put it back. *Both* the original claim and its confident correction were made from n=1.

⚠ **AND THE THIRD COLUMN IS THE ONE THAT MATTERS.** Under the ratified definition Córdoba's
achievable state is **100 % terminal** — every click either gets an envelope, a cited delegation, or
a cited refusal naming *whose* gap it is. Before this pass it was **≈ 4.9 % terminal**: the 95.1 %
outside the pilot was receiving a **fabricated estimated envelope** (3,0 / 1,5 / 3,0 m, FAR 2,00,
50 % coverage), which is neither terminal nor evidence-backed. Blocker 1 is that whole delta.

### LEGISLATION — the cited-ordenanza fraction, denominator NAMED

Measured live against the publisher on 2026-08-01 (`coaco:ordenanzas`, 453 polygons, Σ `sup_m2`
**1 628 616 m²**) — **the denominator is COACo's own inventory, not the 13 subzones we packed**:

| Denominator | PRYZM holds | Fraction |
|---|---|---:|
| **10 distinct `ordenanza` FAMILIES COACo publishes** | 5 (Manzana Cerrada · Ordenación Abierta · Colonia Tradicional Popular · Plurifamiliar Aislada · Unifamiliar Adosada) | **50 %** |
| **15 distinct `link` DOCUMENTS COACo references** (12 distinct files, 2 dead) | 12 of 12 readable, read and transcribed | **100 % of readable, 80 % of referenced** |
| **1 628 616 m² of ordenanzas land**, by the shipped link key | resolves to one of the 13 packed subzone codes | **94.33 %** |
| …the residue, itemised | COMERCIAL 2.28 % · PTC 1.31 % · **bare `O_MC` 1.14 %** · EP 0.67 % · UAS-1 0.17 % · INDUSTRIAL 0.12 % | **5.67 %** |

⚠ **94.33 % is a ROUTING fraction, not an ANSWER fraction.** It says a subzone binds, not that a
number results. After delegation (≈ 43 % of ordenanzas land) and the MC height table it collapses to
the ≈ 31 % / ≈ 16 % above. Quoting 94 % as coverage would be the "89 %" error a second time.

### ⭐ WHICH SUBZONES ACTUALLY BIND — RE-MEASURED 2026-08-01, AND THIS FILE WAS WRONG

> ⚠⚠ **This register said, in three places, "7 of the 13 registered subzones bind ZERO pilot land
> (PAS-1 · PAS-3 · OA-2 · UAD-2 · UAD-3 · MC-1 · MC-3)". It is FOUR, and the register CONTRADICTED
> ITSELF about it** — the 94.33 % routing fraction one paragraph above is only reachable if UAD-3,
> MC-1 and MC-3 bind. Measured live against `coaco:ordenanzas` and run through the **shipped**
> `subzoneCodeFromLink` parse (not a hand reading), Σ `sup_m2` grouped by parsed subzone code:

| Subzone | Land bound | % of ordenanzas land | | Subzone | Land bound |
|---|---:|---:|---|---|---:|
| MC-2 | 632 217.07 m² | 38.819 % | | PAS-1 | **0** |
| OA-1 | 296 976.84 m² | 18.235 % | | PAS-3 | **0** |
| CTP-1 | 280 139.60 m² | 17.201 % | | OA-2 | **0** |
| PAS-2 | 172 760.95 m² | 10.608 % | | UAD-2 | **0** |
| UAD-1 | 56 406.85 m² | 3.463 % | | | |
| MC-4 | 55 148.12 m² | 3.386 % | | | |
| **UAD-3** | **31 505.01 m²** | **1.934 %** | | | |
| **MC-3** | **10 092.59 m²** | **0.620 %** | | | |
| **MC-1** | **994.50 m²** | **0.061 %** | | | |
| **Σ bound** | **1 536 241.53 m²** | **94.328 %** ✓ | | **bind zero** | **4 of 13** |

⚠ **THIS IS A SEVERITY CHANGE, NOT A TYPO — see blocker 4.** That row argues D1 (the missing UAD
*profundidad*) is *"latent, not live"* **because "UAD-3 binds 0.00 % of published pilot land"**.
**That premise is false.** UAD-3 binds 1.934 % of ordenanzas land. D1 is latent today for one reason
only — the gate is shut. A second protection exists but is **not wired**: by the centroid method,
**100 % of UAD-3's bound land sits inside a delegating ámbito**, which shields it *only if blocker
3's `derivedPlanningOverride` branch is actually called*, and it is not. **Flipping the gate without
blocker 3 would put the L-616 whole-parcel overstatement live on real land.**

### Delegation, INDEPENDENTLY RE-MEASURED 2026-08-01 (a second method, and it does not agree exactly)

Re-run as an `ordenanzas`-polygon **centroid** test against `coaco:actuaciones` (40 features):
**178 of 453 polygons · 728 522.65 m² · 44.73 %** of ordenanza land — Plan Parcial 19.06 pp · Plan
Especial 14.55 pp · PERI 5.57 pp · Estudio de Detalle 3.80 pp · **blank `instrumento` 1.76 pp**. The
row-14 figure below (169 polygons · 699 772 m² · 42.98 %) came from a different method. **Both are
recorded; neither is retracted.** A centroid test and an area intersection disagree by construction
on a polygon that straddles an ámbito edge, and a 1.75 pp spread is the size of that effect. What is
NOT in doubt is the order of magnitude: **≈ 43–45 % of pilot ordinance land is delegated.**

### Two publisher facts re-verified this date, one of which is new

- **All 15 ordinance links re-fetched**: 13 serve a real `application/pdf`; `O_UAD1.pdf` and
  `O_UAS1.pdf` both return the same 69-byte "Server under construction" HTML
  (md5 `75a5f3192d98343b18570f62ee57152a`). Blockers 11 and the UAD-1 recovery both stand.
- ⭐ **NEW, and its interpretation is deliberately left OPEN**: the five Manzana Cerrada documents are
  all **exactly 1 243 005 bytes**, and **`O_MC3.pdf` ≡ `O_MC4.pdf` byte-for-byte**
  (md5 `8b7e5cf0a0c0820b5a581dcfca95e730`) — even though MC-3 and MC-4 differ materially (0.70 vs
  0.90 upper-floor coverage). `O_MC.pdf`, `O_MC1.pdf` and `O_MC2.pdf` carry three further distinct
  hashes at that same length. Equal length + differing hash is consistent with **one document
  re-issued with differing metadata**; it is **NOT** evidence that the content differs per subzone,
  and it is **not claimed to be**. It bears on blocker 7 (the bare-`O_MC` selector) and wants one
  hour of a human reading the two identical files before anyone draws a conclusion.

---

### Scoping the pilot honestly — and "2 of ~10 districts" has NEVER had a source

⚠ **The `~` in "~10 districts" has been load-bearing for months and nobody sourced it.** This pass
tried: `coaco:distritos` returns **2** (COACo's own pilot zones `Sur` 01 and `Noroeste` 02 —
publisher vocabulary, not the Ayuntamiento's scheme); `coaco:actuaciones.distrito` distinguishes only
`Noroeste` / `Sector Sur`; OSM relation 343207 `admin_level=9` returns **9** sub-municipal units, of
which **7** are named *Distrito …* (Centro · Sur · Sureste · Levante · Noroeste · Norte Sierra ·
Poniente Sur) plus 2 barriadas periféricas (San Rafael de la Albaida, Las Jaras); a Wikidata query
returned 0 rows; and two attempts to stitch the district geometries via Overpass returned **HTTP 504**
— a FAILURE, not an empty. **So: the Ayuntamiento's own district count is UNKNOWN, with that typed
reason, and this register should stop printing "~10" as though it were measured.** ⚠ It is also the
wrong slicing unit: COACo's pilot is 4.96 km² = **14.9 % of SUELO URBANO**, and the calificación
covers only **32.8 %** of even that, so a per-district table is *coarser* than the land table below.

| Unit (OSM `admin_level=9`, relation 343207, read 2026-08-01) | State | Basis |
|---|---|---|
| **Distrito Sur** | **partially PACKED** — COACo pilot zone `01`, 2 488 982.8 m² | `coaco:distritos` |
| **Distrito Noroeste** | **partially PACKED** — COACo pilot zone `02`, 2 472 361.8 m² | `coaco:distritos` |
| Distrito Centro · Sureste · Levante · Norte Sierra · Poniente Sur | **PGOU-direct, UNPACKED** — the PGOU-2001 governs and the GMU publishes a CUS raster sheet; no vector calificación exists (blocker 22) | `coaco:hojas_cus` = **8** sheets, all inside the two pilot districts |
| San Rafael de la Albaida · Las Jaras (barriadas) | same | as above |
| **Any further district the Ayuntamiento recognises** | **UNKNOWN — enumeration not obtainable** | Overpass 504 ×2; Wikidata 0 rows |
| **Whether any of the above is DELEGATED to a derived instrument** | **UNKNOWN outside the pilot** | `coaco:actuaciones` carries `distrito ∈ {Noroeste, Sector Sur}` only |

⚠ **Note the fourth state is genuinely populated, and that is the honest part.** Outside the pilot
PRYZM cannot say whether land is delegated, because the layer that records delegation is published
for the pilot alone. Reporting that land as "PGOU-direct" would be an unevidenced claim about ~95 %
of the city — the same shape as the fabricated envelope, one abstraction up.

**The NON-OVERLAPPING slices that actually score the ENVELOPE axis are by LAND, sum to 1.000000 of
SUELO URBANO, and live in [`tools/city-completion/measurements/cordoba.measurements.json`](../../../../../../tools/city-completion/measurements/cordoba.measurements.json).**

## The standard every blocker must meet before it closes

**Evidence → Findings → Decision → Alternatives rejected.**

⚠ **No blocker may rest at *"needs founder decision"* until it is PROVEN that no authoritative
evidence exists.** **Negative evidence closes a blocker** — *"no authoritative source exists, here is
exactly where we looked"* is a valid, permanent closure.

## ⭐ CATEGORY · OWNER · EXIT — the founder's standing rule (2026-08-02)

[`BLOCKER-CLASSIFICATION-STANDARD.md`](../../../../standards/BLOCKER-CLASSIFICATION-STANDARD.md) is
BINDING: exactly one of **Legal · Engineering · Data acquisition · External authority**, **one
owner**, **one exit criterion**, and **no migration without explicit evidence**. Córdoba's open rows:

| # | Blocker | Category | Owner | Exit criterion |
|---|---|---|---|---|
| **2** | `CORDOBA_ENVELOPE_VERIFIED` signature | **External authority** | the founder | §SIG-1 signed (or refused). ⚠ **not before 4 and 3** |
| **3** | COACo subzone resolver authored but never called | **Engineering** | the Córdoba agent | resolver called from the dispatcher; the delegation branch driven by a test |
| **4** | UAD *profundidad* stated in Art. 13.9.3.3, absent from the pack (D1) | **Engineering** | the Córdoba agent | each UAD subzone carries a `geometricRule` with its stated depth |
| **8** | MC per-street-width height table | **Engineering** | the Córdoba agent | a width source bound to the frontage and the table evaluated — ⭐ candidate source now found, row **25** |
| **9** | SIU clasificación mounted, called by nothing | **Engineering** | the Córdoba agent | a client caller renders the clase de suelo on the refusal card |
| **22** | 41 of 49 urban CUS sheets are unpublished | **Data acquisition** | the founder (request to GMU) | GMU serves the 41 sheets, or answers that it will not |
| **22b** | vectorise the 2 live un-vectorised sheets (CUS18W · CUS19W) | **Engineering** | the Córdoba agent | both vectorised, bound through the resolver, ENVELOPE re-measured |
| **25** | Ayuntamiento street-width layers unprobed | **Engineering** | the Córdoba agent | `sup_viales`/`tramo_vial` probed for a per-frontage width and bound behind 8 |
| **7** | bare `O_MC` subzone key | **External authority** | COACo | COACo populates a subzone attribute (**not PRYZM-closable**) |
| **21** | HEIGHTS pre-bake | **Engineering** | the orchestrator | national bake lands; histogram re-probed |

⚠ **Rows that must NOT migrate back.** **20 (cadastral dissolve)** — CLOSED; the P1 ceiling came from
a **three-block sample** and is refuted at scale (Catastro INSPIRE 76.9 %, COACo 88.5 %). **22** —
stays **Data acquisition**; the one-shot search concluded no machine-readable source exists *and*
that the rasters are unpublished, so it does **not** become Engineering.

## Taxonomy (ratified 2026-08-01, superseded by the standard above for OPEN rows)

| | Bucket | Unblocked by |
|---|---|---|
| **A** | **Evidence** | primary sources — BOJA, COACo, SITUA/VITUA, Gerencia de Urbanismo |
| **B** | **Engineering** | implementation |
| **C** | **Contract** | architecture change |
| **D** | **Product policy** | a founder decision, *after* A is exhausted |

## ⚠ ESTABLISH THE SIGN BEFORE RANKING SEVERITY

Barcelona's register had to record this three times. For each row below, the **Sign** column says
whether omitting the item **OVER-states** buildability (dangerous), **UNDER-states** it (safe), or is
**EXACT**. Ranking by how alarming a gap *sounds* inverts the queue — in Córdoba the loudest-sounding
item ("only 2 of 10 districts!") is a publication fact nobody can fix, while the genuinely dangerous
one (a fabricated envelope on 95 % of the city) had no row at all until this pass.

---

## The register

| # | Blocker | Bucket | Sign | Sev | Status | Closes when |
|---|---|:--:|:--:|:--:|---|---|
| **1** | **Outside the pilot, PRYZM published a FABRICATED envelope** | **B** | **OVER-states** | **P0** | ✅ **CLOSED — §CORDOBA-MUNICIPAL-CLOSURE, 2026-08-01** | ✔ done, and it is the highest-value item in this file. **Evidence:** traced through the real dispatch. A parcel outside `CORDOBA_BBOX` (the 2-district pilot) matched no jurisdiction predicate in `applyZoning`, reached `applyEstimatedZoning`, and its §L-663 guard asked `resolveRegisteredJurisdictionAt` — which returned **`'none'`**, because Córdoba's only registration was the pilot and there is **no Andalucía or Spain-wide registration** (`grep 'jurisdictionId:' registry.ts` — 15 entries, none covering it). `'none'` is defined as *"genuinely uncovered land — the estimate is honest here"*, so PRYZM **published 3,0 / 1,5 / 3,0 m, FAR 2,00, coverage 50 %** on **95.1 % of Córdoba's SUELO URBANO**. **§L-663 was not at fault — it asks the registry, and the registry had the hole. Decision:** register the municipal term as a REFUSAL-ONLY jurisdiction (`es-14021-cordoba-municipal`, `packsByZone` empty by construction, `noRulePackRefusal → cordobaOutsidePilotRefusal`), the Catalonia pattern one rung down. `'municipal'` is coarser than the pilot's `'district'`, so §JURISDICTION-SPECIFICITY gives the pilot its own land **by rule, with no ordering edit anywhere**. **Alternatives rejected:** (a) widening `CORDOBA_BBOX` to the municipality — would claim pilot coverage over the whole city, the exact false coverage claim the tight box exists to prevent; (b) a branch in `siteDispatch.ts` — unnecessary, and C58 §1.5 promises registration alone closes it; (c) leaving it — the estimate is *worse* here than a blank card, because on street-aligned Córdoba fabric a front/side/rear triple is the wrong geometric OPERATION, not an imprecise number. Extent = **OSM relation 343207** (`admin_level=8`, `ine:municipio=14021`), read live 2026-08-01, rounded outward. Pinned by 5 tests incl. the explicit regression guard. ⬆ **AND NOW PROVEN EXHAUSTIVELY, NOT SPOT-CHECKED (§EXTENT-CLAIM-TOTALITY, `packages/site-parcel-data/__tests__/registeredExtentTotality.test.ts`):** a **41 × 41 = 1 681-point lattice** over the whole municipal term (≈ 1 km spacing) resolves to `none` at **zero** points and to a foreign jurisdiction at **zero** points; every point inside `CORDOBA_BBOX` resolves to the pilot and every point outside it to `es-14021-cordoba-municipal`, **by rule** — asserted point-by-point, not by reading the `extentResolution` ordering. |
| **2** | **`CORDOBA_ENVELOPE_VERIFIED` — the human signature** | **D** | UNDER-states | **P0** | 🟠 **UNSIGNED, and now genuinely SIGNABLE** | Founder signs [`sources/VERIFICATION.md`](./sources/VERIFICATION.md) §SIG-1. Everything else is prepared: OCR re-verified 13/13 clean against rendered rasters of the publisher's own PDFs (4 of 5 documents have a **zero-character text layer**, so a text pull would have been fabrication); the engine confidence ceiling and the answerability classifier both landed ahead of it (L-665). ⚠ **A signature ALONE still renders nothing — see blocker 3.** It is worth **≈ 31 % of 1.851 km²**, concentrated in **two** subzones (OA-1 14.33 % + CTP-1 14.97 %); **7 of the 13 packed subzones bind ZERO pilot land**. It authorises `estimated-ruleset` and no tier above it. Signing is a **legal act**; no agent may flip the flag. |
| **3** | **The COACo subzone resolver is AUTHORED but NOT CALLED** | **B** | UNDER-states | **P1** | 🔴 **OPEN — and it must land in the SAME change as the signature** | `providers/resolveCordobaSubzone.ts` exists, is exported, has its server proxy (`server/cordobaZoningProxy.js`) and is tested — and `applyCordobaZoningThenFallback` **never invokes it**, using a `cordoba-pgou-2001-pilot` placeholder zone code instead (it says so in its own comment). So **no Córdoba parcel can bind a subzone today**. Its `derivedPlanningOverride` branch (non-empty `actuacion` ⇒ derived-planning refusal) is **load-bearing for the ≈ 50 % delegation refusal** and must be *exercised*, not merely present. **Closes when:** the resolver is called from the dispatcher, the delegation branch is driven by a test, and the signature lands with it. |
| **4** | **⛔ UAD *profundidad máxima edificable* is STATED in the source and ABSENT from the pack (D1)** | **B** | **OVER-states** | **P1 → P0-on-signature** | 🔴 **OPEN — and its "latent" premise was REFUTED 2026-08-01** | **Evidence:** Art. **13.9.3.3**, verified at 380 dpi — UAD-1 **16 m** · UAD-2 **18 m** · UAD-3 **16 m**, measured from the vial alignment. The pack carries **none** of it. For **UAD-3** (`front 0` + `side 0` party-wall + `rear 5 m`, **no depth band**) this is the **L-616 mechanism-A whole-parcel overstatement verbatim** — the exact failure CTP-1's `alignment` rule and MC's unresolvable ring exist to prevent, left unguarded on the one family that also needed it. ⚠⚠ **THIS ROW SAID *"Latent, not live: UAD-3 binds 0.00 % of published pilot land"*. THAT IS FALSE** — measured live 2026-08-01 through the shipped `subzoneCodeFromLink` parse, **UAD-3 binds 31 505.01 m² = 1.934 % of ordenanzas land** (8 polygons via `O_UAD3.pdf`); see the subzone-binding table above, which also shows this file contradicted itself, since its own 94.33 % routing fraction requires UAD-3 to bind. The **only** thing keeping D1 latent is the shut gate. A second shield exists — by the centroid method **100 % of UAD-3's land is inside a delegating ámbito** — but it is inert until blocker **3** calls `derivedPlanningOverride`. ⇒ **4 and 3 must both land before 2, not after.** **Reported, deliberately not silently patched** — the founder must see it before signing. **Closes when:** each UAD subzone carries a `geometricRule` with its stated depth. ~½ eng-day. |
| **5** | **Refusal copy claimed a fallback PRYZM does not render** | **B** | **OVER-states** *(our coverage)* | **P1** | ✅ **CLOSED — 2026-08-01** | ✔ **Barcelona's lesson, found live in Córdoba.** `CORDOBA_ROADMAP_LINE` — shipped in **every** Córdoba refusal card — ended *"Outside the two districts, a click falls back to the national SIU land classification, never a borrowed pilot number."* **PRYZM does not fall back to SIU.** The proxy exists and is mounted (`server/siuClassificationProxy.js`, `server.js:509`) and **nothing in `packages/*/src` or `apps/*/src` calls it** — grep, 2026-08-01, **zero client callers**. Promising a user an answer we never render is the same defect class as refusing with *"we hold no rule"* on a zone we have packed (which deleted Barcelona's `13b`/`22a`/`22@`/`20a` branches), pointing the other way. **The claim is DELETED, not softened.** ⚠ Wiring the SIU fallback is blocker **9**; the copy may promise it **on the day it renders**. |
| **6** | **Four different absences shared two refusal cards** | **B** | mixed | P2 | ✅ **CLOSED — §CORDOBA-REFUSAL-SPLIT, 2026-08-01** | ✔ done. L-422/457/467/469: *"the publisher maps no ordenanza onto this land"* and *"PRYZM has not packed the ordenanza the publisher DID map"* are **different values with different owners**, and one card saying *"Either… or…"* made every publisher gap look like our backlog. Now four: `cordobaOutsidePilotRefusal` (`no-plan-at-point`, durable) · `cordobaNoCalificacionAtPointRefusal` (inside the pilot, the layer answered and returned nothing) · `cordobaUnbindableSubzoneRefusal` (`regime-undetermined`) · `cordobaNoRulePackRefusal` (narrowed to the two genuinely un-transcribed families). ⚠ `source-data-unavailable` was **rejected** for the first two: it is *defined* as transient and is the only code carrying a retry affordance — nothing here clears on a retry, and a fictional retry badge sends the user round a loop for ever. |
| **7** | **Bare `O_MC` polygons cannot bind a subzone — and the dossier said they could** | **B/A** | **EXACT** *(a refusal either way)* | P2 | 🟡 **HALF-CLOSED — the honest refusal ships; the KEY is unobtainable** | **Evidence, measured not theorised (live COACo, 2026-08-01):** **14 of 453 polygons carry a bare `O_MC.pdf`** — 18 539 m², **1.14 % of ordenanzas land**. `subzoneCodeFromLink('O_MC.pdf')` → **`'MC'`**, a code the pack deliberately does not contain. **`OCR-EXTRACTION-RESULTS.md` §1 said *"the filename suffix routes the polygon to subzone MC-1/2/3/4"* — that is FALSE for these 14** (corrected in this pass). **Decision:** ship `cordobaUnbindableSubzoneRefusal`. **Alternatives rejected:** picking a representative MC — MC-4 allows **0.90** upper-floor coverage where MC-1/2/3 allow **0.70**, and each reads a **different** street-width height band, so a pick is a guess presented as a determination. ⚠ **This is Barcelona's bare-`20a` shape exactly: a SELECTOR is missing, not a rule**, and no further reading of the ordinance can supply it. **Fully closes only if** COACo populates a subzone attribute — the `et` field is populated on 262 of 453 polygons and is publisher-undocumented (L-661); it agrees with the link key on all 262 it shares. **Not PRYZM-closable.** |
| **8** | **Manzana Cerrada height is a per-street-width TABLE with no resolver** | **A→B** | UNDER-states | **P1** | 🔴 open — **the single largest unlock outstanding** | MC is **16.86 %** of pilot buildable land and refuses structurally today. **Evidence:** Art. 13.5.3.1 publishes height as a per-street-width table, transcribed exact band-for-band for all four subzones. ⭐ **RE-SCOPED and made materially CHEAPER (D3, 2026-08-01):** the pack asserted MC states no *profundidad edificable* and used that to justify the refusal — **Art. 13.5.2.4 in fact makes depth *libre*, bounded by the ocupación the pack already holds** (0.70/0.90). So **no MC block-fondo geometry source is required**; MC needs the **street-width resolver ALONE** (the Córdoba analogue of `bcnAlcadaNucliAntic.ts`). **Closes when:** a Córdoba street-width source is bound to the parcel frontage and the table is evaluated. ⚠ Barcelona's street-width machinery is `es-08019-barcelona` data and must not be borrowed. |
| **9** | **SIU clasificación is mounted server-side and called by nothing** | **B** | n/a *(no answer at all today)* | P2 | 🔴 open — the authored-but-unwired trap, confirmed by grep | The one national source that covers **all** of Córdoba (measured above: 6 clases, in force, 1 254.3 km²) reaches no user. **Closes when:** a client caller renders the clase de suelo on the refusal card outside the pilot. It never becomes an envelope — clasificación is land CLASS, not buildability — but it converts a bare "no" into "no envelope, and here is what the plan does say about your land". ⚠ Until it lands, no refusal copy may promise it (blocker 5). |
| **10** | **Conjunto Histórico *Tomo VI* (Campo de la Verdad envelope) is not held** | **A** | **EXACT** *(refusal is the answer)* | P3 | ✅ **CLOSED AS A PERMANENT CITED REFUSAL — negative evidence** | ✔ **Evidence:** Art. 13.4.1 states the envelope is *"en la Memoria y Normativa correspondiente al Conjunto Histórico (Tomo VI)"*. That volume is **not served** by `visor.pgou.coacordoba.org/doc/ordenanzas/` (all 15 links enumerated; Tomo VI is not among them), is not in the COACo GeoServer layer set, and is not a SITUA document-registry entry for INE 14021. **Decision:** `derived-plan`, `legallyGrounded: true`, citing the delegation — **the correct answer, not a gap**. **Alternatives rejected:** borrowing CTP-1's altura/ocupación, which the findings name as *confident-wrong* — Campo de la Verdad borrows CTP's **parcelación** only, never its buildability. **Reopens only on** the Ayuntamiento publishing Tomo VI. **16 polygons, 1.31 % of ordenanzas land.** |
| **11** | **Unifamiliar Aislada — the `O_UAS1` link is dead** | **A** | **EXACT** | P3 | ✅ **CLOSED AS A COVERAGE REFUSAL — negative evidence, and it is deliberately NOT filed as a legal "no"** | ✔ **Evidence:** `O_UAS1.pdf` returns a **69-byte "Server under construction" HTML** (md5 `75a5f31…`, confirmed on re-fetch 2026-08-01, HTTP 200 after 301→HTTPS), and **no held document contains the UAS chapter** — unlike `O_UAD1`, whose dead link was *recovered* because `O_UAD3` carries all three UAD subzones. **Decision:** `no-rule-pack` (a coverage statement), explicitly **not** `derived-plan`. Filing it as a legal classification would assert the ordinance refuses an envelope on land that is in fact buildable — the false-negative-about-someone's-land error, which C58 ranks worst. **1 polygon, 0.17 %.** **Reopens** the day the publisher fixes the link. |
| **12** | **Uso Comercial · Elemento protegido — no envelope of their own** | **A** | **EXACT** | P3 | ✅ **CLOSED — legally-grounded refusals** | ✔ **Uso Comercial** (Art. 13.12.2, 8 polygons, 2.28 %) is a **use overlay**: commercial buildings in MC/CTP/UAD/UAS/IND follow the underlying zone, in PAS/OA a specific set, standalone parcels defer to a Plan Parcial. There is **no single commercial envelope**, and the *suelo urbanizable* set that does exist is **wrong to apply to urban parcels**. **Elemento protegido** (Art. 13.3, 7 polygons, 0.67 %) is a **preservation regime**: *"La sustitución no supondrá aumento de la superficie total ni del volumen construidos"* — the envelope **is** the existing building. Both `legallyGrounded: true`. |
| **13** | **Uso Industrial cannot be bound to a subzone** | **A** | **EXACT** | P3 | ✅ **CLOSED — coverage refusal; the sufficiency trap is real here** | ✔ **1 polygon, 0.12 %.** The calificación says `Uso Industrial` and never which of IND-1/2/3/G/C/SC-C, whose parcela mínima spans **200–2 000 m²** and edificabilidad **0,35–1,5**. Worse, IND-1/2/3 ocupación is stated as *"la resultante de la aplicación de los parámetros de edificación del presente artículo"* — **an algorithm, not a number**; a pack MUST leave it null. Values recorded in `OCR-EXTRACTION-RESULTS.md §2.6`, **deliberately not packed**. |
| **14** | **≈ 50 % of pilot buildable land is DELEGATED to a later instrument** | **A** | **EXACT** *(refusal is the correct answer)* | P2 | 🟡 **MEASURED and CLASSIFIED — but the branch that emits it is not called (see 3)** | ✔ **Evidence:** 169 of 453 `ordenanzas` polygons (**699 772 m² = 42.98 %** of direct-ordinance land) fall inside a delegating ámbito — Plan Parcial 16.76 pp · Plan Especial 12.80 pp (incl. PEPCH) · PERI 4.90 pp · Estudio de Detalle 3.34 pp — plus **222 479 m² (12.02 pp)** of `usos_globales` lucrative land, **100 %** of which carries an `actuacion`. Independently re-queried 2026-08-01: `coaco:actuaciones` = **40 features, 9 distinct `instrumento` values**; `usos_globales` = 108 features, Σ 678 436 m², **102 of 108 carrying an `actuacion`**. ⚠⚠ **This is Córdoba's Murcia moment**: the delegation lives in a **separate layer**, so the ordenanza-family census that produced the withdrawn "89 %" was **structurally blind to it** — exactly the structure that forced the 41.4 pp Murcia retraction. **A cited refusal on delegated land is the correct answer, not a coverage gap.** ⚠ Two `actuaciones` rows carry a **blank `instrumento`**, and `Estudio de Detalle` appears in **two casings** — any refusal that NAMES the instrument must handle both. |
| **15** | **CTP-1 and MC-1/2/4 edificabilidad is DERIVED BY ALGORITHM** | **A** | **EXACT** | P3 | ✅ **CLOSED — permanent `null`, and signing cannot change it** | ✔ Arts. 13.8.2.3 / 13.5.2.2: *"resultante de la aplicación de las Normas de Composición"*. The pipeline's algorithm-detector fires and emits `null`, **never a number** — the Barcelona Art. 242.2 lesson (ADR-0271). ⚠ CTP-1 still renders a **partial** envelope (height 7 m + coverage + the real 16 m depth band from Art. 13.8.2.4), so this null costs coverage, not correctness. |
| **16** | **The CTP-1 ocupación step-function was mis-documented (D2)** | B | UNDER-states *(as shipped)* | P3 | ✅ **CORRECTED in doc + pack comment, 2026-08-01; the hook is still unwritten** | ✔ Source, verified at 400 dpi (Art. 13.8.2.5): *«Parcelas de hasta 100 m2, el 100%. Parcela de más de 100 m2 y menos de 125 m2, **100 m2**. Parcelas de más de 125 m2, el 80%.»* The middle band is an **absolute 100 m² cap, NOT 100 %**. **The shipped `maxCoverage: 0.8` is the >125 m² value and is correct and conservative**, so nothing user-visible is wrong — but anyone implementing the step-function hook from the old comment would **over-state a 124 m² parcel by ~24 %**. The hook (from `sup_pc_m2`, which the resolver already fetches) remains unwritten. |
| **17** | **The pilot's own districts are not tiled by the calificación layer** | **A** | **EXACT** *(refusal)* | P3 | ✅ **CLOSED as an honest `no-plan-at-point`; the legal reading is refused** | ✔ **Newly measured 2026-08-01:** `coaco:distritos` Sur (2 488 983 m²) + Noroeste (2 472 362 m²) = **4 961 344 m²**, while `coaco:ordenanzas` covers **1 628 616 m² (32.8 %)** and `usos_globales` a further 678 436 m² — leaving **≈ 53 %** of the pilot districts attributed to **no polygon at all**. Most is public *viario*. **PRYZM cannot prove that**, so `cordobaNoCalificacionAtPointRefusal` states the fact it has (the lookup answered; no ordenanza is mapped here) and **refuses the legal reading** — asserting "this is a street, no private envelope" without evidence would be the L-526 error. |
| **18** | **The answerability classifier over-claims `full-envelope`** | C | **OVER-states** | P2 | 🟡 latent, fix landed in the classifier | `registeredPackZoneCodes('es-14021-cordoba')` returns 13, so `classifyAnswerability(…, 'PAS-1')` claimed **`full-envelope`** — a claim **no** Córdoba parcel can honour, and demonstrably false for the **7 of 13** subzones binding zero land. §ENVELOPE-PUBLICATION-AUTHORISATION now reads `CORDOBA_ENVELOPE_VERIFIED` and classifies `pack-unverified` (L-665). ⚠ **Deliberately fixed in the classifier, not by de-registering the pack:** registration wires routing, it does not authorise output, and de-registering would also put out the C60 coverage globe — Córdoba *does* answer, with an honest cited refusal. **Same statement applies to Murcia.** |
| **19** | **Single-source: no second publisher states these parameters** | **A** | n/a | P3 | ✅ **CLOSED AS PERMANENT — negative evidence** | ✔ Dual-source corroboration of the **numbers** was not run **and cannot be**, from what Córdoba publishes: the PGOU-2001 ordinance text exists in exactly one published form (the COACo-served scans of the Texto Refundido Oct. 2002). The 2026-08-01 pass was a **second independent METHOD against the same document**, which is why the tier can rise to `estimated-ruleset` and **no further**. `structured` requires the publisher to serve the numbers as data; COACo does not. ⚠ **`authoritative` is UNREACHABLE and must not be proposed.** |
| **20** | **PARCEL axis unmeasured; "the Spanish block dissolve is 0/3 in Córdoba"** | B | unknown | **P1** | ✅ **CLOSED 2026-08-01 — BOTH HALVES MEASURED, AND THE PREMISE WAS REFUTED** | ✔ **PARCEL is measured: 95 %** (`samples/cordoba.parcel-sample.json` — 120/120 probed, 109 high · 11 medium · 0 low · 0 none · **0 transport failures**, drawn area-weighted over an independent OSM-footprint proxy). ⚠⚠ **AND THE DISSOLVE CEILING IS GONE, BECAUSE `0/3` WAS A THREE-BLOCK SAMPLE.** This row asserted the dissolve "can make the ≈ 31 % ceiling unrealisable", and `streetWidth.ts` carried the same figure in shipped code. **Re-measured at scale in BOTH lineages** (`tools/cordoba-dissolve-probe/`, reproducible): **CATASTRO INSPIRE — the lineage production actually fetches — 20/26 = 76.9 %**, 0 transport failures, all 6 failures `open-or-disjoint`; **COACo `vcatastro_urbanismo` — 354/400 = 88.5 %**, and per alignment family **Manzana Cerrada 88.5 %** · **Colonia Tradicional Popular 83.7 %** · Ordenación Abierta 96.9 % · Unifamiliar Adosada 81.8 %. **Two independent digitisation lineages agree Córdoba dissolves for ~3 blocks in 4.** The dissolve costs roughly one block in four to an honest refusal; **it does not cap the city.** ⚠ **Lesson, and it is the same one as row 4 and the "7 of 13":** `n=3` is not a rate. This register built a P1 ceiling on three blocks, and the shipped comment that supplied it has been corrected in place. |
| **22** | ⭐ **69 of 77 GMU calificación raster sheets are un-vectorised — THE municipality-wide lever** | **A→B** | n/a *(no answer at all today)* | **P1** | 🔴 **OPEN — the largest single item in this register, and it is EFFORT, not law** | **Evidence, re-verified live 2026-08-01:** the GMU publishes *Calificación, Usos y Sistemas* municipality-wide as **77 georeferenceable raster JPGs** (49 urban `CUS01W…CUS49W` + 28 peripheral). `https://visor.pgou.coacordoba.org/doc/planos/cus/CUS41W.jpg` → **200 `image/jpeg`, 461 957 B**; the GMU index is captured in the Wayback Machine (`20250712`) listing all 49 + 28. `coaco:hojas_cus` indexes the **8** sheets COACo vectorised — which **is** the 2-district pilot. **Finding:** the coverage gap is a **raster→vector gap, not a data-absence gap**; the ordinance TEXT is already transcribed and is per-ordenanza, not per-district, so it needs no re-reading for any new district. **Decision:** georeference + vectorise the remaining 69 sheets into calificación polygons (the treatment COACo gave 8), then bind them through the same resolver. **Alternatives rejected:** (a) *wait for COACo to extend the pilot* — an external dependency with no date, and the register may not rest on one when in-house evidence exists; (b) *borrow a pilot ordenanza* — the fabrication this whole file exists to prevent. **Sizing:** the dominant cost; 69 sheets at production quality is weeks, not days, and needs GMU-direct raster access (blocked from the recon's vantage — re-test). **This is what moves the city ceiling from ≈ 1.7 % toward the pilot's ≈ 31 %.** ⬆⬆ **RE-SCOPED 2026-08-02 — THE PREMISE OF THIS ROW IS REFUTED AND IT IS NO LONGER AN ENGINEERING TASK.** A six-probe exhaustive search ([`findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`](./findings/MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md)) established two things. **(i) No machine-readable calificación source exists** beyond the COACo pilot: the `GMU_Services (FeatureServer)` lead is an **acronym collision** — it is George Mason University, Fairfax VA, **6 148 km away** (extent reprojected from EPSG:3857 = 38.8381 N, −77.3323 W); every Spanish-language AGOL query returns `total: 0`; the COACo viewer's 4.67 MB bundle contains **zero** ArcGIS references; and the Ayuntamiento's own (newly-found) GeoServer serves **105 WFS + 119 WMS layers with ZERO zoning**. **(ii) AND THE RASTERS THIS ROW WOULD CONSUME ARE NOT PUBLISHED.** This row's "77 sheets, vectorise the remaining 69" was generalised **from one sheet returning 200**. All 49 urban sheets were fetched: **8 LIVE** (CUS18W · CUS19W · CUS25W · CUS26W · CUS34W · CUS41W · CUS45W · CUS46W, 365–500 KB each) and **41 return the 69-byte "Server under construction" page**; 112 peripheral-sheet candidates across 4 naming conventions → **0 live**. `coaco:hojas_cus` lists 6 distinct vectorised sheets, so **the live set is the vectorised set plus exactly two.** ⚠ **The marginal raster gain available today is 2 sheets, not 69.** No world file or `.prj` is served for any sheet and the JPEGs carry no producer metadata, so *"georeferenceable"* was an assumption — and under the founder's signed doctrine a non-georeferenced raster is **not authoritative published geometry** and could not authorise a dispatched envelope even if traced. **⇒ THIS ROW IS NOW A DATA REQUEST TO GMU, NOT A VECTORISATION PROJECT.** The schema-leak analysis says what to ask for: the pilot carries **no `OBJECTID`/`GlobalID`/`Shape_Area`**, PostGIS `table.pk` feature ids, only 4 attributes, and a **heterogeneous 1–8 decimal** coordinate precision — i.e. it was **hand-traced into PostGIS**, not exported from a municipal GIS, so there is no internal schema to request a dump of. Ask instead for: the 41 missing sheets, world files for the 8 live ones, the definition of `et`, and the instrument date. **Do NOT re-run this search — it is recorded probe-by-probe.** |
| **25** | ⭐ **A Córdoba STREET-WIDTH source exists and nobody had found it** | **B** | UNDER-states | **P1** | 🔵 **NEW 2026-08-02 — the cheapest remaining ENVELOPE point** | Found while exhausting the source search: the **Ayuntamiento de Córdoba runs its own GeoServer** at `ide.cordoba.es/geoserver` (105 WFS layers, previously undocumented in this dossier — the COACo GeoServer is a *different* publisher). It carries **no zoning**, but it carries `idecordoba:sup_viales` (street surfaces), `red_viaria`, `tramo_vial`, `ejes_red_viaria` and `elementos_red_viaria`. **Blocker 8 — the Manzana Cerrada per-street-width height table, worth 0.88 pp of the ENVELOPE axis — has been waiting on exactly this input**, and its register entry says a width source "must be CONSTRUCTED" because none was known. It is municipal, authoritative and machine-readable. Also present: `idecordoba:manzana` (published city blocks — a possible bypass of the cadastral dissolve rather than reconstructing rings from parcels) and `idecordoba:parcelas_catastrales` (a third parcel lineage). **Closes when:** the width layer is probed for an attribute or geometry that yields a per-frontage width, and bound behind blocker 8's resolver. ⚠ **Deliberately NOT acted on in the source-search turn** — ENVELOPE stays a measured 0.0 % and the sequencing rule (4 and 3 before 2) is unchanged. |
| **21** | **HEIGHTS axis unmeasured** | B | unknown | P2 | 🟡 **BASELINE MEASURED 2026-08-01 (pre-bake); the bake itself is still open** | ✔ half-closed. `probe.mjs --at 37.8882,-4.7794 --half-deg 0.02` against the **SHIPPED R2 tiles** (`buildings.pmtiles?v=L659a`): **11 812 footprints · measured-lidar 0 · tagged 32 · derived-levels 5 417 · assumed 6 363**, verdict `unmeasured`. Tile read CLEAN (100 covering, 97 read, 3 absent, **0 failed**) so this is a data verdict, not a network claim (L-422/457/467/469). **53.9 % of context buildings render the fabricated 9 m default.** C63 Axis 6 v1 counts `tagged` only ⇒ **0.271 %**. ⚠⚠ **ALWAYS QUOTE THE HALF-DEGREE.** The close-out brief's *"0 of 5 409 measured, 45 % fabricated"* is **also correct** — it is the same shipped tiles at the DEFAULT `--half-deg 0.008` (tagged 17 · derived 2 944 · assumed 2 448 = 45.3 %), recorded in `heightSources.mjs`. The wider 0.02 ring reaches periphery where fewer buildings carry `building:levels`, so the assumed share rises. *(This register's first draft asserted the brief had conflated 5 409 with the derived-levels bucket. It had not — that was a guess dressed as a finding, and it is retracted here rather than quietly deleted.)* ⚠ **CHECKED, not assumed: Córdoba is NOT Murcia's §MURCIA-HEIGHT-STAMP-GAP** — it is declared in `REGION_SOURCE` and present in `MDS_CITY_BBOXES`, i.e. in both the priority and retain sets. ⭐ **But a REAL defect was found here and fixed by the orchestrator in `e8254bfa`** (this agent deliberately did not edit `heightSources.mjs`, a national bake being in flight): the MDS stamp bbox ended at **n=37.93** while the canonical terrain region reaches **37.94**, so a **~1.1 km strip across the north of Córdoba could never have been stamped**, however many bakes ran. Now pinned by `tools/context-bake/__tests__/mdsBboxCoversTerrainRegion.spec.ts`. **Closes when:** the national bake lands and the histogram is re-probed. |
| **23** | ⭐ **A Córdoba-specific height source nobody has named** | **A→B** | n/a | P3 | 🔵 **NEW — recorded, deliberately NOT counted** | Found while probing the publisher: `coaco:vhex25_max_plantas` serves **9 202** hex features, and `coaco:vcatastro_urbanismo` carries per-parcel `max_plantas` / `max_plantasbr` / `sup_brasante_m2` populated on **5 721 of 5 725** pilot parcels. ⚠ **It cannot raise the HEIGHTS axis and must not be sold as if it could**: it is a **Catastro-derived STOREY COUNT**, so it enters the provenance ladder as `derived-levels`, which earns **no** credit under C63 Axis 6 v1 — and it covers the **pilot only**. Its real value is elsewhere: an independent cross-check on context massing inside the pilot, and a candidate input to the §CONTEXT height ladder if the §8 founder decision ever grants `derived-levels` partial credit. |
| **24** | **C63 axes were UNMEASURED — the board could not see Córdoba at all** | B | n/a | **P1** | ✅ **CLOSED — `tools/city-completion/measurements/cordoba.measurements.json`, 2026-08-01** | ✔ All four expensive axes now carry a committed, reviewable, per-figure-cited measurement record (the Murcia/València pattern). PARCEL **95 %** (120/120 probed, 109 high · 11 medium · 0 low · 0 none · **0 failures**) · LEGISLATION **40 %** (4/10 families) · ENVELOPE **0.0 %** · HEIGHTS **0.271 %**. ⚠ **The city's headline went DOWN, 71.5 % → 45.8 %, and that is the point:** the 71.5 % was renormalised over **30 %** of the ratified weight — an average of the three cheap axes wearing the whole city's name. It is now over **100 %**. **⚠ ENVELOPE 0.0 % IS A MEASURED ZERO, NOT A MISSING MEASUREMENT.** PRYZM publishes no envelope anywhere in Córdoba: the gate is shut *and* the resolver is never called. Until 2026-08-01 this axis would have scored **above** zero for the worst possible reason — a fabricated triple on 95.1 % of SUELO URBANO. |

---

## What CLOSED would mean for Córdoba, stated plainly

| State a click can reach | Land (of 33.342 km² SUELO URBANO) | Terminal today? |
|---|---:|---|
| A computed envelope (`pipeline-extracted-unverified` → `estimated-ruleset`) | ≈ 0.9 % | after blockers **2 + 3** |
| A cited **delegation** to a Plan Parcial / PERI / ED / Plan Especial | ≈ 2.1 % *(≈ 43 % of pilot ordinance land)* | after blocker **3** |
| A cited refusal — legal family, unbindable key, or no polygon | ≈ 1.9 % | ✅ **yes** |
| A cited refusal — **no calificación published for this land** | **≈ 95.1 %** | ✅ **yes, as of this pass (blocker 1)** |

**Córdoba is ≈ 95 % CLOSED by land today and can reach 100 % with blockers 2, 3 and 4.** It will
never be ≈ 3 % *answered with a number*, and the register should never be read as though it could be.

## Effort, honestly

| Category | Remaining | Difficulty |
|---|---|---|
| **The signature** (blocker 2) — a Spanish-planning-literate read of `OCR-EXTRACTION-RESULTS.md §2` against the source crops | ~hours, one-time | Low, but it is a **legal act** and cannot be delegated to a machine |
| Engineering — resolver call site + delegation branch (3), UAD depth rule (4) | ~2–3 eng-days | Low–Medium |
| MC street-width resolver (8) — the largest single unlock, **16.86 %** of pilot buildable land | ~1 week + a street-width data source | Medium |
| SIU clasificación client wiring (9) | ~1 eng-day | Low |
| Parcel/dissolve investigation (20) | ~2–4 days | Medium — and it may cap everything above it |
| ⭐ **GMU raster→vector acquisition (22)** — 69 CUS sheets, the municipality-wide lever | **~weeks**, one-time | High — georeferencing + vectorisation at production quality; needs GMU-direct raster access |
| Data acquisition — Tomo VI, the UAS chapter, a COACo subzone attribute | **not purchasable, not schedulable** | ⛔ Publisher-gated |

**The structurally impossible categories** are the ones where the *publisher*, not the law, is the
limit — the bare-`O_MC` subzone key, Tomo VI and the dead `O_UAS1` link — plus the ≈ 50 % the plan
*legally delegates*. ⚠ **The 2-district boundary is NOT in that list**: it is blocker 22, an in-house
engineering task on already-published public data. In every genuinely impossible case the correct
output is a **cited refusal naming whose gap it is** — a complete and legally correct result, just
not a number.

## Recommended order

**2 → 3 → 4 → 20 → 8 → 9 → 22 → 21**

**2 first, and only because 1 is already closed.** Before this pass the right first move was not the
signature at all — it was **stopping the fabrication on 95 % of the city**, which no signature would
have touched. With that closed, the signature is the only thing standing between Córdoba and its
first honest number, and **3 must ship in the same change** (a signature alone renders nothing: the
resolver is authored and never called).

**4 before any UAD-3 land can bind** — it is the one open row whose sign is **OVER-states**.

> ### ⛔ DO NOT FLIP THE GATE TO RAISE THE ENVELOPE NUMBER — the measurement says it would ship a defect
>
> The pack self-labels `pipeline-extracted-unverified`, a tier that exists in the C63 ladder (weight
> 0.1) precisely to let machine-extracted work ship with a loud badge. So "flip `CORDOBA_ENVELOPE_
> VERIFIED` and take the 0.1" looks like a legitimate way to move the axis off 0.0 %. **It is not, on
> three independent grounds, and the third is new this pass:**
>
> 1. It is a **legal act** (L-449), not a code change. No agent may perform it; Madrid's `ea084461`
>    guard now dereferences every gate against its `VERIFICATION.md` and fails the build otherwise.
> 2. A signature alone **renders nothing** — the resolver is authored and never called (blocker 3).
> 3. ⭐ **It would put blocker 4 LIVE on real land.** The register believed D1 was harmless because
>    "UAD-3 binds 0.00 %". Measured: **UAD-3 binds 31 505.01 m²**, and its only other shield —
>    every one of those polygons sitting inside a delegating ámbito — is **inert until blocker 3
>    calls `derivedPlanningOverride`**. Flipping the gate today therefore ships the **L-616
>    whole-parcel overstatement** on land a user can click. **4 and 3 must both land before 2.**
>
> **0.0 % is the honest number today, and raising it is a sequencing problem, not a scoring one.**

> ### ⚠ THE TWO LESSONS THIS REGISTER ADDS TO BARCELONA'S
>
> **1 — A CEILING AND A BLOCKER ARE DIFFERENT THINGS.** The dossier's headline for months was
> *"2 of ~10 districts, ~0 %"*, reported as the problem. Under the ratified definition it is a
> **ceiling**, not a blocker — while the item that was actually damaging users, a **fabricated
> envelope on 95.1 % of the city's urban land**, had **no row, no owner and no number**, because it
> lived in the gap between a city's registration and a generic fallback where no city's dossier was
> looking. A register that confuses the two will work on the wrong item for a year.
>
> **4 — `honestyOk: true` DID NOT MEAN THE NUMBERS WERE TRUE, AND CÓRDOBA IS THE PROOF.** Barcelona
> established (2026-08-01) that the launch-blocking `honestyOk` gate checks only that every score
> **has** a derivation string — never that the derivation is **correct**. ⚠ **A fully-cited falsehood
> passes it.** Córdoba is the worked example nobody should need twice: the fabricated triple on 95.1 %
> of SUELO URBANO shipped with a derivation, a confidence label and a provenance tag — it was *cited*,
> it was *badged*, and it was *invented*. The same page's `~19 % / ~89 %` and `7 of 13 bind zero` were
> each cited to an artefact and each wrong. **A citation proves someone wrote a reason down; only a
> re-measurement proves the reason holds.** Every figure in this pass was therefore RE-QUERIED against
> the publisher rather than carried forward — which is how three of this file's own claims were caught.
>
> **3 — THE DEFECT HAS A SPECIES, AND IT IS NOT A CÓRDOBA SPECIES.** ⚠ Strip Córdoba out and the
> mechanism of blocker 1 is: *a lookup misses, returns an empty result, and the empty result is
> published as a measured fact.* `resolveRegisteredJurisdictionAt` found no claimant and returned
> `'none'`, which is **defined** as "genuinely uncovered land" — so an absence of registration was
> published as a positive finding about the land, and then a number was drawn on it. **The very same
> species was found in the scorecard tool on the very same day** (L-676, `531531ef`): `parseBakeRegions`
> looked for `const REGIONS = [`, `bake.mjs` had renamed it `ALL_REGIONS`, the parser matched nothing,
> and the tool printed *"is not a baked context region → 0 layers present (**measured**)"* with
> `validationState: 'auto-validated'` for **every city on the board** — a parse miss wearing the word
> "measured". Two unrelated subsystems, one bug: **a miss and a zero are the same value unless the
> code is written to keep them apart.** The generalisation is now enforced in both places — the
> registry by §EXTENT-CLAIM-TOTALITY (a lattice over every declared extent must never resolve to
> `none`), the tool by throwing when its marker is absent. ⚠ **When you add a lookup, decide what a
> MISS returns before you decide what a HIT returns.**
>
> **2 — AND THEN CHECK WHETHER THE CEILING IS EVEN REAL.** ⚠ **The first draft of this very file got
> that wrong.** It filed the pilot boundary as *"a publication limit no PRYZM engineering extends"*
> and declared ≈ 99 % of the gap to be data-availability. **The recon spike had already disproved it:
> the GMU publishes the calificación city-wide as 77 raster sheets, and one of them was re-fetched
> live during this pass (200, 461 957 B).** The gap is a **raster→vector** gap — the largest *staffable*
> lever in Córdoba, which the draft had just declared impossible. **"Nobody publishes it" and "nobody
> has vectorised it" are as different as failure and empty**, and the same §CONTEXT-DATA-HONESTY
> discipline applies to a register's own prose as to a refusal card's.

---
*Authority: C58 · C60 §3 · C63 · L-422/457/467/469 · L-449 · L-616 · L-656 · L-661 · L-663 · L-665 ·
§CONTEXT-DATA-HONESTY. Signatures: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).
Measurements in this file were re-queried live against COACo GeoServer, the national SIU and
Nominatim on 2026-08-01; reproduction commands in `findings/OCR-EXTRACTION-RESULTS.md §6` and in the
blocker rows themselves. Maintainer: UNASSIGNED. Target: TBD.*
