{
  "defectId": "envelope-mangled-in-pryzm-3d-vs-cesium",
  "rootCauseFound": true,
  "rootCause": "The PRYZM 3D (three.js) view draws a `spaceEnvelope` through exactly ONE path — `SpaceEnvelopeMeshBuilder._faceGeometry` (apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts:443-488), constructed once in `attachSpaceEnvelopeRender` (:138) and attached once in `initTools.ts:2147-2149` onto `world.scene.three`, whose transform is pinned to identity (`packages/core-app-model/src/BimWorld.ts:168-170`). That builder emits the n side faces as explicit quads (correct for any ring) but emits the TOP and BOTTOM caps as a NAIVE TRIANGLE FAN FROM VERTEX 0 (`for (let i = 1; i < n - 1; i += 1) { p0 = ring[0]; p1 = ring[i]; p2 = ring[i+1]; ... }`, :477-482). A vertex-0 fan is only a valid triangulation of a CONVEX ring — the file says so itself at :467-474 (\"Correct for a CONVEX ring only … it is not done here because the ring vocabulary this family authors today is a rectangle\"). The Cesium path (`CesiumViewport.renderSpaceEnvelopes`, :8892-8911) hands the SAME ring, in the same order, to `new Cesium.PolygonHierarchy(positions)` with `height`/`extrudedHeight`, and Cesium triangulates with earcut (bundled: node_modules/cesium/ThirdParty.json:60), which is correct for any simple concave ring. So the two views consume identical data and differ in exactly one algorithm: the cap triangulation. The precondition the fan declared has since been broken by the authoring routes that shipped AFTER it: the fan landed 2026-09-04 (678e744f) while the \"extrude the permitted buildable footprint\" route landed 2026-09-06 (9d4ee67f, `parcelLawEnvelopeAuthoring.ts:424` → `env.insetPolygon`, the very ring the founder's own console calls \"the 20-corner buildable footprint\", CesiumViewport.ts:8700-8701) and the free-draw surface landed 2026-09-07 (bea53747, modes including freehand polyline / arcs). ISSUE-LOG L-428 already records in the founder's own project that \"a buildable-envelope inset is an irregular/concave polygon (founder's case: 12-vertex)\". `envelopeAuthoringPlan.ts:628-629` copies that one ring verbatim into all six storey records, so every one of the 6 level prisms gets 2 wrong caps. Measured on a simple 12-corner L-shaped plot (script run this session): 11 of the 12 possible ring start-vertices produce a wrong cap, with up to 276 m² of fan triangles lying OUTSIDE a 552 m² footprint. Twelve such caps (6 storeys × top+bottom) at different heights, drawn `transparent` + `DoubleSide` + `depthWrite:false` (:323-340), is exactly the founder's \"folded/twisted sheet with spikes and self-intersecting purple wedges\", sitting inside a side-face \"fence\" that is geometrically correct.",
  "evidence": [
    {
      "file": "apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts",
      "line": 467,
      "quote": "// TOP / BOTTOM — a fan from vertex 0. ⚠ Correct for a CONVEX ring only, and\n// that limit is DECLARED rather than hidden: a concave storey outline draws a\n// wrong cap while every side face stays right ... The honest fix is `ShapeGeometry` over a\n// `THREE.Shape` ... it is not done here because the ring vocabulary this family authors today is a\n// rectangle",
      "why": "The defect is written down as a declared precondition. It is the ONLY geometry-generation difference between the three.js path and the Cesium path, and its precondition (rings are rectangles) is no longer true."
    },
    {
      "file": "apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts",
      "line": 477,
      "quote": "for (let i = 1; i < n - 1; i += 1) {\n    const p0 = ring[0]!;\n    const p1 = ring[i]!;\n    const p2 = ring[i + 1]!;\n    tris.push(p0.x, y, p0.z, p1.x, y, p1.z, p2.x, y, p2.z);\n}",
      "why": "The actual fan. No ear-clipping, no reflex-vertex handling, no ShapeGeometry. For any ring with a reflex vertex not visible from ring[0], triangles are emitted outside the footprint and overlapping each other."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 8892,
      "quote": "const positions = ring.map((p) => toCartesian(p.x, p.z, bottom));\n...\n  hierarchy: new Cesium.PolygonHierarchy(positions),\n  height: bottom,\n  extrudedHeight: top,",
      "why": "The Cesium path consumes the SAME `rec.footprint`, in the SAME order, and delegates triangulation to Cesium's PolygonGeometry (earcut). This is why the 3D Site view is clean on the identical record."
    },
    {
      "file": "node_modules/cesium/ThirdParty.json",
      "line": 60,
      "quote": "\"name\": \"earcut\",",
      "why": "Independent confirmation that the Cesium leg uses a real ear-clipping triangulator, not a fan — so the divergence between the two views is algorithmic, not data."
    },
    {
      "file": "apps/editor/src/engine/initTools.ts",
      "line": 2147,
      "quote": "attachSpaceEnvelopeRender({\n    store: spaceEnvelopeStore,\n    scene: world.scene.three,",
      "why": "There is exactly ONE attachment of the envelope renderer, onto the scene ROOT. No second three.js envelope drawer exists (grep for SpaceEnvelopeMeshBuilder / prismOfSpaceEnvelopeRecord returns only this builder, the drag surface and the gizmo)."
    },
    {
      "file": "packages/core-app-model/src/BimWorld.ts",
      "line": 168,
      "quote": "world.scene.three.position.set(0, 0, 0);\nworld.scene.three.rotation.set(0, 0, 0, 'XYZ');\nworld.scene.three.scale.set(1, 1, 1);",
      "why": "Kills the ADR-0115 / theta rival: the scene root the prism group is added to carries an identity transform, and the builder writes raw scene-XZ world positions. No theta is applied twice or omitted — and a theta error would rigidly rotate the prism, not fold it."
    },
    {
      "file": "apps/editor/src/ui/analysis/parcelLawEnvelopeAuthoring.ts",
      "line": 424,
      "quote": "const ring = env?.insetPolygon ?? null;\nreturn Array.isArray(ring) && ring.length >= 3 ? ring : null;",
      "why": "The 'permitted' authoring route extrudes the buildable-envelope inset polygon — the very ring the founder's console reports as having 20 corners. Cadastral insets are not rectangles."
    },
    {
      "file": "apps/editor/src/ui/geospatial/CesiumViewport.ts",
      "line": 8700,
      "quote": "`[CesiumViewport][forma] §PARCEL-VISIBLE-EVERYWHERE cue 'limit-plane' → drawn at `\n+ `${maxH.toFixed(2)} m over the ${inset.length}-corner buildable footprint.`",
      "why": "The founder's own log line '20-corner buildable footprint' interpolates `env.insetPolygon.length` — 20 vertices, the same ring the authoring route extrudes."
    },
    {
      "file": "docs/04-reference/ISSUE-LOG.md",
      "line": 614,
      "quote": "A **buildable-envelope inset is an irregular/concave polygon** (founder's case: 12-vertex), whose AABB is strictly larger",
      "why": "Independent, prior, in-repo measurement that this exact ring family IS concave in the founder's own projects — the precondition the fan needs is empirically false here."
    },
    {
      "file": "apps/editor/src/ui/site/envelopeAuthoringPlan.ts",
      "line": 628,
      "quote": "const footprintFor = (): { x: number; y: 0; z: number }[] =>\n    ring.map((p) => ({ x: p.x, y: 0 as const, z: p.z }));",
      "why": "The one ring is copied verbatim into every storey spec, so all six level envelopes in the founder's screenshot share the same footprint — one bad ring ⇒ 12 mangled caps, matching '[level@3.0m x6]'."
    },
    {
      "file": "apps/editor/src/engine/__tests__/spaceEnvelopeFaceGizmo.spec.ts",
      "line": 39,
      "quote": "footprint: [\n    { x: 0, z: 0 },\n    { x: 6, z: 0 },\n    { x: 6, z: 4 },\n    { x: 0, z: 4 },\n],",
      "why": "Every fixture in this family is an axis-aligned RECTANGLE, and there is no test of SpaceEnvelopeMeshBuilder's cap triangulation at all — which is precisely why the convex-only fan shipped green and stayed green after the concave authoring routes landed."
    },
    {
      "file": "apps/editor/src/ui/site/ParcelBoundarySceneRenderer.ts",
      "line": 907,
      "quote": "* Faint flat fill so the lot reads as a footprint. Uses a Shape triangulated\n* by THREE.ShapeGeometry (handles convex + simple-concave parcels) laid flat",
      "why": "The sibling three.js surface in this same repo already solves exactly this with ShapeGeometry over the (x, −z) shape + rotateX(-π/2) — so the fix is a reuse, not an invention, and it kills rival (d): the three.js limit-plane cue (:816-863) triangulates properly and is one flat plane, not a stack of wedges."
    }
  ],
  "proposedFix": "Replace the vertex-0 fan in `SpaceEnvelopeMeshBuilder._faceGeometry`'s TOP/BOTTOM arm (apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts:475-487) with the real triangulator the file's own comment names, reusing the convention already established 100 lines away in ParcelBoundarySceneRenderer: build a `THREE.Shape` as `moveTo(ring[0].x, -ring[0].z)` + `lineTo(p.x, -p.z)` + `closePath()`, take `new THREE.ShapeGeometry(shape)` (earcut — the same triangulator Cesium uses, so the two views agree by construction), then `geo.rotateX(-Math.PI / 2)` and `geo.translate(0, y, 0)`. ⛔ The sign is load-bearing: `-Math.PI/2` maps (u, v, 0) → (u, 0, −v), which with v = −p.z returns exactly (p.x, y, p.z); `+Math.PI/2` is the §PARCEL-SHADE-NOT-MIRRORED defect (L-10740) and would mirror the cap about the scene X axis. Wrap in try/catch and fall back to the existing fan (never to nothing), matching `buildFill`'s \"returns null if triangulation fails\" posture. Do NOT change anything else: each cap stays ONE mesh carrying its own `userData.spaceEnvelopeFace` (`{kind:'top'}` / `{kind:'bottom'}`), so the face-index convention, the drag controller, the gizmo and `spaceEnvelope.moveFace` are untouched — only the triangle list inside the cap changes. Add the missing red-first test (there is no SpaceEnvelopeMeshBuilder cap test today): on a concave L-shaped ring, assert (1) every cap triangle's centroid satisfies `pointInRing` from `@pryzm/geometry-space-envelope`, and (2) the summed cap triangle area equals `footprintAreaM2(ring)` within epsilon. Both fail on the current fan and pass on ShapeGeometry; rotate the ring's start vertex across all n positions in the test, because the fan happens to be correct for a start vertex inside the polygon's kernel (1 of 12 rotations passed in my measurement) and a single-rotation test would be a false green. SECONDARY, not the root cause but worth filing: (a) `ringSelfIntersects` exists in the geometry package but is only enforced on face-move (packages/geometry-space-envelope/src/SpaceEnvelopeFaceMove.ts:323) — creation from a freehand-drawn ring has no such guard, so a bow-tie perimeter would mangle BOTH views; (b) on a 20-corner footprint `SpaceEnvelopeFaceGizmoBuilder` puts n+2 = 22 double-headed cone arrows on the hovered envelope, which will read as additional \"spikes\" in a screenshot even once the caps are fixed.",
  "confidence": "high",
  "rivalHypothesesRuledOut": [
    "(a) THREE.ShapeGeometry / earcut fed a self-intersecting ring — KILLED for this element. `SpaceEnvelopeMeshBuilder` contains no `THREE.Shape`, no `ShapeGeometry`, no `ExtrudeGeometry` and no earcut at all; it hand-rolls positions (:457-464, :477-482). ShapeGeometry IS used in this repo (ParcelBoundarySceneRenderer buildFill :922, buildLimitPlaneCue :833, buildProposedPlate :511, rasteriseMassingSolid :1084) but those draw DIFFERENT objects (parcel fill, limit plane, buildable-envelope massing), not the authored spaceEnvelope. Separately, a self-intersecting ring would mangle the CESIUM view too (Cesium's earcut is no more tolerant of a bow-tie than three's), and the founder reports Cesium clean — so the ring is simple.",
    "(b) vertex ORDER / winding differs between the two paths — KILLED. Both paths read the same `record.footprint` array with no reversal: Cesium at CesiumViewport.ts:8892 `ring.map((p) => toCartesian(p.x, p.z, bottom))`, three via `prismOfSpaceEnvelopeRecord` (SpaceEnvelopeFaceDrag.ts:238-249) which is a 1:1 `map` adding `y: 0`. Neither sorts, reverses or canonicalises. And the three material is `side: THREE.DoubleSide` (:337), so winding cannot make a face invisible or inside-out on screen. Winding also cannot explain wedges OUTSIDE the footprint — a reversed ring still tessellates within its own boundary.",
    "(c) the PRYZM path draws in the AUTHORING frame and theta (ADR-0115) is applied twice or not at all — KILLED. The builder writes raw scene-XZ into world positions with no rotation (:457-464, :481) and the group is added to `world.scene.three` (initTools.ts:2149), whose transform is explicitly reset to identity (BimWorld.ts:168-170). Cesium applies theta only because it must convert scene-XZ → ENU (`sceneXZToEnu(x, z, thetaRad)`, CesiumViewport.ts:8853). A theta error is a RIGID rotation: it would put a correctly-shaped prism in the wrong orientation, never fold or spike it. The founder's screenshot shows correct placement and broken shape.",
    "(d) it is the 'limit-plane' cue over the 20-corner concave footprint, not the envelope — KILLED as the cause. The three.js limit-plane cue does exist (ParcelBoundarySceneRenderer.buildLimitPlaneCue :816-863) and does read the same 20-corner `env.insetPolygon`, but it triangulates with `THREE.ShapeGeometry` (:833) — earcut, correct for a simple concave ring — and it is ONE flat translucent plane plus a rim at a single height, drawn only while a highlight cue is active (:634). It cannot produce a stack of self-intersecting wedges at six different elevations. It also cannot be what the founder compared, because his Cesium screenshot draws the identical cue (CesiumViewport.ts:8672-8688) and he calls that view correct.",
    "A second/rival three.js drawer of the same envelopes (stale preview meshes, double-subscription, leaked groups) — RULED OUT by grep: `SpaceEnvelopeMeshBuilder` is constructed at exactly one site (attachSpaceEnvelopeRender.ts:138), which is attached at exactly one site (initTools.ts:2147); `updateSpaceEnvelope` is idempotent-by-id and disposes the prior group first (:151-152). GISAreaLayout's spaceEnvelope references are the Cesium drag/authoring wiring, not a mesh builder.",
    "The envelope is fine and the mangling is the buildable-envelope study volume (§ENVELOPE-VIA-MASSING) overlapping it — RULED OUT as the divergence: that solid is drawn in three.js by `rasteriseMassingSolid` with `ExtrudeGeometry` over a `THREE.Shape` (:1084) — earcut again, concave-safe — AND the Cesium view draws the same envelope through `resolveFormaEnvelope`, so it is symmetric across the two views and cannot explain a difference between them."
  ],
  "whatWouldFalsifyThis": "Dump the six records and test each ring for reflex vertices: in the browser console on the PRYZM 3D view, `[...runtime.stores.spaceEnvelope.getState().values()].map(r => ({ id: r.id, n: r.footprint.length, reflex: r.footprint.filter((p,i,a)=>{const q=a[(i+1)%a.length],s=a[(i+2)%a.length];return ((q.x-p.x)*(s.z-q.z)-(q.z-p.z)*(s.x-q.x)) * Math.sign(a.reduce((acc,u,k)=>{const v=a[(k+1)%a.length];return acc+u.x*v.z-v.x*u.z;},0)) < 0;}).length }))`. If every ring comes back with `reflex: 0` (i.e. the footprints are CONVEX — a drawn rectangle, a tessellated circle/ellipse), then the vertex-0 fan is producing a CORRECT cap and this diagnosis is wrong; the divergence would have to lie elsewhere and I would need the actual ring dumped to re-open it. Equally falsifying: patch only the TOP/BOTTOM arm to ShapeGeometry, change nothing else, and observe the PRYZM 3D view still mangled — that would prove the caps were not the artefact. The weakest link in my chain is that I never saw the founder's actual footprint array; every other step (one three.js path, identity scene transform, identical input ring, earcut on the Cesium side) is verified from source.",
  "filesToChange": [
    "apps/editor/src/engine/SpaceEnvelopeMeshBuilder.ts",
    "apps/editor/src/engine/__tests__/spaceEnvelopeMeshBuilderCaps.spec.ts"
  ]
}