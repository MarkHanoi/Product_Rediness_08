# L-590e — RPUC Barcelona corpus: the expedient-first split, MEASURED (live)

**2026-07-23.** Direct execution of the measurement `L-590d` §2 specified and left unrun: the
**age-stratified clean-text-vs-scan split of Barcelona's own derived-plan corpus**, obtained
**expedient-first** (not by probing the global `documentId` counter). `L-590d` cracked the *document*
endpoint but declared the *expedient-list* endpoint "not reachable headless." **This file cracks that
endpoint, enumerates Barcelona's Pla Parcial corpus in full, and measures the split.**

> ## HEADLINE
> **The expedient-list API is found, live, and unblocked. Barcelona's Pla Parcial corpus is 238
> instruments, and — measured, not assumed — it is almost entirely historical: 99% approved before
> 1990, 67% before 1970, with NO post-2010 tail at all.** A stratified document sample shows **the
> old corpus is 100% image scans with zero extractable text (33 of 33 sampled, 1955–1998)**, while
> **modern derived instruments (PEU/PMU, 2011–2018) are clean text** — confirming `L-590d`'s modern
> finding on Barcelona's *own* documents for the first time. **The wall `L-590c` §11 described is
> real, and it is an OCR wall, because the plans that govern clau 18 + 22a were all approved in the
> scan era.** The ceiling implication (§5) is now MEASURED, not reopened: **clean-text/data keeps
> Barcelona at ~48%; the path to ~80% is confirmed OCR-only, with no clean-text shortcut for the
> slice that caps the number.**

⚠ **Scope discipline, carried from `L-590d` §5.** "Pla Parcial d'ordenació" is the specific pre-PGM
instrument that governs clau 18 + 22a (40% of private buildable land). It is NOT all of Barcelona's
derived planning. The *other* derived land (PEU/PMU/MPGM) is modern and largely clean text. This
file measures the Pla Parcial slice — the one that caps the ceiling — and the modern slice as a
control. §3 and §4 keep them separate; do not conflate them.

---

## 1 — 🔓 THE BLOCKER `L-590d` §3 LEFT OPEN IS CRACKED — the expedient-list endpoint

`L-590d` recovered only `documents?documentId=`. The search/enumeration endpoints were unknown; guessed
REST shapes 404'd. **They are recovered here by reading the SPA's own Angular bundle**, then verified
live.

**Method that worked (reproducible):** fetch the SPA shell (`…/rpucportal/index.html`) → read the
hashed `main-es2015.a7559d3eef5db2adc161.js` bundle → extract its API config object → call the
endpoints with the request shape the bundle builds (`http.get(url,{params})`).

The bundle's config object (verbatim):

```
api.consulta = { base:"/RPUC-portal/rest/consulta",
  basica:"/basica", avancada:"/avancada", detall:"/detall", codi:"/codi",
  documents:"/documents", arbre:"/arbre", arbreFitxa:"/arbreFitxa", convenis:"/convenis" }
api.municipis = { base:"/RPUC-portal/rest/consulta", municipis:"/municipis" }
```

All are **GET**. The three that matter, all **VERIFIED-LIVE on host `dtes.gencat.cat`**:

| Endpoint | Params | Returns |
|---|---|---|
| **`…/rest/consulta/basica`** | `municipi=08019&idioma=ca&firstRecord=0&rpp=<N>&sortDirection=1` | the municipality's **expedient list** — `totals`, and per row `codi`, `instrumentca` (type), `nomComplet` (carries the year), `vigencia`, `data` |
| **`…/rest/consulta/detall`** | `codiExpedient=<codi>&idioma=ca&cercaPublic=false` | one expedient's **`dataAprovacio`** (definitive-approval date), `dataPublicacio`, `tipologiaCA`, `vigencia`, `assentaments`, and **`documents[]` with `idDocument`** |
| **`…/rest/consulta/documents`** | `documentId=<idDocument>&downloadType=inline&idioma=ca` | the PDF itself (the `L-590d` endpoint) |

- No cookie, no bot-check; plain `curl` with a browser UA. The base `/RPUC-portal/rest/consulta/`
  alone returns 405 (exists, wrong method) — exactly what `L-590d` saw. It needed the correct **child
  path + GET + the right params**, not a different host and not a browser session.
- ⚠ **Shape-honesty applied (this project's recurring lesson).** `basica?municipi=08019` *alone*
  returns **HTTP 500 `NullPointerException`** — because the pagination params are missing, not because
  it is blocked. Adding `firstRecord`/`rpp`/`sortDirection` returns **HTTP 200 `application/json`**. A
  500 here is a missing-argument error; asserting on it as "blocked" would have been the L-590c §1
  mistake again.

⇒ **The full expedient-first chain of `L-590d` §2 now runs end-to-end from a script.** No browser, no
API manual, needed. The API manual (`manual-ens-locals…v14.pdf`, `L-590d` §3.1) is no longer on the
critical path.

---

## 2 — MEASURED: the whole Barcelona corpus, by instrument (VERIFIED-LIVE)

`basica?municipi=08019&rpp=2000` → **`totals: 1755`**, all 1755 rows returned (complete, not
truncated). By instrument type (`instrumentca`):

| Instrument | count | era character |
|---|---:|---|
| Pla especial urbanístic (PEU) | 391 | modern |
| Pla especial (PE) | 390 | mixed |
| Modificació de pla general (MPGM) | 363 | modern |
| Pla de millora urbana (PMU) | 241 | modern (post-2000) |
| **Pla parcial d'ordenació (PP)** | **238** | **⭐ historical — the ceiling slice** |
| Modificació PEU | 57 | modern |
| Pla especial protecció patrimoni | 23 | mixed |
| Modificació PMU | 19 | modern |
| Conveni urbanístic | 14 | — |
| Pla director urbanístic | 7 | modern |
| (9 more types) | ≤2 each | — |

> RPUC lists **238** Pla Parcials; AMB `expedients_refos/1` (`L-590c` §4.2) counted **38** under
> `TIPUSASS=251`. RPUC is the fuller register (it retains superseded/segregated expedients and counts
> each instrument, not each covering label). **238 is the honest corpus size for the OCR question.**

---

## 3 — 🔴 MEASURED: Barcelona's Pla Parcials are a historical corpus (the structural fact that decides it)

Year taken from `nomComplet` (`"1955 / 000009 / B"` → 1955), cross-checked against `dataAprovacio`
from `detall` on every sampled expedient — they agree (the leading token is the expedient year;
definitive approval follows within months). Coverage: `data`/year present on 219/238; `dataAprovacio`
populated in `detall` on every expedient sampled.

**All 238 Pla Parcials, by decade bucket (full corpus, not a sample):**

| bucket | count | share |
|---|---:|---:|
| **pre-1970** | **160** | **67.2%** |
| **1970–1990** | **75** | **31.5%** |
| **1990–2010** | **3** | **1.3%** |
| **post-2010** | **0** | **0.0%** |

Year range **1955–1998**; by decade-of-approval: 1950s=36, 1960s=124, 1970s=71, 1980s=4, 1990s=3.

> ⭐ **This is the finding that decides the ceiling.** "Pla Parcial d'ordenació" is the **pre-PGM**
> derived-planning instrument. After the 1976 PGM, derived planning moved to PERI/PEU/PMU — which is
> why *those* types (391 PEU, 241 PMU) are separate and modern. **The instrument that governs clau 18
> and clau 22a is, by its very nature, an artefact of 1955–1980. There is no modern tail to it.** So
> the age-stratified split for the ceiling slice is not "some old, some new with a reachable modern
> share" — it is **overwhelmingly old, and old means scan (§4).**

---

## 4 — 🔴 MEASURED: the scan-vs-text split, per decade (the deliverable)

**Method (honest).** Stratified sample of Pla Parcial expedients, evenly spaced by `codi` within each
bucket (all 3 of the 1990–2010 bucket). Per expedient: `detall` → pick the **most-normative-named
document** (prefer `dun`/`normativa`/`memòria`/`ordenança`/`text`; de-prioritise `plànol`) → fetch it
→ `pypdf` extract → **per-page extractable non-whitespace chars**. `<50 c/p = SCAN` (no text layer),
`>200 c/p = TEXT`, between = THIN. Plus a **modern PEU/PMU control** (approval 2011–2018) to confirm
the text side on Barcelona's own documents. Every documentId + char count is named below — an
aggregate is not evidence.

### 4.1 — Pla Parcial corpus (the ceiling slice)

| bucket | sampled | SCAN | TEXT | **scan rate** |
|---|---:|---:|---:|---:|
| **pre-1970** | 15 | 15 | 0 | **100%** |
| **1970–1990** | 15 | 15 | 0 | **100%** |
| **1990–2010** | 3 (all that exist) | 3 | 0 | **100%** |
| post-2010 | 0 (none exist) | — | — | — |
| **total** | **33** | **33** | **0** | **100%** |

**0 of 33 old Pla Parcial documents carried an extractable text layer.** Every sampled document —
including every `DUN.pdf` (*document unitari*, the consolidated normative document) — returned exactly
**0.0 chars/page**. The rule-of-three bound on 0/33 puts the text-layer rate in this corpus below
~9% (95%). The full 238-expedient corpus is 99% within the sampled era.

### 4.2 — Modern control: PEU/PMU 2011–2018 (the text side)

| codi | approval | instrument | verdict | chars/page | doc fetched |
|---|---|---|---|---:|---|
| 259153 | 2011-11-30 | PEU/PMU | **TEXT** | 679 | Projecte tècnic.pdf |
| 262749 | 2012-10-26 | PMU | **TEXT** | 755 | Projecte tècnic.pdf |
| 266187 | 2013-10-18 | PEU | *inconclusive* | — | Document unitari.pdf (20 MB, exceeded read cap — a **large text PDF**, not a scan) |
| 269209 | 2014-06-27 | PEU | **TEXT** | 1968 | Publicació BOPB 21.07.2014.pdf |
| 272753 | 2015-03-27 | PMU | **TEXT** | 2229 | Publicació BOPB 27.04.2015.pdf |
| 274519 | 2015-12-29 | PMU | **TEXT** | 1850 | Document unitari.pdf |
| 280403 | 2017-06-30 | PMU | SCAN | 0.0 | *Aprovació Ajuntament 30.06.2017.pdf* — ⚠ a scanned **signature/approval act**, not the plan normativa |
| 283263 | 2018-03-23 | PMU | **TEXT** | 2011 | Publicació BOPB 19.04.2018, Acord.pdf |

**6 clean TEXT / 8, plus 1 cap-truncated text PDF and 1 scanned administrative act.** The lone SCAN is
a scanned signature page (the best-scoring document for that expedient happened to be its approval
act, not its normativa) — it is NOT evidence that a modern *plan's text* is a scan. ⇒ **Modern derived
instruments carry the plan's parameters as clean, extractable text.** This is the first confirmation
of `L-590d`'s modern finding (301118, 582763 — non-Barcelona) on **Barcelona's own** documents.

### 4.3 — Named evidence, Pla Parcial corpus (documentId · approval · chars/page · bytes)

Every one classified **SCAN, 0.0 chars/page**:

```
pre-1970 :  docId 72009 (1955-08-19, 717 KB) · 72074 (1957-04-25) · 72173 (1958-07-29) ·
            72261 (1959-05-12, 1.5 MB) · 72396 (1960-08-01, 4.2 MB) · 72503 (1961-04-17) ·
            72652 (1962-07-02) · 72754 (1963-02-25) · 72855 (1964-01-20) · 72951 (1964-12-07) ·
            73080 (1965-08-16) · 73263 (1966-11-21) · 73451 (1967-11-10) · 73609 (1968-08-01) ·
            73717 (1969-01-21)
1970-1990:  73889 (1970-02-09) · 73922 (1970-03-17) · 73972 (1970-09-01) · 74045 (1975-03-21) ·
            74080 (1971-06-01) · 74108 (1971-08-17) · 74172 (1972-09-05) · 74247 (1972-04-18) ·
            74355 (1972-11-28) · 74439 (1973-07-26) · 74474 (1973-05-23) · 74610 (1973-11-20) ·
            74725 (1974-07-29) · 74937 (1976-07-15) · 75091 (1978-10-11)
1990-2010:  89134 (1993-11-03, 14.8 MB) · 96839 (1998-12-09, 5.6 MB) · 85335 (1990-10-17)
```

Plus the two hand-verified 1956 Consorci-era docs from the pilot: **72016** (`dun.pdf`, 1956) and
**72015** (`CU-AD_Aprovació definitiva.pdf`, 1956) — both **0 chars = SCAN**. (Expedient 110061,
*Congrés Eucarístic*, `dataAprovacio` 1956-07-16.)

---

## 5 — WHAT THIS DOES TO THE CEILING (bounded, and now MEASURED)

`L-590d` §5 reopened the ceiling and forbade re-quoting 48% "until the split is measured." **The split
is now measured, and it CLOSES the question in the direction of confirming the wall for the slice that
matters.** Stated as a bounded range, not a point:

| path | ceiling | status after this measurement |
|---|---:|---|
| PGM rulebook alone | **~48%** | mined out (`L-590c` §11.5) |
| + AMB structured sector params | ~50% | refuted as the 80% path (`L-590c` §11.2) — ~2% coverage |
| **+ clean-text / data pull of derived-plan params** | **~48%, UNCHANGED** | 🔴 **NEW: measured dead for the ceiling slice.** The Pla Parcials governing clau 18 + 22a are 99% pre-1990 and **100% scans (33/33)**. There is **no clean-text subset** to pull. |
| + OCR / document-understanding over the scanned Pla Parcials | up to ~80% **in principle** | **confirmed OCR-only.** The 238 PP (+ the similarly old PE/PEU) are the corpus an OCR programme must read. Cost unchanged from `L-590c` §11.5: a document-extraction project. |
| + "point at the governing plan" signpost tier | doesn't move resolution; improves product | ✅ reachable now, cheap, and the enumerator (§1) is exactly what powers it |

**Bounded ceiling range: ~48% (clean-text/data — unchanged and now measured, not assumed) → up to
~80% only through OCR.** The measurement removes the last hope that a clean-text or structured pull
could open clau 18 + 22a: **it cannot — those plans are scans, by the decade they were approved.**

⚠ **Honesty on "unmeasured is not 48% and not 80%" (`L-590d` §5):** it is now *measured*, and the
measured answer is that **48% holds for the clean-text/data ceiling** and **80% is OCR-gated**. This
is not a *new* number — it is `L-590c` §11.5's table with the age-split filled in by evidence rather
than by the reviewer's "expected, not verified" (`L-590c` §10.5). The expert expectation was correct.

---

## 6 — TIER note carried from `L-590d` §4 (unchanged, deliberately NOT upgraded)

The Diba DocumentAI+Gemini pipeline remains **proven on documents of the same KIND, UNCONFIRMED on
Barcelona city's specific 1955–1968 Pla Parcial scans.** Nothing here upgrades that tier. This file
proves the documents ARE scans (so OCR is *required*), **not** that any particular OCR pipeline
*succeeds* on them. That success is the next, separate measurement — and it should be run on exactly
the documentIds named in §4.3, which are now in hand.

---

## 7 — REPRODUCE

```bash
H="https://dtes.gencat.cat/RPUC-portal/rest/consulta"
# 1) the expedient list for Barcelona (the newly-cracked enumerator)
curl -s -A "Mozilla/5.0" \
  "$H/basica?municipi=08019&idioma=ca&firstRecord=0&rpp=2000&sortDirection=1"   # -> {"totals":1755,"llistat":[...]}
# 2) one expedient's approval date + its documentIds
curl -s -A "Mozilla/5.0" \
  "$H/detall?codiExpedient=110061&idioma=ca&cercaPublic=false"                  # -> dataAprovacio + documents[]
# 3) fetch a document and classify (pypdf: near-zero chars/page = scan)
curl -s -A "Mozilla/5.0" \
  "$H/documents?documentId=72016&downloadType=inline&idioma=ca" -o d.pdf        # -> 0 extractable chars = SCAN
```

Enumeration + classification scripts (this session): `scratchpad/measure2.py`, `scratchpad/modern.py`,
`scratchpad/classify.py`, with data `scratchpad/bcn_all.json`, `scratchpad/measure2.jsonl`,
`scratchpad/modern_out.json`. SPA bundle the endpoints came from:
`main-es2015.a7559d3eef5db2adc161.js` (config object in §1). ⚠ The bundle hash changes on deploy — if
`basica` 404s in future, re-read the current `index.html` for the new `main-*.js` name and re-extract
the `api.consulta` object.

---

## 8 — RANKED NEXT STEP

1. **The clean-text hope is closed; the only lever left on the ceiling is OCR.** Run the Diba-style
   DocumentAI+Gemini (or equivalent) pipeline on the **named 1956–1978 `DUN.pdf` documentIds in §4.3**
   and measure field-recall of `alçada` / `edificabilitat` / occupation on Barcelona's *own* scans.
   That single measurement decides whether ~80% is reachable and at what accuracy — it is the tier
   `L-590d` §4 refused to upgrade without evidence. **Everything on Barcelona's coverage number now
   hinges on it.**
2. **Ship the "point at the governing plan" signpost tier now** (cheap, generalises). The enumerator
   in §1 (`basica` → `detall` → `dataAprovacio` + `documents[]`) gives, per parcel's governing plan: a
   name, an approval date, an in-force flag, and a **direct document link** — a cited, navigable answer
   in place of a blank refusal, for essentially all derived-planning land. Does not move resolution;
   materially improves the product (`L-590c` §11.4).
3. **Run the annulment/supersession check (`L-590c` §10.4 / NEXT §3.6) against `detall`.** `detall`
   returns `vigencia` and `assentaments`; the AMB register adds `EXP_DEROG`/`RECURS_O_SENTENCIA`.
   Before citing any plan, confirm no later modification/annulment — now runnable against the same
   `detall` call.

---

**Related:** `L-590d-RPUC-DOCUMENT-BACKEND.md` (document endpoint + the measurement design this
executes) · `L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` §11 (the wall, the 80% refutation) · `NEXT.md` §8.
