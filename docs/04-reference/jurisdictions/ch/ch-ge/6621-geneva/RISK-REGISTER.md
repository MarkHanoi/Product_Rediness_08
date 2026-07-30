# Risk register — Genève (BFS 6621)

> The honesty guardrails: every way this city's data could silently mislead, and the fail-safe that keeps it
> honest. Not scored; it protects `honestyOk` (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis affected | Fail-safe (what keeps it honest) | Status |
|---|---|---|---|---|
| R1 | Footprint-fallback parcel presented as cadastral | PARCEL | CH routes to `swisstopo-av` (real Grundstück + EGRID; GE live-verified 2026-07-26) — not a footprint. | CLOSED |
| R2 | Borrowing Zürich's BZO numbers for Genève | LEGISLATION · ENVELOPE | No GE pack exists; the national pack REFUSES (cites missing density). Every AZ/height is per-canton (C58 §1.2) — none borrowed. | CLOSED |
| R3 | Reading `not-assessed` as 0 % | (overall) | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. | CLOSED |
| R4 | Fabricated 9 m height rendered as measured | HEIGHTS/LOD | swisstopo nDSM measured-CAPABLE but UNBAKED → region keeps the honest OSM/`assumed` default (§SWISS-NDSM-STAC-BUILD); L-647 tier renders `assumed` distinctly. | OPEN (capability) |
| R5 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. | OPEN (rung-capped) |
| R6 | Over-claiming zone-GIS as `live` | DATA-SOURCES | geodienste GE + ÖREB RDPPF rated `documented` (0.5) — endpoints live but `siteDispatch.ts` wiring unconfirmed, RDPPF is SOAP not REST. | CLOSED (rated documented) |

## Trip-wires
- If a GE gabarit/indice catalogue is transcribed + signed → R2 stays closed by the same per-canton discipline;
  the envelope moves from refusal to `estimated-ruleset`.
- If the swisstopo nDSM join bakes → R4 closes.

---
*Authority: C63 §3.1 (honesty companion) · §CONTEXT-DATA-HONESTY · C58 §1.2. Protects: `RATE.md honestyOk`.*
