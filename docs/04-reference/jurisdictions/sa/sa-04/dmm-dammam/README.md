# Dammam (`dmm`, DMM, Eastern Province SA-04, Saudi Arabia) — what is true now

**Level:** municipality (demo scaffold) · **ISO/statistical id:** `sa-04` region · `dmm` municipality
(UN/LOCODE `SA DMM` — see §municipal-code-choice) · **Pack id (= folder identity):** `sa-dmm-dammam`
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — national footprint
identical to Riyadh; no pack authored; exact height + parcel feed geo-fenced. The **cleanest** of the three.

## 1 — What governs here
- **Governing-instrument chain:** `plot → 2024 MOMRAH national residential decision → plot class
  (villa | apartment) → setback formula + coverage`. Height/floors → **Amanat Eastern Province** approved
  plan (المخطط المعتمد, §4 cl. 1) + any Eastern-Province development-authority regs (§1 cl. 3) — NOT held.
- **Rule KIND (ADR-0270 / C58 §2.2):** **`setback`** + `maxCoverage` — **identical to Riyadh**. The national
  footprint formula is the same in every Amana (Section 4 binds all Amanas). The demo would reuse
  `resolveSaudiSetbacks` unchanged.
- **Setback-governed, not alignment-governed.**
- **Legal-structure trap (P1): PRESENT on the VERTICAL axis only.** Height/floors defer to Amanat Eastern
  Province + any development-authority zone; the footprint stays nationally grounded. **No UNESCO-scale
  heritage overlay identified** — so Dammam is the **cleanest** of the three cities: national footprint + a
  single municipal vertical layer, no conservation overlay to refuse (contrast Jeddah's Al-Balad).

### Why Dammam is the simplest of the three
The national footprint is **byte-identical** to Riyadh and Jeddah. Dammam's only local layer is the Amana's
approved plan (Amanat Eastern Province) for the exact vertical value — no RCRC-scale giga-project density
authority as pervasive as Riyadh's, and no UNESCO conservation district as in Jeddah. This makes Dammam the
**most defensible ordinary-fabric demo**: the national footprint applies with the fewest local carve-outs, and
the only refusal is the (national) exact-height refusal.

## 2 — Pack status
| Zone | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| `sa-villa` | `setback` | scaffold (would reuse the national footprint pack) | `estimated-ruleset` | ground coverage 0.75 (§4-1 cl. 1); setbacks `max(w/5,{3,2})` (§4-1 cl. 4); national height ceiling ≤ 14 m (§5-1-5 cl. 3) |
| `sa-apartment` | `setback` | scaffold | `estimated-ruleset` | ground coverage 0.65 (§4-2 cl. 1); setbacks (§4-2 cl. 4); national height ceiling ≤ 23 m (§3-2) |
| height / floors (both) | — | **field-level BOUNDED cited-null refusal** (C58 §1.13) | — | EXACT value municipal (Amanat Eastern Province §4 cl. 1); national CEILING cited alongside |

No pack authored for Dammam specifically — the national footprint pack (`saRiyadhDemo.ts`) is city-agnostic
and would be reused with a Dammam bbox. Refusal vocabulary: **plan-deferred (field-level)**.

## 3 — Granularity (C58 §1.11)
- Setbacks + coverage: **national** values, applied at **parcel** granularity via a user-drawn plot +
  user-supplied street width (no reachable parcel feed — Balady `MapServer/28` geo-fenced).
- Height/floors: **planning-zone** (Amanat Eastern Province) granularity — refused, not held.

## 4 — The number (the stipulated national ceiling)
**No resolution rate yet** (scaffold). The stipulated ceiling is **identical to Riyadh** — of the 6 governing
envelope fields `{3 setbacks, ground coverage, max height, max floors}`:
- **4 of 6 = 66.7% FULLY national** — the entire buildable **footprint** (setbacks §4-1/§4-2 cl. 4 + coverage
  §4-1 cl. 1 / §4-2 cl. 1), on any standard residential plot where the user supplies a street width.
- **2 of 6 nationally CEILINGED** — height + floors carry a cited national cap (villa ≤ 14 m §5-1-5 cl. 3 &
  ≤ G+1+annex §3-1; apt ≤ 23 m §3-2); the EXACT value beneath refuses (field-level, C58 §1.13).
- So **no field is a total unknown**; the villa is nationally *maximised* (Amanat Eastern Province can only
  reduce).

Denominator when a rate is measured: standard residential plots inside the four national classes, excluding
any Eastern-Province development-authority master-plan zones. **With no heritage overlay, Dammam's honest
denominator is the widest of the three cities.**

## 5 — Files in this folder
- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `RATE.md` — the readiness rate for Dammam (~55% = national; no heritage or density carve-out — the cleanest).
- `RATE-IMPLEMENTATION-PLAN.md` — the phased climb (Phase 1 reuses the footprint pack, widest denominator;
  Phases 2–3 BLOCKED on the geo-fence).
- `sources/SOURCES.md` — per-field citations (national footprint + the Dammam-local Amana).
- `sources/VERIFICATION.md` — the human sign-off (NOT signed → `estimated-ruleset`).

## 6 — municipal-code-choice (documented, per the playbook: no INE exists)
Saudi Arabia has **no INE/INSEE/DICOFRE/LAU-equivalent open municipal code**. The `<code>` segment is
**UN/LOCODE `DMM`** (`SA DMM`, Dammam) — a documented international standard, lowercased per playbook §2,
globally unique, joinable. ⚠ Flagged for replacement if MOMRAH's Amanat Eastern Province numeric code is ever
verified as an open, stable identifier. The pack id `sa-dmm-dammam` omits the region segment `sa-04`, exactly
as `sa-ruh-riyadh` omits `sa-01`. (Note: Dammam, Al-Khobar, and Dhahran form one metropolitan triad; this
pack is Dammam-city scoped, DMM being the metro's principal UN/LOCODE.)

## 7 — Open questions / unverified
- Per-zone floor/height for Dammam — geo-fenced (§CONTEXT-DATA-HONESTY); same national wall (Amanat Eastern
  Province approved plan behind the Balady/authority geo-fence).
- Any Eastern-Province development-authority zone that overrides the vertical (§1 cl. 3) — not enumerated this
  pass; treat as a possible R1-style surface, prefer ordinary-fabric demo plots.
- Neighbour-waiver mechanic — not found in the primary decision; not carried as fact.

**Related:** [`../../README.md`](../../README.md) (country umbrella) · [`../../NEXT.md`](../../NEXT.md) ·
[`../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §D.3 ·
[`../README.md`](../README.md) (region index) · `sources/SOURCES.md` · `NEXT.md` · `RATE.md`.
