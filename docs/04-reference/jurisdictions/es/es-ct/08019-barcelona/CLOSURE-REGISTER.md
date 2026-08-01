# Barcelona — CLOSURE REGISTER (the complete blocker list)

> **Stamp 2026-08-01.** The single place that answers *"what is left before Barcelona is CLOSED?"*
> Companion to [`RATE.md`](./RATE.md) §CLOSURE (which scores axes) — **this file tracks BLOCKERS.**
> Every row must end in a **yes/no**, never an open question.

---

## The definition of CLOSED — ratified 2026-08-01 (founder)

> **A city is CLOSED when every parcel reaches a TERMINAL, EVIDENCE-BACKED state — either a
> constructed envelope, a cited delegation, or an explicit refusal with a documented reason.**

**It does NOT mean every parcel returns a numeric envelope.** That is unreachable and always was: some
categories are **legally delegated** (Pla Parcial, PERI, Pla Especial, OV) or **discretionary by design**.
Closure is about **exhausting the legal search space and making every outcome explicit** — not forcing a
number where the law provides none.

**Barcelona's arithmetic maximum RATE is ≈78 %** (LEGISLATION caps at ~48 % = 12.0/25; ENVELOPE at
~70 % = 14.0/20). **≈19 of the 22 missing points are LAW, not effort.** A city reporting 100 % would mean
we had stopped being honest about what the ordinance does not say.

> ### ⚠ ENVELOPE CEILING RESTATED — **~70 % → ~68 %**, realistic landing **~65 %** (DEC-1, 2026-08-01)
>
> Closing `22@` as a **permanent** refusal removes its **2.06 %** of private buildable land from the
> land that can ever carry a computed envelope, so the ENVELOPE axis ceiling drops from **~70 %** to
> **~68 %** (≈13.6/20), and the **realistic landing point is ~65 %**.
>
> **That is a MORE HONEST ceiling, not a worse outcome.** The 2.06 % did not become un-answerable —
> it became *correctly* answered, with a cited refusal naming the instrument that governs it. The
> arithmetic maximum RATE moves with it (≈78 % → ≈77 %). Every point removed this way is a point we
> were never entitled to claim.

## The standard every blocker must meet before it closes

**Evidence → Findings → Decision → Alternatives rejected.**

⚠ **No blocker may rest at *"needs founder decision"* until it is PROVEN that no authoritative evidence
exists.** A decision taken before the evidence is exhausted is a guess with a signature on it.
**Negative evidence closes a blocker** — *"no authoritative resolver exists, here is where we looked"* is
a valid, permanent closure.

## Taxonomy (ratified 2026-08-01)

| | Bucket | Unblocked by |
|---|---|---|
| **A** | **Evidence** | primary sources — DOGC, RPUC, municipal GIS |
| **B** | **Engineering** | implementation |
| **C** | **Contract** | architecture change |
| **D** | **Product policy** | a founder decision, *after* A is exhausted |

---

## The register

| # | Blocker | Bucket | Sev | Status | Closes when |
|---|---|:--:|:--:|---|---|
| **1** | **clau 18 certification** | B | P1 | ✅ **SIGNED SIG-3 2026-08-01, flag applied** | ✔ done — ENVELOPE 56.0 → ~60.7 % |
| **2** | **L-660 — Arts. 327/328 superseded** | **D** | **P0** | 🟠 binding DOGC 4893 annex **retrieved**; `applied === false` | founder signs **SIG-2**. Everything else is prepared. |
| **3** | **clau 12 has no geographic predicate** | ~~A~~ → **A (narrowed)** | P2 | ✅ **ENGINEERING HALF CLOSED — §CLAU-12-PREDICATE (L-674), 2026-08-01** | ✔ **There is no geographic predicate to write, and writing one would be the error.** PGM **Art. 315.2** states *which nuclei* the two subzones were drawn for; it **delimits neither** — no boundary, no district, no coordinate — and it **hedges** the 12b half (*"referida **preferentment** a aquell"*). Art. 315.1 scopes only the ZONE. ⇒ **Classification `NOT-THE-RULE-KIND`:** the operative predicate is the ***plànol d'ordenació*, parcel by parcel, which the MUC serves and PRYZM already reads.** A polygon test coded in PRYZM would be a **second, weaker classifier that could only ever ACT where it DISAGREED with the plànol** — i.e. override the operative instrument exactly when doing so was wrong (`mucZoningProxy.js`'s standing warning in a new costume; C58 §1.11). Pinned as `BCN_CLAU_12_GEOGRAPHIC_PREDICATE_EXISTS = false` + `BCN_CLAU_12_PREDICATE_FINDING`. **Engineering mitigation shipped:** the `12` / `12b` **disjoint-code-path invariant** is now asserted, not commented — `12b` is absent from `BCN_NUCLI_ANTIC_ZONE_CODES` and from `CLASSIFICATIONS`, so the feared failure can arise **only from a wrong clau in the SOURCE, never from a routing mistake in PRYZM**. ⚠ **What survives, narrowed and re-bucketed:** *"is the MUC faithful to the plànol in Ciutat Vella?"* — an **evidence question about a data source (A)**, **not** a rule PRYZM failed to encode, and **not reducible by a predicate**. Severity drops P1 → P2: it is a source-fidelity risk, not an un-encoded rule. **ENVELOPE delta +0.00 pp** (the 9.38 % has been packed since 2026-07-22). See `claus/12/CLAU.md`. |
| **4** | **Block dissolve fails on real Eixample parcels** | A+B | **P1** | 🔴 open — contradicts L-535's "2/2, strongest in the Spanish set" | Measure ≥100 random Eixample blocks: success / failure / **failure reason**. Clustered ⇒ engineering bug; random ⇒ robustness. Every 13a/13b/12 answer depends on it, so **56 % may not be realisable**. |
| **5** | **clau 22@ has no *profunditat edificable*** | A→D | P2 | ✅ **CLOSED — permanent cited refusal (DEC-1), 2026-08-01** | ✔ done. The "prove no authoritative geometry exists" precondition was **met**: founder research across BCNROC, the 2024 municipal *Instrucció* on 22@ interpretation and the 2025 MPGM amendment found **no manual, no CAD/GIS geometry, no permit guidance** defining a city-wide depth — because 22@ resolves through **PMUs, *fitxes urbanístiques* and *plànols d'ordenació***. ⇒ **The omission is INTENTIONAL**, so this is not a sourcing gap and never becomes a rule-KIND call. `22@` ships a legally-grounded `derived-plan` refusal naming **Art. 8.1** and pointing at the derived instrument (`barcelona22ArrobaDerivedPlanRefusal`; pack stays OUT of `packsByZone`). ⚠ **Reopens only on** a published city-wide geometric specification for 22@, or an official instruction converting PMU/ordering-plan geometry into a computable depth. See `FOUNDER-DECISIONS-2026-08-01.md` DEC-1 + `BCN_22ARROBA_DEPTH_CLOSURE`. |
| **6** | **clau 12b — neighbour heights** | A→B | P2 | 🔴 open | Establish what *"existing neighbouring buildings"* means **in administrative practice**; whether Barcelona/ICGC publish an authoritative height dataset **used by the municipality for this rule**; whether any appeal or technical instruction interprets it. If the municipality itself derives it from an official dataset ⇒ **engineering**. If not ⇒ governance. |
| **7** | **bare `20a` subzone resolver** | A→B | P3 | ✅ **CLOSED — cited `regime-undetermined` refusal (§BARE-20A-EXHAUSTED, L-673), 2026-08-01** | ✔ done, and **the exhaustive search ended in the PRIMARY TEXT, not in a portal** — which the register itself accepts as a valid permanent closure. **PGM Art. 314.5** (the plan's own *qualificacions zonals* catalogue) and **Art. 338.2** enumerate **ten** subzone qualificacions, **every one suffixed**, and **no unsuffixed `20a`**; **Arts. 340.1 · 342.1/.2/.3/.4/.5/.8 · 343.1/.2** key **every** envelope parameter — edificabilitat, minimum parcel, minimum façade, occupation, height, storeys, all three boundary separations — **to that suffix, and state none of them for the zone.** ⇒ Bare `20a` names a *zona*; the *qualificació* that carries numbers is `20a/N`. **What is missing is a SELECTOR, not a rule**, so no further reading of the plan can close it and no pack may be built on a "representative" subzone (the indices span **×6**, occupation **×4**, front separation **9 m**). ⚠ **The refusal CODE changed and that is the substance:** bare `20a` was getting `no-rule-pack`, whose copy said PRYZM did not hold *"THIS subzone's own sourced numbers: its separations, its minimum parcel size, its maximum occupation and its net buildability index"* — **all four have been in `bcn20aSubzones.ts`, for all ten subzones, since 2026-07-22.** Same false-statement-about-our-own-coverage defect that removed `13b`, `22a` and `22@` from `coverageGapReasonFor`; the branch is **DELETED, not out-ranked**. Now `barcelona20aSubzoneUndeterminedRefusal` — `regime-undetermined`, `legallyGrounded: false`, citing `BCN_20A_BARE_ORDINANCE_REF`, **with a mirrored §DEC-1 leak test: no figure in the prose.** It states the ONE subzone-neutral fact — **Art. 339, the ordination type is *edificació aïllada***, a rule KIND, not a number. ⚠ **The ceiling does NOT drop, unlike `22@`'s:** 22@'s omission is intentional in the law; bare `20a`'s numbers **exist** and a subzone-granular layer would return all **1.55 %** to the computable set. **ENVELOPE delta +0.00 pp** — a correctness move, not a coverage move. See `claus/20a/CLAU.md`. |
| **8** | **Terrain measured at the wrong datum** | B | P1 | 🔴 open | Façade-*rasant* sampling. Today: **ONE centroid sample**; the ordinance measures from the rasant **at the façade** (L-584). A correctness defect, not just a score. |
| **9** | **Supersession audit unexhausted** | A | **P1** | 🔴 open — **1,755 → 147 candidates → 0 opened** | Build a supersession crawler (RPUC → Barcelona → PGM modifications → date > 2007-03-02 → download → OCR → extract amended articles → graph). Classify all 147: *amends 239/320/327/328* / *does not* / *irrelevant*. **~2 days, one-time forever.** Until then every citation carries an asterisk. |
| **10** | **13E / 2002 *Ordenança de l'Eixample* — force UNKNOWN** | A | **P1** | ✅ **CLOSED — IN FORCE (L-667), 2026-08-01** | ✔ done. Resolved to **ACTIVE**, on the **primary source**: the founder read the 2026 repeal ANNEX itself (`GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf`, hdl `11703/144636`). It repeals the **1986** Eixample ordinance and contains **no express reference** to the 2002 *text refós*, to clau `13E`, or to the provisions creating the subzone. ⚠ **This is the annex text, NOT the BCNROC `dc.relation.replaces` catalogue field** — the earlier "SURVIVES" draft rested on metadata and was withdrawn as an overclaim. Engineering: `13E` implemented as a **SUPPLEMENT over `13a`** (DEC-2) — one rule set, one explicit delta, **declared empty**. ⚠ **Reopens only on** an express repeal of the **2002** framework in a source not yet reviewed; the 1986 repeal is *not* that. **Residual (not this blocker):** transcribing the 2002 courtyard/*patis* rules — and it must start from the **CURRENT consolidated text** (Art. 15: 2012 partial nullity + 2018/2019/2023 modifications). See `findings/L-667-13E-IN-FORCE-CLOSED.md` + `BCN_13E_SUPPLEMENT`. |
| **11** | **Tribunes / *cossos sortints*** | ~~A+B P1~~ → **D** | **P3** | ✅ **CLOSED AS AN ENVELOPE BLOCKER — §COSSOS-SORTINTS (L-672), 2026-08-01** | ✔ **A tribuna is NOT part of the envelope. It is a permitted projection BEYOND it — settled by the PGM's own definition, and the ordinance is not ambiguous.** **Art. 223.2.g**: *«Cossos sortints. Són els que **sobresurten de l'alineació de façana**…»* — **defined by exceeding the alignment**, so it cannot lie inside the envelope whose outer surface IS that alignment. **Art. 229.2** names *«els miradors, **tribunes** i similars»* as the enclosed variety. **Art. 230** measures the *vol* **outward from the façade plane**, per ordination type. ⇒ **Classification `NOT-THE-RULE-KIND`:** it is not an envelope parameter of any KIND — it is a **morphology allowance OVER a resolved envelope**, and it can only be evaluated once an envelope exists, the **opposite dependency order** from the one this row assumed. ⚠⚠ **THE DIRECTION, WHICH IS WHY THE P1 WAS MISPLACED — measured per ordination type, not assumed:** *alineacions de vial* (13a/13E/13b/22a/22@, Art. 230.I) ⇒ omission **UNDER-states**, safe; ***edificació aïllada*** (`20a/*`, Art. 230.II — the projection is charged against the **same** occupation % and the **same** boundary separations the envelope is already drawn to) ⇒ omission is **EXACT**; clau `12`/`12b` (Art. 320.5a **prohibits** them, and Art. 230.I **excludes the nucli antic by name**) ⇒ omission is **near-exact**. **In no shipped Barcelona clau does omitting them over-state.** ⇒ The 13a pack header's *"a live risk, not a theoretical one"* rested on an unexamined premise and **is withdrawn**; folding tribunes IN is what would have over-stated. Invariant pinned as `BCN_COSSOS_SORTINTS_NEVER_OVERSTATE`. ⚠ **What genuinely remains is `D` (product policy), not `B`:** enclosed/semi-enclosed projections **count toward *sostre*** (Arts. 224.2 + 229.3.a/.b), so they matter for **saleable-area** reporting — and for `13a`/`13b` even that is moot, because Art. 322 defines edificabilitat as the *envolupant màxima de volum* (ADR-0271) with **no FAR ceiling to consume**. Figures transcribed and cited in `esBarcelonaCossosSortints.ts`, **recorded not applied**. **ENVELOPE delta +0.00 pp.** |
| **12** | **Art. 238 residual clauses** | ~~A+B P1~~ → **A** | P2 | 🟡 **STATUS ESTABLISHED — the core IS fixed and PINNED; four residuals, all A (data). No B work is open. (L-675, 2026-08-01)** | ⚠⚠ **FIRST, WHAT IS *NOT* BROKEN.** The **Art. 238.1.b/c MINIMUM** *amplada puntual* — the statistic itself — **shipped on 2026-07-22 (`0edd302b`) and was test-pinned on 2026-07-31 (`8e590846`)**; both are **ancestors of `main`, verified with `git merge-base --is-ancestor`**, and `governingPunctualWidth` returns `sorted[0]`. **`MASTER-ROI-TRACKER.md` §0.6 "Open risks" 2 still says "uses the MEDIAN … Fix in flight" and is STALE — corrected in this pass.** Do not re-fix it. **Residuals, with their DIRECTION measured rather than assumed:** **12A** *238.1.b tram partition* — we take the minimum per **cadastral edge**, the ordinance per ***tram* between two cross-streets**. ⚠ Partly **already neutral**: `governingStreetWidth` takes the **narrowest** across the edges a parcel fronts, so a multi-edge frontage is already minimised. The residual over-statement is only the part of the tram the parcel does **not** front. **⇒ NEWLY IDENTIFIED and engineering-closable with NO new data:** chain consecutive near-collinear block-ring edges into one *tram* before taking the minimum (Art. 236.3.g defines the *illa* as bounded by contiguous street alignments, so ring corners ≈ cross-streets). **Deliberately NOT shipped in this pass** — it moves published heights across Barcelona *and* Madrid on a shared geometry path, and the change must be measured against live Catastro before it lands, exactly as `8e590846` was. **12B** *238.1.d averaging* — cuts **opposite** to the minimum ⇒ omission **UNDER**-states. **SAFE**, and it needs the opposing block's zoning (*"sòl d'igual zonificació"*). **12C** *238.2 real afectació a l'ús públic* — needs a public-way layer; today any gap between frontages counts as a *vial*. **12D** *official alignments* — Art. 238.1.c measures between *alineacions oficials* (Art. 236.3.a: *«la línia que estableix límits a l'edificació al llarg dels vials»*); we measure between **cadastral boundaries**. Under this ordination type the two normally coincide (Art. 237.1) and the substitution is priced by `BAND_EDGE_GUARD_M`'s 0,5 m allowance and carried as `measured-cadastral`, **never as an *ample oficial***. Barcelona's only alignment layer is a **WMS raster** with no queryable geometry ⇒ digitise once, never again. ⇒ **12B/12C/12D are DATA (A). 12A is the one engineering lever and it is now named and sized.** **ENVELOPE delta +0.00 pp.** |
| **13** | ~~16.7 % band-edge refusals~~ | **D** | P2 | 🟡 **RECLASSIFIED — not a blocker** | This is the honesty contract **working**: the parcel spans a width threshold and we decline to pick. **A UX decision, not a legal one** — show *"Height range 15,70–19,05 m · parcel spans a band threshold"* rather than silence. No fabrication either way. |
| **14** | **C63 tier vocabulary does not exist in code** | **C** | **P0** | 🔴 open — **ELEVATED to PLATFORM-WIDE** | C63 §3 names `certified` / `constructed-amber`; `EnvelopeConfidenceSchema` has `authoritative \| structured \| block-constructed \| estimated-ruleset \| pipeline-extracted-unverified \| not-determined`. **Neither contract name exists.** ⚠ **You cannot prove contract compliance, and you cannot score ENVELOPE** — this is very likely why Axis 4 reads `not-assessed`. **Fix the framework BEFORE claiming completion.** One migration, one enum, every pack/axis/score. |
| **15** | **Hand-drawn boundary → `estimated-default`** | B | **P0** | 🔵 agent in flight | Never render fabricated geometry. No geometry until a boundary source exists; an approximate outline must render in a **visibly different style**, never the same as a real one. `honestyOk`-blocking. |
| **16** | **PARCEL axis unmeasured** | B | P1 | 🔵 agent in flight | `computeParcelConfidence` over a Barcelona bbox. |
| **17** | **HEIGHTS axis unmeasured** | B | P1 | 🟡 bake in flight | Buildings-only re-bake (L-657) **then re-probe**. Shipped tiles report `measuredMarkerCount: 0` — **19.8 % render a fabricated 9 m**. |

---

## The hidden blocker — recorded, not yet numbered

**The ordinance pipeline is `PDF → human → TypeScript`, and it will not scale.** Every clau re-derives
legislation instead of referencing it, so a supersession anywhere means hunting every duplicate.

**The fix is a Barcelona Planning Knowledge Base:** article → paragraph → parameter → classification →
rule KIND → applicability → exceptions → source → DOGC → RPUC → effective date. Rule packs **compile
from** it rather than duplicating it. **This eliminates almost all future drift** and is the structural
answer to blockers 9, 10 and 12 recurring in the next city.

## Effort, honestly

| Category | Remaining | Difficulty |
|---|---|---|
| Legal research (supersession, amendments) — ⚠ **13E is CLOSED (L-667)**; what remains under it is the 2002 *transcription*, listed under morphology rules | ~2–3 weeks | Medium |
| Engineering — ⚠ **shrunk on 2026-08-01.** Art. 238's statistic is **shipped + pinned** and the 20a resolver is **closed**; what is left is **12A** (*tram* chaining, ~1 eng-day + a live-Catastro blast-radius measurement), clau-18 routing and the confidence model | ~1–2 weeks | Medium |
| Data acquisition (Pla Parcial index, official alignment geometry, a 20a subzone layer) | ~3–6 weeks | High |
| Morphology rules (àtics, balconies, patis, roof forms) — ⚠ **tribunes are NOT in this bucket:** §COSSOS-SORTINTS establishes they are a projection BEYOND the envelope, so they are a **saleable-area (`D`)** feature, not an envelope one | ~2–3 weeks | Medium |
| QA against official *fitxes* | ~1–2 weeks | Medium |

**The only structurally impossible category** is where the law itself delegates to a site-specific
instrument. There the correct output is **a machine-readable reference to the governing instrument** —
which is a **complete and legally correct result**, just not a single numeric envelope.

## Recommended order

**14 → 4 → 9 → 2 → 8 → 6 → 3 → 12A**

*(⚠ **5**, **10**, **7** and **11** are dropped from this order: all CLOSED. **3** and **12** are
narrowed and demoted — see below.)*

**14 first** — the scoring framework cannot currently express the completion states we are trying to
declare; fixing coverage before fixing the ruler produces an unprovable claim.

> ### ⚠ THE ORDER CHANGED ON 2026-08-01, AND THE REASON IS WORTH READING
>
> **11 (tribunes) was second, as *"the highest-risk correctness issue"*. It is now closed at P3, and
> it was never a correctness issue at all** — the PGM defines a *cos sortint* as projecting BEYOND
> the alignment, so omitting it under-states rather than over-states, and **folding it in is what
> would have been the defect.** The row's own premise was the risk.
>
> **4 (block dissolve) is now second, and it is the right second**: it is the only remaining item
> that can make an *already-published* number wrong, and **every** 13a/13b/12 answer depends on it.
>
> **The transferable lesson, and it is the third time this register has had to record it:
> establish the SIGN before ranking the severity.** Two of the four items closed in this pass —
> tribunes (11) and the Art. 238 residuals (12) — were filed as over-statement risks and are
> under-statement or exact. One (12A) turned out to be a genuine over-statement nobody had named.
> **Ranking by how alarming a gap sounds inverts the queue.**

---
*Authority: C63 · C58 · L-449 · L-656 · L-660 · L-661 · L-662. Signatures: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).
Maintainer: UNASSIGNED. Target: TBD.*
