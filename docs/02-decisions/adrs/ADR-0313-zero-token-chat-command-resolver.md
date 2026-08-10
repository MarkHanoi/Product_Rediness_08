# ADR-0313 — Zero-token chat command resolver (tier 0/1 + natural-language layer) in the AI panel

- **Status:** Accepted (2026-08-10; §Natural-language layer added 2026-08-10)
- **Owners:** AI panel / ai-host
- **Related:** C16 (command authoring), C03 (commands/state), P6 (commands-only mutation), P8 (spans), §CONTEXT-DATA-HONESTY

## Context

The AI chat panel (`apps/editor/src/ui/ai/AIPanel.ts`) routes **every** utterance through
`aiService.query()` — an LLM round-trip — even for asks that map deterministically onto
existing bus commands ("delete selected", "set height to 3m", "go to level 2", "undo").
Most BIM-editor utterances are command-shaped. Tokens should be the fallback, not the default.

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

## Consequences

- ~13 intents resolve with zero tokens: delete-selected, set-height, set-thickness,
  set-door-width, set-sill-height, create-wall(coords), go-to-level, add-level, rename-room,
  undo, redo, zoom-fit, zoom-selected. Everything else behaves exactly as before.
- Honest hit-rate expectation: tier 0/1 covers command-shaped utterances with explicit
  parameters; free-form asks ("make it cozier", "generate a layout") remain LLM/pill work.
- Tier 2 (LLM with candidate command set) is deferred; the `miss` arm is its seam.
- The grammar lives in ONE file with a table of intents — adding an intent is adding a
  matcher + tests, not new plumbing.
