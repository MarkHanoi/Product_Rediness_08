/**
 * WALL-OPENING-CREATE REGISTER-VERB SPELLINGS — the hosted-opening CREATE family reaches
 * a composed planner (C78 §1.1 · §19.1 · the bar-3 determination gate).
 *
 * ════ THE FAMILY, AND WHY IT LANDS WHOLE ══════════════════════════════════════════════
 * The C69 register carries THREE consequential `create`-class verbs for wall-hosted
 * openings — `wall.opening.create` (the live PRYZM3 adapter), `door.create` and
 * `window.create` (both REFUSES-status, §FIX-CREATE-LIVENESS-LIE) — plus the
 * unclassified authoritative spelling `wall.createOpening`, which both refusal texts
 * name as THE commit path. check-relationship-determination counted the three register
 * verbs as silent-dispatch: no normaliser entry, so every one of their 41 relationship
 * cells yielded the forbidden fourth answer.
 *
 * All four spellings name ONE atomic semantic operation — the refusal sentences
 * themselves fix it: "a door is a hosted opening, so it is created by ONE atomic
 * command — wall.createOpening { wallId, opening: { id, type, offset, width, height,
 * sillHeight, elementId } }". This suite lands the four spellings onto ONE new planner
 * (`WallOpeningCreateConsequencePlanner`), driven by the SAME `wallOccupancyStore.canPlace`
 * the commit path runs. C78 §19.1: the family is all spellings or none; this file
 * asserts all four.
 *
 * ════ WHAT IS REAL AND WHAT IS A DOUBLE (C72 §3.4) ════════════════════════════════════
 * REAL — the normaliser registry, the `WallOpeningCreateConsequencePlanner`, and the
 * REAL `wallOccupancyStore` on the occupancy seam, so the bounds and overlap verdicts
 * under test are the production rules. DOUBLE — the store views only (input side).
 * Nothing supplies the answer; the planner computes it.
 */

import { describe, expect, it } from 'vitest';
import type { ConsequencePlanner, PlanningContext } from '@pryzm/command-bus';
import { wallOccupancyStore } from '@pryzm/geometry-wall';
import { WallOpeningCreateConsequencePlanner } from '../src/engine/consequence/WallOpeningCreateConsequencePlanner';
import {
  ConsequencePreviewService,
  normalizeConsequenceCommand,
  CONSEQUENCE_NORMALIZERS,
} from '../src/engine/consequence/ConsequencePreviewService';

// ─── The world: same fixture geometry as the opening.move suites ──────────────────────

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

/** 6 m wall; door-1 at [0.500, 1.400], win-1 at [3.000, 4.200]. The 1.6 m gap between
 *  them is what lets ONE fixture express a clean create, a colliding create and a
 *  bounds-refused create. */
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
  return new WallOpeningCreateConsequencePlanner({
    occupancy: wallOccupancyStore,
  }) as unknown as ConsequencePlanner<never>;
}

function svc(walls: Map<string, Wall>): ConsequencePreviewService {
  return new ConsequencePreviewService(
    new Map<string, ConsequencePlanner<never>>([['wall.opening.create', realPlanner()]]),
    makeContext(walls),
  );
}

function world(): Map<string, Wall> {
  return new Map([['wall-1', hostWall()]]);
}

// The SAME create — a 0.9 m door at offset 1.8 (span [1.800, 2.700], clear of both
// siblings) — spelled all four ways, each AS ITS HANDLER DECLARES THE PAYLOAD.
const NUMBERS = { offset: 1.8, width: 0.9, height: 2.1, sillHeight: 0 } as const;

const VIA_ADAPTER = {
  type: 'wall.opening.create',
  payload: {
    wallId: 'wall-1',
    openingData: { id: 'op-n1', elementId: 'new-1', type: 'door', ...NUMBERS },
  },
} as const;

const VIA_LEGACY = {
  type: 'wall.createOpening',
  payload: {
    wallId: 'wall-1',
    opening: { id: 'op-n1', elementId: 'new-1', type: 'door', ...NUMBERS },
  },
} as const;

const VIA_DOOR_CREATE = {
  type: 'door.create',
  payload: { wallId: 'wall-1', openingId: 'op-n1', id: 'new-1', ...NUMBERS },
} as const;

const VIA_FLAT = {
  type: 'wall.opening.create',
  payload: { id: 'new-1', wallId: 'wall-1', openingId: 'op-n1', openingType: 'door', ...NUMBERS },
} as const;

const VIA_WINDOW_CREATE = {
  type: 'window.create',
  payload: { wallId: 'wall-1', openingId: 'op-n2', id: 'new-2', offset: 1.8, width: 0.9, height: 1.2, sillHeight: 0.9 },
} as const;

// ─── 0. Normalisation — all four spellings, whole family ──────────────────────────────

describe('the four create spellings normalise to the semantic wall.opening.create (C78 §19.1: all or none)', () => {
  it('wall.opening.create {wallId, openingData} (the adapter shape) → the semantic command', () => {
    const semantic = normalizeConsequenceCommand(VIA_ADAPTER);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('wall.opening.create');
    expect(semantic!.payload).toMatchObject({
      id: 'new-1', wallId: 'wall-1', openingId: 'op-n1', openingType: 'door', offset: 1.8, width: 0.9,
    });
  });

  it('wall.createOpening {wallId, opening} (the authoritative path) → the SAME semantic command', () => {
    const semantic = normalizeConsequenceCommand(VIA_LEGACY);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('wall.opening.create');
    expect(semantic!.payload).toEqual(normalizeConsequenceCommand(VIA_ADAPTER)!.payload);
  });

  it('door.create {wallId, openingId, id, offset, width} → the SAME semantic command', () => {
    const semantic = normalizeConsequenceCommand(VIA_DOOR_CREATE);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('wall.opening.create');
    expect(semantic!.payload).toEqual(normalizeConsequenceCommand(VIA_ADAPTER)!.payload);
  });

  it('window.create → the semantic command with openingType window', () => {
    const semantic = normalizeConsequenceCommand(VIA_WINDOW_CREATE);
    expect(semantic).not.toBeNull();
    expect(semantic!.type).toBe('wall.opening.create');
    expect(semantic!.payload).toMatchObject({ id: 'new-2', openingType: 'window', offset: 1.8 });
  });

  it('all four spellings are registry entries — the map is the crediting artefact', () => {
    for (const k of ['wall.opening.create', 'wall.createOpening', 'door.create', 'window.create']) {
      expect(CONSEQUENCE_NORMALIZERS.has(k)).toBe(true);
    }
  });

  it('a payload with no stable identity is null — the planner never plans an invented element', () => {
    // The adapter mints crypto.randomUUID() for absent ids; the normaliser must NOT mirror that.
    expect(
      normalizeConsequenceCommand({
        type: 'wall.opening.create',
        payload: { wallId: 'wall-1', openingData: { type: 'door', ...NUMBERS } },
      }),
    ).toBeNull();
  });

  it('door.create with DEFAULTED dims is null — the normaliser translates, it does not resolve type registries', () => {
    // The handler would run `width ?? getDoorType(systemTypeId)?.width ?? 0.9`; a rule that
    // answered with the base literal could plan a width the handler would not commit.
    expect(
      normalizeConsequenceCommand({ type: 'door.create', payload: { wallId: 'wall-1', openingId: 'op-n1' } }),
    ).toBeNull();
  });

  it('malformed payloads are null — never a fourth answer minted from garbage', () => {
    expect(normalizeConsequenceCommand({ type: 'window.create', payload: undefined })).toBeNull();
    expect(
      normalizeConsequenceCommand({
        type: 'wall.createOpening',
        payload: { wallId: 'wall-1', opening: { elementId: 'x', type: 'door', offset: Number.NaN, width: 0.9 } },
      }),
    ).toBeNull();
    expect(
      normalizeConsequenceCommand({
        type: 'wall.opening.create',
        payload: { openingData: { elementId: 'x', type: 'door', ...NUMBERS } }, // no wallId
      }),
    ).toBeNull();
  });

  it('the pre-existing spellings are untouched', () => {
    for (const k of [
      'wall.move', 'wall.updateBaseline', 'wall.create', 'opening.move',
      'door.setOffset', 'window.setOffset', 'door.move', 'window.move',
    ]) {
      expect(CONSEQUENCE_NORMALIZERS.has(k)).toBe(true);
    }
  });
});

// ─── 1. The spellings reach the REAL planner and agree with each other ────────────────

describe('preview answers for the create spellings — real planner, real occupancy store', () => {
  it('the adapter spelling produces a real ConsequencePlan (not null) with the newcomer ADDED', async () => {
    const plan = await svc(world()).preview(VIA_ADAPTER);
    expect(plan).not.toBeNull();
    expect(plan!.planId.startsWith('plan-wall.opening.create-')).toBe(true);
    expect(plan!.changed).toContain('new-1');
    expect(plan!.changed).toContain('wall-1');
    expect(plan!.topology.added).toEqual(['new-1']);
    expect(plan!.topology.modified).toEqual(['wall-1']);
    expect(plan!.topology.removed).toEqual([]);
  });

  it('siblings CHECKED and found clear are excluded — the positive verdict, never an omission', async () => {
    const plan = (await svc(world()).preview(VIA_ADAPTER))!;
    expect(plan.excluded).toEqual(['door-1', 'win-1']);
  });

  it('the plan carries the typed metric transitions: offset and width, before undefined (the element does not exist yet)', async () => {
    const plan = (await svc(world()).preview(VIA_ADAPTER))!;
    const metrics = (plan as unknown as { metrics: { elementId: string; metric: string; before?: number; after: number; unit: string }[] }).metrics;
    expect(metrics).toBeDefined();
    const offset = metrics.find((m) => m.metric === 'offset');
    const width = metrics.find((m) => m.metric === 'width');
    expect(offset).toMatchObject({ elementId: 'new-1', after: 1.8, unit: 'm' });
    expect(offset!.before).toBeUndefined();
    expect(width).toMatchObject({ elementId: 'new-1', after: 0.9, unit: 'm' });
  });

  it('ONE operation, four spellings, ONE answer — all four plans agree byte-for-byte', async () => {
    const s = svc(world());
    const plans = await Promise.all([
      s.preview(VIA_ADAPTER), s.preview(VIA_LEGACY), s.preview(VIA_DOOR_CREATE), s.preview(VIA_FLAT),
    ]);
    for (const p of plans) expect(p).not.toBeNull();
    const [a, b, c, d] = plans.map((p) => JSON.stringify(p));
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(d).toBe(a);
  });

  it('C70 F-INV-3 through window.create: a collision REFUSES naming both spans, and removes nothing', async () => {
    // A 1.2 m window asked to sit at 1.0 → [1.000, 2.200] overlaps door-1 [0.500, 1.400].
    const plan = (await svc(world()).preview({
      type: 'window.create',
      payload: { wallId: 'wall-1', openingId: 'op-n2', id: 'new-2', offset: 1.0, width: 1.2, height: 1.2, sillHeight: 0.9 },
    }))!;
    const r = plan.refused.find((x) => x.elementId === 'new-2');
    expect(r).toBeDefined();
    expect(r!.reason).toMatch(/1\.000 m, 2\.200 m/);
    expect(r!.reason).toMatch(/0\.500 m, 1\.400 m/);
    expect(r!.reason).toMatch(/neither moved aside nor removed/);
    expect(plan.topology.added).toEqual([]);
    expect(plan.topology.removed).toEqual([]);
    expect(plan.changed).toEqual([]);
    // win-1 was checked and clear — still reported, even on a refusal.
    expect(plan.excluded).toContain('win-1');
  });

  it('the BOUNDS arm refuses with the occupancy store\'s own code — a span past the wall end', async () => {
    // [5.500, 6.700] runs past the 6 m host: canPlace's bounds arm, no conflict ids.
    const plan = (await svc(world()).preview({
      type: 'door.create',
      payload: { wallId: 'wall-1', openingId: 'op-n3', id: 'new-3', offset: 5.5, width: 1.2 },
    }))!;
    const r = plan.refused.find((x) => x.elementId === 'new-3');
    expect(r).toBeDefined();
    expect(r!.reason).toMatch(/cannot occupy \[5\.500 m, 6\.700 m\]/);
    expect(r!.reason).toMatch(/code /); // §REFUSAL-IDENTITY — the closed CanPlaceRefusalCode is carried
    expect(plan.changed).toEqual([]);
  });

  it('a DUPLICATE identity refuses before the occupancy question — the commit path\'s own ordering', async () => {
    const plan = (await svc(world()).preview({
      type: 'wall.opening.create',
      payload: {
        wallId: 'wall-1',
        openingData: { id: 'op-d1', elementId: 'door-1', type: 'door', offset: 4.5, width: 0.9, height: 2.1, sillHeight: 0 },
      },
    }))!;
    expect(plan.refused.length).toBe(1); // one refusal, never a double-count with occupancy
    expect(plan.refused[0]!.reason).toMatch(/already carries an opening/);
    expect(plan.changed).toEqual([]);
    expect(plan.topology.added).toEqual([]);
  });

  it('a host the view does not hold is a typed UNDETERMINED (STALE_DERIVED_STATE), never a confident blank', async () => {
    const plan = (await svc(world()).preview({
      type: 'door.create',
      payload: { wallId: 'wall-404', openingId: 'op-n1', id: 'new-1', offset: 1.8, width: 0.9 },
    }))!;
    const u = plan.undetermined.find((x) => x.reason === 'STALE_DERIVED_STATE');
    expect(u).toBeDefined();
    expect(u!.detail).toMatch(/wall-404/);
    expect(plan.changed).toEqual([]);
    expect(plan.indirect.kind).toBe('undetermined');
  });

  it('an ABSENT occupancy reader is ENGINE_NOT_AVAILABLE — "not checked", never "checked and clear"', async () => {
    const bare = new ConsequencePreviewService(
      new Map<string, ConsequencePlanner<never>>([
        ['wall.opening.create', new WallOpeningCreateConsequencePlanner({}) as unknown as ConsequencePlanner<never>],
      ]),
      makeContext(world()),
    );
    const plan = (await bare.preview(VIA_ADAPTER))!;
    const u = plan.undetermined.find((x) => x.reason === 'ENGINE_NOT_AVAILABLE');
    expect(u).toBeDefined();
    expect(u!.detail).toMatch(/NOT checked/);
    // With the occupancy question unanswered, nothing may claim the create proceeds cleanly
    // through it — but the plan still names its subject.
    expect(plan.direct).toEqual({ kind: 'determined', elements: ['new-1'] });
  });

  it('a malformed span reaching the planner DIRECTLY is INVALID_REQUEST — the caller\'s defect, typed', async () => {
    const planner = new WallOpeningCreateConsequencePlanner({ occupancy: wallOccupancyStore });
    const plan = await planner.plan(
      {
        type: 'wall.opening.create',
        payload: { id: 'new-1', wallId: 'wall-1', offset: 1.8, width: 0 },
      },
      makeContext(world())(),
    );
    const u = plan.undetermined.find((x) => x.reason === 'INVALID_REQUEST');
    expect(u).toBeDefined();
    expect(plan.changed).toEqual([]);
  });

  it('PURITY — previewing every spelling mutates nothing (G-REASON-01)', async () => {
    const walls = world();
    const before = JSON.stringify([...walls.values()]);
    const s = svc(walls);
    await s.preview(VIA_ADAPTER);
    await s.preview(VIA_LEGACY);
    await s.preview(VIA_DOOR_CREATE);
    await s.preview(VIA_WINDOW_CREATE);
    expect(JSON.stringify([...walls.values()])).toBe(before);
  });

  it('DETERMINISM — two previews of one create agree byte-for-byte (G-REASON-02, C78 §7.6)', async () => {
    const s = svc(world());
    expect(JSON.stringify(await s.preview(VIA_ADAPTER))).toBe(JSON.stringify(await s.preview(VIA_ADAPTER)));
  });
});
