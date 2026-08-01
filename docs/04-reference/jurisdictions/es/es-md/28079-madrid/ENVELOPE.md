# ENVELOPE — Madrid (INE 28079)

> Per-municipality envelope status (ADR-0279 / `ENVELOPE-REPLICATION-STANDARD.md`; feeds C63 Axis 4).
> **Last updated:** 2026-07-31. **Maintainer:** UNASSIGNED.

> ## ⛔ **CORRECTED 2026-08-01 — the "MEASURED 0 %" below is STALE and was measuring a state that no longer exists**
>
> | This file says | Truth |
> |---|---|
> | `packsByZone` is **EMPTY** (§S4, "the entire Axis-4 zero") | **23 codes registered** since `40c80164`; what withholds numbers is the **gate** `MADRID_ENVELOPE_VERIFIED = false`, not the absence of a pack |
> | `esMadridNZ1.ts` is **UNREGISTERED**, so nothing renders | `MADRID_NZ1_CERTIFIED = true` — NZ 1 **renders a constructed envelope** (published footprint ∩ parcel) on **11.695 %** of Norma-Zonal-governed land |
> | Axis 4 = **0 %** | **≤4.7 %** (`0.11695 × 0.4`), an **UPPER BOUND** on the NZ-governed-land denominator |
>
> **Arithmetic maximum ≈36.8 %**, of which ~96 % of the gap is **LAW**: Norma Zonal 3 holds
> **60.458 %** of the city's zoned land and the PGOUM declines to state an envelope on it.
> **Land shares MEASURED 2026-08-01 (L-676).** ⇒ read [`CLOSURE-REGISTER.md`](./CLOSURE-REGISTER.md).

## Status: ~~REGISTERED refusal jurisdiction · **Axis 4 = a MEASURED 0 %**~~ · honesty **100 %**

Madrid's data is **richer than Barcelona's** and the engine work is **materially further along** —
the `explicit-area` solver and the NZ-1 provider/adapter are built and tested. ⛔ ~~Its live shippable
envelope is nonetheless **0 %**~~ — see the correction banner above.

### Why 0 % is computed, not `not-assessed`

C63 §3 Axis 4 scores `Σ (buildable_land_share × pack_tier_weight)`. Both inputs were inspected:

- **`rulepacks/registry.ts` registers Madrid with an EMPTY `packsByZone`**, and
  `noRulePackRefusal → madridNZ1Refusal` for every zone code. Every clau's tier is therefore
  `cited-refusal`, whose **completion weight is 0.0**.
- The per-NZ land-share split is **UNSOURCED** — but it does not need to be sourced for this
  computation: **`Σ(share × 0) = 0` for any share distribution whatsoever.**

So `not-assessed` would have been the *wrong* sentinel here: the state was inspectable and it is
empty. Per C63 §3.1 the same 0 % scores **100 % on honesty** — Madrid fabricates nothing; every
parcel receives a cited refusal.

⚠ Do not read this as a regression. Nothing was undone; the axis simply moved from "not measured" to
"measured, and the answer is zero".

## Slot status (ADR-0279 five-slot model)

| Slot / regime | State | Basis |
|---|---|---|
| **S1 — parcel provider** | ✅ live | Catastro INSPIRE WFS (national). Block-ring dissolve **2/4** in Madrid (tolerant-mode gap; weaker than Barcelona's 2/2). ⚠ Whether a Catastro *connector* is architecturally required at all is **unresolved** (`sources/SOURCES.md` §G2). |
| **S2 — router predicate** | ✅ wired | `isInMadrid` / `MADRID_BBOX` (`providers/madridBbox.ts`); Madrid registered in `rulepacks/registry.ts` (L-608). |
| **S3 — zone source** | ✅ **live and VERIFIED** | `DESARROLLO_URBANO_ACTUALIZADO/NORMAS_ZONALES/MapServer/0`, field `AMB_TX_ETIQ` — **34 distinct claus**, spatial point-intersect, all zones. Independently reached by the founder's 2026-07-31 recon. ⚠ Supersedes older "calificación mapping unverified / `PG_ORDENACION` down" notes: that outage was **transient** (HTTP 200, 17 layers, 2026-07-24) and is **off the critical path**. |
| **S4 — rule pack** | 🔴 **EMPTY** | `packsByZone` holds nothing. `esMadridNZ1.ts` declares the `explicit-area` kind + `ringRef` but is **UNREGISTERED**. This is the entire Axis-4 zero. |
| **S5 — registration** | ✅ refusal-only | Registered as `noRulePackRefusal → madridNZ1Refusal` for every Madrid zone code. |

## Coverage by zone — the refusal ledger

| Zone (claus) | Kind | Disposition | Refusal reason class | Note |
|---|---|---|---|---|
| **NZ 1** (`1.1`–`1.6`, 6) | `explicit-area` | **cited-refusal** *(transient)* | `construction-incomplete` | Footprint + `COEF_Z` are **published live geometry** — the first real `explicit-area` case. Solver + provider **SHIPPED and tested**. Held by wiring, not law: no same-origin proxy, plus the `explicitAreaFootprint` interface defect. A **plumbing** refusal, not a legal no-envelope. |
| **NZ 3** (`3.1`–`3.2`, 5) | `derived-plan` | **cited-refusal** *(legal)* | `legal` | Buildable volume fixed **per parcel** by its ficha. A cited refusal is the *correct terminal answer*, legally stronger than an estimate. ⚠ The refusal working ≠ the zone's rules being known — those are separate claims (`sources/SOURCES.md` §D). |
| **NZ 4** (`4`, 1) | `alignment` | **no-pack** | `regime-undetermined` | Madrid's dominant residential typology and the **highest-ROI extraction**. `Alineaciones` published as a layer, so the official line is structured; *fondo edificable* is document-gated. |
| **NZ 5** (`5.1`–`5.3`, 3) | ⚠ **UNDETERMINED** | **no-pack** | `regime-undetermined` | Rule KIND itself is unresolved — see the shape warning below. |
| **NZ 7** (`7.1.a`–`7.2.e`, 3) | `setback` (likely) | **no-pack** | `regime-undetermined` | May use *parcela mínima* + *separación a linderos* rather than occupation. |
| **NZ 8** (`8.1.a`–`8.6`, 10) | `setback` | **no-pack** | `regime-undetermined` | 10 grado codes ⇒ **10 rule rows**, never one. |
| **NZ 9** (`9.1`–`9.5`, 6) | ⚠ unknown | **no-pack** | `regime-undetermined` | Name, chapter and kind all unknown; **absent from the founder corpus entirely**. Likely non-residential. |
| Derived ámbitos (APR/APE/API/Plan Parcial) | `derived-plan` | **cited-refusal** *(legal)* | `legal` | Detection VERIFIED-LIVE. Share asserted at ~35 % of residential land — **UNSOURCED**, not asserted as coverage. |
| Zones 2 / 6 / 10 / 11 | — | ⚠ **no route** | *unknown* | Absent from `AMB_TX_ETIQ`. NZ 2 and NZ 6 have ordinance chapters, so "they don't exist" is eliminated. If parcels exist here they currently fall to a blanket refusal **citing the wrong reason** (`RISK-REGISTER.md` R13). |

**Honesty:** every row above is either a *cited refusal* or an explicit *no-pack* — no row fabricates
a value. `honestyOk: true`.

## ⚠ Two shape warnings that outrank any number

**1 — NZ 4: depth is measured from the STREET LINE, not by shrinking the parcel.**

```
official alignment line
        |<---- fondo edificable ---->|
        ███████████████████████
        ███████████████████████
```

*Fondo edificable* is measured **inward from the official alignment**, not as an inset of the parcel
ring. An implementation that insets the ring by the depth is a plausible-looking model that is
**wrong** — precisely the error class that produced two confidently-wrong theories and burned
significant time in the Barcelona inset-collapse saga (L-529/L-581). Probe the geometry, not the
number.

**2 — NZ 5: the rule KIND is undetermined, and a wrong kind is a wrong SHAPE.**

Open-block zones frequently regulate ***distancia entre edificios*** (building separation) rather
than ***retranqueo a linderos*** (parcel-edge setback). Test the ordinance's wording **before** any
code:

| Wording | Consequence |
|---|---|
| *"retranqueo / separación a linderos"* | `SetbackRule` fits — proceed |
| *"distancia entre edificios"* | `SetbackRule` does **NOT** fit → new `OpenBlockRule` → **raise an ADR** |

Forcing separation regulation into the setback triple is a wrong SHAPE, not a wrong number
(ADR-0270) — the worse of the two failures. NZ 5 is therefore recorded as **UNDETERMINED**, not
`setback`.

## What would raise the ENVELOPE axis (in leverage order)

| Action | Unlocks | Effort | Needs the ordinance? |
|---|---|---|---|
| **Source NZ 4 *fondo edificable* + *altura* per grado** (Compendio 2025 Cap. 8.4) + L-449 sign-off | the dominant residential typology — the largest single share of the ceiling | High (one human read) | **Yes** |
| **Fix `ComputeBuildableEnvelopeInput.explicitAreaFootprint`** — 🔴 a build-breaking tsc defect, one line, masked by green tests | unblocks NZ 1 at the base | Trivial | No |
| **Wire a same-origin Madrid proxy** for `resolveMadridNZ1Ring` | NZ 1's shipped solver returns a real envelope for the historic core | Low–Medium | No |
| **Register NZ-1 codes `['1.1'…'1.6']`** on `AMB_TX_ETIQ` (not the placeholder `['NZ1']`) | correct routing for NZ 1 | Trivial | No |
| **Source NZ 8 retranqueos** per grado (10 codes) | detached residential | High | **Yes** |
| **Build the override-precedence branches** (protected / ficha / ámbito) | ⚠ **a precondition, not a follow-up** — see below | Medium | Partly |
| **Determine NZ 5's rule kind** from the wording | unblocks NZ 5/7 and may require an ADR | Low (read) | **Yes** |

🔴 **Ordering constraint that is not negotiable:** the override-precedence branches must exist
**before** the first pack registers. A parcel can carry NZ 1 + a protected building + a *ficha* + an
ámbito simultaneously; today an override-bearing parcel would silently receive the general zone
answer. That false-positive path is currently **masked by the blanket refusal** and goes live the
moment `packsByZone` gains its first entry (`RISK-REGISTER.md` R17).

⚠ **Do NOT stamp NZ 4/8 numbers from a secondary source.** An absent envelope costs nothing; a
confident wrong one costs credibility. Web search mixes APR-plan values — which carry site overrides
that *contradict* the general norm — with the general rule. The Zod schema
(`AlignmentRuleSchema.buildableDepth_m .positive()`, the full `SetbackRuleSchema` triple)
structurally forbids a placeholder pack; that is a feature, not an obstacle.

---
*Authority: C58 §1.2/§1.4/§1.11/§2.2 · ADR-0270 (rule-kind union) · ADR-0279
(`ENVELOPE-REPLICATION-STANDARD.md`) · C63 §3 Axis 4 / §3.1. Evidence: `sources/SOURCES.md`,
`findings/MADRID-DATA-RECON-SPIKE.md`, `findings/L-608-*`. Feeds: [`RATE.md`](./RATE.md). Siblings:
[`LEGISLATION-RATE.md`](./LEGISLATION-RATE.md) · [`NEXT.md`](./NEXT.md) ·
[`RISK-REGISTER.md`](./RISK-REGISTER.md).*
