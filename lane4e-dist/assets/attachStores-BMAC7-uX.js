import { T as Store } from './ElementStore-CQe7ZDFd.js';

class CubeStore extends Store {
  constructor() {
    super("cube");
  }
}

class SelectionStore extends Store {
  /** S16 — flag the store as ephemeral so the persistence layer can
   *  skip selection entries from snapshot deltas (R1C-07 mitigation:
   *  selection state should not survive a hard reload).  Surfaced as
   *  a static field so the PatchEmitter can introspect without
   *  importing this concrete class. */
  static ephemeral = true;
  constructor() {
    super("selection");
  }
  /** Convenience read — every currently-selected element id.  O(N). */
  ids() {
    return [...this.state.keys()];
  }
  /** Has the given id been selected? */
  isSelected(id) {
    return this.state.has(id);
  }
  /** Convenience read — the most-recently-selected entry, or
   *  `undefined` if nothing is selected.  O(N). */
  primary() {
    let latest;
    for (const dto of this.state.values()) {
      if (latest === void 0 || dto.selectedAt > latest.selectedAt) latest = dto;
    }
    return latest;
  }
  /** S16-T6 — select a batch of ids with the given mode.
   *
   *  `replace` (default): clear existing entries, then add `targets`.
   *  `add`              : add `targets`; existing entries untouched.
   *  `toggle`           : ids already selected are deselected; the rest are added.
   *
   *  Patches are emitted as a single `applyPatch` call so subscribers
   *  see one DirtyDiff per `select(...)` invocation (mirrors the
   *  per-tick batching contract in `Store.applyPatch`). */
  select(targets, mode = "replace", nowMs = Date.now()) {
    const patches = [];
    if (mode === "replace") {
      for (const id of this.state.keys()) {
        patches.push({ op: "remove", path: [id] });
      }
      for (const t of targets) {
        patches.push({ op: "add", path: [t.id], value: this.dtoFor(t, nowMs) });
      }
    } else if (mode === "add") {
      for (const t of targets) {
        if (this.state.has(t.id)) {
          patches.push({ op: "replace", path: [t.id], value: this.dtoFor(t, nowMs) });
        } else {
          patches.push({ op: "add", path: [t.id], value: this.dtoFor(t, nowMs) });
        }
      }
    } else {
      for (const t of targets) {
        if (this.state.has(t.id)) {
          patches.push({ op: "remove", path: [t.id] });
        } else {
          patches.push({ op: "add", path: [t.id], value: this.dtoFor(t, nowMs) });
        }
      }
    }
    if (patches.length > 0) this.applyPatch(patches);
  }
  /** S16-T6 — deselect a batch of ids.  Ids not currently selected are
   *  silently skipped (idempotent). */
  deselect(ids) {
    const patches = [];
    for (const id of ids) {
      if (this.state.has(id)) patches.push({ op: "remove", path: [id] });
    }
    if (patches.length > 0) this.applyPatch(patches);
  }
  /** S16-T6 — clear every selection.  No-op if nothing is selected. */
  clear() {
    if (this.state.size === 0) return;
    const patches = [];
    for (const id of this.state.keys()) {
      patches.push({ op: "remove", path: [id] });
    }
    this.applyPatch(patches);
  }
  dtoFor(t, nowMs) {
    const dto = t.subId !== void 0 ? { id: t.id, kind: t.kind, subId: t.subId, selectedAt: nowMs } : { id: t.id, kind: t.kind, selectedAt: nowMs };
    return dto;
  }
}

class AnnotationStore extends Store {
  constructor() {
    super("annotation");
  }
  ids() {
    return [...this.state.keys()];
  }
  byView(viewId) {
    const out = [];
    for (const a of this.state.values()) if (a.viewId === viewId) out.push(a);
    return out;
  }
  byHostElement(hostElementId) {
    const out = [];
    for (const a of this.state.values()) if (a.hostElementId === hostElementId) out.push(a);
    return out;
  }
  get(id) {
    return this.state.get(id);
  }
}

function attachStores(emitter, stores, opts = {}) {
  const onUnknownStore = opts.onUnknownStore;
  const strict = opts.strict === true;
  const dropped = /* @__PURE__ */ new Map();
  const unsubscribe = emitter.subscribe((_bytes, record) => {
    for (const entry of record.patches) {
      const store = stores[entry.storeKey];
      if (store === void 0) {
        if (strict) {
          throw new Error(
            `[attachStores] §FIX-SILENT-PATCH-DROP (L-811) — no Store registered for '${entry.storeKey}', so ${entry.forwardPatches.length} patch(es) from command '${record.type}' would be DROPPED. strict mode refuses: a durable patch stream must not lose a patch it has already committed.`
          );
        }
        if (onUnknownStore !== void 0) {
          onUnknownStore(entry.storeKey, record);
          continue;
        }
        const before = dropped.get(entry.storeKey) ?? 0;
        dropped.set(entry.storeKey, before + entry.forwardPatches.length);
        if (before === 0) {
          console.error(
            `[attachStores] §FIX-SILENT-PATCH-DROP (L-811) — no Store registered for '${entry.storeKey}'. Patches from '${record.type}' are being DROPPED, so that command has no effect. Either register the store, or declare the correct \`affectedStores\` on the handler. Further drops for this key are counted, not logged.`
          );
        }
        continue;
      }
      store.applyPatch(entry.forwardPatches);
    }
  });
  return unsubscribe;
}

export { AnnotationStore as A, CubeStore as C, SelectionStore as S, attachStores as a };
