# AMB BASE LADDER DELTA — the 36-municipality census, re-run under the base metropolitan ladder

**Run it:**

```bash
python corpusVerify.py        # the footnote apparatus, from the committed PDF
node   prefetchFrames.mjs     # warm the Catastro parcel frames (idempotent)
node   rerunCensus.mjs        # the measurement — both arms, one process, one parcel draw
```

Seeded (`SEED = 20260802`, identical to `task5`), re-runnable, all inputs public.

## The verdict

| | |
|---|---|
| **CONTROL** | Barcelona byte-identical — **PASS**. 89 claus · 5,073 OV polygons · 34.03 %, and **zero** movement between the arms. |
| **COVERAGE** | ⭐ **DELTA ZERO EVERYWHERE.** No envelope %, OV %, ladder % or QUAL_MUNI % moved by a single parcel, in any of the 36. |
| **HEIGHT** | ⛔ **DELTA MOVES — 25 municipalities**, 16,980 parcels, every value **LOWER**. Mean −0.87 … −1.46 m, range −0.75 … −2.10 m. |

**The two are not in conflict — they are answers to different questions**, and the whole point of
this run is that the published census never asked the second one.

## Why coverage cannot move — two independent arguments, both asserted in code

1. **No ladder is in the decision path.** The envelope route is decided by `parsePlantes()`
   returning a storey count, by QUAL_MUNI field presence, and by clau membership in the registered
   pack set. No height table is consulted to decide any branch. The height is computed *after* the
   route is chosen and cannot change it. `task5` says so itself: *"`PLANTES` is a storey count, not
   a height in metres. Nothing in this file converts it."*
2. **The two tables share a band structure.** Measured from the parsed sources, not assumed:
   identical width boundaries, identical storey counts, `floorsChange` zero in every band.

⇒ The zero is **structural**, and it holds for any future census that threads heights through.
**It is not a null result and it is not a noise floor.** Both arms scored the *same parcels* in the
*same iteration*, so the zero is arithmetic, not statistical — the ±1.05–1.66 pp sampling CIs on
the 12 sampled municipalities **do not apply to it**.

## What the files are

| file | what it does |
|---|---|
| `ladderTables.mjs` | Parses all four ladders **from the rulepack `.ts` source**, never hand-typed. Asserts the SIG-2 fingerprint and the band-structure identity. |
| `ladderSelect.mjs` | The pre-committed fix shape: Barcelona / Badalona / base / **REFUSE**. Emits **attribution and value as two separate verdicts.** |
| `corpusVerify.py` | Reads footnotes 49/50 out of the committed compendium PDF, including the §GLYPH-SHIFT recovery. |
| `ambService.mjs` | AMB reads. Keyed on `CODI_INE` everywhere; every walk reconciled against `returnCountOnly`. |
| `catastroParcelFrame.mjs` | §COPIED-FROM `tools/cold-start-probe/`, verbatim but for a read-through cache. |
| `rerunCensus.mjs` | The measurement. |
| `out/proposed-diff.txt` | ⛔ The fix **as text, unapplied.** |

## Three guards that fired, and what each one caught

- **The SIG-2 fingerprint.** The first table extractor anchored on the constant *name*, which is
  MENTIONED in a comment 66 lines before its declaration — with no `=` in between, so the regex ran
  on to the *next* `Object.freeze([`, which is **Barcelona's table**. The base ladder was being read
  as Barcelona's. ⭐ **Every delta would have been exactly zero and the run would have looked
  clean.** Only a known answer catches this class.
- **The decomposition assertion.** `byStorey` first keyed on the storey count alone, so a clau-13b
  parcel (Art. 328) and a clau-18 parcel (Art. 327) with the same storey count collapsed into one
  row carrying one of their two heights — the same many-to-one collapse that produced `task5`'s
  retracted T3 result.
- **The tempered footnote regex.** The greedy version produced "municipality" names 200 characters
  long containing three other municipalities. An enumeration whose members are not atoms has not
  enumerated anything.

## What this run did NOT measure — stated so absence is not read as cleanliness

- **`resolveAlcadaReguladora()`** (the *width*→height ladder, `PGM_REGIONAL_PACK`) has the **same
  defect** — no municipality parameter, reads Barcelona's table unconditionally. Measuring it needs
  the *ample oficial del carrer*, which is not published machine-readably. **OPEN, not absent.**
- **21.6 % of comparable parcels are masked by the extrapolation branch** (`§EXTRAPOLATION-
  DISCONTINUITY`), where both arms compute the same number. **The height delta below is a LOWER
  BOUND.**
- **Anything after 31-12-2009.** The compendium is consolidated only to that date and declares
  itself *«merament divulgativa»*. Absence from its apparatus is `not-recorded-in-this-source`,
  **never** `does-not-exist`.
