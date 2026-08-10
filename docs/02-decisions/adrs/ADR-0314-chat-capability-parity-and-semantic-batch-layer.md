# ADR-0314 — Chat capability parity: audited surfaces, semantic scope/batch layer, and the wall-colour batch primitive

Status: **accepted** · Date: 2026-08-10 · Extends: ADR-0313 (which stays authoritative for
the resolver ladder, the capability registry, proofs 3a/3b, and the honesty model).
Evidence base: `docs/04-reference/RAC-CAPABILITY-PARITY-INVENTORY.md` (the full three-way
audit: UI capabilities ⇄ command surface ⇄ chat coverage, with file:line citations).

## Context

ADR-0313 delivered a capability-driven zero-token resolver whose declarations are proven
against real editor behaviour. What it could not yet answer is the COVERAGE question:
*have we discovered everything a user can already do in the editor?* This session ran that
audit (three parallel inventories) and implemented the highest-leverage slice it exposed.
The audit's headline truths, each of which forced a decision below:

1. **`batchCoordinator.runBatch` is undo-NEUTRAL** (`BatchCoordinator.ts:231-236`,
   measured by `batchNestingUndo.test.ts`). The chat bridge's header claimed it bought
   one undo unit. It does not. One undo entry is bought only by ONE batch command with
   one produce/one history entry (C16 §8.6), or by `CompositeCommand` +
   `beginGenerationBatch` — which exist only on the legacy CommandManager, not the bus.
2. **The founder's next sentence ("make all walls white") was a GAP C, not a wiring gap.**
   `wall.bulkSetVisuals` has the right batch shape but writes the plugin's DETACHED DTO
   store (§FIX-MATERIAL-DEAD-DISPATCH — nothing that renders/exports/persists reads it,
   zero call sites). The only live route was single-wall `wall.updateColor`.
3. **Chat saw at most one selected element** — the bridge read
   `selectionManager.selectedObject` while `selectionBus` holds the full set.
4. **Catalogue reference resolution existed once** (wall system types) and eight other
   catalogues (door/window/floor/ceiling/stair/handrail types, materials, views) have
   stores but no resolver.
5. **A filter IR already exists** (`SemanticQueryExpression` + `VisibilityRule` engine);
   what is missing is a scope→element-id resolver and an element-props projection.

## Decisions

### D1 — Gap taxonomy is the planning vocabulary
Every discovered parity gap is classified A (chat wiring only) / B (semantic adapter) /
C (batch primitive missing) / D (composite missing) / E (authoritative validation
missing) / F (editor capability missing), recorded in the inventory doc. A capability may
only ship by the ADR-0313 rules (probe + commandProof + acceptance family) — the taxonomy
decides WHAT to build, the proofs decide whether it may ship.

### D2 — Batch primitives are commands, never loops presented as one action
When a sentence addresses a SET ("all walls", "the selected walls") the dispatch must be
ONE command whose undo is one entry and whose result reports partial failure
("Changed/Recoloured N of M — K skipped: <reason>"). `UpdateWallsSystemTypeBatchCommand`
is the pattern; **`UpdateWallsColorBatchCommand` (`wall.updateColorBatch`) is its first
deliberate replication** — pure orchestration over the proven single-wall
`UpdateWallColorCommand` (geometry store → fragment rebuild), explicitly NOT over the
dead-store `wall.bulkSetVisuals`. Bus surface: `plugins/wall/src/handlers/
UpdateWallsColorBatch.ts`, report event `pryzm-wall-color-batch-report`, same F-1.3
bridge shape as the type batch (SDK-bypass ratchet 172→173, dated in the gate header).

Where no batch command exists (dimensions across a selection), the chat MAY fan out one
command per element **only with an honest summary** ("Set 3 selected elements' height …",
"undo with Ctrl+Z (3 steps)") — the bridge now says the real undo cost. Fan-out is a
stopgap; per-family batch commands are the roadmap answer.

### D3 — Selection is the full set, with all-or-nothing kind guarding
The bridge injects `selectionBus.currentIds` (id→kind resolved by probing
`storeRegistry`'s typed stores; unclassifiable ids are DROPPED, not guessed; the legacy
single-object walk remains as fallback). In `applySemanticIntent`, every property-setting
intent guards EVERY selected element against the capability's proven targets and refuses
WHOLE on any mismatch — partial execution presented as success is the
§FIX-CHAT-COMPOUND-DIMENSIONS dishonesty, now generalized. `set-dimensions` stays
one-element-only (its contract is one dispatch = one rebuild for one element);
`rename-room`/`set-room-number` require exactly one room; a destructive noun-qualified
delete must match every element in the set.

### D4 — Scope words are explicit and reused
`'all' | 'selection'` scope requires a scope word ("all/every" vs "these/selected") and
is never inferred — extended unchanged from `set-wall-type` to `set-wall-color`. The
scope DESCRIPTOR generalization (type/level/room/filter scopes over the existing
`SemanticQueryExpression` IR and a new scope→id resolver service) is specified in the
inventory doc §6 and is the next architectural tranche — deliberately not rushed into
this change.

### D5 — One reference-resolution ladder for every catalogue
`resolveCatalogueRef` (`packages/command-registry/src/catalogue/resolveCatalogueRef.ts`)
is THE forgiving lookup: exact id → exact name → case-insensitive name → unambiguous
word subset; ambiguity returns null WITH candidates (callers refuse by listing, never
coin-flip); generic + per-domain noise words. `resolveWallSystemTypeRef` now delegates to
it (public API unchanged). Door/window/floor/ceiling types etc. (the 18-command
B_CATALOGUE family) adopt it as they come online — no second matcher may be written.

### D6 — One colour table, language-side
`packages/ai-host/src/intents/colorRef.ts` owns colour-name → '#rrggbb' (bounded
architectural vocabulary + hex passthrough, `gray`→`grey` normalization). Commands
validate hex only. The two disagreeing ad-hoc maps in `QueryEngine.ts` are scheduled for
collapse onto this module. New capability registry value source: `'color'` (gate check 5
extended to require `probe.colorRef`).

### D7 — A topic may be live for some kinds and a gap for others
`UNCONNECTED_TOPICS` gained `excludeKinds`: 'colour' no longer fires for walls (a
refusal that denies a live ability is a manufactured lie) while remaining the honest
refusal for every other kind. The alias-collision invariant now permits a shared word
ONLY when every colliding capability's targets are excluded by the topic. The three wall
colour commands stay in `CHAT_UNAVAILABLE` with corrected truthful reasons (dead-store /
single-wall route → the batch capability), keeping the ledger at zero undeclared.

### D8 — The missing bus-side composite is specified, not improvised
For GAP D (multi-operation sentences: "make all exterior walls 3m, change their type,
and make them white") the repo has `CommandPlan`/`PlanValidator`/`PlanOrdering`/
`CompositeCommand`/`beginGenerationBatch` — all legacy-side. The next primitive is either
(a) a parameterised generation-batch bracket the chat can use per plan (label ≠
'Generate building'), or (b) a bus-side composite handler that executes an ordered step
list as one history entry. Decision deferred to its own change WITH the undo-stack owners
at the table; nothing in this ADR pretends composite exists.

## Consequences (shipped this session)

- **17 capabilities** (was 16): `set-wall-color` — "make all walls white" / "paint the
  selected walls light grey" / "#f4f1e8" resolve at tier 0, dispatch ONE
  `wall.updateColorBatch`, one undo entry, honest N-of-M report replacing the generic
  Done line. Colour asks and type asks are ordered so neither grammar eats the other
  ("make all walls vermilion" refuses as a TYPE with the catalogue; "paint all walls
  vermilion" refuses as a COLOUR with the palette).
- Multi-selection works end-to-end for delete/dimension/sill/pitch intents with honest
  fan-out summaries; mixed-kind selections refuse whole.
- Coverage gate: 304 registered commands, 17 capabilities covering 19, UNDECLARED 0/0,
  all targets proven both ways; ai-host RAC suites 195 green (was 176); bridge spec
  12 green (incl. the new batch dispatch proof); new command suite 11 green; tsc clean;
  layer gate 102/102 · 13/13 · 173/173 (dated bump, D2).
- **Measured local-resolution latency** (2000 iters/case, tsx, this machine): tier-0
  p50 2–10 µs; tier-1 typo path p50 28 µs; NL layer full-ladder p50 97–126 µs, p99
  < 0.7 ms. The deterministic layer is not a bottleneck; performance work belongs in
  scope resolution (store `getAll()` deep-clones, `AIReadModel` full-model transforms) —
  tracked in the inventory doc §7.

## Roadmap (dependency order, from the audit)

1. Class-F tranche (9 chat-ready commands: roof overhang, riser height, tread count,
   base offsets, light intensity, sheet/view rename) — metadata + proofs + acceptance
   families only; the architecture requires no new plumbing (§56 extensibility test).
2. Scope→id resolver service + scope descriptor in the IR (type/level scopes first —
   `getByLevel` indexes exist; then filter scopes over `SemanticQueryExpression`).
3. B_CATALOGUE families via `resolveCatalogueRef` (door/window types first).
4. Bus-side composite primitive (D8) → composite capabilities.
5. `element.updateParameters` property-vocabulary capability (largest coverage per
   capability: ~60 panel fields) + `element.changeType` (14 families).
6. Collapse duplications: QueryEngine colour maps → colorRef; five level lookups → one;
   `QueryExpression` → `SemanticQueryExpression`.

## Extensibility answer (§56 of the session brief)

Adding a new property-panel operation with an existing id-keyed command now costs:
one `ChatCapability` entry (with probe + commandProof), one acceptance family, and —
only if it introduces a new value domain — one entry in a shared value-source resolver.
No new parsers, no new dispatchers, no per-capability synonym systems. The wall-colour
capability was the proof: the only genuinely new code was the missing EDITOR primitive
(the batch command), which is exactly where new code should live.
