# Founder decisions — Barcelona, 2026-08-01

> Three governance decisions taken by the founder (repo owner). Each is a **decision**, not a
> finding — recorded here so the reasoning survives, and so a future reader can see what evidence
> the decision rested on and what would reopen it.

---

## DEC-1 · clau `22@` — **CLOSE as a PERMANENT CITED REFUSAL**

**Decision:** `22@` (2.06 % of private buildable land) is **not** an open blocker. It ships a
**permanent, legally-grounded cited refusal** and is removed from the closure gap.

**Evidence it rests on.** MPGM 22@ **Art. 8.1** states a by-right, per-parcel envelope — FAR **2,2**
m²st/m²s, *ocupació* **70 %**, *parcel·la mínima* **500 m²**, a four-band street-width height table —
**but states NO *profunditat edificable*: not a figure, not a construction, not a cap.**
`AlignmentRuleSchema` requires a positive `buildableDepth_m`, so `geometricRule` is `null`; a null rule
means legacy per-edge inset, and on this zone's correctly-null setbacks that would **publish the whole
parcel as buildable** next to a card printing 70 % — self-contradicting *and* over-stating (§L-616).

Independent research (founder, 2026-08-01) across BCNROC, the 2024 municipal *Instrucció* on 22@
interpretation and the 2025 MPGM amendment found **no implementation manual, no CAD/GIS geometry, no
permit guidance** defining a universal depth. What it did find is that modern 22@ implementation
resolves through **PMUs, *fitxes urbanístiques* and *plànols d'ordenació*** — i.e. the geometry is
**distributed by design**, not centralised and mislaid.

**⇒ The omission is INTENTIONAL, not a gap in our sourcing.** `22@` joins clau 18 and `22a`: the law
points elsewhere on purpose, and the correct output is a machine-readable reference to the governing
instrument, **never an invented depth**.

**What would reopen it:** a published city-wide geometric specification for 22@, or an official
instruction converting PMU/ordering-plan geometry into a computable depth. Absent that, this is closed.

**Consequence for the ceiling:** Barcelona's ENVELOPE ceiling drops from ~70 % to **~68 %**, and the
realistic landing point is **~65 %**. That is a *more honest* ceiling, not a worse outcome.

---

## DEC-2 · clau `13E` — implement as a **13a SUPPLEMENT**, not a standalone ruleset

**Decision:** when `13E` is implemented it **inherits `13a`** and adds only what the 2002 *Ordenança de
rehabilitació i millora de l'Eixample* states on top. **No parallel ruleset.**

**Why this is right.** The 2002 text says *«La qualificació 13 Eixample (clau 13E) **substitueix** la
qualificació … (clau 13)…»* — it substitutes *within its ámbito* and inherits the rest residually. A
standalone pack would duplicate every 13a value and drift from it at the first amendment; a supplement
keeps one source of truth and makes the delta auditable.

⚠ **Any transcription must start from the CURRENT consolidated state**, not the 2002 text as published:
Art. 15 carries a **2012 partial nullity** and modifications in **2018, 2019 and 2023**.

**Interim behaviour is unchanged and remains correct:** `13E` is registered against the same rule set as
`13a` (`BCN_ENSANCHE_ZONE_CODES = ['13a','13E']`) — a deliberate refusal to pick. That was an *unknown*
approximation; it is now a **known** one, with a named delta to fill.

---

## DEC-3 · the 2015/2026 repeal annex is the **ONLY remaining evidence dependency** for `13E`

**Decision:** no further open-ended searching. One document decides it:

```
GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf   (7 pages, 154 KB)
BCNROC item 39d8ed76-3365-4d32-a6f1-bf9dea45646a · hdl 11703/144636
```
One binary read: **do the provisions establishing `13E` appear in it?**

**If the annex never turns up**, `13E` is recorded as **evidenced-not-proven / presumed in force**, with
this statement verbatim:

> **"Extensive search of BCNROC, CIDO, BOPB and Ajuntament repositories found no primary source
> expressly repealing the provisions establishing 13E."**

That is a **negative-evidence closure** under the ratified standard (L-661): *"not located" is never
"does not exist"* — but a documented, exhausted search **is** a defensible basis for proceeding, and the
burden of proof now sits with anyone asserting repeal.

**Supporting evidence already held:** the 2026 derogation's `dc.relation.replaces` set names the
Eixample **1986** ordinance and its **1994** and **2000** modifications — **not** the **2002 *text
refós*** that creates `13E`; and BCNROC catalogues that refós under **"Ordenances Vigents"**
(`dc.coverage.vigencia = Si`) with only later Art. 15 modifications. CIDO independently records it
**Vigent**. ⚠ This is *catalogue metadata*, not the annex text — which is exactly why DEC-3 exists.

---
*Recorded by the orchestrator 2026-08-01 on the founder's instruction. Related: `CLOSURE-REGISTER.md`,
`sources/VERIFICATION.md`, `findings/L-667-13E-STATUS-EVIDENCED-NOT-PROVEN.md`.*
