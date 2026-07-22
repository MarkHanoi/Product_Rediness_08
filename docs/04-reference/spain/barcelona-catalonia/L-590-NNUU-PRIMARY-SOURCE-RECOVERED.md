# L-590 — The PGM Normes Urbanístiques recovered as a primary source, and the two missing tables

**2026-07-22.** Three AI research rounds concluded the Art. 340.1 and Art. 350.c tables were
*"missing pixels"* — recoverable only from an original printed volume or an internal municipal
archive, with confidence put at **98% that they existed only in the 1988 *Document Unitari***.

**They are in a public 11 MB PDF, and both were extracted in under five minutes.**

---

## §1 — What actually happened, because the lesson is worth more than the tables

The document is the **MMAMB re-edition of the Normativa Urbanística Metropolitana** (1976 NNUU ·
1988 Text Refós · later updates), 512 pages:

```
https://www.aucatel.com/normativa/barcelona/Normativa_Urbanistica_Metropolitana.pdf
```
*(A browser `User-Agent` is required; the default `curl` UA gets an HTML block page. Saved locally as
`scratchpad/nnuu.pdf`.)*

**The research was right that plain text extraction destroys the tables. It was wrong about why.**

> **This is a TEXT PDF, not a scan.** Every glyph carries an `(x, y)` position. Naive
> `extract_text()` concatenates in stream order and the columns dissolve — which is exactly what
> every mirror and every OCR attempt reported. **But the positions were never lost. They were never
> read.**

Extracting with `pypdf`'s `visitor_text` hook, grouping glyphs by `y` (row) and sorting by `x`
(column), reconstructs the tables exactly. ~20 lines of Python.

### ⚠⚠ THE TRANSFERABLE LESSON

**"We are missing pixels" was a confident, well-argued, evidence-backed conclusion — and it was a
statement about the TOOL, not about the DOCUMENT.** Three capable research passes, each more
thorough than the last, converged on it because they all consumed the same *text layer* and none
questioned the extraction. The 98% confidence figure measured agreement between mirrors that were
**all derived from one digital source**, so the corroboration was structurally worthless.

This is the **wrong-instrument** failure from `PROBE-DISCIPLINE.md` §R7 — *ask what your check cannot
see* — arriving from outside the codebase. **Before concluding a document is unobtainable, confirm
you have read it with an instrument capable of representing what you are looking for.**

---

## §2 — ✅ Art. 340.1 — clau 20a subzone → edificabilitat neta (page 111)

> *"Els índexs d'edificabilitat neta per a cada una de les subzones són els establerts al quadre
> següent:"*

| Subzona | clau | **m² st / m² s** |
|---|---|---|
| **Plurifamiliars** | | |
| I | 20a/6 | **0,25** |
| II | 20a/5 | **0,50** |
| III | 20a/7 | **0,75** |
| IVa | 20a/9 | **1,00** |
| IVb | 20a/9b | **1,00** |
| V | 20a/8 | **1,50** |
| **Unifamiliars** | | |
| VI | 20a/9u | **1,00** |
| VII | 20a/10 | **0,75** |
| VIII | 20a/11 | **0,50** |
| IX | 20a/12 | **0,25** |

**Ten subzones, ten values.** The "eleven values with a stray 1,50" was an artefact of stream order —
the 1,50 belongs to **V (20a/8)**.

**Art. 340.2** — *"A les subzones unifamiliars, l'índex d'1,00 m² sostre/m² sòl es redueix a 0,75
m² sostre/m² sòl, per a aquelles parcel·les de superfície inferior a la mínima 400 m²."*

**Art. 340.3** — *"Als Estudis de Detall referents a les subzones unifamiliars no podrà augmentar-se
el nombre d'habitatges…"*

⚠ **Footnote 54 on this page: *"Veure modificació per al Municipi de Barcelona a la pàg. 185."*** —
see §5. The volume flags its own per-municipality overrides.

---

## §3 — ✅ Art. 350.c — clau 22a height by street width (page 116)

> *"Alçada màxima i nombre límit de plantes: variaran amb l'amplada del vial al qual la parcel·la
> doni, de conformitat amb el quadre següent."*

| Ample de vial | Alçada màxima (m) | Nombre límit de plantes |
|---|---|---|
| De menys de 8 m | **9** | **PB + 1 P** |
| De 8 a menys d'11 | **13** | **PB + 2 P** |
| De 11 en endavant | **17** | **PB + 3 P** |

⚠ **THREE bands, and the top one is open-ended.** Every other Barcelona height table we have
encountered (Art. 327 for 13a, Art. 328 for 13b, Art. 342.5 for 20a/8) has **four** bands with a
15 m step. **Anyone extrapolating a fourth band here would have invented a rule.** Exactly why the
sourcing spec said photograph the page rather than reason about it.

**The rest of Art. 350, now complete:**

| | rule |
|---|---|
| **350.a** | edificabilitat ≤ **2 m² st/m² s**; occupation **90%** ✔ *(confirms the base text; the "100%" figure seen earlier was Badia del Vallès's own local Art. 23)* |
| **350.b** | above ground floor must sit within the concentric band = **70%** of the block |
| **350.c** | the table above; *"L'edificació a l'alçada reguladora … només podrà alçar-se dins de la franja del 70 per 100"* |
| **350.d** | minimum parcel **300 m²**, façade **≥ 10 m** |
| **350.e** | height inside the block fixed at **5 m** (a single indivisible storey), measured from the *rasant* to the underside of the roof structure |
| **350.f** | *cossos sortints* limited to **1/10 of the street width**, never more than **1 m**; ≤ ⅓ of the façade length |

**⇒ Clau 22a is fully encodable. Nothing is missing.**

---

## §4 — ✅ The *estudi de detall* cap — ANSWERED (Art. 339.2, page 111)

> *"Els Plans Especials i, si escau, els Estudis de Detall **no podran augmentar la superfície de
> sostre edificable** ni alterar el tipus d'ordenació ni augmentar el nombre d'habitatges fixats als
> plans **l'ordenació dels quals es modifiqui**."*

**The cap is real — and it is anchored to *"els plans l'ordenació dels quals es modifiqui"*, the plan
being modified, NOT to a PGM-computable index.**

⇒ **This is the non-encodable branch, exactly as predicted.** It binds a planner; it computes
nothing for us, because for a clau-18 parcel the governing figure lives in the site document we do
not hold. **The clau-18 line is now definitively closed on primary evidence rather than on
metropolitan analogues.**

---

## §5 — ⚠⚠ BARCELONA-EXCLUSIVE ARTICLES EXIST — and one of them contradicts a number we shipped today

Page 185 opens a section of articles marked ***"(d'aplicació exclusiva al municipi de Barcelona)"***,
approved by the Subcomissió d'Urbanisme de Barcelona **20 October 2004, DOGC 4277 of 10/12/2004**.
**This is the 08019-specific source three research rounds could not locate.** It contains at least:

- **Art. 317** — *Estàndards en operacions de reforma interior*, **Zona de Nucli Antic (12)** ⟵ the
  clau-12 article we had been unable to identify
- **Art. 323** — *Nombre màxim d'habitatges per parcel·la*, for **subzona I intensiva (13a)** and
  **subzona II semiintensiva (13b)**
- A reforma-interior standards table: **Intensiva (13a) vials 28,80% / espais verds 25,70%** ·
  **Semiintensiva (13b) 24,50% / 17,50%**

### 🔴 THE URGENT PART — our Art. 323 figure is probably wrong for Barcelona

Our 13b pack records **Art. 323 as a cap of 250 habitatges/ha**, and **I shipped that figure into the
Capacity panel today.** The Barcelona-exclusive Art. 323 on page 185 states a **different rule**:

> *"…no podran depassar per parcel·la un nombre d'habitatges igual al que resulti, per excés, de
> dividir la **superfície construïda** pel **mòdul de 80 m²**."* — with *superfície construïda*
> defined as the area between the building's exterior enclosures, **including** light wells and
> ventilation courts and **excluding** *cossos sortints* and any ground-floor area beyond the
> *fondària* of the upper storeys.

**That is a per-parcel dwelling count derived from constructed area ÷ 80 m² — not a density per
hectare.** ⚠ **This is a different SHAPE of rule, not a different number**, which is the L-526
failure class.

⇒ **ACTION: verify page 185's Art. 323 in full and correct the 13b pack and the Capacity panel
before either is quoted to a user.** Do not assume the 250 hab/ha figure is simply superseded —
establish whether it was ever Barcelona's rule at all.

⇒ **And note the good news buried in it: `superfície construïda ÷ 80 m²` IS COMPUTABLE from our
envelope.** Unlike a density-per-hectare cap it needs no site plan. If confirmed, the Capacity
section stops saying *"Not yet evaluated"* and starts returning a number.

---

## §6 — What this unblocks

| clau | before | now |
|---|---|---|
| **22a** (17.5%) | blocked on Art. 350.c | ✅ **fully sourced** |
| **20a** (~10.5%) | blocked on Art. 340.1 alignment | ✅ **fully sourced** |
| **12** (9.5%) | height article unknown | 🟡 **Art. 317 located** (Barcelona-exclusive, p. 185) — needs full read |
| **18** (22.5%) | delegation unconfirmed | ✅ **closed on primary evidence** (Art. 339.2) |
| 13b Art. 323 | believed 250 hab/ha | 🔴 **contradicted — must re-verify** |

**⇒ Roughly +24 points of end-to-end capability moved from "blocked on human sourcing" to "ready to
encode", and the whole PGM is now a local, greppable, coordinate-addressable primary source.**

⚠ **Still to confirm:** whether page 111's footnote-54 Barcelona modification changes 20a's indices,
and whether Art. 350 carries a Barcelona-exclusive override of its own. **The volume flags its
per-municipality modifications by footnote — check every article we encode for one.**
