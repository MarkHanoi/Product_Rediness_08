# 01 — MORFIS, decoded

> The invitation says the technical discussion is *"related to the position and the MORFIS project"*.
> This is the single highest-leverage thing to know. Read it twice.

---

## What MORFIS is

**Morfis: AI-Assisted Physical Product Customization** — an AI-native design platform out of SnT, presented on a startup track.

| Aspect | What it does |
|---|---|
| **Goal** | Make CAD usable by **non-experts** — hobbyists, educators, product teams — who have intent but no modelling skill. |
| **Input** | **Natural language + images** (multimodal). |
| **Architecture** | **Modular, multi-agent**, powered by **vision-language large models (VLLMs)** acting as *CAD agents*. |
| **Method** | A multi-stage framework that converts user input into **executable CAD code**. |
| **Execution** | Open-source CAD environments: **CadQuery** and **FreeCAD** (both Python; FreeCAD sits on the **OpenCASCADE** kernel). |
| **Output** | **Fully parametric** models — editable *after* generation — and **manufacturable** (3D printing). |

### The crucial inference

**CadQuery and FreeCAD are Python.** That is *why* the job ad demands Python + FastAPI. And the Three.js/WebGL half is the **browser front end** that renders and lets you interact with the generated model.

So the system shape is almost certainly:

```
user (text + image)
      │
      ▼
  VLLM agent(s)  ──►  CAD code / ops  ──►  CadQuery / FreeCAD (Python, OCC kernel)
      ▲                                              │
      │                                              ▼
   feedback?                                  tessellated mesh (glTF/STL)
                                                     │
                                                     ▼
                                        Three.js / WebGL viewer in the browser
                                                     │
                                              FastAPI REST between them
```

**Frame every answer against that diagram.** You have built the right-hand side (3D viewer, geometry, parametric model) and the top (LLM → structured intent → geometry). The gap you must own is the Python middle.

---

## Their research context — know these names

CVI² (Computer Vision, Imaging and Machine Intelligence), led by **Prof. Djamila Aouada**, works on applied computer vision and machine intelligence — space, Industry 4.0, inspection, healthcare, automotive.

**Most important adjacent paper — almost certainly the same team:**

> **CAD-Assistant: Tool-Augmented VLLMs as Generic CAD Task Solvers**

That title tells you their intellectual frame: a **VLLM that calls tools** over a CAD kernel, rather than a model that blindly emits code. Expect the discussion to live here.

The wider field they're competing in (skim so the names don't surprise you):
- **CAD-Coder** — an open vision-language model for CAD code.
- **CADBench** — a multimodal benchmark for AI-assisted CAD program generation.
- **CADSmith** — multi-agent CAD generation with **programmatic geometric validation**.
- **ArtiCAD** — articulated CAD assembly via multi-agent code generation.

Notice the pattern in those titles: **multi-agent** and **geometric validation**. The field has converged on your thesis — *the model cannot be trusted with geometry; validate it programmatically.* That is exactly what PRYZM does. **This is why you fit.**

---

## The hard problem in their domain (and your answer)

The naïve pipeline — *"LLM writes a CadQuery script, we `exec()` it"* — fails in five ways:

| Failure | Why it happens | The mitigation you can articulate |
|---|---|---|
| **Code doesn't run** | Hallucinated API, wrong arity | Constrain output to a **typed op schema**, not free-form Python. Then compile the schema to CadQuery — a model that can only emit valid ops cannot emit invalid ones. |
| **Code runs, geometry is wrong** | Model can't "see" what it built | **Render it and show the model** — this is where the *vision* half of a VLLM earns its keep. Self-correction over a rendered view. |
| **Solid is invalid** | Non-manifold, self-intersecting, zero-volume | **Programmatic geometric validation** after execution. Cheap, decisive, non-negotiable. |
| **Not manufacturable** | Wall too thin, overhangs, unprintable | Domain rules as *code*: min wall thickness, overhang angle, minimum feature size. |
| **Not editable** | One-shot mesh, no history | Preserve the **op history / parameters** — that's what "parametric" means and it's what lets the user re-prompt. |

**Your line:** *"The interesting problem in text-to-CAD isn't generation — models are good at generation. It's validity. So I'd push as much as possible out of the model: give it a constrained op vocabulary rather than free Python, validate the solid geometrically after execution, and feed the kernel's own errors plus a rendered image back for self-correction."*

That single paragraph demonstrates you understand their project better than most candidates will after a week of reading.

---

## Where PRYZM maps onto MORFIS, one-to-one

| MORFIS | PRYZM |
|---|---|
| VLLM CAD agents | Anthropic Claude workflows in `packages/ai-host` (incl. **image input** — floor-plan raster → BIM) |
| Multi-agent modular pipeline | `AiPlane` + `WorkflowRegistry` — registered workflows, a bus, an approval queue |
| Generate executable CAD code | Generate **JSON intent** → repaired → validated → typed **commands** → geometry |
| CadQuery / FreeCAD kernel | `packages/geometry-kernel` — extrude, revolve, sweep, loft, boolean via **manifold-3d** |
| Parametric, re-editable output | Every element is a parametric BIM object with a systemType, editable, IFC-exportable |
| Manufacturability rules | ~40 **validators** — clearances, corridor connectivity, door swings, kitchen triangle |
| Web viewer | Three.js + WebGPU renderer, GPU picking, instancing, plan/section drawing generation |

**The difference worth admitting:** MORFIS lets the model *write code*; PRYZM never does — the model emits intent and a **deterministic engine** produces the geometry. Present that as a considered position, and be curious about theirs. That's a peer conversation, not an interview.

---

## Three questions that will impress them

1. *"Is your intermediate representation free-form Python, or a constrained op schema you compile to CadQuery? I ask because that choice decides how much validation you can do before execution rather than after."*
2. *"How do you validate the generated solid — geometric checks like manifoldness and self-intersection, or is a kernel exception your signal? And is the vision model in a self-correction loop over a rendered view?"*
3. *"On the front end, are you shipping tessellated meshes to the browser, or keeping a parametric representation client-side so the user can edit without a round-trip?"*

Any of these tells them you have actually built this.
