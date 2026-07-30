# RISK-REGISTER — Madrid (INE 28079)

> Fail-safe honesty guardrails. **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.
>
> **Standing principle:** *an absent envelope costs nothing; a confident wrong one costs credibility.*
> Every risk is scored against whether the mitigation FAILS SAFE (refuse / badge honestly) or fails
> loud-and-wrong.

| # | Risk | Guard (the honest default) |
|---|---|---|
| R1 | Reading the ~68 % data-readiness rate as PRYZM's coverage | The ~68 % measures DATA readiness, NOT wiring; **shippable envelope resolution today ≈ 0 %** (`LEGISLATION-RATE.md` caveat 1). Overall `RATE.md` renormalises only the assessed cheap axes + flags `partial`. |
| R2 | Solving NZ 1 without a fetched footprint | `resolveMadridNZ1Ring` has **no same-origin proxy wired**; the dispatcher solves ONLY when a ring is available and otherwise returns the TRANSIENT `madridNZ1Refusal` ("held rule, footprint not fetched") — never a fabricated envelope. |
| R3 | The transient refusal misread as a legal "no envelope" | `madridNZ1Refusal` is a verification/plumbing state, not law — the PGOUM-97 DOES grant an envelope; a genuine no-footprint point uses `madridNZ1AbsentRefusal` (`no-plan-at-point`) instead. Distinct codes keep the two honest. |
| R4 | Trusting the `PG_ORDENACION` calificación mapping | The plane returned HTTP 500 on 2026-07-23 → the code→pack mapping is **UNVERIFIED**; the pack answers the NZ 1 refusal for every code until `returnCountOnly` re-confirms it (never believe a zero unverified). |
| R5 | Stamping NZ 4/8 numbers from a secondary source | *fondo edificable* / retranqueos live in the NNUU Compendio 2023 PDF; web-search mixed a specific APR plan's values with the general norm (the secondary-source trap). Zod (`buildableDepth_m .positive()`, full setback triple) blocks a pack without primary, L-449-signed numbers. |
| R6 | Silent-zero on the `COEF_Z` parse | An un-asserted `parseFloat` on a coded string can yield 0; parse stays under assertion, refusing on a bad parse rather than emitting a zero edificabilidad. |
| R7 | Reading `not-assessed` as 0 % | `not-assessed ≠ 0 %` (C63 §1.2); PARCEL/LEGISLATION/ENVELOPE/HEIGHTS stay typed-unknown, not 0. |
| R8 | Claiming measured heights / verified terrain before a probe | HEIGHTS `not-assessed` until the H1 probe; TERRAIN rung capped at **50** (baked-but-unverified, no `terrain.verify.mjs` round-trip). Rasant-datum caveat as Barcelona (L-584). |

*Authority: C63 §3.1 (honesty companion), C62 (typed unknowns), C58 §1.2/§1.4/§2.2. Findings:
`findings/L-608-MADRID-PACK-SPEC.md`, `findings/L-608-NZ1-PROVIDER-SHIPPED.md`,
`findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md`. Code: `rulepacks/esMadridNZ1.ts`,
`rulepacks/esMadridNZ1Provider.ts`, `providers/madridBbox.ts`.*
