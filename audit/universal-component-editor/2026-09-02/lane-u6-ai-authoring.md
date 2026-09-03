# LANE U6 — AI-ASSISTED COMPONENT AUTHORING — findings

**Lane:** U6 · **Date:** 2026-09-03 · **HEAD at start:** `dc942d01` (branch `main`).
**Authority:** `audit/universal-component-editor/2026-09-02/UIUX-PLAN.md` §U6 · ADR-0324 · ADR-0376
D4/D5/D9 · C110 §4.2/§4.4 · C111 §4.1 · C16 CA-18/CA-21 · C83 §4.3 · §76 gate D · audit R1.
**Rule obeyed:** no commit; schemas frozen; harvested the old app's verb SCHEMAS as data, never wired
its runtime; consumed U0/U1/U2/U3 seams, added the chat surfaces.

---

## §0 — THE DECISIVE FINDING (measured, not assumed) — and what it forces

The respawn brief flagged *"the resolver case-arm ratchet … is the decisive question."* It is, and the
measurement settles the whole architecture:

- **`check-chat-capability-coverage` is ALREADY `RC=3` on the clean tree** (`dc942d01`, before this
  lane touched anything). Its exceeded ratchets are all UNRELATED to components — `undeclared spatial
  reach 5/2`, `unreachable properties 47/42`, and three `KNOWN_VALUE_SOURCES`-drift failures
  (`set-reveal-direction` "enumeration", `set-window-shape`/`set-door-shape` "opening-shapes") plus
  `add-wall-layer`'s orientation mode. **`RC=0` is not achievable by U6** — those are other lanes'
  debts, and `§RATCHET-EXCEEDED-IS-NEVER-DEBT` forbids absorbing them. U6's obligation is therefore:
  **introduce ZERO new gate regressions.** Verified below.
- **`MAX_RESOLVER_CASE_ARMS` is AT baseline: `30/30`** (`grep -c "^    case '" ZeroTokenResolver.ts` →
  30). A main-chat `ChatCapability` for `component.setInstanceParameter` / `component.swapType` needs a
  hand-written `applySemanticIntent` case arm — their payloads (a single `componentId` + a `par_`/`typ_`
  ULID) fit **neither** the `CapabilityExecutionSpec` `idsField` template **nor** the generic property
  arm (`GENERIC_PARAMETER_TARGETS` routes `element.updateParameters`, not `component.*`). Adding one
  pushes the ratchet to `31/30` and **fails the gate**. And `component` is not in `PROBE_ELEMENT_KINDS`,
  so a `targets:['component']` capability would also ripple every existing capability's probe.
- Placement additionally has **no pointer in a sentence** — `ResolverContext` carries no cursor/anchor
  (the subagent map confirmed the full field list), and C83 §4.3 forbids guessing a position.

**⛒ Conclusion, forced by the gate rather than chosen:** the three `component.*` verbs **cannot** become
global capabilities without breaking the gate the brief requires green. The brief's own instruction —
*"mirror the proven FinishType chat strip"* — names the architecturally-sound alternative, and
`FinishTypeChatStrip`'s header states it explicitly: a **deterministic, offline, zero-token resolver over
the surface's declared vocabulary, dispatching through the surface's EXISTING command path** — no new
verb, no new resolver case arm, no global capability row. So the three verbs **stay declared in
`CHAT_UNAVAILABLE`** (their promises are now TRUE — the surfaces exist), `UNDECLARED` stays `0`, case
arms stay `30/30`, and the authoring chat ships as panel/workspace strips.

---

## §1 — WHAT SHIPPED (three surfaces, all FinishTypeChatStrip-shaped)

New module `apps/editor/src/ui/component-chat/**` (owned by U6):
- **`componentChatIntents.ts`** — the pure resolvers. `resolveComponentInstanceAsk(text, view)` (set
  override / clear / swap type) and `resolveComponentExpressionAsk(text, params)` (§64 formula
  authoring). Resolution runs through `resolveDeclaredRef` — the ONE `resolveCatalogueRef` ladder over
  declared names (so "Width", "CW-600" resolve via its exact/case-insensitive tiers) plus a documented
  compound-word fallback (`catalogueNameWords` + splitCamel, exact-set tie-break) so "opening width"
  reaches `OpeningWidth` while "width" still resolves the parameter NAMED Width. `readCanonicalLength`
  is the one unit site (mm canonical, matching `ComponentSection`'s edit affordance).
- **`ComponentChatStrip.ts`** — `mountComponentChat(host, controller)`: the shared strip chrome
  mirroring `FinishTypeChatStrip` (Ask pill, aria-live transcript, example chips, Enter-sends). Exposes
  a `submit()` test seam. Dispatches nothing itself.
- **`componentChatControllers.ts`** — `makeComponentInstanceController(port)` (drives
  `component.setInstanceParameter` / `component.swapType` through the port) and
  `makeComponentExpressionController(port)` (drives `previewExpression` → **diagnostics gate** →
  `applyExpression`). Every port refusal reaches the transcript verbatim.

Wired into the two sibling surfaces (additive; both are committed, not held):
- **`ComponentSection.ts`** (U2) — mounts the instance strip into a persistent host, port dispatches
  through the same `dispatch` seam the controls use (`component.setInstanceParameter` / `swapType`).
- **`ComponentDefinitionWorkspace.ts`** (U3) — mounts the expression strip, port = the handle's own
  `previewExpression` / `applyExpression` (the `introduce-expression` op on the draft).

Placement (main chat), reused not reinvented:
- **`chatPlacementActivation.ts`** — extended `enumeratePlaceables` with a THIRD source,
  `componentCatalog.list()` (one entry per definition + per type). "place a &lt;name&gt;" resolves a loaded
  component and arms **U1's** `armComponentPlaceTool` (the SAME chokepoint the browser's Place button
  uses); the user's click dispatches `component.place` (C83 §4.3 — no guessed position). An unknown name
  refuses by naming real items and records NO placement. This reuses the existing `activate-placement`
  capability — no new capability, no new resolver case arm.

`packages/ai-host/.../ChatCapabilityRegistry.ts` — the ONLY ai-host edit: the three `CHAT_UNAVAILABLE`
strings and their rationale comment updated (string content only; the map still has 78 entries, case
arms still 30). The stale premise "there is no project-level definition registry at this commit" was
corrected — U0's catalogue and the U1/U2/U3 surfaces now exist; the strings point at them.

---

## §2 — DECLARED CAPABILITIES / coverage-gate posture

- **No new global `ChatCapability` rows** (the case-arm ratchet forbids it — §0). The authoring chat is
  panel/workspace strips.
- The three `component.*` verbs **remain declared** in `CHAT_UNAVAILABLE` with updated, now-true reasons
  → `UNDECLARED` stays `0`.
- `MAX_RESOLVER_CASE_ARMS` unchanged at `30/30` (ZeroTokenResolver.ts untouched).
- Placement rides the existing `activate-placement` capability; its probe/examples/targets are unchanged
  (the component source lives in the editor bridge, which the gate does not execute).

**Result: U6 adds no new gate regression.** The gate stays at its pre-existing `RC=3`; the failing arms
are byte-identical to the `dc942d01` baseline (proof in §4).

---

## §3 — THE §64 TRANSCRIPT, VERBATIM (through the real workspace + real draft op)

Test `apps/editor/__tests__/componentAuthoringChatThroughComposedRuntime.test.ts` ARM E, on the REAL
composed runtime with a definition carrying `OpeningWidth`(1200), `FrameWidth`(75), `GlassWidth`(default
1050), driven through the mounted strip:

```
you  ▸ make glass width the opening width minus twice the frame width
pryzm▸ Authored GlassWidth = OpeningWidth - 2 * FrameWidth. It resolves to 1050 mm under the
       current scope. The previous default (1050) was cleared and recorded as supersededDefault
       (a formula beats a default — ADR-0376 D4).
```

Read back off the DRAFT document (not a spy): `GlassWidth.expression === "OpeningWidth - 2 * FrameWidth"`,
`GlassWidth.defaultValue === null`, `GlassWidth.supersededDefault === 1050`, diagnostics CLEAN (the
`previewExpression` gate passed before `applyExpression` ran). An unresolvable operand ("the flooble
minus the frame width") REFUSES naming `flooble` and authors nothing (ARM F).

---

## §4 — PROOFS

- **Acceptance suite:** `componentAuthoringChatThroughComposedRuntime.test.ts` — **10/10 PASS**
  (composed runtime + real ai-host strips). Arms: A `set width 1500` → `component.setInstanceParameter` →
  CA-21 read-back `instanceParameters[Width]===1500`; B a TYPE parameter refuses by name, no dispatch;
  C `swap to CW-600` → `component.swapType` → read-back `typeId===CW-600`; D unknown parameter misses,
  no dispatch; E the §64 formula (above); F unresolvable operand refuses; G placement resolves a
  definition/type name and arms U1's tool; H unknown name refuses, records NO placement; I/J wiring +
  pure-resolver unit.
- **Root tsc (`tsc -p tsconfig.json --noEmit`, `NODE_OPTIONS=--max-old-space-size=6144`):** **ZERO
  errors in any U6 file.** The tree reports `RC=2` from 6 errors, ALL in
  `packages/site-parcel-data/src/countryAdapters/ro/index.ts` — an **untracked** file another lane is
  editing in the shared tree (unused-import `TS6192`/`TS6133`); not U6's, not touched by U6. A grep of
  the tsc output for any U6 path returns nothing.
- **chat-capability gate:** `RC=3`, **byte-identical to the pre-U6 baseline** — `UNDECLARED: 0`,
  `resolver case arms 30/30`, same failing arms (all pre-existing `KNOWN_VALUE_SOURCES` drift /
  unreachable-properties / spatial-reach, none component-related). `diff` of the FAIL/UNDECLARED/ratchet
  lines before vs after = empty. **No new regression.**
- **Editor suites** (`aiReachesComponentSlice` + `componentPropertySection` + `componentDefinitionWorkspace`):
  **25/25 PASS** — the lane-4H arms still hold with the updated `CHAT_UNAVAILABLE` strings (>60 chars,
  match `/id|catalogue|definition/`), and the U2/U3 mounts did not disturb the existing surfaces.
- **ai-host suites** (`chat-capability-registry` + `capability-acceptance`): **354/356**. The 2 failures
  are **pre-existing and unrelated** — `set-curtain-wall-dimensions missing from the matrix literal`
  (stale test snapshot vs the committed CW90 capabilities) and the fan-out ratchet at
  `[set-curtain-wall-type, set-lighting-type, set-room-occupancy, set-stair-railing-type, set-stair-type]`
  = 5 > 4. Neither names a component; U6's ai-host diff is confined to the three component
  `CHAT_UNAVAILABLE` strings + their comment (proved by `git diff` — the CAPABILITIES array, the matrix
  literal and the fan-out set are untouched).

---

## §5 — FALSIFICATION

- A nonexistent definition name → `resolvePlacement` `no-match` → `activatePlacementFromChat` returns
  "nothing was activated" and `getActiveComponentPlacement()` stays `null` — never a fabricated
  placement (ARM H).
- A nonexistent parameter → the resolver MISSES and names what IS authorable; the store is unchanged
  (ARM D). A TYPE parameter → refused BY NAME before the bus (ARM B).
- The strip dispatches nothing of its own: sever the port and every ask refuses; the `introduce-expression`
  path is the workspace's own `applyExpression` (its lazy `@pryzm/file-format` seam is the falsification
  the U3 header already documents).
- Byte-identical restore: no schema, no verb, no resolver case arm, no global capability row minted.

---

## §6 — OWED / NOT DONE (honest)

- The definition-editor workspace also carries the §64 CONSTRAINT gesture ("make both side frames
  equal") in the UIUX-PLAN's own §U6 acceptance. Constraints are a DIFFERENT draft axis
  (`profileConstraints`) with no `introduce-*` migration op exported from `@pryzm/file-format`, and this
  lane may not mint one (audit R1). The expression half of §64 is shipped; the constraint half is
  **OWED**, and the workspace already refuses profile write-back by name (U3's own OWED).
- The gate's pre-existing `RC=3` (unrelated to components) is **not** U6's to fix; recorded here so the
  next reader does not attribute it to this lane. An ISSUE-LOG row for the `KNOWN_VALUE_SOURCES` drift is
  a candidate (this lane logs nothing itself).
