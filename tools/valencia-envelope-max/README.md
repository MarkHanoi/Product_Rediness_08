# València envelope maximum — the register census, finished

Sibling of [`../valencia-grammar-probe/`](../valencia-grammar-probe/) and
[`../valencia-register-probe/`](../valencia-register-probe/), both read-only inputs.

**This run was PARKED mid-flight by the coordinator.** Tasks 1 and the denominator half of
Task 2 are measured and re-runnable; the setback-parameter extraction and the FAR tier were
stopped before execution. What is and is not measured is stated in full at the bottom — nothing
here is estimated, and no number is carried over from a run that did not produce it.

---

## ⛔ THE HEADLINE — THE n=3 FINDING DOES NOT GENERALISE

The prior probe opened **three** registers, found three image-only scans, and said so honestly:
*"539 of 542 registers unopened — region-wide is UNTESTED."*

Region-wide, it is now tested. **542 registers sniffed. 530 opened. 49 of them carry a
TEXT-LAYER ordenanza — 9.25%.** Not one of the three purposively-sampled municipalities was
among them, which is why n=3 saw 0/3.

| | n | % of opened |
|---|---|---|
| **TEXT-LAYER** (text, no raster) | 12 | 2.26% |
| **TEXT+RASTER** (text plus figures) | 37 | 6.98% |
| **⭐ text-layer, either form** | **49** | **9.25%** |
| **SCAN** | 476 | 89.81% |
| UNDECIDED-IN-HEAD | 5 | 0.94% |
| *not opened* (6 × register root 404, 6 × no candidate located) | 12 | — |

**Of the 476 scans, 11 are JBIG2 — 2.31%.** Dominant codec across scans:
JPEG 259 · CCITT G4 145 · JPX 61 · JBIG2 11.

⛔ **A JBIG2 ORDENANZA MUST REFUSE WITH THE CODEC NAMED.** JBIG2's symbol-matching mode has a
documented digit-substitution failure mode — visually similar glyphs silently replaced, no
visual artefact — which sits *upstream of OCR*. For a document whose entire value is heights
and setbacks in metres that is a correctness defect, not a confidence score. València capital's
own PGOU 1988 (376 pp) is one of the 11.

### Both error directions were tested, and both came back clean

| direction | test | result |
|---|---|---|
| **FALSE TEXT** — head says text, document is a scan | all 49 downloaded WHOLE, poppler run on each | **49/49 CONFIRMED**, 18–839 pp, 4k–968k chars |
| **FALSE SCAN** — head says scan, text starts past 512 KB | seeded n=80 of 447 scans, second 512 KB window read at 40% of file length | **0/80** — 0 errors, no flips |

The false-SCAN direction is the one that matters, because it is the direction the classifier
demonstrably failed in (see the calibration below). At 0/80 the 89.81% scan share is not
detectably inflated by the head window.

⚠ **One window at 40% BOUNDS that error, it does not eliminate it.** A document that turns to
text only in its final third would still be missed.

### What the 49 are, and why it matters

They are not amendments. The located paths are overwhelmingly
`… / 3 NORMAS URBANÍSTICAS / …NNUU.pdf` under a **base** `PLAN GENERAL` / `PGE` expediente, and
poppler reads real ordinance prose out of them — 18 to 624 pages, 4k to 968k characters.
Castelló de la Plana (12040), a provincial capital, has a **2021 Plan General with text-layer
normativa**. Most of the rest are LOTUP-era plans from 2012–2024.

This refutes the prior probe's reading that the born-digital corpus is only single-article
amendments and *"the base plan is the scan"*. For these 49 municipalities **the base plan is
text**.

### ⚠ And it prices smaller than it counts

| | km² | % of regional buildable land |
|---|---|---|
| buildable land of the 49 text-layer municipalities | 131.94 | **8.29%** |
| of which private developable | 112.18 | 7.05% |
| of which industrial (setback family) | 15.44 | **0.97%** |

⛔ **STATE THE WEIGHTING.** Those are AREA-weighted, against the 1,590.67 km² regional buildable
denominator measured in step 5. By municipality COUNT the same finding is 9.04% (49/542). The
two agree here — but they disagreed 7× earlier in this corpus, so both are stated.

The text-layer municipalities are overwhelmingly **small rural ones in Castelló province**.
The route is real; it is not where the population is.

---

## ⛔ THE CALIBRATION FAILED, AND THAT IS THE MOST IMPORTANT THING IN THIS DIRECTORY

The prior probe calibrated its 512 KB head sniff against **four files — all four scans**. A
classifier that returns SCAN unconditionally scores 4/4 on that. *A control that cannot fail is
not a control.* So this run's calibration carries both arms: 4 known scans **and** 5 known text
documents.

**It failed on the first run, 4/5 on the TEXT arm.** `12135-1111 Memoria y Normas_.pdf` — 21
pages, 32,121 characters of ordinance prose — came back SCAN.

The whole 809 KB file was downloaded to explain the mismatch rather than tune around it:

| | measured in the FULL file |
|---|---|
| `/FontFile*` | **0** |
| `/Type /Font` | **0** |
| `/ObjStm` | 15 |
| scan-codec images | 4 |
| poppler | **32,121 chars / 21 pp** |

Two independent things defeat the font test at once. Fonts may be **non-embedded** (base-14
Helvetica/Times referenced by name — there is nothing to embed), and font **dictionaries**, being
plain objects rather than streams, are exactly the kind of object that *can* be compressed into
an `/ObjStm` and vanish from a byte scan. The prior probe's ISO 32000-1 §7.5.7 reasoning is
correct but points the other way: it guarantees `/FontFile` is *visible*, not that it is
*present*.

⇒ **`/FontFile > 0` is SUFFICIENT for born-digital and is NOT NECESSARY.** The prior probe's
SCAN counts — including *"every 1990s and 2000s document sampled is a scan"* — are biased upward
by an unmeasured amount.

**The fix** ([`pdftext.mjs`](pdftext.mjs)): classify on **painted text** — `Tj`/`TJ` operators
inside an *inflated* content stream. A content stream **is** a stream, so §7.5.7 applies in the
direction that helps: it can never hide in an `/ObjStm`. Truncated heads are inflated with
`Z_SYNC_FLUSH` so a 512 KB window still yields its partial output.

**The threshold is measured, not chosen.** Pass 1 measures both arms; the threshold is the
geometric midpoint of the measured gap; pass 2 re-scores. The run demands a ≥5× gap — if the
arms overlapped, no constant could rescue the sniff and the sweep would not run at all.

```
SCAN heads: 0, 363, 581, 0        TEXT heads: 34059, 31734, 19067, 34484, 28575
gap 581 → 19067 (×32.8)  ⇒  TEXT_MIN = 3328 chars per 512 KB head
SCAN arm 4/4   TEXT arm 5/5   CALIBRATION PASSED
⛔ the FONT test the prior probe used would score: SCAN arm 4/4, TEXT arm 4/5
```

### The locator was calibrated too

542 exhaustive register walks is ~200k requests. The walk here is **targeted** (~8 requests per
municipality, 4,510 total) and scored, and it was checked against the three registers the prior
probe walked exhaustively: **3/3, top-ranked candidate exactly right** —
`46250 → 3 NORMATIVA/…NORMAS URB.pdf`, `12135 → 2 Memoria/…NNUU-1.pdf`,
`03130 → 3 NORMAS URBANISTICAS/….pdf`.

---

## ⭐ NATIONAL FINDING — `profundidad`, not `fondo`. VALÈNCIA IS AFFECTED. MEASURED.

Raised by the coordinator from a Málaga defect (Art. 12.2.14 defines `profundidad edificable`
and never uses the lexeme `fondo`). Tested here against **primary source text** — 35 València
ordenanzas already extracted to disk by this run, not a search-engine summary.

| lexeme | documents carrying it |
|---|---|
| `fondo` / `fons` | 21 |
| `profundidad` / `profunditat` | **26** |
| the compound `profundidad edificable` | **18** |
| **union carrying depth vocabulary** | **29** |

⛔ **A `fondo`-shaped search misses 8 of the 29 — 27.6%.** The eight are
`03026 12001 12007 12040 12093 12099 12114 12133`. Three go the other way (`03015 12034 46055`).

**12040 is Castelló de la Plana**, a provincial capital: it carries `profundidad`, and **zero**
`fondo`. And the term is *defined* normatively, not used in passing — Benlloc (12029):
> *"…profundidad edificable como la distancia desde la alineación…"*

⇒ **Any València depth finding established with a `fondo`-shaped search is UNSAFE and should be
re-run with `profundidad|profunditat|prof*` in the pattern.** This run cannot speak to the
"696 swept layers" sweep — it did not perform it. It can speak to two things it holds directly:

- **The WFS attribute layer is clean either way.** The full 78-field union across all six
  typenames of `0702_Planeamiento` was stem-tested here: `prof` **0 hits**, `fond` **0 hits**,
  `fons` **0 hits** — and `alt` **0 hits** too. The absence of buildable depth *as a field* does
  not depend on which lexeme you search for.
- **The ICV published data model** (`0702_urbanismo_planeamiento_mdatos.pdf`, text-extracted)
  contains neither `profundidad` nor `fondo`.

So: the field really is absent from the regional layer, **but the document-level depth finding is
lexeme-dependent and València's ordenanzas do use `profundidad`.**

---

## TASK 2 — the denominator, and why 15.85% is a FLOOR rather than an answer

`dotacion` on `ms:Planeamiento.Zonificacion` is the public-systems marker, established by
opening it rather than assuming it: 31 distinct values on València capital's 3,589 polygons —
`PV`/`SV` zonas verdes, `PQ*`/`SQ*` equipamiento (docente, sanitario, deportivo, infraestructuras),
`PC*`/`SC*` comunicaciones, red viaria and ferrocarril explicitly *"(dominio público)"*.

**542-municipality area census, EPSG:25830, exterior minus interior rings:**

```
region                     23 275.03 km²   ⭐ reproduces the prior independent census ×1.0000
buildable (SU + SUZ)        1 590.67 km²   = 6.83% of region
  ├ public / systems          252.13 km²   = 15.85% of buildable
  └ private developable      1 338.55 km²  = 84.15% of buildable (5.75% of region)
industrial (ZUR-IN+ZND-IN)    307.36 km²   = 19.32% of buildable; private 274.73 km² = 17.27%
```

The ×1.0000 reproduction of a census computed by a different probe, on a different day, from a
different query is a genuine **external** control — not a `Clasificacion`-vs-`Zonificacion`
self-comparison, which is two views of one table and structurally guaranteed to agree.

### ⛔ BUT: 15.85% IS NOT COMPARABLE TO BALEARS' 32.55%

`PCV`+`SCV` — red viaria, dominio público — total **~24.6 km² across all 1,590.67 km² of
buildable land, about 1.5%.** Street surface in a Spanish town is nothing like 1.5% of its urban
land. Before reporting the difference from Balears as a fact about València, that had to survive
the obvious alternative: *the street network may simply not be in the field.*

⛔ Σ area cannot decide it. The prior probe's Σ zonificación ÷ municipal area = 1.020 for
València is consistent with **both** readings — urban land is ~15% of that municipality, so even
a 20% street hole moves the ratio by 3%, inside the noise and cancellable against overlap
elsewhere. **A test that cannot separate two hypotheses is not a test.**

So [`05b-street-holes.mjs`](05b-street-holes.mjs) decides it geometrically: raster-sample a
1 km × 1 km box of dense urban fabric at 2 m and measure what fraction falls inside **any**
Zonificacion polygon. The box is **selected by the data** (the cell with the most urban-fabric
area), not typed by hand.

| | coverage | fabric in box |
|---|---|---|
| València capital | 100.00% | ZUR-NHT 85.1%, ZUR-RE 12.1% |
| Vila-real | 100.00% | ZUR-RE 96.7% |
| Alacant | 100.00% | ZUR-RE 93.1% |
| Castelló de la Plana | 100.00% | ZUR-RE 80.0% |
| Gandia | 100.00% | ZUR-RE 28.3% |
| Tollos | 99.97% | — |

⇒ **PARTITION, 6/6. The streets are INSIDE the zone polygons.** The local street network is not
separately mapped, so `dotacion` captures only red primaria/secundaria equipamiento and open
space.

⇒ **15.85% is a FLOOR on public land, and 84.15% is a CEILING on private developable — it still
contains the street network.** The true private share is lower by an amount this layer cannot
measure. Measuring it needs an independent parcel source (Catastro cadastral geometry); that is
**not done here** and is not estimated.

**⛔ SELF-CORRECTION, RECORDED.** The first box selector maximised the *count* of fabric polygons
per cell. For València that chose a cell 44.6% `ZRP-NA-LG` / 42.4% `ZRP-CA` — the **Albufera
natural park**, where the layer carries many tiny dispersed ZUR-RE polygons. A box that is mostly
protected wetland measures nothing about street geometry, and its 100% coverage was an artefact
of my selector, not a finding. Counting polygons rewards fragmentation; the quantity that means
"dense urban fabric" is **area**. Both the broken and the fixed result are in the file.

---

## Run

```bash
node 01-urlabs.mjs        # 542 register roots; filter gate both halves; hits-reconciled
node 02-locate.mjs        # targeted register walk → ranked ordenanza candidates
node 02-locate.mjs 46250 12135 03130   # LOCATOR CALIBRATION against the prior exhaustive walks
node 03-sniff.mjs         # ⭐ THE CENSUS — two-pass calibration, then 542 × 512 KB Range sniff
node 04-verify.mjs        # 4a: opens all 49 TEXT documents in full (49/49 confirmed)
node 04b-false-scan.mjs   # ⛔ the FALSE-SCAN direction, standalone — 0/80
node 05-denominator.mjs   # public/systems vs private developable, 542-municipality area census
node 05b-street-holes.mjs # ⛔ is the dotacion split the public share, or only the named part?
node 07-far-tier.mjs      # ⚠ WRITTEN, NOT RUN — see below
```

`_docs/` and `*.log` are gitignored. `_*.json` are the measured results.

---

## ⛔ WHAT THIS RUN DID **NOT** MEASURE

Stated, not estimated. The run was parked; these are open, not answered.

- **The setback floor — the whole of Task 2's drawable number — was NOT extracted.** No
  parameter regex was run over the 49 text-layer ordenanzas. The `MAXIMUM DRAWABLE` line of the
  requested report **has no measured value** and is deliberately left blank rather than filled
  with an inference. What is known is the **ceiling**: those 49 municipalities hold 8.29% of
  regional buildable land, of which 0.97 points are industrial.
- **`07-far-tier.mjs` is written and committed but was never executed.** The FAR tier's
  area-weighted share of buildable land is therefore **unmeasured**. The prior probe's
  count-weighted figures (8,446 sectors, FAR derivable on 87.40%, median 0.574, zero-as-null
  confirmed by contradiction) stand as *its* result and were **not** re-derived here.
- **The private-developable denominator is a CEILING**, not a measurement — it still contains
  the street network (see above). No Catastro cross-measurement was attempted.
- **12 of 542 registers were never opened**: 6 roots return HTTP 404, 6 yielded no candidate the
  locator recognised. Six 404s are a fact about the register; six NO-CANDIDATEs are **a miss of
  this probe**, not evidence about those municipalities.
- **5 registers are UNDECIDED-IN-HEAD** and their resolution was in progress when the run was
  parked.
- **No OCR was attempted**, so the achievable accuracy of the OCR route over the 476 scans is
  untested. "Expensive" still means "needs OCR plus a digit-integrity gate", not "proven to fail".
- **The false-SCAN bound is ONE window at 40% of file length**, n=80 of 447. It came back 0/80,
  but a document that turns to text only in its final third would still be missed. The bound is
  real; it is not a proof.
- ⛔ **That arm exited 0 and wrote nothing when it ran inside `04-verify.mjs`** — it printed its
  header and stopped. An exit code of 0 with no output is a tool failure wearing the costume of a
  result. It was split into [`04b-false-scan.mjs`](04b-false-scan.mjs) and re-run standalone,
  where it produced 80 clean probes and 0 errors. The 0% is from the standalone run. **The cause
  of the in-place silent exit was not diagnosed** — the run was parked first.
- **The 542 sniffs each read one document** — the top-ranked ordenanza candidate. A municipality
  whose normativa is filed somewhere the locator's vocabulary does not reach would be scored on
  the wrong file. The locator scored 3/3 on the only three cases with independent ground truth.
