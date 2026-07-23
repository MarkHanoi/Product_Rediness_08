# Riyadh (`sa-ruh-riyadh`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe only, 2026-07-23) · **Pack version / commit:**
`saRiyadhDemo.ts`, worktree (unmerged, unwired).

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| `maxCoverage` 0.75 / 0.65 | 2024 MOMRAH decision, Ch. 4 pp18/22 | PDF read live | ⚠ page-cited, clause not transcribed |
| setback formula `max(w/5,{3,2,2})` | Ch. 4 §4.2 | PDF read + resolver unit-verified | ⚠ page-cited |
| height / floors = null (refusal) | Ch. 4 §4.1 + Ch. 1 §1 | PDF read | ✅ correct to refuse (no national value) |
| no FAR | full-text grep | PDF read | ✅ confirmed absent |
| pack ↔ engine end-to-end | — | vitest scratch (footprint insets, coverage caps, height null, `estimated-ruleset`) | ✅ confirmed |

## What I could NOT confirm (and why it stays unshippable)
- **Clause-by-clause transcription + human sign-off** — the L-449 `structured`-tier gate. Not done →
  the pack ships `estimated-ruleset`.
- **Apartment front ≥ 6 m at street ≥ 30 m** — `COULD NOT VERIFY` in the apartment table; **moot**
  because `max(w/5,3) ≥ 6 ⟺ w ≥ 30`.
- **Per-zone floor/height** — every reachable Riyadh source geo-fenced/WAF-blocked (ECONNREFUSED /
  rejection page). Measured negative on shape, NOT proof of absence.

## Caveats that must remain visible in the product
- Footprint = `estimated-ruleset` until the transcription + sign-off exist.
- Height/floors refuse, per-field, with a cited reason (never fabricated).
- The national footprint is a DEFAULT; municipal plans + development authorities may override it —
  do NOT present it as flat law, and prefer demo plots in ordinary municipal fabric, not giga-project
  (RCRC/ROSHN/NEOM) zones.

**Sign-off:** NOT signed. The pack may ship its footprint fields at `estimated-ruleset`;
`maxHeight_m`/`maxFloors`/`plotRatioFAR` remain `null` and refuse. — UNASSIGNED, 2026-07-23.
