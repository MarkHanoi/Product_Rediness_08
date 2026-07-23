# Saudi Arabia (`sa`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe only, 2026-07-22/23) · **Pack version / commit:**
`sa-ruh-riyadh` demo pack, worktree (unmerged).

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| setback formula | 2024 MOMRAH decision, Ch. 4 §4.2 | PDF read live (momah.gov.sa + balady mirror) | ⚠ page-cited, clause numbers not transcribed |
| coverage villa 0.75 / apt 0.65 | Ch. 4 pp18/22 | PDF read | ⚠ page-cited, not clause-transcribed |
| no residential FAR | full-text grep (0 hits) | PDF read | ✅ confirmed absent |
| floors / max height | Ch. 4 §4.1 + Ch. 1 §1 | PDF read | ❌ national value does not exist — deferred |

## What I could NOT confirm (and why it stays unshippable)
- **A human clause-by-clause transcription** — the numbers are read as page positions, not each tied
  to its numbered clause with a person's sign-off. This is the L-449 gate the `structured` tier
  requires; until it is done the pack ships `estimated-ruleset`.
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
