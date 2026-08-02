# SIG-M1 — REVIEW COVER SHEET

**2026-08-02 · the summary the founder asked for: *"records reviewed by risk class · issues found ·
issues corrected · unresolved items."* Four numbers and a list.**

> *"If that summary is clean, I would sign the transcription."*

⚠ **This cover sheet does not flip a gate.** `MADRID_ENVELOPE_VERIFIED` is `false`. Full detail:
[`SIG-M1-REVIEW-SAMPLE.md`](./SIG-M1-REVIEW-SAMPLE.md).

---

## THE FOUR NUMBERS

| | |
|---|---:|
| **1 · Records reviewed** | **121** of 231 in the 23 shipped zones (**52.4 %**) |
| **2 · Issues found** | **18** distinct, all pre-existing and already disclosed by the pack |
| **3 · Issues corrected in this pass** | **0** — see the note below, it is deliberate |
| **4 · Unresolved items** | **17** open, **all already excluded from SIG-M1’s scope** |

### Records reviewed, by risk class — **100 % of every sampleable class**

| class | risk | in scope | reviewed | coverage |
|---|---|---:|---:|---:|
| **R1** | segmentation across paragraphs | 47 | **47** | **100 %** |
| **R2** | unmodelled condition | 56 | **56** | **100 %** |
| **R3** | normalization | 29 | **29** | **100 %** |
| **R4** | future divergence | 106 | *n/a — trigger* | `madridCorpusSupersession.test.ts` |

Plus **one clean record per zone** for contrast. The unreviewed remainder is the set carrying **no**
detected structural risk — short, single-paragraph, unconditioned, on an unamended article.

---

## ISSUES FOUND — all pre-existing, all disclosed, none newly introduced

| zone | art. | parameter | issue | how the pack handles it | status |
|---|---|---|---|---|---|
| `4` | 8.4.5 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `5.1` | 8.5.6 | **setbackFront_m** | measured to the street CENTRELINE — a rule kind GeometricRule cannot express | value set to null; SIG-M1 EXCLUDES 5.1/5.2/5.3 | OPEN — no front inset applied |
| `5.2` | 8.5.6 | **setbackFront_m** | measured to the street CENTRELINE — a rule kind GeometricRule cannot express | value set to null; SIG-M1 EXCLUDES 5.1/5.2/5.3 | OPEN — no front inset applied |
| `5.3` | 8.5.6 | **setbackFront_m** | measured to the street CENTRELINE — a rule kind GeometricRule cannot express | value set to null; SIG-M1 EXCLUDES 5.1/5.2/5.3 | OPEN — no front inset applied |
| `7.1.a` | 8.7.8 | **maxCoverage** | base value with a tiered override the model cannot hold | DISCLOSED in `measurement` | OPEN — R2 |
| `7.1.b` | 8.7.18 | **farRatio** | ALTERNATIVE-USE ceiling, not the uso cualificado value | DISCLOSED in `measurement` | RESOLVED by disclosure |
| `7.1.b` | 8.7.8 | **maxCoverage** | base value with a tiered override the model cannot hold | DISCLOSED in `measurement` | OPEN — R2 |
| `8.1.a` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.1.c` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.2.a` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.2.b` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.2.c` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.3.a` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.3.c` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.4` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.5` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.6` | 8.8.6 | **setbackRear_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |
| `8.6` | 8.8.6 | **setbackSide_m** | FLOOR of a height-proportional rule — binds only below a break-even height | DISCLOSED in `measurement`; pack carries the floor | OPEN — over-states above break-even |

### ⚠ Why "issues corrected = 0" is the right answer and not a gap

**Every issue above is a defect in the ORDINANCE’s expressibility, not in the transcription.**
The machine read each one correctly and the pack *discloses* each in its own `measurement` field —
e.g. zone `4` `setbackRear_m = 3` carries *"FLOOR of a height-proportional rule … Do NOT use 3 as a
fixed rear setback"*. Correcting them means **adding rule kinds** (a centreline-referenced setback,
a height-proportional separation), which is an ADR and an engine change — **not a transcription fix,
and explicitly out of SIG-M1’s scope.**

⇒ **The transcription itself produced zero corrections across the whole risk-bearing set.** That is
the finding, and it is what the signature is about.

---

## UNRESOLVED — and every one is ALREADY excluded from what would be signed

| # | Item | Effect | Already excluded? |
|---|---|---|---|
| 1 | `4`, `9.1`, `9.2` — height is the unresolved *ancho de calle* table, so the pack carries the ordinance FLOOR | ⚠ **OVER-states** above 9,00 m | ✅ yes — named in SIG-M1 as unsignable in principle |
| 2 | `5.1`, `5.2`, `5.3` — Art. 8.5.6.3 measures to the street **centreline** | ⚠ **OVER-states** on a narrow street | ✅ yes — same |
| 3 | 25 pipe-joined table reconstructions stored in a field named `verbatim` | provenance mislabel; cells verified on the cited page | 🟡 cosmetic — worth fixing at source |
| 4 | BOCM texts of **MPG 00/343** (27.11.2023) and **MPG 00/335** (19.05.2016) not held | signature is on a **consolidation** | ✅ yes — validity-verification, per the founder |

---

## THE THREE PRECONDITIONS

| # | Precondition | Status |
|---|---|---|
| 1 | Targeted human review | 🟡 **artefact complete, 121 records — awaiting a human read** |
| 2 | Four residual-risk classes verified | ✅ **R1/R2/R3 100 % enumerated; R4 has a CI trigger** |
| 3 | End-to-end `pipeline-extracted-unverified` rendering | ✅ **verified** — §RED-CHIP-NZ7-NZ8 solves every NZ-7/NZ-8 grado; red chip is the first badge arm (weakest-wins) |

## THE PRIOR MEASUREMENT THIS RESTS ON

§MADRID-QUOTE-CONCORDANCE re-read **all 1321** verbatim strings against
the filed Compendio: **992** on the cited page, **40** spanning from it, **0 cited to a wrong page, 0 fabricated**.

**Corpus pinned:** sha256 `1A3AA172B7ABE092F03E58FB2AFC26C87020B907887F919CEE20002E5FC4D0B5` · 626 pp · **19 of 33** cited articles already amended in this
edition, baselined per article. A changed footnote re-opens **that article only**.

---

## WHAT SIGNING WOULD MEAN

**Covers:** `esMadridPgoum97.ts` is an accurate transcription of the Compendio 2025 for the **23
shipped zones**, publishable at **`pipeline-extracted-unverified`**, explicitly identified as a
machine-generated derivative.

**Does not cover:** the six over-stating zones (rows 1–2 above) · the BOCM text · NZ 3 (Art. 8.3.1
governs) · NZ 1 (SIG-M2) · **promotion above `pipeline-extracted-unverified`** — a separate, later,
deliberate edit, since `capEnvelopeConfidenceToPackDefault` is demote-only by design (ADR-0286).

**Measured effect if signed:** the 23 packed zones = **27.847 %** of Norma-Zonal land move from
`no-pack` (0.0) to `pipeline-extracted-unverified` (0.1) — ENVELOPE **4.68 % → 7.46 %**. As scoped,
SIG-M1 excludes the six unsignable zones, so the realised move is over **17.248 %**: **4.68 % → 6.40 %**.

---
*Generated from `sig-m1-review-sample.json` + `quote-concordance-2026-08-01.json`.*
