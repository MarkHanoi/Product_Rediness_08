# Risk register — Bern (BFS 0351)

> The honesty guardrails: every way this city's data could silently mislead, and the fail-safe that keeps it
> honest. Not scored; it protects `honestyOk` (C63 §3.1). **Last updated:** 2026-07-30. **Maintainer:** UNASSIGNED.

| # | Risk (how it could silently lie) | Axis affected | Fail-safe (what keeps it honest) | Status |
|---|---|---|---|---|
| R1 | Footprint-fallback parcel presented as cadastral | PARCEL | CH routes to `swisstopo-av` (real Grundstück + EGRID, all-canton federal identify) — not a footprint. | CLOSED |
| R2 | Borrowing Zürich's BZO numbers for Bern | LEGISLATION · ENVELOPE | No BE pack exists; the national pack REFUSES (cites missing density). Every AZ/height is per-canton (C58 §1.2) — none borrowed. | CLOSED |
| R3 | Presenting BE zone coverage as full national WFS | LEGISLATION · DATA-SOURCES | BE flagged `incomplete` explicitly in `LEGISLATION-RATE.md` + Axis 3 derivation; the `documented` credit rests on ÖREB BE, not the WFS. | CLOSED |
| R4 | Fabricated 9 m height rendered as measured | HEIGHTS/LOD | swisstopo nDSM measured-CAPABLE but UNBAKED → region keeps the honest OSM/`assumed` default (§SWISS-NDSM-STAC-BUILD); L-647 tier renders `assumed` distinctly. | OPEN (capability) |
| R5 | Claiming TERRAIN is verified | TERRAIN | Rung capped at **50** (baked-but-unverified) — no `terrain.verify.mjs` round-trip recorded. | OPEN (rung-capped) |
| R6 | Reading `not-assessed` as 0 % | (overall) | `not-assessed ≠ 0 %` (C63 §1.2); overall renormalised over the assessed subset + flagged `partial`. | CLOSED |

## Trip-wires
- If a BE Bauordnung catalogue is transcribed + signed → the envelope moves from refusal to `estimated-ruleset`.
- If canton BE enters the geodienste `full` cohort → R3 re-derives (zone-ID may firm).
- If the swisstopo nDSM join bakes → R4 closes.

---
*Authority: C63 §3.1 (honesty companion) · §CONTEXT-DATA-HONESTY · C58 §1.2. Protects: `RATE.md honestyOk`.*
