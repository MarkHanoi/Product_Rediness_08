# 11 — Fundamentals drill

A research group will test whether you understand **what's underneath** Three.js, not just its API surface.
Rapid-fire. Cover the answer, say it out loud, check.

---

## Graphics fundamentals

**Q: Walk me from a vertex in a model to a pixel on screen.**
> Model space → **model matrix** → world space → **view matrix** (the camera's inverse transform) → view/eye space → **projection matrix** → clip space → *perspective divide by w* → NDC (−1…1) → **viewport transform** → screen pixels. The vertex shader does the first part; the rasteriser interpolates across the triangle; the fragment shader colours each pixel; the depth test decides who wins.

**Q: What's the difference between the projection and the view matrix?**
> The **view** matrix moves the world so the camera sits at the origin — it's the *inverse* of the camera's transform. The **projection** matrix turns the viewing volume into a cube, and for perspective it puts the depth into `w` so the divide creates foreshortening.

**Q: Why perspective divide?**
> It's what makes distant things smaller. The projection matrix writes `-z` into `w`; dividing x and y by `w` scales them down with distance. It's also why interpolation across a triangle must be *perspective-correct* — naïve linear interpolation of UVs in screen space warps textures.

**Q: What's the depth buffer, and what's z-fighting?**
> A per-pixel depth; a fragment is discarded if something nearer already wrote there. **Z-fighting** is two coplanar surfaces whose depths round to the same value and flicker. Causes: too-large a `far/near` ratio (depth precision is distributed non-linearly — most of it sits near the near plane), or genuinely coincident geometry. Fixes: **raise `near`** (much more effective than lowering `far`), use a logarithmic depth buffer, add a polygon offset, or just don't put two surfaces in the same place.

*(You have a real version of this: PRYZM uses a logarithmic depth buffer for large-scale geospatial scenes.)*

**Q: What's a draw call, and why do we care?**
> One command to the GPU to draw a batch of primitives. Each one has CPU-side setup and driver overhead — so 10,000 objects at one draw call each is CPU-bound long before the GPU breaks a sweat. **Instancing** is the fix: one draw call, N transforms.

**Q: CPU-bound or GPU-bound — how do you tell?**
> If reducing resolution changes nothing, you're **CPU-bound** (draw calls, JS). If it fixes it, you're **fill/GPU-bound** (shaders, overdraw, shadows, post-FX). `renderer.info` gives you draw calls and triangles; the profiler gives you where the frame time went.

**Q: What is overdraw?**
> Shading the same pixel more than once because things are drawn back-to-front over each other. Transparency is the classic offender — it can't use the depth test to skip work.

**Q: Why is transparency hard?**
> Order matters: transparent surfaces must blend back-to-front, which means sorting per-object (and even that fails for intersecting geometry). And they can't write depth without occluding what's behind. Hence order-independent transparency techniques — and hence the fact that a scene with a lot of glass is genuinely hard.

**Q: What's a normal, and why can't you transform it with the model matrix?**
> A surface's perpendicular. Non-uniform scale breaks it — a normal transformed by the model matrix stops being perpendicular. You use the **inverse transpose** of the upper-left 3×3. *(That's what THREE's `normalMatrix` is.)*

**Q: What's frustum culling vs occlusion culling?**
> **Frustum**: skip what's outside the camera's viewing volume — cheap, standard. **Occlusion**: skip what's *inside* the frustum but hidden behind something else — much harder, needs a depth pre-pass or GPU queries. Most engines do the first and approximate the second.

**Q: What's a PSO / shader compile stall?**
> A pipeline-state object — the compiled GPU program plus its state. Compiling is expensive and, done at first draw, causes a visible hitch. **You have a story here:** ~1,000 PSOs compiling in one frame produced a 14-second stall; the fix was prewarming them offscreen at near-zero scale so they compile before they're needed.

**Q: MSAA vs FXAA vs TAA?**
> **MSAA** super-samples at geometry edges only — clean, expensive, doesn't help shader aliasing. **FXAA** is a cheap post-process blur that finds edges in the image — fast, slightly soft. **TAA/TRAA** accumulates across frames using velocity vectors — best quality, but risks ghosting on movement. *(You run TRAA on the WebGPU path.)*

---

## WebGL / WebGPU

**Q: WebGL vs WebGPU, in one breath?**
> WebGL is an OpenGL ES-era API — global state machine, no compute. WebGPU is modern, explicit — command encoders, bind groups, **compute shaders**, better multithreading, less driver overhead. WebGPU costs you ecosystem maturity and gives you device-loss as a real thing you must handle.

**Q: What's device loss and how do you survive it?**
> The GPU context goes away — driver reset, tab backgrounded, OOM, or your own bug (e.g. destroying a texture that's still referenced by an in-flight submit). You must be able to **rebuild every GPU resource from CPU-side truth**. Which is a design constraint, not an error handler: your scene must be reconstructible.

**Q: What's a compute shader good for here?**
> Anything data-parallel that isn't drawing: culling, particle systems, physics, and — relevant to CAD — **mesh processing, BVH builds, SDF work**.

---

## Geometry / CAD

**Q: What does *manifold* mean, and why do you care?**
> Every edge is shared by exactly two faces; the surface is watertight and has a well-defined inside. It matters because booleans, volume, and 3D printing are all undefined on a non-manifold solid. **It is the single most important validity property of generated geometry.**

**Q: How does a boolean actually work?**
> Intersect the surfaces, classify each resulting piece as inside/outside the other solid, keep the pieces the operation wants, stitch. The hard part is **numerical robustness at near-coincident faces** — which is exactly why kernels use exact predicates, and why generated CAD (with its arbitrary near-degenerate inputs) breaks them.

**Q: B-rep vs mesh?** → [05](./05-GEOMETRY-CAD-KERNELS.md). Exact vs approximate; STEP vs STL; **tessellation is the bridge**.

**Q: What's a BVH and why?**
> A bounding-volume hierarchy — a tree of nested boxes. Turns "which triangle did this ray hit" from O(n) into O(log n). Used for raycasting, picking, collisions, and (in your case) sun-hours raycasting.

**Q: Why is a T-junction bad?**
> A vertex on one face lies mid-edge on its neighbour, so the two don't share a vertex. It shades as a **seam** and can crack under transformation — and no amount of merging fixes it, because the vertex isn't there to weld. *(Your wall-opening story.)*

---

## LLM fundamentals

**Q: What is temperature?**
> How much probability mass you sample from beyond the most likely token. **0 = deterministic** — which is what you want for anything you intend to compile.

**Q: What's a context window, and what happens when you exceed it?**
> The token budget for prompt + completion. Exceed it and you truncate — usually silently and usually mid-object, which is exactly the failure your `JSONRepair` bracket-completion exists to rescue.

**Q: What's the difference between prompt engineering and context engineering?**
> Prompt engineering is *phrasing*. Context engineering is *deciding what the model sees at all* — retrieval, compression, tool definitions, output schema, and the token budget. One is wording; the other is architecture.

**Q: Why is structured output / tool-calling better than "respond with JSON"?**
> Because the constraint is enforced during **decoding**, not hoped for in the prose. Malformed output becomes *unrepresentable* rather than merely detectable. **This is precisely the upgrade you'd make to your own system, and you should say so.**

**Q: How would you evaluate a generative system with no ground truth?**
> Property-based checks (does it execute; is it valid; is it manufacturable) rather than exact-match. Plus a held-out set with human labels for intent match, and a **VLM judge** for scale — while being honest that the judge needs validating too.

**Q: What's a hallucination, concretely, in CAD?**
> An API that doesn't exist, a selector that resolves to the wrong face, a dimension that satisfies the prose but not the geometry. **The third is the dangerous one** — it runs, it's manifold, and it's silently wrong. Only a geometric or human check catches it.

---

## Software fundamentals they might casually toss in

**Q: How does undo/redo work in your system?**
> Every mutation is a command carrying a forward patch and an inverse patch (Immer). Undo applies the inverse. A batch — like an AI proposal creating forty elements — is one entry, so undo is atomic at the level of user *intent*, not implementation.

**Q: What's a CRDT and why use one?**
> A data structure whose merges are commutative, associative and idempotent — so concurrent edits converge without a central lock. The catch: it guarantees *convergence*, not *correctness of intent* — two users can converge on a state neither wanted, which is why you still surface semantic conflicts.

**Q: How do you keep a big codebase from rotting?**
> Make the rules executable. Layer boundaries, the single-THREE rule, the single-rAF rule — they're lint rules that fail CI. **A convention that isn't enforced is folklore.**

---

## The five you must not fumble

1. **Manifold** — say it precisely.
2. **Draw call** — and why instancing fixes it.
3. **Model → view → projection → NDC → screen.**
4. **Structured output beats prompt-contract JSON** — and you'd make that change.
5. **B-rep vs mesh, and tessellation as the bridge.**

If you're rusty on anything above, spend the time there rather than re-reading PRYZM. **You know your own work; they'll test the foundations.**
