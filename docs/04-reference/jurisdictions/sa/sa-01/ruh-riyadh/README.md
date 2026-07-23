# Riyadh (`ruh`, RUH, Riyadh Region SA-01, Saudi Arabia) — what is true now

**Level:** municipality (demo) · **ISO/statistical id:** `sa-01` region · `ruh` municipality
(UN/LOCODE — see §municipal-code-choice) · **Pack id (= folder identity):** `sa-ruh-riyadh`
**Last updated:** 2026-07-23 · **Maintainer:** UNASSIGNED · **Status:** PACK AUTHORED, NOT WIRED.

## 1 — What governs here
- **Governing-instrument chain:** `plot → 2024 MOMRAH national residential decision → plot class
  (villa | apartment) → setback formula + coverage`. Height/floors → municipal approved plan +
  development-authority regs (NOT held).
- **Rule KIND (ADR-0270 / C58 §2.2):** **`setback`** — a plain per-edge inset. The width-dependence
  of the setback is handled by a resolver (`resolveSaudiSetbacks`), NOT a new geometric kind — the
  same pattern `esBarcelona20aAillada` uses for its width-indexed FAR. See `findings/L-606-*`.
- **Setback-governed, not alignment-governed.**
- **Legal-structure trap (P1): PRESENT on the VERTICAL axis only** — height/floors defer to the
  municipal plan and development authorities (RCRC/ROSHN/etc.). The footprint stays nationally grounded.

## 2 — Pack status
| Zone | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| `sa-villa` | `setback` | `pack` (once wired — WIRING TODO) | `estimated-ruleset` | ground coverage 0.75; setbacks resolved per-parcel from street width |
| `sa-apartment` | `setback` | `pack` (once wired) | `estimated-ruleset` | ground coverage 0.65; ≤ 23 m class |
| height / floors (both) | — | **field-level cited-null refusal** (C58 §1.13) | — | municipal plan + authority override; not resolved |

Pack file: `packages/site-parcel-data/src/rulepacks/saRiyadhDemo.ts`. **Not registered** — see its
`WIRING TODO (orchestrator)` block. Refusal vocabulary in use: **plan-deferred (field-level)**.

## 3 — Granularity (C58 §1.11)
- Setbacks + coverage: **national** values, applied at **parcel** granularity via a user-drawn plot +
  user-supplied street width (no reachable parcel feed).
- Height/floors: would be **planning-zone** (municipal) granularity — refused, not held.

## 4 — The number
**No resolution rate yet** (pack authored, not wired). The *shape* of the answer once wired: a full
cited **footprint** (setbacks + coverage) on any standard residential plot where the user supplies a
street width; **height/floors refuse** (field-level, cited). Denominator when measured: standard
residential plots inside the four national classes, excluding development-authority master-plan zones.

## 5 — Files in this folder
- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `sources/SOURCES.md` — per-field citations for the two zones (the trust gate).
- `sources/VERIFICATION.md` — the human sign-off (NOT signed → `estimated-ruleset`).
- `findings/L-606-RIYADH-DEMO-PACK-AND-PROBES.md` — the solver decision, the streetWidth verdict, the
  floor/height live-probe results, and the WIRING TODO.

## 6 — municipal-code-choice (documented, per the playbook: no INE exists)
Saudi Arabia has **no INE/INSEE/DICOFRE/LAU-equivalent open municipal code**. The `<code>` segment is
**UN/LOCODE `RUH`** (`SA RUH`, Riyadh) — a documented international standard, lowercased per playbook
§2, globally unique, joinable. ⚠ Flagged for replacement if MOMRAH's Amana numeric code (*أمانة منطقة
الرياض*) is ever verified as an open, stable identifier. The pack id `sa-ruh-riyadh` omits the region
segment `sa-01`, exactly as `es-08019-barcelona` omits `es-ct` (pack id = folder identity, region-less).

## 7 — Open questions / unverified
- Per-zone floor/height for Riyadh — geo-fenced (§CONTEXT-DATA-HONESTY); see `findings/`.
- Apartment front setback ≥ 6 m at street ≥ 30 m — `COULD NOT VERIFY` in the apartment table, but
  **moot**: `max(w/5, 3) ≥ 6 ⟺ w ≥ 30`, so the formula satisfies it regardless of class.
- Neighbour-waiver mechanic — not found in the primary decision; not carried as fact.
