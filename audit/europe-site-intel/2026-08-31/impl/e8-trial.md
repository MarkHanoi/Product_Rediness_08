# LANE E8-TRIAL — THE MEASURED PRECISION TRIAL

**Date** 2026-09-02 · **Status** COMPLETE, and the run is **NOT PENDING** — the spine lane
landed during this lane, so both a BEFORE and an AFTER were measured against one gold set.
**Nothing committed. No production file written. No schema touched.**

> ## ⛔⛔ THE ONE SENTENCE THAT GOVERNS EVERY NUMBER BELOW
> **This trial is a SELF-ASSESSMENT. `E8_GOLD_SET.humanConfirmed === false`.** Every gold
> value was derived by ONE AGENT reading the source PDFs on 2026-09-01. No planner, no
> lawyer, no reviewer has signed a single row. Until a named human confirms or corrects the
> set, **no figure here may be quoted as a validated precision figure** — only as an
> UNCONFIRMED-BY-HUMAN reading. The set is built to make confirming it cheap: every row cites
> a page and either a verbatim sentence or a pdf.js column coordinate.

---

## A · WHAT THIS LANE WAS ASKED FOR, AND WHAT IT DID

The plan requires precision to be measured against a human-labelled sample **before** any bulk
run. A human could not be recruited, so the honest version was built:

| Asked for | Delivered | Where |
|---|---|---|
| The trial HARNESS | Two runners, one scorer, **six controls** (all executed, §H) | `tools/ordinance-trial/` |
| A small GOLD SET a human can confirm or correct | **218 rows**, 3 strata, every row page- and quote-cited (CH-TABLE 163 · CH-PROSE 16 · DE-PROSE 39; by label: 72 NUMBER · 84 UNKNOWN · 57 NOT-A-PARCEL-RULE · 5 RULE-NOT-VALUE) | `tools/ordinance-trial/goldset/` |
| Provenance labelled exactly | Per-row `evidence.page` + `quote` (prose) or `columnX` + `columnHeader` (table); per-row `reviewerNote`; `humanConfirmed: false` on every row | `goldset/types.ts` |
| Marked UNCONFIRMED-BY-HUMAN | In the type, in the data, and printed as a banner on every run | — |
| The spine run against it | **RUN, not pending** — BEFORE and AFTER | §C, §D |
| Precision/recall **per parameter**, denominators stated | §D table | `lane-e8-trial-transcripts/perparam.txt` |

**The trap named in the brief was avoided, and it is checkable rather than asserted.** A gold
set derived from the extractor's own output measures nothing. The CH table gold values were
read from pdf.js **positioned items by column x** (via `tools/ordinance-trial/dump-items.ts`),
the prose values from reading normalized page text. `extractRules` was not run until the set
was closed. The **mtimes prove the ordering and the runner prints them**:

```
2026-09-01 21:49  goldset/ch-table.ts          ← gold
2026-09-01 21:51  goldset/ch-prose.ts          ← gold
2026-09-01 21:53  goldset/de-prose.ts          ← gold
2026-09-01 21:49  structure/tables.ts          ← subject
2026-09-01 22:01  spine/readers.ts             ← subject
2026-09-01 22:04  adapters/swissZoneTable.ts   ← subject
```

The gold files predate the Swiss table schema they score. The gold set cannot be a mirror of
that producer's output.

---

## B · THE CORPUS AND THE STRATA — with the bias declared, not hidden

Two real documents, both hash-pinned. **The loader REFUSES to score if the bytes no longer
match the sha256 the gold set was labelled against** — a citation to a document that has
changed is a stale citation, and scoring through it would be the
§verification-artifact-can-predate-subject defect.

| Stratum | Document | Pages | Shape | Sample | Selection rule |
|---|---|---|---|---|---|
| **CH-TABLE** | Luzern BZR `26945c0f…3de67` | 26, 31 | table cells | out-of-sample | Anhang 1 spans pp. 26–36; page 26 = its **first**, page 31 = its **sixth**. Both chosen by POSITION, before any value was read. Every zone row on both pages is in the set. |
| **CH-PROSE** | same document | 5, 6, 7, 15 | prose | out-of-sample | The body pages carrying Art. 7–13 and Art. 26–28. **Content-directed, declared as such.** |
| **DE-PROSE** | Berlin B-Plan 1-19 Begründung `449b9a21…5a86d` | 71–75 | prose | out-of-sample | The first `.pdf` grund_www in Berlin WFS order after the two plans the grammar was authored against (1-14, 8-30) that classified born-digital. Pages = the span of the document's own heading "II.4.3 Maß der baulichen Nutzung" through the end of "Höhenfestsetzungen". |

**Declared biases** (they limit what the numbers support):
- CH-TABLE is 2 of 11 annex pages — not a random draw. One canton, one municipality.
- CH-TABLE's **ÜZ → `maxCoverage` and FH → `maxHeight_m` mappings are INTERPRETATIONS.** The
  reglement never defines Überbauungsziffer (cantonal PBG/PBV does), and Swiss *Fassadenhöhe*
  has **no member** in `HeightMeasurement` (`eaves|ridge|building|unknown`). A Swiss planner
  must confirm both. Recorded as a vocabulary gap (control 10), **not minted** (control 2).
- Both prose strata are rule-bearing by construction, so they support statements about
  **precision and failure shape**, never a document-level recall figure.
- A Begründung is argumentative prose and carries far more non-binding numbers than a
  Festsetzungstext. DE-PROSE is deliberately **harder than average**.

---

## C · THE HEADLINE — Layer 3 fixed the table and broke the prose

One gold set, one scorer, two runners. Both re-run 2026-09-02 against the **current** tree.

| | CH-TABLE | CH-PROSE | DE-PROSE |
|---|---|---|---|
| **BEFORE** — flattened `extractRules` | 0 emitted · recall **0.0%** · slot **undefined** (55 unanchorable) | 1 emitted · P 100% · R 20% | 12 emitted · P **33.3%** · R 50% · overstatement **41.7%** |
| **AFTER** — Layer-3 spine | 11 emitted · P **100%** · R **100%** · **slot 55/55** | **0 emitted** · R **0%** | 3 emitted · P **0%** · R **0%** · overstatement **66.7%** |
| verdict | ⭐ **FIXED** | ⛔ **REGRESSED** | ⛔ **REGRESSED** |

**This is the finding of the lane.** The structure layer does exactly what it was built for on
a grid, and the same commit made both prose strata strictly worse. Reporting only the first
half would have been the flattering read.

### C.1 · ⭐ The table result, and why I believe it

On CH-TABLE the spine reconstructed both grids confidently
(`header [Nr. | Zonenart | A / B | ÜZ | GL | VG | FH | g / o | Weitere Bestimmungen]`, 9 rows
on p26, 27 on p31, **0 withheld**) and then:

| Arm | Reading | Denominator |
|---|---|---|
| **A** claim set (field, value) | precision **100%** · recall **100%** · overstatement **0%** | 11 emitted / 11 gold |
| **S-B** SLOT (zone, field, value) — *the product unit* | **55 matched · 0 wrong · 0 missed → 100%** | 55 zone-attributable gold rows |
| **S-T** tier lock, read at runtime | tier 4 **55/55** · `AI_EXTRACTED` **55/55** · `not-checked` **55/55** · **0 graduations** | 55 claims |
| **S-E** evidence, re-derived from the document | span present **55/55** · **contained in source 55/55** · page **55/55** · **column named 55/55** | 55 claims |
| **S-U** every gold UNKNOWN cell, paired 1-by-1 | **81/81 answered by a typed reason** · **0 answered by a value** · **0 unanswered** | 81 gold UNKNOWN rows |

Per parameter: `maxCoverage` 26/26 · `maxFloors` 24/24 · `maxHeight_m` 5/5.

**Why 100% is not automatically a red flag here, and where it still might be.** Four things
would have to be true for this to be a mirror rather than a measurement, and three are ruled
out by evidence a reader can re-check:

1. *Gold derived from the producer?* **No** — mtimes above; gold predates the schema.
2. *Harness unable to fail?* **No** — the scramble control (every digit in every positioned
   item remapped) drops the same run from 11 true positives to **0**, precision 0%.
3. *Scorer broken?* **No** — the oracle control (predictions built from the gold rows) reads
   100%/100% on all three strata, which is what verifies the plumbing, not the extractor.
4. *Gold and producer sharing the SAME systematic column error?* ⚠ **This one is not ruled
   out by the trial's own machinery**, because both read the same geometry. The independent
   corroboration is **elsewhere in the same document**: Art. 26 (CH-PROSE, p15) states
   *"Die maximale Fassadenhöhe beträgt 21 m und die maximale Firsthöhe 27 m"* — a different
   section, in prose, confirming that the `21` in the FH column is a height in **metres** and
   not 21 Vollgeschosse. That is corroboration, not proof. **A Swiss planner still has to sign
   the ÜZ and FH mappings.**

### C.2 · ⛔ CORRECTION TO E8-SCOUT: the predicted 7× overstatement did not happen

The scout predicted that the flattened stream would read `10 WA 0.15 21 geschlossen` as
*"21 Vollgeschosse"* — a 7× overstatement with a correct citation attached. **Measured, the
flattened path emitted NOTHING on CH-TABLE** (0 rules, recall 0%). The German grammar's
matchers need German keywords that a bare table row does not contain, so it never fired.

The real BEFORE failure was different and, for a product, arguably worse in a quieter way:
the flattened run reported **`not-stated-in-text` for `maxCoverage`, `maxFloors` AND
`maxHeight_m`** — three fields the source **does** state. That is a **false honest-unknown**:
the system said "the document is silent" about values printed on the page it had just read.
The overstatement hazard is real in principle; **it is not what this corpus produced**, and
the trial says so rather than repeating the prediction.

---

## D · PRECISION AND RECALL **PER PARAMETER**, DENOMINATORS STATED

`lane-e8-trial-transcripts/perparam.txt`. TP/FP/FN are distinct (field, value) claims **within
a stratum**. `n/a` means the denominator is 0 — an undefined ratio is never printed as 0 or 1.

### BEFORE — flattened `extractRules` (`run-trial.ts`)

| Stratum | Parameter | TP | FP | FN | Precision | Recall | Denominators |
|---|---|---|---|---|---|---|---|
| CH-TABLE | maxCoverage | 0 | 0 | 3 | n/a | 0.0% | emitted 0 · gold 3 |
| CH-TABLE | maxFloors | 0 | 0 | 5 | n/a | 0.0% | emitted 0 · gold 5 |
| CH-TABLE | maxHeight_m | 0 | 0 | 3 | n/a | 0.0% | emitted 0 · gold 3 |
| CH-PROSE | maxFloors | 0 | 0 | 1 | n/a | 0.0% | emitted 0 · gold 1 |
| CH-PROSE | maxHeight_m | 1 | 0 | 3 | 100.0% | 25.0% | emitted 1 · gold 4 |
| DE-PROSE | maxCoverage | 1 | 1 | 2 | 50.0% | 33.3% | emitted 2 · gold 3 |
| DE-PROSE | maxFAR | 3 | 3 | 0 | 50.0% | 100.0% | emitted 6 · gold 3 · **1 overstating** |
| DE-PROSE | maxHeight_m | 0 | 4 | 2 | 0.0% | 0.0% | emitted 4 · gold 2 · **4 overstating** |

### AFTER — the Layer-3 spine (`run-spine-trial.ts`)

| Stratum | Parameter | TP | FP | FN | Precision | Recall | Denominators |
|---|---|---|---|---|---|---|---|
| CH-TABLE | maxCoverage | 3 | 0 | 0 | **100.0%** | **100.0%** | emitted 3 · gold 3 |
| CH-TABLE | maxFloors | 5 | 0 | 0 | **100.0%** | **100.0%** | emitted 5 · gold 5 |
| CH-TABLE | maxHeight_m | 3 | 0 | 0 | **100.0%** | **100.0%** | emitted 3 · gold 3 |
| CH-PROSE | maxFloors | 0 | 0 | 1 | n/a | 0.0% | emitted 0 · gold 1 |
| CH-PROSE | maxHeight_m | 0 | 0 | 4 | n/a | 0.0% | emitted 0 · gold 4 |
| DE-PROSE | maxCoverage | 0 | 1 | 3 | 0.0% | 0.0% | emitted 1 · gold 3 |
| DE-PROSE | maxFAR | 0 | 1 | 3 | 0.0% | 0.0% | emitted 1 · gold 3 · **1 overstating** |
| DE-PROSE | maxHeight_m | 0 | 1 | 2 | 0.0% | 0.0% | emitted 1 · gold 2 · **1 overstating** |

**Slot recall per parameter (CH-TABLE, AFTER):** `maxCoverage` 26/26 = 100% · `maxFloors`
24/24 = 100% · `maxHeight_m` 5/5 = 100%.

> ### ⛔ POWER — READ THE DIRECTION, NOT THE PERCENTAGE
> Every ARM A denominator is **below the 50-per-stratum floor** (E8-SCOUT §4.4):
> CH-TABLE n=11 → 95% half-width **±29.5%** · CH-PROSE n=5 → **±43.8%** ·
> DE-PROSE n=8 → **±34.6%**.
> **The ONE arm that meets the floor is ARM S-B on CH-TABLE: n=55 → ±13.2%.**
> So "the table reader recovers the right value in the right zone" is the only claim in this
> report with enough sample behind it to be more than directional — and even that is one
> municipality, and still unconfirmed by a human.

---

## E · WHY THE PROSE REGRESSED — two defects, both isolated by experiment

I did not report "the spine is worse" and stop. Each cause was tested separately and both are
now **permanent arms of the harness**, so neither can silently rot.

### ⛔ D-1 · THE NORMALIZER IS NOT IN THE SPINE'S PATH (ARM S-X)

`tools/ordinance-ingest/lib/pdfPageItems.ts` builds page text with `joinPdfTextItems` — **raw**
Layer-2 output — and `buildCanonicalDocument` carries it verbatim. **`ingest/normalize.ts` is
called nowhere in `structure/` or `spine/`.** The German grammar was authored against
normalized text, so the spine hands it a string it was never tuned for.

Measured by running the **same grammar over both strings, over the same pages**:

| Stratum | Grammar hits on RAW (what the spine feeds) | on NORMALIZED (what BEFORE fed) | Lost |
|---|---|---|---|
| CH-PROSE | **0** | **1** | `p15 maxHeight_m=27` |
| DE-PROSE | **8** | **14** | `p73 maxFAR=3` · `p73 maxFAR=2` · `p74 maxFAR=1` · `p74 maxHeight_m=51.2` · `p74 maxHeight_m=56.2` · `p75 maxHeight_m=55` |

CH-PROSE loses **the only correct claim the BEFORE run produced**. DE-PROSE loses **6 of 14
rule hits (43%)**, and three of the six (`maxFAR` 3, 2, 1) are **gold true positives**.

### ⛔ D-2 · THE SPINE COLLAPSES N VALUES PER FIELD TO THE FIRST — silently

`readField` runs readers in order and **returns the first outcome with a value**;
`documentToClaims` then produces **one claim per (field, zone)**. That is correct for a zoning
table, where one zone has one FH. It is wrong for a Begründung, which states a **different GRZ
per Baugebiet** in one section.

On DE-PROSE: **8 raw grammar hits → 3 claims.** The five dropped values leave **no claim and
no `NothingFound`** — the field already produced a value, so nothing is recorded. This is the
BEFORE run's SILENT-LOSS finding promoted from an accident to a structural property.

And the survivors are the worst three available. All three are **NOT-A-PARCEL-RULE traps the
gold set named in advance**, because on this document the first number on the page is:

| Emitted | Cited span | What it actually is |
|---|---|---|
| `maxCoverage = 0.7` | *"…bezogen auf das gesamte Sondergebiet eine GRZ von 0,7 **ergeben**."* | a **computed consequence**, not a Festsetzung |
| `maxFAR = 3.2` | *"…**ergibt sich** nach Maßgabe von § 20 BauNVO eine GFZ von 3,2."* | a computed consequence |
| `maxHeight_m = 72.2` | *"…eine Gebäudeoberkante von **bis zu** 72,2 m **über NHN** möglich."* | an **absolute elevation over a vertical datum** — the L-584 defect |

### ⛔ D-3 · TWO GOLD UNKNOWNS ANSWERED BY PURE SILENCE (ARM S-U, DE-PROSE)

Of 3 gold UNKNOWN rows, **1 answered by a typed reason, 0 answered by a value, 2 UNANSWERED**:
`minParcelArea_m2` and `setback.front`. The grammar defines no matcher, so there is no value
**and no `NothingFound`** — nothing distinguishes *"we asked and it is not there"* from
*"we never asked"*. That is control 9 failing at the pipeline's outer seam, and it reproduces
the BEFORE run's `⛔ BLIND — NOT SOUGHT` rows as a countable arm.

---

## F · ⭐ THE MOST PRODUCT-RELEVANT NUMBER IN THE LANE

The DE run above was driven with a **German qualifier lexicon this lane wrote**
(`tools/ordinance-trial/lib/germanQualifiers.ts`). Reporting its catches as *"the gate works"*
would credit the product with an artefact of the trial — the flattering direction of
§fake-more-capable-than-real. So it was measured both ways, **holding every other variable
fixed**:

> **MEASURED 2026-09-02:** `grep -rn ": QualifierLexicon" packages/ordinance-extraction/src`
> → **ONE** definition: `SWISS_GERMAN_QUALIFIERS` (`de-CH`). **There is no German lexicon in
> the package.** Germany is the largest corpus in the wave (NRW alone `numberMatched=82,007`).

| Configuration | Auto-accepted **wrong** claims |
|---|---|
| **What ships today** — no German lexicon (0 patterns) | ⛔ **2 of 3** |
| With this lane's trial lexicon (10 patterns) | 1 of 3 |

With no lexicon, only the **range gate** catches anything (`maxFAR = 3.2` is outside
`[0.2, 3]`). **`maxHeight_m = 72.2` — "bis zu 72,2 m über NHN" — auto-accepts with zero
flags.** An absolute elevation over a vertical datum, published as a building height, with a
correct citation attached. That is L-584 and L-616 in one claim, and today nothing stops it.

The one that still slips through **with** the lexicon is instructive: the span reads
*"…eine GRZ von 0,7 **ergeben**"* while the pattern is `/ergibt sich|errechnet sich/`. **A
qualifier lexicon is corpus-curated vocabulary, not a one-time write** — a single inflection
was the whole difference between routing to a human and auto-accepting a wrong number.

> ### ⚠ A CONFOUND I CAUGHT IN MY OWN PROBE, RECORDED RATHER THAN QUIETLY FIXED
> The first version of this probe omitted the `perturbed` pass and measured **0 auto-accepts
> in both arms** — which looked like a clean bill of health. The cause was the dual-pass gate
> flagging `no-second-pass`, **not** the lexicon. It made the product look safer than the main
> run had already shown it to be. The probe now supplies `perturbed` exactly as the main run
> does, and the comment in the file says why. **A control that cannot vary the one variable
> under test is not a control.**

---

## G · THE TIER LOCK — the one rule this wave exists to enforce

Read **off every claim at runtime**, not trusted from the type system:

| | CH-TABLE | CH-PROSE | DE-PROSE |
|---|---|---|---|
| claims produced | 55 | 0 | 3 |
| `confidence.tier === 4` | 55/55 | — | 3/3 |
| `derivation === 'AI_EXTRACTED'` | 55/55 | — | 3/3 |
| `validationState === 'not-checked'` | 55/55 | — | 3/3 |
| **graduations to tier 1/2/3/5** | **0** | **0** | **0** |

**58 of 58 claims are tier 4, `AI_EXTRACTED`, `not-checked`. Zero graduated by any path.**
Spec §20's hard rule holds everywhere the spine ran.

⚠ **Two things this does NOT establish, and they matter more than the green above.**

1. **`autoAccepted` is not validation, and the trial shows why.** CH-TABLE auto-accepted
   **54 of 55**; DE-PROSE auto-accepted **2 of 3 wrong claims** in the shipping configuration.
   Auto-acceptance means "no gate objected", and on the German prose stratum no gate objected
   to an absolute NHN elevation. The tier stays 4 — but a tier-4 claim that no human ever sees
   is still a tier-4 claim feeding a downstream consumer.
2. **Stage 4 AI is UNEXERCISED — PENDING, not zero.** No `DualPassExtractor` implementation
   exists in the repo, so `ai-span-retrieval` produced nothing. **Every claim in this trial
   came from a deterministic reader** (table geometry or grammar). The AI half of *"AI
   interprets, deterministic computes"* has its **tier stamping proven and its accuracy
   entirely unmeasured.** No figure here is evidence about an LLM-based extractor.

---

## H · CONTROLS EXECUTED — every one, with its outcome

| Control | Purpose | Outcome |
|---|---|---|
| **1 · ORACLE** | predictions built FROM the gold rows must read 100/100, or the SCORER is broken | ✓ 100%/100% on all 3 strata, both runners |
| **2 · SCRAMBLE** | every digit remapped (item text for the geometry path); a harness that scores the same on nonsense measures nothing | ✓ **discriminates on CH-TABLE**: 11 TP → **0**, precision 100% → 0%. ⚠ **INCONCLUSIVE on both prose strata** — the real run scored 0 TPs, so a scrambled run cannot score lower. Stated, not glossed. |
| **3 · HASH PIN** | a citation into changed bytes is stale | ✓ both documents matched the gold sha256; the loader refuses otherwise |
| **4 · MTIME INDEPENDENCE** | gold must predate its subject | ✓ printed by the runner every run, not asserted in prose |
| **5 · SUBJECT PIN** | the sibling lane is editing the subject *during* the measurement | ✓ `spine/types.ts` changed at **08:08:37**, after the 08:06 run → **the whole trial was re-run**, and the tree snapshot before/after the re-run is **identical** (`pin.txt`) |
| **6 · CONFOUND** | isolate the variable under test | ✓ caught in the lexicon probe (§F) and corrected |

**Verification, foreground, RC read immediately:**

| Command | RC |
|---|---|
| `npx tsc -p packages/ordinance-extraction/tsconfig.json --noEmit` | **0** |
| `npx tsc --noEmit … tools/ordinance-trial/run-spine-trial.ts` | **0** |
| `npx vitest run` (packages/ordinance-extraction) | **0** — **24 files, 298 tests passed** |
| `npx tsx tools/ordinance-trial/run-trial.ts` (BEFORE, re-run) | **0** |
| `npx tsx tools/ordinance-trial/run-spine-trial.ts` (AFTER) | **0** |
| `npx tsx tools/ordinance-trial/probe-normalize.ts` | **0** |
| `npx tsx tools/ordinance-trial/probe-no-lexicon.ts` | **0** |

⚠ **The BEFORE numbers were re-measured, not inherited.** The 2026-09-01 23:xx transcript
predates the sibling lane's edits to `ingest/pdfItems.ts` and the gates. Re-run against the
current tree it reproduces **exactly** (`trial-recheck.txt`), which is what makes the
BEFORE/AFTER comparison legitimate.

---

## I · DEFECTS FOR THE ISSUE LOG (proposed rows — this lane did not write them)

| # | Defect | Evidence |
|---|---|---|
| **1** | **`ingest/normalize.ts` is bypassed by the Layer-3 spine.** The grammar reader is fed raw `joinPdfTextItems` output. Loses 1/1 rule hits on CH-PROSE and 6/14 (43%) on DE-PROSE, including 3 gold true positives. | ARM S-X · `probe-norm.txt` |
| **2** | **`documentToClaims` emits one claim per (field, zone) and silently drops the rest.** 8 raw hits → 3 claims on DE-PROSE; the 5 dropped values produce no claim and no `NothingFound`. Correct for a table, wrong for multi-zone prose. | ARM A + S-N · `spine-final.txt` |
| **3** | **No German `QualifierLexicon` exists.** Measured: one lexicon in the package, `de-CH`. Consequence: **2 of 3 wrong DE claims auto-accept**, including `72.2 m über NHN` as a building height with zero flags. | §F · `probe-nolex.txt` |
| **4** | **Fields with no grammar matcher produce neither a value nor a typed reason.** `minParcelArea_m2`, `setback.front` on DE-PROSE: pure silence, indistinguishable from "not asked". | ARM S-U |
| **5** | **`HeightMeasurement` has no member for Swiss *Fassadenhöhe*.** Art. 26 states Fassadenhöhe 21 m **and** Firsthöhe 27 m in one sentence, so the distinction is load-bearing. Recorded (control 10), **not minted** (control 2). | `goldset/ch-table.ts` header |
| **6** | **E8-SCOUT §3.2's predicted 7× Luzern overstatement did not reproduce.** The flattened path emitted nothing; it instead reported `not-stated-in-text` for three fields the source states — a false honest-unknown. | §C.2 |

---

## J · WHAT A HUMAN MUST DO NEXT (the sign-off this trial cannot give itself)

1. **Sign or correct `tools/ordinance-trial/goldset/*.ts`.** Every row cites a page and a
   quote or a column x. Flipping `humanConfirmed` requires **a named person and a date**.
   ⛔ *Correct a wrong gold value against the DOCUMENT and say who corrected it. Never edit a
   gold row to match a producer's output — that turns ground truth into a mirror.*
2. **A Swiss planner must confirm ÜZ → `maxCoverage` and FH → `maxHeight_m`.** The CH-TABLE
   100% rests on both, and the reglement defines neither.
3. **Grow every stratum past n=50** before any percentage is quoted as a percentage.
4. **Nothing here licenses a bulk run.** The one arm with adequate power covers one table in
   one municipality, read by a deterministic geometric reader, with the AI stage unbuilt.

---

## K · SCOPE — what this lane wrote, and what it refused

**Written (all NEW, all under `tools/` and `audit/`, nothing committed):**

```
tools/ordinance-trial/run-spine-trial.ts      the AFTER runner (arms S-B, S-T, S-E, S-N, S-U, S-X)
tools/ordinance-trial/lib/germanQualifiers.ts TRIAL-LOCAL DE lexicon — scaffolding that RECORDS a gap
tools/ordinance-trial/probe-normalize.ts      isolates D-1
tools/ordinance-trial/probe-no-lexicon.ts     isolates D-3 / §F
audit/.../impl/e8-trial.md                    this report
audit/.../impl/lane-e8-trial-transcripts/*    every transcript, incl. the subject pin
```

**Refused / not done, deliberately:**

- ⛔ **No `packages/schemas/**` change** (control 3 — the canonical model is FROZEN). None was
  needed: the trial reads `RuleProvenance` and never writes it.
- ⛔ **No new canonical entity, field or vocabulary** (control 2). The Fassadenhöhe datum gap
  and the missing DE lexicon are **recorded**, not minted.
- ⛔ **No production adapter for Germany.** `germanQualifiers.ts` lives in `tools/`, is marked
  trial scaffolding in its own header, and exists to make the ABSENCE measurable. Its right
  home is the DE country adapter, beside the grammar — a later lane's call.
- ⛔ **No barrel edit** — `packages/site-parcel-data/src/index.ts`, `sourceRegistry/*`,
  `parcelProviders/*` and every `countryAdapters/<cc>/` untouched. **No barrel-additions file
  is needed: this lane exported nothing.**
- ⛔ **No parcel provider registered** (L-12871 stays OPEN).
- ⛔ **No gate ceiling raised, no gate disabled, no `gate-debt.json` entry, no rival built.**
  `@pryzm/ordinance-extraction` was read first and **extended by nothing** — the trial drives
  its public surface and adds no code to it.
- ⛔ **Not committed**, per the brief.

**Not mine, and left alone:** `packages/ordinance-extraction/src/{spine,structure}/`,
`adapters/swissZoneTable.ts`, `gates/{containment,qualifierSurvival}.ts`,
`tools/ordinance-ingest/` and `tools/ga-gate/check-*` belong to the concurrent **E8-SPINE**
and **E8-GATES** lanes. This lane measured them from outside and edited none of them.

---

## L · VERDICT

**The harness and the gold set are delivered and the run is not pending.** Against one
unconfirmed gold set, the Layer-3 structure layer takes the Luzern zoning table from
*undefined slot recall* to **55/55 with 0 fabrications on 81 empty cells**, and every claim it
produces is correctly locked at tier 4. That is real, and it is the strongest evidence so far
that the six-stage spine is the right shape.

**And the same code makes prose strictly worse, for two isolated and fixable reasons, in a
configuration where 2 of 3 wrong German claims auto-accept — one of them an absolute elevation
published as a building height.**

⛔ **The correct read of this lane is not "the spine works". It is: the table path is ready
for a human to validate, the prose path is not ready to run at all, and NO number in this
report is validated until a person signs the gold set.**
