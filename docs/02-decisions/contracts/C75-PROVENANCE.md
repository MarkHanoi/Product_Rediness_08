# C75 — Provenance

> **Stamp**: 2026-08-12 · **Status**: CANONICAL
> **Scope**: the origin of every value the system stores, renders, exports or answers a question with. Owns the five-value provenance vocabulary, the rule that provenance is **recorded where it is known and refused where it is not**, and the per-kind coverage ratchet. Does **not** own confidence scoring (C62), the field-level persistence classification (ADR-0319), or any element's geometry semantics.
> **Key principle**: *The system must never present invented or inferred information as authored truth.* A value whose origin is guessed on load is worse than a missing value, because a missing value is visibly missing and a guessed one is not.
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`. Peers with **C62** (data confidence & UNKNOWN-reason model — owns *how sure* we are; C75 owns *where it came from*, and the two are orthogonal), **C03** (schemas/commands/state — owns the schema package this contract requires new fields in), **C05**/**C47** (persistence + file-format versioning — own the migration a new field triggers), **C58**/**C64** (zoning + envelope compiler — own the refusal-union idiom C75 generalises to elements), **C65** (element type system — owns what an element *is*), **C74** (constraint honesty — the behaviour-side sibling: C74 governs *did the work happen*, C75 governs *where did the value come from*). **ADR-0319** (audit fields are derived, not authored) is the persistence-side sibling — cited, never restated. Supersedes nothing.
> **Gate**: `tools/ga-gate/check-provenance-not-invented.ts`, `tools/ga-gate/check-provenance-coverage.ts`, `tools/ga-gate/check-derived-not-authored.ts` — **all three UNBUILT at stamp time** (§6).
> **Changelog**: 2026-08-12 — created, after a Phase 0 sweep found provenance invented on snapshot load and absent from every element schema.

---

## §0 — Why this contract exists

The sweep expected to find provenance patchy. It found something sharper: provenance is
**rich and disciplined everywhere except the elements**, and in the one element family
that has it, it is **fabricated on load**.

**Finding 1 — provenance is invented at deserialisation.**
`packages/room-topology/src/roomSnapshotUtils.ts:156`:

```ts
detectionMethod: (rawBoundary['detectionMethod'] as any) || 'auto-topology',
```

A snapshot missing the field is loaded **as if topology had detected the boundary**.
`'auto-topology'` is not a neutral placeholder — it is one of the five real members of
`RoomDetectionMethod` (`RoomTypes.ts:100–105`), and it is the one that means *"flood-fill
from the wall graph."* So an unknown origin is silently upgraded to the most authoritative
origin in the union. Two further details make it worse rather than better:

- the `as any` defeats the union at exactly the point it would have caught this;
- the serialised shape declares the field as bare `string` (`roomSnapshotUtils.ts:32`), not
  `RoomDetectionMethod`, so the round-trip has no type-level opinion at all.

**Finding 2 — element schemas carry no provenance whatsoever.**
Measured across `packages/schemas`:

- `originDetail` → **0 hits**
- `derivationStatus` → **0 hits**
- `detectionMethod` → **0 hits**
- every `origin:` in `packages/schemas/src/elements/*` is a geometric `Vec3` — a *point*,
  not a provenance.

So the room / floor / ceiling family is the **only** element-level provenance in the
system, and it does not live in the schema package at all: it lives in
`packages/room-topology` and `packages/core-app-model/src/stores`. The canonical schema
layer — L0, the thing every other layer reads — has no concept of where a value came from.

**Finding 3 — the idioms already exist, in the non-element domains.** These are to be
**copied, not reinvented**:

| Artefact | What it already does right |
|---|---|
| `packages/schemas/src/site/metadata/DataConfidence.ts` (ADR-0280) | confidence + an explicit **UNKNOWN reason**, so "we don't know" is a value with a cause |
| `packages/schemas/src/site/context/heightProfile.ts` | a **mandatory** 0..1 confidence + provenance tier — not optional, so it cannot be skipped |
| `packages/schemas/src/climate/climateProvenance.ts` | per-field source attribution on a computed dataset |
| `packages/schemas/src/provenance/ProvenanceEdge.ts` | provenance as a **graph edge** — derivation is a relationship, not a label |
| `packages/schemas/src/provenance/AIArtefact.ts` | AI output marked as AI output, structurally |
| `packages/schemas/src/site/zoning/LandBasis.ts` | a **branded type that makes a wrong basis unrepresentable** — the strongest form available: not a check, an impossibility |
| `BuildableEnvelope` (C58/C64) | typed determinations plus a **member-per-cause refusal union** — a refusal that says *which* thing was unknown |

The gap is therefore not knowledge. It is that the element core was built before this
vocabulary existed and never retrofitted, so the discipline stops precisely where the
user's own authored model begins.

**Finding 4 — the repair path stamps invented geometry as detected.**
`packages/room-topology/src/RoomDetectionEngine.ts:454` runs `repairToSimplePolygon()` on a
self-intersecting boundary, replacing it with *the largest simple ring* — a polygon the
topology never traced. The room is then written with
`detectionMethod: 'auto-topology'` (`:475`), identical to a room whose boundary was
genuinely flood-filled. The repair is logged to the console and **not** to the model. The
sibling refusal form is already written, twenty files away:
`packages/geometry-slab/src/SlabFragmentBuilder.ts:706` (§REFUSE-NONSIMPLE-SLAB-RING,
ADR-0299 §RECOVERY-MUST-REFUSE) refuses rather than emitting *"geometry that is wrong but
plausible enough to be read as a modelling quirk."* **The fix is writing the field.** Not
a redesign — a value.

> **§0.1 — the shape of the harm.** Every one of these produces a value the user cannot
> distinguish from one they authored. Provenance is not metadata garnish: it is the only
> thing that lets a user, an exporter, or a regeneration pass know which values are theirs
> and which are ours. Losing it is how a generated guess ends up in an IFC export as a
> surveyed fact.

---

## §1 — The vocabulary

> **§1.1 — MUST.** Every provenance-bearing value carries exactly one of **five** values.
> These are **not** a quality ranking; they are five different statements about *who or
> what produced the value*.
>
> - **AUTHORED** — a human stated it. A user drew the polygon, typed the height, chose the
>   type. The only value the system may never invent.
> - **OBSERVED** — read from an external source of record, unmodified. An IFC import, a
>   cadastral parcel, a DXF layer. The system did not compute it; it received it.
> - **COMPUTED** — derived deterministically from inputs the system holds, by a rule that
>   would produce the same output again. Topology detection, a slab from a boundary, a
>   quantity takeoff.
> - **INFERRED** — produced by a non-deterministic or judgement-bearing process: AI
>   generation, heuristic repair, a defaulted assumption. **Plausible, not entailed.**
> - **REGENERATED** — previously one of the above, then re-derived by a later pass that
>   may have overwritten an earlier value. Carries what it replaced.

> **§1.2 — MUST NOT.** The five values may not be collapsed, aliased, or extended per
> package. In particular **COMPUTED and INFERRED are never merged**: the distinction
> between *entailed by the inputs* and *plausibly guessed from them* is the entire subject
> of this contract, and Finding 4 is exactly that merge happening in code.

> **§1.3 — MUST.** Provenance is **orthogonal to confidence** (C62). A value may be
> OBSERVED with low confidence, or COMPUTED with high. A single field may not encode both,
> and C75 does not redefine, wrap, or duplicate anything C62 owns.

> **§1.4 — MUST. UNKNOWN is a value, not a blank.** A value whose origin is genuinely not
> known records that fact **with a reason**, in the ADR-0280 / `DataConfidence` idiom.
> **Failure and emptiness are never the same value** (§CONTEXT-DATA-HONESTY, C69 §2.2). An
> absent provenance field must never be *read as* any of the five.

---

## §2 — The binding rules

> **§2.1 — MUST NOT. No code path stamps an origin it did not observe.** This is the whole
> contract in one line, and `roomSnapshotUtils.ts:156` is its canonical violation. A
> deserialiser reading a snapshot that lacks provenance knows exactly one thing — that the
> snapshot lacks provenance — and that is what it must record (§1.4). It may not supply a
> member of the union as a default.

> **§2.2 — MUST. A default is INFERRED, and says so.** Where a value must be supplied for
> the model to be usable, the supplied value is **INFERRED**, never AUTHORED and never
> COMPUTED. A default that presents as authored is indistinguishable from a user decision
> and will be exported as one.

> **§2.3 — MUST. Repair, healing and recovery record what they did.** Any pass that
> substitutes geometry or a value the system did not derive from its stated inputs writes
> **INFERRED** plus the reason. `RoomDetectionEngine.ts:454` currently logs to the console
> and writes `'auto-topology'` to the model; the console is not the model. Where the
> substitution cannot be recorded, the correct behaviour is the `SlabFragmentBuilder.ts:706`
> form: **refuse**.

> **§2.4 — MUST. Provenance belongs in the schema package.** New provenance fields land in
> `packages/schemas` — the L0 layer every consumer already reads — not in a store, a
> topology package, or a serialiser. The current arrangement, where the sole element
> provenance lives outside `packages/schemas` entirely, is why exporters, the renderer and
> the AI host cannot see it.

> **§2.5 — MUST. Backward compatibility is a requirement, not an afterthought.** Every new
> provenance field is **optional with a default that parses existing snapshots
> unchanged** — and that default is `UNKNOWN`-with-reason (§1.4), *never* a member of the
> five. This rule and §2.1 are the same rule: the migration path must not become a second
> site that invents provenance. Adding a field is governed by C05/C47.

> **§2.6 — MUST NOT. Provenance may not be widened by a downstream consumer.** A renderer,
> exporter or chat answer may present a value as **at most** as authoritative as its
> recorded provenance. Rendering an INFERRED wall identically to an AUTHORED one is
> permitted; *describing* it as the user's is not.

> **§2.7 — MUST. Regeneration carries what it replaced.** A pass that overwrites an
> AUTHORED value records **REGENERATED** and the prior provenance. Silently overwriting a
> user's decision with a generated one, and leaving no trace, is the most expensive form of
> this defect and the hardest to detect after the fact.

> **§2.8 — prefer unrepresentable over checked.** Where a wrong provenance can be made
> impossible to construct — the `LandBasis` branding idiom — that is preferred to a
> runtime check, which is preferred to a gate, which is preferred to a convention. A
> convention is what `roomSnapshotUtils.ts:156` had.

> **§2.9 — MUST NOT restate ADR-0319.** ADR-0319 classifies persisted fields as
> AUTHORITATIVE / DERIVED-BUT-CAUSAL / DERIVED-INCIDENTAL and owns what persistence must
> round-trip. C75 owns what a value's **origin** is. They are siblings and they intersect;
> where they do, ADR-0319 governs persistence behaviour and C75 governs the origin label.
> Neither may copy the other's vocabulary into itself (C69 §3.2 — a second copy becomes a
> rival list).

---

## §3 — Coverage, per kind

> **§3.1 — MUST.** Coverage is measured and ratcheted **per element kind**, never as a
> repo-wide percentage. A percentage lets a large kind's regression be hidden by a small
> kind's improvement (C69 §7.c).

> **§3.2 — MUST.** The coverage baseline is a **named, shrink-only list checked in both
> directions**: a kind that gains provenance leaves the list in the same commit, or the
> list rots into a record of things that are secretly fine.

> **§3.3 — the measured starting point (2026-08-12).**
>
> | Family | Provenance today |
> |---|---|
> | room / floor / ceiling | `detectionMethod`, **outside `packages/schemas`**, invented on load (§0 Finding 1) |
> | every other element kind | **none** — `originDetail`, `derivationStatus`, `detectionMethod` all 0 hits in `packages/schemas` |
> | site / context / climate / zoning / AI artefacts | rich and disciplined (§0 Finding 3) |
>
> The per-kind enumeration and its ratchet are the gate's output, not this document's
> (C69 §0.1) — **UNPROVEN until `check-provenance-coverage.ts` exists** (§6).

---

## §4 — Anti-patterns

- **§4.a — The `||` default on a union member.** `x['field'] || 'auto-topology'`. §2.1.
- **§4.b — `as any` at a provenance boundary.** It defeats the union at exactly the point
  the union existed to help. §0 Finding 1.
- **§4.c — Logging the substitution instead of recording it.** The console is not the
  model. §2.3.
- **§4.d — Provenance in a store instead of a schema.** Invisible to exporters, renderer
  and AI host. §2.4.
- **§4.e — A required new field.** Breaks every existing snapshot; usually reverted; the
  revert removes provenance rather than fixing the migration. §2.5.
- **§4.f — Merging COMPUTED and INFERRED** because "both are derived". §1.2.
- **§4.g — A repo-wide coverage percentage.** §3.1.
- **§4.h — Reinventing the confidence model.** C62 owns it. §1.3.
- **§4.i — A blank cell for unknown origin.** §1.4.

---

## §5 — What this contract does not decide

Stated so the boundaries are not inferred from silence:

- **How provenance is displayed.** Whether an INFERRED wall is tinted, badged or silent is
  a UI decision, out of scope. §2.6 constrains only *claims*, not pixels.
- **Whether a given kind needs provenance at all.** §3 measures coverage; it does not
  assert that every kind must reach 100%. A kind may be argued out of scope — **in
  writing, on the named list**, never by omission.
- **The export mapping.** How AUTHORED/OBSERVED/COMPUTED/INFERRED/REGENERATED land in IFC
  or DXF is owned by the file-format contracts. **UNPROVEN** — no such mapping exists at
  stamp time, and this is the largest open risk in the contract: provenance that stops at
  the export boundary protects nothing downstream.

---

## §6 — The gates

All three are **UNBUILT at stamp time (2026-08-12)**, stated explicitly so absence is
never inferred from omission.

| Gate | Kind | What it must assert |
|---|---|---|
| `check-provenance-not-invented.ts` | hard | **§2.1.** No code path assigns a member of the five-value union as a fallback for an absent input: no `?? '<member>'`, `\|\| '<member>'`, or defaulted destructure at a deserialisation or import boundary. `roomSnapshotUtils.ts:156` fails this arm today. |
| `check-provenance-coverage.ts` | ratchet, **named baseline** | **§3.** Per element kind, whether a provenance field exists in `packages/schemas` and is populated on every construction path. Shrink-only, checked in both directions (§3.2). |
| `check-derived-not-authored.ts` | hard | **§2.2/§2.6/§2.7.** No path writes AUTHORED for a value the system produced; no consumer presents a value as more authoritative than its record; no overwrite of AUTHORED lands without REGENERATED plus the prior value. |

> **§6.1 — MUST.** Each gate carries an **exit-2 floor** on its own subject discovery
> (C69 §3.5). A scan that reads fewer files than its floor is **misconfigured**, not
> passing.

> **§6.2 — MUST.** Each arm is **negative-tested before it is trusted** — watched failing
> against a planted violation, with the failure text recorded here. Until that record
> exists, the arm is **UNPROVEN** and may not be cited as coverage. C74 §0 is the standing
> evidence for why an untested gate is worse than no gate.

> **§6.3 — what these gates CANNOT see**: **(a) semantic truth** — a path that writes
> OBSERVED while actually computing passes every static arm, because the gates check
> *shape*, not *honesty of authorship*; **(b) runtime provenance** — a value whose origin
> is decided by a branch is invisible to a source scan; **(c) the export boundary** — §5,
> UNPROVEN; **(d) cross-session regeneration** — §2.7's prior-value chain is not verifiable
> statically.

---

## §7 — Exit conditions

1. `roomSnapshotUtils.ts:156` records UNKNOWN-with-reason instead of `'auto-topology'`,
   and the serialised field is typed `RoomDetectionMethod`, not `string` (§2.1, §0
   Finding 1).
2. `RoomDetectionEngine.ts:454`'s repair writes **INFERRED** with its reason, or refuses in
   the `SlabFragmentBuilder.ts:706` form (§2.3).
3. A five-value provenance type exists in `packages/schemas`, built from the §0 Finding 3
   idioms rather than a new invention (§2.4).
4. Every new field is optional-with-`UNKNOWN`-default and existing snapshots parse
   unchanged, verified against a pre-change snapshot (§2.5).
5. All three gates are built, negative-tested, and their hard arms are hard (§6.2).
6. `check-provenance-coverage`'s named baseline reaches its agreed per-kind target, at
   which point it leaves `tools/ga-gate/gate-debt.json`.
7. The export mapping in §5 exists, or its absence is recorded as an accepted limitation
   by name rather than left **UNPROVEN**.
