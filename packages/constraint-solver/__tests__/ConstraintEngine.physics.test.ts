/**
 * @vitest-environment happy-dom
 *
 * @file packages/constraint-solver/__tests__/ConstraintEngine.physics.test.ts
 *
 * **Executable evidence for the five PHASE-H physics rule families, at their
 * DECLARED strength** — C74 §3.1/§3.5, C70 G-INV-2, gated by
 * `tools/ga-gate/check-constraint-honesty.ts` (arm H3):
 *
 *   ACOUSTIC_RT60_HOSPITAL        tier 2, warning
 *   ACOUSTIC_RT60_SCHOOL          tier 2, warning
 *   ACOUSTIC_RT60_COURT           tier 2, warning
 *   DAYLIGHT_HABITABLE            tier 2, warning
 *   THERMAL_GLAZING_OVERHEATING   tier 2, warning
 *
 * **Every assertion below calls the REAL `constraintEngine.validateAll(ctx)`.**
 * No rule is rebuilt here and no expected message is copied out of the source —
 * each is asserted against the string the engine actually produced.
 *
 * ─── HOW THESE FIVE DIFFER FROM EVERY OTHER FAMILY ──────────────────────────
 * The physics rules do not read the `ConstraintContext` at all. Each one reads
 * `window.physicsEngine.cache` (a Map of per-room physics results) and
 * `window.roomStore` directly (`ConstraintEngine.ts:695-812`). The context
 * passed to `validateAll` is irrelevant to them — these tests pass the
 * all-null context to prove the findings can only have come from the window
 * path. Fixtures therefore install `physicsEngine`/`roomStore` on `window`
 * (happy-dom) and remove them after every test.
 *
 * ─── WHAT IS SUBSTITUTED, AND WHAT IS THEREFORE NOT COVERED (C74 §3.5) ──────
 * 1. **The physics cache.** The `rt60_s` / `daylightFactor_percent` /
 *    `thermalLoad_Wm2` numbers are test inputs — the rule's INPUT, exactly as
 *    a room area is for ROOM_MIN_AREA. The value under test is the rule's
 *    verdict on those numbers (threshold, severity, message), which the
 *    engine computes. **NOT COVERED:** that the production `PhysicsEngine`
 *    ever computes such numbers, caches them under room ids, or keeps them
 *    fresh. A dead or wrong physics pipeline is invisible from here — these
 *    tests prove the RULES, not the physics.
 * 2. **`window.roomStore`** is a plain object, as in the sibling suites.
 *    **NOT COVERED:** that production publishes a store at that global, or
 *    that its room ids match the cache's keys.
 * 3. **`@pryzm/core-app-model`** aliased to `batchCoordinator` only (see
 *    `vitest.config.ts`) — read at one site no test here enters.
 *
 * ─── DEFECT FOUND AND DELIBERATELY NOT FIXED ────────────────────────────────
 * **D3 — the acoustic rules fire AT their limit while claiming excess.** All
 * three use `>=` (`rt60_s >= 0.5` etc.) but the message template says
 * "exceeds": a room measured at exactly the limit is shown *"RT60 0.5s
 * exceeds 0.5s limit"* — the sentence refutes itself, the same defect family
 * as D1 in `ConstraintEngine.rules.test.ts`. Pinned; fixing it SHOULD break
 * the pin.
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ValidationResult } from '../src/ConstraintEngine.js';
import {
  emptyContext,
  findingsFor as findingsForWith,
  soleFinding as soleFindingWith,
  type ComplianceEngine,
  type RoomFixture,
} from './support/complianceHarness.js';

// ─── The real engine, imported once ──────────────────────────────────────────

let engine: ComplianceEngine;

beforeAll(async () => {
  engine = (await import('../src/ConstraintEngine.js')).constraintEngine;
  await new Promise((resolve) => setTimeout(resolve, 0));
}, 240_000);

// ─── Window fixtures — the physics rules' INPUT, never the rules ─────────────

interface PhysicsCacheEntry {
  acoustic?: { rt60_s: number };
  daylight?: { daylightFactor_percent: number };
  thermal?: { thermalLoad_Wm2: number };
}

/** The two globals the physics rules read. Typed view, no `any` cast. */
const win = window as unknown as {
  physicsEngine?: { cache: Map<string, PhysicsCacheEntry> };
  roomStore?: { getAll(): RoomFixture[] };
};

function installPhysics(rooms: RoomFixture[], cache: Record<string, PhysicsCacheEntry>): void {
  win.physicsEngine = { cache: new Map(Object.entries(cache)) };
  win.roomStore = { getAll: () => rooms };
}

afterEach(() => {
  delete win.physicsEngine;
  delete win.roomStore;
});

/** A room for the physics rules — they read id, occupancyType, name, volume. */
function room(id: string, occupancyType: string, extra: Partial<RoomFixture> = {}): RoomFixture {
  return { id, occupancyType, levelId: 'L0', computed: {}, ...extra };
}

/** All physics findings for one rule id — always driven on the all-null ctx. */
const findingsFor = (ruleId: string): ValidationResult[] =>
  findingsForWith(engine, ruleId, emptyContext());
const soleFinding = (ruleId: string): ValidationResult =>
  soleFindingWith(engine, ruleId, emptyContext());

// ═════════════════════════════════════════════════════════════════════════════
// ACOUSTIC_RT60_HOSPITAL — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('ACOUSTIC_RT60_HOSPITAL (declared: tier 2, warning)', () => {
  it('FIRES at the declared severity, with the cached RT60 in the message', () => {
    installPhysics(
      [room('r-ward', 'patient-room', { name: 'Ward 3' })],
      { 'r-ward': { acoustic: { rt60_s: 0.9 } } },
    );
    const found = soleFinding('ACOUSTIC_RT60_HOSPITAL');

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-ward');
    expect(found.elementType).toBe('room');
    expect(found.message).toBe('Ward 3 — RT60 0.9s exceeds 0.5s limit for hospital rooms');
    expect(found.suggestion).toBe('Add acoustic ceiling tiles or carpet finishes to reduce reverberation');
    expect(found.regulation).toBe('NHS HBN 00-08 Acoustics (2013), HTM 08-01');
  });

  it('STAYS SILENT below the limit', () => {
    installPhysics(
      [room('r-ward', 'patient-room')],
      { 'r-ward': { acoustic: { rt60_s: 0.4 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_HOSPITAL')).toHaveLength(0);
  });

  it('D3 DEFECT (pinned, not fixed) — fires AT the limit while claiming excess', () => {
    // The comparison is `>=` but the sentence says "exceeds": at exactly
    // 0.5 s the two numbers shown to the user are equal, so the message
    // refutes itself. Fixing D3 SHOULD break this pin.
    installPhysics(
      [room('r-ward', 'patient-room', { name: 'Ward 3' })],
      { 'r-ward': { acoustic: { rt60_s: 0.5 } } },
    );
    const found = soleFinding('ACOUSTIC_RT60_HOSPITAL');
    expect(found.message).toBe('Ward 3 — RT60 0.5s exceeds 0.5s limit for hospital rooms');
  });

  it('applies to hospital occupancies only — a classroom at 0.9 s is not its subject', () => {
    installPhysics(
      [room('r-class', 'classroom')],
      { 'r-class': { acoustic: { rt60_s: 0.9 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_HOSPITAL')).toHaveLength(0);
    // consultation-room IS a hospital occupancy.
    installPhysics(
      [room('r-cons', 'consultation-room')],
      { 'r-cons': { acoustic: { rt60_s: 0.9 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_HOSPITAL')).toHaveLength(1);
  });

  it('is SKIPPED, not violated, for a room with no acoustic result (pinned)', () => {
    // `if (!r?.acoustic) continue` — an unanalysed ward reads as compliant.
    // Absence and compliance as the same value; pinned, not endorsed.
    installPhysics([room('r-ward', 'patient-room')], { 'r-ward': {} });
    expect(findingsFor('ACOUSTIC_RT60_HOSPITAL')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ACOUSTIC_RT60_SCHOOL — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('ACOUSTIC_RT60_SCHOOL (declared: tier 2, warning)', () => {
  it('FIRES at the declared severity, with the cached RT60 in the message', () => {
    installPhysics(
      [room('r-class', 'classroom', { name: 'Class 2B' })],
      { 'r-class': { acoustic: { rt60_s: 1.1 } } },
    );
    const found = soleFinding('ACOUSTIC_RT60_SCHOOL');

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-class');
    expect(found.message).toBe('Class 2B — RT60 1.1s exceeds 0.8s limit for educational spaces');
    expect(found.suggestion).toBe('Acoustic ceiling tiles or wall panels recommended; BB93 Table 1 target ≤ 0.8s (unoccupied)');
    expect(found.regulation).toBe('Building Bulletin 93 (BB93) Table 1 — Acoustic Design of Schools');
  });

  it('STAYS SILENT below the limit', () => {
    installPhysics(
      [room('r-class', 'classroom')],
      { 'r-class': { acoustic: { rt60_s: 0.7 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_SCHOOL')).toHaveLength(0);
  });

  it('BOUNDARY — fires AT 0.8 s exactly (`>=`, the D3 defect family)', () => {
    // lecture-hall is the set's other member; it carries the boundary case.
    installPhysics(
      [room('r-hall', 'lecture-hall')],
      { 'r-hall': { acoustic: { rt60_s: 0.8 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_SCHOOL')).toHaveLength(1);
  });

  it('applies to educational occupancies only — a ward at 1.1 s is not its subject', () => {
    installPhysics(
      [room('r-ward', 'patient-room')],
      { 'r-ward': { acoustic: { rt60_s: 1.1 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_SCHOOL')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ACOUSTIC_RT60_COURT — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('ACOUSTIC_RT60_COURT (declared: tier 2, warning)', () => {
  it('FIRES at the declared severity, with the cached RT60 in the message', () => {
    installPhysics(
      [room('r-court', 'courtroom', { name: 'Court 1' })],
      { 'r-court': { acoustic: { rt60_s: 1.5 } } },
    );
    const found = soleFinding('ACOUSTIC_RT60_COURT');

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-court');
    expect(found.message).toBe('Court 1 — RT60 1.5s exceeds 1.2s for civic/court use');
    expect(found.suggestion).toBe('Acoustic wall and ceiling treatments required for speech intelligibility');
    expect(found.regulation).toBe('BS EN ISO 3382-1:2009 — Measurement of Room Acoustics');
  });

  it('STAYS SILENT below the limit', () => {
    installPhysics(
      [room('r-court', 'courtroom')],
      { 'r-court': { acoustic: { rt60_s: 1.1 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_COURT')).toHaveLength(0);
  });

  it('BOUNDARY — fires AT 1.2 s exactly (`>=`, the D3 defect family)', () => {
    installPhysics(
      [room('r-chamber', 'council-chamber')],
      { 'r-chamber': { acoustic: { rt60_s: 1.2 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_COURT')).toHaveLength(1);
  });

  it('the ≥500 m³ clause is DEAD — a large non-court room can never fire (pinned)', () => {
    // The guard admits any room of volume ≥ 500 m³ into the loop, but the body
    // then requires a court occupancy again, so the volume arm can never
    // produce a finding. A 600 m³ restaurant at RT60 5 s reads compliant.
    // Measured behaviour; pinned, not endorsed.
    installPhysics(
      [room('r-rest', 'restaurant', { volume: 600 })],
      { 'r-rest': { acoustic: { rt60_s: 5 } } },
    );
    expect(findingsFor('ACOUSTIC_RT60_COURT')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DAYLIGHT_HABITABLE — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('DAYLIGHT_HABITABLE (declared: tier 2, warning)', () => {
  it('FIRES at the declared severity, with the cached daylight factor in the message', () => {
    installPhysics(
      [room('r-bed', 'bedroom', { name: 'Bedroom 1' })],
      { 'r-bed': { daylight: { daylightFactor_percent: 0.5 } } },
    );
    const found = soleFinding('DAYLIGHT_HABITABLE');

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-bed');
    expect(found.message).toBe('Bedroom 1 — daylight factor 0.5% is below 1% minimum');
    expect(found.suggestion).toBe('Increase glazing area or use roof lights to achieve minimum 1% average daylight factor');
    expect(found.regulation).toBe('BRE Site Layout Planning for Daylight & Sunlight (2011); Building Regs Part L');
  });

  it('STAYS SILENT at a healthy daylight factor', () => {
    installPhysics(
      [room('r-bed', 'bedroom')],
      { 'r-bed': { daylight: { daylightFactor_percent: 2 } } },
    );
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(0);
  });

  it('BOUNDARY — 1% exactly passes, 0.99% fails (the comparison is strict `<`)', () => {
    installPhysics(
      [room('r-bed', 'bedroom')],
      { 'r-bed': { daylight: { daylightFactor_percent: 1 } } },
    );
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(0);
    installPhysics(
      [room('r-bed', 'bedroom')],
      { 'r-bed': { daylight: { daylightFactor_percent: 0.99 } } },
    );
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(1);
  });

  it('holds its OWN habitable set — reception counts here, laboratory does not (pinned)', () => {
    // This rule's habitable list differs from the tier-1 HABITABLE_TYPES:
    // `reception` is only here, `laboratory` is only there. Two "habitable"
    // vocabularies in one engine is a measured fact worth keeping visible.
    installPhysics(
      [room('r-rec', 'reception')],
      { 'r-rec': { daylight: { daylightFactor_percent: 0.5 } } },
    );
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(1);
    installPhysics(
      [room('r-lab', 'laboratory')],
      { 'r-lab': { daylight: { daylightFactor_percent: 0.5 } } },
    );
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(0);
  });

  it('is SKIPPED, not violated, for a room with no daylight result (pinned)', () => {
    installPhysics([room('r-bed', 'bedroom')], { 'r-bed': {} });
    expect(findingsFor('DAYLIGHT_HABITABLE')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// THERMAL_GLAZING_OVERHEATING — declared tier 2, severity `warning`
// ═════════════════════════════════════════════════════════════════════════════

describe('THERMAL_GLAZING_OVERHEATING (declared: tier 2, warning)', () => {
  it('FIRES at the declared severity, with the cached load in the message', () => {
    installPhysics(
      [room('r-liv', 'living-room', { name: 'Living' })],
      { 'r-liv': { thermal: { thermalLoad_Wm2: 60 } } },
    );
    const found = soleFinding('THERMAL_GLAZING_OVERHEATING');

    expect(found.severity).toBe('warning');   // matches the DECLARED strength
    expect(found.tier).toBe(2);
    expect(found.elementId).toBe('r-liv');
    expect(found.message).toBe('Living — estimated thermal load 60 W/m² exceeds 45 W/m² overheating threshold');
    expect(found.suggestion).toBe('Reduce south-facing glazing, add external shading, or use high-performance glazing (SHGC < 0.3)');
    expect(found.regulation).toBe('CIBSE TM52 (2013) — Overheating Assessment; Building Regs Part O');
  });

  it('STAYS SILENT at a modest load', () => {
    installPhysics(
      [room('r-liv', 'living-room')],
      { 'r-liv': { thermal: { thermalLoad_Wm2: 30 } } },
    );
    expect(findingsFor('THERMAL_GLAZING_OVERHEATING')).toHaveLength(0);
  });

  it('BOUNDARY — 45 W/m² exactly passes, 46 fails (the comparison is strict `>`)', () => {
    installPhysics(
      [room('r-liv', 'living-room')],
      { 'r-liv': { thermal: { thermalLoad_Wm2: 45 } } },
    );
    expect(findingsFor('THERMAL_GLAZING_OVERHEATING')).toHaveLength(0);
    installPhysics(
      [room('r-liv', 'living-room')],
      { 'r-liv': { thermal: { thermalLoad_Wm2: 46 } } },
    );
    expect(findingsFor('THERMAL_GLAZING_OVERHEATING')).toHaveLength(1);
  });

  it('has NO occupancy filter — even a store room over the threshold fires', () => {
    installPhysics(
      [room('r-store', 'storage-residential', { name: 'Store' })],
      { 'r-store': { thermal: { thermalLoad_Wm2: 60 } } },
    );
    const found = soleFinding('THERMAL_GLAZING_OVERHEATING');
    expect(found.message).toBe('Store — estimated thermal load 60 W/m² exceeds 45 W/m² overheating threshold');
  });

  it('is SKIPPED, not violated, for a room with no thermal result (pinned)', () => {
    installPhysics([room('r-liv', 'living-room')], { 'r-liv': {} });
    expect(findingsFor('THERMAL_GLAZING_OVERHEATING')).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Cross-cutting — the window-path guard shared by all five families
// ═════════════════════════════════════════════════════════════════════════════

describe('physics rules are DISABLED, not satisfied, without their window globals', () => {
  const PHYSICS_FAMILIES = [
    'ACOUSTIC_RT60_HOSPITAL',
    'ACOUSTIC_RT60_SCHOOL',
    'ACOUSTIC_RT60_COURT',
    'DAYLIGHT_HABITABLE',
    'THERMAL_GLAZING_OVERHEATING',
  ] as const;

  it('no physicsEngine on window → every family silent, whatever the rooms hold', () => {
    // `if (!pe?.cache || !rs?.getAll) return []` in all five rules — a model
    // that was never analysed reads identically to one that passed every
    // check. The same absence-as-compliance value as the store guards in the
    // sibling suites; pinned, not endorsed.
    win.roomStore = { getAll: () => [room('r-ward', 'patient-room')] };
    for (const family of PHYSICS_FAMILIES) {
      expect(findingsFor(family), `${family} disabled without physicsEngine`).toHaveLength(0);
    }
  });

  it('no roomStore on window → every family silent, whatever the cache holds', () => {
    win.physicsEngine = { cache: new Map([['r-ward', { acoustic: { rt60_s: 9 }, daylight: { daylightFactor_percent: 0 }, thermal: { thermalLoad_Wm2: 999 } }]]) };
    for (const family of PHYSICS_FAMILIES) {
      expect(findingsFor(family), `${family} disabled without roomStore`).toHaveLength(0);
    }
  });
});
