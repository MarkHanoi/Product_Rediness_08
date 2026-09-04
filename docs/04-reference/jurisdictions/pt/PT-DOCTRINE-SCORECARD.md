# PT — the 12-step doctrine scorecard, and the direct answer

<!-- Lane ENVELOPE-IBERIA round 4, 2026-09-04. The spec is
     `PT-ENVELOPE-DERIVATION-DOCTRINE.md` (founder transmission, same date).
     ⛔ EVERY ROW NAMES THE FILE THAT PROVES IT. A row with no file is NOT a row — it is a claim.
     ⛔ This file is CITED FROM CODE (`derivePtEnvelope.ts` header). Move it and fix the citation. -->

> # ⭐ THE ANSWER, IN ONE LINE
>
> **No — Portugal is not complete. The METHOD is complete and now runs; the FEED is empty.**
>
> All twelve doctrine steps exist as code, compose into one pure function, and are proven by 24
> passing assertions (`packages/site-parcel-data/__tests__/ptDerivePtEnvelope.test.ts`). What is
> missing is not derivation logic. It is **inputs**: **not one Portuguese município has a
> transcribed `PtRegulamentoIndex`**, so step 5 has no entry to join an ETIQUETA to, and steps 6, 7,
> 10 and 11 have nothing to read. Give the pipeline one município's regulamento and one parcel's
> B4/datum reads and it emits a cited envelope or a cited refusal today; give it what is wired now
> and it refuses at step 5 for every parcel in the country.
>
> **Exactly what remains, in dependency order:**
>
> | # | What | Why it blocks | Size |
> |---|---|---|---|
> | **1** | **A `PtRegulamentoIndex` for ONE município** (ETIQUETA → article-pinned Iu/Io/H/Alt/pisos/Re/Af/profundidade) | step 5 refuses `no-rule-pack` for every parcel; steps 6–12 never run | the whole cost — a human reading a regulamento PDF |
> | **2** | **A B4 condicionantes read** with the RAN/REN **exclusion** layers (codes 69, 82) | step 10 refuses `overlay-uncertain`: an unread overlay stack is never assumed clear | wire `srup_ran` / `srup_ren_areal` + the municipal planta; parser seat exists (`parsePtSrupServCitation`) |
> | **3** | **`S` (cota de soleira) from the DGT MDT** at the entrance threshold | any `Alt` cap refuses without it (§2.4: Alt is stricter than H, so substituting H OVERSTATES) | a `cdd.dgterritorio.gov.pt` MDT sampler; none exists |
> | **4** | **The plan's PROCEDURAL start date** per município (SSAIGT/SNIT *dinâmica*) | step 6 refuses; a 2016 plan read with 2019 definitions is the silent error the doctrine forbids | one field per PDM, from a feed PRYZM already names |
> | **5** | **art. 59/60 neighbour measurements** (opposing alignments, façade distances) | step 10 refuses art. 60 rather than assume no neighbour (which would OVERSTATE) | a context-buildings sampler; `extractPtFrenteUrbana` is the nearest existing leg |
> | **6** | **The A1 ladder wired** to the live parcel path | today `/api/parcel/pt` + `dgtParcelProvider` serve geometry; the *precedence ladder* runs nowhere | plumbing, not research |
> | **7** | **An `ADR-0377` `heightDatum` member for `cota de soleira`** | the derived pack stamps `unknown`, so datum-consuming resolvers refuse a correct number | a schema amendment; ⛔ not this lane's to mint |
> | **8** | **Açores / Madeira have NO path at all** | CRUS is Continente-only; EPSG:2188/2189 and Cascais Helmert 38 are unrepresented | out of the doctrine's own scope (§1 names them; §11 serves them nothing) |
>
> ⛔ **And one recurrence worth naming.** Round 2 shipped seven modules reachable from nothing; round
> 3's scorecard caught it, composed them — and shipped **`derivePtEnvelope` the same way**: exported
> from its own module, re-exported by no barrel, imported by nothing, run by no test. Round 4 fixed
> that (barrel + test). **Two rounds, same defect, one level apart** — §committed-is-not-reachable.

---

## §1 — The scorecard: doctrine §12, step by step

`DONE` = the step's rule is implemented AND a test or the pipeline exercises it.
`PARTIAL` = implemented with a NAMED hole.
`NOT` = no code answers this.
⛔ **Every "DONE" below is about the METHOD. None of them is about coverage** — see §3.

| # | Doctrine §12 step | State | The file that proves it |
|---|---|:-:|---|
| **1** | Resolve A1 (client survey → Cadastro Predial → BUPi → caderneta). No geometry ⇒ refuse. | **DONE** | `countryAdapters/pt/ptParcelSource.ts` — `resolvePtParcelGeometrySource`, 4 rungs, `area-only` still blocks; `ptDerivePtEnvelope.test.ts` "step 1" |
| **2** | Classify *solo urbano* / *solo rústico* (CRUS + municipal planta). | **PARTIAL** | `ptCrusZone.ts` — `classifyPtCrusClasse` + the LIVE `resolvePtCrusZoneAtPoint` (the one step with a national feed). ⛔ HOLE: the **municipal planta de ordenamento** half is unwired, so the NATIVE subcategory comes from DGT's harmonisation, which §11 B2 says not to cite for the article |
| **2b** | §8 topology invariant — a double classification is a municipal DATA DEFECT, reported never resolved. | **DONE** (new, round 4) | `ptPdmObjectGates.ts` — `ptDoubleClassificationDefect`; wired at step 2; test "step 2 — §8 topology". ⚠ `resolvePtCrusZoneAtPoint` still collapses double containment to `absent`, so on THAT path the seat is fed one claim by construction |
| **3** | *Solo rústico* + forest/within 50 m + outside aglomerado ⇒ DL 82/2021 art. 61; negative-buffer 50 m; empty ⇒ refuse. | **DONE** | `ptRusticoFuelStrip.ts`; `__tests__/ptRusticoFuelStrip.test.ts`; test "step 3" (a `null` fact refuses, never grants) |
| **4** | Resolve B5 — PU/PP override, *loteamento*, UOPG *supletivo*. | **DONE** (was PARTIAL until round 4) | `ptPdmObjectGates.ts` — `ptPlanInterventionOverride` (22/132) + **new** `ptDerivedPlanFlags` / `ptAugiRefusal` for §7's other rows: **20** supletivo · **135 AUGI ⇒ refuse** (its own C1 family) · **136 ARU ⇒ assumption stating it may UNDERSTATE** · **138 UE ⇒ flagged, no consequence invented**. Four tests |
| **5** | B2/B3 → **ETIQUETA** → regulamento article (ETIQUETA BEFORE text similarity). | **DONE** (method) / **NOT** (feed) | `ptEtiquetaJoin.ts` — exact key join, whole-designation text fallback only, two hits refused. ⛔ **NO município has a `PtRegulamentoIndex`. This is blocker #1** |
| **6** | `concept_dictionary_version` from the **PROCEDURAL START DATE** (DR 5/2019 after 2019-09-27, else DR 9/2009). | **DONE** | `ptConceptLexicon.ts` — `resolveConceptDictionaryVersion`; refuses on absence (never defaults); tests "step 6" + "a 2016 procedure is read against DR 9/2009" |
| **7** | Extract C1–C5/D1 and **type-check every token**; reject rather than guess. | **PARTIAL** | `ptConceptLexicon.ts` — `typeCheckPtToken` (unit-mismatch never converted, percent >100 rejected); `derivePtEnvelope.ts` `checked()` also refuses a number with **no article**. ⛔ HOLE, self-declared: **`pisos` and `profundidade` carry no DR 5/2019 lexicon key**, so they are range-checked but not token-checked |
| **8** | C1 **ALWAYS** `inferred`/`assumed`; no stated basis ⇒ **refuse**. | **DONE** | `ptImplantacao.ts` — `inferPtC1Family` over a 4-phrase measured vocabulary, each with its evidence; two families ⇒ refuse; zero ⇒ refuse. Test "step 8" |
| **9** | Build the *polígono de implantação* from Re/Af when not drawn (§2.5 — the nationally sanctioned method). | **DONE** | `ptImplantacao.ts` — `buildPtPoligonoImplantacao`; a missing Re/Af is **never 0**; drawn polygon checked against `Ai` |
| **10** | The constraint stack: condicionantes (**VETOES, not trims**) · art. 59 plane · art. 60 · art. 65 · **`Alt` as absolute cap**. | **DONE** | `ptCondicionantes.ts` (RAN/REN **exclusion** 69/82 mandatory; APA licence gate; partial veto refuses for want of geometry) · `ptRgeuArt59.ts` (planes + exact solve, 1.50 m downhill tolerance, 15 m corner run) · `ptRgeuArt60.ts` (10 m) · `ptHeightQuantities.ts` (`ptTopCapAboveSoleira` — **Alt never collapsed into H**; `ptJointHeightStoreys` — art. 65 makes metres and storeys jointly binding). Eight tests |
| **10b** | §4 multi-frontage — *"your datum field must hold MORE THAN ONE VALUE"*. | **DONE** (was written-but-uncalled until round 4) | `ptHeightQuantities.ts` — `ptFacadeDatums`; **now called** by the pipeline and surfaced as `volume.facadeDatums`; test "§4" |
| **11** | Compute volume, then **trim to `Iu`** by the national `Ac` counting rule. | **DONE** | `ptAcCounting.ts` — `ptCountAc` (exterior perimeter, sótão/cave excluded, above/below S kept apart) + `ptTrimToIu`; no `Iu` ⇒ refuse rather than emit an untrimmed volume (L-616). Test "step 11" |
| **12** | Emit `Ac` **disaggregated** in the national categories. | **DONE** | `ptAcCounting.ts` — `ptEmitAcYield` over `PT_AC_USES` (hab/com/serv/est/arr/ext/ind/log) |

### The cross-cutting sections

| § | Rule | State | Proof / hole |
|---|---|:-:|---|
| **§0** | Four non-negotiables: full provenance block · `unresolved` BLOCKS · no silent default · no discretionary outcome as entitlement | **DONE** | `ptProvenance.ts` (`PtProvenancedValue`, `resolved`/`assumed`/`unresolved`); the pipeline's `refuse()` short-circuits — **there is no partial-volume branch**; every fallback is an `assumptions` entry **stating its direction** |
| **§1** | EPSG:3763 · Açores 2188/2189 · Cascais Helmert 38 · never mix | **PARTIAL** | the derived pack and `ZoningRecord` stamp `EPSG:3763`; `dgtParcelProvider.ts` refuses `crs-unhandled` rather than fabricate lat/lon. ⛔ **Açores/Madeira are unreachable — CRUS is Continente-only** |
| **§2** | The national dictionary is MANDATORY; 73 concepts; indices and the five height quantities | **DONE** | `ptConceptLexicon.ts` (`PT_CONCEPTS`, `PT_TERM_ALIASES`, `ptConceptsWithoutC58Seat()` = the amendment surface, derived not hand-listed) |
| **§3** | RGEU 59 / 59§2 / 60 / 65, and art. 59 as a member of the **shared** inclined-plane family | **PARTIAL** | all four implemented. ⛔ HOLE: art. 59 is solved in a **PT-local** solver, not the shared inclined-plane primitive the doctrine says to *"build once"* (`geometry/inclinedTop.ts` is the sibling) |
| **§7** | The five derived-plan flags | **DONE** (round 4) | see step 4 |
| **§8** | Topology invariant | **DONE** (round 4) | see step 2b |
| **§9** | Terminology traps — **`COS` = `Iu`** (not Spain's coverage) · **`cércea` = `H`** (never `Hf`) | **DONE** | `ptConceptLexicon.ts` `PT_TERM_ALIASES` carries both with a `trap` string; `PT_CERCEA_LOCAL_DEFINITION_CONFLICT` records where a município defines it otherwise; the pipeline test asserts a cércea rides in `H_m` and `Hf` stays undefined |
| **§10** | Espaço-canal asymmetry — **no *servidão* along municipal roads** before construction | **NOT** — and harmlessly so | no code infers a non-aedificandi strip from a road anywhere in the PT adapter (grep: 0 hits). The rule is a PROHIBITION and nothing violates it; ⚠ but nothing **asserts** it either, so a future frontage lane could reintroduce it |
| **§11** | Source precedence, and the **⚖ APA licence gate** | **PARTIAL** | A1 ladder ✓ · B4 licence gate ✓ (`PT_APA_LICENCE_GATE`, source RECORDED on the derivation) · B1/F2/F3 `ATO_ESPECIFICO` + SRUP parsers ✓. ⛔ A2/A5/A6 (**DGT LiDAR MDT/MDS**) — **no client exists**; that is why `S` is blocker #3 |
| **§13** | The output block + watch flags | **DONE** | `PtDerivation` carries `parcel · regulatory_identity · volume · yield · constraints_applied · assumptions · refusals · watch_flags`; six watch flags including the BUPi **2026-09-30** free-registration end and the *"`ETIQUETA` join key MAY MOVE"* warning |

---

## §2 — What round 4 changed

| Change | File |
|---|---|
| **Reachability.** `derivePtEnvelope` + the seven doctrine modules exported from the PT barrel — they were importable by nothing | `countryAdapters/pt/index.ts` |
| **Proof.** 24 assertions over the twelve steps: one happy path, the §4 two-datum case, and **17 refusal cases** each naming its step | `__tests__/ptDerivePtEnvelope.test.ts` |
| **§7 codes 135 / 136 / 138.** AUGI refuses (own C1 family); ARU records the UNDERSTATEMENT direction; UE is flagged with no consequence invented | `ptPdmObjectGates.ts`, `derivePtEnvelope.ts` |
| **§8 topology.** A double classification becomes a named DATA-DEFECT refusal instead of a string constant nothing read | `ptPdmObjectGates.ts`, `derivePtEnvelope.ts` |
| **§4 multi-frontage.** `ptFacadeDatums` was written in round 2 and called by nobody; now wired and surfaced as `volume.facadeDatums` | `derivePtEnvelope.ts` |

⚠ **Nothing here registers a jurisdiction, opens a gate, or draws an envelope for a user.**
`ptCountryAdapter.rules` is still `zone-identity-refusal`; `registry.ts` registers no Portuguese
jurisdiction; §PORTO-SIGN-OFF authorises the coverage statement and the moda-da-cércea evaluation,
**not** an envelope-drawing pack. Reachable ≠ wired.

---

## §3 — The honest coverage statement

**What a Portuguese user gets today, at any point in the Continente:** a NAMED zone identity from
CRUS (`classificacao_e_qualificacao`, the PDM's `registo_ou_deposito` and `situacao_pdm`, verbatim)
plus a cited refusal — and, in Porto's FUC zones, the certified coverage statement and the
moda-da-cércea evaluation. **No number, anywhere in Portugal, reaches a determination.**

**What the pipeline adds:** nothing to that user — yet. It adds the ability to turn ONE
município's transcribed regulamento into a cited envelope **without anybody re-deriving the step
order, the blocking rule, or the five height quantities**. The first município is the expensive
one; the second is data.

⛔ **Do not read the "DONE"s in §1 as coverage.** Every one of them is a statement about a function
that runs on injected inputs. The doctrine's own §0 says a cited refusal is a valid, complete
product — Portugal ships that, completely and correctly, and ships nothing else.
