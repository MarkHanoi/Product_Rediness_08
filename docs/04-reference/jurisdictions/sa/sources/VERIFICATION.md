# Saudi Arabia (`sa`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe only, 2026-07-22/23) · **Pack version / commit:**
`sa-ruh-riyadh` demo pack, worktree (unmerged).

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| setback formula | §4-1 cl. 4 / §4-2 cl. 4 | PDF read live (momah.gov.sa + balady mirror) | ✅ clause-transcribed (L-606, machine) |
| coverage villa 0.75 / apt 0.65 | §4-1 cl. 1 / §4-2 cl. 1 | PDF read | ✅ clause-transcribed (L-606, machine) |
| no residential FAR | full-text grep (0 hits) | PDF read | ✅ confirmed absent |
| **national height CEILING** villa ≤14 m / apt ≤23 m | §5-1-5 cl. 3 / §3-1 / §3-2 | PDF read (L-606) | 🟠 **DISPUTED — needs a direct Chapter-5 re-read** (see 2026-07-24 independent check below). L-606 claimed these from the full PDF; an independent verification could NOT reproduce §5-1-5 from the committed extract and reads the 23 m figure as a *classification boundary*, not a certified national cap. **Do NOT present villa 14 m / apt 23 m as a certified fact until re-confirmed against Chapter 5 of the primary PDF.** |
| floors / max height — the **EXACT** value | §4 cl. 1 + §1 cl. 3 | PDF read | 🟡 exact value municipal; the CEILING is national but see the DISPUTED row above |

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

## 2026-07-24 — independent verification pass (founder-relayed, GPT-5.5 assist)

An independent read of the committed primary-source **extract** (not the full PDF) confirmed the
FOOTPRINT fields and disputed the HEIGHT rows:

| Field | Independent verdict (from the extract) |
|---|---|
| front / side / rear setback formula | ✅ confirmed |
| ground coverage villa 0.75 / apt 0.65 | ✅ confirmed |
| villa floors ≤ ground+1+annex | ✅ confirmed |
| residential FAR absent | ✅ confirmed |
| **villa height ≤14 m (§5-1-5 cl.3)** | ⚠ **NOT confirmable** — the committed extract does not reproduce Chapter 5 / that clause. |
| **apartment height ≤23 m (§3-2)** | ⚠ **DISPUTED** — the extract presents 23 m as the *classification boundary* between apartment and high-rise, NOT as a national regulatory cap imposed by this decision. |

⇒ **The FOOTPRINT (setbacks + coverage + floors + no-FAR) is now INDEPENDENTLY confirmed** — the
`estimated-ruleset` footprint pack rests on verified fields. **The two HEIGHT-cap rows are held as
DISPUTED** pending a direct re-read of Chapter 5 (§5-1-5) and §3-2 against the *full* primary PDF.
The pack ships `maxHeight_m`/`maxFloors` = `null` regardless (they refuse, never render), so this
dispute does not put a fabricated number on screen — but the L-606 claim that villa 14 m / apt 23 m
are cited national caps must NOT be repeated as fact until the Chapter-5 re-read is done.

**Sign-off:** NOT fully signed. FOOTPRINT fields independently confirmed (2026-07-24) → the pack may
ship them at `estimated-ruleset` (every field `ordinance-pdf` provenance). HEIGHT caps DISPUTED →
`maxHeight_m`/`maxFloors`/`plotRatioFAR` remain `null` and refuse; the caps' national-cap wording is
withdrawn from "fact" pending a Chapter-5 re-read. — founder-relayed, 2026-07-24 (was UNASSIGNED, 2026-07-23).
