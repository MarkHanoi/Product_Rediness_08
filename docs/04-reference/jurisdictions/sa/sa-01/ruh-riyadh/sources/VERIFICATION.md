# Riyadh (`sa-ruh-riyadh`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe only, 2026-07-23) · **Pack version / commit:**
`saRiyadhDemo.ts`, worktree (unmerged, unwired).

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| `maxCoverage` 0.75 / 0.65 | §4-1 cl. 1 / §4-2 cl. 1 | PDF read live | ✅ clause-transcribed (L-606, machine) |
| setback formula `max(w/5,{3,2,2})` | §4-1 cl. 4 / §4-2 cl. 4 | PDF read + resolver unit-verified | ✅ clause-transcribed (L-606) |
| height / floors = null, **bounded** refusal | §5-1-5 cl. 3 / §3-1 / §3-2 (cap) + §4 cl. 1 (exact) | PDF read | ✅ correct to refuse the EXACT value; national CEILING (≤14 m villa / ≤23 m apt) now cited alongside |
| no FAR | full-text grep | PDF read | ✅ confirmed absent |
| pack ↔ engine end-to-end | — | vitest throwaway, re-run L-606 (40×40 villa @ 20 m → 32×32 inset, 0.75 cap, height null, `estimated-ruleset`); deleted, suite back to baseline | ✅ confirmed |

## What I could NOT confirm (and why it stays unshippable)
- **The human sign-off.** Clause numbers are now MACHINE-transcribed (L-606); the remaining L-449
  `structured`-tier gate is a **person** confirming the transcription. Until signed → `estimated-ruleset`.
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
