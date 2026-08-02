# Canarias SIPU catalogue probe (C0)

Measures the **catalogue** of Canarian planning instruments on
`opendata.sitcan.es` (CKAN). It does **not** open ZIP interiors — that is the
sibling `canarias-sipu-probe`, which consumes `out/SAMPLE-FRAME.json` from here.

Run in order; each script writes to `out/`.

```
python 01_harvest.py                  # full catalogue walk + oracle reconciliation
python 04_filter_negative_control.py  # is CKAN fq trustworthy? (independent)
python 05_extract.py                  # normalise 4,697 resources into flat records
python 06_distributions.py            # the six distributions + 11 sum checks
python 07_controls.py                 # known-answer, code-space, supersession
python 08_sample_frame.py             # seeded stratified frame + HEAD verification
```
`02_explore.py` / `03_extras.py` are the discovery steps that located the corpus
and established which metadata is structured versus free text.

## Headline

**1,169 SIPU ZIPs exist across all 88 of the 88 Canarian municipalities
(984 municipal + 185 island/natural-space/modernisation), and the top instrument
family — Plan General de Ordenación — is 32.1% of them.**

## What was proven

| Claim | Status | Evidence |
|---|---|---|
| 174 packages / 4,697 resources / 1,169 SIPU | `proven` | CKAN `count` oracle == `package_list` == paged walk, all 174 |
| 88/88 municipalities have ≥1 SIPU | `proven` | one `planeamiento-urbanistico-de-*` package each; zero empty |
| All 28 frame ZIPs downloadable | `proven` | HTTP 200, `Content-Length` == catalogue `size` exactly, 28/28 |
| Approval phase is exposed | `proven` | free text, resource-name prefix, 99.8% parseable |
| "Current" is **not** derivable | `proven` | 0 CKAN relationships; 93.4% share one phase value |
| Which instrument is in force per municipality | `blocked` | blocker: **supersession not published** (see below) |

## Method notes that changed a number

* **Vintage nearly reported as 6.6%.** The first parser looked for
  `aprobado el <date>`. A census of the token preceding every `dd/mm/yyyy`
  showed the dominant verb is `publicado` (BOC publication), not `aprobado`.
  Real coverage is **97.8%** — but 90.4% of it is a *publication* date and only
  6.6% an *approval* date. These are kept in **separate fields** with a
  `vintage_source` provenance tag; merging them would manufacture an approval
  year for ~1,100 records that carry none.
* **A fake island called "AD".** Two different URL path shapes exist —
  `/URB_PLA/<ISLAND>/<Muni>/` for municipal, `/PLA_ENP_URB/<ISLAND>/AD/` for
  natural spaces. Reading the wrong segment invented an island "AD" on 169
  records; `AD` is *Aprobación Definitiva*, a phase directory. `ISLAND_CODE` is
  now a **closed whitelist** of the seven real codes so an unknown token is
  dropped as UNKNOWN rather than promoted. Post-fix, municipalities per island
  is TF 31 / GC 21 / LP 14 / LZ 7 / FV 6 / LG 6 / EH 3 = 88, which matches the
  real Canarian geography independently.
* **`format` contradicts `mimetype` on 1,164 resources** — labelled `PDF`,
  served `text/html`. They are idecanarias index *pages*, not PDFs. Populated is
  not present.

## Negative-proof conditions discharged

* **Truncation** — no count landed on a page size; `count` used as oracle and
  reconciled against two independent enumerations.
* **Paging** — walked with an explicit `sort=metadata_created asc`.
* **Filter silently ignored** (coordinator's 7th condition) — `04` tests a
  nonsense `fq` field name and impossible facet values. On this endpoint `fq`
  **passes**: impossible values return 0, nonsense fields return 0. As
  corroboration, server-side `fq res_format:SIPU` returns 100 packages, matching
  the client-side partition exactly. **All distributions are nonetheless computed
  client-side from the full harvest**, and every one carries a sum check —
  11 run, 11 pass.
* **Code-space truncation** — no 3-digit province-stripped form here (the Madrid
  failure mode is absent). See the code-space defects below.
* **Path shape** — the "AD" island above.
* **Robots** — browser UA throughout.
* **Known-answer control** — Telde, Arona, Agulo, Arico all present with
  reachable SIPU ZIPs. 4/4 pass.

## Named blockers

* **`supersession-not-published`** — zero CKAN relationships across all 174
  packages; no `replaces`/`replacedBy`; no `vigente` flag. 43 of 88
  municipalities hold **more than one** non-modification base instrument
  (PGO or NNSS), so the ambiguity is real and affects half the region.
  Phase does not break the tie: 93.4% of SIPU share the single value
  *Aprobación Definitiva*.
* **`fip-code-unreliable`** — the municipality code in FIP URLs is mostly
  6-digit (INE5 + control digit, 17/18 verified against an independent in-repo
  INE list) but **5-digit on 5 records**, and two municipalities carry a
  corrupted province digit: Puerto de la Cruz has `280282` (province 28 =
  Madrid) alongside `380282`, and Valverde has `370488` (province 37 =
  Salamanca) alongside `380488`. The FIP prefix is **not** a stable municipality
  key. The reliable key is the CKAN package, one per municipality.
* **11 municipalities have zero non-modification base instrument** in the
  catalogue — only modifications, sentencias or subsidiary instruments. Whether
  the base plan is unpublished or merely titled differently is `UNKNOWN`.

## Artefact for the sibling agent

`out/SAMPLE-FRAME.json` — 28 SIPU ZIPs, `random.seed(20260802)`, coverage-first
across island × instrument family × vintage era × catalogue-volume band, capped
at 2 per package (24 distinct packages), plus smallest/median/largest ZIP. Every
row HEAD-verified: 28/28 HTTP 200 with exact size agreement.

**The artefact carries an explicit `VALIDITY` block.** The frame is valid for
ZIP-interior schema, field-coverage and grammar questions. It is **not** valid
for estimating area or parcel shares — it is drawn proportional to *catalogue
volume*, not land area or population.
