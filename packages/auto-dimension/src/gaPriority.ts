// @pryzm/auto-dimension — §GA-EDITORIAL-LAYER (L-1620) — SPEC-AUTODIMENSION §12.1 + §12.9
// as DATA.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A TABLE AND NOT A SET OF `if`s
// ─────────────────────────────────────────────────────────────────────────────
// SPEC-AUTODIMENSION §13 gap 3/4 recorded the defect precisely: "`conflicts.ts` resolves
// collisions, but not against a declared 10-rank order, so a room tag can currently lose
// to furniture." A collision policy scattered across comparison functions is a policy
// nobody can READ, and one that every new annotation kind silently opts out of by simply
// not being mentioned. The founder wrote §12.1 as a ten-row table and §12.9 as a
// five-step ORDER; they are transcribed here as exactly that, so a reader of this file
// sees the drafting standard without simulating an algorithm.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES *NOT* CLAIM
// ─────────────────────────────────────────────────────────────────────────────
// §12.9 governs annotations this ENGINE does not emit: room tags, door tags, window
// tags and furniture are placed by `RoomTagAutoPopulator` / the tag populators in
// `apps/editor`, not by `@pryzm/auto-dimension`. This module is therefore the SHARED
// POLICY those consumers must call — it is deliberately expressed over an annotation
// CLASS vocabulary wider than the dimension kinds this package produces, so the tag
// lanes can adopt it without inventing a second, disagreeing order. Inside this package
// only the two dimension classes are exercised today (see `gaClassOfDimension`), and the
// §12.9 rows for tags are declared-but-unexercised until those consumers call in.
// That is stated here rather than left to be discovered.
//
// PURE (P5/INV-2): frozen literals + total-ordered lookups. No I/O, no clock, no RNG.

import { withAutoDimSpan } from './tracing.js';

/**
 * The annotation vocabulary of a General Arrangement plan (§12.1's ten rows, expanded so
 * the row "Walls, doors, windows" is addressable per element kind).
 */
export type GaAnnotationClass =
  | 'wall'
  | 'door'
  | 'window'
  | 'gridline'
  | 'overall-dimension'
  | 'structural-dimension'
  | 'opening-dimension'
  | 'room-tag'
  | 'door-tag'
  | 'window-tag'
  | 'internal-dimension'
  | 'furniture';

/**
 * §12.1 — ANNOTATION PRIORITY. Rank 1 is the most important; **a lower rank must never
 * be allowed to interfere with a higher one**.
 *
 * | 1 | Walls, doors, windows | 2 | Gridlines | 3 | Overall dimensions |
 * | 4 | Structural dimensions | 5 | Opening dimensions | 6 | Room tags |
 * | 7 | Door tags | 8 | Window tags | 9 | Internal dimensions | 10 | Furniture |
 *
 * NOTE the ordering the founder chose that a naive implementation gets backwards:
 * **internal dimensions (9) rank BELOW every tag**, and furniture (10) ranks below
 * everything. §12.3's editorial filter and §12.1's rank are therefore the same statement
 * read twice — an internal dimension is the first thing to give way, which is why
 * removing most of them (editorial.ts) is a priority decision and not a shortcut.
 */
export const GA_PRIORITY: Readonly<Record<GaAnnotationClass, number>> = Object.freeze({
  wall: 1,
  door: 1,
  window: 1,
  gridline: 2,
  'overall-dimension': 3,
  'structural-dimension': 4,
  'opening-dimension': 5,
  'room-tag': 6,
  'door-tag': 7,
  'window-tag': 8,
  'internal-dimension': 9,
  furniture: 10,
});

/**
 * The rank of an annotation class (§12.1). Lower number = higher priority.
 *
 * P8 (INV-6) — the exported entry opens a span; the collision/optimisation loops call
 * `gaPriorityOfImpl` so per-string span cardinality stays bounded (the same discipline
 * `placement.ts` and `geometry.ts` already use).
 */
export function gaPriorityOf(cls: GaAnnotationClass): number {
  return withAutoDimSpan('conflict', () => gaPriorityOfImpl(cls));
}

/** Unspanned implementation — internal hot-loop callers use this. */
export function gaPriorityOfImpl(cls: GaAnnotationClass): number {
  return GA_PRIORITY[cls];
}

/**
 * The MOVE an annotation class is permitted to make when it loses a collision (§12.9).
 *
 *   `fixed`     — does not move at all (dimensions, and the model itself).
 *   `translate` — moves freely (room tags: §12.5's outward spiral search).
 *   `rotate`    — rotates about its host (door tags, about the door).
 *   `slide`     — shifts along its host wall (window tags).
 *   `yield`     — never wins; it is the thing that gets moved or hidden (furniture).
 */
export type GaCollisionMove = 'fixed' | 'translate' | 'rotate' | 'slide' | 'yield';

export interface GaCollisionRule {
  /** Position in §12.9's ordered list. Lower = resolved earlier = moves LESS. */
  readonly order: number;
  readonly classes: readonly GaAnnotationClass[];
  readonly move: GaCollisionMove;
}

/**
 * §12.9 — COLLISION RESOLUTION, **a strict order, not a heuristic**:
 *
 *   1. Dimensions stay fixed.
 *   2. Room tags move.
 *   3. Door tags rotate around their host.
 *   4. Window tags shift along the wall.
 *   5. Furniture never wins.
 *
 * Read as a rule: in any pair, the participant that appears LATER in this list is the
 * one that moves, and it moves in the way its own row prescribes. The model itself
 * (walls/doors/windows/gridlines) sits at order 0 — it is not in the founder's list
 * because it was never a candidate to move, and encoding that as "absent" is exactly how
 * a future author would let a wall be nudged by a tag.
 */
export const GA_COLLISION_ORDER: readonly GaCollisionRule[] = Object.freeze([
  { order: 0, classes: Object.freeze(['wall', 'door', 'window', 'gridline'] as const), move: 'fixed' },
  {
    order: 1,
    classes: Object.freeze([
      'overall-dimension', 'structural-dimension', 'opening-dimension', 'internal-dimension',
    ] as const),
    move: 'fixed',
  },
  { order: 2, classes: Object.freeze(['room-tag'] as const), move: 'translate' },
  { order: 3, classes: Object.freeze(['door-tag'] as const), move: 'rotate' },
  { order: 4, classes: Object.freeze(['window-tag'] as const), move: 'slide' },
  { order: 5, classes: Object.freeze(['furniture'] as const), move: 'yield' },
] as unknown as readonly GaCollisionRule[]);

const RULE_BY_CLASS: ReadonlyMap<GaAnnotationClass, GaCollisionRule> = new Map(
  GA_COLLISION_ORDER.flatMap((r) => r.classes.map((c) => [c, r] as const)),
);

/**
 * The §12.9 row that governs a class. Every class has one — there is no default, because
 * a class that silently fell through to "does not move" is how furniture would come to
 * outrank a room tag.
 *
 * P8 (INV-6) — opens a `pryzm.autodim.conflict` span.
 */
export function gaCollisionRuleOf(cls: GaAnnotationClass): GaCollisionRule {
  return withAutoDimSpan('conflict', () => gaCollisionRuleOfImpl(cls));
}

/** Unspanned implementation — `resolveGaCollision` calls this from inside its own span. */
function gaCollisionRuleOfImpl(cls: GaAnnotationClass): GaCollisionRule {
  const r = RULE_BY_CLASS.get(cls);
  /* c8 ignore next */
  if (!r) throw new Error(`§12.9: no collision rule declared for '${cls}'`);
  return r;
}

export interface GaCollisionOutcome {
  /**
   * The class that must move, or `null` when BOTH are `fixed` — two dimensions collide
   * and §12.9 forbids either of them to move. That case is NOT a failure: it is the
   * hand-off to §12.12's optimisation pass, which resolves it by pushing the
   * LOWER-§12.1-PRIORITY dimension outward onto another stack row. `holdsPriority`
   * carries which one that is.
   */
  readonly mover: GaAnnotationClass | null;
  readonly move: GaCollisionMove;
  /** The class that keeps its position. */
  readonly holds: GaAnnotationClass;
  /** True when neither may move (§12.9 rows 0/1) — defer to §12.1 rank + §12.12. */
  readonly bothFixed: boolean;
}

/**
 * Resolve one collision between two annotation classes STRICTLY by §12.9, falling back
 * to §12.1's rank only when §12.9 declares both immovable.
 *
 * Deterministic and symmetric: `resolveGaCollision(a, b)` and `resolveGaCollision(b, a)`
 * name the same mover (ties break on the class name, a total order).
 *
 * P8 (INV-6) — opens a `pryzm.autodim.conflict` span.
 */
export function resolveGaCollision(
  a: GaAnnotationClass,
  b: GaAnnotationClass,
): GaCollisionOutcome {
  return withAutoDimSpan('conflict', (): GaCollisionOutcome => {
    const ra = gaCollisionRuleOfImpl(a);
    const rb = gaCollisionRuleOfImpl(b);
    if (ra.order !== rb.order) {
      const later = ra.order > rb.order ? a : b;
      const earlier = ra.order > rb.order ? b : a;
      const rule = ra.order > rb.order ? ra : rb;
      const bothFixed = rule.move === 'fixed';
      return {
        mover: bothFixed ? null : later,
        move: rule.move,
        holds: earlier,
        bothFixed,
      };
    }
    // Same §12.9 row. Movable rows (two room tags, two window tags…) resolve by §12.1
    // rank, then by class name so the answer is symmetric and total.
    const bothFixed = ra.move === 'fixed';
    const aLoses = GA_PRIORITY[a] !== GA_PRIORITY[b]
      ? GA_PRIORITY[a] > GA_PRIORITY[b]
      : a > b;
    const loser = aLoses ? a : b;
    const winner = aLoses ? b : a;
    return {
      mover: bothFixed ? null : loser,
      move: ra.move,
      holds: winner,
      bothFixed,
    };
  });
}

/**
 * Map an emitted dimension onto its §12.1 row.
 *
 * `placement` is the editorial classification from `editorial.ts`: a string measured on a
 * building ENVELOPE is an exterior dimension (§12.2), one measured inside a room is an
 * INTERNAL dimension (§12.3) and therefore rank 9 — below every tag. Getting that pair
 * the right way round is the whole of §12.1 as far as this engine is concerned.
 */
export function gaClassOfDimension(
  kind: string,
  placement: 'exterior' | 'interior',
): GaAnnotationClass {
  return withAutoDimSpan('conflict', () => gaClassOfDimensionImpl(kind, placement));
}

/** Unspanned implementation — the §12.12 passes classify every string, every iteration. */
export function gaClassOfDimensionImpl(
  kind: string,
  placement: 'exterior' | 'interior',
): GaAnnotationClass {
  if (placement === 'interior') return 'internal-dimension';
  if (kind === 'overall') return 'overall-dimension';
  if (kind === 'linear-element') return 'opening-dimension';
  return 'structural-dimension'; // linear-chain — §12.2 string 2 content
}
