// WallSelectionHighlightCommitter tests (S09-T6 — 2 cases).
//
// Spec: `phases/PHASE-1B-Q2-M4-M6-WALL-END-TO-END.md` §S09-T6 (line 696).
//
// We register BOTH the WallCommitter and the highlight committer on
// one host, drive a wall add followed by a selection add for that
// wall, and assert (a) the outline LineSegments lands as a child of
// the wall's Group (auto-tracking move/dispose), and (b) selection
// remove tears the outline back out without disposing the wall.
//
// THREE-only test — lives under `plugins/wall/__tests__/` allowlist.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { Wall, createId } from '@pryzm/plugin-sdk';
import { CommitterHost } from '@pryzm/plugin-sdk';
import {
  WallCommitter,
  WallSelectionHighlightCommitter,
} from '../src/committer/index.js';
import type { WallData } from '../src/store.js';
import type { SelectionDto } from '@pryzm/plugin-sdk';

function w(): WallData {
  return Wall.parse({
    id: createId('wall'),
    levelId: '',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 },
    ],
    height: 2.7,
    thickness: 0.2,
  }) as WallData;
}

function setup() {
  const host = new CommitterHost();
  const wallCommitter = new WallCommitter(host.materialPool);
  const selCommitter = new WallSelectionHighlightCommitter(wallCommitter);
  host.register(wallCommitter);
  host.register(selCommitter);
  return { host, wallCommitter, selCommitter };
}

describe('WallSelectionHighlightCommitter (S09-T6)', () => {
  it('attaches an outline LineSegments to the wall Group when its selection is added', async () => {
    const { host, selCommitter } = setup();
    const wall = w();

    await host.commit({ kind: 'add', primitiveType: 'wall', id: wall.id, dto: wall });
    const group = host.registry.get(wall.id) as THREE.Group;
    const childCountBefore = group.children.length;

    const sel: SelectionDto = {
      id: wall.id,
      kind: 'wall',
      selectedAt: Date.now(),
    };
    await host.commit({
      kind: 'add',
      primitiveType: 'selection',
      id: 'sel-1',
      dto: sel,
    });

    expect(selCommitter.outlineCount()).toBe(1);
    expect(group.children.length).toBe(childCountBefore + 1);
    const outline = group.children[group.children.length - 1] as THREE.LineSegments;
    expect(outline).toBeInstanceOf(THREE.LineSegments);
    expect(outline.name).toContain('outline');

    host.dispose();
  });

  it('removes the outline on selection remove without disposing the wall', async () => {
    const { host, wallCommitter, selCommitter } = setup();
    const wall = w();

    await host.commit({ kind: 'add', primitiveType: 'wall', id: wall.id, dto: wall });
    const group = host.registry.get(wall.id) as THREE.Group;
    await host.commit({
      kind: 'add',
      primitiveType: 'selection',
      id: 'sel-2',
      dto: { id: wall.id, kind: 'wall', selectedAt: Date.now() },
    });
    expect(selCommitter.outlineCount()).toBe(1);
    const outlineCountAfterAdd = group.children.length;

    await host.commit({
      kind: 'remove',
      primitiveType: 'selection',
      id: 'sel-2',
    });

    expect(selCommitter.outlineCount()).toBe(0);
    expect(group.children.length).toBe(outlineCountAfterAdd - 1);
    // Wall itself is still alive.
    expect(host.registry.has(wall.id)).toBe(true);
    expect(wallCommitter.stats().walls).toBe(1);

    host.dispose();
  });
});
