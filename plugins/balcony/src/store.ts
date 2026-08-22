// BalconyStore — the pure DTO store for the balcony COMPOUND parent.
// §FEAT-BALCONY-COMPOUND (L-5600) · C103 · ADR-0333
//
// Mirrors `plugins/pool/src/store.ts`: THREE-free, self-contained, validation at the
// handler boundary.
//
// ⭐ NOTE ON STORE OWNERSHIP (C03 §3.2 — one owner per slice). The balcony's SLAB
// lives in the SLAB store, its FINISH lives in the FLOOR store and its RAILINGS live
// in the HANDRAIL store. **None of them is copied in here.** That is the whole point
// of a compound: a balcony slab IS a slab, so it must be in the slab store, where the
// schedule, the IFC exporter, the material dispatcher, the property inspector and the
// profile editor will all find it. The balcony record owns them by `childrenIds`, not
// by containment.
//
// ⭐ AND THAT OWNERSHIP-WITHOUT-CONTAINMENT IS EXACTLY WHAT MAKES THE FOUNDER'S
// "selecting the independent elements afterwards independently" TRUE BY CONSTRUCTION
// rather than by a new selection feature: the members are already first-class records
// in the stores every existing panel reads. Nothing had to be taught to select them.
// C103 §2.4 names this the `direct-member` selection discipline, and requires a
// compound to DECLARE which discipline it uses (the alternative, `drill-in`, is
// equally legitimate for a compound whose members are not independently meaningful).

import { Store } from '@pryzm/plugin-sdk';
import type { Balcony as BalconySchemaInfer } from '@pryzm/plugin-sdk';

/** Balcony DTO inferred from the canonical Zod schema. */
export type BalconyData = BalconySchemaInfer;

export type BalconyId = BalconyData['id'];

/** Per-store record view handed to handlers via `ctx.stores.balcony`. */
export type BalconiesState = Record<string, BalconyData>;

export class BalconyStore extends Store<BalconyData> {
  constructor() {
    super('balcony');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  /** Every balcony on a given level. O(N). */
  byLevel(levelId: string): readonly BalconyData[] {
    const out: BalconyData[] = [];
    for (const b of this.state.values()) if (b.levelId === levelId) out.push(b);
    return out;
  }

  /**
   * Every balcony hosted on a given wall — the reverse index the WALL needs when it
   * is moved or deleted. A wall cannot vanish out from under a balcony and leave it
   * cantilevering off nothing.
   *
   * ⚠ Nothing consumes this yet, and that is stated rather than hidden: wall-move
   * re-seating for balconies is NOT implemented (L-5611). The index exists so the
   * fix has somewhere to start; its presence is not a claim that the behaviour works.
   */
  byHostWall(wallId: string): readonly BalconyData[] {
    const out: BalconyData[] = [];
    for (const b of this.state.values()) if (b.hostWallId === wallId) out.push(b);
    return out;
  }

  /**
   * The balcony that OWNS a given member id, or `undefined`.
   *
   * ⭐ THIS IS THE LOOKUP THE PROFILE-EDIT BRIDGE NEEDS. When the user drags a
   * vertex of a slab, the only thing the editor knows is the SLAB's id; answering
   * "is this slab a balcony's plate?" is what turns that gesture into a
   * `balcony.updateProfile`. Scanning `childrenIds` is O(N) in balconies, which is
   * the right cost for a per-gesture question and avoids a second index that could
   * disagree with `childrenIds`.
   */
  byMember(memberId: string): Readonly<BalconyData> | undefined {
    for (const b of this.state.values()) {
      if (b.childrenIds.includes(memberId)) return b;
    }
    return undefined;
  }

  get(id: string): Readonly<BalconyData> | undefined {
    return this.state.get(id);
  }
}
