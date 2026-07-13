# 09 — Deep Q&A: everything they can ask about your work

They have your CV and (probably) your GitHub. Most of the hour will be them **pulling on threads in PRYZM**.
This document is every thread I can foresee, and how to pull back.

**Three rules for every answer below:**
1. **Answer in one sentence. Then stop.** Let them ask for depth. Monologuing reads as insecurity.
2. **Every claim gets a mechanism.** Not *"it's fast"* — *"it's one draw call because the size lives in the instance matrix."*
3. **When you don't know, say so immediately, then say how you'd find out.** With researchers this *gains* you credit.

---

# A. The opener — "Tell us about PRYZM"

You will get this first. Have three versions ready and **pick by their body language**.

### The 20-second version (use this one)
> *"It's a browser-based BIM platform — you design a building in 3D, it generates the plans and sections, and it exports IFC. TypeScript monorepo, Three.js with a WebGPU renderer, and a geometry kernel doing extrusions and booleans. The part relevant to you is the AI layer: you describe a brief in natural language and it produces a laid-out, furnished, parametric building."*

Then **stop**. They will pick the thread they care about.

### The follow-up they will ask: *"How does the AI part work?"*
> *"The model never touches geometry. It proposes intent; a deterministic engine computes the layout — bubble graph, space syntax, rectangular decomposition, then a Pareto front over candidate layouts. About forty domain rules are validators in code, not sentences in a prompt. If validation fails, the specific failures go back into the next prompt as the feedback signal, up to three attempts. Then a human approves it, and it commits as one command batch — one undo entry."*

### The thing to say if you say nothing else
> *"The whole product still works with the model switched off. That sounds like a limitation, but it's what forced the good architecture — it meant the model could never be load-bearing for correctness."*

---

# B. Architecture

**Q: "Why a monorepo? Why so many packages?"**
> *"Because I wanted the dependency direction to be a fact, not a habit. There's a strict layer graph — schemas at the bottom, plugins at the top — and a layer may import downward only. That's enforced by `eslint-plugin-boundaries` in CI, so an illegal import fails the build."*

**Q: "Isn't that over-engineered for a solo project?"** *(they may well ask this — it's fair)*
> *"Honestly, some of it is. The place it earned its keep is the rules I can't hold in my head: one THREE instance, one requestAnimationFrame, commands as the only mutation path. Those aren't style preferences — breaking any of them causes bugs that take a day to find. So I made them lint rules. The eight-layer split is more debatable, and I'd probably collapse a few packages if I started again."*

**This answer is gold.** It shows you can criticise your own design — the single most senior trait there is.

**Q: "What are these 'principles' you enforce?"**
Name three, with the *bug each one prevents*:
| Principle | The bug it prevents |
|---|---|
| **One THREE instance** | Two copies of Three.js → `instanceof` fails, materials don't match, silent nonsense. |
| **One `requestAnimationFrame`** | Every library wants its own loop; three uncoordinated loops compete for one frame. |
| **Commands are the only mutation path** | Direct store writes bypass undo and the event log — undo silently corrupts. |

**Q: "What does the command bus actually do?"**
> *"Every mutation is a command object with a forward and an inverse patch. That gives undo/redo for free, an audit log, and a natural batching unit — an AI proposal that creates forty elements is one batch, so it's one undo entry. It's also the seam where I validate anything coming from the AI before it can touch the model."*

**Q: "Where's the state?"** — Zustand stores per element type, Immer patches for undo, a registry of ~37 stores. Persistence to Postgres; CRDT (Yjs) for real-time collaboration.

---

# C. Three.js / WebGL — the deep probes

**Q: "Why WebGPU? Was it worth it?"**
> *"Honest answer: mostly for the compute and the node-material pipeline — SSGI, TRAA, outlines via TSL. The cost is that the ecosystem is younger and device loss is real. I keep a WebGL2 fallback and a live backend swap at runtime. If I were shipping to a general audience tomorrow I'd default to WebGL2 and treat WebGPU as opt-in."*

**Q: "Tell me about a rendering bug."** ⭐
> *"On a 40-storey tower the WebGPU device would just die. The cause was a shadow depth texture being destroyed while it was still referenced by an in-flight command submit. Fixed by deferring disposal past the frame boundary. The related lesson: on fallback you have to mint a **fresh canvas** — a canvas that has already held a WebGPU context will refuse to give you a WebGL2 one."*

**Q: "How do you handle 10,000 objects?"**
The ladder, in order: **instancing** (unit geometry + scale in the instance matrix) → **coalescing** instanced meshes per (level × geometry × material): *150 draw calls → 15* → **frustum culling** above 500 elements → **domain culling** (active level ± 1: 40 storeys → 3, ≈13× fewer draw calls) → **massing LOD** (each hidden floor becomes one instanced box, so the silhouette survives) → **quality tiers** with hysteresis → **shadow budgets** (decorative objects lose `castShadow`).

**Q: "What's the hardest part of instancing?"**
> *"Two things. Materials — if each element makes its own, you're silently back to N draw calls and nothing warns you; I ended up with a content-hashed, ref-counted material pool. And **picking** — an instanced group has no per-element id, so naive picking just misses every instanced object. I stamp a `getInstanceElementId(slot)` function onto the mesh's userData at registration so a hit can be resolved back to a real element."*

**Q: "How does your picking work, and why?"**
> *"GPU colour-id picking. A parallel pick scene mirrors each object with a flat material whose colour encodes its id; render one pixel under the cursor into an offscreen target, read it back, decode the id. Constant time, pixel-exact, and it handles instancing. There's a CPU BVH raycast fallback — and a driver-health probe at boot that renders a known id and checks it decodes back, because some drivers silently return zero. If the probe fails, we fall back."*

*(That last detail — the probe — is the sort of thing that makes an interviewer sit up.)*

**Q: "Why not just use OrbitControls?"**
> *"I did at first. I hand-rolled a spherical camera to keep the bundle under a 1.8 MB ceiling and because I needed the camera to mark the frame dirty — rendering is input-driven, so the app renders zero frames when nothing is happening. A 3D app that runs at 60 fps while displaying a static image is just burning battery."*

**Q: "How do you profile?"**
> `renderer.info` (draw calls, triangles, programs) → Chrome performance profile for long tasks → GPU frame capture if fill-bound. **Then**: *"The rule I follow is: measure before you guess. The second bottleneck is never where the first one was."*

---

# D. Geometry & CAD — expect real depth here

**Q: "What geometry kernel do you use?"**
> *"`manifold-3d`, compiled to WASM — union, subtract, intersect over triangle soup. I chose it for manifold-by-construction guarantees, and it's lazily imported so anyone who never booleans doesn't pay the 600 KB."*

**Q: "Why not OpenCASCADE?"** *(be exact — they know OCC)*
> *"OCC is the right answer if you need true B-rep and NURBS. I don't — a building is prisms and extrusions, so a triangle-based manifold kernel is a better fit and a far smaller dependency in a browser. OCC.js is written into our ADR as the swap path if the component editor ever needs real NURBS. So I know the trade-off; I haven't shipped OCC."*

**Q: "What's the difference between B-rep and a mesh?"** — see [05](./05-GEOMETRY-CAD-KERNELS.md). Exact surfaces vs a triangle approximation; STEP/IGES vs STL/glTF; **tessellation is the bridge**, and the browser only wants triangles. *Then turn it into a question about MORFIS: "Are you shipping tessellated meshes to the browser, or keeping a parametric representation client-side?"*

**Q: "Tell me a geometry bug."** ⭐ **Use the seam story.**
> *"A wall with a door was built as three abutting boxes — two piers and a lintel. That creates a T-junction: a full-height face meeting a shorter face with no vertex at the opening's head line. T-junctions shade as a visible seam, and no amount of merging or normal-creasing fixes it, because the vertex isn't there to weld. The fix was to build the wall as a single extrusion from a shape with holes — the faces are continuous by construction, and it costs no CSG at all. The best boolean is the one you don't perform."*

**Q: "How do you know your geometry is correct?"**
> *"Property tests as a merge gate. Two walls joined at every angle from 1° to 179°, thickness from 50 to 600 mm — the result must be manifold and its area within 1% of the analytic answer. And the kernel returns a typed error, `Result.err(NonManifold)`, rather than throwing into the render loop. Generative geometry fails at the edges, not the middle."*

**Q: "What's still broken?"** *(be honest — I promise this scores)*
> *"Wall junctions. A two-wall corner gets a mitre; a three-wall corner gets a different algorithm — a consensus trim — and the two disagree, so adding a third wall to a clean mitre opens a visible wedge. It's open on my tracker right now. The real fix isn't another special case, it's convergence: one algorithm whose result is continuous as the wall count goes from two to three."*

---

# E. AI / LLM

**Q: "Walk me through what happens when a user types a prompt."**
> *"Cache check on a hash of workflow-plus-input. Then a budget pre-check — there's a hard per-call ceiling, and a workflow whose estimated cost exceeds it can't even register. Then the call goes through a relay port to Claude, server-side, so the browser never holds a key. The response comes back as JSON, gets repaired if it was truncated, then hard-validated against ~40 rules. On failure, the specific violations go back into the next prompt. Candidates get scored and ranked. The winner goes on an approval queue — not the command bus — and only on approval does it commit, as one batch, one undo entry."*

**Q: "What's `JSONRepair`?"**
> *"Models truncate at `max_tokens` mid-object. It strips markdown fences, tries a fast parse, and if that fails it does bracket-stack completion to close the object. It rescues a response that would otherwise be a total loss. Honestly, though — that's a workaround. The correct modern answer is native structured output or tool-calling, which makes malformed output unrepresentable instead of merely repairable. That's the first thing I'd change."*

**Q: "Why not just let the model generate the geometry?"** ⭐ *(the question the job exists to answer)*
> *"Because then it isn't testable, and it isn't editable. A model can produce a plausible mesh; it cannot reliably produce a valid, parametric one — and 'plausible' is worthless in a building. So the model does the part it's good at, which is semantics and intent: how many bedrooms, what adjacencies, what's private and what's public. A solver does the part it's good at, which is geometry: exactly, reproducibly, and with unit tests. It also means when the model is down, the product still works."*

**Q: "How do you evaluate the AI output?"**
> *"Validators as a hard gate, and a scoring function to rank candidates. What I don't have — and would want — is a proper benchmark: a fixed set of briefs with expected properties, so 'it got better' is a measurement instead of a vibe. That's what I'd build first in a research setting."*

**This admission is a gift to a research group.** They live on benchmarks.

**Q: "What about cost?"**
> *"Token-to-USD meter, per-plan budgets, a hard per-call ceiling enforced at registration, refunds when a fan-out overshoots, OpenTelemetry counters, and an append-only spend ledger — corrections are compensating entries, never mutations. A response cache means the same input never pays twice."*

**Q: "Have you used tool-calling / RAG / streaming?"** — **No, to all three.** Say so, then say what you'd use them for: *"tool-calling is exactly what I'd use to replace my prompt-contract JSON; RAG I'd want if the model needed to ground in a building-code corpus, which is a real gap; streaming is a UX matter and my workflows are batch, so it never came up."*

---

# F. Backend, data, collaboration

**Q: "How does real-time collaboration work?"** — Yjs CRDT for document sync (its own sync tier), Socket.io for presence and authorised project rooms. *"CRDTs mean merges never conflict at the data level — but they can still lose *intent*, so where a merge would be semantically wrong I surface it as a user-resolvable conflict rather than silently picking a winner."*

**Q: "Why Express and not something modern?"** — *"Inertia, mostly, and it does the job — it's a backend-for-frontend: auth, RBAC, rate limiting, the AI proxy, Stripe, storage. If I were starting today, and especially with a Python kernel in the picture, I'd write it in FastAPI."*

**Q: "How do you secure the AI endpoint?"**
> *"Auth required; the client never holds an API key. The server force-overrides the model id, so a client can't ask for a premium model. It clamps `max_tokens`, caps the request size, and enforces a quota before the call — over quota is a 429, and the call is never made."*

**Q: "Database?"** — PostgreSQL, migrations run at boot, ~15 tables (projects, versions, members, audit log, AI usage, response cache). Row-level security on the Supabase variant.

---

# G. Testing & DevOps

**Q: "How do you test a 3D app?"**
> *"Three layers. Pure geometry is unit-tested and property-tested — the kernel has no THREE and no DOM in it, which is exactly why it's testable. The command/store layer is unit-tested with a mock relay so the AI path runs offline and deterministically. And Playwright for end-to-end. What I deliberately don't do is pixel-snapshot the 3D view — it's brittle and it tells you nothing about why."*

**Q: "What's your CI?"** — lint, layer-boundary checks, an architecture gate (the eight principles + perf budgets), server tests, an accessibility pass, and a Docker-parity job that builds the production image and boot-smokes it. Deploy is blue-green on Fly.io.

**Q: "What's your test coverage?"** — **Don't invent a number.** *"I don't track a coverage percentage — I track whether the things that broke before are guarded now. Every bug I fix ends with a regression test that would have caught it."* Then, if you're feeling brave, the honest one: *"And I found last week that my editor test suite wasn't actually running in CI at all — 1,500 tests, silently not gating anything. Fixing that surfaced two real production bugs."* **That story is worth more than any coverage number.**

---

# H. Product, decisions, trade-offs

**Q: "What would you do differently?"** *(you will be asked — have three, ready)*
1. *"Native structured output / tool-calling from day one, instead of a prompt contract plus a JSON repairer."*
2. *"Fewer packages. The layer rules earned their keep; the granularity didn't."*
3. *"A benchmark for the generative side from the start, so quality was a number and not an opinion."*

**Q: "What are you proudest of?"**
> *"That the deterministic engine means the product degrades gracefully. Turn the AI off and it still lays out a building. Most AI products are a thin shell around a model and they have nothing underneath."*

**Q: "What's the biggest thing you got wrong?"**
> *"I closed bugs at the seam instead of at the outcome — I'd verify that the right function now ran, and not that the user's problem was actually gone. It bit me repeatedly. Now I don't close anything until I've reproduced the original symptom and watched it disappear."*

---

# I. Adversarial / pressure questions

**Q: "You built all this alone. Is it actually good, or is it just big?"**
> *"Both are true in places. It's a real system — it deploys, it has paying-grade infrastructure, it has architectural gates in CI. It also has debt I can point at: two wall-join algorithms that disagree, a test suite that wasn't running, an AI layer that predates structured output. I'd rather show you the tracker than the highlight reel."*

**Q: "Why do you want a 12-month contract when you have your own product?"**
> *"Because I've been teaching myself everything, alone, and I've hit the ceiling of that. This posting is the exact intersection I've been working in, with actual researchers in it. I'd learn faster in a year here than in three more alone."*

**Q: "What if we ask you to work mostly in Python?"**
> *"Then I'd be learning fast for a month and honest about it the whole way. I'd rather tell you that than discover it in week two."*

**Q: "How do we know you can work in a team?"** — Don't be defensive. *"You don't, from PRYZM. What you can see is that I write things down — ADRs, contracts, a decision log — because I've had to hand context to my future self, and that's the same muscle."*

---

# J. Honest limits — know these cold

| If asked… | The truthful answer |
|---|---|
| Largest model handled? | Thousands of elements; a 40-storey tower is where WebGPU device loss appeared. **Don't inflate.** |
| Users? | Be honest about scale. It's a product in development, not a platform with thousands of users. |
| Did you write all of it? | *"I've used AI assistance heavily, and I review everything that lands. The architecture and the decisions are mine."* **Say this if asked — they will respect it, and denying it would be worse.** |
| Test coverage %? | You don't track one. Say what you do track. |
| Is it profitable / live? | It deploys to production at `pryzm.fly.dev`. Don't overstate the commercial side. |

---

# K. The never-say list

| ❌ Never | ✅ Instead |
|---|---|
| "We use OpenCASCADE" | "manifold-3d; OCC is our documented swap path if we need NURBS" |
| "LLM output is Zod-validated" | "JSON repair plus hand-rolled validators — and I'd use structured output today" |
| "I've done tool-calling / RAG / streaming" | "No. Here's what I'd use each for." |
| "I'm proficient in Python" | "I read it fine; I've never shipped a Python service. It's the gap I'd close first." |
| "I've used LangChain" | "No — I built the orchestration myself, and here's why." |
| Any invented number | "I don't have that number. Here's what I do know." |

---

## The meta-answer, if you're ever stuck

> *"I don't know — but here's how I'd find out."*

With a research group, that sentence is a **credential**, not a confession. Use it without shame.
