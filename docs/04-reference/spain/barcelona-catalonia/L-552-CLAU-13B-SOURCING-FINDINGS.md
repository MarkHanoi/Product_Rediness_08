# L-552 — clau `13b` (densificació urbana semiintensiva): sourcing findings, and why Phase 1 is HELD

**Date:** 2026-07-21 · **Audit:** L-552 · **Executes:** `BARCELONA-COMPLETE-COVERAGE-PLAN.md` Phase 1
(the sourcing half). **Status: NOT IMPLEMENTED — blocked on primary sourcing, escalated to the
founder.**

> **Verdict up front: `13b` is NOT ready to ship, and the reason is not effort.** The plan judged it
> *"CONFIG ONLY … the cheapest large win in the plan"*, conditional on sourcing two things. The
> sourcing pass reached the governing ARTICLE but not its NUMBERS, and — this is the part that
> matters — **the evidence it did reach makes the plan's own warning look more right, not less.**

---

## 1. What the plan asked to be sourced, and the answer

| # | Question the plan set (§3.2, §4, §6.2, §6.3) | Result |
|---|---|---|
| 1 | Which article is the Subzona II *condicions d'edificació*? | ✅ **ANSWERED — PGM NNUU Art. 328**, *"Condicions d'edificació: subzona II, semiintensiva"*, NNUU Títol IV Cap. IV Secció 3, immediately following Art. 327 (Subzona I / `13a`). |
| 2 | Does Art. 328 key height on the *amplada de vial*, as Art. 327.2 does? | ✅ **YES.** Art. 328 states the *alçada reguladora màxima* and *nombre màxim de plantes* *"are determined based on the width of the street to which the building faces, according to a table"* — the same construction, so the **L-537 *amplada de vial* machinery and the L-525a `resolveAlcadaReguladora` pattern transfer.** |
| 3 | The `13b` height table itself (which width bands → which PB+N)? | ❌ **NOT OBTAINED.** See §2. |
| 4 | Does Art. 242's **30 %** interior-free ratio apply unmodified to Subzona II? | ❌ **NOT ANSWERED — and the evidence now leans AGAINST inheritance.** See §3. |

---

## 2. Why the numbers could not be obtained — the blockers reproduced

Every primary route the plan named was re-tested, and every one failed the same way it did for
Art. 316:

- **AMB NUMAMB Art. 328 endpoint** (`amb.cat/.../article-328---condicions-d-edificacio--subzona-ii--semiintensiva/992183/11656`) — **HTTP 403** to automated fetch, over both `http` and `https`.
- **AMB Geoportal de Planejament *normativa* pages for INE 08019** — `08019_13b.htm` and `08019_13a.htm` both **HTTP 404**. The estate publishes `08015_*` (Badalona) and `08194_*`, i.e. **other municipalities' consolidations, not Barcelona's.**

⚠ **The documents that ARE reachable are exactly the ones R3 warns about.** The freely-fetchable
`13b` texts are **municipal republications** — Santa Coloma de Gramenet
(`gramenet.cat/.../Claus_Urbanistiques/13b.pdf`, a 2025 *refós* of Santa Coloma's own
consolidation), Badalona, Sant Cugat, Castelldefels, Gavà. **13a's first founder-signed source was
a republication of exactly this kind, and it was stale, anachronistic and mis-attributed, and it
passed the L-449 gate anyway** (L-526). Building the `13b` pack from one of these would be that
failure repeated with the same class of document, while the correct source sits behind a 403.

**A concrete instance of the trap, caught in this pass.** A search surfaced, for "13b", the figures
*"PB+2, alçada màxima 10,60 m, profunditat edificable 18,00 m"*. They come from a **municipal
*modificació puntual*, not from Barcelona's PGM consolidation**. The `18,00 m` is the tell: a single
stated depth is flatly incompatible with the Art. 242 CONSTRUCTION that governs the *densificació
urbana* zone — the very finding ADR-0271 exists to encode. Adopting it would have replaced an
algorithm with a constant and produced a confidently wrong depth on every `13b` block in the city.

---

## 3. The finding that changes the plan's risk assessment

The plan said, of the 30 % interior-free ratio: *"Do NOT assume 0.30 by inheritance."* That was
stated as prudence. **It should now be read as a live suspicion**, on two independent signals:

1. **Art. 328 contains its OWN interior-of-block regime.** Its published summary regulates building
   *within* the block interior directly: where the general conditions permit it, such building
   *"cannot exceed a free height of 3.30 m measured from the reference level of the alçada
   reguladora, and must be covered with a terrace."* Art. 327 (Subzona I) carries no such clause.
   **A subzone that legislates its own block-interior regime is not obviously inheriting another
   article's block-interior ratio** — and the ratio is the single parameter the whole
   `block-derived-alignment` construction turns on.

2. **The `13b` height ladder is on a DIFFERENT step from the claimed `13a` one.** The Art. 328
   values that could be corroborated are **PB+2 = 10,60 m** and **PB+3 = 13,65 m** — a step of
   exactly **3,05 m**, the GENERIC PGM floor-to-floor that the L-526 research repeatedly confirmed,
   **not** the 3,35 m claimed for the Barcelona `13a` variant. So the `13b` table is not derivable
   from `13a`'s by any transformation, and Art. 328 must be read for its own band edges. This is
   the plan's own §5.2 rule — *"the pattern is reused verbatim; **the numbers are NOT**"* —
   confirmed empirically rather than assumed.

**Consequence for the plan's cost estimate.** Phase 1 stays *"config only"* in the sense that no new
rule KIND is needed — that judgement survives. But *"the cheapest large win"* was priced on the
assumption that `interiorFreeRatio: 0.30` carries. **If Art. 328 states its own ratio, the depth
construction for 8.7 % of Barcelona's buildable land is a different computation, not a different
constant** — and we would not have known from the code, because a wrong ratio produces a perfectly
plausible depth.

---

## 4. Two further findings, recorded so they are not re-discovered

**4.1 `plotRatioFAR` must be NULL in a `13b` pack, for the SAME reason it is null in `13a`.** The
figure that circulates for Subzona II is **1,80 m²st/m²s** — and it is *"for operations in this zone
through **plans especials de reforma interior or estudis de detall**"*. That is Art. 322.2/.3
procedural gating, identical in shape to `13a`'s 2,20 / 1,20 (already documented in
`esBarcelonaEnsanche.ts`). Applying 1,80 per-parcel would over-constrain every `13b` plot in the
city — a C58 §1.11 category error, a real number answering a different question. **The temptation is
stronger here than for 13a because 1,80 is a single tidy figure rather than a pair.**

**4.2 A constraint kind PRYZM cannot express at all: a DENSITY cap.** PGM Art. 323 limits Subzona II
to a **maximum of 250 habitatges per hectare** of buildable land at the *alçada reguladora*. That is
neither a setback, nor a depth, nor a coverage, nor a FAR — it caps DWELLING COUNT, and no
`GeometricRule` kind and no `JurisdictionZoningContract` field models it. It does not block the
envelope (it constrains the programme inside it), but it means a `13b` envelope is **not a complete
statement of what may be built there**, and the panel must not imply otherwise. Filed as an open
item, not folded into ADR-0272 (a density cap and an intensity cap are different legal quantities —
flattening them is precisely what the founder's ranking forbids).

---

## 5. What the founder is being asked for

**A source, not a decision.** Specifically, one of:

- **(a)** The **Barcelona-consolidated PGM refós** text of **Art. 328** — via an authenticated or
  interactive session on **RPUC** (*Registre de Planejament Urbanístic de Catalunya*) or the **AMB
  Geoportal / NUMAMB** viewer, which serve the document to a browser but 403/404 to automated
  fetch. What is needed is small and specific:
  1. the **complete height/storeys table by *amplada de vial*** (band edges + PB+N + metres);
  2. whether Art. 328 or Art. 242 states the **interior-free-space ratio** for Subzona II, and its
     value;
  3. confirmation that the **depth is the Art. 242 construction**, not a stated scalar.
- **(b)** An explicit L-449-style signature accepting a NAMED republication as the source — which
  this document recommends against, for the reasons in §2.

**Until one of those arrives, `13b` correctly falls to the estimated pack** (24 measured grid points,
8.7 % of private buildable land), which badges every value ESTIMATED. That is the honest interim
state, and it is strictly better than a `13b` pack built on a Santa Coloma republication.

---

## 6. Cross-references

L-538 (the plan, Phase 1) · L-526 (`L-526-LEGAL-FINDINGS.md` — the stale/anachronistic/mis-attributed
13a citation and the founder's re-signature) · L-449 (the founder source gate) · L-525a
(`bcnAlcadaReguladora.ts`, the Art. 327.2 height-table pattern Art. 328 would reuse) · L-537
(*amplada de vial*, which Art. 328 keys on) · L-550 (the registry `13b` will plug into with no
editor edit) · ADR-0271 · C58 §1.2/§1.4/§1.11 · plan §7 R3 (the source-vintage trap).

**Sources consulted in this pass (all SECONDARY — see §2):**
AMB NUMAMB article index entry for
[Article 328 — Condicions d'edificació: subzona II, semiintensiva](http://www.amb.cat/web/territori/gestio-i-organitzacio/numamb/detall/-/articlenumamb/article-328---condicions-d-edificacio--subzona-ii--semiintensiva/992183/11656)
(index title + summary reachable; **article body 403**) ·
[Santa Coloma de Gramenet — clau 13b republication](https://www.gramenet.cat/fileadmin/Files/Ajuntament/informacio_urb/Normes_i_Ordenances/Claus_Urbanistiques/13b.pdf) ·
[Santa Coloma de Gramenet — clau 13a republication](https://www.gramenet.cat/fileadmin/Files/Ajuntament/informacio_urb/Normes_i_Ordenances/Claus_Urbanistiques/13arv.pdf) ·
[Badalona — normativa urbanística metropolitana](https://www.badalona.cat/ca/serveis-ajuntament/urbanisme/ordenacio-del-territori/planejament/normativa-urbanistica-metropolitana-a-lambit-de-badalona/ajb037256.pdf) ·
[AMB Geoportal — clau 13a, INE 08015 (Badalona, NOT Barcelona)](https://geoportalplanejament.amb.cat/Informacio/Normativa/08015_13a.htm).
