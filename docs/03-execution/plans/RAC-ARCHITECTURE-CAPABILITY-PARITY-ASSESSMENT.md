# RAC Architecture & Capability-Parity Assessment

**Date:** 2026-08-10 · **Status:** assessment complete, implementation not yet begun.
**Mandate:** turn RAC from a deterministic resolver into the canonical semantic
capability-orchestration layer over the existing command surface — without creating a
second command system.
**Evidence base:** `docs/04-reference/RAC-CAPABILITY-PARITY-INVENTORY.md` (three-way
audit, file:line cited), ADR-0313, ADR-0314, plus direct re-verification this session of
`PropertyDescriptorGenerator.ts`, `CommandBus.executeCommand` (`CommandBus.ts:270-484`),
the capability registry, both resolvers, the bridge, and gate 31.

**Verified state at time of writing:** commits `cc796de4`/`4edeeb66` on main; coverage
gate ✓ (17 capabilities, 304 commands, undeclared 0/0, targets proven both ways);
ai-host RAC suites 195/195; bridge spec 12/12; tsc clean; all other gates green.

---

## 1. What is already excellent (do not rebuild)

- **The proof regime.** Capability claims are executable-probed both directions (3a)
  AND source-anchored (3b). This is the single most valuable asset; every proposal
  below extends it rather than working around it.
- **One semantics authority.** Tier-0/1 grammar and the NL layer both reduce to
  `SemanticIntent` and funnel through `applySemanticIntent` — guards cannot diverge
  between rigid and natural paths.
- **The honesty ladder.** supported / recognized-but-refused / miss, with generated
  refusals that only offer what the resolver will honour, kind-scoped topics, and
  batch results that report N-of-M with grouped skip reasons.
- **Purity + injection.** The resolver reads no stores; the bridge injects value
  sources (`resolveWallSystemType`, levels, selection). This is the pattern every new
  resolver-facing service must follow.
- **Performance.** Tier-0 p50 2–10 µs, full local ladder p99 < 0.7 ms (inventory §7).
  Language resolution needs no optimization work this phase.
- **Precedent batch primitives.** `UpdateWallsSystemTypeBatchCommand` /
  `UpdateWallsColorBatchCommand`: pure orchestration over proven single-element
  commands, one history entry, honest partial failure. This is the template for every
  future batch command.

## 2. What must NOT change

1. `applySemanticIntent` remains the only semantics→command authority.
2. Gate 31's proof obligations (3a/3b), the shrink-only ledgers, and the
   three-surface disjointness (capability / CHAT_UNAVAILABLE / classification).
3. Resolver purity — new services (scope, values) are INJECTED via
   `ResolverContext`, never imported into the L2 resolver.
4. Undo truthfulness: never claim one undo unit unless dispatching one history
   entry; `batchCoordinator.runBatch` stays labelled undo-neutral.
5. No AI-path store writes; the bus and CommandManager remain the only mutation
   authorities.
6. The refusal model (a recognized-but-unsafe ask never falls through to the LLM).

## 3. Architectural weaknesses (the honest list)

- **W1 — The switch is the scaling wall.** `applySemanticIntent` is ~10 hand-written
  arms that differ only in: target guard, per-kind route table, payload shape,
  value validation, summary copy. `set-wall-color` cost ~60 hand-written lines for
  what is conceptually 6 lines of metadata. This is §31's question, answered in §7.
- **W2 — Scope is not a first-class concept.** `'all' | 'selection'` exists as a
  field on exactly two intents with duplicated scope/refusal logic; level/type/
  filter/room scopes have three incompatible encodings elsewhere (inventory §3).
- **W3 — Property metadata is triplicated.** Bounds/units live in
  `PropertyDescriptorGenerator` (L7), in command `canExecute`s, and implicitly in
  resolver validation (`height <= 0`). Drift precedent exists
  (§FIX-STAIR-PANEL-BOUNDS-DRIFT fixed exactly this class).
- **W4 — The dual undo stack is inherited fragility.** ~70 bridge handlers with
  `stores: []` put undo on the CommandManager stack; every new bridged command
  (including both batch commands) inherits the 250 ms same-gesture reconciliation.
- **W5 — The legacy `QueryEngine` regex layer** still sits between RAC-miss and the
  LLM, with duplicated level lookups and two disagreeing colour maps. It must be
  drained, not extended.
- **W6 — Read-model hot paths are O(model).** `getAll()` deep-clones,
  `AIReadModel.getElementById` is an 11-store transform per call, no ids-only
  accessors, no query cache. Harmless today; fatal under filter scopes.

## 4. Missing foundational abstractions (the smallest set)

Exactly five. Everything in the mandate reduces onto these:

| # | Abstraction | Form | Layer/home |
|---|---|---|---|
| F1 | **ScopeDescriptor** | discriminated union: `selection · all(kind?) · ids · level · type · room · filter(SemanticQueryExpression)` (spatial/relationship reserved, not built now) | type in ai-host (pure) |
| F2 | **ScopeResolver** | `resolveScope(desc) → { ids, kindCounts, skipped } \| refusal` — editor-side service over storeRegistry / getByLevel / roomQueryService / semanticIndex; **injected** into ResolverContext like the wall-type lookup | apps/editor service (or core-app-model), injected |
| F3 | **ValueResolver registry** | `valueSource → resolve(text, ctx)` map unifying measurement/angle/color/catalogue/level; catalogue entries via `resolveCatalogueRef` per store | ai-host (pure parts) + injected catalogue readers |
| F4 | **CapabilityExecutionSpec** | declarative per-capability: `{ scopeModes, params, routes: kind→{command, payload(sel,values)}, batchRoute?, summary }` — interpreted by ONE generic arm in `applySemanticIntent`; existing arms migrate incrementally | ai-host registry extension |
| F5 | **ElementProjection** | canonical queryable-props map per element (kind, levelId, typeId, mark, dims, material…), derived from stores + command validation, versioned for cache invalidation | editor-side, feeds F2's filter scope |

Explicitly NOT needed: a new command system, an AI store, a new undo system, a new
NL framework. The composite primitive (§10) is a command-layer addition, not an
RAC-layer one.

## 5. Capability-parity gaps

Authoritative matrix: inventory §4 (18 rows, gap-classified) and §5 (batch matrix).
Summary of what remains: mark, frame colours, door/window/stair/room enumerated
properties, level operations (rename/elevation/delete-with-confirm), view/visibility
family, `element.changeType` (14 families), generic property surface (~60 fields),
filter scopes, composites. The 9 class-F commands are wiring-ready today.

## 6. 304-command disposition

The existing classification (`ChatCommandClassification.ts`: B 134 · C 50 · D 38 ·
E 3 · F 9 + 51 CHAT_UNAVAILABLE + 19 covered) was re-derived from source this session
and spot-verified (colour family reclassifications, dead-DTO findings). Rather than
re-litigating all 304 now, the disposition adds a **maturity dimension** verified
per-tranche at implementation time:

```
M0 command exists, not user-facing        (C internals, D duplicates)
M1 UI-proven                              (inventory §1 traces)
M2 RAC single-target       — 15 of 17 capabilities
M3 RAC selection-capable   — all M2 since ADR-0314 multi-selection
M4 RAC scope/filter        — 2 today (the two 'all'-batches); F2 unlocks
M5 RAC batch (one undo)    — 2 today; more need command-layer primitives
M6 composite-capable       — 0 today (blocked on §10)
M7 LLM-plannable           — 0 (deliberately last)
```

Gate 31 gains a report line per maturity level so the roadmap is measurable in CI.
Rule preserved: exposure requires per-command trace to the geometry store
(the `wall.bulkSetVisuals` lesson) — classification is never sufficient evidence.

## 7. The §31 design question — answered

**Architecture 2 (declarative capability spec) is correct, with one amendment:**
keep `applySemanticIntent` as the single interpreter rather than introducing a
separate "command adapter" layer. Evidence:

- The 10 existing arms are already isomorphic to `CapabilityExecutionSpec`
  instances (guard = registry targets; route table = per-kind ternaries; summary =
  template). The switch is hand-compiled metadata.
- The probe/proof machinery (3a/3b) applies unchanged to spec-driven capabilities —
  the probe still enters through the same function.
- Migration is incremental and refusal-text-preserving: one generic arm interprets
  specs; existing intents move one at a time with their tests pinning exact copy.

Matcher side: grammar stays thin (parse → SemanticIntent). New capabilities get
sentences via a small pattern-family helper (verb set + scope word + value slot),
not per-capability regex craft.

## 8. Scope architecture (F1+F2)

- Descriptor parsed by language layer; **resolution happens once**, editor-side,
  through indexed paths: level → `getByLevel` (Map-indexed where present,
  feature-detected); type → `storeRegistry.getStoreForType`; room →
  `roomQueryService` (coverage caveat: walls/windows/columns not covered — the
  resolver must REPORT unsupported kind-in-room, not silently return partial);
  filter → F5 projection + `semanticIndex.evaluateQuery`; tag → tag index O(1).
- Result carries `skipped: {kind, reason}[]` so refusals can say "7 found, 2 are
  curtain walls and don't support this" (§27 of the mandate).
- **Ids-only accessors** added to hot stores (`getAllIds()`, keys of the internal
  maps) so 'all'/level scopes never pay `getAll()` deep-clones.
- Caching: only after benchmarks, keyed on StoreEventBus generation counters;
  never inside token loops (language already produces the request first).
- Performance targets (to be benchmarked in-repo, not ad hoc): selection/ids O(k);
  level/type scope < 0.5 ms at 5k elements; filter scope < 5 ms at 5k elements
  first-pass, then indexed.

## 9. Property vocabulary (F3/F4 applied to ~60 fields)

Layer reality: `PropertyDescriptorGenerator` is L7 (apps/editor) — the L2 resolver
cannot import it. But the generator itself already sources bounds from L2
authorities (`STAIR_CONSTRAINTS`, `RAKE_MIN/MAX_DEG` — its own header forbids
restating literals). Therefore:

- The RAC property vocabulary is declared in the registry (property name, aliases,
  unit, kinds, route) with bounds imported from the same L2 geometry authorities
  where they exist, and **gate-pinned** against `PropertyDescriptorGenerator.ts`
  (3b `mustMention` on the bounds literals) where they don't — the ADR-0313 static-
  coupling trick, now guarding descriptor↔vocabulary drift both ways.
- Routes follow the inventory §1.4 per-kind proven paths, NOT blanket
  `element.updateParameters` (its `resolveStore` ceiling is already encoded as
  `GENERIC_PARAMETER_TARGETS`).
- Explicitly excluded: fields whose UI semantics are richer than a value write
  (wall thickness = layer-stack-derived, read-only; stair typeId deliberate).

## 10. Batch + composite/one-undo architecture

**Batch:** the command-layer pattern is settled (two precedents). Additional batch
primitives are built only where sentences demand sets: dimensions batch
(per-family or a legacy batch wrapping `UpdateElementParameterCommand` children),
`element.changeType` batch, `visibility.hide` already array-shaped. Fan-out with
honest N-step summaries remains the interim.

**Composite (GAP D) — two domains, verified against `CommandBus.ts`:**

1. **Bus-patch domain.** `executeCommand` builds ONE EventRecord + ONE ring-buffer
   PatchPair per dispatch, and the multi-store patch envelope
   (`CommandBus.ts:393-423`, built for L-292) already routes per-store patches. A
   `composite.execute` bus handler that runs child handlers' canExecute+execute
   sequentially and concatenates store-prefixed patches would yield one truthful
   Ctrl+Z **for pure-patch children only**.
2. **Legacy-bridge domain.** Both existing batch commands (and ~70 bridges) return
   empty patches; their undo lives on the CommandManager stack. They CANNOT compose
   into a bus record. For them, the existing `CompositeCommand` +
   `beginGenerationBatch`/`endGenerationBatch` bracket is the proven one-entry
   mechanism — it needs only a parameterised label (today hardcoded
   'Generate building', `CommandManagerImpl.ts:678`).

**Recommendation:** implement the **legacy-side plan executor first** (parameterised
generation bracket + `PlanValidator` dry-run + impact summary + confirm card),
because the founder-sentence children ("3m + type X + white") are predominantly
legacy-routed today; treat the bus-patch composite as a second phase gated on real
demand from pure-patch children. Do not promise atomicity: execution is sequential
with per-step refusal capture; the plan REPORT states exactly what executed, and
undo is one entry per domain used (one, in the common all-legacy case).

## 11. Performance architecture

Measured baseline in inventory §7 (language: µs; not the bottleneck). Future
hotspots and mitigations are §8's; the benchmark harness moves into the repo
(`tools/ga-gate/` sibling or package script) so scope-resolution targets are
regression-checked, not one-off. No caching lands without a generation-counter
invalidation test.

## 12. Extension workflow (the §30G answer)

Target state after F1–F4 land — adding a UI capability with an existing id-keyed
command costs:

```
1. verify the command trace (UI → handler → geometry store) — or build the
   missing primitive on the batch template
2. add ONE CapabilityExecutionSpec entry (registry metadata: targets, params,
   scopeModes, routes) + probe + commandProof
3. add the acceptance family (canonical/polite/synonym/typo/scope/refusal rows)
4. (only for a new value domain) add a ValueResolver entry
```

Gate 31 enforces 2–3 automatically; no parser, dispatcher, or scope code per
capability. Today's extra cost (hand-writing a switch arm) is exactly what F4
removes.

## 13. Implementation dependency graph

```
P0  verify state (done, this doc)
P1  class-F tranche (9 caps)                 — no deps; proves §12 workflow today
P2  F3 value-resolver unification + catalogue readers (door/window types first)
P3  F1 scope descriptor + F2 scope resolver (selection/all/level/type) + ids-only
    accessors + in-repo benchmark
P4  F4 spec-driven interpreter + migrate existing 17 (copy-pinned)
P5  property vocabulary tranche (highest-value ~20 fields first)  [needs P2,P4]
P6  batch primitives where sentences demand sets                  [needs P3]
P7  legacy-side plan executor (parameterised bracket + PlanValidator + confirm)
                                                                  [needs P4]
P8  filter scope (F5 projection + SemanticQueryExpression)        [needs P3]
P9  compound sentences → plans                                    [needs P7,P8]
P10 QueryEngine drain + duplication collapse (colour maps, level lookups)
P11 LLM planner emitting SemanticIntent/plans against the registry (last)
```

Deviation from the mandate's §37 order: property vocabulary moves AFTER the spec
interpreter (P4) — migrating 60 fields onto the old hand-written-arm pattern would
be 60× the plumbing F4 exists to delete.

## 14. Recommended ADR changes

- **ADR-0315 (new):** scope descriptor/resolver + spec-driven capability execution
  + plan executor decision (§10's two-domain analysis). ADR-0313/0314 stand.
- C16 note: chat plans as a recognized producer of generation batches.

## 15. Phases

P1 is a day-scale tranche; P2–P4 each single-session scale with tests; P5–P9
iterative tranches behind the gate's maturity report. Each phase ends at the
regression bar of §17.

## 16. Risks / regressions to watch

- **Dual-stack undo** around any new bridge or composite (W4) — every new bridged
  command needs a `batchNestingUndo`-style test.
- **Descriptor↔vocabulary drift** — mitigated by gate-pinning (§9); the risk is
  forgetting the pin on a new field.
- **Scope cache staleness** — no cache without a generation-invalidation test.
- **Refusal-copy regressions** during F4 migration — existing tests pin exact
  strings; migrate one capability at a time.
- **QueryEngine shadowing** — it answers AFTER RAC misses, so new capabilities
  can silently change which layer answers a sentence; the acceptance suite must
  assert layer-of-resolution for representative sentences.
- **Ambiguity handling under filter scopes** — "all timber doors" can be ambiguous
  in both the catalogue AND the filter; refusals must name which.

## 17. Test strategy

Per capability (mandate §35): language family (canonical/polite/synonym/typo/order) ·
scope rows · reference resolution (exact/fuzzy/ambiguous/absent) · safety
(unsupported target, missing param, destructive confirm, adversarial non-imperative) ·
execution (command/payload/ids/undo semantics) · honesty (no silent no-op, partial
failure explicit). Infrastructure: scope-resolver unit + benchmark suite; plan
executor undo-count tests; gate 31 negative-tested per new check (its own header
convention). Regression bar unchanged: tsc, ai-host suites, bridge spec, all gates.

## 18. Definition of done (measurable)

- Maturity report in gate 31 shows: all class-F at M2+; property vocabulary covers
  the top-20 panel fields; ≥ 6 capabilities at M4 (scope/filter); ≥ 4 real batch
  primitives at M5; compound founder-sentence at M6 with truthful undo.
- §12 workflow demonstrated by adding one capability purely via metadata in a test.
- Scope resolution benchmarks in CI with stated targets.
- Zero new parallel execution paths; zero direct store writes; refusal ladder
  intact; local resolution still sub-millisecond p99.
