# RISK-REGISTER — Murcia (INE 30030)

> Fail-safe honesty guardrails. **Last updated:** 2026-08-01. **Maintainer:** UNASSIGNED.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Borrowing another city's legal numbers | LEGISLATION + ENVELOPE stay `not-assessed`; no pack invents a value (§CONTEXT-DATA-HONESTY). |
| R2 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. |
| R3 | Claiming measured heights before a bake | HEIGHTS `not-assessed` until a provenance probe; no measured source baked. |
| R4 | Claiming TERRAIN is verified | rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. |
| R5 | Quoting a coverage **bound** as if it were a value | ⬆ **CLOSED 2026-08-01.** The cross-tab is run and re-runnable (`tools/murcia-coverage-crosstab/`); `RATE.md` §CLOSURE quotes **23.51 %**, a measured point value with its artefact and its method. |
| R6 | A measured number going stale as the pack changes | `packages/site-parcel-data/__tests__/murciaCoverageCrosstab.test.ts` fails if the pack allow-list, the remitted-prefix list or the committed `out-crosstab.json` moves. A 15th transcribed calificación breaks the build until the measurement is re-run. |

## 🔴 R-7 — the disposition's delegation test is NARROWER than the PGOU's, by 13.09 pp

**Status: OPEN. A named pre-signature blocker.** Not live today (two gates are shut), and recorded
here rather than hidden precisely because it becomes live the moment they open.

`murciaEnvelopeDisposition` (`packages/site-parcel-data/src/providers/murciaZoningProvider.ts`)
decides delegation on **one** test: is the sector prefix in `REMITTED_AMBITO_PREFIXES`
(`TA TM UA UH UM`)? The PGOU delegates on **three more grounds**, and the pack's own dossier already
cites all of them:

| ground the disposition does NOT apply | article | packed land it would wrongly publish on |
|---|---|---:|
| *clase de suelo* = **Urbanizable** → Plan Parcial | Art. 6.2.2.3 | **10.64 pp** (7.993 M m²) |
| ámbito `UE` (Unidad de Actuación) | Art. 5.25.1 | part of the **2.45 pp** below |
| ámbito `UD` (Estudio de Detalle) | Art. 5.25.2 | ″ |
| ámbito `P*` (Planes Especiales / Parciales) | Art. 5.26.2 | ″ |
| | | **13.09 pp total (9.834 M m²)** |

⇒ with `MURCIA_ENVELOPE_VERIFIED = true` **and** L5 taught the `envelope` branch, PRYZM would render
on **36.59 %** of buildable land — **above the 33.00 % the PGOU orders directly**. That is a
general-plan number published on land the general plan expressly declines to order: the *«proxy
PGOU»* error this dossier exists to prevent, latent in our own dispatch.

**Guard today:** `MURCIA_ENVELOPE_VERIFIED = false`, *and* the L5 dispatcher does not consume
`kind: 'envelope'` (the `reason`-carrying safety interlock). Both must hold. **Nothing may open
either gate until the disposition applies the full delegation test.** `murciaCoverageCrosstab.test.ts`
pins the gap's size so it cannot shrink or grow unnoticed.

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), L-656, L-616.*
