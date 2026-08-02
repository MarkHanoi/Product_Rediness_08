# `tools/aragon-municipal-probe` — testing "Aragón is CLOSED" at the MUNICIPAL level

`ARAGON-BUILDABILITY-RESEARCH.md` records Aragón as **CLOSED** on four caps.
**Three of the four are statements about the *regional* SIUa layer, generalised to
the municipal level without testing it.** This directory tests it.

| Cap as recorded | What it is actually a property of | Survives municipally? |
|---|---|---|
| `fiab_geom` legal approval, 21.8 % | the **SIUa regional layer** | ⛔ **NO** — says nothing about a municipal plan |
| scale 1:15,000 / 1:300,000 | the **regional publication scale** | ⛔ **NO** — Huesca plano nº5 is **1:1.000**, Zaragoza serves parcel-precision vector |
| the ficha carries zero buildability | **IDEAragon's geodata download catalogue** | ⛔ **NO** — a municipal *ficha de ámbito* is a different artefact and carries edificabilidad |
| Huesca is closed-block fabric | **a grammar, and PRYZM implements it** | ⚠ **not a cap at all** |

**VERDICT: the closure does NOT survive, and every error runs PESSIMISTIC.**

---

## Scripts

| Script | Answers |
|---|---|
| `probe_huesca_plano5.py` | is plano nº5 a **vector drawing** or an image? |
| `extract_plano5_geometry.py` | walks the content stream as a graphics machine → polylines |
| `probe_plano5_line_classes.py` | is the *fondo* line **separable** from the base map? |
| `probe_huesca_services.py` | is there a municipal OGC service behind GeoInfoHuesca? |
| `probe_zaragoza_idezar.py` | IDEZar WFS/WMS inventory, schemas, VALID%/DISTINCT/range |
| `probe_zaragoza_wms_only.py` | the four layers WMS serves and WFS does not |
| `probe_zaragoza_calificacion.py` | the **unadvertised typename**, and the zone code space |
| `probe_lexeme_corpus.py` | `fondo` vs `profundidad`, and Huesca NZ3/NZ4/NZ5 verbatim |
| `resolve_one_parcel.py` | one parcel through `municipal → regional → REFUSE` |

Outputs in `out/`. Cached PDFs in `out/pdf_cache/` (not committed).

---

## The source hierarchy — the real product, and it generalises beyond Aragón

```
municipal detailed plan   ->   regional SIUa   ->   REFUSE
```

Spain is organised `parcel → municipality → instrument → detailed zoning → rule`,
**not by autonomous community.** A resolver that prefers municipal detail and falls
back to regional is the correct shape everywhere. Measured on 421 Zaragoza parcels
across 5 areas of the city:

| outcome | n | meaning |
|---|---:|---|
| **PARTIAL** | 310 | tier-1 municipal zone + governing chapter resolved |
| **REFUSE** | 66 | ZV / EQ / SNU — not a buildable ordinance. **A correct answer.** |
| **DEFER** | 36 | `PR-` / `SUZ` — governed by a development instrument |
| **fall through to tier 2** | 9 | no municipal polygon; regional SIUa would be consulted |

⛔ Tier 2 was **never reached on 412 of 421 parcels.** The regional layer's 21.8 %
`fiab_geom` ceiling — the headline cap — was **not binding on 97.9 % of the sample.**

---

## Traps this run hit, and what they cost

**⛔ ENCODING IS A LEXEME TRAP, AND IT FAILS PESSIMISTIC.** Reading Huesca's
`pdftotext` output as UTF-8 with `errors='replace'` scored `altura máxima` at
**ZERO** while the string occurs **35 times**: every accented byte became U+FFFD.
Correcting the decode changed the measured corpus by up to **28×** on one lexeme:

| lexeme | UTF-8 assumed | cp1252 (correct) |
|---|---:|---:|
| `coverage` (ocupación) | 3 | **86** |
| `alignment` (alineación) | 68 | **137** |
| `altura máxima` | **0** | **26** |
| `plan sheet reference` | 31 | **85** |
| `fondo` | 33 | **46** |

A false zero on a buildability lexeme is indistinguishable from "the ordinance is
silent". **Decode by trial and record which encoding won.**

**⛔ BARE ARTICLE NUMBERING.** Huesca's PGOU numbers its articles `8.4.8.` with no
`Artículo` / `Art.` prefix. An `art\.?\s*\d+\.\d+\.\d+` regex scores **zero** on a
document containing all three target articles.

**⛔ THE FIRST OCCURRENCE OF AN ARTICLE ID IS THE TABLE OF CONTENTS.** Take the last
line-start occurrence, not the first, or you extract an index entry and report it as
the rule.

**⛔ `startIndex` RETURNED HTTP 400 WHILE `count` RETURNED 200.** The obvious pager
therefore pulled **zero features and reported the layer empty**. It was 9,031
features the whole time. *A 400 is a PARAMETER fault, never a statement about the
data.* This probe's own first run made exactly this mistake.

**⛔ AN UNFILTERED `GetFeature` IS NOT A SAMPLE.** The first 400 parcel rows were all
from one corner of the historic centre — 313/400 in zone B. A zone distribution
computed from that describes GeoServer's row order, not Zaragoza.

**⛔ A RESOLVER THAT ALWAYS ANSWERS IS NOT A RESOLVER.** An earlier version emitted
the A1 per-dimension block for *every* mapped zone, so a parcel in zone B was
reported carrying art. 4.1.3 — an article that does not govern it. Zones read only
to chapter level now say `NOT-READ`.

**⛔ UNREACHABLE ≠ ABSENT.** `gis.huesca.es` resolves to 194.179.101.147 and times
out on both HTTPS and HTTP from this network. That is an **UNKNOWN**. Only an HTTP
status is evidence about a resource.

---

## The depth lexeme, re-tested

Málaga never uses `fondo`; it defines `profundidad edificable`, and a `fondo`-shaped
search misses 27.6 % of València documents. **Aragón is the mirror image.**

| corpus | `fondo` | `profundidad` | which is the buildable-depth term |
|---|---:|---:|---|
| Huesca PGOU 2008 Normas | 46 | 8 | **`fondo`** |
| Zaragoza TR2024 Título 4 | 78 | 6 | **`fondo`** |
| Zaragoza TR2024 Título 2 | 26 | 21 | **`fondo`** |

Every single `profundidad` hit across all three is a **generic dimension** — depth of
a courtyard, of a terrace, of a balcony overhang, of a shop unit — never the
buildable depth. ⇒ **In Aragón the risk is not a MISS, it is a FALSE POSITIVE.** A
`profundidad`-only search would return 35 hits across this corpus and every one
would be wrong. **Search both; classify by context, never by presence.**

⚠ And the sibling lexemes are **not** synonyms: `altura de cornisa` (34 hits in
Huesca) is a **different datum** from `altura máxima` (26) — counted separately here
and never merged.

---

## ⭐ A NATIONAL FINDING — surface this beyond Aragón

València is registered as a refusal-jurisdiction because its buildable depth is
*"GRAPHED ON THE PLANO C SHEETS, which the city does not publish as data."* Huesca
refuses for the identical stated reason (*"definido gráficamente en el plano nº5"*),
and Zaragoza for a third instance of it (*"el fondo máximo dibujado en planos"*).

**Measured here: for Huesca that premise is FALSE.** The sheets are not images.
They are Print-To-PDF **vector CAD plots** — no fonts, no rasters, a quarter-million
path operators each — and the geometry extracts. *"Not published as data"* was
inferred from *"published as PDF"*, and **PDF is a container, not a format.**

⇒ ⛔ **EVERY SPANISH REFUSAL WHOSE STATED REASON IS "THE NUMBER IS ON A PLAN SHEET"
SHOULD BE RE-TESTED WITH `probe_huesca_plano5.py`.** València's *plano C* and
Zaragoza's *tomo 11* were **not** anatomised this run — UNKNOWN, not absent. If they
are vector too, the depth blocker across several Spanish cities is one shared
extraction pipeline rather than a per-city sourcing wall.

⚠ Being vector is necessary, not sufficient: georeferencing and a one-off human
legend read are still required (see `REGISTRATION-DIFF.txt` §5).
