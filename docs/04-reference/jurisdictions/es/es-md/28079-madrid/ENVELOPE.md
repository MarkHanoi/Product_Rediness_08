# ENVELOPE — Madrid (INE 28079)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

## Status: REGISTERED refusal jurisdiction · engine + provider SHIPPED · live envelope still a cited refusal · `not-assessed` (`pending-implementation`) — ~0 % shippable today

Madrid's data is **richer than Barcelona's** (`LEGISLATION-RATE.md`, ~68 % vs ~48 %), and the engine work
is **materially further along** than Barcelona's document wall — but its live shippable envelope is still
**≈ 0 %**. The gate has moved: it is no longer the engine, it is a **missing same-origin proxy +
unverified calificación mapping**.

| Slot / regime | State | Basis |
|---|---|---|
| **S1 — parcel provider** | ✅ live | Catastro INSPIRE WFS (national); block-ring dissolve **2/4** in Madrid (tolerant-mode gap). |
| **S2 — router predicate** | ✅ wired | `isInMadrid` / `MADRID_BBOX` (`providers/madridBbox.ts`); Madrid registered in `rulepacks/registry.ts` (L-608). |
| **S3 — zone source** | ⚠️ live but mapping unverified | PGOUM-97 planes on `sigma.madrid.es/.../pgoum97` (12 services). `PG_ORDENACION` calificación mapping **UNVERIFIED** (HTTP 500 on the 2026-07-23 re-probe). |
| **S4/S5 — rule pack + registration** | ✅ **SHIPPED, refusal-only** | `esMadridNZ1.ts` declares the `explicit-area` kind + `ringRef`; registered as `noRulePackRefusal → madridNZ1Refusal` for every Madrid zone code. The `explicit-area` **solver + NZ 1 provider/adapter are built + tested** (`esMadridNZ1Provider.ts`, C58 §2.2 **KG-4 open**, `findings/L-608-*-SHIPPED.md`). |
| **NZ 1** (Protección del Patrimonio Histórico) | ⚠️ **live DATA, proxy-gated** | `COEF_Z` + `Fondo de la Edificación` polyline are **published ArcGIS geometry+attributes** (verified live 2026-07-23) — the first real `explicit-area` case. The solver exists, but `resolveMadridNZ1Ring` has **no same-origin Madrid proxy wired**, so the ring can't be fetched at runtime → the dispatcher renders the cited `madridNZ1Refusal` (a TRANSIENT "held rule, footprint not fetched" refusal, not a legal no-envelope). |
| **NZ 4 / 8 / 5 / 7** | ⚠️ **document-gated** | *fondo edificable* / retranqueos / *altura de cornisa* are grado-structured in the **NNUU Compendio 2023** (a prose PDF), not sourced this pass. The Zod schema (`AlignmentRuleSchema.buildableDepth_m .positive()`, full `SetbackRuleSchema` triple) forbids authoring an NZ 4/8 pack without the numbers. |
| **NZ 3 + ~35 % derived-ámbito (APR/APE/API/Plan Parcial)** | ✅ refusal | `derived-plan` — the general plan points at a per-site document → a cited refusal, not an envelope (the Madrid analogue of Barcelona's derived-planning wall). |

## Why the answer is ~0 % shippable despite ~68 % data-readiness

The ~68 % is a **DATA-readiness** figure (`LEGISLATION-RATE.md` §caveat 1) — it credits structured
layers PRYZM has not yet fully consumed. The KG-4 engine gate is now **open** (solver + provider
shipped); what still holds live resolution at ~0 %:

1. **Proxy gate (NZ 1).** `resolveMadridNZ1Ring` fetches the published footprint LIVE from
   `sigma.madrid.es`, but **no same-origin Madrid proxy is wired**, so the fetch can't complete at
   runtime → the dispatcher refuses (honestly, transiently) rather than solve.
2. **Verification gate (NZ 1 calificación).** The `PG_ORDENACION` code→pack mapping is UNVERIFIED (that
   plane returned HTTP 500 on 2026-07-23); the pack answers the NZ 1 refusal for every code until the
   mapping is confirmed.
3. **Document gate (NZ 4/8, the dominant residential typology).** The numbers live in the NNUU Compendio
   2023 (Cap. 8.x) prose PDF; they were not citeably transcribable this pass (compendio returned as
   compressed streams; web-search mixed a specific APR plan's values with the general norm — the exact
   secondary-source trap). Requires a human, per-grado read (L-449).

⚠ **Do NOT stamp NZ 4/8 numbers from a secondary source** — an absent envelope costs nothing; a confident
wrong one costs credibility (§CONTEXT-DATA-HONESTY).

## The human / wiring work to flip the gate

1. **Wire a same-origin Madrid proxy** for `resolveMadridNZ1Ring` (the sigma.madrid.es footprint fetch) → the shipped solver would then return a real NZ 1 envelope.
2. **Verify the `PG_ORDENACION` calificación mapping** (`returnCountOnly` before believing any zero; re-probe the HTTP-500 plane) → replace `noRulePackRefusal` with the VERIFIED NZ 1 code(s).
3. **Human-source NZ 4 *fondo edificable* + NZ 8 retranqueos** from Compendio 2023 Cap. 8.x, per grado (L-449) — the highest-leverage residential move.
4. **Verify `COEF_Z` coding + parse** (an un-asserted `parseFloat` on a coded string is a silent-zero risk); ship the NZ 3 `derived-plan` refusal copy in `sources/SOURCES.md`.

*Cross-refs: C58 §1.2/§1.11/§2.2, ADR-0279, C63 §3 Axis 4, `findings/L-608-MADRID-PACK-SPEC.md`,
`findings/L-608-NZ1-PROVIDER-SHIPPED.md`, `findings/L-608-EXPLICIT-AREA-SOLVER-SHIPPED.md`. Sibling:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md).*
