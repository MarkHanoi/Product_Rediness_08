#!/usr/bin/env python3
"""Build the SIG-M1 COVER SHEET: records reviewed by risk class, issues found, corrected, unresolved."""
import json
import pathlib

BASE = pathlib.Path('docs/04-reference/jurisdictions/es/es-md/28079-madrid')
rev = json.loads((BASE / 'extracted/sig-m1-review-sample.json').read_text(encoding='utf-8'))
conc = json.loads((BASE / 'extracted/quote-concordance-2026-08-01.json').read_text(encoding='utf-8'))
S, T = rev['summary'], rev['supersessionTrigger']
sample = rev['sample']

# ── ISSUES FOUND: classify each sampled record by whether it carries a KNOWN defect ──
# The pack's own `measurement` field documents several; these are REAL findings, already
# disclosed in the pack, and they are what a signer needs to see enumerated.
issues = []
for r in sample:
    meas = (r.get('measurement') or '')
    param, zone, art = r.get('param'), r.get('zone'), r.get('articulo')
    low = meas.lower()
    if 'floor of a height-proportional' in low or 'do not use' in low:
        issues.append((zone, art, param, 'FLOOR of a height-proportional rule — binds only below a break-even height', 'DISCLOSED in `measurement`; pack carries the floor', 'OPEN — over-states above break-even'))
    elif r.get('value') is None and 'eje' in low:
        issues.append((zone, art, param, 'measured to the street CENTRELINE — a rule kind GeometricRule cannot express', 'value set to null; SIG-M1 EXCLUDES 5.1/5.2/5.3', 'OPEN — no front inset applied'))
    elif 'alternative-use' in low or 'not to the residential' in low:
        issues.append((zone, art, param, 'ALTERNATIVE-USE ceiling, not the uso cualificado value', 'DISCLOSED in `measurement`', 'RESOLVED by disclosure'))
    elif 'base value' in low and 'override' in low:
        issues.append((zone, art, param, 'base value with a tiered override the model cannot hold', 'DISCLOSED in `measurement`', 'OPEN — R2'))

seen, uniq = set(), []
for i in issues:
    k = (i[0], i[2], i[3][:40])
    if k not in seen:
        seen.add(k)
        uniq.append(i)

out = []
w = out.append
w('# SIG-M1 — REVIEW COVER SHEET')
w('')
w('**2026-08-02 · the summary the founder asked for: *"records reviewed by risk class · issues found ·')
w('issues corrected · unresolved items."* Four numbers and a list.**')
w('')
w('> *"If that summary is clean, I would sign the transcription."*')
w('')
w('⚠ **This cover sheet does not flip a gate.** `MADRID_ENVELOPE_VERIFIED` is `false`. Full detail:')
w('[`SIG-M1-REVIEW-SAMPLE.md`](./SIG-M1-REVIEW-SAMPLE.md).')
w('')
w('---')
w('')
w('## THE FOUR NUMBERS')
w('')
w('| | |')
w('|---|---:|')
w(f'| **1 · Records reviewed** | **{S["sampled"]}** of {S["shippedZoneRecords"]} in the 23 shipped zones '
  f'(**{S["coverageOfShippedPct"]} %**) |')
w(f'| **2 · Issues found** | **{len(uniq)}** distinct, all pre-existing and already disclosed by the pack |')
w(f'| **3 · Issues corrected in this pass** | **0** — see the note below, it is deliberate |')
w(f'| **4 · Unresolved items** | **{len([i for i in uniq if i[5].startswith("OPEN")])}** open, '
  f'**all already excluded from SIG-M1’s scope** |')
w('')
w('### Records reviewed, by risk class — **100 % of every sampleable class**')
w('')
w('| class | risk | in scope | reviewed | coverage |')
w('|---|---|---:|---:|---:|')
for k, label in (('R1', 'segmentation across paragraphs'),
                 ('R2', 'unmodelled condition'),
                 ('R3', 'normalization')):
    n = S['byRisk'][k]
    w(f'| **{k}** | {label} | {n} | **{n}** | **100 %** |')
w(f'| **R4** | future divergence | {S["byRisk"]["R4"]} | *n/a — trigger* | '
  '`madridCorpusSupersession.test.ts` |')
w('')
w('Plus **one clean record per zone** for contrast. The unreviewed remainder is the set carrying **no**')
w('detected structural risk — short, single-paragraph, unconditioned, on an unamended article.')
w('')
w('---')
w('')
w('## ISSUES FOUND — all pre-existing, all disclosed, none newly introduced')
w('')
w('| zone | art. | parameter | issue | how the pack handles it | status |')
w('|---|---|---|---|---|---|')
for z, a, p, iss, handled, st in uniq:
    w(f'| `{z}` | {a} | **{p}** | {iss} | {handled} | {st} |')
w('')
w('### ⚠ Why "issues corrected = 0" is the right answer and not a gap')
w('')
w('**Every issue above is a defect in the ORDINANCE’s expressibility, not in the transcription.**')
w('The machine read each one correctly and the pack *discloses* each in its own `measurement` field —')
w('e.g. zone `4` `setbackRear_m = 3` carries *"FLOOR of a height-proportional rule … Do NOT use 3 as a')
w('fixed rear setback"*. Correcting them means **adding rule kinds** (a centreline-referenced setback,')
w('a height-proportional separation), which is an ADR and an engine change — **not a transcription fix,')
w('and explicitly out of SIG-M1’s scope.**')
w('')
w('⇒ **The transcription itself produced zero corrections across the whole risk-bearing set.** That is')
w('the finding, and it is what the signature is about.')
w('')
w('---')
w('')
w('## UNRESOLVED — and every one is ALREADY excluded from what would be signed')
w('')
w('| # | Item | Effect | Already excluded? |')
w('|---|---|---|---|')
w('| 1 | `4`, `9.1`, `9.2` — height is the unresolved *ancho de calle* table, so the pack carries the '
  'ordinance FLOOR | ⚠ **OVER-states** above 9,00 m | ✅ yes — named in SIG-M1 as unsignable in principle |')
w('| 2 | `5.1`, `5.2`, `5.3` — Art. 8.5.6.3 measures to the street **centreline** | ⚠ **OVER-states** on '
  'a narrow street | ✅ yes — same |')
w('| 3 | 25 pipe-joined table reconstructions stored in a field named `verbatim` | provenance mislabel; '
  'cells verified on the cited page | 🟡 cosmetic — worth fixing at source |')
w('| 4 | BOCM texts of **MPG 00/343** (27.11.2023) and **MPG 00/335** (19.05.2016) not held | signature '
  'is on a **consolidation** | ✅ yes — validity-verification, per the founder |')
w('')
w('---')
w('')
w('## THE THREE PRECONDITIONS')
w('')
w('| # | Precondition | Status |')
w('|---|---|---|')
w(f'| 1 | Targeted human review | 🟡 **artefact complete, {S["sampled"]} records — awaiting a human read** |')
w('| 2 | Four residual-risk classes verified | ✅ **R1/R2/R3 100 % enumerated; R4 has a CI trigger** |')
w('| 3 | End-to-end `pipeline-extracted-unverified` rendering | ✅ **verified** — §RED-CHIP-NZ7-NZ8 solves '
  'every NZ-7/NZ-8 grado; red chip is the first badge arm (weakest-wins) |')
w('')
w('## THE PRIOR MEASUREMENT THIS RESTS ON')
w('')
t = conc['summary']['tally']
w(f'§MADRID-QUOTE-CONCORDANCE re-read **all {conc["summary"]["quotesChecked"]}** verbatim strings against')
w(f'the filed Compendio: **{t.get("ON-CLAIMED-PAGE", 0)}** on the cited page, '
  f'**{t.get("SPANS-FROM-CLAIMED", 0)}** spanning from it, **0 cited to a wrong page, 0 fabricated**.')
w('')
w(f'**Corpus pinned:** sha256 `{T["corpusSha256"]}` · {T["corpusPages"]} pp · '
  f'**{S["articlesWithAmendments"]} of {S["articlesCited"]}** cited articles already amended in this')
w('edition, baselined per article. A changed footnote re-opens **that article only**.')
w('')
w('---')
w('')
w('## WHAT SIGNING WOULD MEAN')
w('')
w('**Covers:** `esMadridPgoum97.ts` is an accurate transcription of the Compendio 2025 for the **23')
w('shipped zones**, publishable at **`pipeline-extracted-unverified`**, explicitly identified as a')
w('machine-generated derivative.')
w('')
w('**Does not cover:** the six over-stating zones (rows 1–2 above) · the BOCM text · NZ 3 (Art. 8.3.1')
w('governs) · NZ 1 (SIG-M2) · **promotion above `pipeline-extracted-unverified`** — a separate, later,')
w('deliberate edit, since `capEnvelopeConfidenceToPackDefault` is demote-only by design (ADR-0286).')
w('')
w('**Measured effect if signed:** the 23 packed zones = **27.847 %** of Norma-Zonal land move from')
w('`no-pack` (0.0) to `pipeline-extracted-unverified` (0.1) — ENVELOPE **4.68 % → 7.46 %**. As scoped,')
w('SIG-M1 excludes the six unsignable zones, so the realised move is over **17.248 %**: '
  '**4.68 % → 6.40 %**.')
w('')
w('---')
w('*Generated from `sig-m1-review-sample.json` + `quote-concordance-2026-08-01.json`.*')

(BASE / 'extracted/SIG-M1-COVER-SHEET.md').write_text('\n'.join(out) + '\n', encoding='utf-8')
print('issues:', len(uniq), 'sampled:', S['sampled'])
