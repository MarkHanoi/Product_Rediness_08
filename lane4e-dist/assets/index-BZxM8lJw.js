import { B as BufferGeometry, j as BufferAttribute, b as Box3, V as Vector3, e as Sphere, cy as MeshStandardMaterial, D as DoubleSide, C as Color, G as Group, M as Mesh } from './three.core-Bv4ks8y-.js';

function buildComponentBufferGeometry(descriptor) {
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(descriptor.position, 3));
  g.setAttribute("normal", new BufferAttribute(descriptor.normal, 3));
  g.setAttribute("uv", new BufferAttribute(descriptor.uv, 2));
  g.setIndex(new BufferAttribute(descriptor.index, 1));
  for (const grp of descriptor.groups) g.addGroup(grp.start, grp.count, grp.materialIndex);
  const { min, max } = descriptor.bounds;
  g.boundingBox = new Box3(
    new Vector3(min.x, min.y, min.z),
    new Vector3(max.x, max.y, max.z)
  );
  const cx = (min.x + max.x) * 0.5;
  const cy = (min.y + max.y) * 0.5;
  const cz = (min.z + max.z) * 0.5;
  g.boundingSphere = new Sphere(
    new Vector3(cx, cy, cz),
    Math.hypot(max.x - cx, max.y - cy, max.z - cz)
  );
  return g;
}
function disposeComponentGeometry(g) {
  if (g) g.dispose();
}

const UNRESOLVED_PREFIX = "unresolved:";
const UNRESOLVED_MATERIAL_COLOR = "#ff00ff";
const DEFAULT_COMPONENT_COLOR = "#b8bec8";
const ROUGHNESS = 0.65;
const METALNESS = 0.05;
function isUnresolvedComponentMaterialKey(key) {
  return key.includes(UNRESOLVED_PREFIX);
}
function colorOfComponentMaterialKey(key) {
  return isUnresolvedComponentMaterialKey(key) ? UNRESOLVED_MATERIAL_COLOR : DEFAULT_COMPONENT_COLOR;
}
function makeComponentMaterialFactory(key) {
  const color = colorOfComponentMaterialKey(key);
  return () => new MeshStandardMaterial({
    color: new Color(color),
    roughness: ROUGHNESS,
    metalness: METALNESS,
    side: DoubleSide
  });
}

function geometryKeyOf(dto) {
  const params = dto.instanceParameters ?? {};
  const sorted = Object.keys(params).sort().map((k) => `${k}=${String(params[k])}`).join(",");
  return `${dto.definitionId}|${dto.typeId}|${sorted}`;
}
function applyTransform(obj, dto) {
  const o = dto.origin;
  obj.position.set(o.x, o.y, o.z);
  obj.rotation.set(0, dto.rotation, 0);
}
class ComponentCommitter {
  /** ⚠ SINGULAR, and it must equal the store key `bindStore` is called with and
   *  the key `affectedStores` names. `plugins/dimensions` binding `dimension`
   *  against a `dimensions` store is the standing example of the one-character
   *  drift that makes a live channel read as an empty one. */
  primitiveType = "component";
  stats = {
    rebuilds: 0,
    staleBakesDiscarded: 0,
    transformOnlyUpdates: 0,
    unresolvedDefinitions: 0,
    refusedBakes: 0,
    attachedSolids: 0
  };
  entries = /* @__PURE__ */ new Map();
  materialPool;
  bake;
  definitions;
  onGeometryReady;
  disposed = false;
  constructor(deps) {
    if (!deps.materialPool) throw new Error("[ComponentCommitter] materialPool is required");
    if (!deps.bake) throw new Error("[ComponentCommitter] bake port is required");
    if (!deps.definitions) throw new Error("[ComponentCommitter] definitions port is required");
    this.materialPool = deps.materialPool;
    this.bake = deps.bake;
    this.definitions = deps.definitions;
    this.onGeometryReady = deps.onGeometryReady;
  }
  onAdd(id, dto) {
    const group = new Group();
    group.name = `component:${id}`;
    group.userData["elementId"] = id;
    group.userData["primitiveType"] = "component";
    group.userData["definitionId"] = dto.definitionId;
    group.userData["typeId"] = dto.typeId;
    applyTransform(group, dto);
    const entry = { group, handles: [], geometryKey: geometryKeyOf(dto), generation: 0 };
    this.entries.set(id, entry);
    void this.rebuild(id, dto, entry);
    return group;
  }
  onUpdate(id, dto, obj) {
    const entry = this.entries.get(id);
    if (entry === void 0) {
      const adopted = { group: obj, handles: [], geometryKey: geometryKeyOf(dto), generation: 0 };
      this.entries.set(id, adopted);
      applyTransform(obj, dto);
      void this.rebuild(id, dto, adopted);
      return;
    }
    applyTransform(obj, dto);
    obj.userData["definitionId"] = dto.definitionId;
    obj.userData["typeId"] = dto.typeId;
    const nextKey = geometryKeyOf(dto);
    if (nextKey === entry.geometryKey) {
      this.stats.transformOnlyUpdates += 1;
      return;
    }
    entry.geometryKey = nextKey;
    void this.rebuild(id, dto, entry);
  }
  onRemove(id, obj) {
    const entry = this.entries.get(id) ?? { group: obj, handles: [], geometryKey: "", generation: 0 };
    entry.generation += 1;
    this.clearSolids(entry);
    obj.removeFromParent();
    this.entries.delete(id);
  }
  onDispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.generation += 1;
      this.clearSolids(entry);
    }
    this.entries.clear();
  }
  // ── internals ───────────────────────────────────────────────────────────────
  async rebuild(id, dto, entry) {
    const generation = ++entry.generation;
    this.stats.rebuilds += 1;
    if (dto.definitionId === "" || !this.definitions.has(dto.definitionId)) {
      this.stats.unresolvedDefinitions += 1;
      this.clearSolids(entry);
      entry.group.userData["pryzmUnresolvedDefinition"] = dto.definitionId;
      console.warn(
        `[ComponentCommitter] ${id} names definitionId "${dto.definitionId}" which this wiring cannot resolve — rendering NOTHING for it. There is no project-level component-definition registry at this commit (audit §12 Phase 4C); a placeholder here would be spec §75's demo-only geometry.`
      );
      this.onGeometryReady?.(id, 0);
      return;
    }
    delete entry.group.userData["pryzmUnresolvedDefinition"];
    let result;
    try {
      result = await this.bake({
        definitionId: dto.definitionId,
        typeId: dto.typeId,
        instanceOverrides: dto.instanceParameters ?? {}
      });
    } catch (err) {
      if (generation !== entry.generation || this.disposed) {
        this.stats.staleBakesDiscarded += 1;
        return;
      }
      this.stats.refusedBakes += 1;
      this.clearSolids(entry);
      entry.group.userData["pryzmBakeError"] = err instanceof Error ? err.message : String(err);
      console.warn(`[ComponentCommitter] bake threw for ${id}:`, err);
      this.onGeometryReady?.(id, 0);
      return;
    }
    if (generation !== entry.generation || this.disposed) {
      this.stats.staleBakesDiscarded += 1;
      return;
    }
    this.clearSolids(entry);
    if (result.baked.length === 0) {
      this.stats.refusedBakes += 1;
      const first = result.unsupported[0];
      entry.group.userData["pryzmBakeRefusal"] = first ? `${first.reason}: ${first.message}` : "bake produced no solids and named no refusal";
      console.warn(
        `[ComponentCommitter] ${id} baked ZERO solids (${result.unsupported.length} refused). First: ${first?.message ?? "(none named)"}`
      );
      this.onGeometryReady?.(id, 0);
      return;
    }
    delete entry.group.userData["pryzmBakeRefusal"];
    delete entry.group.userData["pryzmBakeError"];
    for (const solid of result.baked) {
      const geometry = buildComponentBufferGeometry(solid.descriptor);
      const handles = solid.descriptor.materialKeys.map(
        (key) => this.materialPool.acquire(String(key), makeComponentMaterialFactory(String(key)))
      );
      const materials = handles.map((h) => h.material);
      const mesh = new Mesh(
        geometry,
        materials.length === 1 ? materials[0] : materials
      );
      mesh.name = `component:${id}:${solid.solidId}`;
      mesh.userData["elementId"] = id;
      mesh.userData["primitiveType"] = "component";
      mesh.userData["solidId"] = solid.solidId;
      mesh.userData["descriptorHash"] = solid.descriptor.hash;
      entry.group.add(mesh);
      entry.handles.push(...handles);
      this.stats.attachedSolids += 1;
    }
    this.onGeometryReady?.(id, result.baked.length);
  }
  /** Detach + dispose every solid mesh of one element and release its material
   *  refs. Idempotent; leaves the group itself in the scene graph. */
  clearSolids(entry) {
    for (const child of [...entry.group.children]) {
      entry.group.remove(child);
      const mesh = child;
      disposeComponentGeometry(mesh.geometry);
      this.stats.attachedSolids -= 1;
    }
    for (const h of entry.handles) {
      try {
        h.release();
      } catch {
      }
    }
    entry.handles = [];
  }
}

export { ComponentCommitter, DEFAULT_COMPONENT_COLOR, UNRESOLVED_MATERIAL_COLOR, buildComponentBufferGeometry, colorOfComponentMaterialKey, disposeComponentGeometry, isUnresolvedComponentMaterialKey, makeComponentMaterialFactory };
