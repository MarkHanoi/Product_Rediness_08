// BathroomPodStore — the ONE authority for the C109 bathroom-pod family.
//
// §BATH102 (L-11480..) · C109 §2 / §3.2 / §4 / §8 · C84 EI-1 · C99.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ THIS FAMILY HAS EXACTLY ONE STORE, AND THAT IS A DESIGN COMMITMENT, NOT AN
//    ACCIDENT OF WHERE THE FIRST WRITE LANDED.
// ═══════════════════════════════════════════════════════════════════════════════
// C84 §1 measures five rival representations per element family, and rows 2/3 — the
// plugin DTO store and the legacy geometry store — are the pair that keeps diverging
// (C99 measured that after any project load the plumbing DTO store is EMPTY while the
// legacy store holds N; that is C84 EI-5a). `bathroomPod` has NO legacy twin: this
// instance IS the record. That is the `boundaryLine` shape (C106 §1), and it makes
// C84 EI-1 hold BY CONSTRUCTION rather than by discipline.
//
// ⛔ AND IT MUST STAY THAT WAY. The moment a second `bathroomPodStore` appears on
// `window`, every argument below is void and this file must say so instead of
// pretending otherwise.
//
// ── WHY THE POD LIVES HERE AND NOT IN A `plugins/bathroom-pod` OF ITS OWN ───────
// C109 §0 governs *"the `bathroomPod` store and its handlers in `plugins/plumbing/`"*.
// It is one family (§2: the pod mints exactly ONE new family — itself) whose every
// member is a `plumbing` fixture, so it belongs beside the family that owns
// sanitaryware. A separate plugin package would add a manifest, a tsconfig, a vitest
// config and a lockfile importer for one store and two handlers, and would then have
// to depend on `@pryzm/plugin-plumbing` anyway.
//
// ── WHAT A `BathroomPod` IS, IN ONE LINE ────────────────────────────────────────
// A parent record carrying the ROOM ENVELOPE it was fitted to, its HANDEDNESS, and
// its resolved MEMBERS. It carries no sanitaryware dimension of its own (C109 R-6) —
// every footprint on every member came out of the plumbing family's own tables via
// `resolveFixtureFootprint`, which is the same resolver the plan symbol builder and
// the elevation symbol builder call.

import { Store } from '@pryzm/plugin-sdk';
import { bathroomPodChildIds, type BathroomPod } from '@pryzm/geometry-plumbing';

/** The pod record, re-exported so a consumer needs one import, not two. */
export type BathroomPodData = BathroomPod;

/** Per-store record view handed to handlers via `ctx.stores.bathroomPod`. */
export type BathroomPodsState = Record<string, BathroomPodData>;

export class BathroomPodStore extends Store<BathroomPodData> {
  constructor() {
    super('bathroomPod');
  }

  ids(): readonly string[] {
    return [...this.state.keys()];
  }

  get(id: string): Readonly<BathroomPodData> | undefined {
    return this.state.get(id);
  }

  /** Every pod on a given storey. O(N) — there are single-digit pods per level. */
  byLevel(levelId: string): readonly BathroomPodData[] {
    const out: BathroomPodData[] = [];
    for (const p of this.state.values()) if (p.levelId === levelId) out.push(p);
    return out;
  }

  /**
   * The member ids a pod owns — the C109 §3.2 / R-5 read model.
   *
   * ⛔ IT COMES FROM THE RECORD, NEVER FROM `root.traverse()`, and the reason is
   * stronger for a pod than for the kitchen run that established the traverse
   * pattern: a pod's members are N SEPARATE `plumbing` records, each built as its
   * own fragment, on a level that may not be the active one. A traverse-discovered
   * list silently drops every member whose fragment has not been built — which for a
   * freshly-loaded project is the COMMON case, not the corner one.
   *
   * Delegates to `bathroomPodChildIds()` so there is ONE derivation, in the pure
   * package, rather than a second copy here that could disagree with it.
   */
  childIdsOf(podId: string): readonly string[] {
    const pod = this.state.get(podId);
    return pod === undefined ? [] : bathroomPodChildIds(pod);
  }

  /**
   * The pod that owns a given member id, or `undefined`.
   *
   * ⭐ THE REVERSE INDEX THE DELETE NEEDS. C109 §7 forbids reaping members
   * SPATIALLY (*"delete the fixtures inside this rectangle"* is wrong the moment an
   * architect hand-places a bidet in the same room), so the only correct question is
   * *"which pod names this id?"* — and it must be answerable from the record.
   */
  podOfMember(memberId: string): Readonly<BathroomPodData> | undefined {
    for (const p of this.state.values()) {
      for (const m of p.members) if (m.id === memberId) return p;
    }
    return undefined;
  }
}
