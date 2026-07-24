# Dammam (`sa-dmm-dammam`) — human verification sign-off

**Verifier:** UNASSIGNED (machine live-probe + secondary research only, 2026-07-24) · **Pack version /
commit:** none authored — the city-agnostic footprint pack `saRiyadhDemo.ts` would be reused with a Dammam
bbox. **Status: OPEN — NOT signed.**

## What was checked, against which document version
| Field | Verified against | Method | Verdict |
|---|---|---|---|
| `maxCoverage` 0.75 / 0.65 | §4-1 cl. 1 / §4-2 cl. 1 | PDF read live (national — applies to all Amanas) | ✅ clause-transcribed (L-606, machine) — national, not Dammam-specific |
| setback formula `max(w/5,{3,2,2})` | §4-1 cl. 4 / §4-2 cl. 4 | PDF read (national) | ✅ clause-transcribed — national |
| height / floors = null, **bounded** refusal | §5-1-5 cl. 3 / §3-1 / §3-2 (cap) + §4 cl. 1 (exact) | PDF read | ✅ correct to refuse the EXACT value; national CEILING cited alongside |
| no FAR | full-text grep (national) | PDF read | ✅ confirmed absent |
| Amanat Eastern Province | MOMRAH branch directory (secondary) | Not probed live | 🟡 approved-plan holder; not a reachable per-parcel feed |
| heritage overlay | — | Searched; none found | ✅ no UNESCO-scale conservation district identified — cleanest of the three cities |

## What I could NOT confirm (and why it stays unshippable)
- **The human sign-off.** The footprint clause numbers are MACHINE-transcribed (L-606, national); the
  remaining L-449 `structured`-tier gate is a **person** confirming the transcription. Until signed →
  `estimated-ruleset`.
- **Per-zone floor/height for Dammam** — Amanat Eastern Province approved plan behind the national
  Balady/authority geo-fence. Measured negative on shape (national), NOT proof of absence.
- **Live parcel data** — Balady `MapServer/28` geo-fenced (national NXDOMAIN + proxy WAF).
- **Eastern-Province development-authority zones** — not enumerated this pass; a possible R1-style override
  surface, unconfirmed.
- **No live Dammam-specific probe was run** this pass beyond the national geo-fence measurements and secondary
  confirmation of the Amana.

## Caveats that must remain visible in the product
- Footprint numbers are `estimated-ruleset` until the transcription sign-off is done (national gate).
- Height/floors REFUSE, per-field, with a cited reason (C58 §1.13) — never a fabricated value.
- The national footprint is a DEFAULT; Amanat Eastern Province and any development authority may override the
  vertical — do NOT present it as flat law. Prefer ordinary-fabric demo plots.
- Dammam has **no heritage overlay** — the cleanest of the three cities; the only refusal is the national
  exact-height refusal.

**Sign-off:** NOT signed. No Dammam pack authored; the reused national footprint pack may ship its footprint
fields at `estimated-ruleset`; `maxHeight_m`/`maxFloors`/`plotRatioFAR` remain `null` and refuse.
— UNASSIGNED, 2026-07-24.
