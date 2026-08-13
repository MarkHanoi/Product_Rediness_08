/**
 * @vitest-environment happy-dom
 *
 * @file packages/constraint-solver/__tests__/ConstraintEngine.spatial.test.ts
 *
 * The DOM is not decoration: `ConstraintEngine.ts` calls
 * `window.addEventListener` at module scope, so importing the engine at all
 * requires a `window`. The package default stays `node`.
 *
 * **Executable evidence for six `./compliance` rule families, at their
 * DECLARED strength** — C74 §3.1/§3.5, C70 G-INV-2, gated by
 * `tools/ga-gate/check-constraint-honesty.ts` (arm H3). Continues the pattern
 * `ConstraintEngine.rules.test.ts` established for the first four families:
 *
 *   ROOM_MAX_TRAVEL_DISTANCE   tier 1, warning
 *   FIRE_COMPARTMENT_AREA      tier 2, error
 *   MEANS_OF_ESCAPE_COUNT      tier 2, error
 *   CORRIDOR_WIDTH             tier 2, warning
 *   LIFT_ADJACENT_LOBBY        tier 2, info
 *   PLUMBING_ZONE              tier 2, info
 *
 * **Every assertion below calls the REAL `constraintEngine.validateAll(ctx)`.**
 * No rule is rebuilt here, no `ValidationResult` is hand-written, and no
 * expected message is copied out of the source — each is asserted against the
 * string the engine actually produced on a real call.
 *
 * ─── WHAT IS SUBSTITUTED, AND WHAT IS THEREFORE NOT COVERED (C74 §3.5) ──────
 * The same two substitutions as `ConstraintEngine.rules.test.ts`, both OUTSIDE
 * the rules under test:
 *
 * 1. **The stores** (via `support/complianceHarness.ts`): plain objects
 *    exposing exactly the methods the rules call (`getAll`, `getByLevel`,
 *    `getTotalAreaForLevel`, `getLevels`). This is the rule's INPUT, not the
 *    rule. **NOT COVERED:** that the production `RoomStore` populates
 *    `computed.area` / `computed.centroid` / `computed.boundingBox` and
 *    answers `getTotalAreaForLevel` / `getByLevel` in the form these rules
 *    read. Those are the stores' contracts, and a defect there is invisible
 *    from here.
 * 2. **`@pryzm/core-app-model`**, aliased in `vitest.config.ts` to a file
 *    exporting only `batchCoordinator = { isBatching: false }` — read at
 *    exactly one site (`_scheduleRun`), which no test here enters.
 *    **NOT COVERED:** the debounced lifecycle and the
 *    `pryzm-constraints-updated` payload.
 *
 * ─── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────
 * C74 governs IDENTITY, not ACCURACY. This suite proves each family fires at
 * its declared severity with real numbers, stays silent when satisfied, and
 * turns over at the threshold it claims. It does not ratify the thresholds
 * against the regulations they cite.
 *
 * Several rules read ABSENCE as compliance (a store that cannot answer, a
 * level with no exits, a corridor with no bounding box). Those paths are
 * PINNED below as measured behaviour, labelled, and not endorsed —
 * §CONTEXT-DATA-HONESTY: failure and emptiness as the same value.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { ValidationResult } from '../src/ConstraintEngine.js';
import {
  bimLevels,
  contextWith,
  findingsFor as findingsForWith,
  roomStore,
  soleFinding as soleFindingWith,
  type ComplianceEngine,
  type RoomFixture,
} from './support/complianceHarness.js';

// ─── The real engine, imported once ──────────────────────────────────────────

/**
 * The engine registers its built-ins off the critical path (`scheduleIdle`).
 * Under happy-dom there is no `requestIdleCallback`, so registration lands one
 * macrotask after import; yielding once is what makes `validateAll` non-empty.
 */
let engine: ComplianceEngine;

beforeAll(async () => {
  engine = (await import('../src/ConstraintEngine.js')).constraintEngine;
  await new Promise((resolve) => setTimeout(resolve, 0));
}, 240_000);

const findingsFor = (ruleId: string, ctx: Record<string, unknown>): ValidationResult[] =>
  findingsForWith(engine, ruleId, ctx);
const soleFinding = (ruleId: string, ctx: Record<string, unknown>): ValidationResult =>
  soleFindingWith(engine, ruleId, ctx);

// ─── Fixture shorthand — the rules' INPUT, never the rules ───────────────────

/** A room at a centroid, for the distance rule. */
function at(
  id: string,
  occupancyType: string,
  x: number,
  z: number,
  extra: Partial<RoomFixture> = {},
): RoomFixture {
  return { id, occupancyType, levelId: 'L0', computed: { area: 20, centroid: { x, z } }, ...extra };
}

/** A room with an area on a level, for the level-aggregate rules. */
function sized(id: string, occupancyType: string, area: number, levelId = 'L0'): RoomFixture {
  return { id, occupancyType, levelId, computed: { area } };
}

/** A room with a bounding box, for the width/adjacency rules. */
function boxed(
  id: string,
  occupancyType: string,
  box: { minX: number; maxX: number; minZ: number; maxZ: number },
  extra: Partial<RoomFixture> = {},
): RoomFixture {
  return { id, occupancyType, levelId: 'L0', computed: { area: 10, boundingBox: box }, ...extra };
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOM_MAX_TRAVEL_DISTANCE — declared tier 1, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('ROOM_MAX_TRAVEL_DISTANCE (declared: tier 1, warning)', () => {
  it('FIRES at the declared severity, with the computed distance in the message', () => {
    const found = soleFinding('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-ward', 'patient-room', 0, 0, { name: 'Ward A' }), at('r-stair', 'stairwell', 50, 0)]),
    }));

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(1);
    expect(found.elementId).toBe('r-ward');
    expect(found.elementType).toBe('room');
    expect(found.message).toBe('Ward A — straight-line distance to nearest exit ~50m exceeds 45m');
    expect(found.suggestion).toBe('Add a stairwell or exit closer to this room');
    expect(found.regulation).toBe('Building Regulations Part B §3.4 (travel distance)');
  });

  it('STAYS SILENT when an exit is within the limit', () => {
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-ward', 'patient-room', 0, 0), at('r-stair', 'stairwell', 30, 0)]),
    }))).toHaveLength(0);
  });

  it('BOUNDARY — 45 m exactly passes, 46 m fails (the comparison is strict `>`)', () => {
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-ward', 'patient-room', 0, 0), at('r-stair', 'stairwell', 45, 0)]),
    }))).toHaveLength(0);
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-ward', 'patient-room', 0, 0), at('r-stair', 'stairwell', 46, 0)]),
    }))).toHaveLength(1);
  });

  it('measures to the NEAREST exit, not the first one found', () => {
    // A far exit plus a near exit: silence is only possible if the rule takes
    // the minimum over all exits on the level.
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([
        at('r-ward', 'patient-room', 0, 0),
        at('r-stair-far', 'stairwell', 100, 0),
        at('r-stair-near', 'stairwell', 30, 0),
      ]),
    }))).toHaveLength(0);
  });

  it('counts foyer, entrance-lobby and lift-lobby as exits, not only stairwells', () => {
    // A distant stairwell (100 m, would fire) plus a near candidate of each
    // type: silence proves the near room was accepted as the exit.
    for (const exitType of ['foyer', 'entrance-lobby', 'lift-lobby']) {
      expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
        roomStore: roomStore([
          at('r-ward', 'patient-room', 0, 0),
          at('r-exit', exitType, 10, 0),
          at('r-stair', 'stairwell', 100, 0),
        ]),
      })), `${exitType} is an exit`).toHaveLength(0);
    }
  });

  it('never reports the exit rooms themselves, however far apart', () => {
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-a', 'stairwell', 0, 0), at('r-b', 'stairwell', 200, 0)]),
    }))).toHaveLength(0);
  });

  it('is SKIPPED, not violated, on a level with no exits at all (pinned)', () => {
    // `if (exits.length === 0) continue` — a floor with NO escape route reads
    // as compliant, and an exit on a DIFFERENT level does not count either.
    // Absence and compliance as the same value; pinned, not endorsed.
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([at('r-ward', 'patient-room', 0, 0)]),
    }))).toHaveLength(0);
    expect(findingsFor('ROOM_MAX_TRAVEL_DISTANCE', contextWith({
      roomStore: roomStore([
        at('r-ward', 'patient-room', 0, 0),
        at('r-stair-l1', 'stairwell', 0, 0, { levelId: 'L1' }),
      ]),
    }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// FIRE_COMPARTMENT_AREA — declared tier 2, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('FIRE_COMPARTMENT_AREA (declared: tier 2, error)', () => {
  const ground = { id: 'L0', name: 'Ground', elevation: 0 };

  it('FIRES at the declared severity, with the level and its area in the message', () => {
    const found = soleFinding('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 1300), sized('r-b', 'open-office', 1200)]),
      bimManager: bimLevels([ground]),
    }));

    expect(found.severity).toBe('error');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('L0');
    expect(found.elementType).toBe('level');
    expect(found.message).toBe('Level "Ground" — floor area 2500m² exceeds 2,000m² compartment limit');
    expect(found.suggestion).toBe('Introduce fire compartment walls to subdivide the floor area');
    expect(found.regulation).toBe('Building Regulations Part B Volume 1 §7.3');
  });

  it('STAYS SILENT under the compartment limit', () => {
    expect(findingsFor('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 1500)]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
  });

  it('BOUNDARY — 2000 m² exactly passes, 2001 m² fails (the comparison is strict `>`)', () => {
    expect(findingsFor('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 2000)]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
    expect(findingsFor('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 2001)]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(1);
  });

  it('reports PER LEVEL — only the level over the limit is named', () => {
    const found = soleFinding('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 2500, 'L0'), sized('r-b', 'open-office', 800, 'L1')]),
      bimManager: bimLevels([ground, { id: 'L1', name: 'First', elevation: 3 }]),
    }));
    expect(found.elementId).toBe('L0');
  });

  it('is DISABLED, not satisfied, when the store cannot answer the area question (pinned)', () => {
    // `roomStore.getTotalAreaForLevel?.(level.id) ?? 0` — a store without the
    // method reads every level as 0 m², so a 10,000 m² floor served by such a
    // store is reported compliant. Absence became an answer; pinned, not
    // endorsed (§CONTEXT-DATA-HONESTY).
    expect(findingsFor('FIRE_COMPARTMENT_AREA', contextWith({
      roomStore: { getAll: () => [] },   // no getTotalAreaForLevel
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// MEANS_OF_ESCAPE_COUNT — declared tier 2, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('MEANS_OF_ESCAPE_COUNT (declared: tier 2, error)', () => {
  const ground = { id: 'L0', name: 'Ground', elevation: 0 };

  it('FIRES at the declared severity, counting the stairwells it found', () => {
    const found = soleFinding('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 120), sized('r-stair', 'stairwell', 30)]),
      bimManager: bimLevels([ground]),
    }));

    expect(found.severity).toBe('error');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('L0');
    expect(found.elementType).toBe('level');
    expect(found.message).toBe('Level "Ground" — only 1 stairwell(s) found; ≥ 2 required for floor area 150m²');
    expect(found.suggestion).toBe('Add a second protected stairwell');
    expect(found.regulation).toBe('Building Regulations Part B §3.1');
  });

  it('FIRES with a zero count when the floor has no stairwell at all', () => {
    const found = soleFinding('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 120)]),
      bimManager: bimLevels([ground]),
    }));
    expect(found.message).toBe('Level "Ground" — only 0 stairwell(s) found; ≥ 2 required for floor area 120m²');
  });

  it('STAYS SILENT with two stairwells on the level', () => {
    expect(findingsFor('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([
        sized('r-a', 'open-office', 80),
        sized('r-s1', 'stairwell', 20),
        sized('r-s2', 'stairwell', 20),
      ]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
  });

  it('BOUNDARY — a 99 m² floor is exempt, a 100 m² floor is checked (the guard is `< 100`)', () => {
    expect(findingsFor('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 99)]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
    expect(findingsFor('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([sized('r-a', 'open-office', 100)]),
      bimManager: bimLevels([ground]),
    }))).toHaveLength(1);
  });

  it('counts ONLY `stairwell` — foyers and lobbies do not satisfy this rule', () => {
    // Deliberate asymmetry with ROOM_MAX_TRAVEL_DISTANCE, which accepts four
    // exit types. Here two circulation rooms totalling 120 m² still read as
    // zero escape routes.
    const found = soleFinding('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: roomStore([sized('r-a', 'foyer', 60), sized('r-b', 'entrance-lobby', 60)]),
      bimManager: bimLevels([ground]),
    }));
    expect(found.message).toBe('Level "Ground" — only 0 stairwell(s) found; ≥ 2 required for floor area 120m²');
  });

  it('is DISABLED, not satisfied, when the store cannot list rooms by level (pinned)', () => {
    // `roomStore.getByLevel?.(level.id) ?? []` — no method → empty level →
    // floor area 0 → exempt. Absence reads as compliance; pinned, not endorsed.
    expect(findingsFor('MEANS_OF_ESCAPE_COUNT', contextWith({
      roomStore: { getAll: () => [sized('r-a', 'open-office', 500)] },   // no getByLevel
      bimManager: bimLevels([ground]),
    }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// CORRIDOR_WIDTH — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('CORRIDOR_WIDTH (declared: tier 2, warning)', () => {
  const corridor = (maxZ: number): RoomFixture =>
    boxed('r-cor', 'corridor', { minX: 0, maxX: 10, minZ: 0, maxZ }, { name: 'Main' });

  it('FIRES at the declared severity, with the approximate width in the message', () => {
    const found = soleFinding('CORRIDOR_WIDTH', contextWith({ roomStore: roomStore([corridor(1.0)]) }));

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-cor');
    expect(found.elementType).toBe('room');
    expect(found.message).toBe('Corridor "Main" — approximate width 1000mm is below 1200mm minimum');
    expect(found.suggestion).toBe('Widen the corridor to at least 1200mm clear width');
    expect(found.regulation).toBe('Building Regulations Part M §4.10');
  });

  it('STAYS SILENT at a compliant width', () => {
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({ roomStore: roomStore([corridor(1.5)]) }))).toHaveLength(0);
  });

  it('BOUNDARY — 1200 mm exactly passes, 1190 mm fails (the comparison is strict `<`)', () => {
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({ roomStore: roomStore([corridor(1.2)]) }))).toHaveLength(0);
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({ roomStore: roomStore([corridor(1.19)]) }))).toHaveLength(1);
  });

  it('takes the SMALLER bounding-box dimension as the width, on either axis', () => {
    // 1.0 m in X, 10 m in Z — the narrow axis is X this time.
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({
      roomStore: roomStore([boxed('r-cor', 'corridor', { minX: 0, maxX: 1.0, minZ: 0, maxZ: 10 })]),
    }))).toHaveLength(1);
  });

  it('checks corridors ONLY — a 1.0 m-wide bedroom is not this rule\'s subject', () => {
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({
      roomStore: roomStore([boxed('r-bed', 'bedroom', { minX: 0, maxX: 10, minZ: 0, maxZ: 1.0 })]),
    }))).toHaveLength(0);
  });

  it('is SKIPPED, not violated, for a corridor with no bounding box (pinned)', () => {
    // `if (!bb) continue` — a corridor whose geometry never produced a box is
    // not checked at all. Absence reads as compliance; pinned, not endorsed.
    expect(findingsFor('CORRIDOR_WIDTH', contextWith({
      roomStore: roomStore([{ id: 'r-cor', occupancyType: 'corridor', levelId: 'L0', computed: { area: 10 } }]),
    }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LIFT_ADJACENT_LOBBY — declared tier 2, severity `info`
// ═════════════════════════════════════════════════════════════════════════════

describe('LIFT_ADJACENT_LOBBY (declared: tier 2, info)', () => {
  const lift = (levelId = 'L0'): RoomFixture =>
    ({ id: 'r-lift', name: 'Lift 1', occupancyType: 'lift-lobby', levelId, computed: { area: 6 } });

  it('FIRES at the declared severity for a lift with no circulation room on its level', () => {
    const found = soleFinding('LIFT_ADJACENT_LOBBY', contextWith({ roomStore: roomStore([lift()]) }));

    expect(found.severity).toBe('info');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-lift');
    expect(found.elementType).toBe('room');
    expect(found.message).toBe('Lift lobby "Lift 1" — no lobby or corridor found on same level');
    expect(found.suggestion).toBe('Add a lobby or circulation area adjacent to the lift');
    expect(found.regulation).toBe('Building Regulations Part M §3.8');
  });

  it('STAYS SILENT when the level also has a corridor, foyer or entrance lobby', () => {
    for (const circulationType of ['corridor', 'foyer', 'entrance-lobby']) {
      expect(findingsFor('LIFT_ADJACENT_LOBBY', contextWith({
        roomStore: roomStore([lift(), sized('r-circ', circulationType, 8)]),
      })), `${circulationType} satisfies the rule`).toHaveLength(0);
    }
  });

  it('SAME LEVEL only — a corridor on another level does not satisfy it', () => {
    expect(findingsFor('LIFT_ADJACENT_LOBBY', contextWith({
      roomStore: roomStore([lift('L0'), sized('r-circ', 'corridor', 8, 'L1')]),
    }))).toHaveLength(1);
  });

  it('two lifts on one level satisfy EACH OTHER (pinned)', () => {
    // `lift-lobby` is itself in the rule's circulation set, and the check only
    // excludes the room's own id — so two isolated lifts side by side read
    // compliant. Measured behaviour; pinned, not endorsed.
    expect(findingsFor('LIFT_ADJACENT_LOBBY', contextWith({
      roomStore: roomStore([lift(), { id: 'r-lift2', occupancyType: 'lift-lobby', levelId: 'L0', computed: { area: 6 } }]),
    }))).toHaveLength(0);
  });

  it('has no subject when the model contains no lift', () => {
    expect(findingsFor('LIFT_ADJACENT_LOBBY', contextWith({
      roomStore: roomStore([sized('r-bed', 'bedroom', 20)]),
    }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PLUMBING_ZONE — declared tier 2, severity `info`
// ═════════════════════════════════════════════════════════════════════════════

describe('PLUMBING_ZONE (declared: tier 2, info)', () => {
  const wet = (
    id: string,
    occupancyType: string,
    minX: number,
    extra: Partial<RoomFixture> = {},
  ): RoomFixture =>
    boxed(id, occupancyType, { minX, maxX: minX + 2, minZ: 0, maxZ: 2 }, extra);

  it('FIRES at the declared severity for an isolated wet room', () => {
    // A WC beside a bedroom: the neighbour is adjacent but not wet, so the WC
    // is an isolated plumbing point.
    const found = soleFinding('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-wc', 'wc', 0, { name: 'WC 1' }), wet('r-bed', 'bedroom', 2.1)]),
    }));

    expect(found.severity).toBe('info');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-wc');
    expect(found.elementType).toBe('room');
    expect(found.message).toBe('WC 1 — isolated wet room; consider clustering plumbing zones');
    expect(found.suggestion).toBe('Group wet rooms to reduce plumbing run lengths and costs');
    expect(found.regulation).toBeUndefined();   // this family cites no regulation
  });

  it('STAYS SILENT for two wet rooms within the adjacency tolerance', () => {
    // Gap 0.2 m < the 0.3 m tolerance — the pair reads as one plumbing zone.
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-wc', 'wc', 0), wet('r-kit', 'kitchen', 2.2)]),
    }))).toHaveLength(0);
  });

  it('BOUNDARY — a 0.25 m gap is adjacent, a 0.5 m gap separates BOTH rooms', () => {
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-wc', 'wc', 0), wet('r-bath', 'bathroom', 2.25)]),
    }))).toHaveLength(0);
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-wc', 'wc', 0), wet('r-bath', 'bathroom', 2.5)]),
    }))).toHaveLength(2);
    // A gap of exactly 0.3 m is deliberately NOT pinned: the comparison there
    // lands on floating-point equality (`2 > 2.3 - 0.3` is true while
    // `2.3 < 2 + 0.3` is false), so the two rooms of one pair get DIFFERENT
    // verdicts — measured: 1 finding, not 0 or 2. That noise is a consequence
    // of the rule owning its own ad-hoc tolerance instead of a declared
    // epsilon (C73 §2.1 / GE-01); pinning it would freeze FP artefacts.
  });

  it('SAME LEVEL only — a wet room directly above does not cluster', () => {
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-wc', 'wc', 0), wet('r-bath', 'bathroom', 0, { levelId: 'L1' })]),
    }))).toHaveLength(2);
  });

  it('checks wet rooms ONLY — two isolated bedrooms are nobody\'s subject', () => {
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([wet('r-a', 'bedroom', 0), wet('r-b', 'bedroom', 50)]),
    }))).toHaveLength(0);
  });

  it('a wet room with NO bounding box reads as isolated and FIRES (pinned)', () => {
    // The adjacency test returns false for any pair missing a box, so a wet
    // room whose geometry never produced one is reported isolated — here the
    // absent datum becomes a positive claim rather than a skip, the opposite
    // bias to the rules above. Measured behaviour; pinned, not endorsed.
    expect(findingsFor('PLUMBING_ZONE', contextWith({
      roomStore: roomStore([
        { id: 'r-wc', occupancyType: 'wc', levelId: 'L0', computed: { area: 2 } },
        wet('r-kit', 'kitchen', 0),
      ]),
    }))).toHaveLength(2);
  });
});
