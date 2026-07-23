# Saudi Arabia (`sa`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe only, 2026-07-22/23) · **Pack version / commit:**
`sa-ruh-riyadh` demo pack, worktree (unmerged).

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| setback formula | §4-1 cl. 4 / §4-2 cl. 4 | PDF read live (momah.gov.sa + balady mirror) | ✅ clause-transcribed (L-606, machine) |
| coverage villa 0.75 / apt 0.65 | §4-1 cl. 1 / §4-2 cl. 1 | PDF read | ✅ clause-transcribed (L-606, machine) |
| no residential FAR | full-text grep (0 hits) | PDF read | ✅ confirmed absent |
| **national height CEILING** villa ≤14 m / apt ≤23 m | §5-1-5 cl. 3 / §3-1 / §3-2 | PDF read (L-606) | ✅ **national CAP exists and is cited** (correction to first pass) |
| floors / max height — the **EXACT** value | §4 cl. 1 + §1 cl. 3 | PDF read | 🟡 exact value municipal; the CEILING is national (row above) |

## What I could NOT confirm (and why it stays unshippable)
- **The human clause-by-clause sign-off.** The clause numbers are now MACHINE-transcribed from the PDF
  (L-606) — the first pass's "not clause-transcribed" gap is closed on the machine side. What remains is
  a **person** confirming that transcription against the document version (the L-449 gate the `structured`
  tier requires). Until a human signs, the pack ships `estimated-ruleset`. This is now the LAST gate.
- **Per-city floor/height** — every reachable Riyadh source (trc.alriyadh.gov.sa, rcrc.gov.sa,
  istitlaa.ncc.gov.sa) is geo-fenced/WAF-blocked from outside SA (ECONNREFUSED / "requested URL was
  rejected"). Measured negative on shape, NOT proof of absence.
- **Live parcel data** — Balady `MapServer/28` (which carries setbacks + use + floors per parcel) is
  geo-fenced (NXDOMAIN on the ArcGIS host, WAF on the proxy).

## Caveats that must remain visible in the product
- Footprint numbers are `estimated-ruleset` until the clause transcription + sign-off are done.
- Height/floors REFUSE, per-field, with a cited reason (C58 §1.13) — never a fabricated value.
- The national footprint is the DEFAULT; municipal plans and development authorities may override it.

**Sign-off:** NOT signed. The pack may ship its footprint fields at `estimated-ruleset` (every field
`ordinance-pdf` provenance); `maxHeight_m`/`maxFloors`/`plotRatioFAR` remain `null` and refuse.
— UNASSIGNED, 2026-07-23.
