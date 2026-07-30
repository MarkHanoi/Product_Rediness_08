# ENVELOPE — Barcelona (INE 08019) — THE PILOT

> The per-municipality envelope status, following `ENVELOPE-REPLICATION-STANDARD.md` (ADR-0279).
> Barcelona is the **PILOT** — unlike the Phase-2 refusal cities (L'Hospitalet / Badalona / Sant Boi),
> it has an **authored, source-accepted pack and a LIVE constructed envelope** for part of its land.
> This file is a status index; the deep records are the sibling docs in this folder.
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

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
| **13b / 12 / 20a / 22a** | ⚠️ partial / refusal | 13b config-only (not shipped); 22a = regime-neutral half + cited `regime-undetermined` refusal (ADR-0276); 12/12b/20a per `RATE.md`. |
| **Systems (`SX*` `6*` `7*` …) + derived-planning (`18`, PD*)** | ✅ **cited refusal SHIPPED** | L-550 / L-553 — a cited "no envelope applies" or "governed by its own plan", never a fabricated setback triple. |

The measured ceiling and the field-by-field breakdown are in [`RATE.md`](./RATE.md); the phased climb
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
§CONTEXT-DATA-HONESTY. Siblings: `RATE.md`, `RATE-IMPLEMENTATION-PLAN.md`, `NEXT.md`,
`RISK-REGISTER.md`, `L-583-LEGAL-PARAMETERS-SOURCED.md`.*
