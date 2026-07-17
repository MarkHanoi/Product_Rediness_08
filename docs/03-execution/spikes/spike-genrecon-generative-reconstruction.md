# SPIKE — GenRecon (generative 3D scene reconstruction) as a reality-capture / scan-to-BIM reference

- **Status:** REFERENCE / watch-list (exploratory spike — no committed work)
- **Source:** https://github.com/kasothaphie/GenRecon
- **Paper:** arXiv 2605.23888 · **License:** MIT (deps nvdiffrast/nvdiffrec under their own licenses) · **Maturity:** released Jun 2026, ~700★, active
- **Owner queue:** Geospatial Foundation / Reality-capture (see [[geospatial-foundation-strategic-direction]]) + Render tiers (see [[render-tiers-massing-and-presentation]])
- **Logged:** raised by founder 2026-07-06 — "keep in the loop, maybe in reference"

## 1. What GenRecon is (one paragraph)

GenRecon is a research implementation for **high-fidelity 3D indoor-scene reconstruction from multi-view RGB images**. It fuses a **generative prior** (Trellis.2) with classical multi-view reconstruction to produce **detailed, editable, textured PBR meshes** (GLB), claiming ~16% over prior SOTA reconstruction. It is a Python/C++/CUDA research codebase (PyTorch, Flash-Attention, nvdiffrast/nvdiffrec) with a paper + pretrained weights — **not a library or product**.

## 2. Method (as understood from the README)

1. **Spatially-localized chunking** — split a scene into overlapping chunks so generation scales to room/building-sized areas.
2. **Projection-based conditioning** — lift multi-view image features into a 3D representation aligned to the generative model.
3. **Cascaded flow-based generation** — three generative models in sequence: **sparse structure → shape → texture**.
4. **PBR mesh output** — physically-based materials baked into the exported GLB.

- **Inputs:** posed multi-view RGB (camera poses from COLMAP or similar).
- **Outputs:** textured GLB with PBR materials (+ intermediate meshes).

## 3. Why it matters to PRYZM (architecture mapping)

PRYZM's vision is site-first, any-typology authoring with IFC/mesh interop and a Presentation render tier. GenRecon is a candidate building block for a **reality-capture → context/asset** path, NOT for the parametric BIM authoring core:

- **Site & context (Geospatial Foundation, C18–C23):** photo/scan → textured 3D context massing to complement the existing Cesium/Overture/OSM context. Angle: bring *real* neighbouring buildings / interiors in as GLB context. Maps [[geospatial-foundation-strategic-direction]].
- **Presentation render tier (A.24):** PBR GLB output aligns with the "EXISTING BIM WebGPU + studio env + entourage" tier — GenRecon meshes could seed entourage / photoreal context, not replace the BIM engine. Maps [[render-tiers-massing-and-presentation]].
- **Scan-to-BIM (future, aspirational):** the *editable* claim is the interesting part — a reconstructed mesh is only useful to PRYZM if it can be **semantized** into BIM elements (walls/openings/slabs) via the room-topology / semantic-graph stack. That semantization gap is the real PRYZM work; GenRecon only gives geometry+texture.
- **Asset/furniture capture:** single-object variant could feed the furniture/GLB catalogue (note the object-storage GLB path, [[furniture-glb-404-object-storage]]).

## 4. Hard constraints / risks (why this is a spike, not a plan)

- **Heavy CUDA/GPU pipeline** — PyTorch + Flash-Attention + nvdiffrast + pretrained weights. This is an **offline/server GPU** workload, categorically incompatible with PRYZM's browser WebGPU client. Any use = a separate backend service (cf. the Cloudflare Worker AI proxy / ai-worker pattern), never in-browser.
- **Mesh ≠ BIM.** Output is triangle soup + PBR, with **no parametric/semantic structure** (no wall systemTypes, no hosted openings, no IFC classes). It cannot enter the command/store pipeline (C03/C11) without a reconstruction→semantics stage that PRYZM does not have.
- **Licensing:** GenRecon MIT, but nvdiffrast/nvdiffrec carry NVIDIA source-available (non-commercial) licenses — **blocking for a commercial SaaS** unless those components are swapped. Must be checked before any adoption.
- **Input burden:** needs posed multi-view capture (COLMAP). No casual single-photo path.
- **Maturity:** research code, brand-new; reproducibility/weights/throughput unproven at product scale.

## 5. Open questions (for a future, deeper spike if pursued)

1. Could the **chunked, projection-conditioned generation** idea inform PRYZM's own site-context massing (independent of GenRecon's weights/licenses)?
2. Is there a viable **mesh → semantic-BIM** bridge (planar segmentation → room-topology → wall/opening inference) that would make reconstructed geometry authorable? That, not the reconstruction, is PRYZM's moat.
3. License-clean alternatives to nvdiffrast/nvdiffrec for the differentiable-render stage?
4. Where would this run — extend `apps/ai-worker` / a GPU service, gated like the CF_WORKER_URL AI proxy?

## 6. Decision

**Keep as reference / watch-list.** No implementation now — it does not touch the V1 launch path. Revisit under the Geospatial Foundation / reality-capture workstream when (a) the license question is resolved and (b) a mesh→semantic-BIM strategy exists. Contracts to consult if pursued: C18–C23 (geospatial), C15 (hosted elements), the semantic-graph stack, and ADR-0074-class climate/site ingestion for the service pattern.

---
_Link kept in the loop: https://github.com/kasothaphie/GenRecon_
