# Clau sourcing — ROUND 3. One question that is worth more than all the others combined.

**Round 3's primary target is CLAU 18**, not 22a. Measurement moved it to the top: clau 18 is
**22.5% of Barcelona's private buildable land — larger than 22a (17.5%)** — and we do not know
whether it is *encodable at all*. **Until that is settled every projection we publish carries a
±22.5-point uncertainty: our destination is either ~60% or ~83%.** No other open question is worth
that much.

**Already resolved, do not re-ask:**
- **The 22@ carve-out does NOT affect our 22a sample.** All six of our 22a probe coordinates lie
  **7.7–10.6 km** from Poblenou/Sant Martí, in the Zona Franca–Port belt. A ~1.16 km² district has a
  radius under 1 km. Generic Art. 350 is the correct rule for those points. *(Computed, not
  assumed.)*
- Clau 12 **does** apply to Barcelona — to the annexed *nuclis antics* (Gràcia, Sarrià, Sants, Sant
  Andreu, Horta), not to Ciutat Vella, which is 12b.

---

## THE PROMPT (copy everything below the line)

---

You are a **planning-law researcher**. This is a **narrow, high-stakes retrieval task** for the
**Pla General Metropolità (PGM 1976), Normes Urbanístiques**, as applicable in **Barcelona (INE
08019)**. I build a tool that tells architects and developers what may legally be built on a plot,
and every figure is shown with its ordinance citation. **A wrong number is worse than no number.**

### ⓪ THE PRIMARY QUESTION — clau 18, *Ordenació en volumetria específica*

This one question is worth more than everything else on this page.

Clau 18 covers **22.5% of Barcelona's private buildable land.** Its name suggests the building volume
is fixed by a **per-site instrument** — an *estudi de detall*, *pla especial* or *pla de millora
urbana* — rather than by the PGM's own numbers. **If that is right, there is no general rule to
encode, and the honest product behaviour is to refuse with a citation** ("this parcel's envelope is
set by its own plan") rather than to invent a generic envelope.

**I need you to establish which of these three is true, with verbatim text:**

- **(A) The PGM states parameters for clau 18 directly** (height / edificabilitat / occupation /
  setbacks) → then it is encodable and it is the most valuable rule pack on our board.
- **(B) The PGM delegates entirely to a per-site plan, with NO default** → then it is structurally
  unencodable, and that is a *finding*, not a gap.
- **(C) The PGM delegates BUT states a fallback** that applies where no per-site plan exists (many
  ordinances do; wording to look for is along the lines of *"en absència de"* / *"mentre no
  s'aprovi"* / *"supletòriament"*) → **then the fallback is exactly what I must encode**, and this is
  the single most valuable sentence in this entire research programme.

**Specifically:**
1. **Which PGM article defines clau 18?** Quote its operative sentence.
2. Does that article, or any article it points to, give **numbers** — or does it point at a plan?
3. **Is there a default/supletory rule** for a clau-18 parcel with no approved per-site plan? *(This
   is question C and it is the crux.)*
4. Does the PGM say **what an *estudi de detall* may and may not change** (e.g. it may redistribute
   volume but not increase total edificabilitat)? If total buildable volume is capped by the PGM even
   when the detail plan sets the shape, **that cap is encodable** and I want it.

⚠ **"(B) — it delegates, with no default" IS A COMPLETE AND VALUABLE ANSWER.** Do not strain to find
numbers that are not there. Establishing (B) with a verbatim quote closes a ±22.5-point uncertainty
and lets us classify 22.5% of the city correctly. **I would rather have a well-evidenced (B) than a
speculative (A).**

### ① RESIDUAL GAPS — attempt only after ⓪ is answered

**(a) The Art. 350.c width→height table for clau 22a.** Two passes retrieved the sentence *"variaran
amb l'amplada del vial… de conformitat amb el quadre següent"* but never the *quadre*. **That table
IS the height rule for 22a.** Any municipality's transcription helps as base-PGM evidence — **state
its INE code.**

**(b) The Art. 340 subzone→edificabilitat mapping for clau 20a.** The article text was retrieved, but
the extracted value sequence `- 0,25 0,50 0,75 1,00 1,00 1,50 - 1,00 0,75 0,50 0,25` does not map
1:1 onto the ten labelled subzones, and there is a stray `1,50`. **I need the table with its column
alignment intact** — a screenshot-accurate transcription, or a source where the rows are unambiguous.
The previous pass correctly refused to force the mapping. **Do not force it either.**

**(c) The article number for clau 12's height *quadre*.** Confirmed to sit immediately before
**Art. 318** (*Nombre màxim d'habitatges per parcel·la*), and believed to be **Art. 317**, but never
seen labelled. I need it labelled, plus the width→height rows.

### SOURCES, in order of authority
1. **RPUC** — `dtes.gencat.cat/rpucportal/` (consolidated *refós*)
2. **AMB geoportal** — `geoportalplanejament.amb.cat/Informacio/Normativa/<INE>_<clau>.htm`
   ⚠ 404s on direct fetch though indexed; search snippets and caches still yield fragments
3. **BCNROC**, and the **DOGC/BOPB** for *modificacions*
4. The DOGC-sourced consolidated PDF referenced as **exp. 2007/028428** already yielded Art. 337–343
   in full — **it may well contain the clau-18 and clau-12 articles too. Look there first.**
5. Archived **PIU printouts** (a Zona Franca PDF proved these exist in the wild)

### THE RULES — they matter more than completeness
1. **VERBATIM QUOTE OR IT DOESN'T COUNT.** No quote ⇒ `NOT FOUND`, and say what you tried.
2. **"NONE STATED" / "IT DELEGATES" IS A RESULT.** Never fill a gap with a plausible number.
3. **ALWAYS STATE THE INE CODE.** `08019` = Barcelona; anything else is base-PGM evidence at best and
   may be that municipality's own local amendment. (A previous pass's "100% occupation" turned out to
   be **Badia del Vallès's own Art. 23**, not base PGM.)
4. **NEVER INFER ACROSS CLAUS OR MUNICIPALITIES.**
5. **IF A RULE IS AN ALGORITHM, GIVE THE ALGORITHM** — inputs, caps, floors — not a worked example.
   (PGM Art. 242.2 is the model: it does not state a depth, it states how to derive one.)
6. **DO NOT RECONCILE CONFLICTS.** Report both, with citations.
7. **SEPARATE THE CITATION FROM THE INFERENCE.** State the quote, then separately state what you
   conclude from it. ⚠ **A previous pass's single biggest error was a CORRECT verbatim quote with a
   WRONG inference, carried at its highest confidence** — it read *"el nucli antic de Barcelona"* as
   the municipality when the ordinance meant Ciutat Vella, and nearly deleted 9.5% of the city from
   our roadmap. It was only catchable because the quote had been preserved.
8. **REPORT WHAT BLOCKED YOU**, naming the document and the step, so a human knows what to click.

### FINALLY
End with **"What I would NOT rely on"** — everything you produced that you would not stake a
professional opinion on, and why.

**And if you answer only ⓪, that is a successful round.** It is worth more than all of ① combined.

---
