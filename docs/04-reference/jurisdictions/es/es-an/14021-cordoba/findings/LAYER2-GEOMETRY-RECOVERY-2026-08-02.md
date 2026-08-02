# Córdoba — LAYER 2: WHAT IS COMPUTABLE WITHOUT ZONING

> **Stamp 2026-08-02.** Founder directive: *"Don't wait for full zoning. Recover everything possible."*
> **Layer 1** (which *ordenanza* applies) is BLOCKED by **D-002** — not this file's problem.
> **Layer 2** (given a known ordinance, can its geometric inputs be computed from authoritative data?)
> is this file.
>
> ⚠ `ide.cordoba.es` is used **only** where it supports independent rule computation. It has **no
> calificación** and is **never** a zoning substitute (founder, explicit).

---

## HEADLINE

| | |
|---|---|
| ⭐ **Block ring — RECOVERED, and on better provenance than we had** | `idecordoba:manzana` publishes **20 730 city blocks municipality-wide**. **421 of 453 ordenanza polygons (92.9 %), = 88.0 % of pilot ordenanza land**, fall inside one. This is *published* geometry, not a ring we reconstruct — a stronger ADR-0283 footing than our own cadastral dissolve. |
| ⛔ **Street width — NOT RECOVERABLE. `sup_viales` FAILS the ADR-0285 test** | Neither publisher serves **any** alineación layer, and the proxy would be void anyway: **45.4 % of street polygons sit within ±1 m of an MC-1 band edge** → ADR-0287 refusal. **Row 25 is CLOSED as tested-and-negative.** |
| **Net effect on the ENVELOPE axis** | **0.0 pp today.** Layer 2 removes *future* work; it unlocks nothing while D-002 and the gate hold. Stated plainly so this is not read as a coverage gain. |

---

## TASK 1 — THE ORDINANCE-VARIABLE INVENTORY

Every geometric input the transcribed PGOU-2001 ordenanzas require, against authoritative Córdoba
geometry. *(Sources: `findings/OCR-EXTRACTION-RESULTS.md` §2 for the variables; live probes 2026-08-02
for the supply.)*

| Geometric input | Required by | Authoritative supply | State |
|---|---|---|---|
| **Parcel boundary** | every family (ocupación, parcela mínima) | Catastro INSPIRE CP | ✅ **SOLVED** — PARCEL axis **95 %** (120/120 probed, 0 failures) |
| **Parcel area** | parcela mínima (MC 150/500 m², CTP 70 m²); CTP-1 ocupación step (100/125 m² bands) | Catastro `areaValue`; COACo `vcatastro_urbanismo.sup_pc_m2` on **5 721 of 5 725** pilot parcels | ✅ **SOLVED** — the blocker-16 step-function hook needs code, not data |
| **Block ring** | alignment zones (MC, CTP), depth reasoning | ⭐ `idecordoba:manzana` — **20 730 blocks, 88.0 % of pilot ordenanza land** | ✅ **RECOVERED THIS PASS** (was: reconstruct via dissolve) |
| **Block ring (fallback)** | as above, where no manzana is published | `dissolveParcelsToBlockRing` — Catastro **76.9 %**, COACo **88.5 %** | ✅ already measured; the two are complementary |
| **Front alignment (setback = 0)** | MC 13.5.2.3 · CTP 13.8.2.1 · UAD — *"fachada on the vial line"* | **No alineación layer exists** — but the rule is *setback zero*, so the buildable front **is** the parcel's street-facing boundary | ✅ **SOLVED WITHOUT AN ALINEACIÓN** — a zero setback needs adjacency, not a published alignment line |
| **Profundidad edificable — MC** | 13.5.2.4 | **none needed** — the article makes depth *libre*, bounded by ocupación (**D3**) | ✅ **NO GEOMETRY REQUIRED** |
| **Profundidad edificable — UAD** | 13.9.3.3 — UAD-1 **16 m** · UAD-2 **18 m** · UAD-3 **16 m**, *measured from the vial alignment* | the depth is a **stated scalar**; it is measured inward from the street-facing boundary | ✅ supply is fine — **blocker 4 is pure code** (and it is the one OVER-stating row) |
| ⛔ **Street width** | **MC altura, Art. 13.5.3.1** — bands 8/10/14/16 m. **16.86 pp of pilot buildable land** | ⛔ **NOTHING QUALIFIES** — see below | ⛔ **NOT RECOVERABLE** |
| **Edificabilidad** | MC-1/2/4, CTP-1, IND-1/2/3 | — *"resultante de la aplicación de las Normas de composición"* | ⛔ **permanently `null`** — an algorithm, not a quantity (ADR-0271) |

⇒ **Eight of the nine inputs are supplied.** The single unsupplied one is street width, and it gates
exactly one family.

### Why `sup_viales` cannot drive the MC height table — ADR-0285's four-part test, applied

| Part | Verdict | Evidence |
|---|---|---|
| **1. The criterion is stated by the ordinance** | ✅ **HOLDS** | Art. 13.5.3.1 keys *plantas* to street width, transcribed band-for-band: MC-1 ≤8→PB+2/9,75 m · ≤10→PB+3 · ≤14→PB+4 · ≤16→PB+5 · >16→PB+6; MC-2/MC-4 ≤10→PB+2 · >10→PB+3; MC-3 ≤10→PB+2 · ≤15→PB+3 · ≤20→PB+4 · >20→PB+5 |
| **2. The method is unprescribed** | ⚠ **UNVERIFIED — and it is a real gap** | The dossier records the *bands* but **never recorded what the width is measured between**. `O_MC2.pdf` cannot be read here: it is **3 230 vector-path operations, zero text ops, zero image XObjects** — so both a text pull and an image extract return nothing. ⚠ Incidentally this **corrects `OCR-EXTRACTION-RESULTS.md` §1**, which files the MC documents as *"clean-raster → render 200 dpi"*: they are **vector**, not raster. |
| **3. The input is authoritative published geometry** | ⛔ **FAILS** | **Exhaustive search of both publishers' complete inventories** (ide.cordoba.es 105 WFS + 119 WMS; COACo 15) against `/aline\|rasant\|retranq\|fondo\|profundid\|frente\|fachada/i`: **zero alignment layers**. The only `rasante` hits are Catastro built-area hex grids. ⚠ **This is exactly where Córdoba differs from Murcia.** SIG-MU2 succeeded because Murcia publishes `Murcia:pgou_alineaciones` and the PGOU measures *between alineaciones*. **Córdoba publishes no such layer.** `sup_viales` is the municipal **street register/callejero** (`ine_via`, `dgc_via`, `competenci`, `fuente`) — the **physical street surface**, a different object from a legal alignment. Substituting it changes the criterion, which is derived **law** and forbidden by **ADR-0284**. |
| **4. The computation is reproducible** | ✅ achievable | deterministic from geometry |

**Part 3 alone is fatal.** But the proxy was measured anyway, because a measured negative is worth
more than an argued one — characteristic width `w = 2·Area/Perimeter` over all **6 529** street
polygons:

| | p05 | p25 | **median** | p75 | p95 | max |
|---|---:|---:|---:|---:|---:|---:|
| width (m) | 3.39 | 6.26 | **9.12** | 13.38 | 27.76 | 5 836.8 |

The distribution is *plausible* for Córdoba's fabric — and that is the trap. The decisive number is
the **band-edge proximity**, because MC's bands are 8/10/14/16 m, i.e. **2 m apart**:

| within ± of an MC-1 band edge | share of street polygons | consequence |
|---|---:|---|
| ±0.5 m | **22.5 %** | ADR-0287 refusal |
| **±1.0 m** | **45.4 %** | ADR-0287 refusal |
| ±2.0 m | **64.3 %** | ADR-0287 refusal |

⇒ **Even if part 3 were satisfied, ADR-0287's refusal duty would void 22–45 % of the answers**, because
the bands are tighter than any credible uncertainty on a proxy geometry. `max = 5 836 m` also shows
some `sup_viales` features are whole street networks, not segments, so `2A/P` is not a per-frontage
measurement at all. **Row 25 closes: tested, negative.**

---

## TASK 2 — REPRODUCIBILITY OF THE COACo VECTORISATION

**What could NOT be established here, stated first:** a raster↔vector overlay was **not** performed.
This environment has no PDF/raster rasteriser (`pdftoppm` absent; no canvas backend), and the MC
ordinance PDFs are vector-path documents that neither a text pull nor an image extract can read. **No
claim is made about geometric fidelity to the CUS sheets.**

**What WAS established — and it changes the sizing.** Per-sheet vectorisation yield, by joining the
453 ordenanza polygons to the 8 `hojas_cus` footprints:

| Sheet | polygons | ordenanza land | **% of sheet area** |
|---|---:|---:|---:|
| CUS41W | 185 | 613 579 m² | **29.7 %** |
| CUS25W | 146 | 632 558 m² | 10.2 % |
| CUS46W | 40 | 215 229 m² | 10.4 % |
| CUS34W | 52 | 106 627 m² | 5.2 % |
| CUS26W | 29 | 59 628 m² | 2.9 % |
| **CUS45W** | **1** | **995 m²** | **0.0 %** |

⚠⚠ **THE VECTORISATION IS NOT UNIFORM, AND THIS CORRECTS MY OWN ESTIMATE FROM YESTERDAY.** The
source-search findings file sized blocker 22b using *"≈ 0.27 km² per sheet"* — the mean of
1.63 km² over 6 sheets. The real range is **995 m² to 632 558 m², a 636× spread**, and **CUS45W is
listed as vectorised while carrying one polygon.** ⇒ **The "≈ 1.0 % after blocker 22b" figure in
`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md` §12 is far less reliable than it was presented**, and
should be read as *"unknown, plausibly 0.7–1.3 %"* until CUS18W/CUS19W are actually characterised.
A mean over a 636×-spread population is not a forecast. *(Same error class as the n=1 and n=3 samples
this dossier has now caught three times.)*

**What this buys, and what it does not.** It is evidence that "8 sheets vectorised" overstates what
COACo did — **6 distinct sheets, of which 2 are token**. That is a *methodology* observation and a
sharper number for the GMU ask. It is **not** authority: **D-002 and ADR-0288 stand, and nothing here
authorises publishing derived zoning.**

---

## TASK 3 — THE COVERAGE LOSS MATRIX

Accounting for **100 %** of Córdoba's non-envelope land. Denominator: **SUELO URBANO
33 341 928.156 m²** (SIU, in force). Today's envelope share is **0.0 %**, so the four buckets must
account for **100.000 %** — and the point of the matrix is that "0.0 %" hides four different causes
with four different owners.

| Bucket | Share of SUELO URBANO | What it is | Owner · exit |
|---|---:|---|---|
| **① Legally impossible** | **2.962 %** | 2.185 % delegated to a Plan Parcial/PERI/ED/Plan Especial (44.73 % of ordenanza land) + 0.667 % lucrative `usos_globales` (48/48 carry an `actuacion`) + 0.109 % legally-grounded refusals (Arts. 13.4.1 · 13.3 · 13.12.2) | ⛔ **nobody.** Permanent. A cited refusal is the correct answer (C63 §1.5 / L-656) |
| **② Data unavailable** | **94.448 %** | land with no machine-readable calificación — the 41 unpublished CUS sheets | **founder** · GMU serves the 41 sheets or refuses in writing (**D-002**) |
| **③ Engineering not yet implemented** | **2.583 %** | 1.702 % PGOU-direct + packed, blocked only by blockers **3** (resolver uncalled) and **4** (UAD depth) · 0.880 % MC, blocked on the street-width table | **the Córdoba agent** · resolver called, UAD depth packed. ⚠ MC's 0.880 % **migrates to ④** — see below |
| **④ Awaiting authoritative interpretation** | **0.008 %** *(+0.880 % migrating from ③)* | Unifamiliar Aislada — `O_UAS1.pdf` is a 69-byte dead page, no held document carries the chapter. **Plus MC's 0.880 %**: Art. 13.5.3.1's measurement basis is unread and no alineación is published, so it needs GMU/COACo to state the basis or publish the geometry | **COACo / GMU** · publisher restores the document; states the MC measurement basis |
| **Σ** | **100.000 %** | | |

⚠ **THE ONE CATEGORY MIGRATION IN THIS PASS, WITH ITS EVIDENCE** (the standard requires both):
**MC's 16.86 pp of pilot buildable land (0.880 % of SUELO URBANO) moves ③ Engineering → ④ Awaiting
authoritative interpretation.** Blocker 8 was Engineering on the belief that a width source merely
"must be CONSTRUCTED". Measured: **no alineación is published by either publisher**, the ordinance's
measurement basis is **unread and unreadable from the served PDF**, and the only candidate proxy fails
ADR-0285 part 3 and would be voided for 22–45 % of streets by ADR-0287. **It is not ours to build.**

⚠ **What Layer 2 changed: ③ shrank and got cheaper, but its SIZE did not move.** Blockers 3 and 4 were
already the only things standing between 1.702 % and an envelope; what this pass did is confirm their
*inputs are all supplied* (block ring, parcel, area, front alignment, UAD depth) — so ③ is now
**pure code with no data dependency**, which is exactly the "reduces future work dramatically" the
directive asked for. **It is not a coverage gain, and the ENVELOPE axis stays a measured 0.0 %.**

---

## What to do next, in order

1. **Blockers 4 then 3** (③, ~2–3 eng-days, no data dependency) — then and only then blocker 2.
   Gate sequencing is unchanged: flipping the gate first ships the L-616 overstatement on UAD-3's
   31 505 m².
2. **Bind `idecordoba:manzana` as the primary block-ring source**, with the cadastral dissolve as
   fallback. Published geometry outranks a reconstruction under ADR-0283. Covers 88.0 % of pilot
   ordenanza land and the whole municipality.
3. **Add to the GMU ask** (D-002): the **alineaciones** layer, and a statement of **Art. 13.5.3.1's
   measurement basis**. Both are now known to be the difference between MC computing and refusing.
4. **Do NOT** vectorise (D-002), and **do NOT** substitute `sup_viales` for an alineación.

---

*Authority: ADR-0283 · ADR-0284 · ADR-0285 (four-part test) · ADR-0286 · ADR-0287 · ADR-0288 ·
D-002 · BLOCKER-CLASSIFICATION-STANDARD · C58 · C63 §1.5 · L-616 · L-656.
All probes run 2026-08-02, reproducible from the URLs in this file. Sibling:
[`MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md`](./MACHINE-READABLE-SOURCE-SEARCH-2026-08-02.md) ·
[`../CLOSURE-REGISTER.md`](../CLOSURE-REGISTER.md).*
