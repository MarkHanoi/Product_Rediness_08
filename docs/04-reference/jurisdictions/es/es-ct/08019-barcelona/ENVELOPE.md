# ENVELOPE — Barcelona (INE 08019) — THE PILOT

> The per-municipality envelope status, following `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279).
> Barcelona is the **PILOT** — unlike the Phase-2 refusal cities (L'Hospitalet / Badalona / Sant Boi),
> it has an **authored, source-accepted pack and a LIVE constructed envelope** for part of its land.
> This file is a status index; the deep records are the sibling docs in this folder.
> **Last updated:** 2026-08-01 (L-677). **Maintainer:** UNASSIGNED.

---

## ⚖ THE C63 ENVELOPE AXIS — **MEASURED 36.5 %** (2026-08-01, L-677)

> **Evidence:** [`tools/city-completion/measurements/barcelona.measurements.json`](../../../../../../tools/city-completion/measurements/barcelona.measurements.json).
> **Reproduce:** `node tools/city-completion/computeScorecard.mjs --cities barcelona`.

**Denominator (L-656):** private buildable land = **31,794,683 m²** of a 101,781,723 m² city (**31.2 %**),
re-derived live from the AMB Refós per-clau area census for `CODI_INE='08019'`, classified by the
**publisher's own** renderer groups. Ten non-overlapping slices sum to **100.00 %** — nothing is
renormalised away.

| Tier (weight) | Share | What it is |
|---|---:|---|
| `block-constructed` **0.7** | **43.18 %** | `13a`+`13b`+`12` where the block-ring dissolve SUCCEEDS — Art. 242.2 depth constructed (ADR-0271) |
| `no-pack` **0.0** | **1.70 %** | the same families where the dissolve REFUSES and publishes nothing (L-676: 178/185 = 96.22 %; ⚠ an **extrapolation**, labelled as one) |
| `estimated-ruleset` **0.4** | **11.13 %** | `20a/*` ×8 — a **native `setback`** pack, so `ZoningRulesEngine.ts:957` never promotes it |
| `estimated-ruleset` **0.4** | **4.62 %** | clau `18` OV footprints with a parseable `PLANTES` (SIG-3, which **expressly forbids** promoting the tier) |
| `not-determined` **0.0** | **39.37 %** | cited legal refusals: `18`-remainder 12.89 · `22a` 15.60 · tail 4.83 · `12b` 2.44 · `22@` 2.06 · bare `20a` 1.55 |

**Σ(share × tierWeight) = 0.36526.**

> ### ⚠⚠ COVERAGE ≠ AXIS SCORE, and this dossier had been quoting one as the other
> **Coverage is 60.6 %** — the share of buildable land that gets *any* envelope. **The axis is 36.5 %.**
> `MASTER-ROI-TRACKER` §0.6's `56.0 % × 0.7 = 39.2 axis pts` applied `block-constructed` to *all* of the
> packed land, including the `20a/*` **setback** family and the clau-18 route that SIG-3 caps at
> `estimated-ruleset` — **a 3.3-point over-statement of the axis.**
>
> ### ⚠ THE CEILING IS ≈37–38 %, NOT ~68 % — see [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md)
> `~68 %` was a **coverage** figure still carrying a **superseded** clau-18 estimate and still counting
> `12b`'s 2.44 pp after L-676 closed it as a **permanent** refusal. Corrected coverage ceiling ≈ **62.2 %**.
> No tier above `block-constructed` is reachable for a constructed Art. 242.2 depth. **⇒ Barcelona's
> ENVELOPE axis is essentially at its ceiling and the remaining gap is LAW, not effort.**

---

## Status: LIVE for the alineació fabric · honest cited refusal for the rest

Barcelona is NOT gated behind a single `*_ENVELOPE_VERIFIED = false` flag the way the Phase-2 cities
are. Its **13a** pack is authored and its **source was accepted by the founder on 2026-07-20 (the
L-449 gate)** — see [`RISK-REGISTER.md`](./RISK-REGISTER.md) R1. So Barcelona *constructs* a real,
cited envelope on part of its land and returns an honest cited refusal everywhere else.

| Slot / regime | State | Basis |
|---|---|---|
| **S1 — parcel provider** | ✅ live | Catastro INSPIRE WFS (national); block-ring dissolve **2/2** in Barcelona (L-535). |
| **S3 — zone source** | ✅ live | AMB MUC WMS (`CODI_QUAL_AJUNT`), per-parcel clau (`server/mucZoningProxy.js`). |
| **13a** *ordenació segons alineacions de vial* | ✅ **SHIPPED** (constructed) | `block-derived-alignment`, ADR-0271 — depth from the block ring per PGM **Art. 242.2**; height from street width per **Art. 327.2** (`bcnAlcadaReguladora.ts`, L-525a). |
| **13b** *densificació semiintensiva* | ✅ **SHIPPED** (constructed) | ⚠ **THIS ROW WAS STALE — 13b, 12 and the ten `20a/*` all shipped on 2026-07-22.** `block-derived-alignment`, Art. 242 depth via Art. 326, its **own** Art. 328 height table (`bcnAlcadaByZone.ts`). 12.52 % of buildable land. |
| **12** *nucli antic (annexed nuclis)* | ✅ **SHIPPED** (constructed) | `block-derived-alignment`, Art. 316. 9.38 %. ⚠ Governs the **annexed** nuclis (Gràcia, Sarrià, Sants…); **Ciutat Vella is `12b` and REFUSES**. |
| **`20a/5 /8 /9 /9b /9u /10 /11 /12`** | ✅ **SHIPPED** (constructed) | The one **native `kind: 'setback'`** family (*edificació aïllada*, Arts. 339–343 + the Barcelona-exclusive DOGC 4277/2004 Arts. 342/343). **11.13 %.** ⚠ It can never reach `block-constructed` — it emits no `alignment.depthBinding` row — so it scores **0.4** on the axis. Bare `20a` is **not** registered (L-673). |
| **`18`** *volumetria específica* | 🟡 **PARTIAL — 26.4 % constructed** | `explicit-area` from the AMB Refós `OV_Trames` layer, gated ON by **SIG-3** (`BCN_REFOS_OV_CERTIFIED === true`). The other **73.6 %** keeps the cited **Art. 306** refusal. |
| **`22a` / `22@` / `12b` / bare `20a`** | ⛔ **cited refusal — PERMANENT for three of the four** | `22a` → Art. 350.1 (~2,595 Pla Parcials); `22@` → Art. 8.1 MPGM (DEC-1, intentional omission in the law); `12b` → Arts. 320.3a/320.2a, the *tram de vial* is undefined and delegated to a *pla especial* (L-676). Only **bare `20a`** can reopen, and only on a subzone **DATA layer** (L-673). |
| **Systems (`SX*` `6*` `7*` …) + derived-planning (`18`, PD*)** | ✅ **cited refusal SHIPPED** | L-550 / L-553 — a cited "no envelope applies" or "governed by its own plan", never a fabricated setback triple. |

The measured ceiling and the field-by-field breakdown are in [`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md); the phased climb
in [`RATE-IMPLEMENTATION-PLAN.md`](./RATE-IMPLEMENTATION-PLAN.md); where PRYZM stopped and why in
[`NEXT.md`](./NEXT.md).

---

## The human legal work that remains

Barcelona has passed the *source-acceptance* gate for 13a, but the envelope is not "done":

1. **Per-clau L-528 certification** (the *fitxa urbanística* in the MUC/RPUC viewer) moves each pack
   from amber (`estimated-ruleset`) to green — interactive GIS work, one task per clau. The gate is
   per-source and **a wrong source passes it as easily as a right one** (the 13a source-vintage trap,
   L-526, recurred and required a founder re-sign). See [`RISK-REGISTER.md`](./RISK-REGISTER.md).
2. **The derived-planning wall (~40% of private buildable land).** Clau 18 + the 22a Pla Parcials
   point at per-site plànols; height is a plànol block-label (measured **0% extractable** over 24
   documents, `findings/L-590h`). This is the structural ceiling — see [`NEXT.md`](./NEXT.md) §3.1.
3. **The missing envelope fidelity CI gate** remains the top debt (per `ENVELOPE-REPLICATION-STANDARD`)
   — the check that would fail the build if a pack emitted a number above its accepted provenance.

⚠ Barcelona's *alçada reguladora* and *ample oficial* tables are **`es-08019` data** — they must NOT be
reused for L'Hospitalet / Badalona / Sant Boi (each is its own municipality with its own
*modificacions*). See those cities' `ENVELOPE.md`.

---

*Cross-refs: `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279, the 5-slot onboarding), C58 §1.2/§1.5,
C60 §3, ADR-0270/0271 (rule kinds), ADR-0276 (regime-undetermined refusal), L-449 (source-acceptance
gate), L-525/L-526 (13a height + source-vintage), `findings/L-590h` (the sufficiency ceiling),
§CONTEXT-DATA-HONESTY. Siblings: `LEGISLATION-RATE.md`, `RATE-IMPLEMENTATION-PLAN.md`, `NEXT.md`,
`RISK-REGISTER.md`, `L-583-LEGAL-PARAMETERS-SOURCED.md`.*
