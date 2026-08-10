# C67 — RAC: The Natural-Language Capability Control Plane

> **Stamp**: 2026-08-10 · **Status**: CANONICAL
> **Authority**: subordinate to `STR-03-engineering-vision.md` / `STR-04-architecture.md`; peers with C03 (commands/state), C11 (element creation), C15 (hosted elements), C16 (command authoring / semantic engine), C65 (element types). Supersedes nothing; ADR-0313 records the implementation decisions under this contract.
> **Scope**: what the chat can do today (AS-IS, verified), what it must become (TO-BE), and the binding architecture for getting there — including composite creation ("create 4 windows 2×2, sill 0.1, at equal distances").

---

## §0 — The one-sentence principle

> **The AI layer is never the source of truth for what the editor can do. The editor registers capabilities; language resolves against them; the LLM is an escalation mechanism, not the command router.**

Everything below is this sentence applied.

---

## §1 — AS-IS (verified against the deployed build `70667276`, 2026-08-10)

### §1.1 The resolution ladder that exists

```
utterance
  → tier 0  deterministic grammar            (0 tokens)
  → tier 1  synonyms + bounded typo repair   (0 tokens)
  → tier NL semantic parse → SemanticIntent  (0 tokens)
  → capability match + refusal/clarification (0 tokens)
  → miss → aiService.query()                 (LLM, fallback only)
```

All local tiers are **pure** (no DOM / store / network in the resolver; context injected). Every mutation goes through `runtime.bus.executeCommand` (P6); multi-command results wrap in `runBatch` (one undo). Destructive resolutions render a Confirm/Cancel card and dispatch nothing until confirmed.

### §1.2 What a user can actually do by talking, today

| Family | Utterances that work (examples) | Command reached |
|---|---|---|
| Wall geometry | "make this wall 3 m tall", "…3000mm high", "a bit thicker → clarification" | `wall.updateDimensions` |
| Wall **type**, bulk | "make all walls interior partition", "retype every wall as…" | `wall.updateSystemTypeBatch` (one undo for N walls; skips-with-reason on raked/layered refusals) |
| Openings dims | "set the door width to 0.9", "sill height 900" | `element.updateParameters` |
| Deletion | "delete the selected wall" → **Confirm/Cancel card** | `element.delete` |
| Creation | "create a wall from 0,0 to 5,0" | `wall.create` |
| Levels | "go to level 2", "take me to the second floor", "add a level" | level switch (local) / `level.add` |
| Rooms | "rename this room to Master Bedroom" | `room.rename` |
| History/view | "undo", "redo", "zoom to fit", "zoom to selection" | local actions |
| Follow-ups | "make it 3 m" → "actually 3.2" · bare "2700" answers a clarification | conversation context (editor state always wins) |

**Honest behaviours that are part of the product, not accidents:**

- *"make all walls white"* → **"Wall colour isn't connected to chat yet. I can change wall height, thickness and type."** — generated from the registry, never hand-written.
- *"make the wall taller"* → asks "What height should I set it to?" — clarification, never a guess.
- *"make all walls timber"* (two matching types) → refuses **naming both candidates** rather than retyping a building on a coin flip.
- *"don't change the wall height"*, *"what would happen if…"* → cannot mutate (adversarial guard on the raw utterance).
- *"make this apartment cozier"* → a genuine miss; goes to the LLM.

### §1.3 The machinery that makes §1.2 trustworthy

- **`ChatCapabilityRegistry`** — 14 capabilities covering 11 commands. Each carries: id, description, verbs/aliases, **proven** target kinds, parameters *with value source* (`wall-system-types`, `project-levels`, `measurement`…), scope, destructive flag, implementing command, a **probe** `SemanticIntent`, a **commandProof** (source anchor), and examples. Plus `CHAT_UNAVAILABLE` — the stated-reason deferral list (the `AUTHORING_UNAVAILABLE` pattern).
- **Two proofs per target** (the ElementCapabilities lesson — a declared-but-unvalidated table *lies*):
  1. the CI gate **executes** each capability's probe across all 16 element kinds and requires *accepted set == declared set exactly, both directions*;
  2. `commandProof` anchors the claim to the deciding source file.
  This machinery immediately caught a live defect: chat said **"Done"** for "set height to 3 m" on a *room* while the command resolved no store and changed nothing (§FIX-CHAT-HEIGHT-OVERCLAIM).
- **Coverage gate** (`check-chat-capability-coverage`, gate 31, shrink-only): 303 registered bus commands, **269 undeclared at baseline**. A new command with no chat metadata turns CI red — the exact failure (`wall.updateSystemTypeBatch` shipped chat-invisible) that motivated this architecture can no longer recur silently.
- **Value resolution** through the *one* existing resolver per source (e.g. `resolveWallSystemTypeRef`: exact id → exact name → case-insensitive → unambiguous word-subset → refusal-with-alternatives). "interior partition" finds `Interior – Partition 100mm` without the user reproducing an en-dash.

### §1.4 AS-IS limitations (true today, not padded)

1. 269 of 303 commands are undeclared to chat — mostly correctly (internal/infra), but unclassified, so the roadmap is not yet knowable from the repo.
2. Selection context is effectively single-element in the bridge; "the three doors I selected" confirms against one.
3. No **composite planner**: one capability maps to one command dispatch. The §3 windows request cannot execute yet.
4. No appearance/material capabilities for walls (the founding asymmetry) — truthfully refused, not yet closed.
5. Reference resolution knows selection + conversation, not names or spatial relations ("the north wall").
6. A phase-3 implementation pass against these limitations is **in flight** as of this stamp; its results land in ADR-0313 and update §1 figures.

---

## §2 — TO-BE: the target architecture

### §2.1 The five layers (target state)

```
1 CONVERSATION   phrasing · pronouns · follow-ups · confirmations · replies
2 SEMANTICS      utterance → SemanticAction {verb, target, scope, property, value(s)}
                 — implementation-independent; stable across command renames
3 CAPABILITIES   the registry as capability GRAPH, families per element kind:
                 geometry · dimensions · type · appearance · lifecycle · openings
                 · levels · rooms · views · navigation — every entry carrying the
                 §1.3 proof obligations
4 PLANNING       SemanticAction + capability → CommandPlan:
                 resolved targets · resolved parameter values · N planned commands
                 · destructive flag · per-command precondition validation
                 (canPlace/canExecute) BEFORE dispatch
5 EXECUTION      plan → runBatch → runtime.bus.executeCommand (P6, one undo)
```

Layer 4 is the substantive addition over AS-IS. It is what turns "one utterance = one command" into "one utterance = a validated programme of commands" — and it is also the layer the LLM will eventually feed (an LLM-produced plan passes the *same* validator; the LLM never gains a private path to the bus).

### §2.2 Three intelligence levels, permanently

| Level | Handles | Tokens |
|---|---|---|
| 0 deterministic | "undo", "set height to 3m" | 0 |
| 1 local semantic | "could you make this wall about three metres tall?", "create 4 windows…", the §3 example | 0 |
| 2 LLM | "make it feel more open without changing the envelope" — *consuming the same capability registry as its tool list* | paid, rare |

The end-state invariant: **level 2 receives the capability graph as its tools**. One registry feeds local resolution, LLM tool selection, the command palette, help, and suggestions — one source of truth, four consumers.

### §2.3 What the user will be able to do

Every command classified **A (chat-safe)** in the §5 roadmap becomes speakable, and — via the planner — *composable*: quantities, distributions, symmetric edits across kinds ("do the same to the slabs"), scoped bulk edits ("all exterior walls on level 2"), and honest previews of counts before destructive or project-wide plans ("I found 42 walls — apply?").

---

## §3 — The canonical composite case: *"select a wall → create 4 windows, 2×2, sill 0.1, at equal distances"*

This request is the acceptance test for layer 4. Traced end-to-end in the TO-BE architecture:

```
1 SEMANTICS   {verb: create, target: window, quantity: 4,
               dims: {w:2, h:2}, sill: 0.1, distribution: equal-spacing,
               host: current selection}
2 CAPABILITY  window.create-on-host  (family: openings/creation)
              — parameters declare sources: quantity:int, dims:measurement²,
                sill:measurement, distribution:enum{equal|centered|from-start},
                host:selection(kind=wall)
3 PLANNING    host = selected wall (refuse with reason if none / not a wall /
              RAKED — the L-812 gate, surfaced as chat text, never a throw)
              L = wallLength(host)          ← ARC length on curved hosts (the
                                              WallOccupancyStore convention)
              equal spacing, n=4, w=2:
                gap = (L − 4·2) / 5 ;  offsets oᵢ = gap·i + 2·(i−1) + gap… 
                (closed form; refuse if gap < min jamb: "4 windows of 2 m need
                 ≥ 10.4 m of wall; this wall is 8.2 m — 3 fit, shall I?")
              VALIDATE each: WallOccupancyStore.canPlace(host, oᵢ, 2) — the same
              gate the mouse uses; any conflict → per-window skip-with-reason
              or a counter-proposal, decided by policy, never silently dropped
4 CONFIRM     "4 windows, 2×2 m, sill 0.10 m, equally spaced on the selected
               8.2 m wall — place them?"  [Apply] [Cancel]
               (creation is reversible, but multi-element creation is
                project-shape-changing: plan preview is cheap honesty)
5 EXECUTION   runBatch → 4 × ADD_OPENING with the C15 payloads (window type from
              C65 defaults or a named type via the value resolver) → ONE undo
6 REPLY       "Done — 4 windows placed at 1.24 m intervals." or the honest
              partial: "Placed 3; the 4th conflicted with the door at 6.1 m."
```

**Why this is architecturally cheap here:** every hard part already exists as a proven primitive — `canPlace` (arc-aware, rake-refusing), `ADD_OPENING`, C65 type defaults, the C15 hosted-element frame, `runBatch`, the refusal grammar. The planner adds *arithmetic and orchestration*, not new geometry or a second mutation path. That is the C16 semantic-engine direction: chat compiles intent into the same commands the UI uses.

The same planner shape then gives, nearly for free: "add a door every 3 m", "move all windows up 200 mm", "mirror these openings to the opposite wall", "replace every window on this facade with the large fixed type".

---

## §4 — Binding architecture rules (merge-blocking, aligned with STR-03/04)

1. **P6 absolutism** — chat (and any LLM output) mutates only via the bus. An LLM may *propose* a `CommandPlan`; it passes the same validator; there is no direct-execute path. Ever.
2. **Purity** — the resolver stays free of DOM/stores/network; all context injected. This is what keeps it testable at 200+ tests and instant.
3. **Two proofs per target** — probe-executed acceptance == declaration (both directions) + source-anchored commandProof. A capability the gate cannot prove does not ship.
4. **Registry = only source of chat truth** — no second intent list, no per-feature `if` ladder. Chat metadata is declared with (and CI-checked against) command registration; a command without metadata turns the coverage gate red.
5. **Honesty invariants** — refusal ≠ clarification ≠ miss; recognized-but-unsafe never reaches the LLM; "Done" only after a command reports success; partial results reported as partial ("Changed N of M — K skipped: reason"); ambiguity refuses with alternatives.
6. **Shrink-only gates** — coverage baseline (269), like every ratchet in this repo, only goes down; bumps need a dated in-code justification.
7. **No fictional capabilities** — the registry describes what the editor *does*, never what we wish it did. If the editor can't do it, the truthful entry is `CHAT_UNAVAILABLE` with the reason.
8. **Determinism before models** — a local semantic model, if ever added, sits behind the existing resolver interface, outputs `SemanticAction` only, and its output passes the same validation. It never becomes a mutation path (§4.1 still applies). Deferred until the deterministic ladder demonstrably plateaus.

---

## §5 — Roadmap (each phase shippable alone; conflict order: STR → this contract → ADR-0313)

| Phase | Deliverable | State |
|---|---|---|
| **1–2** | Registry, coverage gate, honest refusals, first proven capabilities | ✅ shipped (`603e0d32`, live `70667276`) |
| **3** | 269-command A–F classification (the roadmap artefact) · symmetry audit across all element kinds · class-A capabilities implemented · structured follow-ups · reference precedence · `CommandPlan` validation · no-LLM proof per capability | 🔄 **in flight** (agent, brief of 2026-08-10) |
| **4** | **The planner** (§2.1 layer 4): quantity/distribution arithmetic, per-command precondition validation, plan preview + Apply/Cancel for multi-element and project-wide plans. Acceptance test = §3 verbatim | next |
| **5** | Multi-select bridge parity ("the three doors") · named/spatial references ("the north wall") · capability-derived "what can I do with walls?" | after 4 |
| **6** | LLM tier consumes the registry as its tool list; LLM plans pass the §4.1 validator; measured token telemetry proving the 0-token share | last |

**Definition of done for the contract**: a user can speak any request whose primitives the editor supports — single or composite — and receive either a correct one-undo execution, a truthful clarification, or a refusal that names what *is* possible; and no capability can ship chat-invisible because CI forbids it.

---

## §6 — Governance: how a new feature ships chat-ready

Any PR adding a user-facing bus command MUST either:

1. declare its chat capability (metadata + probe + commandProof + acceptance test + no-LLM test), **or**
2. add a truthful `CHAT_UNAVAILABLE` / internal classification.

The coverage gate enforces this arithmetically; the probe gate enforces it semantically. Review question for every capability PR: *"does the registry entry describe what the command provably does — nothing more, nothing less?"*
