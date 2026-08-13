/**
 * OPENING-MOVE REGISTER-VERB SPELLINGS — `door.move` and `window.move` reach the composed
 * `opening.move` planner (C78 §1.1 · §19.1 · the bar-3 determination gate).
 *
 * ════ THE FAMILY, AND WHY IT LANDS WHOLE ══════════════════════════════════════════════
 * The C69 register carries TWO consequential `move`-class verbs for hosted openings:
 * `door.move` and `window.move` (both REFUSES-status at the bus — §FIX-DEAD-MOVE-VERB-REFUSE
 * — exactly as `wall.move` is a refused-but-semantic verb and is nevertheless a normaliser
 * key). check-relationship-determination counted BOTH as silent-dispatch: no normaliser
 * entry, so every one of their 41 relationship cells yielded the forbidden fourth answer.
 *
 * The semantic operation they name — slide a hosted element along its host — is the THIRD
 * matrix row, already composed and already proven over the REAL `wallOccupancyStore` by
 * OpeningMoveConsequenceReachability.test.ts. This suite lands the two register spellings
 * onto that planner: two normaliser rules, two map entries, NO service edit — the exact
 * extension §PLANNER-REGISTRY-GENERIC predicted. C78 §19.1: the family is both verbs or
 * neither; this file asserts both.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE (C74 §3.4) ════════════════════════════════════
 * REAL — the normaliser registry, the `OpeningMoveConsequencePlanner`, and the REAL
 * `wallOccupancyStore` on both seams, so the fit/occupancy verdicts are the production
 * rules. DOUBLE — the store views only (input side), the same shape the reachability
 * suite drives. Nothing supplies the answer; the planner computes it.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { OpeningMoveConsequencePlanner } from '../src/engine/consequence/OpeningMoveConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';

// ─── The world: same fixture geometry as the reachability suite ───────────────────────

interface Opening {
  id: string;
  elementId: string;
  type: 'door' | 'window';
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
}

interface Wall {
  id: string;
  type: 'wall';
  levelId: string;
  baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
  height: number;
  thickness: number;
  openings: Opening[];
}

/** 6 m wall; door-1 at [0.500, 1.400], win-1 at [3.000, 4.200]. */
function hostWall(): Wall {
  return {
    id: 'wall-1',
    type: 'wall',
    levelId: 'L1',
    baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
    height: 2.7,
    thickness: 0.2,
    openings: [
      { id: 'op-d1', elementId: 'door-1', type: 'door', offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0 },
      { id: 'op-w1', elementId: 'win-1', type: 'window', offset: 3.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
    ],
  };
}

function makeContext(walls: Map<string, Wall>): () => PlanningContext {
  return () =>
    ({
      getStore: (id: string) => {
        const items: unknown[] | undefined =
          id === 'wall'
            ? [...walls.values()]
            : id === 'room' || id === 'door' || id === 'window' || id === 'stair'
              ? []
              : undefined;
        if (!items) return undefined;
        return {
          getAll: () => items,
          getById: (eid: string) => items.find((i) => (i as { id?: string }).id === eid) ?? null,
        };
      },
    }) as unknown as PlanningContext;
}

function realPlanner(): ConsequencePlanner<never> {
  return new OpeningMoveConsequencePlanner({
    clamp: wallOccupancyStore,
    collision: wallOccupancyStore,
  }) as unknown as ConsequencePlanner<never>;
}

function svc(walls: Map<string, Wall>): ConsequencePreviewService {
  return new ConsequencePreviewService(
    new Map<string, ConsequencePlanner<never>>([['opening.move', realPlanner()]]),
    makeContext(walls),
  );
}

function world(): Map<string, Wall> {
  return new Map([['wall-1', hostWall()]]);
}

/** The register-verb payloads AS THEIR HANDLERS DECLARE THEM (MoveDoorPayload / MoveWindowPayload). */
const DOOR_MOVE = { type: 'door.move', payload: { doorId: 'door-1', offset: 1.8 } } as const;
const WINDOW_MOVE = { type: 'window.move', payload: { windowId: 'win-1', offset: 1.6 } } as const;

// ─── 0. Normalisation — both spellings, whole family ──────────────────────────────────

describe('door.move / window.move normalise to the semantic opening.move (C78 §19.1: both or neither)', () => {
  it('door.move {doorId, offset} → opening.move', () => {
    const semantic = normalizeConsequenceCommand(DOOR_MOVE);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('opening.move');
    expect(semantic!.payload).toMatchObject({ id: 'door-1', offset: 1.8 });
  });

  it('window.move {windowId, offset} → opening.move — the SAME semantic verb', () => {
    const semantic = normalizeConsequenceCommand(WINDOW_MOVE);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('opening.move');
    expect(semantic!.payload).toMatchObject({ id: 'win-1', offset: 1.6 });
  });

  it('both spellings are registry entries — the map is the crediting artefact', () => {
    expect(CONSEQUENCE_NORMALIZERS.has('door.move')).toBe(true);
    expect(CONSEQUENCE_NORMALIZERS.has('window.move')).toBe(true);
  });

  it('neither payload carries wallId, so none is forwarded — the reverse-scan path stays live', () => {
    expect(Object.keys(normalizeConsequenceCommand(DOOR_MOVE)!.payload as object)).not.toContain('wallId');
    expect(Object.keys(normalizeConsequenceCommand(WINDOW_MOVE)!.payload as object)).not.toContain('wallId');
  });

  it('a malformed payload is null — never a fourth answer minted from garbage', () => {
    expect(normalizeConsequenceCommand({ type: 'door.move', payload: { doorId: 'door-1' } })).toBeNull();
    expect(
      normalizeConsequenceCommand({ type: 'door.move', payload: { doorId: '', offset: 1 } }),
    ).toBeNull();
    expect(
      normalizeConsequenceCommand({ type: 'window.move', payload: { windowId: 'w', offset: Number.NaN } }),
    ).toBeNull();
  });

  it('the pre-existing spellings are untouched', () => {
    for (const k of ['wall.move', 'wall.updateBaseline', 'wall.create', 'opening.move', 'door.setOffset', 'window.setOffset']) {
      expect(CONSEQUENCE_NORMALIZERS.has(k)).toBe(true);
    }
  });
});

// ─── 1. The spellings reach the REAL planner and agree with the live-verb answer ──────

describe('preview answers for the register spellings — real planner, real occupancy store', () => {
  it('door.move produces a real ConsequencePlan (not null)', async () => {
    const plan = await svc(world()).preview(DOOR_MOVE);
    expect(plan).not.toBeNull();
    expect(plan!.planId.startsWith('plan-opening.move-')).toBe(true);
    expect(plan!.changed).toContain('door-1');
    expect(plan!.changed).toContain('wall-1');
  });

  it('window.move produces a real ConsequencePlan (not null)', async () => {
    const plan = await svc(world()).preview(WINDOW_MOVE);
    expect(plan).not.toBeNull();
    expect(plan!.changed).toContain('win-1');
  });

  it('door.move and door.setOffset with the same numbers plan the SAME determinations — one family, not a rival', async () => {
    const s = svc(world());
    const viaMove = (await s.preview(DOOR_MOVE))!;
    const viaSetOffset = (await s.preview({
      type: 'door.setOffset',
      payload: { doorId: 'door-1', newOffset: 1.8 },
    }))!;
    const facts = (p: typeof viaMove) => ({
      changed: p.changed,
      excluded: p.excluded,
      refused: p.refused,
      topology: p.topology,
      metrics: p.metrics,
      undetermined: p.undetermined,
    });
    expect(facts(viaMove)).toEqual(facts(viaSetOffset));
  });

  it('C70 F-INV-3 through the new spelling: a collision REFUSES naming both spans, and removes nothing', async () => {
    // win-1 (1.2 m wide) asked to sit at 1.0 → [1.000, 2.200] overlaps door-1 [0.500, 1.400].
    const plan = (await svc(world()).preview({
      type: 'window.move',
      payload: { windowId: 'win-1', offset: 1.0 },
    }))!;
    const r = plan.refused.find((x) => x.elementId === 'win-1');
    expect(r).toBeDefined();
    expect(r!.reason).toMatch(/1\.000 m, 2\.200 m/);
    expect(r!.reason).toMatch(/0\.500 m, 1\.400 m/);
    expect(plan.topology.removed).toEqual([]);
  });

  it('PURITY — previewing the new spellings mutates nothing (G-REASON-01)', async () => {
    const walls = world();
    const before = JSON.stringify([...walls.values()]);
    await svc(walls).preview(DOOR_MOVE);
    await svc(walls).preview(WINDOW_MOVE);
    expect(JSON.stringify([...walls.values()])).toBe(before);
  });

  it('DETERMINISM — two previews of one door.move agree byte-for-byte (G-REASON-02)', async () => {
    const s = svc(world());
    expect(JSON.stringify(await s.preview(DOOR_MOVE))).toBe(JSON.stringify(await s.preview(DOOR_MOVE)));
  });
});
