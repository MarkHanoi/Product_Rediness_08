# 05 — Geometry & CAD kernels

Their "nice to have": *CAD kernels like OpenCASCADE, 3D modelling, 3D printing workflows.*
You have the substance. **State it precisely — precision is the whole point with this audience.**

---

## The one distinction that matters most

**This is the concept that separates people who "do 3D" from people who understand CAD.** Have it ready.

| | **B-rep / parametric (CAD)** | **Mesh (graphics)** |
|---|---|---|
| Represents | Exact surfaces — planes, cylinders, **NURBS** — bounded by trimmed edges | Triangles approximating a surface |
| Exact? | **Yes.** A cylinder *is* a cylinder | No. A cylinder is 64 flat strips |
| Editable? | **Yes** — change a parameter, rebuild | Not meaningfully |
| Formats | **STEP, IGES, .FCStd**, Parasolid | STL, OBJ, **glTF** |
| Kernels | **OpenCASCADE**, Parasolid, ACIS | — |
| The web wants | — | **This.** GPUs draw triangles. |

**The bridge is tessellation:** CAD is B-rep; the browser renders meshes; so a viewer tessellates the B-rep to triangles for display **while the parametric model stays authoritative on the server.**

> *"That's the architectural question I'd ask about MORFIS: is the browser getting tessellated meshes, with every edit a round-trip to the Python kernel — or do you keep enough of a parametric representation client-side to edit locally? It's the difference between a viewer and an editor."*

**That single question demonstrates more CAD understanding than any claim of tool experience.**

---

## What you actually use

### `manifold-3d` (WASM) — your CSG kernel

`packages/geometry-kernel/src/csg/KernelCSG.ts`

- `union` / `subtract` / `intersect` over plain triangle soup `{position, index}`, in metres.
- **Lazily imported** — `import('manifold-3d')` — so consumers who never boolean don't pay the ~600 KB WASM.
- **Layer-pure**: no THREE, no DOM. It's a pure function from geometry to geometry, which is why it runs in a worker and headless.
- Chosen for **manifold-by-construction guarantees and exact predicates**.

### The honest line about OpenCASCADE

> ⚠️ **There is no OpenCASCADE dependency in PRYZM.** ADR-020 records it as a *reserved kernel-swap path* — "manifold-3d is the default CSG library; OpenCASCADE.js is reserved for the kernel-swap path" — for NURBS/B-rep authoring if the component editor ever needs it.

**Say exactly this:**
> *"I use manifold-3d, not OCC — I picked it for manifold-by-construction guarantees, and because it's a clean WASM boundary I can run in a worker. OCC.js is written into our ADR as the swap path if we need true NURBS/B-rep. So I know the trade-off well; I haven't shipped OCC."*

That is a **better** answer than a bluffed "yes." It shows you chose a kernel for reasons.

---

## A kernel that returns errors instead of crashing

**ADR-020 — the robustness contract.** This is a genuinely senior artefact, and worth describing:

- An explicit **input budget** (what geometry the kernel promises to handle).
- **Typed failures**: `Result.err(KernelError.NonManifold)` — the kernel *returns* an error; it never throws into the render loop.
- **Property tests as a merge gate**: two walls joined at **every angle θ ∈ [1°, 179°]** and **every thickness ∈ [50, 600] mm** must produce a **manifold** solid whose **area is within 1% of analytic**.

> *"Generative geometry fails at the edges — 1° corners, 5 mm walls, coincident faces. So the kernel is property-tested across the whole parameter space rather than on three happy examples, and a non-manifold result is a typed error, not an exception. If you're letting a model drive a kernel, that contract is the only thing standing between you and a crash loop."*

**This is directly, obviously relevant to MORFIS.** Lead with it.

---

## Your best geometry war story: *the best boolean is the one you avoid*

`packages/geometry-wall/src/WallHoleBodyBuilder.ts` (§WALL-PLAIN-HOLE-EXTRUDE)

**The problem.** A wall with a door was built from **abutting box segments** (left pier, right pier, lintel over the opening). That creates **T-junctions**: a full-height face meets a shorter face that has *no vertex* at the opening's sill/head line. T-junctions shade as a **visible seam** — and crucially, **`mergeGeometries` and `toCreasedNormals` cannot heal them**, because the vertex simply isn't there to weld.

**The fix.** Build the wall as **one `ExtrudeGeometry` from a `Shape` with holes**. The front, back, and reveal faces become continuous by construction. The seam cannot exist — and it costs **no CSG, no WASM** at all.

**Why it lands:**
- It shows you can read shading artefacts back to topology.
- It shows the mature instinct: **the fastest boolean is the one you didn't perform.**
- It's a real, specific, checkable engineering decision.

---

## Related geometry you own

- **Extrude / revolve / sweep / loft / boolean / section-cut / hidden-line** — the classic CAD op set, all THREE-free and worker-runnable. `packages/geometry-kernel/src/producers/`
- **Mitre joins**: vertices projected along the wall direction onto per-end mitre planes; layered walls mitre against **centreline** planes while their layer bodies are laterally offset.
- **Junction resolution**: 2-wall mitre vs 3+-wall clustering — *and you know where it's still wrong*, which is a great thing to admit if they ask about hard open problems.
- **Section cutting**: a true horizontal **plane ∩ triangle** section of a solid — you shipped this **today**, so it's fresh. (It's how a plan drawing is generated: cut the building at 1.2 m and draw what the knife touches.)
- **Hidden-line removal**, poché fills, ISO-13567 drawing layers — real technical-drawing output, not just a viewport.

---

## 3D printing / manufacturability (their domain)

You haven't done 3D printing — **don't claim it** — but you can speak the validity language fluently, which is what actually transfers:

| Manufacturability check | You have the analogue |
|---|---|
| Watertight / manifold | ✅ Exactly your kernel contract |
| Self-intersection | ✅ Degenerate-geometry guards |
| Minimum wall thickness | ✅ Your thickness property tests (50–600 mm) |
| Overhang angle | ➖ Not yours — but it's the same *shape*: a domain rule, as code, run over the solid |
| Minimum feature size | ✅ Degenerate-stub detection |

> *"I haven't done printing workflows. But 'is this manufacturable' is the same class of problem as 'is this buildable' — it's a set of domain rules evaluated over a solid, and it belongs in code next to the kernel, not in a prompt. That's how I'd build it."*
