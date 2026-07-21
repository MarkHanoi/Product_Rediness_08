# Spain scalability — the LIVE-DATA probe (Barcelona → Madrid → Córdoba)

**Run 2026-07-21 against the live Catastro services. 9 real addresses, 3 cities.** This is the
data half of the scalability question; the code/architecture half is
`SPAIN-SCALABILITY-STUDY.md`. Probe: `scratchpad/probe-spain-cities.mts` (reuses the PRODUCTION
parsers exported from `server/parcelZoningProxy.js` and the production
`dissolveParcelsToBlockRing`, so the probe cannot disagree with the code path it is diagnosing).

## THE HEADLINE

**The Catastro plumbing transfers perfectly. The BLOCK DISSOLVE does not.**

Outside Barcelona, **only 2 of 7 sampled parcels produce a block ring** — so on today's code
Madrid and Córdoba would show **no buildable envelope at all** on most parcels. The engine declines
honestly (`degenerate: 'open-or-disjoint'` → no envelope, never a wrong number), which is the C57
§1.5 / ADR-0271 design working exactly as intended — but "correctly shows nothing" is still nothing.

## THE MEASUREMENTS

| # | Point | Address resolved | Step 1–3 (geocode → parcel → masa) | Step 4 (dissolve) |
|---|---|---|---|---|
| 1 | BCN Eixample A | CL VALENCIA 227 | ✅ 23 parcels in masa | ✅ 109 verts, 17,795 m² |
| 2 | BCN Eixample B | CL PAU CLARIS 174 | ✅ 18 parcels | ✅ 66 verts, 12,705 m² |
| 3 | MAD Salamanca A | CL VELAZQUEZ 33 | ✅ 13 parcels | ❌ `open-or-disjoint` |
| 4 | MAD Salamanca B | CL AYALA 62 | ✅ 19 parcels | ❌ `open-or-disjoint` |
| 5 | MAD Chamberí | CL VIRIATO 19 | ✅ 25 parcels | ✅ 68 verts, 12,048 m² |
| 6 | MAD centro | PZ MAYOR 3 | ✅ 15 parcels | ✅ 38 verts, 3,408 m² |
| 7 | COR centro A | CL CONDE DE TORRES CABRERA 15 | ✅ 10 parcels | ❌ `open-or-disjoint` |
| 8 | COR centro B | AV DE LA LIBERTAD (car park) | ❌ masa has 1 parcel | — |
| 9 | COR ensanche | PZ AGUAYOS 2 | ✅ 32 parcels | ❌ `open-or-disjoint` |

**Success rate for a usable block ring: Barcelona 2/2 (100 %) · Madrid 2/4 (50 %) · Córdoba 0/3 (0 %).**

## WHAT EACH STEP PROVES

- **Reverse geocode + `GetParcel`: 9/9.** The Catastro national services (RCCOOR_Distancia, INSPIRE
  WFS) resolve real addresses and return real parcel rings in all three cities. **The parcel half of
  the pipeline is genuinely national** — no Barcelona coupling. (Caveat unverified here: Catastro
  does not cover **País Vasco / Navarra**, which run their own cadastres.)
- **The 5-char refcat "manzana" prefix: 8/9 yielded ≥ 3 parcels.** The heuristic (documented in
  `parcelZoningProxy.js` as "an observed pattern, not a documented guarantee") holds up better
  outside Barcelona than feared. Its one failure (#8) is honest — that point is a car park whose
  masa really does contain one parcel, and the `< 3` guard refused rather than inventing a block.
- **`dissolveParcelsToBlockRing`: THE BLOCKER.** It requires a CONFORMING tiling — neighbours must
  share whole edges vertex-for-vertex — and its own header already says so: *"Real cadastral data
  has T-junctions (one parcel's edge spans two of its neighbour's) and slivers. Those do NOT
  silently produce a wrong ring: they leave unmatched edge fragments, the chain fails to close, and
  we return `degenerate`."* **That limitation was written as a caveat; this probe shows it is the
  dominant outcome outside the Eixample.**

## WHY BARCELONA FLATTERED US

The Eixample is the best-case input in Spain and we built against it: regular Cerdà blocks laid out
in one 19th-century operation and surveyed as a tidy tiling. Madrid's Salamanca district is also a
19th-century ensanche and still fails, so **this is not simply "old vs new" — it is how each
municipality's cadastral geometry was digitised.** Note #5 and #6 (Chamberí and Plaza Mayor)
succeed, including a small 3,408 m² historic block: irregular shape is NOT the predictor. The
predictor is vertex hygiene, which we cannot see from the shape.

## WHAT THIS MEANS FOR MADRID / CÓRDOBA

1. **Madrid is NOT a "write a new rule pack" job.** Even with a perfect PGOUM-1997 pack, ~50 % of
   Madrid parcels and ~100 % of sampled Córdoba parcels would produce no envelope, because the
   geometry stage fails before any rule is consulted. **Fix the dissolve first, or the rule work
   lands on a pipeline that cannot feed it.**
2. **The fix is bounded and known.** `dissolveParcelsToBlockRing` needs a TOLERANT mode: snap
   near-coincident vertices and split edges at T-junctions before the edge-cancellation pass —
   i.e. weld the tiling to a tolerance instead of demanding exactness. ⚠ It must stay
   **conservative**: the whole point of the current refusal is that an almost-right block ring
   yields an almost-right *profunditat edificable*, the confidently-wrong number ADR-0270/0271 and
   L-462/L-465 exist to prevent. A tolerance is a new tunable standing between cadastral data and a
   compliance number — it needs the same scrutiny L-529's orientation test got, and the tolerance
   must be justified against cadastral positional accuracy, not tuned until Madrid passes.
3. **Re-run this probe as the acceptance test.** It is cheap, uses live data, needs no deploy, and
   turns "does it scale?" into a number. Target: Madrid + Córdoba ≥ 90 % block-ring success before
   any city-specific rule pack is written.

## WHAT THIS PROBE DOES *NOT* SHOW

It proves the parcel + block PLUMBING transfers. **It proves nothing about the RULES.** Madrid is
PGOUM-1997 with *normas zonales*, Córdoba its own PGOU; neither is PGM Art. 242.2 / 327.2, and
neither is guaranteed to be the same "alignment + block-derived depth" rule KIND that ADR-0270/0271
model. That question is the architecture study's (`SPAIN-SCALABILITY-STUDY.md`), and the legal
sourcing would need its own founder-signed gate per city (the L-449 pattern).

**Cross-refs:** L-535 (audit), `SPAIN-SCALABILITY-STUDY.md`, `blockRing.ts` (the limitation, stated
in its own header), C57 §1.5, ADR-0271, L-529 (the last time this file's exactness assumptions bit).
