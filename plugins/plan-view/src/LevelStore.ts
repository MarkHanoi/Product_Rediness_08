// LevelStore — ephemeral per-session active-level registry (S29 / ADR-0028).
//
// A level is a horizontal slice of the building (Ground Floor, L1, etc).
// Plan view filters walls/slabs/doors by their `levelId`; switching the
// active level re-renders the plan view.
//
// The store is `ephemeral` because levels are project metadata loaded on
// project open — they are NOT replayed through the command bus event
// log alongside element mutations.
//
// Mutations land via `applyPatch` like every other Store: the helper
// methods here build immer-shaped patches in memory and forward them.

import { Store } from '@pryzm/plugin-sdk';
import type { Patch } from '@pryzm/plugin-sdk';

export interface LevelData {
  readonly id: string;
  readonly name: string;
  /** World-Y elevation in metres for the level's base plane. */
  readonly elevation: number;
  readonly isActive: boolean;
}

export class LevelStore extends Store<LevelData> {
  /** Levels are session-scoped metadata; not replayed via the command-bus event log. */
  static readonly ephemeral = true;

  constructor() { super('level'); }

  /** Insert a level. Becomes active iff no level was active before. */
  addLevel(level: Omit<LevelData, 'isActive'> & { isActive?: boolean }): void {
    const hasActive = this.getActiveLevel() !== undefined;
    const data: LevelData = {
      id: level.id,
      name: level.name,
      elevation: level.elevation,
      isActive: level.isActive ?? !hasActive,
    };
    const patches: Patch[] = [{ op: 'add', path: [data.id], value: data }];
    this.applyPatch(patches);
  }

  /** Make `id` the unique active level. No-op if `id` is already active. */
  setActive(id: string): void {
    const target = this.state.get(id);
    if (!target) throw new Error(`[LevelStore] setActive: unknown level id "${id}"`);
    const patches: Patch[] = [];
    for (const [lid, level] of this.state) {
      const shouldBeActive = lid === id;
      if (level.isActive !== shouldBeActive) {
        patches.push({
          op: 'replace',
          path: [lid],
          value: { ...level, isActive: shouldBeActive },
        });
      }
    }
    if (patches.length > 0) this.applyPatch(patches);
  }

  getActiveLevel(): Readonly<LevelData> | undefined {
    for (const l of this.state.values()) if (l.isActive) return l;
    return undefined;
  }

  list(): readonly LevelData[] {
    return [...this.state.values()].sort((a, b) => a.elevation - b.elevation);
  }
}
