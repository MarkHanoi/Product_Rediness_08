# Lane reports — 2026-09-09

Eight multi-agent lanes ran on this date against founder-reported defects. Their reports are
captured here because the fixes they drove ship across many commits, and **the reasoning behind
a one-line change is the expensive part to reconstruct**.

| Report | Drove |
|---|---|
| `DEFECT-ROOT-CAUSE-SWEEP.md` | L-13271 envelope caps · L-13273 face-drag · L-13277 globe seat |
| `DOCUMENTATION-QUALITY.md` | L-13274 pen widths are paper mm |
| `PROJECT-OPEN-CORRUPTION.md` | L-13275 the C13 violation was a false positive |
| `PROJECT-OPEN-PERFORMANCE.md` | L-13278 stream-load hoist · L-13279 warm() latch |
| `THREE-FOUNDER-DEFECTS.md` | L-13280 the massing card survives a refusal |
| `FURNITURE-ESCAPES-VISIBILITY.md` | L-13281 the line knows its element · L-13282 isolate |
| `ROOMS-AS-A-GOVERNABLE-CATEGORY.md` | **nothing yet — read §1 before starting** |

## ⚠ How to read these

- **They are audits, not contracts.** Where a report and the code disagree, the code wins and
  the report is stale. Line numbers rot within days — re-read before acting on one.
- **Not everything in them was implemented, deliberately.** Each commit says what it left out
  and why. The most common reason is that a proposal was larger than its evidence.
- **`ROOMS-AS-A-GOVERNABLE-CATEGORY.md` is the one to read before touching rooms.** Its finding
  is that adding the category row would achieve nothing, because three gates sit in series in
  front of it — and the first is that the room-colour control the user already has refuses on
  its own default setting, for every click, in every session.

## ⭐ The pattern across all eight

Six of the eight root causes were the same shape: **one rule with two implementations, and the
fix had landed in the copy the user was not looking at** — or, as often, the rule had one
implementation and several *readers*, one of which asked a narrower question than the others
and read the missing answer as a "no".

The guarding test was green in nearly every case, because it measured the copy that was right.
That is [[same-rule-two-implementations]] and [[gate-blind-on-the-wrong-axis]] together, and it
is the thing to look for first in this codebase.
