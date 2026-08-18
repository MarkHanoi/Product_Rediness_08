# SPEC — Element-integrity convergence: the executable half of C84

> **Stamp**: 2026-08-18 · **Status**: PROPOSED, awaiting founder ratification · **Lane**: Z8
> **Implements**: [C84 — ELEMENT INTEGRITY](../../02-decisions/contracts/C84-ELEMENT-INTEGRITY.md)
> **Decided by**: [ADR-0331](../../02-decisions/adrs/ADR-0331-one-answer-per-question-and-the-decided-loser.md)
> **Evidence**: [DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP](../plans/DUPLICATION-AUDIT-AND-CONVERGENCE-ROADMAP.md)
> **Scope**: what each fix must *do* and how each is *proven*. The audit says what is wrong; the ADR says
> which direction wins; this SPEC says what a PR must contain to close an item.

---

## §0 — The rule that governs every item below

> **No item is closed by a code change. An item is closed by a PROOF that goes from RED to GREEN, watched
> failing first** (STR-03 §12.3 invariant 2 — *ship the probe before the fix*).

Three proof shapes are admissible, and each item names which it uses:

| shape | what it is | when |
|---|---|---|
| **P-EXEC** | dispatch/execute, then read back from the **authoritative** store | any liveness or route claim (C16 CA-21) |
| **P-PARITY** | identical inputs into two implementations, compare outputs numerically | any C84 EI-10(b) equivalence claim |
| **P-RATCHET** | a named, direction-locked gate reading | any census that must not regress |

⛔ **Not admissible:** `result.success === true`; a spy or call count; a patch-pair shape; a read-back
from the same store the handler wrote; a reviewer's inspection of a mapping.

---

## §1 — S1 · Lighting persistence *(LIVE DATA LOSS — highest priority)*

**Defect.** `grep -ci "lighting"` on `packages/persistence-client/src/loader/ProjectSerializer.ts` → **0**;
`grep -in "light"` → 0 matches. Lighting renders (`initBuilders.ts:102, 846`) and exports to GLB.
`ProjectLoader.ts` carries 18 `lighting` hits, so the **load** half exists. **Every light the user places
is destroyed on save/reload.**

**Requirement.** `lightingStore` joins the serializer's authoritative bundle and round-trips.

**Acceptance (P-EXEC).**
1. Create N lights → serialize → clear → load → **N lights present, with identical ids, positions,
   intensities and level assignment.**
2. **Watched RED first**: the same test against HEAD must fail on step 1, reporting 0 of N.
3. **Negative control**: a project with zero lights round-trips to zero, not to an error.

**Also required by C84 EI-1b.** `lightingStore`'s header declares its six consumers. If IFC remains
unsupported, it is declared unsupported — not silent (§S3).

**Risk.** Snapshot-schema change. Loading an OLD snapshot must not throw: absent ⇒ zero lights, which is
the existing forward-compat convention (*absent ⇒ canonical default*).

---

## §2 — S2 · One record per door

**Defect.** Persistence reads standalone `doorStore` + `windowStore`
(`ProjectSerializer.ts:47-48, 704-705`). IFC export reads openings **embedded on the wall record**
(`WindowDoorReader.ts:1,7,12`, wired at `FragmentReader.ts:89` with `wallStore`). **Two records for one
door; nothing measured reconciles them.** This is MT-06 confirmed on the export path.

**Requirement.** **Declare the single authority and delete the loser's write** — C84 EI-9 + §1.4.
MT-06's own words: *"the single authority has never been declared and the loser never deleted."*
⚠ This SPEC does **not** choose which one wins: that is a persistence-format decision with a migration,
and it needs the founder. It specifies what the choosing PR must contain.

**Acceptance (P-EXEC).**
1. Author a door → read it back from **both** representations → assert every field agrees, **or** assert
   that only the declared authority holds it and the other is derived on read.
2. **Watched RED first** against HEAD, with the disagreement printed as a field-level diff.
3. Round-trip: save → load → IFC export → the door appears **once**, in the right wall, at the right
   sill height.

---

## §3 — S3 · Silent absences from IFC become declared refusals

**Defect.** `packages/file-format/src/export/ifc/readers/` has no `CeilingReader`, `FloorReader` or
`LightingReader`. Those elements are **absent from IFC with no refusal and no warning.**

**Requirement.** An element kind with no IFC reader must produce a **declared, user-visible refusal**
naming the kind and the count. STR-03 §12.3 invariant 1: *failure and emptiness are never the same
value.* Writing the readers is the better fix; **the refusal is mandatory either way**, because a future
kind will be added without one.

**Acceptance (P-EXEC).** Export a model containing 1 ceiling, 1 floor and 1 light → the result reports
*"3 elements not exported: ceiling (1), floor (1), lighting (1) — no IFC mapping"*. **Watched RED**:
today the export succeeds silently. **Negative control:** a model of walls only reports no omissions.

---

## §4 — S4 · The curved-miter bake divergence

**Defect.** `§Z8-CURVED-MITER-BAKE-DIVERGENCE` — **max |Δposition| = 9.774 m** on a 5 m-radius mitered
curved wall. Stack A (`CurvedWallLayerBuilder.ts:69-83`) projects the miter plane and writes back into
the corner table the face loops consume; Stack B (`buildCurvedLayer.ts:133-137, 159-165`) projects the
cap quad only and its face loops (`:95-118`) consume unprojected stations.

**Requirement.** Port the corner-table write-back into Stack B. **Do not** "fix" it by loosening the
tolerance — 9.774 m is not a tolerance (C84 §8.f).

**Acceptance (P-PARITY).** `tests/parity/wall/stackAB-miter-parity.test.ts` — delete the `it.fails` and
move `curved-MITERED-both-ends` into `CURVED_CASES`, where it must pass at `TOL = 1e-4`. The harness
**already exists and already fails**, so RED is watched by construction.

**Risk.** `packages/geometry-kernel`, not the `geometry-wall` files other lanes hold. Sequence against
any lane touching the producers.

---

## §5 — S5 · One wall-Y authority

**Defect.** Wall body Y is `level.elevation + slabBaseOffset + wall.baseOffset`
(`WallFragmentBuilder.ts:728`, applied to the group at `:1097`, with `wall.baseOffset` added again
downstream). Hosted leaves compute `elevation + sillHeight + height/2`
(`DoorBuilder.ts:498`, `WindowBuilder.ts:818`) — **`slabBaseOffset` occurrences in `geometry-door/src` +
`geometry-window/src` = 0.** Delta = `slabBaseOffset + 2 × wall.baseOffset`. **LATENT** — nothing
authors either offset non-zero today — but it is why the CSG arm is switched off
(`WallFragmentBuilder.ts:2326-2333` records the same mismatch, observed).

**Requirement.** ONE exported function answering *"what is this wall's world base Y?"*, consumed by the
wall body **and** by every hosted-leaf builder and every opening cutter. C84 EI-9.
**Explicitly NOT required:** deduplicating `WallHoleBodyBuilder` and `MiterPrismBuilder` — they are
mutually exclusive by construction (`WallFragmentBuilder.ts:2301-2307`) and produce bit-identical Y.

**Acceptance (P-EXEC + P-PARITY).**
1. With `wall.baseOffset = 0.15` and `slabBaseOffset = 0.10`: the door leaf's centre-Y and the wall
   body's base-Y derive from the same datum — assert the hole's bottom edge equals the leaf's bottom
   edge within 1 mm. **Watched RED**: today it is out by 350 mm.
2. Re-enable the CSG arm behind its flag and assert the cut reaches the opening's lower edge.
3. **Non-regression:** at `baseOffset = 0`, every existing wall test is byte-identical.

**⛔ Sequencing.** `packages/geometry-wall` — lanes Z1/Z2/Z4 are live there. **Patch plan to the
orchestrator; this lane does not edit it.**

---

## §6 — S6 · Constant-table convergence

| item | defect | acceptance (P-EXEC) |
|---|---|---|
| **colour names** | 6 tables; `black` = `#333333` (`QueryEngine.ts:1139`) vs `#000000` (5 others); `green` = `#008000` (`PropertyRenderer.ts:209`) vs `#00ff00` | one table (`colorRef.ts`); a test resolves every name through **every** consumer and asserts one value. Watched RED on `black` and `green` |
| **ElementType union** | 4 unions (30/18/11/11); `ai/types.ts` ≡ `AITypes.ts` byte-for-byte; `CoreElement.ts:86` spells `curtain-wall` where schemas emit `curtainwall` ⇒ `IfcBuildingElementProxy` fallback at `:102` | one union; a test asserts a `curtainwall` element does **not** export as `IfcBuildingElementProxy`. Watched RED |
| **style aliases** | `rustic` → mediterranean (`styleFinish.ts:246`) vs farmhouse (`StyleRegistry.ts:283`) | one alias map; a test asserts furniture finish and glazing bias resolve one brief word to one style |
| **material id→hex ×3** | in agreement, held by a comment (`finishRef.ts:14`) | C84 EI-8a — a test comparing all 15 values to the master. No code change; the **pin** is the deliverable |

---

## §7 — S7 · The store-convergence programme

**S7.1 — Probe one verb (P-EXEC, no wiring).** Dispatch a single UNKNOWN verb, read back from the
authoritative store, record the result. **Proof:** `check-verb-liveness` PROVEN **7 → 8**, by name
(GROW-ONLY ratchet — it fails if a verb drops out *and* if one is proven without being listed).

**S7.2 — Forward patch through `elementUndoStoreAdapter` (ADR-0331 §D3).** The adapter already gives
every legacy geometry store an `applyPatch` surface across 13 store types and already consumes exactly
the patch shape plugin handlers emit — **on the undo side only**. Route the forward patch through it so
`affectedStores: ['wall']` names one object for a command's whole lifecycle.
**Mandatory guards:** opt-in per verb; only verbs the register reads UNKNOWN; **creates excluded** until
their `.created` bridge is retired in the same commit; hosted elements and levels keep the legacy route.
**Proof:** PROVEN rises per PR; a double-write control asserts exactly one store mutation per dispatch.

**S7.3 — Retire the losing plugin handler per converged verb (§D2).** Only after S7.2 proves the route.
**Proof:** the verb leaves UNKNOWN in the regenerated register.

**S7.4 — Declare every DTO store a shadow (C84 EI-5a).** ⛔ **Do not purge, do not mirror.** Each
`plugins/*/src/store.ts` header names the winner, states reader/writer counts, gives the retirement
path — the `plugins/rooms/src/store.ts:1-29` form. **Proof:** a gate asserting every plugin `store.ts`
carries the declaration. **This is sound only while the reader count is zero** — re-run the census on the
**bus axis** as well as the import axis (C84 §3.5.1).

---

## §8 — S8 · The gates C84 is owed

| gate | asserts | shape |
|---|---|---|
| `check-bridge-completeness` | every family with a `.created` bridge declares, at the bridge, the mutation verbs it does **not** carry | P-RATCHET, shrink-only |
| `check-emitter-has-consumer` | no event is emitted with zero subscribers, or the emitter carries an inline reason | hard-0 after the 9 are resolved |
| `check-constant-copy-pinned` | every licensed transcribed table has a test comparing it to its master | hard-0 |
| `check-trigger-has-dispatcher` | every cascade/consequence trigger names a proven production dispatcher, or declares itself dormant | P-RATCHET |
| `check-one-route-per-intent` | no second UI surface constructs a command for an intent another surface dispatches as a verb | P-RATCHET |
| `check-verb-register` **fix** | `TYPE_DECL_RE` discovers `{ type: '…'` — SHADOWED reads **1**, not 0 | correctness fix, gate-only |

---

## §9 — Order, and what blocks what

```
S1 lighting persistence ─┐
S3 IFC refusals ─────────┼── independent, land in any order, no geometry
S6 constant tables ──────┘

S4 curved-miter parity ── independent (geometry-kernel only)

S8 check-verb-register fix ── MUST precede S7 (every S7 step is graded by it)
        └── S7.1 probe ── S7.2 forward patch ── S7.3 retire ── S7.4 declare

S2 one door record ── needs a founder decision on which representation wins
S5 one wall-Y authority ── needs orchestrator sequencing vs Z1/Z2/Z4

ADR-0331 §D5 "what is Stack B for?" ── BLOCKS every deletion in geometry-kernel
                                        and plugins/*/committer
```

**Nothing in `packages/geometry-kernel/src/producers/` or `plugins/*/src/committer/` may be deleted
until §D5 is decided** (C84 §3.5.2): an editor-only importer census reads all 26 producers as dead, and the
bake worker calls them.

---

## §10 — What this SPEC deliberately does NOT specify

- **Which door representation wins** (S2) — a persistence-format decision with a migration.
- **What Stack B is for** (ADR-0331 §D5) — a product decision.
- **Whether the eleven unread `.created` bridge bodies are lossy** — `initTools.ts:1059, 1260, 1408,
  1511, 1591, 1636, 1708, 1773, 1824, 1967, 2031`. Only the handrail bridge was read in full. **They are
  NOT clean; they are unmeasured**, and a dedicated lane is sweeping them for all four handrail shapes —
  silent truncation, a constant-ternary dead branch, an authored value written to an ignored field, and a
  field that never crosses the bridge.
- **Plan-view store authority per family** — unmeasured for every family.
- **Whether a sloped railing should exist at all** — the capability is authored twice
  (`StairRailingBuilder.ts:1127-1131` live-but-stair-only; `produceHandrail` dead) and reachable zero
  times from the handrail family. That is a product question before it is an engineering one.
