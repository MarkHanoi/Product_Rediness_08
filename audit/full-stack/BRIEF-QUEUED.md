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

---

## ⭐ SCOPE CHANGE 2026-08-31 (founder): B, C, L and 7 must be AUDITED **AND FIXED**, architecturally sound

The original brief said *"measurement pass, not an execution pass. It changes no production code."*
**That is now superseded.** Each axis gets a measurement phase AND a remediation phase.

### Sequencing is not optional, and it is not caution

Measure-then-fix is the ONLY safe order here, and this engagement has the receipts:

**FIVE times a documented gap measured as ALREADY BUILT AND MERELY UNWIRED, and the ordered fix
would have made things worse:**

| # | Ordered | Measured | What building it would have done |
|---|---|---|---|
| 1 | 8 families "dispatchable but invisible" | **3** | built 5 RIVALS of live paths |
| 2 | "water is a bridge listening for an event nothing emits" | emitter is inside `case 'pool.create'` | DELETED a working render bridge |
| 3 | "4 graph families have no typed reader" | all 4 readers existed in `SemanticGraph.ts` | minted 4 RIVAL readers |
| 4 | "converge the weak commandManager counter into the strong one" | the weak one saw **48 sites** the authority missed | SILENTLY NARROWED coverage |
| 5 | "beam commits and the CEB does not follow — wire the bridge" | `BeamTool` fires `{}` as telemetry; the schema DEFAULT minted a **phantom 4 m beam at the world origin on every placement** | materialised the phantom beside the real beam |

**A fix pass that runs ahead of its measurement pass produces rivals, not repairs.** That is the
single most expensive lesson of this engagement and it is why the axes stay ordered.

### The fix scope now measured, per axis

- **B — 18 families draw the WRONG THING and count `renders_3d = YES`.** 24 of 26 draw; **6** draw
  what the user authored. Each of the 18 needs its dropped fields traced and carried, plus the
  fidelity axis added to the gate suite so a YES cannot mean "something drew" again.
  Also: a RIVAL builder system found (`committers vs fragment-builders`).
- **C — 361 verbs.** 39 delete verbs with **6 LIVE and 27 rivals**; 9 CEB channels with **zero
  subscribers**, 3 of them the bridge's only update arm; `opening` has 3 create verbs on 2
  authorities and no delete/update/move at all.
- **L — every legacy artifact needs a disposition** (WIRE/REPLACE/REMOVE/KEEP-WITH-REASON) and
  C11 §10.3's target is **ZERO bridges**.
- **7 — 11 banned-3p imports over a legitimate ceiling**, and the real question is whether an L2
  geometry package should reach a third-party BIM toolkit at all.

### Standing constraints for every fix lane

No ceiling raised · no baseline widened · no gate disabled, narrowed or renamed-around · no rival
built · persistence and StoresSlot changes ADDITIVE ONLY · root typecheck green at every wave
boundary · **capability search + the four-state ladder BEFORE wiring anything that looks missing.**

⛔ And the constraint P0 added: **59 of 99 gates are blind comparators.** A fix verified only by a
gate that cannot prove it would fire is not verified.
