# ADR-0370 — An adaptive component is its OWN KIND, and stage 1 does NOT re-solve

- **Status:** ACCEPTED (the two decisions) · PROPOSED (the build in C107 §11, costed, not built)
- **Date:** 2026-08-24
- **Lane:** ADAPTIVE34 · **Issue:** [L-10660..L-10665](../../04-reference/ISSUE-LOG.md)
- **Ratifies:** [C107 — Element: Adaptive Component](../contracts/C107-ELEMENT-ADAPTIVE-COMPONENT.md)
- **Governed by:** `C84` (element integrity — §6's twelve sections) · `C11` (creation pipeline) ·
  `C16` (command authoring) · `C67`+`C68` (chat onboarding) · `C106` (the host precedent)
- **Artefact:** `apps/editor/src/engine/views/plantools/__tests__/svpSnapMetadataReachesHandler.spec.ts`
  (5 arms, pointer layer, red at the pre-fix tree)

---

## 1. Context — the founder's mandate, and its correction

> *"I want a new category under a new tab: like ARCHITECTURE — STRUCTURE — ADAPTIVE COMPONENTS.
> This is a flexible adaptive element. **I define the points from walls, slabs and core systems
> and it creates a 'wall'** which I can then customise and create layers. This can be done in plan
> view / 3D view etc. The goal is to create elements as I did, quickly."*

Then, the same day:

> *"the adaptive component **doesn't need to become a wall afterwards — not for now**"*

He has asked twice why it is not in the UI and why there is no contract. ⛔ **It was never built
and never contracted. That is the honest state.** It is absent, not unreachable — C107 §0.1
measures the absence across all four C84 §3.5.1 axes rather than asserting it, because this
repository's dominant failure mode is the opposite one.

---

## 2. Decision 1 — it is its own element kind, and does NOT convert to a wall

**ACCEPTED.**

An earlier lane brief chose option **(b)**: *a generator that consumes points and emits ordinary
walls*, on the strength of the founder's original phrase *"it creates a 'wall' which I can then
customise and create layers"*. The reasoning was sound — (b) is dramatically cheaper, inherits
every wall capability free, and cannot regress the wall engine.

⛔ **The founder overruled it.** So the record read correctly is: *"I define the points … and it
creates a [surface] which I can then customise and create layers."* **Customisable and layerable —
and it stays an adaptive component.**

### 2.1 What was rejected, and why it is recorded rather than deleted

- **(b) wall-emitting generator** — rejected by founder instruction. ⚠ **Not rejected on merit,
  and "not for now" is a DEFERRAL.** C107 §12 R-2 therefore requires the record be shaped so a
  later `adaptiveComponent → wall` verb is **additive**. Nothing may assume it never converts.
- **(a-full) the Revit adaptive family** — UV-driven panels on divided surfaces, nested adaptive
  families, flexed rigs. Rejected as out of scope: it is the `.agents/` "Phase 3 façade systems"
  item, scoped there at **8–10 engineer-weeks**. C107 §12 R-3.
- **folding it into `packages/family-runtime`** — rejected on measurement. That system's placement
  contract is `FamilyParameterKind = 'type' | 'instance'` with expression-driven parameters, and
  grepping `adaptive|point-based|pointBased|placementPoint|host point|by point` across
  `packages/family-runtime/src`, `apps/component-editor/src` and `SPEC-FAMILY-EDITOR.md` returns
  **zero hits**. ⭐ **Point-driven and parameter-driven are siblings; neither subsumes the other.**

---

## 3. Decision 2 — ⛔ stage 1 captures its points ONCE and does NOT re-solve

**ACCEPTED, and this is the decision that needed a measurement rather than a preference.**

The question put to this lane was explicit: at stage 1, is *adaptive* —

- **(i)** points captured ONCE at authoring — a fast way to draw a custom element, no live link; or
- **(ii)** points held as LIVE REFERENCES that re-solve when the host wall or slab moves?

**(ii) is what the word means and is what makes the feature valuable.** It is also the expensive
half. The decision is **(i)** — and the reason is not cost.

### 3.1 ⭐⭐ THE MEASUREMENT: the plan surface cannot say WHAT a point snapped to

*"I define the points from walls, slabs and core systems"* requires the authoring gesture to learn
**which element** each point came from. Measured at `f159ed7a`, the two drawing surfaces are
**separate snap systems** and they answer that question differently:

| | 3-D — `SnapManager` (`packages/snapping`) | PLAN — `PlanSnapEngine` (`core-app-model/src/views/`) |
|---|---|---|
| element identity on a candidate | ⭐ `sourceId`, `sourceType`, `levelId`, `levelScope`, `metadata` | ⛔ `sourceId` for **grids only** |
| wall snap | `WallSnapProvider` → `sourceType: 'wall'` + `levelId` | endpoint/midpoint/perpendicular — **no id** |
| slab snap | `SlabSnapProvider` → `sourceType` + `levelId` | **no id** |

`PlanSnapEngine` constructs **eleven** snap candidates. **Exactly two carry a `sourceId`** —
`:461` `grid-line` and `:475` `grid-intersection`. The nine that come from real building geometry
carry none: `endpoint` (`:263`, `:267`, `:367`), `midpoint` (`:280`), `perpendicular` (`:386`,
`:422`), `nearest` (`:432`), `intersection` (`:444`).

⭐ **The engine walks the wall to compute the endpoint and then discards which wall it was.**

**Therefore a parametric anchor — `(hostId, segmentIndex, t, offset)`, the exact device
[C106 §3.2](../contracts/C106-ELEMENT-CONSTRUCTION-BOUNDARY-LINE.md) already proved out — cannot be
stored from a plan-view gesture. The host id never arrives.** In 3-D it can.

### 3.2 ⛔ Why "ship (ii) in 3-D only" was rejected

The founder requires **both** surfaces — *"This can be done in plan view / 3D view etc."*

Shipping live references in 3-D only produces a family whose **two creation paths write
structurally different records**: a 3-D-authored component follows its host, a plan-authored one
cannot. That is C11's signature failure and this repo has hit it **eight** times — L-239 (wall
layers) · L-240 (floor-finish inner face) · L-243 (stair config) · L-246 (the plan cut) · L-251
(the mitre) · L-255 (the finish modal) · L-260 (the door) · and the AUTO mode gate recorded in
`elementCreationMatrix.ts`'s own header.

⭐ **The cure is always the same, and C107 adopts it in advance rather than after the eighth
repeat: resolve the reference ONCE, BELOW the tools, so plan, 3-D, batch and AI inherit one
truth.** Concretely: **`PlanSnapEngine` must carry identity BEFORE any live-reference behaviour
ships** — C107 §11 **D-5**, which **gates D-6**.

⚠ **And the alternative is worse than waiting**: a plan gesture that fabricated a host id would
write **false provenance**, which C106 §3.5-b already refused for exactly this reason.

### 3.3 The honesty clause

⛔ **Stage 1 does not adapt, and the name says it does.** C107 §0.2-a makes this binding: the UI
copy, palette tooltip and property panel **MUST NOT** claim the element follows its references
until D-6 lands. A family named for a behaviour it does not have is the naming-vs-behaviour defect
this repository keeps producing; disclosing it costs a sentence.

### 3.4 What (ii) costs, stated so the deferral is priced

| step | work | est. |
|---|---|---|
| **D-5** | `PlanSnapEngine` carries `sourceId` + `sourceType` on all 9 non-grid candidates; both overlays forward them | **M** |
| **D-6a** | reference records become parametric anchors (C106 §3.2 model) | M |
| **D-6b** | host-move cascade — ONE undo via `STRUCTURAL_CASCADE`, ⛔ **not** `CompositeCommand` (L-2401), `landed === attempted` | **L** |
| **D-6c** | a propagate/refuse table with **no silent cell** — C106 §3.3's 28 rows are the precedent | M |

⚠ **The wall engine spent this same session proving how hard host-following is**: `f159ed7a`
records a 2 m drag moving an untouched wall **14.14 m** while the cascade reported *"0 refused"* —
the success criterion had no term for distance. **That is the class of defect D-6 would be
entering.** Deferring it behind D-5 is not timidity; it is sequencing.

---

## 4. ⭐ What shipped tonight, and what did not

**SHIPPED — C107 §2.4 / D-0, L-10660.** `SvpPlanToolOverlay` built the `WorldPoint` handed to an
armed handler at two sites — `:627` (hover) and `:778` (`_toWorld`, the CLICK path) — and **both
discarded `snapType` and `sourceId`**, while `PlanViewToolOverlay._toWorld` carried both.

Consequence: `isStrongSnap(pt)` was **permanently false in the split pane**. Its only consumer,
`WallPlanToolHandler`, guards **three** branches with it (`:733`, `:750`, `:758`) — all three are
**L-935's fix**, a founder-reported production defect whose committed end point landed **636 mm**
from where he clicked. ⛔ **L-935 was fixed in the main plan view and left live in the split pane,
which is the founder's own working layout.** The snap was **drawn and not delivered**: the
indicator and tooltip rendered from `_lastSnapInfo` while the committed geometry obeyed ortho.

⭐ **The shape is L-73 one layer down.** `planToolHandlerRegistry` unified the handler **SET**
across both plan surfaces "by construction, so it can never drift again", and it did. **What it
never unified is the CONTEXT those handlers are handed.**

**NOT SHIPPED — the element itself.** C107 §11 D-1…D-10 are a costed BUILD. ⛔ **No palette row, no
rail section and no tool handler were added**, deliberately: an eighth rail button that arms
nothing would be the sixteenth built-but-unreachable surface found in this session, and C107 §14
binds the UI change to land **with** D-9, never before.

---

## 5. Consequences

**Positive.** The family has a contract and a ratified decision. One live production defect is
closed and proven. The (i)/(ii) question is answered by measurement, and the answer names the
single prerequisite (D-5) that changes it. The record shape keeps both deferrals — wall conversion
and live re-solve — **additive**.

**Negative, stated plainly.** ⚠ **The founder still cannot create an adaptive component.** This ADR
does not close his request; it makes the request buildable and prices it. ⚠ **Stage 1 will not
adapt**, and users must be told so in the UI.

**Open, and it needs him.** ⚠ **"Core systems" is NOT MEASURED** — it is not a term this codebase
defines. Walls and slabs have snap providers; "core systems" does not resolve to anything. **C107
§12 R-5 records it as a question rather than guessing**, and it must be answered before D-5 scopes
which providers gain identity. ⚠ **Row 5 of the rail is a vocabulary split** — he says **MEP**, the
code says **Services** (C107 §14). His call.
