# Jeddah (`jed`, JED, Makkah Region SA-02, Saudi Arabia) — what is true now

**Level:** municipality (demo scaffold) · **ISO/statistical id:** `sa-02` region · `jed` municipality
(UN/LOCODE `SA JED` — see §municipal-code-choice) · **Pack id (= folder identity):** `sa-jed-jeddah`
**Last updated:** 2026-07-24 · **Maintainer:** UNASSIGNED · **Status:** SCAFFOLD — national footprint
identical to Riyadh; no pack authored; exact height + parcel feed geo-fenced.

## 1 — What governs here
- **Governing-instrument chain:** `plot → 2024 MOMRAH national residential decision → plot class
  (villa | apartment) → setback formula + coverage`. Height/floors → **Amanat Jeddah** approved plan
  (المخطط المعتمد, §4 cl. 1) + **Jeddah Development Authority** regs (§1 cl. 3, override on conflict) —
  NOT held. Heritage → **Al-Balad** conservation regime where the parcel is inside the UNESCO property/buffer.
- **Rule KIND (ADR-0270 / C58 §2.2):** **`setback`** + `maxCoverage` — **identical to Riyadh**. The national
  footprint formula `max(w/5, {3,2,2})`, capped by `coverage × plotArea`, is the same in every Amana of the
  Kingdom (Section 4 binds all Amanas). The demo would reuse `resolveSaudiSetbacks` unchanged.
- **Setback-governed, not alignment-governed.**
- **Legal-structure trap (P1): PRESENT on the VERTICAL axis + a heritage overlay.** Height/floors defer to
  Amanat Jeddah + the Jeddah Development Authority; the footprint stays nationally grounded. **Additionally**,
  a parcel inside Al-Balad (Historic Jeddah) is governed by a conservation regime the national decision does
  not contain — the strongest local deviation of the three cities studied.

### Why Jeddah differs from Riyadh — the two extra local layers
The national footprint is **byte-identical** to Riyadh's. Jeddah's differentiators are entirely local:
1. **Amana:** Amanat Jeddah (Jeddah Municipality), permits via the **Etmam** system (`etmam.momrah.gov.sa`)
   — a different approved-plan holder than Riyadh's Amanat Riyadh, but the *national footprint it sits on* is
   the same.
2. **Development authority:** the **Jeddah Development Authority** (regulatory arrangements approved Sept 2023)
   + Jeddah Central Development Company — §1 cl. 3 vertical overrides, analogous to Riyadh's RCRC/ADA.
3. **Heritage overlay — Al-Balad (Historic Jeddah):** UNESCO World Heritage Site (inscribed 2014), managed by
   the **Jeddah Historic District Program** (Ministry of Culture), with a dedicated GIS assessing 651 historic
   buildings (2021–22) over the property + buffer zone. This is Jeddah's structural analogue to a
   Barcelona-style overlay riding on an otherwise-national mechanism — and it needs its own sourcing.

## 2 — Pack status
| Zone | Kind | Disposition | Confidence | Note |
|---|---|---|---|---|
| `sa-villa` | `setback` | scaffold (would reuse the national footprint pack) | `estimated-ruleset` | ground coverage 0.75 (§4-1 cl. 1); setbacks `max(w/5,{3,2})` (§4-1 cl. 4); national height ceiling ≤ 14 m (§5-1-5 cl. 3) |
| `sa-apartment` | `setback` | scaffold | `estimated-ruleset` | ground coverage 0.65 (§4-2 cl. 1); setbacks (§4-2 cl. 4); national height ceiling ≤ 23 m (§3-2) |
| height / floors (both) | — | **field-level BOUNDED cited-null refusal** (C58 §1.13) | — | EXACT value municipal (Amanat Jeddah §4 cl. 1) + Jeddah Development Authority override; national CEILING cited alongside |
| Al-Balad heritage overlay | — | **not held** — separate overlay | — | UNESCO property + buffer; JHD conservation regime; refuse/flag, do not derive an envelope from it |

No pack authored for Jeddah specifically — the national footprint pack (`saRiyadhDemo.ts`) is city-agnostic
and would be reused with a Jeddah bbox. Refusal vocabulary: **plan-deferred (field-level)** + **heritage-overlay**.

## 3 — Granularity (C58 §1.11)
- Setbacks + coverage: **national** values, applied at **parcel** granularity via a user-drawn plot +
  user-supplied street width (no reachable parcel feed — Balady `MapServer/28` geo-fenced).
- Height/floors: **planning-zone** (Amanat Jeddah) granularity — refused, not held.
- Heritage: **property/buffer polygon** (Al-Balad) — an overlay, not an envelope field.

## 4 — The number (the stipulated national ceiling)
**No resolution rate yet** (scaffold). The stipulated ceiling is **identical to Riyadh** — of the 6 governing
envelope fields `{3 setbacks, ground coverage, max height, max floors}`:
- **4 of 6 = 66.7% FULLY national** — the entire buildable **footprint** (setbacks §4-1/§4-2 cl. 4 + coverage
  §4-1 cl. 1 / §4-2 cl. 1), on any standard residential plot where the user supplies a street width.
- **2 of 6 nationally CEILINGED** — height + floors carry a cited national cap (villa ≤ 14 m §5-1-5 cl. 3 &
  ≤ G+1+annex §3-1; apt ≤ 23 m §3-2); the EXACT value beneath refuses (field-level, C58 §1.13).
- So **no field is a total unknown**; the villa is nationally *maximised* (Amanat Jeddah can only reduce).

Denominator when a rate is measured: standard residential plots inside the four national classes, **excluding
Al-Balad / development-authority zones** (where the local instrument governs the vertical and, for Al-Balad,
the whole conservation regime).

## 5 — Files in this folder
- `NEXT.md` — where we stopped, blockers, TRIP-WIRES, resume steps.
- `RATE.md` — the readiness rate for Jeddah (~53%; national number −2 pt for the Al-Balad heritage removal).
- `RATE-IMPLEMENTATION-PLAN.md` — the phased climb (Phase 1 reuses the footprint pack; 1b/1c = the Al-Balad
  refusal overlay + JHD GIS fill; Phases 2–3 BLOCKED on the geo-fence).
- `sources/SOURCES.md` — per-field citations (national footprint + the Jeddah-local layers).
- `sources/VERIFICATION.md` — the human sign-off (NOT signed → `estimated-ruleset`).

## 6 — municipal-code-choice (documented, per the playbook: no INE exists)
Saudi Arabia has **no INE/INSEE/DICOFRE/LAU-equivalent open municipal code**. The `<code>` segment is
**UN/LOCODE `JED`** (`SA JED`, Jeddah) — a documented international standard, lowercased per playbook §2,
globally unique, joinable. ⚠ Flagged for replacement if MOMRAH's Amanat Jeddah numeric code is ever verified
as an open, stable identifier. The pack id `sa-jed-jeddah` omits the region segment `sa-02`, exactly as
`sa-ruh-riyadh` omits `sa-01`.

## 7 — Open questions / unverified
- Per-zone floor/height for Jeddah — geo-fenced (§CONTEXT-DATA-HONESTY); same wall as Riyadh (Amanat Jeddah
  approved plan + Jeddah Development Authority, both behind the Balady/authority geo-fence).
- Al-Balad property + buffer-zone geometry as an open layer — the UNESCO WHC inscription boundary is public;
  the JHD GIS (651 buildings) is not confirmed open. Not carried as a shippable overlay until an open feed is
  found.
- Neighbour-waiver mechanic — not found in the primary decision; not carried as fact.

**Related:** [`../../README.md`](../../README.md) (country umbrella) · [`../../NEXT.md`](../../NEXT.md) ·
[`../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md`](../../findings/SAUDI-MASTER-DATA-SOURCE-STUDY.md) §D.2 ·
[`../README.md`](../README.md) (region index) · `sources/SOURCES.md` · `NEXT.md` · `RATE.md`.
