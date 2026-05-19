// solidStore — per-solid catalogue with the §12.2 LOD bitmask.
//
// Per `phases/PHASE-3B-FAMILY-CREATOR-REWRITE-PLAN.md` §12.2 every
// solid declares `{ coarse, medium, fine }`. The committer asks the
// active view's LOD policy which mask bit applies and culls solids
// that do not match. The default for a freshly created solid is
// `{ coarse:false, medium:true, fine:true }` — visible in medium and
// fine, hidden in coarse plan-from-far-away views.
//
// LAYER — L1-equivalent: pure store. No THREE, no DOM, no
// `(window as any)`. Frozen snapshots for dirty-tracking.
//
// SHAPE
//   • Each solid is keyed by an opaque `SolidId` and references its
//     producer kind (extrude / sweep / revolve / loft / boolean) by
//     string. The store does NOT own producer args — those live in
//     the document model — it just owns the per-solid LOD + material
//     slot decisions which are independent of the producer args.

export type SolidId = string & { readonly __brand: 'SolidId' };

export type SolidProducerKind =
  | 'extrude'
  | 'sweep'
  | 'revolve'
  | 'loft'
  | 'boolean';

/**
 * §12.2 LOD bitmask — each bit declares whether the solid is rendered
 * at that LOD. The "bitmask" is conceptually `Coarse | Medium | Fine`
 * but is exposed as a plain object so authors and serializers can
 * reason about each flag by name.
 */
export interface LodBitmask {
  readonly coarse: boolean;
  readonly medium: boolean;
  readonly fine: boolean;
}

export const DEFAULT_LOD_BITMASK: LodBitmask = Object.freeze({
  coarse: false,
  medium: true,
  fine: true,
});

export type LodLevel = 'coarse' | 'medium' | 'fine';

/** Pure-LOD bitmask predicate. Used by the committer when filtering. */
export function isVisibleAt(mask: LodBitmask, level: LodLevel): boolean {
  return mask[level] === true;
}

export interface Solid {
  readonly id: SolidId;
  readonly name: string;
  readonly kind: SolidProducerKind;
  readonly lod: LodBitmask;
  /** Optional material-slot binding name (per §12.1). */
  readonly materialSlot: string | null;
}

export interface SolidSnapshot {
  readonly solids: readonly Solid[];
  readonly byId: Readonly<Record<string, Solid>>;
  readonly version: number;
}

export type SolidSubscriber = (snap: SolidSnapshot) => void;

export interface SolidAddInput {
  readonly id?: SolidId;
  readonly name: string;
  readonly kind: SolidProducerKind;
  readonly lod?: LodBitmask;
  readonly materialSlot?: string | null;
}

export interface SolidStore {
  get(): SolidSnapshot;
  subscribe(fn: SolidSubscriber): () => void;
  add(input: SolidAddInput): SolidId;
  remove(id: SolidId): void;
  setLodBitmask(id: SolidId, lod: LodBitmask): void;
  setMaterialSlot(id: SolidId, slot: string | null): void;
  clear(): void;
}

const EMPTY: SolidSnapshot = Object.freeze({
  solids: Object.freeze([]) as readonly Solid[],
  byId: Object.freeze({}) as Readonly<Record<string, Solid>>,
  version: 0,
});

function freezeSolid(s: Solid): Solid {
  return Object.freeze({
    id: s.id,
    name: s.name,
    kind: s.kind,
    lod: Object.freeze({ coarse: s.lod.coarse, medium: s.lod.medium, fine: s.lod.fine }),
    materialSlot: s.materialSlot,
  });
}

function validateLod(lod: LodBitmask, where: string): void {
  if (
    typeof lod.coarse !== 'boolean' ||
    typeof lod.medium !== 'boolean' ||
    typeof lod.fine !== 'boolean'
  ) {
    throw new Error(`solidStore.${where}: lod bitmask must be all booleans.`);
  }
}

export function createSolidStore(): SolidStore {
  let snap: SolidSnapshot = EMPTY;
  const subs = new Set<SolidSubscriber>();
  let counter = 0;

  function notify(): void {
    for (const fn of subs) fn(snap);
  }

  function rebuild(solids: readonly Solid[]): void {
    const byId: Record<string, Solid> = {};
    for (const s of solids) byId[s.id] = s;
    snap = Object.freeze({
      solids: Object.freeze([...solids]),
      byId: Object.freeze(byId),
      version: snap.version + 1,
    });
  }

  return {
    get() { return snap; },
    subscribe(fn) {
      subs.add(fn);
      return () => { subs.delete(fn); };
    },
    add(input) {
      const id = input.id ?? (`s-${(++counter).toString(36)}` as SolidId);
      if (snap.byId[id]) {
        throw new Error(`solidStore.add: duplicate id "${id}".`);
      }
      if (typeof input.name !== 'string' || input.name.length === 0) {
        throw new Error('solidStore.add: name must be a non-empty string.');
      }
      const lod = input.lod ?? DEFAULT_LOD_BITMASK;
      validateLod(lod, 'add');
      const next = freezeSolid({
        id,
        name: input.name,
        kind: input.kind,
        lod,
        materialSlot: input.materialSlot ?? null,
      });
      rebuild([...snap.solids, next]);
      notify();
      return id;
    },
    remove(id) {
      if (!snap.byId[id]) return;
      rebuild(snap.solids.filter((s) => s.id !== id));
      notify();
    },
    setLodBitmask(id, lod) {
      const cur = snap.byId[id];
      if (!cur) throw new Error(`solidStore.setLodBitmask: unknown id "${id}".`);
      validateLod(lod, 'setLodBitmask');
      const next = freezeSolid({ ...cur, lod });
      rebuild(snap.solids.map((s) => (s.id === id ? next : s)));
      notify();
    },
    setMaterialSlot(id, slot) {
      const cur = snap.byId[id];
      if (!cur) throw new Error(`solidStore.setMaterialSlot: unknown id "${id}".`);
      const next = freezeSolid({ ...cur, materialSlot: slot });
      rebuild(snap.solids.map((s) => (s.id === id ? next : s)));
      notify();
    },
    clear() {
      if (snap.solids.length === 0) return;
      snap = Object.freeze({ ...EMPTY, version: snap.version + 1 });
      notify();
    },
  };
}
