# L-590h — The Barcelona SUFFICIENCY ceiling, MEASURED by vision over 24 Pla Parcials

**2026-07-23.** `L-590g` (the 5-document pilot) made the reframing claim: the wall on Barcelona's
derived-planning slice is **not OCR — it is SUFFICIENCY** (parameters keyed to un-OCR-able plànol
block-labels, or stated as algorithms, or as base values on drawings), and the `L-590e` "0 chars ⇒
SCAN" classifier over-states the OCR wall because much of the 0-char corpus is clean raster. **This
file replaces the pilot's 5-document impression with a 24-document measurement**, taken by vision
directly over the clau-18 + 22a instrument corpus, field by field, with the arithmetic cross-check
armed and every documentId named.

> ## HEADLINE — the 48–80% band is retired; here is the number that replaces it
>
> Of **24 Barcelona Pla Parcial primary documents** read by vision (denominator = the DUN / most-
> normative-named document the `basica→detall` enumerator selects per expedient):
>
> | what is extractable | measured | 95% CI |
> |---|---:|---:|
> | a **directly-extractable SECTOR edificabilitat (FAR)** number | **9 / 24 = 37.5%** | 21–57% |
> | …incl. partial fragments | 10 / 24 = 41.7% | 25–61% |
> | a **parcel-level HEIGHT** number (no drawing needed) | **0 / 24 = 0%** | 0–14% |
> | a **full parcel-level ENVELOPE** (FAR + height + footprint) | **0 / 24 = 0%** | 0–14% |
> | **no extractable buildable number at all** | 13 / 24 = 54.2% | 35–72% |
>
> **The measured sufficiency ceiling: OCR/vision unlocks a SECTOR-LEVEL FAR for ~37% of these
> documents (and image quality is NOT the constraint — clean and faded documents behave the same),
> but a FULL parcel-level envelope is extractable in ~0% of them, because HEIGHT is keyed to block
> labels / plantas whose geometry lives on the plànol in ~100% of every document that states a
> height.** ⇒ **The ~80% figure is NOT reachable by OCR of the Pla Parcials.** OCR moves the
> derived-planning slice from a blank refusal to a **partial (FAR-only) answer** — the same shape as
> the 22a Track-C regime-neutral FAR already shipped. Completing the envelope additionally requires
> **vectorising the plànols** (the block-label→geometry binding), a separate, harder, partly
> un-OCR-able problem. **Barcelona's honest FULL-envelope ceiling stays ~48%; OCR buys a partial-answer
> quality tier over the 63%, not +32 resolution points.**

⚠ **Scope, stated once.** "Pla Parcial d'ordenació" is the pre-PGM instrument that governs clau 18 +
22a (40% of private buildable land — `L-590e` §3). This file measures **that** slice. The modern
derived land (PEU/PMU) is a separate, cleaner corpus (`L-590e` §4.2) and is not re-measured here.

---

## 1 — METHOD (reproducible; the enumerator + the honesty controls)

**Enumerate → select → render → read, field by field.**

1. **Corpus.** `basica?municipi=08019&rpp=2000` → 238 Pla Parcials (`L-590e` §2), 1955–1998.
2. **Stratified sample.** 24 expedients evenly spaced across the whole era span (to spread IMAGE
   quality, the `L-590g` §2 correction — **NOT** by era), plus keyword-boosted industrial/Zona-Franca
   ones so the clau-22a slice is represented (110218 SEAT, 110215, 110059).
3. **Document selection.** Per expedient, `detall?codiExpedient=<codi>` → `documents[]`; picked the
   most-normative-named document by a name-heuristic (prefer `ordenances`/`normativa`/`dades`/
   `coeficients`/`DUN`; de-prioritise `plànol`/approval-act). **This heuristic is itself a measured
   failure mode — see §4.**
4. **Render.** PyMuPDF 1.28, `Matrix(200/72)`, per-document contact sheets (all pages tiled) for
   triage, then the parameter page at full DPI.
5. **Read + tier.** Every buildable field read directly from the image and tiered CONFIDENT /
   AMBIGUOUS / ABSENT / NOT-TEXT / ALGORITHM.
6. **Arithmetic cross-check armed** (the `L-590g` §3.2 free in-document check: `sostre / solar = FAR`,
   `sup.planta × plantas = sup.edificada`). It caught a confident-wrong read live — §3.3.

Every value recorded here from a rendered scan is **`pipeline-extracted-unverified`** — a vision read
by one agent, not a certified transcription. The confidence-tier schema itself is the OCR-core agent's
to author; this file records tiers **in prose only**.

Data: `scratchpad/l590h/worklist.json` (the 30-expedient pull), `scratchpad/l590h/classification.json`
(the 24 field-level verdicts), contact sheets `scratchpad/l590h/contact/<codi>_dun_contact.png`.
Scripts: `l590h_collect.py`, `l590h_contact2.py`.

---

## 2 — 🔴 THE MEASUREMENT: extractability by PARAMETER, not by document

The naive question "is there a number in the PDF?" hides the finding. The honest axis is **which
parameter, and is it SUFFICIENT for a parcel-level envelope.** The three parameters diverge sharply.

### 2.1 — EDIFICABILITAT (FAR): the extractable win, at SECTOR level

**9 of 24 documents state a sector-level edificabilitat coefficient as a directly-readable number.**
Every one is a whole-sector value — applicable to any parcel in the sector, so it IS sufficient for a
sector-level FAR answer (modulo which sector a parcel is in, which the AMB `qualificacio_refos`
polygon already answers). Named, with the arithmetic check result:

| documentId (codi) | year | FAR (m²t/m²s) | arithmetic cross-check |
|---|---|---|---|
| **110284** DUN | 1959 | **1,142** | ✅ RECONCILES 220.637 / 192.611 = 1,145 |
| **111698** DUN | 1966 | **2,5** | (adopted; density cap 900 hab/Ha also stated) |
| **115864** DUN | 1972 | **0,7** | ✅ RECONCILES 5.783 / 8.100 = 0,714 |
| **111145** DUN | 1964 | coeff (m³/m² 1946 convention) + densities | table-internal |
| **95246** DUN | 1998 | **sostre per subzona-code** (QUADRE DE CARACTERÍSTIQUES) | keyed to a code the GIS carries |
| **110218** DUN | 1958 | **2,385** & **2,401** | ✅ RECONCILES 20.414,55/8.558,34 & 20.548/8.554,97 |
| **111149** DUN | 1963 | **3,24** | ✅ consistent 34.922,05 techo / ~10.778 solar |
| **110386** DUN | 1960 | **1,5** | ✅ RECONCILES 40.517,55 × 1,5 = 60.776,32 |
| **113773** DUN | 1970 | **2,90** | ✅ consistent 28.743,86 techo / ~9.912 solar |

⇒ **FAR is genuinely OCR/vision-extractable, and the arithmetic check confirms most reads.** This is
real, and it is what the 22a Track-C tier already ships from Art. 350.1 — now shown reachable for the
Pla Parcial corpus generally, not just where the PGM restates it.

### 2.2 — 🔴 HEIGHT: sufficiency-blocked in ~100%, regardless of image quality

**Every document that states a height keys it to a BLOCK LABEL or a PLANTAS count** (A/B/C…, PB+N,
"×10 plantas", "torres PB+12 = 37,70 m") **whose geometry lives on the plànol** — and often the
metres-per-planta conversion is *additionally* delegated to the general Ordenanzas Municipals altura
table (a cross-reference). **0 of 24 documents yield a parcel-ready height without the drawing.**

- 110284: heights 4 / 6,75 / 17,75 / 21,50 / 37,70 m — keyed to block-type; which parcel is which
  block is on the plànol.
- 95246 (the CLEAN modern laser scan): alçada base on **perfil regulador plànol O 1.2**; the article
  states only a ±5% modifier. Perfect characters, still NOT-TEXT.
- 111698 / 111149: heights in *plantas* (9P, 17P, PB+15) → metres via the general-ordinance table
  (cross-ref) → block via the plànol (drawing). Two indirections, neither of them text.

**This is the sufficiency wall, and it does not move with image quality.** A pristine 1993/1998 laser
scan and a faded 1958 typewriter fail the height question the *same* way: the value is geometry, not
characters. Perfect OCR yields a height *dictionary keyed by block letter* with **no key into it**.

### 2.3 — FULL ENVELOPE: 0 / 24

Because height is never parcel-ready, **no document yields a complete parcel-level envelope (FAR +
height + footprint) by reading characters alone.** The extractable win (§2.1) is a *partial* envelope.

---

## 3 — Image quality, algorithms, and the confident-wrong catch (the honesty section)

### 3.1 — Stratified by IMAGE QUALITY (the `L-590g` §2 correction), quality is NOT the constraint

| image regime | docs | FAR extractable where doc is normative? |
|---|---|---|
| clean typewriter / laser | 110284, 111698, 115864, 95246, 111149, 113773, 110961, 112102, 110216, 113230, 114111, 110104, 112618 | ✅ yes, ~95–99% legible |
| faded / torn / taped but readable | 110059, 110386, 110218(p0), 111145(p0), 110215 | ✅ yes on the readable pages |
| dark hard scan | 110519(p0), 111416(p0), 114705(p2), 110986(p2) — **all approval-act pages, not parameter pages** | n/a |

⇒ **Not one document failed the buildable-number question because of image quality.** The failures
(§4) are document-type and label→drawing failures. **`L-590g` §2 is confirmed at 24×: the char-count
"scan wall" is real as a text-layer fact and nearly irrelevant as an OCR-difficulty fact.** The binding
constraint is sufficiency, upstream of pixels.

### 3.2 — The ALGORITHM / valuation-assumption trap, live (a confident-wrong risk named)

- **110215** states "**altura 15 m, edificabilidad 7,5 m³/m²**" and the arithmetic even *reconciles*
  (2.880.000 / 384.000 = 7,5). **It is still the wrong number to ship.** Reading the page shows this is
  a **valuation surveyor's assumption** ("*volumen edificable suponiendo una altura de 15 metros y una
  edificación de la mitad de la superficie*") used to *value* the land for the patrimoni municipal —
  **not the ordinance's parameter.** An extractor that pulls "7,5" or "15 m" here manufactures a
  citeable envelope figure the plan never set. **The arithmetic check does NOT catch this — it
  reconciles.** Only reading the surrounding sentence catches it. This is the L-526 failure in a new
  costume: a confident, plausible, internally-consistent, *wrong-in-status* number.

### 3.3 — 🔴 The arithmetic cross-check caught one of MY reads

- **110284** states two coefficients. The per-sector one **1,142 reconciles** (220.637 / 192.611 =
  1,145 ✓). The whole-Plan one printed as **"1,833" does NOT**: the superficie/sostre I read give
  494.055 / 600.494 = **0,823 ≠ 1,833**. One of those three cells is a misread and **I cannot tell
  which from the image** → **AMBIGUOUS, route to human. I did not ship 1,833.** This is the pilot's
  row-I lesson reproduced: the free in-document check is not theoretical — it fired on my own read,
  exactly once, and stopped a confident-wrong value. **Every extracted FAR must pass its own
  arithmetic before it may be tiered CONFIDENT.**

---

## 4 — 🔴 DOCUMENT SELECTION is a first-class failure mode (why 54% show "no number")

**13 of 24 documents carry no extractable buildable number — and most are the WRONG document, not a
failure of the plan to state one.** The `basica→detall` enumerator's per-expedient document list is
heterogeneous, and the "most-normative-name" heuristic frequently picks a non-normative file:

| what the selected document actually was | codi(s) |
|---|---|
| street **alignment / rasantes** study | 112102, 111416, 117775, 113230, 114111 |
| **polygon division** (Art. 104 Ley del Suelo) | 112618, 110519 |
| **redistribution** modification ("no aumento de edificabilidad") | 110760, 110216 |
| **memoria / objections** only | 110104, 110961 |
| **zone reclassification** (delegated to zone-type) | 110986 |
| **block ordenació**, heights only on a *plano de altura* (NOT-TEXT) | 114705 |

This is `L-590g` §3.1 at scale: **the parameters, where they exist, are in a *different* document of
the same expedient.** So the 37.5% FAR rate is a rate over *documents-as-selected* and **understates**
the per-*expedient* "has an extractable FAR somewhere" rate — a proper pipeline must score/select
across all of an expedient's documents (search for the *ordenances*/*dades i coeficients* file), not
trust one name heuristic. ⚠ **It changes nothing about height:** even with perfect document selection,
height stays block-label→plànol (§2.2). **Fixing selection raises the FAR yield; it cannot raise the
full-envelope yield off ~0.**

---

## 5 — WHAT THIS DOES TO THE CEILING (the number that replaces the 48–80% band)

| path | full-envelope ceiling | status after this measurement |
|---|---:|---|
| PGM rulebook alone | **~48%** | mined out (`L-590c` §11.5) |
| + AMB structured sector params | ~50% | refuted, ~2% coverage (`L-590c` §11.2) |
| + clean-text / data pull of PP params | ~48% | dead — 100% scans (`L-590e` §4) |
| **+ OCR/vision over the scanned PPs** | **~48% full-envelope; a PARTIAL FAR-only tier over the 63%** | 🔴 **NEW, MEASURED.** FAR extractable ~37% of docs (more per-expedient); **HEIGHT extractable ~0% without the plànol.** OCR yields a *partial* answer, not a full envelope. |
| + **plànol vectorisation** on top of OCR (block-label→geometry) | up to ~80% **in principle** | the *real* gate to ~80% — a drawing-understanding project, harder and partly un-OCR-able, **beyond** the OCR programme |
| + "point at the governing plan" signpost tier | doesn't move resolution; improves product | ✅ reachable now, cheap — shipped in this task (§6) |

**The measured sufficiency ceiling, stated as one sentence for NEXT §8:** *of Barcelona's clau-18 +
22a Pla Parcial corpus, a directly-extractable SECTOR edificabilitat number is present in ~37% of
primary documents (95% CI 21–57%, image quality no obstacle), a parcel-level HEIGHT number in ~0%
(95% CI 0–14%, block-label→plànol in every height-bearing document), and a full parcel-level envelope
in ~0% — so OCR raises Barcelona from ~48% to a PARTIAL (FAR-only) answer tier over the derived-
planning 63%, and the ~80% full-envelope figure is gated behind plànol vectorisation, not OCR.*

⚠ **What the 48–80% band got wrong.** The 80% end assumed "read the characters ⇒ get the envelope."
Measured, character extraction gets you the FAR and stalls at the height, because the height was never
text. The band conflated *legibility* (high) with *sufficiency* (low for the envelope). **The honest
revised statement is a two-tier ceiling: ~48% full-envelope, unchanged; a partial FAR tier reachable
by OCR over ~37%+ of the derived corpus; ~80% reachable only with drawing vectorisation.**

---

## 6 — THE SIGNPOST TIER (shipped this task — the cheap win, no OCR)

Built as a **new pure L2 module** in `@pryzm/site-parcel-data`:
`packages/site-parcel-data/src/rulepacks/governingInstrumentSignpost.ts` (+ `__tests__/
governingInstrumentSignpost.test.ts`). It takes an already-fetched RPUC `detall` payload (the impure
fetch stays at the edge, like every other provider) and returns the **governing instrument signpost**:
name, instrument type, definitive-approval date, in-force flag, and direct document links — turning a
blank refusal into *"this parcel is governed by the Pla Parcial d'ordenació '…', definitively approved
1968-08-01 — here it is."* It is **not** a numeric envelope and carries no buildable field; its
confidence is an **index pointer** (`index-cited`), never a parameter tier.

⚠ **Annulment/supersession guarded (`L-590c` §10.4 / NEXT §3.6).** The signpost reads `vigencia` and
the `assentaments` (`Baixa`/derogation) trail and **refuses to present a non-in-force instrument as
governing** — a stale index must never be cited as authority. It is **not** wired into `registry.ts`/
`index.ts` (constraint); consumers import it directly, mirroring `answerabilityClass.ts`.

It does **not** move the resolution number. It generalises to every Spanish city for free (same
`basica→detall` registry pattern) and is the honest product answer for the whole derived-planning 63%.

---

## 7 — RANKED NEXT STEPS

1. **The ~80% gate is plànol vectorisation, not OCR.** Before any OCR build is scoped for coverage,
   price the *drawing-understanding* problem (block-label polygon → parcel), because that — not
   character extraction — is what a full envelope needs. OCR alone buys the FAR-only partial tier.
2. **If an OCR programme runs anyway, fix DOCUMENT SELECTION first** (§4): score across all of an
   expedient's documents for the *ordenances / dades i coeficients* file; the "most-normative-name"
   heuristic misses it >50% of the time.
3. **Bake the two honesty guards into the pipeline as gates, not niceties** (§3.2/§3.3): the arithmetic
   cross-check (catches misreads) AND a "is this an ordinance value or a valuation/algorithm?" prose
   check (catches the confident-wrong-status number the arithmetic *cannot* catch).
4. **Ship the signpost tier** (done, §6) and wire it at L5 behind the derived-planning refusals.

---

**Related:** `L-590g-OCR-PILOT-RESULTS.md` (the 5-doc pilot this scales) · `L-590e-…-CORPUS-
MEASUREMENT.md` §4 (the "0-char = scan" classifier §2/§3 corrects) · `L-590f-OCR-PIPELINE-DECISION.md`
(pilot-before-build) · `L-590c` §11 (the wall, the 80% refutation) · `NEXT.md` §8.
