# L-590d — RPUC document backend: the derived-plan wall is not uniform (verified live)

**2026-07-23.** Direct follow-on to `L-590c` §11, which concluded Barcelona's ~48% ceiling holds
"until the derived-plan documents are read." This file records a **live-verified** partial breach of
that wall, **the correct way to measure it** (an earlier design would have measured the wrong thing),
and the **honest boundary** of what is proven.

> ## HEADLINE
> **The RPUC document backend is live, unblocked, and returns clean extractable text with real
> planning parameters — for MODERN instruments.** The OLD (1956–1968) Barcelona Pla Parcials that
> actually cap the ceiling are **still untested**, because the measurement must be *expedient-first*
> and that API is not reachable headless. **Barcelona's wall is no longer "scans forever" — it is a
> measured split we have not yet run.** Do not re-quote 48% as fixed until the split is measured.

---

## 1 — VERIFIED-LIVE: the document endpoint

```
https://dtes.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=<N>&downloadType=inline&idioma=ca
```

| documentId | HTTP | type | pages | extracted chars | planning keywords | verdict |
|---|---|---|---|---|---|---|
| 301118 | 200 | application/pdf | 5 | 12,592 | edificabilitat, alçada, sostre, planta | **clean text** |
| 582763 | 200 | application/pdf | 7 | 16,311 | edificabilitat, alçada, ocupació, sostre, planta | **clean text** |

- **Unblocked**: no robots block, no bot-detection, no session cookie required. Plain `curl` with a
  browser UA returns the PDF.
- **Extractable**: `pypdf` recovered real Catalan planning text with numeric parameters from both —
  these are text-layer PDFs, not image scans.
- ⚠ **BOTH ARE MODERN AND NOT BARCELONA.** 301118 is a 2016 Comissió Territorial d'Urbanisme de la
  Catalunya Central act (Manresa area); 582763 is a 2023 Penedès POUM modification. **Neither tells
  us anything about Barcelona's old industrial Pla Parcials — the only slice that moves the ceiling.**

---

## 2 — 🔴 THE MEASUREMENT-DESIGN CORRECTION (an earlier plan would have measured the wrong thing)

The naive plan — "probe a batch of `documentId`s, report clean-text vs scan %" — **is invalid**, and
the reason is structural:

**`documentId` is a GLOBAL sequential counter across all 947 Catalan municipalities**, assigned in
~upload order — NOT partitioned by municipi. Evidence: the two verified IDs (301118, 582763) are far
apart numerically and hit two unrelated municipalities. Consequences:

1. Probing IDs randomly/sequentially measures **RPUC's overall scan rate**, not Barcelona's.
2. It certainly does not isolate **Barcelona's 22a/18 derived-plan corpus** — the slice that caps the
   end-to-end number.

⇒ **The measurement MUST be EXPEDIENT-FIRST:**
```
municipiSel=08019  →  list of expedients (year, tema, instrument type)
                   →  per expedient: "documents d'un expedient"  →  its documentId(s)
                   →  test extraction on THOSE
```
And **stratify by decade**, because the whole point is that age predicts scan-vs-text:
`pre-1970 / 1970–1990 / 1990–2010 / post-2010`, scan-rate **per bucket**, never one binary number.

⭐ **We already hold the stratification variable.** AMB `expedients_refos/1` carries **`DAPRDEF`**
(definitive-approval date) per Barcelona instrument (see `L-590c` §4.1). Join RPUC's per-expedient
documents to `DAPRDEF` rather than re-deriving dates — the date axis is in data we already reach.

---

## 3 — THE BLOCKER on running it headless (honest)

The expedient-first chain needs the **expedient-list endpoint**, and it is **not trivially reachable
from a script**:

- The RPUC UI is an **Angular SPA** at `planejamenturbanisme.territori.gencat.cat/rpucportal/#/consulta/cercaPublic?municipiSel=08019` (the `dtes.gencat.cat` host **301-redirects** here).
- The public search URL `.../rpucportal/AppJava/cercaExpedient.do?municipiSel=08019` returns the **SPA shell**, not data — the query params survive the redirect but the results load via a runtime API call.
- Guessed REST shapes under `/RPUC-portal/rest/consulta/` (`expedients`, `cercaExpedients`,
  `expedientsMunicipi`, `municipis/08019/expedients`) all **404**. Only `documents?documentId=` is
  confirmed. The base `/rest/consulta/` returns 405 (exists, wrong method).
- The Angular bundles did not yield to a plain fetch (redirects; likely need the SPA's own
  request headers/session).

⇒ **The expedient-list API exists** (the SPA calls it) **but its exact path/params were not
recovered headless.** Two cheap unblocks, in order:
1. **The Generalitat API manual** — `territori.gencat.cat/.../manual-ens-locals-acces-RPUC-MUC-v14.pdf` — documents *"Consulta dels expedients d'un municipi"*, *"detall d'un expedient"*, *"documents d'un expedient"* with worked calls. Robots-blocked to an automated agent; **browser/human-fetchable.** This is the single cheapest next step.
2. A browser DevTools capture of the XHR the `municipiSel=08019` search fires — gives the exact endpoint + params directly.

---

## 4 — ⚠ TIER CORRECTION on the Diba pipeline (do not over-claim)

`L-590c` §11.5 cited a Diputació de Barcelona **DocumentAI + Gemini** pipeline that extracts fields
from old scanned RPUC instruments, as an existence proof for the OCR path. **The confidence tier was
too high.** The Diba write-up describes a tool that drafts an *Informe de Compatibilitat Urbanística*
for a *tècnic municipal* — characteristic of tools Diba builds **for the smaller province
municipalities that lack their own planning-tech capacity.** **Barcelona city runs its own PIU, its
own urbanism department, and its own refós.** So Barcelona city is **plausibly outside** Diba's
service population for this exact tool, and the pipeline **may never have been tuned or tested on
Barcelona's 1956–1968 Pla Parcial scans.**

⇒ **Corrected claim:** *"a proven technique on documents of the SAME KIND — DocumentAI OCR + LLM
in-context extraction is a sound architecture regardless of corpus — but UNCONFIRMED on THESE
specific Barcelona documents."* Not *"proven on our documents."* Check Diba's client/municipality
list, or ask them directly, before citing it as validated-for-Barcelona. **A wrong confidence tier
here is exactly the failure mode this whole exercise exists to avoid.**

---

## 5 — WHAT THIS DOES TO THE CEILING

**It reopens the question; it does not answer it.** `L-590c` §11 said the derived-planning 63% is a
document wall. This file shows the wall is **layered, not uniform**:

- **Modern derived plans → clean text + parameters, reachable via the REST endpoint TODAY.** A share
  of the 63% (the recent instruments — note the AMB parameterised sectors were all recent PMUs) is
  **not a wall at all.**
- **Old derived plans → scans**, needing OCR — but the technique is sound (tier-corrected §4).

**The one number that now decides Barcelona's real ceiling** is the **age-stratified clean-vs-scan
split of Barcelona's own 22a/18 expedients** (§2). Until it is measured:
- Do **not** re-quote ~48% as a fixed ceiling — it may be materially higher.
- Do **not** quote a higher number either — the modern-vs-old split of Barcelona's derived corpus is
  unmeasured. **Failure and empty stay distinct: "unmeasured" is not "high" and not "48%."**

---

## 6 — RESUME STEPS (ranked)

1. **Get the API manual** (browser): `territori.gencat.cat/.../manual-ens-locals-acces-RPUC-MUC-v14.pdf` → the `expedients d'un municipi` + `documents d'un expedient` call pattern.
2. **Run the expedient-first chain** for `municipiSel=08019`, filter to `tema`/instrument = Pla Parcial / industrial, pull documentIds, extract text, and **join to AMB `DAPRDEF`** for the decade buckets.
3. **Report scan-rate per decade bucket** — that is the deliverable that converts this from "reopened" to a real ceiling.
4. **Check SITMUN** (Diba GIS, named in the Diba write-up alongside MUC + RPUC) for Barcelona-city coverage — Barcelona sometimes opts out of Diba services it duplicates. One direct check.
5. **Confirm Diba pipeline scope** before citing it for Barcelona (§4).

---

## 7 — REPRODUCE

```bash
# the working document endpoint (VERIFIED-LIVE)
curl -s -A "Mozilla/5.0" \
  "https://dtes.gencat.cat/RPUC-portal/rest/consulta/documents?documentId=301118&downloadType=inline&idioma=ca" \
  -o doc.pdf   # -> 200 application/pdf, text-layer, extractable

# the expedient-list endpoint is NOT yet known — the SPA search that calls it:
# https://planejamenturbanisme.territori.gencat.cat/rpucportal/#/consulta/cercaPublic?municipiSel=08019
```

**Insurance copy** (outside any migrating folder): `scratchpad/RPUC-VERIFICATION-2026-07-23.md`.

**Related:** `L-590c-PLA-PARCIAL-REGIME-RESOLVED.md` §11 · `NEXT.md` §3.1/§4/§6 · `L-590-NNUU-PRIMARY-SOURCE-RECOVERED.md`.
