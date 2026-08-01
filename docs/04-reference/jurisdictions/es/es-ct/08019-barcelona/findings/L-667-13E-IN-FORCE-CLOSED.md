# L-667 — clau `13E` is **IN FORCE** — ✅ **BLOCKER CLOSED 2026-08-01**

> ## ✅ CLOSED — the repeal annex WAS read, and it is decisive
>
> **Founder inspected the primary source** (`GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf`)
> on 2026-08-01. Finding, verbatim:
>
> > *"The 2026 Annex to the Ordenança de derogació de les disposicions municipals obsoletes repeals
> > the **1986** Ordenança de rehabilitació i millora de l'Eixample. The annex contains **no express
> > reference** to the 2002 consolidated ordinance, to clau `13E`, or to the provisions creating the
> > `13E` subzone. **No primary source reviewed expressly repeals the 2002 legal framework
> > establishing `13E`.**"*
>
> **This is the annex ITSELF, not catalogue metadata** — which is what the earlier draft of this file
> got wrong and why DEC-3 named the annex as the single remaining dependency. The dependency is
> discharged.
>
> **VERDICT: `13E` is IN FORCE.** Three independent strands agree: (1) positive evidence it exists —
> the 2002 consolidated ordinance creates it; (2) **no express repeal in the 2026 annex**, read
> directly; (3) BCNROC's legislative history continues to treat the 2002 framework as operative, with
> later amendments recorded against it rather than a repeal.
>
> **Engineering decision (founder):** implement `13E` as a **SUPPLEMENT over `13a`** — see
> [`../FOUNDER-DECISIONS-2026-08-01.md`](../FOUNDER-DECISIONS-2026-08-01.md) DEC-2.
>
> ⚠ **What would reopen this:** an express repeal of the **2002** framework in a source not yet
> reviewed. The 1986 repeal is *not* that — the 2002 text is a separate instrument with its own
> handle, and the annex names its targets individually.
>
> ---
> *(The analysis below was written BEFORE the annex was read. Retained as the reasoning trail; its
> `NOT PROVEN` verdict is superseded by the finding above.)*
> ---

> **Resolved 2026-08-01** from the official BCNROC record of the *Ordenança de derogació de les
> disposicions municipals obsoletes de competència del Consell Municipal* **[2026]**
> (`hdl.handle.net/11703/144636`, Acord 10/2025, approved by the Plenari **30-01-2026**, published
> **BOPB + Gaseta Municipal 13-02-2026**, in force **14-02-2026**).
> **⚠ VERDICT: `NOT PROVEN` — pending inspection of the 2026 repeal ANNEX itself.**
> Blocker 10 **remains OPEN**, downgraded from *unknown* to *evidenced-but-unproven*.
>
> **An earlier draft of this file said "SURVIVES — CLOSED". That was an overclaim and is withdrawn.**
> What was read is the BCNROC **`dc.relation.replaces` metadata field** — the repository's *cataloguing*
> of the relationship — **not the 7-page annex** (`GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf`,
> 154 KB). A catalogue field is not a transcription: it may be partial, and absence from it is not
> absence from the annex. This is exactly the `not-located ≠ does-not-exist` rule (L-661) applied to
> ourselves.

## The question

Does the municipal "obsolete provisions" cleanup repeal the ordinance that **creates clau `13E`**?
This sat on the **flagship** pack: if `13E` were alive it *substitutes* clau 13 across the Eixample
and may carry courtyard rules PRYZM does not hold — **24 %+ of private buildable land.**

## The evidence — the derogation's own `dc.relation.replaces` set

The 2026 ordinance enumerates every provision it repeals. Three are Eixample items, and **all three
are the 1986 ordinance or its modifications**:

| Repealed | Handle |
|---|---|
| *Ordenança de rehabilitació i millora de l'Eixample* **[1986]** | `11703/96475` |
| …**[1986] : modificació [1994-12-14]** | `11703/98856` |
| …**[1986] : modificació [2000-09-21]** | `11703/98857` |

**The 2002 *text refós* — `11703/89247`, the instrument that defines `13E` — does NOT appear in the
list.** The repealed set spans 1958–2005 and names its targets individually by handle; this one is
absent.

**Corroboration, independent of the annex:** the 2002 text refós is catalogued under
**"Ordenances Vigents"** with `dc.coverage.vigencia = Si`, listing only later **modifications**
(2018, 2019, 2023, affecting Art. 15) — **no wholesale repeal**. CIDO (Diputació de Barcelona,
`normativa_local/50141`) independently records it as **Vigent**.

## Verdict — **NOT PROVEN**

**Positive evidence that `13E` exists** (the 2002 ordinance creates it) **and NO primary-source
evidence yet produced that repeals it.** That is not the same as proof of survival.

**Status: `evidenced-not-proven`.** Treat `13E` as **presumptively in force** for planning purposes,
and record every downstream statement as resting on this presumption.

The 2002 text states: *«La qualificació 13 Eixample (clau 13E) **substitueix** la qualificació …
(clau 13)…»* — so within its ámbito `13E` substitutes, it does not merely annotate.

## ⚠ The one residual question, stated rather than buried

The 2002 instrument is a ***text refós*** of the 1986 ordinance, and the 1986 base **is** repealed.
Whether repealing a base ordinance implicitly voids a later consolidated text of it is a **legal**
question the metadata does not answer. Two facts push against that reading, and neither is proof:
the derogation names its targets **individually by handle** and did not name the refós; and the
repository continues to catalogue the refós as **operative**, with post-2015 modifications recorded
against it.

**The burden of proof has flipped** — the working default is now *"`13E` is in force"* — **but the
blocker does not close until the annex is read.** The single remaining document:

```
GM_ordenanca-derogacio-consell-municipal-annex_2026.pdf   (7 pages, 154 KB)
BCNROC item 39d8ed76-3365-4d32-a6f1-bf9dea45646a  ·  hdl 11703/144636
```
One binary read: **do the articles creating `13E` appear in it?** Absent ⇒ closed as SURVIVES.
Present ⇒ closed as REPEALED. Either answer closes it permanently.

## What this obliges PRYZM to do

`13E` is **currently registered against the SAME rule set as `13a`** (`BCN_ENSANCHE_ZONE_CODES =
['13a','13E']`) — a deliberate **refusal to pick** while its force was unknown, explicitly *not* a
claim they are equivalent. That refusal is now resolved in favour of `13E` being live, so the
open item becomes concrete: **does the 2002 ordinance add rules `13a` does not carry** (courtyards,
*patis*, rehabilitation conditions)? Until read, sharing `13a`'s rule set remains the honest
approximation — but it is now a **known** approximation, not an unknown.

⚠ Note the ordinance's own later history: **Art. 15 was partially non-applied (2012 partial nullity)
and modified in 2018 / 2019 / 2023.** Any transcription must start from the *current* consolidated
state, not the 2002 text as published.

---
*Founder-sourced, 2026-08-01 (BCNROC is behind an F5 anti-bot wall and returns 403 — and HTTP 200
carrying a block page — to every automated request; a human browser reaches it). Sources: BCNROC
`11703/144636` (2026 derogation, full metadata) · `11703/89247` (2002 text refós) · CIDO 50141.*
