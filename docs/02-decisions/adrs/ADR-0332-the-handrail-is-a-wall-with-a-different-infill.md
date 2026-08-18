# ADR-0332 — The handrail is a wall with a different infill

- **Status:** ACCEPTED
- **Date:** 2026-08-18
- **Lane:** Z9 · §HANDRAIL-WALL-PARITY
- **Supersedes:** nothing. **Amended by:** nothing.
- **Contracts consulted:** C03 (schemas/commands/state), C11 (element creation pipeline),
  C16 (command authoring), C65 §3.9 (no affordance without an implementation),
  C67 (RAC capability control plane), C68 (element & attribute chat onboarding),
  C73 (geometry determinism & tolerance), C83 §10 (spatial validity).

---

## 1 — Context: the founder's ask

> *"The handrail element is really basic — but it should work exactly like the WALL element:
> its structure, characteristics, physiology… ORTHO, LINEAR, CURVED, BY SLAB… RAKED on demand
> and CURVED on demand… fully parametric… create new types, save them."*

Taken literally, "exactly like the wall" is an **architectural** instruction, not a cosmetic
one. A handrail and a wall are the same object under the skin: a **base line** (straight or
arced), a **height**, a **rake**, a **cross-section**, and a **type** that materialises a named
set of those values into the record. The wall differs only in that its infill is solid and the
handrail's is balusters, glass, or a panel.

The ask therefore resolves to: *reuse the wall's constructions, do not fork them.*

## 2 — The measured starting state (this is the load-bearing part)

Before designing anything this lane measured what already exists. The result changed the plan
twice, and is recorded here because the numbers are the justification.

### 2.1 — There are TWO rival handrail models, and only one is live

| | Pipeline A — **LIVE** | Pipeline B — dormant |
|---|---|---|
| Type | `HandrailData` — `packages/core-app-model/src/stores/HandrailTypes.ts` | `Handrail` zod — `packages/schemas/src/elements/Handrail.ts` |
| Shape | `baseLine` (2 pts) · `thickness` · `fillType` · `baluster*` · `railStructure` | `path` (polyline) · `shape` · `diameter` |
| Builder | `packages/geometry-stair/src/HandrailFragmentBuilder.ts` | `packages/geometry-kernel/src/producers/handrail.ts` |
| Store | `core-app-model/HandrailStore` | `plugins/handrail/src/store.ts` |
| Commands | `command-registry/src/handrails/*` (`CommandType.CREATE_HANDRAIL`) | bus verbs `handrail.create` / `setPath` / `setShape` |
| Reached by the editor? | **YES** — `initBuilders.ts:876`, `initTools.ts`, `HandrailModePicker` | **NO** production call site found |

The bus verbs named in the brief (`handrail.setPath`, `handrail.setShape`) belong to **Pipeline
B** and operate on a DTO the live builder never sees. `HandrailTool.ts:158` fires
`bus.executeCommand('handrail.create', {})` with an **empty payload** as fire-and-forget
telemetry, then does the real work through `commandManager.execute(new CreateHandrailCommand(…))`.

**DECISION: build on Pipeline A.** It is the one the user's screen is drawn from. Pipeline B is
left untouched — it is not deleted here because deleting it is a separate, larger decision with
its own parity-test surface (`tests/parity/handrail/`), and this lane will not mint a
half-removal.

### 2.2 — The reachability audit (the deliverable table)

For every field the brief listed, measured three ways: does the **builder** read it, can the
**user** set it, does **chat** reach it.

"User can set" means through the **property panel or the creation tool** — the surfaces the
founder means by "the UI". "Chat reaches" was measured against `ChatCapabilityRegistry` and
traced through to the store write, not merely to a declared capability.

| `HandrailData` field | Builder reads? | User can set? | Chat reaches? |
|---|---|---|---|
| `baseLine` | **YES** `HandrailFragmentBuilder.ts:136` | YES — 2-click tool; `handrail.moveBaseLine` | **NO** — class `B_GEOMETRY_EDIT`, blocked on sub-entity reference resolution |
| `height` | **YES** `:222,229,237,246,252,301` | YES — panel + type | **NO** — handrail absent from `DimensionFamilies` |
| `thickness` | **PARTIAL** `:226` — *only* the `rectangular` rail branch; ignored when `railProfile==='round'` | YES — panel + type | **NO** — same |
| `baseOffset` | **YES** `:145` | YES — panel + type | **YES** — `set-base-offset` |
| `materialColor` | **YES** `:220,227,255` | YES — panel + type | **NO** — `handrail.updateColor` refuses: *"not connected to chat yet"* |
| `materialId` | **NO** — no material-library lookup exists | YES (writes a field nothing reads) | NO — `handrail.setMaterial` recorded DEAD |
| `fillType` | **PARTIAL** `:235` glass, `:249` baluster. **`'panel'` and `'open'` build NOTHING** | YES — type swap only | NO |
| `railProfile` | **YES** `:213` | YES — type swap only | NO |
| `railDiameter` | **YES** `:217` (round only) | YES — type swap only | NO |
| `postSpacing` | **YES** `:338` | YES — type swap only | NO |
| `balusterSpacing` | **YES** `:250` | **NO** — absent from `HandrailTypeDefinition` *and* `UpdateHandrailPayload` *and* the panel descriptor | **YES** — `set-baluster-spacing` → `element.updateParameters` → generic merge (`UpdateElementParameterCommand.ts:515`) → `bim-handrail-updated` |
| `balusterShape` | **YES** `:253` | **NO** — same | NO |
| `balusterWidth` | **YES** `:254` | **NO** — same | **YES** — `set-baluster-width`, same route |
| `railStructure` | **NO** — zero reads repo-wide; declaration only | NO | NO |
| `curve` | **ABSENT from the model** | NO | NO |
| `rakeAngleDeg` | **ABSENT from the model** | NO | NO |

⚠ **The inversion is the headline.** `balusterSpacing` and `balusterWidth` are the *only* two
parametric fields chat can drive, and they are exactly the two the **property panel cannot**.
A founder who types *"set the baluster spacing to 100mm"* gets a correct result; the same
founder looking for the control in the panel finds nothing. That is the reverse of the usual
authored-but-unwired shape and it means the cheapest, highest-value fix in this lane is a panel
widening, not a new capability.

**Three distinct defect classes fall out, and they need different fixes:**

1. **Read-but-unauthorable** (`balusterSpacing`, `balusterShape`, `balusterWidth`) — the builder
   already draws them correctly; nothing can set them, so they are pinned to hardcoded defaults
   (`0.11`, `'rectangular'`, `0.02`). **This is the cheapest win in the lane** and the brief
   predicted it exactly. Fix = widen `HandrailTypeDefinition` and `UpdateHandrailPayload`.
2. **Authorable-but-unread** (`railStructure`, `materialId`, `fillType:'panel'`) — the inverse,
   and the one C65 §3.9 forbids. A `fillType` of `'panel'` is selectable today and produces a
   handrail with **no infill at all, silently**. Fix = implement, or refuse.
3. **Absent** (`curve`, `rakeAngleDeg`) — genuinely new capability.

### 2.3 — A pre-existing persistence data-loss bug, found while measuring

`ProjectSerializer.serializeHandrail` (`packages/persistence-client/src/loader/ProjectSerializer.ts:607`)
is an **allowlist** that writes only `id, type, levelId, parentId, baseLine, height, thickness,
baseOffset, materialId, materialColor, properties, ifcData`.

`ProjectLoader` (`:743`) then rebuilds each handrail passing only `id, start, end, height,
thickness, levelId, baseOffset, ifcGuid`.

Therefore **`fillType`, `railProfile`, `railDiameter`, `postSpacing` and `materialColor` are
destroyed by a save/reload round-trip today.** A Glass Guardrail reloads as the
`CreateHandrailCommand` default — `fillType: 'baluster'`, no profile, no diameter, no spacing.
This is not caused by this lane's feature; it is caused by an allowlist that was never widened
when those fields were added. It is fixed here because the founder's control *"a saved custom
type round-trips through persistence"* is unprovable while it stands, and because every field
this ADR adds would land in the same hole.

### 2.4 — Custom types cannot be created

`handrailTypeStore.add()` exists (`HandrailTypeStore.ts:130`) and **has no production caller** —
measured across `packages/`, `apps/`, `plugins/`; the only callers are tests. There is no
persistence for custom handrail types either: `ProjectSerializer` persists custom
`wallSystemTypes`, `slabSystemTypes`, `ceilingSystemTypes`, `floorSystemTypes` — and no handrail
types. `HandrailModePicker` is a **type** picker despite its name; it offers the five built-ins
and no way to author a sixth.

### 2.5 — Creation modes

`WallPickerMode = 'linear' | 'ortho' | 'curved' | 'byslab'` (`apps/editor/src/ui/WallModePicker.ts:25`)
— precisely the founder's list. `HandrailTool` is a **two-click straight segment** with no mode
concept at all.

## 3 — Decision

### D1 — Reuse the wall's arc parameterisation. Do not mint a second one.

`packages/geometry-wall/src/WallArcParam.ts` is PURE and **structurally typed**:

```ts
export interface ArcHostWall {
    readonly baseLine: readonly [ArcPointXZ, ArcPointXZ];
    readonly curve?: { control: ArcPointXZ; segments: number } | null;
}
```

A `HandrailData` carrying a `curve` of the same shape **satisfies this interface as-is**. So
`wallCentreline`, `arcFrameAt`, `arcLengthAtPointXZ` and `hostedElementFrame` serve the handrail
with **zero new geometry bodies**. `packages/geometry-stair` already declares
`@pryzm/geometry-wall` as a dependency, so this costs no manifest change and no lockfile churn.

This is deliberate compliance with `check-predicate-canonical` (138/138): a second arc
parameterisation would be a duplicate geometry body and would breach it.

The handrail's `curve` field is declared with the **same shape and the same `segments ≥ 4`
floor** as `WallData.curve`, so the two remain substitutable rather than merely similar.

### D2 — Write a handrail-side rake gate in the wall's SHAPE. Do not edit `WallRake.ts`.

`WallRake.rakeAuthorability` is being edited concurrently by two other lanes. Its header records
why it has exactly one home: *"copy-drift is what caused this bug — the panel refused
rake-given-openings, nothing refused openings-given-rake."*

The instruction there is that **one subject must have one gate**, not that all subjects share one
function. A handrail's refusals are not a wall's:

- a wall refuses rake × **layers** (perpendicular layer thickness) — a handrail has no layers;
- a wall refuses rake × **hosted openings** (C15 vertical carve) — a handrail hosts nothing;
- a handrail must refuse rake × **glass infill**, which a wall has no concept of.

So a shared function would need a union of irrelevant fields and would answer questions about
walls that no handrail can ask. **DECISION: `handrailRakeAuthorability()` lives in its own pure
module, in the same shape (`{ ok, code, reason }`, typed codes, never rejects a vertical
subject), and it IMPORTS the pure trigonometry** (`rakeTopOffset`, `resolveRakeDeg`,
`isVerticalRake`, `RAKE_MIN_DEG`/`RAKE_MAX_DEG`) from `WallRake` rather than restating it. The
*maths* is shared; the *policy* is per-element. **No line of `WallRake.ts` is modified**, so the
two concurrent lanes are not collided with.

### D3 — Refuse what is not built, in writing, at the gate

Per C65 §3.9. This lane implements rake × straight and rake × curved-refusal, and:

- **rake × curve is REFUSED** — the same reason the wall gives: the shear direction is the plan
  normal, which varies along an arc, so one shear vector is correct at exactly one station.
- **rake × glass infill is REFUSED** — the glass panel is a single box swept on the rail axis;
  under a rake it must become a sheared parallelogram, which is not built.
- **`fillType: 'panel'` is IMPLEMENTED** rather than refused — it is a solid infill board, a
  strictly simpler case of the glass panel that is already built, so refusing it would be
  refusing something a two-line change draws correctly.
- **`railStructure` is REFUSED for now** and left declared-but-unread — building an N-layer rail
  stack is a genuine feature (each layer has its own height/profile/thickness/diameter/colour and
  its own junction behaviour), not a wiring gap. It is named in §6 as remaining work rather than
  half-built. **No UI control is shipped for it** — that is the exact failure mode this ADR
  exists to avoid.

### D4 — Widen the authoring surface to what the builder ALREADY draws

`HandrailTypeDefinition` and `UpdateHandrailPayload` both gain `balusterSpacing`,
`balusterShape`, `balusterWidth`. No builder change is needed for these — the builder has read
them since it was written. This is pure reachability.

### D5 — Persistence carries the whole record

`serializeHandrail` stops being a hand-maintained allowlist of a *subset* and carries every
geometric field; `ProjectLoader` passes them back through `CreateHandrailCommand`. Custom
handrail types are persisted and restored using the **same construction** as custom wall system
types (`ProjectSerializer` filters `!isBuiltIn`, `ProjectLoader` re-`add`s by id, skipping
already-present ids), so there is one pattern for custom types across the product.

### D6 — Chat resolves on the ZERO-TOKEN path

Production has no AI upstream (`CF_WORKER_URL` / `ANTHROPIC_API_KEY` unset). A capability that
only an LLM can reach tests green and fails the founder. Handrail attributes are therefore
registered in the same **table-driven** manner as `DimensionFamilies` — one table entry per
attribute, no new resolver arm — so "make the balusters 100mm apart" resolves with no tokens.

## 4 — Consequences

**Good.** The handrail's parametric fields become reachable; curved and raked handrails become
possible using the wall's own proven constructions; a save/reload stops destroying railing
appearance; custom types become authorable and durable.

**Costs, stated honestly.**
- `HandrailData` grows two optional fields. Both are absent-means-legacy (`curve === undefined`
  ⇒ straight; `rakeAngleDeg === undefined` ⇒ 90° vertical), so every existing snapshot loads and
  re-serialises **byte-identically**. This is asserted, not asserted-by-hope.
- The handrail rake gate is a second gate with the same shape as the wall's. That is a
  copy-drift risk and it is accepted deliberately, with the shared trigonometry imported rather
  than copied so that only the *policy* can drift, and the policy is genuinely different.
- Pipeline B remains, unreferenced. Its removal is deferred, not decided.

## 5 — Compliance

- **C03** — new fields are optional with legacy-safe defaults; commands remain the only mutation
  path; undo restores via the existing JSON snapshot, which carries new fields automatically.
- **C11 / C16** — no new command *types* are minted. The existing `CREATE_HANDRAIL` /
  `UPDATE_HANDRAIL` payloads are widened, and validation is added in `canExecute` so an
  unbuildable combination cannot reach the store. This deliberately keeps
  `check-verb-register` / `check-sync-disposition` unchanged.
- **C65 §3.9** — every new authorable field is drawn by the builder; every combination that is
  not drawn is refused with a typed code and a human-readable reason.
- **C73** — no new geometry body; the arc is sampled at the host's own `segments`, so the
  station maths and the built polyline are the same polyline by construction.
- **C83 §10** — refusals name both the subject and the reason.

## 6 — What is NOT done (named, not hidden)

1. **`railStructure` multi-layer rail stacks** — declared, unread, no UI. §3 D3.
2. **`materialId` → material library** — the builder has no catalogue lookup; only
   `materialColor` is honoured. Unchanged by this lane.
3. **`byslab` creation mode** — the wall derives a path from a slab boundary; the handrail
   equivalent (rail around a slab edge) needs an edge-selection interaction that does not exist.
4. **Pipeline B removal.**
5. **`thickness` under `railProfile: 'round'`** — still ignored; the round rail is driven by
   `railDiameter` alone.
