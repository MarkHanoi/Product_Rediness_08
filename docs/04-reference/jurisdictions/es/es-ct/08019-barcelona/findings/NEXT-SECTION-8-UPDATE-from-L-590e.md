# NEXT.md update — apply to canonical `NEXT.md` (from L-590e, 2026-07-23)

> **Why this is a separate file.** This session ran in a git worktree that predates the canonical
> `NEXT.md` (the worktree has no `NEXT.md`), and the shared checkout is not writable from here. The
> edits below are ready to drop into the canonical
> `…/08019-barcelona/NEXT.md`. Orchestrator owns docs — please fold these in.

---

## Change 1 — §1 "WHERE WE STOPPED", last sentence and the `~48–50%` clause

The ceiling is no longer "unmeasured until the derived-plan documents are read" (that was `L-590d`'s
reopening). **It is now measured.** Replace the reopening caveat with:

> The derived-plan **document split is now measured (`L-590e`)**: the Pla Parcials that govern clau 18
> + 22a are **99% pre-1990 and 100% image scans (33/33 sampled)**, while modern derived instruments
> (PEU/PMU) are clean text. So **~48% is the confirmed clean-text/data ceiling** and **~80% is
> confirmed OCR-only** — there is no clean-text or structured shortcut for the slice that caps the
> number. The next real gain is an OCR/document-understanding programme, justified on its own.

## Change 2 — §3.1 resume step is DONE; rewrite the "EXACT RESUME STEP" and unblock list

The XHR-capture resume step is executed. Replace §3.1's resume block with:

> **DONE (`L-590e`).** The RPUC expedient-list API is cracked and live:
> `dtes.gencat.cat/RPUC-portal/rest/consulta/basica?municipi=08019&idioma=ca&firstRecord=0&rpp=2000&sortDirection=1`
> → 1755 expedients; `…/detall?codiExpedient=<codi>&idioma=ca&cercaPublic=false` → `dataAprovacio` +
> `documents[].idDocument`; then the `L-590d` `documents` endpoint. **Measured result:** the 238 Pla
> Parcials are 99% pre-1990 and **100% scans (33/33 sampled)** — path (1) "structured export" is
> **closed for the ceiling slice**; only paths (2)/(3) OCR remain. The Ajuntament PIU-fitxa backend is
> now moot for parameters — RPUC is the register and its old instruments are scans.

## Change 3 — §6 VERIFIED SOURCES, add three rows

| Source | Answers | Tier | Note |
|---|---|---|---|
| **RPUC `…/rest/consulta/basica`** `dtes.gencat.cat/RPUC-portal` | the municipality's **expedient list** (`totals`, `codi`, `instrumentca`, `nomComplet`→year, `vigencia`) | **VERIFIED-LIVE (`L-590e`)** | GET; needs `municipi=08019&idioma=ca&firstRecord=0&rpp=N&sortDirection=1`. ⚠ `municipi` alone → 500 NPE (missing pagination), NOT blocked |
| **RPUC `…/rest/consulta/detall`** | one expedient's **`dataAprovacio`**, `vigencia`, `assentaments`, **`documents[].idDocument`** | **VERIFIED-LIVE (`L-590e`)** | GET `codiExpedient=<codi>&idioma=ca&cercaPublic=false`. This is the join from list → documentIds |
| **RPUC `…/rest/consulta/documents`** | the instrument PDF | **VERIFIED-LIVE (`L-590d`)** | `documentId=<N>&downloadType=inline&idioma=ca` |

Endpoints came from the SPA bundle `main-es2015.<hash>.js` `api.consulta` config; re-extract if the
hash changes (`L-590e` §7).

## Change 4 — §7 DEAD ENDS, add one measured negative

> - **Clean-text / structured pull of derived-plan parameters for clau 18 + 22a** — **measured dead
>   (`L-590e`).** The governing Pla Parcials are 99% pre-1990 and 100% scans (0/33 sampled had a text
>   layer). No queryable layer, no clean-text document. Only OCR opens this slice. Do not re-hope a
>   data pull.

## Change 5 — §8 THE SMALLEST NEXT STEP — replace wholesale

> ## 8 — THE SMALLEST NEXT STEP that moves the number
>
> **The clean-text hope is closed (`L-590e`): the only lever left on the ceiling is OCR.** The
> enumerator is cracked and the exact scanned `DUN.pdf` documentIds are in hand (`L-590e` §4.3).
>
> **The one measurement that now decides ~48% vs ~80%:** run a DocumentAI/Gemini-class OCR +
> in-context extraction over the named 1956–1978 Pla Parcial `DUN.pdf` scans and measure field-recall
> of `alçada` / `edificabilitat` / occupation on Barcelona's *own* documents. This is the tier
> `L-590d` §4 refused to upgrade without evidence; everything on Barcelona's coverage number hinges on
> it. If recall is high → clau 18 + 22a (40% of private land) open and the ceiling moves toward ~80%.
> If low → ~48% is the durable ceiling and we stop spending on Barcelona coverage.
>
> **Cheap and shippable now, in parallel (does not move resolution, improves product):** the "point at
> the governing plan" signpost tier, powered directly by the §6 enumerator — per parcel's plan: name,
> approval date, in-force flag, document link. A cited, navigable answer instead of a blank refusal,
> for essentially all derived-planning land (`L-590c` §11.4). Generalises free to every Spanish city.
>
> **Also now runnable:** the annulment/supersession check (§3.6) against the same `detall` call
> (`vigencia`, `assentaments`) plus AMB `EXP_DEROG`/`RECURS_O_SENTENCIA`.

---

**Source:** `findings/L-590e-RPUC-BARCELONA-CORPUS-MEASUREMENT.md`.
