# 07 — Coding-session drills

*"…and participate in a technical discussion related to the position and the MORFIS project, including a
collaborative coding session."*

**Collaborative** is the operative word. They are watching **how you think**, not whether you memorised an API.
Narrate constantly. Ask clarifying questions. Say what you'd look up.

---

## The rules of a collaborative session

1. **Restate the problem before you type.** *"So we want X, given Y, and the constraint is Z — right?"*
2. **Say the trade-off out loud.** *"I'll do the naïve version first so it's correct, then we can talk about making it fast."*
3. **Name what you'd look up.** *"I'd check the exact signature — I don't memorise it."* That is *strength*, not weakness. Nobody trusts a person who claims to remember every API.
4. **Test your own thinking aloud.** *"What happens if the array is empty? Let me handle that."*
5. **Don't go silent.** Silence is the only real failure mode.

---

## Drill 1 — A Three.js scene from a blank file

Type this until it's muscle memory.

```js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(5, 5, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));   // say why: perf, not vanity
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(5, 10, 7);
scene.add(key);

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x6600ff }),
);
scene.add(mesh);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();          // ← the line everyone forgets
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {           // one loop, not a hand-rolled rAF
  controls.update();
  renderer.render(scene, camera);
});
```

**Talking points while typing:** the `updateProjectionMatrix()` on resize; capping `pixelRatio` at 2 (a retina display is 4× the fragments for no perceptible gain); `setAnimationLoop` over `requestAnimationFrame` (it's what WebXR needs and it keeps one loop).

---

## Drill 2 — Instancing (the perf answer, in code)

```js
const geo = new THREE.BoxGeometry(1, 1, 1);         // ONE unit geometry
const mat = new THREE.MeshStandardMaterial();       // ONE material  ← the whole trick
const mesh = new THREE.InstancedMesh(geo, mat, N);

const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const s = new THREE.Vector3();
const p = new THREE.Vector3();

for (let i = 0; i < N; i++) {
  p.set(items[i].x, items[i].y, items[i].z);
  s.set(items[i].w, items[i].h, items[i].d);        // real size lives in the MATRIX
  m.compose(p, q, s);
  mesh.setMatrixAt(i, m);
}
mesh.instanceMatrix.needsUpdate = true;             // ← forget this and nothing moves
scene.add(mesh);                                    // N objects, ONE draw call
```

**Say:** *"The unit-geometry-plus-scale-matrix trick is what lets differently-sized boxes share one instanced mesh. And the trap is materials — give each instance its own and you're back to N draw calls with nothing warning you."*

---

## Drill 3 — Picking

```js
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointerdown', (e) => {
  const r = canvas.getBoundingClientRect();
  ndc.x =  ((e.clientX - r.left) / r.width)  * 2 - 1;   // → [-1, 1]
  ndc.y = -((e.clientY - r.top)  / r.height) * 2 + 1;   // y is flipped
  raycaster.setFromCamera(ndc, camera);
  const [hit] = raycaster.intersectObjects(scene.children, true);
  if (hit) select(hit.object);
});
```

**Then immediately say the senior thing:**
> *"That's fine up to a few thousand objects. Past that I'd render an id buffer — encode each element's id as an RGBA colour into an offscreen target, read the one pixel under the cursor, decode it back. Constant time, pixel-exact, and it handles instanced meshes, which raycasting doesn't without extra work."*

---

## Drill 4 — Disposal (the memory-leak probe)

```js
function destroy(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m) continue;
      for (const k of Object.keys(m)) m[k]?.isTexture && m[k].dispose();   // textures too
      m.dispose();
    }
  });
  obj.removeFromParent();
}
```

> *"GPU memory isn't garbage-collected. If you drop a mesh without disposing its geometry, material and textures, you leak VRAM until the context dies — and on WebGPU a device loss takes the whole canvas with it."*

---

## Drill 5 — The likely MORFIS-flavoured exercise

Be ready for something like: **"Take this JSON from an LLM and turn it into geometry — safely."**

```ts
type Op =
  | { op: 'box';    w: number; h: number; d: number }
  | { op: 'hole';   d: number; x: number; y: number }
  | { op: 'fillet'; r: number };

function validate(ops: unknown): Op[] {
  if (!Array.isArray(ops)) throw new Error('expected an array of ops');
  return ops.map((o, i) => {
    if (typeof o !== 'object' || o === null) throw new Error(`op ${i}: not an object`);
    const op = (o as any).op;
    switch (op) {
      case 'box': {
        const { w, h, d } = o as any;
        for (const [k, v] of Object.entries({ w, h, d })) {
          if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
            throw new Error(`op ${i} (box): ${k} must be a positive finite number, got ${v}`);
          }
        }
        return { op: 'box', w, h, d };
      }
      // … hole, fillet
      default: throw new Error(`op ${i}: unknown op "${op}"`);
    }
  });
}
```

**The points you are scoring here — narrate every one:**
- **Never trust the model's output.** Parse, don't assume.
- **A closed op vocabulary** (a discriminated union) beats free-form code — invalid becomes *unrepresentable*.
- **Precise, actionable errors** — because those errors are the **feedback signal you send back to the model** for self-correction. *"The error message is a prompt."*
- Guard the geometric edge cases: zero, negative, `NaN`, `Infinity`, a fillet larger than half the smallest edge.

If you get this exercise, **you have already built this system.** Say so.

---

## The 60 seconds before you start typing

- Screen-share ready; editor font size **up**.
- Say: *"I'll think out loud — stop me whenever."*
- If you're stuck: *"Let me talk through what I'd want here…"* — never freeze.
- If you don't know: *"I don't know that off-hand — here's how I'd find out."* **That answer is respected.**
