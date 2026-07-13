# 10 — System design: *"How would you build MORFIS?"*

**This is the most likely whiteboard question in the technical discussion**, and it is the one where you can
outclass every other candidate — because you have already built the analogue.

Do **not** start drawing boxes. Start by naming the hard part.

---

## Step 0 — The opening move (say this before you draw anything)

> *"Before I design it — the hard part here isn't generation, it's **validity**. Models are good at producing
> plausible CAD code. Plausible is worthless: it either doesn't run, or it runs and produces a solid that's
> non-manifold, or it's manifold but unmanufacturable. So I'd design the whole system around **where I put the
> validation**, and around **how little I let the model decide.** Can I sketch it that way?"*

You have now framed the entire discussion on your turf. Everything below is a consequence of that sentence.

---

## Step 1 — The pipeline

```
   ┌── user: text + image ("a phone stand, 15° tilt, for a 7mm-thick phone")
   │
   ▼
┌─────────────────────┐
│ 1. INTERPRET (VLM)  │  text + image → structured DESIGN INTENT
│                     │  { type: stand, tilt_deg: 15, slot_w_mm: 7, ... }
└─────────┬───────────┘  ← NOT code yet. Intent is cheap to validate.
          │
          ▼
┌─────────────────────┐
│ 2. PLAN             │  intent → an ordered OP GRAPH
│                     │  [ sketch, extrude, cut, fillet ]
└─────────┬───────────┘  ← a CLOSED VOCABULARY, not free Python
          │
          ▼
┌─────────────────────┐
│ 3. COMPILE          │  op graph → CadQuery script   (deterministic! no model)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 4. EXECUTE          │  CadQuery / FreeCAD (OCC) in a SANDBOX, with a timeout
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│ 5. VALIDATE         │  geometric: manifold? watertight? self-intersecting? volume > 0?
│                     │  manufacturable: min wall thickness, overhang angle, min feature
└─────────┬───────────┘
          │  ✅ pass                    ❌ fail
          │                              │
          ▼                              ▼
┌─────────────────────┐        ┌──────────────────────────┐
│ 6. TESSELLATE       │        │ 6b. CRITIQUE / REPAIR    │
│    B-rep → glTF     │        │  render it → show the VLM│
│                     │        │  + the kernel's error    │
└─────────┬───────────┘        │  → back to step 2        │
          │                    └──────────────────────────┘
          ▼                       (bounded: N attempts, then fail loudly)
┌─────────────────────┐
│ 7. VIEWER (Three.js)│  render mesh + expose the PARAMETERS for direct edit
└─────────────────────┘         │
                                └── param change → re-run from step 3 (NO model call!)
```

**Call out that last arrow explicitly.** It is the difference between a demo and a product:

> *"Once the op graph exists, editing a parameter must not require the model at all. You re-run the compile
> and execute steps. That's what makes it feel like CAD instead of a slot machine — and it's most of your
> inference bill gone."*

---

## Step 2 — The five decisions that matter (and your position on each)

### Decision 1 — What does the model emit? ⭐ **the crux**

| Option | Verdict |
|---|---|
| **Free-form Python/CadQuery code** | Maximum expressiveness, maximum failure surface. Arbitrary code execution. Nearly unvalidatable *before* it runs. |
| **A constrained op schema** (tool-calls / structured output) | ✅ **This.** Validate before executing. Invalid becomes *unrepresentable*, not merely detectable. Sandboxing is trivial because you control the compiler. |

> *"I'd give the model a closed vocabulary of parametric operations and compile that to CadQuery myself.
> A model that can only emit valid ops cannot emit invalid ones. You lose some expressiveness at the edges —
> and I'd want to know from you where that ceiling actually bites, because that's the argument for free-form."*

**Then concede the counter-argument honestly** — that's what makes it a discussion:
> *"The honest cost is that a closed vocabulary caps what users can ask for. So I'd want an escape hatch:
> a reviewed, sandboxed free-code path for the long tail, with a much heavier validation gate."*

### Decision 2 — Where does the vision model earn its keep?

> *"Not primarily on input — on **feedback**. Render the intermediate solid and show it back to the model.
> Text errors from a kernel are cryptic; a picture of a phone stand with the slot on the wrong face is not.
> That's the loop that makes a VLM worth the cost over an LLM."*

**This is almost certainly what their CAD-Assistant work is about. Saying it unprompted is a strong signal.**

### Decision 3 — Multi-agent, or one model with tools?

Be sceptical, but constructively:
> *"I'd start with **one model plus tools**, and only split into agents where I can name the reason.
> A planner/coder/critic split is justified when the roles need different context or different models —
> e.g. a cheap fast model for op generation, an expensive vision model only for the critique step, which is
> also a cost argument. Multi-agent for its own sake mostly buys you latency and debugging pain."*

Cost-tiering agents is a very "production" thing to say, and it's the sort of thing you actually did (haiku vs sonnet).

### Decision 4 — Where does state live?

> *"The **op graph is the source of truth**, not the mesh. Persist that. The STEP file and the glTF are both
> derived artefacts. That's what makes it re-editable, re-promptable, versionable and diffable — you can show
> a user what changed between two prompts, which you can't do with meshes."*

### Decision 5 — Sync or async?

> *"CAD execution is seconds, not milliseconds, and the repair loop multiplies it. So it's a **job queue** —
> `POST /generate` returns a job id, the client polls or subscribes over a websocket, and you stream partial
> results. It also gives you retries, cancellation and a natural place to cap spend."*

---

## Step 3 — The API (they'll want to see it, and it's FastAPI-shaped)

```python
POST /designs                 → { design_id, job_id }       # submit intent (text + image)
GET  /jobs/{job_id}           → { status, stage, error? }   # queued|planning|executing|validating|done
GET  /designs/{id}            → { op_graph, params, validation }
PATCH /designs/{id}/params    → re-execute from the compile step (NO model call)
GET  /designs/{id}/mesh.glb   → tessellated, for the viewer
GET  /designs/{id}/model.step → B-rep, for manufacture
POST /designs/{id}/critique   → force a repair round
```

**Say why `PATCH /params` is separate:** *"That's the cheap path. It's the one users will hit most, and it must never touch the model."*

---

## Step 4 — What you'd measure (say this unprompted — it is what a research group lives on)

> *"I'd want a benchmark before I'd trust any of it, otherwise 'it got better' is a vibe."*

| Metric | Question it answers |
|---|---|
| **Execution rate** | Does the generated code even run? |
| **Validity rate** | Is the solid manifold, watertight, non-self-intersecting? |
| **Manufacturability rate** | Does it pass the domain rules? |
| **Intent match** | Does it do what was asked? *(hardest — needs human labels or a VLM judge, and a VLM judge needs its own validation)* |
| **Repair convergence** | How many attempts to pass? Does the loop converge or oscillate? |
| **Cost / latency per accepted design** | The number that decides if this is a product. |

> *"And I'd track them **per stage**, because 'it failed' is useless. Failing at compile is a schema problem;
> failing at execute is a kernel problem; failing at validate is a reasoning problem. They have completely
> different fixes."*

---

## Step 5 — Failure modes to raise before they do

| Failure | Mitigation |
|---|---|
| **Selectors** — `.faces('>Z')` requires reasoning about geometry it built but cannot see | The single biggest source of subtle wrongness. **Render and show it.** Or use stable, named references instead of positional selectors. ⭐ *Raise this one — it's the deepest thing you can say about CadQuery.* |
| Model emits valid code, wrong object | Only caught by intent-match eval or the human. |
| Repair loop oscillates | Bound it. Detect no-progress (the same failure twice → stop, don't burn tokens). |
| Kernel hangs or explodes | Sandbox + timeout + memory cap. **Never run model-authored code in your API process.** |
| Cost runs away | Per-request ceiling enforced *before* the call; cache on a hash of the input. *(You've built exactly this.)* |
| Non-determinism | Pin the model version; temperature 0 for the compile stage; snapshot the op graph, not the prose. |

---

## The sentence to end on

> *"The shape of my answer is: **push everything you can out of the model.** Let it do intent and repair —
> the parts that need judgement — and make everything downstream deterministic, typed and testable. That's
> the same conclusion I reached building the building version of this, and the reason is the same: it's the
> only version you can put in front of a real user."*

Then hand it back: *"But you've been living in this — where does that break down for you?"*

**End on a question. You want a conversation, not a monologue.**
