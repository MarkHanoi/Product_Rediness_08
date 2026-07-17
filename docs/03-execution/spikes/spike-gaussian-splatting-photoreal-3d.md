# SPIKE — 3D Gaussian Splatting / Apple Maps "radiance-field" Flyover for PRYZM photoreal site context

> **Stamp**: 2026-06-09 · **Status**: SPIKE (research-only — NO runtime code changed)
> **Trigger**: Founder ask — *"Apple Maps' new Flyover uses 3D Gaussian Splatting / radiance-field representation (WWDC 2025) — it looks better than Cesium. analyse · review · audit · spike. Check FIRST if it is FREE, and how POWERFUL it is."*
> **Scope**: (1) Is Apple's Flyover splat data free / web-consumable? (2) What is 3DGS really, and how powerful? (3) vs PRYZM's current Cesium + Google Photoreal 3D Tiles path. (4) Audit PRYZM's photoreal wiring (`CesiumViewport.ts`) + feasibility/effort to add a 3DGS layer.
> **Companion contracts**: [C55 — Geodata Analytical Layers](../../02-decisions/contracts/C55-GEODATA-ANALYTICAL-LAYERS.md), [C19 — Site Model & Parcel](../../02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md), [C12 — Geospatial](../../02-decisions/contracts/C12-GEOSPATIAL.md).

---

## §0 — TL;DR (the founder's two questions, answered first)

**Is Apple's splat Flyover FREE / usable by PRYZM?** — **NO. Not usable at all for a web app, at any price.**
Apple's radiance-field Flyover is an **app-only render feature** of the Apple Maps client (iOS/macOS). There is **no API, SDK, tile endpoint, or licensable data layer** that exposes the underlying splats or even the rendered 3D Flyover to a third party. MapKit JS (Apple's *web* map SDK) got **2D maps + Look Around (street-level panoramas)** in its 2025 update — it does **NOT** expose 3D Flyover or the radiance-field city. And Apple's Maps ToS explicitly **forbids caching, bulk download, scraping, or building a derived database** from Map Data. So even if a web hook existed, re-using it in PRYZM's BIM scene would be a ToS violation. **Verdict: Apple = dead end for PRYZM. Stop here on Apple.**

**Is the *technology* (3DGS) powerful / better than what PRYZM has?** — **Yes, the technology is genuinely better for photoreal fidelity** (it solves the exact "broccoli trees / melted powerlines / smeared glass & water" artifacts of photogrammetry). And — the important part — **PRYZM does NOT need Apple to get it.** As of **Cesium's April 2026 release, CesiumJS (the exact library PRYZM already runs) natively supports georeferenced 3D-Gaussian-splat tilesets via 3D Tiles + the open `KHR_gaussian_splatting` glTF extension.** That is a drop-in path on PRYZM's existing stack. **Verdict: 3DGS = WATCH-NOW / PROTOTYPE-LATER via Cesium's native path — NOT Apple.**

---

## §1 — Is Apple's Flyover free / accessible to developers?

### What Apple actually announced (WWDC 2025, rollout fall 2025/26)
- Apple Maps **Flyover** (3D oblique-aerial city models, ~300+ cities/landmarks) is being upgraded from conventional drone-captured **photogrammetry** to a **"radiance field representation"** — i.e. 3D Gaussian Splatting in all but name (Apple did **not** say "Gaussian Splatting" on stage). The pitch: *"no more broccoli trees, no more melted powerlines"* — ground-level detail that holds up, glass/water/thin structures handled. [radiancefields.com](https://radiancefields.com/apple-maps-flyover-is-getting-a-gaussian-splatting-upgrade)
- Described as possibly **"the largest deployment of the technology to date."**

### Is it exposed to developers? — NO usable surface for the web
| Surface | What it offers | 3D Flyover / splats? |
|---|---|---|
| Apple Maps app (iOS/macOS) | The radiance-field Flyover renders **here only** | Yes — but app-only, no data egress |
| **MapKit (Swift, native)** | Native iOS/macOS map views; can enable 3D camera | Renders Flyover **inside Apple's view**; no raw mesh/splat handed to you |
| **MapKit JS (web)** | 2025 update added **3D map views + Look Around** (street panoramas) on the web | **No 3D Flyover / no radiance-field layer exposed**; Look Around ≠ Flyover |
| Apple Maps Server API | Geocoding / directions / search REST | No 3D, no tiles |

[Go further with MapKit — WWDC25](https://developer.apple.com/videos/play/wwdc2025/204/) · [MapKit JS docs](https://developer.apple.com/documentation/mapkitjs/) · [WWDC25 MapKit JS writeup](https://dev.to/arshtechpro/wwdc-2025-go-further-with-mapkit-mapkit-javascript-a5l)

### Licensing / ToS reality
Apple's Maps ToS is decisive even before the technical wall: *Map Data **"may not be cached, pre-fetched, or stored"*** other than temporarily to improve the Apple Maps Service, and developers *"will not … enable or permit bulk downloads … or attempt to extract, scrape or re-utilize any portions of the Map Data as part of any secondary or derived database."* [Apple Maps Terms of Use](https://www.apple.com/legal/internet-services/maps/terms-en.html)

**→ Conclusion (1):** Apple's splat Flyover is **not free-for-web, not paid-for-web, not licensable as a data layer.** It is a closed Apple-app rendering feature. PRYZM (browser/WebGPU) **cannot consume it** and must not try (ToS). The founder's first question — "is it free?" — is moot: it is **inaccessible**.

---

## §2 — How powerful is it, and what is 3DGS really?

### 3DGS vs photogrammetry-mesh vs NeRF
| | **3D Gaussian Splatting (3DGS)** | **Photogrammetry mesh** (Google 3D Tiles today) | **NeRF** |
|---|---|---|---|
| Representation | Millions of anisotropic 3D Gaussians ("splats") w/ colour + opacity + view-dependent (SH) colour | Textured triangle mesh | Implicit neural field (MLP) |
| Photoreal fidelity | **Highest** — captures view-dependent lighting, reflections, glass, water, thin features (wires, foliage) | Good but "baked" — flat textures, smeared glass/water, "broccoli" trees, "melted" thin features | High, but soft/blurry vs 3DGS |
| Render cost | Real-time **rasterised** (no per-ray MLP); needs **depth-sort + compute** → wants **WebGPU** | Cheapest — standard GPU triangle pipeline | **Expensive** — per-ray volumetric MLP, hard real-time |
| Editability | Poor — a cloud of splats, **not** a CAD-editable surface; **not measurement-grade** (mean geo error ~**7.8 cm** — fails engineering tolerance) | Mesh is somewhat editable; metric | Not editable |
| Data size | Large raw (PLY); **SPZ compression ~90% smaller** | Moderate (streamed tiles) | Compact weights, slow to query |
| Georeferencing | Not inherent — must be **tiled + georeferenced** (Cesium ion / 3D Tiles) | **Native** (3D Tiles is georeferenced OGC) | Not inherent |

Sources: [Varjo Teleport — GS vs photogrammetry vs NeRF](https://get.teleport.varjo.com/blog/photogrammetry-vs-nerfs-gaussian-splatting-pros-and-cons) · [thefuture3d — 3DGS vs NeRF](https://www.thefuture3d.com/equipment/compare/3d-gaussian-splatting-vs-nerf/) · [ISPRS UAV NeRF-vs-3DGS point-cloud eval (geo error)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12115230/)

### Web rendering reality (load-bearing for PRYZM)
- **WebGL cannot do 3DGS well** — no compute shaders, weak blending; depth-sort gets pushed to JS/WASM → latency, doesn't scale to city-size scenes. Existing "WebGL splat viewers" (e.g. [antimatter15/splat](https://github.com/antimatter15/splat)) are limited / pre-sorted. [WebSplatter arXiv](https://arxiv.org/html/2602.03207v1)
- **WebGPU is the unlock** — compute-shader culling + GPU radix sort makes large 3DGS real-time in-browser (reports of up to ~135× over WebGL viewers; 2–16 ms/frame on high-end GPUs). [PlayCanvas SuperSplat WebGPU](https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins/) · [webgpu.com — Gauzilla](https://www.webgpu.com/showcase/gauzilla-rust-gaussian-splatting-digital-twins/)
- **WebGPU availability is now broad** — native WebGPU shipped in **Safari iOS 26 / macOS 26 (Sept 2025)**; ~85% of users per caniuse. (PRYZM's BIM renderer is already WebGPU-first.)
- **Standardisation landed (Aug 2025 → Q2 2026):** Khronos + OGC + Esri + Niantic added **`KHR_gaussian_splatting`** + **`KHR_gaussian_splatting_compression_spz`** to glTF; SPZ went from a Niantic open-source project to a **royalty-free open standard**; splats are slated for **3D Tiles 2.0**. [Khronos blog](https://www.khronos.org/blog/khronos-ogc-and-geospatial-leaders-add-3d-gaussian-splats-to-the-gltf-asset-standard) · [OGC blog](https://www.ogc.org/blog-article/ogc-khronos-and-geospatial-leaders-add-3d-gaussian-splats-to-the-gltf-asset-standard/)

**→ Conclusion (2):** 3DGS is the **best current photoreal-capture representation** and the **exact fix** for the artifacts Apple advertised. Its weaknesses are PRYZM-relevant: **not measurement-grade and not CAD-editable** — so it is strictly a **site-context backdrop**, never BIM geometry (this aligns perfectly with C55 §1.2 "layers DRAPE, never become BIM geometry"). It wants **WebGPU**, which PRYZM already has.

---

## §3 — vs Cesium (what PRYZM uses today)

PRYZM's photoreal site view is **CesiumJS** with these data paths (audited in §4): **Google Photorealistic 3D Tiles** (real photoreal buildings, needs a credential), **ESRI World Imagery** (keyless satellite basemap), **OSM/Overpass** context-building extrusions (keyless fallback), and the abstract **Forma** white-massing study.

### Google Photorealistic 3D Tiles — cost / web reality
- **Web-consumable & georeferenced**: yes — 3D Tiles is an **open OGC standard**, streams straight into CesiumJS (PRYZM already does this).
- **Pricing (post-2025 change)**: the old recurring **$200/mo credit was removed March 1, 2025**; replaced by per-SKU free monthly caps. Photorealistic 3D Tiles (Enterprise SKU) gets **~1,000 free events/month**; billing is per **root-tile request** (~a "session"), one root request covers **≥3 hours** of subsequent tiles, and child-tile requests don't re-bill after the root. [Google Map Tiles billing](https://developers.google.com/maps/documentation/tile/usage-and-billing) · [3D Tiles overview](https://developers.google.com/maps/documentation/tile/3d-tiles-overview)
- **Fidelity**: photogrammetry mesh — exactly the "good-but-broccoli/smeared" quality 3DGS improves on.

### THE KEY 2026 FINDING — Cesium now does 3DGS natively
**CesiumJS (the library PRYZM already ships) added native 3D-Gaussian-splat tileset support (Cesium release, April 2026)** — splats stream via **3D Tiles (spatial index) + glTF `KHR_gaussian_splatting` (payload)** with **hierarchical LOD** (city-scale → sub-cm), rendered through specialised shaders + WebAssembly. Splats tiled through **Cesium ion are georeferenced** and combine instantly with the global dataset / terrain. [Cesium blog — 3DGS LOD via 3D Tiles](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/) · [radiancefields.com — Cesium GS LOD](https://radiancefields.com/cesium-adds-hierarchical-lod-for-gaussian-splats-to-3d-tiles-cesiumjs-and-cesium-for-unreal)

This means PRYZM can get the *same class of technology* Apple shipped **without Apple**, **on its existing Cesium stack**, **via an open OGC/Khronos standard** — and georeferenced. Cesium ion has a **free Community tier (<5 GB)** for hosting/tiling. [Cesium ion pricing](https://cesium.com/platform/cesium-ion/pricing/)

### Open web 3DGS renderers (the non-Cesium option)
SuperSplat / PlayCanvas (WebGPU), [Scthe/gaussian-splatting-webgpu](https://github.com/Scthe/gaussian-splatting-webgpu), [kishimisu WebGL](https://github.com/kishimisu/Gaussian-Splatting-WebGL), Luma, Scaniverse — all viewers, but **none are georeferenced out of the box** and they don't compose with PRYZM's terrain/ENU substrate. The Cesium-native path is strictly better for PRYZM because georeferencing + LOD + terrain composition come for free.

### Comparison table (the deliverable)
| Option | Free? | Web-consumable? | Georeferenced? | Fidelity | Effort into PRYZM |
|---|---|---|---|---|---|
| **Apple 3DGS Flyover** | N/A — **inaccessible** (app-only, no API; ToS forbids re-use) | **No** (MapKit JS = 2D + Look Around only) | (Apple-internal) | Highest (radiance field) | **∞ / impossible** |
| **Google Photoreal 3D Tiles** (PRYZM today) | Free tier only (~1k events/mo, then paid; **no more $200 credit**) | **Yes** (open 3D Tiles, in CesiumJS) | **Yes** | Good (photogrammetry — broccoli/smear) | **Already shipped** |
| **Open 3DGS web renderers** (SuperSplat/PlayCanvas/etc.) | Mostly free/OSS | Yes (WebGPU) | **No** (not georef; separate engine) | Highest | High — parallel engine, no terrain compose |
| **Cesium-native 3DGS** (3D Tiles + `KHR_gaussian_splatting`) | **Yes** — open ext; ion Community free <5 GB | **Yes** (CesiumJS, the lib PRYZM runs) | **Yes** (via ion / 3D Tiles) | **Highest** (radiance field) + LOD | **Low–Medium** — additive tileset on existing path |
| **Current Cesium path** (ESRI/OSM/Forma) | **Free / keyless** | Yes | Yes | Schematic (massing) → satellite | **Already shipped** |

**→ Conclusion (3):** Don't chase Apple. The realistic near-term photoreal path stays **Cesium + Google 3D Tiles** (already working). The realistic *upgrade* path to Apple-class fidelity is **Cesium-native 3DGS via 3D Tiles** — same library, open standard, georeferenced, free-tier hostable. It is **adopt-when-ready**, not research-only.

---

## §4 — Audit: PRYZM's current photoreal path + 3DGS feasibility

### How `CesiumViewport.ts` wires photoreal today
File: `apps/editor/src/ui/geospatial/CesiumViewport.ts`

- **Two credential paths** read at module load — `VITE_CESIUM_TOKEN` and `VITE_GOOGLE_MAPS_KEY` (`:35`, `:43`); `photorealAvailable = !!_cesiumToken` (`:465`).
- **Base imagery** — installs **ESRI World Imagery** (keyless satellite, `server.arcgisonline.com`) with **OSM streets** fallback, colour-graded; via `Cesium.UrlTemplateImageryProvider` (`:535`, `:545`) added at `:553`.
- **Google Photorealistic 3D Tiles** — the real photoreal buildings, two branches:
  - ion-token path: `Cesium.Cesium3DTileset.fromIonAssetId(2275207)` (`:604`), added at `scene.primitives.add(tileset)` (`:611`).
  - google-key path: feature-detected `Cesium.createGooglePhotorealistic3DTileset({ key })` (`:625`/`:629`), added at `:649`.
  - Quality knobs in `applyTilesetQuality` (`:591`): `maximumScreenSpaceError = 2`, `dynamicScreenSpaceError`, foveation, `preferLeaves`.
  - When tiles load, `photorealTilesActive = true` (`:615`/`:653`) **suppresses PRYZM's own OSM/Overpass context extrusions** to avoid duplication (`:371`–`:378`).
- **Keyless fallback** — no credential → no Google tiles, ESRI/OSM basemap + **OSM/Overpass context buildings** (`contextBuildings.ts`) + abstract **Forma** white-massing study (`applyFormaMode`, `:1008`).
- **BIM model on globe** — the serialised PRYZM scene is placed as a glTF `Cesium.Model` (`realModelOnGlobe`, `scene.primitives.add(newModel)` at `:3507` / `:4276`).

So the photoreal layer is **a `Cesium3DTileset` added to `scene.primitives`** behind a credential gate, plus a clean keyless degrade. This is the exact seam a 3DGS tileset slots into.

### What it would take to add a 3DGS layer
1. **Renderer capability** — verify the pinned CesiumJS version supports `KHR_gaussian_splatting` (Cesium's GS-tileset support shipped ~April 2026; PRYZM's `cesium@~1.140` predates it → a **Cesium bump** is the gating dependency). Confirm WebGPU/WASM splat path enabled (PRYZM is already WebGPU-first).
2. **Data** — obtain a georeferenced splat tileset: tile photos via **Cesium ion** (iTwin Capture → georef 3D Tiles splat w/ LOD, free Community <5 GB) **or** ingest an external `.spz`/glTF-splat 3D Tiles set.
3. **Wiring** — add a **third tileset branch** alongside Google tiles: `Cesium3DTileset.fromIonAssetId(<splatAssetId>)` → `applyTilesetQuality` → `scene.primitives.add(...)`, gated on a new env credential / a C55 geodata-layer toggle. ~1 file, mirrors the existing Google branch.
4. **Governance** — model it as a **C55 geodata layer** (`drapeMode: building`, opacity slider, per-source attribution per C23, country-grouped panel) anchored to the **C19 Site** origin. **Never** a BIM element (C55 §1.2). It is read-only **context** — not measurement-grade (§2).
5. **Degrade** — keep the existing keyless Forma/ESRI fallback untouched; 3DGS is purely additive and absent-by-default (C55 §1.4 graceful absence).

**Effort estimate**: **Low–Medium.** The hard parts (georeferencing, terrain composition, LOD streaming, tileset lifecycle) are already solved by Cesium's native path. Real work = **(a)** a CesiumJS version bump + WebGPU splat-render validation across PRYZM's device matrix, **(b)** producing/hosting one georeferenced splat tileset, **(c)** ~1 additive branch in `CesiumViewport.ts` + a C55 toggle. Estimate **~1 small sprint to prototype one city block**, dominated by the Cesium upgrade + data capture, not by PRYZM render code.

**→ Conclusion (4):** Feasible on PRYZM's browser/WebGPU stack **today via Cesium-native 3DGS**. The only true blocker is the **CesiumJS version bump**; everything else is additive and reuses the existing tileset seam.

---

## §5 — Verdict & recommendation

- **Apple 3DGS Flyover** → **DO NOT ADOPT — inaccessible.** Not free, not paid, not licensable for web; no API exposes it; ToS forbids re-use. Close the question.
- **3DGS the technology** → **ADOPT-WHEN-READY (not research-only).** It is genuinely higher-fidelity than PRYZM's current photogrammetry tiles and is now an **open OGC/Khronos standard** with **native CesiumJS support**.
- **Near-term (now):** **Stay on Cesium + Google Photorealistic 3D Tiles** for photoreal site context — it works, it's georeferenced, it's free up to the cap. No change forced.
- **Next (prototype):** When PRYZM next bumps CesiumJS, **prototype an open/Cesium-native georeferenced 3DGS layer** as a future **C55 geodata layer** (`drapeMode: building`), anchored to the **C19 Site**, behind a toggle + credential, read-only context only. Capture one block via **Cesium ion (free Community tier)** to validate fidelity + WebGPU perf on the device matrix.
- **Guardrail:** 3DGS is **context, never CAD** — not measurement-grade (~7.8 cm error), not editable. Keep it out of the `.pryzm` model (C55 §1.2).

---

## §6 — Sources
- [radiancefields.com — Apple Maps Flyover is getting a Gaussian Splatting upgrade](https://radiancefields.com/apple-maps-flyover-is-getting-a-gaussian-splatting-upgrade)
- [Apple — Go further with MapKit (WWDC25 session 204)](https://developer.apple.com/videos/play/wwdc2025/204/) · [MapKit JS docs](https://developer.apple.com/documentation/mapkitjs/) · [WWDC25 MapKit JS writeup](https://dev.to/arshtechpro/wwdc-2025-go-further-with-mapkit-mapkit-javascript-a5l)
- [Apple Maps Terms of Use](https://www.apple.com/legal/internet-services/maps/terms-en.html)
- [Cesium — 3D Gaussian Splats with hierarchical LOD using 3D Tiles (Apr 2026)](https://cesium.com/blog/2026/04/27/3d-gaussian-splats-lod/) · [Cesium ion pricing](https://cesium.com/platform/cesium-ion/pricing/)
- [Khronos — 3D Gaussian Splats added to glTF](https://www.khronos.org/blog/khronos-ogc-and-geospatial-leaders-add-3d-gaussian-splats-to-the-gltf-asset-standard) · [OGC blog](https://www.ogc.org/blog-article/ogc-khronos-and-geospatial-leaders-add-3d-gaussian-splats-to-the-gltf-asset-standard/)
- [Google Map Tiles billing](https://developers.google.com/maps/documentation/tile/usage-and-billing) · [Google Photorealistic 3D Tiles overview](https://developers.google.com/maps/documentation/tile/3d-tiles-overview)
- 3DGS vs NeRF/photogrammetry: [Varjo Teleport](https://get.teleport.varjo.com/blog/photogrammetry-vs-nerfs-gaussian-splatting-pros-and-cons) · [thefuture3d](https://www.thefuture3d.com/equipment/compare/3d-gaussian-splatting-vs-nerf/) · [ISPRS geo-error eval](https://pmc.ncbi.nlm.nih.gov/articles/PMC12115230/)
- Web 3DGS / WebGPU: [WebSplatter arXiv](https://arxiv.org/html/2602.03207v1) · [PlayCanvas SuperSplat WebGPU](https://blog.playcanvas.com/new-in-supersplat-webgpu-and-streaming-bring-huge-performance-wins/) · [Gauzilla](https://www.webgpu.com/showcase/gauzilla-rust-gaussian-splatting-digital-twins/)
- Audited file: `apps/editor/src/ui/geospatial/CesiumViewport.ts` (credentials `:35`/`:43`; ESRI/OSM imagery `:535`/`:545`; Google tiles `fromIonAssetId` `:604`, `createGooglePhotorealistic3DTileset` `:625`; tileset add `:611`/`:649`; quality `:591`).
