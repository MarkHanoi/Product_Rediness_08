# L-660 — DOGC 4893 annex RETRIEVED; Barcelona height figures confirmed unchanged

**Date:** 2026-08-01
**Status:** CLOSED for TASK 1 (binding text retrieved) · OPEN for supersession
**Owner artefacts:** `docs/04-reference/jurisdictions/es/es-ct/08019-barcelona/corpus/**`

---

## Headline

**The DOGC 4893 annex was retrieved in full.** We now hold the binding published text of

> *«Modificació puntual de les Normes urbanístiques del Pla general metropolità per a la
> modificació de les alçades reguladores en el tipus d'ordenació segons alineació de vial,
> al terme municipal de Barcelona»*
> Expedient **2006/025790/B** · approved **2 March 2007** (Subcomissió d'Urbanisme del
> municipi de Barcelona) · published **DOGC núm. 4893, 29 May 2007, pp. 18336–18339**

together with the **registered instrument** from the RPUC (the signed, DGU-stamped
*Text aprovació definitiva*, March 2007).

**Every figure the engine publishes for claus 13a and 13b is CONFIRMED against the binding
text. Zero corrections. No number in any `.ts` needs to change.**

---

## What this closes

The buildability engine was publishing heights across ~44.0 % of Barcelona's private
buildable land (claus 13a + 13b + 12) on the authority of the AMB compendium — a
self-described *«merament divulgativa»* re-edition consolidated only to 31-12-2009. That
exposure is now removed for the **article text**: the figures are verified against the
gazette.

| item | prior state | now |
|---|---|---|
| Art. 327.2a (13a), 6 rows | AMB compendium only | ✅ binding text — **identical** |
| Art. 328.2a (13b), 4 rows | AMB compendium only | ✅ binding text — **identical** |
| Art. 320.3a (clau 12), 4 rows | **not held at all** | ✅ binding text — **new** |
| Art. 239 (general *alineació de vial*) | AMB compendium only | ✅ binding text |
| 3,05 m storey minimum | assumed unchanged | ✅ **confirmed unchanged**, 3× in the annex |
| Territorial scope | read as whole *terme municipal* | ✅ **confirmed**, no sector/àmbit restriction |
| Transitional regime | assumed none | ✅ **none in the published text** |
| Expedient number | `2007/028428` (unverified) | ❌ **WRONG — that is Badalona's.** Correct: **`2006/025790/B`** |

### The tables, as published

**Art. 327.2a — clau 13a**

| Ample de vial | Alçada màxima | Plantes |
|---|---|---|
| < 8 m | 9,00 m | PB + 1 |
| 8 – <12 m | 12,35 m | PB + 2 |
| 12 – <15 m | 15,70 m | PB + 3 |
| 15 – <20 m | 19,05 m | PB + 4 |
| 20 – <30 m | 22,40 m | PB + 5 |
| ≥ 30 m | 25,75 m | PB + 6 |

**Art. 328.2a — clau 13b**

| Ample de vial | Alçada màxima | Plantes |
|---|---|---|
| < 8 m | 8,25 m | PB + 1 |
| 8 – <11 m | 12,00 m | PB + 2 |
| 11 – <15 m | 15,40 m | PB + 3 |
| ≥ 15 m | 18,80 m | PB + 4 |

**Art. 320.3a — clau 12, subzona I** *(new)*

| Ample de vial | Alçada reguladora màxima | Plantes |
|---|---|---|
| < 8 m | 7,90 m | PB i 1 |
| 8 – <12 m | 11,25 m | PB i 2 |
| 12 – <15 m | 14,60 m | PB i 3 |
| ≥ 15 m | 17,95 m | PB i 4 |

Clau 12 *subzona II* (conservació del centre històric) has **no table** — the height is the
*mitjana de les edificacions existents*, floors derived from a 4 m ground storey + 3,05 m
upper storeys. Anything the engine publishes for 12-II is a **construction**, not a lookup
(same shape of finding as ADR-0271 for *edificabilitat*).

Full verbatim scope clause and article text: `corpus/INDEX.md` §1.2.

---

## The provenance bug this resolved

A prior repo record cited expedient **`2007/028428`** for the Barcelona instrument. That
number is **Badalona's** — it belongs to

> *«Modificació puntual de les Normes urbanístiques del Pla general metropolità, al terme
> municipal de **Badalona**»*, resolved by the conseller de PTOP on 6 June 2008, published
> DOGC 5189 (6-8-2008) and **re-published in full** as a *correcció d'errades* in
> DOGC 5224 (29-9-2008).

This is the **third** time the Barcelona/Badalona pair has produced a contaminated
citation in this repo (the earlier one was read off geoportal page `08015` — Badalona's
INE code). The reason it keeps happening is now documented and, importantly, **is not a
carelessness story**:

**Badalona's arts. 327.2a and 328.2a state numerically identical tables** — 9,00 / 12,35 /
15,70 / 19,05 / 22,40 / 25,75 and 8,25 / 12,00 / 15,40 / 18,80, and the same 3,05 m storey
minimum. Verified on the raster of DOGC 5224 p. 70895. A figures-only check **cannot**
distinguish the two documents.

They differ where it matters:

| | Barcelona | Badalona |
|---|---|---|
| Expedient | **2006/025790/B** | **2007/028428/B** |
| Approving body | Subcomissió d'Urbanisme del municipi de Barcelona | Conseller de PTOP |
| Approval | 2007-03-02 | 2008-06-06 |
| Publication | DOGC 4893, 29-05-2007 | DOGC 5189 → DOGC 5224, 29-09-2008 |
| Articles | 239, 320, 327, 328 | 229, 327, 328, … |
| 13b interior d'illa | **3,30 m** | **3,75 m** |

Both PDFs are committed side by side in `corpus/pdf/`, the Badalona one deliberately named
`…_NOT-BARCELONA.pdf`, so the next reader trips over the distinction rather than into it.

There is also a *third* nearby document — Badalona expedient `2006/025449/M`, approved
2007-03-09, about *alçades reguladores* in *zones 14 del barri de la Salut*. Three
documents, all about regulating heights, all 2007–2008, two of them Badalona's.

> **Rule to carry forward: verify the municipality on the face of every document opened.**
> The numbers will not tell you. The cover page and the expedient suffix will.

---

## Supersession — `NOT_VERIFIED / not_found`

```yaml
verification:
  question: "Were Arts. 239, 320, 327 or 328 modified after the 2 March 2007 MPGM?"
  consulted: [RPUC (official register), DOGC (official gazette), AMB NUMAMB (not reached, HTTP 403)]
  consultationDate: 2026-08-01
  result: NOT_VERIFIED
  finding: not_found
  legalMeaning: "This is a NOT-FOUND result."
  itDoesNotMean: "That no later modification exists."
  confidence: medium
```

How far the amendment chain was walked: **1 755** Barcelona instruments enumerated from the
RPUC → **773** dated after 2007-03-02 → **147** at PGM level (capable of amending PGM
normative articles) → **9** flagged by title → **0 of 147 opened and read**.

Supporting (but not sufficient) register facts:
- RPUC reports the 2007 instrument `vigencia = SI` — **in force**.
- RPUC `expedientsRelacionats = []`.
- Only one `assentament`: *Alta*, Llibre 0, núm. 872, 2007-12-20. No later *Baixa* or
  *Modificació*.

Why that is still not `NONE`: an empty relation graph may mean *"no relation recorded"*
rather than *"no relation exists"* — the art. 264 instrument also shows `[]`, yet it
demonstrably amends PGM-1976. **Do not write `laterModifications: none` anywhere.**

The four post-2007 general-normative PGM modifications found (art. 264 · aparcaments ·
equipaments comunitaris · 22@ Normes) do not name arts. 239/320/327/328 in their titles.
That is a title screen, not a text check.

**To upgrade to `NONE FOUND`:** open all 147 and assert the union of their
*articulat modificat* lists does not intersect {239, 320, 327, 328}. All 147 are
downloadable from the RPUC document endpoint — mechanically tractable, recipe in
`corpus/RETRIEVAL-LOG.md` §6.

---

## Method note — the extraction trap that nearly cost the tables

The 2007-era DOGC PDFs have **no ToUnicode map** and mix **several CID offsets inside a
single line**. A per-font single-shift decoder produced text that reads as fluent Catalan
while silently mis-rendering digits — the exact failure this repo has been bitten by
before ("a text pass drops every digit and a whole table vanishes").

**Every number in this record and in `corpus/INDEX.md` was read from a 200 dpi raster
render**, not from `get_text()`. The decoded text was kept only as a cross-check.

Two other traps worth institutionalising:

1. **`portaldogc.gencat.cat` fails Python's default TLS handshake**
   (`SSLV3_ALERT_HANDSHAKE_FAILURE`) but works fine under `curl`. This produced a run of
   false "document not found" results before it was spotted. **Shell out to curl.**
2. **DOGC `documentId`s are not monotonic in issue number** (id 470000 → issue 5448/2009;
   id 480000 → issue 5013/2007). A binary search over the ID space is invalid. Use the
   `searchDOGC` API with a publication-date range instead.

---

## Follow-ups

| # | action | why |
|---|---|---|
| 1 | Retrieve `2009/036679/B` (art. 264) DUN | one download; closes the *volumetria específica* family |
| 2 | Retrieve `2000/002253/B` (clau 13E creation) | the only instrument defining 13E |
| 3 | Sweep all 147 post-2007 PGM-level instruments | upgrades supersession from `NOT_VERIFIED` |
| 4 | Reach `ORD-2002-EIXAMPLE` + its two 2015 *Derogació* rows | its force is currently **UNKNOWN**; do not rely on it |
| 5 | Fix stale `rpucportal.territori.gencat.cat` references repo-wide | the host **no longer resolves**; RPUC is now `planejamenturbanisme.territori.gencat.cat` |
| 6 | Consider feeding clau 12 (art. 320.3a) into the rule pack | binding text now held; **founder's call — no `.ts` touched by this task** |

**No `.ts`, no rulepack registry, no `server.js` was touched.** Changing a published number
is the founder's act (the L-449 precedent); this record only establishes that, for 13a and
13b, **no change is warranted**.
