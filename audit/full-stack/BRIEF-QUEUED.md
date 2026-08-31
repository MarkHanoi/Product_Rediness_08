# QUEUED — Full-day production code audit (successor to audit/element-creation/2026-08-29/)

**Status: NOT STARTED.** Queued by the founder 2026-08-31 while Wave 4 was still in flight.
Run alongside or after Wave 5. Output dir: `audit/full-stack/<YYYY-MM-DD>/`.

## Why it exists
The 2026-08-29 audit measured ONE VERB per family — create, the verb most likely to be healthy
because everyone tests it by hand. The repo has **361 verbs across 24 families**, and read-back is
proven for **7**. So ~2% of the command surface has ever been measured end to end.

## Four axes it adds
| Axis | Question | Why separate |
|---|---|---|
| **B Builders** | does the geometry carry what the user AUTHORED? | `roof` counts renders_3d=YES while dropping `materialId`. The seven-fact chain has NO FIDELITY AXIS — a YES means "something drew", not "the right thing drew". |
| **C Commands** | all 361 verbs: validate, mutate, mirror, undo, read back | mirror history is 17 `.created` / 0 `.updated`. Create was measured; update was ASSUMED. |
| **L Legacy** | who still walks the legacy path, and what is its disposition | every element is written twice (Immer → LegacyStore.add → VDT → bimManager). |
| **7 Layers** | per-family layer truth | repo-wide counts hide it. banned-3p 123→124 moved because a package was CLASSIFIED, not because anything was added. |

## Deliverables
`gate-snapshot.json` · `census.json` · `builders/<family>.json` · `commands/<family>.json` ·
`legacy.json` · `layers.json` · `rollup.json` · `FINDINGS-DAY.md` · `proposed-patches/`

`FINDINGS-DAY.md` opens with: measurement-system status → **the EIGHT-fact row (seven + fidelity)**
→ verb coverage (handler / mirror / undo / read-back — four numbers that will not match) → legacy
disposition ledger → per-family layer truth + the honest banned-3p number → contract conflicts →
**refutations (expected non-empty; an empty one means you searched by name, not capability)** →
UNVERIFIED register.

## Constraints carried forward
Read-only. Never touch initTools.ts, CommandEventBridge.ts, ViewDependencyTracker.ts,
ci-check-no-commandmanager.mjs, or tools/ga-gate/ — implementation lanes may be live.
Never `git stash` / `checkout .` / `reset --hard` / `clean`. Record HEAD at start AND end; if it
moved mid-audit, say so per phase.
Anti-hang: no `python`, no repo-wide `grep -r` (has hung two agents), every command <120s, capture
RC in its own statement, `NODE_OPTIONS=--max-old-space-size=8192` for tsc, **write every row to
disk as measured**.

## The governing suspicion
"This repository's most expensive defect is a confident sentence the code contradicts. FOUR times
in the last pass, something documented as missing turned out to be built and unwired, and TWICE the
ordered fix would have created a rival. Assume that rate holds."

The full 22-item false-green catalogue is in the founder's brief; §8 of it. Key additions since the
last audit: **#21 fidelity-blind YES**, **#22 the fixing commit that leaves the ledger row**.
