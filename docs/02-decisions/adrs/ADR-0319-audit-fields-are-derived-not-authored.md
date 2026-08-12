# ADR-0319 — Audit fields are DERIVED, not authored; identity is AUTHORITATIVE

- **Status**: ACCEPTED — 2026-08-12. Ratified by founder directive ("one agent per target fix
  and don't stop until done", 2026-08-11, which explicitly staffed C3/C4 whose brief depends on
  this ADR; the treating-as-ratified reading was stated publicly at the time and the founder
  continued on it). The Phase 0 re-baseline correctly flagged that the certification had gone
  green under a PROPOSED governance act — this status change closes that gap. One consequence
  was since **overturned by measurement** and is recorded in §Consequences below rather than
  silently edited.
- **Date**: 2026-08-11
- **Supersedes**: nothing. **Constrains**: C13 §2 (byte-compatible round-trips)
- **Blocks**: 20 of the 24 failing rows in [`BIM20-CERTIFICATION-RESULTS.md`](../../04-reference/BIM20-CERTIFICATION-RESULTS.md)

## Context — this is a contract question, and it was found by measuring

The first executed BIM 2.0 certification returned **0 VERIFIED / 10 PARTIAL / 24 FAILED**, and a
**single cause produces 20 of the 24**: identity and audit fields are re-minted on every restore
and every redo.

Concretely, measured:

- reload re-runs the `Create*` commands, stamping fresh `metadata.createdAt`, `metadata.modifiedAt`
  and `metadata.version`, and a fresh `ifcData.guid`;
- redo **re-executes** rather than re-applying a patch, so State-B-after-redo differs from State B
  by milliseconds on `modifiedAt`;
- monotonic counters never return: `element.updateParameters` left `metadata.version 4` where
  State A held `2`; door/window offset verbs leave `wall._renderVersion` **+2 per undo cycle**.

**None of this was normalised away by the harness, deliberately.** The documented-tolerance list
ships **empty**, because a tolerance list written to make a test pass is not a measurement — it is
the test agreeing with the code. Deciding what belongs on that list is a governance act, and this
ADR is that act.

C13 §2 requires byte-compatible round-trips. Read literally and applied to every field, **no
element kind in PRYZM round-trips**, and none can, because a restore that re-executes commands
necessarily re-stamps wall-clock fields. So either the code is wrong everywhere, or the contract
is asking the wrong question of some fields. This ADR says: **it is asking the wrong question of
some fields, and exactly which ones must be written down rather than assumed.**

## Decision

Element fields split into three classes, and the round-trip contract applies differently to each.

### 1. AUTHORITATIVE — must survive byte-for-byte. No tolerance, ever.

`id` · `ifcData.guid` · every authored geometric and parametric field (positions, dimensions,
types, materials, host references, level references) · authored provenance
(`detectionMethod: 'manual-*'`).

**`ifcData.guid` is in this class and the placement is load-bearing**: it is the IFC round-trip
join key. A re-minted GUID silently breaks the correspondence between a PRYZM element and its
counterpart in every previously exported IFC file — and it breaks it *invisibly*, because both
files still open.

### 2. DERIVED-BUT-CAUSAL — may differ across a restore; may NOT differ across an undo.

`metadata.version` · `wall._renderVersion` · any monotonic counter.

These are legitimately recomputed on reload. But **undo is a claim about returning to a prior
state**, and a counter that ratchets through an undo/redo cycle means the model is not the same
model. The certification's `+2 per undo cycle` is therefore a **real defect**, not a tolerance
candidate, and it stays red until fixed.

### 3. DERIVED-INCIDENTAL — may differ across a restore AND an undo, and is excluded from the
comparator by an explicit, enumerated rule.

`metadata.createdAt` · `metadata.modifiedAt` · any wall-clock timestamp not used as a key.

**These are the only fields this ADR moves off the failure list**, and they move by *naming*, not
by loosening. The comparator gains an enumerated exclusion list — never a pattern, never a
prefix-match, never "ignore fields ending in `At`" — so adding a field to it is a visible diff in
review.

## Consequences

**Immediate, and the reason this ADR exists:** with class 3 enumerated, the certification's F-1
cluster resolves into two honest outcomes instead of one undifferentiated wall of red — the
timestamp divergences become documented and non-blocking, while the GUID (class 1) and the
counter ratchet (class 2) **stay red and become the actual work**. The score stops being dominated
by noise, and what remains is real.

**Redo must become patch-based, not re-execution.**
> ⚠ **OVERTURNED BY MEASUREMENT, 2026-08-11 (same day).** The C3/C4 implementation measured the
> actual arithmetic: A=2 → execute→3 (=B) → undo→2 → re-execute→3 = B **exactly**. The ratchet
> was never in redo — it was in **undo walking the counter forward instead of back**, and redo
> merely inherited the drift. Once undo restores the exact counter (`restoreRenderVersion`,
> commit `8552de14`), re-execution satisfies class 2 with no patch layer, proven by 15/15 redo
> rows byte-equal on State B with **zero** class-2 exclusions. The consequence as originally
> written was wrong; it is preserved here struck-through-in-effect because a governance document
> that silently edits its own predictions cannot be audited. (This is the session's standing
> doctrine applied to its own ADR.)

**A new gate, `check-derived-classification`**: every field on every element schema must be
classifiable, and an unclassified field is a **FAIL, not a default**. The exit-code contract
applies — `2` MISCONFIGURED if the schema cannot be read, never absorbable.

**This ADR does not weaken C13 §2.** It states which fields the byte-compatibility claim is about.
The correct reading of C13 §2 becomes: *authoritative state round-trips byte-for-byte; derived
state round-trips to an equivalent value; incidental state is enumerated and excluded.*

## Alternatives considered

**Carry the timestamps through restore** — makes class 3 unnecessary and satisfies C13 §2
literally. Rejected: `createdAt` would then be a value the loader is obliged to forge on any
element that never had one, and PRYZM already has a named failure of exactly that shape —
provenance **invented on load** at `roomSnapshotUtils.ts:156`. Preserving a real timestamp is
correct; manufacturing one is the bug this repo keeps finding.

**Normalise timestamps inside the comparator without an ADR** — rejected on process grounds. That
is precisely the tolerance-list-written-to-pass this plan forbids, and it would have hidden the
GUID defect inside the same sweep that hid the timestamps.

**Declare everything authoritative and rebuild restore to be patch-based end to end** — the
purest answer, and genuinely correct for redo (class 2 already demands it). Rejected *for restore*
as disproportionate: it rewrites the load path to close a divergence in fields nothing reads.
Reconsider if per-element history (BIM 3.0 provenance) later needs true temporal fidelity.

## Not decided here

Whether `metadata.version` should be persisted at all, versus derived from the command log ·
whether `_renderVersion` belongs on the model rather than on a render-side map (it is arguably
class 4: presentation) · the schema changes for per-element provenance, which are BIM 3.0 §7 work
and deliberately not folded into a BIM 2.0 contract decision.
