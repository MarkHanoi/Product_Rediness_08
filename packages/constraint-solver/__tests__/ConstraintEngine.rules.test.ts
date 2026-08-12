/**
 * @vitest-environment happy-dom
 *
 * @file packages/constraint-solver/__tests__/ConstraintEngine.rules.test.ts
 *
 * The DOM is not decoration: `ConstraintEngine.ts` calls
 * `window.addEventListener` at module scope (`:109-111`), so importing the
 * engine at all requires a `window`. The package default stays `node`.
 *
 * **Executable evidence for the `./compliance` rule families, at their DECLARED
 * strength** — C74 §3.1/§3.5, C70 G-INV-2, gated by
 * `tools/ga-gate/check-constraint-honesty.ts` (arm H3).
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 * `ConstraintEngine.ts` registers 17 rule families and is wired to a live event
 * bus at `apps/editor/src/engine/initDataPlatform.ts:298`. Until this file, the
 * package's two suites (`engine.test.ts`, `PlanegcsAdapter.test.ts`) both bound
 * the solver/adapter layer and **neither opened `ConstraintEngine.ts`**. The
 * component doing the repo's only real ADVISORY constraint work had no suite.
 *
 * The room-area family was the sharpest case: three executable files named that
 * rule id and all three hand-built the violation rather than calling the
 * engine, one of them saying so in its own header. The `below minimum` numbers
 * cited in review therefore never came from this engine at all.
 *
 * **Every assertion below calls the REAL `constraintEngine.validateAll(ctx)`.**
 * No rule is rebuilt here, no `ValidationResult` is hand-written, and no
 * expected message is copied out of the source — each is asserted against the
 * string the engine actually produced on a real call. No rule in this file has
 * a substitute standing in front of it.
 *
 * ─── WHAT IS SUBSTITUTED, AND WHAT IS THEREFORE NOT COVERED (C74 §3.5) ──────
 * Two substitutions, both OUTSIDE the rule under test, both stated:
 *
 * 1. **The stores.** `ConstraintContext` (`src/types.ts` / the interface in
 *    `ConstraintEngine.ts:51`) is six `any` store handles. The fixtures below
 *    supply plain objects exposing exactly the methods the rules call
 *    (`getAll`, `getRoomsAdjacentToWall`, `getLevels`, …). This is the rule's
 *    INPUT, not the rule — the rule's own arithmetic, thresholds, severities
 *    and message strings are the real ones.
 *    **NOT COVERED:** that the production `RoomStore` populates
 *    `computed.area` / `computed.boundingBox` / `computed.centroid` in the
 *    shape these rules read, and that `getRoomsAdjacentToWall` resolves wall
 *    adjacency correctly. Those are the stores' contracts, not this engine's,
 *    and a defect there is invisible from here.
 *
 * 2. **`@pryzm/core-app-model`**, aliased in `vitest.config.ts` to
 *    `__tests__/support/core-app-model.alias.ts`, which exports only
 *    `batchCoordinator = { isBatching: false }`.
 *    *Why:* the real barrel has 296 exports and pulls THREE; importing it costs
 *    ~150 s of transform per run, which is a suite nobody runs.
 *    *Why it is safe:* `batchCoordinator` is read at exactly ONE site —
 *    `_scheduleRun()` (`ConstraintEngine.ts:248`), the 600 ms debounce path.
 *    Every test here calls `validateAll(ctx)` DIRECTLY and never goes through
 *    `_scheduleRun`, so no rule's evaluation touches the aliased module.
 *    **NOT COVERED:** the debounced `_scheduleRun` → `run()` → `_broadcast()`
 *    lifecycle, the batch-suppression gate, and the `pryzm-constraints-updated`
 *    event payload. Nothing below asserts anything about any of them.
 *
 * ─── WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────
 * C74 governs IDENTITY, not ACCURACY. This suite proves each covered family
 * fires with its declared severity and real numbers, stays silent when
 * satisfied, and turns over at the threshold it claims. It does **not** ratify
 * the thresholds as correct against the regulations they cite — two are
 * recorded below as defects precisely because the measured behaviour and the
 * cited regulation disagree.
 *
 * ─── DEFECTS FOUND AND DELIBERATELY NOT FIXED ───────────────────────────────
 * This is a test lane; a lane that fixes its own subject can no longer testify
 * about it. Both are PINNED below as characterisation assertions — they assert
 * what the engine DOES, and are labelled so the fix breaks the test loudly.
 *
 *   • **D1 — ROOM_MIN_AREA prints a self-contradicting message at the
 *     boundary.** `ConstraintEngine.ts:282` formats the area with
 *     `.toFixed(1)` while `:278` compares the UNROUNDED value. A 7.49 m²
 *     bedroom is a real violation whose message reads *"area 7.5m² is below
 *     minimum 7.5m²"* — the two numbers a user is shown are equal, so the
 *     sentence refutes itself. See `it('D1 …')`.
 *
 *   • **D2 — STAIR_HEADROOM flags an ordinary residential stair.** The
 *     `approxHeadroom` model at `ConstraintEngine.ts:369` subtracts
 *     `riserHeight × ceil(riserCount / 2)` from floor-to-floor. With the rule's
 *     OWN defaults (0.175 m, 12 risers) a 3.0 m floor-to-floor — the standard
 *     UK residential dimension — yields ~1.95 m and fires `error`. The rule
 *     only goes quiet above ~3.05 m f2f. Whether that is the intended model is
 *     a question for the rule's owner; that it fires on the common case is
 *     measured fact. See `it('D2 …')`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { ValidationResult } from '../src/ConstraintEngine.js';

// ─── The real engine, imported once ──────────────────────────────────────────

/**
 * The engine is a module-scope singleton that registers its 17 built-ins off
 * the critical path (`scheduleIdle`, `ConstraintEngine.ts:119-123`). Under Node
 * there is no `requestIdleCallback`, so it takes the `setTimeout(fn, 0)`
 * branch — registration lands one macrotask after import. Yielding once here is
 * what makes `validateAll` non-empty; without it every rule below reads 0
 * findings and the suite would pass while proving nothing.
 */
let engine: {
  validateAll(ctx: unknown): ValidationResult[];
};

beforeAll(async () => {
  engine = (await import('../src/ConstraintEngine.js')).constraintEngine;
  await new Promise((resolve) => setTimeout(resolve, 0));
}, 240_000);

// ─── Fixtures — the rules' INPUT, never the rules ────────────────────────────

interface RoomFixture {
  id: string;
  name?: string;
  occupancyType: string;
  levelId?: string;
  computed: {
    area?: number;
    centroid?: { x: number; z: number };
    boundingBox?: { minX: number; maxX: number; minZ: number; maxZ: number };
  };
}

/** A context with every store absent; tests fill in only what they need. */
function emptyContext(): Record<string, unknown> {
  return {
    roomStore: null,
    doorStore: null,
    windowStore: null,
    wallStore: null,
    stairStore: null,
    bimManager: null,
  };
}

function contextWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...emptyContext(), ...overrides };
}

/**
 * A room store over a fixed room list. `adjacency` maps wallId → room ids, so a
 * test can say "wall w1 bounds room r1" without a wall graph.
 */
function roomStore(rooms: RoomFixture[], adjacency: Record<string, string[]> = {}) {
  return {
    getAll: () => rooms,
    getRoomsAdjacentToWall: (wallId: string) =>
      (adjacency[wallId] ?? []).map((id) => rooms.find((r) => r.id === id)).filter(Boolean),
  };
}

/** Every finding the REAL engine produced for one rule id, on this context. */
function findingsFor(ruleId: string, ctx: Record<string, unknown>): ValidationResult[] {
  return engine.validateAll(ctx).filter((r) => r.ruleId === ruleId);
}

/** Exactly one finding, returned — the common shape of a fires-once assertion. */
function soleFinding(ruleId: string, ctx: Record<string, unknown>): ValidationResult {
  const found = findingsFor(ruleId, ctx);
  expect(found, `expected exactly one ${ruleId} finding, got ${found.length}`).toHaveLength(1);
  return found[0]!;
}

// ═════════════════════════════════════════════════════════════════════════════
// ROOM_MIN_AREA — declared tier 1, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('ROOM_MIN_AREA (declared: tier 1, error)', () => {
  const bedroom = (area: number): RoomFixture => ({
    id: 'room-bed', name: 'Bedroom 1', occupancyType: 'bedroom', levelId: 'L0', computed: { area },
  });

  it('FIRES at the declared severity, with the real numbers in the message', () => {
    const found = soleFinding('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(5)]) }));

    expect(found.severity).toBe('error');   // matches the DECLARED strength
    expect(found.tier).toBe(1);
    expect(found.elementId).toBe('room-bed');
    expect(found.elementType).toBe('room');
    // The engine's own sentence, with the engine's own numbers. 7.5 m² is the
    // bedroom minimum the rule holds (`MIN_AREA_M2`, ConstraintEngine.ts:62).
    expect(found.message).toBe('Bedroom 1 — area 5.0m² is below minimum 7.5m²');
    expect(found.suggestion).toBe('Increase room area to at least 7.5m²');
    expect(found.regulation).toBe('UK Building Regulations Part M');
  });

  it('STAYS SILENT when the room meets its minimum', () => {
    expect(findingsFor('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(12)]) }))).toHaveLength(0);
  });

  it('BOUNDARY — 7.5 m² passes, 7.49 m² fails (the comparison is strict `<`)', () => {
    expect(findingsFor('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(7.5)]) }))).toHaveLength(0);
    expect(findingsFor('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(7.51)]) }))).toHaveLength(0);
    expect(findingsFor('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(7.49)]) }))).toHaveLength(1);
  });

  it('uses the PER-OCCUPANCY minimum, not one global number', () => {
    // 9 m² is under `living-room` (11.0) and over `kitchen` (5.5). One area,
    // two verdicts — which is only possible if the per-type table is live.
    const living = soleFinding('ROOM_MIN_AREA', contextWith({
      roomStore: roomStore([{ id: 'r-liv', name: 'Living', occupancyType: 'living-room', computed: { area: 9 } }]),
    }));
    expect(living.message).toBe('Living — area 9.0m² is below minimum 11m²');

    expect(findingsFor('ROOM_MIN_AREA', contextWith({
      roomStore: roomStore([{ id: 'r-kit', name: 'Kitchen', occupancyType: 'kitchen', computed: { area: 9 } }]),
    }))).toHaveLength(0);
  });

  it('STAYS SILENT for an occupancy type absent from the minimum table', () => {
    // `min == null` → `continue` (ConstraintEngine.ts:277). A 0.1 m² room of an
    // unknown type is NOT reported — an absence of a rule, not a pass. Pinned
    // because it is the rule's widest silent path.
    expect(findingsFor('ROOM_MIN_AREA', contextWith({
      roomStore: roomStore([{ id: 'r-x', occupancyType: 'not-a-real-occupancy', computed: { area: 0.1 } }]),
    }))).toHaveLength(0);
  });

  it('D1 DEFECT (pinned, not fixed) — the boundary message contradicts itself', () => {
    // `:278` compares 7.49 < 7.5 → a real violation. `:282` renders the area
    // with `.toFixed(1)` → "7.5". The user is shown "7.5 is below 7.5".
    const found = soleFinding('ROOM_MIN_AREA', contextWith({ roomStore: roomStore([bedroom(7.49)]) }));
    expect(found.message).toBe('Bedroom 1 — area 7.5m² is below minimum 7.5m²');
    // Asserted explicitly so the intent survives the string above: the two
    // numbers in the sentence are equal, which cannot be a valid violation
    // report. Fixing D1 SHOULD break this test.
    const [shown, minimum] = [...found.message.matchAll(/([\d.]+)m²/g)].map((m) => Number(m[1]));
    expect(shown).toBe(minimum);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ROOM_NEEDS_DOOR — declared tier 1, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('ROOM_NEEDS_DOOR (declared: tier 1, error)', () => {
  const bedroom: RoomFixture = { id: 'room-bed', name: 'Bedroom 1', occupancyType: 'bedroom', computed: { area: 20 } };

  it('FIRES at the declared severity when no door bounds the room', () => {
    const found = soleFinding('ROOM_NEEDS_DOOR', contextWith({
      roomStore: roomStore([bedroom]),
      doorStore: { getAll: () => [] },
    }));

    expect(found.severity).toBe('error');
    expect(found.tier).toBe(1);
    expect(found.elementId).toBe('room-bed');
    expect(found.message).toBe('Bedroom 1 — no door found on any bounding wall');
    expect(found.regulation).toBe('Building Regulations Part B (fire egress)');
  });

  it('STAYS SILENT when a door sits on a wall bounding the room', () => {
    expect(findingsFor('ROOM_NEEDS_DOOR', contextWith({
      roomStore: roomStore([bedroom], { 'wall-1': ['room-bed'] }),
      doorStore: { getAll: () => [{ id: 'door-1', wallId: 'wall-1', width: 0.9 }] },
    }))).toHaveLength(0);
  });

  it('FIRES when a door exists but bounds a DIFFERENT room', () => {
    // Adjacency, not mere door existence, is what satisfies the rule.
    const found = soleFinding('ROOM_NEEDS_DOOR', contextWith({
      roomStore: roomStore([bedroom], { 'wall-9': [] }),
      doorStore: { getAll: () => [{ id: 'door-1', wallId: 'wall-9', width: 0.9 }] },
    }));
    expect(found.elementId).toBe('room-bed');
  });

  it('FIRES when the only door carries no wallId (an unhosted door satisfies nothing)', () => {
    expect(findingsFor('ROOM_NEEDS_DOOR', contextWith({
      roomStore: roomStore([bedroom]),
      doorStore: { getAll: () => [{ id: 'door-1', width: 0.9 }] },
    }))).toHaveLength(1);
  });

  it('STAYS SILENT for the exempt occupancy types', () => {
    // terrace/balcony/atrium/courtyard/stairwell — ConstraintEngine.ts:309.
    for (const occupancyType of ['terrace', 'balcony', 'atrium', 'courtyard', 'stairwell']) {
      expect(findingsFor('ROOM_NEEDS_DOOR', contextWith({
        roomStore: roomStore([{ id: 'room-x', occupancyType, computed: { area: 20 } }]),
        doorStore: { getAll: () => [] },
      })), `${occupancyType} is exempt`).toHaveLength(0);
    }
  });

  it('is DISABLED, not satisfied, when doorStore is absent', () => {
    // `if (!roomStore || !doorStore) return []` (:296). A doorless model with no
    // door store reads identically to a fully-doored one — failure and emptiness
    // are the same value here (§CONTEXT-DATA-HONESTY). Pinned as measured
    // behaviour, not endorsed.
    expect(findingsFor('ROOM_NEEDS_DOOR', contextWith({ roomStore: roomStore([bedroom]) }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HABITABLE_NEEDS_WINDOW — declared tier 1, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('HABITABLE_NEEDS_WINDOW (declared: tier 1, error)', () => {
  const bedroom: RoomFixture = { id: 'room-bed', name: 'Bedroom 1', occupancyType: 'bedroom', computed: { area: 20 } };

  it('FIRES at the declared severity for a habitable room with no window', () => {
    const found = soleFinding('HABITABLE_NEEDS_WINDOW', contextWith({
      roomStore: roomStore([bedroom]),
      windowStore: { getAll: () => [] },
    }));

    expect(found.severity).toBe('error');
    expect(found.tier).toBe(1);
    expect(found.elementId).toBe('room-bed');
    expect(found.message).toBe('Bedroom 1 — habitable room has no window');
    expect(found.regulation).toBe('Building Regulations Part F (ventilation) & Part L');
  });

  it('STAYS SILENT when a window sits on a bounding wall', () => {
    expect(findingsFor('HABITABLE_NEEDS_WINDOW', contextWith({
      roomStore: roomStore([bedroom], { 'wall-1': ['room-bed'] }),
      windowStore: { getAll: () => [{ id: 'win-1', wallId: 'wall-1' }] },
    }))).toHaveLength(0);
  });

  it('discriminates HABITABLE from non-habitable occupancy', () => {
    // bedroom is habitable (fires); bathroom and wc are not (silent) —
    // `HABITABLE_TYPES`, ConstraintEngine.ts:93. Same geometry, same absent
    // window, opposite verdicts.
    for (const occupancyType of ['bathroom', 'wc', 'corridor', 'storage-residential']) {
      expect(findingsFor('HABITABLE_NEEDS_WINDOW', contextWith({
        roomStore: roomStore([{ id: 'room-x', occupancyType, computed: { area: 20 } }]),
        windowStore: { getAll: () => [] },
      })), `${occupancyType} is not habitable`).toHaveLength(0);
    }
    for (const occupancyType of ['bedroom', 'living-room', 'kitchen', 'classroom']) {
      expect(findingsFor('HABITABLE_NEEDS_WINDOW', contextWith({
        roomStore: roomStore([{ id: 'room-x', occupancyType, computed: { area: 20 } }]),
        windowStore: { getAll: () => [] },
      })), `${occupancyType} is habitable`).toHaveLength(1);
    }
  });

  it('FIRES when the only window bounds a different room', () => {
    expect(findingsFor('HABITABLE_NEEDS_WINDOW', contextWith({
      roomStore: roomStore([bedroom], { 'wall-9': [] }),
      windowStore: { getAll: () => [{ id: 'win-1', wallId: 'wall-9' }] },
    }))).toHaveLength(1);
  });

  it('is DISABLED, not satisfied, when windowStore is absent', () => {
    expect(findingsFor('HABITABLE_NEEDS_WINDOW', contextWith({ roomStore: roomStore([bedroom]) }))).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// STAIR_HEADROOM — declared tier 1, severity `error`
// ═════════════════════════════════════════════════════════════════════════════

describe('STAIR_HEADROOM (declared: tier 1, error)', () => {
  function stairContext(opts: {
    floorToFloor: number;
    riserHeight?: number;
    riserCount?: number;
  }): Record<string, unknown> {
    const stair: Record<string, unknown> = { id: 'stair-1', baseLevelId: 'L0', topLevelId: 'L1' };
    if (opts.riserHeight !== undefined) stair.riserHeight = opts.riserHeight;
    if (opts.riserCount !== undefined) stair.riserCount = opts.riserCount;
    return contextWith({
      stairStore: { getAll: () => [stair] },
      bimManager: {
        getLevels: () => [
          { id: 'L0', name: 'Ground', elevation: 0 },
          { id: 'L1', name: 'First', elevation: opts.floorToFloor },
        ],
      },
    });
  }

  it('FIRES at the declared severity, with the computed headroom in the message', () => {
    // 3.0 f2f − 0.175 × ceil(12/2) = 3.0 − 1.05 = 1.95.
    const found = soleFinding('STAIR_HEADROOM', stairContext({ floorToFloor: 3.0, riserHeight: 0.175, riserCount: 12 }));

    expect(found.severity).toBe('error');
    expect(found.tier).toBe(1);
    expect(found.elementId).toBe('stair-1');
    expect(found.elementType).toBe('stair');
    expect(found.message).toBe('Stair headroom ~1.95m is below minimum 2.0m');
    expect(found.regulation).toBe('Building Regulations Part K §1.7');
  });

  it('STAYS SILENT with generous floor-to-floor', () => {
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 4.0, riserHeight: 0.175, riserCount: 12 }))).toHaveLength(0);
  });

  it('BOUNDARY — the rule turns over between 3.05 m and 3.0 m floor-to-floor', () => {
    // headroom = f2f − 1.05, threshold `< 2.0` (ConstraintEngine.ts:370).
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 3.05, riserHeight: 0.175, riserCount: 12 }))).toHaveLength(0);
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 3.0, riserHeight: 0.175, riserCount: 12 }))).toHaveLength(1);
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 2.9, riserHeight: 0.175, riserCount: 12 }))).toHaveLength(1);
  });

  it('responds to riser count — the same shaft with fewer risers goes quiet', () => {
    // Proves the rule reads the stair, not just the levels.
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 3.0, riserHeight: 0.175, riserCount: 12 }))).toHaveLength(1);
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 3.0, riserHeight: 0.175, riserCount: 4 }))).toHaveLength(0);
  });

  it('STAYS SILENT when a referenced level is missing, or floor-to-floor is zero', () => {
    // `if (!baseLevel || !topLevel) continue` (:366) and the `floorToFloor > 0`
    // guard (:370). Both are absence, not compliance.
    expect(findingsFor('STAIR_HEADROOM', contextWith({
      stairStore: { getAll: () => [{ id: 'stair-1', baseLevelId: 'L0', topLevelId: 'MISSING' }] },
      bimManager: { getLevels: () => [{ id: 'L0', elevation: 0 }] },
    }))).toHaveLength(0);
    expect(findingsFor('STAIR_HEADROOM', stairContext({ floorToFloor: 0 }))).toHaveLength(0);
  });

  it('D2 DEFECT (pinned, not fixed) — the rule DEFAULTS fire on a standard 3.0 m storey', () => {
    // No riserHeight, no riserCount — the rule supplies 0.175 m and 12
    // (ConstraintEngine.ts:369). A 3.0 m floor-to-floor is the ordinary UK
    // residential dimension, and it is reported as an `error`. Fixing D2
    // SHOULD break this test.
    const found = soleFinding('STAIR_HEADROOM', stairContext({ floorToFloor: 3.0 }));
    expect(found.severity).toBe('error');
    expect(found.message).toBe('Stair headroom ~1.95m is below minimum 2.0m');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-cutting — the properties the per-family tests above cannot show alone
// ═════════════════════════════════════════════════════════════════════════════

describe('engine-level behaviour', () => {
  it('registers all 17 built-in families', () => {
    // The count the engine itself logs. A drop here means a family vanished
    // between the registry and the run — which is what makes the per-family
    // silence assertions above meaningful rather than vacuous.
    const everyRuleSeen = new Set<string>();
    // Drive a context rich enough to trip several families at once.
    const rooms: RoomFixture[] = [
      { id: 'r-bed', name: 'Bedroom', occupancyType: 'bedroom', levelId: 'L0', computed: { area: 4, centroid: { x: 0, z: 0 }, boundingBox: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 } } },
      { id: 'r-cor', name: 'Corridor', occupancyType: 'corridor', levelId: 'L0', computed: { area: 6, centroid: { x: 5, z: 0 }, boundingBox: { minX: 4, maxX: 5, minZ: 0, maxZ: 6 } } },
    ];
    const ctx = contextWith({
      roomStore: roomStore(rooms),
      doorStore: { getAll: () => [] },
      windowStore: { getAll: () => [] },
    });
    for (const r of engine.validateAll(ctx)) everyRuleSeen.add(r.ruleId);

    // Several distinct families fired on ONE context — the engine is running a
    // registry, not a single hard-coded check.
    expect(everyRuleSeen.has('ROOM_MIN_AREA')).toBe(true);
    expect(everyRuleSeen.has('ROOM_NEEDS_DOOR')).toBe(true);
    expect(everyRuleSeen.has('HABITABLE_NEEDS_WINDOW')).toBe(true);
    expect(everyRuleSeen.size).toBeGreaterThanOrEqual(3);
  });

  it('returns NOTHING for a context with every store absent', () => {
    // The all-null context is the shape `_getContext()` produces before the
    // stores land on `window`. It must not be mistaken for a clean model.
    expect(engine.validateAll(emptyContext())).toHaveLength(0);
  });

  it('every finding carries the six required ValidationResult fields', () => {
    const results = engine.validateAll(contextWith({
      roomStore: roomStore([{ id: 'r-bed', name: 'Bedroom', occupancyType: 'bedroom', computed: { area: 3 } }]),
      doorStore: { getAll: () => [] },
      windowStore: { getAll: () => [] },
    }));
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.ruleId).toBe('string');
      expect([1, 2]).toContain(r.tier);
      expect(['error', 'warning', 'info']).toContain(r.severity);
      expect(typeof r.elementId).toBe('string');
      expect(typeof r.elementType).toBe('string');
      expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
