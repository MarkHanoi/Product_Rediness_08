# Barcelona — per-clau capture (PART A)

One folder per PGM clau. Each holds a `CLAU.md` with the PART-A schema, an amendment log, and an
explicit place for the question that decides everything: **is the parameter STATED or CONSTRUCTED?**

**Authority:** PGM-1976 (Pla General Metropolità, aprovat 14-07-1976), Normes Urbanístiques, Títol IV,
as consolidated in **RPUC** (Registre de Planejament Urbanístic de Catalunya) / **AMB NUMAMB**.
Governing contracts: **C63** (city completion) · **C58** (envelope engine) · **ADR-0270** (rule KIND) ·
**ADR-0271** (*edificabilitat* is a construction, not a lookup).

---

## ⚠ Read this before sending data — it will save wasted effort

**Not every clau has parameters to transcribe.** Three groups behave completely differently, and the
difference is already measured in `packages/site-parcel-data/src/rulepacks/esBarcelonaZoneClassification.ts`:

| Group | Claus | Share | Why it matters |
|---|---|---|---|
| **Parameterised** — the PGM states figures | `12` `13a` `13b` `20a` `22a` … | 13a/13b/12 alineació fabric ≈ **44 %** of buildable land | ✅ **Transcription works.** This is where your data lands directly. |
| **Points-at-another-document** — the PGM names a *different instrument per site* | **`18`** | **22.5 % of private buildable land** | ❌ **Transcription does NOT work.** Art. 306 says buildability is *"that resulting from the established volumetric ordering"* — there is no generic parameterisation to write down. This is a **data-acquisition** problem (ingest per-site approved volumetries from RPUC/NUMAMB as the `explicit-area` rule kind), not a rule-authoring one. |
| **Delegates to a derived instrument** | `14a` `14b` `15` `16` `17` | ≈ **2.2 %** of private buildable land | ❌ Same as above — PERI / pla especial / estudi de detall per ámbito. |
| **Systems + non-urbanitzable** — no private envelope exists | `1*` `2`–`9`, `27` `28` `29` | `27/28/29`+`9` ≈ **17.9 % of all municipal ground** | ⛔ **Nothing to capture.** A setback triple here would be a fabricated legal claim over Collserola. |

**Consequence:** the single biggest unpacked block (clau 18, 22.5 %) **cannot be unlocked by sending
me ordinance parameters**, because the ordinance does not contain them. It needs the per-site
volumetries ingested as geometry. Sending "clau 18 FAR/height" would mean inventing a figure the law
does not state.

**So the highest-value data to send first is the parameterised group** — the claus where the PGM
genuinely states figures and PRYZM currently refuses only because nobody has transcribed them.

---

## The capture gate (applies to every `CLAU.md`)

1. **Every value is cited or absent.** Article + paragraph + effective date, or the field stays `null`.
2. **`null` = UNKNOWN.** It is never `0`, and never "no limit". Record *the ordinance sets no limit*
   explicitly as `no-limit` — that is a **finding**, not a gap. Collapsing the two either invents a
   constraint or hides one.
3. **Verbatim before normalised.** Paste the governing sentence; the number is a derivation of the
   quote, not a substitute for it.
4. **Scalar vs CONSTRUCTED** — §3 of each file. If the ordinance describes a *procedure* rather than
   giving a figure (as 13a's *edificabilitat* does, PGM Art. 242.2), it is an **engineering** task and
   no signature converts it into a transcription.
5. **Rule KIND** (`setback` | `alignment` | `block-derived-alignment` | `tiered-occupation` |
   `coverage-and-far`) — the wrong KIND is a wrong **shape**, not a wrong number.
6. **Granularity** (parcel / block / sector / municipality) — a sector FAR shown as a parcel FAR is a
   category error, not an imprecision.
7. **Amendments supersede, they do not overwrite.** Log MPGM / PMU / PERI / PEU / PMP in §2 with dates
   so the supersession stays auditable.

---

## Status

**All 42 folders are EMPTY SCAFFOLDS.** Nothing here is sourced yet.

⚠ **The folder list and the designations in each header are a scaffold**, assembled from the clau codes
present in the codebase plus the founder's list. They are **not** yet reconciled against the official
`CODI_QUAL_AJUNT` vocabulary served by the AMB MUC WMS (proxied at `server/mucZoningProxy.js`).
Reconciling that list — and deleting or adding folders accordingly — is the first task, because a clau
we invent is as wrong as a number we invent. Codes `19`, `24`, `26` in particular are unconfirmed.

Already shipped and packed in code (do not re-capture, cross-check instead): **13a** (`block-derived-alignment`,
ADR-0271, depth per Art. 242.2 + height per Art. 327.2, founder-accepted L-449), **13b**, **20a**,
**Nucli Antic**, **Industrial**.

---
*Created 2026-07-31. Feeds the ENVELOPE and LEGISLATION axes of [`../RATE.md`](../RATE.md).*
