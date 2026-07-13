# 04 — LLM orchestration & context engineering

The ad asks for **LangChain/LlamaIndex + OpenAI/Anthropic APIs + context engineering + production-grade AI features**.
You have **three of those four, at a depth most candidates won't** — and **zero** of the framework one.

---

## Part 1 — What you actually built (say this proudly)

### The architecture, in one breath

> *"The LLM proposes. A deterministic engine disposes. Nothing the model emits touches the model of the building until it has been repaired, validated, and approved."*

The pipeline, as implemented in `AiPlane.submit()`:

```
cache check (SHA-256 of {workflow, input})
   └─ hit? → return. No budget check, no call, no cost.
budget pre-check (hard $0.18 per-call ceiling)
   └─ over? → a "rejected" action. THE CALL IS NEVER MADE.
emit workflow.start
run the workflow  ──►  Anthropic (via server relay; client never holds a key)
   └─ JSONRepair → parse → HARD VALIDATE (~40 rule validators)
   └─ failed?   → retry ≤3, feeding the SPECIFIC violations back into the prompt
   └─ score → rank → truncate
record cost → cache → emit workflow.propose
   └─ enqueue on the HUMAN APPROVAL QUEUE   ← proposals ride the AI bus, NOT the command bus
approve → emit workflow.commit → commandBus.executeBatch(...)
   └─ ONE batch = ONE undo entry. Full audit trail.
```

**Every arrow there is a design decision you can defend.** That is what "production-grade" means, and it's rarer than framework experience.

### The five things that make it production-grade

| | What | Why it matters |
|---|---|---|
| **1** | **Deterministic engines** — layout (bubble graph → space syntax → rect decomposition → squarify → **deterministic Pareto front**), furniture placement (*explicitly no RNG*), ceilings | The model never computes geometry. Geometry is reproducible and unit-testable. **This is your differentiator.** |
| **2** | **~40 validators as code, not prompts** — corridor connectivity, kitchen work-triangle, door-swing keep-out, wet-cluster grouping, privacy gradient, entry sightline | Domain rules belong in code where they can be tested, not in a prompt where they can be ignored. |
| **3** | **Self-healing retry** — on validation failure, the *specific* violations are fed back: `PREVIOUS ATTEMPT FAILED — fix these: …` | This is context engineering: **the feedback signal is the validator, not the human.** |
| **4** | **Cost governance** — token→USD meter, per-plan budgets, a **hard ceiling enforced at workflow-registration time** (a workflow that *could* cost >$0.18 cannot even register), refunds, OTel counters, an append-only spend ledger where *"bugs are corrected by inserting compensating records, never by mutating history"* | Most people bolt cost tracking on afterwards. You made it a precondition. |
| **5** | **A hexagonal relay port + a mock double** | The entire AI path is testable offline and deterministically. 200+ spec files. |

### The graceful-degradation story (they will love this)

When the AI is unavailable — offline, 401, 5xx — or when *every* candidate fails hard validation, the system **falls back to the deterministic offline layout engine** and says so out loud: `reason: 'AI unavailable — deterministic D-TGL offline layout'`. And a resilient relay **loudly notifies the UI** on fallback, so demo data is never silently passed off as AI output.

> *"The product still works with the model switched off. That was a deliberate constraint, and it forced the good architecture — because it meant the model could never be load-bearing for correctness."*

---

## Part 2 — Context engineering, defined properly

If asked *"what is context engineering to you?"*:

> *"Deciding what the model sees, and what it's allowed to say back."*

Concretely, and all of it true of your system:

1. **Compress the state.** Don't dump the model; send a typed, compact representation of only what's relevant (the room, its neighbours, the applicable rules).
2. **Constrain the output.** Yours: an explicit JSON contract — *"STRICT JSON ONLY, no prose, no markdown fences."*
3. **Repair what comes back.** `JSONRepair` strips fences, fast-paths `JSON.parse`, and **bracket-stack-completes objects truncated by `max_tokens`** — recovering a response that would otherwise be a total loss.
4. **Validate hard, then feed failures back.** The retry loop is the context loop.
5. **Budget it.** Context grows without bound in a design session if you let it; there's a token→cost meter and a hard ceiling.
6. **Cache it.** Identical `{workflow, input}` never pays twice.

---

## Part 3 — The gap, and how to own it

### What you do NOT have — be exact

- ❌ **LangChain / LlamaIndex** — never used.
- ❌ **Tool-use / function-calling** — zero. Output is coerced by *prompt contract*.
- ❌ **Streaming** — none.
- ❌ **RAG / embeddings / vector stores** — none.

### The script

> *"I haven't used LangChain in production. I built the orchestration myself — a workflow registry, a relay port I can mock, a cost meter with hard budgets, a validation-driven retry loop, and a human approval queue — because the hard part in my domain was never chaining prompts. It was the contract between the model's output and a geometry engine that will happily build a non-manifold solid. I wanted that boundary owned and typed.*
>
> *If I'm honest about where my design is dated: I coerce JSON with a prompt contract and then repair it. Today I'd use **native structured output / tool-calling**, because that makes invalid output* unrepresentable *rather than merely detectable. That's the first thing I'd change."*

**Why this works:** it is honest, it demonstrates you understand *why* the framework exists, and it ends with the correct modern answer. You look like someone with judgement, not someone with a hole.

### The vocabulary — one sentence each, be able to say them cold

| Term | One sentence |
|---|---|
| **Agent** | An LLM in a loop with tools and a goal, deciding its own next action. |
| **Tool / function calling** | The model emits a structured call against a schema you defined, instead of prose you must parse. |
| **Structured output** | Constraining generation to a schema (JSON Schema / Pydantic) so the result is guaranteed parseable. |
| **RAG** | Retrieve relevant documents, put them in the prompt, generate grounded in them. |
| **Retriever / vector store** | Embed chunks into vectors; fetch the nearest ones to a query. |
| **Chunking** | Splitting documents so retrieved units are semantically coherent and fit the window. |
| **Memory** | Persisting conversational state across turns (buffer, summary, or vector-backed). |
| **Multi-agent** | Specialised agents (planner, coder, critic) exchanging messages, usually with a supervisor. |

**For MORFIS specifically, the multi-agent shape is likely: interpret (VLLM) → plan → generate CAD code → execute → validate → critique → repeat.** Be ready to sketch that on a whiteboard.

---

## Part 4 — The question they will actually ask

> **"How would you stop an LLM from generating invalid CAD?"**

Answer in four layers, strongest first:

1. **Make invalid output unrepresentable.** Don't let the model write free Python. Give it a **constrained op schema** (tool-calling / structured output) — `extrude(sketch, distance)`, `fillet(edges, r)` — and compile *that* to CadQuery. A model that can only emit valid ops cannot emit invalid ones. *Constrain, don't correct.*
2. **Validate the geometry, not the text.** After execution: manifold? watertight? self-intersecting? zero-volume? Degenerate faces? Cheap and decisive. *(You do exactly this — your kernel returns `Result.err(KernelError.NonManifold)` rather than crashing, and it's property-tested as a merge gate.)*
3. **Close the loop with the failure.** Feed the kernel's own error — and, since it's a *vision*-language model, **a rendered image of what it built** — back for self-correction. *(You do this with validator output; the rendered-view variant is the natural extension in their domain, and saying so shows you understand why they chose a VLM.)*
4. **Push everything you can out of the model entirely.** Anything a solver can do exactly, a solver should do. In my system that's the entire geometry layer.

Then the honest coda:
> *"And I'd want a benchmark, because otherwise 'it got better' is a vibe. I'd measure: does it execute, is the solid valid, is it manufacturable, does it match the request."*

That last sentence is what a **research group** wants to hear.
