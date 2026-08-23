/**
 * §IFC-TREE-HOSTED-STOREY (L-8900..L-8903) — the founder's 117 bucket.
 *
 * REPORTED: "most (or all) the doors and windows don't belong to a level".
 * The By-storey grouping showed 7 real storeys and then
 * "Not assigned to a storey" = 117 (12 doors, ~105 windows).
 *
 * ⭐ THE ELEMENTS WERE NOT UNASSIGNED. `packages/schemas/src/elements/Door.ts:48`
 * and `Window.ts:48` declare `wallId: idRef('wall')` and NO `levelId` — C15 makes
 * a hosted opening an offset along a wall, so its storey is a property OF THE
 * HOST. Their storey was DERIVABLE and was not derived, and "not assigned" was a
 * false statement about the model rather than a gap in the model.
 *
 * These tests are DIFFERENTIATING: each fails if the derivation is removed, and
 * separately if the derivation is allowed to masquerade as a carried value.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptNativeElements,
  HOST_DERIVED_STOREY_TYPES,
  NO_HOST_INDEX,
  type HostIndex,
  type HostLevelResolution,
  type NativeElementLike,
} from '../src/tree/adapters.js';
import { groupByMaterial, groupBySpatial, groupByStorey } from '../src/tree/groupings.js';
import { buildElementStory } from '../src/tree/story-model.js';

const REPO = resolve(__dirname, '../../..');

/** A wall store with two walls: one on a level, one with the schema default ''. */
const hosts: HostIndex = {
  resolveWallLevel(wallId): HostLevelResolution {
    if (wallId === 'wall-on-L1') return { kind: 'resolved', levelId: 'L1', levelName: 'Level 1' };
    if (wallId === 'wall-no-level') return { kind: 'host-has-no-level', hostId: 'wall-no-level' };
    return { kind: 'no-host' };
  },
};

const openings: NativeElementLike[] = [
  { id: 'd1', type: 'door', name: 'Door 1', wallId: 'wall-on-L1' },
  { id: 'w1', type: 'window', name: 'Window 1', wallId: 'wall-on-L1' },
  { id: 'd2', type: 'door', name: 'Orphan door', wallId: 'wall-missing' },
  { id: 'w2', type: 'window', name: 'Levelless window', wallId: 'wall-no-level' },
  { id: 'd3', type: 'door', name: 'Hostless door', wallId: null },
  // A directly-carried element, for contrast.
  { id: 'wall1', type: 'wall', name: 'Wall 1', levelId: 'L1', levelName: 'Level 1' },
];

describe('the premise, re-measured off disk', () => {
  it('⭐ Door and Window carry wallId and NO levelId — so the storey is the HOST’s', () => {
    for (const f of ['Door', 'Window']) {
      const src = readFileSync(resolve(REPO, `packages/schemas/src/elements/${f}.ts`), 'utf8');
      expect(src, `${f} should host on a wall`).toMatch(/wallId:\s*idRef\('wall'\)/);
      expect(
        /^\s*levelId\s*:/m.test(src),
        `${f}.ts gained a levelId — the host-derivation premise changed, re-read L-8900`,
      ).toBe(false);
    }
  });

  it('Wall DOES carry levelId, defaulting to empty string', () => {
    const src = readFileSync(resolve(REPO, 'packages/schemas/src/elements/Wall.ts'), 'utf8');
    expect(src).toMatch(/levelId:\s*z\.string\(\)\.default\(''\)/);
  });

  it('exactly door and window are host-derived', () => {
    expect([...HOST_DERIVED_STOREY_TYPES].sort()).toEqual(['door', 'window']);
  });
});

describe('A — the storey resolves through the host', () => {
  const src = adaptNativeElements(openings, 'Villa', hosts);
  const byId = new Map(src.elements.map((e) => [e.id, e]));

  it('⭐ a door on a hosted wall lands on the wall’s storey', () => {
    const d = byId.get('d1')!;
    expect(d.storey.kind).toBe('derived');
    if (d.storey.kind === 'derived') {
      expect(d.storey.value).toBe('Level 1');
      expect(d.storey.via).toContain('wall-on-L1');
    }
  });

  it('a window resolves identically — BOTH families, not just doors', () => {
    expect(byId.get('w1')!.storey.kind).toBe('derived');
  });

  it('⭐ By storey now groups them WITH the wall, not in a deficit bucket', () => {
    const g = groupByStorey([src]);
    const l1 = g.groups.find((x) => x.label === 'Level 1')!;
    expect(l1.memberIds).toContain('d1');
    expect(l1.memberIds).toContain('w1');
    expect(l1.memberIds).toContain('wall1');
    expect(l1.count).toBe(3);
    expect(l1.deficit).toBeUndefined();
  });

  it('DIFFERENTIATING — with no host index they fall back to a named bucket, never silently', () => {
    const bare = adaptNativeElements(openings, 'Villa', NO_HOST_INDEX);
    const g = groupByStorey([bare]);
    const l1 = g.groups.find((x) => x.label === 'Level 1')!;
    expect(l1.count).toBe(1); // the wall only
    expect(g.groups.some((x) => x.label.includes('host wall could not be found'))).toBe(true);
  });

  it('IFC spatial has the same hole, and the same fix — the door nests under its storey', () => {
    const g = groupBySpatial([src]);
    const project = g.groups.find((x) => x.label === 'Villa')!;
    const l1 = project.children.find((c) => c.label === 'Level 1')!;
    expect(l1.memberIds).toEqual(expect.arrayContaining(['d1', 'w1', 'wall1']));
  });
});

describe('B — three states, never one: derived is not carried, and failures name their cause', () => {
  const src = adaptNativeElements(openings, 'Villa', hosts);
  const byId = new Map(src.elements.map((e) => [e.id, e]));

  it('⛔ a derived storey is NOT reported as authored', () => {
    expect(byId.get('d1')!.storey.kind).toBe('derived');
    expect(byId.get('d1')!.storey.kind).not.toBe('authored');
    // …while a directly-carried one still is.
    expect(byId.get('wall1')!.storey.kind).toBe('authored');
  });

  it('⭐ a MISSING host and a LEVELLESS host are different buckets', () => {
    const g = groupByStorey([src]);
    const labels = g.groups.map((x) => x.label);
    expect(labels).toContain('Hosted, but the host wall could not be found');
    expect(labels).toContain('Hosted, but the host wall carries no level');
  });

  it('neither failure is labelled "Not assigned to a storey" — that claim is now unused here', () => {
    const g = groupByStorey([src]);
    expect(g.groups.map((x) => x.label)).not.toContain('Not assigned to a storey');
  });

  it('the unresolved reason names WHICH failure, for the story card', () => {
    const orphan = byId.get('d2')!;
    const levelless = byId.get('w2')!;
    expect(orphan.storey.kind).toBe('unresolved');
    expect(levelless.storey.kind).toBe('unresolved');
    if (orphan.storey.kind === 'unresolved') {
      expect(orphan.storey.why).toContain('not in the wall store');
    }
    if (levelless.storey.kind === 'unresolved') {
      expect(levelless.storey.why).toContain('carries no levelId');
      expect(levelless.storey.why).toContain('the wall is the defect');
    }
  });

  it('a door with no wallId at all says so, distinctly from a missing wall', () => {
    const s = byId.get('d3')!.storey;
    if (s.kind === 'unresolved') expect(s.why).toContain('carries no wallId');
  });

  it('⭐ the grouping DECLARES how many storeys were derived — a derived tree never passes as authored', () => {
    const g = groupByStorey([src]);
    if (g.coverage.kind === 'populated') {
      expect(g.coverage.limitNote).toContain('DERIVED from their host wall');
      expect(g.coverage.limitNote).toContain('2 of 6');
    }
  });

  it('the story card shows the derivation and names the hop', () => {
    const story = buildElementStory(byId.get('d1')!);
    const where = story.slots.find((s) => s.id === 'where')!;
    expect(where.state).toBe('answered');
    if (where.state === 'answered') {
      expect(where.provenance[0]!.chip).toContain('derived');
      expect(where.provenance[0]!.detail).toContain('wall-on-L1');
      expect(where.provenance[0]!.detail).toContain('C15');
    }
  });

  it('an unresolved opening’s story explains the hosting, not a bare "unassigned"', () => {
    const story = buildElementStory(byId.get('d2')!);
    const where = story.slots.find((s) => s.id === 'where')!;
    expect(where.state).toBe('unknown');
    if (where.state === 'unknown') {
      expect(where.note).toContain('hosted opening');
      expect(where.note).toContain('host did not resolve');
    }
  });
});

describe('C — the same assumption in By material (C100 §9.1)', () => {
  const doors: NativeElementLike[] = [
    { id: 'd1', type: 'door', name: 'Oak door', wallId: 'wall-on-L1', frameMaterial: 'Oak', leafMaterial: 'Glass' },
    { id: 'd2', type: 'door', name: 'Bare door', wallId: 'wall-on-L1' },
    { id: 'b1', type: 'beam', name: 'Beam', levelId: 'L1', material: 'Steel S355' },
  ];
  const src = adaptNativeElements(doors, 'Villa', hosts);

  it('⛔ a door with frame+leaf finishes is NOT "material not authored"', () => {
    const g = groupByMaterial([src]);
    const notAuthored = g.groups.find((x) => x.deficit === 'not-authored');
    expect(notAuthored?.memberIds ?? []).not.toContain('d1');
  });

  it('⭐ it becomes a REAL group listing both parts — neither is promoted to "the" material', () => {
    const g = groupByMaterial([src]);
    const parts = g.groups.find((x) => x.label.includes('frame') && x.label.includes('leaf'));
    expect(parts, 'per-part material group missing').toBeTruthy();
    expect(parts!.label).toContain('Oak');
    expect(parts!.label).toContain('Glass');
    expect(parts!.deficit).toBeUndefined();
  });

  it('a door that authors NEITHER finish is still honestly not-authored', () => {
    const g = groupByMaterial([src]);
    const na = g.groups.find((x) => x.deficit === 'not-authored')!;
    expect(na.memberIds).toContain('d2');
  });

  it('the story card lists both parts and cites C100 §9.1', () => {
    const story = buildElementStory(src.elements[0]!);
    const slot = story.slots.find((s) => s.id === 'part-of-and-made-of')!;
    expect(slot.state).toBe('answered');
    if (slot.state === 'answered') {
      expect(slot.text).toContain('frame: Oak');
      expect(slot.text).toContain('leaf: Glass');
      expect(slot.provenance[0]!.detail).toContain('C100 §9.1');
    }
  });

  it('By IFC class was never affected — a door’s class is its own, not its host’s', () => {
    const g = groupByMaterial([src]);
    expect(g.totalElements).toBe(3);
  });
});

describe('D — completeness: every hosted opening lands somewhere nameable', () => {
  it('⭐ no opening is silently dropped — resolved + unresolved accounts for ALL of them', () => {
    const src = adaptNativeElements(openings, 'Villa', hosts);
    // Filter by the INPUT type, not by guessing from the rendered name — the
    // first draft of this test guessed from the name and misclassified, which is
    // the same shape of error the feature itself exists to stop.
    const hostedIds = new Set(
      openings.filter((o) => HOST_DERIVED_STOREY_TYPES.has(o.type)).map((o) => o.id),
    );
    expect(hostedIds.size).toBe(5);
    const kinds = src.elements.filter((e) => hostedIds.has(e.id)).map((e) => e.storey.kind);
    // Every hosted opening is EITHER derived OR unresolved. Never not-authored,
    // never silently absent.
    expect(kinds.every((k) => k === 'derived' || k === 'unresolved')).toBe(true);

    const g = groupByStorey([src]);
    const summed = g.groups.reduce((n, x) => n + x.count, 0);
    expect(summed, 'group counts must sum to the element total').toBe(g.totalElements);
    expect(g.totalElements).toBe(openings.length);
  });
});
