// viewTabStore — the active view tab of the Family Creator (S52 D1).
//
// Three-way discriminated state: 'sketch' | '3d' | 'parameters'.  The
// `'3d'` tab is the load-bearing one for the §15 perf budget — the
// THREE-using preview chunk only loads when the store transitions
// into '3d' (lazy import inside the 3D panel module, not here).
//
// LAYER — L1-equivalent (this app uses a tiny ad-hoc store family
// instead of pulling `@pryzm/stores`; we'll consolidate at S55 once
// `ParameterTable` and `TypeCatalog` arrive and the store count
// exceeds three).  Pure: subscribe / get / set, frozen snapshots,
// no rAF, no THREE, no `(window as any)`.

export type ViewTab = 'sketch' | '3d' | 'parameters';

export interface ViewTabSnapshot {
  readonly active: ViewTab;
  /** Monotonic transition counter — useful for cache-busting downstream. */
  readonly version: number;
}

export type ViewTabSubscriber = (snap: ViewTabSnapshot) => void;

export interface ViewTabStore {
  /** Read the current frozen snapshot.  Cheap; never allocates. */
  get(): ViewTabSnapshot;
  /** Subscribe to every transition; returns an unsubscribe function. */
  subscribe(fn: ViewTabSubscriber): () => void;
  /**
   * Switch tabs.  Idempotent — setting the active tab to its current
   * value is a no-op (no version bump, no subscriber notification).
   */
  setActive(next: ViewTab): void;
}

const VALID_TABS: ReadonlySet<ViewTab> = new Set<ViewTab>([
  'sketch',
  '3d',
  'parameters',
]);

export function createViewTabStore(initial: ViewTab = 'sketch'): ViewTabStore {
  if (!VALID_TABS.has(initial)) {
    throw new Error(`createViewTabStore: invalid initial tab "${initial}".`);
  }

  let snap: ViewTabSnapshot = Object.freeze({ active: initial, version: 0 });
  const subscribers = new Set<ViewTabSubscriber>();

  return {
    get() {
      return snap;
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },
    setActive(next) {
      if (!VALID_TABS.has(next)) {
        throw new Error(`viewTabStore.setActive: invalid tab "${next}".`);
      }
      if (next === snap.active) return;
      snap = Object.freeze({ active: next, version: snap.version + 1 });
      for (const fn of subscribers) {
        fn(snap);
      }
    },
  };
}
