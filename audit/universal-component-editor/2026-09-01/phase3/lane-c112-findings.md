# LANE C112 — findings

**Date:** 2026-09-01 · **Owns:** `docs/02-decisions/contracts/C112-CONNECTORS.md` (410 lines) +
`index-row-C112.txt`. **Did not commit. Did not touch `README.md`.** No file outside the two above
was modified.

---

## 1 — THE GATING QUESTION: is "the one true greenfield subsystem" actually greenfield?

The brief required this be proven **before** writing. It is. Measured 2026-09-01 at HEAD:

| Probe | Result |
|---|---|
| `connector` (case-insensitive, `packages`/`plugins`/`apps`, `.ts`+`.tsx`) | **141 hits, ZERO a building object** |
| `attachmentPoint\|insertionPoint\|anchorPoint\|attachPoint` | **8 hits, ZERO a building object** |
| `\bMEP\b\|\bmep\b` | **115 hits, ZERO an MEP element** |

The 141 `connector` hits are four unrelated senses: NL-grammar connectors (`FloorFinishIntent`,
`WallSideFinishIntent`, `ZeroTokenResolver`), a corridor connector spine (`platePartition.ts`,
`deriveCorridorSpine.ts`, `§CORRIDOR-CONNECTOR`), a radiator part (`ToiletRadiatorBuilder`), and a
SIEM log connector (`entitlements`). The 8 anchor hits are a wall-centreline local in
`WallIntentResolver` and a DOM listener helper in `RoomTool`. `MEP` is a discipline label
(`packages/building-graph/src/discipline.ts` maps `plumbing`/`lighting` → `mep`), furnish-scoring
axis names, and floor-plate zone text.

**Four-axis reachability of the connector subsystem: import/construction 0 · bus verb 0 · build
graph 0 · call 0.** ✅ **The audit §3.3 claim SURVIVES falsification. I contracted, I did not rival.**

## 2 — WHAT I FOUND CONNECTOR-SHAPED, AND WHAT I DID WITH IT

Nothing connector-shaped exists as a building object — but **three existing mechanisms already carry
spec §27's axes**, and finding them is what made the contract small rather than large:

| Existing | Carries | Disposition in C112 |
|---|---|---|
| `ReferencePlane` (`packages/file-format/src/family-schema.ts`) — `id`/`origin`/`normal`/`isHost` | **The first FOUR of §27's eight axes, already on disk** | Cited as evidence + **ADR-0376 D1 harvest candidate**. ⛔ **NOT** a dependency — see finding 5. |
| Wall `Opening` (`packages/schemas/src/elements/Wall.ts`) — `offset`, `sillHeight`, `width`, `height` | **position + the demanded void**, in metres | §2.3 / §2.5 — the connector reuses it and is **forbidden from minting a second copy** |
| C15 §2.1 host-frame rule | **orientation** | §2.3 — lifted by reference, quoted once |

⭐ **This produced the contract's central ruling (§2.3): a host-resolved connector stores NEITHER
position NOR orientation.** Both are already authoritative elsewhere, so storing them is §76 gate B
(a duplicate source of truth) and C84 EI-9. It is C106 §3.2's proven *THE ANCHOR IS PARAMETRIC*
device applied one subsystem over. **This is the single biggest restraint win**: it removes two of
the eight axes from the schema entirely rather than specifying them.

## 3 — ⭐ THE KEYING RULE, EXECUTED IN BOTH DIRECTIONS (the falsification control)

The audit asserts the `connectsVia` edge "must be `authoredBy`-keyed from day one". **I did not
transcribe that — I ran it.** Six arms against `SemanticGraphManager` at HEAD:

| Arm | Result |
|---|---|
| 1 — two connectors, **unkeyed** | **1 edge**, both writes returned the **same id** — the collapse is REAL |
| 2 — two connectors, **`authoredBy`-keyed** | **2 edges**, distinct ids |
| 3 — re-write connector 1 | **same id**, still 2 edges — idempotency preserved **per connector** |
| 4 — real JSON round-trip | `loaded: 2`, `dropped: 0`, `authoredBy` = `["conn-1","conn-2"]` — **it survives the wire** |
| 5 — re-write after reload | still 2 edges, matched existing — identity intact after reload |
| 6 — **SCRAMBLE CONTROL**: strip `authoredBy` at the wire | a later write **collapsed onto an existing edge** — **the probe CAN fail** |

Arm 6 also **sharpened** the audit's claim. The audit says a lost key "strands the survivor on
delete". Measured: stripping the key does **not** merge already-persisted rows (they keep distinct
ids and both load) — it makes them indistinguishable to every **subsequent write and to delete**.
**The damage is a stranded survivor, not a lost row.** §5 of the contract is built on that sharper
form.

Probe: `<scratchpad>/connector-edge-probe.ts` (kept out of the repo — no code committed).

## 4 — ⛔ A MEASURED GAP THE AUDIT DID NOT REPORT: delete cannot find the edge

`SemanticGraphManager` maintains **exactly two indices — `_bySource` and `_byTarget`. There is no
index on `authoredBy`**, and `removeAllRelationshipsForElement` collects from those two only.

**A connector is not an endpoint of its own edge. Therefore deleting the connector does not remove
its edge.** And the naive repair is worse: purging by endpoint id tears down every *other*
connector's edge between the same pair (C71 §5.6 over-purge).

**Resolution — reuse, not invention:** C112 §5 mandates the shipped
`§FIX-STAIR-DELETE-LEAVES-GRAPH-EDGES` edge-wise purge from `DeleteStairCommand`, which solves this
exact shape one family over. **This is why the connector id is required in BOTH `authoredBy` and
`metadata`** — `authoredBy` keeps the edges apart at write time, `metadata` is what the purge matches
at delete time. Dropping either breaks a different half.

## 5 — ⚠ A STALE COMMENT THAT WOULD HAVE CAUSED A RIVAL BUILD (reported, NOT fixed — out of lane)

**`packages/command-registry/src/stair/DeleteStairCommand.ts`**, the `§UPSTREAM-LIMITATION` docblock,
still reads:

> *"NOT fixed here, asserted in `stairDeleteLeavesGraphEdges.test.ts`: `addRelationship()` is
> idempotent on `(sourceId, targetId, type)` and IGNORES metadata, so two stairs joining the SAME
> level pair collapse onto ONE `connectedByStair` edge — the second create is a silent no-op."*

**The test file it cites records the OPPOSITE**: `§UPSTREAM-LIMITATION — **CLOSED** by
§FIX-CONNECTEDBY-EDGE-KEYING`, with an arm named *"two stairs on one level pair now produce TWO
DISTINCT edge pairs — the collapse is closed"* — and `CreateStairCommand` does pass
`authoredBy: stairId`.

**Class: stale in the PESSIMISTIC direction, pointing at a test that contradicts it.** Its opening
mechanism sentence (*"`addRelationship` … IGNORES metadata"*) is still true; the consequence it draws
is false. ⛔ **A future connector author reading that docblock would conclude the keying mechanism
does not work and would build a rival** — the exact R1 outcome this phase exists to prevent. It is
recorded in C112 §5 as a warning box so the contract's own reader cannot inherit it.
**Owner: whichever lane owns `packages/command-registry/**`. Not fixed here.**

## 6 — ⚠ `HostingCapability` DOES NOT EXIST — the audit cites it as if it does

The audit's §12 Phase-3 mint/extend table lists C112's extend target as **"C15 (`HostingCapability`)"**.
Measured repo-wide, case-insensitive, all file types, excluding `node_modules`/`.git`:
**`HostingCapability` appears ONLY inside `audit/**` — six hits, all in the audit's own proposal
text. There is no such symbol in the codebase.**

It is a **PROPOSED** object (audit §4.3 row 14), not an existing one. C112 therefore **does not cite
it at all** — citing a proposed symbol as an existing extension point is how C104 ended up deriving
from a phantom C103. **Flagged for lane 3C**, which owns the C15 extension: it is minting
`HostingCapability`, not extending to it.

## 7 — RESTRAINT LEDGER: what I deliberately did NOT write

The brief's central instruction. Every item below was available and refused:

| Refused | Why |
|---|---|
| A `ConnectorSchema` / `packages/schemas/src/connectors/` | Review rule R1. C112 specifies the model the Phase-6C PR's schema must satisfy; it does not supply one |
| Adding `connectsVia` to `RelationshipType` | **C71 §2.6 needs writer + typed reader + rebuild disposition + delete behaviour in ONE PR. A contract is none of the four.** C106 §3.2-b precedent |
| Unparking `servesZone` | C71 §2.5 forbids writer-first; no ADR names a consumer |
| A new gate | Routed to the existing `check-graph-write-coverage.ts` |
| Stored `position` / `orientation` fields | §2.3 — already authoritative in C15 §2.1 + wall `Opening` |
| A 6-member `kind` enum | Opened to `insertion` + `opening` (what the Window slice needs); the other four **PARKED** on the C71 §2.2 precedent |
| `direction` (flow) and full `compatibility` | DEFERRED with a **concrete** trigger — `Plumbing.ts` already has `diameter` + `systemTag`, which is exactly what such a rule matches on |
| A second width/height for the opening | §2.5 — the cut void stays the single authority |
| Any symbol containing `Family` | ADR-0376 D5. Verified: `Family` appears only in the D5 rule statement and in `bakeFamilyInstance`, an existing frozen-legacy symbol |

**Result: 410 lines** — deliberately smaller than the in-production element contracts it sits beside.
Eight of the spec's eight axes are dispositioned; **only four are normative now.**

## 8 — GATE READINGS (foreground, redirected, `$?` read immediately — never piped to `tail`)

**`check-graph-write-coverage.ts`** → **RC=0** · `[0] CLEAN — 0 findings, hard-0, no baseline` ·
C-INV-4 ratchet 0 against a NAMED ledger of 0 · 53 cascade-purge sites. This is the gate C112 §8
names, and §8 also quotes its **own printed blind spots** (*a writer never reached counts as
PRESENT*; *a writer emitting the WRONG edge passes every arm*) to forbid reading its green as
evidence of reachability.

**`check-contract-cited-paths.ts`** → **RC=3, and the breach is NOT mine.** Tight paired measurement
(remove file → run → restore → run, back-to-back to control for concurrent lanes):

```
WITHOUT C112:  110 files ·  arm A 507 (baseline 490) · exempt 10
WITH    C112:  111 files ·  arm A 507 (baseline 490) · exempt 10
```

✅ **My file adds ZERO new unresolved citations.** The 507/490 breach is pre-existing.

> ⚠ **A measurement hazard worth recording.** My **first** reading was 513, then 509, then 508 for
> what should have been identical states. Cause: **this is a shared tree and other lanes were editing
> concurrently** — `git status` showed `C15`, `C25`, `C74` modified and `C110` added mid-run. **A
> single reading of this gate today is not trustworthy; only a tight paired delta is.** My first
> draft did add 4 unresolved paths (`packages/schemas/src/connectors/`, and three cited without their
> `packages/` prefix). ⛔ **I fixed them by citing the REAL paths, not by adding `PLANNED`** — the
> gate's own header calls bulk-`PLANNED` "laundering", and marking a path PLANNED that the contract
> explicitly refuses to create would have been a lie in the file.

**`check-contract-index-equivalence.ts`** → **RC=3, expected transient, clears when the rows land:**

```
ARM A: 20 files with no index row, declared level 18   (C110 and C112 — both awaiting the orchestrator's rows)
ARM D: 1 finding — "C111 — in range, no file, no row, not declared RESERVED"
```

⛔ **ORCHESTRATOR: this gate cannot go green until all three files AND all three rows are present.**
C111's file is not on disk yet, which is what arm D is reporting. Re-measure after applying rows;
do not transcribe this reading.

## 9 — OWED / HANDOFFS

1. **Apply `index-row-C112.txt`** to `README.md` — **and move the RANGE in the same edit** (item 4:
   `C01–C109` → `C01–C112`). The row-and-range rule has already failed six times in that file.
2. **Lane 3C** — `HostingCapability` is being **minted**, not extended to (finding 6).
3. **`packages/command-registry` owner** — the stale `DeleteStairCommand` `§UPSTREAM-LIMITATION`
   docblock (finding 5). Small, and it actively misleads toward a rival build.
4. **`check-contract-cited-paths` is RED at 507/490** from pre-existing debt, un-owned by any lane in
   this phase. Nobody in Phase 3 can turn it green; it should be someone's lane.
