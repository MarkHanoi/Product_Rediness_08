// referencePlaneStore — named reference planes / axes for the family
// editor (S53 D5 / per `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md`
// §6.3).
//
// Reference planes are the family author's anchors for parameter-driven
// constraints (e.g. "centre line of the column"). They live OUTSIDE
// the per-sketch coordinate frame so they survive sketch edits and so
// IFC/Pset bindings (S55) can target them by name. A plane is defined
// by:
//   • origin   — `{x, y, z}` in metres
//   • normal   — unit `{x, y, z}` vector
//   • name     — author-visible label (must be unique per family)
//
// LAYER — L1-equivalent: pure store. No THREE, no DOM, no
// `(window as any)`. Frozen snapshots for dirty-tracking.

export type ReferencePlaneId = string & { readonly __brand: 'ReferencePlaneId' };

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

export interface ReferencePlane {
  readonly id: ReferencePlaneId;
  readonly name: string;
  readonly origin: Vec3;
  readonly normal: Vec3;
}

export interface ReferencePlaneSnapshot {
  readonly planes: readonly ReferencePlane[];
  readonly byId: Readonly<Record<string, ReferencePlane>>;
  readonly byName: Readonly<Record<string, ReferencePlane>>;
  readonly version: number;
}

export type ReferencePlaneSubscriber = (snap: ReferencePlaneSnapshot) => void;

export interface ReferencePlaneStore {
  get(): ReferencePlaneSnapshot;
  subscribe(fn: ReferencePlaneSubscriber): () => void;
  /** Add a new plane. Throws on duplicate id or name. */
  add(plane: Omit<ReferencePlane, 'id'> & { readonly id?: ReferencePlaneId }): ReferencePlaneId;
  /** Replace plane fields by id (name change is allowed if it stays unique). */
  update(id: ReferencePlaneId, patch: Partial<Omit<ReferencePlane, 'id'>>): void;
  remove(id: ReferencePlaneId): void;
  clear(): void;
}

const EMPTY: ReferencePlaneSnapshot = Object.freeze({
  planes: Object.freeze([]) as readonly ReferencePlane[],
  byId: Object.freeze({}) as Readonly<Record<string, ReferencePlane>>,
  byName: Object.freeze({}) as Readonly<Record<string, ReferencePlane>>,
  version: 0,
});

const NORMAL_TOL = 1e-6;

export function createReferencePlaneStore(): ReferencePlaneStore {
  let snap: ReferencePlaneSnapshot = EMPTY;
  const subs = new Set<ReferencePlaneSubscriber>();
  let counter = 0;

  function notify(): void {
    for (const fn of subs) fn(snap);
  }

  function rebuild(planes: readonly ReferencePlane[]): void {
    const byId: Record<string, ReferencePlane> = {};
    const byName: Record<string, ReferencePlane> = {};
    for (const p of planes) {
      byId[p.id] = p;
      byName[p.name] = p;
    }
    snap = Object.freeze({
      planes: Object.freeze([...planes]),
      byId: Object.freeze(byId),
      byName: Object.freeze(byName),
      version: snap.version + 1,
    });
  }

  function freezePlane(p: ReferencePlane): ReferencePlane {
    return Object.freeze({
      id: p.id,
      name: p.name,
      origin: Object.freeze({ ...p.origin }),
      normal: Object.freeze({ ...normalizeVec(p.normal) }),
    });
  }

  return {
    get() { return snap; },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    add(plane) {
      const id = (plane.id ?? (`rp-${(++counter).toString(36)}` as ReferencePlaneId));
      if (snap.byId[id]) throw new Error(`referencePlaneStore.add: duplicate id "${id}".`);
      if (snap.byName[plane.name]) {
        throw new Error(`referencePlaneStore.add: duplicate name "${plane.name}".`);
      }
      validateNormal(plane.normal, 'add');
      validateOrigin(plane.origin, 'add');
      const next = freezePlane({
        id, name: plane.name, origin: plane.origin, normal: plane.normal,
      });
      rebuild([...snap.planes, next]);
      notify();
      return id;
    },
    update(id, patch) {
      const cur = snap.byId[id];
      if (!cur) throw new Error(`referencePlaneStore.update: unknown id "${id}".`);
      const merged: ReferencePlane = {
        id: cur.id,
        name: patch.name ?? cur.name,
        origin: patch.origin ?? cur.origin,
        normal: patch.normal ?? cur.normal,
      };
      if (merged.name !== cur.name && snap.byName[merged.name]) {
        throw new Error(`referencePlaneStore.update: duplicate name "${merged.name}".`);
      }
      validateNormal(merged.normal, 'update');
      validateOrigin(merged.origin, 'update');
      const next = freezePlane(merged);
      rebuild(snap.planes.map((p) => (p.id === id ? next : p)));
      notify();
    },
    remove(id) {
      if (!snap.byId[id]) return;
      rebuild(snap.planes.filter((p) => p.id !== id));
      notify();
    },
    clear() {
      if (snap.planes.length === 0) return;
      snap = Object.freeze({ ...EMPTY, version: snap.version + 1 });
      notify();
    },
  };
}

function validateOrigin(v: Vec3, where: string): void {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
    throw new Error(`referencePlaneStore.${where}: origin must be finite.`);
  }
}

function validateNormal(v: Vec3, where: string): void {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
    throw new Error(`referencePlaneStore.${where}: normal must be finite.`);
  }
  const len = Math.hypot(v.x, v.y, v.z);
  if (len < NORMAL_TOL) {
    throw new Error(`referencePlaneStore.${where}: normal magnitude too small (${len}).`);
  }
}

function normalizeVec(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
