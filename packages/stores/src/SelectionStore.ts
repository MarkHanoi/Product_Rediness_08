// SelectionStore — pure DTO selection state (S07-T6, bring-forward from S16).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S07-T6 (line 285):
//   "`packages/stores/SelectionStore.ts`: bring-forward from S16 — the
//    selection store is needed earlier than originally planned because
//    wall handlers will eventually emit selection diffs.  ~80 LOC target.
//    Pure DTO state."
//
// One `SelectionDto` entry per selected element id (multi-selection is
// modelled as multiple entries).  The DTO is intentionally minimal —
// `kind` records what KIND of element the id refers to so downstream
// consumers (inspectors, render highlights) can branch without touching
// every element store.
//
// No THREE.  No DOM.  No window.  Identical wire-shape across browser
// and Node — the same selection events that flow over the sync server
// also drive the local highlight overlay.

import type { Patch } from 'immer';
import { Store } from './Store.js';

/** What kind of element the selected id refers to.  Mirrors the
 *  `ElementType` brand from `@pryzm/protocol` but stored as a plain
 *  string so the store stays brand-free at the storage boundary. */
export type SelectionKind =
  | 'wall'
  | 'slab'
  | 'door'
  | 'window'
  | 'roof'
  | 'curtainWall'
  | 'grid'
  | 'column'
  | 'beam'
  | 'stair'
  | 'handrail'
  | 'ceiling'
  | 'room'
  | 'furniture'
  | 'annotation'
  | 'dimension'
  | 'opening';

export interface SelectionDto {
  /** The id of the selected element.  Same value as the entry key in
   *  the underlying `Store<SelectionDto>`. */
  readonly id: string;
  /** Element kind — drives downstream branching (highlight colour,
   *  inspector form, picking layer). */
  readonly kind: SelectionKind;
  /** Optional sub-element pointer — e.g. the opening id when an opening
   *  is selected on a wall.  Allows inspectors to focus a child without
   *  losing the parent selection. */
  readonly subId?: string;
  /** Wall-clock timestamp the selection was last touched.  Used by the
   *  marquee tool to break ties when a click lands on overlapping
   *  picks (most-recent wins). */
  readonly selectedAt: number;
}

/** S16 selection mode — `replace` clears existing entries first; `add`
 *  appends; `toggle` removes already-selected ids and adds the rest. */
export type SelectionMode = 'replace' | 'add' | 'toggle';

/** Pair of (id, kind) used by the convenience mutators.  Kind is
 *  REQUIRED — picking strategies always have it (`PickResult.elementKind`). */
export interface SelectionTarget {
  readonly id: string;
  readonly kind: SelectionKind;
  readonly subId?: string;
}

export class SelectionStore extends Store<SelectionDto> {
  /** S16 — flag the store as ephemeral so the persistence layer can
   *  skip selection entries from snapshot deltas (R1C-07 mitigation:
   *  selection state should not survive a hard reload).  Surfaced as
   *  a static field so the PatchEmitter can introspect without
   *  importing this concrete class. */
  static readonly ephemeral = true as const;

  constructor() {
    super('selection');
  }

  /** Convenience read — every currently-selected element id.  O(N). */
  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Has the given id been selected? */
  isSelected(id: string): boolean {
    return this.state.has(id);
  }

  /** Convenience read — the most-recently-selected entry, or
   *  `undefined` if nothing is selected.  O(N). */
  primary(): Readonly<SelectionDto> | undefined {
    let latest: Readonly<SelectionDto> | undefined;
    for (const dto of this.state.values()) {
      if (latest === undefined || dto.selectedAt > latest.selectedAt) latest = dto;
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
  select(
    targets: readonly SelectionTarget[],
    mode: SelectionMode = 'replace',
    nowMs: number = Date.now(),
  ): void {
    const patches: Patch[] = [];

    if (mode === 'replace') {
      for (const id of this.state.keys()) {
        patches.push({ op: 'remove', path: [id] });
      }
      for (const t of targets) {
        patches.push({ op: 'add', path: [t.id], value: this.dtoFor(t, nowMs) });
      }
    } else if (mode === 'add') {
      for (const t of targets) {
        if (this.state.has(t.id)) {
          patches.push({ op: 'replace', path: [t.id], value: this.dtoFor(t, nowMs) });
        } else {
          patches.push({ op: 'add', path: [t.id], value: this.dtoFor(t, nowMs) });
        }
      }
    } else {
      // toggle
      for (const t of targets) {
        if (this.state.has(t.id)) {
          patches.push({ op: 'remove', path: [t.id] });
        } else {
          patches.push({ op: 'add', path: [t.id], value: this.dtoFor(t, nowMs) });
        }
      }
    }

    if (patches.length > 0) this.applyPatch(patches);
  }

  /** S16-T6 — deselect a batch of ids.  Ids not currently selected are
   *  silently skipped (idempotent). */
  deselect(ids: readonly string[]): void {
    const patches: Patch[] = [];
    for (const id of ids) {
      if (this.state.has(id)) patches.push({ op: 'remove', path: [id] });
    }
    if (patches.length > 0) this.applyPatch(patches);
  }

  /** S16-T6 — clear every selection.  No-op if nothing is selected. */
  override clear(): void {
    if (this.state.size === 0) return;
    const patches: Patch[] = [];
    for (const id of this.state.keys()) {
      patches.push({ op: 'remove', path: [id] });
    }
    this.applyPatch(patches);
  }

  private dtoFor(t: SelectionTarget, nowMs: number): SelectionDto {
    const dto: SelectionDto = t.subId !== undefined
      ? { id: t.id, kind: t.kind, subId: t.subId, selectedAt: nowMs }
      : { id: t.id, kind: t.kind, selectedAt: nowMs };
    return dto;
  }
}
