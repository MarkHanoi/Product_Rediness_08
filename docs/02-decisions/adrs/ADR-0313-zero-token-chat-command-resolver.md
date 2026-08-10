# ADR-0313 — Capability-driven zero-token chat command resolver in the AI panel

- **Status:** Accepted (2026-08-10; §Natural-language layer added 2026-08-10; **reframed
  from intent-list to CAPABILITY-DRIVEN 2026-08-10 — see §Capability-driven resolution**;
  **§No silent gaps + §Symmetry tranche + §Compound dimensions added 2026-08-10** — every
  registered bus command is now declared, the undeclared baseline is 0)
- **Owners:** AI panel / ai-host
- **Related:** C16 (command authoring), C03 (commands/state), P6 (commands-only mutation), P8 (spans), §CONTEXT-DATA-HONESTY

## Context

The AI chat panel (`apps/editor/src/ui/ai/AIPanel.ts`) routes **every** utterance through
`aiService.query()` — an LLM round-trip — even for asks that map deterministically onto
existing bus commands ("delete selected", "set height to 3m", "go to level 2", "undo").
Most BIM-editor utterances are command-shaped. Tokens should be the fallback, not the default.

## Principle

> **Local resolution maps natural language onto the editor's REGISTERED CAPABILITIES.**
> Capabilities are declared alongside the commands they expose and verified against them in
> CI — never in a second, manually-synchronised list.

The original framing of this ADR ("a small grammar of intents") was the defect, not the
implementation of it. See §Capability-driven resolution for the evidence and the correction.

## Decision

Add a **resolution ladder** in front of the LLM path:

- **Tier 0 — deterministic grammar (0 tokens).** A pure resolver
  (`packages/ai-host/src/intents/ZeroTokenResolver.ts`) matches normalized utterances against
  a small grammar of intents and emits either bus-command dispatches, a local action
  (undo/redo/active-level switch — things that are deliberately *not* bus commands today), or
  an explicit refusal.
- **Tier 1 — synonym + typo normalization (0 tokens).** If tier 0 misses, tokens are mapped
  through a synonym table (remove→delete, floor/storey→level, …) and typo-corrected against
  the intent vocabulary (bounded Levenshtein), then the tier-0 grammar is re-run.
- **Natural-language layer (0 tokens).** If tiers 0/1 miss, a pure local NL resolver
  (`packages/ai-host/src/intents/LocalNaturalLanguageResolver.ts`) understands naturally
  phrased command-shaped utterances and reduces them to a structured `SemanticIntent`
  (see §Natural-language layer below). Only a low-confidence NL `miss` reaches the LLM.
- **Tier 2 — LLM fallback (follow-up, not in this ADR's scope).** A `miss` falls through to
  the existing `aiService.query()` path unchanged. A later change will hand the LLM the
  candidate command set as context.

### Resolver contract

`resolveUtterance(utterance, ctx)` is **pure** (no DOM, no I/O, no store reads). The caller
injects a `ResolverContext`: current selection (`{elementId, elementType}[]`), active level id,
the level list, and an id minter. It returns a discriminated union:

| kind       | meaning                                                             |
|------------|---------------------------------------------------------------------|
| `commands` | resolved → list of `{type, payload}` bus dispatches, `destructive` flag |
| `local`    | resolved → `undo` / `redo` / `setActiveLevel` (not bus verbs today)  |
| `refusal`  | intent RECOGNIZED but cannot be safely completed — carries a human reason + suggestions. **Never falls through to the LLM** (no guessing at recognized-but-underspecified intents, especially destructive ones). |
| `miss`     | not recognized → caller may fall through to tier 2                   |

### Dispatch rules (editor bridge — `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts`)

- **P6:** all mutations go through `window.runtime.bus.executeCommand(type, payload)` —
  the same verbs and payload shapes the property panel and keyboard shortcuts use. The
  resolver never writes stores.
- **One undoable unit:** multi-command resolutions are wrapped in
  `batchCoordinator.runBatch(...)` (`@pryzm/core-app-model`) — the same batching the AI
  apartment generator uses. Single commands are already one undo entry via the bus.
- **Destructive confirm:** any `destructive: true` resolution renders an inline
  Confirm/Cancel card in the transcript and dispatches nothing until confirmed.
- **Honesty (§CONTEXT-DATA-HONESTY):** refusals and dispatch failures are rendered as chat
  replies with the concrete reason ("Nothing is selected", "No level named 'roof' — levels
  here: Level 0, Level 1"). A refusal and a success never look the same; there is no silent
  no-op path.
- **`undo`/`redo` are local actions** because the bus verbs `'undo'`/`'redo'` have **no
  registered handler** (found during this work — `MainToolbar` dispatches them into a
  `CommandBusError` throw). The bridge calls `performUndo()`/`performRedo()`
  (`apps/editor/src/engine/undo/performUndoRedo.ts`) like the keyboard shortcut does.
  Level switching is a `projectContext.activeLevelId` assignment (the `WorkspaceController`
  pattern) — there is no bus verb for it.

### Units

`3m`, `200mm`, `30cm` parse to meters. A bare number > 20 is treated as millimeters
("set height to 2700" → 2.7 m), otherwise meters — matching how architects actually type.

## Natural-language layer (2026-08-10)

The goal is NOT another rigid parser: users speak naturally ("Can you make this wall
about three meters tall?", "Get rid of the doors I've selected.", "Take me to the second
floor.", "Actually, undo that.") and deterministic local understanding handles as much
as possible. Tokens stay the fallback, never the default.

**Pipeline:** message → tier 0/1 grammar (unchanged) → on miss:
`resolveNaturalLanguage(utterance, ctx)` — normalize (filler/politeness stripping,
contractions, phrase canonicalization such as "get rid of"→delete, "take me to"→go to),
number-word conversion ("three"→3, "three point five"→3.5, "two and a half"→2.5,
ordinals for levels), synonym mapping, bounded-Levenshtein typo correction, structured
entity extraction (measurements → meters under the same §Units rule; level references
incl. ordinals/"ground floor"/"upstairs"; element/selection references), and rule-scored
intent classification → a structured **`SemanticIntent`** → `applySemanticIntent()`.

- **One authority for semantics→commands.** `applySemanticIntent` (in
  `ZeroTokenResolver.ts`) is shared by the tier-0/1 grammar AND the NL layer — the
  safety guards (selection required, element-type match, level exists, positive
  dimensions) cannot diverge between the rigid and natural paths. The NL layer produces
  SEMANTICS ONLY: it never builds commands, never dispatches, never touches
  stores/DOM/network.
- **Scope:** NL coverage expands AROUND the same ~13 intents; it does not add command
  types.
- **Confidence + evidence.** Every interpretation carries a bounded confidence [0,1]
  and an evidence list. Thresholds (`CONFIDENCE_THRESHOLDS`): ≥ 0.75 resolve;
  destructive (delete) needs ≥ 0.85 to even REACH the Confirm/Cancel card;
  [0.45, resolve) → ONE clarifying question; < 0.45 → miss → LLM.
- **Clarification is a first-class result.** "Make the wall taller" (no amount) →
  `{ kind: 'clarification', intent: 'set-height', question: 'What height…?' }` rendered
  as a chat reply; the pending intent is remembered so a bare "2700" answers it. A
  recognized intent NEVER gets a guessed value.
- **Conversation context.** A small explicit `ConversationContext`
  (`{lastIntent, lastMeasurement, lastLevelId, lastReferencedElements, pendingIntent}`)
  — not raw chat history — held by the bridge and threaded through both paths
  (`noteResolution` folds tier-0/1 results in). It biases INTERPRETATION only
  ("Actually, make it 3.2m." reuses `set-height`); the live editor state always wins
  for TARGETING — a remembered element is never used in place of the current selection.
- **Level ordinals:** "second floor" ⇒ level query "2" (consistent with the project's
  ground-floor-is-Level-0 naming: "level two" ≡ "Level 2"); "ground floor" ⇒ the level
  named ground / at elevation 0 / lowest; "upstairs"/"downstairs" ⇒ elevation-sorted
  neighbor of the ACTIVE level. Unknown levels refuse and list what exists.
- **Questions are for the LLM.** Interrogative openers ("how high is this wall?") are an
  immediate miss — never misread as a command.
- **Destructive path unchanged:** NL deletion resolves to the SAME `destructive: true`
  resolution; the bridge's Confirm/Cancel card gates every dispatch. Honesty rules
  (§CONTEXT-DATA-HONESTY) unchanged: refusals/failures are concrete, success is only
  reported after the bus accepted the command.
- **Telemetry:** same 2 bounded span names; NL resolution adds
  `pryzm.ai.chat.mode="local-natural-language"`, `…kind`, `…intent`, `…confidence`.
  No raw user text on spans.
- **Tests:** `packages/ai-host/__tests__/local-natural-language-resolver.test.ts`
  (semantic-equivalence sets for height/deletion/levels, follow-ups, clarifications,
  typos, misses) and `apps/editor/src/ui/ai/__tests__/ZeroTokenNoLlm.spec.ts` (spy on
  `aiService.query` proves ZERO LLM calls for locally resolvable requests; the miss
  seam stays open).

### Observability (P8)

New exported functions carry OTel spans: `pryzm.ai.chat.resolve` (with tier/kind/intent
attributes) and `pryzm.ai.chat.dispatch`. Span names are bounded (2 names).

## Capability-driven resolution (2026-08-10)

### The defect that forced the reframing

Commit `c1902a5a` shipped `wall.updateSystemTypeBatch` — retype every wall in the project in
one undo step — and commit `48750f9c` shipped this chat panel, **in the same release**. The
founder typed:

> make all walls interior partition

and got **"I'm not sure how to help with that yet."**

Nothing was broken. The command existed, was registered on the bus, and had a deliberately
forgiving name resolver (`resolveWallSystemTypeRef`: exact id → exact name → case-insensitive
name) built precisely so a chat could say "interior partition" and mean `wt-interior-partition`.
The sentence was unambiguous. **The resolver simply had no idea the command was there.**

The defect is **capability discoverability, not language recognition**, and its cause is two
sources of truth: the editor's abilities live in the command handlers, while the chat's idea of
those abilities lived in a hand-maintained table of thirteen intents in one file. Every new
editor capability silently required someone to remember to teach the chat a fourteenth. Nothing
in CI compared the two lists, so nobody was told.

### The correction

1. **`packages/ai-host/src/capabilities/ChatCapabilityRegistry.ts`** — capabilities are
   DECLARED. A `ChatCapability` carries: `id` (identical to the `SemanticIntent` that reaches
   it), a human `description`, `verbs`/`aliases`, `targets` (the element kinds it really
   applies to), `parameters` each naming its **value source** (`wall-system-types`,
   `project-levels`, `measurement`, `user-text`, `coordinates`), `scope`
   (`selection` | `all` | `global`), a `destructive` flag, and the `busCommand` that implements
   it. `CHAT_UNAVAILABLE` is the honest half: bus commands the chat deliberately does not drive,
   **each with a stated reason**. Shape copied from
   `apps/editor/src/ui/property-panel/ElementTypeAuthoringRegistry.ts`, including its
   `AUTHORING_UNAVAILABLE` precedent.

2. **`tools/ga-gate/check-chat-capability-coverage.ts`** — the gate that would have caught
   `c1902a5a`. Every bus command registered in `plugins/*/src/handlers/*.ts` or
   `apps/editor/src/engine/initBusHandlers.ts` must be DECLARED: implemented by a capability, or
   deferred with a reason. Undeclared commands are counted on a shrink-only ratchet
   (**baseline 269 of 303 registered bus commands, frozen 2026-08-10**), so adding a command without a declaration fails CI.
   The gate additionally hard-fails, with zero tolerance, on phantom capabilities (a `busCommand`
   nothing registers), unproven targets, and any capability with no acceptance test.

3. **`packages/ai-host/src/capabilities/CapabilityRefusal.ts`** — refusals are GENERATED from
   the registry. "I'm not sure how to help with that yet" is replaced by, e.g.,
   *"Wall colour isn't connected to chat yet. I can change wall height, thickness and type."*
   Because the offer is built by `capabilitiesForElement()`, the chat can never offer an ability
   it will then refuse.

4. **`set-wall-type`** is wired end to end: tier-0 grammar and the NL layer share one parser
   (`parseWallTypeIntent`), and the type reference is resolved by the command's own
   `resolveWallSystemTypeRef`, **injected** into the pure resolver as
   `ResolverContext.resolveWallSystemType`. Writing a second matcher inside the resolver would
   have re-created the very defect being fixed.

### ⚠ A capability registry that lies is worse than none

This repository already has one. `packages/input-host/src/operations/ElementCapabilities.ts`
advertises Mirror / Offset / Scale on slab, floor, roof, door, window, column and furniture;
those commands are **wall-only** and refuse at `canExecute` (found 2026-08-10). It was never
checked against the commands it described, and it drifted.

`targets` is therefore verified **two independent ways**, both enforced by the gate and
mirrored in `packages/ai-host/__tests__/chat-capability-registry.test.ts`:

- **Executable (chat side).** Each capability carries a `probe` `SemanticIntent`.
  `applySemanticIntent(probe, ctxSelecting(kind))` is run for every kind in
  `PROBE_ELEMENT_KINDS`, and the accepted set must equal the declared set **exactly**. A
  declared target the guard refuses fails; an undeclared kind the guard *accepts* fails too —
  silent over-reach is the same lie facing the other way.
- **Source-anchored (command side).** `commandProof` names the file that DECIDES which element
  kinds the implementing command can reach, and literals that must appear in it. The gate reads
  the file. An unprovable claim fails.

Neither alone is sufficient: the executable probe would happily certify a resolver that
confidently dispatches into a command that refuses.

**§FIX-CHAT-HEIGHT-OVERCLAIM.** Applying proof 2 immediately found the same lie already inside
this chat. `set-height` accepted **any** element type and routed the non-wall case to
`element.updateParameters`; that command's `resolveStore()` switch has a `default: return null`
arm, so selecting a **room, ceiling, floor, lighting or plumbing** element and saying "set
height to 3m" dispatched a command that resolved no store, changed nothing — and the chat
reported success. `set-height.targets` is now the eleven kinds the command can actually route,
and the other kinds get a capability-aware refusal that says what *is* possible.

### Three states, properly distinguished

The single sentence "I'm not sure how to help with that yet" concealed three different
situations. They are now separate, and named in `ChatResolutionState`:

| state | meaning | behaviour |
|-------|---------|-----------|
| `clarification` | understood; one parameter missing | ask ONE concrete question; remember the pending intent |
| `refusal` | understood; we know we cannot safely do it | say why, and say what IS possible (generated from the registry). Never reaches the LLM |
| `miss` | not understood as a command | fall through to the LLM, unchanged |

A refusal must not be a guess: `capabilityGapRefusal` fires only when it can name **both** a
concrete element kind **and** a topic the editor demonstrably implements but the chat
deliberately does not drive. "Make it cozier" therefore stays a miss — we have no command for
it, so we do not know that we cannot do it.

### Adversarial guard — command-shaped utterances that must not mutate

`nonImperativeReason()` runs on the **raw** utterance, before filler stripping, because the
stripper deliberately removes "I would like to" and a hypothetical marker looks like politeness
once it is gone. Negations ("don't change the wall height"), hypotheticals ("I was thinking
about changing the height", "what would happen if…") and genuine questions become misses. The
guard is narrow on purpose: "could you…" / "would you mind…" are *requests*, not questions, and
still resolve.

### Scope deliberately NOT taken

- **No local semantic model.** Rule-scored classification stays; §26 of the proposal is deferred.
- **No package restructure.** The registry is one directory inside `@pryzm/ai-host`.
- **No preview-before-execute.**
- **The declaration is not literally inside the handler file.** A `chatCapability` field on each
  `CommandHandler` cannot work at runtime — the resolver is a pure L2 module that answers before
  any plugin loads, and a `plugins → ai-host` import would add an SDK-facade bypass (baseline
  172, shrink-only). The coupling is made STATIC instead: the declaration lives in the registry
  and CI proves it against the real registration lists. The guarantee "a feature cannot ship
  without its chat metadata" is delivered by the gate, not by an import.

## No silent gaps (2026-08-10)

**Every one of the 303 registered bus commands is now declared in exactly one of three
places**, and `check-chat-capability-coverage` fails CI (baseline **0**, shrink-only) when a
command appears in none:

1. **Implemented** — a `ChatCapability` (16 capabilities covering 18 commands).
2. **Deferred out loud** — `CHAT_UNAVAILABLE` (51 commands), each with a reason a USER can
   read; the refusal generator speaks these.
3. **Classified** — `ChatCommandClassification.ts` (234 commands), the engineering roadmap:
   **B needs-design 134** (each names its `blockedBy`: a value-source injection, a placement
   grammar, a reference-resolution design) · **C internal 50** (batch executors, derived
   recomputes, registry plumbing — a sentence never means these verbs) · **D duplicate 38**
   (second routes to outcomes the chat already reaches; wiring them would mint two sources of
   truth per ask) · **E unsafe 3** (`*-on-all-*` project-wide generators; blocked on
   preview-before-execute, which this ADR defers) · **F deferred 9** (chat-ready shapes —
   roof overhang, riser height, tread count, light intensity, sheet/view rename — deliberately
   left for the next tranche; nothing blocks them but scope).

The gate hard-fails on: phantom capabilities, unproven/contradicted targets (both proof
directions), a capability with no acceptance test, a classification entry that is stale or
overlaps another surface, and a required parameter whose value source the probe cannot
resolve. All checks have been watched failing (negative tests recorded in the gate header).

## Symmetry tranche (2026-08-10, §FEAT-CHAT-SYMMETRY)

The founding incident was asymmetry (slab colour worked where wall colour did not). The same
audit applied to dimensions found registered-but-unreachable twins, now wired **with per-route
proofs** (a multi-command capability carries one `commandProof` per route):

- `set-thickness` → wall (`wall.updateDimensions`) / slab (`slab.setThickness`) / roof
  (`roof.setThickness`).
- `set-width` (replaces `set-door-width`, whose id encoded the accident that doors got wired
  first) → door (`door.setWidth`) / window (`window.setSize`, the same verb the property
  inspector dispatches) / stair (`stair.setWidth`).
- `set-height` gained **ceiling** via its own `ceiling.setHeight` route — the generic
  parameter command still cannot route ceilings, so the §FIX-CHAT-HEIGHT-OVERCLAIM refusal
  list shrank by exactly the kind that gained a real command, no further.
- New: `set-roof-pitch` (degrees in language, radians at the command, ONE conversion site)
  and `set-room-number` (sibling of `rename-room`).

Where the editor genuinely lacks the twin, the gap is a `CHAT_UNAVAILABLE` entry with the true
reason (all `setMaterial` twins, `handrail.updateColor`, the move/rotate family, hosted
door/window creation, `view.switch` pending a project-views value source) — never a
capability.

## Compound dimensions (2026-08-10, §FIX-CHAT-COMPOUND-DIMENSIONS)

Live repro (build 70667276): *"Make this window 2 meters height, 2 meters width and 0.1
meters sill height"* ended in `window.setSillHeight: canExecute rejected — window not found`.
Two defects, both fixed:

1. **First-number-wins mis-binding.** The NL layer's single-dimension rule took
   `measurements[0]` — the founder's 2 m would have gone to the SILL. The normalizer now
   extracts explicit value↔dimension **bindings** in both orders ("2 meters height",
   "height to 2m"); two or more distinct bindings form a `set-dimensions` compound intent
   and suppress the single-dimension branch.
2. **Plan shape: ONE dispatch.** A command SEQUENCE lets the first dimension change rebuild
   the host wall and re-mint the opening id before later commands dispatch (openings have two
   id namespaces — `elementId` vs `id` — and re-minting is routine). `set-dimensions`
   therefore emits **one command carrying all values**: `wall.updateDimensions` for walls
   (height+thickness in one payload), `element.updateParameters` for windows/doors (the
   parameter set is applied before the single rebuild). Kinds with no proven single
   multi-parameter command refuse with that reason — partial execution presented as success
   is the exact dishonesty this resolver exists to prevent, so an inapplicable property
   refuses the WHOLE compound.

The bridge test replays the founder's sentence against a bus that re-mints ids after the
first dispatch: one `executeCommand` call, all three values in the payload, zero LLM calls.

## Follow-ups and reference precedence (2026-08-10)

`ConversationContext` gained `lastWallTypeScope`. Structured follow-ups now covered (tests in
the NL suite and the bridge spec): *"make this wall 3m / actually 3.2m"* (measurement reuse),
*"change all walls to Interior Partition / actually use Exterior Brick"* (scope reuse through
the SAME injected type lookup — an unknown revision still refuses by listing the catalogue),
*"go to level 2 / actually level 3"* and bare *"actually 3"* (level re-target; a pending
set-intent clarification outranks a stale level context by confidence). Context biases
interpretation only; targeting is rebuilt from the live editor every message.

Reference precedence, explicit: **current selection > explicit coordinates/name in the
utterance > safe conversational reference > clarification.** The resolver never chooses
between plausible elements; with no selection it refuses or asks. (Element-by-name lookup is
class-B work — it needs an element-name catalogue injected into the context.)

## Consequences

- 16 capabilities + the compound form resolve with zero tokens: delete-selected, set-height
  (incl. ceiling), set-thickness (wall/slab/roof), set-width (door/window/stair),
  set-sill-height, set-roof-pitch, set-dimensions (compound, one dispatch), set-wall-type,
  create-wall(coords), go-to-level, add-level, rename-room, set-room-number, undo, redo,
  zoom-fit, zoom-selected. Everything else behaves exactly as before.
- Honest hit-rate expectation: tier 0/1 covers command-shaped utterances with explicit
  parameters; free-form asks ("make it cozier", "generate a layout") remain LLM/pill work.
- Tier 2 (LLM with candidate command set) is deferred; the `miss` arm is its seam.
- The grammar lives in ONE file with a table of intents — adding an intent is adding a
  matcher + tests, not new plumbing.
