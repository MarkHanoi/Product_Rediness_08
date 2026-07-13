# 06 — The Python / FastAPI / CadQuery gap

**This is your one real weakness. Read this document even if you read nothing else.**

There is **zero Python** in PRYZM. No `.py`, no `requirements.txt`, no `pyproject.toml`. Their stack is Python
(CadQuery and FreeCAD are Python libraries). They *will* find out. **Own it in the first ten minutes.**

---

## The script (memorise the shape, not the words)

> *"Let me be straight about the gap: my production backend is Express and TypeScript, not FastAPI, and PRYZM has no Python in it. What I do have is the thing underneath — a versioned REST API with auth, RBAC, rate limiting, OpenAPI generation and a Postgres layer, all schema-first with Zod, which is Pydantic's twin. So the concepts port one-for-one; the syntax is what I'd be picking up, and given your kernel is CadQuery I'd want to be in Python anyway. Realistically that's days, not months — and I'd rather tell you that now than have you find it later."*

**Why this works:** it names the gap, proves the transferable substrate, gives an honest ramp estimate, and shows self-awareness. Interviewers forgive gaps. They do not forgive bluffing — *especially* researchers.

---

## Do this before the interview (30 minutes, high ROI)

You want to say **"I've written FastAPI"** truthfully. So write it. Run it. Then you have.

```bash
pip install fastapi uvicorn pydantic
```

```python
# main.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="tiny-cad")

class BoxRequest(BaseModel):
    width:  float = Field(gt=0, description="mm")
    height: float = Field(gt=0)
    depth:  float = Field(gt=0)
    fillet: float = Field(default=0, ge=0)

class BoxResponse(BaseModel):
    volume: float
    valid:  bool

@app.post("/box", response_model=BoxResponse)
def make_box(req: BoxRequest) -> BoxResponse:
    # a fillet cannot exceed half the smallest edge — a domain rule, in code
    if req.fillet > min(req.width, req.height, req.depth) / 2:
        raise HTTPException(422, "fillet too large for the smallest edge")
    return BoxResponse(volume=req.width * req.height * req.depth, valid=True)
```

```bash
uvicorn main:app --reload   # then open http://127.0.0.1:8000/docs
```

**What you just learned, and can now say:**
- **Pydantic models = your Zod schemas.** Validation is declarative and automatic.
- FastAPI **generates OpenAPI docs from the types** — the same thing your `gen:openapi` script does by hand.
- The **422 on a domain rule** is exactly your "validators as code" pattern, in their language.

> *"I sat down with FastAPI — the model is Pydantic in, Pydantic out, validation for free, OpenAPI generated from the types. It's the same schema-first discipline I already work with, just less ceremony than I'm used to."*

---

## CadQuery — the 15-minute primer

This is what their LLM *emits*. Being able to read it is a real advantage.

```python
import cadquery as cq

# a fluent, chainable modelling API — each call returns a new Workplane
result = (
    cq.Workplane("XY")          # start on a plane
      .box(80, 60, 10)          # a solid
      .faces(">Z")              # SELECT the top face  ← selectors are the heart of CadQuery
      .workplane()              # a new sketch plane on it
      .hole(22)                 # cut a hole
      .edges("|Z")              # all vertical edges
      .fillet(2)                # round them
)

cq.exporters.export(result, "part.step")  # B-rep out (parametric!)
cq.exporters.export(result, "part.stl")   # mesh out (for printing / the browser)
```

**The three things to notice — and to say out loud:**

1. **It's a fluent chain of operations, not a mesh.** The result is a **parametric history**. Change `80` and rebuild; that's what "fully parametric" in their pitch means.
2. **Selectors (`>Z`, `|Z`, `#X`) are the hard part for an LLM.** `.faces(">Z")` means "the face furthest along +Z". A model must *reason about the geometry it has already built* to pick the right one — and it can't see it. **This is the crux of their problem, and it's an outstanding thing to raise.**
3. **It exports both** STEP (B-rep, parametric) and STL (mesh, printable/renderable) — the tessellation bridge from [05](./05-GEOMETRY-CAD-KERNELS.md).

### The insight to bring up unprompted

> *"The part that would worry me in a text-to-CAD pipeline is **selectors**. `.faces('>Z')` requires the model to reason about geometry it has already constructed but cannot see. That's where I'd expect most failures — not in the syntax, in the spatial reference. Which is presumably exactly why you're using a vision model: render the intermediate state and let it look. Is that what the loop does?"*

If you say one thing that makes them lean forward, make it that.

---

## FreeCAD — the 5-minute version

- A full open-source parametric CAD app, **scriptable in Python**, built on the **OpenCASCADE** kernel.
- Document → objects → features; a **dependency-graph rebuild** (change a parameter, downstream features recompute) — conceptually identical to PRYZM's command → rebuild → dependency-resolver chain.
- Runs **headless** for server-side generation. That is presumably how MORFIS executes.

---

## What you can honestly say about Python

- ✅ *"I can read it fluently and I've written it, but I've never shipped a Python production service."*
- ✅ *"Everything I'd need — async, typing, Pydantic — maps onto what I do daily in TypeScript."*
- ❌ Do **not** say "I'm proficient in Python." One follow-up question and it collapses.

**The maturity move:** *"If you hired me, the first week would be me getting properly fluent in CadQuery and FastAPI rather than pretending I already am. The 3D, the geometry validity, and the AI-to-geometry contract I can contribute to on day one."*

---

## What to say if they ask you to write Python live

Don't panic and don't fake it. **Narrate.**

> *"I'll write this in Python — flag me if I reach for a TypeScript idiom, it's the language I've been living in."*

Then write simple, correct, well-named Python. **They are not testing your syntax; they are testing whether you can decompose a problem, and whether you're honest when you're outside your comfort zone.** Type hints will make you look better and cost nothing:

```python
def tessellate(solid: Solid, tolerance: float = 0.1) -> Mesh:
    ...
```
