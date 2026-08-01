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
| **3** | **clau 12 has no geographic predicate** | A | **P1** | 🔴 open | **Exhaustive** scan of Ciutat Vella. Prove *"every parcel returns 12b"* (invariant, document it) **or** *"≥1 returns bare 12"* (predicate mandatory). **No sampling.** 9.38 % of buildable land. |
| **4** | **Block dissolve fails on real Eixample parcels** | A+B | **P1** | 🔴 open — contradicts L-535's "2/2, strongest in the Spanish set" | Measure ≥100 random Eixample blocks: success / failure / **failure reason**. Clustered ⇒ engineering bug; random ⇒ robustness. Every 13a/13b/12 answer depends on it, so **56 % may not be realisable**. |
| **5** | **clau 22@ has no *profunditat edificable*** | A→D | P2 | ✅ **CLOSED — permanent cited refusal (DEC-1), 2026-08-01** | ✔ done. The "prove no authoritative geometry exists" precondition was **met**: founder research across BCNROC, the 2024 municipal *Instrucció* on 22@ interpretation and the 2025 MPGM amendment found **no manual, no CAD/GIS geometry, no permit guidance** defining a city-wide depth — because 22@ resolves through **PMUs, *fitxes urbanístiques* and *plànols d'ordenació***. ⇒ **The omission is INTENTIONAL**, so this is not a sourcing gap and never becomes a rule-KIND call. `22@` ships a legally-grounded `derived-plan` refusal naming **Art. 8.1** and pointing at the derived instrument (`barcelona22ArrobaDerivedPlanRefusal`; pack stays OUT of `packsByZone`). ⚠ **Reopens only on** a published city-wide geometric specification for 22@, or an official instruction converting PMU/ordering-plan geometry into a computable depth. See `FOUNDER-DECISIONS-2026-08-01.md` DEC-1 + `BCN_22ARROBA_DEPTH_CLOSURE`. |
| **6** | **clau 12b — neighbour heights** | A→B | P2 | 🔴 open | Establish what *"existing neighbouring buildings"* means **in administrative practice**; whether Barcelona/ICGC publish an authoritative height dataset **used by the municipality for this rule**; whether any appeal or technical instruction interprets it. If the municipality itself derives it from an official dataset ⇒ **engineering**. If not ⇒ governance. |
| **7** | **bare `20a` subzone resolver** | A | P3 | 🔴 open | **Exhaustive** search: MUC · RPUC · Ajuntament Open Data · AMB · WFS/WMS · planning shapefiles · zoning exports. **A negative result CLOSES this** — refusing bare `20a` is already judged correct (`NEXT.md` §3.5). |
| **8** | **Terrain measured at the wrong datum** | B | P1 | 🔴 open | Façade-*rasant* sampling. Today: **ONE centroid sample**; the ordinance measures from the rasant **at the façade** (L-584). A correctness defect, not just a score. |
| **9** | **Supersession audit unexhausted** | A | **P1** | 🔴 open — **1,755 → 147 candidates → 0 opened** | Build a supersession crawler (RPUC → Barcelona → PGM modifications → date > 2007-03-02 → download → OCR → extract amended articles → graph). Classify all 147: *amends 239/320/327/328* / *does not* / *irrelevant*. **~2 days, one-time forever.** Until then every citation carries an asterisk. |
| **10** | **13E / 2002 *Ordenança de l'Eixample* — force UNKNOWN** | A | **P1** | ✅ **CLOSED — IN FORCE (L-667), 2026-08-01** | ✔ done. Resolved to **ACTIVE**, on the **primary source**: the founder read the 2026 repeal ANNEX itself (`GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf`, hdl `11703/144636`). It repeals the **1986** Eixample ordinance and contains **no express reference** to the 2002 *text refós*, to clau `13E`, or to the provisions creating the subzone. ⚠ **This is the annex text, NOT the BCNROC `dc.relation.replaces` catalogue field** — the earlier "SURVIVES" draft rested on metadata and was withdrawn as an overclaim. Engineering: `13E` implemented as a **SUPPLEMENT over `13a`** (DEC-2) — one rule set, one explicit delta, **declared empty**. ⚠ **Reopens only on** an express repeal of the **2002** framework in a source not yet reviewed; the 1986 repeal is *not* that. **Residual (not this blocker):** transcribing the 2002 courtyard/*patis* rules — and it must start from the **CURRENT consolidated text** (Art. 15: 2012 partial nullity + 2018/2019/2023 modifications). See `findings/L-667-13E-IN-FORCE-CLOSED.md` + `BCN_13E_SUPPLEMENT`. |
| **11** | **Tribunes / *cossos sortints* — zero corpus coverage** | A+B | **P1** | 🔴 open | Needs a **second rule layer: building MORPHOLOGY, not parcel zoning** — max balcony projection, enclosed/open/rear tribuna, bay window, *àtic*, *sotacoberta*, *patis de llum*, minimum courtyard. (Germany models `Vorbauten`/`Dachgauben`/`Balkone` the same way.) Affects buildable volume, FAR, façade, daylight and **saleable area**. In the Eixample tribunes are **near-universal** — the pack's own header calls it *"a live risk, not a theoretical one."* |
| **12** | **Three Art. 238 clauses unimplemented** | A+B | P1 | 🔴 open | Split into **12A** 238.1.b *tram* partition (we partition per cadastral edge) · **12B** 238.1.d averaging (cuts **opposite** to the minimum — could **UNDER**-state) · **12C** 238.2 *real afectació a l'ús públic* · **12D** **official alignments** — the ordinance measures between *alineacions oficials*; we measure between **cadastral boundaries**. Barcelona's only alignment layer is a **WMS raster** with no queryable geometry ⇒ digitise once, never again. |
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
| Engineering (Art. 238, clau-18 routing, 20a resolver, confidence model) | ~2–4 weeks | Medium–High |
| Data acquisition (Pla Parcial index, official alignment geometry) | ~3–6 weeks | High |
| Morphology rules (tribunes, àtics, balconies, patis, roof forms) | ~2–3 weeks | Medium |
| QA against official *fitxes* | ~1–2 weeks | Medium |

**The only structurally impossible category** is where the law itself delegates to a site-specific
instrument. There the correct output is **a machine-readable reference to the governing instrument** —
which is a **complete and legally correct result**, just not a single numeric envelope.

## Recommended order

**14 → 11 → 3 → 4 → 9 → 2 → 12 → 8 → 6 → 7**

*(⚠ **5** and **10** were dropped from this order on 2026-08-01: both are CLOSED. The order is
otherwise unchanged.)*

**14 first** — the scoring framework cannot currently express the completion states we are trying to
declare; fixing coverage before fixing the ruler produces an unprovable claim. **11 second** — it is the
highest-risk *correctness* issue, affecting the geometry of the one clau that renders numbers today,
rather than merely leaving a gap.

---
*Authority: C63 · C58 · L-449 · L-656 · L-660 · L-661 · L-662. Signatures: [`sources/VERIFICATION.md`](./sources/VERIFICATION.md).
Maintainer: UNASSIGNED. Target: TBD.*
